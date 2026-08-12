# Grantha JSON Schemas — Read-Only Mirrors

The three schema files in this directory:

- `grantha.schema.json`
- `grantha-envelope.schema.json`
- `grantha-part.schema.json`

are **read-only mirrors** of the canonical, version-controlled originals in the
**grantha-data** repository:

```
grantha-data/formats/schemas/
```

## Never edit these files

Do **not** edit `grantha*.schema.json` in this repository. A coding agent (or
human) must never modify them here. They exist only so the explorer's build
tools (`scripts/validate-data.ts`, `scripts/validate_data.py`) can validate
against a local copy without depending on a `grantha-data` checkout at build
time.

## Edits go to the master

All schema changes — enum widening, new fields, new `kind` discriminators,
`additionalProperties` policy — must be made in **grantha-data** at
`formats/schemas/`, which is the semver-versioned source of truth
(`VERSION`, `CHANGELOG.md`, `docs/VERSIONING.md`). After editing the master,
the copies here must be re-synced to byte-identical mirrors:

```bash
cp ../grantha-data/formats/schemas/grantha.schema.json          ./grantha.schema.json
cp ../grantha-data/formats/schemas/grantha-envelope.schema.json ./grantha-envelope.schema.json
cp ../grantha-data/formats/schemas/grantha-part.schema.json     ./grantha-part.schema.json
```

Then update `schema_version` references in the library data if the schema
version changed.

## Why

grantha-data is the producer and owns the semver/release system for both data
and schemas (`docs/VERSIONING.md`). grantha-explorer is the consumer. If these
files drift from the master, data the producer emits (e.g. flat single-file
granthas, multi-part envelopes) can fail or silently pass the consumer's
validation — the exact class of bug the `kind` discriminator was introduced to
prevent.

## Checklist for an agent working on schema-adjacent code

- [ ] If a change requires a schema edit, did you edit **grantha-data** and re-sync these mirrors (not edit here)?
- [ ] Did you bump `schema_version` in grantha-data per semver (breaking → MAJOR)?
- [ ] Did you re-run `scripts/validate-data.ts` in this repo after re-syncing?
- [ ] Did you confirm the 80 existing library files still validate (control case) before changing anything?
