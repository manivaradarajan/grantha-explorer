from __future__ import annotations

import json
import pathlib
import warnings
from typing import Any
from jsonschema import Draft7Validator, RefResolver

warnings.filterwarnings('ignore', category=DeprecationWarning)


def _load_schemas(root: pathlib.Path) -> tuple[dict, dict]:
    """Load all root schema files and build a URI store for cross-file $ref resolution.

    Returns:
        A tuple of (schemas_by_key, store_by_uri) where store_by_uri is passed
        to RefResolver so that refs like grantha-envelope.schema.json#/definitions/...
        resolve correctly.
    """
    schema_paths = {
        'grantha':  root / 'grantha.schema.json',
        'envelope': root / 'grantha-envelope.schema.json',
        'part':     root / 'grantha-part.schema.json',
    }
    schemas = {k: json.loads(p.read_text()) for k, p in schema_paths.items()}
    store   = {p.as_uri(): schemas[k] for k, p in schema_paths.items()}
    return schemas, store, schema_paths


def _make_resolver(schema_key: str, schema_paths: dict, schemas: dict, store: dict) -> RefResolver:
    """Build a RefResolver anchored to the given schema file."""
    return RefResolver(
        base_uri=schema_paths[schema_key].as_uri(),
        referrer=schemas[schema_key],
        store=store,
    )


_VALID_KINDS: frozenset[str] = frozenset({
    'grantha-envelope',
    'edition-sub-envelope',
    'grantha-part',
    'grantha',
})

# Pinned classification (mirrors lib/data.ts KNOWN_PASSAGE_KINDS). Any kind
# found in the corpus without an entry here is a build error (per-block
# presentation model).
_KNOWN_PASSAGE_KINDS: frozenset[str] = frozenset({
    'Para', 'Gadya', 'Shloka', 'Mantra', 'Verse', 'Sutra',
})

_VALID_EDITION_KINDS: frozenset[str] = frozenset({'mula-only', 'commentarial'})


def _has_commentary(obj: dict[str, Any]) -> bool:
    """True when a part/edition carries a commentary (singular or plural)."""
    commentary = obj.get('commentary')
    commentaries = obj.get('commentaries')
    if isinstance(commentary, dict) and commentary:
        return True
    return isinstance(commentaries, list) and len(commentaries) > 0


def _check_passage_kinds(data: dict[str, Any]) -> list[str]:
    """Per-block kind invariants: main passages carry a classified `kind`;
    framing passages carry none. (Per-block presentation model.)"""
    errs: list[str] = []
    for key in ('passages', 'prefatory_material', 'concluding_material'):
        arr = data.get(key)
        if not isinstance(arr, list):
            continue
        for passage in arr:
            if not isinstance(passage, dict):
                continue
            ref = passage.get('ref', '?')
            if passage.get('passage_type') == 'main':
                kind = passage.get('kind')
                if kind not in _KNOWN_PASSAGE_KINDS:
                    errs.append(
                        f'[kind] main passage {ref} has unclassified kind {kind!r}'
                    )
            elif passage.get('kind') is not None:
                errs.append(
                    f'[kind] framing passage {ref} must not carry kind '
                    f'(got {passage.get("kind")!r})'
                )
    return errs


