import { webkit } from 'playwright';
import assert from 'node:assert/strict';
const browser = await webkit.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:4173/study?free=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
assert.equal(await page.locator('.study-count').innerText(), '1 / 10');
console.log('✓ 自由练习生成 10 张卡');

const firstKey = page.locator('.cyr-key').first();
await firstKey.click();
let value = await page.locator('.answer-input').inputValue();
assert.ok(value.length > 0, 'keyboard adds letter');
console.log('✓ 俄语键盘可输入:', value);
await page.locator('.clear-answer').click();
assert.equal(await page.locator('.answer-input').inputValue(), '');
console.log('✓ 清空答案');

await page.locator('.hint-button').click();
await page.waitForTimeout(100);
const hint1 = await page.locator('.hint-reveal').innerText();
assert.ok(hint1.includes('首字母'), 'first hint');
await page.locator('.hint-button').click();
await page.waitForTimeout(100);
const hint2 = await page.locator('.hint-reveal').innerText();
assert.notEqual(hint2, hint1);
console.log('✓ 两级提示:', hint1.slice(0, 20), '→', hint2.slice(0, 20));

await page.locator('.answer-input').fill('неверно');
await page.locator('.check-button').click();
await page.waitForSelector('.feedback-panel.is-wrong');
console.log('✓ 错误答案进入反馈');
await page.locator('.rate-again').click();
await page.waitForTimeout(400);
const count = await page.locator('.study-count').innerText();
assert.match(count, /2 \/ 11/, 'wrong card requeued');
console.log('✓ 错词排到队尾，总数变为', count);

// Keyboard rating shortcut on the next card.
await page.locator('.answer-input').fill('неверно');
await page.locator('.check-button').click();
await page.waitForSelector('.feedback-panel.is-wrong');
await page.keyboard.press('1');
await page.waitForTimeout(400);
assert.match(await page.locator('.study-count').innerText(), /3 \/ 12/);
console.log('✓ 数字键 1 可评分并继续重排');

console.log('ERRORS:', errors);
await browser.close();
