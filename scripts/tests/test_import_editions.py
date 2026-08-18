"""Tests for ``scripts/import_editions.py`` filter flags.

Covers two behaviors introduced for the Śaṅkara-edition ingestion:

- ``--exclude-editions``: fnmatch exclusion of editions before grouping,
  including the ``< 2``-edition skip interaction.
- ``--grantha-id``: exact grantha filter for co-located granthas
  (mandukya + mandukya-karika).
"""

from __future__ import annotations

import json
import pathlib
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

# Allow importing from the parent scripts directory.
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

from import_editions import (  # noqa: E402
    _group_editions_into_granthas,
    import_grantha,
)


def _write_md_fixture(
    root: Path,
    name: str,
    grantha_id: str,
    part_num: int = 1,
) -> None:
    """Write a minimal source .md fixture with a single main passage.

    Args:
        root: The directory to write into.
        name: The source filename.
        grantha_id: The frontmatter grantha_id.
        part_num: The frontmatter part_num (default 1).
    """
    (root / name).write_text(
        "---\n"
        f"grantha_id: {grantha_id}\n"
        f"part_num: {part_num}\n"
        "canonical_title: t\n"
        "text_type: upanishad\n"
        "structure_levels:\n"
        "- key: Mantra\n"
        "  scriptNames:\n"
        "    devanagari: मन्त्रः\n"
        "---\n"
        f"# Mantra 1.{part_num}\n\n"
        "<!-- sanskrit:devanagari -->\nॐ\n<!-- /sanskrit:devanagari -->\n",
        encoding="utf-8",
    )


def _write_source(root: Path, rules_text: str) -> None:
    """Write a BUILD file into a fixture source directory.

    Args:
        root: The directory to write into.
        rules_text: The BUILD file contents.
    """
    (root / "BUILD").write_text(rules_text, encoding="utf-8")


def _json_load(path: Path) -> dict[str, Any]:
    """Load a JSON file as a dict.

    Args:
        path: Path to the JSON file.

    Returns:
        The parsed JSON object.
    """
    with open(path, encoding="utf-8") as f:
        return json.load(f)


class TestExcludeEditions(unittest.TestCase):
    """The importer's --exclude-editions filter."""

    def test_grouping_does_not_apply_exclusion(self) -> None:
        """_group_editions_into_granthas is NOT where exclusion happens.

        Exclusion is applied to the ``editions`` dict in ``import_grantha``
        before grouping; grouping itself is untouched by the filter.
        """
        editions = {
            "taittiriya-upanishad": [Path("a.md")],
            "taittiriya-upanishad-sankara-bhashya": [Path("b.md")],
        }
        frontmatter = {
            "a.md": {"grantha_id": "taittiriya-upanishad"},
            "b.md": {"grantha_id": "taittiriya-upanishad"},
        }
        granthas = _group_editions_into_granthas(editions, frontmatter)
        self.assertEqual(
            granthas,
            {
                "taittiriya-upanishad": [
                    "taittiriya-upanishad",
                    "taittiriya-upanishad-sankara-bhashya",
                ]
            },
        )

    def test_import_grantha_excludes_sankara_edition(self) -> None:
        """--exclude-editions '*sankara*' drops the Śaṅkara edition."""
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "src"
            lib = Path(tmp) / "lib"
            src.mkdir()
            _write_source(
                src,
                'grantha_md2json_multipart(\n'
                '    name = "base",\n'
                '    grantha_id = "taittiriya-upanishad",\n'
                '    markdown_files = ["a.md", "b.md"],\n'
                ')\n'
                'grantha_md2json_multipart(\n'
                '    name = "sankara",\n'
                '    grantha_id = "taittiriya-upanishad-sankara-bhashya",\n'
                '    markdown_files = ["c.md"],\n'
                ')\n',
            )
            for name, pid, pnum in [
                ("a.md", "taittiriya-upanishad", 1),
                ("b.md", "taittiriya-upanishad", 2),
                ("c.md", "taittiriya-upanishad", 1),
            ]:
                _write_md_fixture(src, name, pid, pnum)

            import_grantha(
                source_dir=src,
                library_root=lib,
                text_path="upanishads/taittiriya",
                default_edition="taittiriya-upanishad",
                exclude_editions=["*sankara*"],
            )
            # With Sankara excluded, only one edition remains → the grantha is
            # skipped (importer requires >= 2 editions), so nothing is written.
            self.assertFalse((lib / "upanishads" / "taittiriya").exists())

    def test_exclude_keeps_two_edition_grantha(self) -> None:
        """A grantha with 3 editions excluding 1 still publishes 2."""
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "src"
            lib = Path(tmp) / "lib"
            src.mkdir()
            _write_source(
                src,
                'grantha_md2json_single(\n'
                '    name = "vd",\n'
                '    grantha_id = "isavasya-upanishad-vedantadesika",\n'
                '    markdown_file = "a.md",\n'
                ')\n'
                'grantha_md2json_single(\n'
                '    name = "sankara",\n'
                '    grantha_id = "isavasya-upanishad-sankara-bhashya",\n'
                '    markdown_file = "b.md",\n'
                ')\n'
                'grantha_md2json_single(\n'
                '    name = "srivatsa",\n'
                '    grantha_id = "isavasya-upanishad-srivatsanarayana",\n'
                '    markdown_file = "c.md",\n'
                ')\n',
            )
            for name, pid, pnum in [
                ("a.md", "isavasya-upanishad", 1),
                ("b.md", "isavasya-upanishad", 1),
                ("c.md", "isavasya-upanishad", 1),
            ]:
                _write_md_fixture(src, name, pid, pnum)

            import_grantha(
                source_dir=src,
                library_root=lib,
                text_path="upanishads/isavasya",
                default_edition="isavasya-upanishad-vedantadesika",
                exclude_editions=["*sankara*"],
            )
            envelope = _json_load(lib / "upanishads" / "isavasya" / "envelope.json")
            editions = [e["edition_id"] for e in envelope["editions"]]
            self.assertEqual(
                editions,
                [
                    "isavasya-upanishad-vedantadesika",
                    "isavasya-upanishad-srivatsanarayana",
                ],
            )


