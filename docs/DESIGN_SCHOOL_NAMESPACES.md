# Design: School Namespaces & Edition-Targeted References

**Status:** DRAFT — candidate design for evaluation and review. Not yet
promoted into `docs/SPEC_CROSS_LINKED_REFERENCES.md` (the live contract);
intended to be folded there once the design review passes.
**Date:** 2026-08-21
**Scope:** replaces the deferred "Edition-targeted (school/lineage) refs" item
in the spec (§8) and the `namespace::symbol` framing in
`plans/PLAN_CROSS_LINKED_REFERENCES_PILOT.md`.

This document records the **motivation** (what is actually broken, grounded in
on-disk data) and the **type design** (the model that fixes it). It is written
for review: every claim about the library is verified against the committed
`public/data/library/` tree.

---

## 1. Motivation — the current system has a silent mislink bug

### 1.1 `grantha_id` is overloaded

A citation names a work, but "the Śvetāśvatara" is ambiguous: it could mean
the mūla, or Rāmānuja's commentary on it, or Śaṅkara's. Today a reference
carries only `grantha_id` — i.e. "**some** edition of this work". The edition
is filled in later, at runtime, by whatever the default is.

That deferred "fill in the edition" step is where every wrong-link bug has
lived. In the pilot it was the Mādhyandina mislink, the `अधि.` strip, the
katha numbering. The school cases are the same class: the name resolves to
the right *work*, then the system silently lands on the *wrong edition*.

### 1.2 Verified: the library is dominated by school-commentary editions

Scan of every `grantha-envelope` in `public/data/library/` (2026-08-21):

| Grantha | Display default (`isDefault`) | School |
|---|---|---|
| brahma-sutra | `brahma-sutra-sribhashya` (Śrībhāṣya) | rāmānuja |
| isavasya-upanishad | `isavasya-upanishad-vedantadesika` (Deśika) | rāmānuja |
| aitareya / brihadaranyaka / chhandogya / katha / kena / mundaka / prashna / taittiriya | `*` (Rangaramanuja's प्रकाशिका) | rāmānuja |
| mandukya-upanishad | `*`-rangaramanuja | rāmānuja |
| mandukya-karika | `mandukya-karika-bharadvajaramanujacharya` | rāmānuja |

**Every multi-edition grantha in the library defaults to a Rāmānuja-school
commentary.** Even the "flat" single-edition upanishads are not mūla:
`svetasvatara-upanishad`'s only edition is `rangaramanuja-muni-prakashika`
(प्रकाशिका) with `edition_id == grantha_id`. So a Śaṅkara-school text citing
`श्वे. उ.` today lands on **Rāmānuja's** commentary, silently.

### 1.3 Verified: the wrong-school landing is real, not hypothetical

`isavasya-upanishad-sankara-bhashya` (a Śaṅkara-school citing work) cites
`बृ. उ. १ । ४ । १७` etc. Today those resolve to `brihadaranyaka-upanishad` →
display default → **Rangaramanuja's प्रकाशिका**. A Śaṅkara reader lands on a
Rāmānuja commentary. The Śaṅkara Bṛhadāraṇyaka-bhāṣya **is on disk**
(`brihadaranyaka-upanishad-sankara-bhashya`) — the correct target exists, the
system just never points at it.

### 1.4 Verified: some school cites are currently dead

- `श्री. भा. १.१.१` (srivatsanarayana) and `श्रीभाष्ये-१.१.१`
  (vedantadesika) — both Rāmānuja-school works — are `REF-UNDEFINED-ABBREV`
  today. The intended target (`brahma-sutra-sribhashya`) is on disk.
- `मो. ध. २४१ । ६` (sankara isavasya) — Mokṣa-dharma, not in library.
- The sankara isavasya cites **no** `ब्र.सू.` / `भ.गी.` today (only mūla
  śruti), so the sankara→brahma-sutra case is latent, not firing — but it is
  exactly one future text away.

### 1.5 Why this is a type bug, in plain English

Think of a citation's **type** as *which exact text the cite means, edition
and all*: `(grantha_id, edition_id)`. The current artifact is under-typed —
it carries `grantha_id` (a *set* of readings) and lets the runtime pick. The
design's core move: **elaborate every cite to a concrete `(grantha, edition)`
at compile time, and give the runtime zero picking to do.** "Never guess a
link" becomes: a cite whose concrete reading cannot be determined (or is not
in the library) is `unresolved` — never "some default edition".

