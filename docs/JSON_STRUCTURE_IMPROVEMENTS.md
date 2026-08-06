# JSON Structure Improvement Suggestions

This document tracks suggestions for improving the grantha JSON file structure to make the codebase simpler, more maintainable, and more performant.

## Current Issues

### 1. **Duplicate Structure Information**
- **Issue**: Part files (e.g., `part1.json`) contain `structure_levels`, `canonical_title`, `text_type`, `language`, etc. that duplicate what's in `envelope.json`
- **Impact**:
  - Increased file size and redundancy
  - Risk of inconsistency if metadata is updated in one place but not others
  - More complex validation logic
- **Suggested Fix**: Part files should ONLY contain content (`passages`, `prefatory_material`, `concluding_material`, `commentaries`). All metadata should live exclusively in `envelope.json`.

### 2. **Commentaries Structure Inconsistency**
- **Issue**: Commentaries are stored as objects (dict/map) with commentary_id as keys in JSON files, but the app code expects arrays
- **Impact**:
  - Confusion about the canonical format
  - Validation code needs to handle both formats
  - Runtime conversion overhead
- **Current Workaround**: App now converts object format to arrays at load time (see `lib/data.ts:296-305`)
- **Suggested Fix**: Standardize on **arrays** for commentaries in source JSON files. Arrays are easier to iterate, filter, and process. The `commentary_id` field inside each object provides the unique identifier.

### 3. **Path Discovery Complexity**
- **Issue**: Originally, the app had to search through multiple directory patterns to find grantha files because paths weren't stored
- **Impact**:
  - Multiple HTTP requests (404s) while searching
  - Slower initial load times
  - Complex search logic that needs updating when directory structure changes
- **Current Fix**: We now store paths in `granthas.json` index
- **Future Consideration**: Consider a flatter structure or more predictable naming convention

### 4. **Grantha ID vs Filename Mismatch**
- **Issue**: The `grantha_id` field doesn't always match the filename
  - Single file: `isavasya-upanishad-vedantadesika.json` has `grantha_id: "isavasya-upanishad"`
  - Multi-part: Directory `brihadaranyaka-upanishad/` matches its `grantha_id`
- **Impact**:
  - Can't construct file paths from grantha_id alone
  - Need to store explicit paths in index
  - Multiple variants of same grantha (different commentators) have same grantha_id but different files
- **Suggested Fix**:
  - Option A: Use unique grantha_id for each variant (e.g., `isavasya-upanishad-vedantadesika`)
  - Option B: Create a proper variants system where `envelope.json` lists available variants with their paths
  - Option C: Keep current system but always require path in index (current approach)

### 5. **Part File Naming Convention**
- **Issue**: Part files are named `part1.json`, `part2.json`, etc. with no indication of content
- **Impact**:
  - Can't tell what adhyaya/chapter is in each part without opening the file
  - Harder to navigate the filesystem
  - Part order must be maintained carefully in `envelope.json`
- **Suggested Fix**: Consider more descriptive naming like `adhyaya-01.json`, `adhyaya-02.json` or include chapter info in filename

### 6. **Missing Top-Level Index**
- **Current State**: Need to scan all files to build the index at build time
- **Suggested Fix**: Consider a top-level `library-index.json` at the repo level that maps grantha_id -> relative path, maintained by the source data generator

## Recommendations Priority

### High Priority
1. ✅ **DONE**: Add paths to `granthas.json` - Already implemented
2. ✅ **WORKAROUND**: Commentaries format - App now handles both object and array formats at runtime
3. **Remove duplicate metadata from part files** - Keep only content in parts
4. **Standardize commentaries as arrays in source** - Change object format to array format in JSON files

### Medium Priority
5. **Clarify grantha_id strategy** - Decide on unique IDs for variants vs variant system
6. **Document canonical structure** - Create clear schema documentation with examples

### Low Priority
7. **Better part file naming** - More descriptive names for easier navigation
8. **Consider flatter structure** - Evaluate if deep nesting (category/subcategory/grantha) is necessary

## Implementation Notes

- These changes should be made in the source data repository, not in this consuming application
- Each change should be accompanied by schema updates and validation rule updates
- Consider versioning the schema to support gradual migration
