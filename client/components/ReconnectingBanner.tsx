"use client";

import { useEffect, useState } from "react";
import { WifiOff, Wifi, Loader2 } from "lucide-react";

interface ReconnectingBannerProps {
  isConnected: boolean;
  isReconnecting: boolean;
  reconnectAttempt?: number;
  maxAttempts?: number;
}

export function ReconnectingBanner({
  isConnected,
  isReconnecting,
  reconnectAttempt = 0,
  maxAttempts = 5,
}: ReconnectingBannerProps) {
  const [mounted, setMounted] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [wasDisconnected, setWasDisconnected] = useState(false);

  // Avoid SSR hydration issues
  useEffect(() => {
    setMounted(true);
  }, []);

  // Track if we were disconnected to show success message
  useEffect(() => {
    if (!mounted) return;
    if (isReconnecting || !isConnected) {
      setWasDisconnected(true);
    }
  }, [isReconnecting, isConnected, mounted]);

  // Show success message briefly when reconnected
  useEffect(() => {
    if (!mounted) return;
    if (isConnected && wasDisconnected && !isReconnecting) {
      setShowSuccess(true);
      const timer = setTimeout(() => {
        setShowSuccess(false);
        setWasDisconnected(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isConnected, wasDisconnected, isReconnecting, mounted]);

  // Don't render anything during SSR or initial mount
  if (!mounted) return null;

  // Don't show anything if connected normally
  if (isConnected && !showSuccess && !isReconnecting) {
    return null;
  }

  // Show success banner
  if (showSuccess && isConnected) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-green-600/90 backdrop-blur text-white px-4 py-2 animate-in slide-in-from-top duration-300">
        <div className="max-w-6xl mx-auto flex items-center justify-center gap-2">
          <Wifi className="h-4 w-4" />
          <span className="text-sm font-medium">Connection restored!</span>
        </div>
      </div>
    );
  }

  // Show reconnecting banner
  if (isReconnecting || !isConnected) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-600/90 backdrop-blur text-white px-4 py-2 animate-in slide-in-from-top duration-300">
        <div className="max-w-6xl mx-auto flex items-center justify-center gap-2">
          <WifiOff className="h-4 w-4" />
          <span className="text-sm font-medium">
            Connection lost. Reconnecting...
            {reconnectAttempt > 0 && ` (Attempt ${reconnectAttempt}/${maxAttempts})`}
          </span>
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      </div>
    );
  }

  return null;
}
