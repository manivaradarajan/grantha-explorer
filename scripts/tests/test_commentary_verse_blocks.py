"""Tests for verse-block extraction in commentary passages.

Covers:
- _extract_commentary_blocks: verse-quote and verse offset extraction
- _merge_duplicate_ref_passages: offset shifting during merge
- build_part_json / _build_commentary: verse_quotes / verses emitted to JSON

All tests are written before implementation changes (TDD). They should FAIL
until Steps 1-4 are implemented.
"""

from __future__ import annotations

import pathlib
import sys
import unittest

# Allow importing from the parent scripts directory.
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

from convert_structured_md import (  # noqa: E402
    BodyData,
    CommentaryPassage,
    _extract_commentary_blocks,
    _merge_duplicate_ref_passages,
    build_part_json,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_segment(commentary_id: str, body: str) -> str:
    """Build a segment containing a single commentary block.

    Args:
        commentary_id: The commentary_id value to embed in the open tag.
        body: The body text placed between open and close tags.

    Returns:
        A fully-formed commentary segment string.
    """
    return (
        f'<!-- commentary: {{"commentary_id": "{commentary_id}"}} -->\n'
        f"{body}\n"
        "<!-- /commentary -->\n"
    )


def _simple_frontmatter(cid: str = "test-commentary") -> dict[str, object]:
    """Return minimal frontmatter for a one-commentary part.

    Args:
        cid: The commentary_id to embed.

    Returns:
        A frontmatter dict.
    """
    return {
        "grantha_id": "test-grantha",
        "part_num": 1,
        "commentaries_metadata": [
            {
                "commentary_id": cid,
                "commentary_title": "परीक्षाभाष्यम्",
                "commentator": {
                    "devanagari": "परीक्षकः",
                    "roman": "parīkṣakaḥ",
                },
            }
        ],
    }


# ---------------------------------------------------------------------------
# 0a. _extract_commentary_blocks unit tests
# ---------------------------------------------------------------------------


class TestExtractCommentaryBlocksVerseOffsets(unittest.TestCase):
    """_extract_commentary_blocks returns verse offset data in 5-tuples."""

    def test_verse_quote_offsets_extracted(self) -> None:
        """verse-quote block → 4th tuple element contains {start, end} dict."""
        inner = "उद्धृत-श्लोकः परीक्षा।"
        body = f"पूर्वप्रस्तावः।\n<!-- verse-quote -->{inner}<!-- /verse-quote -->\nउत्तरप्रस्तावः।"
        segment = _make_segment("test-c", body)

        result = _extract_commentary_blocks(segment)

        self.assertIn("test-c", result)
        blocks = result["test-c"]
        self.assertEqual(len(blocks), 1)
        _ref, _text, _intro, vq, _vs = blocks[0]
        self.assertEqual(len(vq), 1)
        block = vq[0]
        self.assertIn("start", block)
        self.assertIn("end", block)
        # The inner text must appear in _text at the recorded offsets
        self.assertEqual(_text[block["start"] : block["end"]], inner)

    def test_verse_own_offsets_extracted(self) -> None:
        """verse block → 5th tuple element contains {start, end} dict."""
        inner = "स्वरचित-श्लोकः।"
        body = f"प्रस्तावः।\n<!-- verse -->{inner}<!-- /verse -->\nउपसंहारः।"
        segment = _make_segment("test-c", body)

        result = _extract_commentary_blocks(segment)

        blocks = result["test-c"]
        _ref, _text, _intro, _vq, vs = blocks[0]
        self.assertEqual(len(vs), 1)
        block = vs[0]
        self.assertEqual(_text[block["start"] : block["end"]], inner)

    def test_no_verse_tags_returns_empty_offsets(self) -> None:
        """Plain prose → 4th and 5th tuple elements are empty lists."""
        body = "केवलं गद्यम् एव।"
        segment = _make_segment("test-c", body)

        result = _extract_commentary_blocks(segment)

        blocks = result["test-c"]
        _ref, _text, _intro, vq, vs = blocks[0]
        self.assertEqual(vq, [])
        self.assertEqual(vs, [])

    def test_verse_quote_bold_not_stripped_before_offset_record(self) -> None:
        """Bold markup inside verse-quote is preserved at offset recording time.

        The converter only strips HTML-comment delimiters; **bold** stays
        intact so the offsets point to the same text as the rendered passage.
        """
        inner = "**उद्धृतः** श्लोकः।"
        body = f"<!-- verse-quote -->{inner}<!-- /verse-quote -->"
        segment = _make_segment("test-c", body)

        result = _extract_commentary_blocks(segment)

        blocks = result["test-c"]
        _ref, _text, _intro, vq, _vs = blocks[0]
        self.assertEqual(len(vq), 1)
        block = vq[0]
        # Bold markers must be present (not stripped) at the recorded offsets
        self.assertIn("**", _text[block["start"] : block["end"]])


# ---------------------------------------------------------------------------
# 0b. _merge_duplicate_ref_passages unit tests
# ---------------------------------------------------------------------------


class TestMergeDuplicateRefPassagesVerseOffsets(unittest.TestCase):
    """_merge_duplicate_ref_passages shifts verse offsets on merge."""

    def test_merge_shifts_verse_offsets(self) -> None:
        """Second passage's verse offsets are shifted by len(text1) + 2."""
        text1 = "प्रथमः पाठः।"
        text2 = "द्वितीयः पाठः।"
        shift = len(text1) + 2  # len("\n\n")

        cp1 = CommentaryPassage(
            ref="1.1",
            text=text1,
            verse_quotes=({"start": 2, "end": 5},),
        )
        cp2 = CommentaryPassage(
            ref="1.1",
            text=text2,
            verse_quotes=({"start": 0, "end": 3},),
        )

        merged = _merge_duplicate_ref_passages([cp1, cp2])

        self.assertEqual(len(merged), 1)
        result = merged[0]
        self.assertEqual(len(result.verse_quotes), 2)
        # First passage's offset is unchanged
        self.assertEqual(result.verse_quotes[0], {"start": 2, "end": 5})
        # Second passage's offset is shifted by shift
        self.assertEqual(
            result.verse_quotes[1],
            {"start": 0 + shift, "end": 3 + shift},
        )

    def test_merge_no_verse_blocks_unchanged(self) -> None:
        """Passages with empty verse fields produce empty merged verse fields."""
        cp1 = CommentaryPassage(ref="1.1", text="अ")
        cp2 = CommentaryPassage(ref="1.1", text="ब")

        merged = _merge_duplicate_ref_passages([cp1, cp2])

        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0].verse_quotes, ())
        self.assertEqual(merged[0].verses, ())


