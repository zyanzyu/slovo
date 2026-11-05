import { chromium } from 'playwright';
const browser = await chromium.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--enable-features=NetworkServiceInProcess',
    '--in-process-gpu',
    '--disable-gpu-sandbox',
    '--disable-gpu-compositing',
    '--disable-software-rasterizer'
  ]
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const logs = [];
page.on('console', (msg) => { if (msg.type() === 'error') logs.push(msg.text()); });
page.on('pageerror', (err) => logs.push('PAGEERROR: ' + err.message));
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(700);
await page.screenshot({ path: '/tmp/home.png', fullPage: true });
console.log('title:', await page.title());
console.log('errors:', logs);
console.log('body height:', await page.evaluate(() => document.body.scrollHeight));
await browser.close();
