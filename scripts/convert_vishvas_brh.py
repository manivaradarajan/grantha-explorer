import re
import os
import yaml
import hashlib
from typing import Dict, Any, List, Optional

from tools.grantha_converter.hasher import hash_text, normalize_text

def parse_source_file(file_path: str) -> Dict[str, Any]:
    """Parses a source markdown file from granthas/vishvas-brh."""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # print(f"--- Raw content start ---")
    # print(repr(content[:100])) # Print first 100 chars with repr to see hidden chars
    # print(f"--- Raw content end ---")

    # Extract TOML frontmatter
    frontmatter_match = re.match(r'^\s*\+\+\+\s*[\r\n]+(.*?)\s*[\r\n]+\+\+\+\s*[\r\n]*', content, re.DOTALL)
    # print(f"frontmatter_match found: {bool(frontmatter_match)}")
    frontmatter = {}
    body = content
    if frontmatter_match:
        fm_str = frontmatter_match.group(1)
        # Basic TOML parsing for 'title'
        title_match = re.search(r'title\s*=\s*"(.*?)"', fm_str)
        if title_match:
            frontmatter['title'] = title_match.group(1)
        body = content[frontmatter_match.end():].strip()
    return {'frontmatter': frontmatter, 'body': body}

def get_sanskrit_ordinal_adhyaya(num: int) -> str:
    ordinals = {
        1: "प्रथमो",
        2: "द्वितीयो",
        3: "तृतीयो",
        4: "चतुर्थो",
        5: "पञ्चमो",
        6: "षष्ठो",
        7: "सप्तमो",
        8: "अष्टमो",
    }
    return ordinals.get(num, f"{num_to_devanagari(num)}मो") # Fallback for higher numbers

def get_sanskrit_ordinal_brahmana(num: int) -> str:
    ordinals = {
        1: "प्रथमं",
        2: "द्वितीयं",
        3: "तृतीयं",
        4: "चतुर्थं",
        5: "पञ्चमं",
        6: "षष्ठं",
        7: "सप्तमं",
        8: "अष्टमं",
    }
    return ordinals.get(num, f"{num_to_devanagari(num)}मं") # Fallback for higher numbers

def generate_target_frontmatter(source_data: Dict[str, Any], part_num: int, brahmana_num: int, validation_hash: str) -> Dict[str, Any]:
    """Generates the YAML frontmatter for the target markdown file."""
    # Default metadata from reference files
    commentaries_metadata = [
        {
            "commentary_id": "rangaramanuja",
            "commentator": {
                "devanagari": "रङ्गरामानुजमुनिः",
                "latin": "Raṅgarāmānuja Muni"
            },
            "commentary_title": "बृहदारण्यकोपनिषत् प्रकाशिका"
        }
    ]

    structure_levels = [
        {
            "key": str(part_num),
            "scriptNames": {
                "devanagari": f"{get_sanskrit_ordinal_adhyaya(part_num)}ऽध्यायः"
            },
            "children": [
                {
                    "key": str(brahmana_num),
                    "scriptNames": {
                        "devanagari": f"{get_sanskrit_ordinal_brahmana(brahmana_num)} ब्राह्मणम्"
                    }
                }
            ]
        }
    ]

    fm = {
        "grantha_id": "brihadaranyaka-upanishad",
        "part_num": part_num,
        "canonical_title": "बृहदारण्यकोपनिषत्",
        "text_type": "upanishad",
        "language": "sanskrit",
        "scripts": ["devanagari"],
        "structure_levels": structure_levels,
        "commentaries": ["rangaramanuja"],
        "commentaries_metadata": commentaries_metadata,
        "validation_hash": validation_hash,
    }
    return fm

def num_to_devanagari(num: int) -> str:
    """Converts an integer to its Devanagari numeral string."""
    devanagagari_digits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९']
    return ''.join(devanagagari_digits[int(d)] for d in str(num))

