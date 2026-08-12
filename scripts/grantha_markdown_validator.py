#!/usr/bin/env python3
import argparse
import os
import re
import sys
from typing import List, Dict, Tuple
import yaml

# Regex patterns for different heading types
# Main passage headings match any passage type word (Mantra, Para, etc.)
# followed by a ref. Prefatory/Concluding/Commentary carry a colon after the
# keyword, so they never match this generic pattern.
# Captures: 1=word (passage type), 2=ref
HEADING_MAIN_PASSAGE = re.compile(r'^#\s+(\w+)\s+([\d\.-]+)$')
# Captures: 1=ref, 2=script, 3=label
HEADING_PREFATORY = re.compile(r'^#\s+Prefatory:\s+([\d\.]+)\s+\((\w+):\s*"(.*?)"\)$')
# Captures: 1=ref, 2=script, 3=label
HEADING_CONCLUDING = re.compile(r'^#\s+Concluding:\s+([\d\.]+)\s+\((\w+):\s*"(.*?)"\)$')
# Captures: 1=ref
HEADING_COMMENTARY = re.compile(r'^#\s+Commentary:\s+([\d\.-]+)$')

# Regex for content blocks
CONTENT_BLOCK_START = re.compile(r'^<!--\s*sanskrit:(\w+)\s*-->$')
CONTENT_BLOCK_END = re.compile(r'^<!--\s*/sanskrit:(\w+)\s*-->$')
COMMENTARY_METADATA = re.compile(r'^<!--\s*commentary:\s*(.*?)\s*-->$')

class ValidationError(Exception):
    """Custom exception for validation errors."""
    def __init__(self, message, line_num=None):
        self.line_num = line_num
        if line_num:
            super().__init__(f"Line {line_num}: {message}")
        else:
            super().__init__(message)

def validate_frontmatter(frontmatter: Dict) -> List[str]:
    """Validates the YAML frontmatter."""
    errors = []
    required_fields = [
        "grantha_id", "part_num", "canonical_title", "text_type",
        "language", "structure_levels"
    ]
    for field in required_fields:
        if field not in frontmatter:
            errors.append(f"Missing required frontmatter field: '{field}'")

    if "part_num" in frontmatter and not isinstance(frontmatter["part_num"], int):
        errors.append("'part_num' must be an integer.")

    # text_type must be one of the known values. Keep in sync with the
    # canonical enum in grantha.schema.json (a read-only mirror of
    # grantha-data/formats/schemas/grantha.schema.json — see SCHEMAS.md).
    valid_text_types = [
        "upanishad",
        "smriti",
        "sutra",
        "purana",
        "stotra",
        "prakarana",
        "brahma-sutra-bhashya",
        "gita-bhashya",
        "other",
    ]
    if "text_type" in frontmatter and frontmatter["text_type"] not in valid_text_types:
        errors.append(
            f"Invalid text_type: '{frontmatter['text_type']}' "
            f"(must be one of: {', '.join(valid_text_types)})"
        )

    # author and commentaries_metadata are mutually exclusive
    has_author = "author" in frontmatter
    has_commentaries = "commentaries_metadata" in frontmatter
    if has_author and has_commentaries:
        errors.append(
            "'author' and 'commentaries_metadata' are mutually exclusive; "
            "a file may carry the original composer (author) or commentary "
            "edition metadata (commentaries_metadata), but not both."
        )

    if has_author:
        author = frontmatter["author"]
        if not isinstance(author, dict):
            errors.append("'author' must be a mapping with a 'devanagari' key.")
        elif "devanagari" not in author or not isinstance(author["devanagari"], str):
            errors.append("'author.devanagari' is required and must be a string.")
        elif not author["devanagari"].strip():
            errors.append("'author.devanagari' must not be empty.")

    return errors

