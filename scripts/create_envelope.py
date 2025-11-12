import argparse
import json
import os
import glob
from datetime import datetime, timezone
from validate_grantha_integrity import validate_grantha_directory

def create_envelope_file(parts_dir, output_filepath):
    """
    Generates a grantha envelope file from a directory of part files.
    """
    if not os.path.isdir(parts_dir):
        print(f"Error: Parts directory not found at {parts_dir}")
        return

    # Find all part files and sort them numerically
    part_files = sorted(
        glob.glob(os.path.join(parts_dir, 'part*.json')),
        key=lambda f: int(os.path.basename(f).replace('part', '').replace('.json', ''))
    )

    if not part_files:
        print(f"No 'part*.json' files found in {parts_dir}")
        return

    part_details = []
    for part_file in part_files:
        with open(part_file, 'r', encoding='utf-8') as f:
            part_data = json.load(f)
            adhyayas = sorted(list(set([int(p['ref'].split('.')[0]) for p in part_data.get('passages', [])])))
            part_details.append({
                "file": os.path.basename(part_file),
                "adhyayas": adhyayas
            })

    grantha_id = "brihadaranyaka-upanishad" # Hardcoded for this task

    envelope_data = {
        "grantha_id": grantha_id,
        "canonical_title": "बृहदारण्यकोपनिषत्",
        "aliases": [],
        "text_type": "upanishad",
        "language": "sanskrit",
        "metadata": {
            "source_file": "granthas/vishvas-brh/",
            "processing_pipeline": {
                "processor": "convert_granthas.py"
            },
            "quality_notes": "Envelope file generated automatically.",
            "last_updated": datetime.now(timezone.utc).isoformat()
        },
        "structure_levels": [
            {
                "key": "Adhyaya",
                "scriptNames": {"devanagari": "अध्यायः"},
                "children": [
                    {
                        "key": "Brahmana",
                        "scriptNames": {"devanagari": "ब्राह्मणम्"},
                        "children": [
                            {"key": "Mantra", "scriptNames": {"devanagari": "मन्त्रः"}}
                        ]
                    }
                ]
            }
        ],
        "variants_available": [],
        "parts": part_details
    }

    # Ensure the output directory exists
    os.makedirs(os.path.dirname(output_filepath), exist_ok=True)

    with open(output_filepath, 'w', encoding='utf-8') as f:
        json.dump(envelope_data, f, ensure_ascii=False, indent=2)

    print(f"Successfully created envelope file at: {output_filepath}")
    print(f"It contains references to {len(part_details)} part files.")

    # Automatically run validation after creating the file
    errors = []
    validate_grantha_directory(parts_dir, errors)
    if errors:
        print("\n--- Validation Failed on newly created file! Errors found: ---")
        for error in errors:
            print(f"- {error}")
    else:
        print("\n--- Validation Successful on newly created file! ---")

def main():
    parser = argparse.ArgumentParser(
        description="Create a grantha envelope JSON file from a directory of part files."
    )
    parser.add_argument(
        "parts_dir",
        help="The directory containing the JSON part files (e.g., part1.json)."
    )
    parser.add_argument(
        "output_file",
        help="The full path for the output envelope JSON file."
    )
    args = parser.parse_args()

    create_envelope_file(args.parts_dir, args.output_file)

if __name__ == "__main__":
    main()
