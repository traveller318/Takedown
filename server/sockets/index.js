/**
 * Socket.io event listeners module
 * Handles all game-related socket events with session integration
 */

const Room = require('../models/Room');
const RoomProblem = require('../models/RoomProblem');
const Score = require('../models/Score');
const User = require('../models/User');
const gameController = require('../controllers/gameController');

// Store active rooms for timer sync
const activeGameRooms = new Set();

// Track disconnected players with grace period
// Structure: Map<roomCode, Map<userId, { timeout, handle, disconnectedAt }>>
const disconnectedPlayers = new Map();

// Track connected sockets per user (for multi-tab detection)
// Structure: Map<userId, Set<socketId>>
const userSockets = new Map();

// Grace period durations
const GRACE_PERIOD_GAME = 60000;  // 60 seconds for active game
const GRACE_PERIOD_ROOM = 15000;  // 15 seconds for waiting room

// Debug logger with timestamp
const debug = {
  log: (event, message, data = null) => {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [SOCKET]`;
    if (data) {
      console.log(`${prefix} 🔵 ${event}: ${message}`, JSON.stringify(data, null, 2));
    } else {
      console.log(`${prefix} 🔵 ${event}: ${message}`);
    }
  },
  success: (event, message, data = null) => {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [SOCKET]`;
    if (data) {
      console.log(`${prefix} ✅ ${event}: ${message}`, JSON.stringify(data, null, 2));
    } else {
      console.log(`${prefix} ✅ ${event}: ${message}`);
    }
  },
  error: (event, message, error = null) => {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [SOCKET]`;
    console.error(`${prefix} ❌ ${event}: ${message}`, error || '');
  },
  warn: (event, message, data = null) => {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [SOCKET]`;
    if (data) {
      console.warn(`${prefix} ⚠️ ${event}: ${message}`, JSON.stringify(data, null, 2));
    } else {
      console.warn(`${prefix} ⚠️ ${event}: ${message}`);
    }
  }
};

/**
 * Initialize socket event handlers
 * @param {Server} io - Socket.io server instance
 */
