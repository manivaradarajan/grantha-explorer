## 5. Functional Requirements

### 5.1 Text Selection & Navigation

**FR-1.1: Grantha (Text) Selector**

- User can select from available Granthas (Isha Upanishad, Kena Upanishad, etc.)
- Desktop: Accessible via left navigation (always visible)
- Mobile: Accessible via hamburger menu [≡]
- Tablet: Accessible via hamburger menu [≡]
- Current selection is visually indicated in header/breadcrumb
- Selecting a grantha navigates to its first verse (or remembers last visited verse in that grantha)

**FR-1.2: Script & Language Selection**

- Location: Settings panel [⚙ icon] (top right of sticky header)
- Script selector: Devanagari | Roman (IAST) (dropdown or radio buttons)
- Phase 1: Language/translation toggle: Sanskrit only | English only | Both (toggle or radio buttons)
- All changes apply instantly (client-side, no reload)
- User's last selected script persists across sessions (stored in localStorage)
- User's last selected language persists across sessions
- Passage fragments in left nav update when script changes

**FR-1.3: Hierarchical Navigation (Left Sidebar)**

- Desktop/Tablet: Left column shows accordion with two levels:
  - Level 1: Text sections (e.g., "Prefatory Material", "Chapter 1", "Chapter 2")
  - Level 2: Individual passages/verses with passage fragments (e.g., "Verse 1.1 - ईशावास्यमिदँ सर्वं...")
- Mobile: Same hierarchy accessible via hamburger menu
- Prefatory material always at top of structure
- Current verse auto-highlights as user scrolls main text
- Clicking a verse in nav navigates primary text to that verse
- Smooth expand/collapse animations
- Passage fragments display in user's currently selected script

**FR-1.4: Sequential Navigation**

- Navigation arrows (< prev | next >) appear in:
  - Desktop: Right side of sticky header (optional) or within left nav
  - Mobile: In bottom sheet header when commentary is open; or via swiping
  - Tablet: Via left nav
- Breadcrumb shows current location: [Grantha Name] > [Verse Ref]
- Clicking breadcrumb does NOT navigate; it's informational only

### 5.2 Text Display & Reading Experience

**FR-2.1: Primary Text Display**

- Passage renders with maximum visual clarity and readability
- Default display: Sanskrit (in selected script, large) + English translation (below, large)
- Both Sanskrit and English equally prominent and readable
- Font sizes: Min 16px on mobile, scales appropriately on larger screens
- User can adjust font size (slider in settings): default 100%, range 80%-150%
- Font size preference persists across sessions
- Line spacing: Generous (1.8-2.0 line height for readability)
- Fonts: Appropriate Unicode-supporting fonts for each script (Devanagari, Roman)
- Web fonts load reliably; fallback system fonts available

**FR-2.2: Commentary Display by Device**

_Desktop:_

- Commentary always visible in right column by default
- Right column header shows commentary selector (checkboxes):
  - ☑ Vedanta Desika (checked by default)
  - ☐ Rangaramanuja (unchecked)
  - ☐ Kuranarayana (unchecked)
- Default commentaries vary by grantha (defined in grantha JSON data)
- URL commentary parameters (`?c=`) override defaults on page load (see FR-7.3)
- User can check/uncheck any combination; all selected commentaries stack vertically in right column
- Commentaries scroll independently from primary text
- Below each verse in primary text: "▼ [Commentary Name]" indicator (visual affordance, not clickable on desktop)

_Mobile:_

- Commentary hidden by default (full-width primary text)
- Below each verse: "▼ [Commentary Name]" indicator (tappable)
- Tapping indicator opens bottom sheet (~70% screen height)
- Bottom sheet header includes:
  - Pull-down handle [⌄] (visual affordance)
  - Left/right navigation arrows [< >] (navigate between verses without closing sheet)
  - Close button [X]
  - Commentary selector tabs: [☑ V.D.] [☐ Raman] [☐ Kuran] (abbreviated names)
- Commentary scrolls within sheet (independent from primary text)
- Background dims when sheet open (primary text faded)
- Swiping down closes sheet; tapping X closes sheet; tapping primary text area closes sheet
- When navigating verses via arrows, primary text auto-scrolls to show new verse; commentary updates

_Tablet:_

- 2-column hybrid layout: Primary text (center) | Commentary (right)
- Right column shows selected commentaries (checkboxes selector in header)
- Commentaries stack vertically in right column
- Columns scroll independently

**FR-2.3: Toggle Controls**

