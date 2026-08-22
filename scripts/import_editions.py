"""Import multi-edition grantha data from grantha-data structured_md sources.

Derives the edition-directory layout (grantha-level envelope + per-edition
envelope + part files) used by grantha-explorer directly from a
``structured_md/<text>`` source directory. The source directory's BUILD file
is the authoritative edition declaration (grantha_id per markdown file); all
other per-edition metadata (commentator, commentary_title, structure levels,
mula text) is derived from each source file's YAML frontmatter and body. No
hand-maintained manifest is required.

Edition files not declared in the BUILD are skipped with a warning — the
BUILD is the publication gate, so half-finished sources (e.g. mandukya's
shanti-vyakhya) are never silently published.

Usage:
    python3 scripts/import_editions.py \\
        --source /path/to/grantha-data/structured_md/upanishads/isavasya \\
        --library-root public/data/library \\
        --text-path upanishads/isavasya \\
        --default-edition isavasya-upanishad-vedantadesika
"""

from __future__ import annotations

__all__ = [
    "parse_build_rules",
    "edition_id_for_file",
    "discover_editions",
    "import_grantha",
]

import argparse
import fnmatch
import json
import re
from pathlib import Path
from typing import Any

import _build_parser
import grantha_data_bootstrap

grantha_data_bootstrap.ensure_grantha_data_importable()