---

## 2. The model — two separable steps

### 2.1 Step 1: Name resolution (always safe)

"Which grantha does this symbol name, given who is citing?"

- Same symbol, different answer by school context — overloaded. `श्री.भा.`
  in a rāmānuja context → Śrībhāṣya; in a śaṅkara context → Śaṅkara-bhāṣya.
- Base (school-less) table is the fallback, checked last.
- This is pure table lookup; it can never produce a *wrong-looking* link, only
  a not-found.

### 2.2 Step 2: Coercion (the unsafe step, now gated)

"Given a grantha, which edition?"

- `grantha → grantha's default edition` is an implicit coercion.
- It is **only legal when the default is attribution-safe**: the default IS
  the mūla, or the default belongs to the citing text's **own** school.
- Every other coercion is a type error → `unresolved`.

Every past wrong-link bug was a *bad coercion* applied after a correct name
resolution. The design therefore treats coercion as the single guarded step.

### 2.3 Context is the citing *edition*

The school context comes from the citing work, per edition
(`citation_namespace` in frontmatter, §4.2). It is a compile-time input; it
never needs to reach the runtime artifact beyond its `edition_id` stamp.

---

## 3. Ground rules for the design

1. **Elaborate fully at compile time (target state).** Every reference artifact
   carries a concrete `edition_id` (mūla refs emit the mūla edition id). The
   runtime only answers "is this exact `(grantha, edition)` on disk?" — link
   or not-in-library. No runtime default-picking.
2. **Shadowing is per-grantha, not per-symbol.** If a school declares
   `brahma-sutra → <edition>`, every base symbol under brahma-sutra cited from
   that school resolves to that edition — including `ब्र.सू.अधि.`. Partial
   (per-symbol) shadowing leaves holes that fall to base → wrong school.
3. **Resolution is total and unique.** For any `(citing edition, symbol)` there
   is exactly one outcome: a concrete `(grantha, edition)` or `unresolved`.
   Ambiguity is a validation failure, not a runtime coin-flip.
4. **Defaults are derived, not trusted.** A grantha's `default_school` is
   computed from the actual on-disk default edition's commentator (the
   envelope already carries it), not hand-declared and believed. This catches
   the flat-`edition_id == grantha_id`-but-actually-a-commentary case
   (svetasvatara).
5. **`unresolved` is a first-class value.** It is a resolution outcome, not an
   error. It covers: absent edition, wrong-school default with no declared
   alternative, ambiguous overloads, target not in library.
6. **The validator is the type checker.** The rules in §6 are implemented as
   data checks over the bimap + frontmatter + envelopes — the same spirit as
   the existing `check_meta_consistency`.
