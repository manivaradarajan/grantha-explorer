**Memorized Plan:**

- **`grantha.schema.json`:** The source of truth for a complete, single-file text and the provider of common definitions (like `passage`, `commentary`) via `$ref`.
- **`grantha-envelope.schema.json`:** Defines the `metadata.json` file for a multi-part text. Contains all grantha-level metadata and a `parts` array listing the content files. It has no content itself.
- **`grantha-part.schema.json`:** Defines the `partN.json` content files. Contains the actual `passages` and `commentaries` arrays, along with identifiers (`grantha_id`, `part_num`) to link back to the envelope. It has no high-level metadata.

With this contract established, we can now move from architectural design to a concrete implementation roadmap. The next step is to build the tools and processes that will create and consume data conforming to these new schemas.

Here is the plan, broken down into a sequence of actionable engineering tasks.

---

### Phase 1: Foundational Tooling (Schema & Parser)

This phase is about building the core components. We cannot proceed to automation until these are solid.

**Task 1.1: Draft and Finalize the Schema Files**
This is the immediate next step. We must formalize our contract before writing any code that depends on it.

- **Your Role (Project Architect):** Review and approve the schemas. Ensure they capture all necessary fields and relationships. This is the last chance for easy architectural changes.
- **My Role (Technical Consultant):** I will immediately draft the following three files for your review:
  1.  A **refactored `grantha.schema.json`**, extracting common types into a `definitions` block.
  2.  The new **`grantha-envelope.schema.json`**.
  3.  The new **`grantha-part.schema.json`**.
      I will present these in our next interaction.

**Task 1.2: Implement the `raw_to_structured_md.py` Parser**
This is the most complex piece of new code. We will build it to target the Bṛhadāraṇyaka Upaniṣad format specifically, making it robust for that known input.

- **Your Role (Project Architect):** Provide any additional raw MD files that might have slightly different formatting, so I can account for variations. Monitor the output to ensure it matches your editorial standards.
- **My Role (Technical Consultant):** I will write a Python script that:
  1.  Parses the `bRhadAraNyakopaniSat-tRtIya.md` file.
  2.  Uses heuristics (bolding, verse markers `।। N ।।`, `प्र.–` prefix) to distinguish mūla text from the Raṅgarāmānuja commentary.
  3.  Maintains a state machine to correctly generate hierarchical references (`3.1.1`, `3.1.2`, etc.).
  4.  Generates a new `part3.md` file that conforms **exactly** to the format of your existing `isavasya-all.md` (frontmatter, HTML comments, interleaved commentaries).

---

### Phase 2: Integrating with the Existing Toolchain

Once we can generate the new file formats, we must teach our existing system how to understand them.

**Task 2.1: Update the Build-Time Indexer (`generate-granthas-json.ts`)**
This script currently assumes a flat file structure. It needs to be upgraded to handle the new directory structure for multi-part texts.

- **Your Role (Project Architect):** Define the final directory structure in `public/data/library/` for multi-part texts. The proposal (`.../brihadaranyaka-upanishad/metadata.json`, `.../part1.json`) seems correct.
- **My Role (Technical Consultant):** I will provide the modified TypeScript code for `generate-granthas-json.ts` that:
  1.  Recursively scans the `public/data/library` directory.
  2.  If it finds a standalone `.json` file, it treats it as a single-file grantha (current behavior).
  3.  If it finds a directory, it reads the `metadata.json` inside to get the title and ID for the main `granthas.json` index, correctly identifying it as an available text.

**Task 2.2: Design the Data-Fetching Logic for the Web App**
The front-end can no longer assume that `getGrantha(id)` fetches a single file.

- **Your Role (Project Architect):** Confirm the desired user experience (e.g., should the app load all parts of a large text at once, or lazy-load them as the user scrolls?). The PRD suggests lazy-loading, which is the right call for performance.
- **My Role (Technical Consultant):** I will provide a clear plan and pseudocode for the application's data repository layer. The `getGrantha()` function will need to be updated to:
  1.  Fetch the `granthas.json` index.
  2.  When a user selects a grantha, the logic checks if its entry corresponds to a file or a directory.
  3.  If it's a directory, it fetches the `metadata.json` first, then fetches `partN.json` files on demand. It will be responsible for transparently merging the content from these parts into a single, unified view for the UI.
