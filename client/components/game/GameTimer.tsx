"use client";

import { useEffect, useState, useCallback } from "react";
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

  const isUrgent = timeRemaining < 60;
  const isWarning = timeRemaining < 300 && !isUrgent;

  const getTimerColor = () => {
    if (isUrgent) return "text-red-700";
    if (isWarning) return "text-orange-700";
    return "text-pink-800";
  };

  return (
    <div
      className={`relative flex items-center gap-3 px-5 py-2.5 rounded-lg transition-all duration-300
        ${isUrgent 
          ? "bg-red-100/70 border-2 border-red-400/70 shadow-[0_0_20px_rgba(239,68,68,0.3)]" 
          : isWarning 
            ? "bg-orange-100/60 border-2 border-orange-400/50" 
            : "bg-pink-100/60 border-2 border-pink-300/60"
        }
      `}
    >
      <div className={`w-3 h-3 rounded-full ${isUrgent ? "bg-red-500 animate-pulse" : isWarning ? "bg-orange-500" : "bg-pink-500"}`} />
      <span className={`text-2xl font-kungfu tracking-widest ${getTimerColor()} transition-colors duration-300`}>
        {formatTime(timeRemaining)}
      </span>
    </div>
  );
}
