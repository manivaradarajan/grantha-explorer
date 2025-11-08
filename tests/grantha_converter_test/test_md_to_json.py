"""Tests for md_to_json module."""

import pytest
from tools.grantha_converter.md_to_json import (
    parse_frontmatter,
    extract_html_comments,
    parse_content_block,
    parse_prefatory_material,
    parse_concluding_material,
    convert_to_json,
)
from tools.grantha_converter.json_to_md import convert_to_markdown


class TestParseFrontmatter:
    """Tests for parse_frontmatter function."""

    def test_parses_basic_frontmatter(self):
        """Test parsing basic YAML frontmatter."""
        markdown = """---
grantha_id: test-grantha
canonical_title: परीक्षा
text_type: upanishad
---

# Content here
"""
        frontmatter, content = parse_frontmatter(markdown)

        assert frontmatter['grantha_id'] == 'test-grantha'
        assert frontmatter['canonical_title'] == 'परीक्षा'
        assert frontmatter['text_type'] == 'upanishad'
        assert '# Content here' in content

    def test_raises_on_missing_frontmatter(self):
        """Test that error is raised when frontmatter is missing."""
        markdown = "# Just content\nNo frontmatter"

        with pytest.raises(ValueError, match="No YAML frontmatter found"):
            parse_frontmatter(markdown)


class TestExtractHtmlComments:
    """Tests for extract_html_comments function."""

    def test_extracts_json_from_comment(self):
        """Test extracting JSON from HTML comment."""
        text = '<!-- test_key: {"value": "data", "number": 123} -->'
        result = extract_html_comments(text)

        assert 'test_key' in result
        assert result['test_key']['value'] == 'data'
        assert result['test_key']['number'] == 123

    def test_extracts_multiple_comments(self):
        """Test extracting multiple HTML comments."""
        text = '''
        <!-- key1: {"a": 1} -->
        Some content
        <!-- key2: {"b": 2} -->
        '''
        result = extract_html_comments(text)

        assert len(result) == 2
        assert result['key1']['a'] == 1
        assert result['key2']['b'] == 2

    def test_handles_devanagari_in_json(self):
        """Test handling Devanagari text in JSON."""
        text = '<!-- label: {"devanagari": "शान्तिः"} -->'
        result = extract_html_comments(text)

        assert result['label']['devanagari'] == 'शान्तिः'

    def test_skips_malformed_json(self):
        """Test that malformed JSON is skipped."""
        text = '<!-- bad: {invalid json} -->'
        result = extract_html_comments(text)

        assert len(result) == 0


class TestParseContentBlock:
    """Tests for parse_content_block function."""

    def test_parses_devanagari_content(self):
        """Test parsing Devanagari content."""
        text = "**Sanskrit (Devanagari):** देवनागरी पाठः"
        result = parse_content_block(text, ['devanagari'])

        assert result['sanskrit']['devanagari'] == 'देवनागरी पाठः'

    def test_parses_multiple_scripts(self):
        """Test parsing multiple scripts."""
        text = """**Sanskrit (Devanagari):** देवनागरी
**Sanskrit (Roman):** romanized
**English Translation:** English text"""
        result = parse_content_block(text, ['devanagari', 'roman'])

        assert result['sanskrit']['devanagari'] == 'देवनागरी'
        assert result['sanskrit']['roman'] == 'romanized'
        assert result['english_translation'] == 'English text'

    def test_parses_english_commentary(self):
        """Test parsing English commentary field."""
        text = """**Sanskrit (Devanagari):** संस्कृत
**English:** Commentary text"""
        result = parse_content_block(text, ['devanagari'])

        assert result['sanskrit']['devanagari'] == 'संस्कृत'
        assert result['english'] == 'Commentary text'


class TestParsePrefatoryMaterial:
    """Tests for parse_prefatory_material function."""

    def test_parses_simple_prefatory(self):
        """Test parsing simple prefatory material."""
        content = """
<!-- prefatory_item_0: {"devanagari": "शान्तिपाठः"} -->
## शान्तिपाठः

**Sanskrit (Devanagari):** ॐ शान्तिः शान्तिः शान्तिः
"""
        result = parse_prefatory_material(content, ['devanagari'])

        assert len(result) == 1
        assert result[0]['label']['devanagari'] == 'शान्तिपाठः'
        assert 'ॐ शान्तिः' in result[0]['content']['sanskrit']['devanagari']

    def test_parses_multiple_items(self):
        """Test parsing multiple prefatory items."""
        content = """
<!-- prefatory_item_0: {"devanagari": "प्रथमः"} -->
## प्रथमः

**Sanskrit (Devanagari):** पाठः १

<!-- prefatory_item_1: {"devanagari": "द्वितीयः"} -->
## द्वितीयः

**Sanskrit (Devanagari):** पाठः २
"""
        result = parse_prefatory_material(content, ['devanagari'])

        assert len(result) == 2
        assert result[0]['label']['devanagari'] == 'प्रथमः'
        assert result[1]['label']['devanagari'] == 'द्वितीयः'


