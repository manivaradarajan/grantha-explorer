"""Markdown to JSON converter for grantha data.

This module converts Markdown files back to grantha JSON format by:
- Parsing YAML frontmatter
- Recursively parsing nested headers to rebuild hierarchy
- Extracting HTML comment metadata
- Validating hash to ensure lossless conversion
"""

import json
import re
from typing import Any, Dict, List, Optional, Tuple
import yaml

from .hasher import hash_grantha


def parse_frontmatter(markdown: str) -> Tuple[Dict[str, Any], str]:
    """Parse YAML frontmatter from markdown.

    Args:
        markdown: Full markdown string

    Returns:
        Tuple of (frontmatter dict, content without frontmatter)
    """
    # Match YAML frontmatter between --- delimiters
    pattern = r'^---\n(.*?)\n---\n(.*)$'
    match = re.match(pattern, markdown, re.DOTALL)

    if not match:
        raise ValueError("No YAML frontmatter found in markdown")

    frontmatter_yaml = match.group(1)
    content = match.group(2)

    frontmatter = yaml.safe_load(frontmatter_yaml)

    return frontmatter, content


def extract_html_comments(text: str) -> Dict[str, Any]:
    """Extract metadata from HTML comments.

    Args:
        text: Text containing HTML comments with JSON data

    Returns:
        Dictionary of extracted metadata
    """
    metadata = {}
    pattern = r'<!--\s*(\w+):\s*({.*?})\s*-->'

    for match in re.finditer(pattern, text, re.DOTALL):
        key = match.group(1)
        json_str = match.group(2)
        try:
            metadata[key] = json.loads(json_str)
        except json.JSONDecodeError:
            # Skip malformed JSON
            pass

    return metadata


def parse_content_block(text: str, scripts: List[str]) -> Dict[str, Any]:
    """Parse content block from markdown format.

    Supports both old format (**Label:** text) and new format (<!-- label --> text).

    Args:
        text: Markdown content block
        scripts: List of scripts that were included

    Returns:
        Content dict with sanskrit/english fields
    """
    content: Dict[str, Any] = {
        'sanskrit': {
            'devanagari': None,
            'roman': None,
            'kannada': None
        },
        'english_translation': None
    }

    # Parse content - handle multi-line values
    lines = text.strip().split('\n')
    i = 0
    current_field = None
    current_value = []

    while i < len(lines):
        line = lines[i]

        # Check for new HTML comment format
        if line.strip().startswith('<!-- sanskrit:devanagari -->'):
            if current_field and current_value:
                _save_field(content, current_field, current_value)
            current_field = ('sanskrit', 'devanagari')
            current_value = []

        elif line.strip().startswith('<!-- sanskrit:roman -->'):
            if current_field and current_value:
                _save_field(content, current_field, current_value)
            current_field = ('sanskrit', 'roman')
            current_value = []

        elif line.strip().startswith('<!-- sanskrit:kannada -->'):
            if current_field and current_value:
                _save_field(content, current_field, current_value)
            current_field = ('sanskrit', 'kannada')
            current_value = []

        elif line.strip().startswith('<!-- english_translation -->'):
            if current_field and current_value:
                _save_field(content, current_field, current_value)
            current_field = ('english_translation',)
            current_value = []

        elif line.strip().startswith('<!-- english -->'):
            if current_field and current_value:
                _save_field(content, current_field, current_value)
            current_field = ('english',)
            current_value = []

        # Check for old bold format (backward compatibility)
        elif line.startswith('**Sanskrit (Devanagari):**'):
            if current_field and current_value:
                _save_field(content, current_field, current_value)
            current_field = ('sanskrit', 'devanagari')
            current_value = [line.replace('**Sanskrit (Devanagari):**', '').strip()]

        elif line.startswith('**Sanskrit (Roman):**'):
            if current_field and current_value:
                _save_field(content, current_field, current_value)
            current_field = ('sanskrit', 'roman')
            current_value = [line.replace('**Sanskrit (Roman):**', '').strip()]

        elif line.startswith('**Sanskrit (Kannada):**'):
            if current_field and current_value:
                _save_field(content, current_field, current_value)
            current_field = ('sanskrit', 'kannada')
            current_value = [line.replace('**Sanskrit (Kannada):**', '').strip()]

        elif line.startswith('**English Translation:**'):
            if current_field and current_value:
                _save_field(content, current_field, current_value)
            current_field = ('english_translation',)
            current_value = [line.replace('**English Translation:**', '').strip()]

        elif line.startswith('**English:**'):
            if current_field and current_value:
                _save_field(content, current_field, current_value)
            current_field = ('english',)
            current_value = [line.replace('**English:**', '').strip()]

        elif line.strip() and current_field and not line.strip().startswith('<!--'):
            # Continuation of current field (not a comment)
            current_value.append(line)

        i += 1

    # Save the last field
    if current_field and current_value:
        _save_field(content, current_field, current_value)

    return content


