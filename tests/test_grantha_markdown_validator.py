import pytest
import os
import sys

# Add project root to sys.path to allow imports from scripts
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(script_dir)
sys.path.insert(0, project_root)

from scripts.grantha_markdown_validator import validate_markdown_file

# --- Test Data ---
VALID_CONTENT = """
---
grantha_id: test-grantha
part_num: 1
canonical_title: "Test Grantha"
text_type: upanishad
language: sanskrit
structure_levels: []
commentaries_metadata:
  test-commentator:
    commentary_title: "Test Commentary"
    commentator:
      devanagari: "Test"
---

### PREFATORY: 0.1 (devanagari: "Test Prefatory")

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

### CONCLUDING: 1.2 (devanagari: "Test Concluding")

<!-- sanskrit:devanagari -->
Concluding text.
<!-- /sanskrit:devanagari -->
"""

def create_test_file(tmp_path, filename, content):
    """Helper function to create a test file."""
    d = tmp_path / "validation_tests"
    d.mkdir(exist_ok=True)
    p = d / filename
    p.write_text(content, encoding="utf-8")
    return str(p)

def test_valid_file_passes(tmp_path):
    """A correctly formatted file should pass validation with no errors."""
    filepath = create_test_file(tmp_path, "valid.md", VALID_CONTENT)
    errors = validate_markdown_file(filepath)
    assert not errors, f"Validation failed unexpectedly: {errors}"

def test_missing_frontmatter_field_fails(tmp_path):
    """A file missing a required frontmatter field should fail."""
    content = VALID_CONTENT.replace("part_num: 1\n", "")
    filepath = create_test_file(tmp_path, "missing_field.md", content)
    errors = validate_markdown_file(filepath)
    assert len(errors) == 1
    assert "Missing required frontmatter field: 'part_num'" in errors[0]

def test_malformed_mantra_heading_fails(tmp_path):
    """A file with a malformed Mantra ref should fail."""
    content = VALID_CONTENT.replace("# Mantra 1.1", "# Mantra 1.1a")
    filepath = create_test_file(tmp_path, "bad_heading.md", content)
    errors = validate_markdown_file(filepath)
    assert len(errors) == 1
    assert "Invalid ref format '1.1a'" in errors[0]

def test_duplicate_ref_fails(tmp_path):
    """A file with a duplicate passage ref should fail."""
    content = VALID_CONTENT.replace("### CONCLUDING: 1.2", "### CONCLUDING: 1.1")
    filepath = create_test_file(tmp_path, "duplicate_ref.md", content)
    errors = validate_markdown_file(filepath)
    assert len(errors) == 1
    assert "Duplicate ref '1.1'" in errors[0]

def test_dangling_commentary_fails(tmp_path):
    """A commentary pointing to a non-existent ref should fail."""
    content = VALID_CONTENT.replace("### COMMENTARY: 1.1", "### COMMENTARY: 9.9")
    filepath = create_test_file(tmp_path, "dangling_commentary.md", content)
    errors = validate_markdown_file(filepath)
    assert len(errors) == 1
    assert "Commentary for ref '9.9' has no corresponding passage" in errors[0]

def test_unclosed_content_block_fails(tmp_path):
    """A file with an unclosed content block should fail."""
    content = VALID_CONTENT.replace("<!-- /sanskrit:devanagari -->", "", 1) # Remove first one
    filepath = create_test_file(tmp_path, "unclosed_block.md", content)
    errors = validate_markdown_file(filepath)
    assert len(errors) > 0
    assert "unclosed content block" in errors[-1]

def test_unrecognized_line_fails(tmp_path):
    """A file with content outside of a valid block should fail."""
    content = VALID_CONTENT + "\nThis is an invalid line."
    filepath = create_test_file(tmp_path, "unrecognized_line.md", content)
    errors = validate_markdown_file(filepath)
    assert len(errors) == 1
    assert "Unrecognized line" in errors[0]

def test_no_frontmatter_fails(tmp_path):
    """A file without any frontmatter should fail."""
    content = VALID_CONTENT.split("--- ", 2)[2]
    filepath = create_test_file(tmp_path, "no_frontmatter.md", content)
    errors = validate_markdown_file(filepath)
    assert len(errors) == 1
    assert "File must start with YAML frontmatter" in errors[0]
