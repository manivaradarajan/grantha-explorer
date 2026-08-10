# SCREENS.md

**Last updated:** 2026-08-06
**Status:** Living document. Pairs with DESIGN.md — read that first for the
principles behind these specs. This file describes *what* each screen shows
and *how it behaves*; DESIGN.md's "Open Design Choices" section covers what
each still needs visually prototyped.

## Landing page

**Purpose:** browse/discovery entry point. Note: most real sessions begin via
a shared link, not here — so this page carries less weight than a typical
app's home screen, but should still work well for exploration.

- One page. Categories (Itihāsa, Divya Prabandham, Upaniṣads, commentarial
  works, etc.) are **visual groupings on the same page**, not separate
  click-through screens — the corpus is small enough that a full navigation
  hop per category adds friction with no payoff. Revisit only if the corpus
  grows to dozens of granthas per category.
- Two independent filter facets: **category** and **author/composer**
  (Vālmīki, Rāmānuja, Nammāḻvār, etc. — whoever composed the *grantha itself*,
  not a commentator layer). Single-select per facet; picking one replaces the
  active filter on that facet. No combined filtering in v1.
- Each grantha listed: title (Sanskrit + transliteration), one-line
  description, and — if the reader has visited before — a "continue where you
  left off" indicator sourced from the existing `lastVisitedVerse` localStorage
  entry.
- No cards, no thumbnails, no featured/promoted sections. See DESIGN.md Open
  Design Choice #6 for how the grouping itself should render.

## Reading screen

**Purpose:** the core screen. Must fully self-orient a reader arriving cold
via a shared link — assume no prior context.

### Layout by breakpoint (matches existing codebase breakpoints)

- **Desktop (≥1024px):** three-panel layout — Navigation sidebar | Text
  content | Commentary panel — via resizable panels, sizes persisted to
  localStorage (already implemented).
- **Tablet (768–1023px):** navigation collapses into a drawer (icon-triggered,
  slides in, dismisses on selection — mirrors mobile's approach). Text and
  commentary keep a desktop-style side-by-side split with **resizable panels**
  (widths persisted to `tabletPanelSizes` in localStorage, separate key from the
  desktop `panelSizes`). Not a shrunk desktop, not a stretched mobile — a
  deliberate hybrid. The commentary column is **visible by default**; the icon
  button in the tablet header optionally collapses it (local state, not the URL
  `?co=` param, which only drives the mobile bottom sheet). When collapsed, the
  text panel expands to full width.
- **Mobile (<768px):** navigation as a full drawer; commentary panel toggles
  open/closed, single column.

### Structure

```
Breadcrumb: Grantha › Kāṇḍa › Sarga        ← "where am I", critical for cold opens
─────────────────────────────────────
Verse (mūla) — visual priority, fixed hierarchy
[ Word-for-word ]  [ Translation ]          ← mūla-level toggles only
─────────────────────────────────────
[ Chip ]  [ Chip ]  [ Chip ]                ← commentary chips, additive activation
─────────────────────────────────────
▾ Commentary pane(s) — inline if short,
   dedicated scrolling pane if long-form
   (2-column cap; 3rd+ active becomes a tab)
─────────────────────────────────────
← Prev verse                    Next verse →   ← flows seamlessly across
                                                   prefatory/passages/concluding
```

- **Prev/Next crosses section boundaries seamlessly.** A reader moving
  through `prefatory_material` → `passages` → `concluding_material` never
  hits an explicit wall — "next" always means the next readable unit.
- **Word-for-word gloss:** stacked list under the verse, not interlinear.
  Mūla-only — never repeats inside a commentary pane, even for traditions
  that gloss commentary word-by-word (explicitly out of scope, kept simple).
- **Long commentary layout:** compact pinned verse at top, commentary in its
  own independently-scrolling column beside it (Talmud-page pattern) —
  applies once commentary length exceeds a couple of paragraphs.

## Cross-reference / peek flow

- Cross-references render as plain inline hyperlinks — no separate panel
  type. Internal references use existing hash routing; if the target grantha
  isn't loaded, it lazy-loads the same way multi-part granthas already do.
- **Peek:** hover (desktop, ~400ms delay to avoid flicker) or long-press
  (mobile — needs a small visible marker since there's no hover affordance
  to discover otherwise) shows a floating tooltip with the target's mūla
  text, in the reader's current script/language. Clicking anywhere in the
  tooltip, or the original link before a peek appears, triggers full
  navigation. Max depth 1 — no chained peeks. New peek replaces old.
- **External references** (target outside the currently loaded corpus) should
  still attempt lazy-load via peek if the data exists anywhere in the corpus.
  Only fall back to a genuinely inert state if the target doesn't exist yet —
  and even then, the peek should say so explicitly ("not yet available"),
  not render as an unexplained grey span.

## Cross-grantha navigation (worked example: Eedu → Rāmāyaṇa → back)

1. Reader is on Tiruvāymoḻi with Eedu commentary open in its long-form pane.
2. A cross-reference to a Rāmāyaṇa verse appears inline within Eedu's text.
3. Peek (hover/long-press) shows the Rāmāyaṇa verse without leaving the
   current screen — most references resolve here, no navigation needed.
4. Clicking through triggers full navigation (pushed history entry, lazy-load
   if needed). Lands on a normal reading screen for the Rāmāyaṇa verse, with
   the breadcrumb immediately orienting the reader.
5. Back button restores the exact prior Tiruvāymoḻi verse, Eedu commentary
   open state, **and** the exact scroll position within Eedu's pane (via
   `sessionStorage`, keyed per verse+commentary — see DESIGN.md interaction
   rules).

