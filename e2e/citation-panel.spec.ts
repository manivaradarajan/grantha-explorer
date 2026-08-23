import { test, expect } from "@playwright/test";

/**
 * Smoke tests for the floating citation popover (spec §8 verification).
 *
 * On desktop (Playwright's default fine-pointer viewport), hover peeks the
 * popover and the FIRST click follows the link (navigates); focus pins it
 * (✕ available). These tests cover: peek opens on hover and closes via ✕
 * when pinned; a click navigates; below/above placement with the pointer
 * tail; scroll dismissal; horizontal viewport clamping; and the steel-blue
 * source-text mark. Runs in flow mode on the Īśāvāsya grantha (Vedāntadeśika
 * bhashya carries many cross-references).
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
  // Bring the first reference link near the top of the viewport so a hover is
  // actionable and placement is "below". Plain scroll (not scrollIntoView) to
  // avoid focusing the link.
  await page.evaluate(() => {
    const el = document.querySelector(".reference-link");
    if (el) {
      const r = el.getBoundingClientRect();
      window.scrollBy(0, r.top - 200);
    }
  });
});

const firstRef = (page: import("@playwright/test").Page) =>
  page.locator(".reference-link").first();

test("hover peeks a compact popover; pinning via focus reveals ✕, which closes it", async ({ page }) => {
  await firstRef(page).hover();
  const pop = page.locator(".citation-popover");
  await expect(pop).toBeVisible();
  // Compact width, roughly the 320px design measure.
  const width = await pop.evaluate((el) => (el as HTMLElement).offsetWidth);
  expect(width).toBeGreaterThan(250);
  expect(width).toBeLessThan(360);
  // Peek has no ✕ (it's pinned-only); focus pins it, revealing ✕.
  await expect(page.locator(".citation-close")).toHaveCount(0);
  await firstRef(page).focus();
  await expect(page.locator(".citation-close")).toBeVisible();
  await page.locator(".citation-close").click();
  await expect(pop).toHaveCount(0);
});

test("on desktop the first click on the reference follows the link", async ({ page }) => {
  const hashBefore = await page.evaluate(() => location.hash);
  await firstRef(page).click();
  await expect
    .poll(async () => page.evaluate(() => location.hash), { timeout: 5000 })
    .not.toBe(hashBefore);
  // No popover left behind (navigation superseded it).
  await expect(page.locator(".citation-popover")).toHaveCount(0);
});

test("places below when there is room and flips above near the viewport bottom", async ({ page }) => {
  // A link near the top → below (peek via hover).
  await firstRef(page).hover();
  const pop = page.locator(".citation-popover");
  await expect(pop).toBeVisible();
  const belowClass = await pop.evaluate((el) => el.className);
  expect(belowClass).toContain("below");
  // Tail present in a clean below placement.
  await expect(page.locator(".citation-tail")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(pop).toHaveCount(0);

  // Move the link to the bottom of the reading pane. The popover only
  // repositions on open, so close-then-reopen is required to test the flip.
  await page.locator(".flow-reader .overflow-y-auto").first().evaluate((el) => {
    const container = el as HTMLElement;
    const link = container.querySelector(".reference-link") as HTMLElement;
    container.scrollTop = link.offsetTop + link.offsetHeight - container.clientHeight + 40;
    container.dispatchEvent(new Event("scroll"));
  });
  await firstRef(page).hover();
  await expect(pop).toBeVisible();
  const placement = await pop.evaluate((el) => el.className);
  expect(placement).toMatch(/above|forced/);
});

test("dismisses on scroll of the reading surface", async ({ page }) => {
  await firstRef(page).hover();
  const pop = page.locator(".citation-popover");
  await expect(pop).toBeVisible();
  // Wait past the open "settle" window (focus-induced scrolls right after open
  // are suppressed) so this is treated as a genuine later scroll.
  await page.waitForTimeout(400);
  await page.locator(".flow-reader .overflow-y-auto").first().evaluate((el) => {
    el.scrollTop += 200;
    el.dispatchEvent(new Event("scroll"));
  });
  await expect(pop).toHaveCount(0);
});

test("stays within the viewport horizontally (centered on the reference)", async ({ page }) => {
  // The popover centers on the reference and clamps against the viewport with
  // the 12px margin from --citation-viewport-margin.
  await firstRef(page).hover();
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
  await firstRef(page).hover();
  const pop = page.locator(".citation-popover");
  await expect(pop).toBeVisible();
  const mark = page.locator("mark.citation-source-mark").first();
  await expect(mark).toBeVisible();
  expect(await mark.textContent()).toContain("ज्ञाज्ञौ");
});
