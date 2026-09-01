"""Cross-repo smoke test: import the producer's `grantha_data` py_library.

Proves the explorer can depend on `@grantha_data//tools/lib/grantha_data` and
that the transitive pip deps (pyyaml, jsonschema via the producer's own
`@grantha_pip` hub) resolve under the explorer's module graph.
"""

from __future__ import annotations

from grantha_data.references import extract_references


def main() -> None:
    """Exercise a real grantha_data function with an empty corpus."""
    refs, diagnostics = extract_references(text="", bimap=[])
    assert refs == [], f"expected no references for empty input, got {refs}"
    assert diagnostics == [], f"expected no diagnostics, got {diagnostics}"
    print(f"grantha_data.references import OK: {extract_references.__module__}")


if __name__ == "__main__":
    main()
