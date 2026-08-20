import type { Reference } from "./data";
import { toDevanagariNumerals } from "./stringUtils";

/**
 * Runtime reference diagnostics (plan §6) — the developer triage channel for
 * references that render unlinked in the reader.
 *
 * Emission (gated to dev) happens in `ReferenceLink` when a user clicks a
 * citation and it fails to resolve. Diagnostics accumulate in localStorage,
 * deduped by source grantha + passage + offset + code, and are surfaced on the
 * `#diagnostics` view. Per-target suppression is a committed config
 * (`public/data/reference-suppressions.json`).
 */

/** Reason codes (plan §6.1). */
export type ReferenceDiagCode =
  | "REF-NOT-IN-LIBRARY"
  | "REF-RUNTIME-DEPTH-OVERFLOW"
  | "REF-RUNTIME-UNRESOLVED";

/** One collected runtime diagnostic (plan §6.3). */
export interface ReferenceDiagnostic {
  code: ReferenceDiagCode;
  sourceGranthaId: string;
  sourcePassageRef: string;
  editionId?: string;
  /** The citation's `display_text` as written. */
  rawCitation: string;
  targetGranthaId: string;
  locator: string | null;
  /** The citation's `start` offset (dedupe key component). */
  offset: number;
  /** True when the target exists in `granthas-meta.json` (known, not ingested). */
  knownInMeta: boolean;
  /** Closest on-disk grantha id for REF-NOT-IN-LIBRARY triage. */
  nearMatchId?: string;
  lastSeenAt: string;
}

/** Committed per-target suppression config (plan §6.4). */
export interface ReferenceSuppressions {
  /** Suppress all codes for a target grantha id. */
  grantha_ids: string[];
  /** Suppress a specific target ref, "granthaId:locator". */
  refs: string[];
  /** Suppress a code globally. */
  codes: ReferenceDiagCode[];
}

const STORAGE_KEY = "grantha-reference-diagnostics";
const MAX_ENTRIES = 500;

const basePath = (): string => process.env.NEXT_PUBLIC_BASE_PATH || "";

const assetPath = (path: string): string => {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${basePath()}${normalized}`;
};

/**
 * Whether the diagnostics layer is enabled.
 *
 * Default-on in `next dev` (NODE_ENV !== "production"); overridable in a
 * production build via the `?diagnostics=refs` hash query or a persisted
 * localStorage flag (plan §6.2).
 */
export const isDiagnosticsEnabled = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  if (process.env.NODE_ENV !== "production") {
    return true;
  }
  if (window.location.hash.includes("diagnostics=refs")) {
    return true;
  }
  try {
    return window.localStorage.getItem("grantha-diagnostics-enabled") === "1";
  } catch {
    return false;
  }
};

/** True when the current hash is the `#diagnostics` view. */
export const isDiagnosticsHash = (hash: string): boolean =>
  hash.startsWith("#diagnostics");

const diagKey = (d: ReferenceDiagnostic): string =>
  [d.sourceGranthaId, d.sourcePassageRef, d.offset, d.code].join("::");

/** Read the accumulated log (never throws; empty on any storage failure). */
export const getReferenceDiagnostics = (): ReferenceDiagnostic[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ReferenceDiagnostic[]) : [];
  } catch {
    return [];
  }
};

/**
 * Append a diagnostic, deduped by
 * `sourceGranthaId + sourcePassageRef + offset + code` (plan §6.3). A
 * duplicate refreshes its `lastSeenAt`. The log is capped to
 * `MAX_ENTRIES` (oldest dropped).
 */
export const addReferenceDiagnostic = (diag: ReferenceDiagnostic): void => {
  try {
    const log = getReferenceDiagnostics();
    const existing = log.find((d) => diagKey(d) === diagKey(diag));
    const next = existing
      ? log.map((d) =>
          d === existing ? { ...d, lastSeenAt: diag.lastSeenAt } : d,
        )
      : [...log, diag].slice(-MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable — diagnostics are best-effort.
  }
};

/** Clear the accumulated log. */
export const clearReferenceDiagnostics = (): void => {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
};

/** Load the committed suppression config (empty default on any failure). */
export const loadReferenceSuppressions = async (): Promise<ReferenceSuppressions> => {
  try {
    const response = await fetch(assetPath("/data/reference-suppressions.json"));
    if (!response.ok) return { grantha_ids: [], refs: [], codes: [] };
    return (await response.json()) as ReferenceSuppressions;
  } catch {
    return { grantha_ids: [], refs: [], codes: [] };
  }
};

/**
 * True when a target is suppressed by the config (plan §6.4).
 *
 * Matches on the target grantha id (any code) or a specific
 * "granthaId:locator" ref, or the code globally.
 */
export const isReferenceSuppressed = (
  suppressions: ReferenceSuppressions,
  targetGranthaId: string,
  locator: string | null,
  code: ReferenceDiagCode,
): boolean =>
  suppressions.grantha_ids.includes(targetGranthaId) ||
  (locator != null && suppressions.refs.includes(`${targetGranthaId}:${locator}`)) ||
  suppressions.codes.includes(code);

/** Suggest the config line to suppress a target (for the diagnostics view). */
export const suppressionLine = (targetGranthaId: string): string =>
  `"${targetGranthaId}",`;

/** Format an entry as a BUGS.md line (copy-to-clipboard from the view). */
export const toBugsLine = (diag: ReferenceDiagnostic): string =>
  `- ${diag.targetGranthaId}${diag.locator ? ":" + diag.locator : ""} — ${diag.code} (cited "${diag.rawCitation}" in ${diag.sourceGranthaId}:${diag.sourcePassageRef})`;

/** Display a locator in Devanagari numerals for the view. */
export const displayLocator = (locator: string | null): string =>
  locator ? toDevanagariNumerals(locator) : "(whole work)";

/** Build a diagnostic from a reference resolution failure. */
export interface ResolveFailureInput {
  reference: Reference;
  sourceGranthaId: string;
  sourcePassageRef: string;
  editionId?: string;
  code: ReferenceDiagCode;
  availableGranthaIds: string[];
  knownInMeta: boolean;
  nearMatchId?: string;
}

export const buildDiagnostic = (input: ResolveFailureInput): ReferenceDiagnostic => ({
  code: input.code,
  sourceGranthaId: input.sourceGranthaId,
  sourcePassageRef: input.sourcePassageRef,
  editionId: input.editionId,
  rawCitation: input.reference.display_text,
  targetGranthaId: input.reference.grantha_id ?? "",
  locator: input.reference.locator,
  offset: input.reference.start,
  knownInMeta: input.knownInMeta,
  nearMatchId: input.nearMatchId,
  lastSeenAt: new Date().toISOString(),
});
