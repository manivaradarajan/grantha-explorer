# Technical Design: Hash-Based Per-Verse URLs

## Overview

This document describes the technical implementation of shareable per-verse URLs using hash-based routing (client-side URL fragments) with query parameters for commentaries and optional display preferences. This approach enables flicker-free navigation while maintaining URL shareability and browser history integration.

**Last Updated:** 2025-11-07

---

## Design Rationale

### Why Hash-Based Routing?

1. **Zero Flicker:** Hash changes don't trigger page reloads or server requests
2. **Pure Client-Side:** No server-side routing logic needed (aligns with Phase 0 architecture)
3. **Instant Navigation:** Immediate URL updates without network round-trips
4. **Browser History:** Native back/forward button support via `hashchange` event
5. **SEO Flexibility:** Can still render static content for crawlers (Phase 1+)

### URL Format Decision

**Base Format:** `#[granthaId]:[verseRef]?c=[commentaryIds]&[displayPreferences]`

**Examples:**
- `#kena-upanishad:1.1` - Kena Upanishad, verse 1.1, default commentaries
- `#kena-upanishad:1.1?c=rangaramanuja` - Kena 1.1 with Rangaramanuja commentary
- `#kena-upanishad:1.1?c=rangaramanuja,vedanta_desika` - Kena 1.1 with multiple commentaries
- `#isha-upanishad:0.0?c=vedanta_desika&s=roman&dark=1&co=1` - Isha prefatory material with Roman script, dark mode, and commentary panel open

**Format Rationale:**
- Hash fragment (`#`) for no-reload navigation
- Colon delimiter (`:`) separates grantha from verse (simple parsing)
- Query params (`?`) separate content (commentaries) from optional preferences
- Grantha ID first enables easy identification
- Dots in verse refs are preserved (e.g., `1.1`, `2.4.3`)
- No encoding needed for standard refs (alphanumeric + dots + hyphens + underscores)
- Full `commentary_id` values ensure stability (no abbreviation mapping needed)

---

## Commentary Data Structure

Commentaries are embedded within each grantha JSON file. Understanding this structure is critical for implementing commentary-based query parameters.

### JSON Structure

```typescript
interface Commentary {
  commentary_id: string;           // e.g., "rangaramanuja", "vedanta_desika"
  commentary_title: string;        // Sanskrit title
  commentator: {
    devanagari: string;
    latin?: string;
  };
  commentary_source?: string;
  metadata?: {
    translator?: string | null;
    translation_source?: string | null;
    source_url?: string;
    source_commit?: string;
    source_file?: string;
    last_updated?: string;
  };
  passages: CommentaryPassage[];
}

interface CommentaryPassage {
  ref: string;                     // Links to main passage (e.g., "1.1")
  prefatory_material?: any[];
  content: {
    sanskrit: {
      devanagari: string;
      roman?: string | null;
      kannada?: string | null;
    };
    english: string;
  };
}

interface Grantha {
  grantha_id: string;
  canonical_title: string;
  structure_levels: StructureLevel[];
  prefatory_material?: Passage[];
  passages: Passage[];
  concluding_material?: Passage[];
  commentaries?: Commentary[];      // Array of commentaries
}
```

### Key Points

1. **Commentary IDs are stable identifiers** from the JSON (`commentary_id` field)
2. **Commentaries are grantha-specific** - each grantha has its own set
3. **Not all passages have commentary** - need to check existence
4. **No abbreviation mapping needed** - use full IDs directly

### Helper Functions

```typescript
/**
 * Get all commentary IDs available for a grantha
 */
function getCommentaryIds(grantha: Grantha): string[] {
  return grantha.commentaries?.map(c => c.commentary_id) || [];
}

/**
 * Get commentary metadata for UI display
 */
function getCommentaryMetadata(grantha: Grantha) {
  return grantha.commentaries?.map(c => ({
    id: c.commentary_id,
    title: c.commentary_title,
    commentator: c.commentator.latin || c.commentator.devanagari
  })) || [];
}

/**
 * Find commentary by ID
 */
function getCommentary(grantha: Grantha, commentaryId: string): Commentary | undefined {
  return grantha.commentaries?.find(c => c.commentary_id === commentaryId);
}

/**
 * Get commentary for specific passage
 */
function getCommentaryForPassage(
  grantha: Grantha,
  commentaryId: string,
  passageRef: string
): CommentaryPassage | undefined {
  const commentary = grantha.commentaries?.find(c => c.commentary_id === commentaryId);
  return commentary?.passages.find(p => p.ref === passageRef);
}

/**
 * Check if commentary exists for a passage
 */
function hasCommentary(
  grantha: Grantha,
  commentaryId: string,
  passageRef: string
): boolean {
  const commentary = grantha.commentaries?.find(c => c.commentary_id === commentaryId);
  return commentary?.passages.some(p => p.ref === passageRef) || false;
}

/**
 * Validate if commentary ID exists in grantha
 */
function isValidCommentaryId(grantha: Grantha, commentaryId: string): boolean {
  return grantha.commentaries?.some(c => c.commentary_id === commentaryId) || false;
}
```

