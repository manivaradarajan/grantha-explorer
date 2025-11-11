import os
import re
import argparse

def add_commentary_id_to_file(filepath, commentary_id):
    """
    Reads a markdown file and adds a commentary_id to commentary metadata
    comments where it is missing.
    """
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Regex to find commentary comments missing the commentary_id
    # Example match: <!-- commentary: {"passage_ref": "1.2.3"} -->
    pattern = re.compile(r'(<!--\s*commentary:\s*{\s*)("passage_ref":\s*".*?"\s*})')

    # Use a function for replacement to preserve the matched passage_ref
    def replacer(match):
        return f'{match.group(1)}"commentary_id": "{commentary_id}", {match.group(2)}'

    new_content, num_replacements = pattern.subn(replacer, content)

    if num_replacements > 0:
        print(f"Updating {filepath}: Found and fixed {num_replacements} missing commentary_id(s).")
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
    else:
        print(f"No changes needed for {filepath}")

def main():
    parser = argparse.ArgumentParser(
        description="Add missing commentary_id to commentary metadata in markdown files."
    )
    parser.add_argument("input_dir", help="Directory containing the markdown files.")
    parser.add_argument("--commentary_id", default="ranga-ramanujamuni-prakashika", help="The commentary_id to add.")
    args = parser.parse_args()

    if not os.path.isdir(args.input_dir):
        print(f"Error: Input directory not found at {args.input_dir}")
        return

    for filename in os.listdir(args.input_dir):
        if filename.endswith(".converted.md"):
            filepath = os.path.join(args.input_dir, filename)
            add_commentary_id_to_file(filepath, args.commentary_id)

    print("\nProcessing complete.")

if __name__ == "__main__":
    main()
