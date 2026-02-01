import { io, Socket } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Create socket instance with configuration
// Only create socket on client-side (not during SSR)
const createSocket = (): Socket => {
  const socketInstance = io(SOCKET_URL, {
    withCredentials: true,
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    transports: ["websocket", "polling"],
  });

  // Debug logging in development
  if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    socketInstance.onAny((eventName, ...args) => {
      console.log(`[Socket] Event received: ${eventName}`, args);
    });

    socketInstance.onAnyOutgoing((eventName, ...args) => {
      console.log(`[Socket] Event sent: ${eventName}`, args);
    });
  }

  // Connection event handlers for debugging
  socketInstance.on("connect", () => {
    console.log("[Socket] Connected successfully with ID:", socketInstance.id);
  });

  socketInstance.on("connect_error", (error) => {
    console.error("[Socket] Connection error:", error.message);
  });

  socketInstance.on("disconnect", (reason) => {
    console.log("[Socket] Disconnected:", reason);
  });

  socketInstance.on("reconnect", (attemptNumber: number) => {
    console.log("[Socket] Reconnected after", attemptNumber, "attempts");
  });

  socketInstance.on("reconnect_attempt", (attemptNumber: number) => {
    console.log("[Socket] Reconnection attempt:", attemptNumber);
  });

  socketInstance.on("reconnect_error", (error) => {
    console.error("[Socket] Reconnection error:", error.message);
  });

  socketInstance.on("reconnect_failed", () => {
    console.error("[Socket] Reconnection failed after all attempts");
  });

  socketInstance.on("connection-success", () => {
    console.log("[Socket] Server confirmed connection success");
  });

  socketInstance.on("error", (data: { message: string }) => {
    console.error("[Socket] Server error:", data.message);
  });

  return socketInstance;
};

// Create socket only on client side
export const socket: Socket = typeof window !== "undefined" 
  ? createSocket() 
  : (null as unknown as Socket);

/**
 * Connect to the socket server
 * Should be called after user authentication
 */
export const connectSocket = (): void => {
  if (typeof window === "undefined" || !socket) {
    return;
  }
  
  if (!socket.connected) {
    console.log("[Socket] Initiating connection...");
    socket.connect();
  } else {
    console.log("[Socket] Already connected");
  }
};

/**
 * Disconnect from the socket server
 * Should be called on user logout
 */
export const disconnectSocket = (): void => {
  if (typeof window === "undefined" || !socket) {
    return;
  }
  
  if (socket.connected) {
    console.log("[Socket] Disconnecting...");
    socket.disconnect();
  } else {
    console.log("[Socket] Already disconnected");
  }
};

/**
 * Check if socket is currently connected
 */
export const isSocketConnected = (): boolean => {
  if (typeof window === "undefined" || !socket) {
    return false;
  }
  return socket.connected;
};

export default socket;
