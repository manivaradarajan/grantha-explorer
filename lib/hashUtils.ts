import { Grantha, Passage, PrefatoryMaterial } from "./data";

/**
 * URL state interface
 */
export type ReadingMode = "flow" | "panes" | "edit";

export interface UrlState {
  granthaId: string;
  verseRef: string;
  /** Active edition_id for multi-edition granthas. Absent = default edition.
   *  Single-select today; extend to a comma-list when a side-by-side
   *  comparison view is designed. */
  editionId?: string;
  commentaryOpen?: boolean;
  /** Active subcommentary IDs (comma-separated). Absent = show none; opt in by ID. */
  subcommentaryIds?: string;
  script?: "deva" | "roman";
  language?: "both" | "san" | "eng";
  darkMode?: boolean;
  fontSize?: number;
  /** Active reading mode. "flow" = continuous-prose flow reader; absent/"panes" = the
   *  existing 3-pane view. Kept in the hash so the mode is linkable/shareable and survives
   *  back/forward navigation, same as every other piece of reader state. */
  mode?: ReadingMode;
}

/**
 * Split a raw editionId (which may be a single id or a compare-mode
 * comma-separated list) into its individual edition ids, in order.
 *
 * @param editionId - Raw `?e=` value from the hash, or undefined.
 * @returns Ordered, de-duplicated edition ids (empty when absent/blank).
 */
export function parseEditionIds(editionId?: string): string[] {
  if (!editionId) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of editionId.split(",")) {
    const trimmed = id.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      ids.push(trimmed);
    }
  }
  return ids;
}

/**
 * Parse URL hash into grantha ID, verse ref, and optional params
 * @param hash - Raw hash string (e.g., "#kena-upanishad:1.1?e=kena-upanishad&s=roman")
 * @returns Parsed object or null if invalid
 */
export function parseHash(hash: string): UrlState | null {
  // Remove leading '#'
  const cleaned = hash.startsWith("#") ? hash.slice(1) : hash;

  // Split hash and query params
  const [pathPart, queryPart] = cleaned.split("?");

  // Parse path (grantha:verse)
  const [granthaId, verseRef] = pathPart.split(":");

  if (!granthaId || !verseRef) {
    return null;
  }

  const result: UrlState = { granthaId, verseRef };

  // Parse query params if present
  if (queryPart) {
    const params = new URLSearchParams(queryPart);

    // Active edition (single-select). See UrlState.editionId for the future
    // comma-list extension path.
    const e = params.get("e");
    if (e) {
      result.editionId = e;
    }

    // Commentary open state
    const co = params.get("co");
    if (co) {
      result.commentaryOpen = co === '1';
    }

    // Active subcommentary IDs (comma-separated opt-in list)
    const sc = params.get("sc");
    if (sc) {
      result.subcommentaryIds = sc;
    }

    // Script
    const s = params.get("s");
    if (s === "roman" || s === "deva") {
      result.script = s;
    }

    // Language
    const l = params.get("l");
    if (l === "both" || l === "san" || l === "eng") {
      result.language = l;
    }

    // Dark mode
    const dark = params.get("dark");
    if (dark === "1" || dark === "0") {
      result.darkMode = dark === "1";
    }

    // Font size
    const size = params.get("size");
    if (size) {
      const sizeNum = parseInt(size, 10);
      if (sizeNum >= 80 && sizeNum <= 150) {
        result.fontSize = sizeNum;
      }
    }

    // Reading mode (flow reader vs. panes vs. edit). Absent = panes (the default).
    const m = params.get("m");
    if (m === "flow" || m === "panes" || m === "edit") {
      result.mode = m;
    }
  }

  return result;
}

/**
 * Build hash string from URL state
 * @param state - URL state object
 * @param includePreferences - If true, includes display preferences (for "Share My View")
 * @returns Hash string
 */
export function buildHash(
  state: UrlState,
  includePreferences: boolean = false
): string {
  const {
    granthaId,
    verseRef,
    editionId,
    commentaryOpen,
    subcommentaryIds,
    script,
    language,
    darkMode,
    fontSize,
    mode,
  } = state;

  // Build base hash
  let hash = `#${granthaId}:${verseRef}`;

  // Build query params
  const params = new URLSearchParams();

  // Always include the active edition if present
  if (editionId) {
    params.set("e", editionId);
  }

  // Always include commentary open state if true
  if (commentaryOpen) {
    params.set("co", "1");
  }

  // Always include active subcommentary IDs if present
  if (subcommentaryIds) {
    params.set("sc", subcommentaryIds);
  }

  // Always include the reading mode when it differs from the default (panes).
  // The mode is navigation state (like verseRef), not a display preference, so
  // it travels regardless of includePreferences.
  if (mode && mode !== "panes") {
    params.set("m", mode);
  }

  // Only include display preferences if explicitly requested (Share My View)
  if (includePreferences) {
    if (script && script !== "deva") {
      params.set("s", script);
    }

    if (language && language !== "both") {
      params.set("l", language);
    }

    if (darkMode !== undefined) {
      params.set("dark", darkMode ? "1" : "0");
    }

    if (fontSize && fontSize !== 100) {
      params.set("size", fontSize.toString());
    }
  }

  // Append query params if any
  const queryString = params.toString();
  if (queryString) {
    hash += `?${queryString}`;
  }

  return hash;
}

