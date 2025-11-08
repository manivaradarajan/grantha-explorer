"""Command-line interface for grantha converter.

This module provides a CLI for converting between JSON and Markdown formats.
"""

import argparse
import sys
from pathlib import Path
from typing import List, Optional

from .json_to_md import json_file_to_markdown_file, convert_to_markdown
from .md_to_json import markdown_file_to_json_file
from .hasher import hash_grantha


def parse_scripts(scripts_str: Optional[str]) -> List[str]:
    """Parse comma-separated scripts string.

    Args:
        scripts_str: Comma-separated script names (e.g., "devanagari,roman")

    Returns:
        List of script names
    """
    if not scripts_str:
        return ['devanagari']

    scripts = [s.strip() for s in scripts_str.split(',')]
    valid_scripts = {'devanagari', 'roman', 'kannada'}

    for script in scripts:
        if script not in valid_scripts:
            print(f"Warning: Unknown script '{script}'. Valid scripts: {', '.join(valid_scripts)}")

    return scripts


def parse_commentaries(commentaries_str: Optional[str]) -> Optional[List[str]]:
    """Parse comma-separated commentaries string.

    Args:
        commentaries_str: Comma-separated commentary IDs

    Returns:
        List of commentary IDs or None
    """
    if not commentaries_str:
        return None

    return [c.strip() for c in commentaries_str.split(',')]


def verify_files(json_path: str, md_path: str) -> bool:
    """Verify that JSON and MD files have matching content.

    Args:
        json_path: Path to JSON file
        md_path: Path to Markdown file

    Returns:
        True if hashes match, False otherwise
    """
    import json
    import yaml
    import re

    # Load JSON
    with open(json_path, 'r', encoding='utf-8') as f:
        json_data = json.load(f)

    # Load MD and extract frontmatter
    with open(md_path, 'r', encoding='utf-8') as f:
        md_content = f.read()

    # Parse frontmatter
    match = re.match(r'^---\n(.*?)\n---\n', md_content, re.DOTALL)
    if not match:
        print("Error: No frontmatter found in markdown file")
        return False

    frontmatter = yaml.safe_load(match.group(1))

    # Get scripts and commentaries from frontmatter
    scripts = frontmatter.get('scripts', ['devanagari'])
    commentaries = frontmatter.get('commentaries', None)

    # Calculate hash of JSON with same parameters
    json_hash = hash_grantha(json_data, scripts=scripts, commentaries=commentaries)

    # Get expected hash from frontmatter
    expected_hash = frontmatter.get('validation_hash', '').replace('sha256:', '')

    return json_hash == expected_hash


