import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Schema loading and AJV setup
// ---------------------------------------------------------------------------

const root = path.resolve(__dirname, '..');

const granthaSchemaPath  = path.join(root, 'grantha.schema.json');
const envelopeSchemaPath = path.join(root, 'grantha-envelope.schema.json');
const partSchemaPath     = path.join(root, 'grantha-part.schema.json');

const granthaSchema  = JSON.parse(fs.readFileSync(granthaSchemaPath, 'utf-8'));
const envelopeSchema = JSON.parse(fs.readFileSync(envelopeSchemaPath, 'utf-8'));
const partSchema     = JSON.parse(fs.readFileSync(partSchemaPath, 'utf-8'));

// Register schemas by the URI used in cross-file $refs so they resolve correctly.
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(granthaSchema,  'grantha.schema.json');
ajv.addSchema(envelopeSchema, 'grantha-envelope.schema.json');
ajv.addSchema(partSchema,     'grantha-part.schema.json');

const validateGrantha     = ajv.getSchema<Record<string, unknown>>('grantha.schema.json')!;
const validateEnvelope    = ajv.getSchema<Record<string, unknown>>('grantha-envelope.schema.json')!;
const validatePart        = ajv.getSchema<Record<string, unknown>>('grantha-part.schema.json')!;
const validateSubEnvelope = ajv.compile(
  { $ref: 'grantha-envelope.schema.json#/definitions/edition_sub_envelope' }
);

// ---------------------------------------------------------------------------
// File classification
// ---------------------------------------------------------------------------

type FileKind =
  | 'grantha-envelope'
  | 'edition-sub-envelope'
  | 'grantha-part'
  | 'grantha'
  | null;

const VALID_KINDS = new Set<string>([
  'grantha-envelope',
  'edition-sub-envelope',
  'grantha-part',
  'grantha',
]);

/**
 * Return the file's explicit kind marker, or null to skip the file.
 * Classification is a direct lookup on data.kind — no field-presence inference.
 *
 * @param data - Parsed JSON content of the file.
 * @returns The kind string if recognised, or null to skip the file.
 */
function classifyFile(data: Record<string, unknown>): FileKind {
  const kind = data.kind as string | undefined;
  return (kind !== undefined && VALID_KINDS.has(kind)) ? kind as FileKind : null;
}

/** Return the AJV compiled validator for the given kind discriminant. */
function validatorForKind(kind: Exclude<FileKind, null>) {
  switch (kind) {
    case 'grantha-envelope':    return validateEnvelope;
    case 'edition-sub-envelope': return validateSubEnvelope;
    case 'grantha-part':        return validatePart;
    case 'grantha':             return validateGrantha;
  }
}

// ---------------------------------------------------------------------------
// Structure-consistency check (ref depth vs structure_levels depth)
// ---------------------------------------------------------------------------

function getStructureDepth(levels: unknown[]): number {
  if (!levels || levels.length === 0) return 0;
  let depth = 1;
  let current = levels[0] as Record<string, unknown>;
  while (Array.isArray(current.children) && current.children.length > 0) {
    depth++;
    current = current.children[0] as Record<string, unknown>;
  }
  return depth;
}

function checkStructureConsistency(data: Record<string, unknown>): string[] {
  const errs: string[] = [];
  const levels = data.structure_levels as unknown[] | undefined;
  if (!levels || levels.length === 0) return errs; // schema will catch missing field

  const expectedDepth = getStructureDepth(levels);
  const allPassages = [
    ...((data.prefatory_material as unknown[]) || []),
    ...((data.passages          as unknown[]) || []),
    ...((data.concluding_material as unknown[]) || []),
  ] as Array<Record<string, unknown>>;

  for (const passage of allPassages) {
    const ref = passage.ref as string;
    if (!ref) continue;
    const refParts = ref.split('.');

    if (passage.passage_type === 'main') {
      if (refParts.length !== expectedDepth) {
        errs.push(
          `[structure] Passage "${ref}" has ${refParts.length} ref segments ` +
          `but structure_levels defines ${expectedDepth} levels`
        );
      }
      for (const part of refParts) {
        if (!/^\d+$/.test(part)) {
          errs.push(`[structure] Passage ref "${ref}" contains non-numeric segment "${part}"`);
        }
      }
    }
  }

  const commentaries = data.commentaries as unknown;
  if (Array.isArray(commentaries)) {
    for (const commentary of commentaries as Array<Record<string, unknown>>) {
      for (const passage of (commentary.passages as Array<Record<string, unknown>>) || []) {
        const ref = passage.ref as string;
        if (!ref) continue;
        const refParts = ref.split('.');
        if (refParts.length !== expectedDepth) {
          errs.push(
            `[structure] Commentary passage "${ref}" has ${refParts.length} ref segments ` +
            `but structure_levels defines ${expectedDepth} levels`
          );
        }
      }
    }
  }

  return errs;
}

