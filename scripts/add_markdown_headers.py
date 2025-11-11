import argparse
import glob
import os
import re
from datetime import datetime, timezone
import yaml

def get_content_start(lines):
    """Find the index of the first line of markdown content."""
    for i, line in enumerate(lines):
        if line.strip().startswith('#'):
            return i
    return 0

def clean_up_file(filepath):
    """
    Cleans up a single converted.md file by replacing its frontmatter.
    """
    print(f"Processing {filepath}...")
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    # Find where the actual markdown content begins
    content_start_index = get_content_start(lines)
    content = "".join(lines[content_start_index:])

    # --- Create the new frontmatter ---
    filename = os.path.basename(filepath)
    match = re.match(r'(\d+)-(\d+)\.converted\.md', filename)
    if not match:
        print(f"  - Skipping, filename format not recognized.")
        return

    adhyaya, brahmana = match.groups()

    header_data = {
        'grantha_id': 'brihadaranyaka-upanishad',
        'canonical_title': 'बृहदारण्यकोपनिषत्',
        'part_title': f'Adhyaya {int(adhyaya)}, Brahmana {int(brahmana)}',
        'text_type': 'upanishad',
        'language': 'sanskrit',
        'structure_levels': [
            {
                'key': 'Adhyaya',
                'scriptNames': {'devanagari': 'अध्यायः'},
                'children': [
                    {
                        'key': 'Brahmana',
                        'scriptNames': {'devanagari': 'ब्राह्मणम्'},
                        'children': [
                            {'key': 'Mantra', 'scriptNames': {'devanagari': 'मन्त्रः'}}
                        ]
                    }
                ]
            }
        ],
        'aliases': [],
        'variants_available': [],
        'metadata': {
            'source_file': f'granthas/vishvas-brh/{filename}',
            'processing_pipeline': {'processor': 'md_to_json.py'},
            'quality_notes': 'Automatically generated from converted markdown.',
            'last_updated': datetime.now(timezone.utc).isoformat()
        }
    }

    # Use yaml.dump to create a nicely formatted frontmatter string
    # Dumper settings ensure good formatting and handling of unicode
    frontmatter_str = yaml.dump(
        header_data,
        allow_unicode=True,
        sort_keys=False,
        width=1000 # prevent line wrapping
    )

    new_content = f"---\n{frontmatter_str}---\n\n{content}"

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"  - Successfully added new header.")


def main():
    parser = argparse.ArgumentParser(
        description="Clean up converted.md files by adding proper YAML frontmatter."
    )
    parser.add_argument(
        "directory",
        help="The directory containing the *converted.md files."
    )
    args = parser.parse_args()

    if not os.path.isdir(args.directory):
        print(f"Error: Directory not found at {args.directory}")
        return

    # Find and sort files to process them in order
    filepaths = sorted(glob.glob(os.path.join(args.directory, '*converted.md')))

    if not filepaths:
        print(f"No '*converted.md' files found in {args.directory}")
        return

    for filepath in filepaths:
        clean_up_file(filepath)

    print("\nCleanup complete.")

if __name__ == "__main__":
    main()
