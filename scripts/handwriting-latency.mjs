import { webkit } from 'playwright';

const browser = await webkit.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(`PAGEERROR: ${error.message}`));

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.evaluate(() => {
  const data = JSON.parse(localStorage.getItem('slovo.store.v1'));
  data.settings.onlineHandwriting = false;
  data.settings.offlineHandwriting = true;
  localStorage.setItem('slovo.store.v1', JSON.stringify(data));
});
await page.goto('http://127.0.0.1:4173/study?free=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.getByRole('button', { name: /手写/ }).click();
await page.waitForTimeout(3200);

const box = await page.locator('.handwriting-canvas').boundingBox();
if (!box) throw new Error('no handwriting canvas');
const point = (x, y) => ({ x: box.x + x, y: box.y + y });

async function stroke(points) {
  const first = point(...points[0]);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (let index = 1; index < points.length; index += 1) {
    const next = point(...points[index]);
    await page.mouse.move(next.x, next.y, { steps: 12 });
  }
  await page.mouse.up();
}

function circle(cx, cy, radius, count = 20) {
  const points = [];
  for (let index = 0; index <= count; index += 1) {
    const angle = (2 * Math.PI * index) / count;
    points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  return points;
}

async function run(label) {
  await stroke([[50, 70], [50, 130]]);
  await stroke([[50, 70], [100, 70]]);
  await stroke([[100, 70], [100, 130]]);
  await stroke(circle(160, 100, 28));
  const started = Date.now();
  await page.waitForFunction(
    () => {
      const element = document.querySelector('.handwriting-status');
      return Boolean(element && /识别完成|没有识别清楚|不可用/.test(element.textContent || ''));
    },
    undefined,
    { timeout: 20_000 },
  );
  const elapsed = Date.now() - started;
  const status = await page.locator('.handwriting-status').innerText();
  const candidates = await page.locator('.candidate-row button').allInnerTexts();
  const recognized = await page.locator('.recognized-line').innerText().catch(() => '');
  console.log(JSON.stringify({ label, elapsedMs: elapsed, status, candidates, recognized }));
}

await run('warm-1');
await page.getByRole('button', { name: '清空手写板' }).click();
await page.waitForTimeout(300);
await run('warm-2');
console.log('ERRORS', errors.slice(0, 10));
await browser.close();
