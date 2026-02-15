"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GameTimer } from "./GameTimer";
import { useGame } from "@/context/GameContext";
import { useSocket } from "@/hooks/useSocket";

interface GameHeaderProps {
  roomCode: string;
  startTime: string | null;
  duration: number;
  isConnected: boolean;
  isGameEnded?: boolean;
  onTimeUp?: () => void;
  onExit?: () => void;
}

export function GameHeader({
  roomCode,
  startTime,
  duration,
  isConnected,
  isGameEnded = false,
  onTimeUp,
  onExit,
}: GameHeaderProps) {
  const router = useRouter();
  const { clearGame } = useGame();
  const { emit } = useSocket();
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const handleExitClick = () => {
    if (isGameEnded) {
      handleConfirmExit();
      return;
    }
    setShowExitDialog(true);
  };

  const handleConfirmExit = async () => {
    setIsExiting(true);
    try {
      if (onExit) {
        onExit();
      } else {
        emit("leave-room", { roomCode });
        clearGame();
        toast.info("You have left the game");
        router.push("/");
      }
    } catch (error) {
      console.error("[GameHeader] Error leaving game:", error);
      toast.error("Failed to leave game");
    } finally {
      setIsExiting(false);
      setShowExitDialog(false);
    }
  };

  const handleCancelExit = () => {
    setShowExitDialog(false);
  };

  return (
    <>
      {/* Light themed header */}
      <div className="kfp-panel mb-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Cherry blossom icon */}
            <span className="text-3xl">🌸</span>
            <div>
              <h1 className="text-2xl md:text-3xl font-kungfu tracking-wider text-pink-800 drop-shadow-sm">
                {isGameEnded ? "Battle Ended" : "Battle in Progress"}
              </h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-pink-600/70 font-kungfu text-sm tracking-wide">Room:</span>
                <Badge
                  variant="secondary"
                  className="bg-white/60 text-pink-800 font-kungfu text-sm px-3 py-1 border border-pink-300/50"
                >
                  {roomCode}
                </Badge>
                {/* Connection Status */}
                <div
                  className={`flex items-center gap-1.5 ${
                    isConnected ? "text-green-600" : "text-yellow-600"
                  }`}
                >
                  <div
                    className={`h-2 w-2 rounded-full ${
                      isConnected ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]" : "bg-yellow-500 animate-pulse"
                    }`}
                  />
                  <span className="text-xs font-kungfu tracking-wide">
                    {isConnected ? "Live" : "Connecting..."}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Timer or Game Ended Badge */}
            {isGameEnded ? (
              <div className="flex items-center gap-3 bg-red-100/60 border-2 border-red-300/60 rounded-lg px-5 py-2.5">
                <span className="text-2xl font-kungfu tracking-wider text-red-700">
                  Game Ended
                </span>
              </div>
            ) : (
              <GameTimer
                startTime={startTime}
                duration={duration}
                onTimeUp={onTimeUp}
              />
            )}

            {/* Exit Button */}
            <button
              onClick={handleExitClick}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-kungfu tracking-wide text-sm transition-all duration-200
                ${isGameEnded 
                  ? "bg-pink-200/60 border-2 border-pink-300/50 text-pink-800 hover:bg-pink-300/60"
                  : "bg-red-100/60 border-2 border-red-300/50 text-red-700 hover:bg-red-200/60 hover:border-red-400/60"
                }
              `}
            >
              <LogOut className="h-4 w-4" />
              {isGameEnded ? "Leave" : "Exit"}
            </button>
          </div>
        </div>
      </div>

      {/* Exit Confirmation Dialog */}
      <Dialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <DialogContent className="bg-white/95 border-2 border-pink-300/60 text-pink-900 shadow-[0_0_40px_rgba(255,182,193,0.3)]">
          <DialogHeader>
            <DialogTitle className="text-xl font-kungfu tracking-wide text-pink-800">Leave Battle?</DialogTitle>
            <DialogDescription className="text-pink-700/70">
              Are you sure you want to leave this game? Your progress will be lost and you won&apos;t be able to rejoin.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={handleCancelExit}
              className="border-pink-300/50 text-pink-700 hover:bg-pink-100/30 bg-transparent font-kungfu"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmExit}
              disabled={isExiting}
              className="bg-red-600 hover:bg-red-700 border border-red-500 font-kungfu"
            >
              {isExiting ? "Leaving..." : "Leave Game"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
