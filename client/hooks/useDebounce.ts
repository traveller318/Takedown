"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Hook to prevent double-clicks and rapid submissions
 * @param callback - The function to debounce
 * @param delay - Delay in milliseconds (default: 1000)
 */
export function useDebounceCallback<T extends (...args: unknown[]) => void | Promise<void>>(
  callback: T,
  delay: number = 1000
): [(...args: Parameters<T>) => void, boolean] {
  const [isProcessing, setIsProcessing] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastCallRef = useRef<number>(0);

  const debouncedCallback = useCallback(
    async (...args: Parameters<T>) => {
      const now = Date.now();
      
      // Prevent rapid calls within the delay period
      if (now - lastCallRef.current < delay) {
        return;
      }
      
      // Prevent calls while processing
      if (isProcessing) {
        return;
      }

      lastCallRef.current = now;
      setIsProcessing(true);

      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      try {
        await callback(...args);
      } finally {
        // Add a small delay before allowing next call
        timeoutRef.current = setTimeout(() => {
          setIsProcessing(false);
        }, delay);
      }
    },
    [callback, delay, isProcessing]
  );

  return [debouncedCallback, isProcessing];
}

/**
 * Simple hook to track loading state and prevent double submissions
 */
export function useLoadingState() {
  const [isLoading, setIsLoading] = useState(false);
  const processingRef = useRef(false);

  const startLoading = useCallback(() => {
    if (processingRef.current) return false;
    processingRef.current = true;
    setIsLoading(true);
    return true;
  }, []);

  const stopLoading = useCallback(() => {
    processingRef.current = false;
    setIsLoading(false);
  }, []);

  const withLoading = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
      if (!startLoading()) return undefined;
      try {
        return await fn();
      } finally {
        stopLoading();
      }
    },
    [startLoading, stopLoading]
  );

  return { isLoading, startLoading, stopLoading, withLoading };
}
