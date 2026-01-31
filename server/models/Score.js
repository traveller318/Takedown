const mongoose = require('mongoose');

const scoreSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
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
  solvedAt: {
    type: Date,
    default: Date.now
  },
  points: {
    type: Number,
    required: true
  }
});

module.exports = mongoose.model('Score', scoreSchema);
