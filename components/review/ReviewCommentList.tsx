"use client";

import React, { useState } from "react";
import { ReviewComment, ReviewRoundSummary } from "./reviewServer";
import { useReviewMode } from "./ReviewModeProvider";
import { toDevanagariNumerals } from "@/lib/stringUtils";
import { compareRefs } from "@/lib/data";

/** A short, human-readable label for a review round in the picker. */
function formatRoundLabel(r: ReviewRoundSummary): string {
  const c = r.counts;
  const total =
    (c.open ?? 0) + (c.fixed ?? 0) + (c.accepted ?? 0) + (c.reopened ?? 0);
  const d = r.started_at || r.updated_at || "";
  // A fixed date shape (not locale-sliced) so the label is stable across
  // locales; Devanagari numerals follow the file's toDevanagariNumerals convention.
  const when = d
    ? ` · ${toDevanagariNumerals(new Date(d).toLocaleDateString("en-GB"))}`
    : "";
  return `rev ${r.revision} (${total} active${when})`;
}

/** Right-hand list of review comments for the current session. */
export function ReviewCommentList({
  onSelect,
  onEdit,
  activePassageRef,
  activeCommentId,
  filter: filterProp,
  onFilterChange,
}: {
  onSelect?: (id: string) => void;
  onEdit?: (c: ReviewComment) => void;
  activePassageRef?: string;
  activeCommentId?: string | null;
  /** Controlled "all | not-accepted" filter. When omitted the list owns its own
   *  filter state (backward compatible with direct-mount usage). */
  filter?: "all" | "not-accepted";
  /** Called with the new filter when the user changes it (controlled mode). */
  onFilterChange?: (f: "all" | "not-accepted") => void;
}) {
  const { session, sessionFile, rounds, detached, hasChanged, loading, error, refresh, selectSession, updateStatus, startNewSession } =
    useReviewMode();
  const [internalFilter, setInternalFilter] = useState<"all" | "not-accepted">("all");
  const [showDeleted, setShowDeleted] = useState(false);
  const controlled = filterProp !== undefined;
  const filter = filterProp ?? internalFilter;
  const changeFilter = (f: "all" | "not-accepted") => {
    if (controlled) {
      onFilterChange?.(f);
    } else {
      setInternalFilter(f);
    }
  };

  if (loading) {
    return <div className="review-panel-empty">Loading review session…</div>;
  }
  if (error) {
    return (
      <div className="review-panel-empty">
        <div className="review-panel-error">{error}</div>
        <button className="review-link-btn" onClick={() => void refresh()}>
          Retry
        </button>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="review-panel-empty">
        <div>No review session for this grantha yet.</div>
        <div className="review-panel-hint">
          Select text on the reading surface to add the first comment.
        </div>
      </div>
    );
  }

  const sortByHighlightOrder = (a: ReviewComment, b: ReviewComment): number => {
    const refCmp = compareRefs(a.passage_ref, b.passage_ref);
    if (refCmp !== 0) return refCmp;
    return (a.anchor.start ?? 0) - (b.anchor.start ?? 0);
  };

  const activeAll = [...session.comments.filter((c) => c.status !== "deleted")].sort(sortByHighlightOrder);
  const deleted = [...session.comments.filter((c) => c.status === "deleted")].sort(sortByHighlightOrder);
  const openCount = activeAll.filter(
    (c) => c.status === "open" || c.status === "reopened",
  ).length;
  const needsReviewCount = activeAll.filter((c) => c.status === "fixed").length;
  const notAccepted = [
    "open",
    "reopened",
    "fixed",
  ];
  const active =
    filter === "not-accepted"
      ? activeAll.filter((c) => notAccepted.includes(c.status))
      : activeAll;

  return (
    <div className="review-panel">
      <div className="review-panel-head">
        <h2>Review comments</h2>
        <span className="review-panel-count">
          {openCount} open · {needsReviewCount} to review · rev {session.revision}
        </span>
        {hasChanged && (
          <span className="review-drift-badge">source changed</span>
        )}
      </div>
      <div className="review-panel-actions">
        <select
          className="review-round-select"
          aria-label="Review round"
          value={sessionFile ?? ""}
          onChange={(e) => void selectSession(e.target.value || undefined)}
          disabled={rounds.length === 0}
        >
          {rounds.length === 0 ? (
            <option value="">No rounds</option>
          ) : (
            <>
              <option value="">{sessionFile ? "(other round)" : `latest · rev ${session.revision}`}</option>
              {rounds.map((r) => (
                <option key={r.name} value={r.name}>
                  {formatRoundLabel(r)}
                </option>
              ))}
            </>
          )}
        </select>
        <select
          className="review-filter-select"
          aria-label="Filter comments"
          value={filter}
          onChange={(e) => changeFilter(e.target.value as "all" | "not-accepted")}
        >
          <option value="all">All</option>
          <option value="not-accepted">Not yet accepted</option>
        </select>
        <button
          className="review-link-btn"
          onClick={() => void startNewSession()}
        >
          ＋ New review
        </button>
      </div>
      <div className="review-panel-list">
        {active.map((c) => (
          <ReviewCommentCard
            key={c.id}
            comment={c}
            detached={detached.includes(c.id)}
            isActive={
              activeCommentId
                ? c.id === activeCommentId
                : c.passage_ref === activePassageRef
            }
            onSelect={onSelect ? () => onSelect(c.id) : undefined}
            onEdit={onEdit ? () => onEdit(c) : undefined}
            onStatus={(s) => void updateStatus(c.id, { status: s })}
            onStatusWithPrompt={(s, meta) => void updateStatus(c.id, { status: s, ...meta })}
          />
        ))}
        {deleted.length > 0 && (
          <div className="review-deleted-section">
            <button
              className="review-deleted-head"
              onClick={() => setShowDeleted((v) => !v)}
              aria-expanded={showDeleted}
            >
              Deleted ({deleted.length}) {showDeleted ? "▾" : "▸"}
            </button>
            {showDeleted &&
              deleted.map((c) => (
                <ReviewCommentCard
                  key={c.id}
                  comment={c}
                  detached={detached.includes(c.id)}
                  isActive={
                    activeCommentId
                      ? c.id === activeCommentId
                      : c.passage_ref === activePassageRef
                  }
                  onSelect={onSelect ? () => onSelect(c.id) : undefined}
                  onEdit={onEdit ? () => onEdit(c) : undefined}
                  onStatus={(s) => void updateStatus(c.id, { status: s })}
                  onStatusWithPrompt={(s, meta) => void updateStatus(c.id, { status: s, ...meta })}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lifecycle action table
// ---------------------------------------------------------------------------

type ActionDef = {
  label: string;
  status: ReviewComment["status"];
  prompt?: "fix" | "needs-work";
};

const ACCEPT_ACTION: ActionDef = { label: "Accept", status: "accepted" };

/** Per-status base action lists for the comment card action buttons.
 *  The ``reopened`` list omits the conditional Accept; ``buildCommentActions``
 *  splices it in when the comment already has recorded fixes. */
const LIFECYCLE_ACTIONS: Record<ReviewComment["status"], ActionDef[]> = {
  open: [
    { label: "Mark fixed", status: "fixed", prompt: "fix" },
    { label: "Won't fix", status: "dismissed" },
    { label: "Delete", status: "deleted" },
  ],
  reopened: [
    { label: "Mark fixed", status: "fixed", prompt: "fix" },
    // Accept is inserted here (position 1) when c.fixes is non-empty.
    { label: "Reopen", status: "open" },
    { label: "Won't fix", status: "dismissed" },
    { label: "Delete", status: "deleted" },
  ],
  fixed: [
    ACCEPT_ACTION,
    { label: "Needs work", status: "reopened", prompt: "needs-work" },
    { label: "Reopen", status: "open" },
    { label: "Won't fix", status: "dismissed" },
    { label: "Delete", status: "deleted" },
  ],
  accepted: [
    { label: "Reopen", status: "open" },
    { label: "Won't fix", status: "dismissed" },
    { label: "Delete", status: "deleted" },
  ],
  // "done" is a legacy alias for "accepted".
  done: [
    { label: "Reopen", status: "open" },
    { label: "Won't fix", status: "dismissed" },
    { label: "Delete", status: "deleted" },
  ],
  dismissed: [
    { label: "Reopen", status: "open" },
    { label: "Delete", status: "deleted" },
  ],
  deleted: [{ label: "Reopen", status: "open" }],
};

/**
 * Build the ordered action list for a comment based on its current status.
 *
 * Uses {@link LIFECYCLE_ACTIONS} as the base and splices the Accept action
 * into position 1 for `reopened` comments that already have recorded fixes.
 */
function buildCommentActions(c: ReviewComment): ActionDef[] {
  const base = LIFECYCLE_ACTIONS[c.status] ?? [];
  if (c.status === "reopened" && (c.fixes?.length ?? 0) > 0) {
    // Splice Accept in at position 1 (after "Mark fixed").
    return [base[0], ACCEPT_ACTION, ...base.slice(1)];
  }
  return base;
}

function ReviewCommentCard({
  comment: c,
  detached,
  isActive,
  onSelect,
  onEdit,
  onStatus,
  onStatusWithPrompt,
}: {
  comment: ReviewComment;
  detached: boolean;
  isActive?: boolean;
  onSelect?: () => void;
  onEdit?: (c: ReviewComment) => void;
  onStatus: (s: ReviewComment["status"]) => void;
  onStatusWithPrompt: (s: ReviewComment["status"], meta: { summary?: string; note?: string }) => void;
}) {
  const kindLabel =
    c.type === "citation-fix" ? "citation-fix" : c.type === "quote-locate" ? "quote-locate" : "note";
  const kindCls =
    c.type === "citation-fix" ? "k-fix" : c.type === "quote-locate" ? "k-quote" : "k-note";

  // A short inline form for the reviewer's note/summary prompt.
  const [promptFor, setPromptFor] = useState<
    | { kind: "fix" }
    | { kind: "needs-work" }
    | null
  >(null);
  const [promptText, setPromptText] = useState("");

  const actions = buildCommentActions(c);

  const onAction = (a: ActionDef) => {
    if (a.prompt === "fix" || a.prompt === "needs-work") {
      setPromptFor({ kind: a.prompt });
      setPromptText("");
      return;
    }
    void onStatus(a.status);
  };

  const submitPrompt = () => {
    if (!promptFor) return;
    if (!promptText.trim()) return;
    if (promptFor.kind === "fix") {
      onStatusWithPrompt("fixed", { summary: promptText.trim() });
    } else {
      onStatusWithPrompt("reopened", { note: promptText.trim() });
    }
    setPromptFor(null);
    setPromptText("");
  };

  return (
    <div
      data-comment-id={c.id}
      data-comment-passage={c.passage_ref}
      className={`review-card${c.status === "open" ? " open" : ""}${isActive ? " review-card-active" : ""}`}
      onClick={onSelect}
    >
      <div className="review-card-row1">
        <span className={`review-kind-badge ${kindCls}`}>{kindLabel}</span>
        <span className="review-card-para" title={`${c.kind ?? "passage"} ${c.passage_ref}`}>
          {toDevanagariNumerals(c.passage_ref)}
        </span>
        <span className="review-card-loc">
          §{c.passage_ref}
          {c.anchor.line ? ` · ${c.anchor.line}` : ""}
        </span>
      </div>
      <div className="review-card-body">{c.body}</div>
      <div className="review-card-snippet">{c.anchor.snippet}</div>
      {c.suggested_fix?.locator && (
        <div className="review-card-fix">→ {c.suggested_fix.locator}</div>
      )}
      {c.fixes && c.fixes.length > 0 && (
        <div className="review-card-fixes">
          {c.fixes.map((f, i) => (
            <div key={i} className="review-card-fix-entry">
              <span className="review-fix-by">{f.applied_by} · </span>
              {f.summary}
            </div>
          ))}
        </div>
      )}
      {c.follow_ups && c.follow_ups.length > 0 && (
        <div className="review-card-followups">
          {c.follow_ups.map((f, i) => (
            <div key={i} className="review-card-followup-entry">
              <span className="review-fix-by">{f.by} said: </span>
              {f.note}
            </div>
          ))}
        </div>
      )}
      <div className="review-card-meta">
        <span className={`review-status-chip ${c.status}`}>{c.status}</span>
        {c.source_file && <span className="review-card-file">{c.source_file}</span>}
        {c.source_hash && (
          <span className="review-card-hash">{c.source_hash.slice(0, 8)}</span>
        )}
        {detached && <span className="review-detached-badge">text not found</span>}
        {c.hash_changed && <span className="review-drift-badge">md changed</span>}
      </div>
      <div className="review-card-actions">
        {onEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(c);
            }}
          >
            Edit
          </button>
        )}
        {actions.map((a) => (
          <button
            key={`${a.status}-${a.prompt ?? ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onAction(a);
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
      {promptFor && (
        <div
          className="review-card-prompt"
          onClick={(e) => e.stopPropagation()}
        >
          <textarea
            className="review-prompt-input"
            rows={2}
            value={promptText}
            placeholder={
              promptFor.kind === "fix"
                ? "Summary of the applied fix…"
                : "What still needs work?…"
            }
            onChange={(e) => setPromptText(e.target.value)}
          />
          <div className="review-prompt-actions">
            <button onClick={submitPrompt} disabled={!promptText.trim()}>
              {promptFor.kind === "fix" ? "Submit fix" : "Submit"}
            </button>
            <button onClick={() => { setPromptFor(null); setPromptText(""); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