// ---------------------------------------------------------------------------
// Recursive file scan
// ---------------------------------------------------------------------------

function collectJsonFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJsonFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      results.push(full);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Edition path-resolution check (grantha-level envelopes only)
// ---------------------------------------------------------------------------

interface EditionStubShape {
  path?: unknown;
  edition_id?: unknown;
}

/**
 * Verify that every edition stub path in a grantha-level envelope resolves to
 * an existing file or directory under the library root. Catches envelope/data
 * drift (e.g. an editions[].path pointing at a directory that no longer exists
 * after a text was re-imported).
 *
 * @param data - Parsed grantha-envelope content.
 * @param libraryRoot - Absolute path to the library directory.
 * @returns List of error messages (empty when all paths resolve).
 */
function checkEditionPathsResolve(
  data: Record<string, unknown>,
  libraryRoot: string,
): string[] {
  const editions = data.editions as EditionStubShape[] | undefined;
  if (!Array.isArray(editions)) return [];
  const errs: string[] = [];
  for (const edition of editions) {
    if (typeof edition.path !== 'string') continue;
    const full = path.join(libraryRoot, edition.path);
    if (!fs.existsSync(full)) {
      const label =
        typeof edition.edition_id === 'string'
          ? edition.edition_id
          : edition.path;
      errs.push(`[editions] "${label}" path does not resolve: ${edition.path}`);
    }
  }
  return errs;
}

// ---------------------------------------------------------------------------
// Per-block presentation checks (IDEA.md per-block presentation model)
// ---------------------------------------------------------------------------

/** Pinned classification (mirrors lib/data.ts KNOWN_PASSAGE_KINDS). Any kind
 *  found in the corpus without an entry here is a build error — a future prose
 *  leaf (e.g. "Gadya") must be classified explicitly, never silently "verse". */
const KNOWN_PASSAGE_KINDS = new Set([
  'Para',
  'Gadya',
  'Shloka',
  'Mantra',
  'Verse',
  'Sutra',
]);

interface PassageShape {
  ref?: unknown;
  passage_type?: unknown;
  kind?: unknown;
}

/**
 * Verify the per-block kind invariants for a content file (flat grantha or
 * part): every `passage_type: "main"` passage carries a classified `kind`; no
 * prefatory/concluding passage carries one.
 *
 * @param data - Parsed grantha or grantha-part content.
 * @returns List of error messages (empty when the invariants hold).
 */
function checkPassageKinds(data: Record<string, unknown>): string[] {
  const errs: string[] = [];
  for (const key of ['passages', 'prefatory_material', 'concluding_material']) {
    const arr = data[key];
    if (!Array.isArray(arr)) continue;
    for (const passage of arr as PassageShape[]) {
      const ref = typeof passage.ref === 'string' ? passage.ref : '?';
      if (passage.passage_type === 'main') {
        const kind = passage.kind;
        if (typeof kind !== 'string' || !KNOWN_PASSAGE_KINDS.has(kind)) {
          errs.push(`[kind] main passage ${ref} has unclassified kind ${JSON.stringify(kind)}`);
        }
      } else if (passage.kind !== undefined) {
        errs.push(`[kind] framing passage ${ref} must not carry kind (got ${JSON.stringify(passage.kind)})`);
      }
    }
  }
  return errs;
}

/**
 * Verify edition-kind coherence across the whole library (IDEA.md): every
 * edition carries a stamped `edition_kind` ("mula-only" | "commentarial"), a
 * mula-only edition carries a commentary in no part, and a commentarial
 * edition carries a commentary in at least one part (a uniform commentary drop
 * now fails against the committed expectation). A commentarial edition may
 * have an individual commentary-free part (e.g. a sarga whose whole text is
 * one un-glossed passage).
 *
 * @param libraryRoot - Absolute path to the library directory.
 * @returns List of error messages (empty when all editions are coherent).
 */
