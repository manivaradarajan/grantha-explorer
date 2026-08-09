# Source Data Issues

Defects found in source files in the **grantha-data** repository during
converter development (`scripts/convert_structured_md.py`). These are errors
in the source files, not in the converter. The converter handles each case
gracefully; these entries exist so the source can be corrected when convenient.

All paths below are relative to the `grantha-data` repository root.

---

> **All 7 issues resolved.**
> Fixed in grantha-data commit `4569fe1`
> ("Fix all 7 source data issues identified in grantha-explorer/SOURCE_DATA_ISSUES.md").
> After regenerating JSON from the corrected sources, all commentary streams
> should unify correctly across all affected granthas.

---

## 1. Chandogya Upanishad — duplicate `part_num` in files 06 and 07

**Status: Resolved** (commit `4569fe1`). `part_num` corrected to 6 and 7.

### Affected files

```
structured_md/upanishads/chandogya/chhandogya-upanishad-rangaramanuja-06-01-01.md
structured_md/upanishads/chandogya/chhandogya-upanishad-rangaramanuja-07-01-01.md
```

### What is wrong

Both files declare `part_num: 1` in their YAML frontmatter. File 06 begins at
Mantra 6.1.1 (the Śvetaketu narrative opening chapter 6); file 07 begins at
Mantra 7.1.1 (the Nārada/Sanatkumāra dialogue opening chapter 7). The correct
sequential values are `part_num: 6` and `part_num: 7` respectively. All other
chandogya files (01–05, 08) carry correct, unique `part_num` values.

### What the converter does

Detects the non-unique `part_num` set across a text's files, emits a WARNING,
and falls back to alphabetical filename order. Since `06` sorts before `07`,
the output part files are generated in correct reading order (6.1.1 before
7.1.1). The staged output is functionally correct despite the source error.

### Correct fix

In each file's YAML frontmatter, change the `part_num` line:

```
chhandogya-upanishad-rangaramanuja-06-01-01.md:  part_num: 1  →  part_num: 6
chhandogya-upanishad-rangaramanuja-07-01-01.md:  part_num: 1  →  part_num: 7
```

After this fix the converter's primary sort (by `part_num`) works for chandogya
and the fallback WARNING no longer appears.

---

## 2. Brihadaranyaka Upanishad — `<!-- /hide -->` used as Sanskrit block close tag in 8 passages

**Status: Resolved** (commit `4569fe1`). All 8 passages corrected to `<!-- /sanskrit:devanagari -->`.

### Affected files and passages

```
structured_md/upanishads/brihadaranyaka/brihadaranyaka-upanishad-rangaramanuja-03-01-01.md
  — passages 3.2.2, 3.3.1

structured_md/upanishads/brihadaranyaka/brihadaranyaka-upanishad-rangaramanuja-04-01-01.md
  — passages 4.1.11, 4.4.7, 4.4.8, 4.5.5

structured_md/upanishads/brihadaranyaka/brihadaranyaka-upanishad-rangaramanuja-05-01-01.md
  — passage 5.2.5

structured_md/upanishads/brihadaranyaka/brihadaranyaka-upanishad-rangaramanuja-08-01-01.md
  — passage 8.1.8
```

### What is wrong

These 8 passages close their `<!-- sanskrit:devanagari -->` block with
`<!-- /hide -->` instead of the standard `<!-- /sanskrit:devanagari -->` used
everywhere else. Example (passage 3.2.2):

```
<!-- sanskrit:devanagari -->

\*\*आपो वा अर्कः । तद् यदपां शर आसीत्...॥२॥

<!-- /hide -->               ← should be <!-- /sanskrit:devanagari -->
```

In all 8 cases the Sanskrit content is plain text with no nested tags between
the open and the erroneous close, so the wrong tag does not cause truncation.

### What the converter does

After the primary pattern (`<!-- /sanskrit:devanagari -->`) fails to match
within the segment, falls back to `_ANY_HTML_CLOSE_RE` (matches any
`<!-- /... -->` tag) as the close boundary. Extracts the correct Sanskrit text
in all 8 cases. Converter output for these passages is expected to match the
live brihadaranyaka JSON; verification pending the full diff-against-legacy
review.

### Correct fix

