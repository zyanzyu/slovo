import { webkit } from 'playwright';
import assert from 'node:assert/strict';

const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push('PAGEERROR: ' + err.message));

const base = 'http://127.0.0.1:4173';
async function go(path) {
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}
const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('slovo.store.v1')));

await go('/');
let data = await store();
assert.equal(data.words.length, 34, 'seed word count');
console.log('✓ 初始词库 34 个词');

await go('/import');
await page.locator('.import-textarea').fill('тест — 测试\nпример, 例子\nкошка\t猫');
await page.locator('.text-import .btn-primary').click();
await page.waitForSelector('.import-preview');
const previewRows = await page.locator('.preview-row').count();
assert.equal(previewRows, 3, 'preview rows');
console.log('✓ 文字解析出 3 行预览');

await page.locator('.import-submit').click();
await page.waitForURL(/\/library\/daily/);
await page.waitForTimeout(500);
data = await store();
assert.equal(data.words.length, 37, 'words after import');
assert.ok(data.words.some((w) => w.ru === 'тест' && w.zh === '测试'), 'imported word');
console.log('✓ 导入落库，词库变为 37 个词');

await go('/');
await page.getByRole('button', { name: /中译俄/ }).click();
await page.waitForTimeout(250);
data = await store();
assert.equal(data.settings.defaultMode, 'meaning');
await page.locator('.plan-cta').click();
await page.waitForURL(/\/study/);
await page.waitForTimeout(500);
console.log('✓ 进入中译俄提背');

let completed = 0;
for (let i = 0; i < 8; i++) {
  const summary = await page.locator('.session-summary').count();
  if (summary) break;
  const zh = (await page.locator('.meaning-area h1').innerText()).trim();
  const all = await store();
  const word = all.words.find((w) => w.zh === zh);
  assert.ok(word, 'word for prompt: ' + zh);
  await page.locator('.answer-input').fill(word.ru);
  await page.locator('.check-button').click();
  await page.waitForSelector('.feedback-panel', { timeout: 5000 });
  const correct = await page.locator('.feedback-panel.is-correct').count();
  assert.equal(correct, 1, 'answer should be correct for ' + word.ru);
  await page.locator('.rate-good').click();
  await page.waitForTimeout(350);
  completed++;
}
assert.equal(completed, 8, 'completed cards');
assert.equal(await page.locator('.session-summary').count(), 1, 'summary shown');
const summaryText = await page.locator('.session-summary').innerText();
assert.match(summaryText, /100%/, 'accuracy 100');
assert.match(summaryText, /第一次写对/);
console.log('✓ 8 张卡全部答对并进入总结，正确率 100%');

data = await store();
assert.equal(data.stats.daily[Object.keys(data.stats.daily)[0]].reviewed, 8);
assert.equal(data.stats.streak, 1);
console.log('✓ 学习统计与连续天数已记录');

await page.getByRole('button', { name: /回到今天/ }).click();
await page.waitForURL(base + '/');
await page.waitForTimeout(300);
await page.reload({ waitUntil: 'networkidle' });
data = await store();
const today = Object.keys(data.stats.daily)[0];
assert.equal(data.stats.daily[today].reviewed, 8, 'persisted reviews');
console.log('✓ 刷新后学习记录仍保留');

await go('/study?free=1');
await page.waitForTimeout(400);
assert.equal(await page.locator('.meaning-area h1').count(), 1);
await page.locator('.hint-button').click();
await page.waitForTimeout(150);
assert.equal(await page.locator('.hint-reveal').count(), 1);
await page.locator('.answer-input').fill('неверно');
await page.locator('.check-button').click();
await page.waitForSelector('.feedback-panel.is-wrong');
assert.equal(await page.locator('.feedback-panel.is-wrong').count(), 1);
assert.equal(await page.locator('.hint-used').count(), 1);
await page.locator('.rate-again').click();
await page.waitForTimeout(350);
assert.match(await page.locator('.study-count').innerText(), /2 \/ 11/);
console.log('✓ 错误答案、提示、重来与错词重排正常');

console.log('CONSOLE ERRORS:', JSON.stringify(errors));
await browser.close();
