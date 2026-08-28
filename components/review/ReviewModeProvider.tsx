"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  fetchSession,
  upsertComment,
  setCommentStatus,
  startNewSession,
  ReviewComment,
  ReviewSession,
  ReviewGetResponse,
} from "./reviewServer";
import { resolveAnchor } from "@/lib/reviewAnchor";

/** A review highlight to paint on the reading surface: the comment's anchor
 *  span (possibly re-located against the current passage) plus the comment id. */
export interface ReviewHighlight {
  passageRef: string;
  span: { start: number; end: number };
  commentId: string;
  type: ReviewComment["type"];
  status: ReviewComment["status"];
  drift: boolean;
}

export interface ReviewModeState {
  session: ReviewSession | null;
  hasChanged: boolean;
  currentSources: Record<string, string>;
  /** Comments whose snippet could not be re-located in the current text. */
  detached: string[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addComment: (comment: ReviewComment) => Promise<void>;
  updateStatus: (id: string, status: ReviewComment["status"]) => Promise<void>;
  startNewSession: () => Promise<void>;
}

const ReviewModeContext = createContext<ReviewModeState | null>(null);

export const useReviewMode = (): ReviewModeState => {
  const ctx = useContext(ReviewModeContext);
  if (!ctx) {
    throw new Error("useReviewMode must be used within ReviewModeProvider");
  }
  return ctx;
};

interface ReviewModeProviderProps {
  granthaId: string;
  /** Map of passageRef → raw devanagari, used to re-locate snippets on load. */
  passageTexts: Record<string, string>;
  children: React.ReactNode;
}

/**
 * Loads and persists the review session for a grantha. Comments are anchored
 * by their raw snippet; on load each is re-located against the CURRENT passage
 * text so a stale offset never paints a wrong-position highlight.
 */
export function ReviewModeProvider({
  granthaId,
  passageTexts,
  children,
}: ReviewModeProviderProps) {
  const [session, setSession] = useState<ReviewSession | null>(null);
  const [hasChanged, setHasChanged] = useState(false);
  const [currentSources, setCurrentSources] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res: ReviewGetResponse = await fetchSession(granthaId);
      setSession(res.session);
      setHasChanged(res.has_changed);
      setCurrentSources(res.current_sources);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [granthaId]);

  const addComment = useCallback(
    async (comment: ReviewComment) => {
      setError(null);
      try {
        const res = await upsertComment(granthaId, comment);
        setSession(res.session);
        if (res.hash_changed) setHasChanged(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        throw e;
      }
    },
    [granthaId],
  );

  const updateStatus = useCallback(
    async (id: string, status: ReviewComment["status"]) => {
      setError(null);
      try {
        const res = await setCommentStatus(granthaId, id, status);
        setSession(res.session);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        throw e;
      }
    },
    [granthaId],
  );

  const startNew = useCallback(async () => {
    setError(null);
    try {
      const res = await startNewSession(granthaId);
      setSession(res.session);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }, [granthaId]);

  // Load the latest session on mount / grantha change.
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [granthaId]);

  // Re-locate snippets on load or session change.
  const detached = useMemo(() => {
    if (!session) return [];
    const out: string[] = [];
    for (const c of session.comments) {
      const raw = passageTexts[c.passage_ref];
      if (!raw || !resolveAnchor(raw, c.anchor.snippet, c.anchor.start, c.anchor.end)) {
        out.push(c.id);
      }
    }
    return out;
  }, [session, passageTexts]);

  const value = useMemo<ReviewModeState>(
    () => ({
      session,
      hasChanged,
      currentSources,
      detached,
      loading,
      error,
      refresh,
      addComment,
      updateStatus,
      startNewSession: startNew,
    }),
    [session, hasChanged, currentSources, detached, loading, error, refresh, addComment, updateStatus, startNew],
  );

  return (
    <ReviewModeContext.Provider value={value}>
      {children}
    </ReviewModeContext.Provider>
  );
}

/** Compute the review highlights to paint on the current passage: comments in
 *  the session whose anchor snippet exists in this passage, located by
 *  first-occurrence (the snippet is unique by construction at creation). */
export function useReviewHighlightsFor(
  passageRef: string,
  passageRaw: string,
): ReviewHighlight[] {
  const ctx = useReviewMode();
  if (!ctx.session) return [];
  return ctx.session.comments
    .filter((c) => {
      if (c.passage_ref !== passageRef) return false;
      if (c.status === "deleted") return false;
      if (ctx.detached.includes(c.id)) return false;
      return !!resolveAnchor(passageRaw, c.anchor.snippet, c.anchor.start, c.anchor.end);
    })
    .map((c) => {
      const loc = resolveAnchor(passageRaw, c.anchor.snippet, c.anchor.start, c.anchor.end)!;
      return {
        passageRef,
        span: { start: loc.start, end: loc.end },
        commentId: c.id,
        type: c.type,
        status: c.status,
        drift: !!c.hash_changed,
      };
    });
}
