// Type definitions matching the JSON schema

export interface SanskritContent {
  devanagari: string;
  roman?: string;
}

export interface Content {
  sanskrit: SanskritContent;
  english_translation: string;
}

export interface Passage {
  ref: string;
  passage_type: "main" | "prefatory" | "concluding";
  label?: string;
  content: Content;
  part_id?: string; // Changed from part_num
}

export interface PrefatoryMaterial {
  ref: string;
  passage_type: "prefatory";
  label: {
    devanagari: string;
    roman?: string;
  };
  content: Content;
  part_id?: string; // Changed from part_num
}

export interface StructureLevel {
  key: string;
  scriptNames: {
    devanagari: string;
    roman?: string;
  };
  children?: StructureLevel[];
}

export interface ProcessingPipeline {
  llm_model?: string;
  llm_prompt_version?: string;
  llm_date?: string;
  processor?: string;
}

export interface Metadata {
  source_url: string | null;
  source_commit: string | null;
  source_file: string;
  processing_pipeline: ProcessingPipeline;
  quality_notes: string;
  last_updated: string;
}

export interface Alias {
  alias: string;
  scope: string;
}

export interface Commentator {
  devanagari: string;
  latin?: string;
}

export interface CommentaryPrefatoryItem {
  type: string;
  label: string;
  content: {
    sanskrit: SanskritContent;
    english: string;
  };
}

export interface CommentaryPassage {
  ref: string;
  prefatory_material?: CommentaryPrefatoryItem[];
  content: {
    sanskrit: SanskritContent;
    english: string;
  };
}

export interface Commentary {
  commentary_id: string;
  commentary_title: string;
  commentator: Commentator;
  metadata?: {
    source_file?: string;
  };
  passages: CommentaryPassage[];
}

import { type Script } from "./i18n";

export interface EditionStub {
  edition_id: string;
  path: string; // Relative path from /data/library/ to the edition file or directory
  commentator?: { devanagari: string; roman?: string };
  commentary_title?: string;
  isDefault?: boolean;
}

export interface Grantha extends GranthaMetadata {
  grantha_id: string;
  canonical_title: string;
  aliases: Alias[];
  text_type: string;
  language?: string;
  script?: Script;
  metadata: Metadata;
  structure_levels: StructureLevel[];
  prefatory_material: PrefatoryMaterial[];
  passages: Passage[];
  concluding_material: PrefatoryMaterial[]; // Changed to non-optional array
  commentaries: Commentary[]; // Changed to non-optional array
  parts?: { file: string; id: string; first_ref: string }[];
  /** The edition this grantha object was loaded as. Undefined for single-edition granthas. */
  edition_id?: string;
}

export interface GranthaMetadata {
  id: string;
  path: string; // Relative path from /data/library/ to the grantha file or directory
  title: string;
  title_deva: string;
  title_iast: string;
  /** Available editions for multi-edition granthas (grantha-envelope kind). Absent for single-edition. */
  editions?: EditionStub[];
}

/**
 * A node in the passage hierarchy rendered by NavigationSidebar.
 *
 * Exactly one of the following states applies at any given time:
 *   - `passages` set              — leaf node; passages are loaded and ready to display.
 *   - `children` non-empty        — interior node with loaded sub-groups.
 *   - `partIds` + empty `children` — placeholder; the backing part file(s) have not been
 *                                    fetched yet. Multiple part files can share the same
 *                                    display group (e.g. a chapter split across part files).
 */
export interface PassageGroup {
  level: string;
  /** IDs of part files backing this placeholder group. Populated when the group has
   *  not yet been loaded; may reference more than one part when a chapter spans files. */
  partIds?: string[];
  passages?: Passage[];
  children?: PassageGroup[];
}

export interface GranthaMeta {
  [granthaId: string]: {
    title: {
      devanagari: string;
      iast: string;
    };
    abbreviations: {
      devanagari: string[];
    };
  };
}

export interface PassageHierarchy {
  prefatory: (Passage | PrefatoryMaterial)[];
  main: PassageGroup[];
  concluding: (Passage | PrefatoryMaterial)[];
}

// New interface for the content of an individual part file (e.g., part3.json)
export interface GranthaPartContent {
  prefatory_material?: PrefatoryMaterial[];
  passages: Passage[];
  concluding_material?: PrefatoryMaterial[];
  /** New schema format: single Commentary object per part (grantha-part.schema.json). */
  commentary?: Commentary;
  /** Legacy format: keyed object or array. Superseded by commentary. */
  commentaries?: Commentary[] | Record<string, Commentary>;
}

