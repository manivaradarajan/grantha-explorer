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
  /** The citing edition's school namespace ('' = school-neutral). */
  sourceSchool?: string;
  /** The target grantha's default school ('' = mula / school-neutral). */
  targetDefaultSchool?: string;
}

export interface SweepReadiness {
  /** Whether the edition-aware gate is currently enabled. */
  gateEnabled: boolean;
  /** References that SHOULD have been stamped but lack an edition_id —
   *  same-school-target refs (a school text citing its own school's default)
   *  that the producer failed to stamp. Cross-school / neutral-target
   *  deferrals are legitimate and not flagged. */
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
 * A reference is "unswept" (a gate-blocker) when its target grantha's default
 * is school-flavored, the citing edition is in THAT same school, and the
 * reference carries no `edition_id` — the producer should have stamped the
 * same-school default (§5 `S == X`), so its absence is a real gap. References
 * from a school text to a DIFFERENT school's default (cross-school, no edition
 * on disk) defer by design (GR#7) and are not gate-blockers; references to
 * mula / school-neutral targets are always safe.
 *
 * Args:
 *     gateEnabled: Whether the edition-aware runtime gate is enabled.
 *     references: All committed references in the library.
 *
 * Returns:
 *     A `SweepReadiness` with a progress report and, when the gate is enabled
 *     and the corpus is not swept, hard errors.
 */
export const checkSweepReadiness = (
  gateEnabled: boolean,
  references: readonly CommittedReference[],
): SweepReadiness => {
  const unswept = references.filter(
    (r) =>
      r.targetGranthaId != null &&
      r.sourceSchool != null &&
      r.sourceSchool !== "" &&
      r.targetDefaultSchool === r.sourceSchool &&
      !r.editionId,
  );

  const report: string[] = [];
  report.push(
    `[sweep] ${references.length} references scanned; ` +
      `${unswept.length} same-school-targeted refs lack edition_id`,
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
