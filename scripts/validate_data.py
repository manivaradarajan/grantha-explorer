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
    return [
        f'[{" > ".join(str(p) for p in e.absolute_path) or "(root)"}] {e.message[:150]}'
        for e in errors
    ]


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
    if fail_count == 0:
        print('All data files are valid.')


if __name__ == '__main__':
    main()
