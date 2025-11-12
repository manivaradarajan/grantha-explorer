import argparse
import os
import glob
import re
from typing import List, Tuple
from ref_validator_utils import is_monotonically_increasing, parse_ref

def validate_md_file(file_path: str, error_log: List[str] = None) -> List[str]:
    """
    Validates that the 'ref' numbers in a converted.md file are monotonically increasing.
    Returns the list of refs found in the file.
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"Error reading file {file_path}: {e}")
        return []

    # Regex to find # Mantra headers with ref numbers
    ref_pattern = re.compile(r'^#\s+Mantra\s+([0-9\.-]+)')
    
    refs = []
    for line in content.splitlines():
        match = ref_pattern.match(line)
        if match:
            refs.append(match.group(1))

    is_monotonically_increasing(refs, file_path, "Markdown headers", error_log=error_log)
    return refs

def main():
    parser = argparse.ArgumentParser(
        description="Validate that 'ref' numbers in '*converted.md' files are monotonically increasing."
    )
    parser.add_argument(
        "target_dir",
        help="The directory containing the '*converted.md' files (e.g., granthas/vishvas-brh)."
    )
    args = parser.parse_args()

    if not os.path.isdir(args.target_dir):
        print(f"Error: Directory not found at {args.target_dir}")
        return

    print(f"Starting validation in: {args.target_dir}")
    
    md_files = glob.glob(os.path.join(args.target_dir, '*converted.md'))

    if not md_files:
        print("No '*converted.md' files found to validate.")
        return

    last_ref_from_previous_file = None
    for md_file in sorted(md_files):
        refs = validate_md_file(md_file)
        if refs:
            if last_ref_from_previous_file:
                # Check if the first ref of this file is greater than the last of the previous
                first_ref_current_file = parse_ref(refs[0])
                if first_ref_current_file < last_ref_from_previous_file:
                    print(f"Validation Error between files:")
                    print(f"  First ref '{refs[0]}' in {os.path.basename(md_file)} is not greater than or equal to the last ref '{'.'.join(map(str, last_ref_from_previous_file))}' from the previous file.")
            
            last_ref_str = refs[-1]
            last_ref_from_previous_file = parse_ref(last_ref_str)

    print("Validation check complete.")

if __name__ == "__main__":
    main()
