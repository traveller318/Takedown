"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Swords, LogOut } from "lucide-react";
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
    // If game has ended, just exit without confirmation
    if (isGameEnded) {
      handleConfirmExit();
      return;
    }
    setShowExitDialog(true);
  };

  const handleConfirmExit = async () => {
    setIsExiting(true);
    try {
      // Use the onExit callback if provided (handles cleanup)
      if (onExit) {
        onExit();
      } else {
        // Fallback: Notify server about leaving using correct event name
        emit("leave-room", { roomCode });
        
        // Clear game state
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
      <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-6 mb-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Swords className="h-6 w-6 text-white" />
            <div>
              <h1 className="text-2xl font-bold">
                {isGameEnded ? "Battle Ended" : "Battle in Progress"}
              </h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-gray-400">Room:</span>
                <Badge
                  variant="secondary"
                  className="bg-neutral-800 text-white font-mono text-sm px-3 py-1"
                >
                  {roomCode}
                </Badge>
                {/* Connection Status */}
                <div
                  className={`flex items-center gap-1 ${
                    isConnected ? "text-green-400" : "text-yellow-400"
                  }`}
                >
                  <div
                    className={`h-2 w-2 rounded-full ${
                      isConnected ? "bg-green-400" : "bg-yellow-400 animate-pulse"
                    }`}
                  />
                  <span className="text-xs">
                    {isConnected ? "Live" : "Connecting..."}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Timer or Game Ended Badge */}
            {isGameEnded ? (
              <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/50 rounded-xl px-6 py-3">
                <span className="text-2xl font-mono font-bold text-red-400">
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
            <Button
              variant="outline"
              size="sm"
              onClick={handleExitClick}
              className={isGameEnded 
                ? "border-white/30 text-white hover:bg-white/10"
                : "border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/50"
              }
            >
              <LogOut className="h-4 w-4 mr-2" />
              {isGameEnded ? "Leave" : "Exit"}
            </Button>
          </div>
        </div>
      </div>

      {/* Exit Confirmation Dialog */}
      <Dialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <DialogContent className="bg-neutral-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl">Leave Game?</DialogTitle>
            <DialogDescription className="text-gray-400">
              Are you sure you want to leave this game? Your progress will be lost and you won&apos;t be able to rejoin.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={handleCancelExit}
              className="border-white/20 text-gray-300 hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmExit}
              disabled={isExiting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isExiting ? "Leaving..." : "Leave Game"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
