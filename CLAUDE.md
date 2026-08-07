# The Practice of Meditation — project context for Claude Code

## What this is

A systematic, practical guide to meditation as taught in Rāmānuja's *Śrīmad-Gītābhāṣya* (Bh) and Vedānta Deśika's *Tātparyacandrikā* (TC), both on the Bhagavad Gītā. The intended reader is a **beginning practitioner** sitting down to meditate. The guide is organized by the logic of the practice itself — not chapter by chapter. It is a living document: each new source chapter is read, its relevant material extracted, and folded into the existing thematic structure rather than appended as a new chapter section.

The guide draws on Adhyāya 2, 3, 5, 6, 12, and the *Gītārtha-saṅgraha-rakṣā* (GR). The current document is `the-practice-of-meditation.md`. Source files: bhāṣya in `rb/`, TC in `tc/`.

---

## Two-phase workflow — read before you edit

This project has two distinct phases that must not be merged in a single invocation. Model selection is handled by the scripts; do not recommend model switches.

**Phase 1 — Extraction** (`./read.sh`): read the source files in full, then produce an extraction plan for user review. State the plan and wait. **Do not edit `the-practice-of-meditation.md` until the extraction plan has been explicitly approved by the user.**

**Phase 2 — Editing** (`./edit.sh`): execute the approved extraction plan against `the-practice-of-meditation.md` using `str_replace`. Do not re-read source files or produce a new plan; work from the approved plan only.

---

## Absolute rules

**Sources:** Use only material from the bhāṣya and TC files in `rb/` and `tc/`. Do not bring in external frameworks, other commentators, or material from chapters not yet provided. The GR/GS may be cited where it directly informs structure (the three-hexad map, the milk-and-sugar principle) but was studied for structural understanding, not line-by-line incorporation.

**Polemic:** Drop it unless it *is* the practice. Three exceptions where it stays because the argument is the method: (1) the support-vs-end distinction (why the Lord, not the bare self, is the resting-support); (2) the non-doership distinction (the self IS a real agent; ahaṃkāra is the error, not doership itself); (3) the sense/self-vision deadlock and its resolution via the Lord as śubhāśraya.

**Left column:** Practical instruction — what to do, what not to do, how to do it. Surface the *how* wherever the commentary states it, not just the *what* and *why*.

**Right column:** Sanskrit phrases and root references in the format `` `phrase` (Source reference) ``. Abbreviations: **G** = Gītā verse · **Bh** = Rāmānuja's bhāṣya · **TC** = Tātparyacandrikā · **GS** = Gītārtha-saṅgraha · **VP** = Viṣṇu Purāṇa · **BS** = Brahmasūtra.

**New chapters:** Read fully, extract only what is genuinely new and practically relevant, then fold into the appropriate existing section. Do not create new chapter-named sections.

**Criterion for inclusion:** Does this directly help a beginning practitioner know what to do, what not to do, or how to recognize where they are? If no, leave it out.

---

## Established conventions

