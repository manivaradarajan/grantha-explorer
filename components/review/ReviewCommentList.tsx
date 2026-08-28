"use client";

import React from "react";
import { ReviewComment } from "./reviewServer";
import { useReviewMode } from "./ReviewModeProvider";
import { toDevanagariNumerals } from "@/lib/stringUtils";
import { compareRefs } from "@/lib/data";

/** Right-hand list of review comments for the current session. */
export function ReviewCommentList({
  onSelect,
  onEdit,
  activePassageRef,
  activeCommentId,
}: {
  onSelect?: (id: string) => void;
  onEdit?: (c: ReviewComment) => void;
  activePassageRef?: string;
  activeCommentId?: string | null;
}) {
  const { session, detached, hasChanged, loading, error, refresh, updateStatus, startNewSession } =
    useReviewMode();

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

  const active = [...session.comments.filter((c) => c.status !== "deleted")].sort(sortByHighlightOrder);
  const deleted = [...session.comments.filter((c) => c.status === "deleted")].sort(sortByHighlightOrder);
  const openCount = active.filter((c) => c.status === "open").length;

  return (
    <div className="review-panel">
      <div className="review-panel-head">
        <h2>Review comments</h2>
        <span className="review-panel-count">
          {openCount} open · rev {session.revision}
        </span>
        {hasChanged && (
          <span className="review-drift-badge">source changed</span>
        )}
      </div>
      <div className="review-panel-actions">
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
            onStatus={(s) => void updateStatus(c.id, s)}
          />
        ))}
        {deleted.length > 0 && (
          <div className="review-deleted-section">
            <div className="review-deleted-head">
              Deleted ({deleted.length})
            </div>
            {deleted.map((c) => (
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
                onStatus={(s) => void updateStatus(c.id, s)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewCommentCard({
  comment: c,
  detached,
  isActive,
  onSelect,
  onEdit,
  onStatus,
}: {
  comment: ReviewComment;
  detached: boolean;
  isActive?: boolean;
  onSelect?: () => void;
  onEdit?: (c: ReviewComment) => void;
  onStatus: (s: ReviewComment["status"]) => void;
}) {
  const kindLabel =
    c.type === "citation-fix" ? "citation-fix" : c.type === "quote-locate" ? "quote-locate" : "note";
  const kindCls =
    c.type === "citation-fix" ? "k-fix" : c.type === "quote-locate" ? "k-quote" : "k-note";

  // Unified action model: Reopen is the single "back to open" action for every
  // non-open state (done / dismissed / deleted). "Won't fix" acknowledges and
  // keeps on record; Delete is a soft delete (recoverable via Reopen).
  const actions: { label: string; status: ReviewComment["status"] }[] = [];
  if (c.status === "open") {
    actions.push({ label: "Done", status: "done" });
    actions.push({ label: "Won't fix", status: "dismissed" });
    actions.push({ label: "Delete", status: "deleted" });
  } else {
    actions.push({ label: "Reopen", status: "open" });
    if (c.status === "done") {
      actions.push({ label: "Won't fix", status: "dismissed" });
    }
    if (c.status !== "deleted") {
      actions.push({ label: "Delete", status: "deleted" });
    }
  }

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
        <span className={`review-status-chip ${c.status}`}>{c.status}</span>
      </div>
      <div className="review-card-body">{c.body}</div>
      <div className="review-card-snippet">{c.anchor.snippet}</div>
      {c.suggested_fix?.locator && (
        <div className="review-card-fix">→ {c.suggested_fix.locator}</div>
      )}
      <div className="review-card-meta">
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
        {actions.map(({ label, status }) => (
          <button
            key={status}
            onClick={(e) => {
              e.stopPropagation();
              onStatus(status);
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
