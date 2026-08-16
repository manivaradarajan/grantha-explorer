# Line-Break / Whitespace Normalization — Implementation Plan

**Status:** Proposed (awaiting implementation).
**Last updated:** 2026-08-16.
**Scope:** Rendering + normalization of commentary/gloss prose and mūla line
breaks across all reading surfaces (flow mode and 3-pane mode). No source
`.md` content changes in this phase; no converter changes in this phase.

---

## 1. Problem statement

The UI renders Sanskrit text with `white-space: pre-line`, so **every** literal
`\n` in the JSON becomes a hard line break. The JSON strings carry `\n` through
verbatim from `structured_md/`, and the source files are inconsistent:

- **Extra blank newlines** — stray blank lines in the source (between headings,
  speaker blocks, commentary tags, and inside commentary glosses).
- **Missing newlines** — genuinely missing paragraph separators in OCR-noisy
  texts (brihadaranyaka, chandogya, etc.), which run whole glosses as one long
  line.
- **Spurious mid-word breaks** — brihadaranyaka wraps prose at column width,
  breaking words mid-glyph (`…आत्मा` / `स्वरूपमित्यर्थः ।`).

The result is commentary that renders as jagged, arbitrarily wrapped lines, while
mūla (which *should* honor its line breaks) is actually already correct.

---

## 2. Corpus analysis (evidence gathered 2026-08-16)

The `structured_md` corpus falls into four regimes:

| Regime | Texts | Mūla line breaks | Commentary |
|---|---|---|---|
| **Verse** | gita, svetasvatara, mundaka, katha, kena, isavasya, mandukya-karika | source `\n` = pāda/hemistich (2 or 4 lines) | separate commentary block |
| **Prose** | brihadaranyaka, chandogya, kaushitaki, aitareya, prashna, taittiriya | one long line, `।` inline, `॥` at end | separate commentary block |
| **Sutra-bhāṣya** | sribhashya, vedanta-deepam, vedanta-sara | sutra + bhāṣya **combined**, paragraph-per-line, each ending `॥` | *none* — all content is passage mūla |
| *(mixed)* | katha/kena prose+verse; brahma-sutra quotes | both | — |

Key findings that shape the approach:

1. **Mūla `\n` is authoritative and correct.** Verse mūla has exactly one
   mid-verse `।` (hemistich = the break); prose mūla has no mid-verse `।` and
   needs no breaks. The source encodes this faithfully (gita = 2 lines,
   katha pada-pāṭha = 4 lines, brihadaranyaka prose = 1 line).
2. **Commentary is flowing prose.** Across ~1800 glosses, internal `॥` is a
   **quote-close**, not a paragraph break:
   - `…पुनस्तस्यैव भेषजम् ॥ एवं स हि शरीरस्थः…` (quoted śloka, prose continues)
   - `…न करोति हितं नृणाम् ॥ इति ॥ तत्र दृष्टान्तमाह —` (`॥ इति ॥`)
   - `…(भ.गी.३-१३) ॥ इति । तथा च श्रुतिः…` (citation + quote-close)
3. **`####` headings are unused** (0 occurrences corpus-wide) — the `^#### `
   → `<em>` transform is effectively dead, so collapsing newlines cannot lose a
   heading.
4. **`**bold**` is used heavily in commentary** (quoted mūla lemmas) and is
   inline-only. Collapsing whitespace does not break it; it *fixes* the case
   where `**…\n…**` currently fails the `\*\*(.*?)\*\*` transform (`.` doesn't
   match `\n`).
5. **Sutra-bhāṣya renders through the mūla path** (its content is passage
   content, not `commentary`), so leaving mūla untouched preserves its
   `\n\n` paragraph structure.
6. **Commentary renders in exactly two surfaces**: `CommentaryPanel.tsx`
   (panes mode — mobile/tablet/desktop) and `FlowReader.tsx` /
   `FlowReaderCompare.tsx` (flow mode). All commentary passes through
   `sanitizeCommentaryHtml` (`lib/stringUtils.ts`) **except** three raw sites
   (see §4.4).

---

## 3. Decision (user-confirmed 2026-08-16)

- **Commentary/gloss = flowing prose, no forced breaks.** Collapse all
  whitespace runs to single spaces. Dandas (`।`/`॥`) are punctuation and are
  **preserved** — they are the natural "periods" but render inline.
- **Mūla = validate only.** Source `\n` stays the sole authority; add a
  converter-side layout validator later (Phase 2). No derivation, no mūla edits.

Accepted tradeoff: chapter-intro paragraph gaps collapse into a single flowing
block. This is acceptable because intros are prose and the current gap behavior
is inconsistent anyway.

---

## 4. Phase 1 — Commentary as flowing prose (renderer-only)

No data or converter changes. Purely the display layer.

### 4.1 Add `collapseWhitespace` to `lib/stringUtils.ts`

```ts
/** Collapse all whitespace runs to a single space and trim the ends.

    Dandas (`।` / `॥`) are punctuation, not whitespace, so they are
    preserved verbatim. This turns commentary prose (which may contain
    incidental OCR line-wrapping) into a single flowing block.
*/
export const collapseWhitespace = (text: string): string =>
  text.replace(/\s+/g, " ").trim();
```

### 4.2 Fold it into `sanitizeCommentaryHtml`

