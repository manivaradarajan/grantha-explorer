"""Hermetic regeneration of grantha-explorer's public/data/library/.

This is the Bazel-owned replacement for the manual npm regeneration flow
(docs/DATA_FLOW.md §2). It runs the explorer's own converters
(``convert_structured_md`` for flat/multipart, ``import_editions`` for
multi-edition) over the grantha-data source tree provided as Bazel runfiles,
into a target library root.

Two entry points share this module:

- ``//data:materialize`` (``bazel run``): regenerate into the checkout's
  ``public/data/library/``. ``--library-root`` defaults to the workspace
  (via ``BUILD_WORKING_DIRECTORY``), so the committed tree is updated
  deliberately and then committed like the npm flow.
- ``//data:committed_in_sync`` (``bazel test``): regenerate into a temp root,
  run twice to prove determinism, then report the diff against the committed
  tree explicitly. Drift is *reported*, not gated (the committed library may
  legitimately lag the current bimap; see the parity test docs).

All inputs (grantha-data sources, the citation bimap, the converter's Python
deps) come from Bazel runfiles — no ``GRANTHA_DATA_TOOLS_LIB`` env hack, no
sys.path games. The grantha-data root is resolved via ``python.runfiles`` and
passed to the converters as ``--grantha-data-dir`` (a hard error if the bimap
is missing, never a silent references[] drop).
"""

from __future__ import annotations

import argparse
import filecmp
import os
import pathlib
import shutil
import sys
import tempfile
from typing import NoReturn, Sequence

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from convert_structured_md import (  # noqa: E402
    _set_grantha_data_dir,
    convert_grantha,
)
from import_editions import import_grantha  # noqa: E402


# ---------------------------------------------------------------------------
# Per-text regeneration table (mirrors README.md "Regenerating the JSON library")
# ---------------------------------------------------------------------------

# Multi-edition texts -> import_editions (source_rel, text_path, default_edition).
MULTI_EDITION: list[tuple[str, str, str]] = [
    ("upanishads/taittiriya", "upanishads/taittiriya", "taittiriya-upanishad"),
    ("upanishads/aitareya", "upanishads/aitareya", "aitareya-upanishad"),
    ("upanishads/brihadaranyaka", "upanishads/brihadaranyaka", "brihadaranyaka-upanishad"),
    ("upanishads/chandogya", "upanishads/chandogya", "chhandogya-upanishad"),
    ("upanishads/katha", "upanishads/katha", "katha-upanishad"),
    ("upanishads/kena", "upanishads/kena", "kena-upanishad"),
    ("upanishads/mundaka", "upanishads/mundaka", "mundaka-upanishad"),
    ("upanishads/prashna", "upanishads/prashna", "prashna-upanishad"),
    ("upanishads/isavasya", "upanishads/isavasya", "isavasya-upanishad-vedantadesika"),
]

# mandukya / mandukya-karika are co-located; import one grantha at a time.
MANDUKYA: list[tuple[str, str, str, str]] = [
    ("upanishads/mandukya", "upanishads/mandukya", "mandukya-upanishad-rangaramanuja", "mandukya-upanishad"),
    ("upanishads/mandukya", "upanishads/mandukya-karika", "mandukya-karika-bharadvajaramanujacharya", "mandukya-karika"),
]

# brahma-sutra uses the recursive edition discovery (source_dir has no md2json
# BUILD; one-level subdirs each carry a BUILD).
BRAHMA_SUTRA: tuple[str, str, str] = ("brahma-sutras", "brahma-sutra", "brahma-sutra-sribhashya")

# Flat + multipart single-edition texts -> convert_structured_md
# (source_rel_path, out_rel_path).
FLAT: list[tuple[str, str]] = [
    ("upanishads/kaushitaki", "upanishads/kaushitaki/kaushitaki-upanishad"),
    ("upanishads/svetasvatara", "upanishads/svetasvatara/svetasvatara-upanishad"),
    ("bhagavad-gita/bhagavad-gita", "bhagavad-gita/bhagavad-gita"),
    ("ramayana/valmiki-ramayana", "ramayana/valmiki-ramayana"),
    ("purana/vishnu-purana", "purana/vishnu-purana"),
    ("vedarthasangraha", "vedarthasangraha"),
]


