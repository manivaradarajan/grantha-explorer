import pytest
import re
from typing import Optional

# Correct the import path to be relative within the package
from .raw_to_structured_md import (
    RawParser,
    verify_sanskrit_integrity,
)

def _get_passage_number_from_text(text: str) -> Optional[int]:
    match = re.search(r"।।\s*(\d+)\s*।।", text)
    if match:
        return int(match.group(1))
    return None

def _is_decorative_text(text: str) -> bool:
    # Patterns for decorative text, now also considering optional ** around them
    decorative_patterns = [
        r"^\s*\*{0,2}।।\s*श्रीः\s*।।\*{0,2}\s*$",  # ।। श्रीः ।। with optional **
        r"^\s*\*{0,2}\[उपक्रमशान्तिपाठः\]\*{0,2}\s*$",  # [उपक्रमशान्tiपाठः] with optional **
        r"^\s*\*{0,2}हरिः\s*ओम्\*{0,2}\s*$",  # हरिः ओम् with optional **
        r"^\s*\*{0,2}पूर्णमदः पूर्णमिदं पूर्णात् पूर्णमुदच्यते ।पूर्णस्य पूर्णमादाय पूर्णमेवावशिष्यते ।।।। ओं शान्तिः शान्तिः शान्तिः ।।\*{0,2}\s*$", # Shanti Patha with optional **
        r"^\s*(\*{4,})\s*$",  # Lines with 4 or more asterisks (already handled)
    ]
    for pattern in decorative_patterns:
        if re.search(pattern, text, re.MULTILINE):
            return True
    return False

def _to_devanagari_numeral(n: int) -> str:
    names = {3: "तृतीय", 4: "चतुर्थ", 5: "पञ्चम", 6: "षष्ठ", 7: "सप्तम", 8: "अष्टम"}
    return names.get(n, str(n))

# =============================================================================
# LEVEL 1: ATOMIC UNIT TESTS
# =============================================================================

RAW_SIMPLE_MULA = "**अयं वै लोकोऽग्निर्गौतम ।। ११ ।।**"
RAW_SIMPLE_COMMENTARY = "प्र.– अयं – समुद्रपर्वतादियुक्तो लोकः अग्निः ।। ११ ।।"
RAW_COMMENTARY_NO_NUM = "प्र.– स्पष्टोऽर्थः"
RAW_BRAHMANA_HEADING = "प्रथमं ब्राह्मणम्"
RAW_CHAPTER_HEADING = "षष्ठोऽध्यायः"

# THIS IS THE MISSING DEFINITION
RAW_DECORATIVE_TEXT = """
**।। श्रीः ।।**

****
"""

RAW_SHANTI_PATHA = """
**[उपक्रमशान्तिपाठः]**

**हरिः ओम्**

**पूर्णमदः पूर्णमिदं पूर्णात् पूर्णमुदच्यते ।पूर्णस्य पूर्णमादाय पूर्णमेवावशिष्यते ।।।। ओं शान्तिः शान्तिः शान्तिः ।।**
"""

# =============================================================================
# LEVEL 2: BASIC SEQUENCE TESTS
# =============================================================================

RAW_MULA_THEN_COMMENTARY = """
**स होवाचोषस्तश्चाक्रायणो यथा विब्रूयादसो गौरसावश्व इति ।। २ ।।**

प्र.– जीवव्यतिरेको नोक्त इति मत्वा आशयम-विद्वानुषस्तः पुनराह इत्यर्थः ।। २ ।।
"""

RAW_HEADING_THEN_MULA = """
द्वितीयं ब्राह्मणम्

**श्वेतकेतुर्ह वा आरुणेयः पञ्चालानां परिषदम् आजगाम ।। १ ।।**
"""

RAW_PREFATORY_THEN_BRAHMANA = RAW_SHANTI_PATHA + "\n\n" + RAW_HEADING_THEN_MULA


# =============================================================================
# LEVEL 3: COMPLEXITY & EDGE CASE TESTS
# =============================================================================

RAW_MULTI_PARA_MULA = """
**यद्वृक्षो वृक्णो रोहति मूलान्नवतरः पुनः ।
मर्त्यः स्विन्मृत्युना वृकण:कस्मान्मूलात् प्ररोहति ।।**

**रेतस इति मां वोचत जीवतस्तत् प्रजायते ।
धानारुह इव वै वृक्षोऽञ्जसा प्रेत्यसम्भवः ।।
यत् समूलमावृहेयुर्वृक्षं न पुनराभवेत् ।
मर्tyस्स्विन्मृत्युना वृक्ण:कस्मान्मूलात् प्ररोहतिजात एव न जायते को न्वेनं जनयेत् पुनः ।
विज्ञानमानन्दं ब्रह्म रातिर्दातुः परायणम् ।।
तिष्ठमानस्य तद्विद इति ।। २८ ।।**
"""

