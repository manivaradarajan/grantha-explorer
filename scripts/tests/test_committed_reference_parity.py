"""Generic cross-reference regression guards for the committed library.

Two complementary checks, both corpus-wide and not text-specific:

**Test A — re-derivation parity.** Re-run the reference-aware explorer
converters (``convert_structured_md.convert_grantha`` for single-edition
texts, ``import_editions.import_grantha`` for multi-edition) over the
structured_md source tree into a temp directory, then assert that every
reference-bearing edition's committed ``references[]`` fingerprint equals the
freshly-derived one. This catches any regeneration that silently drops or
stales references — the producer CLI (``grantha-converter md2json``) emits
*zero* references (documented gap, grantha-data ``docs/DATA_FLOW.md`` §4.1), so
an artifact regenerated with the wrong tool fails here for *any* text.

**Test B — per-passage presence parity.** For every committed main passage
across the whole library, re-run ``_extract_references`` over its own text
(base school context) and assert that a non-empty extraction implies the
committed passage carries a non-empty ``references[]``. Fast, self-contained,
and independent of converter routing.

Skipped when the grantha-data sibling checkout is absent (same policy as
``test_school_context.py``).
"""

from __future__ import annotations

import json
import os
import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

import grantha_data_bootstrap  # noqa: E402

_TEST_DIR = pathlib.Path(__file__).parent
_EXPLORER_ROOT = _TEST_DIR.parents[1]
_LIBRARY_ROOT = _EXPLORER_ROOT / "public" / "data" / "library"
_GRANTHA_DATA = _EXPLORER_ROOT.parent / "grantha-data"
_TOOLS_LIB = _GRANTHA_DATA / "tools" / "lib"
_STRUCTURED_MD = _GRANTHA_DATA / "structured_md"


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
    convert_grantha,
)
from import_editions import (  # noqa: E402
    import_grantha,
)


# ---------------------------------------------------------------------------
# Reference fingerprint helpers (edition_id -> sorted reference tuples)
# ---------------------------------------------------------------------------

def _passages_with_references(data: dict) -> list[tuple[str, list]]:
    """Return [(passage_ref, [ref, ...])] for passages carrying references."""
    out: list[tuple[str, list]] = []
    for key in ("passages", "prefatory_material", "concluding_material"):
        for passage in data.get(key, []):
            refs = passage.get("references")
            if refs:
                out.append((passage["ref"], sorted(_ref_key(r) for r in refs)))
    return out


def _ref_key(ref: dict) -> tuple:
    """A stable, content-meaningful key for one reference object."""
    return (
        ref.get("start"),
        ref.get("end"),
        ref.get("display_text", ""),
        ref.get("grantha_id"),
        ref.get("edition_id"),
        ref.get("locator"),
        bool(ref.get("unresolved")),
    )


