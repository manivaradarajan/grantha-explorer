"""On-disk invariant pins for the per-block mula presentation design (IDEA.md).

Mirror of the vitest `tests/integration/mula-presentation.test.ts` in Python.
The presentation of a mula passage is a total, pinned function of the
passage's declared `kind`. The committed `public/data/library` JSON must
carry, for every edition:

- `passage.kind` (the markdown heading word) on every `passage_type: "main"`
  passage, drawn from the pinned classification; absent on prefatory/
  concluding passages; and
- `edition_kind` (`"mula-only" | "commentarial"`) on the edition envelope
  (multipart) or grantha file (flat), consistent with commentary presence:
  a commentarial edition carries a commentary in every part, a mula-only
  edition in none.

These are data-invariant checks — a failure means the committed artifact
drifted from the model, not that the code is wrong. Re-run on every pipeline
change.
"""

from __future__ import annotations

import json
import pathlib
import unittest

_EXPLORER_ROOT = pathlib.Path(__file__).parents[2]
_LIBRARY_ROOT = _EXPLORER_ROOT / "public" / "data" / "library"

# Pinned classification (must match lib/data.ts KNOWN_PASSAGE_KINDS /
# presentationFor). Any kind found in the corpus that is absent here is a
# build error.
_PROSE_KINDS = {"Para", "Gadya"}
_VERSE_KINDS = {"Shloka", "Mantra", "Verse", "Sutra"}
_KNOWN_KINDS = _PROSE_KINDS | _VERSE_KINDS


def _has_commentary(obj: dict) -> bool:
    commentary = obj.get("commentary")
    commentaries = obj.get("commentaries")
    if isinstance(commentary, dict) and commentary:
        return True
    return isinstance(commentaries, list) and len(commentaries) > 0


def _passages_of(obj: dict) -> list[dict]:
    out: list[dict] = []
    for key in ("passages", "prefatory_material", "concluding_material"):
        arr = obj.get(key)
        if isinstance(arr, list):
            out.extend(arr)
    return out


def _collect_editions() -> list[dict]:
    """Collect edition info: {edition_id, flat, edition_kind, parts}."""
    editions: list[dict] = []
    for path in sorted(_LIBRARY_ROOT.rglob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            continue
        if data.get("kind") == "grantha":
            editions.append(
                {
                    "edition_id": data.get("edition_id") or data.get("grantha_id"),
                    "flat": True,
                    "edition_kind": data.get("edition_kind"),
                    "parts": [
                        {
                            "file": path.name,
                            "passages": _passages_of(data),
                            "has_commentary": _has_commentary(data),
                        }
                    ],
                }
            )
        elif data.get("kind") == "edition-sub-envelope":
            parts = []
            for part in data.get("parts", []):
                part_path = path.parent / part["file"]
                if not part_path.exists():
                    continue
                part_data = json.loads(part_path.read_text(encoding="utf-8"))
                parts.append(
                    {
                        "file": part["file"],
                        "passages": _passages_of(part_data),
                        "has_commentary": _has_commentary(part_data),
                    }
                )
            editions.append(
                {
                    "edition_id": data.get("edition_id"),
                    "flat": False,
                    "edition_kind": data.get("edition_kind"),
                    "parts": parts,
                }
            )
    return editions


class TestMulaPresentationFacts(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.editions = _collect_editions()

    def test_known_mula_only_editions_present(self) -> None:
        ids = {e["edition_id"] for e in self.editions}
        self.assertIn("vedarthasangraha", ids)
        self.assertIn("vishnu-purana", ids)

    def test_every_main_passage_has_classified_kind_framing_has_none(self) -> None:
        main_count = 0
        framing_count = 0
        for edition in self.editions:
            for part in edition["parts"]:
                for passage in part["passages"]:
                    if passage.get("passage_type") == "main":
                        main_count += 1
                        kind = passage.get("kind")
                        self.assertIn(
                            kind,
                            _KNOWN_KINDS,
                            f"main passage {edition['edition_id']}:{part['file']}:{passage.get('ref')} "
                            f"has unclassified kind {kind!r}",
                        )
                    else:
                        framing_count += 1
                        self.assertIsNone(
                            passage.get("kind"),
                            f"framing passage {edition['edition_id']}:{passage.get('ref')} "
                            f"must not carry kind, got {passage.get('kind')!r}",
                        )
        self.assertGreater(main_count, 1000)
        self.assertGreater(framing_count, 0)

    def test_every_edition_has_consistent_edition_kind(self) -> None:
        for edition in self.editions:
            self.assertIn(
                edition["edition_kind"],
                ("mula-only", "commentarial"),
                f"edition {edition['edition_id']} missing/invalid edition_kind "
                f"{edition['edition_kind']!r}",
            )
            if edition["edition_kind"] == "commentarial":
                # A commentarial edition may have a commentary-free part (e.g.
                # a sarga whose whole text is one un-glossed passage), but must
                # carry a commentary somewhere — a uniform drop now fails
                # against the stamp.
                self.assertTrue(
                    any(p["has_commentary"] for p in edition["parts"]),
                    f"commentarial edition {edition['edition_id']} must have "
                    f"commentary in at least one part",
                )
            else:
                for part in edition["parts"]:
                    self.assertFalse(
                        part["has_commentary"],
                        f"mula-only edition {edition['edition_id']} part "
                        f"{part['file']} must have no commentary",
                    )

    def test_vedarthasangraha_is_para_prose(self) -> None:
        v = next(e for e in self.editions if e["edition_id"] == "vedarthasangraha")
        mains = [
            p
            for part in v["parts"]
            for p in part["passages"]
            if p.get("passage_type") == "main"
        ]
        self.assertGreater(len(mains), 100)
        for p in mains:
            self.assertEqual(p.get("kind"), "Para")
            self.assertIn("Para", _PROSE_KINDS)

    def test_vishnu_purana_is_shloka_verse(self) -> None:
        v = next(e for e in self.editions if e["edition_id"] == "vishnu-purana")
        mains = [
            p
            for part in v["parts"]
            for p in part["passages"]
            if p.get("passage_type") == "main"
        ]
        self.assertGreater(len(mains), 1000)
        for p in mains:
            self.assertEqual(p.get("kind"), "Shloka")
            self.assertIn("Shloka", _VERSE_KINDS)


if __name__ == "__main__":
    unittest.main()
