"use client";

import { useEffect, useState, useCallback } from "react";
import { ExternalLink, CheckCircle2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

    // Points decrease by 1 for each minute elapsed, but never below minPoints
    const points = Math.max(problem.basePoints - elapsedMinutes, problem.minPoints);
    return points;
  }, [startTime, problem.basePoints, problem.minPoints]);

  // Update points every second to catch minute changes accurately
  useEffect(() => {
    if (isSolved) return; // Don't update if already solved

    // Initial calculation
    setCurrentPoints(calculateCurrentPoints());

    // Update every second to catch minute boundaries accurately
    const interval = setInterval(() => {
      setCurrentPoints(calculateCurrentPoints());
    }, 1000); // Every second

    return () => clearInterval(interval);
  }, [calculateCurrentPoints, isSolved]);

  // Open problem in Codeforces
  const openProblem = () => {
    const url = `https://codeforces.com/problemset/problem/${problem.contestId}/${problem.index}`;
    window.open(url, "_blank");
  };

  // Get rating color based on Codeforces rating scale
  const getRatingColor = (rating: number) => {
    if (rating < 1200) return "bg-gray-500";
    if (rating < 1400) return "bg-green-500";
    if (rating < 1600) return "bg-cyan-500";
    if (rating < 1900) return "bg-blue-500";
    if (rating < 2100) return "bg-violet-500";
    if (rating < 2400) return "bg-orange-500";
    return "bg-red-500";
  };

  return (
    <div
      className={`relative rounded-xl border p-5 transition-all duration-300 ${
        isSolved
          ? "bg-green-500/10 border-green-500/30 shadow-lg shadow-green-500/5"
          : "bg-white/5 border-white/10 hover:bg-white/8 hover:border-white/20"
      }`}
    >
      {/* Solved checkmark overlay */}
      {isSolved && (
        <div className="absolute top-3 right-3">
          <div className="flex items-center gap-1.5 text-green-400">
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-sm font-medium">Solved</span>
          </div>
        </div>
      )}

      {/* Problem number */}
      <div className="flex items-start gap-4">
        <div
          className={`flex items-center justify-center w-10 h-10 rounded-lg font-bold text-lg ${
            isSolved
              ? "bg-green-500/20 text-green-400"
              : "bg-white/10 text-white"
          }`}
        >
          {index + 1}
        </div>

        <div className="flex-1 min-w-0">
          {/* Problem ID and Rating */}
          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono text-lg font-semibold text-white">
              {problem.contestId}{problem.index}
            </span> 
          </div>

          {/* Points display */}
          <div className="mb-4">
            {isSolved ? (
              <div className="flex items-center gap-2">
                <span className="text-green-400 font-bold text-xl">
                  +{earnedPoints || currentPoints}
                </span>
                <span className="text-gray-400 text-sm">points earned</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-white font-bold text-xl">{currentPoints}</span>
                <span className="text-gray-400 text-sm">points</span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={openProblem}
              className="border-white/20 text-gray-300 hover:bg-white/10 hover:text-white"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Problem
            </Button>

            {!isSolved && (
              <Button
                size="sm"
                onClick={() => onCheck(problem)}
                disabled={isChecking || !isConnected || isGameEnded}
                className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
              >
                {isChecking ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Checking...
                  </>
                ) : isGameEnded ? (
                  "Game Ended"
                ) : (
                  "Check"
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
