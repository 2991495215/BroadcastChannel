(() => {
  const key = 'qianyan-theme';
  const labels = {system: '跟随系统', light: '白天', dark: '黑夜'};
  const next = {system: 'light', light: 'dark', dark: 'system'};
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system';
  const read = () => {
    try { return localStorage.getItem(key); } catch { return null; }
  };
  const apply = () => {
    const root = document.documentElement;
    root.dataset.themeMode = preference;
    root.dataset.theme = preference === 'system' ? (system.matches ? 'dark' : 'light') : preference;
    root.style.colorScheme = root.dataset.theme;
    const button = document.querySelector('.theme-toggle');
    if (button) {
      button.setAttribute('aria-label', `切换主题，当前：${labels[preference]}`);
      button.title = `${labels[preference]}；点击切换到${labels[next[preference]]}`;
    }
  };
  const sync = () => {
    const saved = read();
    preference = saved === 'light' || saved === 'dark' ? saved : 'system';
    apply();
  };
  // Apply before styles load so a saved dark theme does not flash white.
  sync();
  system.addEventListener('change', apply);
  window.addEventListener('storage', event => { if (event.key === key || event.key === null) sync(); });
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.querySelector('.theme-toggle').addEventListener('click', () => {
      preference = next[preference];
      try {
        if (preference === 'system') localStorage.removeItem(key);
        else localStorage.setItem(key, preference);
      } catch { /* Keep this tab usable when browser storage is unavailable. */ }
      apply();
    });
  });
})();
