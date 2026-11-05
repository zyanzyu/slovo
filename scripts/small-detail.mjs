import { webkit } from 'playwright';
const browser = await webkit.launch({ headless: true });
for (const width of [320, 390]) {
  const page = await browser.newPage({ viewport: { width, height: width === 320 ? 700 : 844 }, deviceScaleFactor: 2 });
  const base = 'http://127.0.0.1:4173';
  await page.goto(base + '/import', { waitUntil: 'networkidle' });
  await page.locator('.import-textarea').fill('приветствие — 问候\nпутешествие — 旅行\nдостопримечательность — 名胜');
  await page.locator('.text-import .btn-primary').click();
  await page.waitForSelector('.import-preview');
  await page.waitForTimeout(250);
  const preview = await page.evaluate(() => {
    const box = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom + scrollY), scrollW: el.scrollWidth, clientW: el.clientWidth }; };
    return { docW: document.documentElement.scrollWidth, panel: box('.import-preview'), table: box('.preview-table'), row: box('.preview-row'), input: box('.preview-row input'), submit: box('.import-submit'), nav: box('.bottom-nav') };
  });
  console.log(`\n[${width}] preview`, JSON.stringify(preview, null, 1));

  await page.goto(base + '/library/daily', { waitUntil: 'networkidle' });
  await page.locator('.word-row').first().click();
  await page.waitForTimeout(450);
  const modal = await page.evaluate(() => {
    const box = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom), scrollH: el.scrollHeight, clientH: el.clientHeight }; };
    return { docW: document.documentElement.scrollWidth, panel: box('.modal-panel'), body: box('.modal-body'), footer: box('.modal-footer'), ruInput: box('.word-editor-modal input'), close: box('.modal-head button'), overflow: getComputedStyle(document.querySelector('.modal-body')).overflowY };
  });
  console.log(`[${width}] modal`, JSON.stringify(modal, null, 1));
  await page.screenshot({ path: `/tmp/modal-${width}.png`, fullPage: false });
  await page.close();
}
await browser.close();
