import fs from 'fs';
import path from 'path';

const dataDirPath = path.join(process.cwd(), 'public', 'data');
const metaFilePath = path.join(dataDirPath, 'granthas-meta.json');

const referenceRegex = /\(ref:([^)]+)\)/g;
const devanagariRegex = /[\u0900-\u097F]/;

async function auditAbbreviations() {
  try {
    const allAbbrs = new Set<string>();
    const libraryDirPath = path.join(dataDirPath, 'library');
    const files = fs.readdirSync(libraryDirPath);

    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(libraryDirPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        let match;
        while ((match = referenceRegex.exec(content)) !== null) {
          const parts = match[1].split('/');
          allAbbrs.add(parts[0]);
        }
      }
    }

    const meta = JSON.parse(fs.readFileSync(metaFilePath, 'utf-8'));
    const definedAbbrs = new Set<string>();
    for (const granthaId in meta) {
      if (meta[granthaId].abbreviations) {
        for (const abbr of meta[granthaId].abbreviations.devanagari) {
          definedAbbrs.add(abbr);
        }
        if (meta[granthaId].abbreviations.iast) {
          for (const abbr of meta[granthaId].abbreviations.iast) {
            definedAbbrs.add(abbr);
          }
        }
      }
    }

    const missingAbbrs = new Set<string>();
    for (const abbr of allAbbrs) {
      if (!definedAbbrs.has(abbr) && !meta[abbr]) {
        missingAbbrs.add(abbr);
      }
    }

    if (missingAbbrs.size > 0) {
      console.log('Missing abbreviations found:');
      for (const abbr of missingAbbrs) {
        console.log(abbr);
      }
    } else {
      console.log('All abbreviations are defined.');
    }
  } catch (error) {
    console.error('Error auditing abbreviations:', error);
  }
}

auditAbbreviations();
