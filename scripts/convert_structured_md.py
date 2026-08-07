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

import argparse
import functools
import json
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SCHEMA_VERSION = "1.0.0"

__all__ = [
    "parse_frontmatter",
    "parse_body",
    "build_part_json",
    "build_envelope_json",
    "normalize_structure_levels",
    "convert_grantha",
    "append_sayana_deferred",
]

# For aitareya: index-0 commentary is Rangaramanuja, index-1 is Sayana.
AITAREYA_GRANTHA_ID = "aitareya-upanishad"
SAYANA_COMMENTARY_ID = "sayana-bhashya"
AITAREYA_TARGET_COMMENTARY_ID = "rangaramanuja-muni-prakashika"


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

# Matches passage-level headings (Mantra, Prefatory, Concluding).
# Group 1: kind, Group 2: ref, Group 3: optional devanagari label.
_PASSAGE_HEADING_RE = re.compile(
    r"^# (Mantra|Prefatory|Concluding)(?::?\s+)(\S+)"
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

# Commentary heading that appears inside a <!-- commentary --> block.
_COMMENTARY_HEADING_RE = re.compile(
    r"^#\s+Commentary:\s+\S+\s*$",
    re.MULTILINE,
)

# Opening <!-- sanskrit:devanagari --> tag.
_SANSKRIT_OPEN_RE = re.compile(r"<!--\s*sanskrit:devanagari\s*-->")

# Any HTML closing comment tag (<!-- /... -->).  Used as a fallback block
# boundary when the correct <!-- /sanskrit:devanagari --> closing tag is absent
# (source data quality issue observed in brihadaranyaka where some blocks are
# instead closed with a stray <!-- /hide --> tag).
_ANY_HTML_CLOSE_RE = re.compile(r"<!--\s*/[^>]+?-->")


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
    - Correct: ``<!-- /sanskrit:devanagari -->``
    - Malformed: any ``<!-- /... -->`` tag (e.g. stray ``<!-- /hide -->`` used
      as a closing boundary in some brihadaranyaka source files).

    Each Sanskrit block runs from its opening tag to the nearest closing
    HTML-comment tag or the start of the next Sanskrit block.

    Args:
        segment: Text between two passage headings.

    Returns:
        Concatenated mula text, or empty string if none found.
    """
    opens = list(_SANSKRIT_OPEN_RE.finditer(segment))
    closes = list(_ANY_HTML_CLOSE_RE.finditer(segment))

    results: list[str] = []
    for i, open_match in enumerate(opens):
        content_start = open_match.end()
        next_open_pos = (
            opens[i + 1].start() if i + 1 < len(opens) else len(segment)
        )
        # Use the first closing HTML-comment tag before the next open block.
        matching_close = next(
            (c for c in closes if content_start <= c.start() < next_open_pos),
            None,
        )
        content_end = matching_close.start() if matching_close else next_open_pos
        text = segment[content_start:content_end].strip()
        if text:
            results.append(text)

    return "\n\n".join(results)


def _extract_commentary_blocks(segment: str) -> dict[str, str]:
    """Extract commentary blocks from a segment, grouped by commentary_id.

    Handles two source variants:
    - Explicit close: ``<!-- commentary: ... -->...<!-- /commentary -->``
    - Implicit close: content runs to the next opening tag or end of segment
      (used in sources that omit the ``<!-- /commentary -->`` tag).

    Multiple blocks for the same commentary_id within one passage are
    joined with double newlines.

    Args:
        segment: Text between two passage headings (or end of body).

    Returns:
        Mapping from commentary_id to cleaned commentary text.
    """
    grouped: dict[str, list[str]] = {}
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
        # Content ends at the start of the next opening tag (implicit close),
        # or at the explicit close tag if one exists before the next open.
        next_open_pos = opens[i + 1].start() if i + 1 < len(opens) else len(segment)
        matching_close = next(
            (c for c in closes if content_start <= c.start() < next_open_pos),
            None,
        )
        content_end = matching_close.start() if matching_close else next_open_pos

        content = segment[content_start:content_end]
        # Remove the "# Commentary: X.Y.Z" heading that appears inside the block
        cleaned = _COMMENTARY_HEADING_RE.sub("", content).strip()
        if cleaned:
            grouped.setdefault(cid, []).append(cleaned)

    return {cid: "\n\n".join(chunks) for cid, chunks in grouped.items()}


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

    for i, match in enumerate(headings):
        kind = match.group(1)   # Mantra | Prefatory | Concluding
        ref = match.group(2)
        label = match.group(3) or ""

        seg_start = match.end()
        seg_end = headings[i + 1].start() if i + 1 < len(headings) else len(text)
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

        for cid, content in commentary_by_cid.items():
            data.commentary_blocks.setdefault(cid, []).append(
                CommentaryPassage(ref=ref, text=content)
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
        edition_id: The edition_id to embed (equals grantha_id for all texts).
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
        cid_blocks = body.commentary_blocks.get(target_commentary_id, [])
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
) -> dict[str, Any]:
    """Assemble the envelope JSON for the grantha.

    Args:
        parts_info: List of {"file": "partN.json", "first_ref": "..."} dicts.
        structure_levels: Normalized structure_levels array.
        frontmatter: Frontmatter from the first source file (for metadata).

    Returns:
        Dict conforming to the v1.0.0 envelope schema.
    """
    grantha_id: str = frontmatter["grantha_id"]
    canonical_title: str = frontmatter.get("canonical_title", "")
    return {
        "schema_version": SCHEMA_VERSION,
        "edition_id": grantha_id,
        "grantha_id": grantha_id,
        "canonical_title": canonical_title,
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
    """Append a Sayana-deferral note to DEFERRED.md.

    Args:
        sayana_text: The full Sayana commentary text for the passage.
        passage_ref: The passage ref (e.g. "0.0").
        grantha_explorer_root: Root of the grantha-explorer repo.
    """
    deferred_path = grantha_explorer_root / "DEFERRED.md"
    note = (
        "\n\n---\n\n"
        "## Aitareya Upanishad — Sayana Bhashya (deferred)\n\n"
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
        FileNotFoundError: If no .md files (other than BUILD) exist.
    """
    candidates = [p for p in source_dir.glob("*.md") if p.name != "BUILD"]
    if not candidates:
        raise FileNotFoundError(f"No .md files found in {source_dir}")

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
    envelope = build_envelope_json(parts_info, normalized_levels, first_frontmatter)

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
