const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const fs = require('fs');
const path = require('path');

const ajv = new Ajv();
addFormats(ajv);

const schemaPath = path.resolve(__dirname, '../schemas/grantha.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
const validate = ajv.compile(schema);

const dataDir = path.resolve(__dirname, '../public/data');
const dataFiles = fs.readdirSync(dataDir).filter((file: string) => file.endsWith('.json'));

let allValid = true;

for (const file of dataFiles) {
  const filePath = path.join(dataDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  const valid = validate(data);
  if (!valid) {
    console.error(`Validation failed for ${file}:`);
    console.error(validate.errors);
    allValid = false;
  }
}

if (allValid) {
  console.log('All data files are valid!');
}