def _save_field(content: Dict[str, Any], field: tuple, value: List[str]):
    """Helper to save field value to content dict."""
    if len(field) == 2:
        content[field[0]][field[1]] = '\n'.join(value)
    else:
        content[field[0]] = '\n'.join(value)


def parse_passages_recursive(lines: List[str],
                               structure_levels: List[Dict[str, Any]],
                               scripts: List[str],
                               start_idx: int = 0,
                               depth: int = 0,
                               ref_prefix: str = "") -> Tuple[List[Dict[str, Any]], int]:
    """Recursively parse passages from markdown lines.

    Args:
        lines: All markdown lines
        structure_levels: Structure definition from frontmatter
        scripts: Scripts that were included
        start_idx: Starting line index
        depth: Current depth level (0-indexed)
        ref_prefix: Reference prefix for current level

    Returns:
        Tuple of (list of passages, next line index to process)
    """
    passages = []
    i = start_idx

    # Determine expected header level for this depth
    expected_header_level = depth + 1
    header_prefix = '#' * expected_header_level + ' '

    while i < len(lines):
        line = lines[i].strip()

        # Check if this is a header at our level
        if line.startswith(header_prefix) and not line.startswith('#' * (expected_header_level + 1)):
            # Extract passage number from header
            # Format: "Level 1.2.3"
            header_text = line[len(header_prefix):].strip()
            parts = header_text.split()
            if len(parts) >= 2:
                full_ref = parts[-1]  # Last part is the full reference (e.g., "1.1.1")

                # Collect content lines until next header or deeper header
                content_lines = []
                has_children = False
                i += 1

                while i < len(lines):
                    next_line = lines[i].strip()

                    # Check if we hit a header at our level or higher (shallower)
                    if next_line.startswith('#'):
                        # Count header level
                        next_level = len(next_line) - len(next_line.lstrip('#'))

                        if next_level <= expected_header_level:
                            # Same level or higher (shallower) - stop collecting
                            break
                        elif next_level == expected_header_level + 1:
                            # Deeper level - recursively parse children
                            has_children = True
                            child_passages, next_idx = parse_passages_recursive(
                                lines,
                                structure_levels,
                                scripts,
                                i,
                                depth + 1,
                                ""  # Don't use prefix - children have full refs in headers
                            )
                            passages.extend(child_passages)
                            i = next_idx
                            continue  # Don't break - there might be more children

                    content_lines.append(lines[i])
                    i += 1

                # Only create passage if we collected content (not just an intermediate level)
                if content_lines and not has_children:
                    content_text = '\n'.join(content_lines)
                    content = parse_content_block(content_text, scripts)

                    # Check if content is not empty
                    has_content = False
                    if content.get('english_translation'):
                        has_content = True
                    if content.get('sanskrit'):
                        for script in ['devanagari', 'roman', 'kannada']:
                            if content['sanskrit'].get(script):
                                has_content = True
                                break

                    if has_content:
                        passage = {
                            'ref': full_ref,  # Use the full ref from header
                            'passage_type': 'main',
                            'content': content
                        }
                        passages.append(passage)
            else:
                i += 1
        elif line.startswith('#') and not line.startswith(header_prefix):
            # Hit a different level header - return
            break
        else:
            i += 1

    return passages, i


