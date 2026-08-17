# Deferred work

Items deliberately left open as of the schema v1.0.0 checkpoint (eb217e4).
The former `new-grantha-data` branch was deleted; its work landed in `main`.
Update this file when an item is addressed or re-scoped.

---

## 1. editions[] in the generated index format

**RESOLVED** — `scripts/generate-granthas-json.ts` now emits an `editions[]`
array on index entries for grantha-level envelope granthas (isavasya,
mandukya), and `loadGrantha` in `lib/data.ts` consumes it to resolve the
active edition. Single-edition granthas omit the field (edition_id ==
grantha_id by convention).

---

## 2. mandukya-karika grantha-level envelope

**RESOLVED** — `mandukya-karika` now has a grantha-level
`public/data/library/upanishads/mandukya-karika/envelope.json` with two
editions (Bhāradvāja Rāmānujācārya's प्रतिपदार्थदीपिका, default, and
Kūranārāyaṇa Muni's karika-bhāṣya), generated from the split
structured_md kārikā files by `scripts/import_editions.py`. The legacy flat
file `upanishads/mandukya/mandukya-karika-bharadvajaramanujacharya.json` was
deleted.

---

## 3. Edition-resolution logic not implemented in loadGrantha

**RESOLVED** — `loadGrantha(granthaId, editionId)` in `lib/data.ts` now
resolves the active edition from the index entry's `editions[]` using the
user → `?e=` → `isDefault` → first-stub fallback chain, and caches per
`granthaId::editionId`. Lazy part loading uses the resolved edition path.

---

## 4. No grantha-level envelope.json files for most texts

Isavasya and mandukya now have grantha-level `envelope.json` files.
Brihadaranyaka still has only a runtime `canonical_title` fallback in
`lib/data.ts:331–333`. All other texts still lack a grantha-level
`envelope.json`. The general migration — one file per text, replacing the
current `granthas-meta.json` lookup — is unscoped.

---

## 5. alignsWith is reserved but unpopulated

`alignsWith: ["string", "null"]` is defined on `passage` in
`grantha.schema.json` for future cross-edition concordance. No data file
populates it yet, and no UI or API reads it. Revisit when concordance
feature is designed.

---

## 6. structure_levels duplication TODO (pre-existing)

`lib/data.ts:234` has a TODO comment: structure_levels are currently
duplicated across `envelope.json` and each `part*.json`. They should live
only in the envelope. Pre-dates this session; unaddressed.

---

## 7. title_iast data quality in granthas-meta.json (pre-existing)

`granthas-meta.json` stores plain romanizations (e.g. "Brihadaranyaka
Upanishad") in the `iast` field rather than proper IAST with diacritics.
The generator writes these directly to the index as `title_iast`. Pre-dates
this session; unscoped.

---

## 8. Schema gap: structure_levels does not enforce nesting via children

`structure_levels` in `grantha.schema.json` is defined as
`{ "type": "array", "items": { "$ref": "...#/definitions/structure_level" } }`
with no constraint on item count. The `structure_level` definition marks
`children` as optional. Together these permit a flat sibling array (multiple
peer objects with no `children` links), which is the wrong shape — the runtime
code in `buildNestedGroups` and `PassageLink.getLabel()` only traverses
`children` and silently ignores any sibling entries past index 0.

Tracked fix: add `"maxItems": 1` to the `structure_levels` array property in
`grantha.schema.json` and `grantha-envelope.schema.json`, forcing all
multi-level structure to be expressed through `children` on the single
top-level item.

Note: the flat-array data bug in kena and katha (which surfaced this gap) was
fixed in the same session this item was filed — see commit history. The schema
constraint is still missing and should be added to make the validator reject
any future recurrence.

---

## 9. Legacy children-as-object (not array) format — audit and migration needed

The `structure_level` schema defines `children` as an array
(`"type": "array"`). However most of the library was authored before the
schema rewrite and uses `children` as a plain object (not wrapped in `[]`):

  aitareya, chandogya (envelope + 8 parts), brihadaranyaka (14 part files),
  kaushitaki (envelope + 4 parts), mundaka (envelope + 6 parts),
  prashna (envelope + 6 parts), svetasvatara (envelope + 6 parts),
  taittiriya (envelope + 3 parts)

The runtime code in `buildNestedGroups` and `PassageLink.getLabel()` already
handles both shapes (`Array.isArray(children) ? children[0] : children`), so
there is no rendering bug. But these files **fail schema validation** against the
current `grantha-envelope.schema.json` (confirmed: 48 files, error
`wrong type at structure_levels[0].children` once the validators were pointed
at the correct root schemas — stale-validator issue resolved).

The migration (wrapping bare `children: {...}` in `children: [...]`) is the
next planned data fix pass.

---

## 10. Three-way commentary shim in useGranthaLoader.ts (transitional)

`useGranthaLoader.ts` currently handles three formats when merging lazy-loaded
part commentary into the grantha accumulator:

  - `content.commentary` — single `Commentary` object (new `grantha-part.schema.json`)
  - `content.commentaries` as `Commentary[]` — old array format
  - `content.commentaries` as `Record<string, Commentary>` — old keyed-dict format

This three-way branch exists only to support the corpus during the Bucket E
migration (brihadaranyaka + 51 other part files). Once all part files have been
migrated to the singular `commentary` field, simplify `useGranthaLoader.ts` back
to reading `content.commentary` directly and remove the fallback branches.


---

## 11. Title resolution integrity check (automated)

`scripts/check_title_resolution.py` verifies that every grantha in the
generated index (`public/data/generated/granthas.json`) has a resolvable
Devanagari title, checking the generated index first (runtime path) and
`public/data/granthas-meta.json` second (generator source).

Added during the taittiriya v1.0.0 migration (2026-08-06) after removing
`canonical_title` from the edition sub-envelope format.  The brihadaranyaka
conversion surfaced the same risk: removing `canonical_title` from an envelope
that the runtime was previously falling back to can silently produce a blank
title in the UI.  Run this check before and after each text is copied from
staging to live, and again after any change to `granthas-meta.json` or the
index generator.

---

## 12. Default landing skips prefatory material (opens at first main passage)

On a fresh load the app treats `verseRef: "1"` as a sentinel and the
grantha-change effect in `app/page.tsx` jumps to the first *main* passage via
`getFirstMainPassageRef` (`lib/hashUtils.ts`), deliberately skipping prefatory
material. So a grantha with a śānti-pāṭha (e.g. isavasya, ref `0.0`) opens at
Mantra 1 and never at the prefatory passage on first load.

Note `getFirstVerseRef` (`lib/hashUtils.ts`) *does* prefer prefatory material
first, but it is only used to correct an invalid ref, not for the default
landing. Decide whether a fresh open should land on the first real ref
(prefatory included) — e.g. switch that effect to `getFirstVerseRef` — and
whether behaviour should differ per edition (e.g. isavasya-vd). Flagged for
consideration; not an active bug.

---

## Aitareya Upanishad — Sayana Bhashya (deferred)

**Passage ref:** 0.0

**Source editorial note:** रङ्गरामानुजमुनिभिः अव्याख्यातत्वात् सायण भाष्यमेव दत्तम्

**Decision rationale:** The Sayana Bhashya is present only because Rangaramanuja Muni did not comment on this passage. It falls outside the scope of the Rangaramanuja edition and is deferred pending a decision on whether to create a separate Sayana edition or discard.

**Sayana text:**

यथोक्ततत्त्वविद्याप्रतिपादकग्रन्थपाठे प्रवृत्ता मदीया वाक् सर्वदा मनसि प्रतिष्ठिता । मनसा यद्यच्छब्दजातं विवक्षितं तदेव पठति । मनश्चमदीयं वाचि प्रतिष्ठितम् । यद्यद्विद्याप्रतिपादकत्वेन वक्तव्यं शब्दजातमस्ति तदेव मनसा विवक्ष्यते । एवम् अन्योम्यानुगृहीते वाङ्मनसे विद्यार्थं ग्रन्थं साकल्येन अवधारयितुं शक्नुतः । मनसः सावधानत्वाभावे वागिन्द्रियं सुप्तोन्मत्तप्रलापादिवत् यत्किञ्चिदसंगतं ब्रूयात् । तथा च वाचः पाटवाभावे सति गद्गदरूपया वाचा विवक्षितं सर्वं यथावन्नोच्चार्येत । अतस्तयोः अन्योन्यानुकूल्यम् अस्तु इत्येवं प्रार्थ्यते । आविःशब्देन स्वप्रकाशं ब्रह्मचैतन्यमुच्यते । प्रज्ञानशब्देन व्यवहृतत्वात् तस्य आविर्भूतरूपत्वम् । तथाविध हे आत्मन् ! मदर्थम् आविरेधि अविद्यावरणपनयनेन प्रकटीभव । हे वाङ्गनसे! मे मदर्थं वेदस्य यथोक्ततत्त्वविद्याप्रतिपादकस्य ग्रन्थस्य आणीस्थः विद्यायाः आनयनसमर्थे भवतम्।मे श्रुतं मया श्रोत्रेणावगतं ग्रन्थतदर्थजातं मा प्रहासीः मा परित्यजतु, विस्मृतं मा भूदित्यर्थः । अनेनाधीतेन विस्मरणरहितेन ग्रन्थेनाहोरात्रान् सन्दधामि संयोजयामि । अहनि रात्रौ चालस्यं परित्यज्य निरन्तरं पठामि इत्यर्थः ।अस्मिन् पठिते ग्रन्थऋतं परमार्थभूतं वस्तु वदिष्यामि।विपरीतार्थवदनं कदाचिदपि माभूदित्यर्थः।ऋतं मानसं सत्यं वाचिकं, मनसा वस्तुतत्वं विचार्य वाचा वदिष्यामि इत्यर्थः। तन्मया वक्ष्यमाणं ब्रह्मतत्त्वं मां शिष्यम् अवतु सम्यग्बोधेन पालयतु । तथा तद् ब्रह्मतत्त्वं वक्तारम् आचार्यमवतु, बोधकत्वसामर्थ्य प्रदानेन पालयतु । पुनरप्यवतु मामित्याधुक्तिः फलविषया पूर्वं साधनकाले शिष्याचार्ययोः पालनं प्रार्थितम् इदानीं फलकालेपि प्रार्थ्यते । तत्र शिष्यस्याविद्यातत्कार्यनिवृत्तिः फलम्। आचार्यस्य तादृशशिष्यदर्शनेन विद्यासम्प्रदायप्रवृत्तिप्रयुक्तः परितोषः फलम् । अनेन मन्त्रपाठेन विद्योत्पत्तेः पुरा विद्याप्रतिबन्धकाः विघ्ना परिहियन्ते विद्योत्पत्तेरूर्ध्वम् असम्भावनाविपरीतभावनोत्पादका विघ्ना परिहियन्ते । अवतु वक्तारम् इत्यभ्यासोऽध्यायसमाप्त्यर्थो द्वितीयारण्यकसमाप्त्यर्थश्च ॥ (सायणभाष्यम् )\* \* रङ्गरामानुजमुनिभिः अव्याख्यातत्वात् सायण भाष्यमेव दत्तम्।**॥श्रीः॥**

---

## Śaṅkara Bhāṣya editions — imported, not yet published (deferred)

**Status:** Deferred. Sources are imported and hash-validated but deliberately not published.

**Scope:** 44 Śaṅkara bhāṣya markdown files across 10 Upaniṣads
(`sankara-bhashya` for 9 Upaniṣads; `sankara-pada-bhashya` / `sankara-vakya-bhashya` for
Kena), imported via the advaita_sharada scraper. They are present in
`grantha-data/structured_md/upanishads/<text>/` but declared in no BUILD file and never
emitted into the explorer library.

**Why deferred:** Each Śaṅkara file shares its Upaniṣad's `grantha_id` — it is a second
commentary *edition*, not a standalone text. Publishing it requires:
- converting 7 single-edition Upaniṣads (aitareya, brihadaranyaka, chandogya, katha,
  mundaka, prashna, taittiriya) to multi-edition granthas (grantha-envelope +
  per-edition directories), and
- adding Śaṅkara as an edition to the 3 already-multi-edition texts (isavasya, mandukya,
  mandukya-karika).

This is the "mūla → Rāmānuja → Deśika" three-tier restructuring already planned
separately, and is out of scope for the current pass.

**Audit allowlist:** `scripts/tests/test_publishability_audit.py` treats any source
filename containing `-sankara-` as preserved-not-published, matching the Sāyaṇa /
śānti-vyākhyā precedent. When Śaṅkara publication is undertaken, remove those files from
the pattern and add BUILD declarations instead.

---

## 13. Folio sidebar performance with deep multi-part granthas (blocker for merge)

**Status:** ⚠️ **MUST be addressed before the Rāmāyaṇa work is merged.**

**Symptom:** the flow-mode slideout folio is slow to open/respond on the
`valmiki-ramayana` Bāla-kāṇḍa smoke test (75 parts, ~2000 verses + commentary).

**What was already fixed:**
- The initial eager load previously fetched **all 75 parts** because
  `loadGrantha` grouped by the coarse `part.id` (kāṇḍa `"1"` for every bala
  part). `lib/data.ts` now groups the eager fetch by the part's structural
  section (`dropLastRefComponent(first_ref)`), so only sarga 1.1 loads up
  front and the rest lazy-load on scroll.

**What remains (not yet diagnosed):** the folio is *still* slow even after the
eager-load fix, indicating a separate cost in the folio itself. Likely
candidates, in order of suspicion:
1. `FlowReaderFolio` builds the full outline tree (`getSidebarFlatModel` +
   `buildOutlineTree`) over every loaded passage on each render; with many
   sargas loaded this is O(n) per render and re-runs on scroll-state changes.
2. The scrollspy / scroll-follow accordion (`applyCurrent`,
   `scrollFolioToCurrent`) queries the DOM imperatively on every scroll event.
3. `computeInitialExpanded` / `sectionChain` recompute across the whole tree.
4. Lazy part loads interleave with folio re-renders, causing repeated full
   tree rebuilds.

**Action:** profile the folio with many sargas loaded (DevTools Performance),
then optimize — e.g. memoize the outline tree on `grantha.passages.length`
rather than re-deriving per render, defer `applyCurrent` DOM work, or
virtualize the folio strip. Do **not** merge the Rāmāyaṇa branch until the
folio interaction is responsive.
