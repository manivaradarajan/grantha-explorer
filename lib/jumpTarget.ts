import { SidebarFlatModel, dropLastRefComponent } from "./data";

/** Result of resolving a quick-jump query. */
export interface ResolvedJump {
  ref: string;
  /** True when the ref is a section marker — no verse DOM element exists for it. */
  isSection: boolean;
}

/**
 * Resolve a quick-jump query to a target ref, or null when unresolvable.
 *
 * Matches loaded passages first (prefatory, main, concluding), then part-file
 * first_refs, then known (possibly not-yet-loaded) section markers so jumps
 * into unloaded parts resolve. Pure and side-effect free.
 *
 * This is the shared implementation of the resolution logic NavigationSidebar
 * uses internally for its quick-jump input; the flow reader's folio
 * jump-to-number input calls the same function so both surfaces resolve
 * identically.
 *
 * Args:
 *     q: The raw query string (already digit-normalized).
 *     model: The sidebar flat model for the current grantha.
 *     partFirstRefs: first_refs of every declared part file.
 *
 * Returns:
 *     The resolved target (verse ref, or a section marker with isSection true),
 *     or null when nothing matches.
 */
export function resolveJumpTarget(
  q: string,
  model: SidebarFlatModel,
  partFirstRefs: string[],
): ResolvedJump | null {
  const loadedVerses = [
    ...model.prefatory,
    ...(model.depth <= 1
      ? model.flatPassages
      : model.sections.flatMap((s) => s.passages)),
    ...model.concluding,
  ];

  const exactLoaded = loadedVerses.find((p) => p.ref === q);
  if (exactLoaded) return { ref: exactLoaded.ref, isSection: false };

  if (partFirstRefs.includes(q)) return { ref: q, isSection: false };

  const prefixLoaded = loadedVerses.find((p) => p.ref.startsWith(q + "."));
  if (prefixLoaded) return { ref: prefixLoaded.ref, isSection: false };

  const prefixPartMatch = partFirstRefs.find((r) => r.startsWith(q + "."));
  if (prefixPartMatch) return { ref: prefixPartMatch, isSection: false };

  if (model.depth >= 2) {
    const parentRef = dropLastRefComponent(q);
    if (model.sections.some((s) => s.boundary.markerRef === parentRef)) {
      return { ref: q, isSection: true };
    }
  }

  return null;
}
