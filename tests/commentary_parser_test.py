import unittest
import sys
import os

# Add the project root to the Python path
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

from tools.grantha_converter.md_to_json import convert_to_json

class TestCommentaryMetadata(unittest.TestCase):

    def test_merge_frontmatter_metadata(self):
        markdown_content = """---
grantha_id: test-grantha
commentaries_metadata:
  test-commentary:
    commentary_title: "Test Title"
    commentator:
      devanagari: "Test Commentator"
---
<!-- commentary: {"commentary_id": "test-commentary", "passage_ref": "1.1"} -->
# Commentary: 1.1
<!-- sanskrit:devanagari -->
Some commentary text.
<!-- /sanskrit:devanagari -->
"""
        
        json_data = convert_to_json(markdown_content)
        
        self.assertEqual(len(json_data['commentaries']), 1)
        commentary = json_data['commentaries'][0]
        
        self.assertEqual(commentary['commentary_title'], "Test Title")
        self.assertEqual(commentary['commentator']['devanagari'], "Test Commentator")
        self.assertEqual(commentary['passages'][0]['ref'], "1.1")

if __name__ == '__main__':
    unittest.main()
