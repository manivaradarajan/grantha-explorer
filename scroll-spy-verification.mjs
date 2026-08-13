/**
 * Playwright verification script for:
 * - Part loading: deep-link path + sentinel lazy-load path
 * - Scroll-spy item 13: tracking verses mounted after loadPart()
 * Run with: node scroll-spy-verification.mjs
 */

import { chromium } from '@playwright/test';
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const BASE = 'http://localhost:3000';

async function scrollContainer(page, deltaY) {
  await page.evaluate((dy) => {
    const c = Array.from(document.querySelectorAll('.overflow-y-auto')).find(c => c.className.includes('pb-6'));
    c?.scrollBy(0, dy);
  }, deltaY);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const results = {};

  // ─── DEEP-LINK TEST: navigate directly into a later part ───────────────────
  // Chandogya part2 starts at "2.1.1". If deep-link loading works, navigating
  // there should load part2 and show verses from chapter 2.
  console.log('\n[DEEP-LINK] Navigate to Chandogya 2.1.1 (requires loading part2)...');
  try {
    const page = await context.newPage();
    const warnings = [];
    page.on('console', m => { if (m.type() === 'warning') warnings.push(m.text()); });

    await page.goto(`${BASE}/#chhandogya-upanishad:2.1.1`, { waitUntil: 'networkidle' });
    await wait(4000); // allow part load to complete

    const state = await page.evaluate(() => ({
      hash: window.location.hash,
      verseCount: document.querySelectorAll('.verse-text').length,
      spinnerCount: document.querySelectorAll('.ant-spin-spinning').length,
    }));
    console.log('  Hash:', state.hash);
    console.log('  Verses loaded:', state.verseCount);
    console.log('  Spinners:', state.spinnerCount);
    console.log('  Warnings:', warnings);

    results['DEEP-LINK'] = state.verseCount > 0 && state.spinnerCount === 0 ? 'PASS' : 'FAIL';
    console.log(`  Result: ${results['DEEP-LINK']}`);
    await page.close();
  } catch (e) {
    results['DEEP-LINK'] = `ERROR: ${e.message}`;
    console.log('  Error:', e.message);
  }

  // ─── SENTINEL TEST: scroll from part1 into part2 in Chandogya ──────────────
  // Start at chapter 1, scroll past the end of part1 to trigger sentinel.
  // Part2 (starting at "2.1.1") should load automatically.
  console.log('\n[SENTINEL] Scroll Chandogya from part1 bottom into part2...');
  try {
    const page = await context.newPage();
    const warnings = [];
    page.on('console', m => { if (m.type() === 'warning') warnings.push(m.text()); });

    await page.goto(`${BASE}/#chhandogya-upanishad:1.1.1`, { waitUntil: 'networkidle' });
    await wait(3000); // allow part1 to load

    const state1 = await page.evaluate(() => ({
      verseCount: document.querySelectorAll('.verse-text').length,
      hash: window.location.hash,
    }));
    console.log('  Part1 loaded, verse count:', state1.verseCount, 'hash:', state1.hash);

    // Scroll aggressively to bottom to trigger sentinel
    for (let i = 0; i < 50; i++) {
      await scrollContainer(page, 1000);
      await wait(80);
    }

    // Wait for sentinel to fire and part2 to load
    await wait(4000);

    const state2 = await page.evaluate(() => ({
      verseCount: document.querySelectorAll('.verse-text').length,
      hash: window.location.hash,
    }));
    console.log('  After scroll to bottom, verse count:', state2.verseCount, 'hash:', state2.hash);
    console.log('  Warnings:', warnings);

    // Verse count should have grown (part2 loaded)
    const moreVerses = state2.verseCount > state1.verseCount;
    results['SENTINEL'] = moreVerses ? 'PASS' : 'FAIL';
    console.log(`  Result: ${results['SENTINEL']} (verses before: ${state1.verseCount}, after: ${state2.verseCount})`);
    await page.close();
  } catch (e) {
    results['SENTINEL'] = `ERROR: ${e.message}`;
    console.log('  Error:', e.message);
  }

  // ─── ITEM 13: Scroll-spy tracks post-loadPart verses ───────────────────────
  // Start at Chandogya 1.1.1, scroll to bottom to trigger loadPart() for part2,
  // continue scrolling into part2 verses, verify URL hash tracks into chapter 2.
  console.log('\n[ITEM 13] Scroll-spy after loadPart() — hash should track into chapter 2...');
  try {
    const page = await context.newPage();

    await page.goto(`${BASE}/#chhandogya-upanishad:1.1.1`, { waitUntil: 'networkidle' });
    await wait(3000);

    const hashStart = await page.evaluate(() => window.location.hash);
    console.log('  Hash at start:', hashStart);

    // Scroll to trigger sentinel and load part2
    for (let i = 0; i < 60; i++) {
      await scrollContainer(page, 800);
      await wait(80);
    }
    await wait(4000); // wait for part2 to load

    const stateAfterLoad = await page.evaluate(() => ({
      verseCount: document.querySelectorAll('.verse-text').length,
      hash: window.location.hash,
    }));
    console.log('  After part2 loads — verses:', stateAfterLoad.verseCount, 'hash:', stateAfterLoad.hash);

    // Continue scrolling into part2 verses
    for (let i = 0; i < 20; i++) {
      await scrollContainer(page, 800);
      await wait(100);
    }
    await wait(500); // allow 150ms debounce to settle

    const hashFinal = await page.evaluate(() => window.location.hash);
    console.log('  Hash after scrolling into part2 verses:', hashFinal);

    // Extract verse ref from hash
    const refMatch = hashFinal.match(/#chhandogya-upanishad:([^?]+)/);
    const currentRef = refMatch ? refMatch[1] : '';
    const chapterNum = parseInt(currentRef.split('.')[0] || '0', 10);
    const isInChapter2OrLater = chapterNum >= 2;

    console.log('  Current verse ref:', currentRef, '(chapter:', chapterNum, ')');
    results['13'] = isInChapter2OrLater ? 'PASS' : 'FAIL';
    console.log(`  Result: ${results['13']} (scroll-spy tracking into part2: ${isInChapter2OrLater})`);
    await page.close();
  } catch (e) {
    results['13'] = `ERROR: ${e.message}`;
    console.log('  Error:', e.message);
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════');
  console.log('RESULTS:');
  for (const [k, v] of Object.entries(results)) {
    console.log(`  ${k}: ${v}`);
  }
  console.log('═══════════════════════════════════════');

  await browser.close();
}
main().catch(e => { console.error('Fatal:', e); process.exit(1); });
