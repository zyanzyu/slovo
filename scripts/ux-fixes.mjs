import { webkit } from 'playwright';
import assert from 'node:assert/strict';

const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  window.__backupCalls = [];
  window.SlovoNative = {
    saveBackup(json, filename) {
      window.__backupCalls.push({ json, filename });
    },
    setTextZoom(percent) {
      window.__textZoom = percent;
    },
  };
});
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.evaluate(() => {
  const data = JSON.parse(localStorage.getItem('slovo.store.v1'));
  data.settings.defaultMode = 'audio';
  data.settings.autoPlay = true;
  data.settings.fontScale = 1.32;
  localStorage.setItem('slovo.store.v1', JSON.stringify(data));
});
await page.reload({ waitUntil: 'networkidle' });
await page.goto('http://127.0.0.1:4173/study?free=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const fallbackVisible = await page.locator('.listen-fallback').isVisible();
const caption = await page.locator('.listen-caption').innerText();
assert.equal(fallbackVisible, true, 'audio mode should show a text fallback without a Russian voice');
assert.match(caption, /没有俄语语音/);
console.log('audio fallback:', { fallbackVisible, caption });

await page.goto('http://127.0.0.1:4173/settings', { waitUntil: 'networkidle' });
const activeFont = await page.locator('.font-scale-options button.active').innerText();
assert.equal(activeFont, '特大');
const nativeScale = await page.evaluate(() => window.__textZoom);
assert.equal(nativeScale, 132);
const cssScale = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim());
assert.equal(cssScale, '1');
console.log('native font setting:', { activeFont, nativeScale, cssScale });

await page.locator('.font-scale-options button', { hasText: '标准' }).click();
await page.waitForTimeout(150);
const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('slovo.store.v1')).settings.fontScale);
assert.equal(persisted, 1.08);
const zoom = await page.evaluate(() => window.__textZoom);
assert.equal(zoom, 108);
console.log('font persisted:', { persisted, nativeZoom: zoom });

await page.getByRole('button', { name: '导出', exact: true }).click();
await page.waitForTimeout(120);
const calls = await page.evaluate(() => window.__backupCalls);
assert.equal(calls.length, 1);
assert.match(calls[0].filename, /^slovo-backup-.*\.json$/);
await page.evaluate(() => window.__slovoBackupResult(false));
await page.waitForTimeout(120);
const toastTexts = await page.locator('.toast').allInnerTexts();
assert.ok(toastTexts.some((text) => text.includes('取消')), 'cancel callback should be visible');
console.log('backup bridge:', { calls: calls.length, toastTexts });

await page.goto('http://127.0.0.1:4173/study?free=1', { waitUntil: 'networkidle' });
await page.locator('button', { hasText: '手写' }).click();
await page.waitForTimeout(200);
const handFallback = await page.locator('.handwriting-fallback').isVisible();
assert.equal(handFallback, true);
await page.locator('.handwriting-fallback .text-button').click();
assert.equal(await page.locator('.answer-input').isVisible(), true);
console.log('handwriting fallback:', { handFallback });

await page.evaluate(() => window.dispatchEvent(new CustomEvent('slovo:storage-error')));
await page.waitForTimeout(120);
const storageToast = await page.locator('.toast').allInnerTexts();
assert.ok(storageToast.some((text) => text.includes('存储空间不足')), 'storage error should show toast');
console.log('storage toast:', storageToast);

assert.deepEqual(errors, []);
await context.close();

const web = await browser.newContext({ viewport: { width: 390, height: 844 } });
const webPage = await web.newPage();
await webPage.goto('http://127.0.0.1:4173/settings', { waitUntil: 'networkidle' });
await webPage.waitForTimeout(400);
await webPage.evaluate(() => {
  const data = JSON.parse(localStorage.getItem('slovo.store.v1'));
  data.settings.fontScale = 1.32;
  localStorage.setItem('slovo.store.v1', JSON.stringify(data));
});
await webPage.reload({ waitUntil: 'networkidle' });
const webScale = await webPage.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim());
assert.equal(webScale, '1.32');
const textSize = await webPage.evaluate(() => getComputedStyle(document.querySelector('.settings-row-copy strong')).fontSize);
assert.ok(parseFloat(textSize) >= 14, `large text should be readable, got ${textSize}`);
console.log('web font setting:', { webScale, textSize });
await web.close();

await browser.close();
console.log('UX FIXES OK');
