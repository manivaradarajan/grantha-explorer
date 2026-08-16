# DESIGN.md

**Last updated:** 2026-08-06
**Status:** Living document — update as decisions change, don't let this drift from reality.

## What this is

Grantha Explorer is a contemplative reading environment for Sanskrit/Tamil
sacred texts and their commentarial traditions (Upaniṣads, Rāmāyaṇa, Tiruvāymoḻi,
Śrī Vaiṣṇava commentaries). It is not a SaaS product. Do not optimize for
engagement, novelty, or visual excitement. Optimize for sustained, comfortable,
distraction-free study.

Reference points: Sefaria (for interaction polish, but see critique below),
Al-HaTorah (for handling serious scholarly density), the traditional Talmud
page / *tzurat hadaf* (root text framed by commentary, not buried behind it),
Loeb Classical Library and Perseus (for print-critical-edition typographic
restraint).

**Explicitly not the inspiration:** Linear, Stripe, Vercel, Supabase, or any
other polished SaaS product. Those optimize for a different emotional register
than this app needs.

## Primary persona (v1)

A serious scholar or student doing **sustained study sessions**, not a casual
browser. This justifies:
- Long-form commentary panes rather than cramped inline snippets
- Real side-by-side commentary comparison
- Restraint over decoration — a reader here for hours notices friction that a
  five-minute visitor wouldn't

Desktop and mobile carry **equal design priority**. Most real sessions begin
via a **shared link to a specific verse**, not by browsing the landing page —
so every reading screen must fully self-orient a cold visitor (clear breadcrumb,
no reliance on prior context).

## Core principles

1. **Reading comes first.** Every screen answers "what should I read next?"
   not "what should I click?"
2. **Mūla has visual priority, always.** Commentary is secondary — smaller
   type, muted tone, visually distinct (indent or hairline rule), never
   competing with the root text for attention.
3. **Preserve place, aggressively.** Hash-based routing already gives browser
   back/forward for free. Extend this discipline to scroll position within
   long commentary panes (see Interaction Rules) — a reader should never lose
   their spot after a cross-reference jump.
4. **Progressive disclosure, not information dump.** Verse → translation →
   first commentary → more commentaries → cross-references → variants. Never
   show everything a verse "has" at once.
5. **Zero cognitive load.** No floating panels stacking on top of each other,
   no gradients, no card-in-card nesting, no colorful badges. A book does not
   need badges.
6. **Fixed typography hierarchy, never improvised per-screen.** Heading /
   Book / Sarga / Verse number / Sanskrit / Tamil / Translation / Commentary /
   Footnotes / Metadata each get one consistent size and weight across the
   whole app.
7. **When something is rare, don't build adaptive machinery for it.** Pick a
   simple, always-correct fallback instead (see: 3-commentary comparison rule
   below). Adaptive/responsive complexity is only worth it for common cases.

## What Sefaria gets wrong (and we should avoid)

Sefaria's connections panel is a **filter-then-select funnel**: click a verse,
see categories (Commentary, Targum, Midrash...) before you even see which
commentators are available, then click again to open one. Three taps to reach
a specific commentator. Our corpus is narrower and curated, so **commentator
selection must never require a category step** — one tap, chip to panel,
always.

## Content model (conceptual — schema lives in the codebase)

- **Mūla** — the root verse. Always visually primary.
- **Translation** — prose translation of mūla. Toggleable, mūla-level only.
- **Word-for-word gloss** — mūla-only feature, does not recurse into
  commentary. Rendered as a stacked list under the verse (not interlinear —
  interlinear breaks badly on mobile with long compounds).
- **Commentaries** — one or more per verse, each with its own author/script/
  language. Short commentaries expand inline; long-form (Śrī Bhāṣya-scale)
  open in a dedicated scrolling pane beside a compact pinned verse.
- **Sub-commentaries** — tied to a specific passage of their parent
  commentary (confirmed relationship, schema TBD later — not blocking design
  work now). Same chip → pane pattern, recursed one level inside the parent
  commentary's pane. Does not recurse further.
- **Cross-references** — plain hyperlinks (not a separate panel type), using
  existing hash routing. Optional hover/long-press **peek**: a lightweight
  floating tooltip showing the target's mūla text, rendered in the reader's
  current script/language. Max depth 1 — a peek's content is never itself
  peekable. New peek replaces old, never stacks.

## Interaction rules (settled, not open questions)

- **Commentary chip activation is additive.** Activating a new commentary
  never deactivates another; the reader turns things off manually.
- **Commentary comparison column cap: 2.** A 3rd active long-form commentary
  becomes a tab, not a third squeezed column — regardless of screen width.
  This is a rare case; don't build responsive column-width detection for it.
- **Landing page facets (category, author) are single-select, not
  combinable, in v1.** Picking one replaces any active filter on the other
  facet. Revisit only if corpus growth makes single-facet lists too long to
  scan.
- **Shared links always reproduce the sender's exact view** (script,
  language, dark mode, open commentaries) — no "clean default" option, no
  toggle. This applies both to cold opens and to the v1 sharing feature.
- **Sharing (v1 scope):**
  - Trigger: persistent share button/icon on the verse. Text-selection
    sharing is a deliberate v1.1 deferral, not v1.
  - Native `navigator.share()` where supported (puts WhatsApp directly in
    the OS share sheet on mobile); clipboard copy + toast fallback where
    unsupported (mostly desktop).
  - Payload: link (full view state, as above) **plus** an auto-generated
    text snippet — mūla + whatever commentary is currently open, each
    **truncated to a short preview with "..."** if long. This works around
    hash-based URLs never reaching WhatsApp's server-side OG-preview
    crawler, so recipients get real content in-chat, not a generic card.
