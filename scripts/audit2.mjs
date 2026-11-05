import { webkit } from 'playwright';
const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push('PAGEERROR: ' + err.message));

async function boot(path) {
  await page.goto('http://127.0.0.1:4173' + path, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}
async function metrics(name, selectors = []) {
  const data = await page.evaluate((selectors) => {
    const pick = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { cls: typeof el.className === 'string' ? el.className.slice(0, 70) : el.tagName,
        x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height),
        bottom: Math.round(r.bottom + scrollY), font: cs.fontSize, display: cs.display,
        overflowY: cs.overflowY, scrollH: el.scrollHeight, clientH: el.clientHeight,
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 70) };
    };
    const rects = {}; for (const s of selectors) rects[s] = pick(document.querySelector(s));
    const over = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width > 2 && (r.right > innerWidth + 1 || r.left < -1)) {
        let clipped = false, p = el.parentElement;
        while (p && p !== document.body) { const ps = getComputedStyle(p); if (ps.overflowX === 'hidden' || ps.overflowX === 'clip') { clipped = true; break; } p = p.parentElement; }
        if (!clipped) over.push({ cls: typeof el.className === 'string' ? el.className.slice(0, 70) : el.tagName, left: Math.round(r.left), right: Math.round(r.right) });
      }
    }
    return { path: location.pathname + location.search, viewport: innerWidth + 'x' + innerHeight,
      docScrollW: document.documentElement.scrollWidth, docScrollH: document.documentElement.scrollHeight,
      active: document.activeElement ? document.activeElement.className : null, rects, unclippedOverflow: over.slice(0, 10) };
  }, selectors);
  console.log('\n### ' + name + '\n' + JSON.stringify(data, null, 1));
}

await boot('/import');
await page.getByRole('tab', { name: /拍照/ }).click();
await page.waitForTimeout(250);
await metrics('import-camera-390', ['.page-header', '.source-tabs', '.import-panel', '.dropzone', '.image-options', '.ocr-note', '.bottom-nav']);

await page.getByRole('tab', { name: /文字/ }).click();
await page.locator('.import-textarea').fill('привет — 你好\nпока — 再见\nспасибо — 谢谢');
await page.locator('.btn-primary.wide').click();
await page.waitForTimeout(500);
await metrics('import-preview-390', ['.import-panel', '.import-preview', '.preview-table', '.import-target', '.import-submit', '.bottom-nav']);

await boot('/settings');
await metrics('settings-390', ['.page-header', '.settings-overview', '.settings-row', '.settings-section', '.install-card', '.settings-footer', '.version-line', '.bottom-nav']);

await boot('/study');
await page.waitForTimeout(500);
await metrics('study-type-390', ['.study-shell', '.study-top', '.study-main', '.study-prompt', '.answer-card', '.answer-input', '.cyr-keyboard', '.check-button', '.answer-helper-row', '.study-footer']);
await page.getByRole('button', { name: /手写/ }).click();
await page.waitForTimeout(300);
await metrics('study-hand-390', ['.study-shell', '.study-main', '.answer-card', '.handwriting-canvas-wrap', '.handwriting-tools', '.check-button', '.study-footer']);

await boot('/library');
await page.getByRole('button', { name: /新建词库/ }).first().click();
await page.waitForTimeout(300);
await metrics('library-modal-390', ['.modal-panel', '.modal-head', '.modal-body', '.modal-footer']);

console.log('\nERRORS:', JSON.stringify(errors));
await browser.close();
