const { Server } = require('socket.io');
const User = require('../models/User');

let io;

const initSocket = (server, sessionMiddleware) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL,
      credentials: true
    }
  });

  // Wrap express-session middleware for socket.io
  io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
  });

  // Validate session.userId on connection
  io.use(async (socket, next) => {
    const session = socket.request.session;

    if (!session || !session.userId) {
      return next(new Error('Unauthorized'));
    }

    try {
      const user = await User.findById(session.userId);
      if (!user) {
        return next(new Error('Unauthorized'));
      }
      // Attach user to socket for easy access
      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Unauthorized'));
    }
  });

  // Register socket event listeners
  const initSockets = require('../sockets');
  initSockets(io);

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

module.exports = { initSocket, getIO };
