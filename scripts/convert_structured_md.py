"""Convert structured-markdown source files to grantha-explorer v1.0.0 JSON.

Usage:
    python3 scripts/convert_structured_md.py \\
        --source /path/to/grantha-data/structured_md/upanishads/taittiriya \\
        --out /tmp/grantha-staging/taittiriya/taittiriya-upanishad

The script reads all .md files in `--source`, generates envelope.json and
partN.json files into `--out`, and writes a Sayana-deferral note to
DEFERRED.md in the grantha-explorer root when processing aitareya.
"""

from __future__ import annotations

__all__ = [
    "parse_frontmatter",
    "parse_body",
    "build_part_json",
    "build_envelope_json",
    "normalize_structure_levels",
    "convert_grantha",
    "append_sayana_deferred",
]

import argparse
import functools
import json
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

import _build_parser
import grantha_data_bootstrap

grantha_data_bootstrap.ensure_grantha_data_importable()


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SCHEMA_VERSION = "1.4.0"

# For aitareya: Sayana is deferred via `_handle_aitareya_sayana`; each file
# ships its own `commentaries_metadata` ids unmodified.
AITAREYA_GRANTHA_ID = "aitareya-upanishad"
SAYANA_COMMENTARY_ID = "sayana-bhashya"
SAYANA_DEFERRED_HEADING = "## Aitareya Upanishad — Sayana Bhashya (deferred)"

# Non-content files co-located with source .md files that must never be
# treated as grantha sources (editorial notes).  This set is the fallback
# publication gate only for directories WITHOUT a BUILD file; when a BUILD
# exists, its md2json `markdown_file(s)` declarations are authoritative (see
# _collect_source_files), so this set is not consulted.  (BUILD files are
# excluded implicitly: discovery globs only `*.md`.)
_NON_SOURCE_MD_FILES = frozenset(
    {
        "SOURCE_ISSUES.md",
        "BUGS.md",
    }
)


def _list_source_markdown_files(source_dir: Path) -> list[Path]:
    """Return sorted source markdown files, excluding non-content files.

    This is pure discovery: every ``.md`` in the directory except the universal
    non-content names (``SOURCE_ISSUES.md``, ``BUILD``).  It does NOT apply the
    BUILD publication gate — callers that need BUILD-gating (the flat
    converter's ``_collect_source_files``, and ``import_editions``'s
    ``discover_editions``) apply it themselves so they can report skipped files.

    Args:
        source_dir: Directory containing source markdown files.

    Returns:
        Sorted list of markdown file paths, excluding _NON_SOURCE_MD_FILES.
    """
    return sorted(
        p for p in source_dir.glob("*.md") if p.name not in _NON_SOURCE_MD_FILES
    )


def _build_declared_files(source_dir: Path) -> set[str]:
    """Return the BUILD-declared markdown set for ``source_dir``, or empty.

    Args:
        source_dir: Directory containing a BUILD file (may be absent).

    Returns:
        Set of markdown basenames declared in the directory's BUILD md2json
        rules, or an empty set when there is no BUILD or it declares nothing.
    """
    build_path = source_dir / "BUILD"
    if not build_path.exists():
        return set()
    return _build_parser.declared_markdown_files(
        build_path.read_text(encoding="utf-8")
    )


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class PassageData:
    """A single passage extracted from the source body."""

    ref: str
    mula_text: str = ""
    label_devanagari: str = ""
    speaker: str = ""
    # The markdown heading word (e.g. "Para", "Shloka") for main passages only
    # (per-block presentation model). Empty for framing passages.
    kind: str = ""
    # Runs of quoted verses (verse-quote blocks) as {start, end} half-open
    # offsets into mula_text. Empty for non-verse prose.
    verse_quotes: list[dict[str, int]] = field(default_factory=list)
    # The work's OWN verses (<!-- verse --> blocks) as {start, end} half-open
    # offsets into mula_text. Empty when the passage has no own verses.
    verses: list[dict[str, int]] = field(default_factory=list)


@dataclass(frozen=True)
class CommentaryPassage:
    """A commentary chunk for one passage ref."""

    ref: str
    text: str
    intro: str = ""


@dataclass
class BodyData:
    """All structured data parsed from a source file body."""

    prefatory: list[PassageData] = field(default_factory=list)
    passages: list[PassageData] = field(default_factory=list)
    concluding: list[PassageData] = field(default_factory=list)
    # Keyed by commentary_id; multiple chunks per ref are already merged.
    commentary_blocks: dict[str, list[CommentaryPassage]] = field(
        default_factory=dict
    )
    # Part-level commentary intro (chapter / whole-work): commentary_id -> text.
    # Set from an intro-only block (no gloss) placed before the first passage
    # heading or under a # Prefatory: anchor.
    commentary_intros: dict[str, str] = field(default_factory=dict)
    # Adhikarana upodghata prose awaiting the next sutra: folded into the next
    # leaf passage's commentary intro ("fold-into-first-sutra" v1 semantics).
    pending_adhikarana_intro: str = ""


# ---------------------------------------------------------------------------
# Regex patterns
# ---------------------------------------------------------------------------

# Matches <!-- hide type:... -->...(multiline)...<!-- /hide -->
_HIDE_RE = re.compile(
    r"<!--\s*hide\s+type:[^>]*?-->(.*?)<!--\s*/hide\s*-->",
    re.DOTALL,
)

# Known main-passage type names. The set drives the passage-heading regex so
# that non-Upanishad texts are parsed identically to mantra-based texts.
# "Para" was added for prakarana texts like the Vedartha Sangraha, whose
# passages are prose paragraphs rather than mantras; "Verse" for the Bhagavad
# Gita (gita-bhashya), whose passages are slokas.
#
# This set is only a FALLBACK: the converter derives the accepted kinds from
# each source file's frontmatter `structure_levels` leaf keys (matching the
# producer's `get_all_structure_keys`), plus the framing kinds `Prefatory` /
# `Concluding`. Keeping this fallback means files without a `structure_levels`
# frontmatter still parse, but new granthas no longer require editing here.
_PASSAGE_KINDS = frozenset({"Mantra", "Prefatory", "Concluding", "Para", "Verse"})

# Framing passage kinds that are not structural levels but always accepted.
_FRAMING_KINDS = frozenset({"Prefatory", "Concluding"})

# Structural *grouping* headings that segment content but are never passages and
# are not navigable structure_levels. The Brahma-sūtra corpus marks its
# adhikāras with ``# Adhikarana <n>`` headings, yet the sutra refs (1.1.1 =
# Adhyaya.Pada.Sutra) carry no adhikarana segment, so Adhikarana is not a
# structure level; the heading still must be recognized so (a) it segments
# content correctly and (b) the ``<!-- adhikarana-intro -->`` fold fires.
_STRUCTURAL_KINDS = frozenset({"Adhikarana"})


def _collect_structure_keys(levels: object) -> list[str]:
    """Return all structural level keys from a structure_levels tree.

    Handles both the list form (``[{key, children}]``) and the legacy dict
    form (``{key, children: {key, ...}}``), matching the producer's
    ``get_all_structure_keys``.

    Args:
        levels: The raw ``structure_levels`` value from frontmatter.

    Returns:
        All level ``key`` values in tree order (outermost first).
    """
    if isinstance(levels, dict):
        levels = [levels]
    keys: list[str] = []
    for level in levels or []:
        if not isinstance(level, dict) or "key" not in level:
            continue
        keys.append(level["key"])
        children = level.get("children")
        if children:
            keys.extend(_collect_structure_keys(children))
    return keys


def _lowest_structure_key(levels: object) -> str | None:
    """Return the leaf (innermost) key of a structure_levels tree.

    Args:
        levels: The raw ``structure_levels`` value from frontmatter.

    Returns:
        The innermost level key, or None when the tree is empty/malformed.
    """
    keys = _collect_structure_keys(levels)
    return keys[-1] if keys else None


def passage_kinds_for(
    frontmatter: dict[str, Any],
) -> tuple[frozenset[str], frozenset[str]]:
    """Derive the accepted passage-heading kinds for a source file.

    Returns a ``(heading_kinds, leaf_kinds)`` pair:
    - ``heading_kinds``: every structural level key of ``structure_levels``
      plus the framing kinds ``Prefatory`` / ``Concluding``. The heading regex
      matches all of these so interior headings (e.g. ``# Adhikarana N``)
      segment content correctly without becoming passages.
    - ``leaf_kinds``: the innermost structural key (the actual passage type,
      e.g. ``Mantra`` / ``Verse`` / ``Sutra``), plus ``Prefatory`` /
      ``Concluding``.

    When the frontmatter has no ``structure_levels`` (or yields no keys), falls
    back to the module-level ``_PASSAGE_KINDS`` for both.

    Args:
        frontmatter: The parsed YAML frontmatter dict.

    Returns:
        ``(heading_kinds, leaf_kinds)``.
    """
    levels = frontmatter.get("structure_levels")
    if not levels:
        return _PASSAGE_KINDS, _PASSAGE_KINDS
    keys = _collect_structure_keys(levels)
    leaf = keys[-1] if keys else None
    if leaf is None:
        return _PASSAGE_KINDS, _PASSAGE_KINDS
    return (
        frozenset(keys) | _FRAMING_KINDS | _STRUCTURAL_KINDS,
        frozenset({leaf}) | _FRAMING_KINDS,
    )

# Opening <!-- commentary: {...} --> tag; Group 1 = JSON metadata string.
_COMMENTARY_OPEN_RE = re.compile(
    r"<!--\s*commentary:\s*(\{[^}]+\})\s*-->",
)

# Explicit <!-- /commentary --> closing tag (present in some source files).
_COMMENTARY_CLOSE_RE = re.compile(
    r"<!--\s*/commentary\s*-->",
)

