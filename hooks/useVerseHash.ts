"use client";

import { useEffect, useState, useRef } from "react";
import { parseHash, buildHash, UrlState } from "@/lib/hashUtils";

interface UseVerseHashReturn {
  granthaId: string;
  verseRef: string;
  commentaries: string[];
  updateHash: (
    granthaId: string,
    verseRef: string,
    commentaries?: string[]
  ) => void;
}

/**
 * Simplified custom hook for managing hash-based verse navigation
 *
 * Key improvements:
 * - Single source of truth: URL hash
 * - No "trust the hash" hacks
 * - Event listener uses refs (no dependency issues)
 * - Validation happens in components via React Query
 * - Commentary persistence to localStorage
 *
 * @param defaultGranthaId - Fallback grantha ID if hash is empty/invalid
 * @param defaultVerseRef - Fallback verse ref if hash is empty/invalid
 * @returns Current hash state and update function
 */
export function useVerseHash(
  defaultGranthaId: string,
  defaultVerseRef: string = "1"
): UseVerseHashReturn {
  // Parse initial hash or use defaults
  const getInitialState = (): {
    granthaId: string;
    verseRef: string;
    commentaries: string[];
  } => {
    if (typeof window === "undefined") {
      return {
        granthaId: defaultGranthaId,
        verseRef: defaultVerseRef,
        commentaries: [],
      };
    }

    const hash = window.location.hash;
    const parsed = parseHash(hash);

    if (parsed && parsed.granthaId && parsed.verseRef) {
      // Save commentaries to localStorage
      if (parsed.commentaries && parsed.commentaries.length > 0) {
        try {
          localStorage.setItem(
            "selectedCommentaries",
            JSON.stringify(parsed.commentaries)
          );
        } catch (e) {
          console.error("Failed to save commentaries to localStorage:", e);
        }
      }

      return {
        granthaId: parsed.granthaId,
        verseRef: parsed.verseRef,
        commentaries: parsed.commentaries || [],
      };
    }

    // No valid hash - load commentaries from localStorage
    let savedCommentaries: string[] = [];
    try {
      const saved = localStorage.getItem("selectedCommentaries");
      if (saved) {
        savedCommentaries = JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to load commentaries from localStorage:", e);
    }

    // Set initial hash
    const initialHash = buildHash({
      granthaId: defaultGranthaId,
      verseRef: defaultVerseRef,
      commentaries: savedCommentaries,
    });
    window.history.replaceState(null, "", initialHash);

    return {
      granthaId: defaultGranthaId,
      verseRef: defaultVerseRef,
      commentaries: savedCommentaries,
    };
  };

  const [state, setState] = useState(getInitialState);

  // Use refs to avoid recreating event listener
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Listen to hashchange events (browser back/forward)
  useEffect(() => {
    if (typeof window === "undefined") return;

    function handleHashChange() {
      const hash = window.location.hash;
      const parsed = parseHash(hash);

      // Invalid hash - ignore (shouldn't happen normally)
      if (!parsed || !parsed.granthaId || !parsed.verseRef) {
        return;
      }

      // Save commentaries to localStorage if present
      if (parsed.commentaries && parsed.commentaries.length > 0) {
        try {
          localStorage.setItem(
            "selectedCommentaries",
            JSON.stringify(parsed.commentaries)
          );
        } catch (e) {
          console.error("Failed to save commentaries:", e);
        }
      }

      // Update state from hash
      setState({
        granthaId: parsed.granthaId,
        verseRef: parsed.verseRef,
        commentaries: parsed.commentaries || [],
      });
    }

    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []); // Empty deps - listener created once, uses refs

  // Function to update hash (called by components)
  const updateHash = (
    granthaId: string,
    verseRef: string,
    commentaries?: string[]
  ) => {
    const newCommentaries =
      commentaries !== undefined ? commentaries : stateRef.current.commentaries;

    const newHash = buildHash({
      granthaId,
      verseRef,
      commentaries: newCommentaries,
    });

    // Only update if different from current hash
    if (typeof window !== "undefined" && window.location.hash !== newHash) {
      window.location.hash = newHash;
      // State will be updated via hashchange event
    }
  };

  return {
    granthaId: state.granthaId,
    verseRef: state.verseRef,
    commentaries: state.commentaries,
    updateHash,
  };
}
