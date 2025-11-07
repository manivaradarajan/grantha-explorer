"use client";

import { useEffect, useState } from "react";
import {
  parseHash,
  buildHash,
  getFirstVerseRef,
  isValidVerseRef,
  UrlState,
} from "@/lib/hashUtils";
import { Grantha } from "@/lib/data";

interface UseVerseHashReturn {
  granthaId: string;
  verseRef: string;
  commentaries: string[];
  updateHash: (granthaId: string, verseRef: string, commentaries?: string[]) => void;
}

/**
 * Custom hook for managing hash-based verse navigation
 * - Reads initial hash on mount
 * - Listens to hashchange events (for browser back/forward)
 * - Provides updateHash function for programmatic updates
 * - Auto-initializes with first verse if hash is missing/invalid
 */
export function useVerseHash(
  availableGranthas: string[],
  defaultGranthaId: string,
  granthaDataMap: Map<string, Grantha>
): UseVerseHashReturn {
  // Initialize state from URL hash or defaults
  const [state, setState] = useState<{
    granthaId: string;
    verseRef: string;
    commentaries: string[];
  }>(() => {
    // Check if we're in browser environment
    if (typeof window === "undefined") {
      return {
        granthaId: defaultGranthaId,
        verseRef: "1",
        commentaries: [],
      };
    }

    const hash = window.location.hash;
    const parsed = parseHash(hash);

    // If valid hash exists and grantha is available, use it
    if (parsed && availableGranthas.includes(parsed.granthaId)) {
      const grantha = granthaDataMap.get(parsed.granthaId);

      // Validate verse ref exists in grantha
      if (grantha && isValidVerseRef(grantha, parsed.verseRef)) {
        // Save commentaries to localStorage (content params)
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

      // Invalid verse ref - use first verse of that grantha
      if (grantha) {
        const firstRef = getFirstVerseRef(grantha);
        // Update URL with valid verse
        window.history.replaceState(
          null,
          "",
          buildHash({ granthaId: parsed.granthaId, verseRef: firstRef })
        );
        return {
          granthaId: parsed.granthaId,
          verseRef: firstRef,
          commentaries: parsed.commentaries || [],
        };
      }
    }

    // No valid hash - use default grantha and first verse
    const defaultGrantha = granthaDataMap.get(defaultGranthaId);
    const firstRef = defaultGrantha ? getFirstVerseRef(defaultGrantha) : "1";

    // Load commentaries from localStorage
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
    window.history.replaceState(
      null,
      "",
      buildHash({
        granthaId: defaultGranthaId,
        verseRef: firstRef,
        commentaries: savedCommentaries,
      })
    );

    return {
      granthaId: defaultGranthaId,
      verseRef: firstRef,
      commentaries: savedCommentaries,
    };
  });

  // Listen to hashchange events (browser back/forward)
  useEffect(() => {
    if (typeof window === "undefined") return;

    function handleHashChange() {
      const hash = window.location.hash;
      const parsed = parseHash(hash);

      if (parsed && availableGranthas.includes(parsed.granthaId)) {
        const grantha = granthaDataMap.get(parsed.granthaId);

        // Validate verse ref
        if (grantha && isValidVerseRef(grantha, parsed.verseRef)) {
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

          setState({
            granthaId: parsed.granthaId,
            verseRef: parsed.verseRef,
            commentaries: parsed.commentaries || [],
          });
          return;
        }

        // Invalid verse - use first verse
        if (grantha) {
          const firstRef = getFirstVerseRef(grantha);
          window.history.replaceState(
            null,
            "",
            buildHash({
              granthaId: parsed.granthaId,
              verseRef: firstRef,
              commentaries: parsed.commentaries,
            })
          );
          setState({
            granthaId: parsed.granthaId,
            verseRef: firstRef,
            commentaries: parsed.commentaries || [],
          });
          return;
        }
      }

      // Invalid hash - revert to current state
      window.history.replaceState(
        null,
        "",
        buildHash({
          granthaId: state.granthaId,
          verseRef: state.verseRef,
          commentaries: state.commentaries,
        })
      );
    }

    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, [availableGranthas, granthaDataMap, state.granthaId, state.verseRef, state.commentaries]);

  // Function to update hash (called by components)
  const updateHash = (granthaId: string, verseRef: string, commentaries?: string[]) => {
    const newCommentaries = commentaries !== undefined ? commentaries : state.commentaries;

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