function checkEditionKindCoherence(libraryRoot: string): string[] {
  const errs: string[] = [];
  const hasCommentary = (obj: Record<string, unknown>): boolean => {
    const commentary = obj['commentary'];
    const commentaries = obj['commentaries'];
    if (commentary && typeof commentary === 'object' && Object.keys(commentary).length > 0) {
      return true;
    }
    return Array.isArray(commentaries) && commentaries.length > 0;
  };

  for (const filePath of collectJsonFiles(libraryRoot).sort()) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    const kind = classifyFile(data);
    if (kind === 'edition-sub-envelope') {
      const editionId = data['edition_id'];
      const label = typeof editionId === 'string' ? editionId : path.basename(path.dirname(filePath));
      const stamp = data['edition_kind'];
      if (stamp !== 'mula-only' && stamp !== 'commentarial') {
        errs.push(`[edition_kind] edition ${label} missing/invalid edition_kind ${JSON.stringify(stamp)}`);
        continue;
      }
      const parts = data['parts'];
      if (!Array.isArray(parts)) continue;
      const dir = path.dirname(filePath);
      let anyPartHasCommentary = false;
      for (const part of parts as { file?: unknown }[]) {
        if (typeof part.file !== 'string') continue;
        const partPath = path.join(dir, part.file);
        if (!fs.existsSync(partPath)) continue;
        const partData = JSON.parse(fs.readFileSync(partPath, 'utf-8')) as Record<string, unknown>;
        const has = hasCommentary(partData);
        if (stamp === 'mula-only' && has) {
          errs.push(`[edition_kind] mula-only edition ${label} part ${part.file} has a commentary`);
        }
        anyPartHasCommentary = anyPartHasCommentary || has;
      }
      if (stamp === 'commentarial' && !anyPartHasCommentary) {
        errs.push(`[edition_kind] commentarial edition ${label} has commentary in no part`);
      }
    } else if (kind === 'grantha') {
      const label = (data['edition_id'] as string) ?? (data['grantha_id'] as string) ?? '?';
      const stamp = data['edition_kind'];
      if (stamp !== 'mula-only' && stamp !== 'commentarial') {
        errs.push(`[edition_kind] edition ${label} missing/invalid edition_kind ${JSON.stringify(stamp)}`);
        continue;
      }
      const expected = hasCommentary(data) ? 'commentarial' : 'mula-only';
      if (stamp !== expected) {
        errs.push(`[edition_kind] edition ${label} edition_kind ${stamp} mismatches commentary presence (${expected})`);
      }
    }
  }
  return errs;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const dataDir = path.resolve(__dirname, '../public/data/library');
const allFiles = collectJsonFiles(dataDir).sort();

let passCount = 0;
let failCount = 0;

for (const filePath of allFiles) {
  const rel = path.relative(dataDir, filePath);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;

  const kind = classifyFile(data);
  if (kind === null) continue;

  const validate = validatorForKind(kind);
  const schemaValid = validate(data);
  const schemaErrors: string[] = schemaValid
    ? []
    : (validate.errors ?? []).map(
        e => `[${e.instancePath || '(root)'}] ${e.message ?? ''}`
      );

  // Only run structure check for content files that have passages
  const structureErrors =
    kind === 'grantha' || kind === 'grantha-part'
      ? checkStructureConsistency(data)
      : [];

  // Edition paths in grantha-level envelopes must resolve under the library.
  const editionPathErrors =
    kind === 'grantha-envelope'
      ? checkEditionPathsResolve(data, dataDir)
      : [];

  // Per-block presentation: kind presence + classification (content files).
  const passageKindErrors =
    kind === 'grantha' || kind === 'grantha-part'
      ? checkPassageKinds(data)
      : [];

  const allErrors = [
    ...schemaErrors,
    ...structureErrors,
    ...editionPathErrors,
    ...passageKindErrors,
  ];

  if (allErrors.length > 0) {
    failCount++;
    console.error(`FAIL  ${rel}`);
    for (const msg of allErrors) {
      console.error(`      ${msg}`);
    }
  } else {
    passCount++;
  }
}

const total = passCount + failCount;
console.log(`\n=== ${passCount} PASS  ${failCount} FAIL  (${total} files scanned) ===`);

// Edition-kind coherence is a cross-file check (envelope vs its parts), run
// once over the whole library.
const editionKindErrors = checkEditionKindCoherence(dataDir);
for (const msg of editionKindErrors) {
  failCount++;
  console.error(`FAIL  ${msg}`);
}

if (failCount === 0) {
  console.log('All data files are valid.');
} else {
  process.exitCode = 1;
}
