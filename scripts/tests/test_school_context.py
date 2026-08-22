"""Tests for converter-side school-namespace threading (design §4.2, §4.3).

Covers:
- ``_citation_context``: the citing edition's school namespace from
  frontmatter (per-commentary ``citation_namespace`` or grantha-level), with a
  conflict guard.
- Mula-passage reference extraction: main passages carry ``references[]`` when
  the mula prose cites (vedarthasangraha ``# Para N``).
- ``build_part_json`` threads the context so commentary references resolve in
  the school namespace (edition_id emitted on school targets).

Uses the real namespaced bimap via the GRANTHA_DATA_TOOLS_LIB bootstrap; the
suite is skipped when the sibling checkout is absent.
"""

from __future__ import annotations

import os
import pathlib
import sys
import unittest

# Allow importing from the parent scripts directory.
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

import grantha_data_bootstrap  # noqa: E402

_TEST_DIR = pathlib.Path(__file__).parent
_EXPLORER_ROOT = _TEST_DIR.parents[1]
_GRANTHA_DATA = _EXPLORER_ROOT.parent / "grantha-data"
_TOOLS_LIB = _GRANTHA_DATA / "tools" / "lib"


def _bootstrap_ready() -> bool:
    """True when the grantha-data sibling checkout is present (skip otherwise)."""
    return _GRANTHA_DATA.exists()


def _ensure_bootstrap() -> None:
    """Make grantha_data importable via the env-gated bootstrap."""
    if (_TOOLS_LIB / "grantha_data").is_dir():
        os.environ["GRANTHA_DATA_TOOLS_LIB"] = str(_TOOLS_LIB)
    grantha_data_bootstrap.ensure_grantha_data_importable()


_ensure_bootstrap()

from convert_structured_md import (  # noqa: E402
    BodyData,
    _build_main_passage_entry,
    _citation_context,
    build_part_json,
    parse_body,
)

_SANKARA_FRONTMATTER: dict[str, object] = {
    "grantha_id": "isavasya-upanishad",
    "part_num": 1,
    "commentaries_metadata": [
        {
            "commentary_id": "sankara-bhashyam",
            "commentary_title": "ईशावास्योपनिषद्भाष्यम्",
            "commentator": {
                "devanagari": "श्रीमच्छङ्करभगवत्पूज्यपादः",
                "roman": "śrīmacchaṅkarabhagavatpūjyapādaḥ",
            },
            "citation_namespace": "sankara",
        }
    ],
}

_RAMANUJA_FRONTMATTER: dict[str, object] = {
    "grantha_id": "isavasya-upanishad",
    "part_num": 1,
    "commentaries_metadata": [
        {
            "commentary_id": "srivatsanarayana-bhashya",
            "commentary_title": "प्रकाशिका",
            "commentator": {
                "devanagari": "श्रीवत्सनारायणमुनिः",
                "roman": "śrīvatsanārāyaṇamuniḥ",
            },
            "citation_namespace": "ramanuja",
        }
    ],
}


@unittest.skipUnless(_bootstrap_ready(), "grantha-data sibling checkout absent")
class TestCitationContext(unittest.TestCase):
    """Deriving the citing edition's school namespace from frontmatter."""

    def test_sankara_namespace_read_from_commentary(self) -> None:
        """A Śaṅkara commentary declares citation_namespace: sankara."""
        self.assertEqual(_citation_context(_SANKARA_FRONTMATTER), "sankara")

    def test_ramanuja_namespace_read_from_commentary(self) -> None:
        """A Rāmānuja commentary declares citation_namespace: ramanuja."""
        self.assertEqual(_citation_context(_RAMANUJA_FRONTMATTER), "ramanuja")

    def test_absent_namespace_is_base_context(self) -> None:
        """No citation_namespace → school-neutral (base table)."""
        fm = {
            "grantha_id": "isavasya-upanishad",
            "part_num": 1,
            "commentaries_metadata": [
                {"commentary_id": "x", "commentary_title": "",
                 "commentator": {"devanagari": "X"}}
            ],
        }
        self.assertEqual(_citation_context(fm), "")

    def test_grantha_level_namespace_supported(self) -> None:
        """vedarthasangraha-style grantha-level citation_namespace is read."""
        fm = {"grantha_id": "vedarthasangraha", "citation_namespace": "ramanuja"}
        self.assertEqual(_citation_context(fm), "ramanuja")

    def test_conflicting_namespace_is_error(self) -> None:
        """A grantha-level namespace disagreeing with a commentary one fails."""
        fm = {
            "grantha_id": "vedarthasangraha",
            "citation_namespace": "ramanuja",
            "commentaries_metadata": [
                {
                    "commentary_id": "x",
                    "citation_namespace": "sankara",
                    "commentary_title": "",
                    "commentator": {"devanagari": "X"},
                }
            ],
        }
        with self.assertRaises(ValueError):
            _citation_context(fm)


