#!/usr/bin/env python3
"""
Convert mundaka.json from simple format to claude-designed format.

This script converts the nested structure in simple/data/mundaka.json to the flat
structure required by claude-designed, conforming to grantha.schema.json
"""

import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Set

# Paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
SOURCE_FILE = PROJECT_ROOT.parent / "simple" / "data" / "mundaka.json"
OUTPUT_FILE = PROJECT_ROOT / "public" / "data" / "library" / "mundaka-upanishad.json"
SCHEMA_FILE = PROJECT_ROOT / "schemas" / "grantha.schema.json"


def load_json(file_path: Path) -> Dict[str, Any]:
    """Load JSON file."""
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_json(data: Dict[str, Any], file_path: Path) -> None:
    """Save JSON file with pretty formatting."""
    file_path.parent.mkdir(parents=True, exist_ok=True)
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def extract_shanti_patha(content_list: List[Dict]) -> tuple[List[Dict], List[Dict]]:
    """
    Extract shanti patha (mantra 0) as prefatory material.
    Returns (prefatory_material, main_content)
    """
    prefatory = []
    main_content = []

    for item in content_list:
        if item.get("type") == "Mundaka":
            # Look for mantra 0 in first khanda
            children = item.get("children", [])
            if children and children[0].get("type") == "Khanda":
                mantras = children[0].get("children", [])
                for mantra in mantras:
                    if mantra.get("number") == 0:
                        # This is shanti patha
                        ref = f"{item['number']}.0"
                        prefatory.append({
                            "ref": ref,
                            "passage_type": "prefatory",
                            "content": {
                                "sanskrit": {
                                    "devanagari": mantra.get("text", ""),
                                    "roman": None,
                                    "kannada": None
                                },
                                "english_translation": None
                            },
                            "label": {
                                "devanagari": "शान्तिः"
                            }
                        })
            main_content.append(item)
        else:
            main_content.append(item)

    return prefatory, main_content


def extract_passages_and_commentary(
    content_list: List[Dict],
    grantha_name: str
) -> tuple[List[Dict], List[Dict]]:
    """
    Extract passages and commentary from nested structure.

    Returns (passages, commentary_passages)
    """
    passages = []
    commentary_passages = []

    for mundaka in content_list:
        if mundaka.get("type") != "Mundaka":
            continue

        mundaka_num = mundaka["number"]

        for khanda in mundaka.get("children", []):
            if khanda.get("type") != "Khanda":
                continue

            khanda_num = khanda["number"]

            for mantra in khanda.get("children", []):
                if mantra.get("type") != "Mantra":
                    continue

                mantra_num = mantra["number"]

                # Skip mantra 0 (shanti patha, already in prefatory)
                if mantra_num == 0:
                    continue

                ref = f"{mundaka_num}.{khanda_num}.{mantra_num}"

                # Main passage
                passages.append({
                    "ref": ref,
                    "passage_type": "main",
                    "content": {
                        "sanskrit": {
                            "devanagari": mantra.get("text", ""),
                            "roman": None,
                            "kannada": None
                        },
                        "english_translation": None
                    }
                })

                # Commentary passage
                commentary_text = mantra.get("commentary_text", "")
                if commentary_text:
                    commentary_passages.append({
                        "ref": ref,
                        "content": {
                            "sanskrit": {
                                "devanagari": commentary_text,
                                "roman": None,
                                "kannada": None
                            },
                            "english": ""
                        }
                    })

    return passages, commentary_passages


def validate_no_data_loss(source: Dict, passages: List[Dict], commentary_passages: List[Dict]) -> bool:
    """
    Validate that no text data was lost in conversion.

    Returns True if validation passes, False otherwise.
    """
    print("\n=== Validation Report ===\n")

    # Count source mantras (excluding mantra 0)
    source_mantra_count = 0
    source_text_chars = 0
    source_commentary_chars = 0

    for mundaka in source.get("content", []):
        for khanda in mundaka.get("children", []):
            for mantra in khanda.get("children", []):
                if mantra.get("number") != 0:  # Exclude shanti patha
                    source_mantra_count += 1
                    source_text_chars += len(mantra.get("text", ""))
                    source_commentary_chars += len(mantra.get("commentary_text", ""))

    # Count target passages
    target_mantra_count = len(passages)
    target_text_chars = sum(len(p["content"]["sanskrit"]["devanagari"]) for p in passages)
    target_commentary_count = len(commentary_passages)
    target_commentary_chars = sum(len(p["content"]["sanskrit"]["devanagari"]) for p in commentary_passages)

    # Validation
    all_valid = True

    print(f"Source mantras (excluding शान्तिः): {source_mantra_count}")
    print(f"Target passages: {target_mantra_count}")
    if source_mantra_count == target_mantra_count:
        print("✅ Mantra count matches")
    else:
        print(f"❌ Mantra count mismatch: {source_mantra_count} → {target_mantra_count}")
        all_valid = False

    print(f"\nSource mantra text characters: {source_text_chars}")
    print(f"Target passage text characters: {target_text_chars}")
    if source_text_chars == target_text_chars:
        print("✅ Mantra text character count matches")
    else:
        print(f"❌ Character count mismatch: {source_text_chars} → {target_text_chars}")
        all_valid = False

    print(f"\nSource commentary characters: {source_commentary_chars}")
    print(f"Target commentary characters: {target_commentary_chars}")
    if source_commentary_chars == target_commentary_chars:
        print("✅ Commentary character count matches")
    else:
        print(f"❌ Commentary character count mismatch: {source_commentary_chars} → {target_commentary_chars}")
        all_valid = False

    # Check for duplicate refs
    refs = [p["ref"] for p in passages]
    if len(refs) == len(set(refs)):
        print(f"\n✅ No duplicate refs ({len(refs)} unique refs)")
    else:
        print(f"\n❌ Duplicate refs found")
        all_valid = False

    # Check ref format
    import re
    ref_pattern = re.compile(r'^\d+\.\d+\.\d+$')
    invalid_refs = [ref for ref in refs if not ref_pattern.match(ref)]
    if not invalid_refs:
        print("✅ All refs follow pattern M.K.M")
    else:
        print(f"❌ Invalid refs found: {invalid_refs}")
        all_valid = False

    print(f"\n{'='*50}")
    if all_valid:
        print("✅ VALIDATION PASSED: No data loss detected")
    else:
        print("❌ VALIDATION FAILED: Data loss or format issues detected")
    print(f"{'='*50}\n")

    return all_valid