function initSockets(io) {
  debug.log('INIT', 'Initializing socket handlers...');

  // Timer sync interval - every 5 seconds
  setInterval(() => {
    if (activeGameRooms.size > 0) {
      debug.log('TIMER-SYNC', `Sending timer sync to ${activeGameRooms.size} active rooms`);
      activeGameRooms.forEach((roomCode) => {
        io.to(roomCode).emit('timer-sync', {
          serverTime: Date.now()
        });
      });
    }
  }, 5000);

  /**
   * Handle grace period expiry - remove player from room after timeout
   */
  async function handleGracePeriodExpiry(roomCode, userId, handle) {
    debug.log('GRACE-PERIOD', 'Grace period expired', { roomCode, userId, handle });

    // Clean up the disconnected players map
    const roomDisconnected = disconnectedPlayers.get(roomCode);
    if (roomDisconnected) {
      roomDisconnected.delete(userId);
      if (roomDisconnected.size === 0) {
        disconnectedPlayers.delete(roomCode);
      }
    }

    try {
      const room = await Room.findOne({ code: roomCode });
      if (!room) {
        debug.log('GRACE-PERIOD', 'Room already deleted', { roomCode });
        return;
      }

      // Check if user is still in participants (might have been removed by explicit leave)
      const isStillParticipant = room.participants.some(p => p.toString() === userId);
      if (!isStillParticipant) {
        debug.log('GRACE-PERIOD', 'User already removed from room', { roomCode, userId });
        return;
      }

      // Remove user from participants
      room.participants = room.participants.filter(p => p.toString() !== userId);

      if (room.participants.length === 0) {
        debug.log('GRACE-PERIOD', 'Room empty after grace period, cleaning up', { roomCode });
        await RoomProblem.deleteMany({ roomId: room._id });
        await Score.deleteMany({ roomId: room._id });
        await Room.deleteOne({ _id: room._id });
        activeGameRooms.delete(roomCode);
        debug.success('GRACE-PERIOD', 'Room cleanup complete', { roomCode });
      } else {
        await room.save();
        await room.populate('participants', 'handle avatar rating');

        const roomUpdate = {
          roomCode: room.code,
          participants: room.participants.map(p => ({
            id: p._id.toString(),
            handle: p.handle,
            avatar: p.avatar,
            rating: p.rating
          }))
        };

        io.to(roomCode).emit('room-update', roomUpdate);
        io.to(roomCode).emit('player-left', { userId, handle });
        debug.success('GRACE-PERIOD', 'Player removed after grace period', { roomCode, userId, handle });
      }
    } catch (error) {
      debug.error('GRACE-PERIOD', 'Error during grace period expiry', error);
    }
  }

  io.on('connection', (socket) => {
    // socket.user is already attached by the middleware in utils/socket.js
    socket.userId = socket.user._id.toString();

    // Track this socket for the user (multi-tab detection)
    if (!userSockets.has(socket.userId)) {
      userSockets.set(socket.userId, new Set());
    }
    userSockets.get(socket.userId).add(socket.id);
    
    debug.success('CONNECTION', `User connected`, {
      userId: socket.userId,
      handle: socket.user.handle,
      socketId: socket.id
    });
    
    socket.emit('connection-success');

    // ====================================================
    // ROOM JOIN
    // ====================================================
    socket.on('join-room', async ({ roomCode }) => {
      debug.log('JOIN-ROOM', `Request received`, { roomCode, userId: socket.userId });
      
      try {
        // Validate roomCode
        if (!roomCode || typeof roomCode !== 'string') {
          debug.warn('JOIN-ROOM', 'Invalid room code provided', { roomCode });
          return socket.emit('error', { message: 'Invalid room code' });
        }

        // Join socket room
        socket.join(roomCode);
        socket.currentRoom = roomCode;
        debug.log('JOIN-ROOM', `Socket joined room channel`, { roomCode, socketId: socket.id });

        // Check if user is reconnecting from a grace period
        const roomDisconnected = disconnectedPlayers.get(roomCode);
        if (roomDisconnected && roomDisconnected.has(socket.userId)) {
          const disconnectedInfo = roomDisconnected.get(socket.userId);
          clearTimeout(disconnectedInfo.timeout);
          roomDisconnected.delete(socket.userId);
          if (roomDisconnected.size === 0) {
            disconnectedPlayers.delete(roomCode);
          }
          debug.success('JOIN-ROOM', 'Player reconnected within grace period', {
            roomCode, userId: socket.userId, handle: socket.user.handle
          });
          io.to(roomCode).emit('player-reconnected', {
            userId: socket.userId,
            handle: socket.user.handle
          });
        }

        // Fetch room and populate participants
        let room = await Room.findOne({ code: roomCode }).populate('participants', 'handle avatar rating');
        
        if (!room) {
          socket.leave(roomCode);
          debug.warn('JOIN-ROOM', 'Room not found in database', { roomCode });
          return socket.emit('error', { message: 'Room not found' });
        }

        debug.log('JOIN-ROOM', `Room found`, { 
          roomCode, 
          participantCount: room.participants.length,
          status: room.status 
        });

        // For active games, ensure reconnecting user is in participants
        if (room.status === 'started') {
          const isParticipant = room.participants.some(p => p._id.toString() === socket.userId);
          if (!isParticipant) {
            await Room.updateOne(
              { code: roomCode },
              { $addToSet: { participants: socket.user._id } }
            );
            room = await Room.findOne({ code: roomCode }).populate('participants', 'handle avatar rating');
            debug.log('JOIN-ROOM', 'Re-added reconnecting player to active game', { roomCode, userId: socket.userId });
          }
        }

        const roomUpdate = {
          roomCode,
          participants: room.participants.map(p => ({
            id: p._id.toString(),
            handle: p.handle,
            avatar: p.avatar,
            rating: p.rating
          }))
        };

        // Emit room update to all participants
        io.to(roomCode).emit('room-update', roomUpdate);
        debug.success('JOIN-ROOM', `Emitted room-update`, roomUpdate);

      } catch (error) {
        debug.error('JOIN-ROOM', 'Failed to join room', error);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // ====================================================
    // ROOM LEAVE
    // ====================================================
    socket.on('leave-room', async ({ roomCode }) => {
      debug.log('LEAVE-ROOM', `Request received`, { roomCode, userId: socket.userId });
      
      try {
        if (!roomCode) {
          debug.warn('LEAVE-ROOM', 'Invalid room code provided');
          return socket.emit('error', { message: 'Invalid room code' });
        }

        // Leave socket room
        socket.leave(roomCode);
        socket.currentRoom = null;
        debug.log('LEAVE-ROOM', `Socket left room channel`, { roomCode, socketId: socket.id });

        // Clear any grace period for this user (explicit leave)
        const roomDisconnectedLeave = disconnectedPlayers.get(roomCode);
        if (roomDisconnectedLeave) {
          const disconnectedInfo = roomDisconnectedLeave.get(socket.userId);
          if (disconnectedInfo) {
            clearTimeout(disconnectedInfo.timeout);
            roomDisconnectedLeave.delete(socket.userId);
            if (roomDisconnectedLeave.size === 0) {
              disconnectedPlayers.delete(roomCode);
            }
            debug.log('LEAVE-ROOM', 'Cleared grace period for leaving user', { roomCode, userId: socket.userId });
          }
        }

        // Remove user from participants array
        const room = await Room.findOneAndUpdate(
          { code: roomCode },
          { $pull: { participants: socket.user._id } },
          { new: true }
        ).populate('participants', 'handle avatar rating');

        if (!room) {
          debug.warn('LEAVE-ROOM', 'Room not found in database', { roomCode });
          return socket.emit('error', { message: 'Room not found' });
        }

        debug.log('LEAVE-ROOM', `User removed from room`, { 
          roomCode, 
          remainingParticipants: room.participants.length 
        });

        const roomUpdate = {
          roomCode,
          participants: room.participants.map(p => ({
            id: p._id.toString(),
            handle: p.handle,
            avatar: p.avatar,
            rating: p.rating
          }))
        };

        // Emit room update to remaining participants
        io.to(roomCode).emit('room-update', roomUpdate);
        debug.success('LEAVE-ROOM', `Emitted room-update`, roomUpdate);

      } catch (error) {
        debug.error('LEAVE-ROOM', 'Failed to leave room', error);
        socket.emit('error', { message: 'Failed to leave room' });
      }
    });

    // ====================================================
    // START GAME
    // ====================================================
    socket.on('start-game', async ({ roomCode }) => {
      debug.log('START-GAME', `Request received`, { roomCode, userId: socket.userId });
      
      try {
        if (!roomCode) {
          debug.warn('START-GAME', 'Invalid room code provided');
          return socket.emit('error', { message: 'Invalid room code' });
        }

        // Find room
        const room = await Room.findOne({ code: roomCode });
        
        if (!room) {
          debug.warn('START-GAME', 'Room not found', { roomCode });
          return socket.emit('error', { message: 'Room not found' });
        }

        debug.log('START-GAME', `Room found`, { 
          roomCode, 
          host: room.host.toString(),
          requestingUser: socket.userId,
          status: room.status 
        });

        // Only allow if room.host == socket.userId
        if (room.host.toString() !== socket.userId) {
          debug.warn('START-GAME', 'Non-host tried to start game', { 
            host: room.host.toString(), 
            requestingUser: socket.userId 
          });
          return socket.emit('error', { message: 'Only the host can start the game' });
        }

        // *** IMMEDIATELY emit game-starting to ALL users so they see loading screen ***
        debug.log('START-GAME', `Emitting game-starting to all users in room`);
        io.to(roomCode).emit('game-starting', { roomCode });

        debug.log('START-GAME', `Host verified, calling gameController.startGameInternal...`);

        // Call gameController.startGameInternal for socket use
        const gameData = await gameController.startGameInternal(roomCode);

        if (!gameData.success) {
          debug.error('START-GAME', `gameController.startGameInternal failed`, { error: gameData.error });
          return socket.emit('error', { message: gameData.error || 'Failed to start game' });
        }

        debug.success('START-GAME', `Game started successfully`, {
          roomCode,
          problemCount: gameData.problems.length,
          duration: gameData.duration
        });

        // Add room to active game rooms for timer sync
        activeGameRooms.add(roomCode);
        debug.log('START-GAME', `Room added to active game rooms`, { 
          activeRoomCount: activeGameRooms.size 
        });

        const gameStartedPayload = {
          roomCode,
          problems: gameData.problems,
          startTime: gameData.startTime,
          duration: gameData.duration
        };

        // Emit game-started to entire room
        io.to(roomCode).emit('game-started', gameStartedPayload);
        debug.success('START-GAME', `Emitted game-started`, { 
          roomCode, 
          problemCount: gameData.problems.length 
        });

      } catch (error) {
        debug.error('START-GAME', 'Failed to start game', error);
        socket.emit('error', { message: 'Failed to start game' });
      }
    });

    // ====================================================
    // CHECK PROBLEM
    // ====================================================
    socket.on('check-problem', async ({ roomCode, contestId, index }) => {
      debug.log('CHECK-PROBLEM', `Request received`, { 
        roomCode, 
        contestId, 
        index, 
        userId: socket.userId,
        handle: socket.user.handle 
      });
      
      try {
        if (!roomCode || !contestId || !index) {
          debug.warn('CHECK-PROBLEM', 'Missing required fields', { roomCode, contestId, index });
          return socket.emit('error', { message: 'Missing required fields' });
        }

        // Find room and validate game started
        const room = await Room.findOne({ code: roomCode });
        
        if (!room) {
          debug.warn('CHECK-PROBLEM', 'Room not found', { roomCode });
          return socket.emit('error', { message: 'Room not found' });
        }

        if (room.status !== 'started') {
          debug.warn('CHECK-PROBLEM', 'Game not started', { roomCode, status: room.status });
          return socket.emit('error', { message: 'Game has not started' });
        }

        debug.log('CHECK-PROBLEM', `Calling gameController.checkSubmissionInternal...`);

        // Call gameController.checkSubmissionInternal for socket use
        const result = await gameController.checkSubmissionInternal(
          roomCode,
          socket.userId,
          socket.user.handle,
          contestId,
          index
        );

        debug.log('CHECK-PROBLEM', `checkSubmission result`, result);

        if (result.solved) {
          const problemSolvedPayload = {
            userId: socket.userId,
            handle: socket.user.handle,
            contestId,
            index,
            points: result.points
          };

          // Emit problem-solved
          io.to(roomCode).emit('problem-solved', problemSolvedPayload);
          debug.success('CHECK-PROBLEM', `Problem solved! Emitted problem-solved`, problemSolvedPayload);

          // Compute and emit leaderboard
          const leaderboard = await gameController.getLeaderboardInternal(roomCode);
          io.to(roomCode).emit('leaderboard-update', leaderboard);
          debug.success('CHECK-PROBLEM', `Emitted leaderboard-update`, { 
            roomCode, 
            leaderboardSize: leaderboard.length 
          });

        } else {
          const notSolvedPayload = {
            contestId,
            index,
            message: result.message || 'Problem not solved yet'
          };

          // Emit problem-not-solved only to the user who checked
          socket.emit('problem-not-solved', notSolvedPayload);
          debug.log('CHECK-PROBLEM', `Problem not solved, emitted problem-not-solved`, notSolvedPayload);
        }

      } catch (error) {
        debug.error('CHECK-PROBLEM', 'Failed to check problem', error);
        socket.emit('error', { message: 'Failed to check problem' });
      }
    });

    // ====================================================
    // DISCONNECT CLEANUP
    // ====================================================
    socket.on('disconnect', async () => {
      debug.log('DISCONNECT', `User disconnecting`, { 
        userId: socket.userId, 
        handle: socket.user.handle,
        socketId: socket.id 
      });

      // Remove this socket from user's socket set
      const userSocketSet = userSockets.get(socket.userId);
      if (userSocketSet) {
        userSocketSet.delete(socket.id);
        if (userSocketSet.size === 0) {
          userSockets.delete(socket.userId);
        }
      }

      // Check if user still has other active sockets (multi-tab)
      const remainingSockets = userSockets.get(socket.userId);
      const hasOtherSockets = remainingSockets && remainingSockets.size > 0;

      if (hasOtherSockets) {
        debug.log('DISCONNECT', 'User still has other active sockets, skipping cleanup', {
          userId: socket.userId,
          remainingCount: remainingSockets.size
        });
        return;
      }

      try {
        // Find rooms where user is in participants
        const rooms = await Room.find({ participants: socket.user._id });
        debug.log('DISCONNECT', `Found ${rooms.length} rooms with user as participant`);

        for (const room of rooms) {
          debug.log('DISCONNECT', `Processing room`, { roomCode: room.code, status: room.status });

          if (room.status === 'started' || room.status === 'waiting') {
            // Use grace period - don't remove immediately
            const gracePeriod = room.status === 'started' ? GRACE_PERIOD_GAME : GRACE_PERIOD_ROOM;

            if (!disconnectedPlayers.has(room.code)) {
              disconnectedPlayers.set(room.code, new Map());
            }

            const roomDisconnected = disconnectedPlayers.get(room.code);

            // Clear any existing grace period for this user
            if (roomDisconnected.has(socket.userId)) {
              clearTimeout(roomDisconnected.get(socket.userId).timeout);
            }

            const timeout = setTimeout(() => {
              handleGracePeriodExpiry(room.code, socket.userId, socket.user.handle);
            }, gracePeriod);

            roomDisconnected.set(socket.userId, {
              timeout,
              handle: socket.user.handle,
              disconnectedAt: Date.now()
            });

            debug.log('DISCONNECT', `Grace period started (${gracePeriod / 1000}s)`, {
              roomCode: room.code,
              userId: socket.userId
            });

            // Notify other players about the temporary disconnect
            io.to(room.code).emit('player-disconnected', {
              userId: socket.userId,
              handle: socket.user.handle,
              gracePeriod: gracePeriod / 1000
            });

          } else {
            // Room is ended or other status - remove immediately
            room.participants = room.participants.filter(
              p => p.toString() !== socket.userId
            );

            if (room.participants.length === 0) {
              debug.log('DISCONNECT', `Room empty, deleting room and related data`, { roomCode: room.code });
              await RoomProblem.deleteMany({ roomId: room._id });
              await Score.deleteMany({ roomId: room._id });
              await Room.deleteOne({ _id: room._id });
              activeGameRooms.delete(room.code);
              debug.success('DISCONNECT', `Room cleanup complete`, { roomCode: room.code });
            } else {
              await room.save();
              await room.populate('participants', 'handle avatar rating');

              const roomUpdate = {
                roomCode: room.code,
                participants: room.participants.map(p => ({
                  id: p._id.toString(),
                  handle: p.handle,
                  avatar: p.avatar,
                  rating: p.rating
                }))
              };

              io.to(room.code).emit('room-update', roomUpdate);
              debug.success('DISCONNECT', `Emitted room-update to remaining participants`, {
                roomCode: room.code
              });
            }
          }
        }

        debug.success('DISCONNECT', `Cleanup complete for user`, { userId: socket.userId });

      } catch (error) {
        debug.error('DISCONNECT', 'Error during disconnect cleanup', error);
      }
    });
  });

  debug.success('INIT', 'Socket handlers initialized successfully');
}

module.exports = initSockets;
