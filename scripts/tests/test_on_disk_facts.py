"""On-disk invariant pins for the school-namespace design (design §1, §4).

These lock the *current* on-disk facts the namespace design depends on — the
śaṅkara editions present and the deferral-by-absence targets, the
`default_school` declarations in granthas-meta.json, the gita-bhashya fold-in
(C1), the vedarthasangraha shape (C2), and the namespaced bimap shape. A
failure means an invariant the resolver relies on has changed, not that the
code is wrong.

Re-run this on every reference-pipeline change.
"""

from __future__ import annotations

import json
import pathlib
import sys
import unittest

_TEST_DIR = pathlib.Path(__file__).parent
_EXPLORER_ROOT = _TEST_DIR.parents[1]
_LIBRARY_ROOT = _EXPLORER_ROOT / "public" / "data" / "library"
_META_PATH = _EXPLORER_ROOT / "public" / "data" / "granthas-meta.json"
_GRANTHA_DATA_ROOT = _EXPLORER_ROOT.parent / "grantha-data"
_BIMAP_PATH = _GRANTHA_DATA_ROOT / "data" / "citation_bimap.yaml"

# Verified 2026-08-21 by scanning every grantha-envelope on disk.
SANKARA_EDITIONS_PRESENT = [
    "brihadaranyaka-upanishad-sankara-bhashya",
    "isavasya-upanishad-sankara-bhashya",
    "chhandogya-upanishad-sankara-bhashya",
    "katha-upanishad-sankara-bhashya",
    "kena-upanishad-sankara-pada-bhashya",
    "kena-upanishad-sankara-vakya-bhashya",
    "mandukya-upanishad-sankara-bhashya",
    "mundaka-upanishad-sankara-bhashya",
    "prashna-upanishad-sankara-bhashya",
    "taittiriya-upanishad-sankara-bhashya",
    "aitareya-upanishad-sankara-bhashya",
]

SANKARA_EDITIONS_ABSENT = [
    "svetasvatara-upanishad-sankara-bhashya",
    "kaushitaki-upanishad-sankara-bhashya",
    "brahma-sutra-sankara-bhashya",
]

RAMANUJA_DEFAULT_SCHOOL_GRANTHAS = [
    "brahma-sutra",
    "isavasya-upanishad",
    "aitareya-upanishad",
    "brihadaranyaka-upanishad",
    "chhandogya-upanishad",
    "katha-upanishad",
    "kaushitaki-upanishad",
    "kena-upanishad",
    "mandukya-upanishad",
    "mandukya-karika",
    "mundaka-upanishad",
    "prashna-upanishad",
    "svetasvatara-upanishad",
    "taittiriya-upanishad",
]


def _collect_json_files(root: pathlib.Path) -> list[pathlib.Path]:
    """Return all .json files under root, recursively."""
    return sorted(p for p in root.rglob("*.json"))


def _grantha_envelopes() -> list[dict]:
    """Return every grantha-envelope payload in the library."""
    envelopes = []
    for p in _collect_json_files(_LIBRARY_ROOT):
        if p.name != "envelope.json":
            continue
        data = json.loads(p.read_text(encoding="utf-8"))
        if data.get("kind") == "grantha-envelope":
            envelopes.append(data)
    return envelopes


def _on_disk_edition_ids() -> set[str]:
    """All edition ids present across grantha-envelopes on disk."""
    ids: set[str] = set()
    for env in _grantha_envelopes():
        for e in env.get("editions", []):
            if isinstance(e, dict) and e.get("edition_id"):
                ids.add(e["edition_id"])
    return ids


def _load_bimap() -> dict:
    """Load the citation bimap YAML (skipped when the sibling checkout is absent)."""
    import yaml  # noqa: PLC0415

    return yaml.safe_load(_BIMAP_PATH.read_text(encoding="utf-8"))


class TestSankaraEditionsOnDisk(unittest.TestCase):
    """The sankara namespace's edition targets, present and absent (design §4.1)."""

    @classmethod
    def setUpClass(cls) -> None:
        if not _LIBRARY_ROOT.exists():
            raise unittest.SkipTest("library dir not present")
        cls.on_disk = _on_disk_edition_ids()

    def test_sankara_editions_present(self) -> None:
        """The 11 śaṅkara editions the sankara namespace links to are on disk."""
        missing = [e for e in SANKARA_EDITIONS_PRESENT if e not in self.on_disk]
        self.assertEqual(missing, [], f"missing sankara editions on disk: {missing}")

    def test_sankara_editions_absent_deferral_targets(self) -> None:
        """The 3 absent śaṅkara editions must stay absent (deferral-by-absence)."""
        present = [e for e in SANKARA_EDITIONS_ABSENT if e in self.on_disk]
        self.assertEqual(
            present, [],
            "deferral targets unexpectedly on disk — they would now link, "
            "not defer:",
        )


