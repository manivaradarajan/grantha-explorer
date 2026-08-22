/**
 * Scrollspy + scroll→hash robustness smoke test for the flow reader.
 *
 * Verifies the behavior fixed in the single-observer scrollspy refactor:
 *  1. Deep-link mount must NOT rewrite the URL (was #…:1.20 → :1.21).
 *  2. Folio strip jump stays on the jumped verse.
 *  3. Scroll updates the hash via replaceState, with NO history spam.
 *  4. Display prefs (?s=, ?sc=) survive scroll-driven hash updates.
 *  5. A verse click still pushes history (unlike scroll).
 *  6. The folio marker never blanks through the prefatory preface, and the
 *     header chapter tracks the view across chapter boundaries.
 *  7. Compare mode: the same hold/scroll guarantees hold with two editions.
 *
 * Run with: node scrollspy-verification.mjs   (requires the dev server, e.g.
 * `npm run dev` on port 4000 — set BASE to override).
 */

import { chromium } from "@playwright/test";

const BASE = process.env.BASE || "http://localhost:4000";
const COMPARE_GRANTHA = "isavasya-upanishad";
const EDITION_A = "isavasya-upanishad-vedantadesika";
const EDITION_B = "isavasya-upanishad-sankara-bhashya";

let pass = 0;
let fail = 0;
const log = (msg) => console.log(msg);
const check = (name, cond, detail = "") => {
  if (cond) {
    pass++;
    log(`  ✓ ${name}`);
  } else {
    fail++;
    log(`  ✗ ${name} ${detail}`);
  }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

const hash = () => page.evaluate(() => window.location.hash);
const hist = () => page.evaluate(() => history.length);
const goto = (url) => page.goto(`${BASE}/${url}`, { waitUntil: "networkidle" });

const scrollTo = async (top) => {
  // Simulate a real user scroll: a wheel gesture (which the reader treats as
  // user intent to scroll — the gate for scroll→hash) followed by the actual
  // scrollTop movement. Setting scrollTop alone does not constitute a user
  // scroll (programmatic aligns and scroll anchoring also move it).
  await page.evaluate((t) => {
    const c = [...document.querySelectorAll(".flow-reader div")].find((d) =>
      d.classList.contains("overflow-y-auto")
    );
    if (c) {
      c.dispatchEvent(new WheelEvent("wheel", { deltaY: t, bubbles: true }));
      c.scrollTop = t;
    }
  }, top);
  await page.waitForTimeout(1200);
};

const stripActive = () =>
  page.locator(".strip-verse.bg-gray-100").first().textContent().catch(() => null);
const header = () =>
  page
    .locator(".flow-reader header button span.font-serif")
    .first()
    .textContent()
    .catch(() => null);

// 1. Deep link: mount must not rewrite the deliberate selection.
await goto("#bhagavad-gita:1.20?m=flow");
await page.waitForTimeout(2500);
check("deep link 1.20 stays", (await hash()).includes(":1.20"), await hash());

// 2. Folio strip jump stays.
await goto("#bhagavad-gita:1.1?m=flow");
await page.waitForTimeout(1800);
await page
  .locator('.strip-verse[data-ref="1.5"]')
  .click()
  .catch(() => log("  ! strip verse 1.5 not found"));
await page.waitForTimeout(1500);
check("folio strip jump to 1.5 stays", (await hash()).includes(":1.5"), await hash());

// 3. Scroll tracking with no history spam.
const h0 = await hist();
await scrollTo(4000);
check(
  "scroll updates hash",
  (await hash()).includes(":1.") && !(await hash()).includes(":1.5"),
  await hash()
);
check("scroll does not spam history", (await hist()) === h0, `${h0}->${await hist()}`);

// 4. Display prefs survive scroll-driven hash updates.
await goto("#bhagavad-gita:1.1?s=roman&m=flow");
await page.waitForTimeout(1800);
await scrollTo(4000);
check("s=roman survives scroll", (await hash()).includes("s=roman"), await hash());

await goto("#bhagavad-gita:1.11?sc=tatparya-chandrika&m=flow");
await page.waitForTimeout(1800);
await scrollTo(4000);
check(
  "sc= survives scroll",
  (await hash()).includes("sc=tatparya-chandrika"),
  await hash()
);

// 5. Verse click pushes history (scroll does not).
const hPre = await hist();
await page.evaluate(() => {
  const c = [...document.querySelectorAll(".flow-reader div")].find((d) =>
    d.classList.contains("overflow-y-auto")
  );
  const el = c?.querySelector('[data-verse-ref="1.20"]');
  el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await page.waitForTimeout(1500);
check("verse click pushes history", (await hist()) === hPre + 1, `${hPre}->${await hist()}`);
check("verse click updates hash", (await hash()).includes(":1.20"), await hash());

// 6. Folio marker never blanks through the preface; header tracks chapters.
await goto("#bhagavad-gita:1.11?sc=tatparya-chandrika&m=flow");
await page.waitForTimeout(1800);
await scrollTo(6000);
check("strip active after deep scroll", (await stripActive()) !== null, await stripActive());
await scrollTo(1200);
check("strip not blanked near preface", (await stripActive()) !== null, await stripActive());

await goto("#bhagavad-gita:1.1?m=flow");
await page.waitForTimeout(1800);
for (const t of [6000, 10000, 14000, 18000]) await scrollTo(t);
const hdr = await header();
check("header tracks chapter 2", hdr === "अध्यायः २", hdr);

// 7. Compare mode: two editions, deep link stays, scroll tracks, prefs survive.
//    (isavasya is a depth-1 grantha with flat refs 1..18, so the canonical
//    first ref is "1", not "1.1".)
await goto(
  `#${COMPARE_GRANTHA}:1?e=${EDITION_A},${EDITION_B}&s=roman&m=flow`
);
await page.waitForTimeout(3000);
check(
  "compare deep link 1 stays",
  (await hash()).includes(`${COMPARE_GRANTHA}:1?`),
  await hash()
);
const hC0 = await hist();
await scrollTo(4000);
// The compare deep-link mount arms a short programmatic hold; wait it out so a
// scroll that lands inside the window still gets flushed.
await page.waitForTimeout(1500);
const hC1 = await hist();
check(
  "compare scroll tracks verse",
  !(await hash()).includes(`${COMPARE_GRANTHA}:1?`),
  await hash()
);
check("compare scroll no history spam", hC1 === hC0, `${hC0}->${hC1}`);
check("compare s=roman survives scroll", (await hash()).includes("s=roman"), await hash());
// URLSearchParams encodes the comma in ?e= as %2C; decode before asserting.
const decoded = decodeURIComponent(await hash());
check(
  "compare edition list survives scroll",
  decoded.includes(`e=${EDITION_A},${EDITION_B}`),
  decoded
);

// 8. Edition deep link: a mid-text verse with a specific edition (e.g. the
//    sankara bhashya on isavasya mantra 8) must not be rewritten to the first
//    verse on mount. The mount scrollspy report fires at scrollTop 0 (verse 1)
//    before the deep-linked verse is aligned to — it must not clobber the URL.
await goto(
  `#${COMPARE_GRANTHA}:8?e=${EDITION_B}&m=flow`
);
await page.waitForTimeout(3500);
check(
  "isavasya 8 + sankara edition deep link stays",
  (await hash()).includes(`${COMPARE_GRANTHA}:8?`),
  await hash()
);
check(
  "isavasya 8 deep link keeps the edition",
  (await hash()).includes(`e=${EDITION_B}`),
  await hash()
);

// 9. Multi-part deep link: a verse in a late part (brihadaranyaka 8.3.4 lives
//    in the final part file, loaded lazily after eager sections 3.x). The hash
//    must survive the mount report AND the late part load inserting content
//    above (which shifts verse midpoints / triggers scroll anchoring).
await goto(
  "#brihadaranyaka-upanishad:8.3.4?e=brihadaranyaka-upanishad-sankara-bhashya&m=flow"
);
await page.waitForTimeout(5000);
check(
  "brihadaranyaka 8.3.4 deep link stays",
  (await hash()).includes("brihadaranyaka-upanishad:8.3.4?"),
  await hash()
);

log(`\nPASS: ${pass}  FAIL: ${fail}`);
if (errors.length) log("page errors:\n" + errors.join("\n"));
await browser.close();
process.exit(fail ? 1 : 0);
