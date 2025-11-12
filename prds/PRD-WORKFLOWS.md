## 4. Core User Workflows

### 4.1 Workflow 1: Scholar Reading Upanishad with Visistadvaita Commentary (Desktop)

**Actor:** Academic Scholar  
**Goal:** Study Isha Upanishad 1.1 alongside Visistadvaita commentaries to understand the philosophical interpretation.  
**Environment:** Desktop (>1024px)

**Steps:**

1. User opens app → defaults to Isha Upanishad 1.1 (or last verse if returning)
2. Desktop 3-column layout visible: Left nav | Primary text (center) | Commentary (right)
3. Left nav shows: Prefatory Material (0.0, 0.1) at top, then verses with passage fragments (e.g., "Mantra 1 - ईशावास्यमिदँ सर्वं...")
4. Left nav auto-highlights current verse as user scrolls; left and right columns have visible light dividers
5. Primary text displays Sanskrit (Devanagari) + English (large, readable)
6. Right column shows Vedanta Desika Bhashya (default) with "▼ Vedanta Desika Bhashya" indicator
7. Right column header shows commentary selector:
   - ☑ Vedanta Desika (checked)
   - ☐ Rangaramanuja (unchecked)
   - ☐ Kuranarayana (unchecked)
8. User checks Rangaramanuja → second commentary stacks below first in right column (scrollable)
9. User checks Kuranarayana → third commentary appears below (all three visible, scrollable)
10. User hovers over "बृ.उ. 6-4-22" reference in Vedanta Desika commentary
11. Tooltip appears showing passage preview; stays visible on hover, disappears on mouse leave
12. User clicks the reference → app navigates to Brihad Aranyaka 6.4.22
13. Left nav highlights new location, breadcrumb updates, primary text and right column update
14. Right and left columns scroll independently
15. User drags the vertical divider between columns to resize (center column narrower, commentary wider)
16. Column widths are automatically saved for next visit

**Success Criteria:**

- 3-column layout feels spacious and scholarly
- Commentaries accessible via checkboxes; multiple selections work smoothly
- Column resizing with visual dividers is intuitive
- Passage fragments aid navigation
- Cross-reference hover preview + click navigation works as expected

---

### 4.2 Workflow 2: Practitioner Learning Sanskrit While Reading Translation (Mobile)

**Actor:** Serious Spiritual Practitioner  
**Goal:** Study Kena Upanishad, reading English translation while learning Sanskrit in Devanagari script.  
**Environment:** Mobile (<768px)

**Steps:**

1. User opens app → defaults to Isha Upanishad 1.1 (or last verse)
2. Mobile layout: Sticky header [≡] | Breadcrumb | [⚙], full-width primary text below
3. Primary text shows Sanskrit (Roman, large) + English (below, large)
4. Below each verse: "▼ Vedanta Desika Bhashya" indicator (tappable)
5. User taps [≡ hamburger] → slide-out menu shows grantha selector
6. User selects "Kena Upanishad"; menu closes, app navigates to Kena 1.1
7. User taps [⚙ settings] → settings panel opens
8. Script selector shows "Roman"; user selects "Devanagari"
9. Primary text re-renders instantly in Devanagari
10. User toggles language to "Sanskrit only" → English disappears
11. User toggles back to "Both" (Sanskrit + English visible)
12. User closes settings
13. User taps chevron "▼ Vedanta Desika Bhashya"
14. **Bottom sheet slides up (~70% screen):**
    - Background dims; primary text faded
    - Sheet header: [⌄ handle] | [< >] nav arrows | [X close]
    - Commentary tabs: [☑ V.D.] [☐ Raman] [☐ Kuran]
    - Commentary text (scrollable within sheet, independent from primary text)
15. User reads commentary; scrolls within sheet
16. User taps [> next arrow] → commentary updates to verse 1.2; primary text auto-scrolls to show 1.2
17. User swipes down → sheet closes smoothly, primary text returns to normal brightness
18. All preferences saved: Script = Devanagari, Language = Both, Commentary = Vedanta Desika
19. Next visit: App opens to Kena 1.2, Devanagari, Vedanta Desika ready

**Success Criteria:**

- Mobile prioritizes primary text (full-width, uncluttered)
- Script switching is instant and seamless
- Bottom sheet preserves primary text visibility
- Navigation via arrows doesn't require closing sheet
- All preferences persist across sessions
- Gesture-friendly (swipe to dismiss feels natural)

---

### 4.3 Workflow 3: Comparing Multiple Commentaries on Same Passage (Tablet)

**Actor:** Academic Scholar  
**Goal:** Compare Vedanta Desika, Rangaramanuja, and Kuranarayana on Taittiriya 2.1.1.  
**Environment:** Tablet (768px - 1024px)

**Steps:**

1. User opens app on tablet; navigates to Taittiriya 2.1.1 via [≡] hamburger menu
2. **Tablet hybrid layout visible:**
   - Left nav hidden (accessible via hamburger)
   - Center: Primary text (full-width, scrollable if passage overflows)
   - Right: Commentary (scrollable independently)
   - Visible light divider between columns
