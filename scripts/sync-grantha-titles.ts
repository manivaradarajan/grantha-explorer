import fs from 'fs';
import path from 'path';

const metaPath = path.join(process.cwd(), 'public/data/granthas-meta.json');
const libraryPath = path.join(process.cwd(), 'public/data/library');

interface Alias {
  alias: string;
  scope: string;
}

async function syncTitles() {
  try {
    const metaData = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const libraryFiles = fs.readdirSync(libraryPath);

    for (const file of libraryFiles) {
      if (file.endsWith('.json')) {
        const granthaId = file.replace('.json', '');
        const granthaFilePath = path.join(libraryPath, file);
        const granthaData = JSON.parse(fs.readFileSync(granthaFilePath, 'utf-8'));
        const canonicalTitle = granthaData.canonical_title;
        const iastAlias = granthaData.aliases.find((a: Alias) => a.scope === 'full_text');
        const iastTitle = iastAlias ? iastAlias.alias : granthaId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

        if (metaData[granthaId]) {
          if (metaData[granthaId].title.devanagari !== canonicalTitle) {
            console.log(`Updating title for ${granthaId} in metadata...`);
            metaData[granthaId].title.devanagari = canonicalTitle;
          }
        } else {
          console.log(`Adding new grantha ${granthaId} to metadata...`);
          metaData[granthaId] = {
            title: {
              devanagari: canonicalTitle,
              iast: iastTitle,
            },
            abbreviations: {
              devanagari: [],
            },
          };
        }
      }
    }

    fs.writeFileSync(metaPath, JSON.stringify(metaData, null, 2));
    console.log('Grantha metadata synced successfully.');
  } catch (error) {
    console.error('Error syncing grantha titles:', error);
  }
}

syncTitles();
