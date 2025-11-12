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

def convert_md_to_part_json(md_filepath):
    """
    Converts a single Markdown file into a structured dictionary that represents a "grantha part".

    This function reads a Markdown file, sanitizes it by removing hidden content,
    parses the remaining content (including frontmatter and body), and transforms it
    into a JSON object that adheres to the `grantha-part.schema.json` schema.

    Args:
        md_filepath (str): The path to the input Markdown file.

    Returns:
        dict: A dictionary representing the grantha part, ready for JSON serialization.
    """
    print(f"Converting {md_filepath}...")
    with open(md_filepath, 'r', encoding='utf-8') as f:
        markdown = f.read()

    # Sanitize the markdown by removing any content wrapped in <!-- hide --> tags.
    sanitized_markdown = re.sub(r'<!--\s*hide\s*-->.*?<!--\s*/hide\s*-->', '', markdown, flags=re.DOTALL)

    # The `convert_to_json` function handles the heavy lifting of parsing the Markdown
    # and its frontmatter into a structured Python dictionary.
    full_grantha_data = convert_to_json(sanitized_markdown)

    # The part_num is now read directly from the frontmatter.
    part_num = full_grantha_data.get("part_num")
    if not part_num:
        raise ValueError(f"Mandatory 'part_num' not found in frontmatter of {md_filepath}")

    # The full data is then filtered and restructured to fit the "part" schema.
    part_data = {
        "grantha_id": full_grantha_data.get("grantha_id"),
        "part_num": part_num,
        "prefatory_material": full_grantha_data.get("prefatory_material", []),
        "passages": full_grantha_data.get("passages", []),
        "concluding_material": full_grantha_data.get("concluding_material", []),
        "commentaries": full_grantha_data.get("commentaries", [])
    }
    print(f"  - Conversion successful for part {part_num}.")
    return part_data

def main():
    """
    Main function to orchestrate the conversion of a single Markdown file.

    It parses command-line arguments for a single input and output file and converts it.
    """
    parser = argparse.ArgumentParser(
        description="Convert a single markdown file into a grantha part JSON file."
    )
    parser.add_argument("input_file", help="Path to the input markdown file.")
    parser.add_argument("output_file", help="Path to save the output JSON file.")
    args = parser.parse_args()

    if not os.path.isfile(args.input_file):
        print(f"Error: Input file not found at {args.input_file}", file=sys.stderr)
        return

    # Ensure the output directory exists.
    output_dir = os.path.dirname(args.output_file)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    part_json = convert_md_to_part_json(args.input_file)

    with open(args.output_file, 'w', encoding='utf-8') as f:
        json.dump(part_json, f, ensure_ascii=False, indent=2)
    print(f"  - Saved to {args.output_file}")

    print("\nConversion process complete.")

if __name__ == "__main__":
    main()