## Commentary comparison (worked example: comparing 9000-padi and 6000-padi
while Eedu is open)

1. Reader on the Eedu screen activates the 6000 and 9000 chips.
2. Activation is additive — Eedu stays open unless manually deactivated.
3. With 3 long-form commentaries now active, the 2-column cap applies: two
   render as full side-by-side columns, the third becomes a tab. This is a
   fixed rule, not a responsive width calculation — the 3-commentary case is
   real but rare, so a simple fallback beats adaptive complexity.

## Sharing flow

1. Reader taps the share button on a verse (whole-verse only in v1;
   text-selection sharing is a deferred v1.1 feature).
2. `navigator.share()` fires if supported (mobile — surfaces WhatsApp
   directly in the OS sheet); otherwise, copy-to-clipboard with a toast
   confirmation (desktop).
3. Payload = link (full sender view state) + auto-generated text snippet
   (mūla + open commentary, each truncated with "..." if long). The snippet
   exists specifically because hash-based URLs don't produce useful
   WhatsApp link previews (the hash never reaches the server-side OG
   crawler) — so the message must be self-explanatory without relying on
   the link preview.
4. Recipient opening the link always lands on the exact view the sender had
   — same mechanism as the existing "Share My View" preference handling.

## Flagging flow

1. A flag button/icon is available on every reading screen.
2. On open, the form auto-captures context (grantha, verse ref, open
   commentaries, current URL) and displays it — editable/removable, not
   silently attached.
3. A type toggle (Content Error / General Feedback) is pre-selected based on
   context (text selected → Content Error default) but always visible and
   changeable before submit.
4. Submission posts to a serverless API route, which creates a labeled
   GitHub Issue via a server-side token. No reader login, no new database.

## Invalid verse modal

Triggered automatically when a URL hash contains a verse ref that doesn't exist
in the loaded grantha (e.g., a stale bookmark, a hand-edited URL, or a
cross-grantha link whose target ref doesn't exist).

- Modal shows a Sanskrit heading ("उक्तनिर्देशः नोपलभ्यते" — "Passage not
  found") and the offending grantha + ref.
- The URL is silently reverted: to the previous valid URL if one exists in this
  session, otherwise to the first main passage of the current grantha.
- The reader dismisses the modal and continues from the reverted position.
- No persistent error state; this is a one-shot recovery, not a broken-page
  experience.

**Implementation:** `components/InvalidVerseModal.tsx` + `validateAndNormalizeHash()`
in `lib/hashUtils.ts`. The modal is rendered in all three layout branches
(desktop, tablet, mobile) inside `app/page.tsx`.

---

## Explicitly deferred (not designed yet, don't build toward)

- Sub-commentary schema (`parent_commentary_id` or similar) — real but small,
  add when the first sub-commentary text actually needs encoding.
- Text-selection-triggered sharing (v1.1).
- Search (any version beyond v1 planning, if it becomes needed).
- Personal notes/annotations.
- Combined landing-page filters.
- Cross-device sync / accounts (v2).
