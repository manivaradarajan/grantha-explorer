import argparse
import json
import os
import glob
from datetime import datetime, timezone

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

    part_filenames = [os.path.basename(f) for f in part_files]
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
        "parts": part_filenames
    }

    # Ensure the output directory exists
    os.makedirs(os.path.dirname(output_filepath), exist_ok=True)

    with open(output_filepath, 'w', encoding='utf-8') as f:
        json.dump(envelope_data, f, ensure_ascii=False, indent=2)

    print(f"Successfully created envelope file at: {output_filepath}")
    print(f"It contains references to {len(part_filenames)} part files.")

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