RAW_MULA_WITH_MULTI_PARA_COMMENTARY = """
**कतम इन्द्रःकतमः प्रजापतिरिति स्तनयित्नुरेवेन्द्रो यज्ञः प्रजा पतिरितिकतम:स्तनयित्nurityअशनिरिति कतमो यज्ञ इति पशव इति ।। ६ ।।**

प्र.–कतम इन्द्रः कतम प्रजापतिः इति प्रश्नः । स्तनयित्नुरेवेन्द्रो यज्ञःप्रजापतिः इत्युत्तरम् ।

कतमः स्तनयित्नुः इति पुनः प्रश्नः । अशनिः इत्युत्तरम् । कतमो यज्ञ इति प्रश्नः । अत्रोत्तरम् पशव इति। यज्ञ साधनत्वात् पशव एव यज्ञ इत्युच्यन्त इत्यर्थः ।। ६ ।।
"""

RAW_MULA_NO_COMMENTARY = """
**यो ह वै ज्येष्ठञ्च श्रेष्ठञ्च वेद,ज्येष्ठश्च श्रेष्ठश्च स्वानां भवति ।। १ ।।**

**यो ह वै वसिष्ठां वेदः वसिष्ठः स्वानां भवति ।। २ ।।**
"""

# =============================================================================
# TEST IMPLEMENTATIONS
# =============================================================================


def test_lex_blocks_multi_paragraph_mula():
    parser = RawParser(grantha_id="test", part_num=1)
    blocks = parser._lex_blocks(RAW_MULTI_PARA_MULA, debug=True)
    assert len(blocks) == 1
    assert blocks[0]["type"] == "mula"
    # Check that the content is correctly joined
    expected_content = """**यद्वृक्षो वृक्णो रोहति मूलान्नवतरः पुनः ।
मर्त्यः स्विन्मृत्युना वृकण:कस्मान्मूलात् प्ररोहति ।।**

**रेतस इति मां वोचत जीवतस्तत् प्रजायते ।
धानारुह इव वै वृक्षोऽञ्जसा प्रेत्यसम्भवः ।।
यत् समूलमावृहेयुर्वृक्षं न पुनराभवेत् ।
मर्tyस्स्विन्मृत्युना वृक्ण:कस्मान्मूलात् प्ररोहतिजात एव न जायते को न्वेनं जनयेत् पुनः ।
विज्ञानमानन्दं ब्रह्म रातिर्दातुः परायणम् ।।
तिष्ठमानस्य तद्विद इति ।। २८ ।।**"""
    assert blocks[0]["content"] == expected_content


@pytest.mark.parametrize(
    "raw_text, expected_passages, expected_commentaries, test_id",
    [
        (RAW_SIMPLE_MULA, 1, 0, "mula-only"),
        (RAW_SIMPLE_COMMENTARY, 0, 0, "commentary-only-no-mula"),
        (RAW_COMMENTARY_NO_NUM, 0, 0, "commentary-no-num-no-mula"),
        (RAW_MULA_THEN_COMMENTARY, 1, 1, "mula-plus-commentary"),
        (RAW_MULTI_PARA_MULA, 1, 0, "multi-paragraph-mula"),
        (RAW_MULA_WITH_MULTI_PARA_COMMENTARY, 1, 1, "mula-plus-multi-para-commentary"),
        (RAW_MULA_NO_COMMENTARY, 2, 0, "mula-plus-mula"),
    ],
)
def test_parsing_logic(raw_text, expected_passages, expected_commentaries, test_id):
    parser = RawParser(grantha_id="test", part_num=1)
    parser.state["brahmana"] = 1
    parser.parse(raw_text)
    assert len(parser.passages) == expected_passages
    assert len(parser.commentaries) == expected_commentaries


def test_structure_parsing():
    parser = RawParser(grantha_id="test", part_num=1)
    parser.parse(RAW_HEADING_THEN_MULA)
    assert len(parser.structure_nodes) == 1
    assert parser.structure_nodes[0]["name"] == "द्वितीयं ब्राह्मणम्"
    assert parser.state["brahmana"] == 1
    assert len(parser.passages) == 1
    assert parser.passages[0]["ref"] == "1.1.1"

def test_prefatory_parsing():
    parser = RawParser(grantha_id="test", part_num=1)
    parser.parse(RAW_PREFATORY_THEN_BRAHMANA)
    assert len(parser.prefatory_passages) > 0, "Should identify prefatory content"
    assert (
        "पूर्णमदः" in parser.prefatory_passages[0]["content"]
    )
    assert (
        len(parser.passages) == 1
    ), "Should still parse the main passage after prefatory"
    assert parser.passages[0]["ref"] == "1.1.1"

