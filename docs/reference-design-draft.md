# Reference Design Draft

Candidate design from a prior session. Not to be consulted during Phase 1 investigation. Introduced only at the start of Phase 2 as a design to stress-test.

---

## 1. The New Multi-Category Mental Model

The user is a serious scholar doing sustained study. Their mental model:

> "I am in Grantha Explorer. I open the app and first see what's available, organized by category.
> I filter to a collection I care about, pick a text, and read. When I'm in a text, I know what kind
> of text it is (its *type*), and I can return to browsing whenever I want."

Three distinct concepts must be communicated clearly:

1. **Category** (रामानुजश्रीसूक्तयः) — a user-facing grouping; a text may belong to many; used for
   discovery/filtering.
2. **Text / Work** (श्रीभाष्यम्) — a single grantha the user opens and reads.
3. **Structural subdivision** (अध्यायः → पादः → अधिकरणम् → सूत्रम्) — the existing in-text hierarchy,
   already handled by `structure_levels`.

The wordmark uses **text type** (उपनिषत्, ब्रह्मसूत्रभाष्यम्), a fourth, intrinsic property —
deliberately not the category, so it stays unambiguous when a text belongs to several categories.

## 2. Settled UX Decisions

1. **Category selection = filter chips on the landing page only.** Subtle outlined pills.
2. **No "All" chip.** No chip selected = all texts shown. Chips are single-select in v1
   (clicking the active chip deselects it → back to "all").
3. **Category display name for Rāmānuja's works:** `रामानुजश्रीसूक्तयः` (IAST: *Rāmānujaśrīsūktayaḥ*).
4. **Landing page is the default entry point** (no hash → landing page). Deliberate change from the
   current direct-to-reading behavior.
5. **Chips appear ONLY on the landing page.** The reading view's grantha selector remains a flat
   list of all texts with no chips/sections. Category switching during a session = go home → filter →
   pick.
6. **Returning to the landing page is a clean slate** — no category chip is pre-selected.
7. **Landing page text list shows text name only** (Devanagari), no edition/commentary metadata.
8. **Wordmark shows the active text's `text_type`** in Devanagari (e.g. `ग्रन्थपरिशीलकः > उपनिषत्`),
   and the brand word `ग्रन्थपरिशीलकः` is clickable in reading view to return to the landing page.
9. **The data model is tag-aware from day one**: `categories: string[]` per text (overlapping
   allowed), even though the v1 filter UI is single-select.

## 3. Final State Machine

```
                    ┌──────────────────────────────┐
         first       │                              │
  ┌─────▶ visit      │   LANDING PAGE               │
  │                  │   hash: ""                   │
  │                  │   granthaId: null            │
  │                  │                              │
  │                  │   [chip] [chip] [chip]       │
  │   click          │   ─────────────────────────  │
  │   brand          │   text1                      │
  │   (wordmark)     │   text2                      │
  │                  │   ... (flat, filtered)       │
  │                  │                              │
  │                  └──────────┬───────────────────┘
  │                             │ select text
  │                             │ updateHash(id, "1")
  │                             ▼
  │                  ┌──────────────────────────────┐
  │                  │                              │
  │   clearHash()    │   READING VIEW               │
  │  ◀────────────── │   hash: #granthaId:ref       │
  │                  │                              │
  │                  │   ┌──────┬─────────┬───────┐ │
  │                  │   │ nav  │  text   │ com   │ │
  │                  │   │      │(+sel.)  │       │ │
  │                  │   └──────┴─────────┴───────┘ │
  │                  │                              │
  │   deep link      │   wordmark: brand > type     │
  └─────────────────▶│                              │
                     └──────────────────────────────┘
```

- **First visit** (no hash) → landing page.
- **Deep link** (hash present) → reading view directly; no landing-page flash.
- **Wordmark brand click** → `clearHash()` → landing page (clean slate).
- **Text selection on landing** → `updateHash(id, "1")` → reading view.
- **GranthaSelector in reading view** → flat list of all texts, no chips.

## 4. Component & Data Architecture

### 4.1 New config file: `public/data/categories.json`

Single source for category definitions, text-type display labels, and text↔category assignments.

```jsonc
{
  "categories": [
    { "id": "upanishads", "deva": "उपनिषदः", "iast": "Upaniṣadaḥ", "order": 1 },
    { "id": "ramanuja", "deva": "रामानुजश्रीसूक्तयः", "iast": "Rāmānujaśrīsūktayaḥ", "order": 2 }
  ],
  "text_type_labels": {
    "upanishad": { "deva": "उपनिषत्" },
    "brahma-sutra-bhashya": { "deva": "ब्रह्मसूत्रभाष्यम्" },
    "gita-bhashya": { "deva": "गीताभाष्यम्" },
    "prakarana": { "deva": "प्रकरणम्" },
    "smriti": { "deva": "स्मृतिः" },
    "sutra": { "deva": "सूत्रम्" },
    "purana": { "deva": "पुराणम्" },
    "stotra": { "deva": "स्तोत्रम्" },
    "other": { "deva": "ग्रन्थः" }
  },
  "text_categories": {
    "isavasya-upanishad": ["upanishads"],
    "kena-upanishad": ["upanishads"],
    "sribhashya": ["ramanuja"],
    "vedanta-deepam": ["ramanuja"],
    "vedanta-sara": ["ramanuja"],
    "gita-bhashyam": ["ramanuja"],
    "vedarthasangraha": ["ramanuja"]
  }
}
```

