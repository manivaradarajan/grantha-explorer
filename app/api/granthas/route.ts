import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * API Route: GET /api/granthas
 * Returns a list of available granthas from the pre-generated metadata file.
 */
export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'public', 'data', 'granthas-metadata.json');
    const fileContents = await fs.readFile(filePath, 'utf-8');
    const granthas = JSON.parse(fileContents);
    return NextResponse.json(granthas);
  } catch (error) {
    console.error('Error reading granthas metadata:', error);
    return NextResponse.json(
      { error: 'Failed to load granthas' },
      { status: 500 }
    );
  }
}
