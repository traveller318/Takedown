/**
 * Game Controller
 * Handles game logic for starting games, checking submissions, and leaderboard
 */

const Room = require('../models/Room');
const RoomProblem = require('../models/RoomProblem');
const Score = require('../models/Score');
const User = require('../models/User');
const mongoose = require('mongoose');

// Codeforces API base URL
const CF_API = 'https://codeforces.com/api';

/**
 * GET /api/game/:code/problems
 * Return all problems for a room
 */
const getProblems = async (req, res) => {
  try {
    const { code } = req.params;

    // 1. Find room by code
    const room = await Room.findOne({ code });

    // 2. If not exists -> 404
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // 3. Find RoomProblem where roomId
    const problemDocs = await RoomProblem.find({ roomId: room._id });

    // 4. Return formatted problems
    const problems = problemDocs.map(p => ({
      contestId: p.contestId,
      index: p.index,
      rating: p.rating,
      basePoints: p.basePoints,
      minPoints: p.minPoints
    }));

    return res.json({ problems });
  } catch (error) {
    console.error('Get problems error:', error);
    return res.status(500).json({ error: 'Failed to get problems' });
  }
};

/**
 * GET /api/game/:code/leaderboard
 * Return leaderboard sorted by points
 */
const getLeaderboard = async (req, res) => {
  try {
    const { code } = req.params;

    // Find room by code
    const room = await Room.findOne({ code });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Use computeLeaderboard for consistent results
    const leaderboard = await computeLeaderboard(room._id);

    return res.json({ leaderboard });
  } catch (error) {
    console.error('Get leaderboard error:', error);
    return res.status(500).json({ error: 'Failed to get leaderboard' });
  }
};

/**
 * GET /api/game/:code/state
 * Return current room game state (for page refresh recovery)
 */
const getState = async (req, res) => {
  try {
    const { code } = req.params;
    const userId = req.session?.userId;

    const room = await Room.findOne({ code });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Get problems for the room
    const problemDocs = await RoomProblem.find({ roomId: room._id });
    const problems = problemDocs.map(p => ({
      contestId: p.contestId,
      index: p.index,
      rating: p.rating,
      basePoints: p.basePoints,
      minPoints: p.minPoints
    }));

    // Get leaderboard
    const leaderboard = await computeLeaderboard(room._id);

    // Get user's solved problems (if authenticated)
    let solvedProblems = [];
    if (userId) {
      const userScores = await Score.find({ roomId: room._id, userId });
      solvedProblems = userScores.map(s => ({
        contestId: s.contestId,
        index: s.index,
        points: s.points,
        solvedAt: s.solvedAt
      }));
    }

    return res.json({
      roomCode: code,
      status: room.status,
      startTime: room.startTime,
      duration: room.settings.duration,
      participantsCount: room.participants.length,
      problems,
      leaderboard,
      solvedProblems
    });
  } catch (error) {
    console.error('Get state error:', error);
    return res.status(500).json({ error: 'Failed to get game state' });
  }
};

// Fixed scoring for exactly 2 problems
const PROBLEM_SCORING = [
  { basePoints: 500, minPoints: 250 },   // Problem 1 (Easier half)
  { basePoints: 1000, minPoints: 500 }   // Problem 2 (Harder half)
];

/**
 * Internal function to start game (used by socket handler)
 * @param {string} roomCode - The room code
 * @returns {Promise<Object>} - { success, problems, startTime, duration, error }
 */