In `sanitizeCommentaryHtml` (`lib/stringUtils.ts:39`), collapse whitespace
**before** the `**` → `<strong>` pass, so `**…\n…**` joins into a single span:

```ts
export const sanitizeCommentaryHtml = (text: string): string =>
  DOMPurify.sanitize(
    collapseWhitespace(text)
      .replace(/^#### (.+)$/gm, '…')      // (dead, retained for safety)
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-gray-900">$1</strong>')
  );
```

### 4.3 Normalize in `CommentaryPanel.tsx`

`CommentaryPanel.tsx` duplicates the transform inline at lines ~176 and ~201.
Apply `collapseWhitespace` to `commentary.intro` and `mainContent` before the
existing `####`/`**` replaces.

### 4.4 Route the three raw (non-sanitized) commentary sites through the same path

| Site | Current | Change |
|---|---|---|
| `FlowReader.tsx:830` (prefatory commentary) | raw `{item.content…}` | render via `sanitizeCommentaryHtml` |
| `FlowReaderCompare.tsx:154` (prefatory commentary) | raw `{item.content…}` | render via `sanitizeCommentaryHtml` |
| `CommentaryPanel.tsx:214` (prefatory commentary) | raw `{item.content…}` | `collapseWhitespace` (covered by §4.3) |

### 4.5 Drop `whitespace-pre-line` from commentary containers

Functionally moot once normalized, but correct and self-documenting:

- `FlowReader.tsx`: lines 739 (intro), 830, 836
- `FlowReaderCompare.tsx`: lines 154, 160
- `CommentaryPanel.tsx`: lines 186, 214, 222

### 4.6 Leave mūla untouched

Keep `whitespace-pre-line` on mūla containers (and intro containers that can
carry mūla):

- `FlowReader.tsx`: 747 (prefatory prose), 804 (mūla verse)
- `FlowReaderCompare.tsx`: 108 (intro), 247, 384 (mūla verse)
- `TextContent.tsx`: 214, 218 (3-pane mūla)

---

## 5. Phase 2 (separate, later) — Mūla layout validator

Converter-side check, mirrored in **both** converters per the data-flow sync
rule (`docs/DATA_FLOW.md` §1 and `grantha-data/docs/DATA_FLOW.md`):

- `scripts/convert_structured_md.py` (consumer)
- `grantha-data/tools/lib/grantha_converter/md_to_json.py` (producer)

Rules:

- Verse mūla with exactly one mid-verse `।` ⇒ expect exactly 2 lines.
- Prose mūla (no mid-verse `।`) ⇒ expect exactly 1 line.
- Flag any drift (pada-pāṭha 4-line verses, mismatched line counts) as a
  warning, never an error.

No derivation, no mūla content edits.

---

## 6. Verification

- `npx tsc --noEmit`
- `npm run lint`
- Manual, in both flow and panes mode:
  - Gita 2.71 — was 3 jagged lines → now 1 flowing paragraph.
  - Brihadaranyaka 3.1.1 — OCR mid-word wrapping gone.
  - A Brahma-sutra (e.g. sribhashya 1.1.1) — `\n\n` paragraphs intact.
  - A mūla verse (gita 2.1) — 2 hemistich lines unchanged.
  - Katha 1.1.18 — 4-line pada-pāṭha unchanged.

---

## 7. Known tradeoffs (accepted)

- Chapter-intro paragraph gaps collapse to a single flowing block.
- OCR hyphen-breaks leave a trailing hyphen+space (e.g. `…निर्विशेष- ` +
  `वस्तु`). Editorial concern; deferred to the grantha-data cleanup passes.
- `sanitizeCommentaryHtml` collapses whitespace for *all* commentary surfaces,
  including any future surface that might want `pre-line` — intentional, since
  commentary is prose by definition.

---

## 8. Final review (skeptical second pass)

- **Blank-line paragraphs in sutra-bhāṣya are safe** because that text flows
  through the mūla path (passage content), which this plan does not touch.
  Re-verified against `sribhashya-01-01.md` (sutra 1.1.1 content spans many
  `\n\n`-separated paragraphs).
- **`collapseWhitespace` will not eat dandas** — `\s` matches only whitespace;
  `।` (U+0964) and `॥` (U+0965) are not whitespace. This is the linchpin of the
  plan and is safe.
- **`**…\n…**` join is an improvement, not a regression** — currently such bold
  is silently left literal; after the change it renders as `<strong>`.
- **Three raw sites** (`FlowReader.tsx:830`, `FlowReaderCompare.tsx:154`,
  `CommentaryPanel.tsx:214`) would otherwise keep `\n` and look inconsistent
  next to normalized glosses; they are explicitly covered in §4.4.
- **Order of operations in `sanitizeCommentaryHtml`** matters: collapse before
  the `**` pass. Called out explicitly in §4.2.
- **No off-by-one / boundary concern** — pure string transform; empty string is
  handled (`\s+` matches nothing → returns `""`).
- **`pre-line` removal on intro containers** (`FlowReader.tsx:739`,
  `FlowReaderCompare.tsx:108`) is safe because those intros are commentary
  prose, never mūla (mūla intros go through the mūla containers in §4.6).
  Double-checked `FlowReader.tsx:747` is prefatory *content* (mūla prose) and is
  intentionally left with `pre-line`.
