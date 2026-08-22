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
const EDITION_AWARE_GATE_ENABLED = false;

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

/** Collect every committed reference from a grantha/grantha-part payload. */
const collectReferences = (data: Record<string, unknown>): CommittedReference[] => {
  const refs: CommittedReference[] = [];
  const walkCommentary = (commentary: Record<string, unknown>) => {
    for (const passage of (commentary.passages as Array<Record<string, unknown>>) || []) {
      for (const r of (passage.references as Array<Record<string, unknown>>) || []) {
        refs.push({
          targetGranthaId: (r.grantha_id as string | null) ?? null,
          editionId: (r.edition_id as string | null | undefined) ?? undefined,
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
  const schoolFlavored = new Set(
    Object.entries(meta)
      .filter(([, entry]) => typeof entry.default_school === 'string')
      .map(([gid]) => gid),
  );

  const references: CommittedReference[] = [];
  for (const filePath of collectJsonFiles(libraryRoot)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    const kind = classify(data);
    if (kind === 'grantha-part' || kind === 'grantha') {
      references.push(...collectReferences(data));
    }
  }

  const result = checkSweepReadiness(EDITION_AWARE_GATE_ENABLED, schoolFlavored, references);
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
