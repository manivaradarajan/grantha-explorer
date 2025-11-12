
import sys
import re
import difflib

def extract_devanagari(text):
    """Extracts all Devanagari characters from a string."""
    return "".join(re.findall(r'[\u0900-\u097F]', text))

def read_file_content(file_path):
    """Reads the content of a file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        print(f"Error: File not found at {file_path}", file=sys.stderr)
        return None

def main():
    """Main function to perform Devanagari-only diff."""
    if len(sys.argv) != 3:
        print("Usage: python devanagari_diff.py <file1> <file2>", file=sys.stderr)
        sys.exit(1)

    file1_path = sys.argv[1]
    file2_path = sys.argv[2]

    content1 = read_file_content(file1_path)
    content2 = read_file_content(file2_path)

    if content1 is None or content2 is None:
        sys.exit(1)

    devanagari1 = extract_devanagari(content1)
    devanagari2 = extract_devanagari(content2)

    if devanagari1 == devanagari2:
        print("No Devanagari differences found.")
        return

    diff = difflib.unified_diff(
        devanagari1.splitlines(keepends=True),
        devanagari2.splitlines(keepends=True),
        fromfile=file1_path,
        tofile=file2_path,
        lineterm='',
    )

    print("Devanagari differences found:")
    for line in diff:
        sys.stdout.write(line)

if __name__ == '__main__':
    main()
