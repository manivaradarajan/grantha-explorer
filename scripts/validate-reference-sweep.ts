// ---------------------------------------------------------------------------
// validate-reference-sweep.ts
//
// Mechanically enforces the sweep-before-gate ordering (school-namespace
// design §4.3 / §6 check #9): while the edition-aware gate is enabled, no
// committed reference to a school-flavored grantha may lack an edition_id.
//
// Gate flag discipline: flip `EDITION_AWARE_GATE_ENABLED` to `true` in the
// same change that ships the edition-aware runtime gate (design §4.4). Until
// then this script runs as a progress report, so the sweep's completion is
// visible before the gate can legally turn on.
// ---------------------------------------------------------------------------

import * as fs from 'fs';
import * as path from 'path';
import { checkSweepReadiness } from '../lib/referenceSweep';
import type { CommittedReference } from '../lib/referenceSweep';

/** Flip to true in the same change that ships the edition-aware gate. */
const EDITION_AWARE_GATE_ENABLED = true;

const root = path.resolve(__dirname, '..');
const libraryRoot = path.join(root, 'public/data/library');
const metaPath = path.join(root, 'public/data/granthas-meta.json');

interface MetaEntry {
  default_school?: string;
}

type FileKind = 'grantha-envelope' | 'edition-sub-envelope' | 'grantha-part' | 'grantha';

const classify = (data: Record<string, unknown>): FileKind | null => {
  const kind = data.kind as string | undefined;
  return (
    kind === 'grantha-envelope' ||
    kind === 'edition-sub-envelope' ||
    kind === 'grantha-part' ||
    kind === 'grantha'
  )
    ? (kind as FileKind)
    : null;
};

const collectJsonFiles = (dir: string): string[] => {
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
};

/** Collect every committed reference from a grantha/grantha-part payload,
 *  tagging the citing edition's school and the target's default school. */
const collectReferences = (
  data: Record<string, unknown>,
  sourceSchool: string,
  targetDefaultSchool: (gid: string | null) => string,
): CommittedReference[] => {
  const refs: CommittedReference[] = [];
  const walkCommentary = (commentary: Record<string, unknown>) => {
    for (const passage of (commentary.passages as Array<Record<string, unknown>>) || []) {
      for (const r of (passage.references as Array<Record<string, unknown>>) || []) {
        const gid = (r.grantha_id as string | null) ?? null;
        refs.push({
          targetGranthaId: gid,
          editionId: (r.edition_id as string | null | undefined) ?? undefined,
          sourceSchool,
          targetDefaultSchool: targetDefaultSchool(gid),
        });
      }
    }
  };
  const commentary = data.commentary as Record<string, unknown> | undefined;
  if (commentary) walkCommentary(commentary);
  for (const c of (data.commentaries as Array<Record<string, unknown>>) || []) {
    walkCommentary(c);
  }
  return refs;
};

const main = (): void => {
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as Record<string, MetaEntry>;
  const targetDefaultSchool = (gid: string | null): string => {
    if (!gid) return '';
    const entry = meta[gid];
    return typeof entry?.default_school === 'string' ? entry.default_school : '';
  };

  // Source edition → school from the frontmatter stamps in grantha-data
  // (design §4.2 — the source frontmatter is the school authority).
  // edition derivation mirrors import_editions.edition_id_for_file (strip the
  // trailing -NN suffix); a flat single-edition file falls back to grantha_id.
  const sourceSchoolByEdition: Record<string, string> = {};
  const structuredMdRoot = path.join(root, '..', 'grantha-data', 'structured_md');
  if (fs.existsSync(structuredMdRoot)) {
    const editionSuffixRe = /-\d+(?:-\d+)*\.md$/;
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.md') && !/(SOURCE_ISSUES|README|BUGS|diff_log)/.test(entry.name)) {
          const text = fs.readFileSync(full, 'utf-8');
          const fmM = /^---\n([\s\S]*?)\n---/.exec(text);
          if (!fmM) continue;
          const fm = fmM[1];
          const ns = /citation_namespace:\s*(\w+)/.exec(fm)?.[1];
          if (!ns) continue;
          const gid = /grantha_id:\s*(\S+)/.exec(fm)?.[1];
          const derivedEdition = entry.name.replace(editionSuffixRe, '');
          sourceSchoolByEdition[derivedEdition] = ns;
          if (gid && gid !== derivedEdition) {
            // Flat single-edition files: grantha_id is the edition id.
            sourceSchoolByEdition[gid] = ns;
          }
        }
      }
    };
    walk(structuredMdRoot);
  }

  const references: CommittedReference[] = [];
  for (const filePath of collectJsonFiles(libraryRoot)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    const kind = classify(data);
    if (kind === 'grantha-part' || kind === 'grantha') {
      const editionId = (data.edition_id as string | undefined) ?? (data.grantha_id as string | undefined) ?? '';
      references.push(...collectReferences(data, sourceSchoolByEdition[editionId] ?? '', targetDefaultSchool));
    }
  }

  const result = checkSweepReadiness(EDITION_AWARE_GATE_ENABLED, references);
  for (const line of result.report) {
    console.log(line);
  }

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.error(`FAIL  ${err}`);
    }
    process.exitCode = 1;
    return;
  }

  if (EDITION_AWARE_GATE_ENABLED) {
    console.log('Edition-aware gate: ON — reference sweep is clean.');
  } else {
    console.log(
      'Edition-aware gate: OFF — sweep report only. ' +
        'Flip EDITION_AWARE_GATE_ENABLED when the gate ships.',
    );
  }
};

main();
