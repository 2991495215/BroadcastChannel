const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/theme.js`, 'utf8');
function setup(saved, dark = false, blocked = false) {
  const root = {dataset: {}, style: {}};
  const handlers = {};
  const button = {setAttribute(name, value) { this[name] = value; }, addEventListener(name, fn) { this[name] = fn; }};
  const system = {matches: dark, addEventListener(name, fn) { this[name] = fn; }};
  const storage = new Map(saved ? [['qianyan-theme', saved]] : []);
  vm.runInNewContext(source, {
    window: {matchMedia: () => system, addEventListener(name, fn) { handlers[name] = fn; }},
    document: {documentElement: root, querySelector: () => button, addEventListener(name, fn) { handlers[name] = fn; }},
    localStorage: {
      getItem(key) { if (blocked) throw Error('blocked'); return storage.get(key); },
      setItem(key, value) { if (blocked) throw Error('blocked'); storage.set(key, value); },
      removeItem(key) { if (blocked) throw Error('blocked'); storage.delete(key); }
    }
  });
  handlers.DOMContentLoaded();
  return {root, button, system, storage, handlers};
}
const app = setup();
assert.equal(app.root.dataset.themeMode, 'system');
assert.equal(app.root.dataset.theme, 'light');
app.system.matches = true; app.system.change();
assert.equal(app.root.dataset.theme, 'dark');
app.button.click();
assert.equal(app.root.dataset.theme, 'light');
assert.equal(app.storage.get('qianyan-theme'), 'light');
app.system.change();
assert.equal(app.root.dataset.theme, 'light');
app.button.click();
assert.equal(app.root.dataset.theme, 'dark');
assert.equal(setup(app.storage.get('qianyan-theme')).root.dataset.theme, 'dark');
app.button.click();
assert.equal(app.root.dataset.themeMode, 'system');
assert.equal(app.storage.has('qianyan-theme'), false);
app.storage.set('qianyan-theme', 'light'); app.handlers.storage({key: 'qianyan-theme'});
assert.equal(app.root.dataset.theme, 'light');
assert.equal(setup('invalid').root.dataset.themeMode, 'system');
const restricted = setup(null, false, true);
restricted.button.click(); restricted.button.click();
assert.equal(restricted.root.dataset.theme, 'dark');
assert.match(restricted.button['aria-label'], /黑夜/);
console.log('PASS: three modes, system changes, reload, storage sync, invalid/blocked storage');
