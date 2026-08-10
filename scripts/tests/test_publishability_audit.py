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

from _build_parser import declared_markdown_files  # noqa: E402
from convert_structured_md import (  # noqa: E402
    _collect_source_files,
    _list_source_markdown_files,
)

_SCRIPT_DIR = pathlib.Path(__file__).parent.parent
_EXPLORER_ROOT = _SCRIPT_DIR.parent
_GRANTHA_DATA = _EXPLORER_ROOT.parent / "grantha-data" / "structured_md" / "upanishads"
_LIBRARY = _EXPLORER_ROOT / "public" / "data" / "library" / "upanishads"

# Text -> its grantha_id directory name in the library (flat single-edition).
_FLAT_TEXTS: dict[str, str] = {
    "aitareya": "aitareya-upanishad",
    "brihadaranyaka": "brihadaranyaka-upanishad",
    "chandogya": "chhandogya-upanishad",
    "katha": "katha-upanishad",
    "kaushitaki": "kaushitaki-upanishad",
    "kena": "kena-upanishad",
    "mundaka": "mundaka-upanishad",
    "prashna": "prashna-upanishad",
    "svetasvatara": "svetasvatara-upanishad",
    "taittiriya": "taittiriya-upanishad",
}

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

    def test_flat_texts_build_matches_published_parts(self) -> None:
        """For each flat text, BUILD-declared md files == published part count."""
        for text, grantha_dir in _FLAT_TEXTS.items():
            with self.subTest(text=text):
                build = _GRANTHA_DATA / text / "BUILD"
                self.assertTrue(build.exists(), f"{text}: BUILD missing")
                declared = declared_markdown_files(build.read_text(encoding="utf-8"))
                self.assertGreater(len(declared), 0, f"{text}: BUILD declares nothing")
                out_dir = _LIBRARY / text / grantha_dir
                part_files = sorted(p.name for p in out_dir.glob("part*.json"))
                self.assertEqual(
                    len(declared),
                    len(part_files),
                    f"{text}: BUILD declares {len(declared)} files but "
                    f"{len(part_files)} parts are published",
                )

    def test_flat_texts_no_stray_published_files(self) -> None:
        """Every non-SOURCE_ISSUES md in a source dir is either declared or a known preserved-not-published file."""
        for text in _FLAT_TEXTS:
            with self.subTest(text=text):
                src_dir = _GRANTHA_DATA / text
                build = src_dir / "BUILD"
                if not build.exists():
                    continue
                declared = declared_markdown_files(build.read_text(encoding="utf-8"))
                present = {p.name for p in src_dir.glob("*.md")}
                stray = present - declared - {"SOURCE_ISSUES.md"} - _PRESERVED_NOT_PUBLISHED
                self.assertEqual(
                    stray,
                    set(),
                    f"{text}: md files neither declared in BUILD nor a known "
                    f"preserved-not-published file: {stray}",
                )


if __name__ == "__main__":
    unittest.main()
