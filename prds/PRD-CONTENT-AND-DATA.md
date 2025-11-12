## 6. Content & Data Requirements

### 6.1 Texts Included (Phase 0)

**10 Principal Upanishads:**

1. Isha Upanishad
2. Kena Upanishad
3. Katha Upanishad
4. Mundaka Upanishad
5. Mandukya Upanishad
6. Aitareya Upanishad
7. Taittiriya Upanishad
8. Chandogya Upanishad
9. Brihad Aranyaka Upanishad
10. Svetasvatara Upanishad

**Additional Upanishads in Visistadvaita Tradition:**

- Kausitaki Upanishad
- Maitri Upanishad
- Others as determined by Visistadvaita school textual canon

---

### 6.2 Commentaries (Phase 0)

**Phase 0: Commentaries on Primary Texts Only**

All three Visistadvaita bhashyas included for all Principal Upanishads and additional texts:

- **Vedanta Desika Bhashya** (Visistadvaita Vedanta perspective)
- **Rangaramanuja Bhashya** (Visistadvaita Vedanta perspective)
- **Kuranarayana Bhashya** (Visistadvaita Vedanta perspective)

Commentaries are NOT selectable as independent granthas in Phase 0 (primary texts only selectable from grantha selector).

**Phase 1+ Enhancement:**

