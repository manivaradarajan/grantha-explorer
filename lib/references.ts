import {
  Grantha,
  Reference,
  buildRefIndexMap,
  getAllPassagesForNavigation,
  getPassageByRef,
  getStructureDepth,
  loadGrantha,
  loadGranthaPart,
  loadedFirstRefsFor,
  partLevelFor,
  sectionPartsToLoad,
} from "./data";
import type { ReferenceDiagCode } from "./referenceDiagnostics";

/**
 * Runtime cross-reference resolution (§5 of the cross-linked-references pilot
 * plan). Abbreviation → grantha_id + locator normalization is done producer-
 * side (grantha_data.references); this module resolves a reference against a
 * loaded target grantha at runtime.
 */

export type ReferenceResolution =
  | { kind: "passage"; ref: string; isSection: boolean }
  | { kind: "root"; ref: string }
  | { kind: "unresolved"; code: ReferenceDiagCode };

/**
 * Check whether a grantha id exists in the loaded library.
 *
 * The membership set is derived from `availableGranthaIds` (the index over
 * the on-disk library tree, not `granthas-meta.json`).
 *
 * Args:
 *     granthaId: The target grantha id.
 *     availableGranthaIds: All on-disk grantha ids.
 *
 * Returns:
 *     True when the target is in the library.
 */
export const isReferenceInLibrary = (
  granthaId: string,
  availableGranthaIds: string[],
): boolean => new Set(availableGranthaIds).has(granthaId);

/** The per-grantha metadata the link gate needs (editions + school default). */
export interface ReferenceTargetMeta {
  /** Available editions for a multi-edition grantha; absent for single-edition. */
  editions?: { edition_id: string }[];
  /** The school of the grantha's display-default edition, when school-flavored. */
  default_school?: string;
}

/**
 * Edition-aware link gate (design §4.4 / Ground Rule #7).
 *
 * A reference is linkable iff the target grantha is on disk AND either:
 *   - it carries a concrete `edition_id` that the grantha exposes, or
 *   - it is edition-less AND the grantha's display default is attribution-safe
 *     (no `default_school` — i.e. mula / school-neutral).
 * An edition-less reference to a school-flavored-default grantha is deferred
 * (unresolved), never silently defaulted to another school's commentary. This
 * is the single gate for both pre-sweep (1.3.0, no edition_id) and post-sweep
 * (1.4.0) content; the runtime never branches on schema version.
 *
 * Args:
 *     reference: The reference to gate.
 *     granthaById: Metadata keyed by grantha id, from the grantha index
 *         (editions) + granthas-meta.json (default_school).
 *
 * Returns:
 *     True when the reference's concrete target is linkable.
 */
export const isReferenceLinkable = (
  reference: Reference,
  granthaById: Record<string, ReferenceTargetMeta>,
): boolean => {
  const granthaId = reference.grantha_id;
  if (!granthaId) return false;
  const meta = granthaById[granthaId];
  if (!meta) return false;
  const editionId = reference.edition_id ?? undefined;
  if (editionId) {
    const editions = meta.editions;
    // Single-edition granthas (flat, edition_id == grantha_id) expose no
    // editions array; the stamped edition IS the grantha itself.
    if (!editions || editions.length === 0) {
      return editionId === granthaId;
    }
    return editions.some((e) => e.edition_id === editionId);
  }
  return !meta.default_school;
};

/**
 * Resolve a reference's locator against a loaded target grantha (§5).
 *
 * Resolution order:
 *   1. Exact leaf — the locator names a loaded passage.
 *   2. Section (partial locator) — the locator names an interior level:
 *      (a) an envelope section marker whose ref equals the locator
 *          (`isSection: true`); (b) a part `first_ref` prefixed by the
 *          locator (a leaf passage in a later, not-yet-loaded part);
 *          (c) a loaded leaf whose ref is prefixed by the locator.
 *      Cases (b)/(c) are concrete leaf passages → `isSection: false`.
 *   3. Whole-work — `locator` is null → the grantha root (first main ref).
 *   4. Depth overflow — more segments than the target's `structure_levels`
 *      depth → unresolved (`REF-RUNTIME-DEPTH-OVERFLOW`).
 *   5. Otherwise — unresolved (`REF-RUNTIME-UNRESOLVED`).
 *
 * Args:
 *     target: The loaded target grantha.
 *     locator: The reference's canonical locator (null = whole-work).
 *
 * Returns:
 *     A `ReferenceResolution` describing the jump target or why it is
 *     unresolved.
 */
