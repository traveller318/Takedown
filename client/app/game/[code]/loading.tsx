"use client";

import { Loader2, Swords } from "lucide-react";

export default function GameLoading() {
  return (
    <div className="min-h-screen bg-linear-to-br from-black via-neutral-900 to-black flex items-center justify-center">
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
          <h2 className="text-2xl font-bold text-white mb-2">Loading Problems...</h2>
          <p className="text-gray-400">Preparing your battle arena</p>
        </div>

        {/* Animated dots */}
        <div className="flex gap-2">
          <div className="h-2 w-2 rounded-full bg-white/60 animate-bounce [animation-delay:-0.3s]" />
          <div className="h-2 w-2 rounded-full bg-white/60 animate-bounce [animation-delay:-0.15s]" />
          <div className="h-2 w-2 rounded-full bg-white/60 animate-bounce" />
        </div>
      </div>
    </div>
  );
}
