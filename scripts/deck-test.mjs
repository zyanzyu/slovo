import { webkit } from 'playwright';
import assert from 'node:assert/strict';
const browser = await webkit.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://127.0.0.1:4173/library', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /新建一个词库/ }).click();
await page.locator('.modal-panel input').nth(0).fill('我的测试词库');
await page.locator('.modal-panel input').nth(1).fill('只属于我的小词库');
await page.getByRole('button', { name: '创建词库' }).click();
await page.waitForTimeout(400);
assert.equal(await page.locator('.modal-panel').count(), 0);
assert.equal(await page.getByText('我的测试词库', { exact: true }).count(), 1);
console.log('✓ 新建词库');

await page.getByText('我的测试词库', { exact: true }).click();
await page.waitForURL(/\/library\/.+/);
await page.getByRole('button', { name: '添加单词' }).click();
await page.waitForTimeout(300);
let inputs = page.locator('.word-editor-modal input');
await inputs.nth(0).fill('кошка');
await inputs.nth(1).fill('猫');
await page.getByRole('button', { name: '保存' }).click();
await page.waitForTimeout(400);
assert.equal(await page.getByText('кошка', { exact: true }).count(), 1);
assert.equal(await page.getByText('猫', { exact: true }).count(), 1);
console.log('✓ 添加单词');

await page.getByText('кошка', { exact: true }).click();
await page.waitForTimeout(300);
inputs = page.locator('.word-editor-modal input');
assert.equal(await inputs.nth(0).inputValue(), 'кошка');
assert.equal(await inputs.nth(1).inputValue(), '猫');
await inputs.nth(0).fill('кошечка');
await page.getByRole('button', { name: '保存' }).click();
await page.waitForTimeout(400);
assert.equal(await page.getByText('кошечка', { exact: true }).count(), 1);
console.log('✓ 编辑单词');

await page.getByText('кошечка', { exact: true }).click();
await page.getByRole('button', { name: /删除/ }).last().click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: '删除单词' }).click();
await page.waitForTimeout(400);
assert.equal(await page.getByText('кошечка', { exact: true }).count(), 0);
assert.match(await page.locator('.empty-state').innerText(), /这个词库还是空的/);
console.log('✓ 删除单词');

await page.getByRole('button', { name: /删除这个词库/ }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: '删除词库' }).click();
await page.waitForURL(/\/library$/);
await page.waitForTimeout(300);
assert.equal(await page.getByText('我的测试词库', { exact: true }).count(), 0);
console.log('✓ 删除词库');

// Import into a brand-new deck.
await page.goto('http://127.0.0.1:4173/import', { waitUntil: 'networkidle' });
await page.locator('.import-textarea').fill('лиса — 狐狸\nволк — 狼');
await page.locator('.text-import .btn-primary').click();
await page.waitForSelector('.import-preview');
await page.locator('.import-target select').selectOption('__new__');
await page.locator('.import-target input').fill('森林词库');
await page.locator('.import-submit').click();
await page.waitForURL(/\/library\/.+/);
await page.waitForTimeout(500);
assert.equal(await page.getByText('森林词库', { exact: true }).count(), 1);
assert.equal(await page.getByText('лиса', { exact: true }).count(), 1);
assert.equal(await page.getByText('волк', { exact: true }).count(), 1);
console.log('✓ 导入到新词库，导航与词库状态一致');

console.log('ERRORS', errors);
await browser.close();