def convert_mundaka() -> int:
    """
    Main conversion function.

    Returns 0 on success, 1 on failure.
    """
    print(f"Converting {SOURCE_FILE} to {OUTPUT_FILE}")

    # Load source
    try:
        source_data = load_json(SOURCE_FILE)
    except FileNotFoundError:
        print(f"Error: Source file not found: {SOURCE_FILE}")
        return 1
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in source file: {e}")
        return 1

    # Extract prefatory material (shanti patha)
    prefatory_material, main_content = extract_shanti_patha(source_data.get("content", []))

    # Extract passages and commentary
    passages, commentary_passages = extract_passages_and_commentary(
        main_content,
        source_data.get("text_name", "मुण्डकोपनिषत्")
    )

    # Validate
    if not validate_no_data_loss(source_data, passages, commentary_passages):
        print("\nWarning: Validation failed but continuing with conversion...")

    # Build hierarchical structure_levels
    # Source has flat array: [Mundaka, Khanda, Mantra]
    # Target needs nested: Mundaka -> Khanda -> Mantra
    source_levels = source_data.get("structure_levels", [])
    structure_levels = []

    if len(source_levels) >= 3:
        # Mundaka -> Khanda -> Mantra
        structure_levels = [
            {
                "key": source_levels[0]["key"],
                "scriptNames": source_levels[0]["scriptNames"],
                "children": [
                    {
                        "key": source_levels[1]["key"],
                        "scriptNames": source_levels[1]["scriptNames"],
                        "children": [
                            {
                                "key": source_levels[2]["key"],
                                "scriptNames": source_levels[2]["scriptNames"]
                            }
                        ]
                    }
                ]
            }
        ]

    # Build target structure
    target_data = {
        "grantha_id": "mundaka-upanishad",
        "canonical_title": source_data.get("text_name", "मुण्डकोपनिषत्"),
        "aliases": [
            {
                "alias": "Mundaka Upanishad",
                "scope": "full_text"
            },
            {
                "alias": "Mundakopanishad",
                "scope": "full_text"
            }
        ],
        "text_type": "upanishad",
        "language": "sanskrit",
        "metadata": {
            "source_url": None,
            "source_commit": None,
            "source_file": "../../simple/data/mundaka.json",
            "processing_pipeline": {
                "llm_model": "n/a",
                "llm_prompt_version": "n/a",
                "llm_date": datetime.now().strftime("%Y-%m-%d"),
                "processor": "convert-mundaka.py"
            },
            "quality_notes": "Converted from simple format. Includes commentary by Vedanta Desika.",
            "last_updated": datetime.now().isoformat() + "Z"
        },
        "structure_levels": structure_levels,
        "variants_available": [],
        "prefatory_material": prefatory_material,
        "passages": passages,
        "concluding_material": [],
        "commentaries": [
            {
                "commentary_id": "vedanta-desika",
                "commentary_title": "वेदान्तदेशिकीयभाष्यम्",
                "commentator": {
                    "devanagari": "वेदान्तदेशिकः",
                    "latin": "Vedanta Desika"
                },
                "metadata": {
                    "source_file": "../../simple/data/mundaka.json"
                },
                "passages": commentary_passages
            }
        ] if commentary_passages else []
    }

    # Save output
    save_json(target_data, OUTPUT_FILE)
    print(f"\n✅ Conversion complete: {OUTPUT_FILE}")
    print(f"   - {len(prefatory_material)} prefatory passages")
    print(f"   - {len(passages)} main passages")
    print(f"   - {len(commentary_passages)} commentary passages")

    return 0


if __name__ == "__main__":
    sys.exit(convert_mundaka())