const startGameInternal = async (roomCode) => {
  try {
    console.log('[startGameInternal] Starting game for room:', roomCode);
    
    // 1. Find room
    const room = await Room.findOne({ code: roomCode });

    if (!room) {
      console.log('[startGameInternal] Room not found:', roomCode);
      return { success: false, error: 'Room not found' };
    }

    console.log('[startGameInternal] Room found, status:', room.status);

    // 2. Check if game already started
    if (room.status === 'started') {
      console.log('[startGameInternal] Game already started');
      return { success: false, error: 'Game already started' };
    }

    // 3. Fetch problems from Codeforces
    console.log('[startGameInternal] Fetching problems from Codeforces...');
    const response = await fetch(`${CF_API}/problemset.problems`);
    const data = await response.json();

    if (data.status !== 'OK') {
      console.log('[startGameInternal] Codeforces API failed:', data);
      return { success: false, error: 'Failed to fetch problems from Codeforces' };
    }

    console.log('[startGameInternal] Got', data.result.problems.length, 'problems from CF');

    // 4. Calculate mid rating for split selection
    const minR = room.settings.minRating;
    const maxR = room.settings.maxRating;
    const midR = Math.floor((minR + maxR) / 2);

    console.log('[startGameInternal] Rating split:', minR, '-', midR, '-', maxR);

    // 5. Filter problems into two halves by rating
    const lowerHalf = data.result.problems.filter(
      p => p.rating && p.rating >= minR && p.rating <= midR
    );
    const upperHalf = data.result.problems.filter(
      p => p.rating && p.rating > midR && p.rating <= maxR
    );

    console.log('[startGameInternal] Lower half:', lowerHalf.length, 'problems (' + minR + '-' + midR + ')');
    console.log('[startGameInternal] Upper half:', upperHalf.length, 'problems (' + (midR + 1) + '-' + maxR + ')');

    // 6. Shuffle each half and pick one from each
    const shuffledLower = lowerHalf.sort(() => Math.random() - 0.5);
    const shuffledUpper = upperHalf.sort(() => Math.random() - 0.5);

    if (shuffledLower.length < 1 || shuffledUpper.length < 1) {
      console.log('[startGameInternal] Not enough problems found in one of the halves');
      return { success: false, error: 'Could not fetch enough problems. Try adjusting rating range.' };
    }

    // Select exactly 2 problems: one from each half
    const selected = [shuffledLower[0], shuffledUpper[0]];

    console.log('[startGameInternal] Selected', selected.length, 'problems');

    // 7. Clear any existing problems for this room (in case of restart)
    await RoomProblem.deleteMany({ roomId: room._id });
    console.log('[startGameInternal] Cleared existing problems');

    // 8. Create RoomProblem docs with fixed scoring
    const problemDocs = await Promise.all(
      selected.map((p, idx) =>
        RoomProblem.create({
          roomId: room._id,
          contestId: p.contestId,
          index: p.index,
          rating: p.rating,
          basePoints: PROBLEM_SCORING[idx]?.basePoints || 500,
          minPoints: PROBLEM_SCORING[idx]?.minPoints || 250
        })
      )
    );
    console.log('[startGameInternal] Created', problemDocs.length, 'RoomProblem docs');

    // 9. room.status = "started"
    room.status = 'started';

    // 10. room.startTime = now
    const startTime = new Date();
    room.startTime = startTime;

    // 11. Save room
    await room.save();
    console.log('[startGameInternal] Room saved with status:', room.status);

    // 12. Format problems for response
    const problems = problemDocs.map(p => ({
      contestId: p.contestId,
      index: p.index,
      rating: p.rating,
      basePoints: p.basePoints,
      minPoints: p.minPoints
    }));

    console.log('[startGameInternal] Game started successfully!');
    
    return {
      success: true,
      problems,
      startTime: startTime.toISOString(),
      duration: room.settings.duration
    };
  } catch (error) {
    console.error('[startGameInternal] Error:', error);
    return { success: false, error: error.message || 'Failed to start game' };
  }
};

/**
 * POST /api/game/:code/start
 * Start game - only host allowed (HTTP route handler)
 */
const startGame = async (req, res) => {
  try {
    const { code } = req.params;

    // 1. Find room
    const room = await Room.findOne({ code });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // 2. Verify req.session.userId == room.host
    // 3. If not -> 403
    if (req.session.userId.toString() !== room.host.toString()) {
      return res.status(403).json({ error: 'Only the host can start the game' });
    }

    // 4. Fetch problems from Codeforces
    const response = await fetch(`${CF_API}/problemset.problems`);
    const data = await response.json();

    if (data.status !== 'OK') {
      return res.status(500).json({ error: 'Failed to fetch problems from Codeforces' });
    }

    // 5. Calculate mid rating for split selection
    const minR = room.settings.minRating;
    const maxR = room.settings.maxRating;
    const midR = Math.floor((minR + maxR) / 2);

    // 6. Filter problems into two halves by rating
    const lowerHalf = data.result.problems.filter(
      p => p.rating && p.rating >= minR && p.rating <= midR
    );
    const upperHalf = data.result.problems.filter(
      p => p.rating && p.rating > midR && p.rating <= maxR
    );

    // 7. Shuffle each half and pick one from each
    const shuffledLower = lowerHalf.sort(() => Math.random() - 0.5);
    const shuffledUpper = upperHalf.sort(() => Math.random() - 0.5);

    if (shuffledLower.length < 1 || shuffledUpper.length < 1) {
      return res.status(500).json({ error: 'Could not fetch enough problems. Try adjusting rating range.' });
    }

    const selected = [shuffledLower[0], shuffledUpper[0]];

    // 8. Create RoomProblem docs with fixed scoring
    await Promise.all(
      selected.map((p, idx) =>
        RoomProblem.create({
          roomId: room._id,
          contestId: p.contestId,
          index: p.index,
          rating: p.rating,
          basePoints: PROBLEM_SCORING[idx].basePoints,
          minPoints: PROBLEM_SCORING[idx].minPoints
        })
      )
    );

    // 9. room.status = "started"
    room.status = 'started';

    // 10. room.startTime = now
    const startTime = new Date();
    room.startTime = startTime;

    // 11. Save room
    await room.save();

    return res.json({
      success: true,
      startTime
    });
  } catch (error) {
    console.error('Start game error:', error);
    return res.status(500).json({ error: 'Failed to start game' });
  }
};