// New interface for the metadata of a multi-part grantha (from metadata.json)
export interface GranthaMetadataOnly {
  grantha_id: string;
  canonical_title: string;
  aliases?: Alias[];
  text_type: string;
  language?: string;
  script?: Script;
  metadata: Metadata;
  structure_levels: StructureLevel[];
  commentaries?: Commentary[];
  parts: { file: string; id: string; first_ref: string }[];
}

// In-memory cache for grantha data, keyed by granthaId::editionId so multiple
// editions of the same grantha can coexist (e.g. for a future comparison view).
const granthaCache = new Map<string, Grantha>();

const granthaCacheKey = (granthaId: string, editionId?: string): string =>
  editionId ? `${granthaId}::${editionId}` : granthaId;

// Data loading functions

/**
 * Helper to construct asset paths.
 * It reads the basePath from an environment variable set in next.config.js.
 */
const getAssetPath = (path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  // Read the pre-configured base path. Default to empty string if not set.
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

  return `${basePath}${normalizedPath}`;
};

/**
 * Get list of available granthas metadata
 * Loads from static JSON file generated at build time
 * Next.js caches fetch requests automatically
 */
export const getGranthasMeta = async (): Promise<GranthaMeta> => {
  const response = await fetch(getAssetPath('/data/granthas-meta.json'));
  if (!response.ok) {
    throw new Error('Failed to fetch grantha metadata');
  }
  return response.json();
};

export const createAbbreviationMap = (meta: GranthaMeta, script: 'devanagari'): { [key: string]: string } => {
  const map: { [key: string]: string } = {};
  for (const granthaId in meta) {
    const grantha = meta[granthaId];
    if (grantha.abbreviations && grantha.abbreviations[script]) {
      for (const abbr of grantha.abbreviations[script]) {
        map[abbr] = granthaId;
      }
    }
  }
  return map;
};

export const getAvailableGranthas = async (): Promise<GranthaMetadata[]> => {
  try {
    const response = await fetch(getAssetPath("/data/generated/granthas.json"));

    if (!response.ok) {
      throw new Error("Failed to fetch granthas list");
    }

    const data = await response.json();
    // Handle both legacy array format and new object format with metadata
    const granthas: GranthaMetadata[] = Array.isArray(data) ? data : data.granthas;
    return granthas;
  } catch (error) {
    console.error("Error loading granthas:", error);
    return [];
  }
}

/**
 * Load full grantha data from JSON file or initial part of a multi-part grantha.
 * TODO: Remove duplicate structure_levels from part files (should only be in envelope.json)
 */
