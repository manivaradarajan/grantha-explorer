"""JSON to Markdown converter for grantha data.

This module converts grantha JSON files to Markdown format with:
- Nested headers reflecting arbitrary-depth hierarchies
- YAML frontmatter with metadata and validation hash
- Selective commentary inclusion
- Configurable script output
"""

import json
from typing import Any, Dict, List, Optional, Tuple
import yaml

from .hasher import hash_grantha, extract_content_text


def get_lowest_level_key(structure_levels: List[Dict[str, Any]]) -> str:
    """Recursively get the lowest 'key' value from structure_levels."""
    if not structure_levels:
        return 'Mantra'  # Default if none

    last_level = structure_levels[-1]
    if 'children' in last_level and last_level['children']:
        return get_lowest_level_key(last_level['children'])
    else:
        return last_level['key']


def build_hierarchy_tree(structure_levels: List[Dict[str, Any]],
                         passages: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Build a hierarchical tree structure from flat passage list.

    Args:
        structure_levels: Structure definition from JSON
        passages: Flat list of passages with refs like "1.2.3"

    Returns:
        Nested dictionary tree with passages organized by hierarchy
    """
    tree: Dict[str, Any] = {}

    for passage in passages:
        ref = passage['ref']
        parts = ref.split('.')

        # Navigate/create tree structure
        current = tree
        for i, part in enumerate(parts):
            if part not in current:
                current[part] = {'_passages': [], '_children': {}}
            if i == len(parts) - 1:
                # Leaf node - add passage
                current[part]['_passages'].append(passage)
            else:
                # Intermediate node - continue traversal
                current = current[part]['_children']

    return tree


def get_header_level_name(structure_levels: List[Dict[str, Any]], depth: int) -> str:
    """Get the name for a header at given depth.

    Args:
        structure_levels: Structure definition from JSON
        depth: 0-indexed depth level

    Returns:
        Name of the level (e.g., "Mundaka", "Khanda", "Mantra")
    """
    if not structure_levels:
        return "Mantra"

    # Start at the root level
    current = structure_levels[0]

    # Navigate down the hierarchy to the target depth
    for i in range(depth):
        if 'children' in current and current['children']:
            current = current['children'][0]
        else:
            # Reached a leaf before target depth
            return current['key']

    return current['key']


def format_content(content: Dict[str, Any],
                   scripts: List[str],
                   indent: str = "") -> str:
    """Format content dict as markdown with field labels in HTML comments.

    Args:
        content: Content dict with sanskrit/english fields
        scripts: List of scripts to include
        indent: Indentation prefix for each line

    Returns:
        Formatted markdown string
    """
    lines = []

    # Add Sanskrit text in requested scripts
    if 'sanskrit' in content:
        sanskrit = content['sanskrit']

        if 'devanagari' in scripts and sanskrit.get('devanagari'):
            lines.append(f"{indent}<!-- sanskrit:devanagari -->")
            lines.append(f"{indent}{sanskrit['devanagari']}")

        if 'roman' in scripts and sanskrit.get('roman'):
            lines.append(f"{indent}<!-- sanskrit:roman -->")
            lines.append(f"{indent}{sanskrit['roman']}")

        if 'kannada' in scripts and sanskrit.get('kannada'):
            lines.append(f"{indent}<!-- sanskrit:kannada -->")
            lines.append(f"{indent}{sanskrit['kannada']}")

    # Add English translation
    if 'english_translation' in content and content['english_translation']:
        lines.append(f"{indent}<!-- english_translation -->")
        lines.append(f"{indent}{content['english_translation']}")

    # Add English (for commentary)
    if 'english' in content and content['english']:
        lines.append(f"{indent}<!-- english -->")
        lines.append(f"{indent}{content['english']}")

    return '\n'.join(lines)


def write_tree_to_markdown(tree: Dict[str, Any],
                           structure_levels: List[Dict[str, Any]],
                           scripts: List[str],
                           commentary_map: Dict[str, List[Dict[str, Any]]] = None,
                           depth: int = 0,
                           ref_prefix: str = "") -> str:
    """Recursively write hierarchy tree to markdown with interleaved commentaries.

    Args:
        tree: Hierarchical tree of passages
        structure_levels: Structure definition from JSON
        scripts: Scripts to include
        commentary_map: Map of passage ref -> list of commentary data for that passage
        depth: Current depth level (0-indexed)
        ref_prefix: Reference prefix for current level

    Returns:
        Markdown string for this subtree
    """
    lines = []
    if commentary_map is None:
        commentary_map = {}

    # Get level name for headers
    level_name = get_header_level_name(structure_levels, depth)
    lowest_level_key = get_lowest_level_key(structure_levels)

    # Sort keys numerically
    sorted_keys = sorted(tree.keys(), key=lambda x: int(x) if x.isdigit() else x)

    for key in sorted_keys:
        node = tree[key]
        current_ref = f"{ref_prefix}{key}" if ref_prefix else key

        # Write header for this level
        header_level = 1 if level_name == lowest_level_key else depth + 1
        header_prefix = '#' * header_level
        header_text = f"{level_name} {current_ref}"
        lines.append(f"{header_prefix} {header_text}\n")
        
        # Write passages at this level
        for passage in node.get('_passages', []):
            content_md = format_content(passage['content'], scripts)
            if content_md:
                lines.append(content_md)
                lines.append("")  # Blank line after passage

            # Write commentaries for this passage (interleaved!)
            passage_ref = passage['ref']
            if passage_ref in commentary_map:
                for comm_data in commentary_map[passage_ref]:
                    # Add metadata comment for reconstruction
                    comm_metadata = {
                        'commentary_id': comm_data['commentary_id']
                    }
                    lines.append(f"<!-- commentary: {json.dumps(comm_metadata, ensure_ascii=False)} -->")

                    # Commentary header (one level deeper than passage)
                    comm_header_level = header_level + 1
                    comm_header_prefix = '#' * comm_header_level
                    commentator_name = comm_data['commentator_name']
                    lines.append(f"{comm_header_prefix} Commentary: {commentator_name}\n")

                    # Prefatory material in commentary
                    if 'prefatory_material' in comm_data:
                        for i, item in enumerate(comm_data['prefatory_material']):
                            # Preserve metadata
                            pref_meta = {
                                'type': item.get('type', ''),
                                'label': item.get('label', '')
                            }
                            lines.append(f"<!-- commentary_prefatory_{passage_ref}_{i}: {json.dumps(pref_meta, ensure_ascii=False)} -->")

                            label = item.get('label', item.get('type', ''))
                            lines.append(f"{'#' * (comm_header_level + 1)} {label}\n")
                            content_md = format_content(item['content'], scripts)
                            if content_md:
                                lines.append(content_md)
                                lines.append("")

                    # Main commentary content
                    if 'content' in comm_data:
                        content_md = format_content(comm_data['content'], scripts)
                        if content_md:
                            lines.append(content_md)
                            lines.append("")

        # Recursively write children
        children = node.get('_children', {})
        if children:
            child_md = write_tree_to_markdown(
                children,
                structure_levels,
                scripts,
                commentary_map,
                depth + 1,
                f"{current_ref}."
            )
            lines.append(child_md)

    return '\n'.join(lines)


def convert_to_markdown(data: Dict[str, Any],
                        scripts: Optional[List[str]] = None,
                        commentaries: Optional[List[str]] = None) -> str:
    """Convert grantha JSON to Markdown format.

    Args:
        data: Full grantha JSON data
        scripts: List of scripts to include (default: ['devanagari'])
        commentaries: List of commentary IDs to include (default: None)

    Returns:
        Markdown formatted string with YAML frontmatter
    """
    if scripts is None:
        scripts = ['devanagari']

    # Build frontmatter with ALL JSON fields for complete reconstruction
    frontmatter = {
        'grantha_id': data.get('grantha_id'),
        'canonical_title': data.get('canonical_title'),
        'text_type': data.get('text_type'),
        'language': data.get('language'),
        'scripts': scripts,
        'structure_levels': data.get('structure_levels', []),
    }

    # Add optional top-level fields if present
    if 'aliases' in data:
        frontmatter['aliases'] = data['aliases']

    if 'variants_available' in data:
        frontmatter['variants_available'] = data['variants_available']

    if 'metadata' in data:
        frontmatter['metadata'] = data['metadata']

    if commentaries:
        frontmatter['commentaries'] = commentaries

        # Store full commentary metadata for reconstruction
        commentaries_metadata = []
        for commentary_data in data.get('commentaries', []):
            if commentary_data['commentary_id'] in commentaries:
                comm_meta = {
                    'commentary_id': commentary_data['commentary_id'],
                    'commentator': commentary_data.get('commentator', {}),
                }
                if 'commentary_title' in commentary_data:
                    comm_meta['commentary_title'] = commentary_data['commentary_title']
                if 'metadata' in commentary_data:
                    comm_meta['metadata'] = commentary_data['metadata']
                commentaries_metadata.append(comm_meta)

        frontmatter['commentaries_metadata'] = commentaries_metadata

    # Generate validation hash
    validation_hash = hash_grantha(data, scripts=scripts, commentaries=commentaries)
    frontmatter['validation_hash'] = f"sha256:{validation_hash}"

    # Build markdown content
    content_lines = []

    # Add prefatory material
    if 'prefatory_material' in data and data['prefatory_material']:
        for item in data['prefatory_material']:
            ref = item.get('ref')
            label_info = item.get('label', {})
            label_text = label_info.get('devanagari', '')
            if ref and label_text:
                header = f'# Prefatory: {ref} (devanagari: "{label_text}")'
                content_lines.append(header)
                content_md = format_content(item['content'], scripts)
                if content_md:
                    content_lines.append(content_md)
                    content_lines.append("")

    # Build commentary map for interleaving (ref -> list of commentary data)
    commentary_map: Dict[str, List[Dict[str, Any]]] = {}
    if commentaries and 'commentaries' in data:
        for commentary_data in data['commentaries']:
            commentary_id = commentary_data['commentary_id']
            if commentary_id not in commentaries:
                continue

            # Get commentator name
            commentator = commentary_data.get('commentator', {})
            if isinstance(commentator, dict):
                commentator_name = commentator.get('devanagari', commentator.get('latin', commentary_id))
            else:
                commentator_name = commentator

            # Map each passage ref to its commentary
            for passage in commentary_data.get('passages', []):
                ref = passage['ref']
                if ref not in commentary_map:
                    commentary_map[ref] = []

                comm_entry = {
                    'commentary_id': commentary_id,
                    'commentator_name': commentator_name,
                    'content': passage.get('content'),
                }

                if 'prefatory_material' in passage:
                    comm_entry['prefatory_material'] = passage['prefatory_material']

                commentary_map[ref].append(comm_entry)

    # Add main passages with interleaved commentaries
    if 'passages' in data and data['passages']:
        # Build hierarchy tree
        tree = build_hierarchy_tree(data.get('structure_levels', []), data['passages'])

        # Write tree to markdown with interleaved commentaries
        tree_md = write_tree_to_markdown(
            tree,
            data.get('structure_levels', []),
            scripts,
            commentary_map  # Pass commentary map for interleaving
        )
        content_lines.append(tree_md)

    # Add concluding material
    if 'concluding_material' in data and data['concluding_material']:
        for item in data['concluding_material']:
            ref = item.get('ref')
            label_info = item.get('label', {})
            label_text = label_info.get('devanagari', '')
            if ref and label_text:
                header = f'# Concluding: {ref} (devanagari: "{label_text}")'
                content_lines.append(header)
                content_md = format_content(item['content'], scripts)
                if content_md:
                    content_lines.append(content_md)
                    content_lines.append("")

    # Commentaries are now interleaved with passages above
    # No separate commentary section needed

    # Combine frontmatter and content
    yaml_str = yaml.dump(frontmatter, allow_unicode=True, sort_keys=False)
    markdown = f"---\n{yaml_str}---\n\n" + '\n'.join(content_lines)

    return markdown


def json_file_to_markdown_file(input_path: str,
                                 output_path: str,
                                 scripts: Optional[List[str]] = None,
                                 commentaries: Optional[List[str]] = None) -> None:
    """Convert JSON file to Markdown file.

    Args:
        input_path: Path to input JSON file
        output_path: Path to output Markdown file
        scripts: List of scripts to include
        commentaries: List of commentary IDs to include
    """
    with open(input_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    markdown = convert_to_markdown(data, scripts=scripts, commentaries=commentaries)

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(markdown)