/**
 * Get the first verse ref from grantha data
 * @param grantha - Grantha data object
 * @returns First verse ref (checks prefatory, then passages)
 */
export function getFirstVerseRef(grantha: Grantha): string {
  // Check for prefatory material first
  if (grantha.prefatory_material?.length > 0) {
    return grantha.prefatory_material[0].ref;
  }

  // Otherwise return first passage
  if (grantha.passages?.length > 0) {
    return grantha.passages[0].ref;
  }

  // Fallback (should never happen with valid data)
  return "1";
}

/**
 * Get the first main passage ref, skipping prefatory material
 * @param grantha - Grantha data object
 * @returns First main passage ref
 */
export function getFirstMainPassageRef(grantha: Grantha): string {
  // Return first main passage, skipping prefatory material
  if (grantha.passages?.length > 0) {
    return grantha.passages[0].ref;
  }

  // Fallback to prefatory if no main passages
  if (grantha.prefatory_material?.length > 0) {
    return grantha.prefatory_material[0].ref;
  }

  // Final fallback
  return "1";
}

/**
 * Validate if a verse ref exists in grantha data
 * @param grantha - Grantha data object
 * @returns true if verse exists, false otherwise
 */
export function isValidVerseRef(grantha: Grantha, verseRef: string): boolean {
  // Check prefatory material
  if (grantha.prefatory_material?.some((p: Passage | PrefatoryMaterial) => p.ref === verseRef)) {
    return true;
  }

  // Check main passages
  if (grantha.passages?.some((p: Passage | PrefatoryMaterial) => p.ref === verseRef)) {
    return true;
  }

  // Check concluding material
  if (grantha.concluding_material?.some((p: Passage | PrefatoryMaterial) => p.ref === verseRef)) {
    return true;
  }

  return false;
}

/**
 * Validate and normalize a parsed hash against grantha data
 * If verse ref is invalid, corrects it to the first verse
 *
 * @param parsed - Parsed URL state
 * @param grantha - Grantha data (optional, if not loaded yet)
 * @returns Normalized URL state with correction info
 */
export function validateAndNormalizeHash(
  parsed: UrlState,
  grantha?: Grantha | null
): UrlState & { needsCorrection: boolean } {
  // If grantha not loaded yet, trust the parsed values
  if (!grantha) {
    return { ...parsed, needsCorrection: false };
  }

  // Edition validation: if the grantha exposes editions and the URL names one
  // it doesn't have, correct to the default edition. If the grantha has no
  // editions (single-edition text), a stray ?e= from another grantha is
  // meaningless and is dropped.
  //
  // The edition param may be a single id or a compare-mode comma-separated
  // list; each entry is validated independently. Valid entries are kept, an
  // all-invalid list falls back to the default edition.
  if (grantha.editions?.length) {
    const editions = grantha.editions;
    const requestedIds = parseEditionIds(parsed.editionId);
    if (requestedIds.length === 0) {
      // No edition requested — the default applies; nothing to correct.
    } else {
      const validIds = requestedIds.filter((id) =>
        editions.some((e) => e.edition_id === id)
      );
      if (validIds.length !== requestedIds.length) {
        if (validIds.length > 0) {
          return {
            ...parsed,
            editionId: validIds.join(","),
            needsCorrection: true,
          };
        }
        const defaultEdition =
          grantha.editions.find((e) => e.isDefault) ?? grantha.editions[0];
        return {
          ...parsed,
          editionId: defaultEdition?.edition_id,
          needsCorrection: true,
        };
      }
    }
  } else if (parsed.editionId) {
    // Single-edition (flat) grantha: edition_id == grantha_id is the flat
    // edition's own id — valid (school-namespace refs carry it explicitly),
    // so keep it. Only a genuinely foreign ?e= is dropped as stray.
    if (parsed.editionId !== grantha.grantha_id) {
      return { ...parsed, editionId: undefined, needsCorrection: true };
    }
  }

  // Validate verse ref
  if (isValidVerseRef(grantha, parsed.verseRef)) {
    return { ...parsed, needsCorrection: false };
  }

  // Invalid verse ref - correct to first verse
  const firstRef = getFirstVerseRef(grantha);
  return {
    ...parsed,
    verseRef: firstRef,
    needsCorrection: true,
  };
}

