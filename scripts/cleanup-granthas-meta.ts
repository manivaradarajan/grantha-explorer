import fs from 'fs';
import path from 'path';

const dataDirPath = path.join(process.cwd(), 'public', 'data');
const libraryDirPath = path.join(dataDirPath, 'library');
const granthasMetaPath = path.join(dataDirPath, 'granthas-meta.json');

interface GranthaMeta {
  title: {
    devanagari: string;
    iast: string;
  };
  abbreviations: {
    devanagari: string[];
  };
}

async function cleanupGranthasMeta() {
  // 1. Find all abbreviations in data JSONs from ref: links
  const allAbbreviations = new Set<string>();
  const libraryFiles = fs.readdirSync(libraryDirPath).filter(file => file.endsWith('.json'));

  const refRegex = /ref:([\w-]+)/g;

  for (const file of libraryFiles) {
    const filePath = path.join(libraryDirPath, file);
    const fileContent = fs.readFileSync(filePath, 'utf-8');

    let match;
    while ((match = refRegex.exec(fileContent)) !== null) {
      allAbbreviations.add(match[1]);
    }
  }

  // 2. Read granthas-meta.json
  const granthasMetaContent = fs.readFileSync(granthasMetaPath, 'utf-8');
  let granthasMetaData: Record<string, GranthaMeta> = JSON.parse(granthasMetaContent);

  // 3. Ensure all abbreviations are present
  const existingAbbreviations = new Set(Object.keys(granthasMetaData));
  const missingAbbreviations = [...allAbbreviations].filter(abbr => !existingAbbreviations.has(abbr));

  if (missingAbbreviations.length > 0) {
    console.log('Missing abbreviations found. Adding them to granthas-meta.json:');
    missingAbbreviations.forEach(abbr => {
      console.log(`- ${abbr}`);
      granthasMetaData[abbr] = {
        title: {
          devanagari: 'Placeholder Title',
          iast: 'Placeholder Title',
        },
        abbreviations: {
          devanagari: [],
        },
      };
    });
  }

  // 4. Remove duplicate texts (implicit with object keys)

  // 5. Sort the file alphabetically by key
  const sortedGranthas: Record<string, GranthaMeta> = {};
  Object.keys(granthasMetaData).sort().forEach(key => {
    sortedGranthas[key] = granthasMetaData[key];
  });

  // 6. Write the cleaned data back to the file
  fs.writeFileSync(granthasMetaPath, JSON.stringify(sortedGranthas, null, 2));

  console.log('granthas-meta.json has been cleaned, de-duplicated, and sorted.');
  if (missingAbbreviations.length > 0) {
    console.log('NOTE: New abbreviations were added with placeholder titles. Please review and update them.');
  }
}

cleanupGranthasMeta().catch(error => {
  console.error('Error during cleanup:', error);
  process.exit(1);
});
