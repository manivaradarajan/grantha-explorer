"use client";

import React, { createContext, useContext, useState } from "react";

const STORAGE_KEY = "grantha-footnote-mode";

/** Context value exposed by FootnoteModeProvider. */
export interface FootnoteModeContextValue {
  footnoteModeEnabled: boolean;
  toggleFootnoteMode: () => void;
}

const FootnoteModeContext = createContext<FootnoteModeContextValue>({
  footnoteModeEnabled: true,
  toggleFootnoteMode: () => {},
});

/**
 * Reads the stored footnote-mode flag from localStorage.
 *
 * Returns:
 *     `true` when the stored value is "true", `false` on any error or when
 *     the value is absent or running in a non-browser context.
 */
function readStoredFootnoteMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Writes the footnote-mode flag to localStorage, swallowing any exception.
 *
 * Args:
 *     value: The flag value to persist.
 */
function writeStoredFootnoteMode(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
  } catch {
    // iOS Safari private mode may throw; silently degrade to ephemeral state.
  }
}

/**
 * Provides footnote-mode toggle state to the component tree.
 *
 * Persists the flag to `localStorage` under the key
 * `'grantha-footnote-mode'`. Both reads and writes are wrapped in
 * `try/catch` so private-mode Safari's `SecurityError` never surfaces.
 *
 * Args:
 *     children: Child components that can consume the context.
 *
 * Returns:
 *     A provider element wrapping `children`.
 */
export function FootnoteModeProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [footnoteModeEnabled, setFootnoteModeEnabled] = useState<boolean>(
    () => readStoredFootnoteMode(),
  );

  const toggleFootnoteMode = () => {
    setFootnoteModeEnabled((prev) => {
      const next = !prev;
      writeStoredFootnoteMode(next);
      return next;
    });
  };

  return (
    <FootnoteModeContext.Provider value={{ footnoteModeEnabled, toggleFootnoteMode }}>
      {children}
    </FootnoteModeContext.Provider>
  );
}

/**
 * Returns the current footnote-mode context value.
 *
 * Returns:
 *     `{ footnoteModeEnabled, toggleFootnoteMode }` from the nearest
 *     `FootnoteModeProvider`, or the default (disabled) value when no
 *     provider is mounted above.
 */
export function useFootnoteMode(): FootnoteModeContextValue {
  return useContext(FootnoteModeContext);
}
