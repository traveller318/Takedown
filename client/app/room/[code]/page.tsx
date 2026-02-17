"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Shojumaru, Playfair_Display } from "next/font/google";
import { toast } from "sonner";
import {
  Loader2,
  Flag,
  Users,
  Copy,
  Play,
  LogOut,
  Crown,
  Swords,
  Scroll,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useGame } from "@/context/GameContext";
import { useSocket } from "@/hooks/useSocket";
import { useLoadingState } from "@/hooks/useDebounce";
import {
  getRoom,
  leaveRoom,
  updateRoomSettings,
  joinRoom,
  ApiError,
} from "@/lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReconnectingBanner } from "@/components/ReconnectingBanner";
import { RoomNotFound } from "@/components/NotFound";
import type { Room, RoomSettings } from "@/types";

// Type for socket participant (backend may send 'id' or '_id' or neither)
interface SocketParticipant {
  id?: string;
  _id?: string;
  handle: string;
  avatar?: string;
  rating: number;
}

// Type for room-update event data from socket
interface RoomUpdateData {
  roomCode: string;
  participants: SocketParticipant[];
}

const shojumaru = Shojumaru({ weight: "400", subsets: ["latin"] });
const playfair = Playfair_Display({ subsets: ["latin"] });

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { isGameStarting, setIsGameStarting } = useGame();
  const {
    socket,
    isConnected,
    isReconnecting,
    reconnectAttempt,
    emit,
    on,
    off,
    trackRoom,
    untrackRoom,
  } = useSocket();
  const roomCode = params.code as string;

  const [room, setRoom] = useState<Room | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [roomNotFound, setRoomNotFound] = useState(false);
  const [isStartingGame, setIsStartingGame] = useState(false);
  const [settings, setSettings] = useState<RoomSettings>({
    minRating: 800,
    maxRating: 1300,
    questionCount: 2,
    duration: 15,
  });

  // Loading states for buttons (prevents double-click)
  const saveSettingsState = useLoadingState();
  const exitRoomState = useLoadingState();

  // Track previous participants to detect joins/leaves
  const previousParticipantsRef = useRef<Set<string>>(new Set());
  // Track if we've joined the socket room
  const hasJoinedSocketRoom = useRef(false);
  // Track if component is mounted for cleanup safety
  const isMountedRef = useRef(true);
  // Track if tab is closing (server grace period handles disconnect)
  const isTabClosingRef = useRef(false);
  // Track if navigating to game page (don't emit leave-room)
  const navigatingToGameRef = useRef(false);

  const isHost = room && user && room.host._id === user._id;

  const fetchRoom = useCallback(async (): Promise<boolean> => {
    try {
      const roomData = await getRoom(roomCode);
      setRoom(roomData);
      setSettings(roomData.settings);
      setIsLoading(false);
      setRoomNotFound(false);
      return true;
    } catch (error) {
      // Handle specific error types
      if (error instanceof ApiError) {
        if (error.isNotFound) {
          setRoomNotFound(true);
          return false;
        }
        if (error.isUnauthorized) {
          toast.error("Please login first");
          router.push("/");
          return false;
        }
      }
      // Silently fail for other errors - room might not exist or user might not be a participant yet
      return false;
    }
  }, [roomCode, router]);

  // Auto-join room when page loads (handles refresh case)
  const joinAndFetchRoom = useCallback(async () => {
    try {
      // First try to fetch the room (user might already be a participant)
      const roomExists = await fetchRoom();
      if (roomExists) return;

      // If room was not found (404), don't try to join
      if (roomNotFound) return;

      // If fetch failed, try to join the room first
      try {
        await joinRoom(roomCode);
      } catch (error) {
        if (error instanceof ApiError) {
          if (error.isNotFound) {
            setRoomNotFound(true);
            return;
          }
          if (error.isUnauthorized) {
            toast.error("Please login first");
            router.push("/");
            return;
          }
        }
        // Join might fail for other reasons
      }

      // Try fetching again after join attempt
      const joined = await fetchRoom();
      if (!joined && !roomNotFound) {
        // Room truly doesn't exist
        setRoomNotFound(true);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.isNotFound) {
          setRoomNotFound(true);
          return;
        }
        if (error.isUnauthorized) {
          toast.error("Please login first");
          router.push("/");
          return;
        }
        toast.error(error.message);
      } else {
        toast.error("Failed to load room");
      }
      setRoomNotFound(true);
    } finally {
      setIsLoading(false);
    }
  }, [roomCode, router, fetchRoom, roomNotFound]);

  // Join socket room
  const joinSocketRoom = useCallback(() => {
    if (!isConnected || !socket || hasJoinedSocketRoom.current) return;

    console.log("[RoomPage] Emitting join-room for:", roomCode);
    emit("join-room", { roomCode });
    hasJoinedSocketRoom.current = true;

    // Track room for auto-rejoin after reconnect
    trackRoom(roomCode);
  }, [isConnected, socket, roomCode, emit, trackRoom]);

  // Handle room-update events
  const handleRoomUpdate = useCallback(
    (data: RoomUpdateData) => {
      if (!isMountedRef.current) return;
      if (data.roomCode !== roomCode) return;

      console.log("[RoomPage] Received room-update:", data);

      const currentHandles = new Set(data.participants.map((p) => p.handle));
      const previousHandles = previousParticipantsRef.current;

      // Detect who joined (leave detection is handled by 'player-left' event to avoid duplicates)
      currentHandles.forEach((handle) => {
        if (!previousHandles.has(handle) && previousHandles.size > 0) {
          // Don't show toast for the current user
          if (handle !== user?.handle) {
            toast.success(`${handle} joined the room`, {
              icon: "👋",
              duration: 3000,
            });
          }
        }
      });

      // Update previous participants
      previousParticipantsRef.current = currentHandles;

      // Update room participants - convert socket format to Room format
      setRoom((prevRoom) => {
        if (!prevRoom) return prevRoom;
        return {
          ...prevRoom,
          participants: data.participants.map((p) => ({
            _id: p.id || p._id || p.handle, // Use handle as fallback identifier
            handle: p.handle,
            avatar: p.avatar,
            rating: p.rating,
          })),
        };
      });
    },
    [roomCode, user?.handle],
  );

  // Handle socket error
  const handleSocketError = useCallback(
    (data: { message: string }) => {
      console.error("[RoomPage] Socket error:", data.message);

      // Reset starting game state on error (both local and global)
      setIsStartingGame(false);
      setIsGameStarting(false);

      if (
        data.message.includes("Room not found") ||
        data.message.includes("not found")
      ) {
        setRoomNotFound(true);
      } else {
        toast.error(data.message);
      }
    },
    [setIsGameStarting],
  );

  // Handle game-starting event (show loading for all users immediately)
  const handleGameStarting = useCallback(
    (data: { roomCode: string }) => {
      if (data.roomCode !== roomCode) return;
      console.log("[RoomPage] Game starting event received");
      navigatingToGameRef.current = true;
      setIsStartingGame(true);
      setIsGameStarting(true);
    },
    [roomCode, setIsGameStarting],
  );

  // Set up socket event listeners
  useEffect(() => {
    if (!socket || !isConnected) return;

    console.log("[RoomPage] Setting up socket event listeners");

    // Player disconnect/reconnect handlers for grace period
    const handlePlayerDisconnected = (data: {
      userId: string;
      handle: string;
      gracePeriod: number;
    }) => {
      if (data.handle === user?.handle) return;
      toast.info(
        `${data.handle} disconnected. Waiting ${data.gracePeriod}s for reconnect...`,
        {
          icon: "⚠️",
          duration: 5000,
        },
      );
    };

    const handlePlayerReconnected = (data: {
      userId: string;
      handle: string;
    }) => {
      if (data.handle === user?.handle) return;
      toast.success(`${data.handle} reconnected!`, {
        icon: "🔄",
        duration: 3000,
      });
    };

    // Handle host transfer (when host leaves a waiting room)
    const handleHostChanged = (data: {
      roomCode: string;
      newHost: { _id: string; handle: string; avatar?: string; rating: number };
      previousHost: string;
    }) => {
      if (data.roomCode !== roomCode) return;

      // Update room state with new host
      setRoom((prevRoom) => {
        if (!prevRoom) return prevRoom;
        return {
          ...prevRoom,
          host: data.newHost,
        };
      });

      if (data.newHost._id === user?._id) {
        toast.success("You are now the host!", {
          icon: "👑",
          duration: 5000,
        });
      } else {
        toast.info(`${data.newHost.handle} is now the host`, {
          icon: "👑",
          duration: 4000,
        });
      }
    };

    // Handle explicit player-left event (emitted when a player leaves the room)
    const handlePlayerLeft = (data: { userId: string; handle: string }) => {
      if (data.handle === user?.handle) return;
      toast.info(`${data.handle} left the room`, {
        icon: "🚪",
        duration: 3000,
      });
    };

    on<RoomUpdateData>("room-update", handleRoomUpdate);
    on<{ message: string }>("error", handleSocketError);
    on<{ roomCode: string }>("game-starting", handleGameStarting);
    on<{ userId: string; handle: string; gracePeriod: number }>(
      "player-disconnected",
      handlePlayerDisconnected,
    );
    on<{ userId: string; handle: string }>(
      "player-reconnected",
      handlePlayerReconnected,
    );
    on<{
      roomCode: string;
      newHost: { _id: string; handle: string; avatar?: string; rating: number };
      previousHost: string;
    }>("host-changed", handleHostChanged);
    on<{ userId: string; handle: string }>("player-left", handlePlayerLeft);

    return () => {
      console.log("[RoomPage] Cleaning up socket event listeners");
      off("room-update");
      off("error");
      off("game-starting");
      off("player-disconnected");
      off("player-reconnected");
      off("host-changed");
      off("player-left");
    };
  }, [
    socket,
    isConnected,
    on,
    off,
    handleRoomUpdate,
    handleSocketError,
    handleGameStarting,
    user?.handle,
  ]);

  // Join socket room when connected and room is loaded
  useEffect(() => {
    if (isConnected && room && !hasJoinedSocketRoom.current) {
      joinSocketRoom();
    }
  }, [isConnected, room, joinSocketRoom]);

  // Handle reconnection - rejoin socket room after reconnect
  useEffect(() => {
    if (!socket) return;

    const handleReconnect = () => {
      if (isMountedRef.current && room) {
        console.log("[RoomPage] Reconnected, rejoining room");
        hasJoinedSocketRoom.current = false;
        joinSocketRoom();
        // Refresh room data after reconnect
        fetchRoom();
      }
    };

    socket.on("connect", handleReconnect);

    return () => {
      socket.off("connect", handleReconnect);
    };
  }, [socket, room, joinSocketRoom, fetchRoom]);

  // Initialize previous participants when room first loads
  useEffect(() => {
    if (room?.participants && previousParticipantsRef.current.size === 0) {
      previousParticipantsRef.current = new Set(
        room.participants.map((p) => p.handle),
      );
    }
  }, [room?.participants]);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      // Don't emit leave-room if tab is closing (grace period handles it)
      if (isTabClosingRef.current) return;
      // When navigating away via browser buttons, clean up socket room
      if (hasJoinedSocketRoom.current && socket?.connected) {
        console.log("[RoomPage] Browser navigation detected, cleaning up");
        emit("leave-room", { roomCode });
        untrackRoom(roomCode);
        hasJoinedSocketRoom.current = false;
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [socket, emit, roomCode, untrackRoom]);

  // Cleanup on unmount - only emit leave-room for intentional SPA navigation
  useEffect(() => {
    isMountedRef.current = true;

    // Track tab closing to skip leave-room on unmount
    const handleBeforeUnload = () => {
      isTabClosingRef.current = true;
    };
    const handleFocus = () => {
      isTabClosingRef.current = false;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("focus", handleFocus);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("focus", handleFocus);
      // Untrack room from reconnect tracking
      untrackRoom(roomCode);

      // Don't emit leave-room if:
      // 1. Tab is closing (server grace period handles disconnect)
      // 2. Navigating to game page (game is starting)
      if (isTabClosingRef.current || navigatingToGameRef.current) {
        return;
      }

      // Only emit leave-room for intentional SPA navigation away
      if (hasJoinedSocketRoom.current && socket?.connected) {
        console.log(
          "[RoomPage] Component unmounting (SPA navigation), emitting leave-room",
        );
        emit("leave-room", { roomCode });
        hasJoinedSocketRoom.current = false;
      }
    };
  }, [emit, roomCode, socket, untrackRoom]);

  useEffect(() => {
    // Don't do anything while auth is still loading
    if (authLoading) return;

    // If auth finished loading and no user, redirect to login
    if (!user) {
      toast.error("Please login first");
      router.push("/");
      return;
    }

    // User is authenticated, fetch/join the room
    joinAndFetchRoom();
  }, [authLoading, user, joinAndFetchRoom, router]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    toast.success("Room code copied to clipboard!");
  };

  const handleSaveSettings = async () => {
    if (!isHost || saveSettingsState.isLoading) return;

    await saveSettingsState.withLoading(async () => {
      try {
        const updatedRoom = await updateRoomSettings(roomCode, settings);
        setRoom(updatedRoom);
        toast.success("Settings saved!");
      } catch (error) {
        console.error("Error saving settings:", error);
        if (error instanceof ApiError) {
          if (error.isUnauthorized) {
            toast.error("Please login first");
            router.push("/");
            return;
          }
          toast.error(error.message);
        } else {
          toast.error("Failed to save settings");
        }
      }
    });
  };

  const handleStartGame = async () => {
    if (!isHost || isStartingGame) return;
    if (!isConnected) {
      toast.error("Not connected to server. Please wait...");
      return;
    }
    if (!room || room.participants.length < 2) {
      toast.error("You cannot start the game with less than 2 players");
      return;
    }

    setIsStartingGame(true);

    try {
      // Auto-save current settings to DB before starting the game
      // This ensures the game uses the settings visible on screen
      console.log("[RoomPage] Auto-saving settings before starting game:", settings);
      await updateRoomSettings(roomCode, settings);
      console.log("[RoomPage] Settings saved successfully");

      // Emit socket event to start game
      // The GameContext will handle the 'game-started' event and navigate
      console.log("[RoomPage] Emitting start-game event for room:", roomCode);
      emit("start-game", { roomCode });

      // The response will come through the 'game-started' socket event
      // which is handled by GameContext and will navigate to /game/[code]
      toast.success("Starting game...");
    } catch (error) {
      console.error("Error starting game:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to start game",
      );
      setIsStartingGame(false);
      setIsGameStarting(false);
    }
  };

  const handleExitRoom = async () => {
    if (exitRoomState.isLoading) return;

    await exitRoomState.withLoading(async () => {
      try {
        // Mark that we're intentionally leaving (not disconnecting)
        hasJoinedSocketRoom.current = false;
        untrackRoom(roomCode);

        // HTTP call will remove from DB and emit socket update to others
        await leaveRoom(roomCode);
        toast.success("Left the room");
        router.push("/");
      } catch (error) {
        console.error("Error leaving room:", error);
        if (error instanceof ApiError) {
          toast.error(error.message);
        } else {
          toast.error("Failed to leave room");
        }
        // Restore socket room tracking on failure
        trackRoom(roomCode);
        hasJoinedSocketRoom.current = true;
      }
    });
  };

  if (authLoading || isLoading) {
    return (
      <div
        className={`min-h-screen bg-[#FDF5E6] flex items-center justify-center ${playfair.className}`}
      >
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#60100B]" />
          <p className="text-[#1A1A1A]">Loading room...</p>
        </div>
      </div>
    );
  }

  // Show not found page if room doesn't exist
  if (roomNotFound) {
    return <RoomNotFound />;
  }

  if (!room) {
    return null;
  }

  return (
    <div
      className={`min-h-screen relative p-6 overflow-x-hidden ${playfair.className}`}
      style={{
        backgroundImage: "url('/roombackground.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="absolute inset-0 bg-black/10 pointer-events-none" />

      {/* Reconnecting Banner */}
      <div className="relative z-10">
        <ReconnectingBanner
          isConnected={isConnected}
          isReconnecting={isReconnecting}
          reconnectAttempt={reconnectAttempt}
          maxAttempts={15}
        />
      </div>

      {/* Game Starting Overlay - Shows for all participants */}
      {(isStartingGame || isGameStarting) && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-6">
            {/* Animated icon */}
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-[#00A86B]/20 animate-ping" />
              <div className="relative bg-[#00A86B]/10 backdrop-blur border border-[#00A86B]/30 rounded-full p-6">
                <Swords className="h-12 w-12 text-[#00A86B] animate-pulse" />
              </div>
            </div>

            {/* Loading spinner */}
            <Loader2 className="h-8 w-8 animate-spin text-[#FDF5E6]" />

            {/* Loading text */}
            <div className="text-center">
              <h2
                className={`text-4xl font-bold text-[#FDF5E6] mb-2 ${shojumaru.className}`}
              >
                Loading Problems...
              </h2>
              <p className="text-[#FDF5E6]/80 text-xl font-serif italic">
                Preparing the battle arena...
              </p>
            </div>

            {/* Animated dots */}
            <div className="flex gap-2">
              <div className="h-3 w-3 rounded-full bg-[#00A86B] animate-bounce [animation-delay:-0.3s]" />
              <div className="h-3 w-3 rounded-full bg-[#00A86B] animate-bounce [animation-delay:-0.15s]" />
              <div className="h-3 w-3 rounded-full bg-[#00A86B] animate-bounce" />
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="max-w-6xl mx-auto relative z-10 mt-16">
        <div className="mb-8 relative bg-linear-to-br from-[#FDF5E6] via-[#F5E6CC] to-[#E8D4A8] border-[6px] border-double border-[#8B4513] rounded-lg shadow-2xl p-6">
          {/* Decorative corner elements */}
          <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-[#B8860B] -translate-x-1 -translate-y-1 rounded-tl-lg"></div>
          <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-[#B8860B] translate-x-1 -translate-y-1 rounded-tr-lg"></div>
          <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-[#B8860B] -translate-x-1 translate-y-1 rounded-bl-lg"></div>
          <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-[#B8860B] translate-x-1 translate-y-1 rounded-br-lg"></div>
          
          {/* Inner red accent border */}
          <div className="absolute inset-3 border-2 border-[#DC143C]/20 rounded pointer-events-none"></div>
          
          <div className="flex items-center justify-between gap-4 flex-nowrap relative z-10">
            {/* Left: Icon + Info */}
            <div className="flex items-center gap-3 min-w-0 shrink">
              <div className="p-2 bg-[#60100B] rounded-full shrink-0">
                <Flag className="h-6 w-6 text-[#FDF5E6]" />
              </div>
              <div className="min-w-0">
                <h1
                  className={`text-2xl font-bold text-[#1A1A1A] ${shojumaru.className} tracking-wide whitespace-nowrap`}
                >
                  Battle Room
                </h1>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-[#1A1A1A]/70 font-bold text-sm whitespace-nowrap">
                    Room ID:
                  </span>
                  <Badge
                    variant="secondary"
                    className="bg-[#1A1A1A] text-[#FDF5E6] font-mono text-sm px-2 py-0.5 border border-[#60100B]"
                  >
                    {roomCode}
                  </Badge>
                  <button
                    onClick={handleCopyCode}
                    className="text-[#60100B] hover:text-[#00A86B] transition-colors p-0.5 ml-1"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <div className="flex items-center gap-1 text-[#1A1A1A] whitespace-nowrap ml-2">
                    <Users className="h-4 w-4 text-[#60100B]" />
                    <span className="text-sm font-extrabold">
                      {room.participants.length} Warriors
                    </span>
                  </div>
                  {/* Connection Status Indicator */}
                  <div
                    className={`flex items-center gap-1 whitespace-nowrap ml-2 ${isConnected ? "text-[#00A86B]" : "text-[#B22222]"}`}
                  >
                    <div
                      className={`h-2 w-2 rounded-full shrink-0 ${isConnected ? "bg-[#00A86B]" : "bg-[#B22222] animate-pulse"}`}
                    />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      {isConnected ? "Connected" : "Connecting..."}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Buttons */}
            <div className="flex items-center gap-3 shrink-0">
              {isHost && (
                <Button
                  onClick={handleStartGame}
                  disabled={isStartingGame || !isConnected || isReconnecting}
                  className={`
                    relative overflow-hidden group
                    bg-linear-to-br from-[#00A86B] to-[#00704A] 
                    hover:from-[#00C07F] hover:to-[#008F5E]
                    text-white border-2 border-[#005C3E]
                    px-5 py-3 rounded-lg shadow-[0_3px_0_#005C3E]
                    active:shadow-none active:translate-y-1
                    transition-all duration-150
                    ${shojumaru.className} text-base tracking-widest
                  `}
                >
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 transform skew-y-12" />
                  {isStartingGame ? (
                    <div className="flex items-center gap-2 relative z-10">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Igniting Chi...</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 relative z-10 drop-shadow-md">
                      <Play className="h-4 w-4 fill-current" />
                      <span>START DUEL</span>
                    </div>
                  )}
                </Button>
              )}
              <Button
                onClick={handleExitRoom}
                disabled={exitRoomState.isLoading}
                variant="outline"
                className={`
                  bg-[#FDF5E6] text-[#B22222] 
                  border-2 border-[#B22222] 
                  hover:bg-[#B22222] hover:text-[#FDF5E6]
                  px-4 py-3 rounded-lg
                  shadow-[0_3px_0_#800000]
                  active:shadow-none active:translate-y-1
                  transition-all duration-150
                  ${shojumaru.className}
                  text-base
                `}
              >
                {exitRoomState.isLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Retreating...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <LogOut className="h-4 w-4" />
                    <span>RETREAT</span>
                  </div>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid md:grid-cols-2 gap-8 pt-3">
          {/* Participants Section */}
          <div className="pt-2 px-6 pb-6 relative">
            <div className="flex items-center gap-3 mb-4 pb-2">
              <Users className="h-6 w-6 text-[#1A1A1A]" />
              <h2
                className={`text-2xl font-bold text-[#1A1A1A] ${shojumaru.className}`}
              >
                Warriors
              </h2>
            </div>

            <div className="flex flex-col gap-3">
              {room.participants.map((participant) => (
                <div
                  key={participant._id || participant.handle}
                  className="flex items-center justify-between bg-[#F5E6CC]/80 border border-[#60100B]/20 rounded-lg p-3 hover:bg-[#F5E6CC] transition-colors shadow-sm"
                >
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <Avatar className="h-12 w-12 border-2 border-[#60100B]">
                        <AvatarImage
                          src={
                            participant.avatar ||
                            `https://userpic.codeforces.org/no-avatar.jpg`
                          }
                          alt={participant.handle}
                        />
                        <AvatarFallback className="bg-[#60100B] text-[#FDF5E6] font-serif">
                          {participant.handle.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {room.host.handle === participant.handle && (
                        <div className="absolute -top-3 -right-3 bg-white p-0.5 rounded-full shadow-xs">
                          <Scroll className="h-5 w-5 text-[#FFD700] fill-[#FFD700]" />
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#1A1A1A] text-lg">
                          {participant.handle}
                        </span>
                        {room.host.handle === participant.handle && (
                          <span className="text-[#B22222] text-xs font-bold border border-[#B22222] px-1.5 rounded-sm">
                            MASTER
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[#60100B]/80 text-sm">
                        <Sparkles className="h-3 w-3" />
                        <span className="font-extrabold">Rating: {participant.rating}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Room Settings Section - Ancient Scroll Style */}
          <div className="relative">
            {/* Scroll Container with rolled edges effect */}
            <div className="relative bg-linear-to-br from-[#D4A574] via-[#E8D4A8] to-[#C9A875] rounded-2xl shadow-2xl overflow-hidden border-4 border-[#8B6914]">
              {/* Top scroll rod */}
              <div className="absolute -top-3 left-0 right-0 h-6 bg-linear-to-r from-[#654321] via-[#8B6914] to-[#654321] rounded-full shadow-lg border-2 border-[#3e2723]"></div>
              
              {/* Bottom scroll rod */}
              <div className="absolute -bottom-3 left-0 right-0 h-6 bg-linear-to-r from-[#654321] via-[#8B6914] to-[#654321] rounded-full shadow-lg border-2 border-[#3e2723]"></div>
              
              {/* Left scroll edge shadow */}
              <div className="absolute left-0 top-6 bottom-6 w-4 bg-linear-to-r from-black/20 to-transparent pointer-events-none"></div>
              
              {/* Right scroll edge shadow */}
              <div className="absolute right-0 top-6 bottom-6 w-4 bg-linear-to-l from-black/20 to-transparent pointer-events-none"></div>
              
              {/* Decorative corner seals */}
              <div className="absolute top-8 left-8 w-8 h-8 bg-[#DC143C] rounded-full border-2 border-[#8B0000] opacity-80 shadow-lg"></div>
              <div className="absolute top-8 right-8 w-8 h-8 bg-[#DC143C] rounded-full border-2 border-[#8B0000] opacity-80 shadow-lg"></div>
              
              {/* Paper texture overlay */}
              <div className="absolute inset-0 opacity-30 pointer-events-none" style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%238B4513' fill-opacity='0.1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
              }}></div>
              
              {/* Content area with padding to avoid scroll rods */}
              <div className="relative pt-8 px-8 pb-8 mt-4 mb-4">
                {/* Decorative top border pattern */}
                <div className="absolute top-0 left-8 right-8 h-1 bg-linear-to-r from-transparent via-[#8B0000] to-transparent opacity-50"></div>
                
                <div className="flex items-center gap-3 mb-6 justify-center">
                  {/* <Scroll className="h-7 w-7 text-[#8B0000]" /> */}
                  <h2
                    className={`text-3xl font-bold text-[#3e2723] ${shojumaru.className} drop-shadow-md`}
                    style={{
                      textShadow: '2px 2px 4px rgba(139,0,0,0.3)'
                    }}
                  >
                    竜 Scroll of Rules 竜
                  </h2>
                  {/* <Scroll className="h-7 w-7 text-[#8B0000]" /> */}
                </div>

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label
                    className={`block text-lg text-[#3e2723] mb-3 ${shojumaru.className} flex items-center gap-2`}
                  >
                    <span className="text-xl">☯</span>
                    Min Chi
                  </label>
                  <Select
                    value={settings.minRating.toString()}
                    onValueChange={(value) =>
                      setSettings({ ...settings, minRating: parseInt(value) })
                    }
                    disabled={!isHost}
                  >
                    <SelectTrigger
                      className={`border-3 border-[#8B6914] bg-[#F5DEB3] text-[#3e2723] font-extrabold text-lg h-12 shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] ${!isHost ? "opacity-60 cursor-not-allowed" : "hover:border-[#654321] hover:shadow-[inset_0_3px_6px_rgba(0,0,0,0.3)]"}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#F5DEB3] border-3 border-[#8B6914] text-[#3e2723] font-bold">
                      {[
                        800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600,
                        1700, 1800,
                      ].map((rating) => (
                        <SelectItem
                          key={rating}
                          value={rating.toString()}
                          className="focus:bg-[#8B6914]/30 focus:text-[#3e2723] font-bold"
                        >
                          {rating}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label
                    className={`block text-lg text-[#3e2723] mb-3 ${shojumaru.className} flex items-center gap-2`}
                  >
                    <span className="text-xl">☯</span>
                    Max Chi
                  </label>
                  <Select
                    value={settings.maxRating.toString()}
                    onValueChange={(value) =>
                      setSettings({ ...settings, maxRating: parseInt(value) })
                    }
                    disabled={!isHost}
                  >
                    <SelectTrigger
                      className={`border-3 border-[#8B6914] bg-[#F5DEB3] text-[#3e2723] font-extrabold text-lg h-12 shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] ${!isHost ? "opacity-60 cursor-not-allowed" : "hover:border-[#654321] hover:shadow-[inset_0_3px_6px_rgba(0,0,0,0.3)]"}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#F5DEB3] border-3 border-[#8B6914] text-[#3e2723] font-bold">
                      {[
                        1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800,
                        1900, 2000,
                      ].map((rating) => (
                        <SelectItem
                          key={rating}
                          value={rating.toString()}
                          className="focus:bg-[#8B6914]/30 focus:text-[#3e2723] font-bold"
                        >
                          {rating}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label
                    className={`block text-lg text-[#3e2723] mb-3 ${shojumaru.className} flex items-center gap-2`}
                  >
                    <span className="text-xl">📜</span>
                    Challenges
                  </label>
                  <div className="flex items-center h-12 px-4 rounded-md border-3 border-[#8B6914] bg-linear-to-br from-[#DEB887] to-[#D2B48C] text-[#3e2723] font-bold shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_2px_8px_rgba(0,0,0,0.3)] font-mono text-center justify-center transform -rotate-1 text-lg">
                    2 Slips
                  </div>
                </div>

                <div>
                  <label
                    className={`block text-lg text-[#3e2723] mb-3 ${shojumaru.className} flex items-center gap-2`}
                  >
                    <span className="text-xl">⏰</span>
                    Time Limit
                  </label>
                  <div className="flex items-center h-12 px-4 rounded-md border-3 border-[#8B6914] bg-linear-to-br from-[#DEB887] to-[#D2B48C] text-[#3e2723] font-bold shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_2px_8px_rgba(0,0,0,0.3)] font-mono text-center justify-center transform rotate-1 text-lg">
                    15 Minutes
                  </div>
                </div>
              </div>

              {isHost && (
                <Button
                  onClick={handleSaveSettings}
                  disabled={saveSettingsState.isLoading}
                  className={`
                    w-full mt-6
                    bg-linear-to-r from-[#2D5A27] via-[#1f421b] to-[#2D5A27]
                    hover:from-[#1f421b] hover:via-[#2D5A27] hover:to-[#1f421b]
                    text-[#FDF5E6] border-2 border-[#8B6914]
                    ${shojumaru.className} tracking-widest text-lg py-6
                    shadow-[0_6px_0_#1a3015,0_8px_20px_rgba(0,0,0,0.4)]
                    hover:shadow-[0_4px_0_#1a3015,0_6px_20px_rgba(0,0,0,0.5)]
                    active:shadow-[0_2px_0_#1a3015,0_3px_10px_rgba(0,0,0,0.3)]
                    active:translate-y-1
                    transition-all duration-150
                    rounded-lg
                    relative overflow-hidden
                    group
                  `}
                >
                  {/* Button shine effect */}
                  <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
                  
                  {saveSettingsState.isLoading ? (
                    <div className="flex items-center justify-center gap-2 relative z-10">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Inscribing Sacred Text...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-3 relative z-10">
                      <span className="text-2xl">🔥</span>
                      <span>SEAL THE SCROLL</span>
                      <span className="text-2xl">🔥</span>
                    </div>
                  )}
                </Button>
              )}
              
              {/* Decorative bottom border pattern */}
              <div className="absolute bottom-6 left-8 right-8 h-1 bg-linear-to-r from-transparent via-[#8B0000] to-transparent opacity-50"></div>
            </div>
            </div>
            
            {/* Hanging scroll tassels */}
            <div className="absolute -bottom-8 left-1/2 transform -translate-x-12 flex gap-4">
              <div className="w-2 h-16 bg-linear-to-b from-[#DC143C] to-[#8B0000] rounded-full shadow-lg"></div>
              <div className="w-2 h-20 bg-linear-to-b from-[#DC143C] to-[#8B0000] rounded-full shadow-lg"></div>
            </div>
            <div className="absolute -bottom-8 right-1/2 transform translate-x-12 flex gap-4">
              <div className="w-2 h-20 bg-linear-to-b from-[#DC143C] to-[#8B0000] rounded-full shadow-lg"></div>
              <div className="w-2 h-16 bg-linear-to-b from-[#DC143C] to-[#8B0000] rounded-full shadow-lg"></div>
            </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