def _grantha_data_root() -> pathlib.Path:
    """Resolve the grantha-data checkout root from Bazel runfiles.

    Under ``bazel run``/``bazel test`` the runfiles tree root is exported as
    ``RUNFILES_DIR`` (or ``TEST_SRCDIR``). The grantha-data external repo lives
    under a canonical name (``grantha_data+`` in this build); we locate it by
    scanning the runfiles root for a directory whose ``data/citation_bimap.yaml``
    exists. Fails loudly when the runfiles are missing.

    Returns:
        The grantha-data root Path.

    Raises:
        RuntimeError: When the runfiles bimap cannot be located.
    """
    runfiles_dir = os.environ.get("RUNFILES_DIR") or os.environ.get("TEST_SRCDIR")
    if runfiles_dir:
        root = pathlib.Path(runfiles_dir)
        candidates = sorted(root.glob("grantha_data*/data/citation_bimap.yaml"))
        if candidates:
            return candidates[0].parent.parent

    # Fallback: derive from the runfiles manifest (key ends with the bimap path).
    manifest = os.environ.get("RUNFILES_MANIFEST_FILE")
    if manifest:
        try:
            with open(manifest, encoding="utf-8") as fh:
                for line in fh:
                    key, _, target = line.rstrip("\n").partition(" ")
                    if key.endswith("data/citation_bimap.yaml") and target:
                        return pathlib.Path(target).parent.parent
        except OSError:
            pass

    raise RuntimeError(
        "runfiles: could not locate grantha_data/data/citation_bimap.yaml "
        "(is @grantha_data//data:data in the target's data, and is RUNFILES_DIR "
        "set?)"
    )


def _run_all(
    grantha_data_dir: pathlib.Path,
    library_root: pathlib.Path,
    grantha_explorer_root: pathlib.Path,
) -> None:
    """Regenerate the entire library under ``library_root``.

    Args:
        grantha_data_dir: The grantha-data checkout root (runfiles path).
        library_root: Where the library tree is written (checkout or temp).
        grantha_explorer_root: Explorer root for the DEFERRED.md side effect.
    """
    _set_grantha_data_dir(grantha_data_dir)
    structured_md = grantha_data_dir / "structured_md"

    print("=== multi-edition (import_editions) ===")
    for src_rel, text_path, default_edition in MULTI_EDITION:
        print(f"[import_editions] {src_rel} -> {text_path}")
        import_grantha(
            source_dir=structured_md / src_rel,
            library_root=library_root,
            text_path=text_path,
            default_edition=default_edition,
        )
    for src_rel, text_path, default_edition, grantha_id in MANDUKYA:
        print(f"[import_editions] {src_rel} (grantha {grantha_id}) -> {text_path}")
        import_grantha(
            source_dir=structured_md / src_rel,
            library_root=library_root,
            text_path=text_path,
            default_edition=default_edition,
            grantha_ids=[grantha_id],
        )
    src_rel, text_path, default_edition = BRAHMA_SUTRA
    print(f"[import_editions] {src_rel} (recursive) -> {text_path}")
    import_grantha(
        source_dir=structured_md / src_rel,
        library_root=library_root,
        text_path=text_path,
        default_edition=default_edition,
    )

    print("=== flat/multipart (convert_structured_md) ===")
    for src_rel, out_rel in FLAT:
        print(f"[convert_structured_md] {src_rel} -> {out_rel}")
        convert_grantha(
            source_dir=structured_md / src_rel,
            out_dir=library_root / out_rel,
            grantha_explorer_root=grantha_explorer_root,
        )


