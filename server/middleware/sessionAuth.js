const sessionAuth = (req, res, next) => {
  if (!req.session.userId) {
    console.log('[SessionAuth] Unauthorized request:', {
      path: req.path,
      method: req.method,
      sessionId: req.session?.id,
      hasSession: !!req.session,
      cookies: req.headers.cookie ? 'present' : 'missing'
    });
    return res.status(401).json({ message: 'Please login first' });
  }
  next();
};

module.exports = sessionAuth;
