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
      <div className="kfp-panel p-12 text-center">
        <div className="text-white/60">
          <p className="text-lg font-kungfu tracking-wide">No problems available</p>
          <p className="text-sm mt-1 text-white/40">Problems will appear here once the game starts</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="kfp-panel">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-kungfu tracking-wider text-white flex items-center gap-2">
            <span className="text-2xl">🌸</span>
            Contest Problems
          </h2>
          <div className="flex items-center gap-4 text-sm font-kungfu tracking-wide text-white/70">
            <span>
              Solved: <span className="text-green-400">{solvedProblems.size}</span> / {problems.length}
            </span>
            <span className="text-white/40">•</span>
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

        <div className="flex flex-col gap-4">
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
