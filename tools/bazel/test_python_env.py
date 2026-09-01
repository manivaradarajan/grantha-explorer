"""Verify the Bazel-managed Python toolchain is hermetic and runnable.

This test does not exercise pytest; it asserts the interpreter Bazel gave us
meets the version contract and that a stdlib import works, proving the
toolchain plumbing (not the app) is correct.
"""

from __future__ import annotations

import json
import platform
import sys


def main() -> None:
    """Run the smoke assertions."""
    assert sys.version_info[:2] == (3, 11), f"unexpected python: {sys.version}"
    assert platform.platform(), "platform() returned nothing"
    json.loads("{}")
    print(f"python {sys.version.split()[0]} at {sys.executable}")


if __name__ == "__main__":
    main()
