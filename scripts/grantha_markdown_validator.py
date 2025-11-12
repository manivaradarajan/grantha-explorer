#!/usr/bin/env python3
import argparse
import os
import re
import sys
from typing import List, Dict, Tuple
import yaml

# Regex patterns for different heading types
# Captures: 1=ref
HEADING_MANTRA = re.compile(r'^#\s+Mantra\s+([\d\.]+)$')
# Captures: 1=ref, 2=script, 3=label
HEADING_PREFATORY = re.compile(r'^###\s+PREFATORY:\s+([\d\.]+)\s+\((\w+):\s*"(.*?)"\)$')
# Captures: 1=ref, 2=script, 3=label
HEADING_CONCLUDING = re.compile(r'^###\s+CONCLUDING:\s+([\d\.]+)\s+\((\w+):\s*"(.*?)"\)$')
# Captures: 1=ref
HEADING_COMMENTARY = re.compile(r'^###\s+COMMENTARY:\s+([\d\.]+)$')

# Regex for content blocks
CONTENT_BLOCK_START = re.compile(r'^<!--\s*sanskrit:(\w+)\s*-->$')
CONTENT_BLOCK_END = re.compile(r'^<!--\s*/sanskrit:(\w+)\s*-->$')

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
        "language", "structure_levels", "commentaries_metadata"
    ]
    for field in required_fields:
        if field not in frontmatter:
            errors.append(f"Missing required frontmatter field: '{field}'")

    if "part_num" in frontmatter and not isinstance(frontmatter["part_num"], int):
        errors.append("'part_num' must be an integer.")

    return errors

def validate_markdown_file(filepath: str) -> List[str]:
    """
    Validates a single Grantha Markdown file against the specification.
    Returns a list of error messages.
    """
    errors = []
    passage_refs = set()
    commentary_refs = []

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        # 1. Validate Frontmatter
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

        # 2. Validate Body
        lines = body.split('\n')
        in_content_block = False
        expected_closing_script = None

        for i, line in enumerate(lines):
            line_num = i + frontmatter_str.count('\n') + 3  # Adjust line number

            if in_content_block:
                match = CONTENT_BLOCK_END.match(line.strip())
                if match:
                    if match.group(1) != expected_closing_script:
                        errors.append(f"Line {line_num}: Mismatched content block end tag. Expected '{expected_closing_script}', got '{match.group(1)}'.")
                    in_content_block = False
                    expected_closing_script = None
                continue

            line = line.strip()
            if not line:
                continue

            # Check for valid headings
            is_heading = False
            for pattern, name in [
                (HEADING_MANTRA, "Mantra"),
                (HEADING_PREFATORY, "Prefatory"),
                (HEADING_CONCLUDING, "Concluding"),
                (HEADING_COMMENTARY, "Commentary")
            ]:
                match = pattern.match(line)
                if match:
                    is_heading = True
                    ref = match.group(1)
                    if not re.match(r'^\d+(\.\d+)*$', ref):
                        errors.append(f"Line {line_num}: Invalid ref format '{ref}' in {name} heading.")

                    if name != "Commentary":
                        if ref in passage_refs:
                            errors.append(f"Line {line_num}: Duplicate ref '{ref}' found.")
                        passage_refs.add(ref)
                    else:
                        commentary_refs.append((ref, line_num))
                    break # Found a matching heading, stop checking

            # Check for content block start
            content_match = CONTENT_BLOCK_START.match(line)
            if content_match:
                is_heading = True # Treat this as a valid line type
                in_content_block = True
                expected_closing_script = content_match.group(1)

            if not is_heading:
                errors.append(f"Line {line_num}: Unrecognized line. All content must be inside a heading block or a 'sanskrit' content block. Line content: '{line}'")

        if in_content_block:
            errors.append(f"File Error: Reached end of file while inside an unclosed content block for script '{expected_closing_script}'.")

        # 3. Validate Commentary Links
        for ref, line_num in commentary_refs:
            if ref not in passage_refs:
                errors.append(f"Line {line_num}: Commentary for ref '{ref}' has no corresponding passage in this file.")

    except FileNotFoundError:
        errors.append(f"File not found at path: {filepath}")
    except ValidationError as e:
        errors.append(str(e))
    except Exception as e:
        errors.append(f"An unexpected error occurred: {e}")

    return errors

def create_test_files(test_dir: str):
    """Creates exhaustive test files for validation."""
    os.makedirs(test_dir, exist_ok=True)

    # --- Valid File ---
    valid_content = """---
grantha_id: test-grantha
part_num: 1
canonical_title: \"Test Grantha\"
text_type: upanishad
language: sanskrit
structure_levels: []
commentaries_metadata:
  test-commentator:
    commentary_title: \"Test Commentary\"
    commentator:
      devanagari: \"Test\"
---

### PREFATORY: 0.1 (devanagari: \"Test Prefatory\")

<!-- sanskrit:devanagari -->
Prefatory text.
<!-- /sanskrit:devanagari -->

# Mantra 1.1

<!-- sanskrit:devanagari -->
Mantra text.
<!-- /sanskrit:devanagari -->

### COMMENTARY: 1.1

<!-- sanskrit:devanagari -->
Commentary on mantra 1.1.
<!-- /sanskrit:devanagari -->

### CONCLUDING: 1.2 (devanagari: \"Test Concluding\")

<!-- sanskrit:devanagari -->
Concluding text.
<!-- /sanskrit:devanagari -->
"""
    with open(os.path.join(test_dir, "valid.md"), "w", encoding="utf-8") as f:
        f.write(valid_content)

    # --- Invalid Files ---
    # Missing frontmatter field
    with open(os.path.join(test_dir, "invalid_missing_field.md"), "w", encoding="utf-8") as f:
        f.write(valid_content.replace("part_num: 1\n", ""))

    # Malformed heading
    with open(os.path.join(test_dir, "invalid_bad_heading.md"), "w", encoding="utf-8") as f:
        f.write(valid_content.replace("# Mantra 1.1", "# Mantra 1.1a"))

    # Duplicate ref
    with open(os.path.join(test_dir, "invalid_duplicate_ref.md"), "w", encoding="utf-8") as f:
        f.write(valid_content.replace("### CONCLUDING: 1.2", "### CONCLUDING: 1.1"))

    # Dangling commentary
    with open(os.path.join(test_dir, "invalid_dangling_commentary.md"), "w", encoding="utf-8") as f:
        f.write(valid_content.replace("### COMMENTARY: 1.1", "### COMMENTARY: 9.9"))

    # Unclosed content block
    with open(os.path.join(test_dir, "invalid_unclosed_block.md"), "w", encoding="utf-8") as f:
        f.write(valid_content.replace("<!-- /sanskrit:devanagari -->", ""))

    # Unrecognized content
    with open(os.path.join(test_dir, "invalid_unrecognized_line.md"), "w", encoding="utf-8") as f:
        f.write(valid_content + "\nThis line is not in a block.")

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
