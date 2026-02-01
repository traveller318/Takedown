"use client";

import { useEffect, useState, useCallback } from "react";
import { Clock } from "lucide-react";
import { useSocket } from "@/hooks/useSocket";

interface GameTimerProps {
  startTime: string | null;
  duration: number; // in minutes
  onTimeUp?: () => void;
}

interface TimerSyncData {
  serverTime: number;
  remainingSeconds: number;
}

export function GameTimer({ startTime, duration, onTimeUp }: GameTimerProps) {
  const { socket, isConnected, on, off } = useSocket();
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  // Calculate time remaining from startTime and duration
  const calculateTimeRemaining = useCallback(() => {
    if (!startTime || !duration) return 0;
    
    const start = new Date(startTime).getTime();
    const end = start + duration * 60 * 1000; // duration is in minutes
    const now = Date.now();
    const remaining = Math.max(0, end - now);
    return Math.floor(remaining / 1000); // Convert to seconds
  }, [startTime, duration]);

  // Initialize and update timer
  useEffect(() => {
    if (!startTime || !duration) return;

    setTimeRemaining(calculateTimeRemaining());

    const interval = setInterval(() => {
      const remaining = calculateTimeRemaining();
      setTimeRemaining(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        onTimeUp?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, duration, calculateTimeRemaining, onTimeUp]);

  // Listen for timer-sync events from server to stay in sync
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleTimerSync = (data: TimerSyncData) => {
      console.log("[GameTimer] Timer sync received:", data);
      // Sync with server time if there's significant drift (> 2 seconds)
      const calculatedRemaining = calculateTimeRemaining();
      const drift = Math.abs(calculatedRemaining - data.remainingSeconds);
      
      if (drift > 2) {
        console.log(`[GameTimer] Syncing timer - drift was ${drift}s`);
        setTimeRemaining(data.remainingSeconds);
      }
    };

    on<TimerSyncData>("timer-sync", handleTimerSync);

    return () => {
      off("timer-sync");
    };
  }, [socket, isConnected, on, off, calculateTimeRemaining]);

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Determine color based on time remaining
  const getTimerColor = () => {
    if (timeRemaining < 60) return "text-red-500"; // < 1 minute - red
    if (timeRemaining < 300) return "text-yellow-400"; // < 5 minutes - yellow
    return "text-white"; // normal
  };

  const getBorderColor = () => {
    if (timeRemaining < 60) return "border-red-500/50";
    if (timeRemaining < 300) return "border-yellow-400/50";
    return "border-white/10";
  };

  const getBackgroundColor = () => {
    if (timeRemaining < 60) return "bg-red-500/10";
    if (timeRemaining < 300) return "bg-yellow-400/10";
    return "bg-white/5";
  };

  return (
    <div
      className={`flex items-center gap-3 ${getBackgroundColor()} border ${getBorderColor()} rounded-xl px-6 py-3 transition-colors duration-300`}
    >
      <Clock className={`h-5 w-5 ${timeRemaining < 300 ? getTimerColor() : "text-gray-400"}`} />
      <span className={`text-2xl font-mono font-bold ${getTimerColor()} transition-colors duration-300`}>
        {formatTime(timeRemaining)}
      </span>
    </div>
  );
}
