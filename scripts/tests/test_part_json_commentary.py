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

from convert_structured_md import BodyData, build_part_json  # noqa: E402


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
            "gita-bhashyam",
        )
        commentary = result["commentary"]
        self.assertEqual(commentary["passages"], [])
        self.assertEqual(
            commentary["intro"],
            {"sanskrit": {"devanagari": "मङ्गलाचरणम्"}},
        )


if __name__ == "__main__":
    unittest.main()
