import fs from 'fs';
import path from 'path';

const dataDirPath = path.join(process.cwd(), 'public', 'data');
const metaFilePath = path.join(dataDirPath, 'granthas-meta.json');

async function sortGranthasMeta() {
  try {
    const meta = JSON.parse(fs.readFileSync(metaFilePath, 'utf-8'));
    const sortedMeta: { [key: string]: any } = {};
    Object.keys(meta).sort().forEach(key => {
      sortedMeta[key] = meta[key];
    });

    fs.writeFileSync(metaFilePath, JSON.stringify(sortedMeta, null, 2));
    console.log('Successfully sorted granthas-meta.json by key.');
  } catch (error) {
    console.error('Error sorting granthas-meta.json:', error);
  }
}

sortGranthasMeta();
