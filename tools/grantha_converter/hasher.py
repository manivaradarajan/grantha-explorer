"""Content hashing for validation of lossless conversion.

This module provides utilities to hash grantha content by normalizing text
and excluding non-significant characters (whitespace, zero-width marks, punctuation).
"""

import hashlib
import re
import unicodedata
from typing import Any, Dict, List, Optional


# Unicode characters to exclude from hash
ZERO_WIDTH_CHARS = [
    '\u200b',  # Zero-width space
    '\u200c',  # Zero-width non-joiner
    '\u200d',  # Zero-width joiner
    '\ufeff',  # Zero-width no-break space (BOM)
]

# Devanagari and common punctuation marks to exclude
PUNCTUATION_CHARS = [
    '\u0964',  # Devanagari danda
    '\u0965',  # Devanagari double danda
    '।',       # Devanagari danda (alternative)
    '॥',       # Devanagari double danda (alternative)
    ',', '.', ';', ':', '!', '?', '-', '—', '–',
    '(', ')', '[', ']', '{', '}', '"', "'", '`',
]


def normalize_text(text: str) -> str:
    """Normalize text for hashing by removing non-significant characters.

    Removes:
    - All whitespace (spaces, newlines, tabs, etc.)
    - Zero-width marks (ZWNJ, ZWJ, etc.)
    - Punctuation marks (dandas, commas, periods, etc.)

    Args:
        text: Input text to normalize

    Returns:
        Normalized text with only significant characters
    """
    if not text:
        return ""

    # Remove zero-width characters
    for char in ZERO_WIDTH_CHARS:
        text = text.replace(char, '')

    # Remove punctuation
    for char in PUNCTUATION_CHARS:
        text = text.replace(char, '')

    # Remove all whitespace characters
    text = re.sub(r'\s+', '', text)

    # Normalize Unicode (NFC form)
    text = unicodedata.normalize('NFC', text)

    return text


def hash_text(text: str) -> str:
    """Generate SHA256 hash of normalized text.

    Args:
        text: Text to hash

    Returns:
        Hex digest of SHA256 hash
    """
    normalized = normalize_text(text)
    return hashlib.sha256(normalized.encode('utf-8')).hexdigest()


def extract_content_text(content: Dict[str, Any], scripts: Optional[List[str]] = None) -> str:
    """Extract all text content from a passage content object.

    Args:
        content: Content dict with sanskrit/english fields
        scripts: List of scripts to include (devanagari, roman, kannada)
                If None, includes all available scripts

    Returns:
        Concatenated text from all relevant fields
    """
    texts = []

    # Extract Sanskrit text
    if 'sanskrit' in content:
        sanskrit = content['sanskrit']

        if scripts is None or 'devanagari' in scripts:
            if sanskrit.get('devanagari'):
                texts.append(sanskrit['devanagari'])

        if scripts is None or 'roman' in scripts:
            if sanskrit.get('roman'):
                texts.append(sanskrit['roman'])

        if scripts is None or 'kannada' in scripts:
            if sanskrit.get('kannada'):
                texts.append(sanskrit['kannada'])

    # Extract English translation
    if 'english_translation' in content and content['english_translation']:
        texts.append(content['english_translation'])

    # Extract English (for commentary)
    if 'english' in content and content['english']:
        texts.append(content['english'])

    return ''.join(texts)


def hash_passage(passage: Dict[str, Any], scripts: Optional[List[str]] = None) -> str:
    """Generate hash for a single passage.

    Args:
        passage: Passage dict with ref and content
        scripts: List of scripts to include in hash

    Returns:
        SHA256 hash of passage content
    """
    content_text = extract_content_text(passage['content'], scripts)
    return hash_text(content_text)


def hash_grantha(data: Dict[str, Any],
                 scripts: Optional[List[str]] = None,
                 commentaries: Optional[List[str]] = None) -> str:
    """Generate validation hash for entire grantha document.

    Args:
        data: Full grantha JSON data
        scripts: List of scripts to include (devanagari, roman, kannada)
        commentaries: List of commentary IDs to include (None = core text only)

    Returns:
        SHA256 hash of all content in specified scope
    """
    all_texts = []

    # Hash prefatory material
    if 'prefatory_material' in data:
        for item in data['prefatory_material']:
            text = extract_content_text(item['content'], scripts)
            all_texts.append(text)

    # Hash main passages
    if 'passages' in data:
        for passage in data['passages']:
            text = extract_content_text(passage['content'], scripts)
            all_texts.append(text)

    # Hash concluding material
    if 'concluding_material' in data:
        for item in data['concluding_material']:
            text = extract_content_text(item['content'], scripts)
            all_texts.append(text)

    # Hash commentaries if requested
    if commentaries and 'commentaries' in data:
        for commentary in data['commentaries']:
            if commentary['commentary_id'] in commentaries:
                # Hash commentary passages
                for passage in commentary.get('passages', []):
                    # Hash prefatory material in commentary passage
                    if 'prefatory_material' in passage:
                        for item in passage['prefatory_material']:
                            text = extract_content_text(item['content'], scripts)
                            all_texts.append(text)

                    # Hash main commentary content
                    if 'content' in passage:
                        text = extract_content_text(passage['content'], scripts)
                        all_texts.append(text)

    # Combine and hash all text
    combined = ''.join(all_texts)
    return hash_text(combined)
