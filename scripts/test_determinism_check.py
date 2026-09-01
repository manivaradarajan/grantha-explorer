"""Test: the materialize pipeline is deterministic and reports committed drift.

Regenerates the library twice into temp dirs (via ``materialize_library``),
asserts the two runs are byte-identical (hermeticity), then reports how the
committed ``public/data/library/`` differs from a fresh regeneration (explicit
drift, not gated — the committed tree may legitimately lag the current bimap).
"""

from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from materialize_library import _grantha_data_root, _verify

_COMMITTED = pathlib.Path(__file__).resolve().parent.parent / "public" / "data" / "library"


def main() -> None:
    """Run the determinism + drift check against the committed tree."""
    _verify(_COMMITTED, _grantha_data_root())


if __name__ == "__main__":
    main()