from convert_structured_md import (
    _first_main_ref,
    _list_source_markdown_files,
    _resolve_target_commentary_ids,
    build_envelope_json,
    build_part_json,
    normalize_structure_levels,
    parse_body,
    parse_frontmatter,
    passage_kinds_for,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SCHEMA_VERSION = "1.4.0"

_FILENAME_SUFFIX_RE = re.compile(r"(-\d+)+\.md$")

_DEFAULT_MARKER_NAME = ".default"


# ---------------------------------------------------------------------------
# BUILD parsing
# ---------------------------------------------------------------------------

def parse_build_rules(build_text: str) -> dict[str, list[str]]:
    """Parse a structured_md BUILD file's md2json rules.

    Args:
        build_text: Contents of a source directory's BUILD file.

    Returns:
        Mapping from edition_id (the BUILD ``grantha_id``) to the ordered list
        of markdown source filenames belonging to that edition.
    """
    return _build_parser.parse_build_rules(build_text)


def edition_id_for_file(filename: str) -> str:
    """Derive an edition_id from a structured_md filename.

    Strips the trailing numeric part-number suffix, e.g.
    ``isavasya-upanishad-srivatsanarayana-01.md`` →
    ``isavasya-upanishad-srivatsanarayana``.

    Args:
        filename: Base filename of a structured_md source file.

    Returns:
        The derived edition_id.
    """
    return _FILENAME_SUFFIX_RE.sub("", filename)


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------

def _invert_build_rules(build_rules: dict[str, list[str]]) -> dict[str, str]:
    """Invert the BUILD mapping into filename -> edition_id.

    Args:
        build_rules: Mapping from edition_id to source filenames.

    Returns:
        Mapping from source filename to edition_id.
    """
    lookup: dict[str, str] = {}
    for edition_id, files in build_rules.items():
        for filename in files:
            lookup[filename] = edition_id
    return lookup


def _discover_flat(
    source_dir: Path,
    build_rules: dict[str, list[str]] | None = None,
) -> tuple[dict[str, list[Path]], dict[str, dict[str, Any]], list[str]]:
    """Group one directory's .md files into editions (flat BUILD mode).

    The BUILD file's edition -> file mapping is authoritative. Files on disk
    not declared in the BUILD are skipped (they are not part of the release).
    If the directory has no BUILD (or one declaring no md2json rules),
    editions are derived from filenames (safe only for single-file-per-edition
    directories).

    Args:
        source_dir: A structured_md directory containing .md files and
            optionally a BUILD file.
        build_rules: Already-parsed BUILD rules, when the caller has them
            (avoids re-reading and re-parsing the BUILD file). When None, the
            BUILD is read and parsed here.

    Returns:
        Tuple of (edition_id -> ordered source Paths, filename -> parsed
        frontmatter dict, list of skipped-but-present filenames).
    """
    source_files = _list_source_markdown_files(source_dir)
    if build_rules is None:
        build_path = source_dir / "BUILD"
        build_rules = (
            parse_build_rules(build_path.read_text(encoding="utf-8"))
            if build_path.exists()
            else {}
        )
    rule_lookup = _invert_build_rules(build_rules)

    frontmatter_by_name: dict[str, dict[str, Any]] = {}
    editions: dict[str, list[Path]] = {}
    skipped: list[str] = []

    for path in source_files:
        frontmatter, _ = parse_frontmatter(path)
        frontmatter_by_name[path.name] = frontmatter

        if rule_lookup:
            edition_id = rule_lookup.get(path.name)
            if edition_id is None:
                skipped.append(path.name)
                continue
        else:
            edition_id = edition_id_for_file(path.name)

        editions.setdefault(edition_id, []).append(path)

    for edition_id, files in editions.items():
        files.sort(key=lambda p: frontmatter_by_name[p.name].get("part_num", 0))

    return editions, frontmatter_by_name, skipped


def _edition_subdirectories(source_dir: Path) -> list[Path]:
    """Return one-level subdirectories that each carry a BUILD file.

    Only one level of nesting is considered (``source_dir/*/BUILD``); deeper
    layouts are out of scope for the multi-edition source layout.

    Args:
        source_dir: The structured_md directory for a text.

    Returns:
        Sorted list of subdirectory paths that each contain a BUILD file.
    """
    return sorted(
        d for d in source_dir.iterdir() if d.is_dir() and (d / "BUILD").exists()
    )


def discover_editions(
    source_dir: Path,
) -> tuple[dict[str, list[Path]], dict[str, dict[str, Any]], list[str]]:
    """Group source .md files into editions.

    Two layouts are supported:

    - **Flat (backward compatible):** the source directory's own BUILD declares
      the edition -> file mapping (e.g. ``upanishads/isavasya/BUILD``). Used
      whenever that BUILD declares md2json rules.
    - **Recursive (per-edition subdirectories):** the source directory has no
      md2json BUILD rules and contains no top-level ``.md`` content files, but
      has one-level subdirectories each carrying a BUILD (e.g.
      ``brahma-sutras/{sribhashya,vedanta-sara,vedanta-deepam}/``). Each
      subdirectory's BUILD declares its edition (its ``grantha_id`` is the
      edition_id); all declared ``.md`` files across subdirectories are
      aggregated into ``editions[edition_id]``.

    ``frontmatter_by_name`` is keyed by ``path.name``, so edition source
    filenames must be unique across subdirectories (true for the brahma-sutra
    editions, which use ``<commentary>-NN-NN.md`` prefixes).

    Args:
        source_dir: The structured_md directory for a text.

    Returns:
        Tuple of (edition_id -> ordered source Paths, filename -> parsed
        frontmatter dict, list of skipped-but-present filenames).
    """
    build_path = source_dir / "BUILD"
    if build_path.exists():
        build_rules = parse_build_rules(build_path.read_text(encoding="utf-8"))
        if build_rules:
            return _discover_flat(source_dir, build_rules)

    # A directory with its own .md files is a flat layout even when its BUILD
    # declares no md2json rules (a gate-only filegroup like brahma-sutras/BUILD,
    # or no BUILD at all) — subdirectories that happen to carry a BUILD are not
    # consulted. The recursive layout is signalled explicitly by the absence of
    # top-level content files.
    if _list_source_markdown_files(source_dir):
        return _discover_flat(source_dir)

    subdirs = _edition_subdirectories(source_dir)
    if subdirs:
        editions: dict[str, list[Path]] = {}
        frontmatter_by_name: dict[str, dict[str, Any]] = {}
        skipped: list[str] = []
        for subdir in subdirs:
            sub_editions, sub_front, sub_skipped = _discover_flat(subdir)
            for edition_id, files in sub_editions.items():
                if edition_id in editions:
                    print(
                        f"  WARNING: edition_id '{edition_id}' declared in "
                        f"multiple subdirectories; merging source files"
                    )
                editions.setdefault(edition_id, []).extend(files)
            for name, frontmatter in sub_front.items():
                if name in frontmatter_by_name:
                    print(
                        f"  WARNING: source file '{name}' present in multiple "
                        f"subdirectories; later frontmatter wins"
                    )
                frontmatter_by_name[name] = frontmatter
            skipped.extend(sub_skipped)
        return editions, frontmatter_by_name, skipped

    return _discover_flat(source_dir)


# ---------------------------------------------------------------------------
# Edition / grantha writing
# ---------------------------------------------------------------------------

def _resolve_default_edition(
    source_dir: Path,
    edition_ids: list[str],
    cli_default: str | None,
) -> str:
    """Pick the default edition for a grantha.

    Precedence: ``--default-edition`` flag, then a ``.default`` marker file in
    the source directory, then the first edition alphabetically. The CLI flag
    is only honoured when it names an edition of this grantha; otherwise it
    falls through to the marker/alphabetical chain (the flag may target a
    different grantha co-located in the same source directory).

    Args:
        source_dir: The structured_md source directory (for the marker file).
        edition_ids: All edition_ids for the grantha.
        cli_default: Value of the --default-edition flag, if any.

    Returns:
        The selected default edition_id.
    """
    if cli_default and cli_default in edition_ids:
        return cli_default
    marker = source_dir / _DEFAULT_MARKER_NAME
    if marker.exists():
        value = marker.read_text(encoding="utf-8").strip()
        if value in edition_ids:
            return value
        print(f"  WARNING: .default marker '{value}' not in {edition_ids}")
    return sorted(edition_ids)[0]


def _group_editions_into_granthas(
    editions: dict[str, list[Path]],
    frontmatter_by_name: dict[str, dict[str, Any]],
) -> dict[str, list[str]]:
    """Group edition_ids into granthas by identity.

    An edition belongs to the grantha identified by its files' frontmatter
    ``grantha_id`` when the edition_id equals that id or extends it with "-".
    Otherwise (e.g. a co-located grantha whose edition_id does not extend the
    upanishad's grantha_id) the edition is its own grantha. Example: the
    mandukya karika files carry ``grantha_id: mandukya-karika``, so they group
    under ``mandukya-karika`` even though they share the mandukya source dir.

    Args:
        editions: Mapping from edition_id to source files.
        frontmatter_by_name: Parsed frontmatter per filename.

    Returns:
        Mapping from grantha_id to its edition_ids (alphabetical).
    """
    granthas: dict[str, list[str]] = {}
    for edition_id, files in editions.items():
        frontmatter_grantha_id = frontmatter_by_name[files[0].name]["grantha_id"]
        grantha_id = (
            frontmatter_grantha_id
            if edition_id == frontmatter_grantha_id
            or edition_id.startswith(f"{frontmatter_grantha_id}-")
            else edition_id
        )
        granthas.setdefault(grantha_id, []).append(edition_id)
    for edition_ids in granthas.values():
        edition_ids.sort()
    return granthas


def _edition_stub_meta(frontmatter: dict[str, Any]) -> dict[str, Any]:
    """Build the commentator/commentary_title fields for an edition stub.

    Args:
        frontmatter: Frontmatter of the edition's first source file.

    Returns:
        Dict with ``commentator`` and ``commentary_title`` keys.
    """
    commentaries_meta: list[dict[str, Any]] | None = frontmatter.get(
        "commentaries_metadata"
    )
    if commentaries_meta:
        meta = commentaries_meta[0]
        return {
            "commentary_title": meta.get("commentary_title", ""),
            "commentator": meta.get("commentator", {}),
        }
    return {
        "commentary_title": frontmatter.get("canonical_title", ""),
        "commentator": {"devanagari": ""},
    }


def _write_edition(
    source_dir: Path,
    files: list[Path],
    edition_id: str,
    out_dir: Path,
) -> None:
    """Convert one edition's source files into part JSON + a sub-envelope.

    Args:
        source_dir: The structured_md source directory.
        files: Ordered list of source files for this edition.
        edition_id: The edition_id to stamp on the output.
        out_dir: Destination directory for the edition (created as needed).
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    parts_info: list[dict[str, str]] = []
    first_frontmatter: dict[str, Any] | None = None
    structure_levels_raw: list[dict[str, Any]] | None = None
    diagnostics: list[dict[str, Any]] = []

    for idx, src_path in enumerate(files, start=1):
        frontmatter, body_text = parse_frontmatter(src_path)
        heading_kinds, leaf_kinds = passage_kinds_for(frontmatter)
        body = parse_body(
            body_text,
            passage_kinds=heading_kinds,
            leaf_kinds=leaf_kinds,
        )
        if first_frontmatter is None:
            first_frontmatter = frontmatter
            structure_levels_raw = frontmatter.get("structure_levels", [])
        target_cids = _resolve_target_commentary_ids(frontmatter)
        diag_start = len(diagnostics)
        part_json = build_part_json(
            frontmatter, body, edition_id, target_cids, diagnostics
        )
        for diag in diagnostics[diag_start:]:
            diag["source_file"] = src_path.name
        part_path = out_dir / f"part{idx}.json"
        part_path.write_text(
            json.dumps(part_json, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        parts_info.append({"file": f"part{idx}.json", "first_ref": _first_main_ref(body)})
        print(f"    {src_path.name} -> {part_path.name}")

    if first_frontmatter is None or structure_levels_raw is None:
        raise RuntimeError(f"Edition {edition_id} produced no source files")
    normalized_levels = normalize_structure_levels(structure_levels_raw)
    envelope = build_envelope_json(
        parts_info, normalized_levels, first_frontmatter, edition_id=edition_id
    )
    (out_dir / "envelope.json").write_text(
        json.dumps(envelope, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    if diagnostics:
        report = {
            "grantha_id": first_frontmatter["grantha_id"],
            "edition_id": edition_id,
            "reference_diagnostics": diagnostics,
        }
        (out_dir / "references-report.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        errors = sum(1 for d in diagnostics if d["severity"] == "error")
        print(
            f"    references-report.json: {errors} error(s), "
            f"{len(diagnostics) - errors} warning(s)"
        )


def _write_grantha_envelope(
    out_path: Path,
    grantha_id: str,
    first_frontmatter: dict[str, Any],
    editions_meta: list[dict[str, Any]],
) -> None:
    """Write a grantha-level envelope carrying the editions array.

    Args:
        out_path: Destination envelope.json path.
        grantha_id: The grantha_id.
        first_frontmatter: Frontmatter of the grantha's first source file.
        editions_meta: Edition stubs (edition_id, path, commentator, title).
    """
    envelope: dict[str, Any] = {
        "kind": "grantha-envelope",
        "schema_version": SCHEMA_VERSION,
        "grantha_id": grantha_id,
        "canonical_title": first_frontmatter["canonical_title"],
        "text_type": first_frontmatter["text_type"],
        "language": first_frontmatter.get("language", "sanskrit"),
        "editions": editions_meta,
    }
    out_path.write_text(
        json.dumps(envelope, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

def import_grantha(
    source_dir: Path,
    library_root: Path,
    text_path: str,
    default_edition: str | None = None,
    exclude_editions: list[str] | None = None,
    grantha_ids: list[str] | None = None,
) -> None:
    """Derive and write edition data for one structured_md source directory.

    Args:
        source_dir: The structured_md directory for a text.
        library_root: Root of the explorer's data library directory.
        text_path: Library-relative path for this text (e.g. "upanishads/isavasya").
        default_edition: Edition_id to mark as default, if any.
        exclude_editions: Optional fnmatch patterns against edition_id; editions
            matching any pattern are dropped before grouping. Defaults to
            ``None`` (no exclusions).
        grantha_ids: Optional exact grantha_id filters. Only granthas whose id
            equals one of these values are imported. Defaults to ``None``
            (no restriction).

    Raises:
        RuntimeError: If no editions are discovered, every edition is
            excluded, or no grantha matches ``--grantha-id``.
    """
    source_dir = source_dir.resolve()
    library_root = library_root.resolve()
    dest_dir = library_root / text_path

    editions, frontmatter_by_name, skipped = discover_editions(source_dir)
    if not editions:
        raise RuntimeError(f"No source editions discovered in {source_dir}")
    for filename in skipped:
        print(f"  SKIP (not declared in BUILD): {filename}")

    if exclude_editions:
        # Iterate a sorted snapshot so in-place deletion during iteration is
        # safe.
        for edition_id in sorted(editions):
            if any(
                fnmatch.fnmatch(edition_id, pat) for pat in exclude_editions
            ):
                print(f"  EXCLUDE (--exclude-editions): {edition_id}")
                del editions[edition_id]
        if not editions:
            raise RuntimeError(
                f"All editions excluded in {source_dir} by "
                f"--exclude-editions ({exclude_editions}); nothing to import."
            )

    granthas = _group_editions_into_granthas(editions, frontmatter_by_name)
    if grantha_ids:
        # Iterate a sorted snapshot so in-place deletion during iteration is
        # safe.
        for grantha_id in sorted(granthas):
            if grantha_id not in grantha_ids:
                print(f"  SKIP (--grantha-id): {grantha_id}")
                del granthas[grantha_id]
        if not granthas:
            raise RuntimeError(
                f"No granthas matched --grantha-id ({grantha_ids}) in "
                f"{source_dir}."
            )
    for grantha_id, edition_ids in granthas.items():
        # Single-edition granthas are published as flat single-file editions
        # (e.g. mandukya-karika), not as edition directories. Leave them
        # untouched — they are not part of the multi-edition directory layout
        # this importer derives.
        if len(edition_ids) < 2:
            print(f"  SKIP (single-edition grantha): {grantha_id} — "
                  "not part of this text's edition set")
            continue

        default = _resolve_default_edition(source_dir, edition_ids, default_edition)
        print(f"grantha {grantha_id}: editions={edition_ids} default={default}")

        # Emit the default edition first so the dropdown opens on it, then the
        # remaining editions in canonical (alphabetical) order. The grouping
        # above keeps edition_ids alphabetical; only the display order changes.
        ordered_ids = [default] + [e for e in edition_ids if e != default]

        editions_meta: list[dict[str, Any]] = []
        for edition_id in ordered_ids:
            files = editions[edition_id]
            edition_dir = dest_dir / edition_id
            _write_edition(source_dir, files, edition_id, edition_dir)
            first_frontmatter = frontmatter_by_name[files[0].name]
            stub: dict[str, Any] = {
                "edition_id": edition_id,
                "path": f"{text_path}/{edition_id}",
                **_edition_stub_meta(first_frontmatter),
            }
            if edition_id == default:
                stub["isDefault"] = True
            editions_meta.append(stub)

        # All granthas reaching here have >= 2 editions, so a grantha-level
        # envelope is always warranted.
        first_frontmatter = frontmatter_by_name[
            editions[ordered_ids[0]][0].name
        ]
        _write_grantha_envelope(
            dest_dir / "envelope.json",
            grantha_id,
            first_frontmatter,
            editions_meta,
        )
        print(f"  grantha envelope written to {dest_dir / 'envelope.json'}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _build_arg_parser() -> argparse.ArgumentParser:
    """Build and return the CLI argument parser."""
    parser = argparse.ArgumentParser(
        description="Derive multi-edition grantha JSON from structured_md sources.",
    )
    parser.add_argument(
        "--source",
        required=True,
        type=Path,
        help="structured_md source directory for one text (e.g. .../upanishads/isavasya).",
    )
    parser.add_argument(
        "--library-root",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "public/data/library",
        help="Root of public/data/library (defaults to the repo's library dir).",
    )
    parser.add_argument(
        "--text-path",
        required=True,
        help="Library-relative path for this text, e.g. 'upanishads/isavasya'.",
    )
    parser.add_argument(
        "--default-edition",
        default=None,
        help="Edition_id to mark isDefault. Falls back to a .default marker file, "
        "then to the first edition alphabetically.",
    )
    parser.add_argument(
        "--exclude-editions",
        default=None,
        action="append",
        metavar="PATTERN",
        help="fnmatch pattern against edition_id to exclude (repeatable). "
        "e.g. --exclude-editions '*sankara*'.",
    )
    parser.add_argument(
        "--grantha-id",
        default=None,
        action="append",
        metavar="ID",
        help="Exact grantha_id to import (repeatable). Only granthas whose id "
        "equals a value are imported; useful for co-located grantha dirs "
        "(e.g. --grantha-id mandukya-upanishad).",
    )
    return parser


def main() -> None:
    """Parse CLI arguments and run the import."""
    parser = _build_arg_parser()
    args = parser.parse_args()

    if not args.source.is_dir():
        parser.error(f"--source is not a directory: {args.source}")

    import_grantha(
        source_dir=args.source,
        library_root=args.library_root,
        text_path=args.text_path,
        default_edition=args.default_edition,
        exclude_editions=args.exclude_editions,
        grantha_ids=args.grantha_id,
    )
    print("Done.")


if __name__ == "__main__":
    main()
