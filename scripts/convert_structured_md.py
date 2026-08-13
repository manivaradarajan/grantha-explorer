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

SCHEMA_VERSION = "1.0.0"

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


@dataclass(frozen=True)
class CommentaryPassage:
    """A commentary chunk for one passage ref."""

    ref: str
    text: str


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
# Gita (gita-bhashya), whose passages are slokas. When adding a new
# passage type used by a future grantha, add its PascalCase name here.
_PASSAGE_KINDS = frozenset({"Mantra", "Prefatory", "Concluding", "Para", "Verse"})
_PASSAGE_KINDS_ALT = "|".join(sorted(_PASSAGE_KINDS))

# Matches passage-level headings (Mantra, Para, Verse, Prefatory, Concluding).
# Group 1: kind, Group 2: ref, Group 3: optional devanagari label.
_PASSAGE_HEADING_RE = re.compile(
    rf"^# ({_PASSAGE_KINDS_ALT})(?::?\s+)(\S+)"
    r"(?:\s+\(devanagari:\s*\"([^\"]+)\"\))?",
    re.MULTILINE,
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

# Matches any Markdown level-1 heading that is NOT a passage heading and NOT a
# commentary heading within a passage segment.  Used to detect trailing section
# breaks (e.g. "# Appendix:") that should terminate the final passage segment
# rather than being swept into its content.
_SECTION_BREAK_RE = re.compile(
    rf"^# (?!{'|'.join(sorted(_PASSAGE_KINDS))}\b|Commentary:)\S",
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

    return "\n\n".join(results)


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
            # Strip any stray orphaned HTML comment tags (source data errors).
            cleaned = _RESIDUAL_HTML_COMMENT_RE.sub("", text).strip()
            if cleaned:
                grouped.setdefault(cid, []).append((heading_ref, cleaned))

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


def parse_body(text: str) -> BodyData:
    """Parse the body of a structured markdown file into structured data.

    Args:
        text: Body text (everything after the closing frontmatter ---).

    Returns:
        Populated BodyData instance.
    """
    text = _strip_hide_blocks(text)
    headings = list(_PASSAGE_HEADING_RE.finditer(text))
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
            for heading_ref, content in sub_passages:
                if heading_ref is not None:
                    data.commentary_blocks.setdefault(cid, []).append(
                        CommentaryPassage(ref=heading_ref, text=content)
                    )

    for i, match in enumerate(headings):
        kind = match.group(1)   # any _PASSAGE_KINDS member (e.g. Mantra | Para | Prefatory | Concluding)
        ref = match.group(2)
        label = match.group(3) or ""

        seg_start = match.end()
        if i + 1 < len(headings):
            seg_end = headings[i + 1].start()
        else:
            # For the final passage, stop at any non-passage/non-commentary
            # level-1 heading (e.g. "# Appendix:") to avoid sweeping trailing
            # editorial sections into the last passage's content.
            section_break = _SECTION_BREAK_RE.search(text, match.end())
            seg_end = section_break.start() if section_break else len(text)
        segment = text[seg_start:seg_end]

        mula_text = _extract_mula_text(segment)
        commentary_by_cid = _extract_commentary_blocks(segment)

        passage = PassageData(ref=ref, mula_text=mula_text, label_devanagari=label)

        if kind == "Prefatory":
            data.prefatory.append(passage)
        elif kind == "Concluding":
            data.concluding.append(passage)
        else:
            data.passages.append(passage)

        # Use each sub-heading's stated ref as the commentary passage ref.
        # Fall back to the containing mantra ref only when no sub-heading
        # is present (heading_ref is None) — the fallback handles the small
        # number of blocks in the corpus that carry no explicit heading.
        for cid, sub_passages in commentary_by_cid.items():
            for heading_ref, content in sub_passages:
                passage_ref = heading_ref if heading_ref is not None else ref
                data.commentary_blocks.setdefault(cid, []).append(
                    CommentaryPassage(ref=passage_ref, text=content)
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

    Args:
        p: The framing PassageData (prefatory or concluding).
        passage_type: Either ``"prefatory"`` or ``"concluding"``.

    Returns:
        Dict matching the v1.0.0 prefatory_material / concluding_material shape.
    """
    return {
        "ref": p.ref,
        "passage_type": passage_type,
        "label": {"devanagari": p.label_devanagari},
        "content": {"sanskrit": {"devanagari": p.mula_text}},
    }


def _build_main_passage_entry(p: PassageData) -> dict[str, Any]:
    """Build a main passages entry dict.

    Args:
        p: The main PassageData.

    Returns:
        Dict matching the v1.0.0 passages entry shape.
    """
    return {
        "ref": p.ref,
        "passage_type": "main",
        "content": {"sanskrit": {"devanagari": p.mula_text}},
    }


def build_part_json(
    frontmatter: dict[str, Any],
    body: BodyData,
    edition_id: str,
    target_commentary_id: str | None,
) -> dict[str, Any]:
    """Assemble the full part JSON dict for one source file.

    Args:
        frontmatter: Parsed YAML frontmatter dict.
        body: Parsed body data.
        edition_id: The edition_id to embed (equals grantha_id for
            single-edition texts; multi-edition texts pass the real edition id).
        target_commentary_id: The commentary_id to include, or None to omit.

    Returns:
        Dict conforming to the v1.0.0 part file schema.
    """
    grantha_id: str = frontmatter["grantha_id"]
    part_num: int = frontmatter["part_num"]

    prefatory = [
        _build_framing_entry(p, "prefatory") for p in body.prefatory if p.mula_text
    ]
    passages = [
        _build_main_passage_entry(p) for p in body.passages if p.mula_text
    ]
    concluding = [
        _build_framing_entry(p, "concluding") for p in body.concluding if p.mula_text
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

    # Commentary block — omitted when target_commentary_id is None or absent
    commentaries_meta: list[dict[str, Any]] | None = frontmatter.get("commentaries_metadata")
    if commentaries_meta and target_commentary_id:
        meta = next(
            (c for c in commentaries_meta if c["commentary_id"] == target_commentary_id),
            None,
        )
        raw_blocks = body.commentary_blocks.get(target_commentary_id, [])
        # Merge any duplicate-ref blocks arising from split commentary tags in source.
        cid_blocks = _merge_duplicate_ref_passages(raw_blocks)
        if meta and cid_blocks:
            commentary_passages = [
                {
                    "ref": cp.ref,
                    "content": {"sanskrit": {"devanagari": cp.text}},
                }
                for cp in cid_blocks
                if cp.text
            ]
            if commentary_passages:
                result["commentary"] = {
                    "commentary_id": target_commentary_id,
                    "commentary_title": meta.get("commentary_title", ""),
                    "commentator": meta.get("commentator", {}),
                    "passages": commentary_passages,
                }

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

def _resolve_target_commentary_id(
    frontmatter: dict[str, Any],
    grantha_id: str,
) -> str | None:
    """Determine the target commentary_id for a source file.

    Args:
        frontmatter: Parsed frontmatter dict for the file.
        grantha_id: The grantha_id of the text being processed.

    Returns:
        The commentary_id string to include, or None if no commentary applies.
    """
    commentaries_meta: list[dict[str, Any]] | None = frontmatter.get("commentaries_metadata")
    if not commentaries_meta:
        return None  # Mula-only part (e.g. kaushitaki part 2)

    if grantha_id == AITAREYA_GRANTHA_ID:
        return AITAREYA_TARGET_COMMENTARY_ID

    # All other texts: use the commentary_id from the file's own frontmatter
    # (preserving per-file variation rather than normalizing).
    return commentaries_meta[0]["commentary_id"]


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

    Args:
        body: Parsed body data.

    Returns:
        The ref string of body.passages[0].

    Raises:
        ValueError: If body.passages is empty.
    """
    if not body.passages:
        raise ValueError("Part has no main passages; cannot determine first_ref")
    return body.passages[0].ref


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
        body = parse_body(body_text)

        grantha_id: str = frontmatter["grantha_id"]
        edition_id = grantha_id  # Single-edition: edition_id == grantha_id

        if first_frontmatter is None:
            first_frontmatter = frontmatter
            structure_levels_raw = frontmatter.get("structure_levels", [])

        target_cid = _resolve_target_commentary_id(frontmatter, grantha_id)

        # Aitareya: collect Sayana text from prefatory passage and defer it
        if grantha_id == AITAREYA_GRANTHA_ID:
            _handle_aitareya_sayana(body, grantha_explorer_root)

        part_json = build_part_json(frontmatter, body, edition_id, target_cid)

        out_path = out_dir / part_filename
        out_path.write_text(
            json.dumps(part_json, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        first_ref = _first_main_ref(body)
        parts_info.append({"file": part_filename, "first_ref": first_ref})
        print(f"      first_ref={first_ref}, passages={len(body.passages)}, "
              f"commentary={bool(part_json.get('commentary'))}")

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
