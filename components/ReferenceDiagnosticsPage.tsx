"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ReferenceDiagnostic,
  getReferenceDiagnostics,
  clearReferenceDiagnostics,
  loadReferenceSuppressions,
  ReferenceSuppressions,
  ReferenceDiagCode,
  isReferenceSuppressed,
  displayLocator,
  toBugsLine,
  suppressionLine,
} from "@/lib/referenceDiagnostics";

/**
 * `#diagnostics` view — the runtime reference-diagnostic triage page
 * (plan §6.5). Hash-routed inside the SPA (intercepted before parseHash, no
 * new Next.js route). Shows the accumulated dev log, grouped and filterable
 * by reason code, with per-entry actions:
 *   - copy a `reference-suppressions.json` line (suppress target)
 *   - copy a `BUGS.md` line
 *   - clear the log
 */

const CODE_LABELS: Record<ReferenceDiagCode, string> = {
  "REF-NOT-IN-LIBRARY": "Not in library",
  "REF-RUNTIME-DEPTH-OVERFLOW": "Depth overflow",
  "REF-RUNTIME-UNRESOLVED": "Unresolved",
};

const copyToClipboard = async (text: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard unavailable in this context.
  }
};

export default function ReferenceDiagnosticsPage() {
  const [entries, setEntries] = useState<ReferenceDiagnostic[]>(() =>
    getReferenceDiagnostics(),
  );
  const [filter, setFilter] = useState<string>("all");
  const [suppressions, setSuppressions] = useState<ReferenceSuppressions>({
    grantha_ids: [],
    refs: [],
    codes: [],
  });
  const [copied, setCopied] = useState<string | null>(null);
  const [prodOverride, setProdOverride] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem("grantha-diagnostics-enabled") === "1";
    } catch {
      return false;
    }
  });

  const toggleProdOverride = () => {
    try {
      const next = !prodOverride;
      window.localStorage.setItem(
        "grantha-diagnostics-enabled",
        next ? "1" : "0",
      );
      setProdOverride(next);
    } catch {
      // no-op
    }
  };

  useEffect(() => {
    loadReferenceSuppressions().then(setSuppressions);
  }, []);

  const codes = useMemo(() => {
    const set = new Set(entries.map((e) => e.code));
    return [...set];
  }, [entries]);

  // Apply the committed per-target suppression config: suppressed entries are
  // hidden from the view (they are "known, not a bug") while remaining in the
  // raw log. Counts and filters operate on the visible set.
  const suppressedCount = useMemo(
    () =>
      entries.filter((e) =>
        isReferenceSuppressed(suppressions, e.targetGranthaId, e.locator, e.code),
      ).length,
    [entries, suppressions],
  );

  const visible = useMemo(
    () =>
      entries.filter(
        (e) =>
          !isReferenceSuppressed(suppressions, e.targetGranthaId, e.locator, e.code),
      ),
    [entries, suppressions],
  );

  const filtered = useMemo(
    () => (filter === "all" ? visible : visible.filter((e) => e.code === filter)),
    [visible, filter],
  );

  const copy = async (label: string, text: string) => {
    await copyToClipboard(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1200);
  };

  return (
    <main className="min-h-screen bg-white text-gray-900 p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold font-serif">Reference diagnostics</h1>
        <button
          type="button"
          onClick={() => {
            clearReferenceDiagnostics();
            setEntries([]);
          }}
          className="text-sm text-gray-500 hover:text-gray-800"
        >
          Clear log
        </button>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Dev-mode triage for cross-references that render unlinked. Clicking a
        citation that fails to resolve is logged here;{" "}
        <code className="text-xs bg-gray-100 px-1 rounded">#diagnostics</code>{" "}
        is a hash view inside the reader.
      </p>

      <div className="mb-4 text-xs text-gray-500">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={prodOverride}
            onChange={toggleProdOverride}
          />
          Enable diagnostics in production builds (persisted to localStorage;
          equivalent to appending{" "}
          <code className="bg-gray-100 px-1 rounded">?diagnostics=refs</code>)
        </label>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`px-3 py-1 rounded-full text-xs ${
            filter === "all"
              ? "bg-gray-800 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          all ({visible.length})
        </button>
        {codes.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setFilter(code)}
            className={`px-3 py-1 rounded-full text-xs ${
              filter === code
                ? "bg-gray-800 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {CODE_LABELS[code] ?? code} (
            {visible.filter((e) => e.code === code).length})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-400 text-sm">
          {visible.length === 0 && entries.length > 0
            ? "All diagnostics are suppressed by reference-suppressions.json."
            : "No diagnostics yet."}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((entry) => (
            <li
              key={`${entry.sourceGranthaId}:${entry.sourcePassageRef}:${entry.offset}:${entry.code}`}
              className="border border-gray-200 rounded-md p-3"
            >
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                  {CODE_LABELS[entry.code] ?? entry.code}
                </span>
                <span className="text-sm text-gray-800 font-medium">
                  {entry.rawCitation}
                </span>
              </div>
              <div className="text-xs text-gray-600 mb-1">
                → {entry.targetGranthaId}
                {entry.locator ? `:${displayLocator(entry.locator)}` : " (whole work)"}
                {entry.nearMatchId && (
                  <span className="text-amber-600"> (near: {entry.nearMatchId})</span>
                )}
                {entry.knownInMeta && (
                  <span className="text-gray-400"> · known in meta</span>
                )}
              </div>
              <div className="text-xs text-gray-400">
                in {entry.sourceGranthaId}
                {entry.editionId ? ` (${entry.editionId})` : ""}:
                {entry.sourcePassageRef} · first seen{" "}
                {new Date(entry.lastSeenAt).toLocaleString()}
              </div>
              <div className="flex gap-3 mt-2 text-xs">
                <button
                  type="button"
                  className="text-gray-500 hover:text-gray-800"
                  onClick={() => copy("suppress", suppressionLine(entry.targetGranthaId))}
                >
                  {copied === "suppress" ? "copied" : "copy suppression line"}
                </button>
                <button
                  type="button"
                  className="text-gray-500 hover:text-gray-800"
                  onClick={() => copy("bugs", toBugsLine(entry))}
                >
                  {copied === "bugs" ? "copied" : "copy BUGS.md line"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {suppressedCount > 0 && (
        <div className="mt-6 text-xs text-gray-400">
          {suppressedCount} diagnostic{suppressedCount === 1 ? "" : "s"} hidden by
          reference-suppressions.json
          {suppressions.grantha_ids.length > 0
            ? ` (targets: ${suppressions.grantha_ids.join(", ")})`
            : ""}
          .
        </div>
      )}
    </main>
  );
}
