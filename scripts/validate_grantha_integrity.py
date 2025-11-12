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
    for commentary in part_data.get('commentaries', []):
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
    metadata_path = os.path.join(grantha_dir, 'metadata.json')

    # 1. Load metadata.json
    if not os.path.exists(metadata_path):
        error_log.append(f"Validation Error: metadata.json not found in {grantha_dir}")
        return
    
    with open(metadata_path, 'r', encoding='utf-8') as f:
        metadata = json.load(f)

    # 2. File Manifest Check
    parts_from_meta = [part['file'] for part in metadata.get('parts', [])]
    part_files_on_disk = sorted([os.path.basename(p) for p in glob.glob(os.path.join(grantha_dir, 'part*.json'))])
    
    if set(parts_from_meta) != set(part_files_on_disk):
        missing_in_meta = set(part_files_on_disk) - set(parts_from_meta)
        extra_in_meta = set(parts_from_meta) - set(part_files_on_disk)
        if missing_in_meta:
            error_log.append(f"Manifest Error ({grantha_dir}): metadata.json is missing entries for: {sorted(list(missing_in_meta))}")
        if extra_in_meta:
            error_log.append(f"Manifest Error ({grantha_dir}): metadata.json has extra entries for: {sorted(list(extra_in_meta))}")
        return # Stop further checks if manifest is wrong

    print("  [PASS] File manifest matches metadata.json.")

    # 3. Part ID, Intra-file, and Inter-file checks
    last_ref_from_previous_file = None
    for i, part_info in enumerate(metadata['parts']):
        part_filename = part_info['file']
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
        ids_on_disk = sorted(list(set([int(p['ref'].split('.')[0]) for p in passages])))
        ids_in_meta = sorted(part_info.get('id', [])) # Use 'id' field, fallback to empty
        if ids_on_disk != ids_in_meta:
            error_log.append(f"Part ID Error in {part_filename}: metadata.json says part covers IDs {ids_in_meta}, but file content has IDs {ids_on_disk}")

        # Intra-file Monotonicity Check
        main_refs = [p['ref'] for p in passages if 'ref' in p]
        is_monotonically_increasing(main_refs, part_path, "main passages", error_log)
        
        for commentary in part_data.get('commentaries', []):
            commentary_id = commentary.get('commentary_id', 'Unknown')
            commentary_refs = [p['ref'] for p in commentary.get('passages', []) if 'ref' in p]
            is_monotonically_increasing(commentary_refs, part_path, f"commentary '{commentary_id}'", error_log)

        # Inter-file Monotonicity Check
        if main_refs:
            first_ref_current = parse_ref(main_refs[0])
            if last_ref_from_previous_file:
                if first_ref_current < last_ref_from_previous_file:
                    prev_part_filename = metadata['parts'][i-1]['file']
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
