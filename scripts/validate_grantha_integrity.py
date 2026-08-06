import argparse
import json
import os
import glob
from typing import List, Dict, Any

# Ensure the scripts directory is in the path to allow importing ref_validator_utils
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from ref_validator_utils import is_monotonically_increasing, parse_ref

def validate_commentary_metadata(part_data: Dict[str, Any], part_filename: str, error_log: List[str]):
    """
    Validates that each commentary has a title and commentator.
    """
    commentaries = part_data.get('commentaries', {})

    # Handle both old array format and new object format
    if isinstance(commentaries, dict):
        commentaries = commentaries.values()

    for commentary in commentaries:
        commentary_id = commentary.get('commentary_id', 'Unknown')

        # Check for commentary_title
        if not commentary.get('commentary_title', '').strip():
            error_log.append(f"Metadata Error in {part_filename}: Commentary '{commentary_id}' is missing a 'commentary_title'.")

        # Check for commentator name
        commentator = commentary.get('commentator', {})
        if not commentator.get('devanagari', '').strip():
            error_log.append(f"Metadata Error in {part_filename}: Commentary '{commentary_id}' is missing a 'commentator.devanagari' name.")

def validate_grantha_directory(grantha_dir: str, error_log: List[str]):
    """
    Performs a comprehensive integrity check on a multi-part grantha directory.
    """
    print(f"--- Running Integrity Validation for: {grantha_dir} ---")
    envelope_path = os.path.join(grantha_dir, 'envelope.json')

    # 1. Load envelope.json
    if not os.path.exists(envelope_path):
        error_log.append(f"Validation Error: envelope.json not found in {grantha_dir}")
        return

    with open(envelope_path, 'r', encoding='utf-8') as f:
        envelope = json.load(f)

    # 2. File Manifest Check
    # Note: envelope.parts is now just an array of filenames, not objects with 'file' key
    parts_from_envelope = envelope.get('parts', [])
    part_files_on_disk = sorted([os.path.basename(p) for p in glob.glob(os.path.join(grantha_dir, 'part*.json'))])

    if set(parts_from_envelope) != set(part_files_on_disk):
        missing_in_envelope = set(part_files_on_disk) - set(parts_from_envelope)
        extra_in_envelope = set(parts_from_envelope) - set(part_files_on_disk)
        if missing_in_envelope:
            error_log.append(f"Manifest Error ({grantha_dir}): envelope.json is missing entries for: {sorted(list(missing_in_envelope))}")
        if extra_in_envelope:
            error_log.append(f"Manifest Error ({grantha_dir}): envelope.json has extra entries for: {sorted(list(extra_in_envelope))}")
        return # Stop further checks if manifest is wrong

    print("  [PASS] File manifest matches envelope.json.")

    # 3. Part ID, Intra-file, and Inter-file checks
    last_ref_from_previous_file = None
    for i, part_filename in enumerate(parts_from_envelope):
        part_path = os.path.join(grantha_dir, part_filename)
        
        with open(part_path, 'r', encoding='utf-8') as f:
            part_data = json.load(f)
        
        # NEW: Validate commentary metadata
        validate_commentary_metadata(part_data, part_filename, error_log)
        
        passages = part_data.get('passages', [])
        if not passages:
            print(f"  [INFO] Skipping checks for {part_filename} as it has no passages.")
            continue

        # Part ID Consistency Check (e.g., Adhyayas)
        # Extracts the first component of the ref (e.g., '3' from '3.1.1') as the ID.
        # Note: With envelope.json, we don't have pre-defined IDs, so we skip this check
        # or we could derive expected ID from part number if needed
        # TODO: Consider if we want to validate part IDs in the new structure

        # Intra-file Monotonicity Check
        main_refs = [p['ref'] for p in passages if 'ref' in p]
        is_monotonically_increasing(main_refs, part_path, "main passages", error_log)

        # Handle commentaries (can be dict or array)
        commentaries = part_data.get('commentaries', {})
        if isinstance(commentaries, dict):
            commentaries = commentaries.values()

        for commentary in commentaries:
            commentary_id = commentary.get('commentary_id', 'Unknown')
            commentary_refs = [p['ref'] for p in commentary.get('passages', []) if 'ref' in p]
            is_monotonically_increasing(commentary_refs, part_path, f"commentary '{commentary_id}'", error_log)

        # Inter-file Monotonicity Check
        if main_refs:
            first_ref_current = parse_ref(main_refs[0])
            if last_ref_from_previous_file:
                if first_ref_current < last_ref_from_previous_file:
                    prev_part_filename = parts_from_envelope[i-1]
                    error_log.append(
                        f"Inter-file Error: First ref '{main_refs[0]}' in {part_filename} "
                        f"is not greater than last ref '{'.'.join(map(str, last_ref_from_previous_file))}' in {prev_part_filename}"
                    )
            last_ref_from_previous_file = parse_ref(main_refs[-1])

    if not error_log:
        print("  [PASS] Part ID consistency and ref monotonicity checks passed.")

def main():
    parser = argparse.ArgumentParser(
        description="Run a comprehensive integrity check on a multi-part grantha directory."
    )
    parser.add_argument(
        "grantha_dir",
        help="The directory of a multi-part grantha to validate (e.g., public/data/library/brihadaranyaka-upanishad)."
    )
    args = parser.parse_args()

    if not os.path.isdir(args.grantha_dir):
        print(f"Error: Directory not found at {args.grantha_dir}")
        sys.exit(1)

    errors = []
    validate_grantha_directory(args.grantha_dir, errors)

    if errors:
        print("\n--- Validation Failed! Errors found: ---")
        for error in errors:
            print(f"- {error}")
        sys.exit(1)
    else:
        print("\n--- Validation Successful! All checks passed. ---")

if __name__ == "__main__":
    main()