---

## Architecture

### Component Hierarchy

```
app/page.tsx (Main App)
  ├─ useVerseHash() hook
  │   ├─ Reads initial hash on mount
  │   ├─ Listens to hashchange events
  │   └─ Provides updateHash() function
  │
  ├─ NavigationSidebar
  │   └─ PassageLink (calls updateHash on click)
  │
  ├─ GranthaSelector
  │   └─ Updates hash when grantha changes
  │
  └─ TextContent
      └─ Scrolls to selected verse
```

### Data Flow

```
User clicks verse → PassageLink → updateHash() → window.location.hash
                                      ↓
                                  hashchange event
                                      ↓
                                 useVerseHash() hook
                                      ↓
                              Updates React state
                                      ↓
                              UI re-renders
                                      ↓
                         TextContent scrolls to verse
```

---

## Query Parameter Strategy

### Two Types of URL State

#### Content Parameters (Always in URL when selected)
These define what the user is viewing:
- **Grantha & Verse:** Hash path (`#kena-upanishad:1.1`)
- **Commentaries:** Query param `c` (e.g., `?c=rangaramanuja,vedanta_desika`)

#### Display Preference Parameters (Optional - "Share My View" only)
These define how content is displayed:
- **Script:** `s=deva` or `s=roman` (default: `deva`)
- **Language:** `l=both`, `l=san`, or `l=eng` (default: `both`)
- **Dark Mode:** `dark=1` or `dark=0`
- **Font Size:** `size=80` to `size=150` (default: `100`)

### URL Parameter Reference

| Parameter | Purpose | Type | Values | Example |
|-----------|---------|------|--------|---------|
| (hash path) | Location | Content | `#[granthaId]:[verseRef]` | `#kena-upanishad:1.1` |
| `c` | Commentaries | Content | Comma-separated commentary IDs | `c=rangaramanuja,vedanta_desika` |
| `co` | Commentary Open | Content | `0`, `1` | `co=1` |
| `s` | Script | Preference | `deva`, `roman` | `s=roman` |
| `l` | Language | Preference | `both`, `san`, `eng` | `l=san` |
| `dark` | Dark mode | Preference | `0`, `1` | `dark=1` |
| `size` | Font size | Preference | `80`-`150` | `size=120` |

### State Synchronization Priority

```
URL params → localStorage → defaults
```

1. **URL parameters** override everything (if present)
2. **localStorage** provides defaults (if no URL params)
3. **Hard-coded defaults** used if neither exists

### Behavior on URL Load - CRITICAL DISTINCTION

#### Commentary Parameters (Save to localStorage)

When user opens URL with `?c=` (commentary params):
1. Parse commentary IDs from URL
2. Apply commentaries to current view
3. **Save to localStorage** (become new defaults)
4. Result: Commentary selection persists beyond current session

**Example:**
```
User has: localStorage.commentaries = ["vedanta_desika"]
User opens: #kena:1.1?c=rangaramanuja
Result:
  - View displays Rangaramanuja commentary
  - localStorage.commentaries updates to ["rangaramanuja"]
  - Next visit (without URL params): uses Rangaramanuja
```

#### Display Preference Parameters (Session only - DO NOT save)

When user opens URL with `?s=`, `?l=`, `?dark=`, `?size=` (display prefs):
1. Parse display preferences from URL
2. Apply preferences to current view **for this session only**
3. **DO NOT save to localStorage**
4. localStorage only updates when user explicitly changes via UI controls
5. Result: Display preferences are temporary overrides