def parse_prefatory_material(content: str, scripts: List[str]) -> List[Dict[str, Any]]:
    """Parse prefatory material section from markdown.

    Args:
        content: Markdown content for prefatory section
        scripts: Scripts that were included

    Returns:
        List of prefatory material items
    """
    items = []

    # Extract HTML comments for metadata
    metadata_map = extract_html_comments(content)

    # Split by ## headers
    sections = re.split(r'\n##\s+', content)

    for i, section in enumerate(sections[1:]):  # Skip first (before any ##)
        lines = section.split('\n')
        label_text = lines[0].strip()

        # Get label metadata from HTML comment if available
        comment_key = f"prefatory_item_{i}"
        if comment_key in metadata_map:
            label = metadata_map[comment_key]
        else:
            # Fallback to just using the text
            label = {'devanagari': label_text}

        # Parse content
        content_text = '\n'.join(lines[1:])
        content_dict = parse_content_block(content_text, scripts)

        item = {
            'label': label,
            'content': content_dict
        }
        items.append(item)

    return items


def parse_concluding_material(content: str, scripts: List[str]) -> List[Dict[str, Any]]:
    """Parse concluding material section from markdown.

    Args:
        content: Markdown content for concluding section
        scripts: Scripts that were included

    Returns:
        List of concluding material items
    """
    # Same logic as prefatory material
    items = []

    # Extract HTML comments for metadata
    metadata_map = extract_html_comments(content)

    # Split by ## headers
    sections = re.split(r'\n##\s+', content)

    for i, section in enumerate(sections[1:]):  # Skip first (before any ##)
        lines = section.split('\n')
        label_text = lines[0].strip()

        # Get label metadata from HTML comment if available
        comment_key = f"concluding_item_{i}"
        if comment_key in metadata_map:
            label = metadata_map[comment_key]
        else:
            # Fallback to just using the text
            label = {'devanagari': label_text}

        # Parse content
        content_text = '\n'.join(lines[1:])
        content_dict = parse_content_block(content_text, scripts)

        item = {
            'label': label,
            'content': content_dict
        }
        items.append(item)

    return items


def parse_commentaries(content: str, scripts: List[str]) -> List[Dict[str, Any]]:
    """Parse commentary sections from markdown.

    Args:
        content: Markdown content containing commentaries
        scripts: Scripts that were included

    Returns:
        List of commentary data
    """
    commentaries = []

    # Extract HTML comments for metadata
    metadata_map = extract_html_comments(content)

    # Split by # Commentary: headers
    sections = re.split(r'\n#\s+Commentary:\s+', content)

    for section in sections[1:]:  # Skip first (before any commentary)
        lines = section.split('\n')

        # Get commentary metadata from HTML comment
        commentary_meta = None
        for key, value in metadata_map.items():
            if key == 'commentary_metadata':
                commentary_meta = value
                break

        if not commentary_meta:
            # Skip if no metadata found
            continue

        commentary = {
            'commentary_id': commentary_meta['commentary_id'],
            'commentator': commentary_meta['commentator'],
            'passages': []
        }

        if 'commentary_title' in commentary_meta and commentary_meta['commentary_title']:
            commentary['commentary_title'] = commentary_meta['commentary_title']

        if 'metadata' in commentary_meta:
            commentary['metadata'] = commentary_meta['metadata']

        # Parse passages within commentary
        # Split by ## Commentary on Passage headers
        passage_sections = re.split(r'\n##\s+Commentary on Passage\s+', '\n'.join(lines))

        for pass_section in passage_sections[1:]:
            pass_lines = pass_section.split('\n')
            ref = pass_lines[0].strip()

            # Check for prefatory material in this passage
            prefatory_material = []

            # Parse content
            content_text = '\n'.join(pass_lines[1:])

            # Look for ### headers (prefatory material)
            if '###' in content_text:
                # Split by ### headers
                subsections = re.split(r'\n###\s+', content_text)

                # First subsection is before any prefatory material
                main_content_text = subsections[0]

                # Rest are prefatory items
                for i, subsection in enumerate(subsections[1:]):
                    sub_lines = subsection.split('\n')
                    label = sub_lines[0].strip()

                    # Get metadata from HTML comment if available
                    pref_key = f"commentary_prefatory_{ref}_{i}"
                    if pref_key in metadata_map:
                        pref_meta = metadata_map[pref_key]
                        item = {
                            'type': pref_meta.get('type', ''),
                            'label': pref_meta.get('label', label),
                            'content': parse_content_block('\n'.join(sub_lines[1:]), scripts)
                        }
                    else:
                        item = {
                            'type': 'commentary_intro',
                            'label': label,
                            'content': parse_content_block('\n'.join(sub_lines[1:]), scripts)
                        }

                    prefatory_material.append(item)
            else:
                main_content_text = content_text

            passage_data = {
                'ref': ref,
                'content': parse_content_block(main_content_text, scripts)
            }

            if prefatory_material:
                passage_data['prefatory_material'] = prefatory_material

            commentary['passages'].append(passage_data)

        commentaries.append(commentary)

    return commentaries


