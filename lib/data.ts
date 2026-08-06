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
  parts?: { file: string; id: string }[];
}

export interface GranthaMetadata {
  id: string;
  path: string; // Relative path from /data/library/ to the grantha file or directory
  title: string;
  title_deva: string;
  title_iast: string;
}

export interface PassageGroup {
  level: string;
  partId?: string; // Add partId to PassageGroup
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
  parts: { file: string; id: string }[]; // Array of part file names, e.g., ["part1.json", "part2.json"]
}
    
    // The type returned by loadGrantha.
    // For single-file granthas, it's the full Grantha object.// For multi-part granthas, it's the metadata + the content of the first part.
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
 * TODO: Remove duplicate structure_levels from part files (should only be in envelope.json)
 */
export async function loadGrantha(granthaId: string): Promise<Grantha> {
  // 1. Check cache first
  if (granthaCache.has(granthaId)) {
    return granthaCache.get(granthaId)!;
  }

  try {
    // Get the path from the generated index
    const granthasList = await getAvailableGranthas();
    const granthaMetadata = granthasList.find(g => g.id === granthaId);

    if (!granthaMetadata) {
      throw new Error(`Grantha ${granthaId} not found in index`);
    }

    const granthaPath = granthaMetadata.path;

    // Determine if it's a directory (multi-part) or file (single-part)
    const isMultiPart = !granthaPath.endsWith('.json');

    if (isMultiPart) {
      // Try to fetch envelope.json for multi-part granthas
      const envelopeResponse = await fetch(getAssetPath(`/data/library/${granthaPath}/envelope.json`));

      if (envelopeResponse.ok) {
        // It's a multi-part grantha. Read the envelope.
        const rawEnvelope = await envelopeResponse.json();

        // The envelope now has a simple parts array of filenames
        const multiPartMetadata: GranthaMetadataOnly = {
          ...rawEnvelope,
          parts: rawEnvelope.parts.map((partFile: string) => {
            // Extract part number from filename (e.g., "part1.json" -> "1")
            const partNumMatch = partFile.match(/part(\d+)\.json/);
            const partId = partNumMatch ? partNumMatch[1] : partFile.replace('.json', '');
            return {
              file: partFile,
              id: partId,
            };
          }),
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

            // Convert commentaries from object to array if needed
            let commentariesArray: Commentary[] = [];
            if (content.commentaries) {
              if (Array.isArray(content.commentaries)) {
                commentariesArray = content.commentaries;
              } else {
                // Convert object format to array
                commentariesArray = Object.values(content.commentaries);
              }
            }

            return {
              prefatory_material: (content.prefatory_material || []).map(p => ({ ...p, part_id: partInfo.id })),
              passages: (content.passages || []).map(p => ({ ...p, part_id: partInfo.id })),
              concluding_material: (content.concluding_material || []).map(p => ({ ...p, part_id: partInfo.id })),
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
          commentaries: [...(acc.commentaries || []), ...(partContent.commentaries || [])],
        };
      }, { passages: [] });


      // Create a partial Grantha object with metadata and the combined content
      const partialGrantha: Grantha = {
        ...multiPartMetadata,
        id: multiPartMetadata.grantha_id,
        title: multiPartMetadata.canonical_title ?? granthaMetadata.title_deva,
        title_deva: multiPartMetadata.canonical_title ?? granthaMetadata.title_deva,
        title_iast: multiPartMetadata.canonical_title ?? granthaMetadata.title_iast,
        aliases: multiPartMetadata.aliases || [],
        parts: multiPartMetadata.parts, // Store the list of all parts
        prefatory_material: combinedContent.prefatory_material || [],
        passages: combinedContent.passages || [],
        concluding_material: combinedContent.concluding_material || [],
        commentaries: multiPartMetadata.commentaries
          ? JSON.parse(JSON.stringify(multiPartMetadata.commentaries)).map((c: Commentary) => ({ ...c, passages: [] }))
          : [],
      };

      // Merge commentaries from the loaded parts
      if (combinedContent.commentaries) {
        combinedContent.commentaries.forEach(commentaryPart => {
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
        granthaCache.set(granthaId, partialGrantha);
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

      granthaCache.set(granthaId, data);
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

      // If it's a top-level group and passages have part_id, assign it
      if (refLevel === 0 && groupPassages.length > 0 && groupPassages[0].part_id) {
        passageGroup.partId = groupPassages[0].part_id;
      }

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

    // Add placeholders for unloaded parts
    if (grantha.parts) {
      const existingPartIds = new Set(hierarchy.main.map(group => group.partId).filter(Boolean));

      grantha.parts.forEach((part) => {
        if (!existingPartIds.has(part.id)) {
          // Derive a display level from the part.id (e.g., "part1" -> "1")
          const partNumMatch = part.id.match(/\d+/);
          const displayNum = partNumMatch ? partNumMatch[0] : '';
          const groupKey = `${structure[0].scriptNames.devanagari} ${displayNum}`;
          hierarchy.main.push({
            level: groupKey,
            partId: part.id,
            children: [], // Placeholder
          });
          existingPartIds.add(part.id);
        }
      });

      // Sort the main hierarchy by partId (numerically) or by level if partId is missing
      hierarchy.main.sort((a, b) => {
        const getSortKey = (group: PassageGroup) => {
          if (group.partId) {
            const match = group.partId.match(/\d+/);
            return match ? parseInt(match[0]) : 0;
          } else {
            const match = group.level.match(/\s(\d+)$/);
            return match ? parseInt(match[1]) : 0;
          }
        };
        return getSortKey(a) - getSortKey(b);
      });
    }
  } else {
    hierarchy.main = [
      {        level: "Passages",
        passages: grantha.passages,
      },
    ];
  }

    return hierarchy;

  }

  

  export async function loadGranthaPart(granthaId: string, partFileName: string): Promise<GranthaPartContent> {

    const response = await fetch(getAssetPath(`/data/library/${granthaId}/${partFileName}`));

    if (!response.ok) {

      throw new Error(`Failed to load part file ${partFileName} for grantha ${granthaId}`);

    }

    return response.json();

  }

  