def _check_edition_kind_coherence(lib: pathlib.Path) -> list[str]:
    """Cross-file edition-kind coherence: every edition carries a stamped
    `edition_kind`, a mula-only edition has a commentary in no part, and a
    commentarial edition has a commentary in at least one part (a uniform drop
    now fails against the committed stamp). A commentarial edition may have an
    individual commentary-free part (e.g. a sarga whose whole text is one
    un-glossed passage). (Per-block presentation model.)"""
    errs: list[str] = []
    for path in sorted(lib.rglob('*.json')):
        data = json.loads(path.read_text())
        kind = _classify(data, path)
        if kind == 'edition-sub-envelope':
            label = data.get('edition_id') or path.parent.name
            stamp = data.get('edition_kind')
            if stamp not in _VALID_EDITION_KINDS:
                errs.append(
                    f'[edition_kind] edition {label} missing/invalid '
                    f'edition_kind {stamp!r}'
                )
                continue
            parts = data.get('parts')
            if not isinstance(parts, list):
                continue
            any_part_has_commentary = False
            for part in parts:
                if not isinstance(part, dict) or not part.get('file'):
                    continue
                part_path = path.parent / part['file']
                if not part_path.exists():
                    continue
                part_data = json.loads(part_path.read_text())
                has = _has_commentary(part_data)
                if stamp == 'mula-only' and has:
                    errs.append(
                        f'[edition_kind] mula-only edition {label} part '
                        f'{part["file"]} has a commentary'
                    )
                any_part_has_commentary = any_part_has_commentary or has
            if stamp == 'commentarial' and not any_part_has_commentary:
                errs.append(
                    f'[edition_kind] commentarial edition {label} has '
                    f'commentary in no part'
                )
        elif kind == 'grantha':
            label = data.get('edition_id') or data.get('grantha_id') or '?'
            stamp = data.get('edition_kind')
            if stamp not in _VALID_EDITION_KINDS:
                errs.append(
                    f'[edition_kind] edition {label} missing/invalid '
                    f'edition_kind {stamp!r}'
                )
                continue
            expected = 'commentarial' if _has_commentary(data) else 'mula-only'
            if stamp != expected:
                errs.append(
                    f'[edition_kind] edition {label} edition_kind {stamp} '
                    f'mismatches commentary presence ({expected})'
                )
    return errs


def _classify(data: dict[str, Any], path: pathlib.Path | None = None) -> str | None:
    """Return the file's explicit kind marker, or None to skip the file.

    Args:
        data: Parsed JSON content of the file.
        path: Unused; retained for call-site compatibility.

    Returns:
        The ``kind`` value if it is a recognised library file type, else None.
    """
    kind = data.get('kind')
    return kind if kind in _VALID_KINDS else None


def _validate_file(
    path: pathlib.Path,
    lib: pathlib.Path,
    schemas: dict,
    schema_paths: dict,
    store: dict,
) -> list[str]:
    """Validate a single file and return a list of error strings (empty = pass)."""
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as e:
        return [f'JSON parse error: {e}']

    kind = _classify(data, path)
    if kind is None:
        return []

    if kind == 'grantha-envelope':
        schema = schemas['envelope']
        resolver = _make_resolver('envelope', schema_paths, schemas, store)
    elif kind == 'edition-sub-envelope':
        schema = schemas['envelope']['definitions']['edition_sub_envelope']
        resolver = _make_resolver('envelope', schema_paths, schemas, store)
    elif kind == 'grantha-part':
        schema = schemas['part']
        resolver = _make_resolver('part', schema_paths, schemas, store)
    else:  # grantha
        schema = schemas['grantha']
        resolver = _make_resolver('grantha', schema_paths, schemas, store)

    validator = Draft7Validator(schema, resolver=resolver)
    errors = sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path))
    schema_msgs = [
        f'[{" > ".join(str(p) for p in e.absolute_path) or "(root)"}] {e.message[:150]}'
        for e in errors
    ]

    # Per-block presentation checks (content files only).
    if kind in ('grantha', 'grantha-part'):
        schema_msgs.extend(_check_passage_kinds(data))

    return schema_msgs


def main() -> None:
    """Validate all grantha data files in public/data/library/ against the root schemas."""
    root = pathlib.Path(__file__).parent.parent
    lib  = root / 'public' / 'data' / 'library'

    schemas, store, schema_paths = _load_schemas(root)

    pass_count = 0
    fail_count = 0

    for path in sorted(lib.rglob('*.json')):
        rel = str(path.relative_to(lib))
        errors = _validate_file(path, lib, schemas, schema_paths, store)
        if errors:
            fail_count += 1
            print(f'FAIL  {rel}')
            for msg in errors:
                print(f'      {msg}')
        else:
            pass_count += 1

    total = pass_count + fail_count
    print()
    print(f'=== {pass_count} PASS  {fail_count} FAIL  ({total} files scanned) ===')

    # Edition-kind coherence is a cross-file check, run once over the library.
    for msg in _check_edition_kind_coherence(lib):
        fail_count += 1
        print(f'FAIL  {msg}')

    if fail_count == 0:
        print('All data files are valid.')
    else:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
