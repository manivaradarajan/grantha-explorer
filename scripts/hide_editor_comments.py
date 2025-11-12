
import os
import re
import shutil

def find_converted_md_files(directory):
    """Finds all files ending with 'converted.md' in the given directory."""
    matches = []
    for root, _, filenames in os.walk(directory):
        for filename in filenames:
            if filename.endswith('converted.md'):
                matches.append(os.path.join(root, filename))
    return matches

def extract_devanagari(text):
    """Extracts all Devanagari characters from a string."""
    return "".join(re.findall(r'[\u0900-\u097F]', text))

def hide_editor_comments(file_path):

    """

    Hides editor comments in square brackets with '<!-- hide -->' markup.

    This function is idempotent and handles escaped brackets.

    Returns the original and modified content.

    """

    with open(file_path, 'r', encoding='utf-8') as f:

        original_content = f.read()



    modified_content = original_content

    

    # Find all bracketed patterns to consider for hiding

    bracket_pattern = r'(\\?)\[([^\]]+?)\](?!\()'

    

    # Find all existing hidden blocks to ensure idempotency

    hidden_block_pattern = r'<!-- hide -->.*?<!-- /hide -->'

    

    hidden_spans = [m.span() for m in re.finditer(hidden_block_pattern, modified_content, re.DOTALL)]

    

    matches = list(re.finditer(bracket_pattern, modified_content))

    

    # Reverse the matches to replace from the end, avoiding index shifts

    for match in reversed(matches):

        is_already_hidden = False

        for start, end in hidden_spans:

            if start <= match.start() and end >= match.end():

                is_already_hidden = True

                break

        

        if not is_already_hidden:

            start, end = match.span()

            replacement = f'<!-- hide -->{match.group(0)}<!-- /hide -->'

            modified_content = modified_content[:start] + replacement + modified_content[end:]



    return original_content, modified_content

def validate_devanagari(original_content, modified_content):
    """
Validates that no Devanagari characters were modified.
    """
    original_devanagari = extract_devanagari(original_content)
    modified_devanagari = extract_devanagari(modified_content)
    return original_devanagari == modified_devanagari

def main():
    """Main function to process files and validate changes."""
    import argparse

    parser = argparse.ArgumentParser(description="Hide editor comments in specified Markdown files.")
    parser.add_argument("files", nargs='+', help="One or more files to process.")
    args = parser.parse_args()

    files_to_process = args.files

    if not files_to_process:
        print("No files specified.")
        return

    print(f"Processing {len(files_to_process)} file(s).")

    for file_path in files_to_process:
        if not os.path.exists(file_path):
            print(f"  Skipping '{file_path}' (not found).")
            continue

        print(f"Processing '{file_path}'...")
        try:
            original_content, modified_content = hide_editor_comments(file_path)

            if original_content == modified_content:
                print("  No changes made.")
                continue

            if not validate_devanagari(original_content, modified_content):
                print(f"  Validation failed for '{file_path}'. Aborting.")
                return

            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(modified_content)
            print("  Changes written successfully.")

        except Exception as e:
            print(f"  An error occurred: {e}")

    print("\nProcessing complete.")

if __name__ == '__main__':
    main()
