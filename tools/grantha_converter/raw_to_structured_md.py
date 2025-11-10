import argparse
import re
import yaml
from pathlib import Path
from typing import List, Dict, Any, Optional

try:
    from .hasher import hash_text
except ImportError:
    from hasher import hash_text

# --- Helper Functions (from your test suite) ---


def _get_passage_number_from_text(text: str) -> Optional[int]:
    match = re.search(r"।।\s*(\d+)\s*।।", text)
    return int(match.group(1)) if match else None


def _is_decorative_text(text: str) -> bool:
    decorative_patterns = [
        r"^\s*(\*\*){0,2}।।\s*श्रीः\s*।।(\*\*){0,2}\s*$",
        r"^\s*\*{4,}\s*$",
        r"^\s*(\*\*){0,2}\[.*?\](\*\*){0,2}\s*$",  # General metadata in brackets
        r"^\s*(\*\*){0,2}हरिः\s*ओम्(\*\*){0,2}\s*$",
    ]
    # If the text is short and doesn't have semantic markers, it's likely decorative
    if (
        len(text) < 50
        and not text.startswith("प्र.–")
        and not _get_passage_number_from_text(text)
    ):
        for pattern in decorative_patterns:
            if re.fullmatch(pattern, text.strip()):
                return True
    return False


# --- Verification Logic ---


def _clean_sanskrit_text_for_hashing(text: str) -> str:
    # Remove passage numbers like ।। 1 ।।
    text = re.sub(r"।।\s*\d+\s*।।", "", text, flags=re.MULTILINE).strip()
    # Remove bold markdown
    text = text.replace("**", "")
    # Remove commentary prefix (handles -, –, — and optional space)
    text = re.sub(r"^प्र\.\s*[-–—]\s*", "", text).strip()
    # Remove decorative bracketed text like [प्राणविद्या–ज्येष्ठ श्रेष्ठप्राणविद्या]
    text = re.sub(r"\[.*?\]", "", text).strip()
    return text


def _extract_sanskrit_from_raw_semantically(
    parser: "RawParser", debug=False
) -> List[str]:
    content_parts = []
    for block in parser.semantic_blocks:
        # Only process mula and commentary blocks for hashing
        if block["type"] in [
            "mula",
            "commentary",
            "shanti",
        ]:  # shanti is also semantic content
            content_parts.append(_clean_sanskrit_text_for_hashing(block["content"]))
    return content_parts


def _extract_sanskrit_from_structured(structured_md_string: str) -> List[str]:
    content_parts = []
    pattern = r"<!-- sanskrit:devanagari -->\n(.*?)(?=\n\n<!--|\n\n##|\n\n###|\Z)"
    matches = re.findall(pattern, structured_md_string, re.DOTALL)
    for match in matches:
        content_parts.append(_clean_sanskrit_text_for_hashing(match.strip()))
    return content_parts


def verify_sanskrit_integrity(
    parser: "RawParser", structured_content: str, debug=False
):
    print("\n--- Verifying Devanagari Content Integrity ---")
    raw_parts = _extract_sanskrit_from_raw_semantically(parser, debug=debug)
    structured_parts = _extract_sanskrit_from_structured(structured_content)
    raw_combined = "".join(raw_parts)
    structured_combined = "".join(structured_parts)

    if debug:
        Path("debug_raw_combined.txt").write_text(raw_combined, encoding="utf-8")
        Path("debug_structured_combined.txt").write_text(
            structured_combined, encoding="utf-8"
        )
        Path("debug_raw_parts.txt").write_text(
            "\n---\n".join(raw_parts), encoding="utf-8"
        )
        Path("debug_structured_parts.txt").write_text(
            "\n---\n".join(structured_parts), encoding="utf-8"
        )

    raw_hash = hash_text(raw_combined)
    structured_hash = hash_text(structured_combined)

    if raw_hash != structured_hash:
        print(f"  Source Hash:      {raw_hash}")
        print(f"  Destination Hash: {structured_hash}")
        Path("debug_raw_sanskrit.txt").write_text(
            "\n---\n".join(raw_parts), encoding="utf-8"
        )
        Path("debug_structured_sanskrit.txt").write_text(
            "\n---\n".join(structured_parts), encoding="utf-8"
        )
        raise ValueError(
            "FATAL: Devanagari content hash mismatch. Halting. Check debug files."
        )
    print("✓ Devanagari content hash matches. Integrity confirmed.")