def test_ignore_decorative_text():
    parser = RawParser(grantha_id="test", part_num=1)
    parser.debug = True
    # Use the now-defined constant
    parser.parse(RAW_DECORATIVE_TEXT)
    assert len(parser.passages) == 0
    assert len(parser.commentaries) == 0
    assert len(parser.prefatory_passages) == 0

def test_hash_integrity_on_snippets():
    raw_content = RAW_MULA_THEN_COMMENTARY
    parser = RawParser(grantha_id="test", part_num=1)
    parser.state["brahmana"] = 1
    parser.state["mantra"] = 1
    parser.parse(raw_content)
    passage_content = parser.passages[0]["content"]
    commentary_content = parser.commentaries["1.1.2"][0]["content"]
    structured_content = f"""
---
# Minimal frontmatter for verification
---
## Mantra 1.1.2
<!-- sanskrit:devanagari -->
{passage_content}

<!-- commentary: {{'commentary_id': 'rangaramanuja', 'passage_ref': '1.1.2'}} -->
### Commentary: रङ्गरामानुजमुनिः
<!-- sanskrit:devanagari -->
{commentary_content}
"""
    verify_sanskrit_integrity(parser, structured_content)


@pytest.fixture
def full_file_parser():
    """A pytest fixture to parse a full file once for multiple tests."""
    from pathlib import Path

    # Assuming the test is run from the project root
    # Create a dummy raw file for testing
    raw_file_content = RAW_PREFATORY_THEN_BRAHMANA + "\n\n" + RAW_MULA_NO_COMMENTARY
    parser = RawParser(grantha_id="test-full", part_num=99)
    parser.parse(raw_file_content)
    return parser


def test_full_parser_counts(full_file_parser):
    """Check high-level counts on a multi-block parse."""
    assert len(full_file_parser.prefatory_passages) > 0
    assert (
        len(full_file_parser.passages) == 3
    )  # 1 from prefatory sequence + 2 from no-commentary block
    assert len(full_file_parser.structure_nodes) == 1
    assert full_file_parser.state["brahmana"] == 1
    assert full_file_parser.state["mantra"] == 3


@pytest.mark.parametrize(
    "text, expected",
    [
        ("।। 1 ।।", 1),
        ("some text ।। 123 ।। more text", 123),
        ("no number here", None),
        ("।।  5  ।।", 5),
        ("।।1।।", 1), # No spaces
        ("।। 1.1 ।।", None), # Not a simple integer
        ("", None),
    ],
)
def test_get_passage_number_from_text(text, expected):
    assert _get_passage_number_from_text(text) == expected


@pytest.mark.parametrize(
    "text, expected",
    [
        ("।। श्रीः ।।", True),
        ("**।। श्रीः ।।**", True),
        ("****\n", True),
        ("********", True),
        ("[उपक्रमशान्तिपाठः]", True),
        ("**[उपक्रमशान्तिपाठः]**", True),
        ("हरिः ओम्", True),
        ("**हरिः ओम्**", True),
        ("Some regular text", False),
        ("।। 1 ।।", False),
        ("प्र.– commentary", False),
        ("", False),
        ("  ।। श्रीः ।।  ", True), # With leading/trailing spaces
    ],
)
def test_is_decorative_text(text, expected):
    assert _is_decorative_text(text) == expected


@pytest.mark.parametrize(
    "number, expected",
    [
        (3, "तृतीय"),
        (4, "चतुर्थ"),
        (5, "पञ्चम"),
        (6, "षष्ठ"),
        (7, "सप्तम"),
        (8, "अष्टम"),
        (1, "1"), # Unmapped number
        (99, "99"), # Unmapped number
    ],
)
def test_to_devanagagari_numeral(number, expected):
    assert _to_devanagari_numeral(number) == expected

def test_empty_input():
    parser = RawParser(grantha_id="test", part_num=1)
    parser.parse("")
    assert len(parser.passages) == 0
    assert len(parser.commentaries) == 0
    assert len(parser.prefatory_passages) == 0
    assert len(parser.structure_nodes) == 0
    assert parser.chapter_name == ""

def test_only_decorative_text_input():
    parser = RawParser(grantha_id="test", part_num=1)
    parser.parse(RAW_DECORATIVE_TEXT)
    assert len(parser.passages) == 0
    assert len(parser.commentaries) == 0
    assert len(parser.prefatory_passages) == 0
    assert len(parser.structure_nodes) == 0
    assert parser.chapter_name == ""