- Location: Settings panel [⚙ icon]
- Show/Hide Sanskrit: Checkbox (toggles all Sanskrit in primary text and commentary)
- Show/Hide Translation: Checkbox (toggles all English in primary text and commentary)
- Toggle state applies consistently across all passages and commentaries
- Toggle state persists across sessions
- When toggling, layout remains stable (no jumping or reformatting)

**FR-2.4: Multi-Script Rendering**

- Sanskrit content stored once in database/JSON (canonical form)
- Phase 0: Devanagari only (no conversion needed)
- Phase 1+: Client-side script conversion: Devanagari ↔ Roman (instant, no server round-trip)
- Special characters and diacritics render correctly
- Unicode support: Full Devanagari (U+0900–U+097F), Latin with combining marks (Phase 1+)
- Fonts load via web fonts (CDN); fallback to system fonts if unavailable

### 5.3 Comparison Views

**FR-3.1: Primary Text + Single Commentary**

- Desktop: Primary text (center column) | Commentary (right column), both visible
- Tablet: Primary text (center) | Commentary (right), columns scroll independently
- Mobile: Primary text (full-width) | Commentary (bottom sheet on-demand)
- Both readable without excessive scrolling

**FR-3.2: Multiple Commentaries Comparison**

- User selects multiple commentaries via checkboxes in right column header
- Desktop: All selected commentaries stack vertically in right column, scrollable
- Tablet: Same as desktop (right column stacks commentaries)
- Mobile: Bottom sheet tabs allow switching between commentaries (only one visible at a time, but user can switch via tabs)
- User can toggle any commentary on/off via checkboxes; commentaries appear/disappear instantly

**FR-3.3: Column Resizing (Desktop & Tablet)**

- Visible light dividers between left nav | primary text | right column
- User can drag dividers to resize columns
- Resizing is smooth (no lag)
- Column widths persist across sessions (stored in localStorage)
- "Reset to default layout" button in settings resets all column widths to defaults

**FR-3.4: Multiple Translations Comparison** (Phase 1+)

- Deferred; architecture supports multiple translations

### 5.4 Cross-Text Linking

**FR-4.1: Reference Recognition & Rendering**

- App identifies references to other texts (e.g., "बृ.उ. 6-4-22", "Brihad Aranyaka 6.4.22")
- References are rendered as clickable links (visually distinct: underlined, colored, or styled)
- References appear in both primary text and commentary

**FR-4.2: Reference Behavior**

_Desktop (Cross-Grantha References):_

- User hovers over reference → tooltip shows preview of target passage
- Tooltip displays for duration of hover; disappears on mouse leave
- User clicks reference → app navigates to target grantha and verse
- Navigation updates: left nav highlights new location, breadcrumb changes, primary text displays new verse, right column shows commentary for new verse
- All user settings persist (script, language, commentary selections, column widths)

_Mobile (Cross-Grantha References):_

- User taps reference → bottom sheet closes (if open)
- App navigates directly to target grantha and verse (no tooltip)
- Primary text displays new verse; breadcrumb updates
- Commentary ready to view (if commentary was open, opens for new verse)

_Desktop (Intra-Grantha References - Same Text):_

- User hovers over reference to another verse in same text (e.g., "See 1.3") → tooltip shows preview
- User does NOT navigate (tooltip only)
- User can click verse number in left nav to navigate if desired

**FR-4.3: Reference Indicators**

- Links are visually distinct from regular text
- Hover state on desktop provides visual feedback

### 5.5 Variant Readings

**FR-5.1: Variant Availability Indication**

- When a verse has variant readings, small badge "ⓘ" appears next to verse number
- Desktop: Badge in left nav next to verse number AND next to verse in primary text
- Mobile: Badge below verse text
- Badge is tappable/clickable

**FR-5.2: Variant Selection**

- Clicking/tapping badge opens modal or inline dropdown selector
- Options: [⦿ Canonical] [○ Shakha 1] [○ Shakha 2] (radio buttons, only one selectable)
- User selects variant
- Primary text re-renders with selected variant (differences highlighted from canonical)
- Commentary remains unchanged (applies to canonical version only)
- User can switch variants freely for comparison
- Returning to canonical is simple (select Canonical option)

**FR-5.3: Variant Highlighting**

- When viewing non-canonical variant, words that differ from canonical are highlighted (distinct color or visual marker)
- Clear indication which version user is viewing

### 5.6 Passage Fragments in Navigation

**FR-6.1: Passage Fragment Display**

- Each verse in left nav shows: "Verse Number - [first ~50 characters of Sanskrit text]..."
- Phase 0: Fragment displays in Devanagari only
- Phase 1+: Fragment updates when user changes script (Devanagari/Roman)
- Fragment is truncated with "..." if longer than display space
- Fragment helps user recognize and navigate to specific verses

