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

def generate_diff_report(norm_original: str, norm_generated: str, context_size: int = 20) -> str:
    """
    Creates a human-readable, contextual diff report for two strings.

    Args:
        norm_original: The first normalized string.
        norm_generated: The second normalized string.
        context_size: Number of characters to show before and after a change.

    Returns:
        A formatted string detailing the differences.
    """
    report_lines = [
        f"\n{Style.BRIGHT}--- Detailed Devanagari Diff Report ---{Style.NORMAL}",
        "Comparing normalized text to find changes in core script content."
    ]

    # SequenceMatcher works on sequences, so we treat the strings as sequences of characters
    matcher = difflib.SequenceMatcher(None, norm_original, norm_generated, autojunk=False)

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        original_chunk = norm_original[i1:i2]
        generated_chunk = norm_generated[j1:j2]

        if tag == 'equal':
            # Show a snippet of context, especially around changes
            if len(original_chunk) > context_size * 2:
                report_lines.append(
                    f"{Style.DIM}  ... {original_chunk[:context_size]} ... {original_chunk[-context_size:]}"
                )
            else:
                 report_lines.append(f"{Style.DIM}  {original_chunk}")
        else:
            # This is a change, let's highlight it
            if tag == 'replace':
                report_lines.append(f"{Fore.RED}- Original : {original_chunk}")
                report_lines.append(f"{Fore.GREEN}+ Generated: {generated_chunk}")
            elif tag == 'delete':
                report_lines.append(f"{Fore.RED}- Deleted  : {original_chunk}")
            elif tag == 'insert':
                report_lines.append(f"{Fore.GREEN}+ Inserted : {generated_chunk}")

    return "\n".join(report_lines)


def verify_devanagari_integrity(original_file: str, generated_file: str, log_filepath: str) -> bool:
    """
    Verifies that the Devanagari content has not been altered and writes a log.

    Args:
        original_file: Path to the original input file.
        generated_file: Path to the generated output file.
        log_filepath: Path to write the verification log file.

    Returns:
        True if integrity is verified, False otherwise.
    """
    print("--- Starting Verification ---")
    log_lines = [f"Verification log for {original_file}"]

    original_text = read_file_content(original_file)
    generated_text = read_file_content(generated_file)

    devanagari_pattern = re.compile(r'[\u0900-\u097F]+')
    original_devanagari = "".join(devanagari_pattern.findall(original_text))
    generated_devanagari = "".join(devanagari_pattern.findall(generated_text))

    norm_original = normalize_text(original_devanagari)
    norm_generated = normalize_text(generated_devanagari)

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

        diff_report = generate_diff_report(norm_original, norm_generated)
        log_lines.append(diff_report)
        print(diff_report) # Also print to console for immediate feedback

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

    # Write the consolidated log file
    with open(log_filepath, 'w', encoding='utf-8') as f:
        f.write("\n".join(log_lines))
    print(f"Verification log saved to '{log_filepath}'")

    return result

def main():
    """Main function to run the conversion and verification process."""
    parser = argparse.ArgumentParser(
        description="""
        A tool to process Markdown files using the Gemini API based on a given prompt.
        It preserves Devanagari script integrity during the process.
        """,
        formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument(
        "-p", "--prompt",
        default="prompt.txt",
        help="Path to the prompt file to be used for the conversion. Defaults to 'prompt.txt'."
    )
    parser.add_argument(
        "input_files",
        metavar="FILE",
        nargs='+',
        help="One or more Markdown files to process."
    )
    args = parser.parse_args()

    configure_api()
    prompt_content = read_file_content(args.prompt)

    for input_file in args.input_files:
        print(f"\n--- Processing file: {input_file} ---")

        # Generate output filename
        base, _ = os.path.splitext(input_file)
        output_file = f"{base}.converted.md"

        input_content = read_file_content(input_file)
        api_response = call_gemini_api(prompt_content, input_content)

        if not api_response:
            print(f"Process for {input_file} halted due to empty API response.")
            continue  # Skip to the next file

        write_output_file(output_file, api_response)

        # Verify integrity and create log file
        log_file = f"{base}.conversion.log"
        verify_devanagari_integrity(input_file, output_file, log_file)

if __name__ == "__main__":
    main()