In each affected passage, replace the Sanskrit block's `<!-- /hide -->` close
tag with `<!-- /sanskrit:devanagari -->`. Note: these passages also contain
legitimate `<!-- /hide -->` tags inside their commentary blocks (closing
`<!-- hide type:... -->` annotation markers); only the Sanskrit-block close
tag needs to change.

---

## 3. Taittiriya Upanishad — `commentary_id` spelling inconsistency (part 2)

**Status: Resolved** (commit `4569fe1`). `srirangaramanuja-muni-prakashika` → `rangaramanuja-muni-prakashika` in frontmatter and all 11 body markers.

### Affected files

```
structured_md/upanishads/taittiriya/taittiriya-upanishad-rangaramanuja-02-01-01.md
```

### What is wrong

The three taittiriya source files use two different spellings of the same
commentary's identifier:

| File | `commentary_id` in frontmatter |
|------|-------------------------------|
| `taittiriya-upanishad-rangaramanuja-01-01-01.md` | `rangaramanuja-muni-prakashika` |
| `taittiriya-upanishad-rangaramanuja-02-01-01.md` | `srirangaramanuja-muni-prakashika` ← outlier |
| `taittiriya-upanishad-rangaramanuja-03-01-01.md` | `rangaramanuja-muni-prakashika` |

Part 2 has a spurious `sri` prefix. The canonical spelling used by 2 of 3
parts, and consistent with the majority of other texts in the corpus, is
`rangaramanuja-muni-prakashika`.

### What the converter does

Preserves each file's `commentary_id` as-is in the output JSON (by design;
the plan explicitly prohibits normalisation in the converter). Part 2's
generated `part2.json` therefore carries `commentary_id:
"srirangaramanuja-muni-prakashika"` while parts 1 and 3 carry
`"rangaramanuja-muni-prakashika"`.

At runtime, when the user navigates to a ref in part 2, `useGranthaLoader`
lazy-loads `part2.json` and attempts to merge its commentary into the cached
grantha. The cache already contains a commentary object from the initial
part 1 load with id `"rangaramanuja-muni-prakashika"`. The id lookup fails,
and the 10 commentary passages for refs 2.1.1–2.1.9 are dropped (fixed
on the app side in `hooks/useGranthaLoader.ts` by adding an `else` branch;
that fix surfaces the passages but under the mismatched id, so the UI still
shows two separate commentary streams as the user scrolls past the part
boundary).

### Correct fix

In `taittiriya-upanishad-rangaramanuja-02-01-01.md`, change the
`commentary_id` field in `commentaries_metadata`:

```yaml
# Before
- commentary_id: srirangaramanuja-muni-prakashika

# After
- commentary_id: rangaramanuja-muni-prakashika
```

After this fix, regenerate `part2.json` and re-copy to live.

---

## 4. Katha Upanishad — `commentary_id` spelling inconsistency (parts 3 and 5)

**Status: Resolved** (commit `4569fe1`). `srirangaramanuja-muni-prakashika` → `rangaramanuja-muni-prakashika` in frontmatter and body markers (14 in part 3, 12 in part 5).

### Affected files

```
structured_md/upanishads/katha/katha-upanishad-rangaramanuja-03-01.md
structured_md/upanishads/katha/katha-upanishad-rangaramanuja-05-01.md
```

### What is wrong

Katha has 6 source files; 4 use the canonical spelling and 2 use a spurious
`sri` prefix:

| File | `commentary_id` in frontmatter |
|------|-------------------------------|
| `katha-upanishad-rangaramanuja-01-01.md` | `rangaramanuja-muni-prakashika` |
| `katha-upanishad-rangaramanuja-02-01.md` | `rangaramanuja-muni-prakashika` |
| `katha-upanishad-rangaramanuja-03-01.md` | `srirangaramanuja-muni-prakashika` ← outlier |
| `katha-upanishad-rangaramanuja-04-01.md` | `rangaramanuja-muni-prakashika` |
| `katha-upanishad-rangaramanuja-05-01.md` | `srirangaramanuja-muni-prakashika` ← outlier |
| `katha-upanishad-rangaramanuja-06-01.md` | `rangaramanuja-muni-prakashika` |

Refs affected at runtime: 1.3.1–1.3.17 (part 3) and 2.5.1–2.5.12 (part 5).

### What the converter does

Same as issue 3: preserves the ids as-is. The `else` branch fix to
`useGranthaLoader` surfaces the passages but under the mismatched id.

