"""Tests for the BUILD-gated publication model.

Covers two guarantees of the Option B design:

- ``_list_source_markdown_files`` returns only BUILD-declared sources when a
  BUILD exists, falling back to ``_NON_SOURCE_MD_FILES`` otherwise.
- A corpus audit: for every real text in grantha-data, the BUILD-declared
  source set maps 1:1 to the published library output (no tracked-but-published
  file, no missing part).

The corpus audit reads grantha-data and the explorer library.  It is skipped
when either tree is absent so the test suite stays hermetic in CI without the
sibling repository.
"""

from __future__ import annotations

import pathlib
import sys
import unittest

# Allow importing from the parent scripts directory.
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

from _build_parser import declared_markdown_files, parse_build_rules  # noqa: E402
from convert_structured_md import (  # noqa: E402
    _collect_source_files,
    _list_source_markdown_files,
)

_SCRIPT_DIR = pathlib.Path(__file__).parent.parent
_EXPLORER_ROOT = _SCRIPT_DIR.parent
_GRANTHA_DATA = _EXPLORER_ROOT.parent / "grantha-data" / "structured_md" / "upanishads"
_LIBRARY = _EXPLORER_ROOT / "public" / "data" / "library" / "upanishads"

# Files that are deliberately tracked-but-not-published: present in the source
# directory, absent from the BUILD, and never emitted into the library.  They
# are preserved as seeds for future editions.
_PRESERVED_NOT_PUBLISHED = frozenset(
    {
        "aitareya-upanishad-sayana-01-01.md",
        "brihadaranyaka-upanishad-shanti-vyakhya-01-01.md",
        "isavasya-upanishad-shanti-vyakhya-01-01.md",
        "mandukya-upanishad-shanti-vyakhya-01-01.md",
    }
)


def _is_preserved_not_published(name: str) -> bool:
    """Return True for files exempt from the BUILD-declared publication gate.

    Args:
        name: A source filename (e.g. "katha-upanishad-sankara-bhashya-01.md").

    Returns:
        True when the file is a known preserved-not-published file: listed in
        _PRESERVED_NOT_PUBLISHED (sayana / shanti-vyakhya seeds).
    """
    return name in _PRESERVED_NOT_PUBLISHED


class TestCollectSourceFiles(unittest.TestCase):
    """BUILD-gated publication discovery in the flat converter path."""

    def setUp(self) -> None:
        import tempfile

        self._tmp = tempfile.TemporaryDirectory()
        self._dir = pathlib.Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _write(self, rel: str, content: str = "") -> None:
        p = self._dir / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")

    def _frontmatter(self, part_num: int) -> str:
        return (
            "---\n"
            "grantha_id: g\n"
            f"part_num: {part_num}\n"
            "---\n"
        )

    def test_build_gate_excludes_undeclared(self) -> None:
        """Files present but not in the BUILD are not returned."""
        self._write("a.md", self._frontmatter(1))
        self._write("b.md", self._frontmatter(2))
        self._write(
            "BUILD",
            'grantha_md2json_multipart(\n'
            '    name = "md2json",\n'
            '    grantha_id = "g",\n'
            '    markdown_files = ["a.md"],\n'
            ')\n',
        )
        result = _collect_source_files(self._dir)
        self.assertEqual([p.name for p in result], ["a.md"])

    def test_build_gate_keeps_all_declared_in_part_order(self) -> None:
        """All declared files are returned, ordered by part_num."""
        self._write("c.md", self._frontmatter(3))
        self._write("a.md", self._frontmatter(1))
        self._write("b.md", self._frontmatter(2))
        self._write(
            "BUILD",
            'grantha_md2json_multipart(\n'
            '    name = "md2json",\n'
            '    grantha_id = "g",\n'
            '    markdown_files = ["b.md", "c.md", "a.md"],\n'
            ')\n',
        )
        result = _collect_source_files(self._dir)
        self.assertEqual([p.name for p in result], ["a.md", "b.md", "c.md"])

    def test_fallback_without_build(self) -> None:
        """Without a BUILD, all non-content .md files are candidates."""
        self._write("a.md", self._frontmatter(1))
        self._write("SOURCE_ISSUES.md")
        result = _collect_source_files(self._dir)
        self.assertEqual([p.name for p in result], ["a.md"])

    def test_empty_declared_falls_back(self) -> None:
        """A BUILD with no md2json rules falls back to all non-content .md files."""
        self._write("a.md", self._frontmatter(1))
        self._write("BUILD", "filegroup(name='x')\n")
        result = _collect_source_files(self._dir)
        self.assertEqual([p.name for p in result], ["a.md"])

    def test_all_declared_files_missing_raises(self) -> None:
        """A BUILD declaring only absent files raises FileNotFoundError."""
        self._write("a.md", self._frontmatter(1))
        self._write(
            "BUILD",
            'grantha_md2json_multipart(\n'
            '    name = "md2json",\n'
            '    grantha_id = "g",\n'
            '    markdown_files = ["missing.md"],\n'
            ')\n',
        )
        with self.assertRaises(FileNotFoundError):
            _collect_source_files(self._dir)

    def test_pure_discovery_excludes_only_noncontent(self) -> None:
        """_list_source_markdown_files is pure discovery (no BUILD gate)."""
        self._write("a.md")
        self._write("SOURCE_ISSUES.md")
        self._write("BUILD", "")
        result = _list_source_markdown_files(self._dir)
        self.assertEqual([p.name for p in result], ["a.md"])


