const { Server } = require('socket.io');
const User = require('../models/User');

let io;

const initSocket = (server, sessionMiddleware) => {
  const allowedOrigins = process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',') : ['http://localhost:3000'];
  
  io = new Server(server, {
    cors: {
      origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
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
