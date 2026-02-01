// User types
export interface User {
  _id: string;
  handle: string;
  rating: number;
  avatar?: string;
}

// Participant type (can have optional _id from socket events)
export interface Participant {
  _id?: string;
  handle: string;
  rating: number;
  avatar?: string;
}

// Room settings
export interface RoomSettings {
  minRating: number;
  maxRating: number;
  questionCount: number;
  duration: number; // in minutes
}

// Room status type
export type RoomStatus = 'waiting' | 'started' | 'ended';

// Room type
export interface Room {
  _id?: string;
  code: string;
  host: User;
  participants: Participant[];
  settings: RoomSettings;
  status: RoomStatus;
  startTime?: string;
}

// Problem type
export interface Problem {
  contestId: number;
  index: string;
  rating: number;
  basePoints: number;
  minPoints: number;
}

// Per-problem score for leaderboard
export interface ProblemScore {
  contestId: number;
  index: string;
  points: number;
  solvedAt: string; // ISO timestamp when solved
}

// Leaderboard entry with per-problem scores
export interface LeaderboardEntry {
  handle: string;
  avatar?: string;
  totalPoints: number;
  solvedCount: number;
  problemScores: ProblemScore[]; // Scores for each problem solved
}

// Game started event data from socket
export interface GameStartedData {
  roomCode: string;
  problems: Problem[];
  startTime: string;
  duration: number;
}

// Problem solved event data from socket
export interface ProblemSolvedData {
  userId: string;
  handle?: string; // Handle of the user who solved (for notifications)
  contestId: number;
  index: string;
  points: number;
}

// Problem not solved event data from socket
export interface ProblemNotSolvedData {
  contestId: number;
  index: string;
  message: string;
}
