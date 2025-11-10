import argparse
import re
import yaml
from pathlib import Path
from typing import List, Dict, Any, Optional

# Conditional import for dual execution mode
try:
    from .hasher import hash_text
except ImportError:
    from hasher import hash_text


# --- Verification Logic (Remains largely the same, but now expects to work) ---
def _get_passage_number_from_text(text: str) -> Optional[int]:
    match = re.search(r"।।\s*(\d+)\s*।।", text)
    if match:
        return int(match.group(1))
    return None


def _is_decorative_text(text: str) -> bool:
    """Checks if the given text block is purely decorative."""
    decorative_patterns = [
        r"^\s*(\*\*){0,2}।।\s*श्रीः\s*।।(\*\*){0,2}\s*$",  # ।। श्रीः ।। with optional bolding
        r"^\s*\*{4,}\s*$",  # **** or more asterisks
        r"^\s*(\*\*){0,2}\[उपक्रमशान्तिपाठः\](\*\*){0,2}\s*$",  # [उपक्रमशान्तिपाठः] with optional bolding
        r"^\s*(\*\*){0,2}हरिः ओम्(\*\*){0,2}\s*$",  # हरिः ओम् with optional bolding
    ]
    for pattern in decorative_patterns:
        if re.search(pattern, text, re.MULTILINE):
            return True
    return False


def _extract_sanskrit_from_raw_semantically(
    parser_instance: "RawParser", debug=False
) -> List[str]:
    # This function now uses the same robust block identification as the main parser
    blocks = parser_instance._lex_blocks(parser_instance.raw_content, debug=debug)

    content_parts = []
    is_prefatory_zone = True
    for block in blocks:
        if block["type"] == "brahmana":
            is_prefatory_zone = False

        if block["type"] == "decorative":  # Explicitly skip decorative blocks
            continue

        if block["type"] in ["mula", "commentary"] or (
            block["type"] == "shanti" and is_prefatory_zone
        ):
            content_parts.append(
                parser_instance._clean_text(block["content"], block["type"])
            )
    return content_parts


def _extract_sanskrit_from_structured(structured_md_string: str) -> List[str]:
    content_parts = []
    pattern = r"<!-- sanskrit:devanagari -->\n(.*?)(?=\n\n<!--|\n\n##|\n\n###|\Z)"
    matches = re.findall(pattern, structured_md_string, re.DOTALL)
    for match in matches:
        content_parts.append(match.strip())
    return content_parts


def verify_sanskrit_integrity(
    parser_instance: "RawParser", structured_content: str, debug=False
):
    print("\n--- Verifying Devanagari Content Integrity ---")
    raw_parts = _extract_sanskrit_from_raw_semantically(parser_instance, debug=debug)
    structured_parts = _extract_sanskrit_from_structured(structured_content)

    raw_combined = "".join(raw_parts)
    structured_combined = "".join(structured_parts)

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


