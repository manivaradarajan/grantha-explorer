"""Markdown to JSON converter for grantha data.

This module converts Markdown files back to grantha JSON format by:
- Parsing YAML frontmatter
- Using a two-pass approach to parse commentaries and then other content.
"""

import json
import re
from typing import Any, Dict, List, Tuple
import yaml

def parse_frontmatter(markdown: str) -> Tuple[Dict[str, Any], str]:
    """Parse YAML frontmatter from markdown."""
    match = re.match(r'^---\n(.*?)\n---\n(.*)$', markdown, re.DOTALL)
    if not match:
        raise ValueError("No YAML frontmatter found in markdown")
    frontmatter = yaml.safe_load(match.group(1))
    content = match.group(2).strip()
    return frontmatter, content

def extract_html_comments(text: str) -> Dict[str, Any]:
    """Extract metadata from HTML comments."""
    metadata = {}
    pattern = r'<!--\s*(\w+):\s*({.*?})\s*-->'
    for match in re.finditer(pattern, text, re.DOTALL):
        key = match.group(1)
        json_str = match.group(2)
        try:
            metadata[key] = json.loads(json_str)
        except json.JSONDecodeError:
            pass
    return metadata

def parse_content_block(text: str) -> Dict[str, Any]:
    """Parse a content block into different script versions."""
    content = {
        'sanskrit': {'devanagari': None, 'roman': None, 'kannada': None},
        'english_translation': None
    }
    lines = text.strip().split('\n')
    current_field = None
    current_value = []

    for line in lines:
        stripped_line = line.strip()
        if stripped_line.startswith('<!-- sanskrit:devanagari -->'):
            current_field = ('sanskrit', 'devanagari')
            current_value = []
        elif stripped_line.startswith('<!-- sanskrit:roman -->'):
            current_field = ('sanskrit', 'roman')
            current_value = []
        elif stripped_line.startswith('<!-- sanskrit:kannada -->'):
            current_field = ('sanskrit', 'kannada')
            current_value = []
        elif stripped_line.startswith('<!-- english_translation -->'):
            current_field = ('english_translation',)
            current_value = []
        elif stripped_line.startswith('<!-- /sanskrit') or stripped_line.startswith('<!-- /english'):
            if current_field:
                if len(current_field) == 2:
                    content[current_field[0]][current_field[1]] = '\n'.join(current_value).strip()
                else:
                    content[current_field[0]] = '\n'.join(current_value).strip()
            current_field = None
            current_value = []
        elif current_field:
            current_value.append(line)
    return content

def convert_to_json(markdown: str) -> Dict[str, Any]:
    """Convert Markdown to grantha JSON format."""
    frontmatter, content = parse_frontmatter(markdown)

    data = {
        'grantha_id': frontmatter.get('grantha_id'),
        'canonical_title': frontmatter.get('canonical_title'),
        'text_type': frontmatter.get('text_type'),
        'language': frontmatter.get('language'),
        'structure_levels': frontmatter.get('structure_levels'),
        'aliases': frontmatter.get('aliases', []),
        'variants_available': frontmatter.get('variants_available', []),
        'metadata': frontmatter.get('metadata', {}),
        'passages': [],
        'prefatory_material': [],
        'concluding_material': [],
        'commentaries': []
    }
    commentaries_map = {}
    remaining_content = content

    # Pass 1: Extract and parse commentaries
    commentary_pattern = re.compile(
        r'(<!--\s*commentary:\s*{.*?}\s*-->\s*#\s*Commentary:.*?)(?=\n#\s|\Z)',
        re.DOTALL
    )

    matches = list(commentary_pattern.finditer(content))
    for match in matches:
        commentary_block = match.group(0)
        remaining_content = remaining_content.replace(commentary_block, '')

        lines = commentary_block.strip().split('\n')
        header_index = next((i for i, line in enumerate(lines) if line.strip().startswith('# Commentary:')), -1)

        if header_index == -1: continue

        comment_text = '\n'.join(lines[:header_index])
        header_line = lines[header_index]
        content_text = '\n'.join(lines[header_index+1:])

        comment_meta = extract_html_comments(comment_text).get('commentary', {})
        commentary_id = comment_meta.get('commentary_id')

        try:
            passage_ref = header_line.split(':', 1)[1].strip()
        except IndexError:
            continue

        if commentary_id and passage_ref:
            if commentary_id not in commentaries_map:
                commentaries_map[commentary_id] = {'commentary_id': commentary_id, 'passages': []}

            commentaries_map[commentary_id]['passages'].append({
                'ref': passage_ref,
                'content': parse_content_block(content_text)
            })

    data['commentaries'] = list(commentaries_map.values())

    # Pass 2: Parse remaining content
    sections = re.split(r'(?=\n#\s)', '\n' + remaining_content.strip())
    for section_text in sections:
        if not section_text.strip():
            continue

        lines = section_text.strip().split('\n')
        header_text = lines[0].lstrip('# ').strip()
        content_text = '\n'.join(lines[1:])

        if header_text.lower().startswith(('prefatory', 'shanti')):
            data['prefatory_material'].append({
                'label': {'devanagari': header_text},
                'content': parse_content_block(content_text)
            })
        elif header_text.lower().startswith('concluding'):
            data['concluding_material'].append({
                'label': {'devanagari': header_text},
                'content': parse_content_block(content_text)
            })
        else:
            ref_match = re.search(r'[\d\.]+$', header_text)
            if ref_match:
                data['passages'].append({
                    'ref': ref_match.group(0),
                    'passage_type': 'main',
                    'content': parse_content_block(content_text)
                })

    return data

def markdown_file_to_json_file(input_path: str, output_path: str) -> None:
    """Convert Markdown file to JSON file."""
    with open(input_path, 'r', encoding='utf-8') as f:
        markdown = f.read()
    data = convert_to_json(markdown)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
