/* ==================================================================
 *  BASE44 FLOATING TOOLKIT  v5.0 FINAL — Safe Edition
 *  - Panel nổi kéo thả, nhớ vị trí
 *  - DOUBLE-CONFIRM cho mọi thao tác phá huỷ
 *  - Giải thích rõ từng bước, tránh thao tác nhầm
 *  - Full: list/cancel/delete/backup/undo/upload/edit/bulk
 * ================================================================== */
(() => {
  'use strict';

  // ═══════════════════════════════════════════════════════════
  //  1. CORE — state, token, api
  // ═══════════════════════════════════════════════════════════
  const $tok = () =>
    localStorage.getItem('base44_access_token') ||
    sessionStorage.getItem('base44_access_token') ||
    (document.cookie.match(/base44_access_token=([^;]+)/) || [])[1];

  const $detectApp = () => {
    const m = location.pathname.match(/\/api\/apps\/([a-f0-9]{20,})/i);
    if (m) return m[1];
    for (const e of performance.getEntriesByType('resource')) {
      const x = e.name.match(/\/api\/apps\/([a-f0-9]{20,})\//i);
      if (x) return x[1];
    }
    return null;
  };
  const $decodeEmail = () => {
    try {
      const t = $tok(); if (!t) return null;
      const p = JSON.parse(atob(t.split('.')[1]));
      return p.email || p.user_email || p.sub || null;
    } catch { return null; }
  };

  const S = {
    appId: localStorage.getItem('b44_app') || $detectApp(),
    email: localStorage.getItem('b44_email') || $decodeEmail(),
    expected: +localStorage.getItem('b44_exp') || 0,
    dry: localStorage.getItem('b44_dry') === '1',
    entities: JSON.parse(localStorage.getItem('b44_ent') || '{"release":"Release","track":"Track"}'),
    cache: [], undo: [], view: [], filter: 'all',
    ui: JSON.parse(localStorage.getItem('b44_ui') || '{}')
  };
  const save = () => {
    if (S.appId) localStorage.setItem('b44_app', S.appId);
    if (S.email) localStorage.setItem('b44_email', S.email);
    localStorage.setItem('b44_exp', S.expected);
    localStorage.setItem('b44_dry', S.dry ? '1' : '0');
    localStorage.setItem('b44_ent', JSON.stringify(S.entities));
  };
  const saveUI = () => localStorage.setItem('b44_ui', JSON.stringify(S.ui));

  const api = async (path, opts = {}) => {
    const tk = $tok();
    if (!tk) throw new Error('Chưa đăng nhập — không tìm thấy token');
    const isForm = opts.body instanceof FormData;
    const r = await fetch(path, {
      credentials: 'include', ...opts,
      headers: {
        ...(isForm ? {} : { 'Content-Type': 'application/json' }),
        'Authorization': `Bearer ${tk}`,
        ...(opts.headers || {})
      }
    });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = text.slice(0, 400); }
    return { ok: r.ok, status: r.status, data };
  };
  const unwrap = d => Array.isArray(d) ? d : (d?.data || d?.items || d?.records || []);
  const ent = k => `/api/apps/${S.appId}/entities/${S.entities[k] || k}`;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ═══════════════════════════════════════════════════════════
  //  2. DATA
  // ═══════════════════════════════════════════════════════════
  const load = async (force = false) => {
    if (!S.appId || !S.email) throw new Error('Cần setup trước (appId + email)');
    if (S.cache.length && !force) return S.cache;
    const q = { artist_email: S.email };
    const r = await api(`${ent('release')}?q=${encodeURIComponent(JSON.stringify(q))}&sort=-created_date&limit=500`);
    const rels = unwrap(r.data);
    const out = [];
    for (const rel of rels) {
      const t = await api(`${ent('track')}?q=${encodeURIComponent(JSON.stringify({ release_id: rel.id }))}&limit=500`);
      const tracks = unwrap(t.data);
      out.push({ ...rel, __tracks: tracks, __trackCount: tracks.length });
    }
    S.cache = out;
    return out;
  };
  const resolve = v => {
    if (v == null) return null;
    if (typeof v === 'number' || /^\d+$/.test(String(v))) return S.cache[+v] || null;
    return S.cache.find(r => r.id === v) || null;
  };
  const FILTERS = {
    all: () => true,
    pending: r => r.status === 'pending',
    stuck: r => S.expected > 0 && r.__trackCount > 0 && r.__trackCount < S.expected,
    cancelled: r => r.status === 'cancelled',
    live: r => r.status === 'live',
    empty: r => r.__trackCount === 0
  };
  const view = (f = 'all') => { S.filter = f; S.view = S.cache.filter(FILTERS[f] || FILTERS.all); return S.view; };
  const strip = r => { const { __tracks, __trackCount, ...rest } = r; return rest; };

  // ═══════════════════════════════════════════════════════════
  //  3. CRUD
  // ═══════════════════════════════════════════════════════════
  const update = async (id, patch, k = 'release') => {
    if (S.dry) { toast('🧪 DRY: không gửi request', 'warn'); return { ok: true, dry: true }; }
    return api(`${ent(k)}/${id}`, { method: 'PUT', body: JSON.stringify({ ...patch, updated_date: new Date().toISOString() }) });
  };
  const remove = async (id, k = 'release') => {
    if (S.dry) { toast('🧪 DRY: không gửi DELETE', 'warn'); return { ok: true, dry: true }; }
    return api(`${ent(k)}/${id}`, { method: 'DELETE' });
  };
  const create = async (data, k = 'release') => {
    if (S.dry) { toast('🧪 DRY: không gửi CREATE', 'warn'); return { ok: true, data: { id: 'dry-' + Date.now(), ...data } }; }
    return api(`${ent(k)}`, { method: 'POST', body: JSON.stringify(data) });
  };

  const doCancel = async (r) => {
    const now = new Date().toISOString();
    const res = await update(r.id, { status: 'cancelled', distribution_status: 'cancelled', cancelled_at: now });
    if (res.ok) r.status = 'cancelled';
    return res;
  };
  const doDelete = async (r, { backup = true } = {}) => {
    if (backup) doBackup(r);
    S.undo.push({ type: 'delete', release: r, tracks: r.__tracks, ts: Date.now() });
    for (const t of r.__tracks || []) await remove(t.id, 'track');
    const res = await remove(r.id, 'release');
    if (res.ok) S.cache = S.cache.filter(x => x.id !== r.id);
    return res;
  };
  const doBackup = (r) => {
    dlJSON({
      exportedAt: new Date().toISOString(), appId: S.appId, email: S.email,
      release: strip(r), tracks: r.__tracks
    }, `backup_${r.id}_${Date.now()}.json`);
  };
  const doUndo = async () => {
    const last = S.undo.pop();
    if (!last) return { ok: false, msg: 'Không có gì để undo' };
    const { id, created_date, updated_date, __tracks, __trackCount, ...rest } = last.release;
    const r1 = await create(rest, 'release');
    if (!r1.ok) return r1;
    for (const t of last.tracks || []) {
      const { id, release_id, ...tr } = t;
      await create({ ...tr, release_id: r1.data.id }, 'track');
    }
    await load(true);
    return r1;
  };

  // ═══════════════════════════════════════════════════════════
  //  4. DOWNLOAD & UPLOAD
  // ═══════════════════════════════════════════════════════════
  const dl = (content, filename, mime = 'text/plain') => {
    const blob = new Blob([content], { type: mime + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  const dlJSON = (o, name) => dl(JSON.stringify(o, null, 2), name, 'application/json');
  const dlCSV = (rows, name) => {
    const cols = ['id', 'title', 'status', 'trackCount', 'isrc', 'upc', 'release_date', 'created_date'];
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const body = rows.map(r => [
      r.id, r.title || r.name, r.status, r.__trackCount, r.isrc, r.upc, r.release_date, r.created_date
    ].map(q).join(',')).join('\n');
    dl('\ufeff' + cols.join(',') + '\n' + body, name, 'text/csv');
  };

  const pickFile = (accept = '*/*') => new Promise(res => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept;
    inp.onchange = () => res(inp.files[0] || null);
    inp.click();
  });
  const pickFiles = (accept = '*/*') => new Promise(res => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept; inp.multiple = true;
    inp.onchange = () => res([...inp.files]);
    inp.click();
  });
  const uploadFile = async (file, onProgress) => {
    const tk = $tok();
    const fd = new FormData();
    fd.append('file', file, file.name);
    if (onProgress) onProgress(0);
    const r = await fetch(`/api/apps/${S.appId}/integration-endpoints/Core/UploadFile`, {
      method: 'POST', credentials: 'include',
      headers: { 'Authorization': `Bearer ${tk}` },
      body: fd
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.message || `Upload ${r.status}`);
    if (onProgress) onProgress(100);
    return d.file_url || d.url || d.public_url || d.data?.file_url;
  };
  const titleFromFilename = (name) =>
    name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

  // ═══════════════════════════════════════════════════════════
  //  5. STYLES
  // ═══════════════════════════════════════════════════════════
  const CSS = `
    .b44-root *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
    #b44-panel{position:fixed;z-index:2147483647;width:360px;max-height:88vh;background:#0d1117;color:#e6edf3;border:1px solid #30363d;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.65),0 0 0 1px rgba(255,255,255,.05);font-size:13px;display:flex;flex-direction:column;overflow:hidden;user-select:none;transition:opacity .15s}
    #b44-panel.b44-collapsed{width:auto;height:auto;max-height:none}
    #b44-panel.b44-collapsed .b44-body{display:none}
    #b44-panel.b44-collapsed #b44-header{border-radius:14px}
    #b44-panel.b44-mini{width:auto}
    #b44-header{display:flex;align-items:center;gap:8px;padding:11px 13px;background:linear-gradient(135deg,#1652F0,#0f3fb8);cursor:grab;border-radius:14px 14px 0 0;font-weight:700;color:#fff;font-size:13px;letter-spacing:.01em}
    #b44-header:active{cursor:grabbing}
    #b44-header .b44-dot{width:8px;height:8px;border-radius:50%;background:#4ade80;box-shadow:0 0 8px #4ade80;flex-shrink:0;animation:b44-pulse 2s infinite}
    #b44-header .b44-title{flex:1}
    #b44-header button{background:rgba(255,255,255,.15);border:none;color:#fff;width:26px;height:26px;border-radius:6px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:background .15s;line-height:1}
    #b44-header button:hover{background:rgba(255,255,255,.3)}
    @keyframes b44-pulse{0%,100%{opacity:1}50%{opacity:.5}}
    .b44-body{overflow-y:auto;overflow-x:hidden;flex:1;padding:8px 0;scrollbar-width:thin;scrollbar-color:#30363d transparent}
    .b44-body::-webkit-scrollbar{width:6px}
    .b44-body::-webkit-scrollbar-thumb{background:#30363d;border-radius:3px}
    .b44-body::-webkit-scrollbar-thumb:hover{background:#484f58}
    .b44-section{padding:10px 13px 4px;color:#7d8590;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em}
    .b44-btn{display:flex;align-items:center;gap:9px;width:100%;padding:9px 13px;background:transparent;border:none;color:#e6edf3;font-size:13px;cursor:pointer;text-align:left;transition:background .1s;font-family:inherit}
    .b44-btn:hover{background:rgba(22,82,240,.15)}
    .b44-btn:active{background:rgba(22,82,240,.25)}
    .b44-btn.b44-danger:hover{background:rgba(220,38,38,.2)}
    .b44-btn.b44-primary{background:rgba(22,82,240,.18)}
    .b44-btn.b44-primary:hover{background:rgba(22,82,240,.3)}
    .b44-btn .b44-icon{width:20px;text-align:center;flex-shrink:0;font-size:15px}
    .b44-btn .b44-label{flex:1}
    .b44-btn .b44-hint{color:#7d8590;font-size:11px;font-weight:400;display:block;margin-top:2px}
    .b44-input,.b44-select{width:calc(100% - 26px);margin:4px 13px;padding:7px 10px;background:#161b22;color:#e6edf3;border:1px solid #30363d;border-radius:7px;font-size:12px;font-family:inherit}
    .b44-input:focus,.b44-select:focus{outline:none;border-color:#1652F0;box-shadow:0 0 0 2px rgba(22,82,240,.2)}
    .b44-list{max-height:340px;overflow-y:auto}
    .b44-item{display:flex;align-items:center;gap:8px;padding:8px 13px;cursor:pointer;border-left:3px solid transparent;transition:all .1s}
    .b44-item:hover{background:rgba(22,82,240,.1)}
    .b44-item .b44-item-info{flex:1;min-width:0}
    .b44-item .b44-item-title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12.5px}
    .b44-item .b44-item-meta{color:#7d8590;font-size:11px;margin-top:2px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    .b44-item .b44-item-actions{display:flex;gap:4px;opacity:.6;transition:opacity .15s}
    .b44-item:hover .b44-item-actions{opacity:1}
    .b44-item .b44-item-actions button{background:transparent;border:1px solid #30363d;color:#e6edf3;width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:13px;padding:0;display:flex;align-items:center;justify-content:center;transition:all .1s}
    .b44-item .b44-item-actions button:hover{background:rgba(22,82,240,.3);border-color:#1652F0}
    .b44-item .b44-item-actions button.b44-danger:hover{background:rgba(220,38,38,.3);border-color:#dc2626}
    .b44-badge{display:inline-block;padding:1px 7px;border-radius:9px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.03em}
    .b44-badge.pending{background:#f59e0b22;color:#f59e0b}
    .b44-badge.cancelled{background:#6b728022;color:#9ca3af}
    .b44-badge.live{background:#10b98122;color:#10b981}
    .b44-badge.draft{background:#8b5cf622;color:#a78bfa}
    .b44-badge.stuck{background:#ef444422;color:#ef4444;font-weight:700}
    .b44-badge.rejected{background:#dc262622;color:#dc2626}
    .b44-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#0d1117;color:#e6edf3;border:1px solid #30363d;border-radius:9px;padding:11px 18px;font-size:13px;font-weight:500;box-shadow:0 10px 40px rgba(0,0,0,.7);z-index:2147483648;max-width:520px;animation:b44-toast-in .22s ease-out;font-family:-apple-system,system-ui,sans-serif;line-height:1.4}
    .b44-toast.ok{border-color:#10b981;color:#10b981}
    .b44-toast.err{border-color:#ef4444;color:#ef4444}
    .b44-toast.warn{border-color:#f59e0b;color:#f59e0b}
    @keyframes b44-toast-in{from{opacity:0;transform:translateX(-50%) translateY(12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
    .b44-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:2147483646;display:flex;align-items:center;justify-content:center;animation:b44-fade .18s;padding:20px;overflow-y:auto}
    .b44-modal{background:#0d1117;color:#e6edf3;border:1px solid #30363d;border-radius:14px;padding:22px;max-width:480px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.85);font-family:-apple-system,system-ui,sans-serif;user-select:text;max-height:90vh;overflow-y:auto}
    .b44-modal.danger{border-color:#dc2626;box-shadow:0 20px 60px rgba(220,38,38,.35),0 0 0 3px rgba(220,38,38,.15)}
    .b44-modal.warn{border-color:#f59e0b}
    .b44-modal h3{margin:0 0 6px;font-size:16px;line-height:1.35;display:flex;align-items:center;gap:8px}
    .b44-modal .b44-sub{color:#7d8590;font-size:12px;margin-bottom:16px;line-height:1.5}
    .b44-modal .b44-info{background:#161b22;border:1px solid #21262d;border-radius:9px;padding:12px;margin:12px 0;font-size:12.5px}
    .b44-modal .b44-info-row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #21262d;gap:12px}
    .b44-modal .b44-info-row:last-child{border-bottom:none}
    .b44-modal .b44-info-row .k{color:#7d8590;flex-shrink:0}
    .b44-modal .b44-info-row .v{color:#e6edf3;text-align:right;word-break:break-word;min-width:0}
    .b44-modal .b44-warn-box{background:rgba(220,38,38,.1);border:1px solid rgba(220,38,38,.35);border-radius:9px;padding:11px 13px;margin:14px 0;font-size:12.5px;line-height:1.55;color:#fca5a5}
    .b44-modal .b44-warn-box.warn{background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.35);color:#fcd34d}
    .b44-modal .b44-warn-box strong{color:#fecaca;display:block;margin-bottom:5px}
    .b44-modal .b44-warn-box.warn strong{color:#fde68a}
    .b44-modal label{display:block;font-size:11.5px;color:#7d8590;margin-bottom:5px;font-weight:600;letter-spacing:.02em}
    .b44-modal input,.b44-modal select,.b44-modal textarea{width:100%;padding:9px 11px;background:#161b22;color:#e6edf3;border:1px solid #30363d;border-radius:7px;font-size:13px;margin-bottom:11px;font-family:inherit;transition:border-color .15s}
    .b44-modal input:focus,.b44-modal select:focus,.b44-modal textarea:focus{outline:none;border-color:#1652F0;box-shadow:0 0 0 2px rgba(22,82,240,.2)}
    .b44-modal input.b44-type-confirm{font-family:ui-monospace,SFMono-Regular,monospace;letter-spacing:.05em}
    .b44-modal input.b44-type-confirm.match{border-color:#10b981;box-shadow:0 0 0 2px rgba(16,185,129,.2)}
    .b44-modal-actions{display:flex;gap:9px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap}
    .b44-modal-actions button{padding:9px 18px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;border:1px solid #30363d;background:transparent;color:#e6edf3;font-family:inherit;transition:all .12s}
    .b44-modal-actions button:hover{background:#21262d}
    .b44-modal-actions button.b44-primary{background:#1652F0;border-color:#1652F0;color:#fff}
    .b44-modal-actions button.b44-primary:hover{background:#1241C4}
    .b44-modal-actions button.b44-danger{background:#dc2626;border-color:#dc2626;color:#fff}
    .b44-modal-actions button.b44-danger:hover{background:#b91c1c}
    .b44-modal-actions button:disabled{opacity:.4;cursor:not-allowed;background:#21262d;border-color:#30363d;color:#7d8590}
    .b44-modal-actions button:disabled:hover{background:#21262d}
    .b44-steps{display:flex;gap:6px;margin-bottom:14px;font-size:10.5px;color:#7d8590;align-items:center}
    .b44-step{display:flex;align-items:center;gap:5px}
    .b44-step .num{width:18px;height:18px;border-radius:50%;background:#21262d;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:10px;color:#7d8590}
    .b44-step.active .num{background:#1652F0;color:#fff}
    .b44-step.active{color:#e6edf3}
    .b44-step.done .num{background:#10b981;color:#fff}
    .b44-step-arrow{color:#484f58}
    @keyframes b44-fade{from{opacity:0}to{opacity:1}}
    .b44-progress{height:4px;background:#21262d;border-radius:2px;overflow:hidden;margin:12px 0}
    .b44-progress-bar{height:100%;background:linear-gradient(90deg,#1652F0,#10b981);transition:width .2s;border-radius:2px}
    .b44-footer{padding:9px 13px;color:#484f58;font-size:10px;text-align:center;border-top:1px solid #21262d;line-height:1.5}
    .b44-footer .b44-footer-line{display:flex;justify-content:space-between;gap:8px;font-family:ui-monospace,monospace}
    @media (max-width:500px){#b44-panel{width:calc(100vw - 20px);max-width:360px}}
  `;
  const injectCSS = () => {
    if (document.getElementById('b44-style')) return;
    const s = document.createElement('style');
    s.id = 'b44-style'; s.textContent = CSS;
    document.head.appendChild(s);
  };

  // ═══════════════════════════════════════════════════════════
  //  6. TOAST
  // ═══════════════════════════════════════════════════════════
  let toastTimer;
  const toast = (msg, type = '', ms = 2600) => {
    document.querySelectorAll('.b44-toast').forEach(t => t.remove());
    const t = document.createElement('div');
    t.className = 'b44-toast b44-root ' + type;
    t.textContent = msg;
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.style.transition = 'opacity .3s, transform .3s';
      t.style.opacity = '0';
      t.style.transform = 'translateX(-50%) translateY(8px)';
      setTimeout(() => t.remove(), 300);
    }, ms);
  };

  // ═══════════════════════════════════════════════════════════
  //  7. MODAL SYSTEM — single, multi-step, type-to-confirm
  // ═══════════════════════════════════════════════════════════
  const buildModal = (opts) => {
    const bg = document.createElement('div');
    bg.className = 'b44-modal-bg b44-root';
    const m = document.createElement('div');
    m.className = 'b44-modal' + (opts.variant ? ' ' + opts.variant : '');
    bg.appendChild(m);
    document.body.appendChild(bg);
    return { bg, modal: m };
  };

  // Simple info modal (single step, no input)
  const infoModal = (title, { subtitle, info, warn, warnType = 'danger', okText = 'OK', cancelText = 'Huỷ', danger = false } = {}) =>
    new Promise(res => {
      const { bg, modal } = buildModal({ variant: danger ? 'danger' : (warnType === 'warn' ? 'warn' : '') });
      const h = document.createElement('h3');
      h.innerHTML = esc(title);
      modal.appendChild(h);
      if (subtitle) {
        const s = document.createElement('div');
        s.className = 'b44-sub'; s.innerHTML = subtitle;
        modal.appendChild(s);
      }
      if (info && Object.keys(info).length) {
        const box = document.createElement('div');
        box.className = 'b44-info';
        box.innerHTML = Object.entries(info).map(([k, v]) =>
          `<div class="b44-info-row"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`
        ).join('');
        modal.appendChild(box);
      }
      if (warn) {
        const w = document.createElement('div');
        w.className = 'b44-warn-box' + (warnType === 'warn' ? ' warn' : '');
        w.innerHTML = warn;
        modal.appendChild(w);
      }
      const acts = document.createElement('div');
      acts.className = 'b44-modal-actions';
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = cancelText;
      const okBtn = document.createElement('button');
      okBtn.className = danger ? 'b44-danger' : 'b44-primary';
      okBtn.textContent = okText;
      acts.append(cancelBtn, okBtn);
      modal.appendChild(acts);
      const close = v => { bg.remove(); document.removeEventListener('keydown', onKey); res(v); };
      cancelBtn.onclick = () => close(false);
      okBtn.onclick = () => close(true);
      bg.onclick = e => { if (e.target === bg) close(false); };
      const onKey = e => {
        if (e.key === 'Escape') cancelBtn.click();
        if (e.key === 'Enter') okBtn.click();
      };
      document.addEventListener('keydown', onKey);
      setTimeout(() => okBtn.focus(), 60);
    });

  // Form modal (single step with inputs)
  const formModal = (title, fields, { subtitle, okText = 'Tiếp tục', cancelText = 'Huỷ', stepInfo } = {}) =>
    new Promise(res => {
      const { bg, modal } = buildModal({});
      if (stepInfo) {
        const steps = document.createElement('div');
        steps.className = 'b44-steps';
        steps.innerHTML = stepInfo.map((s, i) => {
          const cls = s.state === 'active' ? 'active' : (s.state === 'done' ? 'done' : '');
          const el = `<div class="b44-step ${cls}"><span class="num">${s.state === 'done' ? '✓' : i + 1}</span><span>${esc(s.label)}</span></div>`;
          return i < stepInfo.length - 1 ? el + '<span class="b44-step-arrow">›</span>' : el;
        }).join('');
        modal.appendChild(steps);
      }
      const h = document.createElement('h3');
      h.innerHTML = esc(title);
      modal.appendChild(h);
      if (subtitle) {
        const s = document.createElement('div');
        s.className = 'b44-sub'; s.innerHTML = subtitle;
        modal.appendChild(s);
      }
      const inputs = [];
      fields.forEach(f => {
        const label = document.createElement('label');
        label.textContent = f.label || f.key;
        if (f.hint) {
          const hh = document.createElement('span');
          hh.style.cssText = 'color:#484f58;font-weight:400;margin-left:6px';
          hh.textContent = '· ' + f.hint;
          label.appendChild(hh);
        }
        modal.appendChild(label);
        let el;
        if (f.options) {
          el = document.createElement('select');
          f.options.forEach(o => {
            const opt = document.createElement('option');
            opt.value = typeof o === 'object' ? o.value : o;
            opt.textContent = typeof o === 'object' ? o.label : o;
            if (String(opt.value) === String(f.value ?? '')) opt.selected = true;
            el.appendChild(opt);
          });
        } else if (f.type === 'textarea') {
          el = document.createElement('textarea');
          el.rows = 3;
          el.value = f.value ?? '';
        } else {
          el = document.createElement('input');
          el.type = f.type || 'text';
          el.placeholder = f.placeholder || '';
          el.value = f.value ?? '';
        }
        if (f.required) el.required = true;
        modal.appendChild(el);
        inputs.push({ key: f.key, el, required: f.required });
      });
      const acts = document.createElement('div');
      acts.className = 'b44-modal-actions';
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = cancelText;
      const okBtn = document.createElement('button');
      okBtn.className = 'b44-primary';
      okBtn.textContent = okText;
      acts.append(cancelBtn, okBtn);
      modal.appendChild(acts);
      const close = v => { bg.remove(); document.removeEventListener('keydown', onKey); res(v); };
      cancelBtn.onclick = () => close(null);
      okBtn.onclick = () => {
        const out = {};
        for (const { key, el, required } of inputs) {
          const v = el.value.trim();
          if (required && !v) { el.focus(); el.style.borderColor = '#dc2626'; return; }
          out[key] = v;
        }
        close(out);
      };
      bg.onclick = e => { if (e.target === bg) close(null); };
      const onKey = e => {
        if (e.key === 'Escape') cancelBtn.click();
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') okBtn.click();
      };
      document.addEventListener('keydown', onKey);
      setTimeout(() => inputs[0]?.el?.focus(), 60);
    });

  // Type-to-confirm modal (the SAFE step — user must type exact word)
  const typeConfirmModal = (title, { subtitle, info, word, wordLabel, warnText, okText = 'XÁC NHẬN XOÁ', danger = true }) =>
    new Promise(res => {
      const { bg, modal } = buildModal({ variant: danger ? 'danger' : 'warn' });
      const steps = document.createElement('div');
      steps.className = 'b44-steps';
      steps.innerHTML = `
        <div class="b44-step done"><span class="num">✓</span><span>Chọn đối tượng</span></div>
        <span class="b44-step-arrow">›</span>
        <div class="b44-step active"><span class="num">2</span><span>Xác nhận</span></div>
      `;
      modal.appendChild(steps);

      const h = document.createElement('h3');
      h.innerHTML = '🛑 ' + esc(title);
      modal.appendChild(h);

      if (subtitle) {
        const s = document.createElement('div');
        s.className = 'b44-sub'; s.innerHTML = subtitle;
        modal.appendChild(s);
      }
      if (info && Object.keys(info).length) {
        const box = document.createElement('div');
        box.className = 'b44-info';
        box.innerHTML = Object.entries(info).map(([k, v]) =>
          `<div class="b44-info-row"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`
        ).join('');
        modal.appendChild(box);
      }
      const warn = document.createElement('div');
      warn.className = 'b44-warn-box';
      warn.innerHTML = warnText || '<strong>⚠️ HÀNH ĐỘNG KHÔNG THỂ HOÀN TÁC</strong>Dữ liệu sẽ bị xoá vĩnh viễn khỏi hệ thống. Bạn không thể khôi phục sau khi xác nhận.';
      modal.appendChild(warn);

      const label = document.createElement('label');
      label.innerHTML = wordLabel || `Gõ chính xác <code style="background:#161b22;padding:2px 6px;border-radius:4px;color:#f59e0b;font-family:ui-monospace,monospace">${esc(word)}</code> để xác nhận:`;
      modal.appendChild(label);

      const inp = document.createElement('input');
      inp.className = 'b44-type-confirm';
      inp.placeholder = word;
      inp.autocomplete = 'off';
      inp.spellcheck = false;
      modal.appendChild(inp);

      const acts = document.createElement('div');
      acts.className = 'b44-modal-actions';
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Huỷ';
      const okBtn = document.createElement('button');
      okBtn.className = danger ? 'b44-danger' : 'b44-primary';
      okBtn.textContent = okText;
      okBtn.disabled = true;
      acts.append(cancelBtn, okBtn);
      modal.appendChild(acts);

      inp.oninput = () => {
        const match = inp.value.trim() === word;
        inp.classList.toggle('match', match);
        okBtn.disabled = !match;
      };
      const close = v => { bg.remove(); document.removeEventListener('keydown', onKey); res(v); };
      cancelBtn.onclick = () => close(false);
      okBtn.onclick = () => { if (!okBtn.disabled) close(true); };
      bg.onclick = e => { if (e.target === bg) close(false); };
      const onKey = e => {
        if (e.key === 'Escape') cancelBtn.click();
        if (e.key === 'Enter' && !okBtn.disabled) okBtn.click();
      };
      document.addEventListener('keydown', onKey);
      setTimeout(() => inp.focus(), 60);
    });

  // ═══════════════════════════════════════════════════════════
  //  8. SAFE FLOWS — double-confirm for destructive actions
  // ═══════════════════════════════════════════════════════════

  // Cancel — reversible-ish (chỉ đổi status)
  const safeCancel = async (r) => {
    const ok1 = await infoModal('🚫 Cancel release?', {
      subtitle: `Release sẽ chuyển sang trạng thái <b>cancelled</b>. Có thể đổi lại status sau nếu cần.`,
      info: {
        'Title': r.title || r.id,
        'Status hiện tại': r.status,
        'Số track': r.__trackCount,
        'Release ID': r.id.slice(0, 16) + '...'
      },
      warnType: 'warn',
      warn: '<strong>💡 Lưu ý</strong>Cancel <b>không xoá</b> release. Tracks và metadata vẫn còn. Chỉ đổi trạng thái để không phân phối.',
      okText: '🚫 Cancel release này',
      cancelText: 'Để sau'
    });
    if (!ok1) return;
    const res = await doCancel(r);
    if (res.ok) toast('✅ Đã cancel: ' + (r.title || r.id).slice(0, 40), 'ok');
    else toast('❌ Fail: ' + res.status, 'err');
    render();
  };

  // Delete — DOUBLE CONFIRM (step 1: info, step 2: type-to-confirm)
  const safeDelete = async (r) => {
    // STEP 1: Xem thông tin
    const step1 = await infoModal('⚠️ XOÁ RELEASE — Bước 1/2', {
      subtitle: `Bạn sắp <b>xoá vĩnh viễn</b> release này. Kiểm tra kỹ thông tin bên dưới.`,
      info: {
        'Title': r.title || r.id,
        'Status': r.status,
        'Số tracks sẽ xoá': r.__trackCount,
        'Release ID': r.id,
        'ISRC': r.isrc || '—',
        'UPC': r.upc || '—',
        'Ngày tạo': (r.created_date || '').slice(0, 19) || '—'
      },
      warn: `<strong>⚠️ ĐÂY LÀ BƯỚC 1/2 — CHƯA XOÁ GÌ CẢ</strong>Bước tiếp theo sẽ yêu cầu bạn gõ tên release để xác nhận.`,
      okText: 'Tiếp tục →',
      cancelText: 'Huỷ (an toàn)',
      danger: true
    });
    if (!step1) return toast('Đã huỷ — không có gì bị xoá', 'warn');

    // STEP 2: Type to confirm
    const word = (r.title || r.id).trim().slice(0, 50);
    const step2 = await typeConfirmModal(
      'XOÁ VĨNH VIỄN — Bước 2/2',
      {
        subtitle: `<b>Bạn đang xoá "${esc(r.title || r.id)}"</b> và ${r.__trackCount} tracks của nó.`,
        info: {
          'Track sẽ xoá': r.__trackCount,
          'Backup tự động': 'Có (file JSON sẽ tải về)',
          'Undo trong session': 'Có — nhưng nên backup cẩn thận'
        },
        word: word,
        wordLabel: `Gõ chính xác <code style="background:#161b22;padding:2px 6px;border-radius:4px;color:#f59e0b;font-family:ui-monospace,monospace">${esc(word)}</code> để xác nhận:`,
        warnText: `<strong>🛑 XÁC NHẬN LẦN CUỐI</strong>Khi bấm nút XOÁ, dữ liệu sẽ bị xoá ngay lập tức.<br>Backup JSON sẽ tự động tải về máy bạn trước khi xoá.`,
        okText: '🗑️ XOÁ VĨNH VIỄN',
        danger: true
      }
    );
    if (!step2) return toast('Đã huỷ — release vẫn an toàn', 'warn');

    toast('📥 Đang backup + xoá...', 'warn');
    await doDelete(r, { backup: true });
    toast('✅ Đã xoá: ' + (r.title || r.id).slice(0, 40), 'ok');
    render();
  };

  // Bulk cancel — single confirm, vì reversible
  const safeBulkCancel = async (rows) => {
    if (!rows.length) return toast('Không có release nào', 'warn');
    const ok = await infoModal('🚫 Cancel nhiều releases?', {
      subtitle: `<b>${rows.length} releases</b> sẽ chuyển sang status <b>cancelled</b>.`,
      info: rows.slice(0, 8).reduce((acc, r, i) => {
        acc[`${i + 1}. ${(r.title || r.id).slice(0, 30)}`] = `${r.__trackCount} tracks · ${r.status}`;
        return acc;
      }, rows.length > 8 ? { '... và nữa': `${rows.length - 8} release khác` } : {}),
      warnType: 'warn',
      warn: '<strong>💡 Có thể đổi status lại sau</strong>Không xoá dữ liệu — chỉ đổi trạng thái.',
      okText: `🚫 Cancel ${rows.length} releases`,
      cancelText: 'Huỷ'
    });
    if (!ok) return;
    let okc = 0;
    for (const r of rows) { const res = await doCancel(r); if (res.ok) okc++; }
    toast(`✅ Đã cancel ${okc}/${rows.length}`, 'ok');
    render();
  };

  // Bulk delete — DOUBLE CONFIRM, phải gõ "DELETE"
  const safeBulkDelete = async (rows) => {
    if (!rows.length) return toast('Không có release nào', 'warn');
    const totalTracks = rows.reduce((s, r) => s + r.__trackCount, 0);

    const step1 = await infoModal(`⚠️ XOÁ ${rows.length} RELEASES — Bước 1/2`, {
      subtitle: `Bạn sắp xoá <b>${rows.length} releases</b> và <b>${totalTracks} tracks</b>.`,
      info: rows.slice(0, 6).reduce((acc, r, i) => {
        acc[`${i + 1}. ${(r.title || r.id).slice(0, 30)}`] = `${r.__trackCount} tracks`;
        return acc;
      }, rows.length > 6 ? { '...': `${rows.length - 6} release khác` } : {}),
      warn: `<strong>⚠️ BƯỚC 1/2 — CHƯA XOÁ GÌ</strong>Sẽ có bước 2 yêu cầu gõ xác nhận.`,
      okText: 'Tiếp tục →',
      cancelText: 'Huỷ',
      danger: true
    });
    if (!step1) return toast('Đã huỷ', 'warn');

    const step2 = await typeConfirmModal(
      `XOÁ ${rows.length} RELEASES — Bước 2/2`,
      {
        subtitle: `<b>${rows.length} releases</b> và <b>${totalTracks} tracks</b> sẽ bị xoá vĩnh viễn.`,
        info: {
          'Số release': rows.length,
          'Tổng tracks': totalTracks,
          'Backup': 'Sẽ tải JSON trước khi xoá',
          'Undo': 'Có (session) — nhưng nên restore từ backup'
        },
        word: 'DELETE ALL',
        wordLabel: `Gõ <code style="background:#161b22;padding:2px 6px;border-radius:4px;color:#f59e0b;font-family:ui-monospace,monospace">DELETE ALL</code> để xác nhận:`,
        warnText: `<strong>🛑 XÁC NHẬN LẦN CUỐI</strong>${rows.length} releases · ${totalTracks} tracks sẽ bị xoá.<br>Backup sẽ tự tải về.`,
        okText: `🗑️ XOÁ ${rows.length} RELEASES`,
        danger: true
      }
    );
    if (!step2) return toast('Đã huỷ — không có gì bị xoá', 'warn');

    dlJSON({
      exportedAt: new Date().toISOString(), appId: S.appId, email: S.email,
      releases: rows.map(r => ({ release: strip(r), tracks: r.__tracks }))
    }, `bulk_backup_${Date.now()}.json`);

    let okd = 0;
    for (const r of rows) { const res = await doDelete(r, { backup: false }); if (res.ok) okd++; }
    await load(true);
    toast(`✅ Đã xoá ${okd}/${rows.length} releases`, 'ok');
    render();
  };

  // ═══════════════════════════════════════════════════════════
  //  9. FLOWS — upload, edit, bulk
  // ═══════════════════════════════════════════════════════════
  const uploadMusic = async () => {
    const v = await formModal('🎵 Upload album mới', [
      { key: 'title', label: 'Title album/single', required: true },
      { key: 'artist', label: 'Primary artist', value: S.email?.split('@')[0] || '', required: true },
      { key: 'release_type', label: 'Type', value: 'single', options: ['single', 'album', 'ep'] },
      { key: 'genre', label: 'Genre', value: 'Afrobeats' },
      { key: 'language', label: 'Language', value: 'English' },
      { key: 'release_date', label: 'Release date', value: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10) },
      { key: 'record_label', label: 'Record label' }
    ], { subtitle: 'Bước 1/3: Nhập metadata · Bước 2: chọn artwork · Bước 3: chọn audio files' });
    if (!v) return;

    toast('🖼️ Bước 2/3 — Chọn artwork (bỏ qua nếu không cần)', 'warn', 3000);
    const artwork = await pickFile('image/*').catch(() => null);

    toast('🎵 Bước 3/3 — Chọn audio files (chọn nhiều được)', 'warn', 3000);
    const audios = await pickFiles('audio/*,video/mp4');
    if (!audios?.length) return toast('Không có file — huỷ', 'warn');

    // Summary + confirm
    const ok = await infoModal('✅ Xác nhận upload', {
      subtitle: `Tạo release với <b>${audios.length} tracks</b>. Sẽ upload lên server.`,
      info: {
        'Title': v.title,
        'Artist': v.artist,
        'Type': v.release_type,
        'Genre': v.genre,
        'Release date': v.release_date,
        'Artwork': artwork ? artwork.name : '(không có)',
        'Số tracks': audios.length,
        'Files': audios.slice(0, 3).map(f => f.name).join(', ') + (audios.length > 3 ? ` +${audios.length - 3} nữa` : '')
      },
      okText: `⏫ Upload ${audios.length} tracks`,
      cancelText: 'Huỷ'
    });
    if (!ok) return;

    let artworkUrl = '';
    if (artwork) {
      try { artworkUrl = await uploadFile(artwork); toast('✅ Artwork uploaded', 'ok'); }
      catch (e) { return toast('❌ Artwork: ' + e.message, 'err'); }
    }
    const urls = [];
    for (let i = 0; i < audios.length; i++) {
      try {
        const u = await uploadFile(audios[i]);
        urls.push({ url: u, filename: audios[i].name });
        toast(`⏫ ${i + 1}/${audios.length} uploaded`, '', 800);
      } catch (e) { toast(`❌ ${audios[i].name}: ${e.message}`, 'err'); }
    }
    if (!urls.length) return toast('Không upload được file nào', 'err');

    const payload = {
      ...v, artist_email: S.email,
      release_year: v.release_date.slice(0, 4),
      artwork_url: artworkUrl, status: 'draft',
      territories: 'worldwide', explicit: false,
      copyright_owner: v.artist, created_by: S.email
    };
    const rr = await create(payload, 'release');
    if (!rr.ok) return toast('❌ Tạo release fail', 'err');

    for (let i = 0; i < urls.length; i++) {
      await create({
        release_id: rr.data.id, title: titleFromFilename(urls[i].filename),
        audio_url: urls[i].url, track_number: i + 1, artist_email: S.email
      }, 'track');
    }
    await load(true);
    toast(`🎉 Tạo release "${v.title}" với ${urls.length} tracks!`, 'ok', 4000);
    render();
  };

  const addTracks = async (rel) => {
    toast('🎵 Chọn audio files cần thêm', 'warn', 2500);
    const files = await pickFiles('audio/*,video/mp4');
    if (!files.length) return;
    const ok = await infoModal('➕ Thêm tracks', {
      subtitle: `Thêm <b>${files.length} files</b> vào release "${esc(rel.title)}".`,
      info: {
        'Release': rel.title,
        'Tracks hiện tại': rel.__trackCount,
        'Sẽ thêm': files.length,
        'Tổng sau': rel.__trackCount + files.length
      },
      okText: `⏫ Upload ${files.length} tracks`
    });
    if (!ok) return;
    const urls = [];
    for (let i = 0; i < files.length; i++) {
      try { urls.push({ url: await uploadFile(files[i]), filename: files[i].name }); toast(`⏫ ${i + 1}/${files.length}`, '', 700); }
      catch (e) { toast('❌ ' + files[i].name, 'err'); }
    }
    const start = rel.__trackCount + 1;
    for (let i = 0; i < urls.length; i++) {
      await create({
        release_id: rel.id, title: titleFromFilename(urls[i].filename),
        audio_url: urls[i].url, track_number: start + i, artist_email: S.email
      }, 'track');
    }
    await load(true);
    toast(`✅ +${urls.length} tracks`, 'ok');
    render();
  };

  const audioFor = async (rel) => {
    if (!rel.__tracks?.length) return toast('Release chưa có track', 'warn');
    const sel = await formModal('🎧 Upload audio cho track', [
      { key: 'idx', label: `Chọn track (0-${rel.__tracks.length - 1})`, type: 'number', value: '0', required: true }
    ], { subtitle: rel.__tracks.slice(0, 5).map((t, i) => `${i}: ${esc(t.title)}`).join(' · ') + (rel.__tracks.length > 5 ? ' ...' : '') });
    if (!sel) return;
    const t = rel.__tracks[+sel.idx];
    if (!t) return toast('idx sai', 'err');
    const file = await pickFile('audio/*,video/mp4');
    if (!file) return;
    try {
      const url = await uploadFile(file);
      await update(t.id, { audio_url: url }, 'track');
      t.audio_url = url;
      toast('✅ Đã gán audio', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  };

  const bulkUpload = async () => {
    const v = await formModal('⚡ Bulk add tracks', [
      { key: 'filter', label: 'Filter releases', value: 'stuck', options: ['all', 'pending', 'stuck', 'cancelled', 'live', 'empty'] }
    ], { subtitle: 'Chọn nhóm release → chọn audio files → files sẽ chia đều cho các release.' });
    if (!v) return;
    const rows = view(v.filter);
    if (!rows.length) return toast('Không có release', 'warn');
    toast(`🎵 Chọn audio files (chia cho ${rows.length} releases)`, 'warn', 3000);
    const files = await pickFiles('audio/*,video/mp4');
    if (!files.length) return;
    const ok = await infoModal('⚡ Xác nhận bulk upload', {
      subtitle: `<b>${files.length} files</b> sẽ chia đều cho <b>${rows.length} releases</b>.`,
      info: {
        'Files': files.length,
        'Releases': rows.length,
        'Mỗi release nhận': `~${Math.ceil(files.length / rows.length)} tracks`
      },
      okText: '⏫ Bắt đầu upload'
    });
    if (!ok) return;
    const urls = [];
    for (let i = 0; i < files.length; i++) {
      try { urls.push({ url: await uploadFile(files[i]), filename: files[i].name }); toast(`⏫ ${i + 1}/${files.length}`, '', 600); }
      catch (e) { toast('❌ ' + files[i].name, 'err'); }
    }
    const per = Math.ceil(urls.length / rows.length);
    for (let ri = 0; ri < rows.length; ri++) {
      const rel = rows[ri];
      const chunk = urls.slice(ri * per, (ri + 1) * per);
      const start = rel.__trackCount + 1;
      for (let i = 0; i < chunk.length; i++) {
        await create({
          release_id: rel.id, title: titleFromFilename(chunk[i].filename),
          audio_url: chunk[i].url, track_number: start + i, artist_email: S.email
        }, 'track');
      }
    }
    await load(true);
    toast(`✅ Bulk upload xong`, 'ok');
    render();
  };

  const editRelease = async (rel) => {
    const fields = [
      { key: 'title', label: 'Title', value: rel.title || '' },
      { key: 'description', label: 'Description', type: 'textarea', value: rel.description || '' },
      { key: 'genre', label: 'Genre', value: rel.genre || '' },
      { key: 'language', label: 'Language', value: rel.language || '' },
      { key: 'release_date', label: 'Release date', value: rel.release_date || '' },
      { key: 'primary_artist', label: 'Primary artist', value: rel.primary_artist || '' },
      { key: 'producer', label: 'Producer', value: rel.producer || '' },
      { key: 'composer', label: 'Composer', value: rel.composer || '' },
      { key: 'publisher', label: 'Publisher', value: rel.publisher || '' },
      { key: 'record_label', label: 'Record label', value: rel.record_label || '' },
      { key: 'upc', label: 'UPC', value: rel.upc || '' },
      { key: 'isrc', label: 'ISRC', value: rel.isrc || '' },
      { key: 'territories', label: 'Territories', value: rel.territories || '' },
      { key: 'bpm', label: 'BPM', value: rel.bpm || '', type: 'number' },
      { key: 'key', label: 'Key', value: rel.key || '' },
      { key: 'mood', label: 'Mood (comma separated)', value: Array.isArray(rel.mood) ? rel.mood.join(', ') : (rel.mood || '') },
      { key: 'explicit', label: 'Explicit', value: String(rel.explicit ?? ''), options: ['', 'true', 'false'] },
      { key: 'artwork_url', label: 'Artwork URL', value: rel.artwork_url || '' }
    ];
    const v = await formModal(`✏️ Sửa: ${rel.title}`, fields, {
      subtitle: 'Chỉnh sửa metadata. Bấm Save để lưu.',
      okText: '💾 Save'
    });
    if (!v) return;
    const patch = {};
    for (const k in v) {
      if (k === 'explicit') patch[k] = v[k] === 'true';
      else if (k === 'bpm') patch[k] = v[k] ? Number(v[k]) : '';
      else if (k === 'mood') patch[k] = v[k] ? v[k].split(',').map(s => s.trim()).filter(Boolean) : [];
      else patch[k] = v[k];
    }
    const r = await update(rel.id, patch);
    if (r.ok) { Object.assign(rel, patch); toast('✅ Saved', 'ok'); render(); }
    else toast('❌ ' + r.status, 'err');
  };

  const editArtwork = async (rel) => {
    const file = await pickFile('image/*');
    if (!file) return;
    const ok = await infoModal('🖼️ Đổi artwork', {
      subtitle: `Đặt <b>${esc(file.name)}</b> làm artwork cho "${esc(rel.title)}".`,
      info: { 'File': file.name, 'Size': (file.size / 1024).toFixed(1) + ' KB' },
      okText: '⏫ Upload & đặt'
    });
    if (!ok) return;
    try {
      const url = await uploadFile(file);
      await update(rel.id, { artwork_url: url });
      rel.artwork_url = url;
      toast('✅ Đã cập nhật artwork', 'ok');
      render();
    } catch (e) { toast(e.message, 'err'); }
  };

  const editTrackMenu = async (rel) => {
    if (!rel.__tracks?.length) return toast('Release chưa có track', 'warn');
    const sel = await formModal('🎵 Chọn track để sửa', [
      { key: 'idx', label: `Track idx (0-${rel.__tracks.length - 1})`, type: 'number', value: '0', required: true }
    ], {
      subtitle: rel.__tracks.slice(0, 8).map((t, i) => `<b>${i}</b>: ${esc(t.title)}`).join('<br>')
    });
    if (!sel) return;
    const t = rel.__tracks[+sel.idx];
    if (!t) return toast('idx sai', 'err');
    const v = await formModal(`🎵 ${t.title}`, [
      { key: 'title', label: 'Title', value: t.title || '' },
      { key: 'isrc', label: 'ISRC', value: t.isrc || '' },
      { key: 'track_number', label: 'Track #', type: 'number', value: t.track_number || '' },
      { key: 'audio_url', label: 'Audio URL', value: t.audio_url || '' }
    ], { okText: '💾 Save' });
    if (!v) return;
    const patch = { ...v, track_number: v.track_number ? +v.track_number : '' };
    const r = await update(t.id, patch, 'track');
    if (r.ok) { Object.assign(t, patch); toast('✅ Saved', 'ok'); }
  };

  const bulkSetField = async () => {
    const v = await formModal('⚡ Bulk set field', [
      { key: 'filter', label: 'Filter releases', value: 'all', options: ['all', 'pending', 'stuck', 'cancelled', 'live'] },
      { key: 'field', label: 'Field key', placeholder: 'genre / language / primary_artist...', required: true },
      { key: 'value', label: 'Giá trị mới', required: true }
    ], { subtitle: 'Set cùng 1 field cho nhiều releases.' });
    if (!v) return;
    const rows = view(v.filter);
    if (!rows.length) return toast('Không có release', 'warn');
    const ok = await infoModal('⚡ Xác nhận bulk set', {
      subtitle: `Set <b>${esc(v.field)}</b> = <b>"${esc(v.value)}"</b> cho <b>${rows.length} releases</b>.`,
      info: { 'Filter': v.filter, 'Số releases': rows.length, 'Field': v.field, 'Value': v.value },
      okText: 'Áp dụng',
      warnType: 'warn',
      warn: '<strong>⚠️ Sẽ ghi đè giá trị hiện tại</strong>Không thể undo. Backup trước nếu cần.'
    });
    if (!ok) return;
    for (const r of rows) await update(r.id, { [v.field]: v.value });
    await load(true);
    toast('✅ Done', 'ok');
    render();
  };

  const bulkArtwork = async () => {
    const v = await formModal('⚡ Bulk artwork', [
      { key: 'filter', label: 'Filter', value: 'stuck', options: ['all', 'pending', 'stuck', 'cancelled', 'live'] }
    ]);
    if (!v) return;
    const rows = view(v.filter);
    if (!rows.length) return toast('Không có release', 'warn');
    const file = await pickFile('image/*');
    if (!file) return;
    const ok = await infoModal('⚡ Xác nhận bulk artwork', {
      subtitle: `Set <b>${esc(file.name)}</b> làm artwork cho <b>${rows.length} releases</b>.`,
      info: { 'File': file.name, 'Số releases': rows.length },
      okText: '⏫ Upload & áp dụng',
      warnType: 'warn',
      warn: '<strong>⚠️ Sẽ ghi đè artwork hiện tại</strong>'
    });
    if (!ok) return;
    try {
      const url = await uploadFile(file);
      for (const r of rows) await update(r.id, { artwork_url: url });
      await load(true);
      toast('✅ Done', 'ok');
      render();
    } catch (e) { toast(e.message, 'err'); }
  };

  const restore = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json';
    inp.onchange = async () => {
      const file = inp.files[0]; if (!file) return;
      let d;
      try { d = JSON.parse(await file.text()); } catch { return toast('File JSON không hợp lệ', 'err'); }
      const list = d.releases || (d.release ? [{ release: d.release, tracks: d.tracks }] : []);
      if (!list.length) return toast('File không có release', 'err');
      const ok = await infoModal('📥 Restore từ backup', {
        subtitle: `File chứa <b>${list.length} releases</b>. Sẽ tạo MỚI (không ghi đè).`,
        info: {
          'Số releases': list.length,
          'Tổng tracks': list.reduce((s, x) => s + (x.tracks?.length || 0), 0),
          'Backup time': d.exportedAt || '—'
        },
        okText: '📥 Restore'
      });
      if (!ok) return;
      for (const item of list) {
        const { id, created_date, updated_date, __tracks, __trackCount, ...rel } = item.release;
        const r1 = await create(rel, 'release');
        if (!r1.ok) continue;
        for (const t of item.tracks || []) {
          const { id, release_id, ...tr } = t;
          await create({ ...tr, release_id: r1.data.id }, 'track');
        }
      }
      await load(true);
      toast('✅ Restored', 'ok');
      render();
    };
    inp.click();
  };

  // ═══════════════════════════════════════════════════════════
  //  10. PANEL UI
  // ═══════════════════════════════════════════════════════════
  const panel = document.createElement('div');
  panel.id = 'b44-panel';
  panel.className = 'b44-root';
  panel.innerHTML = `
    <div id="b44-header">
      <span class="b44-dot"></span>
      <span class="b44-title">🎵 B44 Toolkit</span>
      <button id="b44-refresh" title="Reload dữ liệu">↻</button>
      <button id="b44-collapse" title="Thu gọn / mở rộng">−</button>
    </div>
    <div class="b44-body" id="b44-body"></div>
  `;
  const body = panel.querySelector('#b44-body');
  const header = panel.querySelector('#b44-header');

  const render = () => {
    body.innerHTML = '';

    // Search
    const search = document.createElement('input');
    search.className = 'b44-input';
    search.placeholder = '🔍 Tìm title / id / isrc...';
    search.value = S.ui.search || '';
    search.oninput = () => { S.ui.search = search.value; renderList(); };
    body.appendChild(search);

    // Tabs
    const filters = ['all', 'pending', 'stuck', 'cancelled', 'live', 'empty'];
    const tabs = document.createElement('div');
    tabs.style.cssText = 'display:flex;gap:4px;padding:6px 13px 4px;flex-wrap:wrap;';
    for (const f of filters) {
      const b = document.createElement('button');
      b.className = 'b44-btn';
      const count = S.cache.filter(FILTERS[f]).length;
      const active = S.filter === f;
      b.style.cssText = `width:auto;padding:4px 10px;font-size:11px;border-radius:6px;background:${active ? 'rgba(22,82,240,.3)' : 'rgba(255,255,255,.05)'};${active ? 'color:#7dabff;' : ''}`;
      b.textContent = `${f} (${count})`;
      b.onclick = () => { S.filter = f; view(f); render(); };
      tabs.appendChild(b);
    }
    body.appendChild(tabs);

    // List
    const listWrap = document.createElement('div');
    listWrap.id = 'b44-list';
    listWrap.className = 'b44-list';
    body.appendChild(listWrap);
    renderList();

    const section = t => {
      const s = document.createElement('div');
      s.className = 'b44-section'; s.textContent = t;
      body.appendChild(s);
    };
    const btn = (icon, label, hint, onClick, cls = '') => {
      const b = document.createElement('button');
      b.className = 'b44-btn ' + cls;
      b.innerHTML = `<span class="b44-icon">${icon}</span><span class="b44-label">${esc(label)}${hint ? `<span class="b44-hint">${esc(hint)}</span>` : ''}</span>`;
      b.onclick = async () => {
        try { await onClick(); } catch (e) { toast('❌ ' + e.message, 'err'); }
      };
      body.appendChild(b);
    };

    // Upload
    section('🎵 Upload Music');
    btn('🎵', 'Upload album mới', 'Nhập metadata → chọn artwork → chọn audio', uploadMusic, 'b44-primary');
    btn('➕', 'Thêm tracks vào release', 'Upload thêm audio cho release có sẵn', async () => {
      const v = await formModal('Chọn release', [{ key: 'id', label: 'idx hoặc ID', required: true }]);
      if (!v) return;
      const r = resolve(v.id);
      if (!r) return toast('Không tìm thấy', 'err');
      await addTracks(r);
    });
    btn('🎧', 'Upload audio cho track', 'Gán file audio vào track chưa có', async () => {
      const v = await formModal('Chọn release', [{ key: 'id', label: 'idx hoặc ID', required: true }]);
      if (!v) return;
      const r = resolve(v.id);
      if (!r) return toast('Không tìm thấy', 'err');
      await audioFor(r);
    });
    btn('⚡', 'Bulk add tracks', 'Chia nhiều file cho nhiều release', bulkUpload);

    // Actions
    section('🎯 Actions (đơn)');
    btn('🚫', 'Cancel release', 'Đổi status → cancelled (reversible)', async () => {
      const r = resolve(await promptId('Cancel release nào?'));
      if (r) await safeCancel(r);
    });
    btn('🗑️', 'Xoá release', '⚠️ XOÁ VĨNH VIỄN — có double-confirm', async () => {
      const r = resolve(await promptId('Xoá release nào?'));
      if (r) await safeDelete(r);
    }, 'b44-danger');
    btn('💾', 'Backup release', 'Tải JSON chứa metadata + tracks', async () => {
      const r = resolve(await promptId('Backup release nào?'));
      if (r) { doBackup(r); toast('📥 Backup tải về', 'ok'); }
    });

    // Bulk
    section('⚡ Bulk (nhiều)');
    btn('🚫', 'Cancel nhiều', 'Chọn filter → cancel tất cả', async () => {
      const v = await formModal('Bulk cancel', [
        { key: 'filter', label: 'Filter releases', value: 'pending', options: ['all', 'pending', 'stuck', 'cancelled', 'live'] }
      ]);
      if (!v) return;
      await safeBulkCancel(view(v.filter));
    });
    btn('🗑️', 'Xoá nhiều', '⚠️ DOUBLE-CONFIRM + gõ DELETE ALL', async () => {
      const v = await formModal('Bulk delete', [
        { key: 'filter', label: 'Filter releases', value: 'stuck', options: ['all', 'pending', 'stuck', 'cancelled', 'live', 'empty'] }
      ]);
      if (!v) return;
      await safeBulkDelete(view(v.filter));
    }, 'b44-danger');
    btn('💾', 'Backup nhiều', 'Tải 1 file JSON chứa tất cả', async () => {
      const v = await formModal('Bulk backup', [
        { key: 'filter', label: 'Filter', value: 'all', options: ['all', 'pending', 'stuck', 'cancelled', 'live', 'empty'] }
      ]);
      if (!v) return;
      const rows = view(v.filter);
      if (!rows.length) return toast('Không có release', 'warn');
      dlJSON({
        exportedAt: new Date().toISOString(), appId: S.appId, email: S.email,
        releases: rows.map(r => ({ release: strip(r), tracks: r.__tracks }))
      }, `bulk_backup_${Date.now()}.json`);
      toast(`📥 ${rows.length} releases backed up`, 'ok');
    });

    // Edit
    section('✏️ Edit');
    btn('✏️', 'Sửa release', 'Đổi title, genre, ISRC, ...', async () => {
      const r = resolve(await promptId('Sửa release nào?'));
      if (r) await editRelease(r);
    });
    btn('🖼️', 'Đổi artwork', 'Upload ảnh mới', async () => {
      const r = resolve(await promptId('Đổi artwork release nào?'));
      if (r) await editArtwork(r);
    });
    btn('🎵', 'Sửa track', 'Đổi title/ISRC/audio của 1 track', async () => {
      const r = resolve(await promptId('Release nào?'));
      if (r) await editTrackMenu(r);
    });
    btn('⚡', 'Bulk set field', 'Set 1 field cho nhiều release', bulkSetField);
    btn('⚡', 'Bulk artwork', 'Cùng 1 ảnh cho nhiều release', bulkArtwork);

    // Data
    section('💾 Data');
    btn('📊', 'Export CSV', 'Danh sách releases dạng bảng', () => { dlCSV(S.cache, `releases_${Date.now()}.csv`); toast('📥 CSV', 'ok'); });
    btn('📦', 'Export JSON (full)', 'Metadata + tracks đầy đủ', () => {
      dlJSON({
        exportedAt: new Date().toISOString(), appId: S.appId, email: S.email,
        releases: S.cache.map(r => ({ release: strip(r), tracks: r.__tracks }))
      }, `releases_full_${Date.now()}.json`);
      toast('📥 JSON', 'ok');
    });
    btn('📥', 'Restore từ JSON', 'Tạo lại release từ file backup', restore);
    btn('↩️', 'Undo lần cuối', `Restore release vừa xoá (${S.undo.length} trong stack)`, async () => {
      if (!S.undo.length) return toast('Không có gì để undo', 'warn');
      const last = S.undo[S.undo.length - 1];
      const ok = await infoModal('↩️ Undo lần cuối?', {
        subtitle: `Restore "<b>${esc(last.release.title)}</b>" và ${last.tracks.length} tracks.`,
        info: { 'Release': last.release.title, 'Tracks': last.tracks.length, 'Xoá lúc': new Date(last.ts).toLocaleString() },
        okText: '↩️ Restore'
      });
      if (!ok) return;
      const res = await doUndo();
      toast(res.ok ? '✅ Restored' : '❌ ' + (res.msg || 'Fail'), res.ok ? 'ok' : 'err');
      render();
    });

    // System
    section('⚙️ System');
    btn('⚙️', 'Setup account / app', `appId · email · expected tracks`, async () => {
      const v = await formModal('⚙️ Setup', [
        { key: 'appId', label: 'App ID', value: S.appId || '', required: true },
        { key: 'email', label: 'Email', value: S.email || '', required: true },
        { key: 'expected', label: 'Expected tracks (album size)', value: String(S.expected || ''), type: 'number' }
      ], { subtitle: 'Cấu hình để toolkit biết app nào, account nào, và bao nhiêu track là đủ.' });
      if (!v) return;
      S.appId = v.appId; S.email = v.email;
      S.expected = v.expected ? +v.expected : 0;
      save(); S.cache = [];
      await load(true).catch(e => toast(e.message, 'err'));
      toast('✅ Đã lưu setup', 'ok');
      render();
    });
    btn('🏷️', 'Đổi entity names', 'Cho app Base44 khác (Album/Song...)', async () => {
      const v = await formModal('Entity names', [
        { key: 'release', label: 'Release entity', value: S.entities.release },
        { key: 'track', label: 'Track entity', value: S.entities.track }
      ]);
      if (!v) return;
      S.entities.release = v.release; S.entities.track = v.track;
      save(); S.cache = [];
      toast('✅ Saved', 'ok');
      render();
    });
    btn(S.dry ? '🔴' : '🟢', `Dry-run: ${S.dry ? 'BẬT (không thực thi)' : 'TẮT (thực thi thật)'}`,
      S.dry ? 'Đang mô phỏng — sẽ không gửi request' : 'Thao tác sẽ được thực thi thật',
      async () => {
        if (!S.dry) {
          const ok = await infoModal('🧪 Bật Dry-run?', {
            subtitle: 'Dry-run sẽ <b>mô phỏng</b> mọi thao tác — không gửi request lên server.',
            info: { 'Cancel': 'Sẽ log nhưng không đổi status', 'Delete': 'Sẽ log nhưng không xoá', 'Upload': 'Sẽ log nhưng không upload' },
            okText: '🧪 Bật dry-run'
          });
          if (!ok) return;
        }
        S.dry = !S.dry; save();
        toast(`Dry-run: ${S.dry ? 'BẬT' : 'TẮT'}`, S.dry ? 'warn' : 'ok');
        render();
      });
    btn('📞', 'Raw API call', 'Gửi request tuỳ ý (advanced)', async () => {
      const v = await formModal('📞 Raw API', [
        { key: 'method', label: 'Method', value: 'GET', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
        { key: 'path', label: 'Path', value: ent('release'), required: true },
        { key: 'body', label: 'Body JSON (nếu cần)', type: 'textarea', value: '' }
      ], { subtitle: '⚠️ Gửi request thủ công — chỉ dùng khi biết mình làm gì.' });
      if (!v) return;
      const r = await api(v.path, { method: v.method, ...(v.body ? { body: v.body } : {}) });
      console.log(r.status, r.data);
      toast(`${v.method} → ${r.status}`, r.ok ? 'ok' : 'err');
    });
    btn('❓', 'Help & Tips', 'Xem hướng dẫn nhanh', () => {
      infoModal('❓ Hướng dẫn nhanh', {
        subtitle: 'Các thao tác an toàn cho dữ liệu của bạn.',
        info: {
          '🖱️ Di chuyển': 'Kéo thanh header xanh',
          '↻ Reload': 'Nút ↻ trên header',
          '− Thu gọn': 'Nút − trên header',
          '🚫 Cancel': 'Đổi status → cancelled (hoàn tác được)',
          '🗑️ Xoá': '⚠️ 2 bước xác nhận + backup tự động',
          '💾 Backup': 'Tải JSON trước khi thao tác',
          '↩️ Undo': 'Khôi phục release vừa xoá (session)',
          '🧪 Dry-run': 'Mô phỏng, không gửi request',
          '📊 CSV': 'Bảng tính Excel/Sheets',
          '📦 JSON': 'Backup đầy đủ metadata + tracks'
        },
        okText: 'Đã hiểu'
      });
      console.log('%c🔌 Public API:', 'color:#1652F0;font-weight:bold', Object.keys(window.X).join(', '));
    });

    // Footer
    const foot = document.createElement('div');
    foot.className = 'b44-footer';
    foot.innerHTML = `
      <div class="b44-footer-line">
        <span>v5.0 Safe Edition</span>
        <span>${S.cache.length} rel · ${S.undo.length} undo</span>
      </div>
      <div class="b44-footer-line" style="margin-top:3px">
        <span>${S.appId?.slice(0, 12) || '?'}...</span>
        <span>${S.dry ? '🧪 DRY' : '🔴 LIVE'}</span>
      </div>
    `;
    body.appendChild(foot);
  };

  const renderList = () => {
    const wrap = panel.querySelector('#b44-list');
    if (!wrap) return;
    wrap.innerHTML = '';
    let rows = view(S.filter);
    const q = (S.ui.search || '').toLowerCase();
    if (q) rows = rows.filter(r =>
      (r.title || '').toLowerCase().includes(q) || (r.id || '').includes(q) ||
      (r.isrc || '').toLowerCase().includes(q) || (r.upc || '').includes(q)
    );
    if (!rows.length) {
      const e = document.createElement('div');
      e.style.cssText = 'padding:20px;text-align:center;color:#484f58;font-size:12px;';
      e.textContent = S.cache.length ? 'Không match filter/search' : 'Chưa load dữ liệu';
      wrap.appendChild(e);
      return;
    }
    for (const r of rows.slice(0, 100)) {
      const item = document.createElement('div');
      item.className = 'b44-item';
      const isStuck = FILTERS.stuck(r);
      item.innerHTML = `
        <div class="b44-item-info">
          <div class="b44-item-title">${esc(r.title || r.name || '(untitled)')}</div>
          <div class="b44-item-meta">
            <span class="b44-badge ${esc(r.status)}">${esc(r.status || '-')}</span>
            <span>${r.__trackCount} tracks</span>
            ${isStuck ? '<span class="b44-badge stuck">⚠ stuck</span>' : ''}
          </div>
        </div>
        <div class="b44-item-actions">
          <button title="Cancel (đổi status)">🚫</button>
          <button title="Sửa metadata">✏️</button>
          <button title="XOÁ VĨNH VIỄN" class="b44-danger">🗑️</button>
        </div>
      `;
      const [c, e, d] = item.querySelectorAll('button');
      c.onclick = ev => { ev.stopPropagation(); safeCancel(r); };
      e.onclick = ev => { ev.stopPropagation(); editRelease(r); };
      d.onclick = ev => { ev.stopPropagation(); safeDelete(r); };
      item.onclick = () => {
        console.log('📦 Release:', strip(r));
        console.table(r.__tracks.map(t => ({ id: t.id, title: t.title, isrc: t.isrc, audio: t.audio_url ? '✓' : '✗' })));
      };
      wrap.appendChild(item);
    }
  };

  const promptId = async (label) => {
    const v = await formModal(label, [{ key: 'id', label: 'idx hoặc ID', required: true, placeholder: '0' }]);
    return v?.id;
  };

  // ═══════════════════════════════════════════════════════════
  //  11. DRAG & POSITION
  // ═══════════════════════════════════════════════════════════
  const applyPosition = () => {
    const w = panel.offsetWidth, h = panel.offsetHeight;
    let { x, y } = S.ui;
    if (x == null || y == null) { x = window.innerWidth - w - 20; y = 80; }
    x = Math.max(0, Math.min(window.innerWidth - w, x));
    y = Math.max(0, Math.min(window.innerHeight - Math.min(h, 200), y));
    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    S.ui.x = x; S.ui.y = y;
  };
  let dragging = false, dragStart = null;
  const startDrag = e => {
    if (e.target.tagName === 'BUTTON') return;
    dragging = true;
    const p = e.touches ? e.touches[0] : e;
    const rect = panel.getBoundingClientRect();
    dragStart = { x: p.clientX - rect.left, y: p.clientY - rect.top };
    e.preventDefault();
  };
  const onDrag = e => {
    if (!dragging) return;
    const p = e.touches ? e.touches[0] : e;
    const w = panel.offsetWidth, h = panel.offsetHeight;
    let x = Math.max(0, Math.min(window.innerWidth - w, p.clientX - dragStart.x));
    let y = Math.max(0, Math.min(window.innerHeight - 40, p.clientY - dragStart.y));
    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
    S.ui.x = x; S.ui.y = y;
    e.preventDefault();
  };
  const endDrag = () => { if (dragging) { dragging = false; saveUI(); } };
  header.addEventListener('mousedown', startDrag);
  header.addEventListener('touchstart', startDrag, { passive: false });
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('touchmove', onDrag, { passive: false });
  document.addEventListener('mouseup', endDrag);
  document.addEventListener('touchend', endDrag);
  window.addEventListener('resize', applyPosition);

  panel.querySelector('#b44-collapse').onclick = () => {
    panel.classList.toggle('b44-collapsed');
    S.ui.collapsed = panel.classList.contains('b44-collapsed');
    saveUI(); applyPosition();
  };
  panel.querySelector('#b44-refresh').onclick = async () => {
    toast('🔍 Đang tải...');
    try { await load(true); render(); toast(`✅ ${S.cache.length} releases`, 'ok'); }
    catch (e) { toast('❌ ' + e.message, 'err'); }
  };

  // ═══════════════════════════════════════════════════════════
  //  12. BOOT & PUBLIC API
  // ═══════════════════════════════════════════════════════════
  const boot = async () => {
    injectCSS();
    document.body.appendChild(panel);
    applyPosition();
    if (S.ui.collapsed) panel.classList.add('b44-collapsed');

    if (!S.appId || !S.email) {
      render();
      toast('👋 Chào! Bấm "⚙️ Setup account / app" để bắt đầu', 'warn', 5000);
      return;
    }
    toast('🔍 Loading releases...');
    try {
      await load(true);
      render();
      toast(`✅ ${S.cache.length} releases loaded`, 'ok');
      if (!S.ui.onboarded) {
        S.ui.onboarded = true; saveUI();
        setTimeout(() => {
          infoModal('👋 Chào mừng — Hướng dẫn nhanh', {
            subtitle: 'Toolkit có <b>double-confirm</b> cho mọi thao tác nguy hiểm.',
            info: {
              '🖱️ Di chuyển panel': 'Kéo thanh header xanh',
              '🎵 Upload nhạc': 'Mục "Upload Music"',
              '🚫 Cancel': 'Đổi status — hoàn tác được',
              '🗑️ Xoá': '⚠️ Hỏi 2 lần + backup tự động',
              '↩️ Undo': 'Khôi phục trong session',
              '🧪 Dry-run': 'Mô phỏng an toàn'
            },
            okText: 'Đã hiểu'
          });
        }, 800);
      }
    } catch (e) { render(); toast('❌ ' + e.message, 'err'); }
  };

  window.X = {
    setup: (appId, email, expected) => {
      if (appId) S.appId = appId;
      if (email) S.email = email;
      if (expected != null) S.expected = +expected;
      save(); S.cache = [];
      if (panel.isConnected) { load(true).then(render).catch(() => render()); }
      return { appId: S.appId, email: S.email };
    },
    dry: (on) => { S.dry = !!on; save(); render(); toast(`dry=${S.dry}`, S.dry ? 'warn' : 'ok'); },
    load, cache: () => S.cache, state: S, resolve,
    cancel: async v => { const r = resolve(v); return r ? safeCancel(r) : null; },
    del: async v => { const r = resolve(v); return r ? safeDelete(r) : null; },
    delete: async v => { const r = resolve(v); return r ? safeDelete(r) : null; },
    backup: v => { const r = resolve(v); return r ? (doBackup(r), toast('📥 Backup', 'ok')) : null; },
    undo: doUndo,
    upload: uploadMusic, addTracks, audioFor, bulkUpload, uploadFile,
    edit: editRelease, artwork: editArtwork, track: editTrackMenu,
    csv: () => { dlCSV(S.cache, `releases_${Date.now()}.csv`); toast('📥 CSV', 'ok'); },
    json: () => {
      dlJSON({ exportedAt: new Date().toISOString(), appId: S.appId, email: S.email,
        releases: S.cache.map(r => ({ release: strip(r), tracks: r.__tracks })) },
        `releases_full_${Date.now()}.json`);
      toast('📥 JSON', 'ok');
    },
    restore, api, toast, modal: formModal, confirm: infoModal, typeConfirm: typeConfirmModal,
    panel, render, toggle: () => { panel.classList.toggle('b44-collapsed'); applyPosition(); },
    show: () => { panel.style.display = 'flex'; },
    hide: () => { panel.style.display = 'none'; },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  console.log('%c🎵 BASE44 FLOATING TOOLKIT v5.0 — Safe Edition', 'color:#1652F0;font-weight:bold;font-size:15px');
  console.log('%c🛡️  Double-confirm cho mọi thao tác phá huỷ · Backup tự động · Undo trong session',
    'color:#10b981;font-weight:bold');
  console.log('%c👉 Panel góc phải · Kéo header để di chuyển · X.help() qua panel',
    'color:#f59e0b');
})();
