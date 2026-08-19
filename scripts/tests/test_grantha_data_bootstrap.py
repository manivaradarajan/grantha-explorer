"""Tests for the grantha-data cross-repo import bootstrap.

The explorer's converters import the shared ``grantha_data.references``
library from the sibling ``grantha-data`` repo. This suite verifies the
``GRANTHA_DATA_TOOLS_LIB`` bootstrap (``grantha_data_bootstrap.py``) and the
converter's ``_extract_references`` emission end-to-end.

The sibling checkout is located by walking up from the test file and is
skipped when absent (e.g. a shallow CI checkout), so the suite never fails on
an environment the explorer does not control.
"""

from __future__ import annotations

import os
import pathlib
import sys

import pytest

_SCRIPTS = pathlib.Path(__file__).parent.parent
sys.path.insert(0, str(_SCRIPTS))

import grantha_data_bootstrap  # noqa: E402
import convert_structured_md  # noqa: E402


def _sibling_grantha_data_tools_lib() -> pathlib.Path | None:
    """Return the sibling grantha-data ``tools/lib`` path, or None."""
    explorer_root = _SCRIPTS.parent
    candidate = explorer_root.parent / "grantha-data" / "tools" / "lib"
    if (candidate / "grantha_data").is_dir():
        return candidate
    return None


def test_bootstrap_noop_without_env() -> None:
    """Without GRANTHA_DATA_TOOLS_LIB the bootstrap must not touch sys.path."""
    os.environ.pop("GRANTHA_DATA_TOOLS_LIB", None)
    before = list(sys.path)
    grantha_data_bootstrap.ensure_grantha_data_importable()
    assert sys.path == before


def test_bootstrap_raises_on_bad_path(tmp_path: pathlib.Path) -> None:
    """A configured but invalid GRANTHA_DATA_TOOLS_LIB raises ValueError."""
    os.environ["GRANTHA_DATA_TOOLS_LIB"] = str(tmp_path)
    with pytest.raises(ValueError, match="does not contain grantha_data"):
        grantha_data_bootstrap.ensure_grantha_data_importable()
    os.environ.pop("GRANTHA_DATA_TOOLS_LIB", None)


@pytest.mark.skipif(
    _sibling_grantha_data_tools_lib() is None,
    reason="sibling grantha-data checkout not present",
)
def test_extract_references_uses_sibling_library() -> None:
    """The converter extracts schema-shaped references from the shared lib."""
    tools_lib = _sibling_grantha_data_tools_lib()
    assert tools_lib is not None
    os.environ["GRANTHA_DATA_TOOLS_LIB"] = str(tools_lib)
    try:
        grantha_data_bootstrap.ensure_grantha_data_importable()
        refs, diags = convert_structured_md._extract_references(
            "(श्वे. उ. १.९) इत्यादि"
        )
    finally:
        os.environ.pop("GRANTHA_DATA_TOOLS_LIB", None)
    assert refs
    assert refs[0]["grantha_id"] == "svetasvatara-upanishad"
    assert refs[0]["locator"] == "1.9"
    assert refs[0]["unresolved"] is False
    assert refs[0]["start"] >= 0
    assert refs[0]["end"] > refs[0]["start"]
    assert diags == []
