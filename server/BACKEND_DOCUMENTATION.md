# 🎮 Takedown - Codeforces Battle Ground Backend Documentation

> A real-time competitive programming battle platform where users can compete in 1v1 or group duels solving Codeforces problems.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Environment Setup](#environment-setup)
4. [Database Models](#database-models)
5. [Authentication](#authentication)
6. [REST API Routes](#rest-api-routes)
7. [WebSocket Events](#websocket-events)
8. [Point System](#point-system)
9. [Game Flow](#game-flow)
10. [Codeforces API Integration](#codeforces-api-integration)

---

## 🎯 Overview

**Takedown** is a competitive programming platform similar to [cfbattleground.live](https://cfbattleground.live). Users can:

- **Login** using their Codeforces handle (verified via Codeforces API)
- **Create or Join rooms** for real-time battles
- **Compete** by solving Codeforces problems
- **Track progress** via real-time leaderboards
- **Earn points** based on solve time (like Codeforces Div 3 scoring)

### Key Features

| Feature | Description |
|---------|-------------|
| 🔐 Codeforces Login | Authenticate using CF handle |
| 🏠 Room System | Create/join rooms with unique codes |
| ⚡ Real-time Updates | WebSocket-powered live updates |
| 🎯 Problem Fetching | Auto-fetch problems by rating range |
| ✅ Submission Verification | Check solutions via CF API |
| 🏆 Live Leaderboard | Points-based ranking system |
| ⏱️ Time-based Scoring | Points decrease over time |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (Next.js)                        │
├─────────────────────────────────────────────────────────────────┤
│  HTTP Requests (REST API)  │  WebSocket Connection (Socket.io)  │
└─────────────────┬──────────┴──────────────┬─────────────────────┘
                  │                          │
                  ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                       EXPRESS SERVER                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Auth Routes  │  │ Room Routes  │  │    Game Routes       │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Socket.io Server                       │  │
│  │  (Real-time room updates, game events, leaderboard)       │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                  │                          │
                  ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                        MongoDB Database                         │
├─────────────────────────────────────────────────────────────────┤
│  Users  │  Rooms  │  RoomProblems  │  Scores                    │
└─────────────────────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Codeforces API                             │
├─────────────────────────────────────────────────────────────────┤
│  user.info  │  problemset.problems  │  user.status              │
└─────────────────────────────────────────────────────────────────┘
```

### Project Structure

```
server/
├── app.js                    # Main entry point
├── package.json              # Dependencies
├── .env                      # Environment variables
│
├── controllers/
│   ├── authController.js     # Login, logout, get user
│   ├── gameController.js     # Game logic, submission check
│   ├── healthController.js   # Health check endpoint
│   └── roomController.js     # Room CRUD operations
│
├── middleware/
│   └── sessionAuth.js        # Session authentication
│
├── models/
│   ├── Room.js               # Room schema
│   ├── RoomProblem.js        # Problems for each room
│   ├── Score.js              # User scores per problem
│   └── User.js               # User schema
│
├── routes/
│   ├── authRoutes.js         # /api/auth/*
│   ├── gameRoutes.js         # /api/game/*
│   └── roomRoutes.js         # /api/rooms/*
│
├── sockets/
│   └── index.js              # Socket.io event handlers
│
└── utils/
    ├── db.js                 # MongoDB connection
    ├── index.js              # Utils barrel export
    └── socket.js             # Socket.io initialization
```

---

## ⚙️ Environment Setup

### Required Environment Variables

Create a `.env` file in the `server/` directory:

```env
# Server Configuration
PORT=5000

# MongoDB Connection
MONGODB_URI=mongodb://localhost:27017/takedown

# Session Secret (use a strong random string)
SESSION_SECRET=your-super-secret-key-here

# Client URL (for CORS)
CLIENT_URL=http://localhost:3000
```

### Installation

```bash
# Navigate to server directory
cd server

# Install dependencies
npm install

# Start development server
npm run dev

# Or start production server
npm start
```

### Dependencies

```json
{
  "express": "^4.x",
  "socket.io": "^4.x",
  "mongoose": "^8.x",
  "express-session": "^1.x",
  "cors": "^2.x",
  "dotenv": "^16.x"
}
```

---

## 📊 Database Models

### User Model

```javascript
{
  handle: String,      // Codeforces handle (unique)
  rating: Number,      // CF rating (default: 0)
  avatar: String,      // Profile picture URL
  createdAt: Date      // Account creation timestamp
}
```

### Room Model

```javascript
{
  code: String,        // 6-char alphanumeric code (unique)
  host: ObjectId,      // Reference to User (room creator)
  participants: [ObjectId], // Array of User references
  settings: {
    minRating: Number,     // Min problem rating (default: 800)
    maxRating: Number,     // Max problem rating (default: 1200)
    questionCount: Number, // Number of problems (default: 5)
    duration: Number       // Game duration in minutes (default: 30)
  },
  status: String,      // "waiting" | "started" | "ended"
  startTime: Date      // When game started (null if not started)
}
```

### RoomProblem Model

```javascript
{
  roomId: ObjectId,    // Reference to Room
  contestId: Number,   // Codeforces contest ID
  index: String,       // Problem index (A, B, C, etc.)
  rating: Number,      // Problem difficulty rating
  basePoints: Number,  // Starting points for this problem
  minPoints: Number    // Minimum points (floor)
}
```

### Score Model

```javascript
{
  roomId: ObjectId,    // Reference to Room
  userId: ObjectId,    // Reference to User
  contestId: Number,   // Problem contest ID
  index: String,       // Problem index
  solvedAt: Date,      // When problem was solved
  points: Number       // Points earned
}
```

---

## 🔐 Authentication

### How It Works

1. User enters their Codeforces handle
2. Server validates handle via Codeforces API (`user.info`)
3. User data is saved/updated in MongoDB
4. Session is created with `userId`
5. All subsequent requests use session authentication

### Session Middleware

```javascript
// middleware/sessionAuth.js
const sessionAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};
```

---

## 🛣️ REST API Routes

### Base URL: `/api`

---

### Authentication Routes (`/api/auth`)

#### `POST /api/auth/login`

Login using Codeforces handle.

**Request Body:**
```json
{
  "handle": "tourist"
}
```

**Success Response (200):**
```json
{
  "status": true,
  "user": {
    "_id": "64f1a2b3c4d5e6f7g8h9i0j1",
    "handle": "tourist",
    "rating": 3800,
    "avatar": "https://userpic.codeforces.org/..."
  }
}
```

**Error Responses:**
- `400`: Invalid handle format or handle not found on Codeforces
- `500`: Internal server error

---

#### `GET /api/auth/me`

Get currently logged in user.

**Success Response (200):**
```json
{
  "user": {
    "_id": "64f1a2b3c4d5e6f7g8h9i0j1",
    "handle": "tourist",
    "rating": 3800,
    "avatar": "https://userpic.codeforces.org/..."
  }
}
```

**Error Responses:**
- `401`: Not authenticated / User not found

---

#### `POST /api/auth/logout`

Logout current user (destroys session).

**Success Response (200):**
```json
{
  "message": "Logged out successfully"
}
```

---

### Room Routes (`/api/rooms`)

> ⚠️ All room routes require authentication (session)

#### `POST /api/rooms/create`

Create a new room.

**Request Body:**
```json
{
  "minRating": 800,
  "maxRating": 1200,
  "questionCount": 3,
  "duration": 30
}
```

**Success Response (201):**
```json
{
  "code": "ABC123",
  "settings": {
    "minRating": 800,
    "maxRating": 1200,
    "questionCount": 3,
    "duration": 30
  },
  "participants": ["64f1a2b3c4d5e6f7g8h9i0j1"]
}
```

---

#### `POST /api/rooms/:code/join`

Join an existing room.

**URL Parameters:**
- `code`: Room code (6 characters)

**Success Response (200):**
```json
{
  "participants": [
    {
      "handle": "tourist",
      "avatar": "https://...",
      "rating": 3800
    },
    {
      "handle": "Benq",
      "avatar": "https://...",
      "rating": 3700
    }
  ]
}
```

**Error Responses:**
- `404`: Room not found

---

#### `POST /api/rooms/:code/leave`

Leave a room.

**Success Response (200):**
```json
{
  "message": "Left room successfully"
}
```

---

#### `GET /api/rooms/:code`

Get full room details.

**Success Response (200):**
```json
{
  "_id": "64f1a2b3c4d5e6f7g8h9i0j1",
  "code": "ABC123",
  "host": {
    "_id": "...",
    "handle": "tourist",
    "avatar": "...",
    "rating": 3800
  },
  "participants": [
    {
      "_id": "...",
      "handle": "tourist",
      "avatar": "...",
      "rating": 3800
    }
  ],
  "settings": {
    "minRating": 800,
    "maxRating": 1200,
    "questionCount": 3,
    "duration": 30
  },
  "status": "waiting",
  "startTime": null
}
```

---

#### `GET /api/rooms/:code/participants`

Get room participants.

**Success Response (200):**
```json
[
  {
    "id": "64f1a2b3c4d5e6f7g8h9i0j1",
    "handle": "tourist",
    "avatar": "https://...",
    "rating": 3800
  }
]
```

---

#### `DELETE /api/rooms/:code`

Delete a room (host only).

**Success Response (200):**
```json
{
  "message": "Room deleted successfully"
}
```

**Error Responses:**
- `403`: Only the host can delete the room
- `404`: Room not found

---

### Game Routes (`/api/game`)

> ⚠️ All game routes require authentication (session)

#### `GET /api/game/:code/problems`

Get all problems for a room.

**Success Response (200):**
```json
[
  {
    "contestId": 1800,
    "index": "A",
    "rating": 800,
    "basePoints": 500,
    "minPoints": 250
  },
  {
    "contestId": 1799,
    "index": "B",
    "rating": 1000,
    "basePoints": 750,
    "minPoints": 500
  },
  {
    "contestId": 1798,
    "index": "C",
    "rating": 1200,
    "basePoints": 1000,
    "minPoints": 750
  }
]
```

---

#### `GET /api/game/:code/leaderboard`

Get leaderboard sorted by points.

**Success Response (200):**
```json
[
  {
    "handle": "tourist",
    "avatar": "https://...",
    "totalPoints": 2150,
    "solvedCount": 3
  },
  {
    "handle": "Benq",
    "avatar": "https://...",
    "totalPoints": 1250,
    "solvedCount": 2
  }
]
```

---

#### `GET /api/game/:code/state`

Get current game state (useful for page refresh recovery).

**Success Response (200):**
```json
{
  "status": "started",
  "startTime": "2026-02-01T10:30:00.000Z",
  "duration": 30,
  "participantsCount": 2
}
```

---

#### `POST /api/game/:code/start`

Start the game (host only).

**Success Response (200):**
```json
{
  "success": true,
  "startTime": "2026-02-01T10:30:00.000Z"
}
```

**Error Responses:**
- `403`: Only the host can start the game
- `500`: Failed to fetch problems / Not enough problems

---

#### `POST /api/game/:code/check`

Check if a problem submission is accepted.

**Request Body:**
```json
{
  "contestId": 1800,
  "index": "A"
}
```

**Success Response (200) - Problem Solved:**
```json
{
  "solved": true,
  "points": 485
}
```

**Success Response (200) - Already Solved:**
```json
{
  "solved": true,
  "alreadySolved": true
}
```

**Success Response (200) - Not Solved:**
```json
{
  "solved": false
}
```

**Error Responses:**
- `400`: Game is not in progress
- `403`: Not a participant
- `404`: Room/Problem not found

---

#### `POST /api/game/:code/end`

End the game (host only).

**Success Response (200):**
```json
{
  "success": true
}
```

---

## 🔌 WebSocket Events

### Connection

Connect to the WebSocket server with credentials:

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:5000", {
  withCredentials: true  // Required for session auth
});
```

### Authentication

Socket connections are authenticated using the same session as HTTP requests. The session middleware validates `session.userId` and attaches the user object to the socket.

---

### Events Reference

#### Client → Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `join-room` | `{ roomCode: string }` | Join a room's socket channel |
| `leave-room` | `{ roomCode: string }` | Leave a room |
| `start-game` | `{ roomCode: string }` | Start the game (host only) |
| `check-problem` | `{ roomCode, contestId, index }` | Check problem submission |

#### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `connection-success` | - | Successful connection |
| `room-update` | `{ roomCode, participants[] }` | Room participants changed |
| `game-started` | `{ roomCode, problems[], startTime, duration }` | Game has started |
| `problem-solved` | `{ userId, contestId, index, points }` | A problem was solved |
| `problem-not-solved` | `{ contestId, index, message }` | Problem check failed |
| `leaderboard-update` | `Array<{ handle, avatar, totalPoints, solvedCount }>` | Leaderboard updated |
| `timer-sync` | `{ serverTime: number }` | Server time sync (every 5s) |
| `error` | `{ message: string }` | Error occurred |

---

### Detailed Event Documentation

#### `join-room`

**Emit:**
```javascript
socket.emit('join-room', { roomCode: 'ABC123' });
```

**Response Event:** `room-update`
```javascript
socket.on('room-update', (data) => {
  // data = {
  //   roomCode: 'ABC123',
  //   participants: [
  //     { id: '...', handle: 'tourist', avatar: '...', rating: 3800 }
  //   ]
  // }
});
```

---

#### `leave-room`

**Emit:**
```javascript
socket.emit('leave-room', { roomCode: 'ABC123' });
```

**Response:** `room-update` sent to remaining participants

---

#### `start-game`

**Emit (host only):**
```javascript
socket.emit('start-game', { roomCode: 'ABC123' });
```

**Response Event:** `game-started` (sent to all room participants)
```javascript
socket.on('game-started', (data) => {
  // data = {
  //   roomCode: 'ABC123',
  //   problems: [
  //     { contestId: 1800, index: 'A', rating: 800, basePoints: 500, minPoints: 250 },
  //     { contestId: 1799, index: 'B', rating: 1000, basePoints: 750, minPoints: 500 },
  //     { contestId: 1798, index: 'C', rating: 1200, basePoints: 1000, minPoints: 750 }
  //   ],
  //   startTime: '2026-02-01T10:30:00.000Z',
  //   duration: 30
  // }
});
```

---

#### `check-problem`

**Emit:**
```javascript
socket.emit('check-problem', {
  roomCode: 'ABC123',
  contestId: 1800,
  index: 'A'
});
```

**Success Response Events:**

1. If solved → `problem-solved` (broadcast to room):
```javascript
socket.on('problem-solved', (data) => {
  // data = { userId: '...', contestId: 1800, index: 'A', points: 485 }
});
```

2. Followed by `leaderboard-update`:
```javascript
socket.on('leaderboard-update', (leaderboard) => {
  // leaderboard = [
  //   { handle: 'tourist', avatar: '...', totalPoints: 485, solvedCount: 1 }
  // ]
});
```

**Failure Response Event:** `problem-not-solved` (only to sender):
```javascript
socket.on('problem-not-solved', (data) => {
  // data = { contestId: 1800, index: 'A', message: 'Problem not solved yet' }
});
```

---

#### `timer-sync`

Automatically sent every 5 seconds to active game rooms.

```javascript
socket.on('timer-sync', (data) => {
  // data = { serverTime: 1706785800000 }  // Unix timestamp in ms
});
```

---

#### `error`

```javascript
socket.on('error', (data) => {
  console.error('Socket error:', data.message);
});
```

---

## 🏆 Point System

### How Scoring Works

The scoring system is designed like **Codeforces Div 3** contests:

1. Each problem has **base points** (starting value)
2. Each problem has **min points** (floor value)
3. Points decrease by **1 per minute** from game start
4. Points never go below the minimum

### Problem Scoring Configuration

| Problem | Base Points | Min Points | Description |
|---------|-------------|------------|-------------|
| Problem 1 | 500 | 250 | Easy |
| Problem 2 | 750 | 500 | Medium |
| Problem 3 | 1000 | 750 | Hard |

### Points Calculation Formula

```javascript
const elapsedMinutes = Math.floor((solveTime - gameStartTime) / 60000);
const rawPoints = basePoints - elapsedMinutes;
const points = Math.max(rawPoints, minPoints);
```

### Example

**Problem 1** (basePoints: 500, minPoints: 250)

| Solve Time | Points |
|------------|--------|
| 0 min | 500 |
| 10 min | 490 |
| 100 min | 400 |
| 250 min | 250 |
| 300 min | 250 (capped at min) |

---

## 🎮 Game Flow

### 1. User Authentication

```
User enters CF handle → Server validates via CF API → Session created
```

### 2. Room Creation

```
Host creates room → Gets unique 6-char code → Configures settings
```

### 3. Room Joining

```
User enters room code → HTTP: POST /rooms/:code/join → Socket: emit 'join-room'
→ All participants receive 'room-update' event
```

### 4. Game Start

```
Host clicks Start → Socket: emit 'start-game'
→ Server fetches problems from CF API
→ Creates RoomProblem documents
→ All participants receive 'game-started' event
→ Game UI shows problems & timer
```

### 5. Solving Problems

```
User solves problem on Codeforces → Clicks "Check" button
→ Socket: emit 'check-problem'
→ Server fetches user submissions from CF API
→ Validates submission time > game start time
→ Calculates points based on solve time
→ If solved: 'problem-solved' + 'leaderboard-update' broadcast
→ If not: 'problem-not-solved' to user only
```

### 6. Leaderboard Updates

```
Real-time leaderboard → Updated after each problem solve
→ Sorted by totalPoints descending
```

### 7. Game End / Room Exit

```
User leaves room → Socket: emit 'leave-room' or disconnect
→ Removed from participants
→ If room empty → Room + Problems + Scores deleted
→ Remaining users receive 'room-update'
```

---

## 🔗 Codeforces API Integration

### APIs Used

| Endpoint | Purpose |
|----------|---------|
| `user.info` | Validate user handle & get profile |
| `problemset.problems` | Fetch problems by rating |
| `user.status` | Get user submissions for verification |

### API Reference

- **Documentation:** https://codeforces.com/apiHelp/methods
- **Objects:** https://codeforces.com/apiHelp/objects

### Example API Calls

#### Validate User
```
GET https://codeforces.com/api/user.info?handles=tourist
```

#### Fetch Problems
```
GET https://codeforces.com/api/problemset.problems
```

#### Get User Submissions
```
GET https://codeforces.com/api/user.status?handle=tourist&count=50
```

### Submission Verification Logic

```javascript
// Fetch recent submissions
const response = await fetch(`${CF_API}/user.status?handle=${handle}&count=50`);

// Find valid submission
for (const submission of submissions) {
  if (
    submission.problem.contestId === contestId &&
    submission.problem.index === index &&
    submission.verdict === 'OK' &&
    submission.creationTimeSeconds * 1000 > roomStartTime
  ) {
    // Valid submission found!
  }
}
```

---

## 📝 Quick Reference

### API Endpoints Summary

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/login` | Login via CF handle | ❌ |
| GET | `/api/auth/me` | Get current user | ❌ |
| POST | `/api/auth/logout` | Logout | ❌ |
| POST | `/api/rooms/create` | Create room | ✅ |
| POST | `/api/rooms/:code/join` | Join room | ✅ |
| POST | `/api/rooms/:code/leave` | Leave room | ✅ |
| GET | `/api/rooms/:code` | Get room details | ✅ |
| GET | `/api/rooms/:code/participants` | Get participants | ✅ |
| DELETE | `/api/rooms/:code` | Delete room | ✅ |
| GET | `/api/game/:code/problems` | Get problems | ✅ |
| GET | `/api/game/:code/leaderboard` | Get leaderboard | ✅ |
| GET | `/api/game/:code/state` | Get game state | ✅ |
| POST | `/api/game/:code/start` | Start game | ✅ |
| POST | `/api/game/:code/check` | Check submission | ✅ |
| POST | `/api/game/:code/end` | End game | ✅ |

### Socket Events Summary

| Direction | Event | Description |
|-----------|-------|-------------|
| C→S | `join-room` | Join room channel |
| C→S | `leave-room` | Leave room |
| C→S | `start-game` | Start game (host) |
| C→S | `check-problem` | Check submission |
| S→C | `connection-success` | Connected |
| S→C | `room-update` | Participants changed |
| S→C | `game-started` | Game started |
| S→C | `problem-solved` | Problem solved |
| S→C | `problem-not-solved` | Check failed |
| S→C | `leaderboard-update` | Rankings updated |
| S→C | `timer-sync` | Time sync |
| S→C | `error` | Error message |

---

## 🚀 Frontend Integration Example

### Socket Connection Setup

```javascript
// lib/socket.js
import { io } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL;

export const socket = io(SOCKET_URL, {
  withCredentials: true,
  autoConnect: false
});

// Connect after login
export const connectSocket = () => {
  if (!socket.connected) {
    socket.connect();
  }
};

// Disconnect on logout
export const disconnectSocket = () => {
  if (socket.connected) {
    socket.disconnect();
  }
};
```

### Room Component Example

```javascript
// components/Room.jsx
import { useEffect, useState } from 'react';
import { socket } from '@/lib/socket';

export function Room({ roomCode }) {
  const [participants, setParticipants] = useState([]);
  const [problems, setProblems] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [gameStarted, setGameStarted] = useState(false);

  useEffect(() => {
    // Join room
    socket.emit('join-room', { roomCode });

    // Listen for updates
    socket.on('room-update', ({ participants }) => {
      setParticipants(participants);
    });

    socket.on('game-started', ({ problems, startTime, duration }) => {
      setProblems(problems);
      setGameStarted(true);
    });

    socket.on('problem-solved', ({ userId, contestId, index, points }) => {
      // Mark problem as solved in UI
    });

    socket.on('problem-not-solved', ({ message }) => {
      // Show "Not solved" toast
    });

    socket.on('leaderboard-update', (data) => {
      setLeaderboard(data);
    });

    // Cleanup
    return () => {
      socket.emit('leave-room', { roomCode });
      socket.off('room-update');
      socket.off('game-started');
      socket.off('problem-solved');
      socket.off('problem-not-solved');
      socket.off('leaderboard-update');
    };
  }, [roomCode]);

  const handleStartGame = () => {
    socket.emit('start-game', { roomCode });
  };

  const handleCheckProblem = (contestId, index) => {
    socket.emit('check-problem', { roomCode, contestId, index });
  };

  // ... render component
}
```

---

## 📄 License

This project is for educational purposes.

---

**Happy Coding! 🎉**
