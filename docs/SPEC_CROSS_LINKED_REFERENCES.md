# Cross-Text References — Cross-Repo Specification

**Status:** Living document — the permanent cross-repo contract for cross-text
citation references. Supersedes the pilot plan's decision sections
(`grantha-explorer/plans/PLAN_CROSS_LINKED_REFERENCES_PILOT.md`), which now
defers to this spec as the live contract. Producer side: grantha-data. Consumer
side: grantha-explorer.

**Last updated:** 2026-08-19

---

## 1. Goal

Make cross-text citation references work end-to-end — from source text to a
clickable deep link in the explorer — **only when the target grantha is in the
library**. Citations to works not in the library render as unlinked plain text.

### 1.1 Locked decisions

| # | Decision |
|---|---|
| 1 | **Structured references** in JSON (schema change), not inline markdown. Content stays byte-identical. |
| 2 | **Compile/link split.** Compile (Python, grantha-data): abbreviation → `grantha_id` + normalize locator. Link (TS, explorer runtime): section-vs-leaf + "in library". Structure truth is read from the real target grantha at runtime; the bimap `ref_structure` is a compile-time **depth hint only**. |
| 3 | **Partial locators** (fewer segments than target depth) resolve to the **section ref** (prefix jump). Explicit runtime semantics in §5. |
| 4 | **Range refs** (token count exceeds target depth by one) link to the **first verse**; `locator_end` preserved for a future range-aware UI. |
| 5 | **Enumerations** expand to N reference objects grouped by `group_id`, with **prefix inheritance**. |
| 6 | **Undefined symbols** emit **errors with hints** at build time. `--strict` fails the build; default off (emit-and-continue). |
| 7 | **Whole-work citations** (abbreviation, no locator) are valid: `grantha_id` set, `locator: null`, `unresolved: false`, link to the grantha root. |
| 8 | **Dev-mode diagnostics** for references that render unlinked; production renders them unlinked without a banner. |
| 9 | **Per-target suppression** is a committed config (`reference-suppressions.json`). |
| 10 | **Bimap is the single abbreviation authority.** `granthas-meta.json.abbreviations` is frozen/deprecated; a consistency check enforces bimap ⊇ meta with matching ids. |
| 11 | **Never guess a link.** A reference the system cannot resolve with confidence stays unlinked (or, when deferred by design, targets a deliberately-absent id). This is the load-bearing rule; see the field-finding corrections in §8. |

---

## 2. Reference artifact (schema)

New `#/definitions/reference`, emitted as `references[]` on
`commentary_passage`. Offsets are half-open into
`content.sanskrit.devanagari`. The explorer schema mirrors are byte-identical
copies re-synced with `cp` (per `SCHEMAS.md`).

**Cross-repo schema sync (contract):** the explorer's schema mirrors must
never drift from `grantha-data/formats/schemas/`. A CI check must compare the
mirror files' checksums against the producer copies and fail loudly on drift —
the `cp` sync is the operator's action, but drift detection is automation's.
A schema change therefore lands as: producer edit → version bump → `cp`
re-sync → CI-green in both repos. Without the check, a producer-side change
that isn't mirrored silently makes the explorer validate against a stale
schema.

```jsonc
{
  "start": 33, "end": 47,                    // half-open offsets into content.sanskrit.devanagari
  "display_text": "श्वे. उ. १.९",            // verbatim citation text as written
  "grantha_id": "svetasvatara-upanishad",     // null ONLY when abbreviation undefined (build error)
  "locator": "1.9",                          // canonical dotted target; null for whole-work; range → FIRST endpoint
  "locator_end": null,                       // present ONLY for ranges (normalized hi endpoint)
  "group_id": null,                          // present ONLY on enumeration members (string)
  "unresolved": false                        // true → a build REF-* error was emitted
}
```

### 2.1 Three states

| `grantha_id` | `locator` | `unresolved` | meaning |
|---|---|---|---|
| null | null | true | **undefined abbreviation** → build error `REF-UNDEFINED-ABBREV` |
| set | string | false | **normal passage/section/range** link |
| set | null | false | **whole-work citation** → link to grantha root |

`locator: null` with `grantha_id: null` is impossible in the schema by
construction; validation rejects it.

**Span convention:** every reference's `[start, end)` covers the citation text
**excluding** the surrounding parentheses — whole-work, enumeration sub-spans,
**and ordinary passage/section/range references alike**. The renderer splits
raw text at `[start, end)` and leaves parens/punctuation as plain text; for a
normal single cite `(श्वे. उ. १.९)` the span covers `श्वे. उ. १.९` only.

