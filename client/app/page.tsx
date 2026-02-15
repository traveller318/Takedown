"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import Image from "next/image";
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
import { createRoom, joinRoom, ApiError } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [loginHandle, setLoginHandle] = useState("");
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const { user, isLoading, login, logout } = useAuth();
  
  // Refs to prevent double-clicks
  const isCreatingRef = useRef(false);
  const isJoiningRef = useRef(false);

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

    // Prevent double-click
    if (isCreatingRef.current || isCreatingRoom) return;
    isCreatingRef.current = true;
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
      if (error instanceof ApiError) {
        if (error.isUnauthorized) {
          toast.error("Please login first");
          setIsDialogOpen(true);
        } else {
          toast.error(error.message);
        }
      } else {
        toast.error(error instanceof Error ? error.message : "Failed to create room");
      }
      setIsCreatingRoom(false);
      isCreatingRef.current = false;
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

    // Prevent double-click
    if (isJoiningRef.current || isJoiningRoom) return;
    isJoiningRef.current = true;
    setIsJoiningRoom(true);

    try {
      await joinRoom(roomCode.trim().toUpperCase());
      toast.success("Joined room successfully!");
      router.push(`/room/${roomCode.trim().toUpperCase()}`);
    } catch (error) {
      console.error("Error joining room:", error);
      if (error instanceof ApiError) {
        if (error.isNotFound) {
          toast.error("Room not found. Please check the code and try again.");
        } else if (error.isUnauthorized) {
          toast.error("Please login first");
          setIsDialogOpen(true);
        } else {
          toast.error(error.message);
        }
      } else {
        toast.error(error instanceof Error ? error.message : "Failed to join room");
      }
      setIsJoiningRoom(false);
      isJoiningRef.current = false;
    }
  };
  if (isCreatingRoom) {
    return (
      <div className="h-screen w-screen fixed inset-0 text-white flex items-center justify-center overflow-hidden">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 min-w-full min-h-full w-auto h-auto object-cover z-0 scale-105"
        >
          <source src="/video.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-black/50 z-[1]" />
        <div className="flex flex-col items-center gap-4 z-10">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
          <p className="text-gray-300">Creating room and redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen fixed inset-0 text-white overflow-hidden">
      {/* Video Background */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 min-w-full min-h-full w-auto h-auto object-cover z-0 scale-105"
      >
        <source src="/video.mp4" type="video/mp4" />
      </video>
      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-black/50 z-[1]" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 md:px-10">
        <div className="w-24" /> {/* Spacer for centering */}
        <Image
          src="/logoimg.png"
          alt="Takedown"
          width={500}
          height={150}
          className="h-20 md:h-28 w-auto object-contain"
          priority
        />
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
                <button className="px-7 py-3 text-sm font-semibold bg-linear-to-b from-[#f5d78e] to-[#d4a843] text-[#3b2409] rounded-xl hover:from-[#f7e0a0] hover:to-[#dcb44e] hover:scale-105 transition-all duration-300 ease-out shadow-[0_2px_10px_rgba(212,168,67,0.3)]">
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
                    className="bg-[#f5d78e]/10 border-[#d4a843]/40 text-white placeholder:text-[#d4a843]/50 rounded-xl focus-visible:ring-[#d4a843]/30 focus-visible:border-[#d4a843]/60"
                    disabled={isLoginLoading}
                  />
                  <Button
                    type="submit"
                    className="w-full bg-linear-to-b from-[#f5d78e] to-[#d4a843] text-[#3b2409] font-semibold rounded-xl hover:from-[#f7e0a0] hover:to-[#dcb44e] hover:scale-[1.02] transition-all duration-300 ease-out shadow-[0_2px_10px_rgba(212,168,67,0.3)]"
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

      {/* Shifu - Extreme Left */}
      <div className="hidden lg:block fixed left-0 top-1/2 -translate-y-1/2 z-[2] pointer-events-none">
        <Image
          src="/shifu.png"
          alt="Shifu"
          width={550}
          height={750}
          className="h-[70vh] max-h-[800px] w-auto object-contain drop-shadow-2xl -translate-x-[13%]"
          priority
        />
      </div>

      {/* Tai Lung - Extreme Right */}
      <div className="hidden lg:block fixed right-0 top-1/2 -translate-y-1/2 z-[2] pointer-events-none">
        <Image
          src="/tailung.png"
          alt="Tai Lung"
          width={450}
          height={650}
          className="h-[60vh] max-h-[700px] w-auto object-contain drop-shadow-2xl translate-x-[13%]"
          priority
        />
      </div>

      {/* Main Content */}
      <main className="relative z-10 flex flex-col items-center px-6 py-12 md:py-20">
        {/* Room Cards */}
        <div className="flex flex-col md:flex-row gap-6 w-full max-w-3xl mb-10 md:mr-10">
          {/* Create Room Card */}
          <div className="flex-1 relative overflow-hidden rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.4)] border border-[#d4a843]/30 group">
            <div 
              className="absolute inset-0 bg-cover bg-center opacity-30"
              style={{ backgroundImage: "url('/doodle.png')" }}
            />
            <div className="absolute inset-0 bg-linear-to-b from-[#1a1207]/80 via-[#1a1207]/70 to-[#1a1207]/85" />
            <div className="relative z-10 p-6 flex flex-col items-center justify-center text-center">
              <h2 className="text-xl font-semibold mb-4 text-[#f5d78e]">
                Create a Room
              </h2>
              <p className="text-[#d4a843]/70 text-sm mb-6">
                Start a new coding duel and invite your opponent
              </p>
              <button 
                onClick={handleCreateRoom}
                disabled={isCreatingRoom}
                className="w-full px-6 py-3 bg-linear-to-b from-[#f5d78e] to-[#d4a843] text-[#3b2409] font-semibold rounded-xl hover:from-[#f7e0a0] hover:to-[#dcb44e] hover:scale-[1.02] transition-all duration-300 ease-out shadow-[0_2px_12px_rgba(212,168,67,0.25)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
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
            </div>
          </div>

          {/* Join Room Card */}
          <div className="flex-1 relative overflow-hidden rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.4)] border border-[#d4a843]/30 group">
            <div 
              className="absolute inset-0 bg-cover bg-center opacity-30"
              style={{ backgroundImage: "url('/doodle.png')" }}
            />
            <div className="absolute inset-0 bg-linear-to-b from-[#1a1207]/80 via-[#1a1207]/70 to-[#1a1207]/85" />
            <div className="relative z-10 p-6 flex flex-col items-center justify-center text-center">
              <h2 className="text-xl font-semibold mb-4 text-[#f5d78e]">
                Join a Room
              </h2>
              <p className="text-[#d4a843]/70 text-sm mb-6">
                Enter a room code to join an existing duel
              </p>
              <div className="w-full flex flex-col gap-3">
                <input
                  type="text"
                  placeholder="Enter room code"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
                  className="w-full px-4 py-3 bg-[#f5d78e]/10 border border-[#d4a843]/30 rounded-xl text-[#f5d78e] placeholder-[#d4a843]/40 focus:outline-none focus:border-[#d4a843]/60 focus:shadow-[0_0_8px_rgba(212,168,67,0.15)] transition-all duration-300 uppercase"
                  maxLength={6}
                />
                <button 
                  onClick={handleJoinRoom}
                  disabled={isJoiningRoom}
                  className="w-full px-6 py-3 bg-linear-to-b from-[#f5d78e] to-[#d4a843] text-[#3b2409] font-semibold rounded-xl hover:from-[#f7e0a0] hover:to-[#dcb44e] hover:scale-[1.02] transition-all duration-300 ease-out shadow-[0_2px_12px_rgba(212,168,67,0.25)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
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
            </div>
          </div>
        </div>

        
      </main>
    </div>
  );
}
