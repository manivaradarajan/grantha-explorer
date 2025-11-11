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
  part_num?: number;
}

export interface PrefatoryMaterial {
  ref: string;
  passage_type: "prefatory";
  label: {
    devanagari: string;
    roman?: string;
  };
  content: Content;
  part_num?: number;
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
}

export interface GranthaMetadata {
  id: string;
  title: string;
  title_deva: string;
  title_iast: string;
}

export interface PassageGroup {
  level: string;
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
  commentaries?: Commentary[];
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
  parts: string[]; // Array of part file names, e.g., ["part1.json", "part2.json"]
}

// The type returned by loadGrantha.
// For single-file granthas, it's the full Grantha object.
// For multi-part granthas, it's the metadata + the content of the first part.
// export type LoadedGrantha = Grantha | (GranthaMetadataOnly & { initialPartContent: GranthaPartContent });

// In-memory cache for grantha data
const granthaCache = new Map<string, Grantha>();

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
 */
export async function loadGrantha(granthaId: string): Promise<Grantha> {
  // 1. Check cache first
  if (granthaCache.has(granthaId)) {
    return granthaCache.get(granthaId)!;
  }

  try {
    // 1. Try to fetch metadata.json for multi-part granthas
    const metadataResponse = await fetch(getAssetPath(`/data/library/${granthaId}/metadata.json`));

    if (metadataResponse.ok) {
      // It's a multi-part grantha
      const multiPartMetadata: GranthaMetadataOnly = await metadataResponse.json();

      if (!multiPartMetadata.parts || multiPartMetadata.parts.length === 0) {
        throw new Error(`Multi-part grantha ${granthaId} has no parts defined in metadata.json`);
      }

      // Fetch all part files in parallel
      const partPromises = multiPartMetadata.parts.map(partFileName =>
        fetch(getAssetPath(`/data/library/${granthaId}/${partFileName}`))
          .then(res => {
            if (!res.ok) {
              throw new Error(`Failed to load part file ${partFileName} for grantha ${granthaId}`);
            }
            return res.json();
          })
      );

      const allPartContents: GranthaPartContent[] = await Promise.all(partPromises);

      // Merge all parts into a single Grantha object
      const mergedGrantha: Grantha = {
        ...multiPartMetadata,
        id: multiPartMetadata.grantha_id, // Derived from grantha_id
        title: multiPartMetadata.canonical_title, // Derived from canonical_title
        title_deva: multiPartMetadata.canonical_title, // Placeholder, needs actual Devanari title
        title_iast: multiPartMetadata.canonical_title, // Placeholder, needs actual IAST title
        aliases: multiPartMetadata.aliases || [], // Ensure aliases is always an array
        prefatory_material: [],
        passages: [],
        concluding_material: [],
        commentaries: multiPartMetadata.commentaries
          ? JSON.parse(JSON.stringify(multiPartMetadata.commentaries)).map((c: Commentary) => ({ ...c, passages: [] }))
          : [],
      };

      allPartContents.forEach((partContent, index) => {
        const part_num = index + 1;
        if (partContent.prefatory_material) {
          mergedGrantha.prefatory_material.push(...partContent.prefatory_material.map(p => ({...p, part_num})));
        }
        if (partContent.passages) {
          mergedGrantha.passages.push(...partContent.passages.map(p => ({...p, part_num})));
        }
        if (partContent.concluding_material) {
          mergedGrantha.concluding_material.push(...partContent.concluding_material.map(p => ({...p, part_num})));
        }
        if (partContent.commentaries) {
          partContent.commentaries.forEach(commentaryPart => {
            const existingCommentary = mergedGrantha.commentaries.find(
              c => c.commentary_id === commentaryPart.commentary_id
            );
            if (existingCommentary) {
              existingCommentary.passages.push(...commentaryPart.passages);
            } else {
              mergedGrantha.commentaries.push(commentaryPart);
            }
          });
        }
      });

      // Cache and return the fully assembled grantha
      granthaCache.set(granthaId, mergedGrantha);
      return mergedGrantha;

    } else if (metadataResponse.status === 404) {
      // 2. If metadata.json not found, assume it's a single-file grantha
      const singleFileResponse = await fetch(getAssetPath(`/data/library/${granthaId}.json`));

      if (!singleFileResponse.ok) {
        throw new Error(`Failed to load single-file grantha: ${granthaId}`);
      }

      const data: Grantha = await singleFileResponse.json();
      granthaCache.set(granthaId, data);
      return data;
    } else {
      // Handle other potential errors for metadata.json fetch
      throw new Error(`Failed to fetch metadata for grantha ${granthaId}: ${metadataResponse.statusText}`);
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
      const numA = parseInt(a.split(' ').pop() || '0');
      const numB = parseInt(b.split(' ').pop() || '0');
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
  } else {
    hierarchy.main = [
      {        level: "Passages",
        passages: grantha.passages,
      },
    ];
  }

  return hierarchy;
}