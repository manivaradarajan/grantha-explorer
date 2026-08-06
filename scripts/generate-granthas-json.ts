import { promises as fs } from 'fs';
import path from 'path';

async function generateGranthasJson() {
  try {
    const dataDir = path.join(process.cwd(), 'public', 'data');
    const metaFilePath = path.join(dataDir, 'granthas-meta.json');
    const orderFilePath = path.join(dataDir, 'granthas-order.json');
    const libraryDir = path.join(dataDir, 'library');

    const [metaFileContents, orderFileContents] = await Promise.all([
      fs.readFile(metaFilePath, 'utf-8'),
      fs.readFile(orderFilePath, 'utf-8'),
    ]);

    const metaData = JSON.parse(metaFileContents);
    const orderedIds = JSON.parse(orderFileContents);

    // ======================== CHANGE STARTS HERE ========================

    // Recursively scan the library directory for both single-file and multi-part granthas.
    const granthaPathMap = new Map<string, string>(); // Maps grantha_id to relative path

    async function scanDirectory(dir: string, relativePath: string = ''): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          // Check if this directory contains an envelope.json (multi-part grantha)
          const envelopePath = path.join(fullPath, 'envelope.json');
          try {
            await fs.access(envelopePath);
            // Read the envelope to get the grantha_id
            const content = await fs.readFile(envelopePath, 'utf-8');
            const data = JSON.parse(content);
            if (data.grantha_id) {
              granthaPathMap.set(data.grantha_id, entryRelativePath);
            }
          } catch {
            // No envelope.json, recurse into subdirectories
            await scanDirectory(fullPath, entryRelativePath);
          }
        } else if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'envelope.json') {
          // This is a single-file grantha. Extract grantha_id from the file.
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const data = JSON.parse(content);
            if (data.grantha_id) {
              granthaPathMap.set(data.grantha_id, entryRelativePath);
            }
          } catch (error) {
            console.warn(`[Indexer Warning] Failed to read grantha_id from ${fullPath}. Skipping.`);
          }
        }
      }
    }

    await scanDirectory(libraryDir);

    // ========================= CHANGE ENDS HERE =========================

    let granthas = Object.entries(metaData)
      .filter(([id]) => granthaPathMap.has(id))
      .map(([id, meta]: [string, any]) => ({
        id,
        path: granthaPathMap.get(id)!, // Add the relative path to the grantha
        title: meta.title.iast,
        title_deva: meta.title.devanagari,
        title_iast: meta.title.iast,
      }));

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
        generated: new Date().toISOString(),
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