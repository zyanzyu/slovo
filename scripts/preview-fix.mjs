import { webkit } from 'playwright';
const browser = await webkit.launch({ headless: true });
for (const width of [320, 390]) {
  const page = await browser.newPage({ viewport: { width, height: width === 320 ? 700 : 844 }, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:4173/import', { waitUntil: 'networkidle' });
  await page.locator('.import-textarea').fill('приветствие — 问候\nпутешествие — 旅行');
  await page.locator('.text-import .btn-primary').click();
  await page.waitForSelector('.import-preview');
  await page.waitForTimeout(200);
  const m = await page.evaluate(() => {
    const row = document.querySelector('.preview-row'); const table = document.querySelector('.preview-table');
    const input = document.querySelector('.preview-row input');
    const r = row.getBoundingClientRect();
    return { docW: document.documentElement.scrollWidth, rowW: Math.round(r.width), rowScrollW: row.scrollWidth, rowClientW: row.clientWidth, tableScrollW: table.scrollWidth, tableClientW: table.clientWidth, inputFont: getComputedStyle(input).fontSize, inputH: Math.round(input.getBoundingClientRect().height) };
  });
  console.log(width, m);
  await page.close();
}
await browser.close();
