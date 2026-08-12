import os
import sys
import pytest
from scripts.grantha_markdown_validator import validate_markdown_file

# Add the script's directory to the Python path to allow importing
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'scripts')))

@pytest.fixture
def valid_header():
    return """---
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
"""

def test_valid_file_simple_commentary(tmpdir, valid_header):
    content = valid_header + """
# Mantra 1.1
<!-- sanskrit:devanagari -->
Mantra text.
<!-- /sanskrit:devanagari -->

<!-- commentary: {"commentary_id": "test-commentator"} -->
# Commentary: 1.1
<!-- sanskrit:devanagari -->
Commentary on mantra 1.1.
<!-- /sanskrit:devanagari -->
"""
    filepath = tmpdir.join("valid.md")
    filepath.write(content)
    errors = validate_markdown_file(str(filepath))
    assert not errors, f"Validation failed unexpectedly: {errors}"

def test_valid_file_verbose_commentary_backwards_compatible(tmpdir, valid_header):
    content = valid_header + """
# Mantra 1.1
<!-- sanskrit:devanagari -->
Mantra text.
<!-- /sanskrit:devanagari -->

<!-- commentary: {"passage_ref": "1.1", "commentary_id": "test-commentator"} -->
# Commentary: 1.1
<!-- sanskrit:devanagari -->
Commentary on mantra 1.1.
<!-- /sanskrit:devanagari -->
"""
    filepath = tmpdir.join("valid_verbose.md")
    filepath.write(content)
    errors = validate_markdown_file(str(filepath))
    assert not errors, f"Validation failed unexpectedly on backwards-compatible format: {errors}"

def test_missing_commentary_id(tmpdir, valid_header):
    content = valid_header + """
# Mantra 1.1
<!-- sanskrit:devanagari -->
Mantra text.
<!-- /sanskrit:devanagari -->

<!-- commentary: {"passage_ref": "1.1"} -->
# Commentary: 1.1
<!-- sanskrit:devanagari -->
Commentary on mantra 1.1.
<!-- /sanskrit:devanagari -->
"""
    filepath = tmpdir.join("invalid.md")
    filepath.write(content)
    errors = validate_markdown_file(str(filepath))
    assert len(errors) == 1
    assert "missing 'commentary_id'" in errors[0]


def test_valid_prakarana_with_author_and_para_headings(tmpdir):
    content = """---
grantha_id: vedarthasangraha
part_num: 1
canonical_title: वेदार्थसङ्ग्रहः
text_type: prakarana
language: sanskrit
author:
  devanagari: भगवद् रामानुजः
  latin: bhagavad rāmānujaḥ
structure_levels:
  - key: Para
    scriptNames:
      devanagari: पाठः
---

# Prefatory: 0.1 (devanagari: "मङ्गलाचरणम्")

<!-- sanskrit:devanagari -->
मङ्गलश्लोकः ॥
<!-- /sanskrit:devanagari -->

# Para 1

<!-- sanskrit:devanagari -->
प्रथमः परिच्छेदः ।
<!-- /sanskrit:devanagari -->

# Concluding: 0.2 (devanagari: "समाप्तिः")

<!-- sanskrit:devanagari -->
इति समाप्तम् ॥
<!-- /sanskrit:devanagari -->
"""
    filepath = tmpdir.join("prakarana.md")
    filepath.write(content)
    errors = validate_markdown_file(str(filepath))
    assert not errors, f"Validation failed unexpectedly for prakarana: {errors}"


def test_author_and_commentaries_metadata_mutually_exclusive(tmpdir):
    content = """---
grantha_id: test-grantha
part_num: 1
canonical_title: "Test Grantha"
text_type: prakarana
language: sanskrit
author:
  devanagari: भगवद् रामानुजः
commentaries_metadata:
  test-commentator:
    commentary_title: "Test Commentary"
    commentator:
      devanagari: "Test"
structure_levels: []
---

# Para 1

<!-- sanskrit:devanagari -->
Some text.
<!-- /sanskrit:devanagari -->
"""
    filepath = tmpdir.join("conflict.md")
    filepath.write(content)
    errors = validate_markdown_file(str(filepath))
    assert any("mutually exclusive" in e for e in errors)


def test_invalid_text_type_rejected(tmpdir):
    content = """---
grantha_id: test-grantha
part_num: 1
canonical_title: "Test Grantha"
text_type: bogus
language: sanskrit
structure_levels: []
---

# Mantra 1

<!-- sanskrit:devanagari -->
Some text.
<!-- /sanskrit:devanagari -->
"""
    filepath = tmpdir.join("bad_text_type.md")
    filepath.write(content)
    errors = validate_markdown_file(str(filepath))
    assert any("text_type" in e and "bogus" in e for e in errors)


def test_author_requires_devanagari(tmpdir):
    content = """---
grantha_id: test-grantha
part_num: 1
canonical_title: "Test Grantha"
text_type: prakarana
language: sanskrit
author:
  latin: bhagavad rāmānujaḥ
structure_levels: []
---

# Para 1

<!-- sanskrit:devanagari -->
Some text.
<!-- /sanskrit:devanagari -->
"""
    filepath = tmpdir.join("bad_author.md")
    filepath.write(content)
    errors = validate_markdown_file(str(filepath))
    assert any("author.devanagari" in e for e in errors)