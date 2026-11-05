import { webkit } from 'playwright';
import assert from 'node:assert/strict';

const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const base = 'http://127.0.0.1:4174';

await page.goto(base + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const manifestHref = await page.locator('link[rel=manifest]').getAttribute('href');
assert.equal(manifestHref, '/manifest.webmanifest');
console.log('✓ production首页与 manifest 链接');

const sw = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return { supported: false };
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error('sw ready timeout')), 12000)),
  ]);
  return { supported: true, scope: reg.scope, active: !!reg.active };
});
console.log('SW', sw);
assert.equal(sw.supported, true);
assert.equal(sw.active, true);

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
assert.equal(controlled, true, 'page is controlled by SW');
const cacheKeys = await page.evaluate(() => caches.keys());
console.log('CACHE KEYS', cacheKeys);
assert.ok(cacheKeys.includes('slovo-v2'));

await context.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(700);
assert.equal(await page.locator('.home-page').count(), 1);
assert.match(await page.locator('.home-page').innerText(), /今天|СЛОВО/);
console.log('✓ 离线重载首页');

await page.goto(base + '/study', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(700);
assert.ok((await page.locator('.study-shell').count()) || (await page.locator('.empty-state').count()));
console.log('✓ 离线进入 /study');
await page.screenshot({ path: '/tmp/prod-offline.png', fullPage: false });
await context.setOffline(false);

console.log('ERRORS', errors.slice(0, 10));
await browser.close();
