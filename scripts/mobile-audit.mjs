import { webkit } from 'playwright';
const browser = await webkit.launch({ headless: true });
const sizes = [
  { w: 320, h: 700, name: '320x700' },
  { w: 360, h: 667, name: '360x667' },
  { w: 430, h: 932, name: '430x932' },
];
for (const s of sizes) {
  const page = await browser.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  async function go(path) {
    await page.goto('http://127.0.0.1:4173' + path, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
  }
  async function info(label, selectors) {
    const d = await page.evaluate((selectors) => {
      const box = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom + scrollY), scrollH: el.scrollHeight, clientH: el.clientHeight, font: getComputedStyle(el).fontSize };
      };
      const out = {};
      for (const sel of selectors) out[sel] = box(sel);
      let over = 0;
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width > 2 && (r.right > innerWidth + 1 || r.left < -1)) {
          let clipped = false, p = el.parentElement;
          while (p && p !== document.body) { const ps = getComputedStyle(p); if (ps.overflowX === 'hidden' || ps.overflowX === 'clip') { clipped = true; break; } p = p.parentElement; }
          if (!clipped) over++;
        }
      }
      return { viewport: innerWidth + 'x' + innerHeight, docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight, over, out };
    }, selectors);
    console.log('\n[' + s.name + '] ' + label + '\n' + JSON.stringify(d, null, 1));
  }

  await go('/');
  await info('home', ['.hero-title', '.plan-card', '.plan-top', '.plan-title', '.mode-grid', '.stat-strip', '.bottom-nav']);

  await go('/import');
  await page.getByRole('tab', { name: /拍照/ }).click();
  await page.waitForTimeout(200);
  await info('import-camera', ['.source-tabs', '.import-panel', '.dropzone', '.image-options', '.bottom-nav']);

  await go('/settings');
  await info('settings', ['.settings-overview', '.settings-section', '.settings-row', '.stepper', '.method-grid', '.bottom-nav']);

  await go('/study');
  await page.waitForTimeout(350);
  await info('study-type', ['.study-shell', '.study-main', '.study-prompt', '.answer-card', '.cyr-keyboard', '.check-button', '.study-footer']);
  await page.getByRole('button', { name: /手写/ }).click();
  await page.waitForTimeout(250);
  await info('study-hand', ['.answer-card', '.handwriting-canvas-wrap', '.check-button', '.study-footer']);

  console.log('errors', s.name, errors);
  await page.close();
}
await browser.close();
