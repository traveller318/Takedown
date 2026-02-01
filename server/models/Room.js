const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true
  },
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  settings: {
    minRating: {
      type: Number,
      default: 800
    },
    maxRating: {
      type: Number,
      default: 1200
    },
    questionCount: {
      type: Number,
      default: 5
    },
    duration: {
      type: Number,
      default: 30 // minutes
    }
  },
  status: {
    type: String,
    enum: ['waiting', 'started', 'ended'],
    default: 'waiting'
  },
  startTime: {
    type: Date,
    default: null
  }
});

module.exports = mongoose.model('Room', roomSchema);