@unittest.skipUnless(_bootstrap_ready(), "grantha-data sibling checkout absent")
class TestMulaReferenceExtraction(unittest.TestCase):
    """Main (mula) passages carry references[] like commentary passages."""

    def setUp(self) -> None:
        _ensure_bootstrap()

    def test_mula_passage_with_citation_emits_references(self) -> None:
        """A mula prose passage citing a work emits references[] on the passage."""
        body = parse_body(
            "# Para 1\n\n"
            "<!-- sanskrit:devanagari -->\n"
            "तदाह (बृ. उ. १.४.१७) इति ।\n"
            "<!-- /sanskrit:devanagari -->\n"
        )
        entry = _build_main_passage_entry(body.passages[0], context="ramanuja")
        self.assertEqual(entry["passage_type"], "main")
        refs = entry.get("references")
        self.assertIsNotNone(refs)
        self.assertGreaterEqual(len(refs), 1)
        self.assertEqual(refs[0]["grantha_id"], "brihadaranyaka-upanishad")

    def test_mula_passage_without_citation_has_no_references_key(self) -> None:
        """A mula passage with no citations omits the references key."""
        body = parse_body(
            "# Para 1\n\n"
            "<!-- sanskrit:devanagari -->\n"
            "अथातो ब्रह्मजिज्ञासा ।\n"
            "<!-- /sanskrit:devanagari -->\n"
        )
        entry = _build_main_passage_entry(body.passages[0])
        self.assertNotIn("references", entry)


@unittest.skipUnless(_bootstrap_ready(), "grantha-data sibling checkout absent")
class TestPartContextThreading(unittest.TestCase):
    """build_part_json threads the school context into reference emission."""

    def setUp(self) -> None:
        _ensure_bootstrap()

    def test_sankara_part_emits_school_edition(self) -> None:
        """A Śaṅkara commentary citing बृ. उ. stamps the śaṅkara edition_id."""
        body = parse_body(
            "# Mantra 1\n\n"
            "<!-- sanskrit:devanagari -->\n"
            "ॐ\n"
            "<!-- /sanskrit:devanagari -->\n"
            "<!-- commentary: {\"commentary_id\": \"sankara-bhashyam\"} -->\n"
            "# Commentary: 1\n\n"
            "<!-- sanskrit:devanagari -->\n"
            "(बृ. उ. १.४.१७) इत्यादि ।\n"
            "<!-- /sanskrit:devanagari -->\n"
        )
        part = build_part_json(
            _SANKARA_FRONTMATTER,
            body,
            "isavasya-upanishad-sankara-bhashya",
            ["sankara-bhashyam"],
        )
        refs = part["commentary"]["passages"][0]["references"]
        self.assertEqual(refs[0]["grantha_id"], "brihadaranyaka-upanishad")
        self.assertEqual(
            refs[0]["edition_id"], "brihadaranyaka-upanishad-sankara-bhashya"
        )

    def test_ramanuja_part_emits_mula_or_own_edition(self) -> None:
        """A Rāmānuja commentary's भ. गी. falls to base mula (no edition)."""
        body = parse_body(
            "# Mantra 1\n\n"
            "<!-- sanskrit:devanagari -->\n"
            "ॐ\n"
            "<!-- /sanskrit:devanagari -->\n"
            "<!-- commentary: {\"commentary_id\": \"srivatsanarayana-bhashya\"} -->\n"
            "# Commentary: 1\n\n"
            "<!-- sanskrit:devanagari -->\n"
            "(भ. गी. ४.२५) इत्यादि ।\n"
            "<!-- /sanskrit:devanagari -->\n"
        )
        part = build_part_json(
            _RAMANUJA_FRONTMATTER,
            body,
            "isavasya-upanishad-srivatsanarayana",
            ["srivatsanarayana-bhashya"],
        )
        refs = part["commentary"]["passages"][0]["references"]
        self.assertEqual(refs[0]["grantha_id"], "bhagavad-gita")
        self.assertIsNone(refs[0].get("edition_id"))


if __name__ == "__main__":
    unittest.main()
