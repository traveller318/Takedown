const mongoose = require('mongoose');

/**
 * UsedProblem Schema
 * Tracks all problems that have appeared in any duel to avoid repetition
 */
const usedProblemSchema = new mongoose.Schema({
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
  firstUsedAt: {
    type: Date,
    default: Date.now
  },
  usageCount: {
    type: Number,
    default: 1
  }
});

// Create compound index for efficient lookups and ensure uniqueness
usedProblemSchema.index({ contestId: 1, index: 1 }, { unique: true });

// Index for filtering by rating
usedProblemSchema.index({ rating: 1 });

module.exports = mongoose.model('UsedProblem', usedProblemSchema);
