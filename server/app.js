require('dotenv').config();

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const http = require('http');

const { connectDB, initSocket, getIO } = require('./utils');
const authRoutes = require('./routes/authRoutes');
const roomRoutes = require('./routes/roomRoutes');
const gameRoutes = require('./routes/gameRoutes');
const healthController = require('./controllers/healthController');

const app = express();
const server = http.createServer(app);

// Trust proxy - required for secure cookies behind reverse proxies (Render, Heroku, etc.)
app.set('trust proxy', 1);

// Connect to MongoDB
connectDB();

// CORS middleware - Allow multiple origins
const allowedOrigins = process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',') : ['http://localhost:3000'];
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// JSON body parser
app.use(express.json());

// Session middleware configuration
// Cross-origin cookies require: secure=true + sameSite='none'
// For local-only dev (same origin), use secure=false + sameSite='lax'
const isCrossOrigin = process.env.CROSS_ORIGIN === 'true' || process.env.NODE_ENV === 'production';
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  saveUninitialized: false,
  resave: false,
  cookie: {
    secure: isCrossOrigin,      // must be true for sameSite 'none'
    httpOnly: true,
    sameSite: isCrossOrigin ? 'none' : 'lax', // 'none' required for cross-site cookies
    maxAge: 1000 * 60 * 60 * 24 // 24 hours
  }
});

app.use(sessionMiddleware);

// Initialize Socket.io with session middleware
const io = initSocket(server, sessionMiddleware);

app.get('/', (req, res) => {
  res.send('Welcome to the Code Battle Server!');
});

// Health check route
app.get('/api/health', healthController.healthCheck);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/game', gameRoutes);

// Make io accessible to routes
app.set('io', io);

const PORT = process.env.PORT || 5000;

// Only start server if not in serverless environment (Vercel)
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Export app as default for Vercel serverless deployment
module.exports = app;
