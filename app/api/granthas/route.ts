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
    const files = await fs.readdir(dataDir);

    const granthas = await Promise.all(
      files
        .filter((file) => file.endsWith('.json') && file !== 'granthas-metadata.json')
        .map(async (file) => {
          const filePath = path.join(dataDir, file);
          const fileContents = await fs.readFile(filePath, 'utf-8');
          const data = JSON.parse(fileContents);
          return {
            id: data.grantha_id,
            title: data.canonical_title,
          };
        })
    );

    return NextResponse.json(granthas);
  } catch (error) {
    console.error('Error dynamically reading granthas:', error);
    return NextResponse.json(
      { error: 'Failed to load granthas' },
      { status: 500 }
    );
  }
}