### 4.2 `GranthaMetadata` changes (`lib/data.ts`)

```typescript
export interface GranthaMetadata {
  id: string;
  path: string;
  title: string;
  title_deva: string;
  title_iast: string;
  editions?: EditionStub[];
  categories: string[];        // NEW — stamped from categories.json text_categories
  text_type_display?: string;  // NEW — Devanagari label resolved from text_type
}
```

### 4.3 Indexer changes (`scripts/generate-granthas-json.ts`)

- Read `categories.json` alongside `granthas-meta.json` and `granthas-order.json`.
- For each discovered `grantha_id`, stamp `categories` from `text_categories` (default `[]`).
- Resolve `text_type` into `text_type_display` via `text_type_labels` (fallback: raw value).
- `granthas-order.json` remains the flat ordering for the "all texts" view. Not superseded.
- Graceful degradation: missing `categories.json` → `categories: []`, raw `text_type_display`;
  the app must still function.

### 4.4 Hook changes

- `hooks/useVerseHash.ts`: return type becomes `granthaId: string | null`,
  `verseRef: string | null`; `getInitialState` writes no default hash when empty; `handleHashChange`
  sets the null state on empty/`"#"` hash; add `clearHash()` → `window.location.hash = ""`;
  `updateHash` unchanged.
- `hooks/useGranthaLoader.ts`: add `enabled: !!granthaId` so the query does not fire when no
  grantha is selected. All other behavior unchanged.

### 4.5 `page.tsx` changes

- Call `useVerseHash(null, null)`; keep `useAvailableGranthas()` at top level.
- Maintain `selectedCategoryId: string | null` (landing-page-only, NOT in URL).
- If `granthaId` is null → render `LandingPage`; else render the existing reading layouts. Order of
  guards: landing check BEFORE the `isGranthaLoading` guard.
- Derive `text_type_display` for the wordmark from the active grantha's metadata; thread new wordmark
  props through `MobileLayout` and `TabletLayout`.

### 4.6 New component: `LandingPage`

```
┌──────────────────────────────────────┐
│                                      │
│          ग्रन्थपरिशीलकः              │  ← static wordmark, no breadcrumb
│                                      │
│    ┌────────────────────────────┐   │
│    │ उपनिषदः  रामानुजश्रीसूक्तयः │   │  ← subtle outlined pills
│    └────────────────────────────┘   │     single-select, no chip = all
│                                      │
│    ────────────────────────────────  │
│                                      │
│    ईशावास्योपनिषत्                   │  ← flat text list, Devanagari
│    केनोपनिषत्                        │     name only; click → reading
│    कठोपनिषत्                         │
│    ...                              │
└──────────────────────────────────────┘
```

Props: `granthas`, `categories`, `selectedCategoryId`, `onCategoryChange`, `onGranthaSelect`.
Behavior: no chip → all texts in order; chip active → only texts whose `categories` include it;
clicking active chip deselects; text click → `onGranthaSelect(id)` → `updateHash(id, "1")`.
Responsive by construction; chips are outlined pills, subtle border, faint tint when active, no
color coding.

### 4.7 Modified component: `AppWordmark`

```typescript
interface AppWordmarkProps extends React.ComponentPropsWithoutRef<"span"> {
  className?: string;
  textTypeDeva?: string;     // breadcrumb segment, e.g. "उपनिषत्"
  onHomeClick?: () => void;  // reading view only — return to landing
}
```

Rendering matrix: reading view → `ग्रन्थपरिशीलकः` (clickable, subtle hover) `>` `textTypeDeva`;
landing page → `ग्रन्थपरिशीलकः` (static); edge case (unknown type) → clickable brand, no breadcrumb.

### 4.8 Components NOT changed

`GranthaSelector`, `NavigationSidebar`, `SidebarList`, `TextContent`, `CommentaryPanel`,
`CommentarySelector`, `PassageLink`, `ReferenceLink`, `MobileDrawer`, `BottomSheet`,
`InvalidVerseModal`, `hashUtils`, `references`, `paths`, `i18n`, `stringUtils`.

## 5. File Change Summary

