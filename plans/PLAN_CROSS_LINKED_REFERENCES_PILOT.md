# Plan: Cross-Linked References — One-Level Link Graph (E2E Pilot)

**Status:** Ready for review (round 4 approved — no blockers). Do not implement yet.
**Date:** 2026-08-18 (updated after review round 4)

## 0. Review response

### Round 1 (all closed)

The round-1 review returned: close **C1** (whole-work citations) and **C2**
(single abbreviation authority), pin **M1** (cross-repo mechanism) and **M2**
(partial-locator section semantics) before Phase 3. This revision does that, and
elevates the review's **M3** (range-vs-level ambiguity) to an architectural
decision (§4.1.1).

| Finding | Disposition |
|---|---|
| C1 — whole-work citations | New reference state (§3, §4.1) — a third state distinct from error. `REF-UNPARSEABLE-LOCATOR` demoted to warning, reserved for a *present but unparseable* locator. |
| C2 — dual abbreviation truth | Bimap is the single authority (§4.3); cross-file consistency check + freeze/deprecate `granthas-meta.json.abbreviations`. |
| M1 — cross-repo mechanism | Pinned in §4.1.2 **before** Phase 3; golden test imports `references` the same way both repos do. |
| M2 — partial-locator section semantics | Explicit runtime rule + async-target note (§5); runtime golden test added (§8.4). |
| M3 — range-vs-level `-` ambiguity | Promoted to architectural decision (§4.1.1). Round-2 review found the rule itself wrong — reworked in §4.1.1 below. |
| M4 — Bazel path unexercised by pilot root | Scoped: pilot verifies the explorer converter end-to-end; the Bazel `md_to_json.py` path is wired + unit-tested but out of pilot scope (§8.3). |
| Minor items | `buildRefIndexMap` export, `references[]` scope note, stale example fix, bold-straddle regression, `REF-DEPTH-MISMATCH` default, `#diagnostics` intercept-before-parse, perf substantiation — all folded into §3/§5/§7/§9. |

### Round 2 (closed in this revision)

The round-2 review confirmed all round-1 items and returned one new **Critical**
(C1: §4.1.1 arithmetic inverted + contradicted by the pilot's own `म.भा.शां.`
data) plus two **Major** (M1: `म.भा.`/`महा.भा.` in meta would hard-fail the new
consistency check; M2: partial-locator resolution ignores multi-part targets).

