"""Run validate_grantha_integrity over every multipart grantha directory.

The npm `validate:integrity` script hardcodes 10 upanishad directories; this
Bazel driver validates every directory containing an envelope.json under
public/data/library/, so new granthas are covered without editing a script.
"""

from __future__ import annotations

import pathlib
import sys

from validate_grantha_integrity import validate_grantha_directory


def main() -> None:
    """Run integrity validation over all envelope-bearing library dirs."""
    library = pathlib.Path(__file__).resolve().parent.parent / "public" / "data" / "library"
    if not library.is_dir():
        print(f"Error: library dir not found at {library}")
        sys.exit(1)

    envelope_dirs = sorted(p.parent for p in library.rglob("envelope.json"))

    errors: list[str] = []
    for grantha_dir in envelope_dirs:
        dir_errors: list[str] = []
        validate_grantha_directory(str(grantha_dir), dir_errors)
        errors.extend(dir_errors)

    if errors:
        print("\n--- Validation Failed! Errors found: ---")
        for error in errors:
            print(f"- {error}")
        sys.exit(1)

    print(f"\n--- Validation Successful! {len(envelope_dirs)} grantha dirs passed. ---")


if __name__ == "__main__":
    main()
