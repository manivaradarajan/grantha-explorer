"""Adversarial tests for `convert_structured_md._references_bimap` caching.

The converter caches the loaded citation bimap per `GRANTHA_DATA_TOOLS_LIB`
value so a 626-part corpus doesn't re-parse the YAML once per passage. The
cache must:
- return the SAME object for the same env value (the whole point);
- reload when the env value changes mid-process (a different checkout);
- treat "unset" as its own key ("default");
- cache a missing-file `[]` result too (no repeated disk probes);
- return a `CitationBimap` (namespaced), not the legacy flat list.

The module-level cache is reset before each test to mirror a fresh process.
Requires the sibling grantha-data checkout; skipped when absent.
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
    return _GRANTHA_DATA.exists() and (_TOOLS_LIB / "grantha_data").is_dir()


def _ensure_bootstrap() -> None:
    if _bootstrap_ready():
        os.environ["GRANTHA_DATA_TOOLS_LIB"] = str(_TOOLS_LIB)
    grantha_data_bootstrap.ensure_grantha_data_importable()


_ensure_bootstrap()

import convert_structured_md  # noqa: E402


@unittest.skipUnless(_bootstrap_ready(), "grantha-data sibling checkout absent")
class TestReferencesBimapCache(unittest.TestCase):
    """The `_references_bimap` module cache."""

    def setUp(self) -> None:
        convert_structured_md._references_bimap_cache = None
        convert_structured_md._references_bimap_cache_key = None

    def tearDown(self) -> None:
        os.environ.pop("GRANTHA_DATA_TOOLS_LIB", None)
        convert_structured_md._references_bimap_cache = None
        convert_structured_md._references_bimap_cache_key = None

    def test_same_env_returns_same_object(self) -> None:
        """Two calls under the same env value return the identical object."""
        os.environ["GRANTHA_DATA_TOOLS_LIB"] = str(_TOOLS_LIB)
        first = convert_structured_md._references_bimap()
        second = convert_structured_md._references_bimap()
        self.assertIs(first, second)

    def test_env_change_reloads(self) -> None:
        """Changing the env value mid-process reloads from the new checkout."""
        os.environ["GRANTHA_DATA_TOOLS_LIB"] = str(_TOOLS_LIB)
        first = convert_structured_md._references_bimap()
        # Point at a different (empty) tools/lib path — the bimap is absent.
        bogus = _TOOLS_LIB / "bogus"
        bogus.mkdir(exist_ok=True)
        os.environ["GRANTHA_DATA_TOOLS_LIB"] = str(bogus)
        second = convert_structured_md._references_bimap()
        self.assertEqual(second, [])
        # And a third call under the same bogus env is cached (empty result).
        third = convert_structured_md._references_bimap()
        self.assertIs(second, third)

    def test_unset_env_is_default_key(self) -> None:
        """An unset env uses the 'default' key and is cached like any other."""
        os.environ.pop("GRANTHA_DATA_TOOLS_LIB", None)
        first = convert_structured_md._references_bimap()
        second = convert_structured_md._references_bimap()
        self.assertIs(first, second)

    def test_missing_file_caches_empty_list(self) -> None:
        """A nonexistent bimap path caches [] (no repeated disk probes)."""
        empty = _TOOLS_LIB / "no-bimap-here"
        os.environ["GRANTHA_DATA_TOOLS_LIB"] = str(empty)
        self.assertEqual(convert_structured_md._references_bimap(), [])
        self.assertEqual(convert_structured_md._references_bimap(), [])

    def test_returns_namespaced_citation_bimap(self) -> None:
        """The cached value is a CitationBimap (granthas + namespaces), not a
        flat list — the school-namespace resolver needs the namespaced shape."""
        os.environ["GRANTHA_DATA_TOOLS_LIB"] = str(_TOOLS_LIB)
        bimap = convert_structured_md._references_bimap()
        self.assertTrue(hasattr(bimap, "granthas"))
        self.assertTrue(hasattr(bimap, "namespaces"))
        self.assertGreaterEqual(len(bimap.granthas), 50)


if __name__ == "__main__":
    unittest.main()
