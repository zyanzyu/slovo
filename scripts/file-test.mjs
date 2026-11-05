import { webkit } from 'playwright';
import assert from 'node:assert/strict';
const browser = await webkit.launch({ headless: true });
const cases = [
  ['/tmp/imports/words.txt', 2, 'TXT'],
  ['/tmp/imports/words.csv', 2, 'CSV'],
  ['/tmp/imports/words.json', 2, 'JSON'],
  ['/tmp/imports/words.docx', 3, 'DOCX'],
  ['/tmp/imports/words.xlsx', 3, 'XLSX'],
];
for (const [file, expected, name] of cases) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:4173/import', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: /文件/ }).click();
  await page.waitForTimeout(150);
  await page.locator('input[type=file]').first().setInputFiles(file);
  try {
    await page.waitForSelector('.import-preview', { timeout: 45000 });
  } catch {
    const err = await page.locator('.inline-error').count() ? await page.locator('.inline-error').innerText() : 'no preview';
    console.log(name, 'FAILED:', err, errors);
    await page.close();
    continue;
  }
  const rows = await page.locator('.preview-row').evaluateAll((rows) =>
    rows.map((row) => [...row.querySelectorAll('input')].map((i) => i.value)),
  );
  console.log(name, rows);
  assert.equal(rows.length, expected, name + ' row count');
  assert.ok(rows.every((r) => r[0].length > 1), name + ' russian value');
  if (name !== 'TXT' && name !== 'JSON') {
    assert.ok(rows.some((r) => r[1].trim().length > 0), name + ' chinese value');
  }
  console.log('✓', name, 'import preview is valid');
  await page.close();
}
await browser.close();
