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

// Connect to MongoDB
connectDB();

// CORS middleware
app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true
}));

// JSON body parser
app.use(express.json());

// Session middleware configuration
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  saveUninitialized: false,
  resave: false,
  cookie: {
    secure: false,
    httpOnly: true,
    sameSite: 'lax',
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
