/**
 * Canonical path-resolution utilities for the grantha library.
 *
 * Rule: paths to grantha content files must always be read from the generated
 * granthas.json index — never templated from a grantha_id or edition_id string.
 * The index is the authoritative map from logical identifiers to filesystem paths.
 */

import { getAvailableGranthas, type GranthaMetadata } from "./data";

/**
 * Resolve the registered library path for a grantha by ID.
 *
 * Reads the path from the generated granthas.json index rather than
 * constructing it from the grantha_id, so renaming a directory never silently
 * breaks callers.
 *
 * @param granthaId - The grantha_id to look up (e.g. 'kena-upanishad').
 * @returns The relative library path string (e.g. 'upanishads/kena/kena-upanishad'
 *   or 'upanishads/isavasya/isavasya-upanishad-vedantadesika.json').
 * @throws {Error} If the grantha_id is not found in the generated index.
 */
export async function resolveGranthaPath(granthaId: string): Promise<string> {
  const granthas: GranthaMetadata[] = await getAvailableGranthas();
  const entry = granthas.find((g) => g.id === granthaId);
  if (!entry) {
    throw new Error(
      `resolveGranthaPath: unknown grantha_id '${granthaId}'. ` +
        `Check that the grantha is registered in public/data/generated/granthas.json.`
    );
  }
  return entry.path;
}