/**
 * Compute leaderboard for a room with per-problem scores
 * @param {ObjectId} roomId
 * @returns {Promise<Array>}
 */
async function computeLeaderboard(roomId) {
  // Get all scores for this room with user info
  const scores = await Score.aggregate([
    { $match: { roomId } },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: '$user' },
    {
      $project: {
        handle: '$user.handle',
        avatar: '$user.avatar',
        contestId: 1,
        index: 1,
        points: 1,
        solvedAt: 1
      }
    }
  ]);

  // Group by user handle
  const userScores = {};
  for (const score of scores) {
    if (!userScores[score.handle]) {
      userScores[score.handle] = {
        handle: score.handle,
        avatar: score.avatar,
        totalPoints: 0,
        solvedCount: 0,
        problemScores: []
      };
    }
    userScores[score.handle].totalPoints += score.points;
    userScores[score.handle].solvedCount += 1;
    userScores[score.handle].problemScores.push({
      contestId: score.contestId,
      index: score.index,
      points: score.points,
      solvedAt: score.solvedAt.toISOString()
    });
  }

  // Convert to array and sort by totalPoints descending
  const leaderboard = Object.values(userScores).sort((a, b) => b.totalPoints - a.totalPoints);
  
  return leaderboard;
}

/**
 * Internal function to get leaderboard (used by socket handler)
 * @param {string} roomCode - The room code
 * @returns {Promise<Array>} - Leaderboard array
 */
const getLeaderboardInternal = async (roomCode) => {
  try {
    const room = await Room.findOne({ code: roomCode });
    if (!room) {
      return [];
    }
    return await computeLeaderboard(room._id);
  } catch (error) {
    console.error('Get leaderboard internal error:', error);
    return [];
  }
};

/**
 * Internal function to check submission (used by socket handler)
 * @param {string} roomCode - The room code
 * @param {string} oderId - The user ID
 * @param {string} handle - The user's Codeforces handle
 * @param {number} contestId - The contest ID
 * @param {string} index - The problem index
 * @returns {Promise<Object>} - { solved, points, message, alreadySolved }
 */
const checkSubmissionInternal = async (roomCode, oderId, handle, contestId, index) => {
  try {
    // Validate room exists
    const room = await Room.findOne({ code: roomCode });

    if (!room) {
      return { solved: false, message: 'Room not found' };
    }

    // Validate room.status === "started"
    if (room.status !== 'started') {
      return { solved: false, message: 'Game has not started' };
    }

    // Validate problem exists in RoomProblem
    const problem = await RoomProblem.findOne({
      roomId: room._id,
      contestId,
      index
    });

    if (!problem) {
      return { solved: false, message: 'Problem not found in room' };
    }

    // Convert oderId to ObjectId for MongoDB queries
    const oderIdObj = new mongoose.Types.ObjectId(oderId);

    // Check for existing score (already solved)
    const existingScore = await Score.findOne({
      roomId: room._id,
      userId: oderIdObj,
      contestId,
      index
    });

    if (existingScore) {
      return { solved: true, alreadySolved: true, points: existingScore.points };
    }

    // Fetch submissions from Codeforces
    const cfResponse = await fetch(`${CF_API}/user.status?handle=${handle}&count=50`);
    const cfData = await cfResponse.json();

    if (cfData.status !== 'OK') {
      return { solved: false, message: 'Failed to fetch submissions from Codeforces' };
    }

    // Find valid accepted submission (earliest one)
    const roomStartTime = room.startTime.getTime();
    let earliestSubmission = null;

    for (const sub of cfData.result) {
      if (
        sub.problem.contestId === contestId &&
        sub.problem.index === index &&
        sub.verdict === 'OK' &&
        sub.creationTimeSeconds * 1000 > roomStartTime
      ) {
        if (!earliestSubmission || sub.creationTimeSeconds < earliestSubmission.creationTimeSeconds) {
          earliestSubmission = sub;
        }
      }
    }

    // If none found
    if (!earliestSubmission) {
      return { solved: false, message: 'Problem not solved yet' };
    }

    // Calculate points
    const solveTime = earliestSubmission.creationTimeSeconds * 1000;
    const elapsedMinutes = Math.floor((solveTime - roomStartTime) / 60000);
    const rawPoints = problem.basePoints - (elapsedMinutes * 5);
    const points = Math.max(rawPoints, problem.minPoints);

    // Save score
    await Score.create({
      roomId: room._id,
      userId: oderIdObj,
      contestId,
      index,
      solvedAt: new Date(solveTime),
      points
    });

    return { solved: true, points };
  } catch (error) {
    console.error('Check submission internal error:', error);
    return { solved: false, message: 'Failed to check submission' };
  }
};

