import unittest
import os
import json
import shutil
import sys
from io import StringIO

# Add scripts directory to path to allow imports
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from ref_validator_utils import is_monotonically_increasing
from validate_refs import validate_part_file
from validate_md_refs import validate_md_file

class TestRefValidators(unittest.TestCase):

    def setUp(self):
        self.test_dir = "temp_test_dir"
        os.makedirs(self.test_dir, exist_ok=True)

    def tearDown(self):
        shutil.rmtree(self.test_dir)

    def _write_json_file(self, filename, data):
        path = os.path.join(self.test_dir, filename)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f)
        return path

    def _write_md_file(self, filename, content):
        path = os.path.join(self.test_dir, filename)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        return path

    # --- JSON Validator Tests ---

    def test_json_valid(self):
        data = {"passages": [{"ref": "1.1.1"}, {"ref": "1.1.2"}, {"ref": "1.2.1"}]}
        path = self._write_json_file("valid.json", data)
        errors = []
        validate_part_file(path, errors)
        self.assertEqual(len(errors), 0)

    def test_json_simple_decreasing(self):
        data = {"passages": [{"ref": "1.1.2"}, {"ref": "1.1.1"}]}
        path = self._write_json_file("decreasing.json", data)
        errors = []
        validate_part_file(path, errors)
        self.assertEqual(len(errors), 1)
        self.assertIn("Ref '1.1.1' is not greater than or equal to the previous ref '1.1.2'", errors[0])

    def test_json_different_components(self):
        data = {"passages": [{"ref": "2"}, {"ref": "1.1.1"}]}
        path = self._write_json_file("components.json", data)
        errors = []
        validate_part_file(path, errors)
        self.assertEqual(len(errors), 1)
        self.assertIn("Ref '1.1.1' is not greater than or equal to the previous ref '2'", errors[0])

    def test_json_with_ranges(self):
        data = {"passages": [{"ref": "1.1.1"}, {"ref": "1.1.2-5"}, {"ref": "1.1.6"}]}
        path = self._write_json_file("ranges.json", data)
        errors = []
        validate_part_file(path, errors)
        self.assertEqual(len(errors), 0)

    def test_json_commentary(self):
        data = {
            "passages": [{"ref": "1.1.1"}],
            "commentaries": [{
                "commentary_id": "test_commentary",
                "passages": [{"ref": "1.1.2"}, {"ref": "1.1.1"}]
            }]
        }
        path = self._write_json_file("commentary.json", data)
        errors = []
        validate_part_file(path, errors)
        self.assertEqual(len(errors), 1)
        self.assertIn("commentary 'test_commentary'", errors[0])
        self.assertIn("Ref '1.1.1' is not greater than or equal to the previous ref '1.1.2'", errors[0])

    # --- Markdown Validator Tests ---

    def test_md_valid(self):
        content = "### 1.1.1\nSome text\n### 1.1.2\nMore text"
        path = self._write_md_file("valid.md", content)
        errors = []
        validate_md_file(path, errors)
        self.assertEqual(len(errors), 0)

    def test_md_decreasing(self):
        content = "### 1.1.2\nSome text\n### 1.1.1\nMore text"
        path = self._write_md_file("decreasing.md", content)
        errors = []
        validate_md_file(path, errors)
        self.assertEqual(len(errors), 1)
        self.assertIn("Ref '1.1.1' is not greater than or equal to the previous ref '1.1.2'", errors[0])

    def test_md_with_ranges(self):
        content = "### 1.1.1\nSome text\n### 1.1.2-5\nMore text\n### 1.1.6"
        path = self._write_md_file("md_ranges.md", content)
        errors = []
        validate_md_file(path, errors)
        self.assertEqual(len(errors), 0)

if __name__ == '__main__':
    unittest.main()
