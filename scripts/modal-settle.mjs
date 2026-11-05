import { webkit } from 'playwright';
const browser = await webkit.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto('http://127.0.0.1:4173/library', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /新建词库/ }).first().click();
for (const wait of [100, 300, 600, 1000]) {
  await page.waitForTimeout(wait);
  const m = await page.evaluate(() => {
    const p = document.querySelector('.modal-panel');
    const r = p.getBoundingClientRect();
    const cs = getComputedStyle(p);
    return { y: +r.y.toFixed(1), bottom: +r.bottom.toFixed(1), h: +r.height.toFixed(1), transform: cs.transform, animation: cs.animationName, vh: innerHeight };
  });
  console.log(wait, m);
}
await browser.close();
