// ---------------------------------------------------------------------------
// validate-schema-mirrors.ts
//
// Cross-repo schema-drift check (SPEC_CROSS_LINKED_REFERENCES.md §2): the
// explorer's grantha*.schema.json files are byte-identical mirrors of
// grantha-data/formats/schemas/, re-synced with `cp` (SCHEMAS.md). This
// verifies they have not drifted — a producer-side schema change that isn't
// mirrored would make the explorer validate against a stale schema.
//
// Fails loudly on any mismatch; the fix is to re-sync with `cp` from the
// sibling grantha-data checkout.
// ---------------------------------------------------------------------------

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

const root = path.resolve(__dirname, '..');
const producerSchemas = path.join(root, '..', 'grantha-data', 'formats', 'schemas');

const SCHEMAS = [
  'grantha.schema.json',
  'grantha-envelope.schema.json',
  'grantha-part.schema.json',
];

const sha256 = (file: string): string => {
  const data = fs.readFileSync(file);
  return createHash('sha256').update(data).digest('hex');
};

let failed = false;

if (!fs.existsSync(producerSchemas)) {
  console.log('[schema-mirrors] producer checkout absent — skipping mirror drift check.');
  process.exit(0);
}

for (const name of SCHEMAS) {
  const mirror = path.join(root, name);
  const producer = path.join(producerSchemas, name);

  if (!fs.existsSync(mirror)) {
    console.error(`FAIL  ${name} — explorer mirror missing`);
    failed = true;
    continue;
  }
  if (!fs.existsSync(producer)) {
    console.error(`FAIL  ${name} — producer schema missing`);
    failed = true;
    continue;
  }

  const mirrorHash = sha256(mirror);
  const producerHash = sha256(producer);
  const synced = mirrorHash === producerHash;
  console.log(`${synced ? 'OK ' : 'FAIL'} ${name}${synced ? '' : ' — mirror drift (re-sync with cp)'}`);
  if (!synced) failed = true;
}

if (failed) {
  console.error('\nSchema mirrors drifted from grantha-data/formats/schemas/.\nRun: cp grantha-data/formats/schemas/*.schema.json grantha-explorer/');
  process.exit(1);
}
console.log('\nAll schema mirrors are in sync with the producer.');
