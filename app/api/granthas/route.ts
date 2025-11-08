import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * API Route: GET /api/granthas
 * Returns a list of available granthas by scanning the data directory.
 */
export async function GET() {
  try {
    const dataDir = path.join(process.cwd(), 'public', 'data');
    const libraryDir = path.join(dataDir, 'library');
    const orderFilePath = path.join(dataDir, 'granthas-order.json');

    const [files, orderFileContents] = await Promise.all([
      fs.readdir(libraryDir),
      fs.readFile(orderFilePath, 'utf-8'),
    ]);

    const orderedIds = JSON.parse(orderFileContents);

    let granthas = await Promise.all(
      files
        .filter((file) => file.endsWith('.json'))
        .map(async (file) => {
          const filePath = path.join(libraryDir, file);
          const fileContents = await fs.readFile(filePath, 'utf-8');
          const data = JSON.parse(fileContents);
          return {
            id: data.grantha_id,
            title: data.canonical_title,
          };
        })
    );

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

    return NextResponse.json(granthas);
  } catch (error) {
    console.error('Error dynamically reading granthas:', error);
    return NextResponse.json(
      { error: 'Failed to load granthas' },
      { status: 500 }
    );
  }
}