# Sub-heading inside a <!-- commentary --> block: "# Commentary: N.X.Y".
# Group 1 captures the stated ref, which is used as the passage ref in output
# (the source author's explicit attribution, overriding positional inference).
_COMMENTARY_SUBHEADING_RE = re.compile(
    r"^#\s+Commentary:\s+(\S+)\s*$",
    re.MULTILINE,
)

# Adhikarana-level intro prose: <!-- adhikarana-intro -->...<!-- /adhikarana-intro -->.
# This marks the upodghata prose that frames a whole adhikarana (introducing
# its sutras) — distinct from any single sutra's commentary. It is folded into
# the first following sutra's commentary intro for v1 (future-proof markup,
# fold-into-first-sutra semantics).
_ADHIKARANA_INTRO_RE = re.compile(
    r"<!--\s*adhikarana-intro\s*-->(.*?)<!--\s*/adhikarana-intro\s*-->",
    re.DOTALL,
)

# Opening <!-- sanskrit:devanagari --> tag.
_SANSKRIT_OPEN_RE = re.compile(r"<!--\s*sanskrit:devanagari\s*-->")

# Any HTML closing comment tag (<!-- /... -->).  Used as a fallback block
# boundary when the correct <!-- /sanskrit:devanagari --> closing tag is absent
# (source data quality issue observed in brihadaranyaka where some blocks are
# instead closed with a stray <!-- /hide --> tag).
_ANY_HTML_CLOSE_RE = re.compile(r"<!--\s*/[^>]+?-->")

# The proper closing tag for a Sanskrit block.  Preferred over the generic
# fallback above so that a stray <!-- /hide --> closing an inline hide label
# is not mistaken for the block boundary (isavasya-vd prefatory).
_SANSKRIT_CLOSE_RE = re.compile(r"<!--\s*/sanskrit:devanagari\s*-->")

# A complete <!-- hide ... -->...</hide --> block in bare or typed form.  Used
# to strip residual hide blocks (e.g. a leading inline label) from extracted
# mula text after the real Sanskrit close has been located.
_FULL_HIDE_BLOCK_RE = re.compile(
    r"<!--\s*hide\b[^>]*-->.*?<!--\s*/hide\s*-->",
    re.DOTALL,
)

# Matches a hide-open tag in any format (``<!-- hide type:... -->`` or the
# shorter ``<!-- hide:... -->``), but NOT close tags (``<!-- /hide -->``).
# Used as an inner boundary in ``_extract_mula_text`` to cap mula content
# before inline verse-number hide blocks embedded in Sanskrit text (pattern
# observed in katha from passage 1.1.18 onwards).
_HIDE_OPEN_RE = re.compile(r"<!--\s*hide\b[^>]*-->")

# Matches any remaining HTML comment in cleaned commentary text.  Used to
# strip stray orphaned tags (e.g. ``<!-- /hide -->``) that appear as source
# data errors inside commentary blocks.
_RESIDUAL_HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)

# --- v2 block markers (Grantha Markdown v2 spec) -----------------------------
_INTRO_OPEN_RE = re.compile(r"<!--\s*intro\s*-->")
_INTRO_CLOSE_RE = re.compile(r"<!--\s*/intro\s*-->")
_SPEAKER_OPEN_RE = re.compile(r"<!--\s*speaker\s*-->")
_SPEAKER_CLOSE_RE = re.compile(r"<!--\s*/speaker\s*-->")
# A balanced verse-number block (v2 form or legacy hide form) including its
# text; stripped from canonical content (the number is editorial metadata).
_VERSE_NUMBER_BLOCK_RE = re.compile(
    r"<!--\s*(?:hide\s+type:)?verse-number\s*-->.*?"
    r"<!--\s*/(?:hide\s+type:)?verse-number\s*-->",
    re.DOTALL,
)

# Matches any Markdown level-1 heading that is NOT a passage heading and NOT a
# commentary heading within a passage segment.  Used to detect trailing section
# breaks (e.g. "# Appendix:") that should terminate the final passage segment
# rather than being swept into its content.  Built per-file from the derived
# passage kinds (see ``parse_body``); this module-level value is the fallback
# when ``structure_levels`` is absent.
_SECTION_BREAK_RE = re.compile(
    rf"^# (?!{'|'.join(sorted(_PASSAGE_KINDS))}\b|Commentary:)\S",
    re.MULTILINE,
)


def _passage_heading_re(kinds: frozenset[str]) -> re.Pattern[str]:
    """Build the passage-heading regex for a set of passage kinds.

    Matches ``# <kind> <ref>`` with an optional ``(devanagari: "...")`` label.
    Group 1: kind, Group 2: ref, Group 3: optional devanagari label.

    Args:
        kinds: The accepted passage-heading kinds for the file.

    Returns:
        A compiled MULTILINE regex.
    """
    alt = "|".join(re.escape(k) for k in sorted(kinds))
    return re.compile(
        rf"^# ({alt})(?::?\s+)(\S+)"
        r"(?:\s+\(devanagari:\s*\"([^\"]+)\"\))?",
        re.MULTILINE,
    )


def _section_break_re(kinds: frozenset[str]) -> re.Pattern[str]:
    """Build the section-break regex for a set of passage kinds.

    Matches a level-1 heading that is neither a passage heading nor a
    ``# Commentary:`` heading.

    Args:
        kinds: The accepted passage-heading kinds for the file.

    Returns:
        A compiled MULTILINE regex.
    """
    alt = "|".join(re.escape(k) for k in sorted(kinds))
    return re.compile(
        rf"^# (?!({alt})\b|Commentary:)\S",
        re.MULTILINE,
    )


# Curated navigation sections: ``<!-- section id=... sa=... en=... -->`` and
# ``<!-- subsection sa=... en=... -->`` comment tags in the source body
# (vedarthasangraha's Raghavachar sections). Parsed into the envelope's
# ``sections`` list (mirrors the producer's ``extract_sections``).
_SECTION_TAG_RE = re.compile(
    r'^<!--\s*section\s+id="([^"]+)"\s+sa="([^"]+)"\s+en="([^"]+)"\s*-->$'
)
_SUBSECTION_TAG_RE = re.compile(
    r'^<!--\s*subsection\s+sa="([^"]+)"\s+en="([^"]+)"\s*-->$'
)


def _parse_section_tag(line: str) -> dict[str, Any] | None:
    """Parse a section or subsection navigation comment tag.

    Args:
        line: A single stripped markdown line.

    Returns:
        Dict with a ``type`` key ("section"/"subsection") plus the parsed
        attributes, or None when the line is not such a tag.
    """
    m = _SECTION_TAG_RE.match(line)
    if m:
        return {
            "type": "section",
            "id": m.group(1),
            "sa": m.group(2),
            "en": m.group(3),
        }
    m = _SUBSECTION_TAG_RE.match(line)
    if m:
        return {"type": "subsection", "sa": m.group(1), "en": m.group(2)}
    return None


def extract_sections(
    body_text: str,
    heading_kinds: frozenset[str],
) -> list[dict[str, Any]]:
    """Extract curated navigation sections from a source body.

    Scans for ``<!-- section ... -->`` and ``<!-- subsection ... -->`` comment
    tags, pairs them with the passage refs that follow, and builds the
    ``sections`` list matching the JSON schema (grantha.schema.json
    ``sections``). ``start_ref`` is the ref of the first passage heading after
    the tag; ``end_ref`` closes at the next section tag or end of body.
    Subsection ``end_ref`` values close when the next subsection or section tag
    is encountered.

    Args:
        body_text: The source body (after frontmatter).
        heading_kinds: The accepted passage-heading kinds for the file, used to
            recognize a passage heading line.

    Returns:
        A list of section dicts matching the JSON schema, or ``[]`` when no
        ``<!-- section ... -->`` tags are present.
    """
    heading_re = _passage_heading_re(heading_kinds)
    sections: list[dict[str, Any]] = []
    pending_section: dict[str, Any] | None = None
    pending_subsection: dict[str, Any] | None = None
    last_ref: str | None = None

    def _close_subsection(end_ref: str) -> None:
        nonlocal pending_subsection
        if pending_subsection is not None:
            pending_subsection["end_ref"] = end_ref
            if pending_section is not None:
                pending_section.setdefault("subsections", []).append(
                    pending_subsection
                )
            pending_subsection = None

    def _close_section(end_ref: str) -> None:
        nonlocal pending_section
        _close_subsection(end_ref)
        if pending_section is not None:
            pending_section["end_ref"] = end_ref
            sections.append(pending_section)
            pending_section = None

    for raw_line in body_text.splitlines():
        line = raw_line.strip()

        heading_match = heading_re.match(line)
        if heading_match:
            ref = heading_match.group(2)
            if pending_section is not None and "start_ref" not in pending_section:
                pending_section["start_ref"] = ref
            if (
                pending_subsection is not None
                and "start_ref" not in pending_subsection
            ):
                pending_subsection["start_ref"] = ref
            last_ref = ref
            continue

        attrs = _parse_section_tag(line)
        if attrs is None:
            continue

        if attrs["type"] == "section":
            if last_ref is not None:
                _close_section(last_ref)
            elif pending_section is not None:
                _close_section("")
            pending_section = {
                "id": attrs["id"],
                "label": {"devanagari": attrs["sa"], "english": attrs["en"]},
            }
            pending_subsection = None
        elif attrs["type"] == "subsection":
            if last_ref is not None:
                _close_subsection(last_ref)
            pending_subsection = {
                "label": {"devanagari": attrs["sa"], "english": attrs["en"]},
            }

    if last_ref is not None:
        _close_section(last_ref)
    elif pending_section is not None:
        _close_section("")

    return sections


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

