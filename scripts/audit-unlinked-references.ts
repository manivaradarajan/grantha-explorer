import fs from 'fs';
import path from 'path';

const dataDirPath = path.join(process.cwd(), 'public', 'data');
const metaFilePath = path.join(dataDirPath, 'granthas-meta.json');

// Regex to find patterns like (छां.उ. 1.1.1) but not (ref:...)
const untaggedRefRegex = /\((?!ref:)([^\d\)]+?)\s+[\d.-]+\)/g;
const devanagariRegex = /[\u0900-\u097F]/;

async function auditUnlinkedReferences() {
  try {
    const allAbbrs = new Set<string>();
    const libraryDirPath = path.join(dataDirPath, 'library');
    const files = fs.readdirSync(libraryDirPath);

    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(libraryDirPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        let match;
        while ((match = untaggedRefRegex.exec(content)) !== null) {
          const abbr = match[1].trim();
          // Only consider it a potential abbreviation if it contains Devanagari characters
          if (devanagariRegex.test(abbr)) {
            allAbbrs.add(abbr);
          }
        }
      }
    }

    const meta = JSON.parse(fs.readFileSync(metaFilePath, 'utf-8'));
    const definedAbbrs = new Set<string>();
    for (const granthaId in meta) {
      const grantha = meta[granthaId];
      if (grantha.abbreviations) {
        // Handle both array of strings and object with devanagari/iast keys
        if (Array.isArray(grantha.abbreviations)) {
            grantha.abbreviations.forEach((abbr: string) => definedAbbrs.add(abbr));
        } else {
            if (grantha.abbreviations.devanagari) {
                grantha.abbreviations.devanagari.forEach((abbr: string) => definedAbbrs.add(abbr));
            }
            if (grantha.abbreviations.iast) {
                grantha.abbreviations.iast.forEach((abbr: string) => definedAbbrs.add(abbr));
            }
        }
      }
    }

    const missingAbbrs = new Set<string>();
    for (const abbr of allAbbrs) {
      if (!definedAbbrs.has(abbr)) {
        missingAbbrs.add(abbr);
      }
    }

    if (missingAbbrs.size > 0) {
      console.log('Found untagged references with missing abbreviations:');
      for (const abbr of missingAbbrs) {
        console.log(abbr);
      }
    } else {
      console.log('All untagged Devanagari references are defined.');
    }
  } catch (error) {
    console.error('Error auditing unlinked references:', error);
  }
}

auditUnlinkedReferences();
