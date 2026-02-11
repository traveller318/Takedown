# Takedown - System Analysis & Critical Scenarios

## Overview
This document analyzes the application's ability to handle concurrent 1v1 games and identifies critical scenarios that need attention.

---

## Scalability Analysis: Can it handle 6-7 concurrent 1v1 games?

### ✅ **YES - The system CAN handle 6-7 concurrent games**

| Component | Status | Notes |
|-----------|--------|-------|
| **Socket.IO Rooms** | ✅ Good | Each game uses isolated `roomCode` channels |
| **MongoDB** | ✅ Good | Room/Score/Problem docs are per-room, no conflicts |
| **Timer Sync** | ✅ Good | Uses `Set` to track active rooms, scales well |
| **Session Management** | ✅ Good | Per-user sessions, no cross-contamination |

### Current Limitations
- **Single Node.js process** - If server crashes, all games affected
- **In-memory `activeGameRooms` Set** - Lost on server restart
- **No rate limiting** on Codeforces API calls (could hit limits with many games starting simultaneously)

---

## Critical Scenarios to Handle

### 1. 🔄 **Page Reload During Game**

**Current Status:** ✅ Handled

**How it works:**
- `sessionStorage` persists game state on client
- `/api/game/:code/state` endpoint restores full state
- Socket auto-rejoins room on reconnect
- Solved problems restored from database

**Code Reference:** [GameContext.tsx](client/context/GameContext.tsx) - Lines 125-145

---

### 2. 🔌 **Network Disconnect / Reconnection**

**Current Status:** ⚠️ Partially Handled

**What works:**
- Socket.IO auto-reconnection (5 attempts)
- `roomsToRejoinRef` tracks rooms to rejoin
- `ReconnectingBanner` shows UI feedback

**Issues to fix:**
- **User removed from room on disconnect** - Server removes user from `participants` array on socket disconnect
- If reconnection takes >5 seconds, user might miss events

**Recommendation:**
```javascript
// Add grace period before removing participant on disconnect
// Current: Immediate removal in sockets/index.js line 358-390
// Suggested: Use setTimeout with 30s delay, cancel if reconnects
```

---

### 3. 🚪 **User Closes Tab Mid-Game**

**Current Status:** ⚠️ Partially Handled

**What works:**
- `beforeunload` shows confirmation prompt
- Socket disconnect cleanup runs

**Issues:**
- User immediately removed from participants
- No way to resume that game session

---

### 4. 👥 **Both Players Disconnect Simultaneously**

**Current Status:** ✅ Handled

**Behavior:** Room and all related data deleted when no participants remain

**Code Reference:** [sockets/index.js](server/sockets/index.js) - Lines 372-386

---

### 5. ⏱️ **Timer Sync Issues**

**Current Status:** ✅ Handled

**Implementation:**
- Server broadcasts `timer-sync` every 5 seconds to all active rooms
- Client receives and adjusts local timer

**Code Reference:** [sockets/index.js](server/sockets/index.js) - Lines 57-65

---

### 6. 🏁 **Host Leaves Before Game Starts**

**Current Status:** ⚠️ NOT Handled

**Issue:** No host transfer mechanism - room becomes orphaned

**Recommendation:**
```javascript
// When host disconnects, transfer to next participant
if (room.host.toString() === socket.userId && room.participants.length > 0) {
  room.host = room.participants[0];
  await room.save();
  io.to(room.code).emit('host-changed', { newHost: room.participants[0] });
}
```

---

### 7. 🔄 **Duplicate Submissions**

**Current Status:** ✅ Handled

**Implementation:**
- Client tracks `solvedProblems` Map
- Client has `checkingProblem` state preventing double-clicks
- 15-second timeout prevents stuck state

---

### 8. 🌐 **Codeforces API Failure**

**Current Status:** ⚠️ Partial

**What works:** Returns error if API fails during game start

**Issues:**
- No retry mechanism
- No cached problem sets

**Recommendation:** Cache problems locally or implement retry with exponential backoff

---

### 9. 🔐 **Session Expiry Mid-Game**

**Current Status:** ⚠️ NOT Handled

**Issue:** Session expires after 24 hours - socket becomes unauthorized

**Recommendation:**
- Extend session on socket activity
- Handle `401` gracefully with re-auth prompt

---

### 10. 📱 **Multiple Tabs/Devices**

**Current Status:** ⚠️ Potential Issues

**Issues:**
- Same user can join from multiple tabs
- Multiple socket connections for same user
- Potential duplicate submissions

**Recommendation:**
```javascript
// Track user's active socket and disconnect old one
const existingSocket = userSocketMap.get(userId);
if (existingSocket) {
  existingSocket.disconnect(true);
}
userSocketMap.set(userId, socket.id);
```

---

## Quick Fix Priority List

| Priority | Issue | Effort |
|----------|-------|--------|
| 🔴 HIGH | Host transfer on disconnect | Medium |
| 🔴 HIGH | Grace period for reconnection | Low |
| 🟡 MEDIUM | Multi-tab prevention | Medium |
| 🟡 MEDIUM | Codeforces API retry/cache | Medium |
| 🟢 LOW | Session refresh on activity | Low |

---

## Architecture Summary

```
┌─────────────┐     HTTP/WS      ┌─────────────┐      ┌─────────────┐
│   Next.js   │ ←───────────────→│   Express   │ ←───→│   MongoDB   │
│   Client    │                  │  Socket.IO  │      │             │
└─────────────┘                  └─────────────┘      └─────────────┘
      │                                │
      └── sessionStorage ──────────────┘
           (game state backup)
```

---

## Conclusion

The system is **well-architected** for 6-7 concurrent games. Main concerns are:

1. **Reconnection handling** - Users removed too quickly
2. **Host transfer** - Missing feature
3. **Multi-device conflicts** - Not prevented

These are enhancement-level fixes, not blockers.
