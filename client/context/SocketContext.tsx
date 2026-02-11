"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { Socket } from "socket.io-client";
import { socket, connectSocket, disconnectSocket } from "@/lib/socket";
import { useAuth } from "./AuthContext";

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  isReconnecting: boolean;
  reconnectAttempt: number;
  connect: () => void;
  disconnect: () => void;
  trackRoom: (roomCode: string) => void;
  untrackRoom: (roomCode: string) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export function SocketProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [isMounted, setIsMounted] = useState(false);
  const { user } = useAuth();
  
  // Track rooms to rejoin after reconnect
  const roomsToRejoinRef = useRef<Set<string>>(new Set());

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
      setIsReconnecting(false);
      setReconnectAttempt(0);
      
      // Rejoin rooms after reconnect
      if (roomsToRejoinRef.current.size > 0) {
        console.log("[SocketContext] Rejoining rooms after reconnect:", Array.from(roomsToRejoinRef.current));
        roomsToRejoinRef.current.forEach((roomCode) => {
          socket.emit("join-room", { roomCode });
        });
      }
    };

    const onDisconnect = (reason: string) => {
      console.log("[SocketContext] Disconnected:", reason);
      setIsConnected(false);
      
      // If server-initiated disconnect, mark as reconnecting
      if (reason === "io server disconnect" || reason === "transport close" || reason === "ping timeout") {
        setIsReconnecting(true);
      }
    };

    const onConnectError = (error: Error) => {
      console.warn("[SocketContext] Connection error:", error.message);
      setIsConnected(false);
      setIsReconnecting(true);
    };

    const onReconnectAttempt = (attempt: number) => {
      console.log("[SocketContext] Reconnect attempt:", attempt);
      setIsReconnecting(true);
      setReconnectAttempt(attempt);
    };

    const onReconnect = () => {
      console.log("[SocketContext] Reconnected successfully");
      setIsReconnecting(false);
      setReconnectAttempt(0);
    };

    const onReconnectFailed = () => {
      console.warn("[SocketContext] Reconnection failed after all attempts");
      setIsReconnecting(false);
    };

    // Attach listeners
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.io.on("reconnect_attempt", onReconnectAttempt);
    socket.io.on("reconnect", onReconnect);
    socket.io.on("reconnect_failed", onReconnectFailed);

    // Set initial state
    setIsConnected(socket.connected);

    // Cleanup listeners on unmount
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.io.off("reconnect_attempt", onReconnectAttempt);
      socket.io.off("reconnect", onReconnect);
      socket.io.off("reconnect_failed", onReconnectFailed);
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

  // Function to track a room for rejoining after reconnect
  const trackRoom = useCallback((roomCode: string) => {
    roomsToRejoinRef.current.add(roomCode);
  }, []);

  // Function to untrack a room
  const untrackRoom = useCallback((roomCode: string) => {
    roomsToRejoinRef.current.delete(roomCode);
  }, []);

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        isReconnecting,
        reconnectAttempt,
        connect,
        disconnect,
        trackRoom,
        untrackRoom,
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
