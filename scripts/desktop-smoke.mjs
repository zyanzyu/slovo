import { chromium } from 'playwright';

const port = process.env.SLOVO_CDP_PORT || '9223';
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const contexts = browser.contexts();
const pages = contexts.flatMap((context) => context.pages());
const page = pages.find((candidate) => candidate.url().startsWith('http://127.0.0.1:')) || pages[0];
if (!page) throw new Error('No Electron page found');

page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
await page.waitForSelector('.app-shell', { timeout: 20000 });
await page.waitForLoadState('networkidle');

const home = await page.evaluate(async () => {
  const shell = document.querySelector('.app-shell')?.getBoundingClientRect();
  const health = await fetch('/api/health').then((response) => response.json());
  const registrations = 'serviceWorker' in navigator
    ? (await navigator.serviceWorker.getRegistrations()).length
    : -1;
  return {
    title: document.title,
    url: location.href,
    innerWidth,
    docScrollWidth: document.documentElement.scrollWidth,
    shellWidth: shell?.width,
    health,
    serviceWorkers: registrations,
    bodyText: document.body.innerText.slice(0, 120),
  };
});
console.log('HOME', JSON.stringify(home));

await page.locator('.nav-item[href="/library"]').click();
await page.waitForURL('**/library');
await page.waitForTimeout(500);
console.log('LIBRARY', await page.title(), await page.locator('.app-shell').evaluate((node) => node.scrollWidth <= node.clientWidth));

await page.locator('.nav-item[href="/import"]').click();
await page.waitForURL('**/import');
await page.waitForTimeout(500);
console.log('IMPORT', await page.title(), await page.locator('.app-shell').evaluate((node) => node.scrollWidth <= node.clientWidth));

await page.locator('.nav-item[href="/"]').click();
await page.waitForFunction(() => location.pathname === '/');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/slovo-desktop-820.png', fullPage: false });
console.log('SCREENSHOT /tmp/slovo-desktop-820.png');
await browser.close();
