const Room = require('../models/Room');
const { getIO } = require('../utils/socket');

// Generate unique 6-character alphanumeric room code
const generateRoomCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

const createRoom = async (req, res) => {
  try {
    const { minRating, maxRating, questionCount, duration } = req.body;
    const hostId = req.session.userId;

    // Generate unique room code
    let code;
    let isUnique = false;
    while (!isUnique) {
      code = generateRoomCode();
      const existingRoom = await Room.findOne({ code });
      if (!existingRoom) {
        isUnique = true;
      }
    }

    // Create room with host as first participant
    const room = new Room({
      code,
      host: hostId,
      participants: [hostId],
      settings: {
        minRating: minRating || 800,
        maxRating: maxRating || 1200,
        questionCount: 2,
        duration: 15
      },
      status: 'waiting',
      startTime: null
    });

    await room.save();

    res.status(201).json({
      code: room.code,
      settings: room.settings,
      participants: room.participants
    });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
};

const joinRoom = async (req, res) => {
  try {
    const { code } = req.params;
    const userId = req.session.userId;

    // Find room by code
    const room = await Room.findOne({ code });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Add user to participants if not already present
    if (!room.participants.includes(userId)) {
      room.participants.push(userId);
      await room.save();
    }

    // Populate participants to get user details
    await room.populate('participants', 'handle avatar rating');

    const participants = room.participants.map(p => ({
      id: p._id.toString(),
      handle: p.handle,
      avatar: p.avatar,
      rating: p.rating
    }));

    // Emit socket event for room update to the specific room
    const io = getIO();
    io.to(room.code).emit('room-update', {
      roomCode: room.code,
      participants
    });

    res.status(200).json({ participants });
  } catch (error) {
    console.error('Error joining room:', error);
    res.status(500).json({ error: 'Failed to join room' });
  }
};

const updateSettings = async (req, res) => {
  try {
    const { code } = req.params;
    const userId = req.session.userId;
    const { minRating, maxRating, questionCount, duration } = req.body;

    const room = await Room.findOne({ code });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Check if user is the host
    if (room.host.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Only the host can update settings' });
    }

    // Check if game has started
    if (room.status !== 'waiting') {
      return res.status(400).json({ error: 'Cannot update settings after game has started' });
    }

    // Update settings (questionCount and duration are fixed)
    room.settings = {
      minRating: minRating || room.settings.minRating,
      maxRating: maxRating || room.settings.maxRating,
      questionCount: 2,
      duration: 15
    };

    await room.save();

    // Populate and return updated room
    await room.populate('host', 'handle avatar rating');
    await room.populate('participants', 'handle avatar rating');

    res.status(200).json(room);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
};

const leaveRoom = async (req, res) => {
  try {
    const { code } = req.params;
    const userId = req.session.userId;

    const room = await Room.findOne({ code });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Get handle of leaving user for notifications
    const User = require('../models/User');
    const leavingUser = await User.findById(userId, 'handle');
    const leavingHandle = leavingUser ? leavingUser.handle : 'Unknown';

    // Check if leaving user is the host (before removing from participants)
    const wasHost = room.host.toString() === userId.toString();

    // Remove user from participants
    room.participants = room.participants.filter(
      (p) => p.toString() !== userId.toString()
    );
    await room.save();

    const io = getIO();

    // If room is empty, clean up all associated data
    if (room.participants.length === 0) {
      const RoomProblem = require('../models/RoomProblem');
      const Score = require('../models/Score');
      await RoomProblem.deleteMany({ roomId: room._id });
      await Score.deleteMany({ roomId: room._id });
      await Room.deleteOne({ _id: room._id });
      return res.status(200).json({ message: 'Left room successfully' });
    }

    // Transfer host if the leaving user was the host and room is still waiting
    if (wasHost && room.status === 'waiting' && room.participants.length > 0) {
      const newHostId = room.participants[0];
      room.host = newHostId;
      await room.save();

      const newHost = await User.findById(newHostId, 'handle avatar rating');
      if (newHost) {
        io.to(code).emit('host-changed', {
          roomCode: code,
          newHost: {
            _id: newHost._id.toString(),
            handle: newHost.handle,
            avatar: newHost.avatar,
            rating: newHost.rating
          },
          previousHost: leavingHandle
        });
      }
    }

    // Populate remaining participants and emit room update
    await room.populate('participants', 'handle avatar rating');

    const participants = room.participants.map(p => ({
      id: p._id.toString(),
      handle: p.handle,
      avatar: p.avatar,
      rating: p.rating
    }));

    // Emit socket event for room update to remaining participants
    io.to(code).emit('room-update', {
      roomCode: code,
      participants
    });

    // Notify remaining participants that this player left
    io.to(code).emit('player-left', {
      userId: userId.toString(),
      handle: leavingHandle
    });

    res.status(200).json({ message: 'Left room successfully' });
  } catch (error) {
    console.error('Error leaving room:', error);
    res.status(500).json({ error: 'Failed to leave room' });
  }
};

const getRoom = async (req, res) => {
  try {
    const { code } = req.params;

    const room = await Room.findOne({ code })
      .populate('host', 'handle avatar rating')
      .populate('participants', 'handle avatar rating');

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.status(200).json(room);
  } catch (error) {
    console.error('Error getting room:', error);
    res.status(500).json({ error: 'Failed to get room' });
  }
};

const getParticipants = async (req, res) => {
  try {
    const { code } = req.params;

    const room = await Room.findOne({ code }).populate(
      'participants',
      'handle avatar rating'
    );

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const participants = room.participants.map((p) => ({
      id: p._id,
      handle: p.handle,
      avatar: p.avatar,
      rating: p.rating
    }));

    res.status(200).json(participants);
  } catch (error) {
    console.error('Error getting participants:', error);
    res.status(500).json({ error: 'Failed to get participants' });
  }
};

const deleteRoom = async (req, res) => {
  try {
    const { code } = req.params;
    const userId = req.session.userId;

    const room = await Room.findOne({ code });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Check if user is the host
    if (room.host.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Only the host can delete the room' });
    }

    await Room.deleteOne({ code });

    res.status(200).json({ message: 'Room deleted successfully' });
  } catch (error) {
    console.error('Error deleting room:', error);
    res.status(500).json({ error: 'Failed to delete room' });
  }
};

module.exports = {
  createRoom,
  joinRoom,
  leaveRoom,
  getRoom,
  getParticipants,
  deleteRoom,
  updateSettings
};