7. **Transition semantics (1.3.0 → 1.4.0 migration).** The runtime applies the
   same gate whether or not an `edition_id` is present, so the migration never
   reopens the mislink and never requires the runtime to know a schema
   version. A reference with **no** `edition_id` (1.3.0 content):
   - the target grantha's display default is **attribution-safe** (mūla / no
     `default_school`) → resolves to that default (correct both before and
     after migration);
   - the target grantha's display default is **school-flavored** →
     `unresolved` (conservative). The compile side was supposed to stamp the
     edition; its absence on a school-flavored grantha means "unknown reading",
     never "pick a default". 1.3.0 refs pointing at brahma-sutra or the
     upanishads therefore **defer** (Ground Rule #5), not mislink.
   **Known transition regression (bounded, sized):** the school-flavored →
   `unresolved` rule darkens *all* edition-less school-flavored refs, including
   the currently-**correct same-school** ones. The runtime has no way to know,
   for 1.3.0 content, that the *citing* text was the same school, because
   `citation_namespace` did not exist before this design. Sized against the
   committed library (2026-08-21): 281 references across the three isavasya
   citing editions, of which 141 target school-flavored granthas — 121
   (srivatsanarayana 85, vedantadesika 36) are correct same-school links that
   would go dark, and 20 (sankara isavasya) are wrong-school mislinks being
   fixed. **This is the product cost of choosing safety, and it is real.**
   The design's commitment is to keep that window *non-user-facing* by
   ordering (§4.3): the full re-ingestion sweep lands **before** the gate
   ships, so users never see the darkened state; the window exists only in the
   dev/CI gap between re-ingest and deploy. If that ordering is ever not
   honored, the cost is the 121-ref regression above and it must be treated as
   a user-facing tradeoff, not an implementation detail. **The ordering is
   mechanically enforced, not just documented** — §6 check #9 fails the build
   if the gate flag is on while any school-flavored-targeted ref lacks
   `edition_id`, so the sweep has to complete before the gate can legally
   turn on.
   The end state is full re-ingestion (§4.3), after which the absent-
   `edition_id` branch is unreachable for freshly produced content.

**Soundness property worth pinning in the spec:** a well-typed cite's target
never changes meaning as the library grows. What links today links to the same
reading tomorrow; what is unresolved today may become a link when an edition
is added, but never becomes a *different* reading.

---

## 4. Data model

### 4.1 `data/citation_bimap.yaml` — single authority, machine-edited

Base table (implicit default namespace — checked last), with per-grantha
`default_school` marking any grantha whose display default is a school
commentary:

```yaml
granthas:
  vishnu-purana:                              # no default_school → global/mūla
    ref_structure: [amsha, adhyaya, shloka]
    symbols:
      - abbrev: वि.पु.
  brihadaranyaka-upanishad:
    default_school: ramanuja                  # default edition is Rangaramanuja's प्रकाशिका
    ref_structure: [adhyaya, brahmana, mantra]
    symbols:
      - abbrev: बृ.उ.
        aliases: [बृ. उ.]
  brahma-sutra:
    default_school: ramanuja                  # default = Śrībhāṣya
    ref_structure: [adhyaya, pada, sutra]
    symbols:
      - abbrev: ब्र.सू.
        aliases: [ब्र.स.]
      - abbrev: ब्र.सू.अधि.
        ref_structure: [adhyaya, pada, adhikarana]
        locator_transform: brahma_sutra_adhikarana
  # ... remainder of today's flat list, verbatim, each gaining default_school as derived

namespaces:
  ramanuja:
    # no granthas block needed: base default_school: ramanuja already points at its own editions.
    # This namespace exists for symbols that are only meaningful by name within the school:
    symbols:
      - abbrev: श्री.भा.
        aliases: [श्रीभाष्ये, श्री. भा.]
        grantha_id: brahma-sutra
        edition_id: brahma-sutra-sribhashya
      - abbrev: गी.भा.
        aliases: [गीताभाष्य]
        grantha_id: bhagavad-gita
        edition_id: gita-bhashyam
  sankara:
    granthas:                                 # granthas whose base default is ramanuja but which
      brihadaranyaka-upanishad:                # śaṅkara texts cite → the śaṅkara edition
        edition_id: brihadaranyaka-upanishad-sankara-bhashya    # PRESENT → link
      isavasya-upanishad:
        edition_id: isavasya-upanishad-sankara-bhashya          # PRESENT → link
      svetasvatara-upanishad:
        edition_id: svetasvatara-upanishad-sankara-bhashya      # ABSENT → unresolved (no such edition on disk)
      brahma-sutra:
        edition_id: brahma-sutra-sankara-bhashya                # ABSENT → unresolved
      # ... every grantha a śaṅkara-school text cites whose base default is ramanuja
    symbols:
      - abbrev: श्री.भा.
        grantha_id: brahma-sutra
        edition_id: brahma-sutra-sankara-bhashya                # ABSENT → unresolved
```

> **Note:** the YAML above is **illustrative/partial**, not the final corpus
> survey. The complete `namespaces.*` enumeration — which granthas each school
> cites, and which flat granthas are secretly commentaries — is the Phase-0
> survey (§7.4). Do not read the example entries as the verified set.

Invariants:
- A school grantha entry must carry `edition_id` and reference a base grantha.
- Symbols are unique per namespace (same abbrev across namespaces is legal).
- `ref_structure` is grantha-scoped; symbol-level deviations declared where
  they exist (`ब्र.सू.अधि.`, `रा.सु.`); school symbols never re-declare
  structure — they inherit by grantha.
- `default_school` is validated (not trusted) against the envelope's actual
  default edition commentator (§6, check 4).

### 4.2 Frontmatter — `citation_namespace` per edition

`structured_md/upanishads/isavasya/isavasya-upanishad-sankara-bhashya-01.md`:

```yaml
commentaries_metadata:
  - commentary_id: sankara-bhashyam
    commentary_title: ईशावास्योपनिषद्भाष्यम्
    commentator:
      devanagari: श्रीमच्छङ्करभगवत्पूज्यपादः
    citation_namespace: sankara        # absent → base (school-neutral)
```

- **Edition-level, not per-file.** The importer derives the namespace once per
  edition (from the first file, mirroring `_edition_stub_meta`), stamps it on
  the edition envelope, and threads it into `_extract_references(text, ctx)`
  for **all** parts — so parts 2..N cannot diverge.
- Tests enforce cross-part agreement: all files in an edition declare the same
  `citation_namespace` (or none), and the envelope's stamped value matches
  what extraction used. A conflicting file is a hard error.

### 4.3 Artifact — `reference` gains a required `edition_id`

```jsonc
{
  "start": 33, "end": 47,
  "display_text": "बृ. उ. १ । ४ । १७",
  "grantha_id": "brihadaranyaka-upanishad",
  "edition_id": "brihadaranyaka-upanishad-sankara-bhashya",   // NEW, required when grantha_id set
  "locator": "1.4.17",
  "unresolved": false
}
```

- MINOR schema bump: VERSION `1.3.0 → 1.4.0`; mirror re-sync into the explorer
  (`cp`, per `SCHEMAS.md`).
- **Migration ordering (committed): data first, gate second.** Converters
  hardcode `SCHEMA_VERSION` (`convert_structured_md.py:46`,
  `import_editions.py:60`); `validate-data.ts` validates per-file shape, not
  global equality, so a phased rollout is safe:
  1. **Sweep the citing corpus first (data, no user impact).** Re-ingest
     isavasya and bhagavad-gita, then every remaining citing text (flat
     upanishads, ramayana, brahma-sutra sribhashya), so every reference
      carries `edition_id`. Re-ingestion is deterministic and idempotent (no
      LLM), so this is a mechanical pass, not a per-text decision. Because the
      gate (§4.4) is version-agnostic, shipping the re-ingested data ahead of
      the gate is safe — the 1.4.0 refs still resolve under the old runtime,
      and mūla targets resolve identically.
  2. **Ship the edition-aware gate (code).** Only after the sweep: the §4.4
     runtime gate, the schema bump, and the mirror re-sync.
  This ordering keeps Ground Rule #7's regression window **non-user-facing** —
  the 121 currently-correct same-school refs never darken for a user because
  the sweep lands first. The window exists only in the dev/CI gap between the
  two deployments. **The ordering is mechanically enforced** — `scripts/
  validate-reference-sweep.ts` (run in `validate:data` / `prebuild`) fails the
  build while the gate flag is on and any school-flavored-targeted ref lacks
  `edition_id` (§6 check #9). If the two ever must ship together and the sweep
  cannot precede the gate, the regression is real and bounded (121 refs, §3
  GR#7) and must be treated as a user-facing cost, not an implementation
  detail.
- "Required when `grantha_id` set" is the point: a mūla ref still emits an
  `edition_id` (its own), so the runtime never picks. `grantha_id: null`
  (undefined abbrev) keeps `edition_id` null.

### 4.4 Runtime (explorer)

- `Reference` TS type mirrors `edition_id`, and it must be **optional**
  (`edition_id?: string | null`), not required: the loader parses pre-sweep
  1.3.0 JSON that omits the field. The edition-aware gate treats the absent
  field as "no reading specified" (§3 GR#7), so an optional field is the
  load-correct shape, not a looser one.
- The gate's "is this grantha school-flavored?" test reads
  `granthas-meta.json.default_school` (the consumer-side declaration of the
  bimap's §4.1 `default_school`, cross-validated by §6 check #4).
- In-library gate is edition-aware: linkable iff `grantha_id` on disk **and**
  (`edition_id ∈ grantha.editions`, **or** `edition_id` is absent **and** the
  grantha's display default is attribution-safe — mūla / no `default_school`).
  An absent `edition_id` on a school-flavored-default grantha → not-in-library
  (unresolved), the Mādhyandina deferral pattern — **never** silently defaulted
  to another school's commentary. This is the single gate for both 1.3.0 and
  1.4.0 content (Ground Rule #7); the runtime never branches on schema version.
- `navigate()` / `getPassagePreview()` → `loadGrantha(grantha_id, edition_id)`;
  `updateHash(grantha_id, ref, edition_id)` carries the edition across the
  grantha change (`useVerseHash.ts:142` already supports explicit edition on a
  grantha switch).
- `validateAndNormalizeHash` stays as-is for reference-driven navigation (only
  verified editions are navigated to); hand-typed bad `?e=` still corrects to
  default.
- Diagnostics: `REF-NOT-IN-LIBRARY` becomes edition-aware (near-match on
  edition ids).

---

## 5. Resolution — the decision table

**Candidate construction (longest-match over a per-context set).** The
compile pipeline's abbreviation matcher runs over a **per-context candidate
set**: for a citing work in school `S`, candidates = `namespaces[S].symbols`
(plus their aliases) **∪** base symbols, built once per `extract_references`
call. Longest-first matching applies across the whole set, exactly as today —
separator tolerance, `_MIN_ABBREV_LEN`, and prefix-resolution are unchanged.
A namespace symbol that is a strict **prefix** of another (e.g. a hypothetical
`गी.भा.` vs a longer `गी.भा.अधि.`) resolves deterministically by longest-match.
An **equal-length** overlap between a namespace symbol and a base symbol is
never resolved by precedence — it is a validation error (§6 check 8), so the
matching stays unique and never-guess holds. (In practice namespace symbols
like `श्री.भा.` don't exist in the base at all; they simply extend the set.)

```
cite in edition E (cite_ns = S, or none) → symbol → grantha G
```

The matcher yields a matched symbol from the per-context set; the table it
came from decides which step applies — a symbol found in `namespaces[S]` is
step 1 (its `edition_id` is authoritative), a symbol found in the base table
is step 2 (the grantha's `default_school` decides). Because the two tables
cannot produce an equal-length tie (§6 check 8), "which table did it come
from" is never ambiguous.

```
 1. symbol declared in namespaces[S].symbols?
        → its (G, edition_id):  present → LINK (G, edition_id)
                                absent  → UNRESOLVED
 2. else base symbol → G, then G.default_school?
        ├─ absent (global)   → LINK (G, G's display default)           [वि.पु.]
        ├─ present (school X), S == X → LINK (G, G's display default)  [ramanuja बृ.उ. → प्रकाशिका]
        ├─ present (school X), S ≠ X, G in namespaces[S].granthas
                               → (G, S's edition): present → LINK / absent → UNRESOLVED
        └─ present (school X), S ≠ X, not declared → UNRESOLVED         [leave others unresolved]
```

Note step 2's `default_school` comparison is what makes the school default
"in-school" (a school's *own* edition) rather than "global" (any school's
default). The neutral-text case (`S` none) with a school-flavored default is
explicitly `UNRESOLVED`.

### Verified consequences (against on-disk data)

> The rows below are traced to citations actually checked in §1.3–§1.4 (the
> śaṅkara and rāmānuja isavasya editions), and show the **post-migration**
> outcome for those texts. Once the citing editions are re-ingested (§4.3), the
> un-swept 1.3.0 slice follows Ground Rule #7 — school-flavored targets defer,
> never mislink.

| Cite | Context | Today | After |
|---|---|---|---|
| `बृ. उ. १ । ४ । १७` | sankara isavasya | → Rangaramanuja प्रकाशिका (WRONG school) | → `brihadaranyaka-upanishad-sankara-bhashya` (present) |
| `श्वे. उ. ६ । २१` | sankara isavasya | → Rangaramanuja प्रकाशिका (WRONG school) | → unresolved (no sankara/mūla Śvetāśvatara edition on disk) |
| `ई. उ. ११` | sankara isavasya | → Deśika (WRONG school) | → `isavasya-upanishad-sankara-bhashya` (present) |
| `बृ. उ.` | ramanuja isavasya | → प्रकाशिका | unchanged (its own school) |
| `श्री. भा. १.१.१` | ramanuja isavasya | `REF-UNDEFINED-ABBREV` | → `brahma-sutra-sribhashya` |
| `ब्र. सू. १.२.२९` | ramanuja isavasya | → default Śrībhāṣya | unchanged (its own school) |
| `भ. गी. ४.२५` | ramanuja isavasya | → mūla Gītā | mūla (unless shadowed; §7.3) |
| `ब्र. सू.` | neutral text | → default Śrībhāṣya | → unresolved (school-flavored default, no school) |
| `वि. पु. १.२.२२` | any | → mūla | unchanged (global default) |

The sankara-isavasya rows are the headline: a Śaṅkara text stops silently
landing on Rāmānuja commentaries. Some of its cites go unresolved (Śvetāśvatara
until a Śaṅkara/mūla edition exists) — that is the honest outcome and matches
"leave others unresolved."

---

## 6. Validation = the type checker

Implemented as build/CI data checks, not a separate program:

1. **Uniqueness of resolution (coherence):** for every `(citing edition,
   symbol)` reachable in the corpus, the resolution table yields exactly one
   outcome. Ambiguous → fail.
2. **Whole-grantha shadowing:** every base symbol under a school-scoped grantha
   inherits the school edition; no partial holes.
3. **Grantha-level invariants:** school entries carry `edition_id`; reference a
   base grantha; no orphan granthas.
4. **Derived `default_school`:** recompute each grantha's `default_school` from
   the envelope's actual default edition commentator; mismatch between the
   yaml and the derivation → fail. (This is what flags a flat
   `edition_id == grantha_id` grantha that is actually a commentary.)
5. **Type inhabitedness (editions exist):** every `(grantha, edition)` named by
   the bimap/namespaces is checked against the on-disk editions at build time
   (the edition analogue of `check_meta_consistency`). Absent → flagged;
   runtime renders unresolved regardless.
6. **Multipart namespace consistency:** all files in an edition declare the
   same `citation_namespace`; envelope stamp matches what extraction used.
7. **Transform tables are edition-scoped.** A `locator_transform` lookup table
   (e.g. `brahma_sutra_adhikarana`) is derived from a **specific edition's**
   enumeration and is valid only for that edition. The current adhikarana
   table is built from the Śrībhāṣya source (Rāmānuja); adhikarana boundaries
   are a commentarial construct and can differ between editions. A
   `ब्र.सू.अधि.` cite in a **Śaṅkara** context must therefore **not** reuse the
   Rāmānuja-derived table — it resolves against the Śaṅkara-bhāṣya edition's
   own enumeration once that edition exists, and defers (Ground Rule #5) until
   then. Validation: a school-scoped symbol carrying a `locator_transform`
   must name the edition that owns the transform's table; reusing a table from
   a different edition's grantha entry is a hard error. (Today this is latent —
   no Śaṅkara text cites `ब्र.सू.अधि.` — but it is exactly the class of
   wrong-but-plausible link this design exists to prevent, one layer down.)
8. **No genuine ties across the combined candidate set.** The per-context
   candidate set (`namespaces[S]` ∪ base) must resolve each cite by a unique
   longest-match: two symbols of equal raw length that both match a cite with
   equal consumed length is a validation error. Cross-namespace same-abbrev
   (e.g. `श्री.भा.` in ramanuja and sankara) is **not** a tie — it is resolved
   by the citing context — but a namespace symbol overlapping the base table
   with equal length is flagged, never left ambiguous.
9. **Sweep-before-gate is mechanically enforced (the §4.3 ordering).**
   `scripts/validate-reference-sweep.ts` (run in `validate:data` / `prebuild`)
   scans every committed reference in `public/data/library`, classifies each
   target against the school-flavored granthas (from
   `granthas-meta.json.default_school`, the consumer-side declaration of §4.1's
   bimap `default_school`), and while `EDITION_AWARE_GATE_ENABLED` is true,
   **fails the build** if any school-flavored-targeted reference lacks a
   non-empty `edition_id`. Gate-flag discipline: flip the flag to `true` only
   in the same change that ships the §4.4 runtime gate — the check then refuses
   to merge that change until the full-corpus sweep (§4.3 step 1) has landed.
   With the flag off, the same scan runs as a progress report so the sweep's
   completion is visible before the gate can legally turn on. The check is a
   pure function (`lib/referenceSweep.ts::checkSweepReadiness`) with golden
   tests; mula / school-neutral targets are never flagged (their absent
   edition is attribution-safe per Ground Rule #7).

---

## 7. Open decisions (cheap now, cheap to revise later)

1. **`भ.गी.` shadowing.** Old plan asserted Deśika's `भ.गी.` "means Rāmānuja's
   Gītābhāṣya"; today those cites resolve to mūla. This is a behavior change
   gated on the gita-bhashyam ingestion (a separate worktree). Recommendation:
   keep mūla until gita-bhashyam is on disk and a spot-check confirms intent.
2. **Flat school-commentary granthas with no alternative** (svetasvatara →
   only प्रकाशिका): a śaṅkara cite becomes unresolved until a Śaṅkara/mūla
   edition is ingested. Recommendation: accept the deferral; strictly better
   than the current wrong-school landing.
3. **Neutral texts citing school-flavored-default granthas** now go unresolved
   (e.g. a school-less work citing `ब्र. सू.`). There are essentially no such
   citing texts today; confirm the cost is intended.
4. **Phase-0 survey:** enumerate per citing work × cited grantha → school
   edition, and enumerate which flat granthas are secretly commentaries, so the
   `sankara` granthas block and `default_school` derivations are complete
   before implementation.
5. **Adhikarana enumeration variance (empirical check).** §6 check 7 treats
   `brahma_sutra_adhikarana` as edition-scoped and defers a school context
   until a per-edition table exists. Whether Śaṅkara's adhikarana divisions
   actually differ from Rāmānuja's (the table's current source) is a fact to
   verify when a Śaṅkara-bhāṣya edition is ingested — if they coincide, one
   shared table suffices and check 7 relaxes; if they diverge, the per-edition
   table is mandatory. The design's conservative default is the safe starting
   point either way.
6. **Runtime same-school fallback (considered, rejected).** To avoid GR#7's
   dark-window entirely, the runtime could derive the *source* edition's school
   from its envelope commentator (Ground Rule #4's derivation) and, for an
   edition-less ref, resolve to the target default when the schools match.
   This was **not** chosen: it reintroduces runtime type-derivation (the
   design's north star is zero runtime type-filling) and duplicates the
   compile-side `citation_namespace` decision at runtime. It remains the
   fallback if the §4.3 data-first ordering is ever broken and the ~242-ref
   regression becomes user-facing.

---

## 8. Why this is the right shape (review summary)

- **`common` is not a real namespace** — it is the *absence* of school scoping.
  Base table is implicit default, checked last; no `common:` key.
- **`default_school` instead of cross-school-scoping invariants** — declaring
  *what* each grantha's default is, and resolving a school's cite to *its own*
  edition (present = link, absent = unresolved), makes the old "every school
  must scope every grantha" invariant a natural consequence rather than a rule
  to enforce.
- **`edition_id` required on the artifact** is a typing fix: it makes
  references concrete and deletes the runtime guessing point (the historical
  source of every silent mislink). This holds **per-text as each citing text is
  re-ingested (§4.3)**; until the sweep completes, the un-swept 1.3.0 slice is
  made safe (school-flavored targets defer per Ground Rule #7) rather than
  left mislinking, but it is not yet "concrete".
- **The validator is the type checker** — the rules in §6 are checks over data
  the pipeline already owns, so "machine-edited YAML + validation" stays the
  operating model.
- **Extends, never rewrites:** the base table is today's flat bimap verbatim
  plus `default_school`; the adhikarana/Mādhyandina/तै.आन./prefix/transform
  machinery survives untouched.
