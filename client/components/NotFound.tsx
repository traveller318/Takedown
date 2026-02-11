"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Home, AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NotFoundProps {
  title?: string;
  message?: string;
  redirectPath?: string;
  redirectDelay?: number; // in seconds
  showRedirectTimer?: boolean;
}

export function NotFound({
  title = "Not Found",
  message = "The page you're looking for doesn't exist.",
  redirectPath = "/",
  redirectDelay = 5,
  showRedirectTimer = true,
}: NotFoundProps) {
  const router = useRouter();
  const [countdown, setCountdown] = useState(redirectDelay);
  const hasRedirectedRef = useRef(false);

  // Handle countdown timer
  useEffect(() => {
    if (!showRedirectTimer || redirectDelay <= 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [redirectDelay, showRedirectTimer]);

  // Handle redirect when countdown reaches 0
  useEffect(() => {
    if (countdown === 0 && !hasRedirectedRef.current) {
      hasRedirectedRef.current = true;
      router.push(redirectPath);
    }
  }, [countdown, router, redirectPath]);

  const handleGoHome = () => {
    router.push(redirectPath);
  };

  const handleGoBack = () => {
    router.back();
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-black via-neutral-900 to-black flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-6 text-center max-w-md">
        {/* Icon */}
        <div className="bg-red-500/10 border border-red-500/30 rounded-full p-6">
          <AlertCircle className="h-12 w-12 text-red-400" />
        </div>

        {/* Content */}
        <div>
          <h1 className="text-3xl font-bold text-white mb-3">{title}</h1>
          <p className="text-gray-400 text-lg">{message}</p>
        </div>

        {/* Countdown */}
        {showRedirectTimer && countdown > 0 && (
          <p className="text-sm text-gray-500">
            Redirecting in {countdown} second{countdown !== 1 ? "s" : ""}...
          </p>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={handleGoBack}
            variant="outline"
            className="border-white/20 text-gray-300 hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
          <Button
            onClick={handleGoHome}
            className="bg-white hover:bg-gray-200 text-black"
          >
            <Home className="h-4 w-4 mr-2" />
            Go Home
          </Button>
        </div>
      </div>
    </div>
  );
}

export function RoomNotFound() {
  return (
    <NotFound
      title="Room Not Found"
      message="This room doesn't exist or may have been closed."
      redirectDelay={5}
    />
  );
}

export function GameNotFound() {
  return (
    <NotFound
      title="Game Not Found"
      message="This game doesn't exist or has already ended."
      redirectDelay={5}
    />
  );
}
