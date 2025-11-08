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
}

export interface PrefatoryMaterial {
  ref: string;
  passage_type: "prefatory";
  label: {
    devanagari: string;
    roman?: string;
  };
  content: Content;
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
  concluding_material?: PrefatoryMaterial[];
  commentaries?: Commentary[];
}

export interface GranthaMetadata {
  id: string;
  title: string;
  title_deva: string;
  title_iast: string;
}

export interface PassageGroup {
  level: string;
  passages: Passage[];
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

// Data loading functions

/**
 * Get list of available granthas metadata
 * Loads from static JSON file generated at build time
 * Next.js caches fetch requests automatically
 */
export const getGranthasMeta = async (): Promise<GranthaMeta> => {
  const response = await fetch('/data/granthas-meta.json');
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
    const response = await fetch("/data/generated/granthas.json");

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
 * Load full grantha data from JSON file
 */
export async function loadGrantha(granthaId: string): Promise<Grantha> {
  const response = await fetch(`/data/library/${granthaId}.json`);

  if (!response.ok) {
    throw new Error(`Failed to load grantha: ${granthaId}`);
  }

  const data: Grantha = await response.json();
  return data;
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

  // Use the first structure level (most common case)
  const level = grantha.structure_levels[0];
  return level.scriptNames[script] || level.scriptNames.devanagari;
}

/**
 * Get all passages including prefatory material for navigation
 */
export function getAllPassagesForNavigation(
  grantha: Grantha
): Array<Passage | PrefatoryMaterial> {
  return [
    ...grantha.prefatory_material,
    ...grantha.passages,
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
  const isHierarchical = !!(structure?.[0]?.children && structure[0].children.length > 0);

  const hierarchy: PassageHierarchy = {
    prefatory: grantha.prefatory_material,
    main: [],
    concluding: grantha.concluding_material || [],
  };

  if (isHierarchical) {
    const topLevel = structure[0];
    const groups: { [key: string]: PassageGroup } = {};

    for (const passage of grantha.passages) {
      const refParts = passage.ref.split('.');
      const topLevelRef = refParts[0];
      const groupLabel = `${topLevel.scriptNames.devanagari} ${topLevelRef}`;

      if (!groups[groupLabel]) {
        groups[groupLabel] = {
          level: groupLabel,
          passages: [],
        };
      }
      groups[groupLabel].passages.push(passage);
    }
    hierarchy.main = Object.values(groups);
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
