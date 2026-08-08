"""Add the explicit 'kind' discriminator field to all library JSON files.

Also back-fills ``schema_version: "0.1.0"`` onto v0.1.0 flat files that
currently omit it (the 5 isavasya and mandukya flat files).

Usage:
    # Dry-run — print classification without writing:
    python3 scripts/migrate_add_kind.py --dry-run

    # Write — insert fields and report diff summary:
    python3 scripts/migrate_add_kind.py --write

The script aborts before writing any file if the observed distribution of
kinds does not match the expected counts.
"""

from __future__ import annotations

__all__ = ["run_migration"]

import argparse
import json
import pathlib
import sys
from collections import Counter
from typing import Any


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

LIBRARY_ROOT = (
    pathlib.Path(__file__).parent.parent / "public" / "data" / "library"
)

# Expected distribution — abort before writing if actual counts diverge.
EXPECTED_COUNTS: dict[str, int] = {
    "grantha-envelope": 2,
    "edition-sub-envelope": 10,
    "grantha-part": 55,
    "grantha": 5,
}

# v0.1.0 flat files lack schema_version; we add it at the same time as kind.
FALLBACK_SCHEMA_VERSION = "0.1.0"


# ---------------------------------------------------------------------------
# Classification (duck-typing, used only by this migration script)
# ---------------------------------------------------------------------------


def _classify_file(data: dict[str, Any], path: pathlib.Path) -> str | None:
    """Classify a library JSON file by field-presence (duck-typing).

    This function is intentionally used only by this one-time migration
    script.  After migration, all files carry an explicit ``kind`` field and
    the validators use that directly.

    Args:
        data: Parsed JSON content.
        path: Filesystem path (used to detect sibling envelope.json).

    Returns:
        One of 'grantha-envelope', 'edition-sub-envelope', 'grantha-part',
        'grantha', or None if the file should be skipped.
    """
    if "editions" in data:
        return "grantha-envelope"
    if "parts" in data and "passages" not in data:
        return "edition-sub-envelope"
    if "passages" in data and "part_num" in data:
        sibling = path.parent / "envelope.json"
        if sibling.exists():
            try:
                env = json.loads(sibling.read_text())
                parts = env.get("parts")
                part_files = (
                    [
                        p.get("file", "") if isinstance(p, dict) else p
                        for p in parts
                    ]
                    if isinstance(parts, list)
                    else []
                )
                if path.name in part_files:
                    return "grantha-part"
            except json.JSONDecodeError as exc:
                print(
                    f"WARNING: malformed sibling envelope at {sibling}: {exc}",
                    file=sys.stderr,
                )
    if "passages" in data or "grantha_id" in data:
        return "grantha"
    return None


# ---------------------------------------------------------------------------
# Field injection
# ---------------------------------------------------------------------------


def _inject_kind(data: dict[str, Any], kind: str) -> dict[str, Any]:
    """Return a new ordered dict with 'kind' (and 'schema_version' if missing).

    'kind' is inserted as the very first key so it appears at the top of the
    serialised file, immediately before 'schema_version'.

    Args:
        data: Parsed JSON content of the file.
        kind: The kind value to inject.

    Returns:
        New dict with 'kind' (and optionally 'schema_version') prepended.
    """
    result: dict[str, Any] = {"kind": kind}

    # Back-fill schema_version for v0.1.0 flat files that omit it.
    if "schema_version" not in data:
        result["schema_version"] = FALLBACK_SCHEMA_VERSION

    # Copy remaining keys preserving original order.
    result.update(data)
    return result


# ---------------------------------------------------------------------------
# Migration helpers
# ---------------------------------------------------------------------------


def _collect_files() -> list[pathlib.Path]:
    """Return all .json files under the library root, sorted."""
    return sorted(LIBRARY_ROOT.rglob("*.json"))


def _validate_distribution(counts: Counter[str]) -> list[str]:
    """Return a list of error messages if counts diverge from expectations.

    Args:
        counts: Observed classification counter to validate against
            EXPECTED_COUNTS.

    Returns:
        Empty list when the distribution matches; one message per mismatch.
    """
    errors: list[str] = []
    for kind, expected in EXPECTED_COUNTS.items():
        actual = counts.get(kind, 0)
        if actual != expected:
            errors.append(f"  {kind}: expected {expected}, got {actual}")
    skipped = counts.get("(skipped)", 0)
    if skipped:
        errors.append(f"  (skipped): {skipped} files not classified")
    return errors


def _report_distribution(counts: Counter[str]) -> None:
    """Print the observed classification distribution to stdout.

    Args:
        counts: Observed classification counter from the scan phase.
    """
    print("Classification distribution:")
    for kind_label in (
        "grantha-envelope",
        "edition-sub-envelope",
        "grantha-part",
        "grantha",
    ):
        print(f"  {kind_label}: {counts.get(kind_label, 0)}")
    if counts.get("(skipped)"):
        print(f"  (skipped): {counts['(skipped)']}")
    classified_total = sum(v for k, v in counts.items() if k != "(skipped)")
    print(f"  Total classified: {classified_total}")


def _write_files(
    plan: list[tuple[pathlib.Path, dict[str, Any], str]],
) -> tuple[int, int]:
    """Write kind (and schema_version) into each planned file.

    Args:
        plan: List of (path, data, kind) tuples to process.

    Returns:
        Tuple of (files_written, files_already_correct).
    """
    written = 0
    already_correct = 0
    for path, data, kind in plan:
        if data.get("kind") == kind:
            already_correct += 1
            continue
        updated = _inject_kind(data, kind)
        path.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n")
        written += 1
    return written, already_correct


# ---------------------------------------------------------------------------
# Migration runner
# ---------------------------------------------------------------------------


def run_migration(write: bool) -> int:
    """Classify all files, validate distribution, and optionally write.

    Args:
        write: If True, write updated files. If False, dry-run only.

    Returns:
        Exit code: 0 on success, 1 on error.
    """
    files = _collect_files()
    counts: Counter[str] = Counter()
    plan: list[tuple[pathlib.Path, dict[str, Any], str]] = []

    for path in files:
        try:
            data = json.loads(path.read_text())
        except json.JSONDecodeError as exc:
            print(f"ERROR  JSON parse error in {path}: {exc}", file=sys.stderr)
            return 1

        kind = _classify_file(data, path)
        if kind is None:
            counts["(skipped)"] += 1
            continue

        counts[kind] += 1
        plan.append((path, data, kind))

    _report_distribution(counts)

    distribution_errors = _validate_distribution(counts)
    if distribution_errors:
        print("\nABORT: Distribution mismatch — no files written.", file=sys.stderr)
        for msg in distribution_errors:
            print(msg, file=sys.stderr)
        return 1

    print("\nDistribution matches expectations.")

    if not write:
        print("\nDry-run complete. Pass --write to apply changes.")
        return 0

    written, already_correct = _write_files(plan)
    print(
        f"\nWrite complete: {written} files updated, "
        f"{already_correct} already had correct kind."
    )
    return 0


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def _build_arg_parser() -> argparse.ArgumentParser:
    """Build the CLI argument parser."""
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--dry-run",
        action="store_true",
        dest="dry_run",
        help="Classify and validate distribution without writing any files.",
    )
    mode.add_argument(
        "--write",
        action="store_true",
        dest="write",
        help="Write kind (and schema_version if missing) to all classified files.",
    )
    return parser


def main() -> None:
    """Parse arguments and run the migration."""
    parser = _build_arg_parser()
    args = parser.parse_args()
    sys.exit(run_migration(write=args.write))


if __name__ == "__main__":
    main()
