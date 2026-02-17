"use client";

import { useMemo } from "react";
import type { Problem, LeaderboardEntry, ProblemScore } from "@/types";

interface LeaderboardProps {
  leaderboard: LeaderboardEntry[];
  problems: Problem[];
  currentUserHandle?: string;
  startTime: string | null;
}

// Format time as MM:SS from solve timestamp relative to game start
function formatSolveTime(solvedAt: string, startTime: string): string {
  const start = new Date(startTime).getTime();
  const solve = new Date(solvedAt).getTime();
  const elapsedMs = solve - start;
  
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Get rank display based on position
function RankDisplay({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex items-center justify-center">
        <span className="text-2xl">🏆</span>
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="flex items-center justify-center">
        <span className="text-2xl">🥈</span>
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="flex items-center justify-center">
        <span className="text-2xl">🥉</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center">
      <span className="text-white/90 font-kungfu text-lg">{rank}</span>
    </div>
  );
}

// Problem score cell component
function ProblemScoreCell({
  problemScore,
  startTime,
}: {
  problemScore?: ProblemScore;
  startTime: string | null;
}) {
  if (!problemScore || !startTime) {
    return (
      <td className="py-4 px-4 text-center">
        <div className="flex flex-col items-center">
          <span className="text-red-400/80 font-kungfu">0</span>
          <span className="text-xs text-white/30">-</span>
        </div>
      </td>
    );
  }

  const solveTime = formatSolveTime(problemScore.solvedAt, startTime);

  return (
    <td className="py-4 px-4 text-center">
      <div className="flex flex-col items-center">
        <span className="text-emerald-400 font-kungfu text-lg font-bold">{problemScore.points}</span>
        <span className="text-xs text-emerald-300/80">{solveTime}</span>
      </div>
    </td>
  );
}

export function Leaderboard({
  leaderboard,
  problems,
  currentUserHandle,
  startTime,
}: LeaderboardProps) {
  // Calculate total possible points
  const totalPossiblePoints = useMemo(() => {
    return problems.reduce((sum, p) => sum + p.basePoints, 0);
  }, [problems]);

  // Get problem score for a specific problem
  const getProblemScore = (
    entry: LeaderboardEntry,
    problem: Problem
  ): ProblemScore | undefined => {
    return entry.problemScores?.find(
      (ps) => ps.contestId === problem.contestId && ps.index === problem.index
    );
  };

  if (!leaderboard || leaderboard.length === 0) {
    return (
      <div className="kfp-panel overflow-hidden">
        <div className="p-6 border-b border-pink-300/30">
          <h2 className="text-xl font-kungfu tracking-wider text-white flex items-center gap-2">
            <span className="text-2xl">🏆</span>
            Leaderboard
          </h2>
        </div>
        <div className="text-center py-12 text-white/60">
          <span className="text-5xl block mb-4">🏆</span>
          <p className="text-lg font-kungfu tracking-wide text-white/70">No solves yet</p>
          <p className="text-sm mt-1 text-white/50">Be the first to solve a problem!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="kfp-panel overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-pink-300/30">
        <h2 className="text-xl font-kungfu tracking-wider text-white flex items-center gap-2">
          <span className="text-2xl">🏆</span>
          Leaderboard
        </h2>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-pink-300/30 text-white/80 text-sm font-kungfu tracking-wide">
              <th className="text-left py-4 px-6 font-medium w-20">Rank</th>
              <th className="text-left py-4 px-6 font-medium min-w-40">
                Warrior
              </th>
              {problems.map((problem, index) => (
                <th
                  key={`header-${problem.contestId}-${problem.index}`}
                  className="text-center py-4 px-4 font-medium min-w-20"
                >
                  <div className="flex flex-col items-center">
                    <span className="text-white">{index + 1}</span>
                    <span className="text-xs text-white/50">
                      ({problem.basePoints})
                    </span>
                  </div>
                </th>
              ))}
              <th className="text-center py-4 px-6 font-medium min-w-24">
                <div className="flex flex-col items-center">
                  <span className="text-white">Score</span>
                  <span className="text-xs text-white/50">
                    ({totalPossiblePoints})
                  </span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((entry, index) => {
              const rank = index + 1;
              const isCurrentUser = entry.handle === currentUserHandle;

              return (
                <tr
                  key={entry.handle}
                  className={`border-b border-pink-300/30 transition-all duration-300 ${
                    isCurrentUser
                      ? "bg-pink-400/10"
                      : rank === 1
                        ? "bg-yellow-300/10"
                        : "hover:bg-pink-200/20"
                  }`}
                >
                  {/* Rank */}
                  <td className="py-4 px-6">
                    <RankDisplay rank={rank} />
                  </td>

                  {/* Contestant */}
                  <td className="py-4 px-6">
                    <span
                      className={`font-kungfu tracking-wide ${
                        isCurrentUser ? "text-cyan-400" : rank === 1 ? "text-yellow-400" : "text-white"
                      }`}
                    >
                      {entry.handle}
                    </span>
                  </td>

                  {/* Problem scores */}
                  {problems.map((problem) => {
                    const problemScore = getProblemScore(entry, problem);
                    return (
                      <ProblemScoreCell
                        key={`score-${entry.handle}-${problem.contestId}-${problem.index}`}
                        problemScore={problemScore}
                        startTime={startTime}
                      />
                    );
                  })}

                  {/* Total Score */}
                  <td className="py-4 px-6 text-center">
                    <span
                      className={`font-kungfu text-xl font-bold ${
                        entry.totalPoints > 0 ? "text-emerald-400" : "text-red-400/80"
                      }`}
                    >
                      {entry.totalPoints}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
