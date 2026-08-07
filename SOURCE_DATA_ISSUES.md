# Source Data Issues

Defects found in source files in the **grantha-data** repository during
converter development (`scripts/convert_structured_md.py`). These are errors
in the source files, not in the converter. The converter handles each case
gracefully; these entries exist so the source can be corrected when convenient.

All paths below are relative to the `grantha-data` repository root.

---

## 1. Chandogya Upanishad — duplicate `part_num` in files 06 and 07

**Priority: Actionable.** Simple two-line fix, low risk.

### Affected files

```
structured_md/upanishads/chandogya/chhandogya-upanishad-rangaramanuja-06-01-01.md
structured_md/upanishads/chandogya/chhandogya-upanishad-rangaramanuja-07-01-01.md
```

### What is wrong

Both files declare `part_num: 1` in their YAML frontmatter. File 06 begins at
Mantra 6.1.1 (the Śvetaketu narrative opening chapter 6); file 07 begins at
Mantra 7.1.1 (the Nārada/Sanatkumāra dialogue opening chapter 7). The correct
sequential values are `part_num: 6` and `part_num: 7` respectively. All other
chandogya files (01–05, 08) carry correct, unique `part_num` values.

### What the converter does

Detects the non-unique `part_num` set across a text's files, emits a WARNING,
and falls back to alphabetical filename order. Since `06` sorts before `07`,
the output part files are generated in correct reading order (6.1.1 before
7.1.1). The staged output is functionally correct despite the source error.

### Correct fix

In each file's YAML frontmatter, change the `part_num` line:

```
chhandogya-upanishad-rangaramanuja-06-01-01.md:  part_num: 1  →  part_num: 6
chhandogya-upanishad-rangaramanuja-07-01-01.md:  part_num: 1  →  part_num: 7
```

After this fix the converter's primary sort (by `part_num`) works for chandogya
and the fallback WARNING no longer appears.

---

## 2. Brihadaranyaka Upanishad — `<!-- /hide -->` used as Sanskrit block close tag in 8 passages

**Priority: Low.** Purely cosmetic; no functional impact on converter output.

### Affected files and passages

```
structured_md/upanishads/brihadaranyaka/brihadaranyaka-upanishad-rangaramanuja-03-01-01.md
  — passages 3.2.2, 3.3.1

structured_md/upanishads/brihadaranyaka/brihadaranyaka-upanishad-rangaramanuja-04-01-01.md
  — passages 4.1.11, 4.4.7, 4.4.8, 4.5.5

structured_md/upanishads/brihadaranyaka/brihadaranyaka-upanishad-rangaramanuja-05-01-01.md
  — passage 5.2.5

structured_md/upanishads/brihadaranyaka/brihadaranyaka-upanishad-rangaramanuja-08-01-01.md
  — passage 8.1.8
```

### What is wrong

These 8 passages close their `<!-- sanskrit:devanagari -->` block with
`<!-- /hide -->` instead of the standard `<!-- /sanskrit:devanagari -->` used
everywhere else. Example (passage 3.2.2):

```
<!-- sanskrit:devanagari -->

\*\*आपो वा अर्कः । तद् यदपां शर आसीत्...॥२॥

<!-- /hide -->               ← should be <!-- /sanskrit:devanagari -->
```

In all 8 cases the Sanskrit content is plain text with no nested tags between
the open and the erroneous close, so the wrong tag does not cause truncation.

### What the converter does

After the primary pattern (`<!-- /sanskrit:devanagari -->`) fails to match
within the segment, falls back to `_ANY_HTML_CLOSE_RE` (matches any
`<!-- /... -->` tag) as the close boundary. Extracts the correct Sanskrit text
in all 8 cases. Converter output for these passages is expected to match the
live brihadaranyaka JSON; verification pending the full diff-against-legacy
review.

### Correct fix

In each affected passage, replace the Sanskrit block's `<!-- /hide -->` close
tag with `<!-- /sanskrit:devanagari -->`. Note: these passages also contain
legitimate `<!-- /hide -->` tags inside their commentary blocks (closing
`<!-- hide type:... -->` annotation markers); only the Sanskrit-block close
tag needs to change.
