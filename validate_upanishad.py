#!/usr/bin/env python3
"""
Upanishad JSON Validator and Fixer

Validates Upanishad JSON files against the PRD schema (Section 6.11).
Diagnoses issues and optionally fixes common problems.

Usage:
    python validate_upanishad.py <json_file> [--fix]
"""

import json
import sys
import re
from typing import Any, Dict, List, Tuple, Optional
from pathlib import Path


class ValidationError:
    """Represents a validation error with severity and fix suggestion"""

    ERROR = "ERROR"
    WARNING = "WARNING"
    INFO = "INFO"

    def __init__(self, severity: str, path: str, message: str, fix: Optional[str] = None):
        self.severity = severity
        self.path = path
        self.message = message
        self.fix = fix

    def __str__(self):
        result = f"[{self.severity}] {self.path}: {self.message}"
        if self.fix:
            result += f"\n  → Fix: {self.fix}"
        return result


class UpanishadValidator:
    """Validates and optionally fixes Upanishad JSON files"""

    def __init__(self, data: Dict[str, Any], filepath: str):
        self.data = data
        self.filepath = filepath
        self.errors: List[ValidationError] = []
        self.fixes_applied: List[str] = []

    def validate(self) -> bool:
        """Run all validations. Returns True if valid (no errors)."""
        print(f"Validating {self.filepath}...")
        print("=" * 80)

        # Top-level structure
        self._validate_top_level()
        self._validate_metadata()
        self._validate_structure_levels()
        self._validate_prefatory_material()
        self._validate_passages()
        self._validate_concluding_material()
        self._validate_commentaries()

        # Report results
        self._report()

        # Return True if no errors (warnings/info are ok)
        return not any(e.severity == ValidationError.ERROR for e in self.errors)

    def fix(self) -> bool:
        """Apply automatic fixes where possible. Returns True if fixes were applied."""
        print(f"\nAttempting to fix issues in {self.filepath}...")
        print("=" * 80)

        # Apply fixes in order
        self._fix_grantha_id()
        self._fix_canonical_title()
        self._fix_commentator_names()
        self._fix_null_fields()
        self._fix_passage_refs()

        if self.fixes_applied:
            print(f"\n✓ Applied {len(self.fixes_applied)} fixes:")
            for fix in self.fixes_applied:
                print(f"  - {fix}")
            return True
        else:
            print("\n✗ No automatic fixes available")
            return False

    def save(self, output_path: Optional[str] = None):
        """Save the (potentially fixed) data to file"""
        path = output_path or self.filepath
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(self.data, f, ensure_ascii=False, indent=2)
        print(f"\n✓ Saved to {path}")

    # ==================== VALIDATION METHODS ====================

    def _validate_top_level(self):
        """Validate top-level required fields"""
        required_fields = [
            "grantha_id",
            "canonical_title",
            "aliases",
            "text_type",
            "language",
            "metadata",
            "passages",
            "commentaries"
        ]

        for field in required_fields:
            if field not in self.data:
                self.errors.append(ValidationError(
                    ValidationError.ERROR,
                    f"root.{field}",
                    f"Missing required field: {field}"
                ))

        # Validate grantha_id format (should be kebab-case)
        if "grantha_id" in self.data:
            gid = self.data["grantha_id"]
            if not isinstance(gid, str):
                self.errors.append(ValidationError(
                    ValidationError.ERROR,
                    "root.grantha_id",
                    f"grantha_id must be a string, got {type(gid).__name__}"
                ))
            elif "_" in gid or " " in gid or gid != gid.lower():
                self.errors.append(ValidationError(
                    ValidationError.WARNING,
                    "root.grantha_id",
                    f"grantha_id should be kebab-case: '{gid}'",
                    "Convert underscores to hyphens and lowercase"
                ))

        # Validate text_type
        if "text_type" in self.data and self.data["text_type"] not in ["upanishad", "commentary"]:
            self.errors.append(ValidationError(
                ValidationError.WARNING,
                "root.text_type",
                f"Unexpected text_type: '{self.data['text_type']}' (expected 'upanishad' or 'commentary')"
            ))

        # Validate language
        if "language" in self.data and self.data["language"] != "sanskrit":
            self.errors.append(ValidationError(
                ValidationError.INFO,
                "root.language",
                f"Language is '{self.data['language']}' (Phase 0 typically uses 'sanskrit')"
            ))

        # Validate aliases
        if "aliases" in self.data:
            if not isinstance(self.data["aliases"], list):
                self.errors.append(ValidationError(
                    ValidationError.ERROR,
                    "root.aliases",
                    f"aliases must be an array, got {type(self.data['aliases']).__name__}"
                ))
            else:
                for i, alias in enumerate(self.data["aliases"]):
                    if not isinstance(alias, dict):
                        self.errors.append(ValidationError(
                            ValidationError.ERROR,
                            f"root.aliases[{i}]",
                            "Each alias must be an object with 'alias' and 'scope' fields"
                        ))
                    else:
                        if "alias" not in alias:
                            self.errors.append(ValidationError(
                                ValidationError.ERROR,
                                f"root.aliases[{i}]",
                                "Missing 'alias' field"
                            ))
                        if "scope" not in alias:
                            self.errors.append(ValidationError(
                                ValidationError.ERROR,
                                f"root.aliases[{i}]",
                                "Missing 'scope' field"
                            ))

    def _validate_metadata(self):
        """Validate metadata structure"""
        if "metadata" not in self.data:
            return

        meta = self.data["metadata"]
        required_fields = ["source_file", "processing_pipeline", "last_updated"]

        for field in required_fields:
            if field not in meta:
                self.errors.append(ValidationError(
                    ValidationError.WARNING,
                    f"root.metadata.{field}",
                    f"Missing recommended metadata field: {field}"
                ))

        # Validate processing_pipeline
        if "processing_pipeline" in meta:
            pipeline = meta["processing_pipeline"]
            pipeline_fields = ["llm_model", "llm_prompt_version", "llm_date", "processor"]
            for field in pipeline_fields:
                if field not in pipeline:
                    self.errors.append(ValidationError(
                        ValidationError.INFO,
                        f"root.metadata.processing_pipeline.{field}",
                        f"Missing processing_pipeline field: {field}"
                    ))

    def _validate_structure_levels(self):
        """Validate structure_levels array"""
        if "structure_levels" not in self.data:
            self.errors.append(ValidationError(
                ValidationError.WARNING,
                "root.structure_levels",
                "Missing structure_levels array (recommended for navigation labels)"
            ))
            return

        levels = self.data["structure_levels"]
        if not isinstance(levels, list):
            self.errors.append(ValidationError(
                ValidationError.ERROR,
                "root.structure_levels",
                f"structure_levels must be an array, got {type(levels).__name__}"
            ))
            return

        for i, level in enumerate(levels):
            if not isinstance(level, dict):
                self.errors.append(ValidationError(
                    ValidationError.ERROR,
                    f"root.structure_levels[{i}]",
                    "Each structure level must be an object"
                ))
                continue

            if "key" not in level:
                self.errors.append(ValidationError(
                    ValidationError.ERROR,
                    f"root.structure_levels[{i}]",
                    "Missing 'key' field"
                ))

            if "scriptNames" not in level:
                self.errors.append(ValidationError(
                    ValidationError.WARNING,
                    f"root.structure_levels[{i}]",
                    "Missing 'scriptNames' field"
                ))
            elif "devanagari" not in level["scriptNames"]:
                self.errors.append(ValidationError(
                    ValidationError.WARNING,
                    f"root.structure_levels[{i}].scriptNames",
                    "Missing 'devanagari' field"
                ))

    def _validate_prefatory_material(self):
        """Validate prefatory_material array"""
        if "prefatory_material" not in self.data:
            self.data["prefatory_material"] = []
            return

        prefatory = self.data["prefatory_material"]
        if not isinstance(prefatory, list):
            self.errors.append(ValidationError(
                ValidationError.ERROR,
                "root.prefatory_material",
                f"prefatory_material must be an array, got {type(prefatory).__name__}"
            ))
            return

        for i, item in enumerate(prefatory):
            self._validate_passage(item, f"root.prefatory_material[{i}]", "prefatory")

    def _validate_passages(self):
        """Validate main passages array"""
        if "passages" not in self.data:
            self.errors.append(ValidationError(
                ValidationError.ERROR,
                "root.passages",
                "Missing required 'passages' array"
            ))
            return

        passages = self.data["passages"]
        if not isinstance(passages, list):
            self.errors.append(ValidationError(
                ValidationError.ERROR,
                "root.passages",
                f"passages must be an array, got {type(passages).__name__}"
            ))
            return

        if len(passages) == 0:
            self.errors.append(ValidationError(
                ValidationError.ERROR,
                "root.passages",
                "passages array is empty"
            ))
            return

        # Track refs for duplicate detection
        refs_seen = set()

        for i, passage in enumerate(passages):
            self._validate_passage(passage, f"root.passages[{i}]", "main")

            # Check for duplicate refs
            if "ref" in passage:
                ref = passage["ref"]
                if ref in refs_seen:
                    self.errors.append(ValidationError(
                        ValidationError.ERROR,
                        f"root.passages[{i}].ref",
                        f"Duplicate ref: '{ref}'"
                    ))
                refs_seen.add(ref)

        # Validate ref ordering
        self._validate_ref_ordering(passages, "root.passages")

    def _validate_concluding_material(self):
        """Validate concluding_material array"""
        if "concluding_material" not in self.data:
            self.data["concluding_material"] = []
            return

        concluding = self.data["concluding_material"]
        if not isinstance(concluding, list):
            self.errors.append(ValidationError(
                ValidationError.ERROR,
                "root.concluding_material",
                f"concluding_material must be an array, got {type(concluding).__name__}"
            ))
            return

        for i, item in enumerate(concluding):
            self._validate_passage(item, f"root.concluding_material[{i}]", "concluding")

    def _validate_passage(self, passage: Any, path: str, expected_type: str):
        """Validate a single passage (prefatory, main, or concluding)"""
        if not isinstance(passage, dict):
            self.errors.append(ValidationError(
                ValidationError.ERROR,
                path,
                f"Passage must be an object, got {type(passage).__name__}"
            ))
            return

        # Required fields
        if "ref" not in passage:
            self.errors.append(ValidationError(
                ValidationError.ERROR,
                f"{path}.ref",
                "Missing required 'ref' field"
            ))
        else:
            # Validate ref format
            ref = passage["ref"]
            if not isinstance(ref, str):
                self.errors.append(ValidationError(
                    ValidationError.ERROR,
                    f"{path}.ref",
                    f"ref must be a string, got {type(ref).__name__}"
                ))
            elif expected_type == "concluding":
                # Allow descriptive refs for concluding material (e.g., "uttara-shaanti-paathah")
                if not re.match(r'^[a-z0-9_-]+$', ref):
                    self.errors.append(ValidationError(
                        ValidationError.WARNING,
                        f"{path}.ref",
                        f"Concluding material ref '{ref}' doesn't match expected format (lowercase alphanumeric with hyphens/underscores)"
                    ))
            elif not re.match(r'^(\d+\.)*\d+$', ref) and ref != "0":
                self.errors.append(ValidationError(
                    ValidationError.WARNING,
                    f"{path}.ref",
                    f"ref '{ref}' doesn't match expected hierarchical format (e.g., '1.1', '2.3.4')"
                ))

        # Validate passage_type
        if "passage_type" not in passage:
            self.errors.append(ValidationError(
                ValidationError.WARNING,
                f"{path}.passage_type",
                f"Missing 'passage_type' field (expected '{expected_type}')"
            ))
        elif passage["passage_type"] != expected_type:
            self.errors.append(ValidationError(
                ValidationError.WARNING,
                f"{path}.passage_type",
                f"passage_type is '{passage['passage_type']}' but expected '{expected_type}'"
            ))

        # Validate content structure
        if "content" not in passage:
            self.errors.append(ValidationError(
                ValidationError.ERROR,
                f"{path}.content",
                "Missing required 'content' field"
            ))
        else:
            content = passage["content"]
            if not isinstance(content, dict):
                self.errors.append(ValidationError(
                    ValidationError.ERROR,
                    f"{path}.content",
                    f"content must be an object, got {type(content).__name__}"
                ))
            else:
                # Validate sanskrit field
                if "sanskrit" not in content:
                    self.errors.append(ValidationError(
                        ValidationError.ERROR,
                        f"{path}.content.sanskrit",
                        "Missing required 'sanskrit' field"
                    ))
                else:
                    sanskrit = content["sanskrit"]
                    if not isinstance(sanskrit, dict):
                        self.errors.append(ValidationError(
                            ValidationError.ERROR,
                            f"{path}.content.sanskrit",
                            f"sanskrit must be an object, got {type(sanskrit).__name__}"
                        ))
                    elif "devanagari" not in sanskrit:
                        self.errors.append(ValidationError(
                            ValidationError.ERROR,
                            f"{path}.content.sanskrit.devanagari",
                            "Missing required 'devanagari' field"
                        ))
                    elif sanskrit["devanagari"] is None or (isinstance(sanskrit["devanagari"], str) and not sanskrit["devanagari"].strip()):
                        self.errors.append(ValidationError(
                            ValidationError.WARNING,
                            f"{path}.content.sanskrit.devanagari",
                            "devanagari field is empty or null"
                        ))

    def _validate_commentaries(self):
        """Validate commentaries array"""
        if "commentaries" not in self.data:
            self.errors.append(ValidationError(
                ValidationError.INFO,
                "root.commentaries",
                "Missing 'commentaries' array (acceptable if no commentaries available)"
            ))
            return

        commentaries = self.data["commentaries"]
        if not isinstance(commentaries, list):
            self.errors.append(ValidationError(
                ValidationError.ERROR,
                "root.commentaries",
                f"commentaries must be an array, got {type(commentaries).__name__}"
            ))
            return

        for i, commentary in enumerate(commentaries):
            self._validate_commentary(commentary, f"root.commentaries[{i}]")

    def _validate_commentary(self, commentary: Any, path: str):
        """Validate a single commentary"""
        if not isinstance(commentary, dict):
            self.errors.append(ValidationError(
                ValidationError.ERROR,
                path,
                f"Commentary must be an object, got {type(commentary).__name__}"
            ))
            return

        # Required fields
        required_fields = ["commentary_id", "commentary_title", "commentator", "passages"]
        for field in required_fields:
            if field not in commentary:
                self.errors.append(ValidationError(
                    ValidationError.ERROR,
                    f"{path}.{field}",
                    f"Missing required field: {field}"
                ))

        # Validate commentator structure
        if "commentator" in commentary:
            commentator = commentary["commentator"]
            if isinstance(commentator, str):
                # String format is acceptable but dict is preferred
                self.errors.append(ValidationError(
                    ValidationError.INFO,
                    f"{path}.commentator",
                    "commentator is a string; consider using object format with 'devanagari' and 'latin' fields"
                ))
            elif isinstance(commentator, dict):
                if "devanagari" not in commentator and "latin" not in commentator:
                    self.errors.append(ValidationError(
                        ValidationError.WARNING,
                        f"{path}.commentator",
                        "commentator object should have 'devanagari' or 'latin' field"
                    ))

        # Validate commentary passages
        if "passages" in commentary:
            passages = commentary["passages"]
            if not isinstance(passages, list):
                self.errors.append(ValidationError(
                    ValidationError.ERROR,
                    f"{path}.passages",
                    f"passages must be an array, got {type(passages).__name__}"
                ))
            else:
                refs_seen = set()
                for i, cp in enumerate(passages):
                    self._validate_commentary_passage(cp, f"{path}.passages[{i}]")

                    # Check for duplicate refs
                    if "ref" in cp:
                        ref = cp["ref"]
                        if ref in refs_seen:
                            self.errors.append(ValidationError(
                                ValidationError.ERROR,
                                f"{path}.passages[{i}].ref",
                                f"Duplicate ref in commentary: '{ref}'"
                            ))
                        refs_seen.add(ref)

                # Check that commentary refs align with main text refs
                if "passages" in self.data:
                    main_refs = {p.get("ref") for p in self.data["passages"]}
                    commentary_refs = {p.get("ref") for p in passages}

                    missing_in_commentary = main_refs - commentary_refs
                    extra_in_commentary = commentary_refs - main_refs

                    if missing_in_commentary:
                        self.errors.append(ValidationError(
                            ValidationError.INFO,
                            f"{path}.passages",
                            f"Commentary missing for main text refs: {sorted(missing_in_commentary)[:5]}" +
                            (f" (and {len(missing_in_commentary) - 5} more)" if len(missing_in_commentary) > 5 else "")
                        ))

                    if extra_in_commentary:
                        self.errors.append(ValidationError(
                            ValidationError.WARNING,
                            f"{path}.passages",
                            f"Commentary has refs not in main text: {sorted(extra_in_commentary)[:5]}" +
                            (f" (and {len(extra_in_commentary) - 5} more)" if len(extra_in_commentary) > 5 else "")
                        ))

    def _validate_commentary_passage(self, passage: Any, path: str):
        """Validate a single commentary passage"""
        if not isinstance(passage, dict):
            self.errors.append(ValidationError(
                ValidationError.ERROR,
                path,
                f"Commentary passage must be an object, got {type(passage).__name__}"
            ))
            return

        # Required fields
        if "ref" not in passage:
            self.errors.append(ValidationError(
                ValidationError.ERROR,
                f"{path}.ref",
                "Missing required 'ref' field"
            ))

        if "content" not in passage:
            self.errors.append(ValidationError(
                ValidationError.ERROR,
                f"{path}.content",
                "Missing required 'content' field"
            ))
        else:
            content = passage["content"]
            if not isinstance(content, dict):
                self.errors.append(ValidationError(
                    ValidationError.ERROR,
                    f"{path}.content",
                    f"content must be an object, got {type(content).__name__}"
                ))
            else:
                # Commentary content should have sanskrit and/or english
                if "sanskrit" not in content and "english" not in content:
                    self.errors.append(ValidationError(
                        ValidationError.WARNING,
                        f"{path}.content",
                        "content should have 'sanskrit' or 'english' field"
                    ))

                # Validate sanskrit structure if present
                if "sanskrit" in content:
                    sanskrit = content["sanskrit"]
                    if isinstance(sanskrit, dict) and "devanagari" in sanskrit:
                        if sanskrit["devanagari"] is None or (isinstance(sanskrit["devanagari"], str) and not sanskrit["devanagari"].strip()):
                            self.errors.append(ValidationError(
                                ValidationError.WARNING,
                                f"{path}.content.sanskrit.devanagari",
                                "devanagari field is empty or null"
                            ))

        # Validate prefatory_material if present
        if "prefatory_material" in passage:
            prefatory = passage["prefatory_material"]
            if not isinstance(prefatory, list):
                self.errors.append(ValidationError(
                    ValidationError.ERROR,
                    f"{path}.prefatory_material",
                    f"prefatory_material must be an array, got {type(prefatory).__name__}"
                ))

    def _validate_ref_ordering(self, passages: List[Dict], path: str):
        """Validate that refs are in proper hierarchical order"""
        refs = [p.get("ref") for p in passages if "ref" in p]

        # Convert refs to tuples of integers for sorting
        def ref_to_tuple(ref: str) -> Tuple[int, ...]:
            try:
                return tuple(int(x) for x in ref.split('.'))
            except:
                return (999999,)  # Invalid refs go to end

        sorted_refs = sorted(refs, key=ref_to_tuple)

        if refs != sorted_refs:
            self.errors.append(ValidationError(
                ValidationError.WARNING,
                path,
                f"Passages are not in hierarchical order. Expected order: {sorted_refs[:5]}...",
                "Sort passages by ref"
            ))

    # ==================== FIX METHODS ====================

    def _fix_grantha_id(self):
        """Fix grantha_id format (convert to kebab-case)"""
        if "grantha_id" in self.data:
            old_id = self.data["grantha_id"]
            new_id = old_id.replace("_", "-").lower()
            if old_id != new_id:
                self.data["grantha_id"] = new_id
                self.fixes_applied.append(f"Converted grantha_id: '{old_id}' → '{new_id}'")

    def _fix_canonical_title(self):
        """Fix canonical_title if it's missing"""
        if "canonical_title" not in self.data:
            # Try to derive from grantha_id
            if "grantha_id" in self.data:
                gid = self.data["grantha_id"]
                title = gid.replace("-", " ").title()
                self.data["canonical_title"] = title
                self.fixes_applied.append(f"Added canonical_title: '{title}' (derived from grantha_id)")

    def _fix_commentator_names(self):
        """Convert commentator strings to proper object format"""
        if "commentaries" in self.data:
            for i, commentary in enumerate(self.data["commentaries"]):
                if "commentator" in commentary and isinstance(commentary["commentator"], str):
                    old_name = commentary["commentator"]
                    commentary["commentator"] = {
                        "devanagari": old_name,
                        "latin": old_name
                    }
                    self.fixes_applied.append(f"Converted commentator[{i}] to object format: '{old_name}'")

    def _fix_null_fields(self):
        """Remove or fix null/empty fields in passages and commentaries"""
        # This is a more aggressive fix, so we'll be conservative
        pass

    def _fix_passage_refs(self):
        """Fix passage ref formatting (normalize to dot notation)"""
        def normalize_ref(ref: str) -> str:
            # Convert various formats to dot notation
            # e.g., "1-1" → "1.1", "1:1" → "1.1"
            return ref.replace("-", ".").replace(":", ".")

        for passages_key in ["prefatory_material", "passages", "concluding_material"]:
            if passages_key in self.data:
                for i, passage in enumerate(self.data[passages_key]):
                    if "ref" in passage:
                        old_ref = passage["ref"]
                        new_ref = normalize_ref(old_ref)
                        if old_ref != new_ref:
                            passage["ref"] = new_ref
                            self.fixes_applied.append(f"Normalized {passages_key}[{i}].ref: '{old_ref}' → '{new_ref}'")

    # ==================== REPORTING ====================

    def _report(self):
        """Print validation report"""
        errors = [e for e in self.errors if e.severity == ValidationError.ERROR]
        warnings = [e for e in self.errors if e.severity == ValidationError.WARNING]
        info = [e for e in self.errors if e.severity == ValidationError.INFO]

        if errors:
            print(f"\n🔴 ERRORS ({len(errors)}):")
            for error in errors:
                print(f"  {error}")

        if warnings:
            print(f"\n🟡 WARNINGS ({len(warnings)}):")
            for warning in warnings:
                print(f"  {warning}")

        if info:
            print(f"\n🔵 INFO ({len(info)}):")
            for i in info:
                print(f"  {i}")

        print(f"\n{'=' * 80}")
        if not errors and not warnings:
            print("✅ VALIDATION PASSED - No errors or warnings")
        elif not errors:
            print(f"⚠️  VALIDATION PASSED - {len(warnings)} warnings, {len(info)} info")
        else:
            print(f"❌ VALIDATION FAILED - {len(errors)} errors, {len(warnings)} warnings")


