import { Grantha } from "./data";

/**
 * URL state interface
 */
export interface UrlState {
  granthaId: string;
  verseRef: string;
  commentaries?: string[];
  script?: "deva" | "roman";
  language?: "both" | "san" | "eng";
  darkMode?: boolean;
  fontSize?: number;
}

/**
 * Parse URL hash into grantha ID, verse ref, and optional params
 * @param hash - Raw hash string (e.g., "#kena-upanishad:1.1?c=rangaramanuja&s=roman")
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

    // Commentary IDs (comma-separated)
    const c = params.get("c");
    if (c) {
      result.commentaries = c.split(",").filter(Boolean);
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
  const { granthaId, verseRef, commentaries, script, language, darkMode, fontSize } =
    state;

  // Build base hash
  let hash = `#${granthaId}:${verseRef}`;

  // Build query params
  const params = new URLSearchParams();

  // Always include commentaries if present
  if (commentaries?.length) {
    params.set("c", commentaries.join(","));
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
 * Validate if a verse ref exists in grantha data
 * @param grantha - Grantha data object
 * @param verseRef - Verse reference to validate
 * @returns true if verse exists, false otherwise
 */
export function isValidVerseRef(grantha: Grantha, verseRef: string): boolean {
  // Check prefatory material
  if (grantha.prefatory_material?.some((p) => p.ref === verseRef)) {
    return true;
  }

  // Check main passages
  if (grantha.passages?.some((p) => p.ref === verseRef)) {
    return true;
  }

  // Check concluding material
  if (grantha.concluding_material?.some((p) => p.ref === verseRef)) {
    return true;
  }

  return false;
}

/**
 * Get all commentary IDs available for a grantha
 */
export function getCommentaryIds(grantha: Grantha): string[] {
  return grantha.commentaries?.map((c) => c.commentary_id) || [];
}

/**
 * Validate if commentary ID exists in grantha
 */
export function isValidCommentaryId(grantha: Grantha, commentaryId: string): boolean {
  return grantha.commentaries?.some((c) => c.commentary_id === commentaryId) || false;
}
