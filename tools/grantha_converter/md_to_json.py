import re
import yaml
from typing import Any, Dict, List, Tuple

# Regex patterns from the specification
HEADING_MANTRA = re.compile(r'^#\s+(?:Mantra|Valli|Khanda|Anuvaka)\s+([\d\.]+)$')
HEADING_PREFATORY = re.compile(r'^#\s+Prefatory:\s+([\d\.]+)\s+\((\w+):\s*\"(.*?)\"\)$', re.IGNORECASE | re.MULTILINE)
HEADING_CONCLUDING = re.compile(r'^#\s+Concluding:\s+([\d\.]+)\s+\((\w+):\s*\"(.*?)\"\)$', re.IGNORECASE | re.MULTILINE)
HEADING_COMMENTARY = re.compile(r'^#\s+Commentary:\s+([\d\.]+)$', re.IGNORECASE | re.MULTILINE)
COMMENTARY_METADATA = re.compile(r'<!--\s*commentary:\s*({.*?})\s*-->')
HEADING_ANY = re.compile(r'^#\s+.*$', re.MULTILINE)

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
    data = {}
    sanskrit_data = {}
    
    # Find all metadata comments and their positions
    matches = list(re.finditer(r'<!--\s*(.+?)\s*-->', content))
    
    for i, match in enumerate(matches):
        label = match.group(1).strip()
        start_pos = match.end()
        end_pos = matches[i+1].start() if i + 1 < len(matches) else len(content)
        
        text = content[start_pos:end_pos].strip()

        if label == 'sanskrit:devanagari':
            sanskrit_data['devanagari'] = text
        elif label == 'sanskrit:roman':
            sanskrit_data['roman'] = text
        elif label == 'sanskrit:kannada':
            sanskrit_data['kannada'] = text
        elif label == 'english_translation':
            data['english_translation'] = text
        elif label == 'english':
            data['english'] = text
    
    if sanskrit_data:
        data['sanskrit'] = sanskrit_data
            
    return data

def get_lowest_level_key(structure_levels: List[Dict[str, Any]]) -> str:
    """Recursively get the lowest 'key' value from structure_levels."""
    if not structure_levels:
        return 'Mantra' # Default if none
    
    last_level = structure_levels[-1]
    if 'children' in last_level and last_level['children']:
        return get_lowest_level_key(last_level['children'])
    else:
        return last_level['key']

def get_all_structure_keys(structure_levels: List[Dict[str, Any]]) -> List[str]:
    """Recursively get all 'key' values from structure_levels."""
    keys = []
    for level in structure_levels:
        keys.append(level['key'])
        if 'children' in level and level['children']:
            keys.extend(get_all_structure_keys(level['children']))
    return keys

def convert_to_json(markdown: str) -> Dict[str, Any]:
    """Convert Markdown to grantha JSON format using a single-pass strategy."""
    frontmatter, content = parse_frontmatter(markdown)
    commentaries_metadata = frontmatter.get('commentaries_metadata', {})

    # Dynamically build the regex for main content headings
    structure_levels = frontmatter.get('structure_levels', [])
    structure_keys = get_all_structure_keys(structure_levels)
    lowest_level_key = get_lowest_level_key(structure_levels)
    
    heading_structure_pattern = r'^#\s+(' + '|'.join(re.escape(key) for key in structure_keys) + r')\s+([\d\.]+)$'
    HEADING_STRUCTURE = re.compile(heading_structure_pattern, re.MULTILINE)

    data = {
        'grantha_id': frontmatter.get('grantha_id'),
        'part_num': frontmatter.get('part_num'),
        'canonical_title': frontmatter.get('canonical_title'),
        'text_type': frontmatter.get('text_type'),
        'language': frontmatter.get('language'),
        'structure_levels': structure_levels,
        'passages': [],
        'prefatory_material': [],
        'concluding_material': [],
        'commentaries': {cid: {"commentary_id": cid, **meta, "passages": []} for cid, meta in commentaries_metadata.items()}
    }

    all_headings = sorted(
        list(HEADING_STRUCTURE.finditer(content)) +
        list(HEADING_PREFATORY.finditer(content)) +
        list(HEADING_CONCLUDING.finditer(content)) +
        list(HEADING_COMMENTARY.finditer(content)),
        key=lambda m: m.start()
    )

    for i, match in enumerate(all_headings):
        start_pos = match.end()
        end_pos = all_headings[i+1].start() if i + 1 < len(all_headings) else len(content)
        
        heading_line = match.group(0).strip()
        body_content = content[start_pos:end_pos].strip()

        # Determine which type of heading this is based on the matched pattern
        # Re-match to know which group is which
        match_prefatory = HEADING_PREFATORY.match(heading_line)
        match_concluding = HEADING_CONCLUDING.match(heading_line)
        match_commentary = HEADING_COMMENTARY.match(heading_line)
        match_structure = HEADING_STRUCTURE.match(heading_line)

        if match_prefatory:
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
            meta_match = COMMENTARY_METADATA.search(body_content)
            if meta_match:
                try:
                    import json
                    meta_json = json.loads(meta_match.group(1))
                    commentary_id = meta_json.get('commentary_id')

                    if commentary_id in data['commentaries']:
                        body_content = body_content.replace(meta_match.group(0), '').strip()
                        commentary_passage = {
                            'ref': ref,
                            'content': parse_sanskrit_content(body_content)
                        }
                        data['commentaries'][commentary_id]['passages'].append(commentary_passage)
                except (json.JSONDecodeError, yaml.YAMLError):
                    pass
        
        elif match_structure:
            key = match_structure.group(1)
            ref = match_structure.group(2)
            if key == lowest_level_key:
                passage = {
                    'ref': ref,
                    'passage_type': 'main',
                    'content': parse_sanskrit_content(body_content)
                }
                if passage['content']:
                    data['passages'].append(passage)

    data['commentaries'] = [c for c in data['commentaries'].values() if c['passages']]
    return data
