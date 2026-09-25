import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../reader/index.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
const tick = () => new Promise(resolve => setImmediate(resolve));
const response = (body, status = 200) => ({ok: status === 200, status, text: async () => typeof body === 'string' ? body : JSON.stringify(body)});
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
};

// Minimal DOM adapter keeps these navigation tests runnable with Node alone.
// Browser geometry, native details behavior and focus order need a browser check.
function createReader({url = 'https://reader.test/', width = 1200, fetchOverride, storage = new Map()} = {}) {
  const elements = new Map();
  const calls = [];
  const pageEvents = new Map();
  const documentEvents = new Map();
  class Element {
    constructor(tag = 'div') {
      this.tag = tag;
      this.dataset = {};
      this.style = {};
      this.attributes = new Map();
      this.children = [];
      this.events = new Map();
      const classes = new Set();
      this.classList = {
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        contains: name => classes.has(name),
        toggle: (name, force = !classes.has(name)) => { force ? classes.add(name) : classes.delete(name); return force; },
      };
    }
    set id(id) { this._id = id; elements.set(id, this); }
    get id() { return this._id; }
    set innerHTML(value) { this._html = value; this.children = []; }
    get innerHTML() { return this._html; }
    appendChild(child) { child.parent = this; this.children.push(child); return child; }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    removeAttribute(name) { this.attributes.delete(name); }
    getAttribute(name) { return this.attributes.get(name); }
    addEventListener(name, handler) { this.events.set(name, handler); }
    click() { return this.events.get('click')?.({target: this}); }
    focus() { document.activeElement = this; }
    contains(element) { return this === element || this.children.some(child => child.contains(element)); }
    closest(selector) {
      const names = selector.split(',').map(name => name.trim());
      if (names.includes(this.tag)) return this;
      return this.parent?.closest(selector) ?? null;
    }
  }
  for (const match of html.matchAll(/<([a-z]+)[^>]*\bid="([^"]+)"/g)) {
    const element = new Element(match[1]);
    element.id = match[2];
  }
  new Element('nav').appendChild(elements.get('prevSceneBtn'));
  const mangaLink = new Element('a');
  mangaLink.id = 'mangaLink';
  const document = {
    getElementById: id => elements.get(id) ?? null,
    createElement: tag => new Element(tag),
    addEventListener: (name, handler) => documentEvents.set(name, handler),
  };
  const location = {href: url};
  const entries = [url];
  let historyIndex = 0;
  const history = {
    pushState(_state, _title, next) { location.href = String(next); entries.splice(++historyIndex, Infinity, location.href); },
    replaceState(_state, _title, next) { location.href = entries[historyIndex] = String(next); },
    back() {
      if (historyIndex > 0) { location.href = entries[--historyIndex]; pageEvents.get('popstate')?.(); }
    },
    forward() {
      if (historyIndex + 1 < entries.length) { location.href = entries[++historyIndex]; pageEvents.get('popstate')?.(); }
    },
  };
  const library = {defaultWorkId: 'alpha', works: ['alpha', 'beta'].map(id => ({id, title: id, basePath: `works/${id}`}))};
  const manifest = {
    episodes: [{id: 'ep1', title: '第一話', scene_ids: ['one', 'two', 'three']}],
    scenes: ['one', 'two', 'three'].map(id => ({id, title: id, episodeId: 'ep1', path: `${id}.md`})),
  };
  const fetch = async url => {
    calls.push(url);
    const override = fetchOverride?.(url, calls);
    if (override !== undefined) return override;
    if (url === 'data/library-index.json') return response(library);
    if (url.endsWith('/reader-index.json')) return response(manifest);
    return response(`# ${url.split('/').at(-1)}\n\n本文 ${url}`);
  };
  const context = vm.createContext({
    document, URL, fetch, console: {error() {}},
    window: {location, history, innerWidth: width, addEventListener: (name, handler) => pageEvents.set(name, handler)},
    localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)},
  });
  vm.runInContext(script, context);
  return {
    elements, calls, location, history, entries, storage,
    run: code => vm.runInContext(code, context),
    key: (key, target = elements.get('readerContainer')) => {
      const event = {key, target, preventDefault() { this.defaultPrevented = true; }};
      documentEvents.get('keydown')(event);
      return event;
    },
  };
}

test('latest scene wins when earlier responses arrive late, and back reuses cached text', async () => {
  const slow = deferred();
  const reader = createReader({fetchOverride: url => url.endsWith('/two.md') ? slow.promise : undefined});
  await tick();
  assert.match(reader.elements.get('novelContent').innerHTML, /one.md/);
  reader.elements.get('nextSceneBtn').click();
  reader.elements.get('nextSceneBtn').click();
  await tick();
  assert.match(reader.elements.get('novelContent').innerHTML, /three.md/);
  slow.resolve(response('# second\n\nEarlier response'));
  await tick();
  assert.match(reader.elements.get('novelContent').innerHTML, /three.md/);
  assert.equal(reader.elements.get('currentSceneTitle').textContent, 'three.md');
  assert.equal(new URL(reader.location.href).searchParams.get('scene'), 'three');
  reader.history.back();
  await tick();
  assert.match(reader.elements.get('novelContent').innerHTML, /Earlier response/);
  assert.equal(reader.calls.filter(url => url.endsWith('/two.md')).length, 1);
  reader.history.forward();
  await tick();
  assert.match(reader.elements.get('novelContent').innerHTML, /three.md/);
  assert.equal(reader.entries.length, 3);
});

