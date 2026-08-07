/**
 * Verification script for the scroll-spy revert.
 * Tests items 1-4 from the task spec:
 *  1 — Scroll extensively: URL hash and commentary must never change
 *  2 — Tap verse: hash updates immediately (no debounce delay)
 *  3 — Prev/Next: hash updates immediately
 *  4 — Deep-link into non-default part (taittiriya:2.1.1): stays there
 *
 * Run with: node revert-verification.mjs
 */

import { chromium } from '@playwright/test';

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const BASE = 'http://localhost:3000';

async function scrollContainer(page, deltaY) {
  await page.evaluate((dy) => {
    const c = Array.from(document.querySelectorAll('.overflow-y-auto'))
      .find(el => el.className.includes('pb-6'));
    c?.scrollBy(0, dy);
  }, deltaY);
}

async function getHash(page) {
  return page.evaluate(() => window.location.hash);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const results = {};

  // ─── ITEM 1: Extensive scroll — hash must NEVER change ───────────────────────
  console.log('\n[ITEM 1] Scroll extensively — hash and commentary must not change...');
  try {
    const page = await context.newPage();

    // Record every hash change
    const hashChanges = [];
    await page.exposeFunction('onHashChange', (h) => hashChanges.push(h));
    await page.addInitScript(() => {
      window.addEventListener('hashchange', () => window.onHashChange(window.location.hash));
    });

    await page.goto(`${BASE}/#isavasya-upanishad:3`, { waitUntil: 'networkidle' });
    await wait(1500);

    const hashAtStart = await getHash(page);
    console.log('  Hash at start:', hashAtStart);

    // Slow scroll (reading pace)
    for (let i = 0; i < 10; i++) {
      await scrollContainer(page, 200);
      await wait(150);
    }
    // Fast fling scroll
    for (let i = 0; i < 5; i++) {
      await scrollContainer(page, 800);
      await wait(50);
    }
    // Scroll to end
    for (let i = 0; i < 20; i++) {
      await scrollContainer(page, 600);
      await wait(60);
    }
    // Wait well past any debounce that might have existed
    await wait(1000);

    const hashAtEnd = await getHash(page);
    console.log('  Hash at end:', hashAtEnd);
    console.log('  Hash changes observed:', hashChanges.length, hashChanges);

    const noHashChange = hashAtStart === hashAtEnd && hashChanges.length === 0;
    results['1'] = noHashChange ? 'PASS' : 'FAIL';
    console.log(`  Result: ${results['1']} (hash unchanged: ${noHashChange})`);
    await page.close();
  } catch (e) {
    results['1'] = `ERROR: ${e.message}`;
    console.log('  Error:', e.message);
  }

  // ─── ITEM 2: Tap verse — immediate hash update, no debounce lag ──────────────
  console.log('\n[ITEM 2] Tap verse — hash updates immediately, no 400ms lag...');
  try {
    const page = await context.newPage();
    await page.goto(`${BASE}/#isavasya-upanishad:1`, { waitUntil: 'networkidle' });
    await wait(1500);

    // Click the verse div for verse 5 (5th verse-text element)
    const verseDivs = page.locator('.verse-text');
    const count = await verseDivs.count();
    console.log('  Verse divs found:', count);

    if (count >= 5) {
      const t0 = Date.now();
      await verseDivs.nth(4).click(); // 0-indexed, 5th verse
      // Check hash very quickly (50ms) to confirm no debounce
      await wait(50);
      const hashFast = await getHash(page);
      const elapsed = Date.now() - t0;
      console.log(`  Hash at ${elapsed}ms after tap:`, hashFast);

      // Also confirm it's still the same after 500ms (no delayed change)
      await wait(500);
      const hashLate = await getHash(page);
      console.log('  Hash at 550ms after tap:', hashLate);

      const changedQuickly = hashFast !== '#isavasya-upanishad:1';
      const stable = hashFast === hashLate;
      results['2'] = (changedQuickly && stable) ? 'PASS' : 'FAIL';
      console.log(`  Result: ${results['2']} (changed quickly: ${changedQuickly}, stable: ${stable})`);
    } else {
      results['2'] = 'SKIP (not enough verse divs)';
    }
    await page.close();
  } catch (e) {
    results['2'] = `ERROR: ${e.message}`;
    console.log('  Error:', e.message);
  }

  // ─── ITEM 3: Prev/Next — immediate hash update, no lag ───────────────────────
  console.log('\n[ITEM 3] Prev/Next — hash updates immediately, no lag...');
  try {
    const page = await context.newPage();
    await page.goto(`${BASE}/#isavasya-upanishad:5`, { waitUntil: 'networkidle' });
    await wait(1500);

    const hashBefore = await getHash(page);
    console.log('  Hash before Next:', hashBefore);

    const t0 = Date.now();
    await page.click('button[aria-label="Next verse"]');
    await wait(50);
    const hashFast = await getHash(page);
    const elapsed = Date.now() - t0;
    console.log(`  Hash at ${elapsed}ms after Next:`, hashFast);

    await wait(600);
    const hashLate = await getHash(page);
    console.log('  Hash at 650ms after Next:', hashLate);

    const changedQuickly = hashFast !== hashBefore;
    const stableAfter = hashFast === hashLate;
    results['3'] = (changedQuickly && stableAfter) ? 'PASS' : 'FAIL';
    console.log(`  Result: ${results['3']} (changed quickly: ${changedQuickly}, stable: ${stableAfter})`);
    await page.close();
  } catch (e) {
    results['3'] = `ERROR: ${e.message}`;
    console.log('  Error:', e.message);
  }

  // ─── ITEM 4: Deep-link into non-default part — stays there ───────────────────
  console.log('\n[ITEM 4] Deep-link taittiriya:2.1.1 — URL stays at 2.1.1...');
  try {
    const page = await context.newPage();
    const hashChanges = [];
    await page.exposeFunction('onHashChange', (h) => hashChanges.push({ t: Date.now(), h }));
    await page.addInitScript(() => {
      window.addEventListener('hashchange', () => window.onHashChange(window.location.hash));
    });

    const t0 = Date.now();
    await page.goto(`${BASE}/#taittiriya-upanishad:2.1.1`, { waitUntil: 'networkidle' });
    await wait(4000);

    const finalHash = await getHash(page);
    console.log('  Initial URL: #taittiriya-upanishad:2.1.1');
    console.log('  Hash changes observed:');
    hashChanges.forEach(({ t, h }) => console.log(`    +${t - t0}ms: ${h}`));
    console.log('  Final hash:', finalHash);

    // Also scroll around to confirm hash still does not change
    for (let i = 0; i < 10; i++) {
      await scrollContainer(page, 300);
      await wait(80);
    }
    await wait(500);
    const hashAfterScroll = await getHash(page);
    console.log('  Hash after post-load scroll:', hashAfterScroll);

    const staysAt2_1_1 = finalHash === '#taittiriya-upanishad:2.1.1';
    const noSelfCorrect = !hashChanges.some(({ h }) => h === '#taittiriya-upanishad:2.0.1');
    const scrollDoesNothing = finalHash === hashAfterScroll;
    results['4'] = (staysAt2_1_1 && noSelfCorrect && scrollDoesNothing) ? 'PASS' : 'FAIL';
    console.log(`  Result: ${results['4']} (stays at 2.1.1: ${staysAt2_1_1}, no self-correct: ${noSelfCorrect}, scroll inert: ${scrollDoesNothing})`);
    await page.close();
  } catch (e) {
    results['4'] = `ERROR: ${e.message}`;
    console.log('  Error:', e.message);
  }

  // ─── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════');
  console.log('RESULTS:');
  for (const [k, v] of Object.entries(results)) {
    console.log(`  ${k}: ${v}`);
  }
  console.log('═══════════════════════════════════════');

  await browser.close();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
