import fs from 'fs';
import path from 'path';

const dataDirPath = path.join(process.cwd(), 'public', 'data');
const metaFilePath = path.join(dataDirPath, 'granthas-meta.json');

const duplicatesToMerge: { [canonical: string]: string[] } = {
  'brihadaranyaka': ['brihadaranyaka-upanishad'],
  'chandogya': ['chandogya-upanishad'],
  'bhagavad-gita': ['gita']
};

async function finalMerge() {
  try {
    const meta = JSON.parse(fs.readFileSync(metaFilePath, 'utf-8'));

    for (const canonicalKey in duplicatesToMerge) {
      const aliases = duplicatesToMerge[canonicalKey];
      if (meta[canonicalKey]) {
        if (!meta[canonicalKey].abbreviations) meta[canonicalKey].abbreviations = { devanagari: [] };
        if (!meta[canonicalKey].abbreviations.devanagari) meta[canonicalKey].abbreviations.devanagari = [];

        for (const alias of aliases) {
          if (meta[alias]) {
            if (!meta[canonicalKey].abbreviations.devanagari.includes(alias)) {
              meta[canonicalKey].abbreviations.devanagari.push(alias);
            }
            delete meta[alias];
          }
        }
      }
    }

    const sortedMeta: { [key: string]: any } = {};
    Object.keys(meta).sort().forEach(key => {
      sortedMeta[key] = meta[key];
    });

    fs.writeFileSync(metaFilePath, JSON.stringify(sortedMeta, null, 2));
    console.log('Successfully performed the final merge and sort of granthas-meta.json.');

  } catch (error) {
    console.error('Error during final merge:', error);
  }
}

finalMerge();
