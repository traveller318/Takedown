"use client";

import { ProblemCard } from "./ProblemCard";
import type { Problem } from "@/types";

interface SolvedProblemInfo {
  points: number;
}

interface ProblemsListProps {
  problems: Problem[];
  solvedProblems: Map<string, SolvedProblemInfo>;
  checkingProblem: string | null;
  isConnected: boolean;
  isGameEnded?: boolean;
  startTime: string | null;
  onCheckProblem: (problem: Problem) => void;
}

export function ProblemsList({
  problems,
  solvedProblems,
  checkingProblem,
  isConnected,
  isGameEnded = false,
  startTime,
  onCheckProblem,
}: ProblemsListProps) {
  if (!problems || problems.length === 0) {
    return (
      <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-12 text-center">
        <div className="text-gray-400">
          <p className="text-lg">No problems available</p>
          <p className="text-sm mt-1">Problems will appear here once the game starts</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Contest Problems</h2>
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <span>
              Solved: {solvedProblems.size} / {problems.length}
            </span>
            <span>•</span>
            <span>
              Total Points:{" "}
              <span className="text-green-400 font-semibold">
                {Array.from(solvedProblems.values()).reduce(
                  (sum, info) => sum + info.points,
                  0
                )}
              </span>
            </span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {problems.map((problem, index) => {
            const problemKey = `${problem.contestId}-${problem.index}`;
            const solvedInfo = solvedProblems.get(problemKey);
            const isSolved = !!solvedInfo;
            const isChecking = checkingProblem === problemKey;

            return (
              <ProblemCard
                key={problemKey}
                problem={problem}
                index={index}
                isSolved={isSolved}
                earnedPoints={solvedInfo?.points}
                isChecking={isChecking}
                isConnected={isConnected}
                isGameEnded={isGameEnded}
                startTime={startTime}
                onCheck={onCheckProblem}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
