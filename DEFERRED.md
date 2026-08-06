# Deferred work — new-grantha-data branch

Items deliberately left open as of the schema v1.0.0 checkpoint (eb217e4).
Update this file when an item is addressed or re-scoped.

---

## 1. Scanner doesn't know about the new schema

`scripts/generate-granthas-json.ts` has not been touched. It still reads
grantha-level metadata from `granthas-meta.json` rather than from
`grantha-envelope.schema.json`-shaped envelope files. It has no concept of
`editions[]`, `edition_stub`, or multi-edition collision resolution.

Blocked until grantha-level `envelope.json` files exist for all texts.

---

## 2. Edition-resolution logic not implemented in loadGrantha

The schema supports `isDefault` on edition stubs and the convention that
`edition_id == grantha_id` for single-edition granthas, but `loadGrantha`
in `lib/data.ts` has no edition-resolution logic. There is no user →
`isDefault` → convention fallback chain yet.

---

## 3. No grantha-level envelope.json files except brihadaranyaka

Brihadaranyaka got a runtime fix (`canonical_title` fallback via `??` in
`lib/data.ts:331–333`) rather than a general solution. All other texts still
lack a grantha-level `envelope.json`. The general migration — one file per
text, replacing the current `granthas-meta.json` lookup — is unscoped.

---

## 4. alignsWith is reserved but unpopulated

`alignsWith: ["string", "null"]` is defined on `passage` in
`grantha.schema.json` for future cross-edition concordance. No data file
populates it yet, and no UI or API reads it. Revisit when concordance
feature is designed.

---

## 5. structure_levels duplication TODO (pre-existing)

`lib/data.ts:234` has a TODO comment: structure_levels are currently
duplicated across `envelope.json` and each `part*.json`. They should live
only in the envelope. Pre-dates this session; unaddressed.

---

## 6. title_iast data quality in granthas-meta.json (pre-existing)

`granthas-meta.json` stores plain romanizations (e.g. "Brihadaranyaka
Upanishad") in the `iast` field rather than proper IAST with diacritics.
The generator writes these directly to the index as `title_iast`. Pre-dates
this session; unscoped.