**Example:**
```
User has: localStorage.script = "deva"
User opens: #kena:1.1?s=roman
Result:
  - View displays in Roman script (temporary)
  - localStorage.script STAYS "deva" (unchanged)
  - User navigates to verse 1.2: still Roman (session persists)
  - User closes browser, returns later: Devanagari (localStorage default)
```

**Rationale:**
- **Commentaries are content** (what you're studying) → Should become your new default
- **Display preferences are personal settings** → Shouldn't be overridden by shared links

---

## Implementation Details

### 1. Hash Utility Functions

**Location:** `lib/hashUtils.ts`

```typescript
interface UrlState {
  granthaId: string;
  verseRef: string;
  commentaries?: string[];
  commentaryOpen?: boolean;
  script?: 'deva' | 'roman';
  language?: 'both' | 'san' | 'eng';
  darkMode?: boolean;
  fontSize?: number;
}

/**
 * Parse URL hash into grantha ID, verse ref, and optional params
 * @param hash - Raw hash string (e.g., "#kena-upanishad:1.1?c=rangaramanuja&s=roman")
 * @returns Parsed object or null if invalid
 */
export function parseHash(hash: string): UrlState | null {
  // Remove leading '#'
  const cleaned = hash.startsWith('#') ? hash.slice(1) : hash;

  // Split hash and query params
  const [pathPart, queryPart] = cleaned.split('?');

  // Parse path (grantha:verse)
  const [granthaId, verseRef] = pathPart.split(':');

  if (!granthaId || !verseRef) {
    return null;
  }

  const result: UrlState = { granthaId, verseRef };

  // Parse query params if present
  if (queryPart) {
    const params = new URLSearchParams(queryPart);

    // Commentary IDs (comma-separated)
    const c = params.get('c');
    if (c) {
      result.commentaries = c.split(',').filter(Boolean);
    }

    // Commentary open state
    const co = params.get('co');
    if (co) {
      result.commentaryOpen = co === '1';
    }

    // Script
    const s = params.get('s');
    if (s === 'roman' || s === 'deva') {
      result.script = s;
    }

    // Language
    const l = params.get('l');
    if (l === 'both' || l === 'san' || l === 'eng') {
      result.language = l;
    }

    // Dark mode
    const dark = params.get('dark');
    if (dark === '1' || dark === '0') {
      result.darkMode = dark === '1';
    }

    // Font size
    const size = params.get('size');
    if (size) {
      const sizeNum = parseInt(size, 10);
      if (sizeNum >= 80 && sizeNum <= 150) {
        result.fontSize = sizeNum;
      }
    }
  }

  return result;
}

/**
 * Build hash string from URL state
 * @param state - URL state object
 * @param includePreferences - If true, includes display preferences (for "Share My View")
 * @returns Hash string
 */
export function buildHash(state: UrlState, includePreferences: boolean = false): string {
  const { granthaId, verseRef, commentaries, commentaryOpen, script, language, darkMode, fontSize } = state;

  // Build base hash
  let hash = `#${granthaId}:${verseRef}`;

  // Build query params
  const params = new URLSearchParams();

  // Always include commentaries if present
  if (commentaries?.length) {
    params.set('c', commentaries.join(','));
  }

  // Always include commentary open state if true
  if (commentaryOpen) {
    params.set('co', '1');
  }

  // Only include display preferences if explicitly requested (Share My View)
  if (includePreferences) {
    if (script && script !== 'deva') {
      params.set('s', script);
    }

    if (language && language !== 'both') {
      params.set('l', language);
    }

    if (darkMode !== undefined) {
      params.set('dark', darkMode ? '1' : '0');
    }

    if (fontSize && fontSize !== 100) {
      params.set('size', fontSize.toString());
    }
  }

  // Append query params if any
  const queryString = params.toString();
  if (queryString) {
    hash += `?${queryString}`;
  }

  return hash;
}

/**
 * Get the first verse ref from grantha data
 * @param grantha - Grantha data object
 * @returns First verse ref (checks prefatory, then passages)
 */
export function getFirstVerseRef(grantha: Grantha): string {
  // Check for prefatory material first
  if (grantha.prefatory_material?.length > 0) {
    return grantha.prefatory_material[0].ref;
  }

  // Otherwise return first passage
  if (grantha.passages?.length > 0) {
    return grantha.passages[0].ref;
  }

  // Fallback (should never happen with valid data)
  return "1.1";
}

