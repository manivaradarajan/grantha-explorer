# Deferred work — new-grantha-data branch

Items deliberately left open as of the schema v1.0.0 checkpoint (eb217e4).
Update this file when an item is addressed or re-scoped.

---

## 1. editions[] in the generated index format

`scripts/generate-granthas-json.ts` now operates in hybrid mode: it reads
grantha-level `envelope.json` files where present (isavasya, mandukya) and
falls back to `granthas-meta.json` for all other texts. The generated index
(`public/data/generated/granthas.json`) still emits one flat entry per
`grantha_id` — it does not expose `editions[]` to the runtime.

Adding `editions[]` to the index format is deferred until `loadGrantha` in
`lib/data.ts` has edition-selection logic to consume it.

---

## 2. mandukya-karika grantha-level envelope

`mandukya-karika-bharadvajaramanujacharya.json` is a single-edition grantha
that currently falls through to the flat-file scanner path (the scanner picks
it up as a sibling `.json` inside the mandukya grantha-level envelope
directory). No `envelope.json` with `editions[]` has been authored for it.

Needed when a second edition of the Karika is added.

---

## 3. Edition-resolution logic not implemented in loadGrantha

The schema supports `isDefault` on edition stubs and the convention that
`edition_id == grantha_id` for single-edition granthas, but `loadGrantha`
in `lib/data.ts` has no edition-resolution logic. There is no user →
`isDefault` → convention fallback chain yet.

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
