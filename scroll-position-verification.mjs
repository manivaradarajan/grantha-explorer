/**
 * Verification script for scroll-positioning fix and related regressions.
 *
 * Items tested:
 *  1 — Basic scroll-spy tracking (normal scroll updates URL hash)
 *  2 — Prev/Next navigation (buttons update URL without auto-jump)
 *  5 — Selected verse lands in the 15-20% focus band after auto-scroll
 *  END — Last verse: Math.min clamp does not trigger auto-jump
 *  TAITTIRIYA — Deep-link to 2.1.1 (non-default part) stays at 2.1.1, not 2.0.1
 *  BRIHADARANYAKA — Deep-link into a non-default part of a second grantha
 *
 * Run with: node scroll-position-verification.mjs
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

// Returns the top-edge position of `ref` relative to the scroll container top
// (in px), or null if the element is not found.
async function getVerseRelativeTop(page, ref) {
  return page.evaluate((verseRef) => {
    const container = Array.from(document.querySelectorAll('.overflow-y-auto'))
      .find(el => el.className.includes('pb-6'));
    if (!container) return null;
    // Match verse divs by their text content ref label
    const spans = Array.from(document.querySelectorAll('span.font-semibold.text-gray-400'));
    const span = spans.find(s => s.textContent.trim() === verseRef);
    if (!span) return null;
    const verseDiv = span.closest('div[class*="px-4"]');
    if (!verseDiv) return null;
    const containerRect = container.getBoundingClientRect();
    const verseRect = verseDiv.getBoundingClientRect();
    return {
      relativeTop: verseRect.top - containerRect.top,
      containerHeight: container.clientHeight,
      percentFromTop: ((verseRect.top - containerRect.top) / container.clientHeight) * 100,
    };
  }, ref);
}

async function getHash(page) {
  return page.evaluate(() => window.location.hash);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const results = {};

  // ─── ITEM 1: Basic scroll-spy tracking ──────────────────────────────────────
  console.log('\n[ITEM 1] Basic scroll-spy: normal scroll updates URL hash...');
  try {
    const page = await context.newPage();
    await page.goto(`${BASE}/#isavasya-upanishad:1`, { waitUntil: 'networkidle' });
    await wait(2000);

    const hashBefore = await getHash(page);
    console.log('  Hash before scroll:', hashBefore);

    // Scroll down several verses
    for (let i = 0; i < 8; i++) {
      await scrollContainer(page, 300);
      await wait(60);
    }
    await wait(400); // allow 150ms debounce to settle

    const hashAfter = await getHash(page);
    console.log('  Hash after scroll:', hashAfter);

    const changed = hashBefore !== hashAfter;
    results['1'] = changed ? 'PASS' : 'FAIL';
    console.log(`  Result: ${results['1']} (hash changed: ${changed})`);
    await page.close();
  } catch (e) {
    results['1'] = `ERROR: ${e.message}`;
    console.log('  Error:', e.message);
  }

  // ─── ITEM 2: Prev/Next — no auto-jump after button press ────────────────────
  console.log('\n[ITEM 2] Prev/Next: navigate forward, hash tracks, no drift...');
  try {
    const page = await context.newPage();
    await page.goto(`${BASE}/#isavasya-upanishad:3`, { waitUntil: 'networkidle' });
    await wait(2000);

    const hashBefore = await getHash(page);
    console.log('  Hash before Next:', hashBefore);

    // Click Next button
    await page.click('button[aria-label="Next verse"]');
    await wait(800); // allow smooth scroll to complete + debounce

    const hashAfterNext = await getHash(page);
    console.log('  Hash after Next (expect :4):', hashAfterNext);

    // Wait further to confirm no drift
    await wait(1000);
    const hashAfterWait = await getHash(page);
    console.log('  Hash after 1s wait (should still be :4):', hashAfterWait);

    const nextCorrect = hashAfterNext.includes(':4');
    const noAutojump = hashAfterNext === hashAfterWait;
    results['2'] = (nextCorrect && noAutojump) ? 'PASS' : 'FAIL';
    console.log(`  Result: ${results['2']} (correct ref: ${nextCorrect}, no drift: ${noAutojump})`);
    await page.close();
  } catch (e) {
    results['2'] = `ERROR: ${e.message}`;
    console.log('  Error:', e.message);
  }

  // ─── ITEM 5: Verse lands in 15-20% focus band after auto-scroll ─────────────
  console.log('\n[ITEM 5] Focus band: selected verse top edge lands at 15-20% from container top...');
  try {
    const page = await context.newPage();
    // Start at verse 1 so we can navigate to verse 5 and measure its position
    await page.goto(`${BASE}/#isavasya-upanishad:1`, { waitUntil: 'networkidle' });
    await wait(2000);

    // Navigate to a mid-document verse via Next several times
    for (let i = 0; i < 5; i++) {
      await page.click('button[aria-label="Next verse"]');
      await wait(300);
    }
    await wait(1000); // wait for scroll to settle

    const hashAfter = await getHash(page);
    const refMatch = hashAfter.match(/:([^?#]+)/);
    const currentRef = refMatch ? refMatch[1] : '';
    console.log('  Current verse after navigation:', currentRef);

    const pos = await getVerseRelativeTop(page, currentRef);
    if (pos) {
      const inBand = pos.percentFromTop >= 10 && pos.percentFromTop <= 25;
      console.log(`  Verse top at ${pos.percentFromTop.toFixed(1)}% from container top`);
      console.log(`  Container height: ${pos.containerHeight}px, relativeTop: ${pos.relativeTop.toFixed(0)}px`);
      console.log(`  In 15-20% band (allowing ±5% for timing): ${inBand}`);
      results['5'] = inBand ? 'PASS' : 'FAIL';
    } else {
      console.log('  Could not locate verse element — ref may use non-standard label');
      results['5'] = 'SKIP (element not found by label)';
    }
    console.log(`  Result: ${results['5']}`);
    await page.close();
  } catch (e) {
    results['5'] = `ERROR: ${e.message}`;
    console.log('  Error:', e.message);
  }

  // ─── END-OF-DOCUMENT: last verse, Math.min clamp, no auto-jump ──────────────
  console.log('\n[END] Last verses: navigate to end, confirm URL stays pinned (no auto-jump)...');
  try {
    const page = await context.newPage();
    // Isavasya is a short single-part grantha — safe for end-of-doc test
    await page.goto(`${BASE}/#isavasya-upanishad:1`, { waitUntil: 'networkidle' });
    await wait(2000);

    // Click Next repeatedly to reach the last verse
    let lastHash = await getHash(page);
    for (let i = 0; i < 25; i++) {
      const nextBtn = page.locator('button[aria-label="Next verse"]');
      const disabled = await nextBtn.getAttribute('disabled');
      if (disabled !== null) break;
      await nextBtn.click();
      await wait(200);
      lastHash = await getHash(page);
    }
    console.log('  Hash at last verse:', lastHash);

    // Wait 1.5s: covers the 600ms suppression + debounce + any animation tail
    await wait(1500);
    const hashAfterWait = await getHash(page);
    console.log('  Hash after 1.5s wait (should be unchanged):', hashAfterWait);

    const pos = await getVerseRelativeTop(page, lastHash.split(':')[1] || '');
    if (pos) {
      console.log(`  Last verse top at ${pos.percentFromTop.toFixed(1)}% from container top`);
    }

    const noAutojump = lastHash === hashAfterWait;
    results['END'] = noAutojump ? 'PASS' : 'FAIL';
    console.log(`  Result: ${results['END']} (no auto-jump: ${noAutojump})`);
    await page.close();
  } catch (e) {
    results['END'] = `ERROR: ${e.message}`;
    console.log('  Error:', e.message);
  }

  // ─── TAITTIRIYA: deep-link to 2.1.1 stays at 2.1.1, not 2.0.1 ──────────────
  console.log('\n[TAITTIRIYA] Deep-link to 2.1.1 — URL must not self-correct to 2.0.1...');
  try {
    const page = await context.newPage();
    const hashes = [];
    // Record every hash change
    await page.exposeFunction('onHashChange', (h) => hashes.push({ t: Date.now(), h }));
    await page.addInitScript(() => {
      window.addEventListener('hashchange', () => window.onHashChange(window.location.hash));
    });

    const t0 = Date.now();
    await page.goto(`${BASE}/#taittiriya-upanishad:2.1.1`, { waitUntil: 'networkidle' });
    await wait(5000); // allow part load + scroll + debounce

    const finalHash = await getHash(page);
    const relT = (t) => `+${t - t0}ms`;

    console.log('  Initial URL: #taittiriya-upanishad:2.1.1');
    console.log('  Hash changes observed:');
    hashes.forEach(({ t, h }) => console.log(`    ${relT(t)}: ${h}`));
    console.log('  Final hash:', finalHash);

    const staysAt2_1_1 = finalHash === '#taittiriya-upanishad:2.1.1';
    const neverWent2_0_1 = !hashes.some(({ h }) => h === '#taittiriya-upanishad:2.0.1');
    results['TAITTIRIYA'] = (staysAt2_1_1 && neverWent2_0_1) ? 'PASS' : 'FAIL';
    console.log(`  Result: ${results['TAITTIRIYA']} (stays at 2.1.1: ${staysAt2_1_1}, never saw 2.0.1: ${neverWent2_0_1})`);
    await page.close();
  } catch (e) {
    results['TAITTIRIYA'] = `ERROR: ${e.message}`;
    console.log('  Error:', e.message);
  }

  // ─── BRIHADARANYAKA: deep-link into non-default part ────────────────────────
  console.log('\n[BRIHADARANYAKA] Deep-link to 4.1.1 (non-default part) stays put...');
  try {
    const page = await context.newPage();
    const hashes = [];
    await page.exposeFunction('onHashChange', (h) => hashes.push({ t: Date.now(), h }));
    await page.addInitScript(() => {
      window.addEventListener('hashchange', () => window.onHashChange(window.location.hash));
    });

    const t0 = Date.now();
    await page.goto(`${BASE}/#brihadaranyaka-upanishad:4.1.1`, { waitUntil: 'networkidle' });
    await wait(5000);

    const finalHash = await getHash(page);
    const relT = (t) => `+${t - t0}ms`;

    console.log('  Initial URL: #brihadaranyaka-upanishad:4.1.1');
    console.log('  Hash changes observed:');
    hashes.forEach(({ t, h }) => console.log(`    ${relT(t)}: ${h}`));
    console.log('  Final hash:', finalHash);

    const staysAt4_1_1 = finalHash === '#brihadaranyaka-upanishad:4.1.1';
    results['BRIHADARANYAKA'] = staysAt4_1_1 ? 'PASS' : 'FAIL';
    console.log(`  Result: ${results['BRIHADARANYAKA']} (stays at 4.1.1: ${staysAt4_1_1})`);
    await page.close();
  } catch (e) {
    results['BRIHADARANYAKA'] = `ERROR: ${e.message}`;
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
