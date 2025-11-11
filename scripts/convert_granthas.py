import argparse
import glob
import json
import os
import sys

# Add the parent directory of 'tools' to the Python path
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(script_dir)
sys.path.insert(0, project_root)

from tools.grantha_converter.md_to_json import convert_to_json, parse_frontmatter

def convert_md_to_part_json(md_filepath, part_num):
    """
    Converts a markdown file to a grantha part JSON object.
    """
    print(f"Converting {md_filepath} to part {part_num}...")
    with open(md_filepath, 'r', encoding='utf-8') as f:
        markdown = f.read()

    # Use the existing converter to get the full grantha dictionary
    full_grantha_data = convert_to_json(markdown)

    # Now, create a "part" dictionary that conforms to grantha-part.schema.json
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
    parser = argparse.ArgumentParser(
        description="Convert a directory of markdown files into a series of grantha part JSON files."
    )
    parser.add_argument("input_dir", help="Directory containing the markdown files.")
    parser.add_argument("output_dir", help="Directory to save the output JSON files.")
    args = parser.parse_args()

    if not os.path.isdir(args.input_dir):
        print(f"Error: Input directory not found at {args.input_dir}")
        return

    os.makedirs(args.output_dir, exist_ok=True)

    # Find and sort files to ensure correct part numbering
    md_filepaths = sorted(glob.glob(os.path.join(args.input_dir, '*converted.md')))

    if not md_filepaths:
        print(f"No '*converted.md' files found in {args.input_dir}")
        return

    for i, md_filepath in enumerate(md_filepaths):
        part_num = i + 1
        part_json = convert_md_to_part_json(md_filepath, part_num)

        output_filename = f"part{part_num}.json"
        output_filepath = os.path.join(args.output_dir, output_filename)

        with open(output_filepath, 'w', encoding='utf-8') as f:
            json.dump(part_json, f, ensure_ascii=False, indent=2)
        print(f"  - Saved to {output_filepath}")

    print("\nConversion process complete.")

if __name__ == "__main__":
    main()