### Correct fix

In both outlier files, change the `commentary_id` field in
`commentaries_metadata`:

```yaml
# Before
- commentary_id: srirangaramanuja-muni-prakashika

# After
- commentary_id: rangaramanuja-muni-prakashika
```

Regenerate and re-copy `part3.json` and `part5.json` for katha after the fix.

---

## 5. Mundaka Upanishad — `commentary_id` spelling inconsistency (part 1)

**Status: Resolved** (commit `4569fe1`). `rangaramanuja-prakashika` → `rangaramanuja-muni-prakashika` in frontmatter and all 11 body markers.

### Affected files

```
structured_md/upanishads/mundaka/mundaka-upanishad-rangaramanuja-01-01-01.md
```

### What is wrong

Mundaka has 6 source files; 5 use `rangaramanuja-muni-prakashika` and part 1
drops the word `muni`:

| File | `commentary_id` in frontmatter |
|------|-------------------------------|
| `mundaka-upanishad-rangaramanuja-01-01-01.md` | `rangaramanuja-prakashika` ← outlier (missing `-muni`) |
| `mundaka-upanishad-rangaramanuja-01-02-01.md` | `rangaramanuja-muni-prakashika` |
| `mundaka-upanishad-rangaramanuja-02-01-01.md` | `rangaramanuja-muni-prakashika` |
| `mundaka-upanishad-rangaramanuja-02-02-01.md` | `rangaramanuja-muni-prakashika` |
| `mundaka-upanishad-rangaramanuja-03-01-01.md` | `rangaramanuja-muni-prakashika` |
| `mundaka-upanishad-rangaramanuja-03-02-01.md` | `rangaramanuja-muni-prakashika` |

Note: the initial load of a multi-part grantha loads only the first part.
For mundaka the first part loaded is part 1 (id `"1"`, first_ref `1.1.1`),
which has the outlier id `"rangaramanuja-prakashika"`. This means the cache
is initialised with the wrong id, and parts 2–6 (using
`"rangaramanuja-muni-prakashika"`) fail to merge into it. Commentary is
broken for ALL mundaka refs — not just part 1.

### What the converter does

Preserves ids as-is. The `else` branch fix surfaces parts 2–6's passages
under `"rangaramanuja-muni-prakashika"`, but part 1's passages remain under
the outlier `"rangaramanuja-prakashika"`, producing two commentary streams.

### Correct fix

In `mundaka-upanishad-rangaramanuja-01-01-01.md`, change the `commentary_id`:

```yaml
# Before
- commentary_id: rangaramanuja-prakashika

# After
- commentary_id: rangaramanuja-muni-prakashika
```

Regenerate and re-copy all mundaka parts after the fix (since the initial
cache id changes, all parts must be regenerated together).

---

## 6. Chandogya Upanishad — `commentary_id` spelling error in part 1

**Status: Resolved** (commit `4569fe1`). `srirangaramanujamuni-prakashika` → `rangaramanuja-muni-prakashika` in frontmatter and all 100 body markers.

### Affected files

```
structured_md/upanishads/chandogya/chhandogya-upanishad-rangaramanuja-01-01-01.md
```

### What is wrong

Chandogya has 8 source files. Six use `rangaramanuja-muni-prakashika`; part 7
is a separate issue (see issue 7 below); part 1 has a distinct spelling error:

| File | `commentary_id` | `commentary_title` |
|------|----------------|-------------------|
| `chhandogya-upanishad-rangaramanuja-01-01-01.md` | `srirangaramanujamuni-prakashika` ← outlier | `प्रकाशिका` |
| `chhandogya-upanishad-rangaramanuja-02-01-01.md` | `rangaramanuja-muni-prakashika` | — |
| `chhandogya-upanishad-rangaramanuja-03-01-01.md` | `rangaramanuja-muni-prakashika` | — |
| `chhandogya-upanishad-rangaramanuja-04-01-01.md` | `rangaramanuja-muni-prakashika` | — |
| `chhandogya-upanishad-rangaramanuja-05-01-01.md` | `rangaramanuja-muni-prakashika` | — |
| `chhandogya-upanishad-rangaramanuja-06-01-01.md` | `rangaramanuja-muni-prakashika` | — |
| `chhandogya-upanishad-rangaramanuja-08-01-01.md` | `rangaramanuja-muni-prakashika` | — |

