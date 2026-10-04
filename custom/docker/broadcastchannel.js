(() => {
  const navigation = document.querySelector('.site-navigation ul');
  if (!navigation) return;
  let selected = new URLSearchParams(location.search).get('view') === 'selected';
  const isFeed = document.body.classList.contains('feed');
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  navigation.replaceChildren();
  if (isFeed) {
    navigation.setAttribute('role', 'tablist');
    navigation.setAttribute('aria-label', '消息类型');
  }
  const tabs = [];
  for (const [label, href, id] of [
    ['全量消息', '/', 'full'],
    ['精选消息', '/?view=selected', 'selected'],
  ]) {
    const li = element('li', '');
    const link = element(isFeed ? 'button' : 'a', 'feed-tab', label);
    if (isFeed) {
      li.setAttribute('role', 'presentation');
      link.type = 'button';
      link.id = `tab-${id}`;
      link.setAttribute('role', 'tab');
      link.setAttribute('aria-controls', `panel-${id}`);
      tabs.push(link);
    } else link.href = href;
    li.append(link);
    navigation.append(li);
  }
  if (isFeed) {
    const pagination = document.querySelector('.pagination');
    if (pagination) {
      // ponytail: Telegram uses cursors, not stable numbered pages; count this browsing sequence only.
      const params = new URLSearchParams(location.search);
      const raw = selected ? null : params.get('page');
      const number = location.pathname === '/' ? 1 : (/^[1-9]\d{0,5}$/.test(raw || '') ? Number(raw) : null);
      const older = pagination.querySelector('a.older');
      const newer = pagination.querySelector('a.newer');
      const controls = element('nav', 'news-pagination');
      controls.setAttribute('aria-label', '消息分页');
      const addLink = (label, original, nextNumber) => {
        if (!original) {
          const disabled = element('span', 'page-button disabled', label);
          disabled.setAttribute('aria-disabled', 'true');
          controls.append(disabled);
          return;
        }
        const link = element('a', 'page-button', label);
        const url = new URL(original.href);
        if (nextNumber) url.searchParams.set('page', nextNumber);
        link.href = url.pathname + url.search;
        controls.append(link);
      };
      addLink('上一页 · 更新', newer, number && Math.max(1, number - 1));
      const status = element('span', 'page-status', number ? `第 ${number} 页` : '历史消息');
      status.append(element('small', '', number ? '本次浏览页序' : '游标分页 · 返回最新后从第 1 页浏览'));
      controls.append(status);
      addLink('下一页 · 更早', older, number && number + 1);
      const latest = element('a', 'page-latest', '回到最新');
      latest.href = '/';
      const extras = element('div', 'page-extras');
      extras.append(latest);
      controls.append(extras);
      pagination.replaceWith(controls);
      document.querySelector('#main-content').prepend(controls.cloneNode(true));
    }
  }
  if (!isFeed) return;
  for (const input of document.querySelectorAll('.desktop-search input, .mobile-search input')) {
    input.placeholder = '搜索频道消息…';
    input.setAttribute('aria-label', '搜索公开频道的全量消息');
  }
  const main = document.querySelector('#main-content');
  const fullPanel = element('section', 'feed-panel');
  fullPanel.id = 'panel-full';
  fullPanel.append(...main.childNodes);
  const selectedPanel = element('section', 'feed-panel');
  selectedPanel.id = 'panel-selected';
  const fullToolbar = element('section', 'feed-toolbar full-toolbar');
  const fullHeading = element('div', 'feed-heading');
  fullHeading.append(element('h2', '', '全量消息'), element('span', 'full-count', `本页 ${fullPanel.querySelectorAll('.post-entry').length} 条`));
  const fullRefresh = element('button', 'feed-refresh', '刷新消息');
  fullRefresh.type = 'button';
  fullRefresh.addEventListener('click', () => location.reload());
  const fullDetails = element('details', 'feed-details');
  fullDetails.append(element('summary', '', '更新说明'), element('p', 'feed-hint', '来自公开频道的全部推送 · 翻页查看更早消息 · 频道使用游标分页，没有固定总页数'));
  fullToolbar.append(fullHeading, fullRefresh, element('p', 'full-note', '公开频道 · 不按相关度筛选'), element('p', 'full-sync', '按频道发布顺序展示 · 刷新获取最新消息'), fullDetails);
  fullPanel.prepend(fullToolbar);
  for (const [panel, id] of [[fullPanel, 'full'], [selectedPanel, 'selected']]) {
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `tab-${id}`);
  }
  const original = new URL(location.href);
  const full = new URL(original);
  full.searchParams.delete('view');
  if (selected) full.searchParams.delete('page');
  const fullUrl = full.pathname + full.search;
  if (!selected) {
    original.searchParams.set('view', 'selected');
    original.searchParams.delete('page');
  }
  let selectedUrl = original.pathname + original.search;
  const toolbar = element('section', 'feed-toolbar');
  const heading = element('div', 'feed-heading');
  heading.append(element('h2', '', 'AI 精选'));
  const count = element('span', 'feed-count', '正在加载');
  heading.append(count);
  const refresh = element('button', 'feed-refresh', '立即同步');
  refresh.type = 'button';
  const note = element('p', 'feed-note', '正在读取已评分消息…');
  const sync = element('p', 'feed-sync', '连接中');
  sync.setAttribute('role', 'status');
  const hint = element('p', 'feed-hint', '每 30 秒检查更新 · 后台约每 5 分钟抓取评分 · 未达相关度的消息不进入精选');
  const details = element('details', 'feed-details');
  details.append(element('summary', '', '更新说明'), hint);
  toolbar.append(heading, refresh, note, sync, details);
  const content = element('div', 'selected-results');
  selectedPanel.append(toolbar, content);
  main.replaceChildren(fullPanel, selectedPanel);
  const pageSize = 20;
  let items = [], busy = false, loaded = false, signature = '', updatedAt = 0;
  const currentPage = () => {
    const raw = new URL(selectedUrl, location.origin).searchParams.get('page');
    return /^[1-9]\d{0,5}$/.test(raw || '') ? Number(raw) : 1;
  };
  function pageUrl(number) {
    const url = new URL(selectedUrl, location.origin);
    url.searchParams.set('page', number);
    return url.pathname + url.search;
  }
  function render() {
    const total = Math.max(1, Math.ceil(items.length / pageSize));
    const number = Math.min(currentPage(), total);
    if (number !== currentPage()) {
      selectedUrl = pageUrl(number);
      if (selected) history.replaceState(null, '', selectedUrl);
    }
    const start = (number - 1) * pageSize;
    count.textContent = `${items.length} 条 · ${total} 页`;
    const controls = element('nav', 'news-pagination selected-pagination');
    controls.setAttribute('aria-label', '精选消息分页');
    const addLink = (label, target, enabled, className = 'page-button') => {
      const link = element(enabled ? 'a' : 'span', className + (enabled ? '' : ' disabled'), label);
      if (enabled) link.href = pageUrl(target);
      else link.setAttribute('aria-disabled', 'true');
      controls.append(link);
    };
    addLink('上一页', number - 1, number > 1);
    const status = element('span', 'page-status', `第 ${number} / ${total} 页`);
    status.append(element('small', '', items.length ? `第 ${start + 1}–${Math.min(start + pageSize, items.length)} 条，共 ${items.length} 条` : '暂无符合条件的消息'));
    controls.append(status);
    addLink('下一页', number + 1, number < total);
    const pages = element('div', 'page-numbers');
    for (let n = 1; n <= total; n++) {
      const link = element('a', 'page-number', String(n));
      link.href = pageUrl(n);
      link.setAttribute('aria-label', `第 ${n} 页`);
      if (n === number) link.setAttribute('aria-current', 'page');
      pages.append(link);
    }
    controls.append(pages);
    const feed = element('ul', 'posts-feed');
    for (const item of items.slice(start, start + pageSize)) {
      const li = element('li', '');
      const card = element('article', 'post-entry');
      const title = element('div', 'hn-story');
      const h2 = element('h2', '');
      const link = element('a', '', item.title || '无标题');
      link.href = item.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      h2.append(link);
      title.append(h2);
      const meta = element('div', 'post-meta');
      meta.append(element('p', '', item.published || '发布时间未知'));
      const body = element('div', 'post-content content');
      body.append(element('div', 'link_preview_site_name', item.source || '来源未知'));
      body.append(element('p', 'selected-summary', item.summary || '点击标题查看原文'));
      body.append(element('p', 'selected-badge', `${item.tag || 'AI 精选'} · 相关度 ${Math.round(item.score * 100)}%`));
      card.append(title, meta, body);
      li.append(card);
      feed.append(li);
    }
    content.replaceChildren(controls, feed, controls.cloneNode(true));
    if (!items.length) feed.append(element('li', 'feed-empty', '暂无达到当前相关度的消息。全量消息仍可正常查看，后续评分结果会自动同步。'));
  }
  content.addEventListener('click', event => {
    const link = event.target.closest('.news-pagination a');
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    selectedUrl = link.pathname + link.search;
    history.pushState(null, '', selectedUrl);
    render();
    content.scrollIntoView({block: 'start'});
    content.querySelector('.page-status').setAttribute('tabindex', '-1');
    content.querySelector('.page-status').focus({preventScroll: true});
  });
  function switchView(nextSelected, push = true) {
    const changed = selected !== nextSelected;
    selected = nextSelected;
    fullPanel.hidden = selected;
    selectedPanel.hidden = !selected;
    fullPanel.classList.toggle('is-entering', changed && !selected);
    selectedPanel.classList.toggle('is-entering', changed && selected);
    document.body.classList.toggle('selected-feed', selected);
    tabs.forEach((tab, index) => {
      const active = (index === 1) === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    if (push) history.pushState(null, '', selected ? selectedUrl : fullUrl);
    if (selected) {
      if (loaded) render();
      load();
    }
  }
  tabs.forEach((tab, index) => tab.addEventListener('click', () => {
    if (selected !== (index === 1)) switchView(index === 1);
  }));
  navigation.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : selected ? 0 : 1;
    tabs[index].focus();
    if (selected !== (index === 1)) switchView(index === 1);
  });
  window.addEventListener('popstate', () => {
    const nextSelected = new URLSearchParams(location.search).get('view') === 'selected';
    if (nextSelected) selectedUrl = location.pathname + location.search;
    switchView(nextSelected, false);
  });
  async function load() {
    if (busy) return;
    busy = true;
    refresh.disabled = true;
    refresh.textContent = '同步中…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`/news-data/selected.json?t=${Date.now()}`, {cache: 'no-store', signal: controller.signal});
      if (!response.ok) throw new Error('feed unavailable');
      const data = await response.json();
      if (!Array.isArray(data.items)) throw new Error('invalid feed');
      const threshold = data.min_score;
      if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error('invalid threshold');
      const valid = [];
      for (const item of data.items) {
        if (!item || typeof item !== 'object') continue;
        let url;
        try { url = new URL(item.url); } catch { continue; }
        if (!['https:', 'http:'].includes(url.protocol) || !Number.isFinite(item.score) || item.score < threshold || item.score > 1) continue;
        valid.push({...item, url: url.href});
      }
      const updated = new Date(data.updated_at);
      if (!Number.isFinite(updated.getTime())) throw new Error('invalid update time');
      updatedAt = updated.getTime();
      const nextSignature = JSON.stringify([threshold, valid]);
      items = valid;
      if (!loaded || signature !== nextSignature) render();
      signature = nextSignature;
      loaded = true;
      note.textContent = `相关度 ≥ ${Number((threshold * 100).toFixed(2))}% · 每页 ${pageSize} 条 · 展示最近最多 200 条`;
      const stale = Date.now() - updatedAt > 15 * 60 * 1000;
      sync.classList.toggle('sync-warning', stale);
      sync.textContent = `${stale ? '数据超过 15 分钟未更新，请检查后台' : '已同步'} · 数据更新于 ${updated.toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai', hour12: false})}`;
    } catch {
      sync.classList.add('sync-warning');
      sync.textContent = loaded ? '同步失败，保留上次消息；30 秒后重试，也可点击立即同步。' : '精选暂时无法加载；30 秒后重试，也可点击立即同步。';
      if (!loaded) note.textContent = '仍可切换查看全量消息。';
    } finally {
      clearTimeout(timeout);
      busy = false;
      refresh.disabled = false;
      refresh.textContent = '立即同步';
    }
  }
  refresh.addEventListener('click', load);
  setInterval(() => { if (selected && !document.hidden) load(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (selected && !document.hidden) load(); });
  switchView(selected, false);
})();