### 2.2 Enumeration + prefix inheritance

`(वि.पु. ३-७-२९,३०)` → two objects tied by `group_id` (`ref-N`, 1-based over
enumeration parentheticals in the **text passed to `extract_references`** —
i.e. one commentary passage's Devanagari string), later member inheriting the
first member's prefix (`३०` → `3.7.30`). The renderer emits the literal `,`
between sub-spans. Ranges are a single object (no grouping). **`group_id`
uniqueness is scoped per `extract_references` call (per commentary passage)**:
two passages both starting at `ref-1` are expected and fine; `group_id` is a
renderer grouping hint within one passage, never a corpus-wide key.

---

## 3. The bimap (single authority)

`grantha-data/data/citation_bimap.yaml`. Unique abbreviations + aliases; ids
match `^[a-z0-9-]+$`; load-time validation (`validate_bimap`). Consistency
check (`check_meta_consistency`): bimap must be a **superset** of
`granthas-meta.json` abbreviations with matching ids; mismatches are hard
errors.

### 3.1 Bimap entry fields beyond the basics

- `ref_structure` — a **depth hint only** (the number of locator levels the
  abbreviation is expected to express), never authoritative for navigation.
- `locator_prefix` — a numeric prefix prepended to the locator when the
  abbreviation encodes a structural level whose number is not in the cite.
  Example: `रा.सु.` (Sundara-kāṇḍa) → `locator_prefix: "5"`, so
  `रा. सु. ३५.५२` → `5.35.52`.
- `locator_transform` — a named rewrite applied prefix→transform:
  - `katha_continuous_valli` (formula): `क. उ. २.२४` → `1.2.24`
    (valli ≤ 3 → adhyāya 1; the on-disk edition numbers vallīs continuously
    across both adhyāyas).
  - `brahma_sutra_adhikarana` (table lookup): `ब्र.सू.अधि.` is a distinct
    abbreviation (longest-match wins over `ब्र.सू.`); its transform looks up
    `(adhyāya, pāda, ordinal)` → first sutra in
    `data/brahma_sutra_adhikaranas.yaml` (156 entries derived from source). A
    table miss raises at compile time: the transform leaves the locator
    untransformed (so the runtime refuses it — never a guessed link) **and**
    the compiler emits `REF-TRANSFORM-MISS` (warning) with the source
    location. The failure is therefore visible in `references-report.json`,
    not only as a runtime refusal.
- **Recension deferral by id:** `बृ.उ.मा.पा.` maps to
  `brihadaranyaka-madhyandina` — a deliberately absent id — so the cite is
  not-in-library at runtime instead of mislinking to the Kāṇva edition. The
  longer abbrev wins via longest-match. **Reserved-id convention:** ids used
  for deferral-by-absence are semantically reserved as "intentionally absent".
  A bimap entry with a deliberately-absent id must carry a `note:` stating
  this, and a **regression test asserts the id is absent from the on-disk
  library / `granthas-meta.json`** so that adding a real grantha with that id
  (or ingesting the deferred recension) is a loud, reviewed change, not a
  silent accidental re-resolution.

### 3.2 Dash-glyph-gated range rule

The same `-` means "level separator" (`वि.पु.१-२-२२` → `1.2.22`) or "range"
(`3.7.29-35` → `3.7.29..3.7.35`). Disambiguation, gated on the **dash glyph**,
not token count:

- `seg_count == hint_depth` → every separator is a level separator.
- `seg_count == hint_depth + 1` **and** trailing separator is `-`/`–` **and**
  ascending → a range on the final level (`locator = prefix.lo`,
  `locator_end = prefix.hi`).
- `seg_count == hint_depth + 1` and trailing separator `.` → over-depth dotted
  locator → `REF-AMBIGUOUS-LOCATOR` + conservative reading.
- `seg_count == hint_depth + 1` and trailing `-` but non-ascending → the
  **hint-drift detector** — `REF-AMBIGUOUS-LOCATOR` + conservative reading
  (with a "check the bimap depth" hint). Unreachable with a correct hint.
- `seg_count > hint_depth + 1` → `REF-AMBIGUOUS-LOCATOR` + conservative
  reading.

**Order of operations (fixed):** the dash-gated rule above always runs on the
**raw citation segments**, *before* any `locator_prefix` is prepended or
`locator_transform` applied. `hint_depth = len(ref_structure)` always counts
the levels the **cite as written** is expected to express — never the final,
post-transform locator. Consequences:

- `रा. सु. ३५.५२` — the raw cite is 2 segments and `रा.सु.`'s
  `ref_structure: [sarga, shloka]` has depth 2 → gated at `seg_count ==
  hint_depth` → `35.52`, then the prefix yields `5.35.52`. The prefix does not
  change `hint_depth`.
- `ब्र. सू. अधि. ४.१.७` — the raw cite is 3 segments and `ब्र.सू.अधि.`'s
  `ref_structure: [adhyaya, pada, adhikarana]` has depth 3 → gated at
  `seg_count == hint_depth` → `4.1.7`, then the transform *replaces* the
  locator via the table (`→ 4.1.13`). Dash-gating never runs on the
  transformed sutra locator.
- A range (`locator`/`locator_end`) is only ever decided on the raw segments;
  prefix and transform are then applied to both endpoints identically.

Known limitation: a range is expressible only on the **final** level. A
top-level range on a depth-2 target parses as a level separator.

---

## 4. Compile pipeline (grantha-data)

`tools/lib/grantha_data/references.py` — pure, deterministic, no LLM/network.

1. Extract parenthetical citations → `(start, end, display_text)`.
2. Resolve abbreviation → `grantha_id` (longest-first, separator tolerance
   `श्वे। उ।` ≡ `श्वे.उ.` ≡ `श्वे. उ.`, prefix handling). No match →
   `REF-UNDEFINED-ABBREV` with hint.
3. Detect whole-work cite (abbreviation present, remainder empty after
   separator-stripping).
4. Normalize locator (Devanagari→ASCII digits, separators → `.`, strip genuine
   noise). **`अधि.` is NOT noise** — it marks an adhikarana ordinal (see §8).
5. Split ranges / enumerations per the dash-gated rule.
6. Emit `reference` objects + diagnostics; write a per-edition
   `references-report.json` (code, severity, source file, passage_ref, offsets,
   hint).

**Cross-repo import:** the explorer converters import `grantha_data.references`
via an env-gated bootstrap (`GRANTHA_DATA_TOOLS_LIB`), or a real
`pip install -e` (preferred when present). The Bazel `md_to_json.py` path is
wired + unit-tested but **out of scope** for the pilot's end-to-end
verification. **Both import paths must be exercised in CI** (`test_imports_via_both_repos`
on the producer side; the explorer's bootstrap test) so one path can never
drift stale while the other produces committed output.

---

## 5. Runtime resolution (grantha-explorer)

`lib/references.ts::resolveReferenceTarget` against the **loaded** target:

1. **Exact leaf** — loaded passage ref matches.
1b. **Exact leaf in a later unloaded part** — the locator is a valid full-depth
   ref whose passage lives in a later part; hand it back and let the reader's
   section loader fetch the containing part on navigation.
2. **Partial locator (section)** — (a) envelope section marker whose ref equals
   the locator (`isSection: true`); (b) a part `first_ref` prefixed by the
   locator; (c) a loaded leaf prefixed by the locator. Cases (b)/(c) are leaf
   passages → `isSection: false`.
3. **Whole-work** — `locator: null` → grantha root.
4. **Depth overflow** — more segments than target depth →
   `REF-RUNTIME-DEPTH-OVERFLOW`.
5. **Otherwise** — `REF-RUNTIME-UNRESOLVED`.

**Depth convention (from field-finding):** `structure_levels` on disk is a
**nested tree**; depth = `getStructureDepth` (walks `children[0]`), **never**
`structure_levels.length` (which returns the top-level count).

**Hover preview:** `getPassagePreview` fetches the containing part on demand
for later-part targets (cached), and the passage renders in the reading face
honoring `--reading-scale`. Verses render verse-shaped (stored pāda breaks via
`white-space: pre-line`).

---

## 6. Diagnostics (dev mode)

`lib/referenceDiagnostics.ts` (consumer). References that fail to resolve are
recorded, when dev-gated, to a `localStorage` log deduped by
`source + passage + offset + code` (`lastSeenAt` refreshed on duplicate), and
triaged on the `#diagnostics` hash view (intercepted before `parseHash`).
Reason codes: `REF-NOT-IN-LIBRARY` (with `knownInMeta` + Levenshtein
`nearMatchId`), `REF-RUNTIME-DEPTH-OVERFLOW`, `REF-RUNTIME-UNRESOLVED`.

Per-target suppression: `public/data/reference-suppressions.json`
(`grantha_ids`, `refs` `"id:locator"`, `codes`). **The three axes are OR'd**:
a diagnostic is suppressed if it matches *any* configured axis. A
`grantha_ids` entry alone suppresses every code for that target grantha; a
`codes` entry alone suppresses that code for every target; a `refs` entry
suppresses one `granthaId:locator` regardless of code. Worked example:

```jsonc
{
  "grantha_ids": ["vishnu-purana"],          // all codes for vishnu-purana
  "refs": ["mundaka-upanishad:1.1"],         // any code for that exact ref
  "codes": []                                 // no code-level suppression
}
```

`(vishnu-purana, 1.2.22, REF-NOT-IN-LIBRARY)` → suppressed (grantha_ids);
`(mundaka-upanishad, 1.1, REF-RUNTIME-UNRESOLVED)` → suppressed (refs);
`(katha-upanishad, 1.2.24, REF-RUNTIME-DEPTH-OVERFLOW)` → **not** suppressed.
Suppression hides a diagnostic from the view; it does not change how the
reference renders.

---

## 7. Field-finding corrections (probe tests → spec)

- **Śānti-parva numbering (verified).** `म. भा. शां.` cites are adhyāya.śloka
  level separators. The text cites adhyāya 358, which exceeds the critical
  edition's 353 — confirming **Southern-recension (vulgate) numbering**,
  consistent across `१७.२२३`, `३३७.३४०`, `३५८`.
- **`अग्नि.र.` levels.** `अग्नि.र.१-१०-६` → `1.10.6` (depth 3), level names
  `[adhyaya, anuvaka, mantra]`.
- **`तै.आन.` ≠ `तै.आ.`** — `तै. आन.` is the Ānandavallī of the Taittiriya
  **Upanishad** (valli 2 encoded), not the Aranyaka. `तै. आन. १.२` → `2.1.2`.
- **Bimap `ब्र.सू.` `ref_structure` corrected** to `[adhyaya, pada, sutra]`
  (the on-disk depth); the adhikarana ordinal is expressed via the
  `ब्र.सू.अधि.` abbreviation + table transform.
- **Offset convention.** Offsets are Python code points; JS slices UTF-16.
  Verified aligned across the pilot corpus (0 astral chars precede a ref), but
  the spec pins **code-point offsets with a JS-aware splitter** as the durable
  contract. **Defensive assertion:** the splitter must fail loudly (not
  silently misalign) if a non-BMP character ever appears in
  `content.sanskrit.devanagari` — the code-point/UTF-16 coincidence is a
  property of the current corpus (Devanagari is BMP-only), not an encoding
  guarantee.

---

## 8. Deferred / out of scope

- **Edition-targeted (school/lineage) refs.** Frame as `namespace::symbol`:
  `ramanuja::भ.गी.` → Rāmānuja's Gītābhāṣya; `sankara::भ.गी.` → Śaṅkara's.
  Requires a corpus survey first (which citing grantha cites which target,
  which edition implied). Candidate mechanisms: compile-side namespaced bimap
  + optional `edition_id` on the artifact (MINOR schema bump), or runtime
  namespace resolution. Never-guess guard applies.
- **Adhikarana open questions:** linkability of an adhikarana's *later*
  sutras; whether the adhikarana-artha (topic) intro renders at the anchor.
- **Mādhyandina / Śatapatha-Mādhyandina:** still needs the actual recension
  ingested to link; currently deferred-by-id.
- **Bazel `md_to_json.py`** end-to-end verification (wired + unit-tested only).
- **Non-final-level ranges**, per-corpus range rules.
- **Range-aware UI** (currently links to the first verse only).

---

## 9. Principles (learned from the pilot)

- **Test fixtures must mirror real on-disk shapes** — nested `structure_levels`
  tree, real envelope/part shapes. Idealized fixtures produce "wrong-but-
  passing" tests.
- **Classify before fixing: code vs data vs scheme.** Most resolution
  failures here were data/scheme, not resolver bugs.
- **Never guess a link.** Prefer defer-by-data (absent id) or table-lookup over
  heuristics.
- **Verify cross-seam mappings against on-disk data** before committing.
- **Data > functions** — citation-scheme variations are bimap/table entries,
  not parser special-cases. **`locator_transform` is the deliberate, rare
  exception to this principle:** only two transforms exist
  (`katha_continuous_valli`, `brahma_sutra_adhikarana`), each pinned by a
  golden test, and adding a third requires a code change in `references.py`.
  The bar for a new transform is that the scheme genuinely cannot be expressed
  as a static bimap/table entry (a value-dependent rewrite); a scheme that can
  be a table entry must be one.
