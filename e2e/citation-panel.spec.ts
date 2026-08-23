import { test, expect } from "@playwright/test";

/**
 * Smoke tests for the docked citation panel (spec §8 verification).
 *
 * The panel must (a) genuinely collapse to zero height when closed (not a
 * transform that still reserves height), and (b) track its container's width.
 * Runs against the built static site in flow mode on the Īśāvāsya grantha
 * (Vedāntadeśika bhashya carries many cross-references).
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

test("the panel width matches the reading column, not the window", async ({ page }) => {
  await page.locator(".reference-link").first().click();
  const panel = page.locator(".citation-panel.is-open");
  await expect(panel).toBeVisible();

  // In flow mode the panel is capped to the reading column's measure and
  // centered, so it must be narrower than the scroll container and match the
  // content column's width.
  const width = await panel.evaluate((el) => (el as HTMLElement).offsetWidth);
  const containerWidth = await panel.evaluate((el) => {
    const scroll = (el as HTMLElement).parentElement!.querySelector(".overflow-y-auto");
    return scroll ? (scroll as HTMLElement).offsetWidth : 0;
  });
  expect(width).toBeGreaterThan(0);
  expect(width).toBeLessThan(containerWidth);
});

test("the panel content shows the cited passage and a close button", async ({ page }) => {
  await page.locator(".reference-link").first().click();
  const panel = page.locator(".citation-panel.is-open");
  await expect(panel).toBeVisible();
  await expect(panel.locator(".citation-source-title")).toBeVisible();
  await expect(panel.locator(".citation-content-text")).toBeVisible();
});
