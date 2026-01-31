const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// POST /api/auth/login - Login via Codeforces handle
router.post('/login', authController.loginUser);

// GET /api/auth/me - Get logged in user
router.get('/me', authController.getMe);

// POST /api/auth/logout - Logout user
router.post('/logout', authController.logoutUser);

module.exports = router;
