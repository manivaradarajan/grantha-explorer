"""Tests for ``_extract_mula_text`` block-boundary handling.

Covers the closing-tag and inner-hide-cap regressions observed across the
corpus:

- isavasya-vd prefatory: a leading bare ``<!-- hide -->`` label block precedes
  the mula text and previously truncated it to empty.
- katha 1.1.18+: an inline ``<!-- hide:verse-number -->`` annotation trails the
  mula text and must be dropped.
- brihadaranyaka: a stray ``<!-- /hide -->`` is used as the Sanskrit-block
  close (SOURCE_DATA_ISSUES #2).
- plain and split-block cases must remain unchanged.

Re-run this on every future converter change.
"""

from __future__ import annotations

import pathlib
import sys
import unittest

# Allow importing from the parent scripts directory.
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

from convert_structured_md import _extract_mula_text  # noqa: E402


class TestMulaExtraction(unittest.TestCase):
    """Boundary and stripping logic of ``_extract_mula_text``."""

    def test_plain_block_with_proper_close(self) -> None:
        """A plain block with a proper close extracts verbatim."""
        segment = (
            "<!-- sanskrit:devanagari -->\n"
            "उशन् ह वै वाजश्रवसः सर्ववेदसं ददौ ।\n"
            "<!-- /sanskrit:devanagari -->\n"
        )
        self.assertEqual(
            _extract_mula_text(segment),
            "उशन् ह वै वाजश्रवसः सर्ववेदसं ददौ ।",
        )

    def test_trailing_inline_hide_number_is_dropped(self) -> None:
        """Katha-style inline verse-number hide after the mula is capped off."""
        segment = (
            "<!-- sanskrit:devanagari -->\n"
            "मूलपाठः<!-- hide:verse-number --> ।। १ ।। <!-- /hide -->\n"
            "<!-- /sanskrit:devanagari -->\n"
        )
        self.assertEqual(_extract_mula_text(segment), "मूलपाठः")

    def test_leading_hide_label_does_not_truncate_mula(self) -> None:
        """Isavasya-vd prefatory: leading bare hide label is stripped, not a cap."""
        segment = (
            "<!-- sanskrit:devanagari -->\n"
            "<!-- hide -->शान्तिपाठः<!-- /hide -->\n"
            "ओम् पूर्णमदः पूर्णमिदं पूर्णात्पूर्णमुदच्यते|पूर्णस्य "
            "पूर्णमादाय पूर्णमेवावशिष्यते ओम्शान्तिः शान्तिः शान्तिः||\n"
            "<!-- /sanskrit:devanagari -->\n"
        )
        self.assertEqual(
            _extract_mula_text(segment),
            "ओम् पूर्णमदः पूर्णमिदं पूर्णात्पूर्णमुदच्यते|पूर्णस्य "
            "पूर्णमादाय पूर्णमेवावशिष्यते ओम्शान्तिः शान्तिः शान्तिः||",
        )

    def test_malformed_close_falls_back_to_any_close(self) -> None:
        """Brihadaranyaka-style stray ``<!-- /hide -->`` close still works."""
        segment = (
            "<!-- sanskrit:devanagari -->\n"
            "**आपो वा अर्कः । तद् यदपां शर आसीत्...॥२॥\n"
            "<!-- /hide -->\n"
        )
        self.assertEqual(
            _extract_mula_text(segment),
            "**आपो वा अर्कः । तद् यदपां शर आसीत्...॥२॥",
        )

    def test_split_blocks_are_joined(self) -> None:
        """Multiple blocks in one segment join with a double newline."""
        segment = (
            "<!-- sanskrit:devanagari -->\n"
            "पूर्वार्धः ।\n"
            "<!-- /sanskrit:devanagari -->\n"
            "<!-- hide type:separator -->\n"
            "---\n"
            "<!-- /hide -->\n"
            "<!-- sanskrit:devanagari -->\n"
            "उत्तरार्धः ।।\n"
            "<!-- /sanskrit:devanagari -->\n"
        )
        self.assertEqual(
            _extract_mula_text(segment),
            "पूर्वार्धः ।\n\nउत्तरार्धः ।।",
        )

    def test_empty_leading_label_does_not_cap(self) -> None:
        """Whitespace-only content before an inline hide must not cap."""
        segment = (
            "<!-- sanskrit:devanagari -->\n"
            "<!-- hide -->\n"
            "<!-- /hide -->\n"
            "मूलपाठः\n"
            "<!-- /sanskrit:devanagari -->\n"
        )
        self.assertEqual(_extract_mula_text(segment), "मूलपाठः")


if __name__ == "__main__":
    unittest.main()
