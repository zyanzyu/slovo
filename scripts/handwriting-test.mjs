import { webkit } from 'playwright';
const browser = await webkit.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const logs = [];
page.on('console', (msg) => { if (msg.type() === 'error') logs.push(msg.text()); });
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
await page.goto('http://127.0.0.1:4173/study?free=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.getByRole('button', { name: /手写/ }).click();
await page.waitForTimeout(400);
const canvas = page.locator('.handwriting-canvas');
const b = await canvas.boundingBox();
console.log('canvas', b);
const px = (x, y) => ({ x: b.x + x, y: b.y + y });

async function stroke(points) {
  const p0 = px(...points[0]);
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  for (let i = 1; i < points.length; i++) {
    const p = px(...points[i]);
    await page.mouse.move(p.x, p.y, { steps: 12 });
  }
  await page.mouse.up();
  await page.waitForTimeout(80);
}
function circle(cx, cy, r, n = 20) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (Math.PI * 2 * i) / n;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

// Printed "по": п (two verticals + top bar), о (circle)
await stroke([[50, 70], [50, 130]]);
await stroke([[50, 70], [100, 70]]);
await stroke([[100, 70], [100, 130]]);
await stroke(circle(160, 100, 28));
console.log('strokes done, waiting for auto recognition');
await page.waitForTimeout(1300);
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(1000);
  const status = await page.locator('.handwriting-status').innerText();
  const recognized = await page.locator('.recognized-line').count() ? await page.locator('.recognized-line').innerText() : '';
  const candidates = await page.locator('.candidate-row button').allInnerTexts();
  const busy = await page.locator('.handwriting-busy').count();
  console.log(`t=${i + 1}s`, { status, recognized, candidates, busy });
  if (recognized || candidates.length || /没有识别|不可用/.test(status)) break;
}
console.log('input value:', await page.locator('.answer-input').count() ? await page.locator('.answer-input').inputValue() : '(hand mode no input)');
console.log('ERRORS:', logs.slice(0, 10));
await page.screenshot({ path: '/tmp/handwriting.png', fullPage: true });
await browser.close();