# --- The "Lex-and-Parse" Parser ---


class RawParser:
    def __init__(
        self, grantha_id: str, part_num: int, commentary_id: str = "rangaramanuja"
    ):
        self.grantha_id = grantha_id
        self.part_num = part_num
        self.commentary_id = commentary_id
        self.commentator_name = "रङ्गरामानुजमुनिः"
        self.state = {"adhyaya": part_num, "brahmana": 0, "mantra": 0}
        self.last_mula_ref: Optional[str] = None
        self.prefatory_passages: List[Dict] = []
        self.passages: List[Dict] = []
        self.commentaries: Dict[str, List[Dict]] = {}
        self.structure_nodes: List[Dict] = []
        self.chapter_name = ""
        self.debug = False
        self.raw_content = ""
        self.semantic_blocks: List[Dict] = []

    def _clean_text(self, text: str, block_type: str) -> str:
        text = re.sub(r"।।\s*\d+\s*।।", "", text, flags=re.MULTILINE).strip()
        text = text.replace("**", "")
        if block_type == "commentary":
            # Remove commentary prefix (handles -, –, — and optional space)
            text = re.sub(r"^प्र\.\s*[-–—]\s*", "", text).strip()
        return text

    def _lex_blocks(self, raw_md_content: str, debug=False) -> None:
        """Stage 1: Lexing. Identify all semantic blocks and their types."""
        if debug:
            print("\n--- STAGE 1: LEXING (Block Identification) ---")

        raw_paragraphs = [
            p.strip() for p in re.split(r"\n{2,}", raw_md_content) if p.strip()
        ]

        self.semantic_blocks = []  # Initialize here
        current_multiline_content = []
        current_multiline_type = None

        for paragraph in raw_paragraphs:
            # CORRECTED: More robust commentary check by cleaning the string first
            # and using a flexible regex for dash types (-, –, —).
            cleaned_for_check = re.sub(r"\*", "", paragraph)
            is_commentary_start = bool(re.match(r"^\s*प्र\.\s*[-–—]", cleaned_for_check))
            is_mula_start = paragraph.startswith("**")

            has_passage_number = _get_passage_number_from_text(paragraph) is not None
            is_brahmana = "ब्राह्मणम्" in paragraph and len(paragraph) < 100
            is_chapter = "ऽध्यायः" in paragraph and len(paragraph) < 100
            is_decorative = _is_decorative_text(paragraph)
            is_shanti = "पूर्णमदः" in paragraph and "पूर्णमेवावशिष्यते" in paragraph

            paragraph_type = "unknown"  # Default to unknown

            # CORRECTED: Reordered the if/elif chain to check for commentary first.
            if is_decorative:
                paragraph_type = "decorative"
            elif is_chapter:
                paragraph_type = "chapter"
            elif is_brahmana:
                paragraph_type = "brahmana"
            elif is_shanti:
                paragraph_type = "shanti"
            elif is_commentary_start:  # CHECK THIS FIRST
                paragraph_type = "commentary"
            elif is_mula_start:  # THEN CHECK THIS
                paragraph_type = "mula"
            else:
                # Heuristic for continuations: If we're already in a multi-line
                # commentary block, and this new block doesn't start a
                # different recognized type, assume it's a continuation.
                # This handles multi-paragraph commentaries that may or may not
                # contain Devanagari in every paragraph.
                if current_multiline_type == "commentary":
                    paragraph_type = "commentary"
                # Fallback heuristic for a commentary that's missing the
                # 'प्र.–' prefix but contains Devanagari.
                elif re.search(r"[\u0900-\u097F]", paragraph):
                    paragraph_type = "commentary"

            if current_multiline_type is not None:
                # If the current paragraph is of the same type, continue accumulating
                if paragraph_type == current_multiline_type:
                    current_multiline_content.append(paragraph)
                    if debug:
                        print(
                            f"  [LEXED] Type: {current_multiline_type} (multi-continue), Content: '{paragraph[:40]}...'"
                        )

                    # If this paragraph has a passage number, it marks the end of this multiline block
                    if has_passage_number:
                        self.semantic_blocks.append(
                            {
                                "type": current_multiline_type,
                                "content": "\n\n".join(current_multiline_content),
                            }
                        )
                        if debug:
                            print(
                                f"  [LEXED] Type: {current_multiline_type} (multi-end with num), Content: '{current_multiline_content[0][:40]}...'"
                            )
                        current_multiline_content = []
                        current_multiline_type = None
                else:
                    # Type changed, so finalize the previous multiline block
                    self.semantic_blocks.append(
                        {
                            "type": current_multiline_type,
                            "content": "\n\n".join(current_multiline_content),
                        }
                    )
                    if debug:
                        print(
                            f"  [LEXED] Type: {current_multiline_type} (multi-end, type change), Content: '{current_multiline_content[0][:40]}...'"
                        )
                    current_multiline_content = []
                    current_multiline_type = None

                    # Now, start a new block (either multiline or single)
                    if (
                        paragraph_type in ["mula", "commentary"]
                        and not has_passage_number
                    ):
                        current_multiline_content.append(paragraph)
                        current_multiline_type = paragraph_type
                        if debug:
                            print(
                                f"  [LEXED] Type: {current_multiline_type} (multi-start new), Content: '{paragraph[:40]}...'"
                            )
                    else:
                        self.semantic_blocks.append(
                            {"type": paragraph_type, "content": paragraph}
                        )
                        if debug:
                            print(
                                f"  [LEXED] Type: {paragraph_type}, Content: '{paragraph[:40]}...'"
                            )
            else:
                # No active multiline block
                if paragraph_type in ["mula", "commentary"] and not has_passage_number:
                    # Start a new multiline block
                    current_multiline_content.append(paragraph)
                    current_multiline_type = paragraph_type
                    if debug:
                        print(
                            f"  [LEXED] Type: {current_multiline_type} (multi-start), Content: '{paragraph[:40]}...'"
                        )
                else:
                    # Add as a single semantic block
                    self.semantic_blocks.append(
                        {"type": paragraph_type, "content": paragraph}
                    )
                    if debug:
                        print(
                            f"  [LEXED] Type: {paragraph_type}, Content: '{paragraph[:40]}...'"
                        )

        # Finalize any remaining multiline block after the loop
        if current_multiline_type is not None:
            self.semantic_blocks.append(
                {
                    "type": current_multiline_type,
                    "content": "\n\n".join(current_multiline_content),
                }
            )
            if debug:
                print(
                    f"  [LEXED] Type: {current_multiline_type} (multi-end, final), Content: '{current_multiline_content[0][:40]}...'"
                )

    def parse(self, raw_md_content: str):
        self.raw_content = raw_md_content
        self._lex_blocks(
            self.raw_content, debug=self.debug
        )  # Call lexer to populate semantic_blocks
        if self.debug:
            print("\n--- STAGE 2: PARSING (Structuring) ---")

        is_parsing_prefatory = self.state["brahmana"] == 0
        for block in self.semantic_blocks:  # Iterate through semantic_blocks
            kind, value = block["type"], block["content"]
            if self.debug:
                print(f"  Processing block of type: {kind}")

            if kind == "chapter":
                self.chapter_name = value
            elif kind == "brahmana":
                is_parsing_prefatory = False
                self.state["brahmana"] += 1
                self.state["mantra"] = 0
                self.structure_nodes.append(
                    {
                        "key": f"{self.state['adhyaya']}.{self.state['brahmana']}",
                        "name": value,
                    }
                )
            elif kind == "mula" or kind == "shanti":
                passage_number_from_text = _get_passage_number_from_text(
                    value
                )  # Keep this for potential metadata
                if (
                    not is_parsing_prefatory
                ):  # Only increment mantra count for main passages
                    self.state["mantra"] += 1
                    ref = f"{self.state['adhyaya']}.{self.state['brahmana']}.{self.state['mantra']}"
                    self.last_mula_ref = ref
                    self.passages.append(
                        {"ref": ref, "content": self._clean_text(value, kind)}
                    )
                elif is_parsing_prefatory:
                    # This is a prefatory passage
                    ref = (
                        f"{self.state['adhyaya']}.0.{len(self.prefatory_passages) + 1}"
                    )
                    self.prefatory_passages.append(
                        {"ref": ref, "content": self._clean_text(value, kind)}
                    )
                else:
                    # This case should ideally not happen if all main mulablocks have numbers
                    # For robustness, we'll add it to main passages, but it might indicate a formatting issue
                    print(
                        f"Warning: Mula/Shanti block without number found in main body: {value[:50]}..."
                    )
                    self.state[
                        "mantra"
                    ] += 1  # Increment mantra count even if no number found
                    ref = f"{self.state['adhyaya']}.{self.state['brahmana']}.{self.state['mantra']}"
                    self.last_mula_ref = ref
                    self.passages.append(
                        {"ref": ref, "content": self._clean_text(value, kind)}
                    )
            elif kind == "commentary":
                # Commentary always marks the end of prefatory zone if not already
                is_parsing_prefatory = False
                if self.last_mula_ref:
                    if self.last_mula_ref not in self.commentaries:
                        self.commentaries[self.last_mula_ref] = []
                    self.commentaries[self.last_mula_ref].append(
                        {
                            "id": self.commentary_id,
                            "content": self._clean_text(value, "commentary"),
                        }
                    )

    def generate_structured_md(self) -> str:
        if self.debug:
            print("\n--- STAGE 3: GENERATING STRUCTURED MARKDOWN (Non-Interleaved) ---")

        structure_tree = {
            "key": str(self.part_num),
            "scriptNames": {
                "devanagari": self.chapter_name
                or f"{_to_devanagari_numeral(self.part_num)}ोऽध्यायः"
            },
            "children": [
                {
                    "key": n["key"],
                    "scriptNames": {"devanagari": n["name"]},
                    "children": [],
                }
                for n in self.structure_nodes
            ],
        }
        frontmatter = {
            "grantha_id": self.grantha_id,
            "part_num": self.part_num,
            "canonical_title": "बृहदारण्यकोपनिषत्",
            "text_type": "upanishad",
            "language": "sanskrit",
            "scripts": ["devanagari"],
            "structure_levels": [structure_tree],
            "commentaries": [self.commentary_id],
            "commentaries_metadata": [
                {
                    "commentary_id": self.commentary_id,
                    "commentator": {
                        "devanagari": self.commentator_name,
                        "latin": "Raṅgarāmānuja Muni",
                    },
                    "commentary_title": "बृहदारण्यकोपनिषत् प्रकाशिका",
                }
            ],
        }
        yaml_str = yaml.dump(
            frontmatter, allow_unicode=True, sort_keys=False, width=120
        )

        output = [f"---\n{yaml_str}---"]

        if self.prefatory_passages:
            output.extend(["", "# Prefatory Material", ""])
            for p in self.prefatory_passages:
                label_json = yaml.dump(
                    {"devanagari": f"Prefatory {p['ref']}"}, allow_unicode=True
                ).strip()
                output.extend(
                    [
                        f"<!-- prefatory_item_{len(output)}: {label_json} -->",
                        f"## Passage {p['ref']}",
                        "<!-- sanskrit:devanagari -->",
                        p["content"],
                        "",
                    ]
                )

        current_brahmana = 0
        for p in self.passages:
            ref, brahmana_num = p["ref"], int(p["ref"].split(".")[1])
            if brahmana_num != current_brahmana:
                current_brahmana = brahmana_num
                brahmana_name = next(
                    (
                        n["name"]
                        for n in self.structure_nodes
                        if n["key"] == f"{self.part_num}.{current_brahmana}"
                    ),
                    "",
                )
                if brahmana_name:
                    output.extend([f"# {brahmana_name}", ""])
            output.extend(
                [f"## Mantra {ref}", "<!-- sanskrit:devanagari -->", p["content"], ""]
            )

        if self.commentaries:
            output.extend(["# Commentary", ""])
            sorted_refs = sorted(
                self.commentaries.keys(), key=lambda r: list(map(int, r.split(".")))
            )
            for ref in sorted_refs:
                for comm in self.commentaries[ref]:
                    metadata_json = yaml.dump(
                        {"commentary_id": comm["id"], "passage_ref": ref},
                        allow_unicode=True,
                    ).strip()
                    output.extend(
                        [
                            f"<!-- commentary: {metadata_json} -->",
                            f"## Commentary on {ref} ({self.commentator_name})",
                            "<!-- sanskrit:devanagari -->",
                            comm["content"],
                            "",
                        ]
                    )

        if self.debug:
            print("  Successfully assembled structured markdown content.")
        return "\n".join(output)


