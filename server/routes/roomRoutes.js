const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');
const sessionAuth = require('../middleware/sessionAuth');

// Create a new room
router.post('/create', sessionAuth, roomController.createRoom);

// Join a room by code
router.post('/:code/join', sessionAuth, roomController.joinRoom);

// Leave a room
router.post('/:code/leave', sessionAuth, roomController.leaveRoom);

// Update room settings (host only)
router.put('/:code/settings', sessionAuth, roomController.updateSettings);

// Get full room details
router.get('/:code', sessionAuth, roomController.getRoom);

// Get room participants
router.get('/:code/participants', sessionAuth, roomController.getParticipants);

// Delete room (host only)
router.delete('/:code', sessionAuth, roomController.deleteRoom);

module.exports = router;