# --- The New "Lex-and-Parse" Parser ---


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

    def _clean_text(self, text: str, block_type: str) -> str:
        text = re.sub(r"।।\s*\d+\s*।।", "", text, flags=re.MULTILINE).strip()
        text = text.replace("**", "")
        if block_type == "commentary":
            text = text.lstrip("प्र.–").strip()
        return text

    def _lex_blocks(self, raw_md_content: str, debug=False) -> List[Dict[str, Any]]:
        """Stage 1: Lexing. Identify all semantic blocks and their types."""
        if debug:
            print("\n--- STAGE 1: LEXING (Block Identification) ---")

        # Split by double newlines, which is a more reliable paragraph separator
        raw_blocks = re.split(r"\n{2,}", raw_md_content)

        semantic_blocks = []
        current_multiline_block = None
        current_multiline_type = None

        for block in raw_blocks:
            clean_block = block.strip()
            if not clean_block:
                continue

            # Heuristics to identify block types
            is_mula_indicator = clean_block.startswith("**")
            is_commentary_indicator = clean_block.startswith("प्र.–")
            has_passage_number = _get_passage_number_from_text(clean_block) is not None
            is_brahmana = "ब्राह्मणम्" in clean_block
            is_chapter = "ऽध्यायः" in clean_block
            is_shanti = "शान्तिः" in clean_block  # Changed from "शान्तिपाठः"
            is_decorative = _is_decorative_text(clean_block)

            # If we are currently accumulating a multi-line block
            if current_multiline_block:
                current_multiline_block += "\n\n" + clean_block
                if has_passage_number:
                    # This block completes the multi-line block
                    semantic_blocks.append(
                        {
                            "type": current_multiline_type,
                            "content": current_multiline_block,
                        }
                    )
                    if debug:
                        print(
                            f"  [APPEND MULTI-END] Type: {current_multiline_type}, Content: '{current_multiline_block[:40]}...'"
                        )
                    current_multiline_block = None
                    current_multiline_type = None
                else:
                    # Continue accumulating
                    if debug:
                        print(
                            f"  [MULTI-CONTINUE] Type: {current_multiline_type}, Content: '{clean_block[:40]}...'"
                        )
                continue  # Move to the next raw block

            # New block identification
            if is_decorative:
                semantic_blocks.append({"type": "decorative", "content": clean_block})
                if debug:
                    print(
                        f"  [APPEND] Type: Decorative, Content: '{clean_block[:40]}...'"
                    )
            elif is_brahmana:
                semantic_blocks.append({"type": "brahmana", "content": clean_block})
                if debug:
                    print(f"  [APPEND] Type: Brahmana, Content: '{clean_block}'")
            elif is_chapter:
                semantic_blocks.append({"type": "chapter", "content": clean_block})
                if debug:
                    print(f"  [APPEND] Type: Chapter, Content: '{clean_block}'")
            elif is_shanti:
                semantic_blocks.append({"type": "shanti", "content": clean_block})
                if debug:
                    print(f"  [APPEND] Type: Shanti, Content: '{clean_block}'")
            elif is_mula_indicator and has_passage_number:
                semantic_blocks.append({"type": "mula", "content": clean_block})
                if debug:
                    print(f"  [APPEND] Type: Mula, Content: '{clean_block[:40]}...'")
            elif is_commentary_indicator and has_passage_number:
                semantic_blocks.append({"type": "commentary", "content": clean_block})
                if debug:
                    print(
                        f"  [APPEND] Type: Commentary, Content: '{clean_block[:40]}...'"
                    )
            elif (
                current_multiline_block is None and is_mula_indicator
            ):  # This is the start of a multi-paragraph Mula
                current_multiline_block = clean_block
                current_multiline_type = "mula"
                if debug:
                    print(
                        f"  [START MULTI] Type: Mula, Content: '{clean_block[:40]}...'"
                    )
            elif (
                current_multiline_block is None and is_commentary_indicator
            ):  # This is the start of a multi-paragraph Commentary
                current_multiline_block = clean_block
                current_multiline_type = "commentary"
                if debug:
                    print(
                        f"  [START MULTI] Type: Commentary, Content: '{clean_block[:40]}...'"
                    )
            else:
                # If it's not any of the above, and not part of a multi-line block, it's unknown
                semantic_blocks.append({"type": "unknown", "content": clean_block})
                if debug:
                    print(f"  [APPEND] Type: Unknown, Content: '{clean_block[:40]}...'")

        # If a multi-line block was started but not ended (e.g., file ends abruptly)
        if current_multiline_block:
            semantic_blocks.append(
                {"type": current_multiline_type, "content": current_multiline_block}
            )
            if debug:
                print(
                    f"  [APPEND MULTI-UNENDED] Type: {current_multiline_type}, Content: '{current_multiline_block[:40]}...'"
                )

        return semantic_blocks

    def parse(self, raw_md_content: str):
        """Stage 2: Parsing. Process the stream of lexed blocks."""
        self.raw_content = raw_md_content  # Store raw content for later verification
        blocks = self._lex_blocks(raw_md_content, debug=self.debug)
        if self.debug:
            print("\n--- STAGE 2: PARSING (Structuring) ---")

        is_parsing_prefatory = True
        for block in blocks:
            kind = block["type"]
            value = block["content"]

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
            elif kind == "mula":
                self.state["mantra"] += 1
                ref = f"{self.state['adhyaya']}.{self.state['brahmana']}.{self.state['mantra']}"
                self.passages.append(
                    {"ref": ref, "content": self._clean_text(value, "mula")}
                )
                self.last_mula_ref = ref
            elif kind == "commentary":
                if self.last_mula_ref:
                    ref = self.last_mula_ref
                    if ref not in self.commentaries:
                        self.commentaries[ref] = []
                    self.commentaries[ref].append(
                        {
                            "id": self.commentary_id,
                            "content": self._clean_text(value, "commentary"),
                        }
                    )
            elif kind == "shanti":
                if is_parsing_prefatory:
                    ref = (
                        f"{self.state['adhyaya']}.0.{len(self.prefatory_passages) + 1}"
                    )
                    self.prefatory_passages.append(
                        {"ref": ref, "content": self._clean_text(value, "shanti")}
                    )
                # else: ignore shanti blocks that are not prefatory
            elif kind == "decorative":  # Ignore decorative blocks
                pass

    def generate_structured_md(self) -> str:
        # This function remains the same as it was mostly correct
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
        output = [f"---\n{yaml_str}---\n"]
        if self.prefatory_passages:
            output.append("# Prefatory Material\n")
            for p in self.prefatory_passages:
                output.extend(
                    [
                        f"## Passage {p['ref']}",
                        "<!-- sanskrit:devanagari -->",
                        p["content"],
                        "",
                    ]
                )
        current_brahmana = 0
        for p in self.passages:
            ref = p["ref"]
            brahmana_num = int(ref.split(".")[1])
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
            if ref in self.commentaries:
                for comm in self.commentaries[ref]:
                    output.extend(
                        [
                            f'<!-- commentary: {{"commentary_id": "{comm["id"]}", "passage_ref": "{ref}"}} -->',
                            f"### Commentary: {self.commentator_name}",
                            "<!-- sanskrit:devanagari -->",
                            comm["content"],
                            "",
                        ]
                    )
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

    # ... (main logic remains the same) ...
    input_path, output_path = Path(args.input), Path(args.output)
    part_num_map = {
        "trtiya": 3,
        "catur": 4,
        "paJcama": 5,
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
        parser_instance.raw_content = (
            raw_content  # Store raw_content in the parser instance
        )
        if args.debug:
            parser_instance.debug = True
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
