"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Flag, Users, Copy, Play, LogOut, Crown, WifiOff, Swords } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useGame } from "@/context/GameContext";
import { useSocket } from "@/hooks/useSocket";
import { getRoom, leaveRoom, updateRoomSettings, joinRoom } from "@/lib/api";
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

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { isGameStarting, setIsGameStarting } = useGame();
  const { socket, isConnected, emit, on, off } = useSocket();
  const roomCode = params.code as string;

  const [room, setRoom] = useState<Room | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isStartingGame, setIsStartingGame] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [settings, setSettings] = useState<RoomSettings>({
    minRating: 800,
    maxRating: 1300,
    questionCount: 3,
    duration: 30,
  });

  // Track previous participants to detect joins/leaves
  const previousParticipantsRef = useRef<Set<string>>(new Set());
  // Track if we've joined the socket room
  const hasJoinedSocketRoom = useRef(false);
  // Track if component is mounted for cleanup safety
  const isMountedRef = useRef(true);

  const isHost = room && user && room.host._id === user._id;

  const fetchRoom = useCallback(async (): Promise<boolean> => {
    try {
      const roomData = await getRoom(roomCode);
      setRoom(roomData);
      setSettings(roomData.settings);
      setIsLoading(false);
      return true;
    } catch {
      // Silently fail - room might not exist or user might not be a participant yet
      return false;
    }
  }, [roomCode]);

  // Auto-join room when page loads (handles refresh case)
  const joinAndFetchRoom = useCallback(async () => {
    try {
      // First try to fetch the room (user might already be a participant)
      const roomExists = await fetchRoom();
      if (roomExists) return;

      // If fetch failed, try to join the room first
      try {
        await joinRoom(roomCode);
      } catch {
        // Join might fail if room doesn't exist - that's handled below
      }
      
      // Try fetching again after join attempt
      const joined = await fetchRoom();
      if (!joined) {
        // Room truly doesn't exist
        toast.error("Room not found");
        router.push("/");
      }
    } catch {
      toast.error("Room not found");
      router.push("/");
    }
  }, [roomCode, router, fetchRoom]);

  // Join socket room
  const joinSocketRoom = useCallback(() => {
    if (!isConnected || !socket || hasJoinedSocketRoom.current) return;
    
    console.log("[RoomPage] Emitting join-room for:", roomCode);
    emit("join-room", { roomCode });
    hasJoinedSocketRoom.current = true;
  }, [isConnected, socket, roomCode, emit]);

  // Handle room-update events
  const handleRoomUpdate = useCallback((data: RoomUpdateData) => {
    if (!isMountedRef.current) return;
    if (data.roomCode !== roomCode) return;

    console.log("[RoomPage] Received room-update:", data);

    const currentHandles = new Set(data.participants.map(p => p.handle));
    const previousHandles = previousParticipantsRef.current;

    // Detect who joined
    currentHandles.forEach(handle => {
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

    // Detect who left
    previousHandles.forEach(handle => {
      if (!currentHandles.has(handle)) {
        // Don't show toast for the current user
        if (handle !== user?.handle) {
          toast.info(`${handle} left the room`, {
            icon: "👋",
            duration: 3000,
          });
        }
      }
    });

    // Update previous participants
    previousParticipantsRef.current = currentHandles;

    // Update room participants - convert socket format to Room format
    setRoom(prevRoom => {
      if (!prevRoom) return prevRoom;
      return {
        ...prevRoom,
        participants: data.participants.map(p => ({
          _id: p.id || p._id || p.handle, // Use handle as fallback identifier
          handle: p.handle,
          avatar: p.avatar,
          rating: p.rating,
        })),
      };
    });
  }, [roomCode, user?.handle]);

  // Handle socket error
  const handleSocketError = useCallback((data: { message: string }) => {
    console.error("[RoomPage] Socket error:", data.message);
    
    // Reset starting game state on error (both local and global)
    setIsStartingGame(false);
    setIsGameStarting(false);
    
    if (data.message.includes("Room not found") || data.message.includes("not found")) {
      toast.error("Room not found");
      router.push("/");
    } else {
      toast.error(data.message);
    }
  }, [router, setIsGameStarting]);

  // Handle game-starting event (show loading for all users immediately)
  const handleGameStarting = useCallback((data: { roomCode: string }) => {
    if (data.roomCode !== roomCode) return;
    console.log("[RoomPage] Game starting event received");
    setIsStartingGame(true);
    setIsGameStarting(true);
  }, [roomCode, setIsGameStarting]);

  // Set up socket event listeners
  useEffect(() => {
    if (!socket || !isConnected) return;

    console.log("[RoomPage] Setting up socket event listeners");
    
    on<RoomUpdateData>("room-update", handleRoomUpdate);
    on<{ message: string }>("error", handleSocketError);
    on<{ roomCode: string }>("game-starting", handleGameStarting);

    return () => {
      console.log("[RoomPage] Cleaning up socket event listeners");
      off("room-update");
      off("error");
      off("game-starting");
    };
  }, [socket, isConnected, on, off, handleRoomUpdate, handleSocketError, handleGameStarting]);

  // Join socket room when connected and room is loaded
  useEffect(() => {
    if (isConnected && room && !hasJoinedSocketRoom.current) {
      joinSocketRoom();
    }
  }, [isConnected, room, joinSocketRoom]);

  // Handle reconnection state
  useEffect(() => {
    if (!socket) return;

    const handleDisconnect = () => {
      if (isMountedRef.current) {
        setIsReconnecting(true);
        hasJoinedSocketRoom.current = false;
      }
    };

    const handleReconnect = () => {
      if (isMountedRef.current) {
        setIsReconnecting(false);
        // Re-join room after reconnection
        if (room) {
          joinSocketRoom();
        }
      }
    };

    socket.on("disconnect", handleDisconnect);
    socket.on("connect", handleReconnect);

    return () => {
      socket.off("disconnect", handleDisconnect);
      socket.off("connect", handleReconnect);
    };
  }, [socket, room, joinSocketRoom]);

  // Initialize previous participants when room first loads
  useEffect(() => {
    if (room?.participants && previousParticipantsRef.current.size === 0) {
      previousParticipantsRef.current = new Set(room.participants.map(p => p.handle));
    }
  }, [room?.participants]);

  // Cleanup on unmount - only emit leave-room if we haven't already left
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      // Only emit leave-room if still considered in the room (e.g., browser close/refresh)
      // If user clicked Exit button, hasJoinedSocketRoom.current will be false
      if (hasJoinedSocketRoom.current && socket?.connected) {
        console.log("[RoomPage] Component unmounting, emitting leave-room");
        emit("leave-room", { roomCode });
        hasJoinedSocketRoom.current = false;
      }
    };
  }, [emit, roomCode, socket]);

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
    if (!isHost) return;
    
    setIsSaving(true);
    try {
      const updatedRoom = await updateRoomSettings(roomCode, settings);
      setRoom(updatedRoom);
      toast.success("Settings saved!");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartGame = async () => {
    if (!isHost) return;
    if (!isConnected) {
      toast.error("Not connected to server. Please wait...");
      return;
    }
    
    setIsStartingGame(true);
    
    try {
      // Emit socket event to start game
      // The GameContext will handle the 'game-started' event and navigate
      console.log("[RoomPage] Emitting start-game event for room:", roomCode);
      emit("start-game", { roomCode });
      
      // The response will come through the 'game-started' socket event
      // which is handled by GameContext and will navigate to /game/[code]
      toast.success("Starting game...");
    } catch (error) {
      console.error("Error starting game:", error);
      toast.error(error instanceof Error ? error.message : "Failed to start game");
      setIsStartingGame(false);
    }
  };

  const handleExitRoom = async () => {
    try {
      // Mark that we're intentionally leaving (not disconnecting)
      hasJoinedSocketRoom.current = false;
      
      // HTTP call will remove from DB and emit socket update to others
      await leaveRoom(roomCode);
      toast.success("Left the room");
      router.push("/");
    } catch (error) {
      console.error("Error leaving room:", error);
      toast.error("Failed to leave room");
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-black via-neutral-900 to-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
          <p className="text-gray-400">Loading room...</p>
        </div>
      </div>
    );
  }

  if (!room) {
    return null;
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-black via-neutral-900 to-black text-white p-6">
      {/* Game Starting Overlay - Shows for all participants */}
      {(isStartingGame || isGameStarting) && (
        <div className="fixed inset-0 z-100 bg-black/90 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-6">
            {/* Animated icon */}
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-white/10 animate-ping" />
              <div className="relative bg-white/5 backdrop-blur border border-white/10 rounded-full p-6">
                <Swords className="h-12 w-12 text-white animate-pulse" />
              </div>
            </div>

            {/* Loading spinner */}
            <Loader2 className="h-8 w-8 animate-spin text-white" />

            {/* Loading text */}
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white mb-2">Starting Game...</h2>
              <p className="text-gray-400">Fetching problems from Codeforces</p>
            </div>

            {/* Animated dots */}
            <div className="flex gap-2">
              <div className="h-2 w-2 rounded-full bg-white/60 animate-bounce [animation-delay:-0.3s]" />
              <div className="h-2 w-2 rounded-full bg-white/60 animate-bounce [animation-delay:-0.15s]" />
              <div className="h-2 w-2 rounded-full bg-white/60 animate-bounce" />
            </div>
          </div>
        </div>
      )}

      {/* Reconnecting Banner */}
      {isReconnecting && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-600/90 backdrop-blur text-white px-4 py-2">
          <div className="max-w-6xl mx-auto flex items-center justify-center gap-2">
            <WifiOff className="h-4 w-4" />
            <span className="text-sm font-medium">Connection lost. Reconnecting...</span>
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        </div>
      )}

      {/* Header */}
      <div className="max-w-6xl mx-auto">
        <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-6 mb-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Flag className="h-6 w-6 text-white" />
              <div>
                <h1 className="text-2xl font-bold">Codeforces Battle Room</h1>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-gray-400">Room ID:</span>
                  <Badge 
                    variant="secondary" 
                    className="bg-neutral-800 text-white font-mono text-sm px-3 py-1"
                  >
                    {roomCode}
                  </Badge>
                  <button
                    onClick={handleCopyCode}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <div className="flex items-center gap-1 text-gray-400">
                    <Users className="h-4 w-4" />
                    <span>{room.participants.length}</span>
                  </div>
                  {/* Connection Status Indicator */}
                  <div className={`flex items-center gap-1 ${isConnected ? 'text-green-400' : 'text-yellow-400'}`}>
                    <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'}`} />
                    <span className="text-xs">{isConnected ? 'Live' : 'Connecting...'}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {isHost && (
                <Button
                  onClick={handleStartGame}
                  disabled={isStartingGame || !isConnected}
                  className="bg-white hover:bg-gray-200 text-black gap-2"
                >
                  {isStartingGame ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Start Game
                    </>
                  )}
                </Button>
              )}
              <Button
                onClick={handleExitRoom}
                variant="outline"
                className="border-white/20 text-gray-300 hover:bg-white/10 hover:text-white gap-2"
              >
                <LogOut className="h-4 w-4" />
                Exit Room
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Participants Section */}
          <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-6">
              <Users className="h-5 w-5 text-gray-400" />
              <h2 className="text-xl font-semibold">Participants</h2>
            </div>

            <div className="flex flex-wrap gap-4">
              {room.participants.map((participant) => (
                <div
                  key={participant._id || participant.handle}
                  className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3 min-w-50"
                >
                  <div className="relative">
                    <Avatar className="h-10 w-10">
                      <AvatarImage
                        src={participant.avatar || `https://userpic.codeforces.org/no-avatar.jpg`}
                        alt={participant.handle}
                      />
                      <AvatarFallback className="bg-neutral-700 text-white text-sm">
                        {participant.handle.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {room.host.handle === participant.handle && (
                      <Crown className="h-4 w-4 text-yellow-400 absolute -top-1 -right-1" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{participant.handle}</span>
                      {room.host.handle === participant.handle && (
                        <Badge variant="secondary" className="bg-white/10 text-gray-300 text-xs">
                          ADMIN
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-400">
                      ⍟ {participant.rating}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Room Settings Section */}
          <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-6">
            <h2 className="text-xl font-semibold mb-6">Room Settings</h2>

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Minimum Rating
                  </label>
                  <Select
                    value={settings.minRating.toString()}
                    onValueChange={(value) =>
                      setSettings({ ...settings, minRating: parseInt(value) })
                    }
                    disabled={!isHost}
                  >
                    <SelectTrigger className={!isHost ? "opacity-60" : ""}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800].map(
                        (rating) => (
                          <SelectItem key={rating} value={rating.toString()}>
                            {rating}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Maximum Rating
                  </label>
                  <Select
                    value={settings.maxRating.toString()}
                    onValueChange={(value) =>
                      setSettings({ ...settings, maxRating: parseInt(value) })
                    }
                    disabled={!isHost}
                  >
                    <SelectTrigger className={!isHost ? "opacity-60" : ""}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000].map(
                        (rating) => (
                          <SelectItem key={rating} value={rating.toString()}>
                            {rating}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Number of Questions
                  </label>
                  <Select
                    value={settings.questionCount.toString()}
                    onValueChange={(value) =>
                      setSettings({ ...settings, questionCount: parseInt(value) })
                    }
                    disabled={!isHost}
                  >
                    <SelectTrigger className={!isHost ? "opacity-60" : ""}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[3, 4, 5, 6, 7, 8, 9, 10].map((count) => (
                        <SelectItem key={count} value={count.toString()}>
                          {count}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Duration (minutes)
                  </label>
                  <Select
                    value={settings.duration.toString()}
                    onValueChange={(value) =>
                      setSettings({ ...settings, duration: parseInt(value) })
                    }
                    disabled={!isHost}
                  >
                    <SelectTrigger className={!isHost ? "opacity-60" : ""}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[15, 30, 45, 60, 90, 120].map((duration) => (
                        <SelectItem key={duration} value={duration.toString()}>
                          {duration} min
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isHost && (
                <Button
                  onClick={handleSaveSettings}
                  disabled={isSaving}
                  className="w-full bg-neutral-700 hover:bg-neutral-600 text-white"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Settings"
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
