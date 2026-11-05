import { webkit } from 'playwright';
import fs from 'node:fs';

const browser = await webkit.launch({ headless: true });
const imagePage = await browser.newPage({ viewport: { width: 900, height: 420 }, deviceScaleFactor: 1 });
await imagePage.setContent(`<!doctype html><html><head><meta charset="utf-8">
<style>
  body { margin:0; background:#f8f6f0; font-family: 'DejaVu Sans', 'WenQuanYi Zen Hei', sans-serif; }
  .sheet { width:900px; height:420px; box-sizing:border-box; padding:42px 60px; color:#17211c; }
  h2 { margin:0 0 24px; font-size:30px; letter-spacing:.04em; }
  p { margin:0 0 20px; font-size:52px; line-height:1.16; }
  span { font-size:40px; color:#444; margin-left:34px; }
</style></head><body><div class="sheet"><h2>СЛОВА · 单词</h2>
<p>привет <span>你好</span></p>
<p>спасибо <span>谢谢</span></p>
<p>кошка <span>猫</span></p>
</div></body></html>`);
await imagePage.evaluate(() => document.fonts.ready);
await imagePage.waitForTimeout(500);
await imagePage.screenshot({ path: '/tmp/ocr-words.png' });
await imagePage.close();
console.log('image bytes', fs.statSync('/tmp/ocr-words.png').size);

const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
const failed = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('response', (res) => { if (res.status() >= 400 && (res.url().includes('tess') || res.url().includes('ocr'))) failed.push(res.status() + ' ' + res.url()); });
await page.goto('http://127.0.0.1:4173/import', { waitUntil: 'networkidle' });
await page.getByRole('tab', { name: /拍照/ }).click();
await page.waitForTimeout(200);
const input = page.locator('input[type=file]').first();
await input.setInputFiles('/tmp/ocr-words.png');
console.log('image selected');
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(2000);
  const hasPreview = await page.locator('.import-preview').count();
  const hasError = await page.locator('.inline-error').count();
  const progress = await page.locator('.ocr-progress-copy').count() ? await page.locator('.ocr-progress-copy').innerText() : '';
  const status = await page.locator('.import-panel').innerText();
  console.log(`t=${(i+1)*2}s`, { hasPreview, hasError, progress, snippet: status.slice(-100).replace(/\n/g, ' | ') });
  if (hasPreview || hasError) break;
}
const preview = await page.locator('.import-preview').count();
if (preview) {
  const rows = await page.locator('.preview-row').count();
  const values = await page.locator('.preview-row input[lang=ru]').evaluateAll((els) => els.map((e) => e.value));
  const zh = await page.locator('.preview-row input[lang=zh]').evaluateAll((els) => els.map((e) => e.value));
  console.log('OCR PREVIEW', { rows, values, zh });
} else {
  const err = await page.locator('.inline-error').count() ? await page.locator('.inline-error').innerText() : '';
  console.log('OCR ERROR', err);
}
const raw = await page.locator('.raw-text-details textarea').count();
if (raw) console.log('RAW TEXT:', await page.locator('.raw-text-details textarea').inputValue());
console.log('CONSOLE ERRORS', errors.slice(0, 10));
console.log('FAILED REQUESTS', failed.slice(0, 10));
await browser.close();