- **Cross-grantha navigation preserves scroll position.** When a reader
  clicks through a cross-reference to another grantha and returns via back
  button, the long-commentary pane they left must restore both the correct
  open state *and* exact scroll position — store scroll offset in
  `sessionStorage`, keyed per verse+commentary (not `localStorage`; this is
  transient, not a preference), separate from the hash state that defines
  *what* is showing.
- **Navigation overlay: side drawer (slides over, dims).** The navigation
  sidebar collapses into a left-side drawer on mobile and tablet. It slides over
  the content with a dimming backdrop and closes on selection or on Escape. This
  is Open Design Choice #4 resolved — variant A.
- **Commentary overlay on mobile: bottom sheet.** On mobile, the commentary
  panel is a bottom sheet (slides up from the bottom of the screen, not a side
  drawer). The bottom sheet includes verse-level prev/next controls so the reader
  can step through verses without closing commentary. This resolves the commentary
  side of Choice #4 — the navigation and commentary overlays use *different*
  overlay types because they serve different reading contexts.
- **Commentary chip row: checkboxes with commentator name.** When a grantha
  has more than one commentary, each is shown as a labeled checkbox (commentator
  name in Devanagari). Multiple commentaries may be active simultaneously;
  at least one must remain active (the last active cannot be unchecked).
  This resolves Open Design Choice #5 — variant C (checkbox style), with
  full Devanagari name rather than a siglum abbreviation.
- **Focus changes only via explicit action.** The URL hash, commentary
  content, and breadcrumb update only when the reader makes a deliberate
  choice: tapping a verse, pressing Prev/Next, or following a cross-reference
  link. Scrolling the verse list is pure browsing with zero side effects —
  it must never change the URL hash or the displayed commentary.
  Scroll-driven focus tracking (IntersectionObserver updating hash and
  commentary as the reader scrolls) was implemented, tested, and reverted.
  It was found disruptive to sustained reading: live-updating a full
  commentary pane mid-scroll violates the "preserve place" and "zero
  cognitive load" principles this screen is built on. Do not reintroduce
  scroll-driven focus tracking without re-evaluating this decision.

  This prohibition covers *content focus* (URL hash, commentary, breadcrumb).
  It does not cover the reading mode's **folio navigation chrome**: the
  right-side outline follows the reader's scroll the way the collapsed strip
  already does — the current verse's label is highlighted with a gray pill,
  and crossing a section boundary opens the next accordion while collapsing
  the previous (exclusive, one section open). This is pure navigation
  affordance with zero side effects on reading state. Header-click remains a
  browse-only expand/collapse; the exclusive reset fires only when a section
  boundary is crossed (scroll or jump), never on every scroll tick, and
  within-section scrolling still toggles highlight classes imperatively with
  no tree re-render.
- **Flagging (v1 scope):**
  - Unified entry point for both content errors and product feedback — one
    button, not two separate mechanisms.
  - Auto-captures context (grantha, verse ref, open commentaries, URL);
    reader can edit or remove captured context before submitting.
  - Type toggle (Content Error / General Feedback), smart-defaulted from
    context (text selected → Content Error) but always visible and
    overridable — never silently auto-detected with no confirmation.
  - Submits via a small serverless API route that creates a labeled GitHub
    Issue using a server-side token. No reader-facing login, no new
    database — consistent with the v1 "local only" boundary below.

## v1 scope boundaries (deliberate exclusions)

- **No user accounts.** All state lives in localStorage/URL. Sync across
  devices is an explicit v2 feature — don't build toward it prematurely.
- **No search.** Navigation relies on hierarchy (sidebar tree / drawer) and
  cross-reference links.
- **No personal notes/annotations.** Pure reading and navigation first.
- **No combined landing-page filters.** Single facet at a time.

## Open design choices

The following are genuinely visual/felt decisions where a prototype settles
things faster than reasoning does. Each should be built by Claude Code as an
isolated set of labeled variants (A/B/C), rendered with **real sample text**
(actual Kena or Tiruvāymoḻi content — Devanagari/Tamil density changes how
these read; lorem ipsum will mislead the evaluation). These are the *only*
things still open — everything else in this document is settled.

1. **Mūla/commentary visual hierarchy**
   - A: size difference only (verse larger, same weight/color)
   - B: size + muted color/tone for commentary
   - C: size + muted tone + hairline rule/indent marking commentary as a
     distinct block (critical-edition style)

2. **Commentary comparison columns** (2-column cap, real long-form text)
   - A: plain hairline divider, no other chrome
   - B: subtle background tint per column, commentator name as running header
   - C: card-style columns with visible borders

3. **Peek tooltip** (cross-reference hover/long-press)
   - A: minimal floating tooltip, plain text, small
   - B: small bordered card with subtle shadow
   - C: inline expansion directly below the link instead of a floating popover

4. **Landing page grouping** (category/author sections — no cards, per
   principle 5 above)
   - A: plain typographic section headers, no visual containers
   - B: subtle horizontal dividers between sections
   - C: generous whitespace only, no rule lines, no headers beyond
     type-size difference

Once these are prototyped and a choice is made, move the winning option out
of this section and into the relevant principle/rule above, so this section
stays a short, current list of what's genuinely still undecided.