def validate_markdown_file(filepath: str) -> List[str]:
    """
    Validates a single Grantha Markdown file against the specification.
    Returns a list of error messages.
    """
    errors = []
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        if not content.startswith('---'):
            raise ValidationError("File must start with YAML frontmatter.", line_num=1)

        parts = content.split('---', 2)
        if len(parts) < 3:
            raise ValidationError("YAML frontmatter is not properly closed with '---'.")

        frontmatter_str, body = parts[1], parts[2]
        try:
            frontmatter = yaml.safe_load(frontmatter_str)
            fm_errors = validate_frontmatter(frontmatter)
            if fm_errors:
                errors.extend(fm_errors)
        except yaml.YAMLError as e:
            raise ValidationError(f"Invalid YAML in frontmatter: {e}")

        lines = body.split('\n')
        
        # First pass: Collect all passage_refs
        passage_refs = set()
        for i, line in enumerate(lines):
            line = line.strip()
            for pattern, name, ref_group in [
                (HEADING_MAIN_PASSAGE, "MainPassage", 2),
                (HEADING_PREFATORY, "Prefatory", 1),
                (HEADING_CONCLUDING, "Concluding", 1)
            ]:
                match = pattern.match(line)
                if match:
                    ref = match.group(ref_group)
                    if ref in passage_refs:
                        line_num = i + frontmatter_str.count('\n') + 3
                        errors.append(f"Line {line_num}: Duplicate passage ref '{ref}' found.")
                    passage_refs.add(ref)

        # Second pass: Full validation
        in_content_block = False
        expected_closing_script = None
        last_line_was_commentary_meta = False

        for i, line in enumerate(lines):
            line_num = i + frontmatter_str.count('\n') + 3
            line = line.strip()

            if in_content_block:
                match = CONTENT_BLOCK_END.match(line)
                if match:
                    if match.group(1) != expected_closing_script:
                        errors.append(f"Line {line_num}: Mismatched content block end tag. Expected '{expected_closing_script}', got '{match.group(1)}'.")
                    in_content_block = False
                    expected_closing_script = None
                continue

            if not line:
                continue

            is_valid_line = False

            # Check for headings
            heading_match = None
            for pattern, name, ref_group in [
                (HEADING_MAIN_PASSAGE, "MainPassage", 2),
                (HEADING_PREFATORY, "Prefatory", 1),
                (HEADING_CONCLUDING, "Concluding", 1),
                (HEADING_COMMENTARY, "Commentary", 1)
            ]:
                match = pattern.match(line)
                if match:
                    heading_match = (match, name, ref_group)
                    break

            if heading_match:
                is_valid_line = True
                match, name, ref_group = heading_match
                ref = match.group(ref_group)

                if name == "Commentary":
                    if not last_line_was_commentary_meta:
                        errors.append(f"Line {line_num}: Commentary heading is missing a preceding metadata comment.")
                    
                    # Check if the exact commentary reference exists as a mantra heading
                    if ref in passage_refs:
                        pass # Valid, exact mantra heading found
                    elif '-' in ref:
                        # If exact match not found, and it's a range, try expanding it to check for individual mantras
                        try:
                            base, range_part = ref.rsplit('.', 1)
                            start_str, end_str = range_part.split('-')
                            start, end = int(start_str), int(end_str)
                            
                            for j in range(start, end + 1):
                                individual_ref = f"{base}.{j}"
                                if individual_ref not in passage_refs:
                                    errors.append(f"Line {line_num}: Commentary for ranged ref '{ref}' is missing a corresponding passage for '{individual_ref}'.")
                        except ValueError:
                            errors.append(f"Line {line_num}: Invalid range format in commentary ref '{ref}'.")
                    else: # Single reference, and not found in passage_refs
                        errors.append(f"Line {line_num}: Commentary for ref '{ref}' has no corresponding passage.")
                
                last_line_was_commentary_meta = False

            if last_line_was_commentary_meta and not HEADING_COMMENTARY.match(line):
                errors.append(f"Line {line_num-1}: Commentary metadata comment must be immediately followed by a Commentary heading.")
                last_line_was_commentary_meta = False

            if is_valid_line:
                continue

            # Check for commentary metadata
            meta_match = COMMENTARY_METADATA.match(line)
            if meta_match:
                is_valid_line = True
                last_line_was_commentary_meta = True
                try:
                    import json
                    meta_json = json.loads(meta_match.group(1))
                    if 'commentary_id' not in meta_json:
                        errors.append(f"Line {line_num}: Commentary metadata is missing 'commentary_id'.")
                except (json.JSONDecodeError, yaml.YAMLError):
                    errors.append(f"Line {line_num}: Invalid JSON in commentary metadata.")
                continue

            # Check for content block start
            content_match = CONTENT_BLOCK_START.match(line)
            if content_match:
                is_valid_line = True
                in_content_block = True
                expected_closing_script = content_match.group(1)
                continue

            if not is_valid_line:
                errors.append(f"Line {line_num}: Unrecognized line or invalid heading format: '{line}'")

        if in_content_block:
            errors.append(f"File Error: Reached end of file while inside an unclosed content block for script '{expected_closing_script}'.")
    except FileNotFoundError:
        errors.append(f"File not found at path: {filepath}")
    except ValidationError as e:
        errors.append(str(e))
    except Exception as e:
        errors.append(f"An unexpected error occurred: {e}")

    return errors


def main():
    parser = argparse.ArgumentParser(
        description="Validate a Grantha Markdown file against the specification."
    )
    parser.add_argument(
        "filepath",
        help="Path to the markdown file to validate."
    )
    args = parser.parse_args()

    print(f"Validating {args.filepath}...")
    errors = validate_markdown_file(args.filepath)
    if errors:
        print("Validation failed with the following errors:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        sys.exit(1)
    else:
        print("Validation successful!")


if __name__ == "__main__":
    main()
