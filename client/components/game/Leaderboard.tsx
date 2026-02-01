"use client";

import { useMemo } from "react";
import { Trophy } from "lucide-react";
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

// Get rank icon/number based on position
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
      <span className="text-gray-400 font-medium">{rank}</span>
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
          <span className="text-red-400 font-medium">0</span>
          <span className="text-xs text-gray-500">-</span>
        </div>
      </td>
    );
  }

  const solveTime = formatSolveTime(problemScore.solvedAt, startTime);

  return (
    <td className="py-4 px-4 text-center">
      <div className="flex flex-col items-center">
        <span className="text-green-400 font-bold">{problemScore.points}</span>
        <span className="text-xs text-gray-400">{solveTime}</span>
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

  // Create a map of problemKey to index for quick lookup
  const problemIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    problems.forEach((p, idx) => {
      map.set(`${p.contestId}-${p.index}`, idx);
    });
    return map;
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
      <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-white/10">
          <h2 className="text-xl font-semibold flex items-center gap-2 text-white">
            <Trophy className="h-5 w-5 text-yellow-400" />
            Leaderboard
          </h2>
        </div>
        <div className="text-center py-12 text-gray-400">
          <Trophy className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg">No solves yet</p>
          <p className="text-sm mt-1">Be the first to solve a problem!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-white/10">
        <h2 className="text-xl font-semibold flex items-center gap-2 text-white">
          <Trophy className="h-5 w-5 text-yellow-400" />
          Leaderboard
        </h2>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10 text-gray-400 text-sm">
              <th className="text-left py-4 px-6 font-medium w-20">Rank</th>
              <th className="text-left py-4 px-6 font-medium min-w-40">
                Contestant
              </th>
              {problems.map((problem, index) => (
                <th
                  key={`header-${problem.contestId}-${problem.index}`}
                  className="text-center py-4 px-4 font-medium min-w-20"
                >
                  <div className="flex flex-col items-center">
                    <span className="text-white">{index + 1}</span>
                    <span className="text-xs text-gray-500">
                      ({problem.basePoints})
                    </span>
                  </div>
                </th>
              ))}
              <th className="text-center py-4 px-6 font-medium min-w-24">
                <div className="flex flex-col items-center">
                  <span className="text-white">Score</span>
                  <span className="text-xs text-gray-500">
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
                  className={`border-b border-white/5 transition-all duration-300 ${
                    isCurrentUser
                      ? "bg-blue-500/10 hover:bg-blue-500/15"
                      : "hover:bg-white/5"
                  }`}
                >
                  {/* Rank */}
                  <td className="py-4 px-6">
                    <RankDisplay rank={rank} />
                  </td>

                  {/* Contestant */}
                  <td className="py-4 px-6">
                    <span
                      className={`font-medium ${
                        isCurrentUser ? "text-cyan-400" : "text-green-400"
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
                      className={`font-bold text-lg ${
                        entry.totalPoints > 0 ? "text-green-400" : "text-red-400"
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
