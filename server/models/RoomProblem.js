const mongoose = require('mongoose');

const roomProblemSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  contestId: {
    type: Number,
    required: true
  },
  index: {
    type: String,
    required: true
  },
  rating: {
    type: Number,
    required: true
  },
  basePoints: {
    type: Number,
    required: true
  },
  minPoints: {
    type: Number,
    required: true
  }
});

module.exports = mongoose.model('RoomProblem', roomProblemSchema);
