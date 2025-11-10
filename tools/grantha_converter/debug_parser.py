import sys
from pathlib import Path

# Add the parent directory to the sys.path to allow importing grantha_converter
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from grantha_converter.raw_to_structured_md import RawParser

raw_content = """
**यद्वृक्षो वृक्णो रोहति मूलान्नवतरः पुनः ।
मर्त्यः स्विन्मृत्युना वृकण:कस्मान्मूलात् प्ररोहति ।।**

**रेतस इति मां वोचत जीवतस्तत् प्रजायते ।
धानारुह इव वै वृक्षोऽञ्जसा प्रेत्यसम्भवः ।।
यत् समूलमावृहेयुर्वृक्षं न पुनराभवेत् ।
मर्tyस्स्विन्मृत्युना वृक्ण:कस्मान्मूलात् प्ररोहतिजात एव न जायते को न्वेनं जनयेत् पुनः ।
विज्ञानमानन्दं ब्रह्म रातिर्दातुः परायणम् ।।
तिष्ठमानस्य तद्विद इति ।। २८ ।।**
"""
parser_instance = RawParser(grantha_id="test", part_num=1)
parser_instance.debug = True
parser_instance.parse(raw_content)

print(f"\n--- Parser Passages: {parser_instance.passages} ---")