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
    
    // Scan the library directory for both files and directories.
    const libraryDirEntries = await fs.readdir(libraryDir, { withFileTypes: true });
    const availableGranthaIds = new Set<string>();

    for (const entry of libraryDirEntries) {
      if (entry.isFile() && entry.name.endsWith('.json')) {
        // This is a single-file grantha. Add its name without extension.
        availableGranthaIds.add(entry.name.replace('.json', ''));
      } else if (entry.isDirectory()) {
        // This is potentially a multi-part grantha. The directory name is the ID.
        // We verify its validity by checking for a metadata.json file inside.
        const metadataPath = path.join(libraryDir, entry.name, 'metadata.json');
        try {
          await fs.access(metadataPath); // Check for existence without reading the file.
          availableGranthaIds.add(entry.name);
        } catch {
          console.warn(
            `[Indexer Warning] Directory '${entry.name}' found in library but it lacks a metadata.json file. Skipping.`
          );
        }
      }
    }
    
    // ========================= CHANGE ENDS HERE =========================

    let granthas = Object.entries(metaData)
      .filter(([id]) => availableGranthaIds.has(id))
      .map(([id, meta]: [string, any]) => ({
        id,
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