"""Tests for ``_quote_sidecar_for`` explorer-sidecar resolution.

The quote sidecar (``public/data/sidecars/<grantha_id>/citation_quotes.json``)
annotates the ``references[]``-bearing library JSON this repo's converter
produces. These tests pin the resolution path: it must read from the explorer
sidecars dir (not the grantha-data source dir it historically lived in), and
degrade gracefully when a grantha has no sidecar.
"""

from __future__ import annotations

import json
import pathlib
import sys
import tempfile
import unittest

# Allow importing from the parent scripts directory.
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

from convert_structured_md import _quote_sidecar_for  # noqa: E402

_QUOTE_ROW = {
    "passage_ref": "1",
    "passage_type": "main",
    "ref_start": 505,
    "ref_end": 516,
    "quote_start": 494,
    "quote_end": 503,
    "quote_text": "तत्त्वमसि",
    "status": "matched",
    "quality": 0.08,
}


def _make_sidecar(path: pathlib.Path, rows: list[dict]) -> None:
    """Write a sidecar file (grantha_id-wrapped) at ``path``."""
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"grantha_id": path.parent.name, "quotes": rows}
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


class TestQuoteSidecarResolution(unittest.TestCase):
    """Resolution of the quote sidecar from the explorer data tree."""

    def test_loads_from_explorer_sidecars_dir(self) -> None:
        """A sidecar under public/data/sidecars/<gid>/ is found and keyed."""
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            sidecar = root / "public" / "data" / "sidecars" / "vedarthasangraha"
            sidecar_file = sidecar / "citation_quotes.json"
            _make_sidecar(sidecar_file, [_QUOTE_ROW])

            rows = _quote_sidecar_for(root, "vedarthasangraha")
            self.assertIsNotNone(rows)
            self.assertIn(("1", "main", 505), rows)
            self.assertEqual(rows[("1", "main", 505)].quote_text, "तत्त्वमसि")

    def test_ignores_sidecar_in_source_dir(self) -> None:
        """A legacy citation_quotes.json next to the source dir is NOT read.

        The sidecar's home moved to the explorer's public/data/sidecars/; a
        file still sitting beside the grantha-data source must be ignored so
        the converter never accidentally uses a stale copy.
        """
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            source_dir = root / "structured_md" / "vedarthasangraha"
            _make_sidecar(source_dir / "citation_quotes.json", [_QUOTE_ROW])

            rows = _quote_sidecar_for(root, "vedarthasangraha")
            self.assertIsNone(rows)

    def test_missing_sidecar_returns_none(self) -> None:
        """No sidecar for a grantha → None (no quote stamping, no error)."""
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            self.assertIsNone(_quote_sidecar_for(root, "kena-upanishad"))

    def test_malformed_sidecar_returns_none(self) -> None:
        """A malformed sidecar degrades to None (never a hard failure)."""
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            sidecar = root / "public" / "data" / "sidecars" / "vedarthasangraha"
            sidecar_file = sidecar / "citation_quotes.json"
            sidecar.mkdir(parents=True)
            sidecar_file.write_text("{ not valid json", encoding="utf-8")

            rows = _quote_sidecar_for(root, "vedarthasangraha")
            self.assertIsNone(rows)


if __name__ == "__main__":
    unittest.main()