export async function loadGrantha(granthaId: string, editionId?: string): Promise<Grantha> {
  // 1. Check cache first (keyed per edition so switching editions never
  //    serves stale mula/commentary data for the wrong edition).
  const cacheKey = granthaCacheKey(granthaId, editionId);
  if (granthaCache.has(cacheKey)) {
    return granthaCache.get(cacheKey)!;
  }

  try {
    // Get the path from the generated index
    const granthasList = await getAvailableGranthas();
    const granthaMetadata = granthasList.find(g => g.id === granthaId);

    if (!granthaMetadata) {
      throw new Error(`Grantha ${granthaId} not found in index`);
    }

    // Resolve the selected edition. For multi-edition granthas the index
    // entry carries editions[] (from the grantha-level envelope); the
    // requested editionId falls back to isDefault, then to the first stub.
    // For single-edition granthas edition_id == grantha_id by convention and
    // the index path is used directly.
    const granthaEditions = granthaMetadata.editions;
    let resolvedEditionId: string;
    let granthaPath: string;

    if (granthaEditions && granthaEditions.length > 0) {
      const selected =
        granthaEditions.find(e => e.edition_id === editionId) ||
        granthaEditions.find(e => e.isDefault) ||
        granthaEditions[0];
      if (!selected) {
        throw new Error(`Grantha ${granthaId} has an empty editions array`);
      }
      resolvedEditionId = selected.edition_id;
      granthaPath = selected.path;
    } else {
      resolvedEditionId = granthaId;
      granthaPath = granthaMetadata.path;
    }

    // Determine if it's a directory (multi-part) or file (single-part)
    const isMultiPart = !granthaPath.endsWith('.json');

    if (isMultiPart) {
      // Try to fetch envelope.json for multi-part granthas
      const envelopeResponse = await fetch(getAssetPath(`/data/library/${granthaPath}/envelope.json`));

      if (envelopeResponse.ok) {
        // It's a multi-part grantha. Read the envelope.
        const rawEnvelope = await envelopeResponse.json();

        // The envelope's parts[] entries are {file, first_ref} objects.
        // part.id is the top-level structural section number from first_ref
        // (e.g. first_ref "3.1.1" → id "3"), not the sequential file number.
        const multiPartMetadata: GranthaMetadataOnly = {
          ...rawEnvelope,
          parts: rawEnvelope.parts.map((partEntry: { file: string; first_ref: string }) => ({
            file: partEntry.file,
            id: partEntry.first_ref.split('.')[0],
            first_ref: partEntry.first_ref,
          })),
        };

        if (!multiPartMetadata.parts || multiPartMetadata.parts.length === 0) {
          throw new Error(`Multi-part grantha ${granthaId} has no parts defined in envelope.json`);
        }

        // Fetch all parts that share the same ID as the first part.
        const firstPartId = multiPartMetadata.parts[0]?.id;
        const partsToLoad = multiPartMetadata.parts.filter(p => p.id === firstPartId);

        const loadedPartsContent: GranthaPartContent[] = await Promise.all(
          partsToLoad.map(async (partInfo) => {
            const response = await fetch(getAssetPath(`/data/library/${granthaPath}/${partInfo.file}`));
            if (!response.ok) {
              throw new Error(`Failed to load part file ${partInfo.file} for grantha ${granthaId}`);
            }
            const content: GranthaPartContent = await response.json();

            // Resolve commentary into a flat array regardless of source format.
            // New schema (grantha-part.schema.json): commentary is a single object.
            // Legacy format: commentaries is a keyed dict or array.
            let commentariesArray: Commentary[] = [];
            if (content.commentary) {
              commentariesArray = [content.commentary];
            } else if (content.commentaries) {
              if (Array.isArray(content.commentaries)) {
                commentariesArray = content.commentaries;
              } else {
                commentariesArray = Object.values(content.commentaries);
              }
            }

            return {
              prefatory_material: (content.prefatory_material || []).map(p => ({ ...p, part_id: partInfo.first_ref })),
              passages: (content.passages || []).map(p => ({ ...p, part_id: partInfo.first_ref })),
              concluding_material: (content.concluding_material || []).map(p => ({ ...p, part_id: partInfo.first_ref })),
              commentaries: commentariesArray,
            };
          })
        );

      // Combine the content from all loaded parts
      const combinedContent: GranthaPartContent = loadedPartsContent.reduce((acc, partContent) => {
        return {
          prefatory_material: [...(acc.prefatory_material || []), ...(partContent.prefatory_material || [])],
          passages: [...(acc.passages || []), ...(partContent.passages || [])],
          concluding_material: [...(acc.concluding_material || []), ...(partContent.concluding_material || [])],
          commentaries: [...((acc.commentaries as Commentary[]) || []), ...((partContent.commentaries as Commentary[]) || [])],
        };
      }, { passages: [] });


      // Create a partial Grantha object with metadata and the combined content
      const partialGrantha: Grantha = {
        ...multiPartMetadata,
        id: multiPartMetadata.grantha_id,
        path: granthaPath,
        title: multiPartMetadata.canonical_title ?? granthaMetadata.title_deva,
        title_deva: multiPartMetadata.canonical_title ?? granthaMetadata.title_deva,
        title_iast: multiPartMetadata.canonical_title ?? granthaMetadata.title_iast,
        aliases: multiPartMetadata.aliases || [],
        parts: multiPartMetadata.parts, // Store the list of all parts
        edition_id: resolvedEditionId,
        editions: granthaEditions,
        prefatory_material: combinedContent.prefatory_material || [],
        passages: combinedContent.passages || [],
        concluding_material: combinedContent.concluding_material || [],
        commentaries: multiPartMetadata.commentaries
          ? JSON.parse(JSON.stringify(multiPartMetadata.commentaries)).map((c: Commentary) => ({ ...c, passages: [] }))
          : [],
      };

      // Merge commentaries from the loaded parts
      if (combinedContent.commentaries) {
        (combinedContent.commentaries as Commentary[]).forEach(commentaryPart => {
          if (commentaryPart) {
            const existingCommentary = partialGrantha.commentaries.find(
              c => c.commentary_id === commentaryPart.commentary_id
            );
            if (existingCommentary) {
              existingCommentary.passages.push(...commentaryPart.passages);
            } else {
              partialGrantha.commentaries.push(commentaryPart);
            }
          }
        });
      }

        // Cache and return the partially assembled grantha
        granthaCache.set(cacheKey, partialGrantha);
        return partialGrantha;

      } else if (envelopeResponse.status === 404) {
        throw new Error(`Multi-part grantha ${granthaId} directory found but envelope.json is missing`);
      } else {
        // Handle other potential errors for envelope.json fetch
        throw new Error(`Failed to fetch envelope.json for grantha ${granthaId}: ${envelopeResponse.statusText}`);
      }
    } else {
      // It's a single-file grantha
      const singleFileResponse = await fetch(getAssetPath(`/data/library/${granthaPath}`));

      if (!singleFileResponse.ok) {
        throw new Error(`Failed to load single-file grantha: ${granthaId}`);
      }

      const data: any = await singleFileResponse.json();

      // Convert commentaries from object to array if needed
      if (data.commentaries && !Array.isArray(data.commentaries)) {
        data.commentaries = Object.values(data.commentaries);
      }

      // Stamp the resolved edition identity on the returned object so callers
      // (switcher UI, lazy part loader) know which edition this represents.
      data.edition_id = resolvedEditionId;
      data.editions = granthaEditions;

      granthaCache.set(cacheKey, data);
      return data;
    }
  } catch (error) {
    console.error(`Error in loadGrantha for ${granthaId}:`, error);
    throw error;
  }
}