class TestGranthaIdFilter(unittest.TestCase):
    """The importer's --grantha-id exact filter (co-located granthas)."""

    def _write_fixture(self, root: Path) -> None:
        _write_source(
            root,
            'grantha_md2json_single(\n'
            '    name = "rangaramanuja",\n'
            '    grantha_id = "mandukya-upanishad-rangaramanuja",\n'
            '    markdown_file = "a.md",\n'
            ')\n'
            'grantha_md2json_single(\n'
            '    name = "kuranarayana",\n'
            '    grantha_id = "mandukya-upanishad-kuranarayana",\n'
            '    markdown_file = "c.md",\n'
            ')\n'
            'grantha_md2json_single(\n'
            '    name = "karika",\n'
            '    grantha_id = "mandukya-karika-bharadvajaramanujacharya",\n'
            '    markdown_file = "b.md",\n'
            ')\n',
        )
        for name, pid in [
            ("a.md", "mandukya-upanishad"),
            ("b.md", "mandukya-karika"),
            ("c.md", "mandukya-upanishad"),
        ]:
            _write_md_fixture(root, name, pid)

    def test_grantha_id_exact_match_imports_only_upanishad(self) -> None:
        """--grantha-id mandukya-upanishad imports only the upanishad grantha."""
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "src"
            lib = Path(tmp) / "lib"
            src.mkdir()
            self._write_fixture(src)

            import_grantha(
                source_dir=src,
                library_root=lib,
                text_path="upanishads/mandukya",
                default_edition="mandukya-upanishad-rangaramanuja",
                grantha_ids=["mandukya-upanishad"],
            )
            envelope = _json_load(lib / "upanishads" / "mandukya" / "envelope.json")
            editions = [e["edition_id"] for e in envelope["editions"]]
            self.assertEqual(
                editions,
                [
                    "mandukya-upanishad-rangaramanuja",
                    "mandukya-upanishad-kuranarayana",
                ],
            )
            self.assertEqual(
                envelope["editions"][0].get("isDefault"),
                True,
                "default edition is rangaramanuja",
            )

    def test_grantha_id_prefix_does_not_match(self) -> None:
        """--grantha-id mandukya matches nothing (exact, not prefix)."""
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "src"
            lib = Path(tmp) / "lib"
            src.mkdir()
            self._write_fixture(src)

            with self.assertRaises(RuntimeError):
                import_grantha(
                    source_dir=src,
                    library_root=lib,
                    text_path="upanishads/mandukya",
                    default_edition="mandukya-upanishad-rangaramanuja",
                    grantha_ids=["mandukya"],
                )


if __name__ == "__main__":
    unittest.main()