def process_body(body_content: str, part_num: int, brahmana_num: int) -> str:
    """Processes the body content to extract mantras and commentaries."""
    structured_body_lines = []

    # Split the entire content into mula and commentary sections based on the "प्रकाशिका" marker
    # Use a flexible regex to account for bolding or other markdown around the marker
    commentary_start_marker_regex = r'(?:\*\*|\s*)प्रकाशिका रङ्गरामानुजमुनिविरचिता(?:\*\*|\s*)'
    parts = re.split(commentary_start_marker_regex, body_content, maxsplit=1)

    mula_and_prefatory_raw = parts[0].strip()
    full_commentary_raw = ""
    if len(parts) > 1: # If the commentary marker was found
        full_commentary_raw = parts[1].strip()

    # --- Process Mula and Prefatory Material ---
    # Find all verse markers (including shanti path style "॥ ॥")
    # This regex will capture "॥ N ॥" or "॥ ॥"
    # We need to be careful to not capture the "॥" from "॥ श्रीः ॥" as a verse marker.
    # Let's assume actual verse markers are "॥ <number> ॥" or "॥ ॥" at the end of a verse.
    
    # Split the mula_and_prefatory_raw by verse markers to delineate mantras
    # This regex captures the verse marker itself as a separator
    mantra_blocks_raw = re.split(r'(॥\s*\d+\s*॥|॥\s*॥)', mula_and_prefatory_raw)

    # The first element of mantra_blocks_raw is usually prefatory material or the start of the first mantra
    prefatory_text = mantra_blocks_raw[0].strip()
    if prefatory_text:
        # Check for specific section titles in prefatory material
        prefatory_sections = re.split(r'(\[.*?\])', prefatory_text)
        if prefatory_sections: # Only add if there's actual content
            structured_body_lines.append("# Prefatory Material")
            for i, section in enumerate(prefatory_sections):
                if section.startswith('['):
                    structured_body_lines.append(f"## {section.strip('[]')}")
                elif section.strip():
                    structured_body_lines.append("<!-- sanskrit:devanagari -->")
                    structured_body_lines.append(section.strip())
                    structured_body_lines.append("<!-- /sanskrit:devanagari -->")
            structured_body_lines.append("\n")

    mantra_counter = 0
    # Iterate through the split blocks, skipping the first (prefatory) and processing pairs of (mantra_text, verse_marker)
    for i in range(1, len(mantra_blocks_raw), 2):
        verse_marker = mantra_blocks_raw[i].strip()
        mantra_text_segment = mantra_blocks_raw[i+1].strip() if i+1 < len(mantra_blocks_raw) else ""

        # Extract mantra number from the verse marker
        explicit_mantra_num_match = re.search(r'(\d+)', verse_marker)
        if explicit_mantra_num_match:
            mantra_num = int(explicit_mantra_num_match.group(1))
        else:
            # If no explicit number (e.g., "॥ ॥" for shanti path), assign sequentially
            mantra_counter += 1
            mantra_num = mantra_counter

        # Combine the verse marker and the text segment as the mula text
        mula_text = f"{verse_marker} {mantra_text_segment}".strip()
        
        # Clean mula text: remove any leading/trailing section titles or "इति" markers
        mula_text = re.sub(r'(\[.*?\])', '', mula_text).strip()
        mula_text = re.sub(r'॥\s*इति.*?॥', '', mula_text).strip()

        structured_body_lines.append(f"# Mantra {part_num}.{brahmana_num}.{mantra_num}")
        structured_body_lines.append("<!-- sanskrit:devanagari -->")
        structured_body_lines.append(mula_text)
        structured_body_lines.append("<!-- /sanskrit:devanagari -->")
        structured_body_lines.append("\n")

    # --- Process Commentary ---
    if full_commentary_raw:
        structured_body_lines.append(f"\n<!-- commentary: {{'commentary_id': 'rangaramanuja', 'passage_ref': 'all'}} -->")
        structured_body_lines.append("## Commentary: रङ्गरामानुजमुनिः")

        # Split commentary by "प्र. -" to delineate individual commentary blocks
        commentary_sub_sections = re.split(r'(\n\s*प्र\.\s*-)', full_commentary_raw)
        
        # The first element might be introductory commentary before the first "प्र. -"
        if commentary_sub_sections[0].strip():
            # Process internal section titles like [मङ्गलाचरणम्]
            intro_commentary_parts = re.split(r'(\[.*?\])', commentary_sub_sections[0].strip())
            for part in intro_commentary_parts:
                if part.startswith('['):
                    structured_body_lines.append(f"### {part.strip('[]')}")
                elif part.strip():
                    structured_body_lines.append(part.strip())
            structured_body_lines.append("\n")

        # Process subsequent "प्र. -" blocks
        for i in range(1, len(commentary_sub_sections), 2):
            # The marker "प्र. -" is at commentary_sub_sections[i]
            # The actual commentary text is at commentary_sub_sections[i+1]
            commentary_text = commentary_sub_sections[i+1].strip() if i+1 < len(commentary_sub_sections) else ""
            if commentary_text:
                # Clean commentary text: remove any leading/trailing section titles or "इति" markers
                commentary_text = re.sub(r'(\[.*?\])', '', commentary_text).strip()
                commentary_text = re.sub(r'॥\s*इति.*?॥', '', commentary_text).strip()
                structured_body_lines.append(f"### Commentary for Mantra {part_num}.{brahmana_num}.{(i+1)//2}") # Placeholder for mantra association
                structured_body_lines.append(commentary_text)
                structured_body_lines.append("\n")

    return "\n".join(structured_body_lines)