def _diff_trees(a: pathlib.Path, b: pathlib.Path) -> list[str]:
    """Return a human-readable list of differences between two trees.

    Ignores ``references-report.json`` (the gitignored reference diagnostics
    the converter writes; not part of the committed library contract).

    Args:
        a: First tree root.
        b: Second tree root.

    Returns:
        A list of diff descriptions (empty when identical).
    """
    diffs: list[str] = []

    def _files(root: pathlib.Path) -> set[pathlib.Path]:
        return {
            p.relative_to(root)
            for p in root.rglob("*")
            if p.is_file() and p.name != "references-report.json"
        }

    a_files, b_files = _files(a), _files(b)
    for rel in sorted(a_files | b_files):
        ap, bp = a / rel, b / rel
        if not ap.exists():
            diffs.append(f"only in b: {rel}")
        elif not bp.exists():
            diffs.append(f"only in a: {rel}")
        elif not filecmp.cmp(ap, bp, shallow=False):
            diffs.append(f"differ: {rel}")
    return diffs


def _materialize(
    library_root: pathlib.Path,
    grantha_data_dir: pathlib.Path | None,
) -> None:
    """Run the full regeneration.

    Args:
        library_root: Target library root (checkout or temp).
        grantha_data_dir: Optional explicit grantha-data root (else runfiles).
    """
    gd = grantha_data_dir or _grantha_data_root()
    explorer_root = pathlib.Path(
        os.environ.get("BUILD_WORKING_DIRECTORY") or pathlib.Path(__file__).resolve().parent.parent
    )
    library_root.mkdir(parents=True, exist_ok=True)
    _run_all(gd, library_root, explorer_root)


def _verify(committed_root: pathlib.Path, grantha_data_dir: pathlib.Path) -> NoReturn:
    """Regenerate twice into temp dirs, assert determinism, report drift.

    Args:
        committed_root: The committed ``public/data/library`` tree.
        grantha_data_dir: The grantha-data root.

    Returns:
        Never returns (raises SystemExit).
    """
    explorer_root = committed_root.parent
    with tempfile.TemporaryDirectory() as td:
        run1 = pathlib.Path(td) / "run1"
        run2 = pathlib.Path(td) / "run2"
        _run_all(grantha_data_dir, run1, explorer_root)
        _run_all(grantha_data_dir, run2, explorer_root)

        drift = _diff_trees(run1, run2)
        if drift:
            print("NON-DETERMINISTIC regeneration — run1 != run2:")
            for line in drift:
                print(f"  {line}")
            raise SystemExit(1)
        print(f"DETERMINISM OK — two fresh runs byte-identical ({len(list(run1.rglob('*')))} files)")

        committed_vs_fresh = _diff_trees(committed_root, run1)
        if committed_vs_fresh:
            print("\nCOMMITTED vs FRESH drift (reported, not gated):")
            print("  The committed library differs from a fresh regeneration.")
            print("  Expected when sources/bimap changed since the last")
            print("  deliberate `bazel run //data:materialize` + commit.")
            for line in committed_vs_fresh[:50]:
                print(f"  {line}")
            if len(committed_vs_fresh) > 50:
                print(f"  ... and {len(committed_vs_fresh) - 50} more")
        else:
            print("\nCOMMITTED tree matches a fresh regeneration exactly.")
    raise SystemExit(0)


def _build_arg_parser() -> argparse.ArgumentParser:
    """Build the CLI parser."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--library-root",
        type=pathlib.Path,
        default=None,
        help="Where to write the library tree (default: the workspace's "
        "public/data/library via BUILD_WORKING_DIRECTORY).",
    )
    parser.add_argument(
        "--grantha-data-dir",
        type=pathlib.Path,
        default=None,
        help="Explicit grantha-data root (default: resolved from runfiles).",
    )
    return parser


def main() -> None:
    """Dispatch on how the module is invoked."""
    parser = _build_arg_parser()
    args = parser.parse_args()

    gd = args.grantha_data_dir or _grantha_data_root()

    if args.library_root is not None:
        # Explicit target root: regenerate there (also used by the drift check
        # via --verify-against, handled by the test driver calling _verify).
        _materialize(args.library_root, gd)
        print("Done.")
        return

    # bazel run //data:materialize: write into the checkout.
    workspace = pathlib.Path(
        os.environ.get("BUILD_WORKING_DIRECTORY")
        or pathlib.Path(__file__).resolve().parent.parent
    )
    library_root = workspace / "public" / "data" / "library"
    _materialize(library_root, gd)
    print(f"Materialized {library_root}")


if __name__ == "__main__":
    main()
