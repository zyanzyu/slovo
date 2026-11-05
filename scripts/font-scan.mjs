import { webkit } from 'playwright';
const browser = await webkit.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const pages = ['/', '/library', '/import', '/settings', '/study?free=1'];
for (const path of pages) {
  await page.goto('http://127.0.0.1:4173' + path, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  const tiny = await page.evaluate(() => {
    const seen = new Map();
    for (const el of document.querySelectorAll('body *')) {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
      if (!own) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs >= 10) continue;
      const key = `${fs}px | ${el.tagName.toLowerCase()}.${el.className}`;
      if (!seen.has(key)) seen.set(key, { text: own.slice(0, 60), count: 0 });
      seen.get(key).count++;
    }
    return [...seen.entries()].map(([k, v]) => ({ style: k, ...v })).sort((a, b) => parseFloat(a.style) - parseFloat(b.style));
  });
  console.log('\n' + path, JSON.stringify(tiny, null, 1));
}
await browser.close();
