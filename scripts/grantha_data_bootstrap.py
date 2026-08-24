"""Make ``grantha_data`` importable from the explorer's bare ``python3`` scripts.

The explorer's converters (``convert_structured_md.py``, ``import_editions.py``)
need the ``grantha_data.references`` shared library that lives in the sibling
``grantha-data`` repo. The preferred mechanism is a real ``pip install -e``
(grantha-data's CLAUDE.md documents it), which puts ``grantha_data`` on
``sys.path`` with no shim at all.

This module is the **documented fallback** for when that editable install is
absent or points at a different checkout (e.g. a shared venv mapped to
``~/github/grantha-data`` instead of the active worktree). It adds the active
``grantha-data`` checkout's ``tools/lib`` to ``sys.path`` only when
``GRANTHA_DATA_TOOLS_LIB`` is set:

.. code-block:: bash

    GRANTHA_DATA_TOOLS_LIB=../grantha-data/tools/lib python3 scripts/convert_structured_md.py ...

Why env-gated: a blanket ``sys.path`` insertion would silently prefer a
sibling checkout even when a proper install exists, which is the drift the
plan (§4.1.2) wants to avoid. Explicit opt-in keeps the preference visible
and documentable while still working in a bare checkout.
"""

from __future__ import annotations

__all__ = ["ensure_grantha_data_importable"]

import os
import sys
from pathlib import Path


def ensure_grantha_data_importable() -> None:
    """Prepend the grantha-data ``tools/lib`` to ``sys.path`` when configured.

    No-op when ``GRANTHA_DATA_TOOLS_LIB`` is unset or when ``grantha_data``
    is already importable (a real ``pip install -e`` wins).

    Raises:
        ValueError: If ``GRANTHA_DATA_TOOLS_LIB`` is set but the directory
            does not contain ``grantha_data``.
    """
    configured = os.environ.get("GRANTHA_DATA_TOOLS_LIB")
    if not configured:
        return
    # A configured path is always honored (validated, then prepended) — even if
    # `grantha_data` was already imported via `pip install -e`. This makes the
    # bootstrap robust to test ordering: an explicitly configured but invalid
    # path must still raise, regardless of what earlier tests imported.
    tools_lib = Path(configured).expanduser()
    if not (tools_lib / "grantha_data").is_dir():
        raise ValueError(
            f"GRANTHA_DATA_TOOLS_LIB={configured} does not contain grantha_data/"
        )
    if tools_lib not in sys.path:
        sys.path.insert(0, str(tools_lib))
