import { promises as fs } from 'fs';
import path from 'path';

type EditionStub = {
  edition_id: string;
  path: string;
  isDefault?: boolean;
  commentator?: { devanagari: string; roman?: string };
  commentary_title?: string;
};

type MetaEntry = {
  title: { devanagari: string; iast: string };
  abbreviations?: { devanagari: string[] };
};

async function readEnvelopeJson(
  dir: string
): Promise<Record<string, unknown> | null> {
  const envelopePath = path.join(dir, 'envelope.json');
  try {
    return JSON.parse(await fs.readFile(envelopePath, 'utf-8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    return null;
  }
}

async function generateGranthasJson() {
  try {
    const dataDir = path.join(process.cwd(), 'public', 'data');
    const metaFilePath = path.join(dataDir, 'granthas-meta.json');
    const orderFilePath = path.join(dataDir, 'granthas-order.json');
    const categoriesFilePath = path.join(dataDir, 'categories.json');
    const libraryDir = path.join(dataDir, 'library');

    const [metaFileContents, orderFileContents] = await Promise.all([
      fs.readFile(metaFilePath, 'utf-8'),
      fs.readFile(orderFilePath, 'utf-8'),
    ]);

    const metaData = JSON.parse(metaFileContents);
    const orderedIds = JSON.parse(orderFileContents);

    // Optional categories config. Graceful degradation: when absent or malformed,
    // every grantha gets categories: [] and text_type_display is omitted.
    let categoriesConfig: {
      categories?: { id: string; deva: string; iast: string; order: number }[];
      text_type_labels?: Record<string, { deva: string }>;
      text_categories?: Record<string, string[]>;
    } = {};
    try {
      categoriesConfig = JSON.parse(await fs.readFile(categoriesFilePath, 'utf-8'));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      console.warn('[Indexer Warning] categories.json missing — stamping empty categories.');
    }
    const textTypeLabels = categoriesConfig.text_type_labels ?? {};
    const textCategories = categoriesConfig.text_categories ?? {};

    // ======================== CHANGE STARTS HERE ========================

    // Recursively scan the library directory for both single-file and multi-part granthas.
    // Reads the explicit 'kind' field from each envelope.json — never infers type from field presence.
    // Consumers must read paths from this generated file; never template grantha_id or edition_id
    // into a filesystem path.
    const granthaPathMap = new Map<string, string>(); // Maps grantha_id to relative path
    const granthaEditionsMap = new Map<string, EditionStub[]>(); // grantha_id -> editions[] (grantha-envelope only)
    const granthaTextTypeMap = new Map<string, string>(); // grantha_id -> text_type (from envelope or flat file)

    async function scanDirectory(dir: string, relativePath: string = ''): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const entryRelativePath = relativePath ? path.join(relativePath, entry.name) : entry.name;

        if (entry.isDirectory()) {
          const envelopePath = path.join(fullPath, 'envelope.json');
          const envelopeData = await readEnvelopeJson(fullPath);
          if (!envelopeData) {
            // No envelope.json — recurse into subdirectories
            await scanDirectory(fullPath, entryRelativePath);
            continue;
          }

          const kind = envelopeData['kind'] as string | undefined;

          if (kind === 'grantha-envelope') {
            // Grantha-level envelope: resolve the default edition path
            const editions = envelopeData['editions'] as EditionStub[] | undefined;
            if (!editions) {
              console.warn(
                `[Indexer Warning] Grantha-level envelope at ${envelopePath} missing editions array. Skipping.`
              );
              continue;
            }
            const defaultEdition = editions.find((e) => e.isDefault === true);
            if (!defaultEdition) {
              console.warn(
                `[Indexer Warning] Grantha-level envelope at ${envelopePath} has no isDefault edition. Skipping.`
              );
              continue;
            }
            const granthaId = envelopeData['grantha_id'] as string | undefined;
            if (!granthaId) {
              console.warn(
                `[Indexer Warning] Grantha-level envelope at ${envelopePath} missing grantha_id. Skipping.`
              );
              continue;
            }
            // path in edition stub is relative to library/
            granthaPathMap.set(granthaId, defaultEdition.path);
            granthaEditionsMap.set(granthaId, editions);
            if (typeof envelopeData['text_type'] === 'string') {
              granthaTextTypeMap.set(granthaId, envelopeData['text_type'] as string);
            }

            // Also scan sibling .json files in the same directory for other grantha_ids
            // (e.g. a karika file that shares a directory with a multi-edition upanishad)
            const siblingEntries = await fs.readdir(fullPath, { withFileTypes: true });
            for (const sibling of siblingEntries) {
              if (
                sibling.isFile() &&
                sibling.name.endsWith('.json') &&
                sibling.name !== 'envelope.json'
              ) {
                try {
                  const siblingContent = await fs.readFile(
                    path.join(fullPath, sibling.name),
                    'utf-8'
                  );
                  const siblingData = JSON.parse(siblingContent);
                  if (siblingData.grantha_id && siblingData.grantha_id !== granthaId) {
                    const siblingRelPath = path.join(entryRelativePath, sibling.name);
                    granthaPathMap.set(siblingData.grantha_id, siblingRelPath);
                    if (typeof siblingData.text_type === 'string') {
                      granthaTextTypeMap.set(siblingData.grantha_id, siblingData.text_type);
                    }
                  }
                } catch {
                  console.warn(
                    `[Indexer Warning] Failed to read grantha_id from sibling ${sibling.name}. Skipping.`
                  );
                }
              }
            }
          } else if (kind === 'edition-sub-envelope') {
            // Edition sub-envelope — register directory path
            const granthaId = envelopeData['grantha_id'] as string | undefined;
            if (granthaId) {
              granthaPathMap.set(granthaId, entryRelativePath);
              if (typeof envelopeData['text_type'] === 'string') {
                granthaTextTypeMap.set(granthaId, envelopeData['text_type'] as string);
              }
            } else {
              console.warn(
                `[Indexer Warning] ${envelopePath}: edition-sub-envelope missing grantha_id. Skipping.`
              );
            }
          } else {
            // Missing or unknown kind — warn and recurse
            console.warn(
              `[Indexer Warning] ${envelopePath}: missing or unknown 'kind' field ('${kind}'). Recursing.`
            );
            await scanDirectory(fullPath, entryRelativePath);
          }
        } else if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'envelope.json') {
          // Flat single-file grantha. Extract grantha_id from the file.
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const data = JSON.parse(content);
            if (data.grantha_id) {
              granthaPathMap.set(data.grantha_id, entryRelativePath);
              if (typeof data.text_type === 'string') {
                granthaTextTypeMap.set(data.grantha_id, data.text_type);
              }
            }
          } catch (error) {
            console.warn(`[Indexer Warning] Failed to read grantha_id from ${fullPath}: ${error}. Skipping.`);
          }
        }
      }
    }

    await scanDirectory(libraryDir);

    // ========================= CHANGE ENDS HERE =========================

    const granthas = Object.entries(metaData as Record<string, MetaEntry>)
      .filter(([id]) => granthaPathMap.has(id))
      .map(([id, meta]: [string, MetaEntry]) => {
        const textType = granthaTextTypeMap.get(id);
        const textTypeDisplay = textType ? textTypeLabels[textType]?.deva : undefined;
        return {
          id,
          path: granthaPathMap.get(id)!, // Add the relative path to the grantha
          title: meta.title.iast,
          title_deva: meta.title.devanagari,
          title_iast: meta.title.iast,
          categories: textCategories[id] ?? [],
          ...(textTypeDisplay ? { text_type_display: textTypeDisplay } : {}),
          ...(granthaEditionsMap.has(id)
            ? { editions: granthaEditionsMap.get(id) }
            : {}),
        };
      });

    granthas.sort((a, b) => {
      const indexA = orderedIds.indexOf(a.id);
      const indexB = orderedIds.indexOf(b.id);

      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }
      if (indexA !== -1) {
        return -1;
      }
      if (indexB !== -1) {
        return 1;
      }
      return a.title.localeCompare(b.title);
    });

    const output = {
      _meta: {
        generator: 'scripts/generate-granthas-json.ts',
        warning: 'This file is auto-generated at build time. DO NOT EDIT manually. Edit source files in public/data/ instead.'
      },
      granthas
    };

    const generatedDir = path.join(dataDir, 'generated');
    await fs.mkdir(generatedDir, { recursive: true });
    const outputPath = path.join(generatedDir, 'granthas.json');
    await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`Successfully generated ${outputPath}`);
  } catch (error) {
    console.error('Error generating granthas.json:', error);
    process.exit(1);
  }
}

generateGranthasJson();