def cmd_json2md(args):
    """Convert JSON to Markdown."""
    import json

    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        print(f"Error: Input file not found: {input_path}")
        sys.exit(1)

    if not input_path.suffix == '.json':
        print(f"Warning: Input file doesn't have .json extension: {input_path}")

    scripts = parse_scripts(args.scripts)
    commentaries = parse_commentaries(args.commentaries)

    # Handle --all-commentaries flag
    if args.all_commentaries:
        try:
            with open(input_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            if 'commentaries' in data and data['commentaries']:
                commentaries = [c['commentary_id'] for c in data['commentaries']]
                print(f"Found {len(commentaries)} commentaries in source file")
            else:
                print("Warning: No commentaries found in source file")
                commentaries = None
        except Exception as e:
            print(f"Error reading source file for commentary detection: {e}")
            sys.exit(1)

    try:
        print(f"Converting {input_path} to {output_path}...")
        print(f"  Scripts: {', '.join(scripts)}")
        if commentaries:
            print(f"  Commentaries: {', '.join(commentaries)}")
        else:
            print(f"  Commentaries: none (core text only)")

        json_file_to_markdown_file(
            str(input_path),
            str(output_path),
            scripts=scripts,
            commentaries=commentaries
        )

        print(f"✓ Successfully converted to {output_path}")

        # Verify if requested
        if args.verify:
            print("\nVerifying conversion...")
            verify_result = verify_files(str(input_path), str(output_path))
            if verify_result:
                print("✓ Verification passed - content hashes match")
            else:
                print("✗ Verification failed - content mismatch detected")
                sys.exit(1)

    except Exception as e:
        print(f"Error during conversion: {e}")
        sys.exit(1)


def cmd_md2json(args):
    """Convert Markdown to JSON."""
    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        print(f"Error: Input file not found: {input_path}")
        sys.exit(1)

    if not input_path.suffix == '.md':
        print(f"Warning: Input file doesn't have .md extension: {input_path}")

    try:
        print(f"Converting {input_path} to {output_path}...")

        markdown_file_to_json_file(
            str(input_path),
            str(output_path)
        )

        print(f"✓ Successfully converted to {output_path}")
        print("✓ Validation hash verified - no data loss detected")

    except ValueError as e:
        if "Validation hash mismatch" in str(e):
            print(f"✗ Validation failed: {e}")
            print("\nThis indicates data corruption or loss during conversion.")
            print("Please check the markdown file for errors.")
            sys.exit(1)
        else:
            raise

    except Exception as e:
        print(f"Error during conversion: {e}")
        sys.exit(1)


def cmd_verify(args):
    """Verify that JSON and Markdown files match."""
    json_path = Path(args.json)
    md_path = Path(args.markdown)

    if not json_path.exists():
        print(f"Error: JSON file not found: {json_path}")
        sys.exit(1)

    if not md_path.exists():
        print(f"Error: Markdown file not found: {md_path}")
        sys.exit(1)

    try:
        print(f"Verifying {json_path} ↔ {md_path}...")

        if verify_files(str(json_path), str(md_path)):
            print("✓ Files match - content hashes are identical")
            print("  The markdown accurately represents the JSON content")
        else:
            print("✗ Files do NOT match - content differs")
            print("  The markdown may have been edited or uses different parameters")
            sys.exit(1)

    except Exception as e:
        print(f"Error during verification: {e}")
        sys.exit(1)


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description='Grantha JSON ↔ Markdown Converter',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Convert JSON to Markdown (core text only, Devanagari script)
  python -m tools.grantha_converter.cli json2md -i data.json -o data.md

  # Include multiple scripts
  python -m tools.grantha_converter.cli json2md -i data.json -o data.md \\
    --scripts devanagari,roman

  # Include specific commentary
  python -m tools.grantha_converter.cli json2md -i data.json -o data.md \\
    --commentaries vedanta-desika

  # Convert Markdown back to JSON
  python -m tools.grantha_converter.cli md2json -i data.md -o data-edited.json
        """
    )

    subparsers = parser.add_subparsers(dest='command', help='Command to execute')
    subparsers.required = True

    # json2md command
    json2md_parser = subparsers.add_parser(
        'json2md',
        help='Convert JSON to Markdown'
    )
    json2md_parser.add_argument(
        '-i', '--input',
        required=True,
        help='Input JSON file path'
    )
    json2md_parser.add_argument(
        '-o', '--output',
        required=True,
        help='Output Markdown file path'
    )
    json2md_parser.add_argument(
        '--scripts',
        default='devanagari',
        help='Comma-separated list of scripts to include (devanagari, roman, kannada). Default: devanagari'
    )
    json2md_parser.add_argument(
        '--commentaries',
        help='Comma-separated list of commentary IDs to include'
    )
    json2md_parser.add_argument(
        '--all-commentaries',
        action='store_true',
        help='Include all commentaries found in the source file'
    )
    json2md_parser.add_argument(
        '--verify',
        action='store_true',
        help='Verify the conversion by checking content hash'
    )
    json2md_parser.set_defaults(func=cmd_json2md)

    # md2json command
    md2json_parser = subparsers.add_parser(
        'md2json',
        help='Convert Markdown to JSON'
    )
    md2json_parser.add_argument(
        '-i', '--input',
        required=True,
        help='Input Markdown file path'
    )
    md2json_parser.add_argument(
        '-o', '--output',
        required=True,
        help='Output JSON file path'
    )
    md2json_parser.set_defaults(func=cmd_md2json)

    # verify command
    verify_parser = subparsers.add_parser(
        'verify',
        help='Verify that JSON and Markdown files match'
    )
    verify_parser.add_argument(
        '-j', '--json',
        required=True,
        help='JSON file path'
    )
    verify_parser.add_argument(
        '-m', '--markdown',
        required=True,
        help='Markdown file path'
    )
    verify_parser.set_defaults(func=cmd_verify)

    # Parse and execute
    args = parser.parse_args()
    args.func(args)


if __name__ == '__main__':
    main()