| Finding | Disposition |
|---|---|
| **C1** — §4.1.1 range-vs-level rule off-by-one + contradicted by source | Reworked §4.1.1: correct arithmetic (`seg_count == hint_depth + 1`), and resolved the `म.भा.शां.` collision — **both** `१७-२२३` and `३३७-३४०` are level separators (adhyāya.śloka), so the §3 "range" example was wrong and is corrected. Genuine ranges only arise when the token count exceeds depth by exactly one. (The adhyāya-numbering assumption was later flagged as unverified in round 3 — see §4.1.1.) |
| **M1** — `म.भा.`/`महा.भा.` in meta vs "never a silent parva pick" | §4.3 now explicitly **removes** `म.भा.` and `महा.भा.` from `granthas-meta.json` (they are the forbidden silent parva pick) and reconciles `तै.ना.` (meta maps it to `taittiriya-aranyaka`; the source means Mahanārāyaṇa — removed from the aranyaka entry, added to `mahanarayana-upanishad`). |
| **M2** — partial locator vs multi-part targets | §5 case 2 corrected: for multi-part targets the fallback consults envelope section markers / part `first_refs` (like `resolveJumpTarget`'s `partFirstRefs`), not only loaded leaves. |
| Minor — `तै.ना.` latent conflict | Pre-stated in §4.3 (see M1 row). |
| Minor — whole-work "remainder empty" check | §4.1 step 3 now runs on the **separator-stripped** remainder, so `(शत.ब्रा.)` trailing `.` is absorbed by the abbreviation matcher, not left as a phantom locator. |
| Minor — same-grantha whole-work jump | §5 case 3 decided: it **updates the hash** to the grantha root ref (e.g. first main ref), reusing the normal navigation path; it is not a raw scroll-to-top, so the URL stays shareable. |

### Round 3 (closed in this revision)

The round-3 review found no blocker and confirmed the design has converged. It
returned two **Major** (range detection keyed on token count instead of the dash
glyph; `अग्नि.र.` `ref_structure` inconsistency + missing non-ascending `+1`
branch) plus documentation minors.

| Finding | Disposition |
|---|---|
| **M1** — range detection keyed on token count, not the dash glyph | §4.1.1 reworked: a range requires `seg_count == hint_depth + 1` **and** the trailing separator is a range glyph (`-`/`–`) **and** ascending. A dotted over-depth locator (`3.7.29` on depth-2, trailing `.`) is now a `REF-AMBIGUOUS-LOCATOR` warning + conservative reading, never a range. |
| **M2a** — `अग्नि.र.` `ref_structure` inconsistent | §4.2 hint example corrected from `[adhyaya, mantra]` to a 3-level structure matching the source's `अग्नि.र.१-१०-६` (level names flagged to confirm). |
| **M2b** — non-ascending `+1` case had no branch | §4.1.1 now has an explicit bullet: trailing `-` but non-ascending (`lo > hi`) → `REF-AMBIGUOUS-LOCATOR` + conservative level-separator reading. |
| Minor — unverified "Śānti-parva 300+ adhyāyas" claim | Marked "verification flag" in §4.1.1; resolution assumed, must be verified against the edition the text actually cites; verification step added to Phase 2. |
| Minor — `महा.भा.शां.` missing from reconciliation | §4.3 now names it (kept as a parva-qualified alias, added to the bimap so the consistency check passes). |
| Minor — part-`first_ref` mis-flagged `isSection` | §5 case 2: only case (a) section marker is `isSection: true`; cases (b)/(c) are leaf passages → `isSection: false`. |
| Minor — non-final-level ranges unrepresentable | Documented as an accepted pilot limitation in §4.1.1. |
| Minor — §4.1 step 5 wording | Added explicit cross-ref that the range decision is only the dash-gated `+1` case. |

### Round 4 (approved — six documentation notes folded in)

The round-4 review returned **Approved, no blockers**; the six remaining items
are documentation/precision edits, none architectural. All are folded in:

| Note | Disposition |
|---|---|
| N1 — non-ascending `+1` branch is a hint-drift detector | §4.1.1 now states it is effectively a hint-drift detector (unreachable with a correct `ref_structure`), not a locator-classifier, and the diagnostic should carry a "check the bimap depth" hint. |
| N2 — "conservative reading" never sets `unresolved` | §4.2 `REF-AMBIGUOUS-LOCATOR` row now states it emits `unresolved: false` and that the runtime depth-overflow check is the authority. |
| N3 — `?diagnostics=refs` vs `#diagnostics` un-reconciled | §6.2/§6.5 now state `…?diagnostics=refs` is a **hash** query (not document URL), parsed by the same leading branch as `#diagnostics`; localStorage persistence makes the entry point moot after first toggle. |
| N4 — range machinery unexercised by live data | §4.1.1 adds a scope-justification paragraph: ranges exist in the wider corpus (brihadaranyaka `8.4.7-11`), and the "defer ranges entirely" alternative was rejected because it would silently mis-parse them. |
| N5 — §5 case 2(a) "prefix" wording | Corrected to "ref **equals the locator**", with the `1.1` example. |
| N6 — whole-work `start`/`end` span convention | §3 now states whole-work spans exclude the parens, consistent with ranges/enumerations. |

---

## 1. Goal & scope

Make cross-text citation references work end-to-end — from source text to a
clickable deep link in the explorer — **only when the target grantha is in the
library**. Citations to works not in the library render as unlinked plain text.

- **Root text:** Īśāvāsyopaniṣad, Vedānta Deśika bhāṣya
  (`grantha-data/structured_md/upanishads/isavasya/isavasya-upanishad-vedantadesika-01.md`).
- **Depth:** one level. A citation becomes a link only if its target grantha is
  on disk in the explorer library (`generated/granthas.json`). The target's own
  citations are out of scope.
- **This is a pilot.** The goal is to work the full path in both repos
  (grantha-data producer + grantha-explorer consumer) to learn what a
  general solution requires, then either formalize or revise.

## 2. Locked decisions

| # | Decision |
|---|---|
| 1 | **Structured references** in JSON (schema change), not inline markdown. Content stays byte-identical; `validation_hash` untouched. |
| 2 | **Option A resolution split.** Compile (Python): abbreviation → `grantha_id` + normalize locator. Link (TS runtime): section-vs-leaf + "in library". Structure truth is read from the real target grantha at runtime, never a build-time *authoritative* copy. (`ref_structure` is retained as a compile-time **hint** only — see #10.) |
| 3 | **Partial locators** (fewer segments than target depth) resolve to the **section ref** (prefix jump), e.g. `मु. उ. १.१` → section `1.1`. Explicit runtime semantics in §5. |
| 4 | **Range refs** (a locator whose token count exceeds the target depth by one, e.g. `3.7.29-35` on a depth-3 target → `3.7.29..3.7.35`) link to the **first verse** (first endpoint). `locator_end` is preserved in the artifact for a future range-aware UI. Marked `TODO(references)` in the explorer code. (`म. भा. शां. ३३७-३४०` is **not** a range — see §4.1.1.) |
| 5 | **Enumerations** (`वि.पु. ३-७-२९,३०`) expand to **N reference objects** grouped by a `group_id`, with explicit **prefix inheritance** (§4.1) so later members inherit the first member's locator prefix. |
| 6 | **Undefined symbols** emit **errors with hints** (link-error model) at build time. `--strict` fails the build on any error; **default off** (emit-and-continue, `ld --noinhibit-exec` semantics). |
| 7 | **Whole-work citations** (abbreviation, no locator — e.g. `(शत. ब्रा.)`) are **valid**, not errors: `grantha_id` resolved, `locator: null`, `unresolved: false`. Rendered as a link to the grantha root. (§3, §5) |
| 8 | **Dev-mode diagnostics:** in `next dev`, any reference that would render unlinked surfaces a reason-coded diagnostic. In production, unlinked references just render unlinked. |
| 9 | **Per-target suppression** lives in a committed config file (`reference-suppressions.json`), not localStorage. |
| 10 | **Diagnostic page** is a hash-routed view (`#diagnostics`) inside the existing single-page app, intercepted **before** `parseHash`/`validateAndNormalizeHash` (no new Next.js route). |
| 11 | **Bimap is the single abbreviation authority.** `granthas-meta.json.abbreviations` is frozen/deprecated; a cross-file consistency check enforces the bimap is a superset of the meta abbreviations with matching ids (§4.3). |
| 12 | **`ref_structure` = compile-time depth hint only** (disambiguates `-` ranges vs level separators). Not authoritative for navigation; cross-validated against the target's real `structure_levels` at link time (§4.1.1). |

## 3. Reference artifact (schema change)

New `#/definitions/reference` in
`grantha-data/formats/schemas/grantha.schema.json`, emitted as `references[]`
on `commentary_passage`. Offsets are half-open into
`content.sanskrit.devanagari` (same convention as the existing `span`
word-links). The explorer schema mirrors (`grantha*.schema.json`) are
byte-identical copies re-synced with `cp` (per `SCHEMAS.md`).

```jsonc
// #/definitions/reference
{
  "start": 33, "end": 47,                    // half-open offsets into content.sanskrit.devanagari
  "display_text": "श्वे. उ. १.९",             // verbatim citation text as written
  "grantha_id": "svetasvatara-upanishad",     // null ONLY when abbreviation undefined (build error)
  "locator": "1.9",                          // canonical dotted target; null for whole-work; range → FIRST endpoint
  "locator_end": null,                       // present ONLY for ranges (normalized hi endpoint)
  "group_id": null,                          // present ONLY on enumeration members (string)
  "unresolved": false                        // true → a build REF-* error was emitted
}
// required: ["start", "end", "display_text", "grantha_id", "locator", "unresolved"]
// locator_end, group_id: optional
```

### Three states (resolves C1)

| `grantha_id` | `locator` | `unresolved` | meaning |
|---|---|---|---|
| null | null | true | **undefined abbreviation** → build error `REF-UNDEFINED-ABBREV` |
| set | string | false | **normal passage/section/range** link |
| set | null | false | **whole-work citation** (`(शत. ब्रा.)`) → link to grantha root |

`unresolved: true` is now *only* the undefined-abbrev case. A whole-work cite
is **not** `unresolved` and **not** an error. `locator: null` with
`grantha_id: null` is impossible in the schema by construction; validation
should reject it.

**Span convention for whole-work cites (same as ranges/enumerations).** A
whole-work reference's `start`/`end` covers the citation text **excluding the
surrounding parentheses**, exactly like the enumeration sub-spans (§3) and the
range span. For `(शत. ब्रा.)` the span covers `शत. ब्रा.` only; the `(` `)` stay
plain text. The renderer treats all three shapes uniformly: split raw text at
`[start, end)`, leave parens/punctuation as plain text, emit the span as the
link node.

**Deliberately NOT stored** (derived at runtime, never a stale copy):
- `resolution` ("passage" vs "section" vs "whole-work") — computed against the
  target's real `structure_levels` at runtime.
- `same_grantha` — derived at runtime (`reference.grantha_id === currentGranthaId`),
  already the pattern in `ReferenceLink.handleClick`.

### Enumeration grouping + prefix inheritance

`(वि.पु. ३-७-२९,३०)` at raw span `[100, 120)` produces two objects, each
covering its **own minimal sub-span**, tied by `group_id`, with the later member
inheriting the first member's prefix (`३०` → `3.7.30`):

```jsonc
{ "start": 107, "end": 116, "display_text": "वि.पु. ३-७-२९", "grantha_id": "vishnu-purana", "locator": "3.7.29", "group_id": "ref-3" },
{ "start": 117, "end": 120, "display_text": "३०",           "grantha_id": "vishnu-purana", "locator": "3.7.30", "group_id": "ref-3" }
```

The renderer splits raw text at each sub-span and emits the literal `,` between
them as plain text, so the source `(` … `)` are preserved with no
re-synthesis. Ranges are a single object (no grouping needed).

### Concrete examples (post-change, with `अग्नि.र.` now in the bimap)

```jsonc
{ "display_text": "श्वे. उ. १.९",   "grantha_id": "svetasvatara-upanishad", "locator": "1.9",  "locator_end": null }
{ "display_text": "मु. उ. १.१",       "grantha_id": "mundaka-upanishad",     "locator": "1.1",  "locator_end": null }   // 2 segs vs depth 3 → section
{ "display_text": "म. भा. शां. १७.२२३", "grantha_id": "mahabharata-shanti-parva", "locator": "17.223", "locator_end": null }  // adhyāya 17, śloka 223
{ "display_text": "म. भा. शां. ३३७-३४०", "grantha_id": "mahabharata-shanti-parva", "locator": "337.340", "locator_end": null }  // adhyāya 337, śloka 340 — NOT a range (§4.1.1)
{ "display_text": "ई. उ. १६",         "grantha_id": "isavasya-upanishad",    "locator": "16",   "locator_end": null }   // self
{ "display_text": "शत. ब्रा.",        "grantha_id": "shatapatha-brahmana",   "locator": null,  "locator_end": null }   // whole-work → grantha root
{ "display_text": "अग्नि. र. १.१०.६",  "grantha_id": "agnirahasya",           "locator": "1.10.6", "locator_end": null }   // resolved post-change
{ "display_text": "बघ. च. १.२.३",     "grantha_id": null, "locator": null, "unresolved": true }                        // undefined abbrev → build error
```

A genuine range (token count = depth + 1) for a depth-3 target, e.g.
`3.7.29-35`, emits `locator: "3.7.29", locator_end: "3.7.35"` (per §4.1.1). No
such citation occurs in the pilot's root text; the range branch is exercised by
synthetic tests (§8.1).

## 4. Compile side (grantha-data)

### 4.1 Shared library — `grantha-data/tools/lib/grantha_data/references.py`

Pure, deterministic, **no LLM**, **no network**. Extracted/refactored from the
existing citation logic in `tools/scripts/vedarthasangraha_converter/align_paragraphs.py`
(`build_sanskrit_candidates`, `extract_sanskrit_citations`, `_normalize_locator`,
`roman_to_int`) so the bimap handling lives in one place. Must be importable both
inside the Bazel `py_library` (`tools/lib/grantha_data/BUILD`) and from a bare
`python3 scripts/…` run in the explorer repo.

Pipeline layers:
1. **Extract** parenthetical citations in commentary Devanagari →
   `(start, end, display_text)`.
2. **Resolve symbol:** `abbrev`/`aliases` → `grantha_id` (longest-first, with
   separator tolerance `श्वे। उ।` ≡ `श्वे.उ.` ≡ `श्वे. उ.` ≡ `श्वे उ`,
   optional-space tolerance, prefix handling `तै.ना.` → `तै.ना.उ.`). The
   corpus is normalized to the spaced-dot form (`श्वे. उ. १.९`), but dandas
   and dashes still occur elsewhere; the matcher must accept all three.
   **No match → link error `REF-UNDEFINED-ABBREV` with hint**, `grantha_id:
   null, unresolved: true`.
3. **Detect whole-work cite:** abbreviation present, remainder empty →
   `grantha_id` set, `locator: null`, `unresolved: false` (decision #7). Not an
   error. The "remainder empty" test runs on the **separator-stripped**
   remainder — the abbreviation matcher must absorb the trailing `.`/`।` of the
   abbreviation itself (`शत.ब्रा.` → `शत.ब्रा` + empty remainder), so a
   locator-less citation is not mistaken for a *present but unparseable* locator.
4. **Normalize locator:** Devanagari→ASCII digits, `।`/`.`/space → `.`, strip
   noise (`अधि.` in `ब्र. सू. अधि. 4-1-7`). `-` is **not** unconditionally a
   separator — see §4.1.1.
5. **Split ranges / enumerations:** `A-B` → `locator=A`, `locator_end=B`
   **only when** the dash-gated depth-hint rule in §4.1.1 declares it a range
   (trailing `-`/`–` at `seg_count == hint_depth + 1`, ascending) — otherwise
   `-` is a level separator. `A,B,C` → one reference per endpoint with
   **prefix inheritance** (each later member inherits the preceding member's
   prefix up to its own final segment), shared `group_id`.
6. **Emit** `reference` objects + diagnostics.

#### 4.1.1 Range-vs-level `-` disambiguation (reworked after reviews round 2 and 3)

The same `-` glyph means "level separator" in `वि.पु.१-२-२२` (→ `1.2.22`) and
could mean "range" in `3.7.29-35` (→ `3.7.29..3.7.35`). The compile step has no
structural knowledge, so it needs the bimap `ref_structure` as a **depth hint
only**. The round-1 rule got the arithmetic inverted (`hint_depth - 1`) and
contradicted the pilot's own data; both are corrected here.

**Establishing the depth hint (abbreviation-encoded levels).** When an
abbreviation itself encodes a structural level — e.g. `म.भा.शां.` encodes the
Śānti-parva, leaving `adhyāya.śloka` — the bimap entry for that abbreviation
carries the **remaining** `ref_structure` (`[adhyaya, shloka]`), not the base
work's full `[parva, adhyaya, shloka]`. `hint_depth = len(ref_structure)` is
therefore the number of levels the *locator* is expected to express.

When the encoded level is a **specific number** needed at link time AND the
abbreviation maps to the *whole* base grantha (not a per-level id), the bimap
entry carries a `locator_prefix` — a numeric dotted prefix prepended to the
locator at emission. Example: `रा.सु.` (Rāmāyaṇa-Sundara) encodes kāṇḍa 5 but
maps to `valmiki-ramayana`, so `रा. सु. ३५.५२` → `5.35.52` (Sundara sarga 35,
śloka 52). Without the prefix the depth-2 hint made `35.52` look full-depth
against the real `Kāṇḍa → Sarga → Shloka` target and it never resolved. (This
differs from the katha case, where the *numbering scheme* differs — see §5's
citation-scheme note.)

**Rule (range gated on the dash glyph, not token count):**

- Parse the locator into numeric segments, splitting on `.`/`।`/space/`-`, but
  **preserve the actual trailing separator glyph** — the separator immediately
  before the final numeric segment (`.`, `-`, or `–`). Let
  `hint_depth = len(bimap[abbrev].ref_structure)` and `seg_count` the number of
  numeric segments.
- `seg_count == hint_depth` → every separator is a **level separator** →
  `locator = a.b.c`, `locator_end = null`.
- `seg_count == hint_depth + 1` **and** the trailing separator is a **range
  glyph** (`-`/`–`) **and** the last two segments are ascending (`lo < hi`) → a
  **range** on the final level → `locator = prefix.lo`, `locator_end =
  prefix.hi`. (A trailing range *adds* one token, hence `+1`, not `-1`.)
- `seg_count == hint_depth + 1` **and** the trailing separator is `.` → an
  **over-depth dotted locator** (e.g. `3.7.29` on a depth-2 target) — **not** a
  range → `REF-AMBIGUOUS-LOCATOR` (warning) + conservative reading (keep all
  separators as levels; the runtime depth-overflow check catches it if wrong).
- `seg_count == hint_depth + 1` **and** the trailing separator is `-` but the
  last two segments are **not ascending** (`lo > hi`, e.g. `1-10-6`) →
  `REF-AMBIGUOUS-LOCATOR` (warning) + conservative reading (keep all `-` as
  level separators). With a *correct* `ref_structure` hint this branch is
  unreachable (e.g. `अग्नि.र.१-१०-६` hits `seg_count == hint_depth` → `1.10.6`);
  it fires only when the hint is **wrong** — so it is effectively a
  **hint-drift detector**, not a locator-classifier, and the diagnostic should
  carry a "check the bimap depth" hint rather than the generic message.
- `seg_count < hint_depth` → **partial locator** → no `-` decision needed; it
  names a prefix (section), resolved at runtime.
- `seg_count > hint_depth + 1` → `REF-AMBIGUOUS-LOCATOR` (warning) + conservative
  reading: keep all `-` as level separators (the runtime depth-overflow check
  then catches it if wrong).

**Known limitation (accepted for the pilot).** The rule expresses a range only
on the **final** level. A top-level range on a depth-2 target (`मनु २-३` =
adhyāyas 2–3) is indistinguishable from "adhyāya 2, śloka 3" and will parse as
the latter (`2.3`). There is no live case in the pilot's root text; the
limitation is documented rather than designed around.

**Why the range machinery is retained despite no live instance (scope
justification).** The pilot's own corpus has no genuine range citation, but the
wider corpus does — e.g. brihadaranyaka's `8.4.7-11` range passage refs — and
reserving `locator_end` + the range branch now avoids a schema bump and a
re-goldening later. The alternative ("defer ranges entirely; treat all `-` as
separators") was rejected: it would silently mis-parse real range citations as
level separators (each a correct-looking wrong link) with no structured signal,
whereas the current rule at least flags ambiguous cases at build time and lets
the runtime depth check catch the rest. Keeping the machinery is a deliberate,
small-cost decision, not accidental scope growth.

**Resolving the pilot's own data (the `म.भा.शां.` collision).** The source has
two `म.भा.शां. N-M` citations of identical shape:

| citation | line | resolution |
|---|---|---|
| `(म. भा. शां. १७.२२३)` | 455, 1031 | adhyāya 17, śloka 223 → `17.223` |
| `(म. भा. शां. ३३७-३४०)` | 1041 | adhyāya 337, śloka 340 → `337.340` |

Both are **level separators**, not ranges: with `म. भा. शां. → ref_structure:
[adhyaya, shloka]`, `seg_count == 2 == hint_depth` for both → level separator,
consistent. `m > n` is **not** a discriminator (`223 > 17` and `340 > 337` are
both true), so the rule never uses it to decide separator-vs-range at full
depth. Note the corpus is **mixed**: after the linebreak-whitespace
normalization merge (grantha-data #9) the Deśika text was re-derived, so
`१७-२२३` became `१७.२२३` (dash → dot) while `३३७-३४०` **kept its dash** — which
keeps the §4.1.1 dash-at-full-depth rule live in real data. The earlier §3
example that read `३३७-३४०` as a range was wrong and has
been corrected.

> **Verification flag (resolved in Phase 2 — mostly).** The claim "adhyāya
> 337, śloka 340 is well-formed" is now structurally confirmed: both `१७.२२३`
> and `३३७.३४०` are within the critical edition's 353-adhyāya Śānti-parva, AND
> the same text also cites `म. भा. शा. ३५८` — adhyāya 358 exceeds the critical
> 353, which confirms the text uses **Southern-recension (vulgate) numbering**
> where 337, 340, and 358 all exist. So the citation system is consistent, and
> `337.340` (level separator) is well-formed within it. **Residual:** the exact
> śloka correspondence (e.g. that Śānti 17.223 is the cite "अनन्तं बत मे वित्तम्")
> still needs the cited edition; not confirmable from the corpus. A wrong
> verse-text pairing would still be a silent mislink, so the probe tests pin the
> *resolution*, and the §9 `REF-RUNTIME-UNRESOLVED` diagnostic guards the target
> side once a Śānti-parva edition is ingested.

The `+1` range branch is therefore **not exercised by the pilot's root text**;
it is covered by synthetic golden tests (§8.1) so the rule is pinned even though
the corpus has no live example yet.

`ref_structure` remains a **hint**, not an authority: at link time the explorer
re-reads the target's real `structure_levels` and, if the resolved `locator`
depth disagrees with the runtime depth, that surfaces as a diagnostic
(`REF-RUNTIME-DEPTH-OVERFLOW` or `REF-RUNTIME-UNRESOLVED`) rather than trusting
the hint. This cross-validation is the durable guard against hint drift.

#### 4.1.2 Cross-repo integration (resolves M1 — pinned before Phase 3)

**Pinned (Phase 1):** the explorer imports `grantha_data.references` from the
sibling `grantha-data` checkout via an **explicit, env-gated bootstrap** —
`scripts/grantha_data_bootstrap.py` adds `<grantha-data>/tools/lib` to
`sys.path` only when `GRANTHA_DATA_TOOLS_LIB` is set. The converters
(`convert_structured_md.py`, `import_editions.py`) call it at import; the
library is the same file both repos use, exercised by `test_imports_via_both_repos`
(grantha-data) and `scripts/tests/test_grantha_data_bootstrap.py` (explorer).

Rationale: a plain `pip install -e` (the plan's original preference) is
fragile across the paired worktrees — the shared venv's editable install can
silently point at a *different* checkout (it currently maps to `~/github/
grantha-data`, not the active worktree). The env-gated bootstrap is the
**documented fallback** from the plan, chosen as primary because it makes the
active checkout explicit and verifiable. Invocation:

```bash
GRANTHA_DATA_TOOLS_LIB=../grantha-data/tools/lib \
  python3 scripts/convert_structured_md.py --source … --out …
```

`pip install -e` remains valid and takes precedence (the bootstrap is a no-op
when `grantha_data` is already importable). The vendored-mirror fallback is
rejected.

### 4.2 Build diagnostics (link-error model)

Every diagnostic carries a stable `code`, `severity`, source file, `passage_ref`,
raw citation, `(start, end)`, and an **actionable hint**.

| code | severity | hint style |
|---|---|---|
| `REF-UNDEFINED-ABBREV` | **error** | not in bimap; closest matches; if `granthas-meta.json` has the work, suggest the YAML entry: `- abbrev: अग्नि.र.` / `grantha_id: agnirahasya` / `ref_structure: [adhyaya, anuvaka, mantra]` (3 levels — must match the source's three-segment `अग्नि.र.१-१०-६`; the exact level names to confirm when adding the entry) |
| `REF-UNPARSEABLE-LOCATOR` | **warning** | a *present but unparseable* locator (e.g. `(न्)` with a non-empty remainder that yields no numeric segments). Whole-work cites are NOT this. |
| `REF-AMBIGUOUS-LOCATOR` | **warning** | the locator cannot be cleanly classified by the dash-gated rule (§4.1.1): over-depth dotted locator, non-ascending trailing `-`, or depth beyond `hint_depth + 1`. Emits `unresolved: false` (the abbreviation *did* resolve) with the conservative reading as `locator`; the runtime depth-overflow/unresolved check is the authority and may re-flag it. States which reading was chosen. |
| `REF-ID-NAMESPACE-MISMATCH` | **error** | bimap id ≠ `structured_md` frontmatter id for an ingested work |
| `REF-AMBIGUOUS-ABBREV` | warning | abbrev matches 2+ bimap entries (e.g. `म.भा.` with no parva) |
| `REF-DEPTH-MISMATCH` | warning (off by default) | locator segments ≠ target depth (informational; real resolution is runtime). Suppressed by default because it uses the bimap `ref_structure` hint, a second depth source — see §9. |

**Emission:** stderr (human) + machine-readable `references-report.json` per
source (CI-gateable). `--strict` (default **off**) turns any *error* into a
nonzero exit that blocks the BUILD publication gate. Warnings never fail the
build, even under `--strict`.

### 4.3 Bimap changes (resolves C2 — single authority)

> **Phase-2 execution status (2026-08-18).** Executed **pilot-scoped**: the
> bimap now covers the Īśāvāsya Deśika + Srīvatsanārāyaṇa editions' citations
> plus zero-risk aliases of works already in the bimap. The consistency check
> is implemented (`check_meta_consistency`) and the remaining problems are
> **documented known gaps** (roman aliases in meta, non-bimap works such as
> panini-sutra / prashna / patanjali-yoga-sutra / rigveda / amarakosha / per-
> kāṇḍa Rāmāyaṇa) — not hard-failed in this phase. Decisions recorded:
> - `gita` (duplicate of `bhagavad-gita`) removed from `granthas-meta.json`.
> - `रा.सु.` resolves to **`valmiki-ramayana`** (kāṇḍa encoded in the abbrev,
>   `ref_structure: [sarga, shloka]`); the corpus glosses it
>   "श्रीरामायणप्रयोगात्". Not a per-kāṇḍa id (none on disk).
> - `वरा.च.श्लो` (Vārāha-carama-śloka) → `varaha-upanishad`, whole-work cite
>   (`ref_structure: []`).
> - `निघण्टुः`/`निघण्टु`/`निघण्टु:` → `nighantu` (adhyaya, shloka).
> - `पा.धा.` id renamed `panini-dhatupatha` → **`dhatu-patha`** (meta id).
> - Deśika unresolved fell 13 → 9; the remaining 9 are all out-of-scope works
>   (panini-sutra, prashna, patanjali-yoga-sutra, Śrībhāṣya) or regex noise
>   (a `**…**`-wrapped sentence, the bare `(न्)` nasal, a frontmatter string).
> - The Śānti-parva verification flag is resolved in §4.1.1 (Southern-recension
>   numbering confirmed via the adhyāya-358 cite).

- **Single abbreviation authority:** `data/citation_bimap.yaml` is the only
  abbreviation → `grantha_id` table. The `abbreviations` field in
  `granthas-meta.json` is **frozen/deprecated**: no new entries, and the
  runtime `createAbbreviationMap` consumer is removed (§5). It remains in the
  meta file only as read-only documentation during the pilot, then is deleted.
- **Explicit removals from `granthas-meta.json` (before the consistency check
  runs).** The check below rejects, as hard errors, any meta abbreviation that
  contradicts the bimap. Two such contradictions must be resolved by **removing**
  the meta entries, not merely freezing them:
  - `म.भा.` and `महा.भा.` are currently meta abbreviations of
    `mahabharata-shanti-parva` (`granthas-meta.json:295,296`). They are exactly
    the "silent parva pick" this plan forbids (the parva is not encoded), so
    they are **removed** from the meta file; the bimap carries only
    parva-qualified abbreviations (`म.भा.शां.`, `म.भा.अनु.`, …) and bare
    `म.भा.` maps to nothing → `REF-AMBIGUOUS-ABBREV`.
  - `तै.ना.` is currently a meta abbreviation of `taittiriya-aranyaka`
    (`granthas-meta.json:609`), but the source (`तै. ना. ९२`, `तै. ना. १.१`) means
    the Mahanārāyaṇa Upaniṣad. Remove `तै.ना.` from the aranyaka entry and add it
    as an alias of `mahanarayana-upanishad` (whose bimap entry `तै.ना.उ.` is the
    canonical prefix; `तै.ना.` resolves to it by prefix).
- **Cross-file consistency check (load-time or CI):** the bimap must be a
  **superset** of `granthas-meta.json` abbreviations (every meta abbreviation
  exists in the bimap) and every overlapping symbol must map to the **same**
  `grantha_id`. Mismatches are hard errors. This is what prevents the drift
  from regrowing. Known disagreements to reconcile when adding entries:
  - `म.भा.शां.` / `महा.भा.शां.` (meta) vs `म.भा.शा.`/`म.भा.शान्ति.` (bimap) →
    align to `म.भा.शां.` and add `महा.भा.शां.` as an **alias** (it is
    parva-qualified, so it is kept — not removed; the consistency check
    bimap ⊇ meta fails unless it is present in the bimap)
  - `आहिर्बु.सं.` (source) vs `अहि.सं.` (meta) vs absent (bimap) → add all as
    aliases of `ahirbudhnya-samhita`
  - `वि.ध्र.` (source) vs `वि.ध.पु.` (meta) vs absent (bimap) → add all as
    aliases of `vishnu-dharma-purana`
- **Namespace authority (id, not abbreviation):** the explorer on-disk /
  `granthas-meta.json` id is canonical for any work present there; the bimap
  must use that id verbatim. Known drifts to fix:
  - `taittiriya-narayana-upanishad` → `mahanarayana-upanishad`
  - `purva-mimamsa-sutra` → `purva-mimamsa`
  - `mahabharata` → per-parva ids; encode the parva in the abbreviation
    (`म.भा.शां.` → `mahabharata-shanti-parva`). Each parva entry's
    `ref_structure` is the **remaining** levels after the encoded parva
    (`[adhyaya, shloka]`), per §4.1.1. Bare `म.भा.` → `REF-AMBIGUOUS-ABBREV`,
    never a silent parva pick.
- **Add missing abbreviations** observed in the Īśāvāsya Deśika text:
  `अग्नि.र.`, `आहिर्बु.सं.`, `शत.ब्रा.`, `द.स्मृ.`, `परा.स्मृ.`, `निघण्टु:`,
  `हरिवं.`, `रा.सु.`, `ना.प.उ.`, `वि.ध्र.`, `वरा. उ.` / `वरा.च.श्लो.`,
  plus a `ई.उ।` danda-variant alias. All of these must also satisfy the
  consistency check above.
- **Load-time validation of the bimap itself:** unique abbreviations, id format
  `^[a-z0-9-]+$`, no empty abbreviations/aliases. A bimap that fails to load is
  a hard error.

## 5. Link side (grantha-explorer, runtime)

- **In library?** A `Set` over `availableGranthaIds` (derived from
  `generated/granthas.json`, which is keyed off the on-disk library tree, not
  `granthas-meta.json`).
- **Section vs leaf (explicit rule, resolves M2).** A reference resolves in this
  order against the *loaded* target grantha:
  1. **Exact leaf** — `getPassageByRef(target, locator)` hits → jump to the
     passage (`isSection: false`).
  1b. **Exact leaf in a later, not-yet-loaded part (added after pilot
     field-finding).** A multi-part grantha loads only its first part, so a
     full-depth locator whose passage lives in a later part (e.g. Chandogya
     `6.8.7` in part 6) is absent from the loaded passages. The locator is a
     valid passage ref: resolve it directly (hand it back as the jump target)
     and let the reader's normal section loader
     (`sectionPartsToLoad`/`loadPart`) fetch the containing part on navigation.
     This is distinct from case 2(b) below: there the locator is *partial*
     and the part `first_ref` is the jump target; here the locator is the
     exact ref and the *navigation* must trigger the part load.
  2. **Section (partial locator)** — the locator names an interior level (fewer
     segments than the target depth). Resolve to the **lowest matching
     structural level**, consulting in order: (a) an envelope-level section
     marker whose ref **equals the locator** (for a partial locator `1.1`, the
     matching marker has ref `1.1` — the locator itself, not a longer prefix of
     it); (b) a part `first_ref` whose
     ref is prefixed by the locator (this is how `resolveJumpTarget`'s
     `partFirstRefs` already handles unloaded parts); (c) a loaded leaf whose ref
     is prefixed by the locator (the first leaf under the prefix). Only case (a)
     is `isSection: true` (a section marker with no verse DOM element); cases
     (b) and (c) are concrete leaf passages → `isSection: false`. **This
     fallback must consult envelope section markers and part `first_refs` for
     multi-part targets** — a multi-part grantha loads only its first part plus
     the envelope's markers/first_refs, so a leaf in a later part is absent and
     consulting loaded leaves alone would wrongly resolve to
     `REF-RUNTIME-UNRESOLVED`.
  3. **Whole-work** — `locator: null` → jump to the grantha root (envelope /
     first part's first passage).
  4. **Depth overflow** — `locator` has more segments than the target's
     structure depth → diagnostic (`REF-RUNTIME-DEPTH-OVERFLOW`), unlinked.
  5. **Unresolved** — none of the above → diagnostic
     (`REF-RUNTIME-UNRESOLVED`), unlinked.

  > **Depth convention (added after pilot field-finding).** `structure_levels`
  > on disk is a **nested tree** (e.g. Prapathaka → Khanda → Mantra), so its
  > depth is **not** `structure_levels.length` (that returns the top-level
  > count, 1). The resolver must compute depth via the existing
  > `getStructureDepth` (walks the `children[0]` chain). Using `.length`
  > wrongly treats every multi-level text as depth 1 and turns any 2-segment
  > partial locator into `REF-RUNTIME-DEPTH-OVERFLOW` (mundaka `1.1` regression).
  > Golden tests must therefore use **nested** structure fixtures that mirror
  > the real on-disk shape.
  >
  > **Citation-scheme mismatches (documented, pilot decision).** Some citations
  > use a numbering scheme the target edition does not. Katha's corpus cites use
  > the continuous-6-valli convention (`क. उ. २.२४` → `1.2.24`), but the on-disk
  > katha uses `adhyāya.valli.mantra`. The resolver correctly refuses these as
  > `REF-RUNTIME-UNRESOLVED` ("could not resolve") rather than making a
  > correct-looking wrong link. They are a **source-data triage** (suppress via
  > `reference-suppressions.json` in Phase 5, or re-ingest the cited edition),
  > not a resolver bug. Do not "fix" these by special-casing the resolver.

  `resolveJumpTarget` (`lib/jumpTarget.ts`) does **not** currently implement
  case 2 for partial locators (its prefix branch returns the first leaf with
  `isSection: false`; its section branch checks the wrong level). So the runtime
  adds a dedicated `resolveReferenceTarget(target, locator)` helper rather than
  reusing `resolveJumpTarget` unchanged; it may reuse `getPassageByRef` +
  `buildRefIndexMap`.
- **Async target load:** the target grantha's `structure_levels`, passages, and
  section markers come from an **async** `loadGrantha(targetId)`, memoized in
  `granthaCache`. The reference preview (hover) and the jump both resolve after
  this load; there is no eager fan-out of targets.
- **Indexing:** export `buildRefIndexMap` (`lib/data.ts:1362`, currently
  module-private) and use it for O(1) ref lookups instead of the linear
  `.find()` in `getPassageByRef`.
- **Range → first verse:** link to `locator` (first endpoint) always; ignore
  `locator_end` for navigation.
  `// TODO(references): range refs link to the first verse only; revisit with a
  range-aware UI (locator_end is preserved in the artifact).`
- **Self refs** preserve the active edition (existing
  `reference.grantha_id === currentGranthaId` path in `ReferenceLink`).
- **Enumerations** render as grouped adjacent links (see §3).
- **Whole-work refs** link to the grantha root. This is implemented as a normal
  navigation: `updateHash(targetGranthaId, <first main ref>)` (the target's
  first main passage ref from the envelope / loaded grantha). On the same
  grantha, this updates the hash to that grantha's own root ref (reusing the
  standard navigation path, not a raw scroll-to-top), so the URL stays
  shareable and back/forward behaves consistently.

**Performance:** not on the hot path. `isReferenceInLibrary` is O(1) after a
`Set`; `loadGrantha` is async + memoized in `granthaCache`; ref lookup is O(1)
via `buildRefIndexMap`. Largest observed part file = 181 passages
(`public/data/library/ramayana/valmiki-ramayana/part451.json`). No eager fan-out.

## 6. Runtime diagnostic layer (dev mode)

### 6.1 Reason codes

All unlinked-in-prod, surfaced-in-dev:

| code | meaning | signal |
|---|---|---|
| `REF-NOT-IN-LIBRARY` | `grantha_id` resolves but target not on disk | `knownInMeta` (present in `granthas-meta.json`) + `nearMatchId` (Levenshtein/prefix vs on-disk ids) → "known, not ingested" vs "possible id rename" vs "no such work" |
| `REF-RUNTIME-DEPTH-OVERFLOW` | locator has more segments than target depth | nearly always a citation typo |
| `REF-RUNTIME-UNRESOLVED` | target in library, locator matches no passage/section | editorial bug |

> **Important:** "target not in library" is **not** assumed benign — the source
> may have specified the target text ref (or id) incorrectly. It is logged so the
> developer can triage it. Triage = suppress (not a bug) or file a source bug.

### 6.2 Gate

- Default-on in `next dev` (`NODE_ENV !== "production"`).
- Overridable in a production build via a **hash query** `…?diagnostics=refs`
  (i.e. `#granthaId:ref?diagnostics=refs` — on the *hash*, not the document URL,
  which a hash-routed SPA drops on navigation), **or** the dedicated
  `#diagnostics` page. Both are read by the same leading branch in the hash
  handler (§6.5). The toggle is persisted in `localStorage`, so after the first
  flip the entry point is moot for a given browser.
- Production default: unlinked references just render unlinked — no banner.

### 6.3 Collection store

An accumulated runtime log in `localStorage`, deduped by
`sourceGranthaId + sourcePassageRef + offset + code`, appended on resolution.
Shared by the inline banner and the diagnostic page.

```ts
interface ReferenceDiagnostic {
  code: string;                 // REF-NOT-IN-LIBRARY | REF-RUNTIME-DEPTH-OVERFLOW | REF-RUNTIME-UNRESOLVED
  sourceGranthaId: string;
  sourcePassageRef: string;
  editionId?: string;
  rawCitation: string;          // display_text
  targetGranthaId: string;
  locator: string | null;
  knownInMeta: boolean;
  nearMatchId?: string;         // for REF-NOT-IN-LIBRARY
  firstSeenAt: string;
}
```

### 6.4 Per-target suppression — committed config

Matches the existing `public/data/*.json` convention (developer-edited,
committed):

```jsonc
// public/data/reference-suppressions.json
{
  "grantha_ids": ["vishnu-purana", "purva-mimamsa"],  // suppress all codes for a target
  "refs": ["taittiriya-upanishad:3.1.1"],              // suppress a specific target ref
  "codes": []                                           // optional: suppress a code globally
}
```

The render gate reads this and does not surface suppressed targets.

### 6.5 Diagnostic page (`#diagnostics`)

A hash-routed view inside the existing single-page app (no new route — the app
is a static `output: "export"` SPA with `basePath`). **Routing fix (from
review):** `parseHash` splits on `:` (`lib/hashUtils.ts:62`) and
`validateAndNormalizeHash` would redirect a bare `#diagnostics`; the view must be
intercepted **before** parse/validate (a leading branch in the hash handler that
recognizes the literal `#diagnostics` fragment **and** the
`…?diagnostics=refs` hash query from §6.2 — the same branch gates both the
banner and this page). Reads the collection log +
`granthas-meta.json` + `availableGranthaIds`:

- Grouped and filterable by reason code; each entry shows raw citation, source
  passage + edition, target id + `nearMatch`, reason code, first-seen.
- Per-entry / per-target actions:
  - **Suppress target** → emits the exact line(s) to add to
    `reference-suppressions.json` (copy-to-clipboard). A static export cannot
    write its own committed config; the page *generates* the edit and you commit.
  - **Copy as BUGS.md** → formats the entry for
    `grantha-data/structured_md/<text>/BUGS.md` (copy).
  - **Clear log.**

## 7. Render restructure (the gotcha)

`CommentaryPanel` currently applies `DOMPurify` + `**bold**→<strong>` **before**
today's (stub) `parseReferences` regex pass. Character offsets into raw
Devanagari will not match a string that has already been HTML-transformed.

`renderCommentaryWithReferences` must therefore split the **raw**
`content.sanskrit.devanagari` at each `[start, end)` and apply
markdown/DOMPurify **per segment**, emitting the citation span as a
`ReferenceLink`. Drop `abbreviationMap` / `parseReferences` entirely (abbreviation
resolution is now producer-side).

**Note:** `content.sanskrit.devanagari` retains `**`/`####` markers at this
stage. A citation boundary inside a `**bold**` pair would split the markers
across segments and break the per-segment transform. Most citations are outside
bold, but add a regression test for a citation inside `**…**` and, if needed,
normalize the pairing before/after the split.

## 8. Phased execution

Each phase independently verifiable.

1. **Schema + shared library (grantha-data).** Extract/extend the
   `align_paragraphs.py` citation logic into
   `tools/lib/grantha_data/references.py`; add the `reference` definition +
   `references[]` (three states, §3); **pin the cross-repo mechanism (§4.1.2)**
   and mirror the schema into the explorer (`cp`, per SCHEMAS.md).
   Golden tests named for the *why*:
   - `test_danda_abbrev_normalizes_to_dot`
   - `test_range_links_first_endpoint_preserves_end`
   - `test_enumeration_emits_two_grouped_refs_with_prefix_inheritance`
   - `test_undefined_abbrev_emits_link_error_with_hint`
   - `test_whole_work_citation_is_not_an_error`
   - `test_nasal_only_does_not_match_abbrev`
   - `test_dash_is_level_separator_at_full_depth` (`म. भा. शां. १७.२२३` → `17.223`; `म. भा. शां. ३३७-३४०` → `337.340`) — note the normalized corpus keeps the dash on `३३७-३४०`, so the dash-at-full-depth rule stays live in real data
   - `test_dash_is_range_at_depth_plus_one` (`3.7.29-35` on depth-3 → `3.7.29`/`3.7.35`)
   - `test_dotted_over_depth_locator_is_not_a_range` (`3.7.29` on depth-2, trailing `.` → `REF-AMBIGUOUS-LOCATOR`, level separators, no `locator_end`)
   - `test_non_ascending_dash_is_not_a_range` (`1-10-6` on a depth-2 hint → `REF-AMBIGUOUS-LOCATOR`, level separators, no `locator_end`)
   - `test_comma_list_keeps_source_order`
   - `test_imports_via_both_repos` (imports `references` the Bazel way and the
     bare-script way)
   - Synthetic tests keep the legacy danda/dash input forms as **tolerance
     pins** — the corpus is now normalized (`श्वे. उ. १.९`), but dandas and
     dashes still occur across the wider corpus, and the matcher must accept
     both. The live-data probe asserts the normalized forms.
2. **Bimap audit + single-authority rule + load validation + cross-file check.**
   **Done (pilot-scoped).** Bimap: per-parva `म.भा.शां./अनु./कर्णपर्व./भौ.`
   replacing bare `म.भा.`; `तै.ना.उ.` → `mahanarayana-upanishad`;
   `पू.मी.सू.` → `purva-mimamsa`; `पा.धा.` → `dhatu-patha`; new Deśika entries
   + zero-risk aliases; `validate_bimap` + `check_meta_consistency` implemented
   and tested. Meta: removed `gita`, `म.भा.`, `महा.भा.`, `तै.ना.`. Remaining
   39 consistency gaps are documented known (out-of-pilot-scope). See §4.3.
 3. **Converter wiring + build diagnostics.** Emit `references[]` from the
    explorer converter (`convert_structured_md.py` / `import_editions.py` — the
    path that actually produces the pilot's root text). **Done.** Both
    converters thread a diagnostics collector through
    `build_part_json` → `_build_commentary` → `_extract_references` and write a
    per-edition `references-report.json` (code, severity, source file,
    passage_ref, offsets, hint). Isavasya re-ingested: 281 references across
    the 3 editions, **offset integrity 281/281** (every `[start, end)` slices
    the exact `display_text` out of `content.sanskrit.devanagari`). **Note on
    "content byte-identical":** the committed library was rebuilt from source
    after the linebreak-whitespace normalization merge, so the Devanagari
    *content* changed (dandas→dots, spaced citations, `—` em-dashes) — that is
    source drift, not the references feature; the references emission itself is
    confirmed purely additive (stripping `references[]` leaves only the
    normalization diffs). `schema_version` bumped 1.2.0 → 1.3.0 across the
    re-ingested files. Report lists every undefined symbol with a hint (Deśika
    8, all out-of-pilot-scope). **Scope note (resolves M4):** the pilot verifies
    end-to-end via the explorer converter only; the Bazel `md_to_json.py` path
    is wired and unit-tested but not exercised against a real text in this
    pilot (isavasya-vd is an explorer-importer-produced multi-edition layout).
    **Latent seam (documented, §9):** offsets are Python code-point based; the
    JS renderer slices UTF-16. Verified aligned across all 281 pilot refs (0
    astral chars before a ref); the spec should pin the convention.
   **Promote to spec (Phase-3 deliverable):** with the compile side proven
   end-to-end, distill the pilot into a permanent cross-repo spec under
   `docs/`. It captures the locked decisions, the dash-glyph-gated range rule,
   the three reference states, the bimap single-authority rule, what the probe
   tests confirmed or corrected (Śānti-parva adhyāya counts, `अग्नि.र.` level
   names), and what remains out of scope (Bazel path, non-final-level ranges,
   per-corpus range rules). Link it from both `DATA_FLOW.md` docs; the `plans/`
   doc then defers to it as the live contract. If Phase 4–6 runtime findings
   change the spec, fold them back in and re-promote.
4. **Explorer ingest + render + runtime resolution.** Re-ingest isavasya,
   re-sync schema mirrors, offset render restructure (§7), `ReferenceLink`
   wiring, `resolveReferenceTarget` (§5) with runtime golden tests:
   - `test_partial_locator_resolves_to_section` (runtime)
   - `test_full_locator_resolves_to_leaf`
   - `test_whole_work_resolves_to_grantha_root`
   - `test_depth_overflow_is_diagnostic`
   - enumeration grouping, range-first-verse.
   **Done.** Re-ingest was completed in Phase 3. Render restructure (§7):
   `components/renderCommentary.tsx` is a shared helper that splits the raw
   `content.sanskrit.devanagari` at each reference's `[start, end)` and applies
   the markdown/DOMPurify transform per segment; wired into `CommentaryPanel`
   (pane mode), `FlowReader` (flow mode), and `FlowReaderCompare` (compare mode,
   per-edition). The old regex/`abbreviationMap` path (`parseReferences`,
   `createAbbreviationMap`) is removed. `lib/references.ts` now defines the
   producer `Reference` shape, a Set-based `isReferenceInLibrary`, and
   `resolveReferenceTarget` (exact leaf → section marker → part `first_ref` →
   loaded-leaf prefix → runtime diagnostics). `ReferenceLink` resolves on
   hover/click via `loadGrantha` (memoized, no eager target fan-out);
   unresolved references (undefined abbrev) render as plain unlinked text.
   Runtime golden tests added (13 in `lib/references.test.ts`) plus render
   regression tests (`components/renderCommentary.test.tsx`, incl. the §7
   bold-straddle case: verified **0** pilot citations straddle a `**` pair, and
   the straddle behavior is pinned as acceptably-safe literal markers). A
   `components/**/*.test.tsx` glob was added to `vitest.config.ts`.
5. **Runtime diagnostic layer.** Dev gate, `ReferenceDiagnostic` log,
   suppression config, `#diagnostics` page (intercept before parse/validate).
6. **Docs.** Update `grantha-data/docs/DATA_FLOW.md` and
   `grantha-explorer/docs/DATA_FLOW.md` + `SCHEMAS.md` in the same change as the
   code.

## 9. Risks & open questions (final-review pass)

- **`(न्)` false-positive:** a bare nasal must not match an abbreviation `न्`;
  the longest-first matcher + a minimum-length guard need a regression test.
- **NFC/NFD combining-mark drift:** normalize matching defensively so offsets
  never silently drift (the "silent normalization corruption" class); explicit
  tests.
- **Offsets are into `content.sanskrit.devanagari` only** — verify the
  converter's citation text is extracted from the *same* string the renderer
  splits (no consumer-side whitespace collapse).
- **`#diagnostics` intercept-before-parse** (resolved in §6.5) — must be a
  leading branch in the hash handler, not a post-parse check.
- **Range with 3 segments** (`3.7.29-35` on a depth-3 target): governed by the
  §4.1.1 `+1` rule — token count 4 = depth+1 → range on the final level,
  `locator="3.7.29"`, `locator_end="3.7.35"`. Not exercised by the pilot's
  source; covered synthetically (§8.1).
- **`REF-DEPTH-MISMATCH` second depth source** (bimap `ref_structure` vs runtime
  `structure_levels`): suppressed by default; the runtime depth-overflow check is
  the authoritative one. Keep the compile-side hint non-authoritative.
- **`mahabharata` per-parva modeling** needs care: parva is encoded in the
  abbreviation (`म.भा.शां.`), not the locator.
- **Volume control:** `REF-NOT-IN-LIBRARY` will dominate (most Deśika citations
  target not-yet-ingested works). The suppression config + grouped/filterable
  diagnostic page are the mitigation; verify they are sufficient at real scale.
- **Vendored-mirror drift (if §4.1.2 fallback is chosen):** the `sync` script +
  CI byte-identity check is the only guard; prefer `pip install -e`.
- **Offset unit drift (Python code-point vs JS UTF-16).** `references.py` emits
  Python string indices (code points); the renderer slices with JS `substring`
  (UTF-16 code units). They diverge only when an astral char (surrogate pair)
  lies *before* a reference in the same passage. **Verified safe in the pilot:**
  0 of 281 refs have an astral char in their prefix, so all offsets align with
  the renderer's UTF-16 slicing today. The permanent spec should still pin one
  convention (code-point offsets with a JS-aware splitter, or UTF-16 offsets
  computed in the converter) so a future passage with an astral char before a
  ref cannot silently mis-slice.