### 5.7 Provenance & Metadata

**FR-7.1: Source Information Display**

- Each grantha, commentary, and translation has metadata accessible via info icon or "About" link
- Metadata includes:
  - Source/author name
  - Version number
  - Processing date
  - GitHub repository URL
  - GitHub commit hash
  - Source file (if applicable)
- User can view metadata in a panel or modal (expandable section)

**FR-7.2: Citation Information**

- Each passage has unique reference (e.g., "Isha Upanishad 1.1")
- User can copy passage reference
- Citation format: [Grantha Name] [Passage Ref] (e.g., "Isha Upanishad 1.1")

**FR-7.3: Shareable URLs**

- Every passage view has a unique, persistent URL
- URL format: Hash fragment with grantha ID, verse reference, and selected commentaries
- Base format: `#[granthaId]:[verseRef]?c=[commentaryIds]`
- Example: `https://app.com/#kena-upanishad:1.1?c=rangaramanuja`
- Multiple commentaries: `https://app.com/#kena-upanishad:1.1?c=rangaramanuja,vedanta_desika`
- Commentary IDs use full `commentary_id` from grantha JSON (e.g., "rangaramanuja", "vedanta_desika")
- Display preferences (script, language, dark mode, font size) are NOT included in URL by default
- Display preferences persist via localStorage only (see FR-10.1)
- "Share My View" feature (see FR-7.4) optionally includes display preferences in URL
- URL can be shared in emails, academic papers, social media
- Clicking shared URL navigates to specified verse with specified commentaries
- **URL commentary parameters:** Override localStorage AND save as new defaults
- **URL display preferences:** Override localStorage temporarily (session only, do not save)
- URL updates automatically when user clicks a verse in navigation sidebar or changes commentary selection
- If no verse is specified in URL, app automatically displays first verse and updates URL
- If commentary doesn't exist for that grantha, it's silently skipped (graceful degradation)
- Navigation is instant with no page reload or flicker
- Link preview shows passage snippet (for social sharing)

**FR-7.4: Share Functionality**

- Two share modes available to users
- **Primary: "Share" button** (default sharing mode)
  - Copies URL with grantha, verse, and currently selected commentaries only
  - Does NOT include display preferences (script, language, dark mode, font size)
  - Example: `https://app.com/#kena-upanishad:1.1?c=rangaramanuja`
  - Recipient sees the verse with their own display preferences
  - Use case: Academic citations, sharing specific passages for discussion
- **Secondary: "Share My View" button**
  - Copies URL with complete study configuration
  - Includes: grantha, verse, commentaries, AND all display preferences
  - Format: `#[granthaId]:[verseRef]?c=[commentaries]&s=[script]&l=[language]&dark=[0|1]&size=[fontSize]`
  - Example: `https://app.com/#kena-upanishad:1.1?c=rangaramanuja&s=roman&l=san&dark=1&size=120`
  - Recipient sees exact view configuration
  - Use case: Teaching, sharing specific reading configurations, accessibility
- **Location:** Settings panel [⚙] or near citation/metadata section
- **Behavior:**
  - Single click copies URL to clipboard
  - Toast notification confirms: "Link copied to clipboard"
  - No modal or additional steps required
- **URL Parameter Reference:**
  - `c`: Commentary IDs (comma-separated, e.g., `c=rangaramanuja,vedanta_desika`)
  - `s`: Script (`deva` for Devanagari, `roman` for Roman/IAST)
  - `l`: Language display (`both`, `san` for Sanskrit only, `eng` for English only)
  - `dark`: Dark mode (`1` for on, `0` for off)
  - `size`: Font size percentage (80-150, e.g., `size=120`)

### 5.8 Prefatory & Concluding Material

**FR-8.1: Prefatory Material Display**

- Located at top of left nav/structure (before verse 1.1)
- Clearly labeled: "Prefatory Material (0.0) - शान्तिमन्त्रः...", "Prefatory Material (0.1) - [invocation]"
- User clicks to view in primary text
- Displays same as verses: Sanskrit + English
- Commentary available if applicable
- Left nav highlights current location (whether prefatory or verse)

**FR-8.2: Concluding Material Display**

- Located at end of text structure (after final verse)
- Clearly labeled: "Concluding Material - शान्तिमन्त्रः..."
- Same display treatment as prefatory material
- Optional: can be toggled on/off in settings

### 5.9 Footnotes

**FR-9.1: Footnote Display** (Phase 0: minimal; enhanced in Phase 1+)

