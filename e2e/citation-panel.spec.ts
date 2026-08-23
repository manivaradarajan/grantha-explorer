import { test, expect } from "@playwright/test";

/**
 * Smoke tests for the docked citation panel (spec §8 verification).
 *
 * The panel must (a) genuinely collapse to zero height when closed (not a
 * transform that still reserves height), (b) sit inset — strictly narrower
 * than the flow reading column — as a distinct card, and (c) dismiss on an
 * outside click. Runs against the built static site in flow mode on the
 * Īśāvāsya grantha (Vedāntadeśika bhashya carries many cross-references).
 */

const FLOW_URL = "/#isavasya-upanishad:1?e=isavasya-upanishad-vedantadesika&m=flow";

test.beforeEach(async ({ page }) => {
  await page.goto(FLOW_URL);
  // The static app can briefly stall on "Loading granthas…" under load; wait
  // for the reader's commentary (which carries the reference links) with a
  // single reload retry before giving up.
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
});

test("the panel opens to a real height and collapses to zero on close", async ({ page }) => {
  // Click the first reference link.
  await page.locator(".reference-link").first().click();
  const panel = page.locator(".citation-panel.is-open");
  await expect(panel).toBeVisible();
  const openHeight = await panel.evaluate((el) => (el as HTMLElement).offsetHeight);
  expect(openHeight).toBeGreaterThan(0);

  // Close via the ✕. The panel unmounts entirely — the strongest possible
  // "collapses to zero height" (no element reserves any layout space).
  await page.locator(".citation-close").click();
  await expect(page.locator(".citation-panel")).toHaveCount(0);
});

test("the panel is narrower than the flow reading column, not flush with it", async ({ page }) => {
  await page.locator(".reference-link").first().click();
  const panel = page.locator(".citation-panel.is-open");
  await expect(panel).toBeVisible();

  // In flow mode the card is inset to the mūla verse measure (max-w-2xl),
  // strictly narrower than the reading column (max-w-3xl) it docks under —
  // never a second column flush with the text.
  const width = await panel.evaluate((el) => (el as HTMLElement).offsetWidth);
  const columnWidth = await panel.evaluate((el) => {
    const col = (el as HTMLElement).parentElement!.querySelector(
      ".overflow-y-auto .mx-auto",
    );
    return col ? (col as HTMLElement).offsetWidth : 0;
  });
  expect(width).toBeGreaterThan(0);
  expect(width).toBeLessThan(columnWidth);
});

test("clicking the reading pane dismisses the panel", async ({ page }) => {
  await page.locator(".reference-link").first().click();
  const panel = page.locator(".citation-panel.is-open");
  await expect(panel).toBeVisible();

  // Click in the main reading pane's left gutter — outside the card and away
  // from any reference link or verse. (The flow reader has several scroll
  // containers; `.overflow-x-hidden` singles out the reading pane.)
  const pane = page.locator(".flow-reader .overflow-y-auto.overflow-x-hidden");
  const box = await pane.boundingBox();
  await page.mouse.click(box!.x + 30, box!.y + 260);
  await expect(page.locator(".citation-panel")).toHaveCount(0);
});

test("the panel content shows the cited passage and a close button", async ({ page }) => {
  await page.locator(".reference-link").first().click();
  const panel = page.locator(".citation-panel.is-open");
  await expect(panel).toBeVisible();
  await expect(panel.locator(".citation-source-title")).toBeVisible();
  await expect(panel.locator(".citation-content-text")).toBeVisible();
});

test("the quoted span in the source bhashya is marked while the card is open", async ({ page }) => {
  // Desika quotes the cited verse in markdown bold before the locator — the
  // exact-quote path steel-blue-marks it in the source text (not just in the
  // card's preview).
  await page.locator(".reference-link").first().click();
  const panel = page.locator(".citation-panel.is-open");
  await expect(panel).toBeVisible();
  const mark = page.locator("mark.citation-source-mark").first();
  await expect(mark).toBeVisible();
  expect(await mark.textContent()).toContain("ज्ञाज्ञौ");
});