The part 1 `commentary_id` has two simultaneous errors relative to the
canonical spelling: a spurious `sri` prefix prepended, and the dash between
`muni` and `prakashika` removed. The `commentary_title` field in the same
file is correctly `प्रकाशिका`, confirming this is the same Prakashika work as
the other parts — the id is just misspelled.

Because the initial multi-part load fetches only the first part, the cache is
seeded with `"srirangaramanujamuni-prakashika"`. Parts 2–6 and 8 (all using
`"rangaramanuja-muni-prakashika"`) cannot merge into it. The `else` branch
fix in `useGranthaLoader.ts` surfaces those passages as a separate stream
rather than dropping them silently, but the split-stream UX persists until
the source is corrected.

### What the converter does

Preserves the misspelled id as-is in `part1.json`. The `else` branch fix in
`useGranthaLoader.ts` then surfaces two commentary streams in the UI:
`srirangaramanujamuni-prakashika` (part 1 passages) and
`rangaramanuja-muni-prakashika` (parts 2–6, 8 passages).

### Correct fix

In `chhandogya-upanishad-rangaramanuja-01-01-01.md`, change the
`commentary_id` field in `commentaries_metadata`:

```yaml
# Before
- commentary_id: srirangaramanujamuni-prakashika

# After
- commentary_id: rangaramanuja-muni-prakashika
```

Regenerate all chandogya parts after this fix, since the seeded cache id
changes for the whole grantha.

---

## 7. Chandogya Upanishad — part 7 uses `rangaramanuja-muni-bhashyam` (confirmed labeling error)

**Status: Resolved** (commit `4569fe1`). Three fields corrected: `commentary_id`, `commentary_title` (भाष्यम् → प्रकाशिका), `authored_colophon` (विरचितम् → विरचिता); 30 body markers updated.

### Affected files

```
structured_md/upanishads/chandogya/chhandogya-upanishad-rangaramanuja-07-01-01.md
```

### What is wrong

Part 7 (Prapāṭhaka 7, Bhūma Vidyā section) carries:

```yaml
commentary_id: rangaramanuja-muni-bhashyam
commentary_title: भाष्यम्
```

All other chandogya parts use `commentary_id: rangaramanuja-muni-prakashika`
(or the part 1 variant — see issue 6) and `commentary_title: प्रकाशिका`.

### Classification: confirmed labeling error

**This classification is confirmed by two independent lines of evidence:**

**1. User's direct domain knowledge (definitive):** In this school's naming
convention, every upanishad's Rangarāmānuja commentary is uniformly named
`rangaramanuja-muni-prakashika`. There is no distinct work called
`rangaramanuja-muni-bhashyam` in this tradition. The naming convention alone
rules out the alternative interpretation, independently of any textual analysis.

**2. Claude's textual analysis (corroborating):** The evidence for "labeling
error" from the source text is:

1. **Identical prose style and expository method across all 8 parts.** The
   `**प्र.**` citation abbreviation (consistently used throughout the corpus
   as shorthand for *Prakāśikā*) appears in part 7 at the same rate and in the
   same structural positions as in the other parts. Word-by-word Sanskrit
   glossing, section introductions (विद्या name + प्रस्तूयते), and sentence
   framing are indistinguishable from parts 2–6 and 8.

2. **Identical authorial attribution.** Part 7's frontmatter carries
   `authored_colophon: श्रीरङ्गरामानुजमुनिभिः विरचितम्` — the same phrase
   as all other parts.

3. **A positive mechanism for the mislabeling.** Every khanda in all 8 parts
   of the chandogya source ends with a traditional Sanskrit section-close
   colophon of the form `॥ इति प्रथमखण्डभाष्यम् ॥`. This uses "bhāṣyam" in
   its generic sense ("the commentary/explanation on this section") — a
   completely standard Sanskrit convention, not a genre designation. The term
   appears uniformly across all 8 parts (16–25 occurrences per part). The
   most probable explanation is that whoever authored part 7's frontmatter
   copied this colophon phrasing as the `commentary_title`, rather than using
   the work's actual title `प्रकाशिका`. This is a specific, verifiable
   mechanism — not merely an absence of counter-evidence.

4. **No content discontinuity at the part 7 boundary.** There is no
   perceptible shift in register, vocabulary, or commentary method between
   parts 6 and 7, as would be expected if transitioning to a genuinely
   different sub-work.

