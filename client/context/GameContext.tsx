"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useSocket } from "@/hooks/useSocket";
import type { Problem, LeaderboardEntry, GameStartedData } from "@/types";

export type { GameStartedData };

// Game state interface
interface GameState {
  roomCode: string | null;
  problems: Problem[];
  startTime: string | null;
  duration: number; // in minutes
  leaderboard: LeaderboardEntry[];
  isGameActive: boolean;
  isLoading: boolean;
  isGameStarting: boolean; // True when game-started received but not yet navigated
}

interface GameContextType extends GameState {
  setGameData: (data: GameStartedData) => void;
  updateLeaderboard: (leaderboard: LeaderboardEntry[]) => void;
  clearGame: () => void;
  setIsGameStarting: (value: boolean) => void;
}

const initialState: GameState = {
  roomCode: null,
  problems: [],
  startTime: null,
  duration: 0,
  leaderboard: [],
  isGameActive: false,
  isLoading: false,
  isGameStarting: false,
};

const GameContext = createContext<GameContextType | undefined>(undefined);

export function GameProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { socket, isConnected, on, off } = useSocket();
  const [gameState, setGameState] = useState<GameState>(initialState);

  // Set game data when game starts
  const setGameData = useCallback((data: GameStartedData) => {
    console.log("[GameContext] Setting game data:", data);
    setGameState({
      roomCode: data.roomCode,
      problems: data.problems,
      startTime: data.startTime,
      duration: data.duration,
      leaderboard: [],
      isGameActive: true,
      isLoading: false,
      isGameStarting: false,
    });
  }, []);

  // Update leaderboard
  const updateLeaderboard = useCallback((leaderboard: LeaderboardEntry[]) => {
    setGameState((prev) => ({
      ...prev,
      leaderboard,
    }));
  }, []);

  // Clear game state
  const clearGame = useCallback(() => {
    console.log("[GameContext] Clearing game state");
    setGameState(initialState);
    sessionStorage.removeItem("gameState");
  }, []);

  // Set game starting state (for loading screen)
  const setIsGameStarting = useCallback((value: boolean) => {
    setGameState((prev) => ({
      ...prev,
      isGameStarting: value,
    }));
  }, []);

  // Listen for game-starting and game-started events globally
  useEffect(() => {
    if (!socket || !isConnected) return;

    // Handle game-starting event (emitted immediately when host clicks start)
    // This ensures ALL users see loading screen at the same time
    const handleGameStarting = (data: { roomCode: string }) => {
      console.log("[GameContext] Game starting event received:", data);
      setGameState((prev) => ({
        ...prev,
        isGameStarting: true,
        isLoading: true,
      }));
    };

    const handleGameStarted = (data: GameStartedData) => {
      console.log("[GameContext] Game started event received:", data);
      
      // Store game data (loading state already set by game-starting)
      setGameData(data);

      // Navigate to game page after a brief moment to ensure state is set
      console.log("[GameContext] Navigating to game page:", `/game/${data.roomCode}`);
      setTimeout(() => {
        router.push(`/game/${data.roomCode}`);
      }, 100);
    };

    const handleLeaderboardUpdate = (leaderboard: LeaderboardEntry[]) => {
      console.log("[GameContext] Leaderboard update received:", leaderboard);
      updateLeaderboard(leaderboard);
    };

    console.log("[GameContext] Setting up game event listeners");
    on<{ roomCode: string }>("game-starting", handleGameStarting);
    on<GameStartedData>("game-started", handleGameStarted);
    on<LeaderboardEntry[]>("leaderboard-update", handleLeaderboardUpdate);

    return () => {
      console.log("[GameContext] Cleaning up game event listeners");
      off("game-starting");
      off("game-started");
      off("leaderboard-update");
    };
  }, [socket, isConnected, on, off, setGameData, updateLeaderboard, router]);

  // Persist game state to sessionStorage for page refresh handling
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (gameState.isGameActive && gameState.roomCode) {
      sessionStorage.setItem("gameState", JSON.stringify(gameState));
    }
  }, [gameState]);

  // Restore game state from sessionStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedState = sessionStorage.getItem("gameState");
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState) as GameState;
        // Only restore if game was active
        if (parsed.isGameActive) {
          console.log("[GameContext] Restoring game state from sessionStorage");
          setGameState(parsed);
        }
      } catch (e) {
        console.error("[GameContext] Failed to parse saved game state:", e);
        sessionStorage.removeItem("gameState");
      }
    }
  }, []);

  return (
    <GameContext.Provider
      value={{
        ...gameState,
        setGameData,
        updateLeaderboard,
        clearGame,
        setIsGameStarting,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error("useGame must be used within a GameProvider");
  }
  return context;
}
