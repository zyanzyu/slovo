import { webkit } from 'playwright';

const browser = await webkit.launch({ headless: true });
const base = 'http://127.0.0.1:4173';

async function audit(width, fontScale = 1.08) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.evaluate((scale) => {
    const data = JSON.parse(localStorage.getItem('slovo.store.v1'));
    data.settings.fontScale = scale;
    localStorage.setItem('slovo.store.v1', JSON.stringify(data));
  }, fontScale);
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  const results = {};
  for (const [name, path] of [['home', '/'], ['library', '/library'], ['import', '/import'], ['settings', '/settings']]) {
    if (path !== '/') await page.goto(base + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(250);
    results[name] = await page.evaluate(() => {
      const shell = document.querySelector('.app-shell, .study-shell');
      const overflows = [...document.querySelectorAll('body *')]
        .filter((el) => {
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          if (style.position === 'fixed' || style.visibility === 'hidden' || style.display === 'none') return false;
          if (rect.width === 0 || rect.height === 0) return false;
          return rect.right > innerWidth + 2 || rect.left < -2;
        })
        .slice(0, 6)
        .map((el) => `${el.tagName}.${String(el.className).split(' ')[0]} ${Math.round(el.getBoundingClientRect().left)}..${Math.round(el.getBoundingClientRect().right)}`);
      return {
        title: document.title,
        innerWidth,
        docScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        shellWidth: shell ? Math.round(shell.getBoundingClientRect().width) : null,
        overflows,
        fontScale: getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim(),
      };
    });
  }

  await page.goto(base + '/study?free=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.locator('.reveal-button').click();
  await page.waitForTimeout(200);
  results.study = await page.evaluate(() => ({
    title: document.title,
    docScrollWidth: document.documentElement.scrollWidth,
    ratingColumns: getComputedStyle(document.querySelector('.rating-grid')).gridTemplateColumns,
    rateMinHeight: getComputedStyle(document.querySelector('.rate-button')).minHeight,
    sourceColumns: null,
    overflow: [...document.querySelectorAll('.study-shell *')]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 2 || r.left < -2); })
      .slice(0, 5).map((el) => `${el.tagName}.${String(el.className).split(' ')[0]}`),
  }));

  await page.goto(base + '/import', { waitUntil: 'networkidle' });
  results.importColumns = await page.locator('.source-tabs').evaluate((el) => getComputedStyle(el).gridTemplateColumns);
  await page.screenshot({ path: `/tmp/adaptive-${width}-${String(fontScale).replace('.', '')}.png`, fullPage: true });
  await context.close();
  console.log(JSON.stringify({ width, fontScale, results, errors: errors.slice(0, 3) }, null, 2));
}

for (const width of [320, 360, 390, 768, 1024, 1280]) await audit(width, 1.08);
await audit(320, 1.32);
await audit(768, 1.32);
await browser.close();