/**
 * POST /api/game/:code/check
 * Check submission for a problem
 * Body: { contestId, index }
 */
const checkSubmission = async (req, res) => {
  try {
    const { code } = req.params;
    const { contestId, index } = req.body;

    // STEP 1 — VALIDATE
    // Validate session user exists
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.session.userId;

    // Validate room exists
    const room = await Room.findOne({ code });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Validate room.status === "started"
    if (room.status !== 'started') {
      return res.status(400).json({ error: 'Game is not in progress' });
    }

    // Validate user is participant
    const isParticipant = room.participants.some(
      p => p.toString() === userId.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({ error: 'You are not a participant in this room' });
    }

    // Validate problem exists in RoomProblem
    const problem = await RoomProblem.findOne({
      roomId: room._id,
      contestId,
      index
    });

    if (!problem) {
      return res.status(404).json({ error: 'Problem not found in room' });
    }

    // STEP 2 — PREVENT DUPLICATE
    const existingScore = await Score.findOne({
      roomId: room._id,
      userId,
      contestId,
      index
    });

    if (existingScore) {
      return res.json({ solved: true, alreadySolved: true });
    }

    // STEP 3 — FETCH USER HANDLE
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const handle = user.handle;

    // STEP 4 — CALL CODEFORCES API
    const cfResponse = await fetch(`${CF_API}/user.status?handle=${handle}&count=50`);
    const cfData = await cfResponse.json();

    if (cfData.status !== 'OK') {
      return res.status(500).json({ error: 'Failed to fetch submissions from Codeforces' });
    }

    // STEP 5 — FIND VALID ACCEPTED SUBMISSION (earliest one)
    const roomStartTime = room.startTime.getTime();
    let earliestSubmission = null;

    for (const sub of cfData.result) {
      if (
        sub.problem.contestId === contestId &&
        sub.problem.index === index &&
        sub.verdict === 'OK' &&
        sub.creationTimeSeconds * 1000 > roomStartTime
      ) {
        // Find the earliest valid submission
        if (!earliestSubmission || sub.creationTimeSeconds < earliestSubmission.creationTimeSeconds) {
          earliestSubmission = sub;
        }
      }
    }

    // If none found
    if (!earliestSubmission) {
      return res.json({ solved: false });
    }

    // STEP 6 — CALCULATE POINTS (CORE LOGIC)
    // CRITICAL: Use submission time ONLY (never Date.now())
    const solveTime = earliestSubmission.creationTimeSeconds * 1000;
    const elapsedMinutes = Math.floor((solveTime - roomStartTime) / 60000);
    const rawPoints = problem.basePoints - (elapsedMinutes * 5);
    const points = Math.max(rawPoints, problem.minPoints);

    // STEP 7 — SAVE SCORE
    await Score.create({
      roomId: room._id,
      userId,
      contestId,
      index,
      solvedAt: new Date(solveTime),
      points
    });

    // STEP 8 — RECOMPUTE LEADERBOARD
    const leaderboard = await computeLeaderboard(room._id);

    // STEP 9 — SOCKET EMITS
    const io = req.app.get('io');
    if (io) {
      // Emit problem-solved event
      io.to(code).emit('problem-solved', {
        userId,
        contestId,
        index,
        points
      });

      // Emit leaderboard-update event
      io.to(code).emit('leaderboard-update', leaderboard);
    }

    // Return API response
    return res.json({
      solved: true,
      points
    });
  } catch (error) {
    console.error('Check submission error:', error);
    return res.status(500).json({ error: 'Failed to check submission' });
  }
};

/**
 * Internal function to auto-check all submissions for all players when game ends
 * Called by server-side game timer when duration expires
 * @param {string} roomCode - The room code
 * @returns {Promise<Object>} - { leaderboard, winner }
 */