test('work changes invalidate previous requests and clear the previous work scene route', async () => {
  const slow = deferred();
  const reader = createReader({url: 'https://reader.test/?work=alpha&scene=three', fetchOverride: url => url === '/works/alpha/data/three.md' ? slow.promise : undefined});
  await tick();
  await reader.run("selectWork('beta')");
  assert.match(reader.elements.get('novelContent').innerHTML, /beta\/data\/one.md/);
  slow.resolve(response('# stale\n\nStale work'));
  await tick();
  assert.match(reader.elements.get('novelContent').innerHTML, /beta\/data\/one.md/);
  assert.equal(new URL(reader.location.href).searchParams.get('scene'), 'one');
});

test('scene failures can retry without poisoning the cache or adding history entries', async () => {
  let failed = false;
  const reader = createReader({fetchOverride: url => {
    if (url.endsWith('/two.md') && !failed) { failed = true; return response('unavailable', 503); }
  }});
  await tick();
  reader.elements.get('nextSceneBtn').click();
  await tick();
  const content = reader.elements.get('novelContent');
  assert.equal(content.children.at(-1).textContent, '再読み込み');
  assert.equal(content.getAttribute('aria-busy'), 'false');
  content.children.at(-1).click();
  await tick();
  assert.match(content.innerHTML, /two.md/);
  assert.equal(reader.calls.filter(url => url.endsWith('/two.md')).length, 2);
  assert.equal(reader.entries.length, 2);
});

test('library and manifest failures recover without a full reload', async () => {
  for (const failedPath of ['data/library-index.json', '/works/alpha/data/reader-index.json']) {
    let failed = false;
    const reader = createReader({fetchOverride: url => {
      if (url === failedPath && !failed) { failed = true; return response('unavailable', 503); }
    }});
    await tick();
    reader.elements.get('novelContent').children.at(-1).click();
    await tick();
    assert.match(reader.elements.get('novelContent').innerHTML, /one.md/);
    assert.equal(reader.elements.get('novelContent').getAttribute('aria-busy'), 'false');
  }
});

test('episode links resolve to stable scene URLs and navigation preserves unrelated query parameters', async () => {
  const reader = createReader({url: 'https://reader.test/?work=alpha&episode=ep1&preview=fixture'});
  await tick();
  let url = new URL(reader.location.href);
  assert.equal(url.searchParams.get('scene'), 'one');
  assert.equal(url.searchParams.has('episode'), false);
  assert.equal(url.searchParams.get('preview'), 'fixture');
  assert.equal(reader.entries.length, 1);
  reader.key('ArrowRight');
  await tick();
  url = new URL(reader.location.href);
  assert.equal(url.searchParams.get('scene'), 'two');
  reader.key('ArrowRight', reader.elements.get('workSelect'));
  await tick();
  assert.equal(new URL(reader.location.href).searchParams.get('scene'), 'two');
  assert.equal(reader.elements.get('nav-scene-two').getAttribute('aria-current'), 'page');
  assert.equal(reader.elements.get('nav-scene-one').getAttribute('aria-current'), undefined);
  assert.equal(reader.elements.get('nav-scene-two').closest('details').open, true);
});

test('sidebar works on desktop and mobile, and reading preferences survive reload', async () => {
  const reader = createReader({width: 390});
  await tick();
  const sidebar = reader.elements.get('sidebar');
  assert.equal(sidebar.inert, true);
  reader.elements.get('toggleSidebarBtn').click();
  assert.equal(sidebar.inert, false);
  reader.elements.get('nav-scene-two').click();
  assert.equal(sidebar.inert, true);
  reader.elements.get('toggleReadingControlsBtn').click();
  assert.equal(reader.elements.get('toggleReadingControlsBtn').getAttribute('aria-expanded'), 'true');
  reader.elements.get('toggleFontBtn').click();
  reader.elements.get('fontSizeUp').click();
  reader.elements.get('themeToggleBtn').click();
  reader.key('Escape');
  assert.equal(reader.elements.get('toggleReadingControlsBtn').getAttribute('aria-expanded'), 'false');
  const reloaded = createReader({storage: reader.storage});
  await tick();
  assert.equal(reloaded.elements.get('appBody').dataset.theme, 'dark');
  assert.equal(reloaded.elements.get('novelContent').style.fontSize, '18px');
  assert.equal(reloaded.elements.get('toggleFontBtn').textContent, 'ゴシック');
  reloaded.elements.get('toggleSidebarBtn').click();
  assert.equal(reloaded.elements.get('sidebar').inert, true);
});

test('empty catalogs end the loading state and empty works replace stale scene URLs', async () => {
  const empty = createReader({fetchOverride: url => url === 'data/library-index.json' ? response({works: []}) : undefined});
  await tick();
  assert.equal(empty.elements.get('novelContent').getAttribute('aria-busy'), 'false');
  assert.equal(empty.elements.get('nextSceneBtn').disabled, true);
  const reader = createReader({fetchOverride: url => url === '/works/beta/data/reader-index.json' ? response({episodes: [], scenes: []}) : undefined});
  await tick();
  await reader.run("selectWork('beta')");
  const url = new URL(reader.location.href);
  assert.equal(url.searchParams.get('work'), 'beta');
  assert.equal(url.searchParams.has('scene'), false);
  assert.equal(reader.elements.get('novelContent').getAttribute('aria-busy'), 'false');
  assert.equal(reader.elements.get('currentSceneTitle').textContent, '');
});

test('unavailable browser storage does not prevent reading or changing settings', async () => {
  const reader = createReader({storage: {get() { throw new Error('blocked'); }, set() { throw new Error('blocked'); }}});
  await tick();
  reader.elements.get('themeToggleBtn').click();
  reader.elements.get('fontSizeDown').click();
  assert.equal(reader.elements.get('appBody').dataset.theme, 'dark');
  assert.equal(reader.elements.get('fontSizeDown').disabled, true);
  assert.match(reader.elements.get('novelContent').innerHTML, /one.md/);
});
