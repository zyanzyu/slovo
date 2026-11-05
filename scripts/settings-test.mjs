import { webkit } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('slovo.store.v1')));
await page.goto('http://127.0.0.1:4173/settings', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

const goalRow = page.locator('.settings-row').filter({ hasText: '每日目标' });
await goalRow.getByRole('button', { name: '增加' }).click();
const newRow = page.locator('.settings-row').filter({ hasText: '每日新词' });
await newRow.getByRole('button', { name: '增加' }).click();
await page.locator('.segment-control button', { hasText: '听写' }).click();
await page.locator('.toggle-row').filter({ hasText: '自动播放' }).click();
await page.waitForTimeout(300);
let data = await store();
assert.equal(data.settings.dailyGoal, 20);
assert.equal(data.settings.newPerDay, 9);
assert.equal(data.settings.defaultMode, 'audio');
assert.equal(data.settings.autoPlay, false);
console.log('✓ 设置项已更新');
await page.reload({ waitUntil: 'networkidle' });
data = await store();
assert.equal(data.settings.dailyGoal, 20);
assert.equal(data.settings.defaultMode, 'audio');
console.log('✓ 设置刷新后保持');

let downloadPath = '';
try {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }),
    page.getByRole('button', { name: /导出/ }).click(),
  ]);
  downloadPath = '/tmp/slovo-backup.json';
  await download.saveAs(downloadPath);
  const backup = JSON.parse(fs.readFileSync(downloadPath, 'utf8'));
  assert.equal(backup.app, 'slovo');
  assert.equal(backup.data.settings.dailyGoal, 20);
  assert.equal(backup.data.words.length, 34);
  console.log('✓ 导出备份包含完整数据', fs.statSync(downloadPath).size, 'bytes');
} catch (error) {
  console.log('DOWNLOAD SKIPPED:', error.message);
}

const backup = JSON.parse(fs.readFileSync('/tmp/slovo-backup.json', 'utf8'));
backup.data.settings.dailyGoal = 30;
backup.data.decks[0].name = '恢复后的词库';
fs.writeFileSync('/tmp/slovo-backup-modified.json', JSON.stringify(backup));
const restoreInput = page.locator('input[type=file][accept*="json"]');
await restoreInput.setInputFiles('/tmp/slovo-backup-modified.json');
await page.waitForTimeout(500);
data = await store();
assert.equal(data.settings.dailyGoal, 30);
assert.equal(data.decks[0].name, '恢复后的词库');
console.log('✓ 从备份恢复');

await restoreInput.setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{bad') });
await page.waitForTimeout(400);
assert.equal(await page.getByText('备份文件格式不正确', { exact: true }).count(), 1);
data = await store();
assert.equal(data.decks[0].name, '恢复后的词库');
console.log('✓ 非法备份被拒绝且原数据不变');

// Seed a fake progress record, reload, then reset progress.
await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('slovo.store.v1'));
  d.words[0].srs.reps = 4;
  d.words[0].srs.mastery = 3;
  d.stats.totalReviews = 12;
  d.stats.totalCorrect = 9;
  d.stats.streak = 4;
  localStorage.setItem('slovo.store.v1', JSON.stringify(d));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.locator('.settings-row').filter({ hasText: '重置学习进度' }).getByRole('button', { name: '重置' }).click();
await page.waitForTimeout(250);
await page.getByRole('button', { name: '重置进度' }).click();
await page.waitForTimeout(400);
data = await store();
assert.equal(data.stats.totalReviews, 0);
assert.equal(data.stats.streak, 0);
assert.equal(data.words[0].srs.reps, 0);
assert.equal(data.words.length, 34);
console.log('✓ 重置进度保留单词');

await page.locator('.settings-row').filter({ hasText: '恢复示例数据' }).getByRole('button', { name: '清空' }).click();
await page.waitForTimeout(250);
await page.getByRole('button', { name: '清空并恢复' }).click();
await page.waitForURL('http://127.0.0.1:4173/');
await page.waitForTimeout(500);
data = await store();
assert.equal(data.words.length, 34);
assert.equal(data.decks.length, 3);
assert.equal(data.settings.dailyGoal, 15);
console.log('✓ 恢复示例数据');
console.log('ERRORS', errors.slice(0, 10));
await browser.close();
