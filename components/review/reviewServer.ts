/**
 * Client for the standalone review server (``scripts/review-server.mjs``).
 *
 * The edit-mode UI talks to this local server over HTTP (127.0.0.1:4321 by
 * default). It persists code-review-style annotations as a timestamped,
 * per-session JSON artifact in grantha-data.
 */

export type ReviewCommentType = "citation-fix" | "quote-locate" | "note";
export type ReviewStatus = "open" | "done" | "dismissed" | "deleted";
export type PassageType = "main" | "prefatory" | "concluding";

export interface ReviewAnchor {
  start: number;
  end: number;
  line: number;
  snippet: string;
}

export interface ReviewReference {
  index: number;
  start: number;
  end: number;
  display_text: string;
  locator?: string;
  grantha_id?: string;
}

export interface ReviewSuggestedFix {
  locator?: string;
  grantha_id?: string;
  display_text?: string;
  note?: string;
}

export interface ReviewComment {
  id: string;
  type: ReviewCommentType;
  status: ReviewStatus;
  passage_ref: string;
  passage_type: PassageType;
  kind?: string;
  anchor: ReviewAnchor;
  reference?: ReviewReference;
  body: string;
  suggested_fix?: ReviewSuggestedFix;
  source_file?: string;
  part_num?: number;
  source_hash?: string;
  created_at?: string;
  updated_at?: string;
  hash_changed?: boolean;
}

export interface ReviewSession {
  grantha_id: string;
  session_started_at: string;
  updated_at: string;
  revision: number;
  sources: Record<string, string>;
  comments: ReviewComment[];
}

export interface ReviewGetResponse {
  session: ReviewSession | null;
  current_sources: Record<string, string>;
  has_changed: boolean;
}

export const REVIEW_SERVER_PORT = 4321;

/** Base URL of the local review server. Overridable for tests/dev via
 *  `window.REVIEW_SERVER_BASE` when set. */
export const reviewServerBase = (): string => {
  if (typeof window !== "undefined") {
    const overridden = (window as unknown as { REVIEW_SERVER_BASE?: string })
      .REVIEW_SERVER_BASE;
    if (overridden) return overridden;
  }
  return `http://127.0.0.1:${REVIEW_SERVER_PORT}`;
};

export class ReviewServerError extends Error {
  readonly status: number;
  readonly fields?: Record<string, string>;

  constructor(status: number, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = "ReviewServerError";
    this.status = status;
    this.fields = fields;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(reviewServerBase() + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ReviewServerError(
      0,
      `review server unreachable at ${reviewServerBase()} — ` +
        "is `npm run review:server` running?",
      undefined,
    );
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    const body = data as { error?: unknown; fields?: Record<string, string> } | null;
    const msg =
      body && "error" in body
        ? String(body.error)
        : `HTTP ${res.status}`;
    const fields = body?.fields;
    const detail = fields
      ? Object.entries(fields)
          .map(([k, v]) => `${k}: ${v}`)
          .join("; ")
      : undefined;
    throw new ReviewServerError(
      res.status,
      detail ? `${msg} — ${detail}` : msg,
      fields,
    );
  }
  return data as T;
}

export function fetchSession(
  granthaId: string,
): Promise<ReviewGetResponse> {
  return request<ReviewGetResponse>(
    "GET",
    `/api/review?grantha=${encodeURIComponent(granthaId)}`,
  );
}

export async function upsertComment(
  granthaId: string,
  comment: ReviewComment,
): Promise<{ session: ReviewSession; hash_changed?: boolean }> {
  const res = await request<{ session: ReviewSession; hash_changed?: boolean }>(
    "POST",
    `/api/review?grantha=${encodeURIComponent(granthaId)}`,
    comment,
  );
  return res;
}

export async function setCommentStatus(
  granthaId: string,
  id: string,
  status: ReviewStatus,
): Promise<{ session: ReviewSession }> {
  return request<{ session: ReviewSession }>(
    "PATCH",
    `/api/review/status?grantha=${encodeURIComponent(granthaId)}`,
    { id, status },
  );
}

export async function startNewSession(
  granthaId: string,
): Promise<{ session: ReviewSession }> {
  return request<{ session: ReviewSession }>(
    "POST",
    `/api/review?grantha=${encodeURIComponent(granthaId)}`,
    { session: "new" },
  );
}

export interface CitationCandidate {
  grantha_id: string;
  edition_id: string;
  ref: string;
  quality: number;
  excerpt: string;
}

export interface CandidateRequest {
  /** Target grantha to scan; omit (or set corpus: true) for a corpus-wide search. */
  target?: string;
  edition?: string;
  needle: string;
  exclude_locator?: string;
  min_quality?: number;
  /** Search the whole corpus (used when no target reference is detected). */
  corpus?: boolean;
}

/** Fetch citation-fix candidates (Python-backed scan on the review server). */
export function fetchCandidates(
  req: CandidateRequest,
): Promise<{ candidates: CitationCandidate[] }> {
  return request<{ candidates: CitationCandidate[] }>(
    "POST",
    "/api/review/candidates",
    req,
  );
}
