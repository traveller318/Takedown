"use client";

import { useEffect, useState, useCallback } from "react";
import { ExternalLink, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Problem } from "@/types";

interface ProblemCardProps {
  problem: Problem;
  index: number;
  isSolved: boolean;
  earnedPoints?: number;
  isChecking: boolean;
  isConnected: boolean;
  isGameEnded?: boolean;
  startTime: string | null;
  onCheck: (problem: Problem) => void;
}

export function ProblemCard({
  problem,
  index,
  isSolved,
  earnedPoints,
  isChecking,
  isConnected,
  isGameEnded = false,
  startTime,
  onCheck,
}: ProblemCardProps) {
  const [currentPoints, setCurrentPoints] = useState(problem.basePoints);

  // Calculate current points based on elapsed time
  const calculateCurrentPoints = useCallback(() => {
    if (!startTime) return problem.basePoints;

    const start = new Date(startTime).getTime();
    const now = Date.now();
    const elapsedMinutes = Math.floor((now - start) / (1000 * 60));

    const points = Math.max(problem.basePoints - (elapsedMinutes * 5), problem.minPoints);
    return points;
  }, [startTime, problem.basePoints, problem.minPoints]);

  // Update points every second to catch minute changes accurately
  useEffect(() => {
    if (isSolved) return;

    setCurrentPoints(calculateCurrentPoints());

    const interval = setInterval(() => {
      setCurrentPoints(calculateCurrentPoints());
    }, 1000);

    return () => clearInterval(interval);
  }, [calculateCurrentPoints, isSolved]);

  // Open problem in Codeforces
  const openProblem = () => {
    const url = `https://codeforces.com/problemset/problem/${problem.contestId}/${problem.index}`;
    window.open(url, "_blank");
  };

  return (
    <div
      className={`kfp-card relative transition-all duration-300 ${
        isSolved
          ? "!bg-gradient-to-br !from-green-100/80 !to-green-200/70 !border-green-400/50 ring-2 ring-green-500/40 shadow-[0_0_20px_rgba(34,197,94,0.2)]"
          : "hover:shadow-[0_0_25px_rgba(255,182,193,0.3)]"
      }`}
    >
      {/* Solved Banner */}
      {isSolved && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          <div className="flex items-center gap-1.5 bg-green-100/70 border border-green-500/40 rounded-md px-2.5 py-1">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-sm font-kungfu tracking-wide text-green-700">Solved</span>
          </div>
        </div>
      )}

      {/* Problem content */}
      <div className="flex items-start gap-4">
        {/* Problem number - ornate circle */}
        <div
          className={`flex items-center justify-center w-12 h-12 rounded-full font-kungfu text-xl border-2 ${
            isSolved
              ? "bg-green-100/60 border-green-500/50 text-green-700"
              : "bg-pink-100/50 border-pink-400/60 text-pink-800"
          }`}
        >
          {index + 1}
        </div>

        <div className="flex-1 min-w-0">
          {/* Problem ID */}
          <div className="flex items-center gap-3 mb-3">
            <span className="font-kungfu text-xl tracking-wide text-pink-800">
              {problem.contestId}{problem.index}
            </span> 
          </div>

          {/* Points display */}
          <div className="mb-4">
            {isSolved ? (
              <div className="flex items-center gap-2">
                <span className="text-green-700 font-kungfu text-2xl tracking-wide">
                  +{earnedPoints || currentPoints}
                </span>
                <span className="text-pink-600/60 text-sm font-kungfu">points earned</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-pink-800 font-kungfu text-2xl tracking-wide">{currentPoints}</span>
                <span className="text-pink-600/60 text-sm font-kungfu">points</span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={openProblem}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-pink-100/60 border border-pink-400/50 text-pink-800 text-sm font-kungfu tracking-wide hover:bg-pink-200/60 transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              Open Problem
            </button>

            {!isSolved && (
              <button
                onClick={() => onCheck(problem)}
                disabled={isChecking || !isConnected || isGameEnded}
                className="flex items-center gap-2 px-4 py-1.5 rounded-md bg-green-600/80 border border-green-600/50 text-white text-sm font-kungfu tracking-wide hover:bg-green-700/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isChecking ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking...
                  </>
                ) : isGameEnded ? (
                  "Game Ended"
                ) : (
                  "Check"
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
