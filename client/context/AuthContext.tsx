"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import type { User } from "@/types";
import { connectSocket, disconnectSocket } from "@/lib/socket";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (handle: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);

  const checkAuth = useCallback(async () => {
    if (hasCheckedAuth) return;
    
    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/api/auth/me`, {
        credentials: "include",
      });
      
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        // Connect socket if user is already logged in (page refresh)
        console.log("[Auth] User already logged in, connecting socket...");
        connectSocket();
      } else {
        setUser(null);
      }
    } catch (error) {
      // Network error - server might not be running
      console.warn("[Auth] Could not connect to server:", error instanceof Error ? error.message : "Unknown error");
      setUser(null);
    } finally {
      setIsLoading(false);
      setHasCheckedAuth(true);
    }
  }, [hasCheckedAuth]);

  const login = async (handle: string) => {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ handle }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Login failed");
    }

    setUser(data.user);
    
    // Connect socket after successful login
    console.log("[Auth] Login successful, connecting socket...");
    connectSocket();
  };

  const logout = async () => {
    // Disconnect socket before logout
    console.log("[Auth] Logging out, disconnecting socket...");
    disconnectSocket();
    
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setUser(null);
    }
  };

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
