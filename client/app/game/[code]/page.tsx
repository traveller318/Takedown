"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2,
  Swords,
  Trophy,
  Home,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useGame } from "@/context/GameContext";
import { useSocket } from "@/hooks/useSocket";
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
import type { Problem, ProblemSolvedData, ProblemNotSolvedData, GameEndedData, LeaderboardEntry } from "@/types";

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
  const [isLoadingState, setIsLoadingState] = useState(() => {
    // Skip loading screen if game data is already available from context (navigating from room page)
    return !isGameActive || !problems || problems.length === 0;
  });
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [gameNotFound, setGameNotFound] = useState(false);
  const [isGameEnded, setIsGameEnded] = useState(false);
  const [showGameOverDialog, setShowGameOverDialog] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [winner, setWinner] = useState<LeaderboardEntry | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  
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
    const hasContextData = isGameActive && problems && problems.length > 0;
    const doFetch = async () => {
      // Only show loading if we don't already have data from context
      if (!hasContextData) {
        setIsLoadingState(true);
      }
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

  // Handle time up - show evaluating dialog while server auto-checks
  const handleTimeUp = useCallback(() => {
    console.log("[GamePage] Time's up! Waiting for server evaluation...");
    setIsGameEnded(true);
    setIsEvaluating(true);
    setShowGameOverDialog(true);
    toast.info("Time's up! Evaluating submissions...", {
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
    setRedirectCountdown(null);
    setShowGameOverDialog(false);
    handleExitGame();
  }, [handleExitGame]);

  // Listen for game-ended event (server auto-evaluation complete)
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleGameEnded = (data: GameEndedData) => {
      console.log("[GamePage] Game ended event received:", data);

      // Update leaderboard with final data from server
      updateLeaderboard(data.leaderboard);

      // Set winner
      setWinner(data.winner);

      // Mark as no longer evaluating
      setIsEvaluating(false);

      // Ensure game over dialog is showing (in case server event arrived before client timer)
      setIsGameEnded(true);
      setShowGameOverDialog(true);

      // Start countdown for auto-redirect to dashboard
      setRedirectCountdown(15);

      toast.success(
        data.winner
          ? `🏆 ${data.winner.handle} wins with ${data.winner.totalPoints} points!`
          : "Game Over! No submissions found.",
        { duration: 5000 }
      );
    };

    on<GameEndedData>("game-ended", handleGameEnded);

    return () => {
      off("game-ended");
    };
  }, [socket, isConnected, on, off, updateLeaderboard]);

  // Auto-redirect countdown after game ends
  useEffect(() => {
    if (redirectCountdown === null) return;

    if (redirectCountdown <= 0) {
      handleReturnHome();
      return;
    }

    const timer = setTimeout(() => {
      setRedirectCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [redirectCountdown, handleReturnHome]);

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
      
      // Only mark as solved for the CURRENT user
      // Other players should keep seeing the points decrease until they solve it themselves
      if (isCurrentUser) {
        setSolvedProblems((prev) => {
          const newMap = new Map(prev);
          newMap.set(problemKey, { points: data.points });
          return newMap;
        });
        setCheckingProblem(null);
        toast.success(`Problem Solved! +${data.points} points`, {
          icon: "🎉",
          duration: 4000,
        });
      } else if (data.handle) {
        // Someone else solved it - show notification but DON'T mark as solved on our UI
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
      <div className="min-h-screen bg-cover bg-center bg-no-repeat flex items-center justify-center" style={{ backgroundImage: "url('/gamebackground.png')" }}>
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative flex flex-col items-center gap-6">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-amber-500/20 animate-ping" />
            <div className="relative bg-black/40 backdrop-blur border-2 border-amber-600/50 rounded-full p-6">
              <Swords className="h-12 w-12 text-amber-200 animate-pulse" />
            </div>
          </div>
          <Loader2 className="h-8 w-8 animate-spin text-amber-300" />
          <div className="text-center">
            <h2 className="text-3xl font-kungfu tracking-wider text-amber-100 mb-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">Loading Battle...</h2>
            <p className="text-amber-300/70 font-kungfu tracking-wide">Preparing the arena</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (fetchError) {
    return (
      <div className="min-h-screen bg-cover bg-center bg-no-repeat flex items-center justify-center" style={{ backgroundImage: "url('/gamebackground.png')" }}>
        <div className="absolute inset-0 bg-white/40" />
        <div className="relative flex flex-col items-center gap-6 text-center">
          <div className="bg-red-100/60 border-2 border-red-400/50 rounded-full p-6">
            <Swords className="h-12 w-12 text-red-600" />
          </div>
          <div>
            <h2 className="text-2xl font-kungfu tracking-wider text-pink-900 mb-2">Failed to Load Battle</h2>
            <p className="text-pink-700/60 mb-4">{fetchError}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-2 bg-pink-300/70 border-2 border-pink-400/50 rounded-lg text-pink-900 font-kungfu tracking-wide hover:bg-pink-400/70 transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => router.push("/")}
                className="px-6 py-2 bg-white/60 border-2 border-pink-300/40 rounded-lg text-pink-700 font-kungfu tracking-wide hover:bg-white/80 transition-colors"
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cover bg-center bg-no-repeat bg-fixed text-white relative" style={{ backgroundImage: "url('/gamebackground.png')" }}>
      {/* Dark overlay for readability */}
      <div className="fixed inset-0 bg-black/30 pointer-events-none" />
      
      {/* Content */}
      <div className="relative z-10 p-4 md:p-6">
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
          <div className="flex items-center justify-center gap-3 mb-6">
            <button
              onClick={() => setActiveTab("problems")}
              className={`px-8 py-2 rounded-lg font-kungfu tracking-wider text-lg transition-all duration-200 border-2 ${
                activeTab === "problems"
                  ? "bg-pink-300/60 border-pink-400/60 text-white shadow-[0_0_15px_rgba(255,182,193,0.3)]"
                  : "bg-white/20 border-pink-300/30 text-white/60 hover:text-white hover:bg-white/30 hover:border-pink-400/40"
              }`}
            >
              Problems
            </button>
            <button
              onClick={() => setActiveTab("leaderboard")}
              className={`px-8 py-2 rounded-lg font-kungfu tracking-wider text-lg transition-all duration-200 border-2 ${
                activeTab === "leaderboard"
                  ? "bg-pink-300/60 border-pink-400/60 text-white shadow-[0_0_15px_rgba(255,182,193,0.3)]"
                  : "bg-white/20 border-pink-300/30 text-white/60 hover:text-white hover:bg-white/30 hover:border-pink-400/40"
              }`}
            >
              Leaderboard
            </button>
          </div>

          {/* Main Content - 2 Column Layout */}
          {activeTab === "problems" ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Problems List - Left Side (2/3 width) */}
              <div className="lg:col-span-2">
                <ProblemsList
                  problems={displayProblems}
                  solvedProblems={solvedProblems}
                  checkingProblem={checkingProblem}
                  isConnected={isConnected}
                  isGameEnded={isGameEnded}
                  startTime={startTime}
                  onCheckProblem={handleCheckProblem}
                />
              </div>

              {/* Instructions - Right Side (1/3 width) */}
              <div className="lg:col-span-1">
                <div className="kfp-panel sticky top-6">
                  <h3 className="text-lg font-kungfu tracking-wider mb-4 flex items-center gap-2 text-white">
                    <span className="text-xl">⭐</span>
                    Instructions
                  </h3>
                  <div className="space-y-3 text-white/80">
                    <div className="flex items-start gap-3">
                      <span className="text-green-400 mt-0.5 text-base">✓</span>
                      <p className="font-kungfu tracking-wide text-sm">Click <span className="text-white font-semibold">Check</span> once you see accepted submission on CF.</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="text-green-400 mt-0.5 text-base">✓</span>
                      <p className="font-kungfu tracking-wide text-sm">Points are calculated based on time your solution was accepted.</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="text-green-400 mt-0.5 text-base">✓</span>
                      <p className="font-kungfu tracking-wide text-sm">No negative points for wrong submissions.</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="text-green-400 mt-0.5 text-base">✓</span>
                      <p className="font-kungfu tracking-wide text-sm">You can check your progress on the leaderboard, updates every minute.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Leaderboard - Full Width */
            <Leaderboard
              leaderboard={leaderboard}
              problems={displayProblems}
              currentUserHandle={user?.handle}
              startTime={startTime}
            />
          )}
        </div>
      </div>

      {/* Game Over Dialog */}
      <Dialog open={showGameOverDialog} onOpenChange={(open) => {
        // Don't allow closing during evaluation
        if (!isEvaluating) setShowGameOverDialog(open);
      }}>
        <DialogContent className="sm:max-w-2xl bg-white/95 border-2 border-pink-400/50 text-pink-900 shadow-[0_0_60px_rgba(255,182,193,0.4)]">
          <DialogHeader className="text-center">
            {isEvaluating ? (
              <>
                <div className="flex justify-center mb-4">
                  <div className="bg-pink-100/60 border-2 border-pink-300/40 rounded-full p-4">
                    <Loader2 className="h-12 w-12 animate-spin text-pink-600" />
                  </div>
                </div>
                <DialogTitle className="text-4xl font-kungfu tracking-wider text-center text-pink-800">
                  Time&apos;s Up!
                </DialogTitle>
                <DialogDescription className="text-pink-600/70 text-center text-lg font-kungfu tracking-wide">
                  Evaluating all submissions... Please wait.
                </DialogDescription>
              </>
            ) : (
              <>
                <div className="flex justify-center mb-4">
                  <div className="bg-yellow-100/60 border-2 border-yellow-500/40 rounded-full p-4">
                    <Trophy className="h-12 w-12 text-yellow-600" />
                  </div>
                </div>
                <DialogTitle className="text-4xl font-kungfu tracking-wider text-center text-pink-800">
                  Game Over!
                </DialogTitle>
                <DialogDescription className="text-pink-600/70 text-center text-lg font-kungfu tracking-wide">
                  Final results are in!
                </DialogDescription>
              </>
            )}
          </DialogHeader>

          {/* Winner announcement */}
          {!isEvaluating && winner && (
            <div className="text-center mt-2 p-4 bg-linear-to-r from-yellow-100/80 via-amber-100/80 to-yellow-100/80 rounded-xl border-2 border-yellow-400/50">
              <span className="text-4xl">🏆</span>
              <h3 className="text-2xl font-kungfu tracking-wider text-amber-800 mt-2">
                {winner.handle} wins!
              </h3>
              <p className="text-amber-700/70 font-kungfu tracking-wide mt-1">
                {winner.totalPoints} points &bull; {winner.solvedCount} problem{winner.solvedCount !== 1 ? "s" : ""} solved
              </p>
            </div>
          )}

          {/* Final Leaderboard */}
          {!isEvaluating && (
            <div className="mt-4">
              <Leaderboard
                leaderboard={leaderboard}
                problems={displayProblems}
                currentUserHandle={user?.handle}
                startTime={startTime}
              />
            </div>
          )}

          <DialogFooter className="mt-6 sm:justify-center flex-col items-center gap-3">
            {!isEvaluating && (
              <>
                {redirectCountdown !== null && redirectCountdown > 0 && (
                  <p className="text-pink-600/70 font-kungfu tracking-wide text-sm">
                    Redirecting to dashboard in {redirectCountdown}s...
                  </p>
                )}
                <button
                  onClick={handleReturnHome}
                  className="flex items-center gap-2 px-8 py-3 bg-pink-300/70 border-2 border-pink-400/50 rounded-lg text-pink-900 font-kungfu tracking-wider hover:bg-pink-400/70 transition-colors shadow-[0_0_20px_rgba(255,182,193,0.3)]"
                >
                  <Home className="h-4 w-4" />
                  Return Home
                </button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
