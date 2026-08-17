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


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SCHEMA_VERSION = "1.2.0"

# For aitareya: index-0 commentary is Rangaramanuja, index-1 is Sayana.
AITAREYA_GRANTHA_ID = "aitareya-upanishad"
SAYANA_COMMENTARY_ID = "sayana-bhashya"
AITAREYA_TARGET_COMMENTARY_ID = "rangaramanuja-muni-prakashika"
SAYANA_DEFERRED_HEADING = "## Aitareya Upanishad — Sayana Bhashya (deferred)"

# Non-content files co-located with source .md files that must never be
# treated as grantha sources (editorial notes, build files).  This set is the
# fallback publication gate only for directories WITHOUT a BUILD file; when a
# BUILD exists, its md2json `markdown_file(s)` declarations are authoritative
# (see _collect_source_files), so this set is not consulted.
_NON_SOURCE_MD_FILES = frozenset(
    {
        "SOURCE_ISSUES.md",
        "BUILD",
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
    return frozenset(keys) | _FRAMING_KINDS, frozenset({leaf}) | _FRAMING_KINDS

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


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

def _strip_hide_blocks(text: str) -> str:
    """Remove all <!-- hide type:... -->...<!-- /hide --> blocks.

    Args:
        text: Raw source text.

    Returns:
        Text with all hide blocks removed.
    """
    return _HIDE_RE.sub("", text)


def _extract_mula_and_speaker(segment: str) -> tuple[str, str]:
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
    return _extract_mula_text(segment), speaker


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
) -> dict[str, list[tuple[str | None, str]]]:
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
        cleaned_text)`` pairs, one per sub-heading (or one per block when no
        sub-heading is present).
    """
    grouped: dict[str, list[tuple[str | None, str]]] = {}
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
        mula_text, speaker = _extract_mula_and_speaker(mula_segment)
        commentary_by_cid = _extract_commentary_blocks(segment)

        passage = PassageData(
            ref=ref, mula_text=mula_text, label_devanagari=label, speaker=speaker
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
    return entry


def _build_main_passage_entry(p: PassageData) -> dict[str, Any]:
    """Build a main passages entry dict.

    Args:
        p: The main PassageData.

    Returns:
        Dict matching the v1.0.0 passages entry shape.
    """
    entry: dict[str, Any] = {
        "ref": p.ref,
        "passage_type": "main",
        "content": {"sanskrit": {"devanagari": p.mula_text}},
    }
    if p.speaker:
        entry["speaker"] = p.speaker
    return entry


def _build_commentary(
    meta: dict[str, Any],
    body: BodyData,
) -> dict[str, Any] | None:
    """Build one commentary dict from its frontmatter descriptor.

    Args:
        meta: One commentaries_metadata entry (commentary_id,
            commentary_title, commentator, optional parent_commentary_id).
        body: Parsed body data.

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


def build_part_json(
    frontmatter: dict[str, Any],
    body: BodyData,
    edition_id: str,
    target_commentary_ids: list[str],
) -> dict[str, Any]:
    """Assemble the full part JSON dict for one source file.

    Args:
        frontmatter: Parsed YAML frontmatter dict.
        body: Parsed body data.
        edition_id: The edition_id to embed (equals grantha_id for
            single-edition texts; multi-edition texts pass the real edition id).
        target_commentary_ids: The commentary_ids to include, in document
            order; empty to omit commentary.

    Returns:
        Dict conforming to the v1.0.0 part file schema.
    """
    grantha_id: str = frontmatter["grantha_id"]
    part_num: int = frontmatter["part_num"]

    prefatory = [
        _build_framing_entry(p, "prefatory") for p in body.prefatory
    ]
    passages = [
        _build_main_passage_entry(p) for p in body.passages if p.mula_text
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
            commentary = _build_commentary(meta, body)
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
) -> dict[str, Any]:
    """Assemble the envelope JSON for the grantha.

    Args:
        parts_info: List of {"file": "partN.json", "first_ref": "..."} dicts.
        structure_levels: Normalized structure_levels array.
        frontmatter: Frontmatter from the first source file (for metadata).
        edition_id: The edition_id for this sub-envelope. For single-edition
            granthas this equals the grantha_id; multi-edition texts pass the
            real edition_id.

    Returns:
        Dict conforming to the v1.0.0 envelope schema.
    """
    grantha_id: str = frontmatter["grantha_id"]
    return {
        "kind": "edition-sub-envelope",
        "schema_version": SCHEMA_VERSION,
        "edition_id": edition_id,
        "grantha_id": grantha_id,
        "structure_levels": structure_levels,
        "parts": parts_info,
    }


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
    grantha_id: str,
) -> list[str]:
    """Determine the target commentary_ids for a source file.

    Args:
        frontmatter: Parsed frontmatter dict for the file.
        grantha_id: The grantha_id of the text being processed.

    Returns:
        The commentary_id strings to include, in document order, or [] if no
        commentary applies.
    """
    commentaries_meta: list[dict[str, Any]] | None = frontmatter.get("commentaries_metadata")
    if not commentaries_meta:
        return []  # Mula-only part (e.g. kaushitaki part 2)

    if grantha_id == AITAREYA_GRANTHA_ID:
        # Sayana is collected/deferred separately; only Rangaramanuja ships
        # inline in the aitareya parts.
        return [AITAREYA_TARGET_COMMENTARY_ID]

    # All other texts: use every commentary_id from the file's own frontmatter
    # (preserving per-file variation rather than normalizing).
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
    """
    candidates = _list_source_markdown_files(source_dir)
    if not candidates:
        raise FileNotFoundError(f"No .md files found in {source_dir}")

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

        target_cids = _resolve_target_commentary_ids(frontmatter, grantha_id)

        # Aitareya: collect Sayana text from prefatory passage and defer it
        if grantha_id == AITAREYA_GRANTHA_ID:
            _handle_aitareya_sayana(body, grantha_explorer_root)

        part_json = build_part_json(frontmatter, body, edition_id, target_cids)

        out_path = out_dir / part_filename
        out_path.write_text(
            json.dumps(part_json, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        first_ref = _first_main_ref(body)
        parts_info.append({"file": part_filename, "first_ref": first_ref})
        print(f"      first_ref={first_ref}, passages={len(body.passages)}, "
              f"commentary={bool(part_json.get('commentary') or part_json.get('commentaries'))}")

    if first_frontmatter is None:
        raise RuntimeError("No source files were processed")
    if structure_levels_raw is None:
        raise RuntimeError("structure_levels missing from first source file frontmatter")

    normalized_levels = normalize_structure_levels(structure_levels_raw)
    # Single-edition flow: edition_id == grantha_id by convention.
    envelope = build_envelope_json(
        parts_info, normalized_levels, first_frontmatter, edition_id=first_frontmatter["grantha_id"]
    )

    envelope_path = out_dir / "envelope.json"
    envelope_path.write_text(
        json.dumps(envelope, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"  envelope.json written ({len(parts_info)} parts)")


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
    return parser


def main() -> None:
    """Parse CLI arguments and run the conversion."""
    parser = _build_arg_parser()
    args = parser.parse_args()

    source_dir: Path = args.source.resolve()
    out_dir: Path = args.out.resolve()
    explorer_root: Path = args.grantha_explorer_root.resolve()

    if not source_dir.is_dir():
        parser.error(f"--source is not a directory: {source_dir}")

    convert_grantha(source_dir, out_dir, explorer_root)
    print("Done.")


if __name__ == "__main__":
    main()