/**
 * Extract passage fragment for navigation display
 * Returns first maxLength characters of Sanskrit text
 */
export function getPassageFragment(
  passage: Passage | PrefatoryMaterial,
  maxLength: number = 80
): string {
  const text = passage.content.sanskrit.devanagari || '';

  // Remove newlines and extra spaces
  const cleanText = text.replace(/\n/g, " ").replace(/\s+/g, " ").trim();

  if (cleanText.length <= maxLength) {
    return cleanText;
  }

  return cleanText.substring(0, maxLength) + "...";
}

/**
 * Get structure level label for a passage
 * e.g., "मन्त्र" for mantras in Upanishads
 */
export function getStructureLevelLabel(
  grantha: Grantha,
  script: "devanagari" | "roman" = "devanagari"
): string {
  if (!grantha.structure_levels || grantha.structure_levels.length === 0) {
    return "";
  }

  let level = grantha.structure_levels[0];
  while (level.children && level.children.length > 0) {
    level = level.children[0];
  }
  return level.scriptNames[script] || level.scriptNames.devanagari;
}

/**
 * Get all passages including prefatory material for navigation
 */
export function getAllPassagesForNavigation(
  grantha: Grantha
): Array<Passage | PrefatoryMaterial> {
  if (!grantha) return [];

  return [
    ...(grantha.prefatory_material || []),
    ...(grantha.passages || []),
    ...(grantha.concluding_material || []),
  ];
}

export function getPassageByRef(
  grantha: Grantha,
  ref: string
): Passage | PrefatoryMaterial | undefined {
  return getAllPassagesForNavigation(grantha).find((p) => p.ref === ref);
}

/**
 * Find the commentary passage applicable to a given verse ref, resolving both
 * exact refs ("8.3.4") and range refs ("8.3.8-12").
 *
 * Some source texts attach a single summary gloss to a whole run of mantras
 * via a range ref (e.g. brihadaranyaka "8.4.7-11", "5.2.3-9"). The panel must
 * render that gloss for every verse it covers, not only when the selected ref
 * happens to equal the literal range string.
 *
 * Args:
 *     passages: The commentary's passage list.
 *     selectedRef: The currently selected verse ref (e.g. "8.3.8").
 *
 * Returns:
 *     The matching commentary passage, or undefined when no passage covers the
 *     selected ref.
 */
export function commentaryPassageForRef(
  passages: CommentaryPassage[],
  selectedRef: string,
): CommentaryPassage | undefined {
  const exact = passages.find((p) => p.ref === selectedRef);
  if (exact) {
    return exact;
  }
  // Range ref: "A.B.LOW-HIGH" within the same section prefix "A.B".
  const match = selectedRef.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return undefined;
  }
  const prefix = `${match[1]}.${match[2]}`;
  const num = parseInt(match[3], 10);
  return passages.find((p) => {
    const range = p.ref.match(/^(\d+)\.(\d+)\.(\d+)-(\d+)$/);
    if (!range) {
      return false;
    }
    const [rp1, rp2, rpLo, rpHi] = range.slice(1).map((s) => parseInt(s, 10));
    if (rp1 !== parseInt(match[1], 10) || rp2 !== parseInt(match[2], 10)) {
      return false;
    }
    return num >= rpLo && num <= rpHi;
  });
}

