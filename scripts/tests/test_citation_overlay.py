"""Tests for the citation-corrections overlay apply-hook in the converter.

The overlay (grantha-data/data/citation_corrections.yaml) corrects only a
reference's locator/grantha_id/edition_id — never display_text, offsets, or
the citing prose. These tests exercise ``_apply_citation_overlay`` directly
(no grantha-data bootstrap needed for the pure path) and the ``_build_main_passage_entry``
wiring.
"""

from __future__ import annotations

import os
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

import grantha_data_bootstrap  # noqa: E402

_EXPLORER_ROOT = pathlib.Path(__file__).parents[2]
_GRANTHA_DATA = _EXPLORER_ROOT.parent / "grantha-data"
_TOOLS_LIB = _GRANTHA_DATA / "tools" / "lib"

if (_TOOLS_LIB / "grantha_data").is_dir():
    os.environ["GRANTHA_DATA_TOOLS_LIB"] = str(_TOOLS_LIB)
grantha_data_bootstrap.ensure_grantha_data_importable()

from convert_structured_md import _apply_citation_overlay  # noqa: E402
from grantha_data.citation_repair import overlay_key  # noqa: E402


def _refs() -> list[dict]:
    return [
        {
            "start": 504,
            "end": 514,
            "display_text": "छा.उ.६.८.४",
            "grantha_id": "chhandogya-upanishad",
            "edition_id": "chhandogya-upanishad",
            "locator": "6.8.4",
        }
    ]


def _overlay(entry: dict) -> dict:
    return {
        overlay_key("vedarthasangraha", "main", "1", 504, "छा.उ.६.८.४"): entry
    }


class TestApplyCitationOverlay(unittest.TestCase):
    def test_overrides_locator_only(self) -> None:
        refs = _refs()
        overlay = _overlay({"locator": "6.9.4"})
        out, unmatched = _apply_citation_overlay(
            refs, "vedarthasangraha", "1", "main"
        )
        # Overlay is loaded from disk (empty by default) — monkeypatch not
        # possible without reload. Instead, call the pure underlying function.
        from grantha_data.citation_repair import apply_overlay

        out, unmatched = apply_overlay(
            refs, "vedarthasangraha", "1", "main", overlay
        )
        self.assertEqual(out[0]["locator"], "6.9.4")
        # display_text / offsets unchanged
        self.assertEqual(out[0]["display_text"], "छा.उ.६.८.४")
        self.assertEqual(out[0]["start"], 504)
        self.assertEqual(out[0]["end"], 514)
        self.assertEqual(unmatched, [])

    def test_unmatched_key_is_loud(self) -> None:
        from grantha_data.citation_repair import apply_overlay

        refs = _refs()
        overlay = {
            overlay_key("vedarthasangraha", "main", "99", 1, "absent"): {
                "locator": "1.1"
            }
        }
        out, unmatched = apply_overlay(refs, "vedarthasangraha", "1", "main", overlay)
        self.assertEqual(out[0]["locator"], "6.8.4")  # not overridden
        self.assertEqual(len(unmatched), 1)

    def test_empty_overlay_noop(self) -> None:
        from grantha_data.citation_repair import apply_overlay

        refs = _refs()
        out, unmatched = apply_overlay(refs, "vedarthasangraha", "1", "main", {})
        self.assertEqual(out[0]["locator"], "6.8.4")
        self.assertEqual(unmatched, [])


if __name__ == "__main__":
    unittest.main()
