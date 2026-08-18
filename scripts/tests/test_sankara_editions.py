"""Tests for the converter-side Śaṅkara-edition work.

Covers two behaviors introduced for the Śaṅkara-edition ingestion:

- The flat-converter multi-grantha guard: a BUILD declaring more than one
  distinct ``grantha_id`` must not be ingested by the flat converter.
- The aitareya regression: the Śaṅkara edition must emit its own
  ``sankara-bhashyam`` commentary, not be stripped by the (now removed)
  aitareya grantha_id special-case.

The importer-side filters (``--exclude-editions`` / ``--grantha-id``) live in
``test_import_editions.py``.
"""

from __future__ import annotations

import pathlib
import sys
import tempfile
import unittest
from pathlib import Path

# Allow importing from the parent scripts directory.
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

from convert_structured_md import (  # noqa: E402
    _collect_source_files,
    _resolve_target_commentary_ids,
    build_part_json,
    parse_body,
)

_AITAREYA_SANKARA_FRONTMATTER: dict[str, object] = {
    "grantha_id": "aitareya-upanishad",
    "part_num": 1,
    "commentaries_metadata": [
        {
            "commentary_id": "sankara-bhashyam",
            "commentary_title": "ऐतरेयोपनिषद्भाष्यम्",
            "commentator": {
                "devanagari": "श्रीमच्छङ्करभगवत्पूज्यपादः",
                "roman": "śrīmacchaṅkarabhagavatpūjyapādaḥ",
            },
        }
    ],
}

_AITAREYA_RANGARAMANUJA_FRONTMATTER: dict[str, object] = {
    "grantha_id": "aitareya-upanishad",
    "part_num": 1,
    "commentaries_metadata": [
        {
            "commentary_id": "rangaramanuja-muni-prakashika",
            "commentary_title": "प्रकाशिका",
            "commentator": {
                "devanagari": "श्रीरङ्गरामानुजमुनिः",
                "roman": "",
            },
        }
    ],
}


class TestResolveTargetCommentaryIds(unittest.TestCase):
    """The aitareya Śaṅkara edition keeps its own commentary (regression)."""

    def test_sankara_edition_keeps_sankara_bhashyam(self) -> None:
        """A Śaṅkara aitareya file resolves to its own commentary id."""
        self.assertEqual(
            _resolve_target_commentary_ids(_AITAREYA_SANKARA_FRONTMATTER),
            ["sankara-bhashyam"],
        )

    def test_rangaramanuja_edition_keeps_rangaramanuja(self) -> None:
        """The Rangaramanuja aitareya file resolves to only its own id."""
        self.assertEqual(
            _resolve_target_commentary_ids(_AITAREYA_RANGARAMANUJA_FRONTMATTER),
            ["rangaramanuja-muni-prakashika"],
        )

    def test_sankara_part_ships_commentary(self) -> None:
        """build_part_json emits the sankara commentary for a Śaṅkara file."""
        body = parse_body(
            "# Mantra 1.1.1\n\n"
            "<!-- sanskrit:devanagari -->\nॐ\n<!-- /sanskrit:devanagari -->\n"
            "<!-- commentary: {\"commentary_id\": \"sankara-bhashyam\"} -->\n"
            "# Commentary: 1.1.1\n\n"
            "<!-- sanskrit:devanagari -->\nभाष्यम्\n<!-- /sanskrit:devanagari -->\n"
        )
        part = build_part_json(
            _AITAREYA_SANKARA_FRONTMATTER,
            body,
            edition_id="aitareya-upanishad-sankara-bhashya",
            target_commentary_ids=["sankara-bhashyam"],
        )
        self.assertEqual(part["commentary"]["commentary_id"], "sankara-bhashyam")
        self.assertEqual(len(part["commentary"]["passages"]), 1)


class TestFlatConverterMultiGranthaGuard(unittest.TestCase):
    """The flat converter refuses a BUILD with >1 distinct grantha_id."""

    def test_multiple_grantha_ids_raise(self) -> None:
        """A BUILD declaring two grantha_ids blocks the flat converter."""
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp)
            (src / "BUILD").write_text(
                'grantha_md2json_single(\n'
                '    name = "base",\n'
                '    grantha_id = "taittiriya-upanishad",\n'
                '    markdown_file = "a.md",\n'
                ')\n'
                'grantha_md2json_single(\n'
                '    name = "sankara",\n'
                '    grantha_id = "taittiriya-upanishad-sankara-bhashya",\n'
                '    markdown_file = "b.md",\n'
                ')\n',
                encoding="utf-8",
            )
            for name in ("a.md", "b.md"):
                (src / name).write_text(
                    "---\n"
                    "grantha_id: taittiriya-upanishad\n"
                    "part_num: 1\n"
                    "---\n"
                    "# Mantra 1.1\n\nॐ\n",
                    encoding="utf-8",
                )
            with self.assertRaises(ValueError) as ctx:
                _collect_source_files(src)
            self.assertIn("multiple edition grantha_ids", str(ctx.exception))
            self.assertIn("import_editions.py", str(ctx.exception))

    def test_single_grantha_id_ok(self) -> None:
        """A BUILD with one grantha_id still works (svetasvatara/kaushitaki)."""
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp)
            (src / "BUILD").write_text(
                'grantha_md2json_single(\n'
                '    name = "md2json",\n'
                '    grantha_id = "svetasvatara-upanishad",\n'
                '    markdown_file = "a.md",\n'
                ')\n',
                encoding="utf-8",
            )
            (src / "a.md").write_text(
                "---\n"
                "grantha_id: svetasvatara-upanishad\n"
                "part_num: 1\n"
                "---\n"
                "# Mantra 1.1\n\nॐ\n",
                encoding="utf-8",
            )
            result = _collect_source_files(src)
            self.assertEqual([p.name for p in result], ["a.md"])


if __name__ == "__main__":
    unittest.main()