def convert_to_json(markdown: str) -> Dict[str, Any]:
    """Convert Markdown to grantha JSON format.

    Args:
        markdown: Full markdown string with frontmatter

    Returns:
        Grantha JSON data dict

    Raises:
        ValueError: If validation hash doesn't match
    """
    # Parse frontmatter
    frontmatter, content = parse_frontmatter(markdown)

    # Extract scripts used
    scripts = frontmatter.get('scripts', ['devanagari'])

    # Build JSON structure from frontmatter
    data: Dict[str, Any] = {
        'grantha_id': frontmatter['grantha_id'],
        'canonical_title': frontmatter['canonical_title'],
        'text_type': frontmatter['text_type'],
        'language': frontmatter['language'],
        'structure_levels': frontmatter['structure_levels'],
    }

    # Add optional fields
    if 'aliases' in frontmatter:
        data['aliases'] = frontmatter['aliases']

    if 'variants_available' in frontmatter:
        data['variants_available'] = frontmatter['variants_available']

    if 'metadata' in frontmatter:
        data['metadata'] = frontmatter['metadata']

    # Parse content sections
    # Find all top-level section boundaries
    lines = content.split('\n')
    i = 0

    while i < len(lines):
        line = lines[i].strip()

        if line.startswith('# Prefatory Material'):
            # Find end of this section (next # or end)
            section_start = i + 1
            section_end = i + 1
            while section_end < len(lines) and not lines[section_end].strip().startswith('# '):
                section_end += 1

            section_content = '\n'.join(lines[section_start:section_end])
            data['prefatory_material'] = parse_prefatory_material(section_content, scripts)
            i = section_end

        elif line.startswith('# Concluding Material'):
            # Find end of this section
            section_start = i + 1
            section_end = i + 1
            while section_end < len(lines) and not lines[section_end].strip().startswith('# '):
                section_end += 1

            section_content = '\n'.join(lines[section_start:section_end])
            data['concluding_material'] = parse_concluding_material(section_content, scripts)
            i = section_end

        elif line.startswith('# Commentary:'):
            # Find end of commentaries section (end of file usually)
            section_start = i
            section_end = len(lines)

            commentary_content = '\n'.join(lines[section_start:section_end])
            data['commentaries'] = parse_commentaries(commentary_content, scripts)
            i = section_end

        elif line.startswith('# '):
            # This is main passage content - parse all until we hit Prefatory/Concluding/Commentary
            section_start = i
            section_end = i + 1

            while section_end < len(lines):
                next_line = lines[section_end].strip()
                if (next_line.startswith('# Prefatory Material') or
                    next_line.startswith('# Concluding Material') or
                    next_line.startswith('# Commentary:')):
                    break
                section_end += 1

            # Parse passages from this section
            passage_lines = lines[section_start:section_end]
            passages, _ = parse_passages_recursive(
                passage_lines,
                data['structure_levels'],
                scripts,
                0,  # start at line 0
                0,  # depth 0
                ""  # no ref prefix
            )
            if passages:
                data['passages'] = passages

            i = section_end
        else:
            i += 1

    # Validate hash
    expected_hash = frontmatter.get('validation_hash', '').replace('sha256:', '')
    commentaries = frontmatter.get('commentaries', None)
    actual_hash = hash_grantha(data, scripts=scripts, commentaries=commentaries)

    if expected_hash and expected_hash != actual_hash:
        raise ValueError(
            f"Validation hash mismatch! Expected: {expected_hash}, Got: {actual_hash}. "
            f"This indicates data loss or corruption during conversion."
        )

    return data


def markdown_file_to_json_file(input_path: str, output_path: str) -> None:
    """Convert Markdown file to JSON file.

    Args:
        input_path: Path to input Markdown file
        output_path: Path to output JSON file
    """
    with open(input_path, 'r', encoding='utf-8') as f:
        markdown = f.read()

    data = convert_to_json(markdown)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
