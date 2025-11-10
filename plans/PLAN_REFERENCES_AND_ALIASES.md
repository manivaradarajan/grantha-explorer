# Plan: Enhanced Reference and Alias Handling

## 1. Introduction

This document outlines a design change to enhance the project's reference and alias handling capabilities. The primary goal is to support more flexible and context-aware reference resolution, specifically addressing cases where:
*   Grantha-specific chapter/section aliases are used (e.g., "आन." for "Anandavalli" in Taittiriya Upanishad).
*   Multiple ways exist to refer to the same section within a grantha (e.g., using either the name or the number of a Kanda in Ramayana).

This plan builds upon the existing system identified by the `codebase_investigator`, which currently handles grantha-level aliases and content-level passage identifiers.

## 2. Current System Context

Based on the codebase investigation, the relevant components are:
*   `schemas/grantha.schema.json`: Defines the canonical data structure for granthas, including `aliases` (grantha-level) and `ref` (content-level passage identifiers).
*   `lib/data.ts`: Contains functions for data loading (`loadGrantha`, `getGranthasMeta`), grantha alias mapping (`createAbbreviationMap`), and core content-level reference resolution (`getPassageByRef`).
*   `lib/references.ts`: Handles parsing of custom `ref:` markdown links (`parseReferences` using `referenceRegex`), and resolution of passage previews (`getPassagePreview`).
*   `components/CommentaryPanel.tsx`, `components/ReferenceLink.tsx`, `components/PassageLink.tsx`, `components/NavigationSidebar.tsx`: Components responsible for rendering and interacting with references in the UI.

## 3. Proposed Design Change: Grantha-Specific Structural Aliases

The core idea is to introduce a new layer of "internal aliases" or "structure aliases" within each grantha's metadata. These aliases will map human-readable names (e.g., "Anandavalli", "बालकाण्ड") to their canonical numerical or structural identifiers (e.g., chapter 2, kanda 1).

### 3.1. Extend `grantha.schema.json`

A new property, `structureAliases`, will be added to the `grantha` schema. This will be an array of objects, each defining an alias for a specific structural level within the grantha.

```json
// schemas/grantha.schema.json (excerpt)
{
  "type": "object",
  "properties": {
    // ... existing properties like "id", "title", "aliases" ...
    "structureAliases": {
      "type": "array",
      "description": "Aliases for structural components (e.g., chapters, kandas, sections) within this grantha.",
      "items": {
        "type": "object",
        "properties": {
          "alias": { "type": "string", "description": "The alias string (e.g., 'आन.', 'Anandavalli', 'बालकाण्ड')." },
          "level": { "type": "number", "description": "The 1-based structural level this alias applies to (e.g., 1 for chapter/kanda, 2 for section within chapter). This corresponds to the 'level' property in the grantha's 'structure'." },
          "value": { "type": "string", "description": "The canonical numerical value this alias maps to (e.g., '2' for chapter 2, '1' for kanda 1). This should match a 'number' property of a structure item at the specified 'level'." }
        },
        "required": ["alias", "level", "value"]
      }
    }
  }
}
```

**Example Data (`public/data/library/*.json` excerpts):**

*   **For Taittiriya Upanishad:**
    ```json
    {
      "id": "taittiriya-upanishad",
      "title": "Taittiriya Upanishad",
      "aliases": ["तै.उ.", "TU"],
      "structureAliases": [
        { "alias": "आन.", "level": 1, "value": "2" }, // Anandavalli is chapter 2
        { "alias": "आनन्दवल्ली", "level": 1, "value": "2" },
        { "alias": "भृगु.", "level": 1, "value": "3" },  // Bhriguvalli is chapter 3
        { "alias": "भृगुवल्ली", "level": 1, "value": "3" }
      ],
      "structure": [
        // ... chapter 1 ...
        {
          "level": 1,
          "number": "2",
          "title": "Anandavalli",
          "passages": [...]
        },
        // ... chapter 3 ...
      ]
    }
    ```
*   **For Ramayana (hypothetical):**
    ```json
    {
      "id": "ramayana",
      "title": "Ramayana",
      "aliases": ["रामायण"],
      "structureAliases": [
        { "alias": "बालकाण्ड", "level": 1, "value": "1" },
        { "alias": "अयोध्याकाण्ड", "level": 1, "value": "2" }
        // ... and so on for other kandas
      ],
      "structure": [
        {
          "level": 1,
          "number": "1",
          "title": "Balakanda",
          "passages": [...]
        },
        {
          "level": 1,
          "number": "2",
          "title": "Ayodhya Kanda",
          "passages": [...]
        }
      ]
    }
    ```

### 3.2. Update Data Loading and Processing (`lib/data.ts`)

*   **Load `structureAliases`**: When `loadGrantha` is called, the `structureAliases` array for that grantha will be loaded.
*   **Create a `structureAliasMap`**: For each loaded grantha, a `Map<string, { level: number, value: string }>` will be created from its `structureAliases`. This map will enable quick lookups of alias strings to their canonical numerical values and structural levels. This map will be stored as part of the loaded grantha object.