class TestRoundTripConversion:
    """Tests for round-trip JSON → MD → JSON conversion."""

    def test_simple_grantha_roundtrip(self):
        """Test round-trip conversion with simple grantha."""
        original = {
            'grantha_id': 'test-grantha',
            'canonical_title': 'परीक्षा',
            'text_type': 'upanishad',
            'language': 'sanskrit',
            'structure_levels': [{'key': 'Mantra'}],
            'passages': [
                {
                    'ref': '1',
                    'passage_type': 'main',
                    'content': {
                        'sanskrit': {
                            'devanagari': 'पाठः १',
                            'roman': None,
                            'kannada': None
                        },
                        'english_translation': 'Passage 1'
                    }
                },
                {
                    'ref': '2',
                    'passage_type': 'main',
                    'content': {
                        'sanskrit': {
                            'devanagari': 'पाठः २',
                            'roman': None,
                            'kannada': None
                        },
                        'english_translation': 'Passage 2'
                    }
                }
            ]
        }

        # Convert to markdown
        markdown = convert_to_markdown(original, scripts=['devanagari'])

        # Convert back to JSON
        result = convert_to_json(markdown)

        # Compare key fields
        assert result['grantha_id'] == original['grantha_id']
        assert result['canonical_title'] == original['canonical_title']
        assert result['text_type'] == original['text_type']
        assert len(result['passages']) == len(original['passages'])
        assert result['passages'][0]['ref'] == '1'
        assert result['passages'][1]['ref'] == '2'

    def test_hierarchical_grantha_roundtrip(self):
        """Test round-trip with multi-level hierarchy."""
        original = {
            'grantha_id': 'test',
            'canonical_title': 'परीक्षा',
            'text_type': 'upanishad',
            'language': 'sanskrit',
            'structure_levels': [
                {
                    'key': 'Valli',
                    'children': [{'key': 'Mantra'}]
                }
            ],
            'passages': [
                {
                    'ref': '1.1',
                    'passage_type': 'main',
                    'content': {
                        'sanskrit': {'devanagari': 'पाठः १.१', 'roman': None, 'kannada': None},
                        'english_translation': None
                    }
                },
                {
                    'ref': '1.2',
                    'passage_type': 'main',
                    'content': {
                        'sanskrit': {'devanagari': 'पाठः १.२', 'roman': None, 'kannada': None},
                        'english_translation': None
                    }
                }
            ]
        }

        markdown = convert_to_markdown(original, scripts=['devanagari'])
        result = convert_to_json(markdown)

        assert len(result['passages']) == 2
        assert result['passages'][0]['ref'] == '1.1'
        assert result['passages'][1]['ref'] == '1.2'

    def test_with_prefatory_material_roundtrip(self):
        """Test round-trip with prefatory material."""
        original = {
            'grantha_id': 'test',
            'canonical_title': 'परीक्षा',
            'text_type': 'upanishad',
            'language': 'sanskrit',
            'structure_levels': [{'key': 'Mantra'}],
            'prefatory_material': [
                {
                    'label': {'devanagari': 'शान्तिपाठः'},
                    'content': {
                        'sanskrit': {'devanagari': 'ॐ शान्तिः', 'roman': None, 'kannada': None},
                        'english_translation': 'Om Peace'
                    }
                }
            ],
            'passages': [
                {
                    'ref': '1',
                    'passage_type': 'main',
                    'content': {
                        'sanskrit': {'devanagari': 'पाठः', 'roman': None, 'kannada': None},
                        'english_translation': None
                    }
                }
            ]
        }

        markdown = convert_to_markdown(original, scripts=['devanagari'])
        result = convert_to_json(markdown)

        assert 'prefatory_material' in result
        assert len(result['prefatory_material']) == 1
        assert result['prefatory_material'][0]['label']['devanagari'] == 'शान्तिपाठः'

    def test_with_concluding_material_roundtrip(self):
        """Test round-trip with concluding material."""
        original = {
            'grantha_id': 'test',
            'canonical_title': 'परीक्षा',
            'text_type': 'upanishad',
            'language': 'sanskrit',
            'structure_levels': [{'key': 'Mantra'}],
            'passages': [
                {
                    'ref': '1',
                    'passage_type': 'main',
                    'content': {
                        'sanskrit': {'devanagari': 'पाठः', 'roman': None, 'kannada': None},
                        'english_translation': None
                    }
                }
            ],
            'concluding_material': [
                {
                    'label': {'devanagari': 'समाप्तिः'},
                    'content': {
                        'sanskrit': {'devanagari': 'इति समाप्तम्', 'roman': None, 'kannada': None},
                        'english_translation': 'Thus concluded'
                    }
                }
            ]
        }

        markdown = convert_to_markdown(original, scripts=['devanagari'])
        result = convert_to_json(markdown)

        assert 'concluding_material' in result
        assert len(result['concluding_material']) == 1
        assert result['concluding_material'][0]['label']['devanagari'] == 'समाप्तिः'

    def test_validates_hash(self):
        """Test that hash validation catches corruption."""
        original = {
            'grantha_id': 'test',
            'canonical_title': 'परीक्षा',
            'text_type': 'upanishad',
            'language': 'sanskrit',
            'structure_levels': [{'key': 'Mantra'}],
            'passages': [
                {
                    'ref': '1',
                    'passage_type': 'main',
                    'content': {
                        'sanskrit': {'devanagari': 'पाठः', 'roman': None, 'kannada': None},
                        'english_translation': None
                    }
                }
            ]
        }

        markdown = convert_to_markdown(original, scripts=['devanagari'])

        # Corrupt the content
        corrupted_markdown = markdown.replace('पाठः', 'भ्रष्टः')

        # Should raise validation error
        with pytest.raises(ValueError, match="Validation hash mismatch"):
            convert_to_json(corrupted_markdown)

    def test_three_level_hierarchy_roundtrip(self):
        """Test round-trip with three-level hierarchy."""
        original = {
            'grantha_id': 'test',
            'canonical_title': 'परीक्षा',
            'text_type': 'upanishad',
            'language': 'sanskrit',
            'structure_levels': [
                {
                    'key': 'Mundaka',
                    'children': [
                        {
                            'key': 'Khanda',
                            'children': [{'key': 'Mantra'}]
                        }
                    ]
                }
            ],
            'passages': [
                {
                    'ref': '1.1.1',
                    'passage_type': 'main',
                    'content': {
                        'sanskrit': {'devanagari': 'पाठः १.१.१', 'roman': None, 'kannada': None},
                        'english_translation': None
                    }
                },
                {
                    'ref': '1.1.2',
                    'passage_type': 'main',
                    'content': {
                        'sanskrit': {'devanagari': 'पाठः १.१.२', 'roman': None, 'kannada': None},
                        'english_translation': None
                    }
                }
            ]
        }

        markdown = convert_to_markdown(original, scripts=['devanagari'])
        result = convert_to_json(markdown)

        assert len(result['passages']) == 2
        assert result['passages'][0]['ref'] == '1.1.1'
        assert result['passages'][1]['ref'] == '1.1.2'

    def test_metadata_preservation(self):
        """Test that metadata fields are preserved."""
        original = {
            'grantha_id': 'test',
            'canonical_title': 'परीक्षा',
            'text_type': 'upanishad',
            'language': 'sanskrit',
            'aliases': [{'alias': 'टेस्ट', 'scope': 'abbreviation'}],
            'variants_available': ['critical', 'vulgate'],
            'metadata': {
                'source_url': 'https://example.com',
                'quality_notes': 'Test data'
            },
            'structure_levels': [{'key': 'Mantra'}],
            'passages': [
                {
                    'ref': '1',
                    'passage_type': 'main',
                    'content': {
                        'sanskrit': {'devanagari': 'पाठः', 'roman': None, 'kannada': None},
                        'english_translation': None
                    }
                }
            ]
        }

        markdown = convert_to_markdown(original, scripts=['devanagari'])
        result = convert_to_json(markdown)

        assert result['aliases'] == original['aliases']
        assert result['variants_available'] == original['variants_available']
        assert result['metadata'] == original['metadata']