| File | Change | Type |
|---|---|---|
| `public/data/categories.json` | New — categories, text_type labels, assignments | New |
| `lib/data.ts` | Add `categories`, `text_type_display` to `GranthaMetadata` | Edit |
| `scripts/generate-granthas-json.ts` | Read `categories.json`, stamp new fields | Edit |
| `hooks/useVerseHash.ts` | Nullable id/ref, `clearHash`, no default hash, empty-hash handler | Edit |
| `hooks/useGranthaLoader.ts` | `enabled: !!granthaId` | Edit |
| `app/page.tsx` | Landing/reading conditional, category state, wordmark props | Edit |
| `components/AppWordmark.tsx` | Dynamic `textTypeDeva`, clickable brand | Edit |
| `components/LandingPage.tsx` | New — chips + text list | New |
| `components/MobileLayout.tsx` | Thread wordmark props through | Edit |
| `components/TabletLayout.tsx` | Thread wordmark props through | Edit |
| `app/layout.tsx` | Update meta description (not Upaniṣad-specific) | Edit |

Estimated change surface: ~150–250 lines across ~11 files. No changes to the loading pipeline,
commentary system, navigation sidebar, or text rendering.

## 6. User Journeys

**First visit (new user):** opens app → landing page → sees brand + chips + all texts → clicks
`रामानुजश्रीसूक्तयः` chip → list narrows → clicks `श्रीभाष्यम्` → hash `#sribhashya:1` → reading
view, wordmark `ग्रन्थपरिशीलकः > ब्रह्मसूत्रभाष्यम्` → navigates.

**Deep-link arrival:** opens `#sribhashya:1.1.1` → reading view directly (no landing flash) →
wordmark `ग्रन्थपरिशीलकः > ब्रह्मसूत्रभाष्यम्` → reads.

**Mid-session category switch:** reading Kena → wordmark `ग्रन्थपरिशीलकः > उपनिषत्` → clicks brand →
`clearHash()` → landing (clean slate) → clicks `रामानुजश्रीसूक्तयः` → clicks `श्रीभाष्यम्` →
reading view.

**Browser back/forward:** reading Kena 1.2 → switch to Śrībhāṣyam → Back → hash restores
`#kena-upanishad:1.2` → wordmark `उपनिषत्` → Kena 1.2 restored. Works because category is derived
from the text, not stored.

**Third category added later:** add texts under `library/smritis/`; add `smritis` category to
`categories.json`; indexer stamps it; landing chips grow; wordmark picks up new
`text_type_labels` entry. No UI code changes.

## 7. Edge Cases (draft)

| Case | Behavior |
|---|---|
| Text with no categories assigned | Appears in "all" view only. If common, add a catch-all chip. |
| Text with unknown `text_type` | Wordmark renders brand only. Reading still works. |
| Category with a single text | Chip still renders; one-item filtered list acceptable. |
| Refresh on reading view | Hash preserved → reading restored. Category/type derived from text. |
| Refresh on landing page | No hash → landing restored; chip selection lost (accepted). |
| Narrow mobile screen | Chip row wraps (`flex-wrap`); text list full-width. |
| Missing `categories.json` | Indexer degrades gracefully; app still functions. |
| Back from landing to reading | Browser back restores previous hash → reading view. |
| Deep link with invalid grantha | Existing InvalidVerseModal flow handles it (unchanged). |

## 8. Open Items / Decisions for Review

1. **Chip overflow behavior** on narrow screens — start with `flex-wrap`; add horizontal scroll with
   edge fade only if >4 chips make wrapping look bad.
2. **Back-button after going to landing** — confirm Back restoring the previous reading state feels
   correct (default browser behavior).
3. **Devanagari phrase verification** — `रामानुजश्रीसूक्तयः` should be double-checked for
   correctness/register before implementation.
4. **Default first text on "all" landing view** — currently `granthas-order.json` order (Īśāvāsya
   first).

## 9. Future (v2) Considerations — deliberately deferred

- **Multi-select tags**: same `categories: string[]` field; chips become multi-select; decide AND
  vs OR semantics (OR recommended).
- **Keyword search**: search-as-you-type over titles/tags (later content), replacing flat-list
  browse once 60+ texts exist.
- **Per-text edition metadata** on the landing list (deferred per decision #7).
- **Category in the URL** — explicitly NOT encoded in v1.

## 10. Assumptions & Notes

- Earlier findings in the reference design were based on direct inspection of the codebase and
  `../grantha-data/structured_md`. Execution must re-derive them with per-claim citations per the
  Evidence Standard; anything that cannot be cited moves to Inference.
- Rāmānuja grantha IDs used in the sample `categories.json` (`sribhashya`, `vedanta-deepam`,
  `vedanta-sara`, `gita-bhashyam`, `vedarthasangraha`) follow the `grantha_id` values observed in
  the structured_md data; the exact IDs in the published `library/` build must be confirmed when the
  Rāmānuja texts are actually ingested into `public/data/library/`.
- This is a design/evaluation artifact. It does not represent committed code.