def _to_devanagari_numeral(n):
    names = {3: "तृतीय", 4: "चतुर्थ", 5: "पञ्चम", 6: "षष्ठ", 7: "सप्तम", 8: "अष्टम"}
    return names.get(n, str(n))


def main():
    parser = argparse.ArgumentParser(
        description="Convert raw Grantha Markdown to structured Markdown."
    )
    parser.add_argument(
        "-i", "--input", required=True, help="Input raw Markdown file path."
    )
    parser.add_argument(
        "-o", "--output", required=True, help="Output structured Markdown file path."
    )
    parser.add_argument(
        "--grantha-id",
        default="brihadaranyaka-upanishad",
        help="Grantha ID for the frontmatter.",
    )
    parser.add_argument(
        "--debug", action="store_true", help="Enable verbose debugging output."
    )
    args = parser.parse_args()
    input_path, output_path = Path(args.input), Path(args.output)
    part_num_map = {
        "trtiya": 3,
        "catur": 4,
        "pancama": 5,
        "sastho": 6,
        "saptama": 7,
        "astama": 8,
    }
    part_name_match = re.search(r"-([a-zA-Z]+)\.md", str(input_path))
    if not part_name_match:
        raise ValueError(f"Could not parse part name from filename: {input_path.name}")
    part_name = part_name_match.group(1).lower().replace("sat", "")
    part_num = part_num_map.get(part_name)
    if part_num is None:
        raise ValueError(
            f"Could not determine part number from filename: {input_path.name}"
        )
    print(f"Processing {input_path.name} as Part {part_num} of {args.grantha_id}...")
    try:
        raw_content = input_path.read_text(encoding="utf-8")
        parser_instance = RawParser(grantha_id=args.grantha_id, part_num=part_num)
        parser_instance.debug = True  # Unconditionally set to True for debugging
        parser_instance.parse(raw_content)
        structured_output_string = parser_instance.generate_structured_md()
        verify_sanskrit_integrity(
            parser_instance, structured_output_string, debug=args.debug
        )
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(structured_output_string, encoding="utf-8")
        print(
            f"✓ Successfully converted and verified.\n✓ Output written to: {output_path}"
        )
    except Exception as e:
        print(f"✗ An error occurred: {e}")
        import traceback

        traceback.print_exc()
        exit(1)


if __name__ == "__main__":
    main()
