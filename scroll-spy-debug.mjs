/**
 * Debug script: check why scroll-spy doesn't work on multi-part granthas.
 */
import { chromium } from '@playwright/test';
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const BASE = 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Capture console errors
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });

  await page.goto(`${BASE}/#brihadaranyaka-upanishad:1.1.1`, { waitUntil: 'networkidle' });
  await wait(3000);

  // Check the structure: does the scroll container exist?
  const diagnostics = await page.evaluate(() => {
    const overflowDivs = document.querySelectorAll('.overflow-y-auto');
    const allDivs = Array.from(overflowDivs).map(d => ({
      class: d.className,
      scrollTop: d.scrollTop,
      scrollHeight: d.scrollHeight,
      clientHeight: d.clientHeight,
      childCount: d.children.length,
      hasVerses: d.querySelector('[class*="verse"]') !== null,
    }));

    // Check what's rendered — spinner or content?
    const spinners = document.querySelectorAll('.ant-spin');
    const verseTexts = document.querySelectorAll('.verse-text');

    return {
      overflowDivCount: overflowDivs.length,
      overflowDivs: allDivs,
      spinnerCount: spinners.length,
      verseTextCount: verseTexts.length,
      bodyText: document.body.innerText.substring(0, 200),
    };
  });

  console.log('Diagnostics after load:');
  console.log(JSON.stringify(diagnostics, null, 2));

  // Try scrolling and check if the container scrolls
  if (diagnostics.overflowDivCount > 0) {
    await page.evaluate(() => {
      const d = document.querySelector('.overflow-y-auto');
      d.scrollBy(0, 500);
    });
    await wait(100);

    const scrollTop = await page.evaluate(() => {
      return document.querySelector('.overflow-y-auto')?.scrollTop ?? -1;
    });
    console.log('\nscrollTop after scrollBy(0,500):', scrollTop);
    console.log('(0 means scroll container is empty or scroll had no effect)');
  }

  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
