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
  fetchSessions,
  upsertComment,
  setCommentStatus,
  startNewSession,
  SetCommentStatusRequest,
  ReviewComment,
  ReviewRoundSummary,
  ReviewSession,
  ReviewGetResponse,
} from "./reviewServer";
import { resolveAnchor } from "@/lib/reviewAnchor";

export interface ReviewModeState {
  session: ReviewSession | null;
  hasChanged: boolean;
  currentSources: Record<string, string>;
  /** The currently open round (comment file name, if any). */
  sessionFile?: string;
  /** All rounds for the grantha, newest first (for the picker). */
  rounds: ReviewRoundSummary[];
  /** Comments whose snippet could not be re-located in the current text. */
  detached: string[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  selectSession: (file: string | undefined) => Promise<void>;
  addComment: (comment: ReviewComment) => Promise<void>;
  updateStatus: (id: string, req: Omit<SetCommentStatusRequest, "id">) => Promise<void>;
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
  const [sessionFile, setSessionFile] = useState<string | undefined>(undefined);
  const [rounds, setRounds] = useState<ReviewRoundSummary[]>([]);
  const [hasChanged, setHasChanged] = useState(false);
  const [currentSources, setCurrentSources] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshRounds = useCallback(async () => {
    try {
      setRounds(await fetchSessions(granthaId));
    } catch {
      setRounds([]);
    }
  }, [granthaId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res: ReviewGetResponse = await fetchSession(granthaId, sessionFile);
      setSession(res.session);
      setHasChanged(res.has_changed);
      setCurrentSources(res.current_sources);
      await refreshRounds();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [granthaId, sessionFile, refreshRounds]);

  const selectSession = useCallback(
    async (file: string | undefined) => {
      setLoading(true);
      setError(null);
      try {
        const res: ReviewGetResponse = await fetchSession(granthaId, file);
        setSessionFile(file);
        setSession(res.session);
        setHasChanged(res.has_changed);
        setCurrentSources(res.current_sources);
        await refreshRounds();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [granthaId, refreshRounds],
  );

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
    async (id: string, req: Omit<SetCommentStatusRequest, "id">) => {
      setError(null);
      try {
        const res = await setCommentStatus(granthaId, { id, ...req });
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
      setSessionFile(undefined);
      setSession(res.session);
      await refreshRounds();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }, [granthaId, refreshRounds]);

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
      sessionFile,
      rounds,
      hasChanged,
      currentSources,
      detached,
      loading,
      error,
      refresh,
      selectSession,
      addComment,
      updateStatus,
      startNewSession: startNew,
    }),
    [session, sessionFile, rounds, hasChanged, currentSources, detached, loading, error, refresh, selectSession, addComment, updateStatus, startNew],
  );

  return (
    <ReviewModeContext.Provider value={value}>
      {children}
    </ReviewModeContext.Provider>
  );
}
