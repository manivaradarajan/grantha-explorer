import { test, expect } from "@playwright/test";

/**
 * Smoke tests for the floating citation popover (spec §8 verification).
 *
 * The popover must (a) be a compact floating bubble anchored to the
 * reference (not a docked card), (b) place below when there's room and flip
 * above at the viewport's bottom edge, (c) show its pointer tail only in a
 * clean placement, (d) stay within viewport margins on narrow screens,
 * (e) dismiss on scroll, and (f) mark the quoted span in the source text.
 * Runs against the built static site in flow mode on the Īśāvāsya grantha
 * (Vedāntadeśika bhashya carries many cross-references).
 */

const FLOW_URL = "/#isavasya-upanishad:1?e=isavasya-upanishad-vedantadesika&m=flow";

test.beforeEach(async ({ page }) => {
  await page.goto(FLOW_URL);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.waitForSelector(".flow-commentary, .reference-link", {
        timeout: 15000,
      });
      await page.waitForSelector(".reference-link", { timeout: 5000 });
      break;
    } catch {
      if (attempt === 1) throw new Error("reader never rendered reference links");
      await page.reload();
      await page.waitForLoadState("domcontentloaded");
    }
  }
  // The first reference link may sit below the fold; bring it on-screen so a
  // click is actionable (the popover anchors to the reference's rect). Use a
  // plain scroll — NOT scrollIntoView (which focuses the link, and focus opens
  // the pinned popover, turning the test's first click into a navigation).
  await page.evaluate(() => {
    const el = document.querySelector(".reference-link");
    if (el) {
      const r = el.getBoundingClientRect();
      window.scrollBy(0, r.top - 200);
    }
  });
});

test("opens a compact floating popover on click and closes via ✕", async ({ page }) => {
  await page.locator(".reference-link").first().click();
  const pop = page.locator(".citation-popover");
  await expect(pop).toBeVisible();
  // Compact width, roughly the 320px design measure.
  const width = await pop.evaluate((el) => (el as HTMLElement).offsetWidth);
  expect(width).toBeGreaterThan(250);
  expect(width).toBeLessThan(360);

  await page.locator(".citation-close").click();
  await expect(pop).toHaveCount(0);
});

test("a second click on the pinned reference navigates to the cited passage", async ({ page }) => {
  await page.locator(".reference-link").first().click();
  const pop = page.locator(".citation-popover");
  await expect(pop).toBeVisible();
  const hashBefore = await page.evaluate(() => location.hash);
  // Second click (already pinned) navigates away from the citing verse.
  await page.locator(".reference-link").first().click();
  await expect
    .poll(async () => page.evaluate(() => location.hash), { timeout: 5000 })
    .not.toBe(hashBefore);
  await expect(pop).toHaveCount(0);
});

test("places below when there is room and flips above near the viewport bottom", async ({ page }) => {
  // A link near the top → below.
  await page.locator(".reference-link").first().click();
  const pop = page.locator(".citation-popover");
  await expect(pop).toBeVisible();
  const belowClass = await pop.evaluate((el) => el.className);
  expect(belowClass).toContain("below");
  // Tail present in a clean below placement.
  await expect(page.locator(".citation-tail")).toBeVisible();
  await page.keyboard.press("Escape");

  // Scroll the link toward the viewport bottom → should flip above. This uses
  // scrollIntoView (which focuses the link), but that's safe here: the Escape
  // above already closed the popover, so the focus-open is exactly the pinned
  // state the test then clicks once to re-open and assert placement on.
  await page.locator(".reference-link").first().evaluate((el) => {
    el.scrollIntoView({ block: "end" });
  });
  await page.locator(".reference-link").first().click();
  await expect(page.locator(".citation-popover")).toBeVisible();
  const placement = await page
    .locator(".citation-popover")
    .evaluate((el) => el.className);
  expect(placement).toMatch(/above|forced/);
});

test("dismisses on scroll of the reading surface", async ({ page }) => {
  await page.locator(".reference-link").first().click();
  const pop = page.locator(".citation-popover");
  await expect(pop).toBeVisible();
  await page.locator(".flow-reader .overflow-y-auto").first().evaluate((el) => {
    el.scrollTop += 200;
    el.dispatchEvent(new Event("scroll"));
  });
  await expect(pop).toHaveCount(0);
});

test("stays within the viewport horizontally (centered on the reference)", async ({ page }) => {
  // The popover centers on the reference and clamps against the viewport with
  // the 12px margin from --citation-viewport-margin. Open it and assert the
  // box sits fully on-screen with margins on both sides.
  await page.locator(".reference-link").first().click();
  const pop = page.locator(".citation-popover");
  await expect(pop).toBeVisible();
  const box = await pop.boundingBox();
  expect(box, "popover must have a bounding box").not.toBeNull();
  const vp = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(10);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width - 10);
  // Roughly the 320px design width.
  expect(box!.width).toBeGreaterThan(250);
  expect(box!.width).toBeLessThan(360);
});

test("the quoted span in the source bhashya is marked while the popover is open", async ({ page }) => {
  await page.locator(".reference-link").first().click();
  const pop = page.locator(".citation-popover");
  await expect(pop).toBeVisible();
  const mark = page.locator("mark.citation-source-mark").first();
  await expect(mark).toBeVisible();
  expect(await mark.textContent()).toContain("ज्ञाज्ञौ");
});
