#!/usr/bin/env node
/**
 * Citation-matcher conformance bridge.
 *
 * Loads the LIVE TypeScript matcher (`lib/quotedMatch.ts`) and, for each
 * `{window, passage}` fixture read from stdin (JSON array), emits per-fixture
 * JSON `{accept, span}` on stdout. Invoked as a subprocess by the Python
 * conformance test (`test_citation_repair.py::test_matches_ts_conformance`) so
 * the parity contract is pinned to the real matcher, never a frozen snapshot.
 *
 * Forced to the MANUAL grapheme scan (`GRANTHA_MATCHER_NO_ICU=1`) so both the
 * TS and Python sides run the identical deterministic combining-mark
 * segmentation (see CITATION_MATCHER_PARITY.md).
 *
 * Usage:
 *   node scripts/citation-matcher-conformance.mjs < fixtures.json
 */

import { findQuotedSpan } from "../lib/quotedMatch.ts";
import fs from "node:fs";

process.env.GRANTHA_MATCHER_NO_ICU = "1";

const input = fs.readFileSync(0, "utf-8");
const fixtures = JSON.parse(input);

const out = [];
for (const { window, passage } of fixtures) {
  const span = findQuotedSpan(window, passage);
  out.push({
    accept: span !== null,
    span: span
      ? { start: span.start, end: span.end, sourceStart: span.sourceStart, sourceEnd: span.sourceEnd }
      : null,
  });
}
process.stdout.write(JSON.stringify(out));
