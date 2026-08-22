"""Reserved-absent-id regression test (SPEC §3.1, design §6 check #5).

The bimap uses deliberately-absent grantha/edition ids for deferral-by-absence:
``brihadaranyaka-madhyandina`` (recension not ingested) and the three śaṅkara
editions with no on-disk counterpart (svetasvatara, kaushitaki, brahma-sutra
sankara-bhashyas). These ids are semantically reserved as "intentionally
absent" — a regression test asserts they stay absent from the on-disk library
/ granthas-meta.json, so that ingesting a real grantha with one of these ids
(an unrelated addition) is a loud, reviewed change, not a silent accidental
re-resolution of a deferral target.
"""

from __future__ import annotations

import json
import pathlib
import unittest

_EXPLORER_ROOT = pathlib.Path(__file__).resolve().parents[2]
_LIBRARY_ROOT = _EXPLORER_ROOT / "public" / "data" / "library"
_META_PATH = _EXPLORER_ROOT / "public" / "data" / "granthas-meta.json"

# Reserved deliberately-absent ids: a deferral-by-absence target.
RESERVED_ABSENT_IDS = {
    "brihadaranyaka-madhyandina",
    "svetasvatara-upanishad-sankara-bhashya",
    "kaushitaki-upanishad-sankara-bhashya",
    "brahma-sutra-sankara-bhashya",
}


def _all_library_ids() -> set[str]:
    """Every grantha + edition id present in the on-disk library."""
    ids: set[str] = set()
    for p in _LIBRARY_ROOT.rglob("*.json"):
        if p.name in ("envelope.json", "references-report.json"):
            continue
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        for key in ("grantha_id", "edition_id"):
            v = data.get(key)
            if isinstance(v, str):
                ids.add(v)
    return ids


class TestReservedAbsentIds(unittest.TestCase):
    """Deferral-by-absence ids stay absent (never silently re-resolve)."""

    @classmethod
    def setUpClass(cls) -> None:
        if not _LIBRARY_ROOT.exists():
            raise unittest.SkipTest("library dir not present")
        cls.library_ids = _all_library_ids()

    def test_reserved_ids_absent_from_library(self) -> None:
        """A reserved deferral target appearing on disk is a loud, reviewed
        change — not a silent re-resolution."""
        present = sorted(RESERVED_ABSENT_IDS & self.library_ids)
        self.assertEqual(
            present, [],
            f"reserved deferral ids present on disk — ingesting a grantha with "
            f"this id would silently re-resolve a deferral target: {present}",
        )

    def test_reserved_ids_absent_from_meta(self) -> None:
        """The meta registry also must not gain a reserved deferral id."""
        if not _META_PATH.exists():
            self.skipTest("meta not present")
        meta = json.loads(_META_PATH.read_text(encoding="utf-8"))
        present = sorted(RESERVED_ABSENT_IDS & set(meta))
        self.assertEqual(
            present, [],
            f"reserved deferral ids present in granthas-meta.json: {present}",
        )


if __name__ == "__main__":
    unittest.main()
