# Citation Matcher Parity — TS ↔ Python lock-step

**Canonical:** `grantha-data/docs/CITATION_MATCHER_PARITY.md`
**Mirror:** `grantha-explorer/docs/CITATION_MATCHER_PARITY.md` (byte-identical;
re-synced by `cp`, same discipline as the schema mirrors in `SCHEMAS.md`).

This is the standing contract that keeps the Python citation-repair classifier
(`tools/lib/grantha_data/citation_repair.py`) **in exact agreement** with the
TypeScript matcher the UI uses (`grantha-explorer/lib/quotedMatch.ts`). If the
two drift, the repair tool re-points citations the UI already highlights (or
misses ones that don't) — silently, because the human reviews the tool's own
(wrong) output.

## The paired surface (mandatory lock-step)

Every function and constant below must behave identically on both sides. The
Python side is a VERBATIM port of the TS decision path, including the two
easily-missed pieces `extractEnclosedQuote` and the manual grapheme clamp.

| TS (`lib/quotedMatch.ts`) | Python (`citation_repair.py`) |
|---|---|
| `buildMatchString` — NFC; strip set `। ॥ * _ . ' ‘ ’ "`; whitespace collapse; anusvara ≈ final-`म्` (`विज्ञानम्`==`विज्ञानं`) | `normalize()` |
| `buildSourceWindow` — `MAX_LOOKBACK=60`, whitespace extend, `enclosingQuoteStart` (cap `QUOTE_EXTEND_CAP=600`), multi-pāda line extend (cap `QUOTE_LINE_EXTEND_CAP=400`) | `source_window()` |
| `extractEnclosedQuote` — quote-pair detection (`**…**`, `‘…’`, `“…”`, `"…"`, `'…'`), `QUOTE_TAIL_TOLERANCE=20` | `extract_enclosed_quote()` |
| `buildQuoteNeedles` — pāda tier then word tier; `MIN_QUOTE_NEEDLE_LEN=4`; cap `MAX_QUOTE_NEEDLES=80`; virama/matra never a word start | `quote_needles()` |
| `findQuotedSpan` — Smith–Waterman; `queryStart===0` start-anchor; `minScore = 2*max(MIN_QUOTE_NEEDLE_LEN, min(MIN_MATCH_CHARS, query.length))`; `MIN_SIMILARITY=0.7`; coverage suppression (`MAX_COVERAGE=0.8`, `MAX_COVERAGE_PASSAGE_LEN=44`, `singleRunWindow`); **manual** grapheme clamp (`clampToGraphemeBoundaries`: cluster codepoints, `RIGHT_MATRAS` swallow, edge trim) | `find_quoted_span()` |

**Constants (identical values):** `MAX_LOOKBACK=60`, `MIN_MATCH_CHARS=10`,
`MIN_QUOTE_NEEDLE_LEN=4`, `MAX_QUOTE_NEEDLES=80`, `MIN_SIMILARITY=0.7`,
`MAX_COVERAGE=0.8`, `MAX_COVERAGE_PASSAGE_LEN=44`,
`QUOTE_TAIL_TOLERANCE=20`, `QUOTE_LINE_EXTEND_CAP=400`,
`QUOTE_EXTEND_CAP=600`, `MATCH_SCORE=2`, `MISMATCH_SCORE=-1`, `GAP_SCORE=-1`.

## Grapheme segmentation is pinned to the MANUAL scan on both sides

The TS production path uses ICU (`Intl.Segmenter("hi")`); the Python port has
no ICU dependency. To make the parity contract deterministic and testable, the
**conformance run forces the TS side to the manual combining-mark scan** via
`GRANTHA_MATCHER_NO_ICU=1`, and Python ports that manual scan verbatim
(`CLUSTER_CODEPOINTS`, `RIGHT_MATRAS`, edge trim). Devanagari is all-BMP, so
UTF-16 indices == code points on both sides. The ICU path remains the
production default in the UI (a strict superset for rendering); accept/reject
**parity is defined against the manual scan**. A future Devanagari edge case
where the manual scan diverges from ICU on accept/reject is fixed in the manual
scan on BOTH sides + a golden fixture, never by splitting the two.

## The standing rule

> Any change to a TS constant or rule in `lib/quotedMatch.ts` MUST land the
> matching Python change + a mirrored test in
> `tools/lib/grantha_data/tests/test_citation_repair.py` in the same change —
> and vice versa. A TS-only or Python-only constant change is a review failure
> until the mirror ships.

## Mechanical enforcement — the conformance test

`test_citation_repair.py::test_matches_ts_conformance` runs a shared golden
fixture corpus (`test_data/citation_matcher_conformance.json`, mirrored in both
repos) through:

1. the **LIVE** TS matcher via a subprocess —
   `grantha-explorer/scripts/citation-matcher-conformance.mjs` (loads
   `lib/quotedMatch.ts` with `GRANTHA_MATCHER_NO_ICU=1`, emits `{accept, span}`
   per fixture). Never a frozen snapshot.
2. the Python `find_quoted_span()`.

It asserts identical accept/reject **and** identical spans, and **fails the
build on drift**. The test skips when the grantha-explorer sibling checkout is
absent (same policy as `test_school_context.py` / `test_v2_cross_converter.py`).

The golden fixtures include the locked cases from `lib/quotedMatch.test.ts`
(anusvara, whole-verse, danda-boundary, short-precise) plus adversarial cases
(formulaic-phrase ambiguity, paraphrase, whole-passage suppression).

## Cross-repo pointer

- grantha-data CODEMAP: "citation matcher parity" → `docs/CITATION_MATCHER_PARITY.md`
- grantha-explorer CODEMAP: "citation matcher parity" → `docs/CITATION_MATCHER_PARITY.md`
