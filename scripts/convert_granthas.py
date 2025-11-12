# File: scripts/convert_granthas.py
#
# Description:
# This script serves as a crucial part of the data pipeline for the Grantha Explorer application.
# Its primary purpose is to convert a collection of specially formatted Markdown files (`*.converted.md`)
# into a series of structured JSON files, referred to as "grantha parts" (`part*.json`).
#
# The script operates on a directory of Markdown files, processing them in a sorted order to
# ensure that the resulting parts are numbered sequentially and correctly. Each Markdown file
# is expected to contain YAML frontmatter and a body with passages, commentaries, and other
# materials, which are parsed and transformed according to the logic in `md_to_json.py`.
#
# The output is a set of JSON files, each representing a "part" of a larger grantha, conforming
# to the `grantha-part.schema.json` schema. These files are then used by the application's
# front-end to display the grantha content.
#
# Command-line arguments:
#   - input_dir: The directory containing the source `*.converted.md` files.
#   - output_dir: The destination directory where the `part*.json` files will be saved.
#
# Example usage:
#   python scripts/convert_granthas.py granthas/vishvas-brh/ public/data/library/brihadaranyaka-upanishad/
#
import argparse
import glob
import json
import os
import re
import sys

# Add the project root to the Python path to allow importing from the 'tools' directory.
# This is necessary because the script is located in a subdirectory and needs to access
# modules in a sibling directory.
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(script_dir)
sys.path.insert(0, project_root)

from tools.grantha_converter.md_to_json import convert_to_json

def convert_md_to_part_json(md_filepath, part_num):
    """
    Converts a single Markdown file into a structured dictionary that represents a "grantha part".

    This function reads a Markdown file, sanitizes it by removing hidden content,
    parses the remaining content (including frontmatter and body), and transforms it
    into a JSON object that adheres to the `grantha-part.schema.json` schema.

    Args:
        md_filepath (str): The path to the input Markdown file.
        part_num (int): The sequential number for this part of the grantha.

    Returns:
        dict: A dictionary representing the grantha part, ready for JSON serialization.
    """
    print(f"Converting {md_filepath} to part {part_num}...")
    with open(md_filepath, 'r', encoding='utf-8') as f:
        markdown = f.read()

    # Sanitize the markdown by removing any content wrapped in <!-- hide --> tags.
    # This ensures that editor meta-comments do not end up in the final JSON data.
    sanitized_markdown = re.sub(r'<!--\s*hide\s*-->.*?<!--\s*/hide\s*-->', '', markdown, flags=re.DOTALL)

    # The `convert_to_json` function handles the heavy lifting of parsing the Markdown
    # and its frontmatter into a structured Python dictionary.
    full_grantha_data = convert_to_json(sanitized_markdown)

    # The full data is then filtered and restructured to fit the "part" schema.
    # This ensures that only the necessary fields are included in the final part file.
    part_data = {
        "grantha_id": full_grantha_data.get("grantha_id"),
        "part_num": part_num,
        "prefatory_material": full_grantha_data.get("prefatory_material", []),
        "passages": full_grantha_data.get("passages", []),
        "concluding_material": full_grantha_data.get("concluding_material", []),
        "commentaries": full_grantha_data.get("commentaries", [])
    }
    print(f"  - Conversion successful.")
    return part_data

def main():
    """
    Main function to orchestrate the conversion of a directory of Markdown files.

    It parses command-line arguments for input and output directories, finds all
    `*.converted.md` files, and processes them in a sorted order to generate
    sequentially numbered `part*.json` files.
    """
    parser = argparse.ArgumentParser(
        description="Convert a directory of markdown files into a series of grantha part JSON files."
    )
    parser.add_argument("input_dir", help="Directory containing the markdown files.")
    parser.add_argument("output_dir", help="Directory to save the output JSON files.")
    args = parser.parse_args()

    if not os.path.isdir(args.input_dir):
        print(f"Error: Input directory not found at {args.input_dir}", file=sys.stderr)
        return

    # Ensure the output directory exists before writing files.
    os.makedirs(args.output_dir, exist_ok=True)

    # Use glob to find all relevant markdown files and sort them alphabetically.
    # Sorting is critical to ensure that `part1.json`, `part2.json`, etc., are created
    # in the correct, predictable order.
    md_filepaths = sorted(glob.glob(os.path.join(args.input_dir, '*converted.md')))

    if not md_filepaths:
        print(f"Warning: No '*converted.md' files found in {args.input_dir}")
        return

    print(f"Found {len(md_filepaths)} markdown files to convert.")

    for i, md_filepath in enumerate(md_filepaths):
        part_num = i + 1
        part_json = convert_md_to_part_json(md_filepath, part_num)

        output_filename = f"part{part_num}.json"
        output_filepath = os.path.join(args.output_dir, output_filename)

        with open(output_filepath, 'w', encoding='utf-8') as f:
            # `ensure_ascii=False` is important for correctly serializing Devanagari and other non-ASCII characters.
            json.dump(part_json, f, ensure_ascii=False, indent=2)
        print(f"  - Saved to {output_filepath}")

    print("\nConversion process complete.")

if __name__ == "__main__":
    main()
