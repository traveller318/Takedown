const connectDB = require('./db');
const { initSocket, getIO } = require('./socket');

module.exports = {
  connectDB,
  initSocket,
  getIO
};
