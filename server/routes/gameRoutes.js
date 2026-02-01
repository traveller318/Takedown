const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');
const sessionAuth = require('../middleware/sessionAuth');

// GET /api/game/:code/problems - Get all problems for a room
router.get('/:code/problems', sessionAuth, gameController.getProblems);

// GET /api/game/:code/leaderboard - Get leaderboard sorted by points
router.get('/:code/leaderboard', sessionAuth, gameController.getLeaderboard);

// GET /api/game/:code/state - Get current room game state
router.get('/:code/state', sessionAuth, gameController.getState);

// POST /api/game/:code/start - Start game (host only)
router.post('/:code/start', sessionAuth, gameController.startGame);

// POST /api/game/:code/check - Check submission
router.post('/:code/check', sessionAuth, gameController.checkSubmission);

// POST /api/game/:code/end - End game (host only)
router.post('/:code/end', sessionAuth, gameController.endGame);

module.exports = router;
