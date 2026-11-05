import { webkit } from 'playwright';
const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const base = 'http://127.0.0.1:4174';
async function go(path) {
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
}
await go('/');
await page.screenshot({ path: 'screenshots/home.png' });
await go('/study?free=1');
await page.waitForTimeout(500);
await page.screenshot({ path: 'screenshots/study.png' });
await go('/import');
await page.getByRole('tab', { name: /拍照/ }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: 'screenshots/import.png' });
await go('/library');
await page.screenshot({ path: 'screenshots/library.png' });
console.log('screenshots written');
await browser.close();
