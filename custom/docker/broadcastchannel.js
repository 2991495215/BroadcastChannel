(() => {
  const navigation = document.querySelector('.site-navigation ul');
  if (!navigation) return;
  const selected = new URLSearchParams(location.search).get('view') === 'selected';
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  navigation.replaceChildren();
  for (const [label, href, active] of [
    ['全量消息', '/', !selected],
    ['精选消息', '/?view=selected', selected],
  ]) {
    const li = element('li', '');
    const link = element('a', 'feed-tab', label);
    link.href = href;
    if (active) link.setAttribute('aria-current', 'page');
    li.append(link);
    navigation.append(li);
  }
  if (!selected && document.body.classList.contains('feed')) {
    const pagination = document.querySelector('.pagination');
    if (pagination) {
      // ponytail: Telegram uses cursors, not stable numbered pages; count this browsing sequence only.
      const params = new URLSearchParams(location.search);
      const raw = params.get('page');
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
      controls.append(latest);
      pagination.replaceWith(controls);
      document.querySelector('#main-content').prepend(controls.cloneNode(true));
    }
  }
  if (!selected || !document.body.classList.contains('feed')) return;
  document.body.classList.add('selected-feed');
  const main = document.querySelector('#main-content');
  const note = element('p', 'feed-note', '正在读取 AI 精选消息…');
  note.setAttribute('role', 'status');
  main.replaceChildren(note);
  async function load() {
    try {
      const response = await fetch('/news-data/selected.json', {cache: 'no-store'});
      if (!response.ok) throw new Error('feed unavailable');
      const data = await response.json();
      if (!Array.isArray(data.items)) throw new Error('invalid feed');
      const threshold = data.min_score;
      if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error('invalid threshold');
      const feed = element('ul', 'posts-feed');
      for (const item of data.items) {
        let url;
        try { url = new URL(item.url); } catch { continue; }
        if (!['https:', 'http:'].includes(url.protocol) || !Number.isFinite(item.score) || item.score < threshold) continue;
        const li = element('li', '');
        const card = element('article', 'post-entry');
        const heading = element('div', 'hn-story');
        const h2 = element('h2', '');
        const link = element('a', '', item.title || '无标题');
        link.href = url.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        h2.append(link);
        heading.append(h2);
        const meta = element('div', 'post-meta');
        meta.append(element('p', '', item.published || '发布时间未知'));
        const content = element('div', 'post-content content');
        content.append(element('div', 'link_preview_site_name', item.source));
        content.append(element('p', 'selected-summary', item.summary || '点击标题查看原文'));
        const badge = element('p', 'selected-badge', `${item.tag || 'AI 精选'} · 相关度 ${Math.round(item.score * 100)}%`);
        content.append(badge);
        card.append(heading, meta, content);
        li.append(card);
        feed.append(li);
      }
      const updated = new Date(data.updated_at);
      const stamp = Number.isNaN(updated.getTime()) ? '' : ` · 更新于 ${updated.toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai', hour12: false})}`;
      note.textContent = `AI 精选 · 相关度 ≥ ${Number((threshold * 100).toFixed(2))}% · 最近 ${feed.children.length} 条（最多 200 条）${stamp}`;
      main.append(feed);
      if (!feed.children.length) main.append(element('p', 'feed-empty', '暂无符合筛选条件的消息，评分完成后自动更新。'));
    } catch {
      note.textContent = '精选消息暂时无法加载，请稍后刷新；仍可切换查看全量消息。';
    }
  }
  load();
})();