# ---------------------------------------------------------------------------
# 0c. build_part_json / _build_commentary integration tests
# ---------------------------------------------------------------------------


class TestBuildPartJsonVerseEmission(unittest.TestCase):
    """build_part_json emits verse_quotes / verses into commentary passages."""

    def _build(
        self,
        verse_quotes: tuple[dict[str, int], ...] = (),
        verses: tuple[dict[str, int], ...] = (),
    ) -> dict[str, object]:
        """Run build_part_json with one commentary passage that has verse data.

        Args:
            verse_quotes: verse_quotes tuple for the CommentaryPassage.
            verses: verses tuple for the CommentaryPassage.

        Returns:
            The first (and only) entry in the emitted commentary passages list.
        """
        cid = "test-commentary"
        body = BodyData()
        body.commentary_blocks[cid] = [
            CommentaryPassage(
                ref="1.1",
                text="श्लोकभाष्यम्।",
                verse_quotes=verse_quotes,
                verses=verses,
            )
        ]
        result = build_part_json(
            _simple_frontmatter(cid),
            body,
            "test-grantha",
            [cid],
        )
        commentary = result.get("commentary", {})
        passages = commentary.get("passages", [])
        self.assertEqual(len(passages), 1)
        return passages[0]

    def test_verse_quotes_emitted_in_json(self) -> None:
        """verse_quotes tuple → JSON passage contains 'verse_quotes' key."""
        passage = self._build(verse_quotes=({"start": 5, "end": 15},))
        self.assertIn("verse_quotes", passage)
        self.assertEqual(passage["verse_quotes"], [{"start": 5, "end": 15}])

    def test_verses_emitted_in_json(self) -> None:
        """verses tuple → JSON passage contains 'verses' key."""
        passage = self._build(verses=({"start": 3, "end": 10},))
        self.assertIn("verses", passage)
        self.assertEqual(passage["verses"], [{"start": 3, "end": 10}])

    def test_no_verse_keys_when_empty(self) -> None:
        """Empty verse tuples → 'verse_quotes' and 'verses' absent from JSON."""
        passage = self._build()
        self.assertNotIn("verse_quotes", passage)
        self.assertNotIn("verses", passage)


if __name__ == "__main__":
    unittest.main()