def main():
    """Main entry point"""
    import argparse
    print("Starting validation script...")

    parser = argparse.ArgumentParser(
        description="Validate and optionally fix Upanishad JSON files"
    )
    parser.add_argument("file", help="Path to JSON file to validate")
    parser.add_argument("--fix", action="store_true", help="Apply automatic fixes")
    parser.add_argument("--output", "-o", help="Output path for fixed file (default: overwrite input)")

    args = parser.parse_args()
    print(f"Arguments parsed: {args}")

    # Load JSON
    try:
        print(f"Attempting to open and load JSON file: {args.file}")
        with open(args.file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        print("JSON file loaded successfully.")
    except FileNotFoundError:
        print(f"❌ Error: File not found: {args.file}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"❌ Error: Invalid JSON: {e}")
        sys.exit(1)

    # Validate
    print("Initializing UpanishadValidator...")
    validator = UpanishadValidator(data, args.file)
    is_valid = validator.validate()
    print(f"Validation complete. Is valid: {is_valid}")

    # Apply fixes if requested
    if args.fix:
        print("Applying fixes...")
        fixes_applied = validator.fix()
        if fixes_applied:
            # Re-validate after fixes
            print("\n" + "=" * 80)
            print("Re-validating after fixes...")
            print("=" * 80)
            validator = UpanishadValidator(validator.data, args.file)
            is_valid = validator.validate()
            print(f"Re-validation complete. Is valid: {is_valid}")

            # Save
            output_path = args.output or args.file
            validator.save(output_path)

    # Exit with appropriate code
    print(f"Exiting with code {0 if is_valid else 1}")
    sys.exit(0 if is_valid else 1)


if __name__ == "__main__":
    main()
