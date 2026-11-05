import { webkit } from 'playwright';
const browser = await webkit.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto('http://127.0.0.1:4173/import', { waitUntil: 'networkidle' });
await page.getByRole('tab', { name: /拍照/ }).click();
await page.locator('input[type=file]').first().setInputFiles('/tmp/ocr-words.png');
await page.waitForSelector('.import-preview', { timeout: 60000 });
console.log('first raw:', await page.locator('.raw-text-details textarea').inputValue());
await page.locator('.image-options .toggle-row').click();
console.log('chinese toggle:', await page.locator('.image-options input[type=checkbox]').isChecked());
await page.getByRole('button', { name: /重新识别/ }).click();
await page.waitForTimeout(500);
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(1000);
  const processing = await page.locator('.ocr-progress').count();
  const status = processing ? await page.locator('.ocr-progress-copy').innerText() : 'done';
  console.log(`t=${i + 1}s`, status);
  if (!processing && i > 1) break;
}
const rows = await page.locator('.preview-row').evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll('input')].map((i) => i.value)));
console.log('ROWS', rows);
console.log('raw:', await page.locator('.raw-text-details textarea').inputValue());
await browser.close();
