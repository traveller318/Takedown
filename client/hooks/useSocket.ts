"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSocketContext } from "@/context/SocketContext";

type EventCallback = (...args: unknown[]) => void;

/**
 * Custom hook for socket.io operations
 * Provides easy access to socket, connection state, and helper functions
 */
export function useSocket() {
  const { 
    socket, 
    isConnected, 
    isReconnecting, 
    reconnectAttempt, 
    connect, 
    disconnect,
    trackRoom,
    untrackRoom,
  } = useSocketContext();
  const listenersRef = useRef<Map<string, EventCallback>>(new Map());

  /**
   * Emit an event to the server
   * @param event - Event name
   * @param data - Data to send
   */
  const emit = useCallback(
    <T = unknown>(event: string, data?: T): void => {
      if (!socket) {
        console.warn(`[useSocket] Cannot emit '${event}': Socket not initialized`);
        return;
      }
      if (!socket.connected) {
        console.warn(`[useSocket] Cannot emit '${event}': Socket not connected`);
        return;
      }
      socket.emit(event, data);
    },
    [socket]
  );

  /**
   * Listen to an event from the server
   * Automatically cleans up when component unmounts
   * @param event - Event name
   * @param callback - Callback function
   */
  const on = useCallback(
    <T = unknown>(event: string, callback: (data: T) => void): void => {
      if (!socket) {
        console.warn(`[useSocket] Cannot listen to '${event}': Socket not initialized`);
        return;
      }

      // Remove existing listener for this event if any
      const existingCallback = listenersRef.current.get(event);
      if (existingCallback) {
        socket.off(event, existingCallback);
      }

      // Store and attach new listener
      listenersRef.current.set(event, callback as EventCallback);
      socket.on(event, callback as EventCallback);
    },
    [socket]
  );

  /**
   * Remove a specific event listener
   * @param event - Event name
   */
  const off = useCallback(
    (event: string): void => {
      if (!socket) return;
      
      const callback = listenersRef.current.get(event);
      if (callback) {
        socket.off(event, callback);
        listenersRef.current.delete(event);
      }
    },
    [socket]
  );

  /**
   * Listen to an event once
   * @param event - Event name
   * @param callback - Callback function
   */
  const once = useCallback(
    <T = unknown>(event: string, callback: (data: T) => void): void => {
      if (!socket) {
        console.warn(`[useSocket] Cannot listen once to '${event}': Socket not initialized`);
        return;
      }
      socket.once(event, callback as EventCallback);
    },
    [socket]
  );

  /**
   * Emit an event and wait for a response
   * @param event - Event name
   * @param data - Data to send
   * @param timeout - Timeout in milliseconds (default: 10000)
   */
  const emitWithAck = useCallback(
    async <TResponse = unknown, TData = unknown>(
      event: string,
      data?: TData,
      timeout = 10000
    ): Promise<TResponse> => {
      return new Promise((resolve, reject) => {
        if (!socket) {
          reject(new Error(`Cannot emit '${event}': Socket not initialized`));
          return;
        }
        if (!socket.connected) {
          reject(new Error(`Cannot emit '${event}': Socket not connected`));
          return;
        }

        const timer = setTimeout(() => {
          reject(new Error(`Timeout waiting for response to '${event}'`));
        }, timeout);

        socket.emit(event, data, (response: TResponse) => {
          clearTimeout(timer);
          resolve(response);
        });
      });
    },
    [socket]
  );

  // Cleanup all listeners on unmount
  useEffect(() => {
    return () => {
      if (!socket) return;
      
      listenersRef.current.forEach((callback, event) => {
        socket.off(event, callback);
      });
      listenersRef.current.clear();
    };
  }, [socket]);

  return {
    socket,
    isConnected,
    isReconnecting,
    reconnectAttempt,
    connect,
    disconnect,
    trackRoom,
    untrackRoom,
    emit,
    on,
    off,
    once,
    emitWithAck,
  };
}

export default useSocket;