- Commentaries will become selectable as granthas themselves
- Will enable "commentary on commentary" (e.g., Tatparya Chandrika on Ramanuja's Gita Bhashya)
- Meta-commentaries will be structured as granthas with their own commentaries

---

### 6.3 Languages & Scripts (Phase 0)

**Sanskrit:**

- **Script (Phase 0):** Devanagari only
  - Unicode U+0900–U+097F
  - Web font or system font with fallback
  - Font loads reliably; special characters render correctly
- **Script conversion (Phase 1+):** Roman (IAST) and Kannada support is deferred. The corresponding data fields (`roman`, `kannada`) may be present in the JSON schema but should be considered optional and may be `null`.
- **Source:** Best available digital versions (may not all be from formally published critical editions)
- **Quality:** All Sanskrit verified for basic accuracy and completeness; known gaps noted in metadata
- **Storage:** Sanskrit is stored in Devanagari. This field may be `null` in cases where content is not available (e.g., a commentary does not cover a specific verse). No client-side conversion is needed in Phase 0.

**English:**

- **Phase 0:** No English translations are required. The `english_translation` field is optional and may be `null` or an empty string.
- **Phase 1+:** English translations and commentaries will be added.

**Multi-Script Support (Phase 1+):**

- Roman (IAST): Standard ASCII + combining diacritics (ā, ī, ū, ṁ, ḥ, ñ, ṭ, ḍ, etc.)
- Kannada: Unicode U+0C80–U+0CFF; appropriate Unicode-supporting font
- Client-side script conversion (on demand)

---

### 6.4 Content Structure & Passage References

**Passage Reference Scheme:**

- Passages identified by explicit `ref` field (not inferred from hierarchy)
- Arbitrary depth: e.g., "1.1", "2.3.4", "2.3.4.5" (variable depth)
- Refs are hierarchical but stored as strings. Both simple integer strings (e.g., "1", "2") and dot-notation strings (e.g., "1.1", "1.2.1") are acceptable formats.
- Examples:
  - Isha Upanishad: refs like "0.0" (prefatory), "1.1", "1.2", etc.
  - Brihad Aranyaka: refs like "0.0" (prefatory), "1.1.1", "1.1.2", "1.2.1", etc.

**Passage Metadata:**

- `ref`: Unique reference (e.g., "1.1")
- `passage_type`: "main" | "prefatory" | "concluding"
- `content`: Object containing Sanskrit and English
  - `sanskrit`: Object with `devanagari` (Phase 0), `roman` (Phase 1+)
  - `english_translation`: String (primary English translation)
- `variants` (if applicable): Object mapping variant names to alternate Sanskrit
  - Example: `{"canonical": {...}, "shakha_1": {...}}`
- `footnotes` (optional): Array of footnote objects related to this passage

**Variant Readings:**

- Variants may exist at text level (entire Upanishad recension) or passage level (specific verses have variants)
- Each variant identified by name (e.g., "canonical", "shakha_1", "shakha_2")
- Variant indicated by badge "ⓘ" next to verse number
- When viewing variant, primary text updates; commentary stays on canonical

**Prefatory Material:**

- Refs: "0.0", "0.1", "0.2", etc. (unnumbered in source, given refs starting at 0.0)
- Examples: Shanti Mantras (invocations), introductory verses
- Located at top of text structure in left nav
- Always visible, never hidden

**Concluding Material:**

- Refs: Follow the final main verse; e.g., if final verse is "3.5", concluding might be "3.6" or similar (or separate numbering)
- Examples: Benedictions, closing mantras
- Located at end of text structure

**Commentary Alignment:**

- Each commentary passage has `ref` matching the primary text verse it explains
- Commentaries may have `prefatory_material` (e.g., intro remarks before explaining verse)
- Commentaries may be split across multiple files (e.g., Brihad Aranyaka commentary in 5 JSON files)
- Data layer handles file boundaries transparently (no user awareness)

---

### 6.5 Passage Fragments

**Fragment Definition:**

- First ~50 characters of passage text
- Displayed in left nav next to verse number (e.g., "Mantra 1 - ईशावास्यमिदँ सर्वं...")
- Truncated with "..." if longer
- Displays in user's currently selected script (updates when script changes)

---

### 6.6 Cross-References

**Reference Format:**

- Sanskrit: Abbreviated form (e.g., "बृ.उ. 6-4-22") or full form (e.g., "Brihad Aranyaka 6.4.22")
- English: Full form (e.g., "Brihad Aranyaka 6.4.22")
- Appear in primary text and commentary

**Reference Resolution:**

- Abbreviations mapped to grantha IDs (e.g., "बृ.उ." → "brihad_aranyaka")
- Reference `ref` normalized to internal format (e.g., "6-4-22" → "6.4.22")
- References linked to actual passages in library
- If target passage doesn't exist, reference may be marked as "not yet in library"

**Intra-Grantha References:**

- References to other verses in same text (e.g., "See 1.3" within Isha commentary)
- On desktop: Hover shows tooltip preview (no navigation)
- On mobile: Tap navigates (no tooltip)

---

### 6.7 Footnotes

**Footnote Preservation:**

- Footnotes from original OCR'd or source texts preserved as editorial additions
- NOT interactive (not part of primary content)
- Types: variant readings, editorial notes, cross-references, explanations

**Footnote Structure:**

- `id`: Unique footnote identifier (e.g., "fn_1", "fn_2")
- `applies_to`: Passage ref(s) this footnote relates to (can be array for multi-verse footnotes)
- `type`: "variant_reading" | "editorial_note" | "explanation" | "cross_reference"
- `content`: Footnote text (Sanskrit + English if applicable)

**Footnote Display:**

- Superscript markers in text (e.g., "[1]")
- Click/tap shows tooltip or sidebar with footnote content
- Marked as editorial (users understand these are not sacred text)

---

### 6.8 Content Quality Standards

**Source Verification (Phase 0):**

- Texts sourced from best available digital versions
- May not all be from formally published critical editions
- All texts verified for basic accuracy and completeness
- Known gaps, quality issues, or source limitations noted in metadata
- As higher-quality authoritative editions become available, texts will be updated

**Accuracy:**

- Sanskrit verified for accuracy against source versions
- No obvious OCR errors or typos; basic proofreading applied
- Transliterations (if any Roman versions appear in future) must match Devanagari

**Completeness:**

- All 10 Principal Upanishads included with:
  - Primary Sanskrit text (Devanagari, complete)
  - All three Visistadvaita bhashyas in Sanskrit (Devanagari, complete)
- No passages skipped; if unavailable, marked "forthcoming" with explanation
- No English translations in Phase 0 (noted in metadata)

**Consistency:**

- Verse/passage reference scheme consistent across all texts
- Formatting (bold, italics, links) applied consistently
- Metadata (source, version, date, commit) provided for all content
- All three commentaries follow same editorial standards

**Auditability:**

- Processing pipeline documented and versioned
- Source texts tracked in version control (GitHub)
- LLM prompts and processing rules versioned
- Manual corrections logged with timestamps and rationale
- Provenance metadata included with each grantha/commentary
- Source quality and any known limitations clearly noted

---

### 6.9 Provenance & Source Tracking

**Metadata for Each Grantha:**

- `source_url`: GitHub repository URL or publication source
- `source_commit`: Git commit hash (if version-controlled)
- `source_file`: Original file(s) (e.g., "texts/isha_upanishad_part1.json")
- `processing_pipeline`:
  - `ocr_tool`: If OCR used (e.g., "tesseract v5.3")
  - `ocr_date`: Date of OCR
  - `llm_model`: Model used for processing (e.g., "gemini-pro")
  - `llm_prompt_version`: Version of LLM prompt (e.g., "v2.1")
  - `llm_date`: Date of LLM processing
  - `processor`: Person or system that ran processing
- `quality_notes`: Human review status, known issues, etc.
- `last_updated`: ISO timestamp of last modification

**Metadata for Each Commentary:**

- `commentator`: Name of original commentator (e.g., "Vedanta Desika")
- `commentary_source`: Which edition/publication used
- `translator` (if translated): Name of English translator
- `translation_source`: Publication info for translation
- Same provenance structure as primary texts

**Metadata for Translations:**

- `translator`: Name of translator or "Compiled from [source]"
- `translation_source`: Publication details
- `version`: Edition or version number
- `copyright_status`: "Public domain" | "Fair use" | "Licensed" (with license info)

---

### 6.10 Data Storage & Organization

**File Organization:**

- Texts organized by grantha (e.g., `/texts/isha_upanishad/`)
- Large texts may be split across multiple JSON files (e.g., `/texts/brihad_aranyaka/part1.json`, `part2.json`, etc.)
- Split points at verse boundaries to preserve integrity
- Example file boundaries: Brihad Aranyaka split at "2.3.5" | "2.4.1", etc.

**Data Format:**

- Format: JSON (human-readable, version-controllable, API-friendly)
- Encoding: UTF-8
- Schema: See Section 6.11 below

**Version Control:**

- All text data in Git (GitHub or equivalent)
- Commits track changes with descriptive messages
- Branching for work-in-progress (e.g., `add/ramanuja-commentary`)
- Tags for releases (e.g., `v0.1-alpha`)

---

### 6.11 Data Schema (JSON Format)

**Top-Level Grantha Object:**

```json
{
  "grantha_id": "isha_upanishad",
  "canonical_title": "Isha Upanishad",
  "aliases": [
    {
      "alias": "Ishopanishad",
      "scope": "full_text"
    }
  ],
  "text_type": "upanishad",
  "language": "sanskrit",
  "metadata": {
    "source_url": "https://github.com/...",
    "source_commit": "abc123def456",
    "source_file": "texts/isha_upanishad.json",
    "processing_pipeline": {
      "ocr_tool": "tesseract v5.3",
      "ocr_date": "2025-01-10",
      "llm_model": "gemini-pro",
      "llm_prompt_version": "v2.1",
      "llm_date": "2025-01-15",
      "processor": "name@example.com"
    },
    "quality_notes": "Human reviewed passages 1.1-1.15",
    "last_updated": "2025-01-15T10:30:00Z"
  },
  "variants_available": ["canonical", "shakha_1"],
  "prefatory_material": [
    {
      "ref": "0.0",
      "passage_type": "prefatory",
      "label": "Shanti Mantra",
      "content": {
        "sanskrit": {
          "devanagari": "ॐ शान्तिः शान्तिः शान्तिः",
          "roman": null
        },
        "english_translation": null
      }
    }
  ],
  "passages": [
    {
      "ref": "1.1",
      "passage_type": "main",
      "variants": {
        "canonical": {
          "sanskrit": {
            "devanagari": "ईशावास्यमिदँ सर्वं...",
            "roman": null
          },
          "english_translation": null
        },
        "shakha_1": {
          "sanskrit": {
            "devanagari": "[alternate text]"
          }
        }
      },
      "footnotes": [
        {
          "id": "fn_1",
          "applies_to": ["1.1"],
          "type": "variant_reading",
          "content": {
            "sanskrit": {
              "devanagari": "कतिपये पाठान्तरे...",
              "roman": "katipaye pāṭhāntare..."
            },
            "english": "In some manuscripts this reads..."
          }
        }
      ]
    },
    {
      "ref": "1.2",
      "passage_type": "main",
      "content": {
        "sanskrit": {
          "devanagari": "कुर्वन्नेवेह कर्माणि..."
        }
      }
    }
  ],
  "concluding_material": [
    {
      "ref": "1.18",
      "passage_type": "concluding",
      "label": "Shanti Mantra",
      "content": {
        "sanskrit": {
          "devanagari": "ॐ शान्तिः शान्तिः शान्तिः"
        }
      }
    }
  ],
  "commentaries": [
    {
      "commentary_id": "vedanta_desika",
      "commentary_title": "Vedanta Desika Bhashya",
      "commentator": "Vedanta Desika",
      "commentary_source": "[Publication details]",
      "metadata": {
        "translator": "[Name of English translator]",
        "translation_source": "[Publication details]",
        "source_url": "https://github.com/...",
        "source_commit": "xyz789",
        "last_updated": "2025-01-15T10:30:00Z"
      },
      "passages": [
        {
          "ref": "1.1",
          "prefatory_material": [
            {
              "type": "commentary_intro",
              "label": "Introductory remarks",
              "content": {
                "sanskrit": {
                  "devanagari": "तत्र प्रथमम्...",
                  "roman": "tatra prathamam..."
                },
                "english": "First, the commentator remarks..."
              }
            }
          ],
          "content": {
            "sanskrit": {
              "devanagari": "[Full commentary Sanskrit]",
              "roman": "[Full commentary Roman]"
            },
            "english": "[Full commentary English translation]"
          }
        }
      ]
    },
    {
      "commentary_id": "rangaramanuja",
      "commentary_title": "Rangaramanuja Bhashya",
      "commentator": "Rangaramanuja",
      "[same structure as above]"
    }
  ]
}
```

---

### 6.12 Multi-File Text Organization

**Rationale for Multi-File Splits:**

- Large texts (e.g., Brihad Aranyaka) split across multiple files for practical LLM processing
- Split points determined by chapter boundaries and file size limits (~150K Unicode characters per file)
- File boundaries may not align with top-level text divisions

**Example: Brihad Aranyaka Multi-File Structure:**

```
/texts/brihad_aranyaka/
  ├─ part1.json (Adhyaya 1, sections 1.1-1.4)
  ├─ part2.json (Adhyaya 1-2, sections 1.5-2.3)
  ├─ part3.json (Adhyaya 2-3, sections 2.4-3.x)
  └─ metadata.json (text-level metadata, references all parts)
```

**Data Layer Responsibility:**

- Transparently concatenate multi-file granthas
- Handle cross-part references correctly
- Load only needed parts (lazy loading) to optimize performance

---

### 6.13 Aliases & Cross-Text References

**Aliases:**

- Some texts known by multiple names (e.g., "Mahanarayana" also called "Taittiriya Narayana")
- Aliases stored in grantha metadata with scope:
  - `"scope": "full_text"` (alias for entire text)
  - `"scope": "passages_3.1:3.10"` (alias for specific passage range)

**Reference Normalization:**

- Abbreviations mapped to canonical grantha IDs
- Example mappings:
  - "बृ.उ." → "brihad_aranyaka"
  - "छ.उ." → "chandogya_upanishad"
  - "ईशा" → "isha_upanishad"
- Refs normalized to dot-separated format (e.g., "6-4-22" → "6.4.22")

---

### 6.14 Content Updates & Versioning

**Update Process:**

1. New content created in feature branch
2. LLM prompts and processing documented
3. Content validated (manual spot-check, cross-reference verification)
4. Pull request with description of changes
5. Peer review (if possible)
6. Merge to main branch
7. Tag with version (e.g., `v0.1.1-patch`)

**Version Numbering:**

- Format: `v[major].[minor].[patch]`
- Example: `v0.1.0` (first alpha), `v0.2.0` (beta), `v1.0.0` (production)
- Version tied to specific git commit

---

### 6.15 Data Access & Retrieval (API Layer)

**Data Layer Abstraction:**

- App never directly imports JSON files
- All data access via repository interface:
  ```
  getGrantha(grantha_id, variant?: string): Promise<GranthaData>
  getPassage(grantha_id, ref): Promise<Passage>
  getCommentary(grantha_id, commentary_id): Promise<Commentary>
  searchPassages(query): Promise<Passage[]>  // Phase 1+
  ```

**Implementation Options (Transparent to UI):**

- Phase 0: JSON files (local or served from CDN)
- Phase 1+: Database (PostgreSQL, Firebase, etc.)
- Phase 2+: Elasticsearch or similar for full-text search

---

### 6.16 Analytics & Tracking (Phase 1+)

**Deferred to Phase 1:**

- No analytics in Phase 0
- Phase 1 will include privacy-respecting analytics:
  - Which texts viewed most frequently
  - Which verses accessed most
  - Which commentaries selected most
  - Session duration, navigation patterns
- All analytics anonymized; no personal data collected
