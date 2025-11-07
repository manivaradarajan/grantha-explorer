import { NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";
import { join } from "path";

interface GranthaMetadata {
  id: string;
  title: string;
}

/**
 * API Route: GET /api/granthas
 * Returns list of available granthas by reading /public/data/ directory
 */
export async function GET() {
  try {
    const dataDir = join(process.cwd(), "public", "data");

    // Read all files in the data directory
    const files = await readdir(dataDir);

    // Filter for JSON files (exclude non-grantha files)
    const granthaFiles = files.filter(
      (file) =>
        file.endsWith(".json") &&
        !file.startsWith("package") &&
        !file.startsWith("tsconfig")
    );

    // Read metadata from each grantha file
    const granthas: GranthaMetadata[] = [];

    for (const file of granthaFiles) {
      try {
        const filePath = join(dataDir, file);
        const content = await readFile(filePath, "utf-8");
        const data = JSON.parse(content);

        // Extract just the metadata we need
        if (data.grantha_id && data.canonical_title) {
          granthas.push({
            id: data.grantha_id,
            title: data.canonical_title,
          });
        }
      } catch (error) {
        console.error(`Error reading grantha file ${file}:`, error);
        // Skip this file and continue
      }
    }

    // Sort by title for consistent ordering
    granthas.sort((a, b) => a.title.localeCompare(b.title));

    return NextResponse.json(granthas);
  } catch (error) {
    console.error("Error reading granthas directory:", error);
    return NextResponse.json(
      { error: "Failed to load granthas" },
      { status: 500 }
    );
  }
}
