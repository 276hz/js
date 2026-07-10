"use strict";

((global) => {
  const APP_NAMESPACE = '__COOKIE_COMMANDER_ULTRA__';
  if (global[APP_NAMESPACE]) {
    global[APP_NAMESPACE].destroy();
  }

  // ──────────────────────────────────────────────
  // UTILITIES
  // ──────────────────────────────────────────────
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const el = (tag, attrs = {}, ...children) => {
    const elem = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'style' && typeof v === 'object') Object.assign(elem.style, v);
      else if (k.startsWith('on')) elem.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'className') elem.className = v;
      else if (k === 'dataset') Object.entries(v).forEach(([dk, dv]) => elem.dataset[dk] = dv);
      else elem.setAttribute(k, v);
    });
    children.forEach(c => {
      if (typeof c === 'string') elem.appendChild(document.createTextNode(c));
      else if (c instanceof Node) elem.appendChild(c);
      else if (c) elem.appendChild(document.createTextNode(String(c)));
    });
    return elem;
  };

  const debounce = (fn, ms) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; };
  const throttle = (fn, ms) => { let last = 0; return (...args) => { const now = Date.now(); if (now - last >= ms) { last = now; fn(...args); } }; };

  const uid = () => Math.random().toString(36).slice(2, 11);

  // ──────────────────────────────────────────────
  // THEME MANAGER
  // ──────────────────────────────────────────────
  class ThemeManager {
    constructor() {
      this.theme = 'system';
      this.styles = {};
      this.styleTag = null;
    }
    init() {
      this.styleTag = el('style', { id: 'ccu-theme-vars' });
      document.head.appendChild(this.styleTag);
      this.apply();
      this.listenSystem();
    }
    get systemPreference() {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    get activeTheme() {
      return this.theme === 'system' ? this.systemPreference : this.theme;
    }
    setTheme(name) {
      this.theme = name;
      this.apply();
    }
    apply() {
      const t = this.activeTheme;
      const vars = {
        light: {
          '--ccu-bg': '#ffffffdd',
          '--ccu-bg-secondary': '#f5f5f7ee',
          '--ccu-surface': '#ffffff',
          '--ccu-text': '#1d1d1f',
          '--ccu-text-secondary': '#86868b',
          '--ccu-border': '#e5e5ea',
          '--ccu-accent': '#0071e3',
          '--ccu-accent-hover': '#0077ed',
          '--ccu-danger': '#ff3b30',
          '--ccu-success': '#34c759',
          '--ccu-warning': '#ff9500',
          '--ccu-shadow': '0 8px 32px rgba(0,0,0,0.08)',
          '--ccu-radius': '14px',
          '--ccu-blur': 'blur(24px)',
          '--ccu-font': '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
          '--ccu-glass-bg': 'rgba(255,255,255,0.72)',
          '--ccu-glass-border': 'rgba(255,255,255,0.5)',
        },
        dark: {
          '--ccu-bg': '#1c1c1edd',
          '--ccu-bg-secondary': '#2c2c2eee',
          '--ccu-surface': '#2c2c2e',
          '--ccu-text': '#f5f5f7',
          '--ccu-text-secondary': '#98989d',
          '--ccu-border': '#3a3a3c',
          '--ccu-accent': '#0a84ff',
          '--ccu-accent-hover': '#409cff',
          '--ccu-danger': '#ff453a',
          '--ccu-success': '#30d158',
          '--ccu-warning': '#ff9f0a',
          '--ccu-shadow': '0 8px 32px rgba(0,0,0,0.4)',
          '--ccu-radius': '14px',
          '--ccu-blur': 'blur(24px)',
          '--ccu-font': '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
          '--ccu-glass-bg': 'rgba(28,28,30,0.72)',
          '--ccu-glass-border': 'rgba(255,255,255,0.08)',
        }
      };
      const css = `:root {${Object.entries(vars[t] || vars.dark).map(([k,v]) => `${k}:${v};`).join('')}}`;
      this.styleTag.textContent = css;
      document.documentElement.setAttribute('data-ccu-theme', t);
    }
    listenSystem() {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (this.theme === 'system') this.apply();
      });
    }
  }

  // ──────────────────────────────────────────────
  // LOGGER & TOAST
  // ──────────────────────────────────────────────
  class Logger {
    constructor() { this.logs = []; this.listeners = []; }
    add(level, message, details) {
      const entry = { id: uid(), time: new Date(), level, message, details };
      this.logs.unshift(entry);
      if (this.logs.length > 500) this.logs.length = 500;
      this.listeners.forEach(fn => fn(entry));
    }
    info(m,d) { this.add('info',m,d); }
    warn(m,d) { this.add('warn',m,d); }
    error(m,d) { this.add('error',m,d); }
    success(m,d) { this.add('success',m,d); }
    debug(m,d) { this.add('debug',m,d); }
    onLog(fn) { this.listeners.push(fn); }
  }

  class ToastManager {
    constructor() { this.container = null; this.queue = []; }
    init() {
      this.container = el('div', { className: 'ccu-toast-container' });
      document.body.appendChild(this.container);
    }
    show(message, type = 'info', duration = 3000) {
      const toast = el('div', { className: `ccu-toast ccu-toast-${type}` }, message);
      this.container.appendChild(toast);
      requestAnimationFrame(() => toast.classList.add('ccu-toast-in'));
      setTimeout(() => {
        toast.classList.remove('ccu-toast-in');
        toast.addEventListener('transitionend', () => toast.remove());
      }, duration);
    }
  }

  // ──────────────────────────────────────────────
  // COOKIE PARSER
  // ──────────────────────────────────────────────
  class CookieParser {
    static parseCookieHeader(txt) {
      const result = [];
      txt.split(/[\n\r]+/).forEach(line => {
        line = line.trim();
        if (!line || line.startsWith('#')) return;
        const parts = line.split(';').map(p => p.trim());
        const cookie = {};
        parts.forEach((part, idx) => {
          const eqIdx = part.indexOf('=');
          if (eqIdx === -1) return;
          const key = part.slice(0, eqIdx).trim().toLowerCase();
          const val = part.slice(eqIdx+1).trim();
          if (idx === 0) { cookie.name = key; cookie.value = val; }
          else {
            if (key === 'expires') cookie.expires = val;
            else if (key === 'max-age') cookie.maxAge = val;
            else if (key === 'domain') cookie.domain = val;
            else if (key === 'path') cookie.path = val;
            else if (key === 'secure') cookie.secure = true;
            else if (key === 'httponly') cookie.httpOnly = true;
            else if (key === 'samesite') cookie.sameSite = val;
          }
        });
        if (cookie.name) result.push(cookie);
      });
      return result;
    }

    static parseNetscape(txt) {
      const result = [];
      txt.split(/[\n\r]+/).forEach(line => {
        line = line.trim();
        if (!line || line.startsWith('#')) return;
        const parts = line.split('\t');
        if (parts.length < 7) return;
        result.push({
          domain: parts[0],
          hostOnly: parts[1] === 'TRUE',
          path: parts[2],
          secure: parts[3] === 'TRUE',
          expires: parseInt(parts[4]) ? new Date(parseInt(parts[4]) * 1000).toISOString() : null,
          name: parts[5],
          value: parts[6]
        });
      });
      return result;
    }

    static parseJSON(txt) {
      try {
        const data = JSON.parse(txt);
        if (Array.isArray(data)) return data.map(CookieParser.normalizeCookie);
        if (Array.isArray(data.cookies)) return data.cookies.map(CookieParser.normalizeCookie);
        return [];
      } catch { return []; }
    }

    static parseCSV(txt) {
      const lines = txt.split(/[\n\r]+/).filter(l => l.trim());
      if (lines.length < 2) return [];
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      return lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim());
        const obj = {};
        headers.forEach((h,i) => { obj[h] = vals[i]; });
        return CookieParser.normalizeCookie(obj);
      });
    }

    static parseHAR(txt) {
      try {
        const har = JSON.parse(txt);
        const cookies = [];
        har.log?.entries?.forEach(entry => {
          entry.request?.cookies?.forEach(c => cookies.push(CookieParser.normalizeCookie(c)));
          entry.response?.cookies?.forEach(c => cookies.push(CookieParser.normalizeCookie(c)));
        });
        return cookies;
      } catch { return []; }
    }

    static normalizeCookie(raw) {
      return {
        name: raw.name || raw.key || '',
        value: raw.value || '',
        domain: raw.domain || '',
        path: raw.path || '/',
        secure: raw.secure === true || raw.secure === 'true' || raw.secure === 'TRUE',
        httpOnly: raw.httpOnly === true || raw.httpOnly === 'true' || raw.httpOnly === 'TRUE',
        sameSite: raw.sameSite || raw.samesite || 'Lax',
        expires: raw.expires || raw['expiration date'] || null,
        maxAge: raw.maxAge || raw['max-age'] || null,
        hostOnly: raw.hostOnly === true || raw.hostOnly === 'true',
        partitioned: raw.partitioned === true || raw.partitioned === 'true',
        priority: raw.priority || 'Medium',
        size: raw.size || (raw.name?.length || 0) + (raw.value?.length || 0),
      };
    }

    static autoDetectAndParse(input) {
      const txt = input.trim();
      if (txt.startsWith('[') || txt.startsWith('{')) {
        try { JSON.parse(txt); return { format: 'JSON', cookies: CookieParser.parseJSON(txt) }; } catch {}
      }
      if (txt.includes('\t') && txt.split('\t').length >= 7) return { format: 'Netscape', cookies: CookieParser.parseNetscape(txt) };
      if (txt.includes('"log"') && txt.includes('"entries"')) return { format: 'HAR', cookies: CookieParser.parseHAR(txt) };
      if (txt.includes(',') && txt.includes('\n')) return { format: 'CSV', cookies: CookieParser.parseCSV(txt) };
      if (txt.includes(';') || txt.includes('=')) return { format: 'CookieHeader', cookies: CookieParser.parseCookieHeader(txt) };
      return { format: 'Unknown', cookies: [] };
    }
  }

  // ──────────────────────────────────────────────
  // COOKIE MANAGER
  // ──────────────────────────────────────────────
  class CookieManager {
    async getAll() {
      try {
        const cookies = await (typeof browser !== 'undefined' && browser.cookies ? browser.cookies.getAll({}) : 
                              chrome?.cookies?.getAll({}) || Promise.resolve([]));
        return (cookies || []).map(c => ({
          ...c,
          id: uid(),
          size: (c.name?.length || 0) + (c.value?.length || 0),
          tags: [],
          notes: '',
          color: null,
          favorite: false,
          pinned: false,
        }));
      } catch { return []; }
    }

    async set(cookie) {
      try {
        const details = {
          url: `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path || '/'}`,
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path || '/',
          secure: cookie.secure || false,
          httpOnly: cookie.httpOnly || false,
          sameSite: cookie.sameSite || 'Lax',
          expirationDate: cookie.expires ? new Date(cookie.expires).getTime()/1000 : undefined,
        };
        if (typeof browser !== 'undefined' && browser.cookies) await browser.cookies.set(details);
        else if (chrome?.cookies) await chrome.cookies.set(details);
        return true;
      } catch (e) { return false; }
    }

    async remove(cookie) {
      try {
        const details = {
          url: `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path || '/'}`,
          name: cookie.name,
        };
        if (typeof browser !== 'undefined' && browser.cookies) await browser.cookies.remove(details);
        else if (chrome?.cookies) await chrome.cookies.remove(details);
        return true;
      } catch { return false; }
    }
  }

  // ──────────────────────────────────────────────
  // SEARCH ENGINE
  // ──────────────────────────────────────────────
  class SearchEngine {
    static match(cookie, query, mode = 'fuzzy') {
      if (!query) return true;
      const q = query.toLowerCase();
      const fields = [cookie.name, cookie.value, cookie.domain, cookie.path].map(f => (f||'').toLowerCase());
      if (mode === 'regex') {
        try { const re = new RegExp(query, 'i'); return fields.some(f => re.test(f)); } catch { return false; }
      }
      if (mode === 'wildcard') {
        const pattern = query.replace(/\*/g, '.*').replace(/\?/g, '.');
        try { const re = new RegExp(`^${pattern}$`, 'i'); return fields.some(f => re.test(f)); } catch { return false; }
      }
      if (mode === 'exact') return fields.some(f => f === q);
      // fuzzy: simple substring
      return fields.some(f => f.includes(q));
    }
  }

  // ──────────────────────────────────────────────
  // VIRTUAL SCROLLER
  // ──────────────────────────────────────────────
  class VirtualScroller {
    constructor(container, rowHeight, renderFn) {
      this.container = container;
      this.rowHeight = rowHeight;
      this.renderFn = renderFn;
      this.data = [];
      this.visibleRange = [0,0];
      this.scrollTop = 0;
      this.viewportHeight = 0;
      this.innerDiv = el('div');
      this.container.appendChild(this.innerDiv);
      this.container.style.overflowY = 'auto';
      this.container.style.position = 'relative';
      this.onScroll = throttle(this.handleScroll.bind(this), 16);
      this.container.addEventListener('scroll', this.onScroll);
      this.observer = new ResizeObserver(() => this.update());
      this.observer.observe(this.container);
    }

    setData(data) {
      this.data = data;
      this.update();
    }

    handleScroll() {
      this.scrollTop = this.container.scrollTop;
      this.update();
    }

    update() {
      this.viewportHeight = this.container.clientHeight;
      const totalHeight = this.data.length * this.rowHeight;
      this.innerDiv.style.height = `${totalHeight}px`;
      const start = Math.floor(this.scrollTop / this.rowHeight);
      const end = Math.min(this.data.length, Math.ceil((this.scrollTop + this.viewportHeight) / this.rowHeight) + 1);
      if (start === this.visibleRange[0] && end === this.visibleRange[1]) return;
      this.visibleRange = [start, end];
      this.renderVisible();
    }

    renderVisible() {
      this.innerDiv.innerHTML = '';
      for (let i = this.visibleRange[0]; i < this.visibleRange[1]; i++) {
        const item = this.data[i];
        const row = this.renderFn(item, i);
        row.style.position = 'absolute';
        row.style.top = `${i * this.rowHeight}px`;
        row.style.height = `${this.rowHeight}px`;
        row.style.width = '100%';
        this.innerDiv.appendChild(row);
      }
    }

    destroy() {
      this.container.removeEventListener('scroll', this.onScroll);
      this.observer.disconnect();
    }
  }

  // ──────────────────────────────────────────────
  // UI COMPONENTS
  // ──────────────────────────────────────────────
  class CommandPalette {
    constructor(app) {
      this.app = app;
      this.visible = false;
      this.actions = [];
      this.element = null;
    }

    init() {
      this.element = el('div', { className: 'ccu-palette-overlay', style: { display: 'none' } },
        el('div', { className: 'ccu-palette' },
          el('input', { className: 'ccu-palette-input', placeholder: 'Type a command...', onInput: (e) => this.filter(e.target.value) }),
          el('div', { className: 'ccu-palette-list' })
        )
      );
      document.body.appendChild(this.element);
      document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
          e.preventDefault();
          this.toggle();
        }
        if (e.key === 'Escape' && this.visible) this.hide();
      });
      this.element.addEventListener('click', (e) => { if (e.target === this.element) this.hide(); });
    }

    register(label, action) { this.actions.push({ label, action }); }

    toggle() { this.visible ? this.hide() : this.show(); }
    show() {
      this.visible = true;
      this.element.style.display = 'flex';
      const input = $('.ccu-palette-input', this.element);
      input.value = '';
      input.focus();
      this.filter('');
    }
    hide() { this.visible = false; this.element.style.display = 'none'; }

    filter(q) {
      const list = $('.ccu-palette-list', this.element);
      list.innerHTML = '';
      const filtered = this.actions.filter(a => a.label.toLowerCase().includes(q.toLowerCase()));
      filtered.forEach(a => {
        const item = el('div', { className: 'ccu-palette-item', onClick: () => { a.action(); this.hide(); } }, a.label);
        list.appendChild(item);
      });
    }
  }

  // ──────────────────────────────────────────────
  // MAIN APPLICATION
  // ──────────────────────────────────────────────
  class CookieCommanderUltra {
    constructor() {
      this.theme = new ThemeManager();
      this.logger = new Logger();
      this.toast = new ToastManager();
      this.cookieManager = new CookieManager();
      this.cookies = [];
      this.filteredCookies = [];
      this.selectedCookies = new Set();
      this.undoStack = [];
      this.redoStack = [];
      this.commandPalette = new CommandPalette(this);
      this.searchQuery = '';
      this.searchMode = 'fuzzy';
      this.sortKey = 'name';
      this.sortDir = 'asc';
      this.panel = null;
      this.virtualScroller = null;
      this.settings = this.loadSettings();
    }

    loadSettings() {
      try { return JSON.parse(localStorage.getItem('ccu_settings') || '{}'); } catch { return {}; }
    }
    saveSettings() { localStorage.setItem('ccu_settings', JSON.stringify(this.settings)); }

    async init() {
      this.injectStyles();
      this.theme.init();
      this.toast.init();
      this.createPanel();
      this.commandPalette.init();
      this.registerCommands();
      this.setupDragDrop();
      this.setupKeyboardShortcuts();
      await this.refreshCookies();
      this.logger.info('Cookie Commander Ultra initialized');
    }

    injectStyles() {
      const css = `
        .ccu-toast-container { position:fixed; top:20px; right:20px; z-index:999999; display:flex; flex-direction:column; gap:8px; pointer-events:none; }
        .ccu-toast { background:var(--ccu-surface); color:var(--ccu-text); padding:12px 20px; border-radius:var(--ccu-radius); box-shadow:var(--ccu-shadow); backdrop-filter:var(--ccu-blur); -webkit-backdrop-filter:var(--ccu-blur); font-family:var(--ccu-font); font-size:13px; transform:translateX(120%); transition:transform 0.3s ease; pointer-events:auto; border:1px solid var(--ccu-border); }
        .ccu-toast-in { transform:translateX(0); }
        .ccu-toast-success { border-left:4px solid var(--ccu-success); }
        .ccu-toast-error { border-left:4px solid var(--ccu-danger); }
        .ccu-toast-warn { border-left:4px solid var(--ccu-warning); }
        .ccu-panel { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:1100px; height:700px; background:var(--ccu-bg); backdrop-filter:var(--ccu-blur); -webkit-backdrop-filter:var(--ccu-blur); border-radius:var(--ccu-radius); box-shadow:var(--ccu-shadow); display:flex; flex-direction:column; z-index:99999; font-family:var(--ccu-font); color:var(--ccu-text); border:1px solid var(--ccu-border); resize:both; overflow:hidden; min-width:600px; min-height:400px; }
        .ccu-titlebar { display:flex; align-items:center; padding:10px 16px; background:var(--ccu-glass-bg); border-bottom:1px solid var(--ccu-border); cursor:move; user-select:none; gap:8px; }
        .ccu-titlebar-title { font-weight:600; font-size:13px; flex:1; }
        .ccu-titlebar-btn { width:28px; height:28px; border-radius:8px; border:none; background:transparent; color:var(--ccu-text); cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:16px; transition:background 0.2s; }
        .ccu-titlebar-btn:hover { background:var(--ccu-border); }
        .ccu-toolbar { display:flex; gap:8px; padding:10px 16px; border-bottom:1px solid var(--ccu-border); flex-wrap:wrap; background:var(--ccu-glass-bg); }
        .ccu-btn { padding:6px 14px; border-radius:10px; border:1px solid var(--ccu-border); background:var(--ccu-surface); color:var(--ccu-text); font-size:12px; cursor:pointer; transition:all 0.2s; display:flex; align-items:center; gap:4px; }
        .ccu-btn:hover { background:var(--ccu-accent); color:#fff; border-color:var(--ccu-accent); }
        .ccu-btn.primary { background:var(--ccu-accent); color:#fff; border-color:var(--ccu-accent); }
        .ccu-btn.danger { background:var(--ccu-danger); color:#fff; border-color:var(--ccu-danger); }
        .ccu-search { padding:6px 12px; border-radius:10px; border:1px solid var(--ccu-border); background:var(--ccu-surface); color:var(--ccu-text); font-size:12px; outline:none; width:200px; transition:all 0.2s; }
        .ccu-search:focus { border-color:var(--ccu-accent); box-shadow:0 0 0 2px rgba(0,113,227,0.2); }
        .ccu-main { display:flex; flex:1; overflow:hidden; }
        .ccu-sidebar { width:180px; border-right:1px solid var(--ccu-border); padding:12px; background:var(--ccu-glass-bg); overflow-y:auto; }
        .ccu-sidebar-item { padding:8px 12px; border-radius:8px; cursor:pointer; font-size:13px; margin-bottom:2px; transition:background 0.15s; }
        .ccu-sidebar-item:hover, .ccu-sidebar-item.active { background:var(--ccu-accent); color:#fff; }
        .ccu-content { flex:1; display:flex; flex-direction:column; overflow:hidden; }
        .ccu-table-container { flex:1; overflow:hidden; position:relative; }
        .ccu-table-header { display:flex; padding:8px 12px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; color:var(--ccu-text-secondary); border-bottom:1px solid var(--ccu-border); background:var(--ccu-glass-bg); position:sticky; top:0; z-index:2; }
        .ccu-table-header-cell { cursor:pointer; user-select:none; display:flex; align-items:center; gap:4px; }
        .ccu-table-row { display:flex; align-items:center; padding:6px 12px; font-size:12px; border-bottom:1px solid var(--ccu-border); cursor:pointer; transition:background 0.1s; }
        .ccu-table-row:hover { background:var(--ccu-bg-secondary); }
        .ccu-table-row.selected { background:var(--ccu-accent); color:#fff; }
        .ccu-statusbar { padding:6px 16px; border-top:1px solid var(--ccu-border); font-size:11px; color:var(--ccu-text-secondary); display:flex; gap:16px; background:var(--ccu-glass-bg); }
        .ccu-palette-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:999999; display:flex; align-items:flex-start; justify-content:center; padding-top:15vh; }
        .ccu-palette { width:500px; background:var(--ccu-surface); border-radius:var(--ccu-radius); box-shadow:var(--ccu-shadow); overflow:hidden; border:1px solid var(--ccu-border); }
        .ccu-palette-input { width:100%; padding:16px; border:none; background:transparent; color:var(--ccu-text); font-size:16px; outline:none; font-family:var(--ccu-font); }
        .ccu-palette-list { max-height:300px; overflow-y:auto; }
        .ccu-palette-item { padding:10px 16px; cursor:pointer; font-size:13px; transition:background 0.1s; }
        .ccu-palette-item:hover { background:var(--ccu-accent); color:#fff; }
        .ccu-context-menu { position:fixed; background:var(--ccu-surface); border-radius:10px; box-shadow:var(--ccu-shadow); border:1px solid var(--ccu-border); padding:6px; z-index:999999; min-width:160px; }
        .ccu-context-item { padding:8px 14px; border-radius:6px; cursor:pointer; font-size:12px; transition:background 0.1s; }
        .ccu-context-item:hover { background:var(--ccu-accent); color:#fff; }
        ::-webkit-scrollbar { width:6px; height:6px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:var(--ccu-border); border-radius:3px; }
        ::-webkit-scrollbar-thumb:hover { background:var(--ccu-text-secondary); }
      `;
      const style = el('style', { id: 'ccu-styles' });
      style.textContent = css;
      document.head.appendChild(style);
    }

    createPanel() {
      this.panel = el('div', { className: 'ccu-panel', id: 'ccu-panel' },
        // titlebar
        el('div', { className: 'ccu-titlebar', id: 'ccu-titlebar' },
          el('span', { className: 'ccu-titlebar-title' }, '🍪 Cookie Commander Ultra'),
          el('button', { className: 'ccu-titlebar-btn', onClick: () => this.minimize() }, '─'),
          el('button', { className: 'ccu-titlebar-btn', onClick: () => this.maximize() }, '□'),
          el('button', { className: 'ccu-titlebar-btn', onClick: () => this.destroy() }, '✕')
        ),
        // toolbar
        el('div', { className: 'ccu-toolbar' },
          el('input', { className: 'ccu-search', placeholder: 'Search cookies...', onInput: (e) => this.onSearch(e.target.value) }),
          el('select', { className: 'ccu-btn', onChange: (e) => { this.searchMode = e.target.value; this.onSearch(this.searchQuery); } },
            el('option', { value: 'fuzzy' }, 'Fuzzy'),
            el('option', { value: 'regex' }, 'Regex'),
            el('option', { value: 'wildcard' }, 'Wildcard'),
            el('option', { value: 'exact' }, 'Exact'),
          ),
          el('button', { className: 'ccu-btn', onClick: () => this.refreshCookies() }, '↻ Refresh'),
          el('button', { className: 'ccu-btn primary', onClick: () => this.importCookies() }, '📥 Import'),
          el('button', { className: 'ccu-btn', onClick: () => this.exportCookies() }, '📤 Export'),
          el('button', { className: 'ccu-btn danger', onClick: () => this.deleteSelected() }, '🗑 Delete'),
        ),
        // main
        el('div', { className: 'ccu-main' },
          el('div', { className: 'ccu-sidebar' },
            el('div', { className: 'ccu-sidebar-item active', onClick: () => this.setView('cookies') }, '🍪 Cookies'),
            el('div', { className: 'ccu-sidebar-item', onClick: () => this.setView('storage') }, '💾 Storage'),
            el('div', { className: 'ccu-sidebar-item', onClick: () => this.setView('security') }, '🔒 Security'),
            el('div', { className: 'ccu-sidebar-item', onClick: () => this.setView('analyzer') }, '📊 Analyzer'),
            el('div', { className: 'ccu-sidebar-item', onClick: () => this.setView('logs') }, '📋 Logs'),
            el('div', { className: 'ccu-sidebar-item', onClick: () => this.setView('settings') }, '⚙ Settings'),
          ),
          el('div', { className: 'ccu-content', id: 'ccu-content' },
            el('div', { className: 'ccu-table-container', id: 'ccu-table-container' }),
          )
        ),
        el('div', { className: 'ccu-statusbar', id: 'ccu-statusbar' },
          el('span', {}, 'Cookies: 0'),
          el('span', {}, 'Selected: 0'),
        )
      );
      document.body.appendChild(this.panel);
      this.setupTableHeader();
      this.setupContextMenu();
    }

    setupTableHeader() {
      const header = el('div', { className: 'ccu-table-header' });
      const cols = [
        { key: 'name', label: 'Name', width: '20%' },
        { key: 'value', label: 'Value', width: '20%' },
        { key: 'domain', label: 'Domain', width: '18%' },
        { key: 'path', label: 'Path', width: '12%' },
        { key: 'secure', label: 'Secure', width: '8%' },
        { key: 'httpOnly', label: 'HttpOnly', width: '8%' },
        { key: 'sameSite', label: 'SameSite', width: '8%' },
        { key: 'expires', label: 'Expires', width: 'auto' },
      ];
      cols.forEach(col => {
        const cell = el('div', {
          className: 'ccu-table-header-cell',
          style: { width: col.width, flex: col.width === 'auto' ? '1' : 'none' },
          onClick: () => this.sortBy(col.key)
        }, col.label, el('span', {}, this.sortKey === col.key ? (this.sortDir === 'asc' ? '▲' : '▼') : ''));
        header.appendChild(cell);
      });
      const container = document.getElementById('ccu-table-container');
      container.innerHTML = '';
      container.appendChild(header);
      this.virtualScroller = new VirtualScroller(container, 36, (cookie, i) => this.renderRow(cookie, i));
    }

    renderRow(cookie, i) {
      const row = el('div', {
        className: `ccu-table-row ${this.selectedCookies.has(cookie.id) ? 'selected' : ''}`,
        onClick: (e) => this.onRowClick(e, cookie),
        onContextMenu: (e) => this.showContextMenu(e, cookie),
        onDblClick: () => this.editCookie(cookie),
      });
      const cols = ['name','value','domain','path','secure','httpOnly','sameSite','expires'];
      const widths = ['20%','20%','18%','12%','8%','8%','8%','auto'];
      cols.forEach((key, idx) => {
        let val = cookie[key];
        if (key === 'secure' || key === 'httpOnly') val = val ? '✓' : '✗';
        if (key === 'expires' && val) val = new Date(val).toLocaleDateString();
        row.appendChild(el('span', { style: { width: widths[idx], flex: widths[idx]==='auto'?'1':'none', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' } }, val || ''));
      });
      return row;
    }

    sortBy(key) {
      if (this.sortKey === key) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      else { this.sortKey = key; this.sortDir = 'asc'; }
      this.applyFiltersAndSort();
    }

    onSearch(q) {
      this.searchQuery = q;
      this.applyFiltersAndSort();
    }

    applyFiltersAndSort() {
      let filtered = this.cookies.filter(c => SearchEngine.match(c, this.searchQuery, this.searchMode));
      filtered.sort((a,b) => {
        let va = (a[this.sortKey] || '').toString().toLowerCase();
        let vb = (b[this.sortKey] || '').toString().toLowerCase();
        if (va < vb) return this.sortDir === 'asc' ? -1 : 1;
        if (va > vb) return this.sortDir === 'asc' ? 1 : -1;
        return 0;
      });
      this.filteredCookies = filtered;
      if (this.virtualScroller) this.virtualScroller.setData(filtered);
      this.updateStatusBar();
    }

    onRowClick(e, cookie) {
      if (e.ctrlKey || e.metaKey) {
        if (this.selectedCookies.has(cookie.id)) this.selectedCookies.delete(cookie.id);
        else this.selectedCookies.add(cookie.id);
      } else if (e.shiftKey && this.lastClicked) {
        const idx1 = this.filteredCookies.indexOf(this.lastClicked);
        const idx2 = this.filteredCookies.indexOf(cookie);
        const [start, end] = [Math.min(idx1,idx2), Math.max(idx1,idx2)];
        this.selectedCookies.clear();
        for (let i = start; i <= end; i++) this.selectedCookies.add(this.filteredCookies[i].id);
      } else {
        this.selectedCookies.clear();
        this.selectedCookies.add(cookie.id);
      }
      this.lastClicked = cookie;
      this.applyFiltersAndSort();
      this.updateStatusBar();
    }

    setupContextMenu() {
      this.contextMenu = el('div', { className: 'ccu-context-menu', style: { display: 'none' } });
      document.body.appendChild(this.contextMenu);
      document.addEventListener('click', () => { this.contextMenu.style.display = 'none'; });
    }

    showContextMenu(e, cookie) {
      e.preventDefault();
      this.contextMenu.innerHTML = '';
      const items = [
        { label: '✏ Edit', action: () => this.editCookie(cookie) },
        { label: '📋 Copy', action: () => { navigator.clipboard.writeText(JSON.stringify(cookie, null, 2)); this.toast.show('Copied!'); } },
        { label: '⭐ Favorite', action: () => { cookie.favorite = !cookie.favorite; this.applyFiltersAndSort(); } },
        { label: '🗑 Delete', action: () => this.deleteCookies([cookie]) },
        { label: '📝 Add Note', action: () => { const note = prompt('Note:', cookie.notes || ''); if (note !== null) { cookie.notes = note; this.applyFiltersAndSort(); } } },
      ];
      items.forEach(item => {
        this.contextMenu.appendChild(el('div', { className: 'ccu-context-item', onClick: () => { item.action(); this.contextMenu.style.display = 'none'; } }, item.label));
      });
      this.contextMenu.style.display = 'block';
      this.contextMenu.style.left = `${e.clientX}px`;
      this.contextMenu.style.top = `${e.clientY}px`;
    }

    editCookie(cookie) {
      const newVal = prompt(`Edit ${cookie.name}:`, cookie.value);
      if (newVal !== null) {
        this.pushUndo(cookie);
        cookie.value = newVal;
        this.cookieManager.set(cookie).then(success => {
          this.toast.show(success ? 'Cookie updated' : 'Failed to update', success ? 'success' : 'error');
          this.refreshCookies();
        });
      }
    }

    pushUndo(cookie) {
      this.undoStack.push({ action: 'edit', cookie: { ...cookie }, oldValue: cookie.value });
      if (this.undoStack.length > 100) this.undoStack.shift();
    }

    async deleteCookies(cookies) {
      for (const c of cookies) await this.cookieManager.remove(c);
      this.toast.show(`Deleted ${cookies.length} cookie(s)`, 'success');
      await this.refreshCookies();
    }

    async deleteSelected() {
      if (this.selectedCookies.size === 0) return this.toast.show('No cookies selected', 'warn');
      const toDelete = this.cookies.filter(c => this.selectedCookies.has(c.id));
      await this.deleteCookies(toDelete);
      this.selectedCookies.clear();
    }

    async refreshCookies() {
      this.cookies = await this.cookieManager.getAll();
      this.applyFiltersAndSort();
      this.updateStatusBar();
    }

    updateStatusBar() {
      const statusbar = document.getElementById('ccu-statusbar');
      if (!statusbar) return;
      statusbar.innerHTML = '';
      statusbar.appendChild(el('span', {}, `Cookies: ${this.filteredCookies.length} / ${this.cookies.length}`));
      statusbar.appendChild(el('span', {}, `Selected: ${this.selectedCookies.size}`));
    }

    async importCookies() {
      const input = el('input', { type: 'file', accept: '.txt,.json,.csv,.har', onChange: async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        const { format, cookies } = CookieParser.autoDetectAndParse(text);
        this.toast.show(`Detected ${format}: ${cookies.length} cookies`, 'info');
        for (const c of cookies) {
          await this.cookieManager.set(c);
        }
        await this.refreshCookies();
        this.toast.show(`Imported ${cookies.length} cookies`, 'success');
      }});
      input.click();
    }

    exportCookies() {
      const json = JSON.stringify(this.filteredCookies, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: 'cookies-export.json' });
      a.click();
      URL.revokeObjectURL(url);
      this.toast.show('Exported to JSON', 'success');
    }

    setView(view) {
      $$('.ccu-sidebar-item').forEach(i => i.classList.remove('active'));
      const items = $$('.ccu-sidebar-item');
      const views = ['cookies','storage','security','analyzer','logs','settings'];
      const idx = views.indexOf(view);
      if (idx >= 0 && items[idx]) items[idx].classList.add('active');
    }

    minimize() { this.panel.style.display = 'none'; }
    maximize() {
      if (this.panel.style.width === '100%') {
        this.panel.style.width = '1100px';
        this.panel.style.height = '700px';
        this.panel.style.top = '50%';
        this.panel.style.left = '50%';
        this.panel.style.transform = 'translate(-50%,-50%)';
      } else {
        this.panel.style.width = '100%';
        this.panel.style.height = '100%';
        this.panel.style.top = '0';
        this.panel.style.left = '0';
        this.panel.style.transform = 'none';
        this.panel.style.borderRadius = '0';
      }
    }

    setupDragDrop() {
      const titlebar = document.getElementById('ccu-titlebar');
      if (!titlebar) return;
      let dragging = false, ox, oy;
      titlebar.addEventListener('mousedown', (e) => {
        dragging = true;
        const rect = this.panel.getBoundingClientRect();
        ox = e.clientX - rect.left;
        oy = e.clientY - rect.top;
        this.panel.style.transition = 'none';
      });
      document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        this.panel.style.left = `${e.clientX - ox}px`;
        this.panel.style.top = `${e.clientY - oy}px`;
        this.panel.style.transform = 'none';
      });
      document.addEventListener('mouseup', () => {
        dragging = false;
        this.panel.style.transition = '';
      });
    }

    setupKeyboardShortcuts() {
      document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); this.undo(); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); this.redo(); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.preventDefault(); this.selectedCookies = new Set(this.filteredCookies.map(c => c.id)); this.applyFiltersAndSort(); }
        if (e.key === 'Delete' && this.selectedCookies.size > 0) { this.deleteSelected(); }
        if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); this.exportCookies(); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'i') { e.preventDefault(); this.importCookies(); }
      });
    }

    undo() {
      if (this.undoStack.length === 0) return;
      const action = this.undoStack.pop();
      this.redoStack.push(action);
      if (action.action === 'edit') {
        const cookie = this.cookies.find(c => c.id === action.cookie.id);
        if (cookie) cookie.value = action.oldValue;
        this.applyFiltersAndSort();
      }
    }
    redo() {
      if (this.redoStack.length === 0) return;
      const action = this.redoStack.pop();
      this.undoStack.push(action);
      if (action.action === 'edit') {
        const cookie = this.cookies.find(c => c.id === action.cookie.id);
        if (cookie) cookie.value = action.cookie.value;
        this.applyFiltersAndSort();
      }
    }

    registerCommands() {
      this.commandPalette.register('Refresh Cookies', () => this.refreshCookies());
      this.commandPalette.register('Import Cookies', () => this.importCookies());
      this.commandPalette.register('Export Cookies (JSON)', () => this.exportCookies());
      this.commandPalette.register('Delete Selected', () => this.deleteSelected());
      this.commandPalette.register('Toggle Dark Mode', () => this.theme.setTheme(this.theme.activeTheme === 'dark' ? 'light' : 'dark'));
      this.commandPalette.register('Clear Selection', () => { this.selectedCookies.clear(); this.applyFiltersAndSort(); });
    }

    destroy() {
      if (this.panel) this.panel.remove();
      if (this.virtualScroller) this.virtualScroller.destroy();
      $$('#ccu-styles, #ccu-theme-vars, .ccu-toast-container, .ccu-palette-overlay, .ccu-context-menu').forEach(e => e.remove());
      delete global[APP_NAMESPACE];
    }
  }

  // ──────────────────────────────────────────────
  // BOOTSTRAP
  // ──────────────────────────────────────────────
  const app = new CookieCommanderUltra();
  global[APP_NAMESPACE] = app;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => app.init());
  else app.init();

})(window);
