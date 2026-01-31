/**
 * Socket.io event listeners module
 * Handles connection and disconnect events with session integration
 */

const registerSocketEvents = (io) => {
  io.on('connection', (socket) => {
    const handle = socket.user.handle;

    // Log connection with user handle
    console.log(`User connected: ${handle}`);

    // Emit connection success event to the client
    socket.emit('connection-success', {
      message: 'Successfully connected to server',
      handle: handle
    });

    // Handle disconnect event
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${handle}`);
    });
  });
};

module.exports = registerSocketEvents;
