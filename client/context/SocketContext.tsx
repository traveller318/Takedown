"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { Socket } from "socket.io-client";
import { socket, connectSocket, disconnectSocket } from "@/lib/socket";
import { useAuth } from "./AuthContext";

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export function SocketProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { user } = useAuth();

  // Track mount state to avoid SSR issues
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Handle connection state changes
  useEffect(() => {
    if (!isMounted || !socket) return;

    const onConnect = () => {
      console.log("[SocketContext] Connected");
      setIsConnected(true);
    };

    const onDisconnect = (reason: string) => {
      console.log("[SocketContext] Disconnected:", reason);
      setIsConnected(false);
    };

    const onConnectError = (error: Error) => {
      console.error("[SocketContext] Connection error:", error.message);
      setIsConnected(false);
    };

    // Attach listeners
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);

    // Set initial state
    setIsConnected(socket.connected);

    // Cleanup listeners on unmount
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
    };
  }, [isMounted]);

  // Auto-connect when user is authenticated
  useEffect(() => {
    if (!isMounted) return;

    if (user) {
      console.log("[SocketContext] User authenticated, connecting socket...");
      connectSocket();
    } else {
      console.log("[SocketContext] No user, disconnecting socket...");
      disconnectSocket();
    }
  }, [user, isMounted]);

  // Cleanup on unmount
  useEffect(() => {
    if (!isMounted) return;

    return () => {
      if (socket?.connected) {
        console.log("[SocketContext] Cleaning up socket connection");
        disconnectSocket();
      }
    };
  }, [isMounted]);

  const connect = useCallback(() => {
    connectSocket();
  }, []);

  const disconnect = useCallback(() => {
    disconnectSocket();
  }, []);

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        connect,
        disconnect,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocketContext() {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error("useSocketContext must be used within a SocketProvider");
  }
  return context;
}
