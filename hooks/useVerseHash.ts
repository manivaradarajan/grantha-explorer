import { useEffect, useState, useCallback } from "react";
import { parseHash, buildHash, UrlState, ReadingMode, parseEditionIds } from "@/lib/hashUtils";

interface UseVerseHashReturn {
  granthaId: string;
  verseRef: string;
  editionId?: string;
  /** The active edition ids, in order — a single id, or a compare-mode
   *  comma-separated list split out. Absent = default edition. */
  editionIds: string[];
  commentaryOpen: boolean;
  subcommentaryIds?: string;
  /** Active reading mode ("flow" | "panes"). Absent in the hash defaults to "panes". */
  mode: ReadingMode;
  /** Label script ("deva" | "roman"). Absent in the hash defaults to "deva". */
  script: "deva" | "roman";
  updateHash: (
    granthaId: string,
    verseRef: string,
    editionId?: string,
    commentaryOpen?: boolean,
    replaceHistory?: boolean
  ) => void;
  updateCommentaryOpen: (isOpen: boolean) => void;
  updateSubcommentary: (subcommentaryId: string, isOpen: boolean) => void;
  updateMode: (mode: ReadingMode) => void;
  updateScript: (script: "deva" | "roman") => void;
  /** Set the active edition set (compare mode) as a comma-separated list.
   *  Call with a single id to return to single-commentator mode. */
  updateEditionIds: (ids: string[]) => void;
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
        mode: "panes",
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
        subcommentaryIds: parsed.subcommentaryIds,
        mode: parsed.mode ?? "panes",
        script: parsed.script ?? "deva",
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
      mode: "panes",
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
        subcommentaryIds: parsed.subcommentaryIds,
        mode: parsed.mode ?? "panes",
        script: parsed.script ?? "deva",
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

    // Switching grantha also resets active subcommentaries: another grantha's
    // subcommentary IDs are meaningless (resolved per-edition).
    const newSubcommentaryIds = granthaChanged
      ? undefined
      : state.subcommentaryIds;

    const potentialUrlState: UrlState = {
      ...state,
      granthaId,
      verseRef,
      editionId: newEditionId,
      commentaryOpen: commentaryOpen ?? state.commentaryOpen,
      subcommentaryIds: newSubcommentaryIds,
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

  const updateSubcommentary = (subcommentaryId: string, isOpen: boolean) => {
    const ids = (state.subcommentaryIds || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const nextIds = isOpen
      ? Array.from(new Set([...ids, subcommentaryId]))
      : ids.filter((id) => id !== subcommentaryId);

    const newHash = buildHash({
      ...state,
      subcommentaryIds: nextIds.length > 0 ? nextIds.join(",") : undefined,
    });

    if (typeof window !== "undefined" && window.location.hash !== newHash) {
      window.location.hash = newHash;
    }
  };

  /** Switch between the flow reader and the 3-pane reading modes. */
  const updateMode = useCallback((nextMode: ReadingMode) => {
    const newHash = buildHash({
      ...state,
      mode: nextMode,
    });

    if (typeof window !== "undefined" && window.location.hash !== newHash) {
      window.location.hash = newHash;
    }
  }, [state]);

  /** Set the label script (Devanagari / roman), persisted to the hash (?s=) so
   *  it travels with deep links and citations. The script is a display
   *  preference, so it's written via the includePreferences path. */
  const updateScript = useCallback((nextScript: "deva" | "roman") => {
    const newHash = buildHash(
      {
        ...state,
        script: nextScript,
      },
      true
    );

    if (typeof window !== "undefined" && window.location.hash !== newHash) {
      window.location.hash = newHash;
    }
  }, [state]);

  /** Set the active edition set (compare mode) as a comma-separated ?e= list.
   *  A single id returns to single-commentator mode; an empty list clears the
   *  edition entirely (default). */
  const updateEditionIds = useCallback((ids: string[]) => {
    const deduped = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    const newHash = buildHash({
      ...state,
      editionId: deduped.length > 0 ? deduped.join(",") : undefined,
    });

    if (typeof window !== "undefined" && window.location.hash !== newHash) {
      window.location.hash = newHash;
    }
  }, [state]);

  return {
    granthaId: state.granthaId,
    verseRef: state.verseRef,
    editionId: state.editionId,
    editionIds: parseEditionIds(state.editionId),
    commentaryOpen: state.commentaryOpen || false,
    subcommentaryIds: state.subcommentaryIds,
    mode: state.mode ?? "panes",
    script: state.script ?? "deva",
    updateHash,
    updateCommentaryOpen,
    updateScript,
    updateSubcommentary,
    updateMode,
    updateEditionIds,
  };
}
