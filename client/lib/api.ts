import type { User, Room, RoomSettings, Problem, LeaderboardEntry } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Custom error class for API errors
export class ApiError extends Error {
  status: number;
  isUnauthorized: boolean;
  isNotFound: boolean;
  isServerError: boolean;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.isUnauthorized = status === 401;
    this.isNotFound = status === 404;
    this.isServerError = status >= 500;
  }
}

// Base fetch helper with credentials
async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  try {
    const response = await fetch(`${API_URL}/api${endpoint}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new ApiError(
        error.message || error.error || `HTTP error! status: ${response.status}`,
        response.status
      );
    }

    return response.json();
  } catch (error) {
    // Re-throw ApiError as is
    if (error instanceof ApiError) {
      throw error;
    }
    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new ApiError('Unable to connect to server. Please check your internet connection.', 0);
    }
    // Re-throw other errors
    throw error;
  }
}

// Auth API functions
export async function login(handle: string): Promise<{ user: User }> {
  return fetchApi<{ user: User }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ handle }),
  });
}

export async function logout(): Promise<void> {
  await fetchApi<void>('/auth/logout', {
    method: 'POST',
  });
}

export async function getMe(): Promise<{ user: User }> {
  return fetchApi<{ user: User }>('/auth/me');
}

// Room API functions
export async function createRoom(settings: RoomSettings): Promise<{ code: string; settings: RoomSettings; participants: string[] }> {
  return fetchApi<{ code: string; settings: RoomSettings; participants: string[] }>('/rooms/create', {
    method: 'POST',
    body: JSON.stringify(settings),
  });
}

export async function joinRoom(code: string): Promise<{ participants: Array<{ handle: string; avatar?: string; rating: number }> }> {
  return fetchApi<{ participants: Array<{ handle: string; avatar?: string; rating: number }> }>(`/rooms/${code}/join`, {
    method: 'POST',
  });
}

export async function getRoom(code: string): Promise<Room> {
  return fetchApi<Room>(`/rooms/${code}`);
}

export async function leaveRoom(code: string): Promise<{ message: string }> {
  return fetchApi<{ message: string }>(`/rooms/${code}/leave`, {
    method: 'POST',
  });
}

export async function updateRoomSettings(code: string, settings: RoomSettings): Promise<Room> {
  return fetchApi<Room>(`/rooms/${code}/settings`, {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

// Game API functions

// Solved problem info from API
export interface SolvedProblemFromAPI {
  contestId: number;
  index: string;
  points: number;
  solvedAt: string;
}

// Game state response for refresh recovery
export interface GameStateResponse {
  roomCode: string;
  problems: Problem[];
  startTime: string;
  duration: number;
  status: 'waiting' | 'started' | 'ended';
  leaderboard: LeaderboardEntry[];
  solvedProblems: SolvedProblemFromAPI[];
}

// Get game problems
export async function getGameProblems(code: string): Promise<{ problems: Problem[] }> {
  return fetchApi<{ problems: Problem[] }>(`/game/${code}/problems`);
}

// Get game leaderboard
export async function getGameLeaderboard(code: string): Promise<{ leaderboard: LeaderboardEntry[] }> {
  return fetchApi<{ leaderboard: LeaderboardEntry[] }>(`/game/${code}/leaderboard`);
}

// Get full game state (for refresh recovery)
export async function getGameState(code: string): Promise<GameStateResponse> {
  return fetchApi<GameStateResponse>(`/game/${code}/state`);
}
