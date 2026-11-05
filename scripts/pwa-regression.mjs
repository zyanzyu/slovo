import { webkit } from 'playwright';

const browser = await webkit.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(`PAGEERROR ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`CONSOLE ${message.text()}`);
});

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.waitForSelector('.app-shell');
await page.evaluate(async () => {
  if ('serviceWorker' in navigator) await navigator.serviceWorker.ready;
});
await page.waitForTimeout(600);
// A first visit may install the worker without controlling the current document.
// Reload once online so the offline reload is testing the real PWA state.
if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.app-shell');
}
await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 10000 });
const before = await page.evaluate(async () => ({
  title: document.title,
  caches: await caches.keys(),
  registrations: 'serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).length : -1,
  controller: Boolean(navigator.serviceWorker.controller),
  shellCached: Boolean(await caches.match('/index.html')),
  width: innerWidth,
  docWidth: document.documentElement.scrollWidth,
}));
console.log('ONLINE', JSON.stringify(before));

await context.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.app-shell', { timeout: 15000 });
console.log('OFFLINE_HOME', await page.title(), await page.evaluate(() => document.body.innerText.includes('Слово')));

await page.goto('http://127.0.0.1:4173/study', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.study-shell', { timeout: 15000 });
console.log('OFFLINE_STUDY', await page.title(), await page.evaluate(() => Boolean(document.querySelector('.study-shell'))));

console.log('ERRORS', JSON.stringify(errors.filter((line) => !line.includes('favicon'))));
await page.screenshot({ path: '/tmp/slovo-pwa-offline.png' });
await browser.close();