### 3.3. Enhance Reference Parsing (`lib/references.ts`)

The `parseReferences` function will be updated to incorporate the new structural alias resolution.

*   **Modify `referenceRegex`**: The regex will be made more flexible to capture parts of the reference that could be either numbers or alias strings. A potential approach is to capture the grantha ID and then the entire subsequent reference string, which will then be programmatically split and resolved.
    *   Example: `ref:(?<grantha>[^:]+):(?<parts>.*)` to capture the grantha identifier and all subsequent parts.

*   **Update `parseReferences` logic:**
    1.  **Grantha Resolution**: The initial step of resolving the grantha ID (e.g., `तै.` to `taittiriya-upanishad`) using the existing global abbreviation map (`createAbbreviationMap`) remains unchanged.
    2.  **Structural Part Extraction**: The captured `parts` string (e.g., "आन. 2") will be split into individual components (e.g., `["आन.", "2"]`).
    3.  **Structural Part Resolution**: For each component:
        *   Attempt to parse the component as a number. If successful, use the number.
        *   If it's not a number, look up the component in the target grantha's `structureAliasMap` (which was created in `lib/data.ts`).
        *   If a matching alias is found, replace the alias string with its canonical numerical `value`. It's crucial to also verify that the `level` of the found alias matches the expected structural level for that part of the reference (e.g., the first part should resolve to `level: 1`, the second to `level: 2`, etc.).
        *   If a component cannot be resolved (neither a number nor a valid alias at the correct level), the reference will be marked as unresolvable or partially resolvable, potentially triggering an error state or fallback.
    4.  **Construct Canonical Reference**: Once all structural parts are resolved to their canonical numerical values, they will be reassembled with the grantha ID into the standard `grantha-id:1.2.3` format.

*   **`Reference` Data Structure**: The `Reference` interface might be extended to store both the original (aliased) parts and the resolved (canonical) parts, which could be useful for debugging or displaying the original reference alongside the resolved one.

### 3.4. Update `getPassageByRef` (`lib/data.ts`)

*   This function will continue to expect references in the canonical numerical format (e.g., `grantha-id:1.2.3`). Since `parseReferences` will now handle the conversion of aliased references into this canonical format, `getPassageByRef` should not require significant modifications.

### 3.5. Validation Scripts (`scripts/validate-data.ts`, `scripts/validate_data.py`)

*   These scripts are critical for data integrity and must be updated to validate the new `structureAliases` property:
    *   **Uniqueness**: Ensure that each `alias` is unique within its `level` for a given grantha to prevent ambiguity.
    *   **Consistency**: Verify that the `value` for each `structureAlias` actually corresponds to an existing `number` at the specified `level` within the grantha's `structure`. This prevents defining aliases for non-existent sections.

## 4. Example Flow for "तै.आन. 2"

1.  **Input Reference**: `ref:तै.आन. 2` (as found in markdown content).
2.  **`parseReferences` Execution**:
    *   The `referenceRegex` extracts `grantha = "तै."` and `parts = "आन. 2"`.
    *   `तै.` is resolved to `taittiriya-upanishad` using the global abbreviation map.
    *   The `taittiriya-upanishad` grantha data is loaded, including its `structureAliasMap`.
    *   The `parts` string "आन. 2" is split into `["आन.", "2"]`.
    *   `"आन."` is looked up in `taittiriya-upanishad`'s `structureAliasMap`. A match is found: `{ alias: "आन.", level: 1, value: "2" }`. The first structural part is resolved to `2`.
    *   `"2"` is already a number, so it's used directly as the second structural part.
    *   The reference is reassembled into the canonical form: `taittiriya-upanishad:2.2`.
3.  **`getPassageByRef` Call**: `getPassageByRef("taittiriya-upanishad:2.2")` is called to retrieve the passage content.

## 5. Advantages

*   **Flexibility**: Allows grantha maintainers to define custom, human-readable aliases for their internal structures.
*   **Readability**: Users can employ more traditional or intuitive reference formats.
*   **Maintainability**: Alias definitions are centralized within the grantha's JSON data, reducing hardcoding in logic.
*   **Extensibility**: The system can be easily extended to support more granular structural levels (e.g., `kanda.sarga.shloka`) by adding more `structureAliases` entries with appropriate `level` values.

## 6. Considerations

*   **Regex Complexity**: The `referenceRegex` in `lib/references.ts` will require careful design. A multi-step parsing approach (regex to extract high-level components, followed by programmatic resolution of sub-components) might be more robust than a single, overly complex regex.
*   **Ambiguity Handling**: Strict validation (via `structureAliases` and validation scripts) is crucial to prevent ambiguous aliases (e.g., two different aliases mapping to the same `level` and `value` within a grantha, or an alias mapping to a non-existent structure).
*   **Data Migration**: Existing grantha JSON files will need to be updated to include the new `structureAliases` property.
*   **Performance**: The creation and lookup in `structureAliasMap` should be efficient. Caching mechanisms for loaded grantha data (including its alias maps) are already in place and should mitigate any performance concerns.
