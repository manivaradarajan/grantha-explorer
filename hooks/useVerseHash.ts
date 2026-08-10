import { useEffect, useState, useRef, useCallback } from "react";
import { parseHash, buildHash, UrlState } from "@/lib/hashUtils";
import { Grantha, GranthaMeta } from "@/lib/data"; // Assuming Grantha and GranthaMeta are exported from lib/data

interface UseVerseHashReturn {
  granthaId: string;
  verseRef: string;
  editionId?: string;
  commentaryOpen: boolean;
  updateHash: (
    granthaId: string,
    verseRef: string,
    editionId?: string,
    commentaryOpen?: boolean,
    replaceHistory?: boolean
  ) => void; // Reverted to void
  updateCommentaryOpen: (isOpen: boolean) => void;
}

/**
 * Simplified custom hook for managing hash-based verse navigation
 *
 * Key improvements:
 * - Single source of truth: URL hash
 * - No "trust the hash" hacks
 * - Event listener uses refs (no dependency issues)
 * - Validation happens in components via React Query
 * - Edition state (e.g. which commentary of a text is active) lives in the
 *   hash as `?e=<edition_id>`; absent means the grantha's default edition.
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
  const getInitialState = (): UrlState => {
    if (typeof window === "undefined") {
      return {
        granthaId: defaultGranthaId,
        verseRef: defaultVerseRef,
        commentaryOpen: false,
      };
    }

    const hash = window.location.hash;
    const parsed = parseHash(hash);

    if (parsed && parsed.granthaId && parsed.verseRef) {
      return {
        granthaId: parsed.granthaId,
        verseRef: parsed.verseRef,
        editionId: parsed.editionId,
        commentaryOpen: parsed.commentaryOpen || false,
      };
    }

    // No valid hash - set a default hash
    const initialHash = buildHash({
      granthaId: defaultGranthaId,
      verseRef: defaultVerseRef,
      commentaryOpen: false,
    });
    window.history.replaceState(null, "", initialHash);

    return {
      granthaId: defaultGranthaId,
      verseRef: defaultVerseRef,
      commentaryOpen: false,
    };
  };

  const [state, setState] = useState(getInitialState);

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

      // Update state from hash
      setState({
        granthaId: parsed.granthaId,
        verseRef: parsed.verseRef,
        editionId: parsed.editionId,
        commentaryOpen: parsed.commentaryOpen || false,
      });
    }

    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []); // Empty deps - listener created once

  // Function to update hash (called by components)
  const updateHash = useCallback((
    granthaId: string,
    verseRef: string,
    editionId?: string,
    commentaryOpen?: boolean,
    replaceHistory: boolean = false
  ) => {
    // Switching grantha always resets the edition: another grantha's edition
    // id is meaningless (its editions are resolved independently). Same-grantha
    // navigation keeps the current edition unless one is passed explicitly.
    // The empty string "" is an explicit "clear the edition" sentinel (used
    // when a stale ?e= must be dropped, e.g. on a single-edition grantha).
    const granthaChanged = granthaId !== state.granthaId;
    const newEditionId =
      editionId === ""
        ? undefined
        : editionId !== undefined
          ? editionId
          : granthaChanged
            ? undefined
            : state.editionId;

    const potentialUrlState: UrlState = {
      ...state,
      granthaId,
      verseRef,
      editionId: newEditionId,
      commentaryOpen: commentaryOpen ?? state.commentaryOpen,
    };

    const newHash = buildHash(potentialUrlState);

    // Only update if different from current hash
    if (typeof window !== "undefined" && window.location.hash !== newHash) {
      if (replaceHistory) {
        window.history.replaceState(null, "", newHash);
        setState(potentialUrlState);
      } else {
        window.location.hash = newHash;
        // State updated via hashchange listener
      }
    }
  }, [state]);

  const updateCommentaryOpen = (isOpen: boolean) => {
    const newHash = buildHash({
      ...state,
      commentaryOpen: isOpen,
    });

    if (typeof window !== "undefined" && window.location.hash !== newHash) {
      window.location.hash = newHash;
    }
  };

  return {
    granthaId: state.granthaId,
    verseRef: state.verseRef,
    editionId: state.editionId,
    commentaryOpen: state.commentaryOpen || false,
    updateHash,
    updateCommentaryOpen,
  };
}
