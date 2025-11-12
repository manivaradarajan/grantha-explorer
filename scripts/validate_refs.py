import argparse
import json
import os
import glob
from typing import List, Dict, Tuple, Any
from ref_validator_utils import is_monotonically_increasing

def validate_part_file(file_path: str, error_log: List[str] = None):
    """
    Validates a single part*.json file.
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # Validate main passages
        if 'passages' in data:
            refs = [p['ref'] for p in data['passages'] if 'ref' in p]
            is_monotonically_increasing(refs, file_path, "main passages", error_log=error_log)

        # Validate commentary passages
        if 'commentaries' in data:
            for commentary in data['commentaries']:
                commentary_id = commentary.get('commentary_id', 'Unknown Commentary')
                if 'passages' in commentary:
                    refs = [p['ref'] for p in commentary['passages'] if 'ref' in p]
                    is_monotonically_increasing(refs, file_path, f"commentary '{commentary_id}'", error_log=error_log)

    except json.JSONDecodeError:
        print(f"Error: Could not decode JSON from {file_path}")
    except Exception as e:
        print(f"An unexpected error occurred with {file_path}: {e}")

def main():
    parser = argparse.ArgumentParser(
        description="Validate that 'ref' numbers in grantha part*.json files are monotonically increasing."
    )
    parser.add_argument(
        "library_dir",
        help="The path to the 'library' directory containing grantha data (e.g., public/data/library)."
    )
    args = parser.parse_args()

    if not os.path.isdir(args.library_dir):
        print(f"Error: Directory not found at {args.library_dir}")
        return

    print(f"Starting validation in: {args.library_dir}")
    
    part_files = glob.glob(os.path.join(args.library_dir, '**', 'part*.json'), recursive=True)

    if not part_files:
        print("No 'part*.json' files found to validate.")
        return

    for part_file in sorted(part_files):
        validate_part_file(part_file)

    print("Validation check complete.")

if __name__ == "__main__":
    main()
