import { chromium } from '@playwright/test';
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const BASE = 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const consoleMessages = [];
  page.on('console', m => consoleMessages.push(`[${m.type()}] ${m.text()}`));

  await page.goto(`${BASE}/#brihadaranyaka-upanishad:1.1.1`, { waitUntil: 'networkidle' });
  await wait(5000); // Wait longer for parts to load

  const state1 = await page.evaluate(() => {
    const containers = document.querySelectorAll('.overflow-y-auto');
    const textContentContainer = Array.from(containers).find(c => c.className.includes('pb-6'));
    return {
      hash: window.location.hash,
      containerFound: !!textContentContainer,
      containerScrollHeight: textContentContainer?.scrollHeight ?? 0,
      containerClientHeight: textContentContainer?.clientHeight ?? 0,
      verseCount: document.querySelectorAll('.verse-text').length,
      spinnerCount: document.querySelectorAll('.ant-spin-spinning').length,
    };
  });
  console.log('State after 5s:', JSON.stringify(state1, null, 2));

  // Try to scroll via the text content container specifically
  const scrolled = await page.evaluate(() => {
    const containers = document.querySelectorAll('.overflow-y-auto');
    const textContentContainer = Array.from(containers).find(c => c.className.includes('pb-6'));
    if (!textContentContainer) return { found: false };
    const before = textContentContainer.scrollTop;
    textContentContainer.scrollBy(0, 2000);
    const after = textContentContainer.scrollTop;
    return { found: true, before, after, scrollHeight: textContentContainer.scrollHeight, clientHeight: textContentContainer.clientHeight };
  });
  console.log('\nScroll attempt:', JSON.stringify(scrolled, null, 2));

  await wait(500);

  // Check hash after scroll attempt
  const hash2 = await page.evaluate(() => window.location.hash);
  console.log('Hash after scroll:', hash2);

  // Wait for potential part load
  await wait(3000);

  const state3 = await page.evaluate(() => {
    const containers = document.querySelectorAll('.overflow-y-auto');
    const textContentContainer = Array.from(containers).find(c => c.className.includes('pb-6'));
    return {
      hash: window.location.hash,
      verseCount: document.querySelectorAll('.verse-text').length,
      containerScrollHeight: textContentContainer?.scrollHeight ?? 0,
      containerClientHeight: textContentContainer?.clientHeight ?? 0,
    };
  });
  console.log('\nState after part load wait:', JSON.stringify(state3, null, 2));

  // Try big scroll now that part might be loaded
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => {
      const c = Array.from(document.querySelectorAll('.overflow-y-auto')).find(c => c.className.includes('pb-6'));
      c?.scrollBy(0, 1000);
    });
    await wait(150);
  }
  await wait(500);

  const finalHash = await page.evaluate(() => window.location.hash);
  const finalVerseCount = await page.evaluate(() => document.querySelectorAll('.verse-text').length);
  console.log('\nFinal hash:', finalHash);
  console.log('Final verse count:', finalVerseCount);

  if (consoleMessages.length > 0) {
    console.log('\nConsole messages:');
    consoleMessages.slice(0, 20).forEach(m => console.log(' ', m));
  }

  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