def _strip_hide_blocks(text: str) -> str:
    """Remove all <!-- hide type:... -->...<!-- /hide --> blocks.

    A source hide block is blank-line-separated from the prose on both sides
    (``… ।\\n\\n<!-- hide … -->\\n\\n…\\n\\n<!-- /hide -->\\n\\n…``). Removing
    it leaves the two surrounding blank lines adjacent (``\\n\\n\\n\\n``), which
    would render as an excess blank line in the explorer. Collapse any 3+
    newline run to exactly 2 (Grantha Markdown §1) so the block vanishes
    cleanly, leaving one paragraph break.

    Args:
        text: Raw source text.

    Returns:
        Text with all hide blocks removed and newline runs collapsed.
    """
    text = _HIDE_RE.sub("", text)
    return re.sub(r"\n{3,}", "\n\n", text)


def _extract_mula_and_speaker(
    segment: str,
) -> tuple[str, str, list[dict[str, int]], list[dict[str, int]]]:
    """Extract a leading v2 ``<!-- speaker -->`` and the remaining mula text.

    Args:
        segment: A passage's mula segment (may include a leading speaker block).

    Returns:
        ``(mula_text, speaker)`` — speaker is "" when absent.
    """
    speaker_match = re.match(
        r"\s*<!--\s*speaker\s*-->(.*?)<!--\s*/speaker\s*-->\s*",
        segment,
        flags=re.DOTALL,
    )
    speaker = ""
    if speaker_match is not None:
        speaker = speaker_match.group(1).strip()
        segment = segment[speaker_match.end():]
    # Protect the verse-quote and verse delimiters through _extract_mula_text
    # (whose residual-comment strip would otherwise remove them), then extract
    # and strip them, recording the inner offsets in the final mula text.
    protected = (
        segment.replace("<!-- verse-quote -->", "\x00VQO\x00")
        .replace("<!-- /verse-quote -->", "\x00VQC\x00")
        .replace("<!-- verse -->", "\x00VSO\x00")
        .replace("<!-- /verse -->", "\x00VSC\x00")
    )
    mula_text = _extract_mula_text(protected)
    mula_text = (
        mula_text.replace("\x00VQO\x00", "<!-- verse-quote -->")
        .replace("\x00VQC\x00", "<!-- /verse-quote -->")
        .replace("\x00VSO\x00", "<!-- verse -->")
        .replace("\x00VSC\x00", "<!-- /verse -->")
    )
    mula_text, verse_quotes, verses = _extract_verse_quotes(mula_text)
    return mula_text, speaker, verse_quotes, verses


_VERSE_QUOTE_OPEN = "<!-- verse-quote -->"
_VERSE_QUOTE_CLOSE = "<!-- /verse-quote -->"
_VERSE_QUOTE_BLOCK_RE = re.compile(
    r"<!--\s*verse-quote\s*-->(.*?)<!--\s*/verse-quote\s*-->",
    re.DOTALL,
)
_VERSE_OPEN = "<!-- verse -->"
_VERSE_CLOSE = "<!-- /verse -->"
_VERSE_BLOCK_RE = re.compile(
    r"<!--\s*verse\s*-->(.*?)<!--\s*/verse\s*-->",
    re.DOTALL,
)


def _extract_verse_quotes(
    text: str,
) -> tuple[str, list[dict[str, int]], list[dict[str, int]]]:
    """Strip ``<!-- verse-quote -->`` and ``<!-- verse -->`` delimiters,
    returning the clean text and half-open offsets of each block's inner text.

    Args:
        text: Text possibly containing verse-quote / verse blocks.

    Returns:
        ``(cleaned, verse_quotes, verses)``.
    """
    out: list[str] = []
    vq: list[dict[str, int]] = []
    vs: list[dict[str, int]] = []
    cursor = 0
    for m in sorted(
        list(_VERSE_QUOTE_BLOCK_RE.finditer(text))
        + list(_VERSE_BLOCK_RE.finditer(text)),
        key=lambda m: m.start(),
    ):
        if m.start() > cursor:
            out.append(text[cursor : m.start()])
        inner = m.group(1)
        start = len("".join(out))
        out.append(inner)
        end = len("".join(out))
        if m.re is _VERSE_QUOTE_BLOCK_RE:
            vq.append({"start": start, "end": end})
        else:
            vs.append({"start": start, "end": end})
        cursor = m.end()
    if cursor < len(text):
        out.append(text[cursor:])
    return "".join(out), vq, vs


def _extract_mula_text(segment: str) -> str:
    """Extract and concatenate all sanskrit:devanagari blocks in a segment.

    Handles two closing-tag variants:
    - Correct: ``<!-- /sanskrit:devanagari -->`` (preferred).
    - Malformed: any ``<!-- /... -->`` tag, used as a fallback when the proper
      close is absent (e.g. brihadaranyaka source files).

    When the proper close is present it is preferred over the generic
    fallback, so a stray ``<!-- /hide -->`` closing an inline label block does
    not truncate the mula (isavasya-vd prefatory).  If an inner
    ``<!-- hide:... -->`` tag appears after real mula content, extraction stops
    at that tag (katha 1.1.18+).  Residual hide blocks and orphaned HTML
    comments are stripped from the final text.

    Args:
        segment: Text between two passage headings.

    Returns:
        Concatenated mula text, or empty string if none found.
    """
    opens = list(_SANSKRIT_OPEN_RE.finditer(segment))
    closes = list(_ANY_HTML_CLOSE_RE.finditer(segment))
    proper_closes = list(_SANSKRIT_CLOSE_RE.finditer(segment))

    def _close_in_window(close: re.Match[str]) -> bool:
        """Whether a closing tag lies within the current block's window.

        Args:
            close: A closing-tag match.

        Returns:
            True when the tag falls between the block's content start and the
            start of the next Sanskrit block.
        """
        return content_start <= close.start() < next_open_pos

    results: list[str] = []
    for i, open_match in enumerate(opens):
        content_start = open_match.end()
        next_open_pos = (
            opens[i + 1].start() if i + 1 < len(opens) else len(segment)
        )
        # Prefer the real <!-- /sanskrit:devanagari --> close.  Only fall back
        # to any closing HTML-comment tag when it is absent (malformed-close
        # support, e.g. brihadaranyaka's stray <!-- /hide --> boundary).  The
        # preferred match prevents an inline hide close from truncating the
        # block (isavasya-vd prefatory, where a bare <!-- hide --> label block
        # precedes the mula text).
        matching_close = (
            next((c for c in proper_closes if _close_in_window(c)), None)
            or next((c for c in closes if _close_in_window(c)), None)
        )
        content_end = matching_close.start() if matching_close else next_open_pos
        # Cap at any embedded hide-open tag (e.g. ``<!-- hide:verse-number -->``)
        # which appears inline inside the Sanskrit content in some source files
        # (katha from 1.1.18 onwards).  The tag and the verse number that
        # follows it should not be included in the extracted mula text.  The cap
        # fires only when real mula text precedes the tag — a leading hide label
        # block with nothing before it must not truncate the mula.
        inner_hide = _HIDE_OPEN_RE.search(segment, content_start, content_end)
        if inner_hide and segment[content_start:inner_hide.start()].strip():
            content_end = inner_hide.start()
        text = segment[content_start:content_end]
        # Drop any residual hide blocks (e.g. a leading inline label) and any
        # orphaned HTML comment tags left in the mula.
        text = _FULL_HIDE_BLOCK_RE.sub("", text)
        text = _RESIDUAL_HTML_COMMENT_RE.sub("", text).strip()
        if text:
            results.append(text)

    if results:
        return "\n\n".join(results)

    # v2 bare-content fallback: no `<!-- sanskirt:devanagari -->` blocks.
    # The segment is bare Devanagari (plus a leading speaker block and inline
    # verse-number/hide blocks), already truncated at the first commentary
    # marker by the caller. Strip verse-number and editorial blocks and
    # residual comment tags; what remains is the mula.
    bare = _VERSE_NUMBER_BLOCK_RE.sub("", segment)
    bare = _FULL_HIDE_BLOCK_RE.sub("", bare)
    bare = _RESIDUAL_HTML_COMMENT_RE.sub("", bare).strip()
    return bare


def _split_commentary_intro(text: str) -> tuple[str, str]:
    """Split a leading ``<!-- intro -->…<!-- /intro -->`` block off commentary text.

    An unclosed ``<!-- intro -->`` is a **syntax error**: the caller aborts
    rather than emitting intro-only JSON.

    Args:
        text: A commentary block's inner text (tags still present).

    Returns:
        ``(intro, gloss)`` — intro is "" when absent.
    """
    open_match = _INTRO_OPEN_RE.search(text)
    if open_match is None:
        return "", text
    close_match = _INTRO_CLOSE_RE.search(text, open_match.end())
    if close_match is None:
        raise ValueError("Unclosed <!-- intro --> block (no <!-- /intro -->)")
    intro = text[open_match.end(): close_match.start()]
    gloss = text[close_match.end():]
    return intro, gloss


def _split_commentary_subheadings(
    content: str,
) -> list[tuple[str | None, str]]:
    """Split raw commentary block content at ``# Commentary: N.X.Y`` sub-headings.

    The sub-heading's stated ref is the source author's explicit attribution
    for that passage's commentary.  When no sub-heading is present the whole
    block is returned as a single ``(None, text)`` pair; the caller falls back
    to the containing mantra ref.

    Any text appearing before the first sub-heading is prepended to the first
    sub-passage's text (rare in practice; usually there is no such preamble).

    Args:
        content: Raw content of one ``<!-- commentary: ... -->`` block,
            from the tag's end to the close marker's start.

    Returns:
        List of ``(heading_ref_or_None, stripped_text)`` pairs, one per
        sub-heading.  Empty text after stripping is included (callers filter).
    """
    headings = list(_COMMENTARY_SUBHEADING_RE.finditer(content))
    if not headings:
        return [(None, content.strip())]

    result: list[tuple[str | None, str]] = []
    preamble = content[: headings[0].start()].strip()

    for j, heading_match in enumerate(headings):
        heading_ref: str = heading_match.group(1)
        text_start = heading_match.end()
        text_end = headings[j + 1].start() if j + 1 < len(headings) else len(content)
        text = content[text_start:text_end]
        if j == 0 and preamble:
            text = preamble + "\n\n" + text
        result.append((heading_ref, text.strip()))

    return result