def _edition_reference_fingerprint(library_root: pathlib.Path) -> dict[str, dict]:
    """Scan a library root and return {edition_id: {ref: [(ref, refs)]}}.

    Handles both multipart editions (edition-sub-envelope + parts) and flat
    single-file granthas. Editions with no references at all are omitted.
    """
    result: dict[str, dict] = {}
    for path in sorted(library_root.rglob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        if not isinstance(data, dict):
            continue
        kind = data.get("kind")
        if kind == "edition-sub-envelope":
            edition_id = data.get("edition_id")
            parts = data.get("parts", [])
            acc: list[tuple[str, list]] = []
            for part in parts:
                part_path = path.parent / part["file"]
                if not part_path.exists():
                    continue
                part_data = json.loads(part_path.read_text(encoding="utf-8"))
                acc.extend(_passages_with_references(part_data))
            if acc:
                result.setdefault(edition_id, {})["refs"] = sorted(
                    acc, key=lambda x: x[0]
                )
        elif kind == "grantha":
            edition_id = data.get("edition_id") or data.get("grantha_id")
            acc = _passages_with_references(data)
            if acc:
                result.setdefault(edition_id, {})["refs"] = sorted(
                    acc, key=lambda x: x[0]
                )
    return result


# ---------------------------------------------------------------------------
# Source-tree routing (mirrors the README regeneration procedure)
# ---------------------------------------------------------------------------

# Single-edition texts: explorer convert_structured_md.convert_grantha.
# source_dir is relative to structured_md/.
_SINGLE_SOURCES = [
    "vedarthasangraha",
    "upanishads/kaushitaki",
    "upanishads/svetasvatara",
    "bhagavad-gita/bhagavad-gita",
    "ramayana/valmiki-ramayana",
    "purana/vishnu-purana",
]

# Multi-edition texts: import_editions.import_grantha (co-located granthas in
# a shared source dir are handled by a single import run).
_MULTI_SOURCES = [
    "upanishads/taittiriya",
    "upanishads/aitareya",
    "upanishads/brihadaranyaka",
    "upanishads/chandogya",
    "upanishads/katha",
    "upanishads/kena",
    "upanishads/mundaka",
    "upanishads/prashna",
    "upanishads/isavasya",
    "upanishads/mandukya",
    "brahma-sutras",
]


def _derive_fresh_library(tmp_root: pathlib.Path) -> pathlib.Path:
    """Re-run the reference-aware converters into a temp library root.

    Returns the temp root populated with freshly-derived editions. Returns an
    empty (non-existent) root if no sources are present (caller skips).
    """
    fresh_root = tmp_root / "library"
    fresh_root.mkdir(parents=True, exist_ok=True)

    for rel in _SINGLE_SOURCES:
        source_dir = _STRUCTURED_MD / rel
        if not source_dir.is_dir():
            continue
        out_dir = fresh_root / rel
        convert_grantha(source_dir, out_dir, _EXPLORER_ROOT)

    for rel in _MULTI_SOURCES:
        source_dir = _STRUCTURED_MD / rel
        if not source_dir.is_dir():
            continue
        try:
            import_grantha(
                source_dir,
                fresh_root,
                text_path=rel.replace("/", "__"),
            )
        except RuntimeError:
            # A source dir with no publishable multi-edition grantha (all
            # single-edition) is fine to skip.
            continue

    return fresh_root


@unittest.skipUnless(_bootstrap_ready(), "grantha-data sibling checkout absent")
class TestCommittedReferenceParity(unittest.TestCase):
    """Test A: committed references match a fresh reference-aware derivation."""

    @classmethod
    def setUpClass(cls) -> None:
        _ensure_bootstrap()
        cls.committed = _edition_reference_fingerprint(_LIBRARY_ROOT)
        cls._tmp = tempfile.TemporaryDirectory()
        cls.fresh_root = _derive_fresh_library(pathlib.Path(cls._tmp.name))
        cls.fresh = _edition_reference_fingerprint(cls.fresh_root)

    @classmethod
    def tearDownClass(cls) -> None:
        cls._tmp.cleanup()

    def test_every_fresh_reference_edition_matches_committed(self) -> None:
        """Any edition the reference-aware converter derives references for must
        carry the SAME references in the committed library. A committed edition
        with zero references where fresh derives some (e.g. regenerated with the
        producer CLI) fails here."""
        self.assertGreater(len(self.fresh), 0, "no fresh reference-bearing editions")
        missing = [eid for eid in self.fresh if eid not in self.committed]
        self.assertEqual(missing, [], f"committed library missing these reference-bearing editions: {missing}")
        for edition_id, fresh_refs in self.fresh.items():
            self.assertEqual(
                fresh_refs["refs"],
                self.committed[edition_id]["refs"],
                f"edition {edition_id} committed references diverge from a fresh derivation",
            )

    def test_committed_reference_editions_are_covered(self) -> None:
        """Every committed reference-bearing edition must be derivable (present
        in the fresh tree) — otherwise the parity sweep silently skips it."""
        uncovered = [eid for eid in self.committed if eid not in self.fresh]
        self.assertEqual(
            uncovered, [],
            f"committed reference-bearing editions not re-derived (coverage gap): {uncovered}",
        )


@unittest.skipUnless(_bootstrap_ready(), "grantha-data sibling checkout absent")
class TestCommittedPassageReferencePresence(unittest.TestCase):
    """Test B: committed main passages with resolvable citations carry references.

    Source-independent: for every committed main passage, re-run
    ``_extract_references`` over its own text (base school context) and require
    that a non-empty extraction implies a non-empty committed ``references[]``.
    A passage that lost its references (wrong-tool regen) fails here even
    without a full re-derivation.
    """

    @classmethod
    def setUpClass(cls) -> None:
        _ensure_bootstrap()
        from convert_structured_md import _extract_references  # noqa: PLC0415

        cls._extract = _extract_references
        cls.failures: list[str] = []
        for path in sorted(_LIBRARY_ROOT.rglob("*.json")):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            if not isinstance(data, dict):
                continue
            if data.get("kind") not in ("grantha", "grantha-part"):
                continue
            label = str(path.relative_to(_LIBRARY_ROOT))
            for passage in data.get("passages", []):
                text = (
                    passage.get("content", {})
                    .get("sanskrit", {})
                    .get("devanagari", "")
                )
                if not text:
                    continue
                extracted, _diags = cls._extract(text, "")
                if extracted and not passage.get("references"):
                    cls.failures.append(f"{label}:{passage.get('ref')}")

    def test_no_main_passage_lost_its_references(self) -> None:
        self.assertEqual(
            self.failures[:20],
            [],
            f"{len(self.failures)} main passage(s) carry resolvable citations but "
            f"committed references[] is empty (first 20 shown)",
        )
        self.assertEqual(len(self.failures), 0)


if __name__ == "__main__":
    unittest.main()