def convert_file(input_file_path: str, output_dir: str):
    """Converts a single source file to the target structured markdown format."""
    print(f"Converting {input_file_path}...")
    
    # Extract part_num and brahmana_num from filename (e.g., 03-01.md -> part 3, brahmana 1)
    filename = os.path.basename(input_file_path)
    match = re.match(r'(\d+)-(\d+)\.md', filename)
    if not match:
        print(f"Skipping {filename}: Does not match expected filename pattern 'XX-YY.md'")
        return

    part_num = int(match.group(1))
    brahmana_num = int(match.group(2))

    source_data = parse_source_file(input_file_path)
    
    # Generate body first to calculate hash
    body_content = process_body(source_data['body'], part_num, brahmana_num)
    
    # Calculate validation hash
    # The hash should be calculated on the raw text content of the body, excluding markdown syntax.
    # For this, we need to extract only the actual Sanskrit and commentary text.
    # This is a simplified approach for hashing the body content.
    # A more accurate hash would involve parsing the structured body and using hasher.py's hash_grantha
    # which expects a JSON structure. For now, let's hash the raw text from the body_content.
    
    # Extract text from the generated body for hashing
    # Remove markdown headers, HTML comments, and commentary markers for hashing
    text_for_hashing = body_content
    text_for_hashing = re.sub(r'#+\s*Mantra\s+\d+\.\d+\.\d+', '', text_for_hashing)
    text_for_hashing = re.sub(r'#+\s*Prefatory Material', '', text_for_hashing)
    text_for_hashing = re.sub(r'#+\s*Commentary:.*', '', text_for_hashing)
    text_for_hashing = re.sub(r'<!--.*?-->', '', text_for_hashing, flags=re.DOTALL)
    text_for_hashing = re.sub(r'\[.*?\]', '', text_for_hashing) # Remove [section titles]
    text_for_hashing = re.sub(r'॥\s*इति.*?॥', '', text_for_hashing) # Remove "इति" markers
    text_for_hashing = re.sub(r'प्र\.\s*-', '', text_for_hashing) # Remove "प्र. -"
    
    # Normalize and hash the extracted text
    validation_hash = f"sha256:{hash_text(text_for_hashing)}"

    frontmatter = generate_target_frontmatter(source_data, part_num, brahmana_num, validation_hash)

    # Construct the output markdown
    output_content = "---\n"
    output_content += yaml.dump(frontmatter, sort_keys=False, allow_unicode=True)
    output_content += "---\n\n"
    output_content += body_content.strip()

    # Define output filename (e.g., part3.md)
    output_filename = f"part{part_num}.md"
    output_file_path = os.path.join(output_dir, output_filename)

    os.makedirs(output_dir, exist_ok=True)
    with open(output_file_path, 'w', encoding='utf-8') as f:
        f.write(output_content)
    
    print(f"Successfully converted {filename} to {output_file_path}")
    return output_file_path

def main():
    input_dir = 'granthas/vishvas-brh'
    output_dir = 'granthas/output_vishvas_brh_structured' # New output directory

    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)

    for filename in os.listdir(input_dir):
        if filename.endswith('.md'):
            input_file_path = os.path.join(input_dir, filename)
            convert_file(input_file_path, output_dir)

if __name__ == '__main__':
    main()