def _merge_duplicate_ref_passages(
    passages: list[CommentaryPassage],
) -> list[CommentaryPassage]:
    """Merge commentary passages that share the same ref.

    When the source contains multiple ``<!-- commentary -->`` blocks for the
    same passage ref (e.g. two separate blocks both labeled
    ``# Commentary: 1.2.1``), their texts are joined with a double newline.
    This reproduces the single-entry behaviour of the earlier converter and
    prevents duplicate-ref entries in the output JSON.

    The order of first occurrence is preserved.  Because ``CommentaryPassage``
    is frozen, merging creates a replacement object at the same list index
    rather than mutating the existing one in place.

    Args:
        passages: List of CommentaryPassage objects, possibly with duplicate
            refs.

    Returns:
        List with duplicate-ref passages merged into single entries.
    """
    seen: dict[str, int] = {}  # ref -> index in merged; list positions are stable
    merged: list[CommentaryPassage] = []
    for cp in passages:
        if cp.ref in seen:
            idx = seen[cp.ref]
            existing = merged[idx]
            merged[idx] = CommentaryPassage(
                ref=cp.ref,
                text=existing.text + "\n\n" + cp.text,
                intro=existing.intro or cp.intro,
            )
        else:
            seen[cp.ref] = len(merged)
            merged.append(cp)
    return merged


def _extract_commentary_blocks(
    segment: str,
) -> dict[str, list[tuple[str | None, str, str]]]:
    """Extract commentary blocks from a segment, split by sub-heading refs.

    Handles two source variants:
    - Explicit close: ``<!-- commentary: ... -->...<!-- /commentary -->``
    - Implicit close: content runs to the next opening tag or end of segment.

    Each ``<!-- commentary: ... -->`` block may contain multiple
    ``# Commentary: N.X.Y`` sub-headings.  The stated ref in each sub-heading
    is the source author's explicit attribution and is used as the passage ref
    in the output (overriding positional/containing-mantra inference).  When
    no sub-heading is present, ``None`` is returned as the ref and the caller
    falls back to the containing mantra ref.

    Args:
        segment: Text between two passage headings (or end of body).

    Returns:
        Mapping from commentary_id to a list of ``(heading_ref_or_None,
        cleaned_gloss, cleaned_intro)`` triples, one per sub-heading (or one
        per block when no sub-heading is present).
    """
    grouped: dict[str, list[tuple[str | None, str, str]]] = {}
    opens = list(_COMMENTARY_OPEN_RE.finditer(segment))
    closes = list(_COMMENTARY_CLOSE_RE.finditer(segment))

    for i, open_match in enumerate(opens):
        try:
            meta = json.loads(open_match.group(1))
        except json.JSONDecodeError:
            continue
        cid = meta.get("commentary_id", "")
        if not cid:
            continue

        content_start = open_match.end()
        next_open_pos = opens[i + 1].start() if i + 1 < len(opens) else len(segment)
        matching_close = next(
            (c for c in closes if content_start <= c.start() < next_open_pos),
            None,
        )
        content_end = matching_close.start() if matching_close else next_open_pos
        content = segment[content_start:content_end]

        for heading_ref, text in _split_commentary_subheadings(content):
            # Split a leading v2 <!-- intro -->…<!-- /intro --> block first
            # (the tags would otherwise be stripped below and the intro text
            # merged into the gloss).
            intro, gloss = _split_commentary_intro(text)
            # Strip any stray orphaned HTML comment tags (source data errors).
            cleaned_gloss = _RESIDUAL_HTML_COMMENT_RE.sub("", gloss).strip()
            cleaned_intro = (
                _RESIDUAL_HTML_COMMENT_RE.sub("", intro).strip() if intro else ""
            )
            if cleaned_gloss or cleaned_intro:
                grouped.setdefault(cid, []).append(
                    (heading_ref, cleaned_gloss, cleaned_intro)
                )

    return grouped


# ---------------------------------------------------------------------------
# Main parsing functions
# ---------------------------------------------------------------------------

def parse_frontmatter(path: Path) -> tuple[dict[str, Any], str]:
    """Parse YAML frontmatter and return the frontmatter dict and body text.

    Args:
        path: Path to the structured markdown source file.

    Returns:
        A (frontmatter_dict, body_text) tuple.

    Raises:
        ValueError: If the file does not begin with a YAML frontmatter block.
    """
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        raise ValueError(f"No frontmatter found in {path}")

    try:
        close_idx = text.index("\n---\n", 3)
    except ValueError:
        raise ValueError(f"Unclosed frontmatter block in {path}") from None
    fm_text = text[3:close_idx]
    body = text[close_idx + 5:]  # skip '\n---\n'

    fm: dict[str, Any] = yaml.safe_load(fm_text)
    return fm, body


def parse_body(
    text: str,
    passage_kinds: frozenset[str] | None = None,
    leaf_kinds: frozenset[str] | None = None,
) -> BodyData:
    """Parse the body of a structured markdown file into structured data.

    Args:
        text: Body text (everything after the closing frontmatter ---).
        passage_kinds: Accepted passage-heading kinds for the file, derived
            from its ``structure_levels`` (see ``passage_kinds_for``). All
            kinds are matched by the heading regex (so interior headings
            segment content), but only leaf/framing kinds become passages.
            When omitted, falls back to the module-level ``_PASSAGE_KINDS``.
        leaf_kinds: The subset of ``passage_kinds`` that are actual passages
            (the innermost structural key plus Prefatory/Concluding). Defaults
            to ``passage_kinds`` when omitted.

    Returns:
        Populated BodyData instance.
    """
    kinds = passage_kinds if passage_kinds is not None else _PASSAGE_KINDS
    leaves = leaf_kinds if leaf_kinds is not None else kinds
    heading_re = _passage_heading_re(kinds)
    section_break_re = _section_break_re(kinds)
    text = _strip_hide_blocks(text)
    headings = list(heading_re.finditer(text))
    data = BodyData()

    # Extract commentary blocks that appear before the first passage heading
    # (preamble commentary).  These blocks carry an explicit ``# Commentary:
    # X.Y.Z`` subheading and must be preserved; the normal heading loop never
    # reaches content before headings[0].  Only blocks with an explicit ref
    # subheading are collected — headingless preamble commentary cannot be
    # reliably attributed.
    if headings:
        preamble = text[: headings[0].start()]
        for cid, sub_passages in _extract_commentary_blocks(preamble).items():
            for heading_ref, gloss, intro in sub_passages:
                if heading_ref is not None:
                    data.commentary_blocks.setdefault(cid, []).append(
                        CommentaryPassage(ref=heading_ref, text=gloss, intro=intro)
                    )
                elif intro and not gloss:
                    # Heading-less preamble intro-only block: the chapter intro.
                    data.commentary_intros[cid] = intro

    for i, match in enumerate(headings):
        kind = match.group(1)  # a matched passage-heading kind (structural key or Prefatory/Concluding)
        ref = match.group(2)
        label = match.group(3) or ""

        seg_start = match.end()
        if i + 1 < len(headings):
            seg_end = headings[i + 1].start()
        else:
            # For the final passage, stop at any non-passage/non-commentary
            # level-1 heading (e.g. "# Appendix:") to avoid sweeping trailing
            # editorial sections into the last passage's content.
            section_break = section_break_re.search(text, match.end())
            seg_end = section_break.start() if section_break else len(text)
        segment = text[seg_start:seg_end]

        # The mula text ends at the first ``# Commentary:`` sub-heading (v1) or
        # the first v2 ``<!-- commentary: -->`` open tag: the commentary's text
        # must not be swept into the passage mula.
        # ``_extract_commentary_blocks`` still sees the full segment.
        commentary_heading = _COMMENTARY_SUBHEADING_RE.search(segment)
        commentary_open = _COMMENTARY_OPEN_RE.search(segment)
        cut_positions = [
            m.start()
            for m in (commentary_heading, commentary_open)
            if m is not None
        ]
        mula_segment = (
            segment[: min(cut_positions)] if cut_positions else segment
        )
        mula_text, speaker, verse_quotes, verses = _extract_mula_and_speaker(
            mula_segment
        )
        commentary_by_cid = _extract_commentary_blocks(segment)

        passage = PassageData(
            ref=ref,
            mula_text=mula_text,
            label_devanagari=label,
            speaker=speaker,
            # Main passages declare their heading kind (the leaf key, e.g.
            # "Para"/"Shloka"); framing passages carry none (per-block
            # presentation model).
            kind=kind if kind in leaves else "",
            verse_quotes=verse_quotes,
            verses=verses,
        )

        # Adhikarana-level upodghata prose: capture <!-- adhikarana-intro -->
        # content from an interior heading's segment and hold it for the next
        # sutra's commentary intro (fold-into-first-sutra v1 semantics). Any
        # prior pending value is cleared first so a heading without an intro
        # never leaks stale prose into a later adhikarana's first sutra.
        if kind not in leaves:
            data.pending_adhikarana_intro = ""
            adh_match = _ADHIKARANA_INTRO_RE.search(segment)
            if adh_match:
                data.pending_adhikarana_intro = (
                    _RESIDUAL_HTML_COMMENT_RE.sub("", adh_match.group(1)).strip()
                )

        if kind == "Prefatory":
            data.prefatory.append(passage)
        elif kind == "Concluding":
            data.concluding.append(passage)
        elif kind in leaves:
            # Only the innermost structural key (the leaf passage type, e.g.
            # Mantra / Verse / Sutra) becomes a main passage; interior headings
            # (e.g. Adhikarana) only segment their content.
            data.passages.append(passage)

        # Use each sub-heading's stated ref as the commentary passage ref.
        # Fall back to the containing mantra ref only when no sub-heading
        # is present (heading_ref is None) — the fallback handles the small
        # number of blocks in the corpus that carry no explicit heading.
        for cid, sub_passages in commentary_by_cid.items():
            for heading_ref, gloss, intro in sub_passages:
                if kind in leaves and data.pending_adhikarana_intro:
                    # Fold the adhikarana upodghata into this (first) leaf's
                    # commentary lead-in so it survives into the UI. Runs
                    # before the intro-only hoist so the pending value is
                    # consumed on the very first block of the leaf, even when
                    # that block is intro-only.
                    intro = (
                        data.pending_adhikarana_intro
                        + ("\n\n" if intro else "")
                        + intro
                    )
                    data.pending_adhikarana_intro = ""
                if not gloss and intro:
                    # Intro-only block: a # Prefatory: anchor (or a main
                    # heading whose mula text is absent) — hoist to the
                    # part-level commentary.intro.
                    data.commentary_intros[cid] = intro
                    continue
                passage_ref = heading_ref if heading_ref is not None else ref
                data.commentary_blocks.setdefault(cid, []).append(
                    CommentaryPassage(ref=passage_ref, text=gloss, intro=intro)
                )

    return data