/**
 * Validate if a verse ref exists in grantha data
 * @param grantha - Grantha data object
 * @param verseRef - Verse reference to validate
 * @returns true if verse exists, false otherwise
 */
export function isValidVerseRef(grantha: Grantha, verseRef: string): boolean {
  // Check prefatory material
  if (grantha.prefatory_material?.some(p => p.ref === verseRef)) {
    return true;
  }

  // Check main passages
  if (grantha.passages?.some(p => p.ref === verseRef)) {
    return true;
  }

  // Check concluding material
  if (grantha.concluding_material?.some(p => p.ref === verseRef)) {
    return true;
  }

  return false;
}
```

---

### 2. Custom Hook: useVerseHash

**Location:** `hooks/useVerseHash.ts`

```typescript
import { useEffect, useState } from 'react';
import { parseHash, buildHash, getFirstVerseRef, isValidVerseRef } from '@/lib/hashUtils';
import { Grantha } from '@/types';

interface VerseHashState {
  granthaId: string;
  verseRef: string;
}

interface UseVerseHashReturn {
  granthaId: string;
  verseRef: string;
  updateHash: (granthaId: string, verseRef: string) => void;
}

/**
 * Custom hook for managing hash-based verse navigation
 * - Reads initial hash on mount
 * - Listens to hashchange events (for browser back/forward)
 * - Provides updateHash function for programmatic updates
 * - Auto-initializes with first verse if hash is missing/invalid
 */
