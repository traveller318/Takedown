const User = require('../models/User');

const CODEFORCES_API_URL = 'https://codeforces.com/api/user.info';

const loginUser = async (req, res) => {
  try {
    const { handle } = req.body;

    // Validate non-empty string
    if (!handle || typeof handle !== 'string' || handle.trim() === '') {
      return res.status(400).json({ status: false, error: 'Handle is required and must be a non-empty string' });
    }

    const trimmedHandle = handle.trim();

    // Validate Codeforces username format
    // Codeforces handles can contain letters, digits, hyphens, and underscores
    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(trimmedHandle)) {
      return res.status(400).json({ 
        status: false, 
        error: 'Username can only contain letters, numbers, hyphens, and underscores' 
      });
    }

    // Validate length (Codeforces usernames are typically 3-24 characters)
    if (trimmedHandle.length < 3 || trimmedHandle.length > 24) {
      return res.status(400).json({ 
        status: false, 
        error: 'Username must be between 3 and 24 characters' 
      });
    }

    // Call Codeforces API
    const response = await fetch(`${CODEFORCES_API_URL}?handles=${encodeURIComponent(trimmedHandle)}`);
    const data = await response.json();

    // Check if API response is OK
    if (data.status !== 'OK') {
      const errorMessage = data.comment === 'handles: User with handle ' + trimmedHandle + ' not found'
        ? 'User not found on Codeforces'
        : data.comment || 'Invalid Codeforces handle';
      return res.status(400).json({ status: false, error: errorMessage });
    }

    const cfUser = data.result[0];

    // Extract user info
    const userInfo = {
      handle: cfUser.handle,
      rating: cfUser.rating || 0,
      avatar: cfUser.avatar || cfUser.titlePhoto || ''
    };

    // Save to MongoDB if not exists, otherwise update
    let user = await User.findOneAndUpdate(
      { handle: userInfo.handle },
      { 
        rating: userInfo.rating, 
        avatar: userInfo.avatar 
      },
      { new: true }
    );

    if (!user) {
      user = await User.create(userInfo);
    }

    // Set session
    req.session.userId = user._id;

    return res.status(200).json({ status: true, user });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ status: false, error: 'Internal server error' });
  }
};

const getMe = async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await User.findById(req.session.userId);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    return res.status(200).json({ user });
  } catch (error) {
    console.error('Get me error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const logoutUser = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.clearCookie('connect.sid');
    return res.status(200).json({ message: 'Logged out successfully' });
  });
};

module.exports = {
  loginUser,
  getMe,
  logoutUser
};