- Footnotes from source texts preserved and accessible
- Indicated by superscript markers (e.g., [1], [2])
- On click/tap, footnote content appears in tooltip or sidebar
- Footnote types: variant readings, editorial notes, cross-references, explanations
- Footnotes are non-interactive (editorial additions, not primary content)

### 5.10 Session Persistence

**FR-10.1: User Preference Persistence**

- App remembers all user preferences automatically (no login required)
- Persisted settings:
  - Last visited grantha and verse
  - Script preference (Phase 0: Devanagari only; Phase 1+: Roman option)
  - Language/translation toggle state (Phase 1+: Sanskrit only | English only | Both)
  - Selected commentaries (which are checked)
  - Commentary selection (last selected commentary defaults next visit)
  - Font size preference
  - Dark mode preference
  - Column widths (desktop)
- On return visit, app loads grantha, opens to last verse, applies all preferences
- Preferences stored in browser localStorage (or similar persistent mechanism)
- **URL/localStorage Interaction:**
  - **Commentary params (`?c=`):** Override localStorage AND save as new defaults
  - **Display preference params (`?s=`, `?l=`, `?dark=`, `?size=`):** Override localStorage for session only (do not save)
  - Display preferences only update in localStorage when explicitly changed via UI controls
  - Example: User with localStorage `{commentaries: ["vedanta_desika"]}` clicks URL with `?c=rangaramanuja` → sees Rangaramanuja commentary AND localStorage updates to `{commentaries: ["rangaramanuja"]}`
  - Example: User with localStorage `{script: "deva"}` clicks URL with `?s=roman` → sees Roman script temporarily, localStorage stays `{script: "deva"}`

**FR-10.2: Return Visit Experience**

- User closes app after studying Taittiriya 2.4.3 with:
  - Script = Devanagari
  - Language = Both
  - Commentaries = Vedanta Desika + Rangaramanuja (both checked)
  - Font size = 120%
  - Dark mode = On
- User returns next day
- App opens directly to Taittiriya 2.4.3 with all settings restored
- No login, no onboarding, no friction

### 5.11 Display Preferences

**FR-11.1: Dark Mode**

- Auto-detect from system preference (light/dark mode)
- Manual toggle in settings: [☑ Dark mode] or [Light] [Dark] radio buttons
- Manual preference overrides system preference
- Dark mode preference persists across sessions
- All UI elements (text, buttons, dividers, backgrounds) adapt to dark mode

**FR-11.2: Font Size Adjustment**

- Slider in settings: [Font Size: 80% — 100% (default) — 150%]
- Applies to primary text, commentary, and navigation
- User can adjust while reading (changes apply instantly)
- Font size preference persists

### 5.12 Mobile-Specific Features

**FR-12.1: Bottom Sheet for Commentary (Mobile)**

- Swipe gesture to open/close (natural mobile pattern)
- ~70% of screen height when open
- Background dims when open (focus on commentary)
- Independent scrolling within sheet
- Navigation arrows allow moving between verses without closing sheet
- Commentary tabs visible in header for switching commentaries

**FR-12.2: Hamburger Menu (Mobile)**

- [≡] icon in header
- Menu shows: Grantha selector (with current selection highlighted)
- Menu slides in from left
- Tapping outside menu or selecting item closes menu

**FR-12.3: Sticky Header (All Devices)**

- Fixed at top of screen: [≡ or logo] | Breadcrumb | [⚙]
- ~50px height (minimal, doesn't waste space)
- Always accessible

### 5.13 Keyboard & Gesture Support

**FR-13.1: Keyboard Support** (Phase 0: minimal)

- No keyboard shortcuts in Phase 0
- Standard browser navigation works

**FR-13.2: Touch Gestures** (Mobile)

- Swipe down: Close bottom sheet
- Tap: Select, navigate, toggle
- Long-press: Not used in Phase 0

### 5.14 Offline & Performance

**FR-14.1: Initial Load**

- App defaults to Isha Upanishad 1.1 on first visit
- On return visits, app opens to last visited verse
- Page load time: <2 seconds on 4G networks

**FR-14.2: Navigation Performance**

- Passage navigation (clicking verse in nav): <500ms response time
- Script switching: Instant (client-side)
- Commentary toggling: Instant
- Column resizing: Smooth (no lag)

**FR-14.3: Offline** (Phase 0)

- No offline support in Phase 0
- Deferred to Phase 2

### 5.15 Help & Contact

**FR-15.1: Help** (Phase 0)

- Lightweight "Help" link in hamburger menu
- Explains key features: how to open commentary, navigate verses, use variant badges, etc.
- Short, scannable explanations (bullet points or short paragraphs)

**FR-15.2: Contact** (Phase 1+)

- Contact form deferred to Phase 1
- Phase 0: No contact feature