export function useVerseHash(
  availableGranthas: string[],
  defaultGranthaId: string,
  granthaData: Map<string, Grantha>
): UseVerseHashReturn {
  // Initialize state from URL hash or defaults
  const [state, setState] = useState<VerseHashState>(() => {
    const hash = window.location.hash;
    const parsed = parseHash(hash);

    // If valid hash exists and grantha is available, use it
    if (parsed && availableGranthas.includes(parsed.granthaId)) {
      const grantha = granthaData.get(parsed.granthaId);

      // Validate verse ref exists in grantha
      if (grantha && isValidVerseRef(grantha, parsed.verseRef)) {
        return parsed;
      }

      // Invalid verse ref - use first verse of that grantha
      if (grantha) {
        const firstRef = getFirstVerseRef(grantha);
        // Update URL with valid verse
        window.history.replaceState(null, '', buildHash(parsed.granthaId, firstRef));
        return { granthaId: parsed.granthaId, verseRef: firstRef };
      }
    }

    // No valid hash - use default grantha and first verse
    const defaultGrantha = granthaData.get(defaultGranthaId);
    const firstRef = defaultGrantha ? getFirstVerseRef(defaultGrantha) : '1.1';

    // Set initial hash
    window.history.replaceState(null, '', buildHash(defaultGranthaId, firstRef));

    return { granthaId: defaultGranthaId, verseRef: firstRef };
  });

  // Listen to hashchange events (browser back/forward)
  useEffect(() => {
    function handleHashChange() {
      const hash = window.location.hash;
      const parsed = parseHash(hash);

      if (parsed && availableGranthas.includes(parsed.granthaId)) {
        const grantha = granthaData.get(parsed.granthaId);

        // Validate verse ref
        if (grantha && isValidVerseRef(grantha, parsed.verseRef)) {
          setState(parsed);
          return;
        }

        // Invalid verse - use first verse
        if (grantha) {
          const firstRef = getFirstVerseRef(grantha);
          window.history.replaceState(null, '', buildHash(parsed.granthaId, firstRef));
          setState({ granthaId: parsed.granthaId, verseRef: firstRef });
          return;
        }
      }

      // Invalid hash - revert to current state
      window.history.replaceState(null, '', buildHash(state.granthaId, state.verseRef));
    }

    window.addEventListener('hashchange', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [availableGranthas, granthaData, state.granthaId, state.verseRef]);

  // Function to update hash (called by components)
  const updateHash = (granthaId: string, verseRef: string) => {
    const newHash = buildHash(granthaId, verseRef);

    // Only update if different from current hash
    if (window.location.hash !== newHash) {
      window.location.hash = newHash;
      // State will be updated via hashchange event
    }
  };

  return {
    granthaId: state.granthaId,
    verseRef: state.verseRef,
    updateHash
  };
}
```

---

### 3. Main Page Integration

**Location:** `app/page.tsx`

**Changes Required:**

```typescript
// BEFORE (current implementation)
const [currentGrantha, setCurrentGrantha] = useState('kena-upanishad');
const [selectedRef, setSelectedRef] = useState('1.1');

// AFTER (hash-based implementation)
const { granthaId, verseRef, updateHash } = useVerseHash(
  availableGranthas,
  'kena-upanishad', // default grantha
  granthaDataMap    // Map<string, Grantha>
);

// Use granthaId and verseRef instead of state variables
// No need for setCurrentGrantha or setSelectedRef
```

**Handler Updates:**

```typescript
// Grantha selection handler
const handleGranthaChange = (newGranthaId: string) => {
  const grantha = granthaDataMap.get(newGranthaId);
  const firstRef = grantha ? getFirstVerseRef(grantha) : '1.1';
  updateHash(newGranthaId, firstRef);
};

// Verse selection handler
const handleVerseSelect = (ref: string) => {
  updateHash(granthaId, ref);
};
```

---

### 4. Component Updates

#### PassageLink Component

**Location:** `components/PassageLink.tsx`

**Changes:**

```typescript
interface PassageLinkProps {
  passage: Passage;
  isSelected: boolean;
  onSelect: (ref: string) => void; // This now calls updateHash
}

export default function PassageLink({ passage, isSelected, onSelect }: PassageLinkProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onSelect(passage.ref); // Triggers updateHash in parent
  };

  return (
    <a
      href={`#${passage.ref}`} // Optional: for accessibility/right-click
      onClick={handleClick}
      className={/* ... */}
    >
      {/* ... content ... */}
    </a>
  );
}
```

#### GranthaSelector Component

**Location:** `components/GranthaSelector.tsx` or equivalent

**Changes:**

```typescript
// When user selects new grantha
const handleChange = (newGranthaId: string) => {
  const grantha = granthaDataMap.get(newGranthaId);
  const firstRef = getFirstVerseRef(grantha);
  onGranthaChange(newGranthaId); // Calls handleGranthaChange which calls updateHash
};
```

---

### 5. Browser History Behavior

**Navigation Patterns:**

1. **User clicks verse:**
   - `updateHash()` called → `window.location.hash = newHash`
   - Browser adds entry to history stack
   - `hashchange` event fires
   - Hook updates state → UI re-renders

2. **User clicks back button:**
   - Browser changes `window.location.hash` to previous value
   - `hashchange` event fires
   - Hook updates state → UI re-renders to previous verse
   - No page reload

3. **User shares URL:**
   - URL contains full hash (e.g., `#kena-upanishad:1.1`)
   - Recipient opens link → hook reads hash on mount
   - App initializes to correct verse

4. **User manually edits hash:**
   - Browser fires `hashchange` event
   - Hook validates new hash
   - If valid: updates state
   - If invalid: reverts to valid hash (using `replaceState`)

---

### 6. Edge Cases & Error Handling

| Scenario | Behavior |
|----------|----------|
| No hash in URL | Auto-populate with default grantha + first verse |
| Invalid grantha ID | Fallback to default grantha + first verse |
| Invalid verse ref | Fallback to first verse of that grantha |
| Grantha exists but empty | Use hardcoded fallback `"1.1"` |
| User edits hash to malformed format | Revert to current valid state |
| Hash changes while data loading | Queue update until data available |
| Browser doesn't support hashchange | Graceful degradation (no back/forward support) |

**Error Handling Strategy:**

- **Validate on read:** Always validate hash before using it
- **Fallback gracefully:** Never throw errors, always provide sensible defaults
- **Use replaceState for fixes:** When correcting invalid hashes, use `replaceState` (not `pushState`) to avoid polluting history

---

### 7. Session Persistence Integration

**Interaction with localStorage:**

```typescript
// BEFORE: Save to localStorage on every verse change
useEffect(() => {
  localStorage.setItem('lastVisitedVerse', JSON.stringify({ granthaId, verseRef }));
}, [granthaId, verseRef]);

// AFTER: Only save as backup (hash is primary source)
// localStorage can store last visit for analytics, but hash is source of truth
useEffect(() => {
  // Optional: track last visit for analytics
  localStorage.setItem('lastVisitedVerse', JSON.stringify({ granthaId, verseRef }));
}, [granthaId, verseRef]);

// On mount: prioritize hash over localStorage
// (already handled in useVerseHash initialization)
```

**Preference Persistence:**

- Script, language, commentaries, font size, dark mode → still use localStorage
- Grantha and verse → use hash as primary, localStorage as fallback/analytics only

---

### 8. Testing Strategy

**Unit Tests:**

```typescript
// lib/__tests__/hashUtils.test.ts
describe('parseHash', () => {
  it('parses valid hash', () => {
    expect(parseHash('#kena-upanishad:1.1')).toEqual({
      granthaId: 'kena-upanishad',
      verseRef: '1.1'
    });
  });

  it('handles hash without #', () => {
    expect(parseHash('kena-upanishad:1.1')).toEqual({
      granthaId: 'kena-upanishad',
      verseRef: '1.1'
    });
  });

  it('returns null for invalid format', () => {
    expect(parseHash('#invalid')).toBeNull();
    expect(parseHash('#:1.1')).toBeNull();
    expect(parseHash('#kena-upanishad:')).toBeNull();
  });
});

describe('buildHash', () => {
  it('builds hash correctly', () => {
    expect(buildHash('kena-upanishad', '1.1')).toBe('#kena-upanishad:1.1');
  });
});
```

**Manual Testing Checklist:**

- [ ] Direct URL access with valid hash loads correct verse
- [ ] Direct URL access without hash auto-populates first verse
- [ ] Direct URL access with invalid hash falls back gracefully
- [ ] Clicking verses updates URL without flicker
- [ ] Browser back button navigates to previous verse
- [ ] Browser forward button navigates to next verse
- [ ] Changing grantha updates hash with first verse of new grantha
- [ ] Manually editing hash in address bar updates UI
- [ ] Sharing URL loads exact verse for recipient
- [ ] URL works in email clients (hash preserved)
- [ ] URL works on social media (hash preserved)

---

### 9. Performance Considerations

**Optimization Strategies:**

1. **Debouncing:** Not needed (clicks are already discrete events)
2. **Memoization:** Memoize `parseHash` results if called frequently
3. **Lazy Loading:** Load grantha data on-demand (already in architecture)
4. **Hash Updates:** Only update if different (checked in `updateHash`)

**Performance Targets:**

- Hash parse/build: < 1ms (negligible)
- State update after hash change: < 50ms
- Total navigation time (click → render): < 200ms

---

### 10. Future Enhancements (Phase 1+)

**Potential Extensions:**

1. **Query Parameters for Preferences:**
   - `#kena-upanishad:1.1?script=roman&commentaries=vedanta-desika`
   - Store UI preferences in URL for complete state sharing

2. **Server-Side Rendering:**
   - Pre-render pages for each verse (static generation)
   - Use hash for client-side navigation, path for SSR

3. **Deep Linking to Commentary:**
   - `#kena-upanishad:1.1:commentary:vedanta-desika`
   - Auto-open specific commentary on load

4. **Scroll Position Persistence:**
   - Store scroll position in hash for exact reading position

5. **Search Results:**
   - `#search:sanskrit:brahman`
   - Hash-based search URLs

---

## Migration Path

**From Current Implementation:**

1. ✅ Create `lib/hashUtils.ts` with utility functions
2. ✅ Create `hooks/useVerseHash.ts` custom hook
3. Update `app/page.tsx`:
   - Replace state with `useVerseHash` hook
   - Update handlers to use `updateHash`
4. Update `components/PassageLink.tsx`:
   - Add href for accessibility
   - Call `onSelect` which triggers `updateHash`
5. Update `components/GranthaSelector.tsx`:
   - Call handler which triggers `updateHash` with first verse
6. Test thoroughly (see testing checklist above)
7. Remove old localStorage-based verse tracking (keep preferences)

**Rollback Plan:**

- Hash utilities are pure functions (no side effects)
- Hook is isolated (doesn't modify global state)
- Easy to revert by removing hook and restoring old state management

---

## Appendix: TypeScript Types

```typescript
// types/index.ts

export interface Passage {
  ref: string;
  passage_type: 'main' | 'prefatory' | 'concluding';
  content: {
    sanskrit: {
      devanagari: string;
      roman?: string;
    };
    english_translation: string;
  };
}

export interface Grantha {
  grantha_id: string;
  canonical_title: string;
  prefatory_material?: Passage[];
  passages: Passage[];
  concluding_material?: Passage[];
}

export interface HashState {
  granthaId: string;
  verseRef: string;
}
```

---

**Document Status:** Draft for review
**Next Review Date:** After Phase 0 implementation complete
