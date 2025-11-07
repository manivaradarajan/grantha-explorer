import json
import re
import argparse
from datetime import datetime
from collections import defaultdict
import sys

# For color-coded output
class bcolors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

class GranthaValidator:
    """
    Validates a Grantha JSON file against the rules defined in PRD-CONTENT-AND-DATA.md.
    Offers suggestions and can apply fixes for common issues.
    """

    def __init__(self, file_path, auto_fix=False):
        self.file_path = file_path
        self.auto_fix = auto_fix
        self.data = self._load_json()
        self.issues = defaultdict(list)
        self.fixes_to_apply = []
        
        # --- Phase 0 Configuration ---
        self.PHASE0_REQUIRED_COMMENTARIES = {"vedanta_desika", "rangaramanuja", "kuranarayana"}
        self.VALID_PASSAGE_TYPES = {"main", "prefatory", "concluding"}
        self.VALID_FOOTNOTE_TYPES = {"variant_reading", "editorial_note", "explanation", "cross_reference"}

    def _load_json(self):
        try:
            with open(self.file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except FileNotFoundError:
            print(f"{bcolors.FAIL}Error: File not found at '{self.file_path}'{bcolors.ENDC}")
            sys.exit(1)
        except json.JSONDecodeError as e:
            print(f"{bcolors.FAIL}Error: Invalid JSON in '{self.file_path}': {e}{bcolors.ENDC}")
            sys.exit(1)

    def _log_issue(self, level, message, path, fix_suggestion=None, fix_func=None):
        """Logs an issue and a potential fix function."""
        issue = {
            "level": level,
            "message": message,
            "path": path,
            "suggestion": fix_suggestion
        }
        self.issues[level].append(issue)
        if self.auto_fix and fix_func:
            self.fixes_to_apply.append({'func': fix_func, 'message': f"Applied fix for: {message} at {path}"})

    def run_validation(self):
        """Executes all validation checks."""
        if not self.data:
            return

        print(f"{bcolors.HEADER}--- Starting Validation for: {self.file_path} ---{bcolors.ENDC}")

        # Gather all passage references first for cross-checking
        self.main_text_refs = self._get_all_main_text_refs()

        self._validate_top_level_structure()
        self._validate_metadata()
        self._validate_all_passages()
        self._validate_commentaries()

        if self.auto_fix:
            self.apply_fixes()

        self.print_report()
        
    def _get_all_main_text_refs(self):
        """Collects all unique 'ref' strings from the main text passages."""
        refs = set()
        for passage_group in ["prefatory_material", "passages", "concluding_material"]:
            for passage in self.data.get(passage_group, []):
                if 'ref' in passage:
                    refs.add(passage['ref'])
        return refs

    def _validate_top_level_structure(self):
        """Checks for required keys at the root of the JSON object."""
        path = "root"
        required_keys = ["grantha_id", "canonical_title", "text_type", "language", "metadata", "passages", "commentaries"]
        for key in required_keys:
            if key not in self.data:
                self._log_issue("ERROR", f"Missing required top-level key: '{key}'", path)

    def _validate_metadata(self):
        """Validates the 'metadata' object."""
        path = "metadata"
        metadata = self.data.get("metadata", {})
        if not metadata:
            self._log_issue("ERROR", "The 'metadata' object is missing or empty.", path)
            return

        required_keys = ["source_url", "source_commit", "last_updated"]
        for key in required_keys:
            if key not in metadata:
                self._log_issue("WARNING", f"Missing recommended metadata key: '{key}'", path)

        if "last_updated" in metadata:
            try:
                datetime.fromisoformat(metadata['last_updated'].replace('Z', '+00:00'))
            except (ValueError, TypeError):
                self._log_issue("ERROR", f"'last_updated' is not a valid ISO 8601 timestamp: '{metadata['last_updated']}'", f"{path}.last_updated")

    def _validate_all_passages(self):
        """Validates prefatory, main, and concluding passages."""
        # Check sorting
        self._check_passage_sorting("passages")
        
        # Validate content
        for passage_type_key, expected_type in [("prefatory_material", "prefatory"), 
                                                ("passages", "main"), 
                                                ("concluding_material", "concluding")]:
            passages = self.data.get(passage_type_key, [])
            for i, passage in enumerate(passages):
                self._validate_single_passage(passage, f"{passage_type_key}[{i}]", expected_type)

    @staticmethod
    def _ref_sort_key(ref_str):
        """Creates a sort key for numerical sorting of dot-separated refs."""
        try:
            return [int(x) for x in ref_str.split('.')]
        except (ValueError, AttributeError):
            return [9999] # Put invalid refs at the end

    def _check_passage_sorting(self, passage_key):
        """Checks if passages are sorted numerically by ref."""
        passages = self.data.get(passage_key, [])
        if not passages:
            return
            
        refs = [p.get('ref', '') for p in passages]
        sorted_refs = sorted(refs, key=self._ref_sort_key)

        if refs != sorted_refs:
            fix_func = lambda: self.data[passage_key].sort(key=lambda p: self._ref_sort_key(p.get('ref', '')))
            self._log_issue(
                "WARNING", 
                "Passages are not numerically sorted by 'ref'.", 
                passage_key,
                "Passages should be sorted to ensure correct order (e.g., '1.2' before '1.10'). Run with --fix to sort automatically.",
                fix_func
            )

    def _validate_single_passage(self, passage, path, expected_type):
        """Validates a single passage object from any section."""
        # Validate 'ref'
        ref = passage.get('ref')
        if not ref:
            self._log_issue("ERROR", "Passage is missing 'ref' field.", path)
            return

        # Allow descriptive refs for concluding material
        if expected_type == "concluding":
            # Allow alphanumeric with hyphens and underscores (e.g., "uttara-shaanti-paathah")
            if not re.match(r'^[a-z0-9_-]+$', ref):
                self._log_issue("ERROR", f"Concluding material 'ref' format is invalid: '{ref}'. Expected lowercase alphanumeric with hyphens/underscores.", f"{path}.ref")
        elif not re.match(r'^\d+(\.\d+)*$', ref):
            self._log_issue("ERROR", f"Passage 'ref' format is invalid: '{ref}'. Expected format like '1.1' or '2.3.4'.", f"{path}.ref")

        # Validate 'passage_type'
        ptype = passage.get('passage_type')
        if ptype != expected_type:
            fix_func = lambda: passage.update({'passage_type': expected_type})
            self._log_issue(
                "ERROR", 
                f"Passage 'passage_type' is '{ptype}', but expected '{expected_type}' for its location.", 
                f"{path}.passage_type",
                f"Change 'passage_type' to '{expected_type}'. Run with --fix to correct.",
                fix_func
            )
        elif ptype not in self.VALID_PASSAGE_TYPES:
            self._log_issue("ERROR", f"Invalid 'passage_type': '{ptype}'.", f"{path}.passage_type")
        
        # Validate content structure
        has_content = 'content' in passage
        has_variants = 'variants' in passage
        if not (has_content ^ has_variants):
            self._log_issue("ERROR", "Passage must have either a 'content' object or a 'variants' object, but not both or neither.", path)
            return

        if has_content:
            self._validate_content_object(passage['content'], f"{path}.content")
        elif has_variants:
            self._validate_variants_object(passage['variants'], f"{path}.variants")
        
        # Validate footnotes
        if 'footnotes' in passage:
            self._validate_footnotes(passage['footnotes'], f"{path}.footnotes", ref)
            
    def _validate_content_object(self, content, path):
        """Validates a 'content' or 'variant content' object."""
        if 'sanskrit' not in content or 'devanagari' not in content.get('sanskrit', {}):
            self._log_issue("ERROR", "Content object is missing 'sanskrit.devanagari' field.", path)
        elif not content['sanskrit']['devanagari']:
            self._log_issue("WARNING", "'sanskrit.devanagari' field is empty.", path)
        else:
            self._validate_devanagari_chars(content['sanskrit']['devanagari'], f"{path}.sanskrit.devanagari")

        # Phase 0: No English translations
        if 'english_translation' in content and content['english_translation']:
            fix_func = lambda: content.update({'english_translation': ''})
            self._log_issue(
                "WARNING", 
                "Phase 0 specifies no English translations, but 'english_translation' field is not empty.", 
                f"{path}.english_translation",
                "Value should be an empty string or null. Run with --fix to clear it.",
                fix_func
            )

    def _validate_devanagari_chars(self, text, path):
        """Checks if all characters in a string are within the Devanagari Unicode block or are common punctuation."""
        allowed_chars = r".,;:\-—()[]'\"" # Common allowed punctuation
        for char in text:
            if not ('\u0900' <= char <= '\u097F' or char.isspace() or char in allowed_chars):
                self._log_issue("WARNING", f"Non-Devanagari or non-standard character found: '{char}' (U+{ord(char):04X})", path)

    def _validate_variants_object(self, variants, path):
        """Validates a 'variants' object."""
        if "canonical" not in variants:
            self._log_issue("ERROR", "'variants' object must contain a 'canonical' key.", path)
        
        available = self.data.get("variants_available", [])
        for variant_name, variant_content in variants.items():
            if variant_name not in available:
                self._log_issue("WARNING", f"Variant '{variant_name}' is present in passage but not listed in top-level 'variants_available'.", path)
            self._validate_content_object(variant_content, f"{path}.{variant_name}")

    def _validate_footnotes(self, footnotes, path, passage_ref):
        """Validates the structure of the 'footnotes' array."""
        for i, note in enumerate(footnotes):
            note_path = f"{path}[{i}]"
            for key in ["id", "applies_to", "type", "content"]:
                if key not in note:
                    self._log_issue("ERROR", f"Footnote is missing required key: '{key}'", note_path)
            
            if note.get('type') not in self.VALID_FOOTNOTE_TYPES:
                self._log_issue("ERROR", f"Invalid footnote type: '{note.get('type')}'", f"{note_path}.type")
            
            if passage_ref not in note.get('applies_to', []):
                 self._log_issue("WARNING", f"Footnote does not apply to its parent passage ref '{passage_ref}'", f"{note_path}.applies_to")

    def _validate_commentaries(self):
        """Validates the commentaries section."""
        path = "commentaries"
        commentaries = self.data.get("commentaries", [])
        if not isinstance(commentaries, list):
            self._log_issue("ERROR", "'commentaries' should be a list.", path)
            return

        found_commentaries = {c.get('commentary_id') for c in commentaries}
        missing = self.PHASE0_REQUIRED_COMMENTARIES - found_commentaries
        if missing:
            self._log_issue("ERROR", f"Phase 0 requires 3 bhashyas, but missing: {', '.join(missing)}", path)

        for i, commentary in enumerate(commentaries):
            self._validate_single_commentary(commentary, f"{path}[{i}]")

    def _validate_single_commentary(self, commentary, path):
        """Validates one commentary object."""
        for key in ["commentary_id", "commentator", "passages"]:
            if key not in commentary:
                self._log_issue("ERROR", f"Commentary is missing required key: '{key}'", path)
        
        for j, passage in enumerate(commentary.get('passages', [])):
            c_path = f"{path}.passages[{j}]"
            ref = passage.get('ref')
            if not ref:
                self._log_issue("ERROR", "Commentary passage is missing 'ref'.", c_path)
                continue
            
            if ref not in self.main_text_refs:
                self._log_issue("ERROR", f"Commentary passage ref '{ref}' does not correspond to any main text passage.", c_path)
            
            if 'content' not in passage:
                self._log_issue("ERROR", "Commentary passage is missing 'content' object.", c_path)
            else:
                self._validate_content_object(passage['content'], f"{c_path}.content")

    def apply_fixes(self):
        """Applies all queued fixes to the in-memory data object."""
        if not self.fixes_to_apply:
            print(f"\n{bcolors.OKCYAN}No automatic fixes to apply.{bcolors.ENDC}")
            return
            
        print(f"\n{bcolors.OKBLUE}--- Applying {len(self.fixes_to_apply)} Fixes ---{bcolors.ENDC}")
        for fix in self.fixes_to_apply:
            try:
                fix['func']()
                print(f"{bcolors.OKGREEN}✓ {fix['message']}{bcolors.ENDC}")
            except Exception as e:
                print(f"{bcolors.FAIL}✗ Failed to apply fix for: {fix['message']}. Reason: {e}{bcolors.ENDC}")

    def save_fixed_file(self, output_path):
        """Saves the modified data to a new JSON file."""
        if not self.auto_fix:
            print(f"{bcolors.WARNING}Cannot save. Run with --fix to enable modifications.{bcolors.ENDC}")
            return
        
        try:
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(self.data, f, ensure_ascii=False, indent=2)
            print(f"\n{bcolors.OKGREEN}Successfully saved fixed file to: {output_path}{bcolors.ENDC}")
        except Exception as e:
            print(f"{bcolors.FAIL}Error saving file to '{output_path}': {e}{bcolors.ENDC}")

    def print_report(self):
        """Prints a summary of all found issues."""
        print(f"\n{bcolors.HEADER}--- Validation Report ---{bcolors.ENDC}")
        total_issues = sum(len(v) for v in self.issues.values())

        if total_issues == 0:
            print(f"{bcolors.OKGREEN}{bcolors.BOLD}✓ Success! No issues found.{bcolors.ENDC}")
            return

        print(f"Found {total_issues} total issue(s).\n")

        if self.issues['ERROR']:
            print(f"{bcolors.FAIL}{bcolors.BOLD}--- {len(self.issues['ERROR'])} Errors (must be fixed) ---{bcolors.ENDC}")
            for issue in self.issues['ERROR']:
                print(f"  - {bcolors.FAIL}[ERROR]{bcolors.ENDC} at {bcolors.BOLD}{issue['path']}{bcolors.ENDC}: {issue['message']}")
        
        if self.issues['WARNING']:
            print(f"\n{bcolors.WARNING}{bcolors.BOLD}--- {len(self.issues['WARNING'])} Warnings (should be fixed) ---{bcolors.ENDC}")
            for issue in self.issues['WARNING']:
                print(f"  - {bcolors.WARNING}[WARNING]{bcolors.ENDC} at {bcolors.BOLD}{issue['path']}{bcolors.ENDC}: {issue['message']}")
                if issue['suggestion']:
                    print(f"    {bcolors.OKCYAN}↳ Suggestion: {issue['suggestion']}{bcolors.ENDC}")

def main():
    parser = argparse.ArgumentParser(
        description="Validate a Grantha JSON file based on the project's PRD.",
        formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("filepath", help="Path to the Grantha JSON file to validate.")
    parser.add_argument(
        "--fix",
        action="store_true",
        help="Automatically apply safe fixes to the data."
    )
    parser.add_argument(
        "-o", "--output",
        help="Path to save the fixed JSON file. Required if --fix is used."
    )
    args = parser.parse_args()

    if args.fix and not args.output:
        parser.error("--output is required when using --fix.")

    validator = GranthaValidator(args.filepath, auto_fix=args.fix)
    validator.run_validation()

    if args.fix:
        validator.save_fixed_file(args.output)

if __name__ == "__main__":
    main()