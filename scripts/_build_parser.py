"""Shared Bazel BUILD parsing for structured_md source directories.

Both the flat converter (``convert_structured_md.py``) and the multi-edition
importer (``import_editions.py``) derive the set of publishable markdown
sources from each source directory's BUILD file.  This module owns that parsing
so the two paths share one authoritative implementation.

The BUILD file's ``grantha_md2json_single`` / ``grantha_md2json_multipart``
rules declare, per ``grantha_id``, the exact markdown files to publish.  Any
``.md`` present in the source directory but absent from these declarations is
preserved-but-not-published (e.g. a partial Sāyaṇa edition, an unattributed
śānti-vyākhyā) and must never be emitted into the library.
"""

from __future__ import annotations

import re

__all__ = [
    "parse_build_rules",
    "declared_markdown_files",
]

_BUILD_RULE_RE = re.compile(
    r"grantha_md2json_(single|multipart)\s*\((.*?)\)",
    re.DOTALL,
)
_GRANTHA_ID_KW_RE = re.compile(r'grantha_id\s*=\s*"([^"]+)"')
_SINGLE_FILE_KW_RE = re.compile(r'markdown_file\s*=\s*"([^"]+)"')
_FILES_LIST_KW_RE = re.compile(r"markdown_files\s*=\s*\[(.*?)\]", re.DOTALL)
_ANY_QUOTED_RE = re.compile(r'"([^"]+)"')


def parse_build_rules(build_text: str) -> dict[str, list[str]]:
    """Parse a structured_md BUILD file's md2json rules.

    Args:
        build_text: Contents of a source directory's BUILD file.

    Returns:
        Mapping from edition_id (the BUILD ``grantha_id``) to the ordered list
        of markdown source filenames belonging to that edition.
    """
    mapping: dict[str, list[str]] = {}
    for rule in _BUILD_RULE_RE.finditer(build_text):
        body = rule.group(2)
        grantha_match = _GRANTHA_ID_KW_RE.search(body)
        if not grantha_match:
            continue
        edition_id = grantha_match.group(1)
        files: list[str] = []
        single_match = _SINGLE_FILE_KW_RE.search(body)
        if single_match:
            files = [single_match.group(1)]
        else:
            files_match = _FILES_LIST_KW_RE.search(body)
            if files_match:
                files = _ANY_QUOTED_RE.findall(files_match.group(1))
        if files:
            mapping.setdefault(edition_id, []).extend(files)
    return mapping


def declared_markdown_files(build_text: str) -> set[str]:
    """Return the union of all markdown files declared across BUILD rules.

    This is the flat converter's publication gate: a source ``.md`` file is
    publishable iff its basename is in this set.

    Args:
        build_text: Contents of a source directory's BUILD file.

    Returns:
        Set of markdown basenames declared in any ``markdown_file`` or
        ``markdown_files`` argument of the BUILD's md2json rules.
    """
    rules = parse_build_rules(build_text)
    return {filename for files in rules.values() for filename in files}
