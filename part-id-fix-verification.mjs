/**
 * Verification for the part_id root-cause fix.
 * Tests:
 *  A — kena-upanishad:0.0 loads (no infinite spinner)
 *  B — kena-upanishad:1.1 still works (regular verse, same grantha)
 *  C — multi-part grantha regular verse (taittiriya:1.1.1, first part)
 *  D — multi-part grantha non-default part (taittiriya:2.1.1)
 *
 * Run with: node part-id-fix-verification.mjs
 */

import { chromium } from '@playwright/test';

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const BASE = 'http://localhost:3000';

async function getState(page) {
  return page.evaluate(() => ({
    hash: window.location.hash,
    verseCount: document.querySelectorAll('.verse-text').length,
    spinnerCount: document.querySelectorAll('.ant-spin-spinning').length,
    modalVisible: !!document.querySelector('.ant-modal-content'),
  }));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const results = {};

  // ─── A: kena-upanishad:0.0 — was infinite spinner ────────────────────────────
  console.log('\n[A] kena-upanishad:0.0 (prefatory, section "0") — must not spin forever...');
  try {
    const page = await context.newPage();
    await page.goto(`${BASE}/#kena-upanishad:0.0?c=rangaramanuja-muni-prakashika`, { waitUntil: 'networkidle' });
    await wait(4000);

    const state = await getState(page);
    console.log('  Hash:', state.hash);
    console.log('  Verses:', state.verseCount);
    console.log('  Spinners:', state.spinnerCount);
    console.log('  Modal visible:', state.modalVisible);

    const pass = state.verseCount > 0 && state.spinnerCount === 0 && !state.modalVisible;
    results['A'] = pass ? 'PASS' : 'FAIL';
    console.log(`  Result: ${results['A']}`);
    await page.close();
  } catch (e) {
    results['A'] = `ERROR: ${e.message}`;
  }

  // ─── B: kena-upanishad:1.1 — regular verse in same grantha ─────────────────
  console.log('\n[B] kena-upanishad:1.1 (regular verse) — still works...');
  try {
    const page = await context.newPage();
    await page.goto(`${BASE}/#kena-upanishad:1.1`, { waitUntil: 'networkidle' });
    await wait(3000);

    const state = await getState(page);
    console.log('  Hash:', state.hash);
    console.log('  Verses:', state.verseCount);
    console.log('  Spinners:', state.spinnerCount);

    const pass = state.verseCount > 0 && state.spinnerCount === 0 && state.hash.includes('1.1');
    results['B'] = pass ? 'PASS' : 'FAIL';
    console.log(`  Result: ${results['B']}`);
    await page.close();
  } catch (e) {
    results['B'] = `ERROR: ${e.message}`;
  }

  // ─── C: taittiriya:1.1.1 — multi-part, default part ────────────────────────
  console.log('\n[C] taittiriya-upanishad:1.1.1 (default part) — still works...');
  try {
    const page = await context.newPage();
    await page.goto(`${BASE}/#taittiriya-upanishad:1.1.1`, { waitUntil: 'networkidle' });
    await wait(3000);

    const state = await getState(page);
    console.log('  Hash:', state.hash);
    console.log('  Verses:', state.verseCount);
    console.log('  Spinners:', state.spinnerCount);

    const pass = state.verseCount > 0 && state.spinnerCount === 0;
    results['C'] = pass ? 'PASS' : 'FAIL';
    console.log(`  Result: ${results['C']}`);
    await page.close();
  } catch (e) {
    results['C'] = `ERROR: ${e.message}`;
  }

  // ─── D: taittiriya:2.1.1 — multi-part, non-default part ────────────────────
  console.log('\n[D] taittiriya-upanishad:2.1.1 (non-default part, deep-link) — loads and stays...');
  try {
    const page = await context.newPage();
    const hashChanges = [];
    await page.exposeFunction('onHashChange', (h) => hashChanges.push(h));
    await page.addInitScript(() => {
      window.addEventListener('hashchange', () => window.onHashChange(window.location.hash));
    });

    await page.goto(`${BASE}/#taittiriya-upanishad:2.1.1`, { waitUntil: 'networkidle' });
    await wait(4000);

    const state = await getState(page);
    console.log('  Hash:', state.hash);
    console.log('  Verses:', state.verseCount);
    console.log('  Spinners:', state.spinnerCount);
    console.log('  Hash changes during load:', hashChanges);

    const pass =
      state.verseCount > 0 &&
      state.spinnerCount === 0 &&
      state.hash === '#taittiriya-upanishad:2.1.1' &&
      !hashChanges.some(h => h === '#taittiriya-upanishad:2.0.1');
    results['D'] = pass ? 'PASS' : 'FAIL';
    console.log(`  Result: ${results['D']}`);
    await page.close();
  } catch (e) {
    results['D'] = `ERROR: ${e.message}`;
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