**Note:** The Aitareya case in this project is a precedent for things that initially
looked like labeling errors turning out to be real distinct content. This case was
confirmed by direct domain knowledge (the school's naming convention uniformly uses
`rangaramanuja-muni-prakashika`; no distinct bhāṣyam work exists in this tradition),
corroborated by textual analysis. Fix has been applied.

### What the converter does

Preserves `rangaramanuja-muni-bhashyam` as-is in `part7.json` (no-normalise
policy). With the `else` branch fix in `useGranthaLoader.ts`, part 7 commentary
(30 blocks, refs 7.1.1–7.26.2) surfaces as a **third** commentary stream in
the UI alongside `srirangaramanujamuni-prakashika` (part 1) and
`rangaramanuja-muni-prakashika` (parts 2–6, 8). Once issue 6 is corrected
(part 1 id normalised), the third stream reduces to two. This three-stream
(or two-stream post-fix-6) UX is a **known tracked issue** — the same
split-stream category as issues 3–6 — and is not a converter defect.

### Recommended fix (pending scholar confirmation)

In `chhandogya-upanishad-rangaramanuja-07-01-01.md`, change the
`commentaries_metadata` fields:

```yaml
# Before
- commentary_id: rangaramanuja-muni-bhashyam
  commentary_title: भाष्यम्

# After
- commentary_id: rangaramanuja-muni-prakashika
  commentary_title: प्रकाशिका
```

Regenerate `part7.json` and re-copy to live after the fix. Once issue 6 is
also fixed, the grantha will have a single unified commentary stream.

---

## 8. Isavasya Srivatsanarayana — prefatory śāntimantra has no Sanskrit block; śānti-pāṭha bhāṣya misattributed

**Status: Open.** Identified while resolving the vedantadesika prefatory
regression (see commit history); the vedantadesika edition was fixed by
removing the misattributed śānti-pāṭha bhāṣya and keeping the mangalam as the
`0.0` commentary. This edition has not yet been restructured.

### Affected files

```
structured_md/upanishads/isavasya/isavasya-upanishad-srivatsanarayana-01.md
```

### What is wrong

The prefatory passage (`# Prefatory: 0.0 (devanagari: "शान्तिमन्त्रः")`,
lines 24–66) is missing two structural elements every other edition has:

1. **No `<!-- sanskrit:devanagari -->` block.** The śāntimantra mūla
   (`ओम् पूर्णमदः …`) is written as bold-markdown prose interleaved with the
   commentary text instead of being enclosed in a Sanskrit content block
   (violates GRANTHA_MARKDOWN.md §3.2). The converter therefore cannot extract
   it as `prefatory_material` — the output `part1.json` has no prefatory entry
   and no displayable mūla for the śānti-pāṭha.
2. **No `# Commentary: 0.0` sub-heading.** The whole block — śānti-pāṭha
   bhāṣya *and* the प्रकाशिका mangalam — is one unstructured blob, attributed
   to ref `0.0` only through the converter's positional fallback. The same
   misattributed śānti-pāṭha bhāṣya prose that was removed from the
   vedantadesika edition (it is not Srivatsanarayana Muni's text) is present
   here too, and the genuine mangalam verses are buried inside it.

### What the converter does

- Produces `prefatory_material: []` for this edition (no Sanskrit block to
  extract), so the śāntimantra mūla never displays.
- Emits a single `0.0` commentary passage combining the śānti-pāṭha bhāṣya and
  the mangalam — recoverable, but misattributed content bundled into one blob.

### Recommended fix (pending scholar confirmation)

Restructure the prefatory block to match the vedantadesika edition:

1. Wrap the śāntimantra mūla in a `<!-- sanskrit:devanagari -->` block so it
   becomes `prefatory_material`.
2. Add a `# Commentary: 0.0` sub-heading.
3. Remove the misattributed śānti-pāṭha bhāṣya (it is not Srivatsanarayana
   Muni's text), leaving the genuine प्रकाशिका mangalam as the `0.0`
   commentary content.

Then regenerate `part1.json` for this edition.

### Note

The inline `<!-- hide -->शान्तिमन्त्रः<!-- /hide -->` label inside the
prefatory is harmless (redundant with the heading label) and is handled by the
converter's hide-block stripping (`_extract_mula_text`).