# ---------------------------------------------------------------------------
# Structure-level normalization
# ---------------------------------------------------------------------------

def _normalize_level_variant_a(level: dict[str, Any]) -> dict[str, Any]:
    """Recursively convert Variant A structure (children as dict) to array form.

    Args:
        level: A single structure level dict, possibly with a `children` dict.

    Returns:
        The level dict with `children` converted to a single-element list.
    """
    result: dict[str, Any] = {
        "key": level["key"],
        "scriptNames": level["scriptNames"],
    }
    children = level.get("children")
    if children is not None:
        if isinstance(children, dict):
            result["children"] = [_normalize_level_variant_a(children)]
        elif isinstance(children, list):
            result["children"] = [_normalize_level_variant_a(c) for c in children]
    return result


def _build_nested_from_flat(levels: list[dict[str, Any]]) -> dict[str, Any]:
    """Reverse-fold a flat list of levels into a nested structure.

    Given [A, B, C], produces A → children:[B → children:[C]].

    Args:
        levels: Flat ordered list of structure levels, outermost first.

    Returns:
        The outermost level dict with nested children.

    Raises:
        ValueError: If `levels` is empty.
    """
    if not levels:
        raise ValueError("Cannot build nested structure from empty levels list")
    # Start from the innermost level (no children)
    result: dict[str, Any] = {
        "key": levels[-1]["key"],
        "scriptNames": levels[-1]["scriptNames"],
    }
    for level in reversed(levels[:-1]):
        result = {
            "key": level["key"],
            "scriptNames": level["scriptNames"],
            "children": [result],
        }
    return result


