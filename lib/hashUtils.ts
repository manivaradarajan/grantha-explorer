import { Grantha, Passage, PrefatoryMaterial } from "./data";

/**
 * URL state interface
 */
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
  const { granthaId, verseRef, editionId, commentaryOpen, subcommentaryIds, script, language, darkMode, fontSize } =
    state;

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
  if (grantha.editions?.length) {
    const validEdition =
      !parsed.editionId ||
      grantha.editions.some(e => e.edition_id === parsed.editionId);
    if (!validEdition) {
      const defaultEdition =
        grantha.editions.find(e => e.isDefault) ?? grantha.editions[0];
      return {
        ...parsed,
        editionId: defaultEdition?.edition_id,
        needsCorrection: true,
      };
    }
  } else if (parsed.editionId) {
    return { ...parsed, editionId: undefined, needsCorrection: true };
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

