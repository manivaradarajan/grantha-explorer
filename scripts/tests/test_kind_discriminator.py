"""Tests for the kind-field discriminator enforcement.

Verifies that a file claiming kind='grantha-envelope' but carrying
part-file content fails schema validation — demonstrating that the
kind field drives routing and the schema's const constraint catches
mismatches.  Re-run this on every future schema or validator change.
"""

from __future__ import annotations

import json
import pathlib
import sys
import unittest

# Allow importing from the parent scripts directory.
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

import validate_data  # noqa: E402 — must follow sys.path manipulation


FIXTURE_DIR = pathlib.Path(__file__).parent / "fixtures"
ROOT = pathlib.Path(__file__).parent.parent.parent


class TestKindDiscriminatorEnforcement(unittest.TestCase):
    """Schema validation must reject a file whose kind contradicts its content."""

    @classmethod
    def setUpClass(cls) -> None:
        # Accessing private loader directly — this test exercises internal routing.
        schemas, store, schema_paths = validate_data._load_schemas(ROOT)
        cls._schemas = schemas
        cls._store = store
        cls._schema_paths = schema_paths

    def test_wrong_kind_part_file_fails_validation(self) -> None:
        """A part file that declares kind='grantha-envelope' must fail validation.

        The file is routed to the grantha-envelope schema (because kind says so),
        which then rejects it for missing the required 'editions' field.  This
        proves both that (a) kind drives routing and (b) the schema enforces the
        correct required fields for that kind.
        """
        fixture = FIXTURE_DIR / "wrong_kind_part.json"
        self.assertTrue(fixture.exists(), f"Fixture file not found: {fixture}")

        # lib parameter is currently unused by _validate_file but retained for
        # call-site compatibility with earlier versions of the function.
        errors = validate_data._validate_file(
            fixture,
            ROOT / "public" / "data" / "library",
            self._schemas,
            self._schema_paths,
            self._store,
        )

        self.assertGreater(
            len(errors),
            0,
            "Expected validation errors for a file with kind='grantha-envelope' "
            "but part-file content, but got none.",
        )

    def test_wrong_kind_is_classified_as_grantha_envelope(self) -> None:
        """_classify must route on the kind field, not on field presence."""
        data = json.loads((FIXTURE_DIR / "wrong_kind_part.json").read_text())
        kind = validate_data._classify(data)
        self.assertEqual(
            kind,
            "grantha-envelope",
            "Classifier must return 'grantha-envelope' when kind='grantha-envelope', "
            "regardless of what other fields are present.",
        )


if __name__ == "__main__":
    unittest.main()