export function resolveReferenceTarget(
  target: Grantha,
  locator: string | null,
): ReferenceResolution {
  if (locator == null) {
    return { kind: "root", ref: firstMainRef(target) };
  }

  const depth = getStructureDepth(target.structure_levels);
  const segCount = locator.split(".").length;
  if (segCount > depth) {
    return { kind: "unresolved", code: "REF-RUNTIME-DEPTH-OVERFLOW" };
  }

  // 1. Exact leaf.
  const ordered = getAllPassagesForNavigation(target);
  if (buildRefIndexMap(ordered).has(locator)) {
    return { kind: "passage", ref: locator, isSection: false };
  }

  // 1b. Full-depth locator in a later, not-yet-loaded part. A multi-part
  // grantha loads only its first part, so a leaf in a later part is absent
  // from `ordered`. The locator is still a valid passage ref: hand it back
  // and let the reader's section loader fetch the containing part (the same
  // `sectionPartsToLoad` path used for normal navigation).
  const partLevel = partLevelFor(target.structure_levels);
  if (segCount === depth && partLevel >= 0 && (target.parts ?? []).length > 0) {
    const toLoad = sectionPartsToLoad(
      target.parts ?? [],
      locator,
      loadedFirstRefsFor(target),
      partLevel,
    );
    if (toLoad.length > 0) {
      return { kind: "passage", ref: locator, isSection: false };
    }
  }

  // 2. Section (partial locator).
  // (a) Envelope section marker whose ref equals the locator.
  const sectionMarker = (target.sections ?? []).find(
    (s) => s.start_ref === locator,
  );
  if (sectionMarker) {
    return { kind: "passage", ref: sectionMarker.start_ref, isSection: true };
  }
  // (b) Part first_ref prefixed by the locator (later, unloaded part).
  const partFirst = (target.parts ?? []).find(
    (p) => p.first_ref === locator || p.first_ref.startsWith(locator + "."),
  );
  if (partFirst) {
    return { kind: "passage", ref: partFirst.first_ref, isSection: false };
  }
  // (c) Loaded leaf whose ref is prefixed by the locator.
  const prefixLeaf = ordered.find((p) => p.ref.startsWith(locator + "."));
  if (prefixLeaf) {
    return { kind: "passage", ref: prefixLeaf.ref, isSection: false };
  }

  // 5. Unresolved.
  return { kind: "unresolved", code: "REF-RUNTIME-UNRESOLVED" };
}

/**
 * Fetch a passage preview for a reference (hover tooltip).
 *
 * Returns the target passage's Devanagari text, or a status string when the
 * target is not in the library / the locator does not resolve. When the
 * passage lives in a later part of a multi-part grantha (not loaded by
 * `loadGrantha`), the containing part is fetched on demand so the preview
 * always shows the cited verse. Fetched parts are cached per path+file so
 * repeated hovers don't refetch.
 *
 * Args:
 *     granthaId: The target grantha id.
 *     reference: The reference to preview.
 *     availableGranthaIds: All on-disk grantha ids.
 *
 * Returns:
 *     The passage text, or a status string.
 */

const previewPartCache = new Map<string, { ref: string; text: string }[]>();

const previewCacheKey = (path: string, file: string): string => `${path}/${file}`;

export const getPassagePreview = async (
  granthaId: string,
  reference: Reference,
  availableGranthaIds: string[],
): Promise<string | null> => {
  if (!isReferenceInLibrary(granthaId, availableGranthaIds)) {
    return "Reference not available in this library.";
  }
  try {
    const target = await loadGrantha(granthaId, reference.edition_id ?? undefined);
    const resolution = resolveReferenceTarget(target, reference.locator);
    if (resolution.kind !== "passage") {
      return null;
    }

    // 1. Loaded passage (first part, or a later part already merged in).
    const loaded = getPassageByRef(target, resolution.ref);
    if (loaded?.content?.sanskrit?.devanagari) {
      return loaded.content.sanskrit.devanagari;
    }

    // 2. Passage in a later, not-yet-loaded part: find the containing part and
    //    fetch it on demand.
    const partLevel = partLevelFor(target.structure_levels);
    if (partLevel >= 0 && target.parts) {
      const toLoad = sectionPartsToLoad(
        target.parts,
        resolution.ref,
        loadedFirstRefsFor(target),
        partLevel,
      );
      if (toLoad.length > 0) {
        const firstRef = toLoad[0];
        const partInfo = target.parts.find((p) => p.first_ref === firstRef);
        if (partInfo) {
          const cacheKey = previewCacheKey(target.path, partInfo.file);
          let passages = previewPartCache.get(cacheKey);
          if (!passages) {
            const part = await loadGranthaPart(target.path, partInfo.file);
            passages = [
              ...(part.prefatory_material ?? []),
              ...(part.passages ?? []),
              ...(part.concluding_material ?? []),
            ]
              .map((p) => ({
                ref: p.ref,
                text: p.content?.sanskrit?.devanagari ?? "",
              }))
              .filter((p) => p.text);
            previewPartCache.set(cacheKey, passages);
          }
          return passages.find((p) => p.ref === resolution.ref)?.text ?? null;
        }
      }
    }

    return null;
  } catch (error) {
    console.error(`Error fetching passage preview for ${granthaId}`, error);
    return "Error fetching preview.";
  }
};

/**
 * Return the grantha's root navigation ref (whole-work jump target).
 *
 * Prefers the first part's `first_ref` (the envelope's root for multi-part
 * granthas), then the first main passage, then the first passage.
 *
 * Args:
 *     grantha: The loaded grantha.
 *
 * Returns:
 *     The root ref.
 */
function firstMainRef(grantha: Grantha): string {
  const partRoot = grantha.parts?.[0]?.first_ref;
  if (partRoot) {
    return partRoot;
  }
  const main = grantha.passages.find((p) => p.passage_type === "main");
  return (main ?? grantha.passages[0])?.ref ?? "1";
}
