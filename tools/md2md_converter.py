import os
import sys
import re
import difflib
import argparse
import google.generativeai as genai
from grantha_converter.hasher import normalize_text

# --- Configuration ---
MODEL_NAME = "gemini-2.5-pro"

# --- Optional Dependency: Colorama for colored diff output ---
try:
    from colorama import Fore, Style, init
    init(autoreset=True)
except ImportError:
    print("Colorama not found. Diff will not be colored. For a better experience, run: pip install colorama")
    # Create a dummy class if colorama is not installed so the script doesn't fail
    class DummyColor:
        def __getattr__(self, name):
            return ""
    Fore = Style = DummyColor()


def configure_api():
    """Configures the Gemini API with the key from environment variables."""
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        print("ERROR: GOOGLE_API_KEY environment variable not set.")
        sys.exit(1)
    genai.configure(api_key=api_key)
    print("Gemini API configured successfully.")

def read_file_content(filepath: str) -> str:
    """Reads the entire content of a file."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        print(f"ERROR: File not found at '{filepath}'")
        sys.exit(1)

def call_gemini_api(prompt: str, input_text: str) -> str:
    """Sends the combined prompt and input text to the Gemini API."""
    print(f"Initializing Gemini model: {MODEL_NAME}...")
    model = genai.GenerativeModel(MODEL_NAME)
    full_prompt = f"{prompt}\n\n--- START OF INPUT FILE ---\n\n{input_text}"
    print("Sending request to Gemini API. This may take a moment...")
    try:
        response = model.generate_content(full_prompt)
        print("Received response from API.")
        if not response.parts:
             print("Warning: Received an empty or blocked response from the API.")
             return ""
        return response.text
    except Exception as e:
        print(f"An error occurred while calling the Gemini API: {e}")
        return ""

def write_output_file(filepath: str, content: str):
    """Writes the given content to a file."""
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Output successfully saved to '{filepath}'")

class IndexMapper:
    """
    Creates a mapping from normalized string indices to original string indices.
    This is used to find the original location of a change found in the normalized text.
    """
    def __init__(self, original_text: str):
        self.map = []
        devanagari_pattern = re.compile(r'[\u0900-\u097F]')
        for i, char in enumerate(original_text):
            if devanagari_pattern.match(char):
                self.map.append(i)

    def get_original_index(self, normalized_index: int) -> int:
        """
        Gets the index in the original text corresponding to an index in the normalized text.
        """
        if 0 <= normalized_index < len(self.map):
            return self.map[normalized_index]
        return -1

def colorize_diff_chunks(original_chunk: str, generated_chunk: str) -> (str, str):
    """
    Performs a character-by-character diff on two strings and adds ANSI color codes.
    """
    matcher = difflib.SequenceMatcher(None, original_chunk, generated_chunk)
    highlighted_original = []
    highlighted_generated = []

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            highlighted_original.append(original_chunk[i1:i2])
            highlighted_generated.append(generated_chunk[j1:j2])
        elif tag == 'replace':
            highlighted_original.append(f"{Fore.RED}{Style.BRIGHT}{original_chunk[i1:i2]}{Style.RESET_ALL}")
            highlighted_generated.append(f"{Fore.GREEN}{Style.BRIGHT}{generated_chunk[j1:j2]}{Style.RESET_ALL}")
        elif tag == 'delete':
            highlighted_original.append(f"{Fore.RED}{Style.BRIGHT}{original_chunk[i1:i2]}{Style.RESET_ALL}")
        elif tag == 'insert':
            highlighted_generated.append(f"{Fore.GREEN}{Style.BRIGHT}{generated_chunk[j1:j2]}{Style.RESET_ALL}")

    return "".join(highlighted_original), "".join(highlighted_generated)

def generate_diff_report(
    norm_original: str, norm_generated: str,
    original_text: str, generated_text: str,
    context_size: int = 20
) -> str:
    """
    Creates a human-readable, contextual diff report for two strings, including a summary of changes
    and pointers to the original text with inline character highlighting.
    """
    report_lines = [
        f"\n{Style.BRIGHT}--- Detailed Devanagari Diff Report ---{Style.NORMAL}",
        "Comparing normalized text to find changes in core script content."
    ]
    
    added_chars = 0
    deleted_chars = 0
    has_changes = False

    original_mapper = IndexMapper(original_text)
    
    matcher = difflib.SequenceMatcher(None, norm_original, norm_generated, autojunk=False)

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            continue

        has_changes = True
        original_chunk = norm_original[i1:i2]
        generated_chunk = norm_generated[j1:j2]

        # --- Context Highlighting Logic ---
        original_start_index = original_mapper.get_original_index(i1)
        
        if original_start_index != -1:
            line_start = original_text.rfind('\n', 0, original_start_index) + 1
            line_end = original_text.find('\n', original_start_index)
            line_end = line_end if line_end != -1 else len(original_text)
            line_number = original_text.count('\n', 0, line_start) + 1
            
            # Reconstruct the line with highlighting
            highlighted_context_line = []
            if tag == 'insert':
                # For insertions, place a marker at the insertion point
                insertion_point_in_line = original_start_index - line_start
                original_line = original_text[line_start:line_end]
                highlighted_context_line.append(original_line[:insertion_point_in_line])
                highlighted_context_line.append(f"{Fore.YELLOW}{Style.BRIGHT}>>>")
                highlighted_context_line.append(original_line[insertion_point_in_line:])
            else:
                # For delete/replace, highlight the affected range
                original_end_index = original_mapper.get_original_index(i2 - 1)
                if original_end_index != -1:
                    highlight_start_in_line = original_start_index - line_start
                    highlight_end_in_line = original_end_index - line_start + 1
                    original_line = original_text[line_start:line_end]
                    
                    highlighted_context_line.append(original_line[:highlight_start_in_line])
                    highlighted_context_line.append(f"{Fore.YELLOW}{Style.BRIGHT}{original_line[highlight_start_in_line:highlight_end_in_line]}{Style.RESET_ALL}")
                    highlighted_context_line.append(original_line[highlight_end_in_line:])

            report_lines.append(f"\n{Style.DIM}Original context (line ~{line_number}):{Style.NORMAL}")
            report_lines.append(f"  {''.join(highlighted_context_line).strip()}")

        # --- Diff Chunk Reporting ---
        if tag == 'replace':
            deleted_chars += len(original_chunk)
            added_chars += len(generated_chunk)
            h_orig, h_gen = colorize_diff_chunks(original_chunk, generated_chunk)
            report_lines.append(f"- Original : {h_orig}")
            report_lines.append(f"+ Generated: {h_gen}")
        elif tag == 'delete':
            deleted_chars += len(original_chunk)
            report_lines.append(f"- Deleted  : {Fore.RED}{Style.BRIGHT}{original_chunk}{Style.RESET_ALL}")
        elif tag == 'insert':
            added_chars += len(generated_chunk)
            report_lines.append(f"+ Inserted : {Fore.GREEN}{Style.BRIGHT}{generated_chunk}{Style.RESET_ALL}")

    if has_changes:
        summary = (
            f"\n{Style.BRIGHT}--- Summary ---{Style.NORMAL}\n"
            f"{Fore.GREEN}Total characters added: {added_chars}{Style.RESET_ALL}\n"
            f"{Fore.RED}Total characters deleted: {deleted_chars}{Style.RESET_ALL}"
        )
        report_lines.append(summary)
    
    return "\n".join(report_lines)


def verify_devanagari_integrity(original_file: str, generated_file: str, log_filepath: str) -> bool:
    """
    Verifies that the Devanagari content has not been altered and writes a log.
    """
    print("--- Starting Verification ---")
    log_lines = [f"Verification log for {original_file}"]

    original_text = read_file_content(original_file)
    generated_text = read_file_content(generated_file)

    norm_original = extract_devanagari_from_file(original_file, ignore_header=False) # Headers matter for verification
    norm_generated = extract_devanagari_from_file(generated_file, ignore_header=False)

    if norm_original == norm_generated:
        result = True
        status_message = "✅ SUCCESS: Devanagari content integrity verified. The conversion was lossless."
        print(status_message)
        log_lines.append(status_message)
    else:
        result = False
        status_message = f"{Fore.RED}{Style.BRIGHT}❌ FAILURE: Devanagari content was altered during conversion."
        print(status_message)
        log_lines.append("FAILURE: Devanagari content was altered during conversion.")

        diff_report = generate_diff_report(norm_original, norm_generated, original_text, generated_text)
        log_lines.append(diff_report)
        print(diff_report)

        print("\nSaving full normalized text for manual inspection...")
        base, _ = os.path.splitext(original_file)
        debug_orig_path = f"{base}.original_normalized.txt"
        debug_gen_path = f"{base}.generated_normalized.txt"

        with open(debug_orig_path, "w", encoding="utf-8") as f:
            f.write(norm_original)
        with open(debug_gen_path, "w", encoding="utf-8") as f:
            f.write(norm_generated)

        debug_message = f"Debug files '{debug_orig_path}' and '{debug_gen_path}' created."
        print(debug_message)
        log_lines.append(f"\n{debug_message}")

    with open(log_filepath, 'w', encoding='utf-8') as f:
        f.write("\n".join(log_lines))
    print(f"Verification log saved to '{log_filepath}'")

    return result

def extract_devanagari_from_file(filepath: str, ignore_header: bool) -> (str, str):
    """
    Reads a file and extracts its normalized Devanagari content and original content,
    optionally ignoring the YAML frontmatter.
    """
    full_content = read_file_content(filepath)
    content_to_process = full_content

    if ignore_header:
        header_pattern = r'^(?:---|\+\+\+)\s*\n.*?\n(?:---|\+\+\+)\s*\n'
        content_to_process = re.sub(header_pattern, '', full_content, flags=re.DOTALL)

    devanagari_pattern = re.compile(r'[\u0900-\u097F]+')
    devanagari_text = "".join(devanagari_pattern.findall(content_to_process))
    
    return normalize_text(devanagari_text), content_to_process

def perform_diff(file1: str, file2: str, ignore_header: bool):
    """
    Performs a Devanagari-only diff between two files.
    """
    print(f"\n{Style.BRIGHT}--- Comparing Devanagari content ---{Style.NORMAL}")
    print(f"  File 1: {file1}")
    print(f"  File 2: {file2}")
    if ignore_header:
        print(f"  {Style.DIM}(Ignoring YAML frontmatter){Style.NORMAL}")

    norm1, original_content1 = extract_devanagari_from_file(file1, ignore_header)
    norm2, original_content2 = extract_devanagari_from_file(file2, ignore_header)

    if norm1 == norm2:
        print(f"{Fore.GREEN}✅ No differences in normalized Devanagari content found.{Style.RESET_ALL}")
    else:
        print(f"{Fore.YELLOW}⚠️ Differences found in normalized Devanagari content:{Style.RESET_ALL}")
        diff_report = generate_diff_report(norm1, norm2, original_content1, original_content2)
        print(diff_report)

def main():
    """Main function to run the conversion and verification process."""
    parser = argparse.ArgumentParser(
        description="A tool to process and compare Markdown files with a focus on Devanagari script integrity.",
        formatter_class=argparse.RawTextHelpFormatter
    )
    subparsers = parser.add_subparsers(dest="command", required=True, help="Available commands")

    # --- Convert Command ---
    parser_convert = subparsers.add_parser("convert", help="Process Markdown files using the Gemini API.")
    parser_convert.add_argument(
        "-p", "--prompt",
        default="prompt.txt",
        help="Path to the prompt file. Defaults to 'prompt.txt'."
    )
    parser_convert.add_argument(
        "input_files",
        metavar="FILE",
        nargs='+',
        help="One or more Markdown files to process."
    )

    # --- Diff Command ---
    parser_diff = subparsers.add_parser("diff", help="Perform a Devanagari-only diff on file pairs in a directory or on a specified pair of files.")
    parser_diff.add_argument(
        "paths",
        metavar="PATH",
        nargs='+',
        help="Either a single directory to scan for pairs, or two individual files to compare."
    )
    parser_diff.add_argument(
        "--no-header",
        action="store_true",
        help="Ignore the YAML frontmatter (between '---' or '+++') in the diff."
    )

    args = parser.parse_args()

    if args.command == "convert":
        configure_api()
        prompt_content = read_file_content(args.prompt)
        for input_file in args.input_files:
            print(f"\n--- Processing file: {input_file} ---")
            base, _ = os.path.splitext(input_file)
            output_file = f"{base}.converted.md"
            input_content = read_file_content(input_file)
            api_response = call_gemini_api(prompt_content, input_content)
            if not api_response:
                print(f"Process for {input_file} halted due to empty API response.")
                continue
            write_output_file(output_file, api_response)
            log_file = f"{base}.conversion.log"
            verify_devanagari_integrity(input_file, output_file, log_file)

    elif args.command == "diff":
        if len(args.paths) == 1:
            directory = args.paths[0]
            if not os.path.isdir(directory):
                print(f"ERROR: Directory not found at '{directory}'")
                sys.exit(1)
            
            print(f"Scanning directory '{directory}' for file pairs...")
            for filename in sorted(os.listdir(directory)):
                if filename.endswith(".md") and not filename.endswith(".converted.md"):
                    original_path = os.path.join(directory, filename)
                    base, _ = os.path.splitext(original_path)
                    converted_path = f"{base}.converted.md"
                    
                    if os.path.exists(converted_path):
                        perform_diff(original_path, converted_path, args.no_header)
                    else:
                        print(f"\n--- Skipping {original_path} ---")
                        print(f"  Corresponding '.converted.md' file not found.")
        
        elif len(args.paths) == 2:
            file1, file2 = args.paths
            if not os.path.isfile(file1):
                print(f"ERROR: File not found at '{file1}'")
                sys.exit(1)
            if not os.path.isfile(file2):
                print(f"ERROR: File not found at '{file2}'")
                sys.exit(1)
            perform_diff(file1, file2, args.no_header)

        else:
            print("ERROR for 'diff' command: Please provide either a single directory or exactly two files.", file=sys.stderr)
            sys.exit(1)

if __name__ == "__main__":
    main()