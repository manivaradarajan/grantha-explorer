import re
import yaml
from typing import Any, Dict, List, Tuple

# Regex patterns from the specification
HEADING_MANTRA = re.compile(r'^#+\s+([A-Z][a-z]+)\s+([\d\.]+)$')
HEADING_PREFATORY = re.compile(r'^###\s+PREFATORY:\s+([\d\.]+)\s+\((\w+):\s*\"(.*?)\"\)$')
HEADING_CONCLUDING = re.compile(r'^###\s+CONCLUDING:\s+([\d\.]+)\s+\((\w+):\s*\"(.*?)\"\)$')
HEADING_COMMENTARY = re.compile(r'^###\s+COMMENTARY:\s+([\d\.]+)$')
HEADING_ANY = re.compile(r'^(#+\s+[A-Z][a-z]+\s+[\d\.]+|###\s+(PREFATORY|CONCLUDING|COMMENTARY):\s+.*)$', re.MULTILINE)

def parse_frontmatter(markdown: str) -> Tuple[Dict[str, Any], str]:
    """Parse YAML frontmatter from markdown."""
    match = re.match(r'^---\n(.*?)\n---\n(.*)$', markdown, re.DOTALL)
    if not match:
        raise ValueError("No YAML frontmatter found in markdown")
    frontmatter = yaml.safe_load(match.group(1))
    content = match.group(2).strip()
    return frontmatter, content

def parse_sanskrit_content(content: str) -> Dict[str, Any]:
    """Parse a content block into a dictionary."""
    data = {'sanskrit': {}}
    
    # Regex to find all content blocks with their labels
    pattern = re.compile(r'<!--\s*(.+?)\s*-->\n(.*?)(?=\n<!--|\Z)', re.DOTALL)
    matches = pattern.findall(content)

    for label, text in matches:
        text = text.strip()
        if label == 'sanskrit:devanagari':
            data['sanskrit']['devanagari'] = text
        elif label == 'sanskrit:roman':
            data['sanskrit']['roman'] = text
        elif label == 'sanskrit:kannada':
            data['sanskrit']['kannada'] = text
        elif label == 'english_translation':
            data['english_translation'] = text
        elif label == 'english':
            data['english'] = text
            
    return data

def convert_to_json(markdown: str) -> Dict[str, Any]:
    """Convert Markdown to grantha JSON format using a single-pass strategy."""
    frontmatter, content = parse_frontmatter(markdown)
    commentaries_metadata = frontmatter.get('commentaries_metadata', [])

    data = {
        'grantha_id': frontmatter.get('grantha_id'),
        'part_num': frontmatter.get('part_num'),
        'canonical_title': frontmatter.get('canonical_title'),
        'text_type': frontmatter.get('text_type'),
        'language': frontmatter.get('language'),
        'structure_levels': frontmatter.get('structure_levels'),
        'passages': [],
        'prefatory_material': [],
        'concluding_material': [],
        'commentaries': []
    }

    temp_commentaries = []
    
    # Find all headings and their positions
    headings = list(HEADING_ANY.finditer(content))
    
    for i, match in enumerate(headings):
        start_pos = match.start()
        end_pos = headings[i+1].start() if i + 1 < len(headings) else len(content)
        
        block_content = content[start_pos:end_pos]
        heading_line = block_content.splitlines()[0].strip()
        body_content = '\n'.join(block_content.splitlines()[1:]).strip()

        # Match against our specific heading types
        match_mantra = HEADING_MANTRA.match(heading_line)
        match_prefatory = HEADING_PREFATORY.match(heading_line)
        match_concluding = HEADING_CONCLUDING.match(heading_line)
        match_commentary = HEADING_COMMENTARY.match(heading_line)

        if match_mantra:
            ref = match_mantra.group(2)
            passage = {
                'ref': ref,
                'passage_type': 'main',
                'content': parse_sanskrit_content(body_content)
            }
            if passage['content']['sanskrit'].get('devanagari'):
                data['passages'].append(passage)
        
        elif match_prefatory:
            ref = match_prefatory.group(1)
            script = match_prefatory.group(2)
            label = match_prefatory.group(3)
            passage = {
                'ref': ref,
                'passage_type': 'prefatory',
                'label': {script: label},
                'content': parse_sanskrit_content(body_content)
            }
            data['prefatory_material'].append(passage)

        elif match_concluding:
            ref = match_concluding.group(1)
            script = match_concluding.group(2)
            label = match_concluding.group(3)
            passage = {
                'ref': ref,
                'passage_type': 'concluding',
                'label': {script: label},
                'content': parse_sanskrit_content(body_content)
            }
            data['concluding_material'].append(passage)

        elif match_commentary:
            ref = match_commentary.group(1)
            temp_commentaries.append({
                'ref': ref,
                'content': parse_sanskrit_content(body_content)
            })

    # Process and group commentaries
    if temp_commentaries and commentaries_metadata:
        for commentary_data in commentaries_metadata:
            commentary_id = commentary_data.get("commentary_id")
            commentary_obj = {
                "commentary_id": commentary_id,
                "commentary_title": commentary_data.get("commentary_title"),
                "commentator": commentary_data.get("commentator"),
                "passages": temp_commentaries
            }
            data['commentaries'].append(commentary_obj)

    return data
