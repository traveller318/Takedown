"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  Swords,
  Star,
  Trophy,
  Home,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useGame } from "@/context/GameContext";
import { useSocket } from "@/hooks/useSocket";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GameHeader, ProblemsList, Leaderboard } from "@/components/game";
import { ReconnectingBanner } from "@/components/ReconnectingBanner";
import { GameNotFound } from "@/components/NotFound";
import { getGameState, getGameProblems, getGameLeaderboard, ApiError } from "@/lib/api";
import type { Problem, ProblemSolvedData, ProblemNotSolvedData } from "@/types";

// Type for tracking solved problems with earned points
interface SolvedProblemInfo {
  points: number;
}

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { socket, isConnected, isReconnecting, reconnectAttempt, emit, on, off, trackRoom, untrackRoom } = useSocket();
  const {
    problems,
    startTime,
    duration,
    leaderboard,
    isGameActive,
    isGameStarting,
    setIsGameStarting,
    setGameData,
    updateLeaderboard,
    clearGame,
  } = useGame();

  const roomCode = params.code as string;

  const [localProblems, setLocalProblems] = useState<Problem[]>([]);
  const [solvedProblems, setSolvedProblems] = useState<Map<string, SolvedProblemInfo>>(new Map());
  const [checkingProblem, setCheckingProblem] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"problems" | "leaderboard">("problems");
  const [isLoadingState, setIsLoadingState] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [gameNotFound, setGameNotFound] = useState(false);
  const [isGameEnded, setIsGameEnded] = useState(false);
  const [showGameOverDialog, setShowGameOverDialog] = useState(false);
  
  // Timeout ref for check problem
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track if we've already fetched game state (to prevent duplicate fetches)
  const hasFetchedRef = useRef(false);
  
  // Track if cleanup has been done (to prevent double cleanup)
  const cleanupDoneRef = useRef(false);
  
  // Track if tab is closing (server grace period handles disconnect)
  const isTabClosingRef = useRef(false);

  // Use context problems if available, otherwise use locally fetched problems
  // Always default to empty array to prevent undefined errors
  const displayProblems = (problems && problems.length > 0) ? problems : (localProblems || []);

  // Fetch game state on mount - always fetch to restore solved problems
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (!roomCode) return;
    if (hasFetchedRef.current) return; // Prevent duplicate fetches
    
    // Always fetch game state on mount to restore solved problems
    // This handles page refresh correctly
    const doFetch = async () => {
      setIsLoadingState(true);
      setFetchError(null);
      
      try {
        console.log("[GamePage] Fetching game state for room:", roomCode);
        
        // Try to get full game state first
        const stateResponse = await getGameState(roomCode);
        console.log("[GamePage] Game state received:", stateResponse);
        
        if (stateResponse.status === "started") {
          // Update game context with fetched data
          setGameData({
            roomCode: stateResponse.roomCode,
            problems: stateResponse.problems,
            startTime: stateResponse.startTime,
            duration: stateResponse.duration,
          });
          
          // Update leaderboard
          if (stateResponse.leaderboard) {
            updateLeaderboard(stateResponse.leaderboard);
          }
          
          // Restore user's solved problems from API
          if (stateResponse.solvedProblems && stateResponse.solvedProblems.length > 0) {
            console.log("[GamePage] Restoring solved problems:", stateResponse.solvedProblems);
            const solvedMap = new Map<string, SolvedProblemInfo>();
            stateResponse.solvedProblems.forEach((sp) => {
              const key = `${sp.contestId}-${sp.index}`;
              solvedMap.set(key, { points: sp.points });
            });
            setSolvedProblems(solvedMap);
          }
          
          setLocalProblems(stateResponse.problems);
        } else if (stateResponse.status === "ended") {
          toast.info("This game has ended");
          router.push("/");
          return;
        } else {
          toast.error("Game has not started yet");
          router.push(`/room/${roomCode}`);
          return;
        }
      } catch (error) {
        console.error("[GamePage] Failed to fetch game state:", error);
        
        // Handle specific error types
        if (error instanceof ApiError) {
          if (error.isNotFound) {
            setGameNotFound(true);
            setIsLoadingState(false);
            return;
          }
          if (error.isUnauthorized) {
            toast.error("Please login first");
            router.push("/");
            return;
          }
        }
        
        // Fallback: Try fetching problems and leaderboard separately
        try {
          const [problemsRes, leaderboardRes] = await Promise.all([
            getGameProblems(roomCode),
            getGameLeaderboard(roomCode),
          ]);
          
          setLocalProblems(problemsRes.problems);
          updateLeaderboard(leaderboardRes.leaderboard);
        } catch (fallbackError) {
          console.error("[GamePage] Fallback fetch also failed:", fallbackError);
          if (fallbackError instanceof ApiError && fallbackError.isNotFound) {
            setGameNotFound(true);
          } else {
            setFetchError("Failed to load game data. Please try refreshing.");
          }
        }
      } finally {
        setIsLoadingState(false);
      }
    };
    
    console.log("[GamePage] Fetching game state from API...");
    hasFetchedRef.current = true;
    doFetch();
  }, [authLoading, user, roomCode, setGameData, updateLeaderboard, router]);

  // Clear the game starting state once the game page has loaded
  useEffect(() => {
    if (isGameStarting) {
      console.log("[GamePage] Clearing isGameStarting state");
      setIsGameStarting(false);
    }
  }, [isGameStarting, setIsGameStarting]);

  // Join room socket channel when connected (important for receiving events after page refresh)
  useEffect(() => {
    if (!socket || !isConnected || !roomCode) return;
    
    console.log("[GamePage] Joining room socket channel:", roomCode);
    emit("join-room", { roomCode });
    trackRoom(roomCode);
    
    // Cleanup - untrack room when component unmounts
    return () => {
      untrackRoom(roomCode);
    };
  }, [socket, isConnected, roomCode, emit, trackRoom, untrackRoom]);

  // Handle time up - show game over dialog
  const handleTimeUp = useCallback(() => {
    console.log("[GamePage] Time's up! Showing game over dialog");
    setIsGameEnded(true);
    setShowGameOverDialog(true);
    toast.info("Time's up! Game has ended.", {
      icon: "⏰",
      duration: 5000,
    });
  }, []);
  
  // Handle exit game - cleanup and navigate home
  const handleExitGame = useCallback(() => {
    if (cleanupDoneRef.current) return;
    cleanupDoneRef.current = true;
    
    console.log("[GamePage] Exiting game, performing cleanup...");
    
    // Emit leave-room event to server
    if (isConnected) {
      emit("leave-room", { roomCode });
    }
    
    // Untrack room from reconnect tracking
    untrackRoom(roomCode);
    
    // Clear game state
    clearGame();
    
    // Clear timeout
    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
      checkTimeoutRef.current = null;
    }
    
    // Navigate home
    router.push("/");
  }, [isConnected, emit, roomCode, clearGame, router, untrackRoom]);
  
  // Handle return home from game over dialog
  const handleReturnHome = useCallback(() => {
    setShowGameOverDialog(false);
    handleExitGame();
  }, [handleExitGame]);

  // Listen for problem-solved and problem-not-solved events
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleProblemSolved = (data: ProblemSolvedData) => {
      console.log("[GamePage] Problem solved event received:", data);
      const problemKey = `${data.contestId}-${data.index}`;
      const currentUserId = user?._id;
      const isCurrentUser = currentUserId && data.userId === currentUserId;
      
      // Clear timeout
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
        checkTimeoutRef.current = null;
      }
      
      // Update solved problems state
      setSolvedProblems((prev) => {
        const newMap = new Map(prev);
        newMap.set(problemKey, { points: data.points });
        return newMap;
      });
      
      // Only clear checking state if it was the current user
      if (isCurrentUser) {
        setCheckingProblem(null);
        toast.success(`Problem Solved! +${data.points} points`, {
          icon: "🎉",
          duration: 4000,
        });
      } else if (data.handle) {
        // Someone else solved it - show notification
        toast.info(`${data.handle} solved problem ${data.index}!`, {
          icon: "⚡",
          duration: 3000,
        });
      }
    };

    const handleProblemNotSolved = (data: ProblemNotSolvedData) => {
      console.log("[GamePage] Problem not solved:", data);
      
      // Clear timeout
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
        checkTimeoutRef.current = null;
      }
      
      setCheckingProblem(null);
      toast.error(data.message || "Problem not solved yet");
    };

    // Also listen for socket errors
    const handleError = (error: { message: string }) => {
      console.error("[GamePage] Socket error:", error);
      
      // Clear timeout
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
        checkTimeoutRef.current = null;
      }
      
      setCheckingProblem(null);
      toast.error(error.message || "An error occurred");
    };

    on<ProblemSolvedData>("problem-solved", handleProblemSolved);
    on<ProblemNotSolvedData>("problem-not-solved", handleProblemNotSolved);
    on<{ message: string }>("error", handleError);

    // Listen for player disconnect/reconnect events
    const handlePlayerDisconnected = (data: { userId: string; handle: string; gracePeriod: number }) => {
      if (data.userId === user?._id) return;
      toast.info(`${data.handle} disconnected. Waiting ${data.gracePeriod}s for reconnect...`, {
        icon: "⚠️",
        duration: 5000,
      });
    };

    const handlePlayerReconnected = (data: { userId: string; handle: string }) => {
      if (data.userId === user?._id) return;
      toast.success(`${data.handle} reconnected!`, {
        icon: "🔄",
        duration: 3000,
      });
    };

    on<{ userId: string; handle: string; gracePeriod: number }>("player-disconnected", handlePlayerDisconnected);
    on<{ userId: string; handle: string }>("player-reconnected", handlePlayerReconnected);

    // Handle explicit player-left event (emitted when a player leaves mid-game)
    const handlePlayerLeft = (data: { userId: string; handle: string }) => {
      if (data.userId === user?._id) return;
      toast.info(`${data.handle} left the game`, {
        icon: "🚪",
        duration: 4000,
      });
    };

    on<{ userId: string; handle: string }>("player-left", handlePlayerLeft);

    return () => {
      off("problem-solved");
      off("problem-not-solved");
      off("error");
      off("player-disconnected");
      off("player-reconnected");
      off("player-left");
    };
  }, [socket, isConnected, on, off, user]);

  // Handle check problem submission
  const handleCheckProblem = useCallback((problem: Problem) => {
    // Don't allow checking if game has ended
    if (isGameEnded) {
      toast.info("Game has ended - no more submissions allowed");
      return;
    }
    
    if (!isConnected) {
      toast.error("Not connected to server. Please wait for reconnection.");
      return;
    }
    
    // Prevent double-click - if already checking a problem, ignore
    if (checkingProblem !== null) {
      return;
    }

    const problemKey = `${problem.contestId}-${problem.index}`;
    if (solvedProblems.has(problemKey)) {
      toast.info("You've already solved this problem!");
      return;
    }

    console.log("[GamePage] Checking problem:", { roomCode, contestId: problem.contestId, index: problem.index });
    setCheckingProblem(problemKey);
    
    // Clear any existing timeout
    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
    }
    
    // Add timeout to prevent indefinite loading (15 seconds)
    checkTimeoutRef.current = setTimeout(() => {
      console.warn("[GamePage] Check problem timeout - no response received");
      setCheckingProblem(null);
      toast.error("Request timed out. Please try again.");
      checkTimeoutRef.current = null;
    }, 15000);
    
    emit("check-problem", {
      roomCode,
      contestId: problem.contestId,
      index: problem.index,
    });
  }, [isConnected, roomCode, solvedProblems, emit, isGameEnded, checkingProblem]);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
    };
  }, []);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      // During active game, don't emit leave-room on browser navigation
      // Server-side grace period handles disconnects
      // User can navigate back to /game/CODE to resume
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);
  
  // Handle browser beforeunload (tab close, refresh) - show confirmation during active game
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Mark that tab is closing so unmount cleanup doesn't emit leave-room
      isTabClosingRef.current = true;
      // Only show prompt during active game (not ended)
      if (!isGameEnded && isGameActive) {
        e.preventDefault();
        // Modern browsers require returnValue to be set
        e.returnValue = "";
        return "";
      }
    };
    
    // Reset flag if user cancels the close (page regains focus)
    const handleFocus = () => {
      isTabClosingRef.current = false;
    };
    
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("focus", handleFocus);
    
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("focus", handleFocus);
    };
  }, [isGameEnded, isGameActive]);
  
  // Cleanup on unmount - server grace period handles tab close/refresh
  useEffect(() => {
    return () => {
      // Don't emit leave-room on unmount during game
      // Server-side disconnect handler with grace period handles tab close/refresh
      // handleExitGame handles explicit user exit via button
    };
  }, []);

  // Redirect if not authenticated
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      toast.error("Please login first");
      router.push("/");
      return;
    }
  }, [authLoading, user, router]);

  // Show not found page
  if (gameNotFound) {
    return <GameNotFound />;
  }

  // Loading state
  if (authLoading || isLoadingState || (!isGameActive && displayProblems.length === 0)) {
    return (
      <div className="min-h-screen bg-linear-to-br from-black via-neutral-900 to-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-white/10 animate-ping" />
            <div className="relative bg-white/5 backdrop-blur border border-white/10 rounded-full p-6">
              <Swords className="h-12 w-12 text-white animate-pulse" />
            </div>
          </div>
          <Loader2 className="h-8 w-8 animate-spin text-white" />
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-2">Loading Game...</h2>
            <p className="text-gray-400">Setting up your battle arena</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (fetchError) {
    return (
      <div className="min-h-screen bg-linear-to-br from-black via-neutral-900 to-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="bg-red-500/10 border border-red-500/30 rounded-full p-6">
            <Swords className="h-12 w-12 text-red-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Failed to Load Game</h2>
            <p className="text-gray-400 mb-4">{fetchError}</p>
            <div className="flex gap-3 justify-center">
              <Button
                onClick={() => window.location.reload()}
                className="bg-white hover:bg-gray-200 text-black"
              >
                Try Again
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push("/")}
                className="border-white/20 text-gray-300 hover:bg-white/10"
              >
                Go Home
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-black via-neutral-900 to-black text-white p-6">
      {/* Reconnecting Banner */}
      <ReconnectingBanner
        isConnected={isConnected}
        isReconnecting={isReconnecting}
        reconnectAttempt={reconnectAttempt}
        maxAttempts={15}
      />

      <div className="max-w-6xl mx-auto">
        {/* Header with Timer and Exit */}
        <GameHeader
          roomCode={roomCode}
          startTime={startTime}
          duration={duration}
          isConnected={isConnected}
          isGameEnded={isGameEnded}
          onTimeUp={handleTimeUp}
          onExit={handleExitGame}
        />

        {/* Tab Buttons */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <Button
            variant={activeTab === "problems" ? "secondary" : "outline"}
            onClick={() => setActiveTab("problems")}
            className={`px-6 ${
              activeTab === "problems"
                ? "bg-white/10 text-white border-white/20"
                : "bg-transparent border-white/20 text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            Problems
          </Button>
          <Button
            variant={activeTab === "leaderboard" ? "secondary" : "outline"}
            onClick={() => setActiveTab("leaderboard")}
            className={`px-6 ${
              activeTab === "leaderboard"
                ? "bg-white/10 text-white border-white/20"
                : "bg-transparent border-white/20 text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            Leaderboard
          </Button>
        </div>

        {/* Main Content */}
        <div className="space-y-6">
          {activeTab === "problems" ? (
            /* Problems List */
            <ProblemsList
              problems={displayProblems}
              solvedProblems={solvedProblems}
              checkingProblem={checkingProblem}
              isConnected={isConnected}
              isGameEnded={isGameEnded}
              startTime={startTime}
              onCheckProblem={handleCheckProblem}
            />
          ) : (
            /* Leaderboard */
            <Leaderboard
              leaderboard={leaderboard}
              problems={displayProblems}
              currentUserHandle={user?.handle}
              startTime={startTime}
            />
          )}

          {/* Instructions Card */}
          <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-400" />
              Instructions
            </h3>
            <div className="space-y-3 text-gray-300">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 shrink-0" />
                <p>Click <span className="font-semibold text-white">Check</span> once you see accepted submission on CF.</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-5 w-5 flex items-center justify-center mt-0.5 shrink-0">
                  <div className="h-2 w-2 bg-gray-500 rounded-sm" />
                </div>
                <p>Points are calculated based on time your solution was accepted.</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-5 w-5 flex items-center justify-center mt-0.5 shrink-0">
                  <div className="h-2 w-2 bg-gray-500 rounded-sm" />
                </div>
                <p>No negative points for wrong submissions.</p>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 shrink-0" />
                <p>You can check your progress on the leaderboard, updates every minute.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Game Over Dialog */}
      <Dialog open={showGameOverDialog} onOpenChange={setShowGameOverDialog}>
        <DialogContent className="sm:max-w-2xl bg-neutral-900 border-white/10 text-white max-h-[90vh] overflow-y-auto">
          <DialogHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-full p-4">
                <Trophy className="h-12 w-12 text-yellow-400" />
              </div>
            </div>
            <DialogTitle className="text-3xl font-bold text-center">
              Game Over!
            </DialogTitle>
            <DialogDescription className="text-gray-400 text-center text-lg">
              Time&apos;s up! Here are the final results.
            </DialogDescription>
          </DialogHeader>

          {/* Final Leaderboard */}
          <div className="mt-4">
            <Leaderboard
              leaderboard={leaderboard}
              problems={displayProblems}
              currentUserHandle={user?.handle}
              startTime={startTime}
            />
          </div>

          <DialogFooter className="mt-6 sm:justify-center">
            <Button
              onClick={handleReturnHome}
              className="bg-white hover:bg-gray-200 text-black font-medium px-8 py-3"
            >
              <Home className="h-4 w-4 mr-2" />
              Return Home
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
