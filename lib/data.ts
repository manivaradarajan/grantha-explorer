// Type definitions matching the JSON schema

export interface SanskritContent {
  devanagari: string;
  roman?: string;
}

export interface Content {
  sanskrit: SanskritContent;
  english_translation: string;
}

/** The declared presentation kind of a main passage — the markdown heading
 *  word, stamped by both converters. Presentation is a total, pinned function
 *  of this value (IDEA.md per-block presentation model). Framing passages
 *  (prefatory/concluding) never carry a kind. */
export type PassageKind =
  | "Para"
  | "Gadya"
  | "Shloka"
  | "Mantra"
  | "Verse"
  | "Sutra"
  | (string & {});

/** Every kind the pinned presentation map classifies. The validator and the
 *  on-disk tests require any `passage.kind` found in the corpus to be a member
 *  (a future prose leaf like "Gadya" must be added here explicitly, never
 *  silently "verse"). */
export const KNOWN_PASSAGE_KINDS: readonly string[] = [
  "Para",
  "Gadya",
  "Shloka",
  "Mantra",
  "Verse",
  "Sutra",
];

/** The total, pinned mapping from a main passage's declared kind to its mula
 *  presentation. Throws on any unclassified kind — never a silent "verse"
 *  default (the failure this model exists to prevent). */
