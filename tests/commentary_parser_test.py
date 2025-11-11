import unittest
import json
import os
import sys

# Add the project root to the Python path
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(script_dir)
sys.path.insert(0, project_root)

from tools.grantha_converter.md_to_json import convert_to_json

class TestMdToJson(unittest.TestCase):
    def test_commentary_parsing(self):
        # Create a dummy markdown file
        md_content = """---
grantha_id: test-grantha
canonical_title: Test Grantha
text_type: upanishad
language: sanskrit
structure_levels:
- key: Chapter
  children:
  - key: Section
    children:
    - key: Verse
---

<!-- commentary: {"commentary_id": "test-commentator", "passage_ref": "1.1.1"} -->
# Commentary: 1.1.1
<!-- sanskrit:devanagari -->
This is a commentary on verse 1.1.1.
<!-- /sanskrit:devanagari -->

# Mantra 1.1.2
<!-- sanskrit:devanagari -->
This is the text of mantra 1.1.2.
<!-- /sanskrit:devanagari -->

<!-- commentary: {"commentary_id": "test-commentator", "passage_ref": "1.1.2"} -->
# Commentary: 1.1.2
<!-- sanskrit:devanagari -->
This is a commentary on verse 1.1.2.
<!-- /sanskrit:devanagari -->
"""
        json_data = convert_to_json(md_content)
        
        self.assertEqual(len(json_data['commentaries']), 1)
        self.assertEqual(json_data['commentaries'][0]['commentary_id'], 'test-commentator')
        self.assertEqual(len(json_data['commentaries'][0]['passages']), 2)
        
        # Check first commentary
        self.assertEqual(json_data['commentaries'][0]['passages'][0]['ref'], '1.1.1')
        self.assertIsNotNone(json_data['commentaries'][0]['passages'][0]['content']['sanskrit']['devanagari'])
        self.assertIn('This is a commentary on verse 1.1.1.', json_data['commentaries'][0]['passages'][0]['content']['sanskrit']['devanagari'])
        
        # Check second commentary
        self.assertEqual(json_data['commentaries'][0]['passages'][1]['ref'], '1.1.2')
        self.assertIsNotNone(json_data['commentaries'][0]['passages'][1]['content']['sanskrit']['devanagari'])
        self.assertIn('This is a commentary on verse 1.1.2.', json_data['commentaries'][0]['passages'][1]['content']['sanskrit']['devanagari'])

    def test_split_grantha_commentary_parsing(self):
        md_content = """---
grantha_id: brihadaranyaka-upanishad
canonical_title: बृहदारण्यकोपनिषत्
part_title: Adhyaya 3, Brahmana 1
text_type: upanishad
language: sanskrit
structure_levels:
- key: Adhyaya
  children:
  - key: Brahmana
    children:
    - key: Mantra
---

# Mantra 3.1.1
<!-- sanskrit:devanagari -->
This is the mantra text.
<!-- /sanskrit:devanagari -->

<!-- commentary: {"commentary_id": "ranga-ramanujamuni-prakashika", "passage_ref": "3.1.1"} -->
# Commentary: 3.1.1
<!-- sanskrit:devanagari -->
This is the commentary text.
<!-- /sanskrit:devanagari -->
"""
        json_data = convert_to_json(md_content)

        self.assertEqual(len(json_data['commentaries']), 1)
        self.assertEqual(json_data['commentaries'][0]['commentary_id'], 'ranga-ramanujamuni-prakashika')
        self.assertEqual(len(json_data['commentaries'][0]['passages']), 1)
        self.assertEqual(json_data['commentaries'][0]['passages'][0]['ref'], '3.1.1')
        self.assertIn('This is the commentary text.', json_data['commentaries'][0]['passages'][0]['content']['sanskrit']['devanagari'])

if __name__ == '__main__':
    unittest.main()
