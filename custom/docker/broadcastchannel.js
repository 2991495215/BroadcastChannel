(() => {
  const avatar = document.querySelector('.site-header .channel-avatar');
  if (avatar) {
    avatar.src = '/news-logo.jpg';
    avatar.alt = '前沿消息 Logo';
  }
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
  const formatTime = value => {
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value || '')) return value;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString('sv-SE', {timeZone: 'Asia/Shanghai', hour12: false}) : '发布时间未知';
  };
  function messageCard(item) {
    const card = element('article', 'post-entry');
    const title = element('div', 'hn-story');
    const h2 = element('h2', '');
    const link = element('a', '', item.title || '无标题');
    link.href = item.url;
    if (item.external) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    h2.append(link);
    title.append(h2);
    const meta = element('div', 'post-meta');
    meta.append(element('p', '', formatTime(item.published)));
    const body = element('div', 'post-content content');
    body.append(element('div', 'link_preview_site_name', item.source || '来源未知'));
    body.append(element('p', 'selected-summary', item.summary || '暂无摘要，点击标题查看原文'));
    body.append(element('p', 'selected-badge', item.badge));
    card.append(title, meta, body);
    return card;
  }
  function paginationControls(number, description, previous, next, pages, latest, total, url) {
    const controls = element('nav', 'news-pagination');
    controls.setAttribute('aria-label', '消息分页');
    const addLink = (label, href, className = 'page-button') => {
      const link = element(href ? 'a' : 'span', className + (href ? '' : ' disabled'), label);
      if (href) link.href = href;
      else link.setAttribute('aria-disabled', 'true');
      return link;
    };
    const status = element('span', 'page-status', number ? `第 ${number} 页` : '历史消息');
    status.append(element('small', '', description));
    controls.append(addLink('上一页', previous), status, addLink('下一页', next));
    const numbers = element('div', 'page-numbers');
    for (const [n, href] of pages) {
      if (n === '…') { numbers.append(element('span', 'page-gap', n)); continue; }
      const link = addLink(String(n), href, 'page-number');
      link.setAttribute('aria-label', typeof n === 'number' ? `第 ${n} 页` : '历史消息');
      if (n === number || n === '历史') link.setAttribute('aria-current', 'page');
      numbers.append(link);
    }
    const tools = element('div', 'page-tools');
    tools.append(addLink('回到最新', latest, 'page-latest'));
    if (total) {
      const jump = element('select', 'page-jump');
      jump.setAttribute('aria-label', '跳转到页');
      for (let n = 1; n <= total; n++) {
        const option = element('option', '', `第 ${n} 页`);
        option.value = url(n);
        option.selected = n === number;
        jump.append(option);
      }
      jump.addEventListener('change', () => jump.dispatchEvent(new CustomEvent('feed-page', {bubbles: true, detail: jump.value})));
      tools.append(jump);
    }
    controls.append(numbers, tools);
    return controls;
  }
  navigation.replaceChildren();
  if (isFeed) {
    navigation.setAttribute('role', 'tablist');
    navigation.setAttribute('aria-label', '消息类型');
  }
  const tabs = [];
  let fullPageNumber = 1;
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
      params.delete('page');
      params.delete('view');
      const key = `broadcastchannel:page:${location.pathname}?${params}`;
      let saved;
      try { saved = sessionStorage.getItem(key); } catch {}
      const validPage = value => /^[1-9]\d{0,5}$/.test(value || '');
      const number = location.pathname === '/' ? 1 : Number(validPage(raw) ? raw : validPage(saved) ? saved : 1);
      fullPageNumber = number;
      try { sessionStorage.setItem(key, String(number)); } catch {}
      if (!selected && location.pathname !== '/' && !validPage(raw)) {
        const url = new URL(location.href);
        url.searchParams.set('page', number);
        history.replaceState(null, '', url.pathname + url.search);
      }
      const older = pagination.querySelector('a.older');
      const newer = pagination.querySelector('a.newer');
      const cursorUrl = (original, nextNumber) => {
        if (!original) return null;
        const url = new URL(original.href);
        if (nextNumber) url.searchParams.set('page', nextNumber);
        return url.pathname + url.search;
      };
      const previous = cursorUrl(newer, number && Math.max(1, number - 1));
      const next = cursorUrl(older, number && number + 1);
      const current = new URL(location.href);
      current.searchParams.delete('view');
      if (selected) current.searchParams.delete('page');
      if (location.pathname !== '/') current.searchParams.set('page', number);
      const pages = [];
      if (number > 1 && previous) pages.push([number - 1, previous]);
      pages.push([number, current.pathname + current.search]);
      if (number && next) pages.push([number + 1, next]);
      const controls = paginationControls(number, '本次浏览页序 · 总页数未知', previous, next, pages, '/');
      pagination.replaceWith(controls);
      document.querySelector('#main-content').prepend(controls.cloneNode(true));
    }
  }
  if (!isFeed) return;
  for (const input of document.querySelectorAll('.desktop-search input, .mobile-search input')) {
    input.placeholder = '搜索后台消息…';
    input.setAttribute('aria-label', '搜索后台全量与精选消息');
  }
  const main = document.querySelector('#main-content');
  const fullPanel = element('section', 'feed-panel');
  fullPanel.id = 'panel-full';
  fullPanel.append(...main.childNodes);
  for (const card of fullPanel.querySelectorAll('.post-entry')) {
    const body = card.querySelector('.post-content');
    const text = body?.innerText || '';
    const title = card.querySelector('.hn-story a');
    const source = body?.querySelector('.link_preview_site_name')?.textContent || text.match(/分组:\s*(.*?)(?=\s*(?:时间:|🕒)|\n|$)/)?.[1];
    const summary = body?.querySelector('.link_preview_description')?.textContent || text.split('\n').filter(line => !/链接:|分组:|时间:/.test(line) && line.trim() !== title?.textContent.trim()).join('\n').trim();
    if (!title) continue;
    card.replaceWith(messageCard({title: title.textContent, url: title.href, source, summary, published: text.match(/时间:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/)?.[1] || card.querySelector('time')?.dateTime, badge: '频道缓存 · 降级展示'}));
  }
  const selectedPanel = element('section', 'feed-panel');
  selectedPanel.id = 'panel-selected';
  const fullToolbar = element('section', 'feed-toolbar full-toolbar');
  const fullHeading = element('div', 'feed-heading');
  fullHeading.append(element('h2', '', '全量消息'), element('span', 'full-count', `本页 ${fullPanel.querySelectorAll('.post-entry').length} 条`));
  const fullRefresh = element('button', 'feed-refresh', '立即同步');
  fullRefresh.type = 'button';
  fullRefresh.addEventListener('click', () => loadFull());
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
  if (full.pathname !== '/') full.searchParams.set('page', fullPageNumber);
  let fullUrl = full.pathname + full.search;
  if (!selected) {
    original.searchParams.set('view', 'selected');
    original.searchParams.delete('page');
  }
  let selectedUrl = original.pathname + original.search;
  const toolbar = element('section', 'feed-toolbar');
  const heading = element('div', 'feed-heading');
  heading.append(element('h2', '', '精选消息'));
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
  const fullContent = element('div', 'full-results');
  const fullCount = fullHeading.querySelector('.full-count');
  const fullSync = fullToolbar.querySelector('.full-sync');
  fullSync.setAttribute('role', 'status');
  let fullItems = [], fullLoaded = false, fullBusy = false, fullSignature = '';
  let items = [], busy = false, loaded = false, signature = '', updatedAt = 0;
  let searchQuery = new URLSearchParams(location.search).get('q') || '';
  const searchItems = list => searchQuery.trim() ? list.filter(item =>
    [item.title, item.source, item.summary, item.tag].join(' ').toLocaleLowerCase().includes(searchQuery.trim().toLocaleLowerCase())) : list;
  for (const form of document.querySelectorAll('form[role="search"]')) {
    form.querySelector('input[name="q"]').value = searchQuery;
    form.addEventListener('submit', event => {
      event.preventDefault();
      searchQuery = form.querySelector('input[name="q"]').value;
      for (const input of document.querySelectorAll('input[name="q"]')) input.value = searchQuery;
      const url = new URL('/', location.origin);
      if (searchQuery.trim()) url.searchParams.set('q', searchQuery.trim());
      fullUrl = url.pathname + url.search;
      url.searchParams.set('view', 'selected');
      selectedUrl = url.pathname + url.search;
      history.pushState(null, '', selected ? selectedUrl : fullUrl);
      if (fullLoaded) renderFull();
      if (loaded) render();
    });
  }
  const currentPage = () => {
    const raw = new URL(selectedUrl, location.origin).searchParams.get('page');
    return /^[1-9]\d{0,5}$/.test(raw || '') ? Number(raw) : 1;
  };
  function pageUrl(number) {
    const url = new URL(selectedUrl, location.origin);
    url.searchParams.set('page', number);
    if (searchQuery.trim()) url.searchParams.set('q', searchQuery.trim());
    else url.searchParams.delete('q');
    return url.pathname + url.search;
  }
  function render() {
    const filtered = searchItems(items);
    const total = Math.max(1, Math.ceil(filtered.length / pageSize));
    const number = Math.min(currentPage(), total);
    if (number !== currentPage()) {
      selectedUrl = pageUrl(number);
      if (selected) history.replaceState(null, '', selectedUrl);
    }
    renderItems(filtered, number, pageUrl, content, count, true);
  }
  function renderItems(list, number, url, target, counter, curated) {
    const total = Math.max(1, Math.ceil(list.length / pageSize));
    const start = (number - 1) * pageSize;
    counter.textContent = `${list.length} 条 · ${total} 页`;
    const description = list.length ? `共 ${total} 页 · 第 ${start + 1}–${Math.min(start + pageSize, list.length)} 条 / ${list.length} 条` : '暂无符合条件的消息';
    const windowStart = Math.max(1, Math.min(number - 2, total - 4));
    const visible = Array.from({length: total}, (_, i) => i + 1).filter(n => total <= 9 || n === 1 || n === total || (n >= windowStart && n < windowStart + 5));
    const pages = [];
    for (const n of visible) {
      if (pages.length && n > pages.at(-1)[0] + 1) pages.push(['…', null]);
      pages.push([n, url(n)]);
    }
    const controls = paginationControls(number, description, number > 1 ? url(number - 1) : null, number < total ? url(number + 1) : null, pages, url(1), total, url);
    controls.classList.add('selected-pagination');
    const feed = element('ul', 'posts-feed');
    for (const item of list.slice(start, start + pageSize)) {
      const li = element('li', '');
      li.append(messageCard({...item, external: /^https?:/i.test(item.url), badge: curated ? `${item.tag || 'AI 精选'} · 相关度 ${Math.round(item.score * 100)}%` : (item.origin === 'channel-history' ? '历史保留 · 未评分' : '后台全量 · 未按相关度筛选')}));
      feed.append(li);
    }
    // Cloning loses the native selector listener; build the second pager too.
    target.replaceChildren(controls, feed, paginationControls(number, description, number > 1 ? url(number - 1) : null, number < total ? url(number + 1) : null, pages, url(1), total, url));
    if (!list.length) feed.append(element('li', 'feed-empty', '暂无符合条件的消息。'));
    feed.classList.add('is-entering');
  }
  const fullPageUrl = n => {
    const url = new URL('/', location.origin);
    if (n > 1) url.searchParams.set('page', n);
    if (searchQuery.trim()) url.searchParams.set('q', searchQuery.trim());
    return url.pathname + url.search;
  };
  function renderFull() {
    const filtered = searchItems(fullItems);
    const raw = new URL(fullUrl, location.origin).searchParams.get('page');
    const number = Math.min(/^[1-9]\d{0,5}$/.test(raw || '') ? Number(raw) : 1, Math.max(1, Math.ceil(filtered.length / pageSize)));
    fullUrl = fullPageUrl(number);
    if (!selected) history.replaceState(null, '', fullUrl);
    renderItems(filtered, number, fullPageUrl, fullContent, fullCount, false);
  }
  function navigatePage(target, href) {
    if (target === content) selectedUrl = href;
    else fullUrl = href;
    history.pushState(null, '', href);
    if (target === content) render(); else renderFull();
    target.querySelector('.page-status').setAttribute('tabindex', '-1');
    target.querySelector('.page-status').focus({preventScroll: true});
  }
  for (const target of [content, fullContent]) {
    target.addEventListener('feed-page', event => navigatePage(target, event.detail));
    target.addEventListener('click', event => {
    const link = event.target.closest('.news-pagination a');
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
      navigatePage(target, link.pathname + link.search);
    });
  }
  async function loadFull() {
    if (fullBusy) return;
    fullBusy = true;
    fullRefresh.disabled = true;
    fullRefresh.textContent = '同步中…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`/news-data/all.json?t=${Date.now()}`, {cache: 'no-store', signal: controller.signal});
      if (!response.ok) throw new Error('archive unavailable');
      const data = await response.json();
      if (data.complete !== true || !Array.isArray(data.items) || !Number.isFinite(new Date(data.updated_at).getTime())) throw new Error('invalid archive');
      const valid = data.items.filter(item => {
        if (!item || typeof item.title !== 'string') return false;
        if (/^\/posts\/[1-9]\d*$/.test(item.url)) return true;
        try { return ['http:', 'https:'].includes(new URL(item.url).protocol); } catch { return false; }
      });
      if (valid.length !== data.items.length) throw new Error('invalid public message');
      const nextSignature = JSON.stringify(valid);
      if (!fullLoaded) {
        if (location.pathname.startsWith('/before/')) {
          const first = fullPanel.querySelector('.hn-story a');
          const index = first ? valid.findIndex(item => (item.channel_url || item.url) === new URL(first.href).pathname) : -1;
          fullUrl = fullPageUrl(index < 0 ? 1 : Math.floor(index / pageSize) + 1);
        }
        for (const child of [...fullPanel.children]) if (child !== fullToolbar) child.remove();
        fullPanel.append(fullContent);
      }
      fullItems = valid;
      if (!fullLoaded || fullSignature !== nextSignature) renderFull();
      fullSignature = nextSignature;
      fullLoaded = true;
      fullToolbar.querySelector('.full-note').textContent = '后台 RSS · 不按相关度筛选 · 每页 20 条';
      fullDetails.querySelector('.feed-hint').textContent = '全量与精选共用后台消息 · 每 30 秒检查更新 · 后台约每 5 分钟抓取 · 已保留频道历史';
      const stale = Date.now() - new Date(data.updated_at).getTime() > 15 * 60 * 1000;
      fullSync.classList.toggle('sync-warning', stale);
      fullSync.textContent = `${stale ? '后台数据超过 15 分钟未更新，请检查后台' : '已同步'} · 数据更新于 ${formatTime(data.updated_at)}`;
    } catch {
      fullSync.classList.add('sync-warning');
      fullSync.textContent = fullLoaded ? '同步失败，保留上次消息；30 秒后重试。' : '历史索引暂时不可用，当前保留频道原始分页；30 秒后重试。';
    } finally {
      clearTimeout(timeout);
      fullBusy = false;
      fullRefresh.disabled = false;
      fullRefresh.textContent = '立即同步';
    }
  }
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
    } else if (fullLoaded) renderFull();
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
    searchQuery = new URLSearchParams(location.search).get('q') || '';
    for (const input of document.querySelectorAll('input[name="q"]')) input.value = searchQuery;
    const nextSelected = new URLSearchParams(location.search).get('view') === 'selected';
    if (nextSelected) selectedUrl = location.pathname + location.search;
    else if (fullLoaded) fullUrl = location.pathname + location.search;
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
      const response = await fetch(`/news-data/all.json?view=selected&t=${Date.now()}`, {cache: 'no-store', signal: controller.signal});
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
      note.textContent = `相关度 ≥ ${Number((threshold * 100).toFixed(2))}% · 每页 ${pageSize} 条 · 从全量消息按相关度筛选`;
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
  setInterval(() => { if (!document.hidden) { if (selected) load(); else loadFull(); } }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (selected) load(); else loadFull(); } });
  switchView(selected, false);
  loadFull();
})();