export function presentationFor(kind: string): "prose" | "verse" {
  switch (kind) {
    case "Para":
    case "Gadya":
      return "prose";
    case "Shloka":
    case "Mantra":
    case "Verse":
    case "Sutra":
      return "verse";
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unknown passage kind: ${exhaustive}`);
    }
  }
}

/** The concrete mula-presentation styling for each classification. Consumers
 *  look up by `presentationFor(passage.kind)` — one table, no scattered ifs. */
export const MULA_PRESENTATION: Record<
  "prose" | "verse",
  { wrapper: string; text: string }
> = {
  // Verse kinds: the classic verse column — narrower, centered, left-ruled,
  // larger type (flow-verse). Keeps commentary running wider than the mula.
  verse: {
    wrapper: "mb-5 max-w-2xl mx-auto border-l-2 border-gray-400 pl-6 py-2",
    text: "verse-text font-serif flow-verse leading-8 text-gray-900 whitespace-pre-line",
  },
  // Prose kinds (Para/Gadya): undecorated, commentary-like reading — no bar,
  // no centering, standard font (flow-commentary). No appended verse number.
  prose: {
    wrapper: "mb-5",
    text: "verse-text font-serif flow-commentary leading-relaxed text-gray-700 whitespace-pre-line",
  },
};

export interface Passage {
  ref: string;
  passage_type: "main" | "prefatory" | "concluding";
  label?: string;
  content: Content;
  /** Standalone mūla speaker attribution (e.g. "सञ्जय उवाच"). Verse-level only. */
  speaker?: string;
  /** The markdown heading word (e.g. "Para", "Shloka"). Main passages only;
   *  absent on prefatory/concluding. Per-block presentation model (IDEA.md). */
  kind?: string;
  /** Runs of quoted verses (verse-quote blocks): {start, end} half-open
   *  offsets into content.sanskrit.devanagari. The presentation layer
   *  hang-indents each run and pāda-splits long metres. */
  verse_quotes?: { start: number; end: number }[];
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
  speaker?: string;
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
  roman?: string;
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
  /** The verse lead-in (avatārikā) that introduces this verse's gloss. */
  intro?: Content;
  prefatory_material?: CommentaryPrefatoryItem[];
  content: {
    sanskrit: SanskritContent;
    english: string;
  };
  /** Structured cross-text citations in this passage, emitted by the
   *  producer-side reference pipeline. Half-open offsets into
   *  content.sanskrit.devanagari. */
  references?: Reference[];
}

/** A structured cross-text citation (grantha.schema.json `reference`). */
export interface Reference {
  /** Half-open start offset into content.sanskrit.devanagari. */
  start: number;
  /** Half-open end offset into content.sanskrit.devanagari. */
  end: number;
  /** Verbatim citation text as written. */
  display_text: string;
  /** Resolved text id; null ONLY when the abbreviation was undefined (build error). */
  grantha_id: string | null;
  /** The concrete resolved edition (school-namespace design §4.3). Optional —
   * pre-sweep 1.3.0 references omit it. Absent = no reading specified. */
  edition_id?: string | null;
  /** Canonical dotted target; null for a whole-work citation; range → first endpoint. */
  locator: string | null;
  /** Normalized high endpoint, present only for ranges. */
  locator_end?: string | null;
  /** Present only on enumeration members, grouping the expanded comma-list. */
  group_id?: string | null;
  /** True when a build REF-* error was emitted (undefined abbreviation). */
  unresolved: boolean;
}

export interface Commentary {
  commentary_id: string;
  commentary_title: string;
  commentator: Commentator;
  metadata?: {
    source_file?: string;
  };
  /** When this commentary is a subcommentary, the parent commentary_id. */
  parent_commentary_id?: string;
  /** The commentary's own opening for this part (whole-work mangala / chapter summary). */
  intro?: Content;
  /** Nested subcommentaries resolved at load time. */
  subcommentaries?: Commentary[];
  passages: CommentaryPassage[];
}

import { type Script } from "./i18n";

export interface EditionStub {
  edition_id: string;
  path: string; // Relative path from /data/library/ to the edition file or directory
  commentator?: { devanagari: string; roman?: string };
  commentary_title?: string;
  /** Parent commentary_id this edition comments on (subcommentary editions). */
  commentary_of?: string;
  isDefault?: boolean;
}

/** Bilingual label for a curated navigation section or subsection. */
export interface GranthaSectionLabel {
  devanagari: string;
  english: string;
}

/** A curated subtopic within a section, spanning a contiguous passage range. */
export interface GranthaSubsection {
  label: GranthaSectionLabel;
  start_ref: string;
  end_ref: string;
}

/** A curated top-level navigation section spanning a contiguous passage range. */
export interface GranthaSection {
  id: string;
  label: GranthaSectionLabel;
  start_ref: string;
  end_ref: string;
  subsections?: GranthaSubsection[];
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
  /** Optional curated navigation sections (e.g. Raghavachar §1–§16 for
   *  Vedārthasaṅgraha). Absent for texts without curated section data. */
  sections?: GranthaSection[];
  parts?: { file: string; id: string; first_ref: string }[];
  /** The edition this grantha object was loaded as. Undefined for single-edition granthas. */
  edition_id?: string;
  /** The edition's declared kind ("mula-only" | "commentarial"), stamped into
   *  committed data at build time. Absent for legacy files (the loader falls
   *  back to deriveEditionKind). Gates the commentary pane. */
  edition_kind?: EditionKind;
}

export interface GranthaMetadata {
  id: string;
  path: string; // Relative path from /data/library/ to the grantha file or directory
  title: string;
  title_deva: string;
  title_iast: string;
  /** Available editions for multi-edition granthas (grantha-envelope kind). Absent for single-edition. */
  editions?: EditionStub[];
  /** Category membership, stamped at index time from categories.json text_categories. */
  categories: string[];
  /** Devanagari display label for the grantha's text_type, resolved via categories.json text_type_labels. */
  text_type_display?: string;
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
    /** The school of the grantha's display-default edition, when that default
     *  is a school commentary (school-namespace design §4.1). Declared, and
     *  cross-validated by the sweep check (§6 check #4). */
    default_school?: string;
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
  /** Singular Commentary object per part (exactly one commentary). */
  commentary?: Commentary;
  /** Plural commentaries array (two or more, e.g. a bhāṣya plus a subcommentary), or a legacy keyed object. */
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

        // Fetch the parts that open the same structural section as the first
        // part (e.g. all parts whose first_ref is in the same sarga "1.18" for
        // a kāṇḍa→sarga→śloka text). Grouping by first_ref's parent — rather
        // than the coarse `id` (kāṇḍa "1") — stops a whole kāṇḍa's parts from
        // eager-loading at once; the reader lazy-loads the rest on scroll.
        const firstPartSection = dropLastRefComponent(
          multiPartMetadata.parts[0]?.first_ref ?? ""
        );
        const partsToLoad = multiPartMetadata.parts.filter(
          (p) => dropLastRefComponent(p.first_ref) === firstPartSection
        );

        const loadedPartsContent: GranthaPartContent[] = await Promise.all(
          partsToLoad.map(async (partInfo) => {
            const response = await fetch(getAssetPath(`/data/library/${granthaPath}/${partInfo.file}`));
            if (!response.ok) {
              throw new Error(`Failed to load part file ${partInfo.file} for grantha ${granthaId}`);
            }
            const content: GranthaPartContent = await response.json();

            const commentariesArray = normalizeCommentaries(
              content.commentary,
              content.commentaries,
            );

            return {
              prefatory_material: (content.prefatory_material || []).map(p => ({ ...p, part_id: partInfo.first_ref })),
              passages: (content.passages || []).map(p => ({ ...p, part_id: partInfo.first_ref })),
              concluding_material: (content.concluding_material || []).map(p => ({ ...p, part_id: partInfo.first_ref })),
              commentaries: commentariesArray,
            };
          })
        );

      // Combine the content from all loaded parts, deduping prefatory and
      // concluding material by ref. The lazy part loader (useGranthaLoader's
      // loadPart) already filters by ref; this initial combine must match so a
      // ref shared across loaded parts (e.g. a "0.1" maṅgalācaraṇa) never lands
      // in the assembled grantha twice — a duplicated prefatory ref would
      // produce duplicate React keys ("0.1", folio "leaf-0.1") in the readers.
      const combinedContent: GranthaPartContent = loadedPartsContent.reduce((acc, partContent) => {
        const accPrefatory = acc.prefatory_material || [];
        const accPrefatoryRefs = new Set(accPrefatory.map(p => p.ref));
        const prefatory = [
          ...accPrefatory,
          ...(partContent.prefatory_material || []).filter(p => !accPrefatoryRefs.has(p.ref)),
        ];
        const accConcluding = acc.concluding_material || [];
        const accConcludingRefs = new Set(accConcluding.map(p => p.ref));
        const concluding = [
          ...accConcluding,
          ...(partContent.concluding_material || []).filter(p => !accConcludingRefs.has(p.ref)),
        ];
        return {
          prefatory_material: prefatory,
          passages: [...(acc.passages || []), ...(partContent.passages || [])],
          concluding_material: concluding,
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
        categories: granthaMetadata.categories ?? [],
        parts: multiPartMetadata.parts, // Store the list of all parts
        edition_id: resolvedEditionId,
        editions: granthaEditions,
        prefatory_material: combinedContent.prefatory_material || [],
        passages: sortPassagesByRef(combinedContent.passages || []),
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
              existingCommentary.passages = existingCommentary.passages ?? [];
              existingCommentary.passages.push(...commentaryPart.passages);
            } else {
              partialGrantha.commentaries.push(commentaryPart);
            }
          }
        });
      }

        // Nest subcommentaries under their parent commentary.
        partialGrantha.commentaries = nestSubcommentaries(
          partialGrantha.commentaries,
        );

        // Edition kind: prefer the declared stamp (build-time derivation,
        // per-block presentation model IDEA.md); legacy files without it fall
        // back to deriving from the assembled commentaries.
        partialGrantha.edition_kind =
          multiPartMetadata.edition_kind ?? deriveEditionKind(partialGrantha.commentaries);

        // Cache and return the partially assembled grantha.
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

      // Raw JSON may carry the singular `commentary` (canonical flat schema)
      // or a legacy plural `commentaries` dict/array; normalize into the
      // runtime's flat `commentaries` array (absent → []) before stamping it
      // on the Grantha. `Omit` keeps the union of plural shapes from being
      // collapsed onto Grantha's already-array `commentaries`.
      const rawData = (await singleFileResponse.json()) as Omit<
        Grantha,
        "commentaries"
      > & {
        commentary?: Commentary;
        commentaries?: Commentary[] | Record<string, Commentary>;
      };

      const data: Grantha = {
        ...rawData,
        commentaries: nestSubcommentaries(
          normalizeCommentaries(
            rawData.commentary,
            rawData.commentaries,
          ),
        ),
      };

      // Stamp the resolved edition identity on the returned object so callers
      // (switcher UI, lazy part loader) know which edition this represents.
      data.edition_id = resolvedEditionId;
      data.editions = granthaEditions;
      data.categories = granthaMetadata.categories ?? [];

      // Map the canonical_title onto the display title fields, mirroring the
      // multi-part path: prefer the index's Devanagari/Iast titles, fall back
      // to the file's canonical_title.
      data.title = data.canonical_title ?? granthaMetadata.title;
      data.title_deva = granthaMetadata.title_deva ?? data.canonical_title;
      data.title_iast = granthaMetadata.title_iast ?? data.canonical_title;

      // Edition kind (per-block presentation model IDEA.md): prefer the
      // declared stamp on the flat grantha file; fall back to derivation for
      // legacy files.
      data.edition_kind = data.edition_kind ?? deriveEditionKind(data.commentaries);

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
  // A label-only prefatory anchor (e.g. the gitabhashya mangalācaraṇa) has no
  // mula content — render an empty fragment rather than crashing.
  const text = passage.content?.sanskrit?.devanagari || '';

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
 * Compare two passage refs in natural numeric order.
 *
 * Refs are dot-separated numeric paths (e.g. "1.1", "10.2", "3.4.7"); the
 * comparison walks segment by segment numerically so "2.1" < "10.1" rather
 * than the lexicographic "10.1" < "2.1". Non-numeric segments fall back to a
 * string comparison, and a shorter ref sorts before its extension
 * ("1.1" < "1.1.2").
 *
 * Args:
 *     a: First ref.
 *     b: Second ref.
 *
 * Returns:
 *     Negative when ``a`` precedes ``b``, positive when it follows, else 0.
 */
export function compareRefs(a: string, b: string): number {
  const aParts = a.split(".");
  const bParts = b.split(".");
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const aPart = aParts[i];
    const bPart = bParts[i];
    if (aPart === undefined) return -1;
    if (bPart === undefined) return 1;
    const aNum = Number(aPart);
    const bNum = Number(bPart);
    if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
      if (aNum !== bNum) return aNum - bNum;
    } else if (aPart !== bPart) {
      return aPart < bPart ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Return a copy of ``passages`` sorted by natural ref order.
 *
 * The flat passage list is assembled incrementally as parts lazy-load, and
 * load completion order can differ from document order; sorting at every
 * assembly point keeps ``Grantha.passages`` in document order for all
 * consumers. Sorting an already-ordered array is a stable no-op.
 *
 * Args:
 *     passages: The passages to sort.
 *
 * Returns:
 *     A new array sorted by ``compareRefs`` on each passage's ``ref``.
 */
export function sortPassagesByRef<T extends { ref: string }>(passages: T[]): T[] {
  return [...passages].sort((a, b) => compareRefs(a.ref, b.ref));
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

/**
 * Whether a grantha exposes any commentary. Granthas with no commentary (e.g.
 * Vedārthasaṅgraha) hide the commentary pane entirely.
 *
 * Unifies every pane probe onto the typed `edition_kind` (per-block
 * presentation model, IDEA.md): prefer the declared stamp, fall back to
 * derivation for legacy files without one.
 */
export function hasCommentary(grantha: Grantha | null | undefined): boolean {
  if (!grantha) return false;
  return (grantha.edition_kind ?? deriveEditionKind(grantha.commentaries)) === "commentarial";
}

/** The edition's kind, declared in committed data (per-block presentation
 *  model, IDEA.md): derived at build time from commentary presence. Gates the
 *  commentary pane/chrome; does not drive per-block mula presentation. */
export type EditionKind = "mula-only" | "commentarial";

/** Load-boundary fallback for legacy files lacking a stamped `edition_kind`:
 *  derive it from the assembled commentaries. Bounded to legacy-only;
 *  behaviourally identical to the old `hasCommentary` gating. */
export function deriveEditionKind(commentaries: unknown[] | undefined): EditionKind {
  return (commentaries?.length ?? 0) > 0 ? "commentarial" : "mula-only";
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
/**
 * True when a commentary passage's range ref covers the selected verse ref.
 *
 * A range ref is "<segments>.LO-HI" (e.g. "1.26-39" or "8.3.8-12"): every
 * segment before the last must equal the selected ref's, and the selected
 * verse number must fall within [LO, HI].
 */
function refInRange(passageRef: string, selectedRef: string): boolean {
  const range = passageRef.match(/^(\d+(?:\.\d+)*)-(\d+)$/);
  if (!range) {
    return false;
  }
  const prefix = range[1].split(".").map((s) => parseInt(s, 10));
  const sel = selectedRef.split(".").map((s) => parseInt(s, 10));
  if (prefix.length !== sel.length) {
    return false;
  }
  const lo = prefix[prefix.length - 1];
  const hi = parseInt(range[2], 10);
  const last = sel[sel.length - 1];
  return prefix.slice(0, -1).every((n, i) => n === sel[i]) && last >= lo && last <= hi;
}

export function commentaryPassageForRef(
  passages: CommentaryPassage[],
  selectedRef: string,
): CommentaryPassage | undefined {
  const exact = passages.find((p) => p.ref === selectedRef);
  if (exact) {
    return exact;
  }
  return passages.find((p) => refInRange(p.ref, selectedRef));
}

/** Group passages into a nested PassageGroup tree from `refLevel` onward.
 *  Shared by the hierarchical paths (deep single-file and the loaded leaves of
 *  `buildPartHierarchy`). */
function buildNestedGroups(
  passages: Passage[],
  structureLevel: StructureLevel,
  refLevel: number,
): PassageGroup[] {
  const groups: { [key: string]: Passage[] } = {};

  // Group passages by the current level's ref part
  for (const passage of passages) {
    const refParts = passage.ref.split(".");
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
    const numA = parseInt(a.split(" ").pop() || "0", 10);
    const numB = parseInt(b.split(" ").pop() || "0", 10);
    return numA - numB;
  });

  // Create PassageGroup for each group
  return sortedGroupKeys.map((groupKey) => {
    const groupPassages = groups[groupKey];
    const passageGroup: PassageGroup = {
      level: groupKey,
    };

    if (structureLevel.children && structureLevel.children.length > 0) {
      // If there are more levels, recurse
      passageGroup.children = buildNestedGroups(
        groupPassages,
        structureLevel.children[0],
        refLevel + 1,
      );
    } else {
      // This is the last level of grouping, so add passages
      passageGroup.passages = groupPassages;
    }
    return passageGroup;
  });
}

/** The structural level at a given depth index (walks `children[0]` down). */
function structureLevelAt(structure: StructureLevel[], index: number): StructureLevel {
  let level = structure[0];
  for (let i = 0; i < index; i++) {
    level = level.children![0];
  }
  return level;
}

/** The part level index: the deepest structural level above the passage level,
 *  or -1 for depth-1 texts that have no part level. */
export function partLevelFor(structure: StructureLevel[]): number {
  return getStructureDepth(structure) - 2;
}

/** Compare two numeric prefix tuples lexicographically (shorter sorts smaller). */
function comparePrefixTuples(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? Number.MIN_SAFE_INTEGER;
    const bv = b[i] ?? Number.MIN_SAFE_INTEGER;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/** The part-level structural prefix of a ref as a numeric tuple
 *  (the first `partLevel + 1` dot-segments). */
function sprefix(ref: string, partLevel: number): number[] {
  return ref
    .split(".")
    .slice(0, partLevel + 1)
    .map(Number);
}

/** A structural-group label for one segment of a level. */
function levelLabel(level: StructureLevel, segment: number): string {
  return `${level.scriptNames.devanagari} ${segment}`;
}

/** Numeric tail of a level label ("काण्डः 1" → 1). */
function trailingNumber(label: string): number {
  const match = label.match(/\s(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

/** Recursively sort sibling groups by numeric level tail. */
function sortGroupsByNumber(groups: PassageGroup[]): void {
  groups.sort((a, b) => trailingNumber(a.level) - trailingNumber(b.level));
  for (const g of groups) {
    if (g.children) sortGroupsByNumber(g.children);
  }
}

/** The part identity needed for section-based part loading. `id` (the coarse
 *  top-level segment, e.g. the kāṇḍa) is deliberately absent: section identity
 *  is derived from `first_ref`, never from `id`. */
export interface PartSectionInfo {
  file: string;
  first_ref: string;
}

/** One part's declared ref range: [startRef, endRef), with the part-level
 *  prefixes precomputed so consumers never re-derive them. */
export interface PartRange {
  part: PartSectionInfo;
  /** == part.first_ref. */
  startRef: string;
  /** Next part's first_ref, or null for the last part. */
  endRef: string | null;
  /** sprefix(startRef, partLevel). */
  startPrefix: number[];
  /** sprefix(endRef, partLevel), or null when endRef is null. */
  endPrefix: number[] | null;
  /** Last dot-segment of endRef, or null when endRef is null. */
  endFinalSegment: number | null;
}

/**
 * Compute the tiling part ranges of a multi-part grantha.
 *
 * Precondition: `partLevel >= 0` (a depth >= 2 text). Guards throw on
 * non-monotonic or duplicate `first_ref`s, and on a non-adjacent top-level
 * skip (`1.77.1` → `3.1.1`); normal adjacent kāṇḍa boundaries and the gita
 * prefatory `0.1 → 1.1` (difference 1) do not throw.
 *
 * Args:
 *     parts: The declared parts (in document order).
 *     partLevel: The part level index (see `partLevelFor`).
 *
 * Returns:
 *     The tiling ranges, with prefixes precomputed.
 */
export function partRanges(
  parts: PartSectionInfo[],
  partLevel: number,
): PartRange[] {
  if (partLevel < 0) {
    throw new Error(`partRanges requires partLevel >= 0, got ${partLevel}`);
  }
  for (let i = 0; i < parts.length - 1; i++) {
    const cmp = compareRefs(parts[i].first_ref, parts[i + 1].first_ref);
    if (cmp >= 0) {
      throw new Error(
        `Non-monotonic or duplicate part first_refs: ${parts[i].first_ref} then ${parts[i + 1].first_ref}`,
      );
    }
  }
  const ranges: PartRange[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const endRef = i + 1 < parts.length ? parts[i + 1].first_ref : null;
    if (endRef !== null) {
      const startTop = Number(part.first_ref.split(".")[0]);
      const endTop = Number(endRef.split(".")[0]);
      if (endTop - startTop > 1) {
        throw new Error(
          `Non-adjacent top-level skip: ${part.first_ref} -> ${endRef}`,
        );
      }
    }
    const endFinalSegment =
      endRef !== null ? Number(endRef.split(".").pop()) : null;
    ranges.push({
      part,
      startRef: part.first_ref,
      endRef,
      startPrefix: sprefix(part.first_ref, partLevel),
      endPrefix: endRef !== null ? sprefix(endRef, partLevel) : null,
      endFinalSegment,
    });
  }
  return ranges;
}

/**
 * Whether a part backs a part-level node with structural prefix P.
 *
 * Contract: true iff node prefix P lies within the part's main-passage ref
 * interval [startRef, endRef). Lower bound: sprefix(startRef) <= P, exact
 * because first_ref is by definition the part's first main passage. Upper
 * bound: when endRef is null (last part) the interval is open above — hi is
 * always true. Otherwise P <= sprefix(endRef) — a CLOSED bound, since the
 * part's last passage is endRef - 1 — EXCEPT that when endRef's final segment
 * is 1 (endRef is the first passage of its own section), the part ends in the
 * previous node, so require P < sprefix(endRef).
 *
 * Node prefixes are enumerated from real data only (part first_refs + loaded
 * passage refs), so phantom prefixes never materialize.
 *
 * Args:
 *     range: A part's computed range.
 *     P: The part-level prefix tuple of a candidate node.
 *
 * Returns:
 *     True when the part's main-passage content includes refs under prefix P.
 */
export function partBacksPrefix(range: PartRange, P: number[]): boolean {
  const lo = comparePrefixTuples(range.startPrefix, P) <= 0;
  if (!lo) return false;
  if (range.endPrefix === null) return true;
  let hi = comparePrefixTuples(P, range.endPrefix) <= 0;
  if (range.endFinalSegment === 1) {
    hi = comparePrefixTuples(P, range.endPrefix) < 0;
  }
  return hi;
}

/**
 * Build the structural hierarchy (PassageGroup tree) for a multi-part grantha
 * with a part level (depth >= 2).
 *
 * Every part is placed at the structural location derived from its first_ref —
 * never from the coarse top-level `id`. A part `1.2.1` under Kāṇḍa→Sarga lives
 * at ["काण्डः 1", "सर्गः 2"]. Parts are assigned to a part-level node via
 * `partBacksPrefix` (range intersection), so misaligned parts (a section
 * spanning two parts, or a part spanning many sections) group correctly.
 * Loaded parts attach their passages; unloaded parts become placeholder leaves
 * carrying exactly the parts that back their span.
 *
 * Enumeration is head-only for multi-section parts: a part's `first_ref`
 * enumerates its head section; middle sections appear only after its part
 * loads. Prefatory-only parts (in `loadedFirstRefs` with no main passages) are
 * excluded from enumeration (they rely on being first/eager-loaded — the gita
 * `0.1` part).
 *
 * Args:
 *     structure: The grantha's structure_levels (depth >= 2).
 *     parts: Every declared part, in document order.
 *     loadedMainPassages: Currently-loaded main passages (may carry part_id).
 *     loadedFirstRefs: Part first_refs considered loaded (main+pref+concl).
 *
 * Returns:
 *     The top-level PassageGroup[] tree, children numerically ordered.
 */
export function buildPartHierarchy(
  structure: StructureLevel[],
  parts: PartSectionInfo[],
  loadedMainPassages: Passage[],
  loadedFirstRefs: ReadonlySet<string>,
): PassageGroup[] {
  const partLevel = partLevelFor(structure);
  if (partLevel < 0) {
    throw new Error(
      `buildPartHierarchy requires depth >= 2 (partLevel >= 0), got ${partLevel}`,
    );
  }
  const ranges = partRanges(parts, partLevel);

  // Detect prefatory-only parts: loaded, but with no main passage inside their
  // range. Such parts are excluded from node enumeration so they never surface
  // as an empty structural section (the gita "अध्यायः 0" case).
  const hasMainPassageInRange = (range: PartRange): boolean =>
    loadedMainPassages.some((mp) => {
      const c = compareRefs(mp.ref, range.startRef);
      if (c < 0) return false;
      if (range.endRef === null) return true;
      return compareRefs(mp.ref, range.endRef) < 0;
    });
  const prefatoryOnlyFirstRefs = new Set(
    ranges
      .filter((r) => loadedFirstRefs.has(r.part.first_ref) && !hasMainPassageInRange(r))
      .map((r) => r.part.first_ref),
  );

  // Enumerate candidate part-level node prefixes from the union of part
  // first_refs (excluding prefatory-only) and loaded main passage refs.
  const candidatePrefixes = new Map<string, number[]>();
  const addPrefix = (ref: string): void => {
    const p = sprefix(ref, partLevel);
    candidatePrefixes.set(p.join("."), p);
  };
  for (const p of parts) {
    if (prefatoryOnlyFirstRefs.has(p.first_ref)) continue;
    addPrefix(p.first_ref);
  }
  for (const mp of loadedMainPassages) {
    addPrefix(mp.ref);
  }

  // Create the part-level leaf groups and assign parts by range intersection.
  const partGroups = new Map<string, PassageGroup>();
  for (const [, prefix] of candidatePrefixes) {
    const group: PassageGroup = {
      level: levelLabel(structureLevelAt(structure, partLevel), prefix[partLevel]),
      children: [],
      partIds: [],
    };
    partGroups.set(prefix.join("."), group);
  }
  for (const range of ranges) {
    for (const [key, prefix] of candidatePrefixes) {
      if (partBacksPrefix(range, prefix)) {
        partGroups.get(key)!.partIds!.push(range.part.first_ref);
      }
    }
  }

  // Attach loaded passages (grouped to the passage level) to their part-level
  // node. Loaded + unloaded backing parts are already in `partIds` (the flat
  // partial-load representation).
  const passagesByPrefix = new Map<string, Passage[]>();
  for (const mp of loadedMainPassages) {
    const key = sprefix(mp.ref, partLevel).join(".");
    if (!passagesByPrefix.has(key)) passagesByPrefix.set(key, []);
    passagesByPrefix.get(key)!.push(mp);
  }
  for (const [key, group] of partGroups) {
    const passages = passagesByPrefix.get(key) ?? [];
    if (passages.length > 0) {
      group.children = buildNestedGroups(
        passages,
        structureLevelAt(structure, partLevel + 1),
        partLevel + 1,
      );
    }
  }

  // Placement invariant (defense-in-depth): every non-prefatory part's head
  // node exists after enumeration. Cannot fire on a well-formed corpus (the
  // head is always enumerated) — guards against a future enumeration bug.
  for (const range of ranges) {
    if (prefatoryOnlyFirstRefs.has(range.part.first_ref)) continue;
    if (!partGroups.has(range.startPrefix.join("."))) {
      throw new Error(
        `Placement invariant violated: part ${range.part.first_ref} has no head node`,
      );
    }
  }

  // Nest the part-level groups under their container groups (levels 0..partLevel-1).
  const insertIntoTree = (
    siblings: PassageGroup[],
    level: number,
    prefix: number[],
    leaf: PassageGroup,
  ): void => {
    if (level === partLevel) {
      if (!siblings.includes(leaf)) siblings.push(leaf);
      return;
    }
    const label = levelLabel(structureLevelAt(structure, level), prefix[level]);
    let container = siblings.find((g) => g.level === label);
    if (!container) {
      container = { level: label, children: [] };
      siblings.push(container);
    }
    if (!container.children) container.children = [];
    insertIntoTree(container.children, level + 1, prefix, leaf);
  };
  const root: PassageGroup[] = [];
  for (const [key, group] of partGroups) {
    const prefix = candidatePrefixes.get(key)!;
    insertIntoTree(root, 0, prefix, group);
  }

  sortGroupsByNumber(root);
  return root;
}

/** The first_refs of parts that are loaded (a part is loaded when its
 *  first_ref appears in any loaded passage/prefatory/concluding ref). Shared by
 *  the sidebar builder and the eager-load path. */
export function loadedFirstRefsFor(grantha: Grantha): ReadonlySet<string> {
  const loadedRefs = new Set([
    ...grantha.passages.map((p) => p.ref),
    ...(grantha.prefatory_material ?? []).map((p) => p.ref),
    ...(grantha.concluding_material ?? []).map((p) => p.ref),
  ]);
  return new Set(
    (grantha.parts ?? [])
      .filter((p) => loadedRefs.has(p.first_ref))
      .map((p) => p.first_ref),
  );
}

export function getPassageHierarchy(grantha: Grantha): PassageHierarchy {
  const structure = grantha.structure_levels;
  const isHierarchical = structure && structure.length > 0;

  const hierarchy: PassageHierarchy = {
    prefatory: grantha.prefatory_material,
    main: [],
    concluding: grantha.concluding_material || [],
  };

  if (isHierarchical && partLevelFor(structure) >= 0) {
    // Depth >= 2. Multi-part: part-driven tree with section-scoped placeholders.
    // Non-multi-part (a deep single-file text): the plain hierarchical path.
    if (grantha.parts && grantha.parts.length > 0) {
      hierarchy.main = buildPartHierarchy(
        structure,
        grantha.parts,
        grantha.passages,
        loadedFirstRefsFor(grantha),
      );
    } else {
      hierarchy.main = buildNestedGroups(grantha.passages, structure[0], 0);
    }
  } else {
    // Depth 1 (with or without parts) — the flat path.
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
  /** Passages directly under the section heading. For curated sections this
   *  includes prefatory/concluding items (e.g. the preamble's 0.1–0.3). */
  passages: (Passage | PrefatoryMaterial)[];
  /** Curated subsections (Vedārthasaṅgraha-style). When present, the body
   *  renders subsection labels + their passages before the direct passages. */
  subsections?: CuratedSidebarSubsection[];
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

export function getStructureDepth(structure: StructureLevel[]): number {
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

// ---------------------------------------------------------------------------
// Curated sidebar model (Raghavachar §-style sections for Vedārthasaṅgraha)
// ---------------------------------------------------------------------------

/** One curated subsection in sidebar render shape: label plus its passages. */
export interface CuratedSidebarSubsection {
  /** Devanagari subsection label. */
  label: string;
  /** Ref of the subsection's first passage (its jump target). */
  startRef: string;
  passages: (Passage | PrefatoryMaterial)[];
}

/**
 * Normalize a commentary payload into a flat `Commentary[]`.
 *
 * Handles the three source shapes: singular `commentary` (canonical flat
 * schema), plural `commentaries` as an array, and plural `commentaries` as a
 * keyed object. Absent/null payloads resolve to `[]` so the runtime's
 * non-optional `Grantha.commentaries` always holds an array.
 *
 * Args:
 *     commentary: The singular commentary (or undefined).
 *     commentaries: The plural payload (array, keyed object, or undefined).
 *
 * Returns:
 *     The normalized flat array of commentaries.
 */
function normalizeCommentaries(
  commentary: Commentary | undefined,
  commentaries: Commentary[] | Record<string, Commentary> | undefined,
): Commentary[] {
  if (commentary) {
    return [commentary];
  }
  if (!commentaries) {
    return [];
  }
  return Array.isArray(commentaries)
    ? commentaries
    : Object.values(commentaries);
}

/**
 * Nest subcommentaries under their parent commentary in place.
 *
 * Entries carrying a `parent_commentary_id` are attached to the matching
 * parent's `subcommentaries[]` and removed from the top level. Backward
 * compatible: no `parent_commentary_id` entries yield an unchanged flat
 * list. Orphaned subcommentaries (parent not present) are kept at top
 * level so no commentary is ever dropped.
 *
 * Args:
 *     commentaries: The flat list of commentaries.
 *
 * Returns:
 *     The top-level commentaries with subcommentaries nested.
 */
export function nestSubcommentaries(commentaries: Commentary[]): Commentary[] {
  const byId = new Map<string, Commentary>();
  const topLevel: Commentary[] = [];
  for (const commentary of commentaries) {
    byId.set(commentary.commentary_id, commentary);
    topLevel.push(commentary);
  }

  for (const commentary of commentaries) {
    const parentId = commentary.parent_commentary_id;
    if (!parentId) {
      continue;
    }
    const parent = byId.get(parentId);
    if (!parent) {
      continue;
    }
    parent.subcommentaries = parent.subcommentaries ?? [];
    parent.subcommentaries.push(commentary);
    const index = topLevel.indexOf(commentary);
    if (index !== -1) {
      topLevel.splice(index, 1);
    }
  }
  return topLevel;
}

/** Map passage refs to their document-order index in the navigation list. */
export function buildRefIndexMap(
  ordered: (Passage | PrefatoryMaterial)[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < ordered.length; i++) {
    map.set(ordered[i].ref, i);
  }
  return map;
}

/**
 * Build a flat, section-structured sidebar model from a grantha's curated
 * `sections` data (see grantha.schema.json). Returns null when the grantha
 * has no curated sections — callers then fall back to the structure-based
 * model.
 *
 * Passages are assigned to sections and subsections by their ref markers in
 * document order (prefatory + main + concluding), using start/end refs as
 * inclusive index bounds. This is robust to dot-notation refs and any gaps;
 * it never relies on numeric ref arithmetic. Every passage is placed in
 * exactly one section; a passage inside a section but outside any of its
 * subsection ranges is placed directly on the section.
 *
 * Each curated section becomes a `SidebarSection` with a single-segment
 * boundary whose path is its Devanagari label, so the sidebar's breadcrumb
 * popup lists every curated section as a sibling.
 *
 * Args:
 *     grantha: The grantha to model.
 *
 * Returns:
 *     Curated sections in document order as `SidebarSection`s, or null when
 *     the grantha has no curated sections.
 *
 * Raises:
 *     Error: When a curated start_ref/end_ref doesn't exist in the grantha,
 *         when a section or subsection spans no passages (empty or
 *         out-of-order range), or when subsection ranges overlap (a passage
 *         would render twice).
 */
export function getCuratedSidebarSections(
  grantha: Grantha,
): SidebarSection[] | null {
  if (!grantha.sections || grantha.sections.length === 0) {
    return null;
  }

  const ordered = getAllPassagesForNavigation(grantha);
  const indexByRef = buildRefIndexMap(ordered);

  const locate = (ref: string, kind: string, id: string): number => {
    const idx = indexByRef.get(ref);
    if (idx === undefined) {
      throw new Error(
        `curated ${kind} ${id}: ref "${ref}" not found in grantha passages`,
      );
    }
    return idx;
  };

  return grantha.sections.map((section) => {
    const startIdx = locate(section.start_ref, "section", section.id);
    const endIdx = locate(section.end_ref, "section", section.id);
    const sectionPassages = ordered.slice(startIdx, endIdx + 1);
    if (sectionPassages.length === 0) {
      throw new Error(
        `curated section ${section.id}: spans no passages (${section.start_ref}..${section.end_ref})`,
      );
    }

    const subsections: CuratedSidebarSubsection[] = [];
    const coveredRefs = new Set<string>();

    for (const sub of section.subsections ?? []) {
      const subStart = locate(
        sub.start_ref,
        "subsection",
        `${section.id}/${sub.label.devanagari}`,
      );
      const subEnd = locate(
        sub.end_ref,
        "subsection",
        `${section.id}/${sub.label.devanagari}`,
      );
      const passages = ordered.slice(subStart, subEnd + 1);
      if (passages.length === 0) {
        throw new Error(
          `curated section ${section.id}: subsection "${sub.label.devanagari}" spans no passages (${sub.start_ref}..${sub.end_ref})`,
        );
      }
      for (const p of passages) {
        if (coveredRefs.has(p.ref)) {
          throw new Error(
            `curated section ${section.id}: passage ${p.ref} covered by more than one subsection`,
          );
        }
        coveredRefs.add(p.ref);
      }
      subsections.push({
        label: sub.label.devanagari,
        startRef: sub.start_ref,
        passages,
      });
    }

    const directPassages = sectionPassages.filter(
      (p) => !coveredRefs.has(p.ref),
    );

    return {
      boundary: {
        path: [section.label.devanagari],
        markerRef: section.start_ref,
        firstVerseRef: section.start_ref,
        partIds: [],
      },
      passages: directPassages,
      subsections,
    };
  });
}

/**
 * Resolve the active subsection of a curated section for a selected passage
 * ref — the subsection whose passage range contains the ref. Returns
 * undefined when the ref is a direct passage (not covered by any subsection)
 * or the section has no subsections.
 *
 * The active subsection drives the sidebar's drill-down: it is the sticky sub
 * band and the only one that expands its paras.
 *
 * Args:
 *     section: A curated sidebar section (from getCuratedSidebarSections).
 *     selectedRef: The currently selected passage ref.
 *
 * Returns:
 *     The containing subsection, or undefined when none applies.
 */
export function getCuratedActiveSubsection(
  section: SidebarSection,
  selectedRef: string,
): CuratedSidebarSubsection | undefined {
  return (section.subsections ?? []).find((sub) =>
    sub.passages.some((p) => p.ref === selectedRef),
  );
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

/**
 * Return the first_ref of the next unloaded part file for a multi-part
 * grantha, or undefined when every declared part is loaded.
 *
 * Parts are considered loaded when their first passage is present in the
 * grantha's navigation-ordered passage list. The scan walks the envelope's
 * parts array in order to find the last loaded index and returns the next
 * one — scroll sentinels use this to lazy-load parts as the reader reaches
 * the end of the loaded content.
 *
 * Args:
 *     grantha: The grantha (must be multi-part for anything to be returned).
 *     loadedPassages: The currently loaded passages (prefatory + main +
 *         concluding), used to test which part files are already present.
 *
 * Returns:
 *     The next part file's first_ref, or undefined when nothing is left to
 *     load.
 */
export function nextUnloadedPartFirstRef(
  grantha: Grantha,
  loadedPassages: (Passage | PrefatoryMaterial)[],
): string | undefined {
  if (!grantha.parts || grantha.parts.length === 0) {
    return undefined;
  }
  const loadedFirstRefs = new Set(
    grantha.parts
      .filter((p) =>
        loadedPassages.some((passage) => passage.ref === p.first_ref)
      )
      .map((p) => p.first_ref)
  );
  let lastLoadedPartIndex = -1;
  for (let i = 0; i < grantha.parts.length; i++) {
    if (loadedFirstRefs.has(grantha.parts[i].first_ref)) {
      lastLoadedPartIndex = i;
    }
  }
  if (lastLoadedPartIndex < grantha.parts.length - 1) {
    const nextPart = grantha.parts[lastLoadedPartIndex + 1];
    if (nextPart && !loadedFirstRefs.has(nextPart.first_ref)) {
      return nextPart.first_ref;
    }
  }
  return undefined;
}

/**
 * Return the first_ref of the previous (earlier) unloaded part file for a
 * multi-part grantha, or undefined when the earliest loaded part is the first
 * declared part (nothing further back to load).
 *
 * Mirror of `nextUnloadedPartFirstRef` for scrolling backward: the reader uses
 * this to lazy-load the parts before the current position as the user scrolls
 * up, so earlier chapters (not just later ones) become available.
 *
 * Args:
 *     grantha: The grantha (must be multi-part for anything to be returned).
 *     loadedPassages: The currently loaded passages (prefatory + main +
 *         concluding), used to test which part files are already present.
 *
 * Returns:
 *     The previous unloaded part's first_ref, or undefined when nothing is
 *     left to load backward.
 */
export function previousUnloadedPartFirstRef(
  grantha: Grantha,
  loadedPassages: (Passage | PrefatoryMaterial)[],
): string | undefined {
  if (!grantha.parts || grantha.parts.length === 0) {
    return undefined;
  }
  const loadedFirstRefs = new Set(
    grantha.parts
      .filter((p) =>
        loadedPassages.some((passage) => passage.ref === p.first_ref)
      )
      .map((p) => p.first_ref)
  );
  // The loaded set may have gaps (e.g. the preface part 0.1 and a deep-linked
  // chapter 3 are loaded while chapters 1–2 are not). Return the part that
  // immediately precedes the first loaded part which has an unloaded
  // predecessor, so scrolling up fills the gap in reverse document order.
  for (let i = 0; i < grantha.parts.length; i++) {
    if (loadedFirstRefs.has(grantha.parts[i].first_ref)) {
      if (i > 0) {
        const prevPart = grantha.parts[i - 1];
        if (prevPart && !loadedFirstRefs.has(prevPart.first_ref)) {
          return prevPart.first_ref;
        }
      }
    }
  }
  return undefined;
}

/**
 * Return the first_refs of the parts whose range intersects the structural
 * section of `verseRef` and are not yet loaded, in declaration order.
 *
 * The structural section of a ref is its part-level prefix (e.g. `"1.1"` for
 * `"1.1.2"` in a kāṇḍa→sarga→śloka text). Matching by range intersection
 * (via the shared `partBacksPrefix`) means a part that *extends into* a
 * section from a previous one (a misaligned Brihadaranyaka part) is included,
 * and a part that ends just before a section boundary is excluded. For aligned
 * texts (gita/ramayana, one part per section) this is identical to exact
 * section matching. Shares `partRanges` with `buildPartHierarchy`, so the
 * eager-load path can never diverge from the sidebar's `partIds`.
 *
 * Args:
 *     parts: The grantha's declared parts (in document order).
 *     verseRef: The selected verse ref.
 *     loadedRefs: The set of loaded passage/prefatory/concluding refs.
 *     partLevel: The part level index (see `partLevelFor`); < 0 → [] (depth-1).
 *
 * Returns:
 *     The unloaded first_refs of parts intersecting `verseRef`'s section.
 */
export function sectionPartsToLoad(
  parts: PartSectionInfo[],
  verseRef: string,
  loadedRefs: ReadonlySet<string>,
  partLevel: number,
): string[] {
  if (partLevel < 0 || parts.length === 0) return [];
  const ranges = partRanges(parts, partLevel);
  const sectionPrefix = sprefix(verseRef, partLevel);
  return ranges
    .filter(
      (r) => partBacksPrefix(r, sectionPrefix) && !loadedRefs.has(r.part.first_ref),
    )
    .map((r) => r.part.first_ref);
}
