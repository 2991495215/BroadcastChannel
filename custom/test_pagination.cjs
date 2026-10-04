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
    assert.equal(await page.locator('.news-pagination:visible').count(), 2);
    assert((await page.locator('.page-status:visible').first().innerText()).startsWith('第 1 页'));
    assert.equal(await page.locator('.news-pagination .disabled').count(), 2);
    assert.equal(await page.locator('.feed-panel.is-entering').count(), 0, 'initial load must not animate');
    await page.emulateMedia({reducedMotion: 'no-preference'});
    const transition = await page.evaluate(() => {
      document.querySelector('#tab-selected').click();
      const animation = document.querySelector('#panel-selected').getAnimations()[0];
      return {name: animation?.animationName, duration: animation?.effect.getTiming().duration};
    });
    assert.deepEqual(transition, {name: 'feed-enter', duration: 220});
    await page.evaluate(() => Promise.all(document.querySelector('#panel-selected').getAnimations().map(animation => animation.finished)));
    assert.equal(await page.locator('#panel-selected').evaluate(panel => getComputedStyle(panel).opacity), '1');
    await page.evaluate(() => {
      for (let i = 0; i < 20; i++) document.querySelector(i % 2 ? '#tab-selected' : '#tab-full').click();
      document.querySelector('#tab-full').click();
    });
    assert.equal(await page.locator('#panel-selected').isVisible(), false);
    assert.equal(await page.locator('#panel-full').isVisible(), true);
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.evaluate(() => document.querySelector('#tab-selected').click());
    assert.equal(await page.locator('#panel-selected').evaluate(panel => panel.getAnimations().length), 0);
    assert(await page.locator('#tab-selected').evaluate(tab => parseFloat(getComputedStyle(tab).transitionDuration) <= 0.00001));
    await page.evaluate(() => document.querySelector('#tab-full').click());
    await page.emulateMedia({reducedMotion: 'no-preference'});
    await page.getByRole('link', {name: '下一页', exact: true}).first().click();
    await page.waitForLoadState('networkidle');
    assert((await page.locator('.page-status:visible').first().innerText()).startsWith('第 2 页'));
    await page.reload({waitUntil: 'networkidle'});
    assert((await page.locator('.page-status:visible').first().innerText()).startsWith('第 2 页'));
    let documentRequests = 0;
    const countDocuments = request => { if (request.isNavigationRequest()) documentRequests++; };
    page.on('request', countDocuments);
    await page.evaluate(() => { window.switchMarker = 'same-document'; });
    const fullUrl = page.url();
    const firstFullTitle = await page.locator('#panel-full .hn-story').first().innerText();
    await page.getByRole('tab', {name: '精选消息', exact: true}).click();
    await page.locator('.selected-results .page-status:visible').first().waitFor();
    await page.emulateMedia({reducedMotion: 'reduce'});
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({width, height: 960});
      const layout = () => page.evaluate(async () => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const panel = document.querySelector('.feed-panel:not([hidden])');
        const rect = selector => { const r = panel.querySelector(selector).getBoundingClientRect(); return {x: r.x, y: r.y, width: r.width, height: r.height}; };
        return {toolbar: rect('.feed-toolbar'), pager: rect('.news-pagination'), card: rect('.post-entry'), title: rect('.hn-story'), meta: rect('.post-meta'), source: rect('.link_preview_site_name'), badge: rect('.selected-badge'), paginationDisplay: getComputedStyle(panel.querySelector('.news-pagination')).display};
      });
      const selectedLayout = await layout();
      await page.getByRole('tab', {name: '全量消息', exact: true}).click();
      const fullLayout = await layout();
      for (const part of ['toolbar', 'pager', 'card', 'title', 'meta', 'source', 'badge']) {
        for (const key of ['x', 'y', 'width', 'height']) assert(Math.abs(fullLayout[part][key] - selectedLayout[part][key]) < 2, `${width}px ${part}.${key} must match: ${JSON.stringify({fullLayout, selectedLayout})}`);
      }
      assert.equal(fullLayout.paginationDisplay, selectedLayout.paginationDisplay);
      assert.match(await page.locator('#panel-full .post-meta').first().innerText(), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      assert.equal(await page.locator('#panel-full .post-entry .selected-summary').count(), await page.locator('#panel-full .post-entry').count());
      assert.equal(await page.locator('#panel-full .news-pagination .page-numbers').count(), 2);
      assert.equal(await page.locator('#panel-selected .news-pagination .page-latest').count(), 2);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.getByRole('tab', {name: '精选消息', exact: true}).click();
    }
    await page.setViewportSize({width: 1440, height: 960});
    await page.emulateMedia({reducedMotion: 'no-preference'});
    assert.equal(new URL(page.url()).pathname, new URL(fullUrl).pathname);
    await page.getByRole('tab', {name: '全量消息', exact: true}).click();
    assert.equal(page.url(), fullUrl);
    assert((await page.locator('.page-status:visible').first().innerText()).startsWith('第 2 页'));
    assert.equal(await page.locator('#panel-full .hn-story').first().innerText(), firstFullTitle);
    await page.getByRole('tab', {name: '全量消息', exact: true}).press('ArrowRight');
    assert.equal(await page.getByRole('tab', {name: '精选消息'}).getAttribute('aria-selected'), 'true');
    await page.goBack();
    await page.waitForFunction(() => !document.querySelector('#panel-full').hidden);
    assert.equal(await page.evaluate(() => window.switchMarker), 'same-document');
    assert.equal(documentRequests, 0, 'tab switching must not navigate or reload the document');
    page.off('request', countDocuments);
    await page.setViewportSize({width: 390, height: 844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const historical = new URL(page.url()).pathname;
    await page.getByRole('link', {name: '上一页', exact: true}).first().click();
    await page.waitForLoadState('networkidle');
    assert((await page.locator('.page-status:visible').first().innerText()).startsWith('第 1 页'));
    await page.goto(base + historical, {waitUntil: 'networkidle'});
    assert((await page.locator('.page-status:visible').first().innerText()).startsWith('第 2 页'), 'bare historical link must recover its visited page');
    assert.equal(new URL(page.url()).searchParams.get('page'), '2');
    const direct = await browser.newPage();
    await direct.goto(base + historical, {waitUntil: 'networkidle'});
    assert((await direct.locator('.page-status:visible').first().innerText()).startsWith('第 1 页'), 'unknown historical link starts a new browsing sequence');
    await direct.getByRole('link', {name: '下一页', exact: true}).first().click();
    await direct.waitForLoadState('networkidle');
    await direct.reload({waitUntil: 'networkidle'});
    assert((await direct.locator('.page-status:visible').first().innerText()).startsWith('第 2 页'));
    await direct.getByRole('tab', {name: '精选消息', exact: true}).click();
    await direct.getByRole('tab', {name: '全量消息', exact: true}).click();
    assert((await direct.locator('.page-status:visible').first().innerText()).startsWith('第 2 页'));
    await direct.close();
    await page.getByRole('link', {name: '回到最新', exact: true}).first().click();
    await page.waitForLoadState('networkidle');
    assert.equal(new URL(page.url()).pathname, '/');
    await page.getByRole('tab', {name: '精选消息', exact: true}).click();
    await page.locator('.selected-results .page-status:visible').first().waitFor();
    assert.equal(await page.locator('.news-pagination:visible').count(), 2);
    assert((await page.locator('.page-status:visible').first().innerText()).startsWith('第 1 页'));
    assert(await page.locator('.post-entry:visible').count() <= 20);
    assert((await page.locator('.feed-note').innerText()).includes('相关度'));
    assert((await page.locator('.feed-sync').innerText()).includes('数据更新于'));
    const sample = Array.from({length: 45}, (_, i) => ({
      title: `测试消息 ${i + 1}`, url: `https://example.com/${i}`, score: 0.8, source: '测试来源', summary: '<script>不能执行</script>',
    }));
    let payload = {items: [...sample, null, {url: 'javascript:alert(1)', score: 1}], min_score: 0.65, updated_at: new Date().toISOString()};
    let failure = false, requests = 0;
    await page.route('**/news-data/selected.json*', route => {
      requests++;
      return route.fulfill({status: failure ? 503 : 200, contentType: 'application/json', body: JSON.stringify(payload)});
    });
    await page.goto(base + '/?view=selected', {waitUntil: 'networkidle'});
    assert((await page.locator('.page-status:visible').first().innerText()).startsWith('第 1 页'));
    assert.equal(await page.locator('.post-entry:visible').count(), 20);
    assert.equal(await page.locator('.selected-summary script').count(), 0);
    await page.getByRole('link', {name: '第 3 页', exact: true}).first().click();
    assert.equal(await page.locator('.post-entry:visible').count(), 5);
    await page.getByRole('tab', {name: '全量消息', exact: true}).click();
    assert.equal(await page.locator('#panel-selected').isVisible(), false);
    await page.getByRole('tab', {name: '精选消息', exact: true}).click();
    assert((await page.locator('.page-status:visible').first().innerText()).startsWith('第 3 页'));
    assert.equal(await page.locator('.post-entry:visible').count(), 5);
    await page.reload({waitUntil: 'networkidle'});
    assert((await page.locator('.page-status:visible').first().innerText()).startsWith('第 3 页'));
    await page.getByRole('link', {name: '上一页', exact: true}).first().click();
    assert((await page.locator('.page-status:visible').first().innerText()).startsWith('第 2 页'));
    await page.goBack();
    await page.waitForFunction(() => document.querySelector('.selected-results .page-status').textContent.startsWith('第 3 页'));
    failure = true;
    await page.getByRole('button', {name: '立即同步'}).click();
    await page.waitForFunction(() => document.querySelector('.feed-sync').textContent.includes('同步失败'));
    assert.equal(await page.locator('.post-entry:visible').count(), 5);
    failure = false;
    payload = {...payload, min_score: 0.9};
    await page.getByRole('button', {name: '立即同步'}).click();
    await page.waitForFunction(() => document.querySelector('.feed-count').textContent === '0 条 · 1 页');
    assert.equal(await page.locator('.feed-empty').count(), 1);
    assert.equal(new URL(page.url()).searchParams.get('page'), '1');
    const before = requests;
    payload = {...payload, min_score: 0.65};
    await page.waitForFunction(() => document.querySelector('.feed-count').textContent === '45 条 · 3 页', null, {timeout: 35000});
    assert(requests > before, 'automatic sync must fetch without a manual refresh');
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({width, height: 900});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    payload = {...payload, updated_at: '2020-01-01T00:00:00Z'};
    await page.getByRole('button', {name: '立即同步'}).click();
    await page.waitForFunction(() => document.querySelector('.feed-sync').textContent.includes('超过 15 分钟'));
    await page.goto(base + '/?view=selected&page=999999', {waitUntil: 'networkidle'});
    assert((await page.locator('.page-status:visible').first().innerText()).startsWith('第 3 页'));
    failure = true;
    await page.reload({waitUntil: 'networkidle'});
    assert.equal(await page.locator('.post-entry:visible').count(), 0);
    assert((await page.locator('.feed-sync').innerText()).includes('暂时无法加载'));
    failure = false;
    await page.getByRole('button', {name: '立即同步'}).click();
    await page.waitForFunction(() => document.querySelectorAll('.selected-results .post-entry').length === 5);
    assert.deepEqual(errors, []);
    console.log('PASS shared pagination and card layout, matching desktop/mobile geometry, absolute timestamps, 220ms transition, rapid switching, reduced motion, independent page state, keyboard/back navigation, automatic/manual sync and failure recovery');
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error); process.exit(1);});
