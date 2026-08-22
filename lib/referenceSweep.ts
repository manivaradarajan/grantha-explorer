/**
 * Edition-aware sweep readiness check (school-namespace design §6 check #9).
 *
 * Mechanically enforces the sweep-before-gate ordering from the design (§4.3):
 * the edition-aware runtime gate may only be enabled while every committed
 * reference whose target is a school-flavored grantha carries a concrete
 * `edition_id`. With the gate disabled, the same scan runs as a progress
 * report so the sweep's completion is visible before the flag flips.
 *
 * Pure and deterministic — no I/O — so it is unit-testable with fixtures, per
 * the design's "validator is the type checker" principle.
 */

export interface CommittedReference {
  /** Resolved target grantha id; null for an undefined abbreviation. */
  targetGranthaId: string | null;
  /** The concrete edition the reference was elaborated to (1.4.0+). */
  editionId?: string | null;
}

export interface SweepReadiness {
  /** Whether the edition-aware gate is currently enabled. */
  gateEnabled: boolean;
  /** References whose target is school-flavored but lack an edition_id. */
  unswept: CommittedReference[];
  /** Human-readable report lines (both gate on and off). */
  report: string[];
  /** Hard failures — non-empty only when the gate is enabled. */
  errors: string[];
}

/**
 * Check whether the committed reference corpus is swept for the edition-aware
 * gate.
 *
 * A reference is "unswept" when its target grantha is school-flavored (its
 * default reading is a school commentary) and it carries no `edition_id`.
 * Under Ground Rule #7 of the design, such a reference would render
 * unresolved once the gate ships, so it must not exist while the gate is
 * enabled. References to mula / school-neutral targets are always safe
 * (their absent edition resolves to the attribution-safe default) and are
 * never flagged.
 *
 * Args:
 *     gateEnabled: Whether the edition-aware runtime gate is enabled.
 *     schoolFlavoredGranthas: Granthas whose default reading is a school
 *         commentary (from `granthas-meta.json` `default_school`).
 *     references: All committed references in the library.
 *
 * Returns:
 *     A `SweepReadiness` with a progress report and, when the gate is enabled
 *     and the corpus is not swept, hard errors.
 */
export const checkSweepReadiness = (
  gateEnabled: boolean,
  schoolFlavoredGranthas: ReadonlySet<string>,
  references: readonly CommittedReference[],
): SweepReadiness => {
  const schoolTargeted = references.filter(
    (r) =>
      r.targetGranthaId != null &&
      schoolFlavoredGranthas.has(r.targetGranthaId),
  );
  const unswept = schoolTargeted.filter((r) => !r.editionId);

  const report: string[] = [];
  report.push(
    `[sweep] ${references.length} references scanned; ` +
      `${schoolTargeted.length} target school-flavored granthas; ` +
      `${unswept.length} lack edition_id`,
  );
  for (const r of unswept.slice(0, 20)) {
    report.push(`[sweep]   ${r.targetGranthaId} (no edition_id)`);
  }
  if (unswept.length > 20) {
    report.push(`[sweep]   … and ${unswept.length - 20} more`);
  }

  const errors: string[] = [];
  if (gateEnabled && unswept.length > 0) {
    errors.push(
      `[sweep] edition-aware gate is enabled but ${unswept.length} ` +
        `committed reference(s) to school-flavored granthas lack edition_id — ` +
        `re-ingest (sweep) before enabling the gate (design §6 check #9)`,
    );
  }

  return { gateEnabled, unswept, report, errors };
};
