const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 960}});
    const base = process.env.BASE_URL || 'http://127.0.0.1:4321';
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, {waitUntil: 'networkidle'});
    assert.equal(await page.locator('.news-pagination').count(), 2);
    assert((await page.locator('.page-status').first().innerText()).startsWith('第 1 页'));
    assert.equal(await page.locator('.news-pagination .disabled').count(), 2);
    await page.getByRole('link', {name: '下一页 · 更早', exact: true}).first().click();
    await page.waitForLoadState('networkidle');
    assert((await page.locator('.page-status').first().innerText()).startsWith('第 2 页'));
    await page.reload({waitUntil: 'networkidle'});
    assert((await page.locator('.page-status').first().innerText()).startsWith('第 2 页'));
    await page.setViewportSize({width: 390, height: 844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const historical = new URL(page.url()).pathname;
    await page.getByRole('link', {name: '上一页 · 更新', exact: true}).first().click();
    await page.waitForLoadState('networkidle');
    assert((await page.locator('.page-status').first().innerText()).startsWith('第 1 页'));
    await page.goto(base + historical, {waitUntil: 'networkidle'});
    assert((await page.locator('.page-status').first().innerText()).startsWith('历史消息'));
    await page.getByRole('link', {name: '回到最新', exact: true}).first().click();
    await page.waitForLoadState('networkidle');
    assert.equal(new URL(page.url()).pathname, '/');
    await page.getByRole('link', {name: '精选消息', exact: true}).click();
    await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('.news-pagination').count(), 0);
    assert((await page.locator('.feed-note').innerText()).includes('相关度'));
    assert.deepEqual(errors, []);
    console.log('PASS pagination, mobile layout, reload, historical cursor, latest and selected feed');
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error); process.exit(1);});
