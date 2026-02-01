"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import Card from "../components/Card";
import { useAuth } from "@/context/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createRoom, joinRoom } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [loginHandle, setLoginHandle] = useState("");
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const { user, isLoading, login, logout } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!loginHandle.trim()) {
      toast.error("Please enter a Codeforces username");
      return;
    }

    setIsLoginLoading(true);
    try {
      await login(loginHandle.trim());
      toast.success("Login successful!");
      setIsDialogOpen(false);
      setLoginHandle("");
    } catch (error) {
      toast.error("Wrong username");
      
    } finally {
      setIsLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    toast.success("Logged out successfully");
  };

  const handleCreateRoom = async () => {
    if (!user) {
      toast.error("Please login first");
      setIsDialogOpen(true);
      return;
    }

    setIsCreatingRoom(true);
    try {
      const response = await createRoom({
        minRating: 800,
        maxRating: 1300,
        questionCount: 3,
        duration: 30,
      });
      
      toast.success("Room created! Redirecting...");
      router.push(`/room/${response.code}`);
    } catch (error) {
      console.error("Error creating room:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create room");
      setIsCreatingRoom(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!user) {
      toast.error("Please login first");
      setIsDialogOpen(true);
      return;
    }

    if (!roomCode.trim()) {
      toast.error("Please enter a room code");
      return;
    }

    setIsJoiningRoom(true);
    try {
      await joinRoom(roomCode.trim().toUpperCase());
      toast.success("Joined room successfully!");
      router.push(`/room/${roomCode.trim().toUpperCase()}`);
    } catch (error) {
      console.error("Error joining room:", error);
      toast.error(error instanceof Error ? error.message : "Room not found");
      setIsJoiningRoom(false);
    }
  };

  if (isCreatingRoom) {
    return (
      <div className="min-h-screen bg-linear-to-br from-black via-neutral-900 to-black text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
          <p className="text-gray-400">Creating room and redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-black via-neutral-900 to-black text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 md:px-10">
        <div className="w-24" /> {/* Spacer for centering */}
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          Takedown
        </h1>
        <div className="w-24 flex justify-end">
          {isLoading ? (
            <div className="flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : user ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-lg border border-white/20">
                <Avatar size="sm">
                  <AvatarImage 
                    src={user.avatar || `https://userpic.codeforces.org/no-avatar.jpg`} 
                    alt={user.handle} 
                  />
                  <AvatarFallback className="text-xs bg-gray-700 text-white">
                    {user.handle.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium text-gray-200">{user.handle}</span>
              </div>
              <button
                onClick={handleLogout}
                className="text-xs text-gray-400 hover:text-white transition-colors"
              >
                Logout
              </button>
            </div>
          ) : (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <button className="px-4 py-2 text-sm font-medium bg-white text-black rounded-lg hover:bg-gray-200 transition-colors">
                  Login
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md bg-neutral-900 border-neutral-800">
                <DialogHeader>
                  <DialogTitle className="text-white">Login</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Enter your Codeforces username to continue
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleLogin} className="space-y-4 mt-4">
                  <Input
                    type="text"
                    placeholder="Codeforces username"
                    value={loginHandle}
                    onChange={(e) => setLoginHandle(e.target.value)}
                    className="bg-white/10 border-white/20 text-white placeholder:text-gray-500 focus-visible:ring-white/30 focus-visible:border-white/40"
                    disabled={isLoginLoading}
                  />
                  <Button
                    type="submit"
                    className="w-full bg-white text-black hover:bg-gray-200"
                    disabled={isLoginLoading}
                  >
                    {isLoginLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Logging in...
                      </>
                    ) : (
                      "Submit"
                    )}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-col items-center px-6 py-12 md:py-20">
        {/* Room Cards */}
        <div className="flex flex-col md:flex-row gap-6 w-full max-w-4xl mb-10">
          {/* Create Room Card */}
          <Card className="flex-1 p-8 flex flex-col items-center justify-center text-center">
            <h2 className="text-xl font-semibold mb-4 text-gray-100">
              Create a Room
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              Start a new coding duel and invite your opponent
            </p>
            <button 
              onClick={handleCreateRoom}
              disabled={isCreatingRoom}
              className="w-full px-6 py-3 bg-white text-black font-medium rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreatingRoom ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </span>
              ) : (
                "Create Room"
              )}
            </button>
          </Card>

          {/* Join Room Card */}
          <Card className="flex-1 p-8 flex flex-col items-center justify-center text-center">
            <h2 className="text-xl font-semibold mb-4 text-gray-100">
              Join a Room
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              Enter a room code to join an existing duel
            </p>
            <div className="w-full flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="Enter room code"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
                className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/40 transition-colors uppercase"
                maxLength={6}
              />
              <button 
                onClick={handleJoinRoom}
                disabled={isJoiningRoom}
                className="px-6 py-3 bg-white text-black font-medium rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isJoiningRoom ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Joining...
                  </span>
                ) : (
                  "Join Room"
                )}
              </button>
            </div>
          </Card>
        </div>

        
      </main>
    </div>
  );
}
