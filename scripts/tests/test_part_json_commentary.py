"""Tests for ``build_part_json`` commentary emission shape.

Regression for the intro-only preface part: a commentary with an ``intro``
(the mangalacarana) and zero verse glosses must still emit ``passages: []``.
Before the fix, ``passages`` was emitted only when non-empty, so an intro-only
commentary omitted the key entirely — a schema violation (``passages`` is
required) and a runtime crash (``commentary.passages.map`` on undefined).

Re-run this on every future converter change.
"""

from __future__ import annotations

import pathlib
import sys
import unittest

# Allow importing from the parent scripts directory.
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

from convert_structured_md import BodyData, CommentaryPassage, build_part_json  # noqa: E402


def _intro_only_frontmatter() -> dict[str, object]:
    """Return frontmatter for a preface part with a single commentary."""
    return {
        "grantha_id": "bhagavad-gita",
        "part_num": 1,
        "commentaries_metadata": [
            {
                "commentary_id": "gita-bhashyam",
                "commentary_title": "श्रीमद्गीताभाष्यम्",
                "commentator": {
                    "devanagari": "भगवद् रामानुजः",
                    "roman": "bhagavad rāmānujaḥ",
                },
            }
        ],
    }


class TestPartJsonCommentary(unittest.TestCase):
    """Output shape of ``build_part_json``'s commentary emission."""

    def test_intro_only_part_emits_empty_passages(self) -> None:
        """An intro-only commentary emits ``passages: []``, not a missing key."""
        body = BodyData()
        body.commentary_intros = {"gita-bhashyam": "मङ्गलाचरणम्"}
        result = build_part_json(
            _intro_only_frontmatter(),
            body,
            "bhagavad-gita",
            ["gita-bhashyam"],
        )
        commentary = result["commentary"]
        self.assertEqual(commentary["passages"], [])
        self.assertEqual(
            commentary["intro"],
            {"sanskrit": {"devanagari": "मङ्गलाचरणम्"}},
        )

    def test_two_commentaries_emit_plural(self) -> None:
        """Two commentaries with content emit ``commentaries`` (plural), not ``commentary``."""
        frontmatter = _intro_only_frontmatter()
        frontmatter["commentaries_metadata"].append(
            {
                "commentary_id": "tatparya-chandrika",
                "commentary_title": "तात्पर्यचन्द्रिका",
                "commentator": {
                    "devanagari": "श्रीमद्वेदान्ताचार्यः",
                    "roman": "śrīmadvēdāntācāryaḥ",
                },
                "parent_commentary_id": "gita-bhashyam",
            }
        )
        body = BodyData()
        body.commentary_intros = {"gita-bhashyam": "मङ्गलाचरणम्"}
        body.commentary_blocks["tatparya-chandrika"] = [
            CommentaryPassage(ref="0.1", text="तात्पर्यग्लोसः")
        ]
        result = build_part_json(
            frontmatter,
            body,
            "bhagavad-gita",
            ["gita-bhashyam", "tatparya-chandrika"],
        )
        self.assertNotIn("commentary", result)
        self.assertEqual(len(result["commentaries"]), 2)
        tika = next(c for c in result["commentaries"] if c["commentary_id"] == "tatparya-chandrika")
        self.assertEqual(tika["parent_commentary_id"], "gita-bhashyam")
        self.assertEqual(tika["passages"][0]["ref"], "0.1")

    def test_references_emitted_when_library_available(self) -> None:
        """A citation in commentary text emits schema-shaped references.

        Skips when the sibling grantha-data checkout is absent (CI without a
        cross-repo checkout), matching the converter's best-effort behavior.
        """
        import os

        tools_lib = _sibling_tools_lib()
        if tools_lib is None:
            self.skipTest("sibling grantha-data checkout not present")
        os.environ["GRANTHA_DATA_TOOLS_LIB"] = str(tools_lib)
        try:
            import grantha_data_bootstrap
            grantha_data_bootstrap.ensure_grantha_data_importable()
            body = BodyData()
            body.commentary_blocks["gita-bhashyam"] = [
                CommentaryPassage(ref="1.1", text="इति (श्वे. उ. १.९) उक्तम्"),
            ]
            diagnostics: list[dict[str, object]] = []
            result = build_part_json(
                _intro_only_frontmatter(),
                body,
                "bhagavad-gita",
                ["gita-bhashyam"],
                diagnostics,
            )
        finally:
            os.environ.pop("GRANTHA_DATA_TOOLS_LIB", None)
        passage = result["commentary"]["passages"][0]
        refs = passage["references"]
        self.assertEqual(len(refs), 1)
        self.assertEqual(refs[0]["grantha_id"], "svetasvatara-upanishad")
        self.assertEqual(refs[0]["locator"], "1.9")
        self.assertEqual(refs[0]["display_text"], "श्वे. उ. १.९")
        self.assertFalse(refs[0]["unresolved"])
        self.assertEqual(diagnostics, [])


def _sibling_tools_lib() -> pathlib.Path | None:
    """Return the sibling grantha-data ``tools/lib`` path, or None."""
    explorer_root = pathlib.Path(__file__).parent.parent.parent
    candidate = explorer_root.parent / "grantha-data" / "tools" / "lib"
    if (candidate / "grantha_data").is_dir():
        return candidate
    return None


if __name__ == "__main__":
    unittest.main()
