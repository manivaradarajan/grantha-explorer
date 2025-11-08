const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const fs = require('fs');
const path = require('path');

const ajv = new Ajv();
addFormats(ajv);

const schemaPath = path.resolve(__dirname, '../schemas/grantha.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
const validate = ajv.compile(schema);

/**
 * Calculate the depth of structure_levels hierarchy
 */
function getStructureDepth(levels: any[]): number {
  if (!levels || levels.length === 0) return 0;

  let depth = 1;
  let current = levels[0];

  while (current.children && current.children.length > 0) {
    depth++;
    current = current.children[0];
  }

  return depth;
}

/**
 * Validate that passage refs match the structure_levels hierarchy
 */
function validateStructureConsistency(data: any, filename: string): boolean {
  const { structure_levels, passages, prefatory_material, concluding_material } = data;

  if (!structure_levels || structure_levels.length === 0) {
    console.error(`${filename}: Missing structure_levels`);
    return false;
  }

  const expectedDepth = getStructureDepth(structure_levels);
  const allPassages = [
    ...(prefatory_material || []),
    ...(passages || []),
    ...(concluding_material || [])
  ];

  let valid = true;

  for (const passage of allPassages) {
    const ref = passage.ref;
    const refParts = ref.split('.');

    // Prefatory/concluding material may have different ref patterns (e.g., "1.0")
    // Main passages should match the structure depth
    if (passage.passage_type === 'main') {
      if (refParts.length !== expectedDepth) {
        console.error(
          `${filename}: Passage ref "${ref}" has ${refParts.length} levels, ` +
          `but structure_levels defines ${expectedDepth} levels`
        );
        valid = false;
      }

      // Validate that all parts are numeric
      for (const part of refParts) {
        if (!/^\d+$/.test(part)) {
          console.error(
            `${filename}: Passage ref "${ref}" contains non-numeric part "${part}"`
          );
          valid = false;
        }
      }
    }
  }

  // Validate commentary refs if present
  if (data.commentaries) {
    for (const commentary of data.commentaries) {
      for (const passage of commentary.passages) {
        const ref = passage.ref;
        const refParts = ref.split('.');

        if (refParts.length !== expectedDepth) {
          console.error(
            `${filename}: Commentary passage ref "${ref}" has ${refParts.length} levels, ` +
            `but structure_levels defines ${expectedDepth} levels`
          );
          valid = false;
        }
      }
    }
  }

  return valid;
}

const dataDir = path.resolve(__dirname, '../public/data/library');
const dataFiles = fs.readdirSync(dataDir).filter((file: string) => file.endsWith('.json'));

let allValid = true;

for (const file of dataFiles) {
  const filePath = path.join(dataDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  // Schema validation
  const schemaValid = validate(data);
  if (!schemaValid) {
    console.error(`Schema validation failed for ${file}:`);
    console.error(validate.errors);
    allValid = false;
  }

  // Structure consistency validation
  const structureValid = validateStructureConsistency(data, file);
  if (!structureValid) {
    allValid = false;
  }
}

if (allValid) {
  console.log('All data files are valid!');
}