const autoCheckAllSubmissionsInternal = async (roomCode) => {
  try {
    console.log('[autoCheckAllSubmissions] Starting auto-evaluation for room:', roomCode);

    const room = await Room.findOne({ code: roomCode }).populate('participants', 'handle');
    if (!room) {
      console.log('[autoCheckAllSubmissions] Room not found:', roomCode);
      return { leaderboard: [], winner: null };
    }

    // If already ended, just return current leaderboard
    if (room.status === 'ended') {
      console.log('[autoCheckAllSubmissions] Game already ended');
      const leaderboard = await computeLeaderboard(room._id);
      const winner = leaderboard.length > 0 ? leaderboard[0] : null;
      return { leaderboard, winner };
    }

    const roomProblems = await RoomProblem.find({ roomId: room._id });
    const gameEndTime = room.startTime.getTime() + room.settings.duration * 60 * 1000;

    console.log('[autoCheckAllSubmissions] Checking', room.participants.length, 'participants for', roomProblems.length, 'problems');

    for (let i = 0; i < room.participants.length; i++) {
      const participant = room.participants[i];

      try {
        // Add delay between API calls to respect CF rate limits (except first)
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Fetch all recent submissions from Codeforces for this participant
        const cfResponse = await fetch(`${CF_API}/user.status?handle=${participant.handle}&count=50`);
        const cfData = await cfResponse.json();

        if (cfData.status !== 'OK') {
          console.log('[autoCheckAllSubmissions] CF API failed for:', participant.handle);
          continue;
        }

        // Check each problem
        for (const problem of roomProblems) {
          // Skip if already scored
          const existingScore = await Score.findOne({
            roomId: room._id,
            userId: participant._id,
            contestId: problem.contestId,
            index: problem.index
          });

          if (existingScore) {
            console.log('[autoCheckAllSubmissions] Already scored:', participant.handle, problem.contestId + problem.index);
            continue;
          }

          // Find valid accepted submission before game end
          let earliestSubmission = null;
          for (const sub of cfData.result) {
            if (
              sub.problem.contestId === problem.contestId &&
              sub.problem.index === problem.index &&
              sub.verdict === 'OK' &&
              sub.creationTimeSeconds * 1000 > room.startTime.getTime() &&
              sub.creationTimeSeconds * 1000 <= gameEndTime
            ) {
              if (!earliestSubmission || sub.creationTimeSeconds < earliestSubmission.creationTimeSeconds) {
                earliestSubmission = sub;
              }
            }
          }

          if (earliestSubmission) {
            // Calculate points
            const solveTime = earliestSubmission.creationTimeSeconds * 1000;
            const elapsedMinutes = Math.floor((solveTime - room.startTime.getTime()) / 60000);
            const rawPoints = problem.basePoints - (elapsedMinutes * 5);
            const points = Math.max(rawPoints, problem.minPoints);

            await Score.create({
              roomId: room._id,
              userId: participant._id,
              contestId: problem.contestId,
              index: problem.index,
              solvedAt: new Date(solveTime),
              points
            });

            console.log('[autoCheckAllSubmissions] Scored:', participant.handle, problem.contestId + problem.index, points, 'pts');
          }
        }
      } catch (participantError) {
        console.error('[autoCheckAllSubmissions] Error checking participant:', participant.handle, participantError);
      }
    }

    // Mark game as ended
    room.status = 'ended';
    await room.save();

    // Compute final leaderboard
    const leaderboard = await computeLeaderboard(room._id);

    // Determine winner
    const winner = leaderboard.length > 0 ? leaderboard[0] : null;

    console.log('[autoCheckAllSubmissions] Evaluation complete. Winner:', winner?.handle || 'none');

    return { leaderboard, winner };
  } catch (error) {
    console.error('[autoCheckAllSubmissions] Error:', error);
    return { leaderboard: [], winner: null };
  }
};

/**
 * POST /api/game/:code/end
 * End game - only host allowed
 */
const endGame = async (req, res) => {
  try {
    const { code } = req.params;

    // Find room
    const room = await Room.findOne({ code });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Only host allowed
    if (req.session.userId.toString() !== room.host.toString()) {
      return res.status(403).json({ error: 'Only the host can end the game' });
    }

    // 1. room.status = ended
    room.status = 'ended';

    // 2. Save
    await room.save();

    return res.json({ success: true });
  } catch (error) {
    console.error('End game error:', error);
    return res.status(500).json({ error: 'Failed to end game' });
  }
};

module.exports = {
  // HTTP route handlers
  getProblems,
  getLeaderboard,
  getState,
  startGame,
  checkSubmission,
  endGame,
  // Internal functions for socket handlers (different names to avoid confusion)
  startGameInternal,
  getLeaderboardInternal,
  checkSubmissionInternal,
  autoCheckAllSubmissionsInternal
};
