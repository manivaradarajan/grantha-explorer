import { loadGrantha, getPassageByRef } from './data';

// This file will contain the core logic for parsing, resolving, and validating cross-text references.

export interface Reference {
  fullMatch: string;
  displayText: string;
  rawRef: string;
  granthaId: string;
  path: string;
}

// Regex to find markdown links with 'ref:' protocol, e.g., [text](ref:id/path)
const referenceRegex = /\[([^\]]+)\]\(ref:([^\)]+)\)/g;




/**
 * Parses a string to find all reference links.
 * @param text The text to parse.
 * @returns An array of Reference objects found in the text.
 */
export const parseReferences = (text: string, abbreviationMap: { [key: string]: string }): Reference[] => {
  const references: Reference[] = [];
  let match;
  while ((match = referenceRegex.exec(text)) !== null) {
    const [fullMatch, displayText, rawRef] = match;
    const parts = rawRef.split('/');
    const granthaAbbr = parts[0];
    const path = parts.slice(1).join('/');

    const granthaId = abbreviationMap[granthaAbbr] || granthaAbbr;
    const normalizedPath = path.replace(/\/|\-/g, '.');

    references.push({
      fullMatch,
      displayText,
      rawRef,
      granthaId: granthaId,
      path: normalizedPath,
    });
  }
  return references;
};

/**
 * Checks if a given granthaId is available in our library.
 * This is a placeholder and will need to be connected to the actual library data.
 * @param granthaId The ID of the grantha to check.
 * @returns boolean
 */
export const isReferenceInLibrary = (granthaId: string, availableGranthaIds: string[]): boolean => {
  return availableGranthaIds.includes(granthaId);
};

/**
 * Fetches a preview for a given reference.
 * This is a placeholder for now.
 * @param granthaId The ID of the grantha.
 * @param path The path to the passage.
 * @returns A preview string or null.
 */
export const getPassagePreview = async (granthaId: string, path: string, availableGranthaIds: string[]): Promise<string | null> => {
  if (!isReferenceInLibrary(granthaId, availableGranthaIds)) {
    return 'Reference not available in this library.';
  }

  try {
    const grantha = await loadGrantha(granthaId);
    const passage = getPassageByRef(grantha, path);

    if (passage) {
      return passage.content.sanskrit.devanagari;
    }

    return 'Passage not found.';
  } catch (error) {
    console.error(`Error fetching passage preview for ${granthaId}:${path}`, error);
    return 'Error fetching preview.';
  }
};
