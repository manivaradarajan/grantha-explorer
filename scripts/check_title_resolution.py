"""Check that every grantha in the generated index has a resolvable Devanagari title.

Title resolution uses two sources, in priority order:

1. ``title_deva`` in ``public/data/generated/granthas.json`` (populated by the
   generator from ``granthas-meta.json``).  This is the value the runtime reads.
2. ``title.devanagari`` in ``public/data/granthas-meta.json`` (the canonical
   source the generator reads from).  Absent entries here will produce an empty
   ``title_deva`` in the generated index after the next generator run.

``canonical_title`` on edition ``envelope.json`` files is NOT a valid runtime
resolution path as of schema v1.0.0; that field has been removed from the
envelope format (brihadaranyaka title bug, 2026-08-06).

Usage::

    python3 scripts/check_title_resolution.py [--lib-root PATH]

Exit code 0 = all granthas resolve; 1 = at least one failure.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def _load_dict(path: Path) -> dict[str, object]:
    """Load a JSON file that must be a top-level object.

    Args:
        path: Absolute path to a JSON file.

    Returns:
        Parsed JSON object.

    Raises:
        SystemExit: If the file is missing, not valid JSON, or not an object.
    """
    if not path.exists():
        print(f"ERROR: required file not found: {path}", file=sys.stderr)
        sys.exit(1)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"ERROR: JSON parse failure in {path}: {exc}", file=sys.stderr)
        sys.exit(1)
    if not isinstance(data, dict):
        print(f"ERROR: expected JSON object in {path}", file=sys.stderr)
        sys.exit(1)
    return data


def _load_generated_index(lib_root: Path) -> list[dict[str, object]]:
    """Return the list of grantha entries from the generated index.

    Args:
        lib_root: Root of the grantha-explorer repository.

    Returns:
        List of grantha entry dicts, each with at least an ``id`` key.
    """
    path = lib_root / "public" / "data" / "generated" / "granthas.json"
    data = _load_dict(path)
    granthas = data.get("granthas")
    if not isinstance(granthas, list):
        print(f"ERROR: missing or non-list 'granthas' key in {path}", file=sys.stderr)
        sys.exit(1)
    return granthas


def _load_meta(lib_root: Path) -> dict[str, dict[str, object]]:
    """Return the granthas-meta.json mapping keyed by grantha_id.

    Args:
        lib_root: Root of the grantha-explorer repository.

    Returns:
        Dict mapping grantha_id strings to their metadata objects.
    """
    path = lib_root / "public" / "data" / "granthas-meta.json"
    data = _load_dict(path)
    # Each value must be a dict; cast is safe because the file schema enforces it.
    return {k: v for k, v in data.items() if isinstance(v, dict)}  # type: ignore[misc]


# ---------------------------------------------------------------------------
# Resolution logic
# ---------------------------------------------------------------------------

def _resolve_title_deva(
    grantha_id: str,
    index_entry: dict[str, object],
    meta: dict[str, dict[str, object]],
) -> tuple[str | None, str]:
    """Determine whether a Devanagari title can be resolved for a grantha.

    Checks the generated index first (runtime source), then granthas-meta.json
    (generator source).

    Args:
        grantha_id: The grantha identifier string.
        index_entry: The entry for this grantha in the generated index.
        meta: The full granthas-meta.json mapping.

    Returns:
        A tuple ``(title_or_none, source_label)`` where *source_label* is
        ``"index"``, ``"meta"``, or ``"NONE"`` indicating where the value was
        found (or not found).
    """
    # Source 1: title_deva in the generated index (what the runtime reads).
    title_deva = str(index_entry.get("title_deva", "")).strip()
    if title_deva:
        return title_deva, "index"

    # Source 2: granthas-meta.json.
    meta_entry = meta.get(grantha_id, {})
    title_field = meta_entry.get("title")
    # title_field may be explicitly null in JSON even when the key is present.
    meta_deva = str((title_field or {}).get("devanagari", "")).strip()  # type: ignore[union-attr]
    if meta_deva:
        return meta_deva, "meta"

    return None, "NONE"


# ---------------------------------------------------------------------------
# Result collection and reporting
# ---------------------------------------------------------------------------

def _collect_results(
    granthas: list[dict[str, object]],
    meta: dict[str, dict[str, object]],
) -> tuple[list[str], list[str]]:
    """Evaluate title resolution for every grantha and collect outcomes.

    Args:
        granthas: Grantha entries from the generated index.
        meta: granthas-meta.json mapping.

    Returns:
        A tuple ``(failures, warnings)`` where each element is a list of
        human-readable message strings.
    """
    failures: list[str] = []
    warnings: list[str] = []

    for entry in granthas:
        grantha_id = str(entry.get("id", "<unknown>"))
        title, source = _resolve_title_deva(grantha_id, entry, meta)

        if title is None:
            failures.append(
                f"  FAIL  {grantha_id}: no title_deva in index, "
                f"no title.devanagari in granthas-meta.json"
            )
        elif source == "meta":
            # title_deva absent from index but recoverable from meta; the
            # generated index needs to be regenerated to sync.
            warnings.append(
                f"  WARN  {grantha_id}: title_deva absent from generated index "
                f"but present in granthas-meta.json ({repr(title)}); "
                f"regenerate the index to sync."
            )
        else:
            print(f"  ok    {grantha_id}: {repr(title)}")

    return failures, warnings


def run_check(lib_root: Path) -> int:
    """Check title resolution for all granthas in the generated index.

    Args:
        lib_root: Root of the grantha-explorer repository.

    Returns:
        Exit code: 0 if all granthas resolve, 1 if any fail.
    """
    granthas = _load_generated_index(lib_root)
    meta = _load_meta(lib_root)
    failures, warnings = _collect_results(granthas, meta)

    for msg in warnings:
        print(msg, file=sys.stderr)
    for msg in failures:
        print(msg, file=sys.stderr)

    if failures:
        print(
            f"\nResult: {len(failures)} FAILURE(s), {len(warnings)} WARNING(s)",
            file=sys.stderr,
        )
        return 1

    if warnings:
        print(f"\nResult: 0 failures, {len(warnings)} WARNING(s)", file=sys.stderr)
        return 0

    print(f"\nResult: all {len(granthas)} granthas resolve — OK")
    return 0


def main() -> None:
    """Entry point for the title-resolution check."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--lib-root",
        type=Path,
        default=Path(__file__).parent.parent,
        help="Root of the grantha-explorer repo (default: parent of scripts/).",
    )
    args = parser.parse_args()
    sys.exit(run_check(args.lib_root))


if __name__ == "__main__":
    main()