def normalize_structure_levels(raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert raw structure_levels YAML to the v1.0.0 nested array format.

    Variant A: One item in the list; `children` is a dict → recurse-convert.
    Variant B: Multiple items; no `children` keys → reverse-fold into nested.

    Args:
        raw: The `structure_levels` list from the source frontmatter.

    Returns:
        Normalized list (always a single-element list wrapping the top level).
    """
    has_children = any("children" in level for level in raw)
    if has_children:
        # Variant A — process the single root level
        return [_normalize_level_variant_a(raw[0])]
    # Variant B — flat list → nested
    return [_build_nested_from_flat(raw)]


# ---------------------------------------------------------------------------
# JSON builders
# ---------------------------------------------------------------------------

def _build_framing_entry(p: PassageData, passage_type: str) -> dict[str, Any]:
    """Build a prefatory or concluding material entry dict.

    A framing passage may carry no mula text (e.g. a label-only mangalācaraṇa
    anchor whose content lives in the commentary); ``content`` is then omitted
    to match the schema's optional content for prefatory/concluding passages.

    Args:
        p: The framing PassageData (prefatory or concluding).
        passage_type: Either ``"prefatory"`` or ``"concluding"``.

    Returns:
        Dict matching the v1.0.0 prefatory_material / concluding_material shape.
    """
    entry: dict[str, Any] = {
        "ref": p.ref,
        "passage_type": passage_type,
        "label": {"devanagari": p.label_devanagari},
    }
    if p.speaker:
        entry["speaker"] = p.speaker
    if p.mula_text:
        entry["content"] = {"sanskrit": {"devanagari": p.mula_text}}
    if p.verses:
        entry["verses"] = p.verses
    return entry


def _build_main_passage_entry(
    p: PassageData,
    context: str = "",
    diagnostics: list[dict[str, Any]] | None = None,
    grantha_id: str = "",
    sidecar_rows: dict[tuple[str, str, int], object] | None = None,
) -> dict[str, Any]:
    """Build a main passages entry dict.

    Extracts cross-text references from the mula text when it carries
    citations (e.g. vedarthasangraha's ``# Para N`` prose), so main passages
    can carry ``references[]`` like commentary passages.

    Args:
        p: The main PassageData.
        context: The citing edition's school namespace ("" = school-neutral).
        diagnostics: Optional collector for reference diagnostics.
        grantha_id: The citing grantha's id (for the citation overlay key).
        sidecar_rows: Optional quote-sidecar rows (reference.quote stamping).

    Returns:
        Dict matching the v1.0.0 passages entry shape.
    """
    entry: dict[str, Any] = {
        "ref": p.ref,
        "passage_type": "main",
        "kind": p.kind,
        "content": {"sanskrit": {"devanagari": p.mula_text}},
    }
    if p.verse_quotes:
        entry["verse_quotes"] = p.verse_quotes
    if p.verses:
        entry["verses"] = p.verses
    refs, passage_diags = _extract_references(
        p.mula_text,
        context,
        passage_ref=p.ref,
        passage_type="main",
        sidecar_rows=sidecar_rows,
    )
    refs, unmatched = _apply_citation_overlay(refs, grantha_id, p.ref, "main")
    if refs:
        entry["references"] = refs
    for uk in unmatched:
        if diagnostics is not None:
            diagnostics.append(
                {
                    "code": "REF-OVERLAY-UNMATCHED",
                    "severity": "error",
                    "passage_ref": p.ref,
                    "hint": f"overlay key matched no emitted reference: {uk}",
                }
            )
    if diagnostics is not None:
        for diag in passage_diags:
            diag["passage_ref"] = p.ref
            diagnostics.append(diag)
    if p.speaker:
        entry["speaker"] = p.speaker
    return entry


# Loaded once per process (the overlay file is small and stable).
_CITATION_OVERLAY_CACHE: tuple[dict[str, dict[str, Any]], list[str]] | None = None


def _load_citation_overlay() -> tuple[dict[str, dict[str, Any]], list[str]]:
    """Load the citation-corrections overlay (empty when absent/empty).

    Returns ``(overlay, unmatched_keys)`` where ``unmatched_keys`` starts empty
    and is filled only when a converter key fails to match an emitted reference
    (the apply hook reports it loudly). The overlay lives in grantha-data
    (``data/citation_corrections.yaml``) and is reached via the grantha_data
    bootstrap — the type belongs with the data model.

    Returns:
        A ``(overlay, unmatched)`` pair.
    """
    global _CITATION_OVERLAY_CACHE
    if _CITATION_OVERLAY_CACHE is not None:
        return _CITATION_OVERLAY_CACHE
    import grantha_data.citation_repair as citation_repair

    # The overlay lives in the same grantha-data checkout as the bimap: derive
    # from _tools_lib_dir() (tools/lib → <grantha-data>/data/citation_corrections.yaml).
    data_dir = _tools_lib_dir().resolve().parent.parent / "data"
    path = data_dir / "citation_corrections.yaml"
    overlay: dict[str, dict[str, Any]] = (
        citation_repair.load_overlay(path) if path.exists() else {}
    )
    _CITATION_OVERLAY_CACHE = (overlay, [])
    return _CITATION_OVERLAY_CACHE


def _apply_citation_overlay(
    refs: list[dict[str, Any]],
    citing_grantha_id: str,
    passage_ref: str,
    passage_type: str,
) -> tuple[list[dict[str, Any]], list[str]]:
    """Apply the citation-corrections overlay to emitted references.

    Overrides only ``locator``/``grantha_id``/``edition_id`` (never
    ``display_text``, offsets, or the citing prose). Unmatched overlay keys are
    returned so a dropped/renamed correction is loud, never silent.

    Args:
        refs: Emitted reference objects.
        citing_grantha_id: The citing grantha's id (part of the overlay key).
        passage_ref: The citing passage's ref.
        passage_type: ``"main"`` or ``"commentary"``.

    Returns:
        A ``(refs, unmatched_keys)`` pair.
    """
    try:
        import grantha_data.citation_repair as citation_repair
    except ImportError:
        return refs, []
    overlay, _ = _load_citation_overlay()
    if not overlay:
        return refs, []
    return citation_repair.apply_overlay(
        refs,
        citing_grantha_id=citing_grantha_id,
        passage_ref=passage_ref,
        passage_type=passage_type,
        overlay=overlay,
    )


def _extract_references(
    devanagari: str,
    context: str = "",
    passage_ref: str = "",
    passage_type: str = "main",
    sidecar_rows: dict[tuple[str, str, int], object] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Extract structured references and diagnostics from a Devanagari string.

    Uses ``grantha_data.references`` (the shared producer-side library) when
    it is importable. Importing requires the ``grantha_data`` package to be
    on ``sys.path`` — either via ``pip install -e`` or the
    ``GRANTHA_DATA_TOOLS_LIB`` bootstrap (see ``grantha_data_bootstrap.py``).

    When the library is unavailable the converter is not blocked: reference
    emission is best-effort and the ``references`` key is simply omitted.

    Args:
        devanagari: The passage's ``content.sanskrit.devanagari``.
        context: The citing work's school namespace (``ramanuja``,
            ``sankara``), read from the edition's frontmatter. Empty =
            school-neutral → base table.
        passage_ref: The citing passage's ref (sidecar join key).
        passage_type: The citing passage's type (``main``/``commentary``).
        sidecar_rows: Optional quote-sidecar rows; when present, references are
            stamped with their precomputed ``quote``.

    Returns:
        A ``(references, diagnostics)`` pair; both empty when the library is
        unavailable or no citations were found.
    """
    try:
        from grantha_data.references import extract_references

        bimap = _references_bimap()
        refs, diags = extract_references(
            devanagari,
            bimap,
            context=context,
            passage_ref=passage_ref,
            passage_type=passage_type,
            sidecar_rows=sidecar_rows,
        )
        serialized_refs = [
            {
                "start": ref.start,
                "end": ref.end,
                "display_text": ref.display_text,
                "grantha_id": ref.grantha_id,
                "edition_id": ref.edition_id or None,
                "locator": ref.locator,
                "locator_end": ref.locator_end,
                "group_id": ref.group_id,
                "unresolved": ref.unresolved,
                **({"quote": ref.quote} if ref.quote is not None else {}),
            }
            for ref in refs
        ]
        serialized_diags = [
            {
                "code": diag.code,
                "severity": diag.severity,
                "start": diag.start,
                "end": diag.end,
                "display_text": diag.display_text,
                "hint": diag.hint,
            }
            for diag in diags
        ]
        return serialized_refs, serialized_diags
    except (ImportError, ValueError):
        return [], []


_references_bimap_cache: Any = None
_references_bimap_cache_key: str | None = None


# When set (via ``--grantha-data-dir``), the grantha-data checkout root used
# to locate ``data/citation_bimap.yaml`` etc. Under Bazel this is the runfiles
# path; the env-var / package derivation is the npm fallback.
_GRANTHA_DATA_DIR: Path | None = None


def _set_grantha_data_dir(grantha_data_dir: Path | None) -> None:
    """Pin the grantha-data checkout root (Bazel runfiles path).

    Args:
        grantha_data_dir: The grantha-data checkout root, or None to fall back
            to the env-var / installed-package derivation.
    """
    global _GRANTHA_DATA_DIR
    _GRANTHA_DATA_DIR = grantha_data_dir


def _tools_lib_dir() -> Path:
    """Return the grantha-data ``tools/lib`` directory for the active checkout.

    When ``--grantha-data-dir`` was passed it is derived from it; otherwise
    ``GRANTHA_DATA_TOOLS_LIB``, then the installed ``grantha_data`` package
    location is used.

    Returns:
        The ``tools/lib`` Path.
    """
    import os

    if _GRANTHA_DATA_DIR is not None:
        return _GRANTHA_DATA_DIR / "tools" / "lib"
    tools_lib = os.environ.get("GRANTHA_DATA_TOOLS_LIB")
    if tools_lib:
        return Path(tools_lib).expanduser()
    import grantha_data

    return Path(grantha_data.__file__).resolve().parent


def _references_bimap() -> list[Any]:
    """Load the citation bimap, resolving the grantha-data checkout path.

    The bimap lives in the same grantha-data checkout as the library. When
    ``--grantha-data-dir`` is set it is derived from it; otherwise
    ``GRANTHA_DATA_TOOLS_LIB``, then the ``grantha_data`` package location is
    used. Returns [] when the bimap cannot be located, so reference extraction
    degrades gracefully — EXCEPT when ``--grantha-data-dir`` was passed
    explicitly (the Bazel path): a missing bimap is then a hard error, never a
    silent drop of ``references[]``.

    The result is cached per override/env value: this is called once per
    passage, and re-parsing the YAML on every call makes a 626-part corpus
    conversion (tens of thousands of passages) spend its time in the YAML
    parser instead of extracting.

    Returns:
        The loaded bimap entries, or [] when the file is unavailable on the
        npm fallback path.

    Raises:
        FileNotFoundError: When ``--grantha-data-dir`` is set but the bimap
            file is missing.
    """
    global _references_bimap_cache, _references_bimap_cache_key
    import os

    from grantha_data.references import load_bimap

    tools_lib = os.environ.get("GRANTHA_DATA_TOOLS_LIB")
    cache_key = (
        str(_GRANTHA_DATA_DIR)
        if _GRANTHA_DATA_DIR is not None
        else (tools_lib or "default")
    )
    if _references_bimap_cache is not None and _references_bimap_cache_key == cache_key:
        return _references_bimap_cache

    bimap_path = _tools_lib_dir().parent.parent / "data" / "citation_bimap.yaml"
    loaded: list[Any] = []
    if bimap_path.exists():
        loaded = load_bimap(bimap_path)
    elif _GRANTHA_DATA_DIR is not None:
        raise FileNotFoundError(
            f"--grantha-data-dir={_GRANTHA_DATA_DIR} but citation bimap "
            f"missing at {bimap_path} — refusing to silently drop references[]"
        )
    _references_bimap_cache = loaded
    _references_bimap_cache_key = cache_key
    return loaded


def _quote_sidecar_for(
    grantha_explorer_root: Path, grantha_id: str
) -> dict[tuple[str, str, int], object] | None:
    """Load the quote-sidecar rows for a grantha.

    The sidecar lives in this repo under
    ``public/data/sidecars/<grantha_id>/citation_quotes.json`` (it annotates
    the ``references[]``-bearing library JSON produced here, not the source
    markdown in grantha-data). Returns ``None`` when the sidecar is absent
    (reference emission proceeds without quote stamping). Rows are keyed
    ``(passage_ref, passage_type, ref_start)``.

    Args:
        grantha_explorer_root: Root of the grantha-explorer repo.
        grantha_id: The citing grantha's id.

    Returns:
        The keyed sidecar rows, or ``None``.
    """
    sidecar = (
        grantha_explorer_root
        / "public"
        / "data"
        / "sidecars"
        / grantha_id
        / "citation_quotes.json"
    )
    if not sidecar.exists():
        return None

    from grantha_data.citation_quotes import load_sidecar

    try:
        return load_sidecar(sidecar)
    except (json.JSONDecodeError, OSError):
        # A malformed/unreadable sidecar degrades to no quote stamping (never
        # a hard build failure); the sidecar is regenerated by citation-quotes.
        return None


def _build_commentary(
    meta: dict[str, Any],
    body: BodyData,
    diagnostics: list[dict[str, Any]] | None = None,
    context: str = "",
    sidecar_rows: dict[tuple[str, str, int], object] | None = None,
) -> dict[str, Any] | None:
    """Build one commentary dict from its frontmatter descriptor.

    Args:
        meta: One commentaries_metadata entry (commentary_id,
            commentary_title, commentator, optional parent_commentary_id).
        body: Parsed body data.
        diagnostics: Optional collector for build diagnostics; each
            reference diagnostic is appended with ``source_file`` and
            ``passage_ref`` context.
        context: The citing edition's school namespace (from
            ``citation_namespace`` in frontmatter); empty = school-neutral.

    Returns:
        The commentary dict, or None when this commentary carries no content
        in this part (no passages and no part-level intro).
    """
    cid: str = meta["commentary_id"]
    raw_blocks = body.commentary_blocks.get(cid, [])
    # Merge any duplicate-ref blocks arising from split commentary tags in source.
    cid_blocks = _merge_duplicate_ref_passages(raw_blocks)
    part_intro = body.commentary_intros.get(cid, "")
    if not (cid_blocks or part_intro):
        return None

    commentary_passages: list[dict[str, Any]] = []
    for cp in cid_blocks:
        if not cp.text:
            continue
        entry: dict[str, Any] = {
            "ref": cp.ref,
            "content": {"sanskrit": {"devanagari": cp.text}},
        }
        refs, passage_diags = _extract_references(
            cp.text,
            context,
            passage_ref=cp.ref,
            passage_type="commentary",
            sidecar_rows=sidecar_rows,
        )
        if refs:
            entry["references"] = refs
        if diagnostics is not None:
            for diag in passage_diags:
                diag["commentary_id"] = cid
                diag["passage_ref"] = cp.ref
                diagnostics.append(diag)
        if cp.intro:
            entry["intro"] = {"sanskrit": {"devanagari": cp.intro}}
        commentary_passages.append(entry)

    commentary: dict[str, Any] = {
        "commentary_id": cid,
        "commentary_title": meta.get("commentary_title", ""),
        "commentator": meta.get("commentator", {}),
    }
    if meta.get("parent_commentary_id"):
        commentary["parent_commentary_id"] = meta["parent_commentary_id"]
    if part_intro:
        commentary["intro"] = {"sanskrit": {"devanagari": part_intro}}
    commentary["passages"] = commentary_passages
    return commentary


def _citation_context(frontmatter: dict[str, Any]) -> str:
    """Derive the citing edition's school namespace from its frontmatter.

    The school is declared in the source frontmatter (design §4.2): a
    ``citation_namespace`` value inside ``commentaries_metadata`` (per
    commentary) or as a grantha-level field (mula-author works like
    vedarthasangraha, which have no ``commentaries_metadata``). Absent →
    school-neutral (base table). A grantha-level value that disagrees with a
    commentary-level value is a hard error.

    Args:
        frontmatter: Parsed YAML frontmatter dict.

    Returns:
        The namespace string, or "" when school-neutral.
    """
    grantha_level: str = frontmatter.get("citation_namespace") or ""
    for meta in frontmatter.get("commentaries_metadata") or []:
        ns: str = meta.get("citation_namespace") or ""
        if ns:
            if grantha_level and ns != grantha_level:
                raise ValueError(
                    "conflicting citation_namespace across the edition: "
                    f"grantha-level {grantha_level!r} vs commentary {ns!r}"
                )
            grantha_level = ns
    return grantha_level


def build_part_json(
    frontmatter: dict[str, Any],
    body: BodyData,
    edition_id: str,
    target_commentary_ids: list[str],
    diagnostics: list[dict[str, Any]] | None = None,
    sidecar_rows: dict[tuple[str, str, int], object] | None = None,
) -> dict[str, Any]:
    """Assemble the full part JSON dict for one source file.

    Args:
        frontmatter: Parsed YAML frontmatter dict.
        body: Parsed body data.
        edition_id: The edition_id to embed (equals grantha_id for
            single-edition texts; multi-edition texts pass the real edition id).
        target_commentary_ids: The commentary_ids to include, in document
            order; empty to omit commentary.
        diagnostics: Optional collector for build diagnostics, threaded into
            ``_build_commentary``.

    Returns:
        Dict conforming to the v1.0.0 part file schema.
    """
    grantha_id: str = frontmatter["grantha_id"]
    part_num: int = frontmatter["part_num"]
    context = _citation_context(frontmatter)

    prefatory = [
        _build_framing_entry(p, "prefatory") for p in body.prefatory
    ]
    passages = [
        _build_main_passage_entry(p, context, diagnostics, grantha_id, sidecar_rows)
        for p in body.passages
        if p.mula_text
    ]
    concluding = [
        _build_framing_entry(p, "concluding") for p in body.concluding
    ]

    result: dict[str, Any] = {
        "kind": "grantha-part",
        "schema_version": SCHEMA_VERSION,
        "grantha_id": grantha_id,
        "edition_id": edition_id,
        "part_num": part_num,
    }

    if prefatory:
        result["prefatory_material"] = prefatory
    result["passages"] = passages
    if concluding:
        result["concluding_material"] = concluding

    # Commentary block(s). Emit the singular `commentary` when exactly one
    # commentary carries content in this part, and the plural `commentaries`
    # array when two or more do (e.g. a bhāṣya plus a subcommentary declaring
    # parent_commentary_id). Omitted entirely when none carries content.
    commentaries_meta: list[dict[str, Any]] | None = frontmatter.get(
        "commentaries_metadata"
    )
    if commentaries_meta:
        commentaries: list[dict[str, Any]] = []
        for meta in commentaries_meta:
            if meta["commentary_id"] not in target_commentary_ids:
                continue
            commentary = _build_commentary(
                meta, body, diagnostics, context, sidecar_rows
            )
            if commentary:
                commentaries.append(commentary)
        if len(commentaries) == 1:
            result["commentary"] = commentaries[0]
        elif len(commentaries) > 1:
            result["commentaries"] = commentaries

    return result


def build_envelope_json(
    parts_info: list[dict[str, str]],
    structure_levels: list[dict[str, Any]],
    frontmatter: dict[str, Any],
    edition_id: str,
    edition_kind: str | None = None,
    sections: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Assemble the envelope JSON for the grantha.

    Args:
        parts_info: List of {"file": "partN.json", "first_ref": "..."} dicts.
        structure_levels: Normalized structure_levels array.
        frontmatter: Frontmatter from the first source file (for metadata).
        edition_id: The edition_id for this sub-envelope. For single-edition
            granthas this equals the grantha_id; multi-edition texts pass the
            real edition_id.
        edition_kind: The edition's declared kind ("mula-only" | "commentarial")
            derived from commentary presence across the full part set
            (per-block presentation model). Omitted when unknown.
        sections: Curated navigation sections (from ``<!-- section -->``
            comments), parsed by ``extract_sections``. Omitted when none.

    Returns:
        Dict conforming to the v1.0.0 envelope schema.
    """
    grantha_id: str = frontmatter["grantha_id"]
    envelope: dict[str, Any] = {
        "kind": "edition-sub-envelope",
        "schema_version": SCHEMA_VERSION,
        "edition_id": edition_id,
        "grantha_id": grantha_id,
        "structure_levels": structure_levels,
        "parts": parts_info,
    }
    if edition_kind:
        envelope["edition_kind"] = edition_kind
    if sections:
        envelope["sections"] = sections
    return envelope


# ---------------------------------------------------------------------------
# Aitareya special handling
# ---------------------------------------------------------------------------


def append_sayana_deferred(
    sayana_text: str,
    passage_ref: str,
    grantha_explorer_root: Path,
) -> None:
    """Append a Sayana-deferral note to DEFERRED.md, idempotently.

    Checks whether the entry already exists by scanning for
    SAYANA_DEFERRED_HEADING before appending, so repeated converter runs
    do not create duplicate entries.

    Args:
        sayana_text: The full Sayana commentary text for the passage.
        passage_ref: The passage ref (e.g. "0.0").
        grantha_explorer_root: Root of the grantha-explorer repo.

    Returns:
        None. Side effect: appends to DEFERRED.md when the heading is absent.
    """
    deferred_path = grantha_explorer_root / "DEFERRED.md"
    existing = deferred_path.read_text(encoding="utf-8") if deferred_path.exists() else ""
    if SAYANA_DEFERRED_HEADING in existing:
        print(f"  → Sayana text for {passage_ref} already in DEFERRED.md — skipped")
        return
    note = (
        "\n\n---\n\n"
        f"{SAYANA_DEFERRED_HEADING}\n\n"
        f"**Passage ref:** {passage_ref}\n\n"
        "**Source editorial note:** "
        "रङ्गरामानुजमुनिभिः अव्याख्यातत्वात् सायण भाष्यमेव दत्तम्\n\n"
        "**Decision rationale:** The Sayana Bhashya is present only because "
        "Rangaramanuja Muni did not comment on this passage. It falls outside "
        "the scope of the Rangaramanuja edition and is deferred pending a "
        "decision on whether to create a separate Sayana edition or discard.\n\n"
        f"**Sayana text:**\n\n{sayana_text}\n"
    )
    with deferred_path.open("a", encoding="utf-8") as fh:
        fh.write(note)
    print(f"  → Sayana text for {passage_ref} appended to DEFERRED.md")


# ---------------------------------------------------------------------------
# Commentary-id resolution
# ---------------------------------------------------------------------------

def _resolve_target_commentary_ids(
    frontmatter: dict[str, Any],
) -> list[str]:
    """Determine the target commentary_ids for a source file.

    Args:
        frontmatter: Parsed frontmatter dict for the file.

    Returns:
        The commentary_id strings to include, in document order, or [] if no
        commentary applies.
    """
    commentaries_meta: list[dict[str, Any]] | None = frontmatter.get("commentaries_metadata")
    if not commentaries_meta:
        return []  # Mula-only part (e.g. kaushitaki part 2)

    # Return every commentary_id from the file's own frontmatter, preserving
    # per-file variation rather than normalizing. This includes aitareya: the
    # Rangaramanuja file ships only its own id, and the Sankara file ships
    # `sankara-bhashyam`.
    return [c["commentary_id"] for c in commentaries_meta]


# ---------------------------------------------------------------------------
# Conversion orchestration
# ---------------------------------------------------------------------------

@functools.lru_cache(maxsize=None)
def _read_part_num(path: Path) -> int:
    """Parse and return the ``part_num`` from a file's YAML frontmatter.

    Results are cached so that ``_collect_source_files`` does not read each
    file twice (once for duplicate detection, once for the sort key).

    Args:
        path: Path to a structured markdown source file.

    Returns:
        Integer part_num, or 0 if absent or unparseable.
    """
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        return 0
    try:
        end = text.index("\n---\n", 3)
        fm: dict[str, Any] = yaml.safe_load(text[3:end])
        return int(fm.get("part_num", 0))
    except (ValueError, TypeError, yaml.YAMLError):
        return 0


def _collect_source_files(source_dir: Path) -> list[Path]:
    """Return .md source files from `source_dir` in logical part order.

    Publication gate:
    - When the directory has a BUILD file, only the markdown files it declares
      (via its md2json ``markdown_file(s)`` arguments) are publishable.  A
      present-but-undeclared file (e.g. a partial Sāyaṇa edition, an
      unattributed śānti-vyākhyā) is skipped with a warning and never emitted.
      This gives single-edition (flat) texts the same BUILD-gated semantics
      that import_editions.py applies to multi-edition texts.
    - Without a BUILD (or with one declaring nothing), all files except the
      universal non-content names are candidates.

    Ordering strategy:
    - If all ``part_num`` values in the frontmatter are unique, sort by
      ``part_num``. This correctly orders mixed-type files such as kaushitaki
      where a mula-only part filename sorts before commentary files
      alphabetically yet has a higher ``part_num``.
    - If ``part_num`` values contain duplicates (source data quality issue
      observed in chandogya where parts 6 and 7 have ``part_num: 1``), fall
      back to alphabetical filename order, which reliably encodes the prapathaka
      sequence in those filenames.

    Args:
        source_dir: The directory containing source markdown files.

    Returns:
        List of .md file paths in correct logical part sequence.

    Raises:
        FileNotFoundError: If no source .md files (other than non-content
            files) exist.
        ValueError: If the BUILD declares more than one distinct grantha_id
            (use import_editions.py for multi-edition texts).
    """
    candidates = _list_source_markdown_files(source_dir)
    if not candidates:
        raise FileNotFoundError(f"No .md files found in {source_dir}")

    build_path = source_dir / "BUILD"
    if build_path.exists():
        rules = _build_parser.parse_build_rules(build_path.read_text(encoding="utf-8"))
        # Multi-edition guard: a BUILD declaring md2json rules for more than
        # one distinct grantha_id (e.g. a Rangaramanuja edition plus a Sankara
        # edition) must be ingested with import_editions.py. Running the flat
        # converter here would union all declared files into a single
        # ``edition_id == frontmatter grantha_id`` stream, silently merging the
        # Sankara files into the Rangaramanuja edition.
        if len(rules) > 1:
            raise ValueError(
                f"{source_dir} declares multiple edition grantha_ids "
                f"({sorted(rules)}); this text must be ingested with "
                f"scripts/import_editions.py (multi-edition layout), not the "
                f"flat converter."
            )

    declared = _build_declared_files(source_dir)
    if declared:
        present = {p.name for p in candidates}
        for name in sorted(present - declared):
            print(f"  SKIP (not declared in BUILD): {name}")
        candidates = [p for p in candidates if p.name in declared]

    if not candidates:
        raise FileNotFoundError(
            f"No publishable .md files found in {source_dir} (BUILD declares "
            f"{len(declared)} file(s), none present on disk)"
        )

    part_nums = [_read_part_num(p) for p in candidates]
    if len(set(part_nums)) == len(part_nums):
        # All unique — sort by part_num from frontmatter
        return sorted(candidates, key=_read_part_num)
    # Duplicates present — fall back to alphabetical filename order
    print(
        f"  WARNING: non-unique part_num values detected in {source_dir.name} "
        f"({part_nums}); falling back to filename order."
    )
    return sorted(candidates, key=lambda p: p.name)


def _first_main_ref(body: BodyData) -> str:
    """Return the ref of the first main passage in body.

    Falls back to the first prefatory ref when the part has no main passages
    (matching ``build_part_json``, which drops main passages without mula
    text), so a preface-only part (e.g. the gitabhashya mangalācaraṇa) is not
    dropped from the envelope ``parts[].first_ref``.

    Args:
        body: Parsed body data.

    Returns:
        The ref string of the first main passage with mula text, or
        body.prefatory[0].ref.

    Raises:
        ValueError: If body has neither a main-with-mula nor prefatory passage.
    """
    first_main = next((p.ref for p in body.passages if p.mula_text), None)
    if first_main is not None:
        return first_main
    if body.prefatory:
        return body.prefatory[0].ref
    raise ValueError("Part has no main or prefatory passages; cannot determine first_ref")


def convert_grantha(
    source_dir: Path,
    out_dir: Path,
    grantha_explorer_root: Path,
) -> None:
    """Convert all source files for one grantha into v1.0.0 JSON.

    Args:
        source_dir: Directory of .md source files for this grantha.
        out_dir: Output directory for envelope.json and partN.json files.
        grantha_explorer_root: Root of the grantha-explorer repo (for DEFERRED.md).
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    source_files = _collect_source_files(source_dir)

    print(f"Converting {len(source_files)} file(s) from {source_dir}")

    parts_info: list[dict[str, str]] = []
    first_frontmatter: dict[str, Any] | None = None
    structure_levels_raw: list[dict[str, Any]] | None = None
    diagnostics: list[dict[str, Any]] = []
    # Whether each part carried a commentary, for the envelope's edition_kind.
    part_has_commentary: list[bool] = []
    first_body_text: str = ""
    first_heading_kinds: frozenset[str] = frozenset()

    for idx, src_path in enumerate(source_files, start=1):
        part_filename = f"part{idx}.json"
        print(f"  [{idx}/{len(source_files)}] {src_path.name} → {part_filename}")

        frontmatter, body_text = parse_frontmatter(src_path)
        heading_kinds, leaf_kinds = passage_kinds_for(frontmatter)
        body = parse_body(
            body_text,
            passage_kinds=heading_kinds,
            leaf_kinds=leaf_kinds,
        )

        grantha_id: str = frontmatter["grantha_id"]
        edition_id = grantha_id  # Single-edition: edition_id == grantha_id

        if first_frontmatter is None:
            first_frontmatter = frontmatter
            structure_levels_raw = frontmatter.get("structure_levels", [])
            first_body_text = body_text
            first_heading_kinds = heading_kinds

        target_cids = _resolve_target_commentary_ids(frontmatter)

        # Aitareya: collect Sayana text from prefatory passage and defer it
        if grantha_id == AITAREYA_GRANTHA_ID:
            _handle_aitareya_sayana(body, grantha_explorer_root)

        diag_start = len(diagnostics)
        quote_rows = _quote_sidecar_for(grantha_explorer_root, grantha_id)
        part_json = build_part_json(
            frontmatter,
            body,
            edition_id,
            target_cids,
            diagnostics,
            sidecar_rows=quote_rows,
        )
        for diag in diagnostics[diag_start:]:
            diag["source_file"] = src_path.name

        out_path = out_dir / part_filename
        out_path.write_text(
            json.dumps(part_json, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        first_ref = _first_main_ref(body)
        parts_info.append({"file": part_filename, "first_ref": first_ref})
        part_has_commentary.append(
            bool(part_json.get("commentary") or part_json.get("commentaries"))
        )
        print(f"      first_ref={first_ref}, passages={len(body.passages)}, "
              f"commentary={part_has_commentary[-1]}")

    if first_frontmatter is None:
        raise RuntimeError("No source files were processed")
    if structure_levels_raw is None:
        raise RuntimeError("structure_levels missing from first source file frontmatter")

    normalized_levels = normalize_structure_levels(structure_levels_raw)
    # The edition's declared kind (per-block presentation model):
    # derived at build time from commentary presence across the FULL part set.
    edition_kind = "commentarial" if any(part_has_commentary) else "mula-only"
    # Curated navigation sections (Raghavachar etc.) parsed from the first
    # source file's <!-- section --> comments.
    sections = (
        extract_sections(first_body_text, first_heading_kinds)
        if first_body_text
        else []
    )
    # Single-edition flow: edition_id == grantha_id by convention.
    envelope = build_envelope_json(
        parts_info, normalized_levels, first_frontmatter, edition_id=first_frontmatter["grantha_id"],
        edition_kind=edition_kind,
        sections=sections or None,
    )

    envelope_path = out_dir / "envelope.json"
    envelope_path.write_text(
        json.dumps(envelope, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"  envelope.json written ({len(parts_info)} parts)")

    if diagnostics:
        report = {
            "grantha_id": first_frontmatter["grantha_id"],
            "reference_diagnostics": diagnostics,
        }
        (out_dir / "references-report.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        errors = sum(1 for d in diagnostics if d["severity"] == "error")
        warnings = len(diagnostics) - errors
        print(
            f"  references-report.json written: {errors} error(s), "
            f"{warnings} warning(s)"
        )
    else:
        print("  no reference diagnostics; no references-report.json")


def _handle_aitareya_sayana(
    body: BodyData,
    grantha_explorer_root: Path,
) -> None:
    """Collect Sayana text from aitareya prefatory passage and defer it.

    Args:
        body: Parsed body data for the aitareya source file.
        grantha_explorer_root: Root of the grantha-explorer repo.
    """
    sayana_blocks = body.commentary_blocks.get(SAYANA_COMMENTARY_ID, [])
    # Sayana appears only on the prefatory passage (ref 0.0)
    prefatory_sayana = [cp for cp in sayana_blocks if cp.ref == "0.0"]
    if not prefatory_sayana:
        # Fallback: take the first block regardless of ref (source may vary)
        prefatory_sayana = sayana_blocks[:1]

    if prefatory_sayana:
        passage_ref = prefatory_sayana[0].ref
        combined_text = "\n\n".join(cp.text for cp in prefatory_sayana)
        append_sayana_deferred(combined_text, passage_ref, grantha_explorer_root)

    # Remove Sayana from commentary_blocks so it is not included in output
    body.commentary_blocks.pop(SAYANA_COMMENTARY_ID, None)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _build_arg_parser() -> argparse.ArgumentParser:
    """Build and return the CLI argument parser."""
    parser = argparse.ArgumentParser(
        description="Convert structured-markdown source files to v1.0.0 JSON.",
    )
    parser.add_argument(
        "--source",
        required=True,
        type=Path,
        help="Directory containing source .md files for one grantha.",
    )
    parser.add_argument(
        "--out",
        required=True,
        type=Path,
        help="Output directory for envelope.json and partN.json files.",
    )
    parser.add_argument(
        "--grantha-explorer-root",
        type=Path,
        default=Path(__file__).parent.parent,
        help=(
            "Root of the grantha-explorer repo (for DEFERRED.md). "
            "Defaults to the parent of the scripts/ directory."
        ),
    )
    parser.add_argument(
        "--grantha-data-dir",
        type=Path,
        default=None,
        help=(
            "Root of the grantha-data checkout (for data/citation_bimap.yaml "
            "and data/citation_corrections.yaml). Under Bazel this is the "
            "runfiles path. When unset, falls back to GRANTHA_DATA_TOOLS_LIB "
            "or the installed grantha_data package. Setting it makes a missing "
            "bimap a hard error instead of a silent references[] drop."
        ),
    )
    return parser


def main() -> None:
    """Parse CLI arguments and run the conversion."""
    parser = _build_arg_parser()
    args = parser.parse_args()

    source_dir: Path = args.source.resolve()
    out_dir: Path = args.out.resolve()
    explorer_root: Path = args.grantha_explorer_root.resolve()
    _set_grantha_data_dir(
        args.grantha_data_dir.resolve() if args.grantha_data_dir else None
    )

    if not source_dir.is_dir():
        parser.error(f"--source is not a directory: {source_dir}")

    convert_grantha(source_dir, out_dir, explorer_root)
    print("Done.")


if __name__ == "__main__":
    main()
