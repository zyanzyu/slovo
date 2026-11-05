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
  await page.waitForTimeout(350);
}

async function metrics(name, selectors = []) {
  const data = await page.evaluate((selectors) => {
    const pick = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName,
        cls: typeof el.className === 'string' ? el.className.slice(0, 80) : '',
        x: Math.round(r.x), y: Math.round(r.y + scrollY),
        w: Math.round(r.width), h: Math.round(r.height),
        bottom: Math.round(r.bottom + scrollY),
        font: cs.fontSize, display: cs.display,
        overflowX: cs.overflowX, text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
      };
    };
    const rects = {};
    for (const sel of selectors) rects[sel] = pick(document.querySelector(sel));
    const all = [...document.querySelectorAll('body *')];
    const over = [];
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.width > 2 && (r.right > innerWidth + 1 || r.left < -1)) {
        const cs = getComputedStyle(el);
        let clipped = false;
        let p = el.parentElement;
        while (p && p !== document.body) {
          const ps = getComputedStyle(p);
          if (ps.overflowX === 'hidden' || ps.overflowX === 'clip') { clipped = true; break; }
          p = p.parentElement;
        }
        if (!clipped) over.push({ cls: typeof el.className === 'string' ? el.className.slice(0, 70) : el.tagName, left: Math.round(r.left), right: Math.round(r.right) });
      }
    }
    return {
      path: location.pathname + location.search,
      viewport: innerWidth + 'x' + innerHeight,
      docScrollW: document.documentElement.scrollWidth,
      docScrollH: document.documentElement.scrollHeight,
      bodyH: document.body.scrollHeight,
      fonts: {
        golos: document.fonts.check('16px "Golos Text"'),
        prata: document.fonts.check('16px "Prata"'),
      },
      nav: pick(document.querySelector('.nav-inner')),
      rects,
      unclippedOverflow: over.slice(0, 12),
    };
  }, selectors);
  console.log('\n### ' + name + '\n' + JSON.stringify(data, null, 1));
}

await boot('/');
await metrics('home-390', ['.brand-row', '.hero', '.hero-title', '.plan-card', '.mode-grid', '.stat-strip', '.decks-section', '.proverb', '.bottom-nav']);

await boot('/library');
await metrics('library-390', ['.page-header', '.page-actions', '.search-bar', '.deck-library-list', '.library-tip', '.bottom-nav']);

const deckId = await page.evaluate(() => JSON.parse(localStorage.getItem('slovo.store.v1')).decks[0].id);
await boot('/library/' + deckId);
await metrics('deck-390', ['.subpage-head', '.deck-hero', '.deck-stat-row', '.deck-actions', '.word-list', '.bottom-nav']);

await boot('/import');
await metrics('import-text-390', ['.page-header', '.source-tabs', '.import-panel', '.import-textarea', '.import-note', '.bottom-nav']);
await page.getByRole('button', { name: /拍照/ }).click();
await page.waitForTimeout(250);
await metrics('import-camera-390', ['.import-panel', '.dropzone', '.image-options', '.ocr-note']);
await page.getByRole('button', { name: /文字/ }).click();
await page.locator('.import-textarea').fill('привет - 你好\nпока - 再见\nспасибо - 谢谢');
await page.waitForTimeout(350);
await metrics('import-preview-390', ['.import-preview', '.preview-table', '.import-target', '.import-submit']);

await boot('/settings');
await metrics('settings-390', ['.page-header', '.settings-overview', '.settings-section', '.install-card', '.settings-footer', '.version-line', '.bottom-nav']);

await boot('/study');
await page.waitForTimeout(500);
await metrics('study-type-390', ['.study-top', '.study-main', '.study-prompt', '.answer-card', '.answer-input', '.check-button', '.answer-helper-row', '.study-footer']);
await page.getByRole('button', { name: /手写/ }).click();
await page.waitForTimeout(300);
await metrics('study-hand-390', ['.answer-card', '.handwriting-canvas-wrap', '.handwriting-tools', '.check-button', '.study-footer']);

await boot('/library');
await page.getByRole('button', { name: /新建词库/ }).first().click();
await page.waitForTimeout(300);
await metrics('library-modal-390', ['.modal-panel', '.modal-head', '.modal-body', '.modal-footer']);

console.log('\nERRORS:', JSON.stringify(errors));
await browser.close();