**Casing:**
- *self* (lowercase) = individual self, jīvātman — what is *beheld* in this practice
- *Self* (capital) = Supreme Self / Paramātman — only where the commentary explicitly reads ātman this way (e.g., TC 5.13's `paramātmānam`)
- *Lord* = Bhagavān, "Me" (matparaḥ), Puruṣottama — the support the mind rests on and the ultimate end; kept distinct from the self

**"brahman"** in Adhyāya 2 and 5 = the self in its true nature and the bliss of beholding it. At 5.10 = *prakṛti*. At 12.8 "mayi" = unambiguously the Lord.

**Dual referent:** `vidyāvinayasampanne brāhmaṇe` (G 5.18) = two separate referents — a person endowed with knowledge-and-humility, and a mere brahmin (by birth). Not "a learned brahmin." (`padadvayaṃ na samānādhikaraṇam`, TC 5.18.)

**TC 3.42:** `yo buddheḥ paratastu saḥ` = kāma (desire born of rajas), not ātman. The four-level enemy sequence is senses → mind → buddhi → kāma itself.

**TC 12.12:** The five-level ladder of ch. 12 is not "more interior = better." It is addressed to those who cannot genuinely access the higher level. Doing a lower level with its required quality surpasses doing a higher level without it.

---

## Key interpretive positions (do not reverse)

1. **The two objects are roles, not rivals.** The self is the *proximate* end to be beheld (first hexad); the Lord is the *ultimate* end. Self-vision leads to *parā bhakti* which reaches the Lord. The Lord is also the support the mind rests on during practice. Deśika explicitly rules out the bare self as the resting-support (`āśrayaśabdena pariśuddhātmasvarūpasya … vyavacchedaḥ`, TC 2.61).

2. **Non-doership.** The self IS a real agent (`kartā śāstrārthavattvāt`, TC 5.9). What the contemplation sets aside is the body-and-karma-rooted, ahaṃkāra-mediated, merit-and-demerit-generating doership — not doership as such. "I am not *this* conditioned actor," not "I never act."

3. **The deadlock and its resolution.** Sense-mastery needs self-vision; self-vision needs sense-mastery (Bh 2.60). The Lord as śubhāśraya breaks this: resting on the Lord purifies the mind → purified mind masters senses → sense-mastered mind beholds the self (Bh 2.61).

4. **Equanimity is a waypost, not a gate.** The entry floor (6.7, `yogārambhayogyā avasthā`) is all you need to begin sitting. The ideal readiness (6.8–9) is what practice produces over time.

5. **Mithyācāra warning** (G 3.6). Attempting meditation without karmayoga preparation is explicitly called false practice. The inner instrument is not yet purified. The preparation is not optional.

6. **The practice ladder (ch. 12) reads bottom-up.** Foundation = karmayoga with fruit-renunciation. First fork: when Level 3 (mat-karma) opens. Second fork: Level 2 (loving remembrance) is reachable either ascending from Level 3, or when self-vision from karmayoga produces bhakti spontaneously. Level 1 = direct mind-immersion. The 12.12 inner sub-ladder sits within the Foundation section.

7. **The milk-and-sugar principle (kṣīra-śarkarā nyāya, GS 24).** All three yogas are always present simultaneously, one dominant and the others subordinate.

8. **Posture specifics (ch. 6).** Seated (not standing or lying — BS 4.1.7); body erect with back-support; gaze at own nose-tip as a soft line of sight, not a stare; breath equalized and quiet — neither long in-breath nor long out-breath (`na dīrgham ucchvasan nāpi niśvasan`, TC 5.27); "one-pointed" means withdrawn from external objects only, not extinction of all mental activity (`bāhyaviṣayebhya evāyam upasaṃhāraḥ … anyathātmāvalokanam api na syāt`, TC 6.12).

---

## Current document structure

```
Part A — Orientation (settled before you sit)
  A1. The conviction to begin from — and your one instrument, the mind
  A2. The two objects, rightly ordered
  A3. Where to begin — and how to know you're ready
  A4. The ascending path — levels, forks, and how each opens

Part B — The continuous inner discipline
  B1. Hold non-doership under every act
  B2. Dispassion, both halves — and the two levers (abhyāsa + vairāgya)
  B3. Equal vision, and well-wishing as its intimate aid
  B4. The enemy: kāma and its four stations
  B5. The character of the practitioner in daily life (ch. 12.13–19)

Part C — The sitting itself
  C1. Time, place, and seat
  C2. Body, gaze, and vow
  C3. Where the mind rests, and why
  C4. Withdrawing the senses, the breath, and moderation
  C5. Settling the mind, and bringing it back
  C6. The four graded stages of steadiness
  C7. Guarding the mind, and restraining the surge

Part D — What to avoid, and the fruit
  D1. The cascade of ruin
  D2. Serenity (prasāda), and the supreme happiness gained without strain
  D3. The established state, and the fourfold ripening
  D4. Perseverance, and the culmination

Part E — If this, then that (conditional guides)
  Six conditional tables

Bare procedure (numbered steps 1–7)

FAQ (five questions)
```

---

## Chapters remaining and recommended order

**Chapter 13** (priority: high). Field (kṣetra) and knower of field (kṣetrajña). The discrimination between the two is what `vivekaviṣayeṇa manasā` (Bh 5.13) means in practice. The list of twenty virtues at 13.7–11 is described as *knowledge* (jñānam) itself. Fold virtue list into B (expanding B5 or creating B6); field/knower distinction deepens B1.

**Chapter 14** (priority: high). The three guṇas — diagnostic vocabulary for what kind of wandering the mind is doing. Fold into Part E (new diagnostic conditional table) and possibly C or D.

**Chapter 17** (priority: medium, selective). Threefold tapas (17.14–16): body, speech, and mind. Mental tapas (`manaḥprasādaḥ`, `maunam`, `ātmavinigrahaḥ`, `bhāvasaṃśuddhi`) belong in Part B alongside B5. Use selectively.

**Chapter 8** (priority: low, selective). `mām anusmara yudhya ca` (8.7) — a daily anchor usable in A or B. Add only what is genuinely new relative to 5.27–28 and 6.10–14.

**Hold back for now:** Chapters 7, 9, 10, 11, 15, 18.

---

## Working method for each new chapter

1. Read the bhāṣya and TC files in full before writing anything.
2. Identify what is **genuinely new** relative to what is already in the document. Much of each chapter recapitulates earlier material — do not duplicate.
3. Identify where each new element belongs in the existing structure.
4. Draft additions as targeted edits using `str_replace`, not wholesale rewrites.
5. After integration, run a consistency check: casing (`self`/`Self`/`Lord`); reference format (G/Bh/TC); "not advised" formatting; the "how" is surfaced not just the "what."
6. Update the bare procedure and Part E conditionals if the new material introduces new "if X then Y" structures.
7. Do not add new top-level sections (A5, C8, etc.) without strong justification.