3. Right column shows Vedanta Desika by default
4. Right column header shows commentary selector:
   - ☑ Vedanta Desika
   - ☐ Rangaramanuja
   - ☐ Kuranarayana
5. User checks Rangaramanuja → second commentary stacks below first
6. User checks Kuranarayana → third commentary stacks below second
7. All three commentaries visible in right column (scrollable)
8. Primary text (center) scrolls independently from right column
9. User drags column divider to adjust widths; saved for next visit

**Success Criteria:**

- Tablet layout balances content readability with space efficiency
- Multiple commentaries accessible via checkboxes
- Columns scroll independently
- Column resizing is smooth and intuitive

---

### 4.4 Workflow 4: Understanding Variant Readings

**Actor:** Academic Scholar  
**Goal:** See multiple recensions of Isha Upanishad 1.1 and their differences.

**Steps (all devices):**

1. User navigates to Isha Upanishad 1.1
2. App displays canonical version by default
3. Next to verse number, user sees small badge "ⓘ" (desktop: in left nav and primary text; mobile: below verse)
4. User clicks/taps badge
5. Modal/dropdown appears: [⦿ Canonical] [○ Shakha 1] [○ Shakha 2]
6. User selects "Shakha 1"
7. Primary text re-renders with variant Sanskrit; differences highlighted from canonical
8. Commentary remains unchanged (applies to canonical only; user understands this)
9. User switches between variants for comparison
10. User returns to Canonical

**Success Criteria:**

- Variant availability clearly indicated (badge)
- Variants easily switchable
- Differences visually distinct
- Commentary relevance clear (not confused with variants)

---

### 4.5 Workflow 5: Navigating Prefatory Material

**Actor:** Spiritual Practitioner  
**Goal:** Read opening invocation (Shanti Mantra) before studying main Upanishad.

**Steps (all devices):**

1. User navigates to Isha Upanishad
2. Left nav / navigation shows at top:
   - Prefatory Material (0.0) - शान्तिमन्त्रः...
   - Prefatory Material (0.1) - [next invocation]
   - Mantra 1 - ईशावास्यमिदँ सर्वं...
   - Mantra 2 - कुर्वन्नेवेह...
3. User clicks/taps "Prefatory Material (0.0)"
4. Primary text displays invocation: Sanskrit + English
5. Commentary shows related explanation (if available)
6. User navigates to Mantra 1 to begin main text
7. Left nav highlights current passage (prefatory or verse)

**Success Criteria:**

- Prefatory material visible, accessible, respected
- Clear distinction between prefatory and main text
- Seamless navigation between them

---

### 4.6 Workflow 6: Cross-References and Tooltips (Desktop vs. Mobile)

**Actor:** Academic Scholar  
**Goal:** Follow reference to another passage and understand context.

**Desktop Steps:**

1. User reads Isha commentary mentioning "बृ.उ. 6-4-22"
2. User hovers over reference → tooltip shows passage preview
3. Tooltip visible on hover, disappears on mouse leave
4. User clicks reference → app navigates to Brihad Aranyaka 6.4.22
5. Left nav, breadcrumb, primary text, right column all update
6. All settings (script, language, commentary selections) persist

**Mobile Steps:**

1. User reads commentary in bottom sheet
2. Commentary mentions "बृ.उ. 6-4-22"
3. User taps reference
4. Bottom sheet closes (smooth dismiss)
5. App navigates directly to Brihad Aranyaka 6.4.22
6. Breadcrumb shows new location
7. (No tooltip on mobile — direct navigation)

**Success Criteria:**

- Cross-references clearly identifiable as links
- Desktop hover preview provides context without navigation
- Click/tap navigates to full passage
- Navigation is instant; context preserved

---

### 4.7 Workflow 7: Intra-Grantha References (Same Text)

**Actor:** Academic Scholar  
**Goal:** Preview another verse in same text (e.g., commentary says "See 1.3").

**Steps (Desktop):**

1. Reading commentary for Isha 1.1, commentary mentions "See 1.3"
2. User hovers over "1.3" → tooltip shows passage from verse 1.3
3. User does NOT navigate (just preview)
4. User can click verse number in left nav if they want to navigate

**Success Criteria:**

- Same-text references show tooltip preview (no unwanted navigation)
- User controls whether to navigate

---

### 4.8 Workflow 8: Session Persistence and Return Visit

**Actor:** Any user (returning to app)

**Goal:** Return to exact study state from previous session.

**Steps:**

1. User closes app after studying Taittiriya 2.4.3 with all three commentaries, Devanagari script, dark mode on
2. User returns to app (next day, next week)
3. **App opens automatically to:**
   - Grantha: Taittiriya Upanishad
   - Verse: 2.4.3
   - Script: Devanagari (persisted)
   - Language: Both (persisted)
   - Commentaries: All three checked (persisted)
   - Column widths: Restored to last session (desktop)
   - Dark mode: On (persisted)
4. User seamlessly continues study from exact point

**Success Criteria:**

- All preferences automatically remembered (no login needed)
- App opens to last verse viewed
- Study session feels continuous across visits
