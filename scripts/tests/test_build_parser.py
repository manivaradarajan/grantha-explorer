"""Tests for ``_build_parser``: shared BUILD-file publication-gate parsing.

The BUILD file is the authoritative publication gate for both the flat
converter and the multi-edition importer.  ``parse_build_rules`` maps each
``grantha_id`` to its declared markdown files; ``declared_markdown_files`` is
the union across all rules — the set of publishable sources for a directory.
"""

from __future__ import annotations

import pathlib
import sys
import unittest

# Allow importing from the parent scripts directory.
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

from _build_parser import declared_markdown_files, parse_build_rules  # noqa: E402


class TestParseBuildRules(unittest.TestCase):
    """Parse md2json rules from BUILD text."""

    def test_single_rule(self) -> None:
        """A ``grantha_md2json_single`` rule maps one file to its grantha_id."""
        build = (
            'load("//tools/bazel:grantha_converter.bzl", "grantha_md2json_single")\n'
            'grantha_md2json_single(\n'
            '    name = "md2json",\n'
            '    grantha_id = "kena-upanishad",\n'
            '    markdown_file = "kena-upanishad-rangaramanuja.md",\n'
            ')\n'
        )
        self.assertEqual(parse_build_rules(build), {"kena-upanishad": ["kena-upanishad-rangaramanuja.md"]})

    def test_multipart_rule(self) -> None:
        """A ``grantha_md2json_multipart`` rule maps an ordered file list."""
        build = (
            'grantha_md2json_multipart(\n'
            '    name = "md2json",\n'
            '    grantha_id = "katha-upanishad",\n'
            '    markdown_files = [\n'
            '        "katha-upanishad-rangaramanuja-01-01.md",\n'
            '        "katha-upanishad-rangaramanuja-02-01.md",\n'
            '    ],\n'
            ')\n'
        )
        self.assertEqual(
            parse_build_rules(build),
            {
                "katha-upanishad": [
                    "katha-upanishad-rangaramanuja-01-01.md",
                    "katha-upanishad-rangaramanuja-02-01.md",
                ]
            },
        )

    def test_multiple_rules_same_build(self) -> None:
        """A BUILD with several rules (mandukya) maps each grantha_id."""
        build = (
            'grantha_md2json_single(\n'
            '    name = "rangaramanuja",\n'
            '    grantha_id = "mandukya-upanishad-rangaramanuja",\n'
            '    markdown_file = "mandukya-upanishad-rangaramanuja-01-01.md",\n'
            ')\n'
            'grantha_md2json_single(\n'
            '    name = "kuranarayana",\n'
            '    grantha_id = "mandukya-upanishad-kuranarayana",\n'
            '    markdown_file = "mandukya-upanishad-kuranarayana-muni-01-01.md",\n'
            ')\n'
        )
        rules = parse_build_rules(build)
        self.assertEqual(
            rules,
            {
                "mandukya-upanishad-rangaramanuja": ["mandukya-upanishad-rangaramanuja-01-01.md"],
                "mandukya-upanishad-kuranarayana": ["mandukya-upanishad-kuranarayana-muni-01-01.md"],
            },
        )

    def test_filegroup_ignored(self) -> None:
        """A ``filegroup`` is not an md2json rule and contributes nothing."""
        build = (
            'grantha_md2json_single(\n'
            '    name = "md2json",\n'
            '    grantha_id = "aitareya-upanishad",\n'
            '    markdown_file = "aitareya-upanishad-rangaramanuja-01-01.md",\n'
            ')\n'
            'filegroup(\n'
            '    name = "json_files",\n'
            '    srcs = [":md2json"],\n'
            ')\n'
        )
        self.assertEqual(parse_build_rules(build), {"aitareya-upanishad": ["aitareya-upanishad-rangaramanuja-01-01.md"]})

    def test_empty_and_malformed(self) -> None:
        """Rules without a grantha_id or without files are skipped."""
        self.assertEqual(parse_build_rules(""), {})
        self.assertEqual(parse_build_rules("# no rules here\nfilegroup(name='x')\n"), {})
        # rule present but missing grantha_id
        build = 'grantha_md2json_single(name="md2json", markdown_file="a.md")\n'
        self.assertEqual(parse_build_rules(build), {})


class TestDeclaredMarkdownFiles(unittest.TestCase):
    """Union of declared files across all rules."""

    def test_union_across_rules(self) -> None:
        """``declared_markdown_files`` unions files from every rule."""
        build = (
            'grantha_md2json_single(name="a", grantha_id="x", markdown_file="a.md")\n'
            'grantha_md2json_single(name="b", grantha_id="y", markdown_file="b.md")\n'
            'grantha_md2json_multipart(name="c", grantha_id="z", markdown_files=["c1.md", "c2.md"])\n'
        )
        self.assertEqual(declared_markdown_files(build), {"a.md", "b.md", "c1.md", "c2.md"})

    def test_empty(self) -> None:
        """A BUILD with no md2json rules declares nothing."""
        self.assertEqual(declared_markdown_files(""), set())


if __name__ == "__main__":
    unittest.main()