@unittest.skipUnless(
    _GRANTHA_DATA.is_dir() and _LIBRARY.is_dir(),
    "grantha-data and/or the explorer library are not present",
)
class TestPublishabilityAudit(unittest.TestCase):
    """Corpus audit: BUILD-declared sources match published parts."""

    _MANDUKYA_KARIKA_ID_PREFIX = "mandukya-karika-"
    _MANDUKYA_KARIKA_DIR = "mandukya-karika"

    def _published_edition_dir(self, text: str, grantha_id: str) -> pathlib.Path:
        """Return the library directory where a BUILD grantha_id's edition lives.

        Flat single-edition texts publish directly under
        ``upanishads/<text>/<grantha_id>/``. Multi-edition texts publish each
        edition under ``upanishads/<text>/<edition_id>/`` (same path convention
        since ``edition_id == grantha_id`` for the base edition). The one
        exception is mandukya-karika, whose BUILD rules live in the mandukya
        dir but whose editions publish under ``upanishads/mandukya-karika/``.

        Args:
            text: The source text directory name (e.g. "taittiriya").
            grantha_id: The BUILD rule's grantha_id (edition identity).

        Returns:
            The published edition directory, whether or not it exists.
        """
        if grantha_id.startswith(self._MANDUKYA_KARIKA_ID_PREFIX):
            return _LIBRARY / self._MANDUKYA_KARIKA_DIR / grantha_id
        return _LIBRARY / text / grantha_id

    def test_build_declared_matches_published_parts(self) -> None:
        """Every BUILD grantha_id's edition dir has a matching part count."""
        for text in sorted(p.name for p in _GRANTHA_DATA.iterdir() if p.is_dir()):
            with self.subTest(text=text):
                build = _GRANTHA_DATA / text / "BUILD"
                if not build.exists():
                    continue
                rules = parse_build_rules(build.read_text(encoding="utf-8"))
                self.assertGreater(len(rules), 0, f"{text}: BUILD declares nothing")
                for grantha_id, files in rules.items():
                    edition_dir = self._published_edition_dir(text, grantha_id)
                    part_files = sorted(p.name for p in edition_dir.glob("part*.json"))
                    self.assertEqual(
                        len(files),
                        len(part_files),
                        f"{text}/{grantha_id}: BUILD declares {len(files)} "
                        f"files but {len(part_files)} parts are published",
                    )

    def test_no_stray_published_files(self) -> None:
        """Every non-SOURCE_ISSUES md in a source dir is either declared or a known preserved-not-published file."""
        for text in sorted(p.name for p in _GRANTHA_DATA.iterdir() if p.is_dir()):
            with self.subTest(text=text):
                src_dir = _GRANTHA_DATA / text
                build = src_dir / "BUILD"
                if not build.exists():
                    continue
                declared = declared_markdown_files(build.read_text(encoding="utf-8"))
                present = {p.name for p in src_dir.glob("*.md")}
                preserved = {
                    n for n in present if _is_preserved_not_published(n)
                }
                stray = (
                    present - declared - {"SOURCE_ISSUES.md"} - preserved
                )
                self.assertEqual(
                    stray,
                    set(),
                    f"{text}: md files neither declared in BUILD nor a known "
                    f"preserved-not-published file: {stray}",
                )


if __name__ == "__main__":
    unittest.main()