export function getPassageHierarchy(grantha: Grantha): PassageHierarchy {
  const structure = grantha.structure_levels;
  const isHierarchical = structure && structure.length > 0;

  const hierarchy: PassageHierarchy = {
    prefatory: grantha.prefatory_material,
    main: [],
    concluding: grantha.concluding_material || [],
  };

  function buildNestedGroups(passages: Passage[], structureLevel: StructureLevel, refLevel: number): PassageGroup[] {
    const groups: { [key: string]: Passage[] } = {};

    // Group passages by the current level's ref part
    for (const passage of passages) {
      const refParts = passage.ref.split('.');
      if (refParts.length > refLevel) {
        const refPart = refParts[refLevel];
        const groupKey = `${structureLevel.scriptNames.devanagari} ${refPart}`;
        if (!groups[groupKey]) {
          groups[groupKey] = [];
        }
        groups[groupKey].push(passage);
      }
    }

    // Get the keys and sort them numerically
    const sortedGroupKeys = Object.keys(groups).sort((a, b) => {
      const numA = parseInt(a.split(' ').pop() || '0', 10);
      const numB = parseInt(b.split(' ').pop() || '0', 10);
      return numA - numB;
    });

    // Create PassageGroup for each group
    return sortedGroupKeys.map(groupKey => {
      const groupPassages = groups[groupKey];
      const passageGroup: PassageGroup = {
        level: groupKey,
      };



      if (structureLevel.children && structureLevel.children.length > 0) {
        // If there are more levels, recurse
        passageGroup.children = buildNestedGroups(groupPassages, structureLevel.children[0], refLevel + 1);
      } else {
        // This is the last level of grouping, so add passages
        passageGroup.passages = groupPassages;
      }
      return passageGroup;
    });
  }

  if (isHierarchical) {
    hierarchy.main = buildNestedGroups(grantha.passages, structure[0], 0);

    // Add placeholders for unloaded parts; tag loaded groups with their file first_refs.
    if (grantha.parts) {
      const levelLabel = structure[0].scriptNames.devanagari;

      // Determine which part files are loaded by checking for their first passage.
      const loadedPassageRefs = new Set(grantha.passages.map(p => p.ref));
      const loadedFirstRefs = new Set(
        grantha.parts
          .filter(p => loadedPassageRefs.has(p.first_ref))
          .map(p => p.first_ref)
      );

      const groupsByKey = new Map<string, PassageGroup>(
        hierarchy.main.map(g => [g.level, g])
      );

      // Tag existing loaded groups with first_refs from grantha.parts (not by parsing level labels).
      for (const part of grantha.parts) {
        if (!loadedFirstRefs.has(part.first_ref)) continue;
        const groupKey = `${levelLabel} ${part.id}`;
        const group = groupsByKey.get(groupKey);
        if (group) {
          group.partIds = [...(group.partIds ?? []), part.first_ref];
        }
      }

      // Create placeholder entries for unloaded part files.
      for (const part of grantha.parts) {
        if (loadedFirstRefs.has(part.first_ref)) continue;
        const groupKey = `${levelLabel} ${part.id}`;

        const existing = groupsByKey.get(groupKey);
        if (existing) {
          // Section already has a loaded group — append unloaded first_ref to its partIds.
          existing.partIds = [...(existing.partIds ?? []), part.first_ref];
        } else {
          const placeholder: PassageGroup = {
            level: groupKey,
            partIds: [part.first_ref],
            children: [],
          };
          hierarchy.main.push(placeholder);
          groupsByKey.set(groupKey, placeholder);
        }
      }

      const extractTrailingNumber = (level: string): number => {
        const match = level.match(/\s(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
      };
      hierarchy.main.sort((a, b) => extractTrailingNumber(a.level) - extractTrailingNumber(b.level));
    }
  } else {
    hierarchy.main = [
      {
        level: "Passages",
        passages: grantha.passages,
      },
    ];
  }

  return hierarchy;
}

// ---------------------------------------------------------------------------
// Sidebar flat model (Section Picker redesign)
// ---------------------------------------------------------------------------

/** A structural section boundary rendered as a compact marker + sticky crumb. */
export interface SidebarBoundary {
  /** Structural path from root to this section, e.g. ["अध्यायः 3", "ब्राह्मणम् 4"]. */
  path: string[];
  /** Compact numeric ref, e.g. "3.4" (firstVerseRef minus its last component). */
  markerRef: string;
  /** First verse ref in this section, e.g. "3.4.1". */
  firstVerseRef: string;
  /** Part-file first_refs backing this section (for lazy loading). */
  partIds: string[];
}

/** One loaded structural section: its boundary marker plus its main passages. */
export interface SidebarSection {
  boundary: SidebarBoundary;
  passages: Passage[];
}

/** A flattened, accordion-free view of a grantha's hierarchy for the sidebar. */
export interface SidebarFlatModel {
  /** Recursive depth of structure_levels (1 = flat mantra list). */
  depth: number;
  prefatory: (Passage | PrefatoryMaterial)[];
  /** Loaded sections in document order. Empty for depth 1. */
  sections: SidebarSection[];
  /** All passages flat — used only for depth 1 texts. */
  flatPassages: Passage[];
  concluding: (Passage | PrefatoryMaterial)[];
}

function getStructureDepth(structure: StructureLevel[]): number {
  let depth = 1;
  let level = structure[0];
  while (level?.children && level.children.length > 0) {
    level = level.children[0];
    depth += 1;
  }
  return depth;
}

/** Drop the last dot-segment of a ref ("3.4.2" → "3.4"). Shared by the sidebar. */
export function dropLastRefComponent(ref: string): string {
  const parts = ref.split(".");
  return parts.length > 1 ? parts.slice(0, -1).join(".") : ref;
}

function collectSections(
  group: PassageGroup,
  path: string[],
  inheritedPartIds: string[],
  out: SidebarSection[],
): void {
  const partIds =
    group.partIds && group.partIds.length > 0 ? group.partIds : inheritedPartIds;
  const children = group.children ?? [];

  // A section boundary is a group whose children are all leaf passage-groups
  // (e.g. kena: खण्डः 1 → [मन्त्रः 1..10]). Emit one section per such parent.
  // Placeholder groups (unloaded parts) have children: [] with no passages —
  // derive their refs from partIds instead of dereferencing passages[0].
  if (
    children.length > 0 &&
    children.every((child) => (child.passages?.length ?? 0) > 0)
  ) {
    const passages = children.flatMap((child) => child.passages as Passage[]);
    const first = passages[0];
    const fallbackRef = partIds[0] ?? "";
    out.push({
      boundary: {
        path,
        markerRef: first ? dropLastRefComponent(first.ref) : dropLastRefComponent(fallbackRef),
        firstVerseRef: first ? first.ref : fallbackRef,
        partIds,
      },
      passages,
    });
    return;
  }

  // Placeholder section: an interior group with no children and no passages yet.
  if (children.length === 0 && (group.passages?.length ?? 0) === 0 && partIds.length > 0) {
    const ref = partIds[0];
    out.push({
      boundary: {
        path,
        markerRef: dropLastRefComponent(ref),
        firstVerseRef: ref,
        partIds,
      },
      passages: [],
    });
    return;
  }

  // Otherwise recurse into children.
  for (const child of children) {
    collectSections(child, [...path, child.level], partIds, out);
  }
}

export function getSidebarFlatModel(grantha: Grantha): SidebarFlatModel {
  const structure = grantha.structure_levels ?? [];
  const depth = structure.length > 0 ? getStructureDepth(structure) : 0;
  const hierarchy = getPassageHierarchy(grantha);
  const sections: SidebarSection[] = [];
  let flatPassages: Passage[] = [];

  if (depth <= 1) {
    flatPassages = hierarchy.main.flatMap((g) => g.passages ?? []);
  } else if (depth >= 2) {
    for (const topGroup of hierarchy.main) {
      collectSections(topGroup, [topGroup.level], topGroup.partIds ?? [], sections);
    }
  }

  return {
    depth,
    prefatory: hierarchy.prefatory,
    sections,
    flatPassages,
    concluding: hierarchy.concluding,
  };
}

/**
 * Load a single part file of a multi-part edition by its resolved library
 * path. The path (not a grantha_id) is passed in because the index entry only
 * stores the default edition's path; lazy part loads must use the currently
 * loaded edition's directory or they silently fetch the wrong edition.
 */
export async function loadGranthaPart(path: string, partFileName: string): Promise<GranthaPartContent> {
  const response = await fetch(getAssetPath(`/data/library/${path}/${partFileName}`));
  if (!response.ok) {
    throw new Error(`Failed to load part file ${partFileName} at ${path}`);
  }
  return response.json();
}

  