class TestRamanujaDefaultsOnDisk(unittest.TestCase):
    """Every school-flavored-default grantha carries default_school (design §4.1)."""

    @classmethod
    def setUpClass(cls) -> None:
        if not _META_PATH.exists():
            raise unittest.SkipTest("meta not present")
        cls.meta = json.loads(_META_PATH.read_text(encoding="utf-8"))

    def test_default_school_seeded(self) -> None:
        """The 14 school-flavored-default granthas declare default_school: ramanuja."""
        undeclared = [
            gid for gid in RAMANUJA_DEFAULT_SCHOOL_GRANTHAS
            if self.meta.get(gid, {}).get("default_school") != "ramanuja"
        ]
        self.assertEqual(undeclared, [], f"missing default_school on: {undeclared}")

    def test_default_school_only_on_confirmed_granthas(self) -> None:
        """No grantha outside the confirmed set declares default_school."""
        declared = {
            gid for gid, entry in self.meta.items()
            if isinstance(entry, dict) and entry.get("default_school")
        }
        self.assertEqual(
            declared, set(RAMANUJA_DEFAULT_SCHOOL_GRANTHAS),
            "default_school declared on an unlisted grantha",
        )


class TestGitaBhashyamFoldIn(unittest.TestCase):
    """C1: gita-bhashyam is folded into the single bhagavad-gita edition."""

    def test_bhagavad_gita_is_single_edition(self) -> None:
        """bhagavad-gita has no grantha-envelope editions array (C1)."""
        gita_env = _EXPLORER_ROOT / "public" / "data" / "library" / "bhagavad-gita" / "bhagavad-gita" / "envelope.json"
        self.assertTrue(gita_env.exists(), "bhagavad-gita edition envelope missing")
        env = json.loads(gita_env.read_text(encoding="utf-8"))
        self.assertEqual(env.get("kind"), "edition-sub-envelope")
        self.assertEqual(env.get("edition_id"), "bhagavad-gita")
        self.assertNotIn("editions", env)

    def test_gita_bhashyam_commentary_inside_edition(self) -> None:
        """The Rāmānuja bhāṣya is a commentary inside the single edition, not an edition."""
        part = _EXPLORER_ROOT / "public" / "data" / "library" / "bhagavad-gita" / "bhagavad-gita" / "part1.json"
        data = json.loads(part.read_text(encoding="utf-8"))
        c = data.get("commentary") or data.get("commentaries")
        comms = c if isinstance(c, list) else ([c] if c else [])
        cids = [x.get("commentary_id") for x in comms if isinstance(x, dict)]
        self.assertIn("gita-bhashyam", cids)


class TestVedarthasangrahaShape(unittest.TestCase):
    """C2: vedarthasangraha is a mula-only author work (no commentaries_metadata)."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.src = _GRANTHA_DATA_ROOT / "structured_md" / "vedarthasangraha" / "vedarthasangraha-01.md"

    def test_vedarthasangraha_source_mula_author(self) -> None:
        """The vedarthasangraha source has no commentaries_metadata, only author."""
        if not self.src.exists():
            self.skipTest("vedarthasangraha source absent")
        text = self.src.read_text(encoding="utf-8")
        self.assertNotIn("commentaries_metadata", text)
        self.assertIn("author:", text)

    def test_vedarthasangraha_author_is_ramanuja(self) -> None:
        """Its author (rāmānuja) makes it a rāmānuja-namespace work."""
        if not self.src.exists():
            self.skipTest("vedarthasangraha source absent")
        text = self.src.read_text(encoding="utf-8")
        self.assertIn("रामानुज", text)


class TestBimapNamespacedShape(unittest.TestCase):
    """The bimap is now the namespaced {granthas, namespaces} shape."""

    def test_bimap_is_namespaced(self) -> None:
        """citation_bimap.yaml has granthas + namespaces (post-migration)."""
        if not _BIMAP_PATH.exists():
            self.skipTest("bimap absent")
        bimap = _load_bimap()
        self.assertIsInstance(bimap, dict)
        self.assertIn("granthas", bimap)
        self.assertIn("namespaces", bimap)
        self.assertIn("ramanuja", bimap["namespaces"])
        self.assertIn("sankara", bimap["namespaces"])


if __name__ == "__main__":
    unittest.main()
