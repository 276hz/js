// ==UserScript==
// @name         Tra cứu điểm TS10 - Hà Tĩnh (Full Collection)
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  Thu thập toàn bộ điểm TS10 Hà Tĩnh. Không giới hạn queue, xuất CSV/JSON
// @match        https://hatinh.edu.vn/tracuudiemthi_ts10*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    /******************************************************************
     * CONFIG
     ******************************************************************/
    const CONFIG = {
        year: '2026',
        waitResultTimeout: 30000,
        delayBeforeSubmit: 300,
        delayAfterCaptchaRefresh: 600,
        delayBetweenItems: 500,
        storageKey: 'ht_ts10_full_collection_v5'
    };

    /******************************************************************
     * STATE
     ******************************************************************/
    const state = {
        isRunning: false,
        isWaitingCaptcha: false,
        currentSBD: '',
        queue: [],
        results: [],
        logs: [],
        minimized: false
    };

    /******************************************************************
     * UTILS
     ******************************************************************/
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    function nowTime() {
        return new Date().toLocaleTimeString('vi-VN');
    }

    function escapeHTML(str) {
        return String(str ?? '').replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    function csvCell(val) {
        return `"${String(val ?? '').replace(/"/g, '""')}"`;
    }

    // Chuẩn hóa SBD: 001 → 080001, 80001 → 080001
    function normalizeSBD(input) {
        let s = String(input ?? '').replace(/\D/g, '');
        if (!s) return '';
        if (s.length <= 3) s = '080' + s.padStart(3, '0');
        if (s.length === 5 && s.startsWith('80')) s = '0' + s;
        if (s.length > 6) s = s.slice(-6);
        return s;
    }

    function isValidSBD(sbd) {
        return /^080\d{3}$/.test(String(sbd));
    }

    function sbdToNumber(sbd) {
        return parseInt(String(sbd).replace(/\D/g, ''), 10);
    }

    function numberToSBD(num) {
        return String(num).padStart(6, '0');
    }

    // Tạo queue từ khoảng - KHÔNG GIỚI HẠN
    function makeRange(startInput, endInput) {
        let start = normalizeSBD(startInput);
        let end = normalizeSBD(endInput);
        
        if (!isValidSBD(start) || !isValidSBD(end)) {
            throw new Error('SBD phải dạng 080xxx. Ví dụ: 080001');
        }
        
        const a = sbdToNumber(start);
        const b = sbdToNumber(end);
        
        if (a > b) throw new Error('SBD bắt đầu phải nhỏ hơn hoặc bằng SBD kết thúc');
        
        const list = [];
        for (let n = a; n <= b; n++) {
            list.push(numberToSBD(n));
        }
        return list;
    }

    // Thêm SBD riêng lẻ vào queue (kiểm tra trùng)
    function addSingleToQueue(sbd) {
        const normalized = normalizeSBD(sbd);
        if (!isValidSBD(normalized)) {
            throw new Error(`SBD không hợp lệ: ${sbd} → phải dạng 080xxx`);
        }
        if (!state.queue.includes(normalized)) {
            state.queue.push(normalized);
            return true;
        }
        return false;
    }

    // Lưu state
    function saveState() {
        try {
            localStorage.setItem(CONFIG.storageKey, JSON.stringify({
                results: state.results,
                logs: state.logs.slice(0, 30),
                minimized: state.minimized
            }));
        } catch(e) {}
    }

    function loadState() {
        try {
            const raw = localStorage.getItem(CONFIG.storageKey);
            if (raw) {
                const data = JSON.parse(raw);
                if (Array.isArray(data.results)) state.results = data.results;
                if (Array.isArray(data.logs)) state.logs = data.logs;
                if (typeof data.minimized === 'boolean') state.minimized = data.minimized;
            }
        } catch(e) {}
    }

    /******************************************************************
     * LOG & RENDER
     ******************************************************************/
    function addLog(msg, type = 'info') {
        state.logs.unshift({ time: nowTime(), msg, type });
        if (state.logs.length > 100) state.logs.pop();
        renderLogs();
        saveState();
        console.log(`[${nowTime()}] ${msg}`);
    }

    function renderLogs() {
        const box = document.getElementById('htLogBox');
        if (!box) return;
        box.innerHTML = state.logs.slice(0, 40).map(log => {
            const color = log.type === 'error' ? '#ff8a8a' : log.type === 'success' ? '#8cffb0' : log.type === 'warn' ? '#ffd479' : '#cfd8e3';
            return `<div style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,.06);color:${color};font-size:10px;">
                        <span style="color:#7f8da3;">[${escapeHTML(log.time)}]</span> ${escapeHTML(log.msg)}
                    </div>`;
        }).join('');
    }

    function renderResults() {
        const tbody = document.getElementById('htResultBody');
        const countSpan = document.getElementById('htResultCount');
        const currentSpan = document.getElementById('htCurrentSBD');
        const queueSpan = document.getElementById('htQueueCount');
        
        if (countSpan) countSpan.innerText = state.results.length;
        if (currentSpan) currentSpan.innerText = state.currentSBD || '---';
        if (queueSpan) queueSpan.innerText = state.queue.length;
        
        if (!tbody) return;
        tbody.innerHTML = state.results.slice(0, 100).map(r => `
            <tr style="border-bottom:1px solid rgba(255,255,255,.06);">
                <td style="padding:5px 3px;">${escapeHTML(r.sbd)}</td>
                <td style="padding:5px 3px;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHTML(r.name)}">${escapeHTML(r.name || '---')}</td>
                <td style="padding:5px 3px;text-align:center;">${escapeHTML(r.toan || '---')}</td>
                <td style="padding:5px 3px;text-align:center;">${escapeHTML(r.anh || '---')}</td>
                <td style="padding:5px 3px;text-align:center;">${escapeHTML(r.van || '---')}</td>
                <td style="padding:5px 3px;text-align:center;font-weight:bold;">${escapeHTML(r.tong || '---')}</td>
            </tr>
        `).join('');
    }

    function renderAll() {
        renderLogs();
        renderResults();
        const content = document.getElementById('htPanelContent');
        const minBtn = document.getElementById('htMinimizeTool');
        if (content) content.style.display = state.minimized ? 'none' : 'block';
        if (minBtn) minBtn.textContent = state.minimized ? '▣' : '—';
    }

    /******************************************************************
     * DOM ACTIONS
     ******************************************************************/
    function getSBDInput() { return document.querySelector('#searchForm16 input[name="keyword"]'); }
    function getCaptchaInput() { return document.querySelector('#searchForm16 input#captcha_code'); }
    function getSubmitBtn() { return document.querySelector('#searchForm16 button[type="submit"]'); }
    function getRefreshBtn() { return document.querySelector('#searchForm16 .captcha-refresh'); }
    function getDataBox() { return document.querySelector('#data16'); }

    async function selectYear() {
        const link = document.querySelector('#list-scoreTable16 a.dataset-link[data-id="6a20d0ef6a8b6fc19307df36"]');
        if (link) {
            link.click();
            addLog(`📅 Đã chọn năm ${CONFIG.year}`, 'info');
            await sleep(800);
        }
    }

    function enterSBD(sbd) {
        const input = getSBDInput();
        if (!input) return false;
        input.value = sbd;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    }

    async function refreshCaptcha() {
        const btn = getRefreshBtn();
        if (btn) {
            btn.click();
            await sleep(CONFIG.delayAfterCaptchaRefresh);
            return true;
        }
        return false;
    }

    function setCaptcha(code) {
        const input = getCaptchaInput();
        if (!input) return false;
        input.value = code.trim();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    }

    function submitForm() {
        const btn = getSubmitBtn();
        if (btn) { btn.click(); return true; }
        return false;
    }

    function waitForResult() {
        return new Promise(resolve => {
            const start = Date.now();
            const interval = setInterval(() => {
                const box = getDataBox();
                if (box && box.innerHTML.trim()) {
                    const html = box.innerHTML;
                    if (/sai mã bảo mật/i.test(html)) {
                        clearInterval(interval);
                        resolve({ status: 'captcha_error', html });
                    } else if (/không tìm thấy|không có dữ liệu/i.test(html)) {
                        clearInterval(interval);
                        resolve({ status: 'not_found', html });
                    } else if (/Số báo danh|Điểm môn Toán|<table/i.test(html)) {
                        clearInterval(interval);
                        resolve({ status: 'found', html });
                    }
                }
                if (Date.now() - start > CONFIG.waitResultTimeout) {
                    clearInterval(interval);
                    resolve({ status: 'timeout', html: '' });
                }
            }, 400);
        });
    }

    /******************************************************************
     * PARSER
     ******************************************************************/
    function parseScore(html, sbd) {
        const sbdStr = normalizeSBD(sbd);
        try {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const rows = [...doc.querySelectorAll('table tbody tr, table tr')];
            for (const row of rows) {
                const cells = [...row.querySelectorAll('td')].map(td => td.textContent.trim());
                if (cells[0] === sbdStr) {
                    return {
                        sbd: cells[0], name: cells[1] || '',
                        toan: cells[2], anh: cells[3], van: cells[4],
                        uutien: cells[5], khuyenkhich: cells[6], tong: cells[7],
                        monChuyen: cells[8], diemChuyen: cells[9], tongChuyen: cells[10], ghiChu: cells[11],
                        capturedAt: new Date().toISOString()
                    };
                }
            }
            return null;
        } catch(e) { return null; }
    }

    function saveResult(data) {
        if (!data || !data.sbd) return;
        const idx = state.results.findIndex(r => r.sbd === data.sbd);
        if (idx >= 0) state.results[idx] = data;
        else state.results.unshift(data);
        renderResults();
        saveState();
    }

    /******************************************************************
     * CAPTCHA FROM PANEL
     ******************************************************************/
    function waitPanelCaptcha(sbd, timeout = 60000) {
        return new Promise(resolve => {
            const input = document.getElementById('htCaptchaInput');
            const btn = document.getElementById('htCaptchaSubmit');
            if (!input || !btn) return resolve(null);
            
            state.isWaitingCaptcha = true;
            let done = false;
            
            const cleanup = () => {
                state.isWaitingCaptcha = false;
                input.style.border = '1px solid rgba(255,255,255,.18)';
                input.removeEventListener('keydown', keyHandler);
                btn.removeEventListener('click', clickHandler);
            };
            
            const finish = (val) => {
                if (done) return;
                done = true;
                cleanup();
                resolve(val);
            };
            
            const clickHandler = () => {
                const code = input.value.trim();
                if (!code) {
                    input.style.border = '2px solid #ffcf5a';
                    input.focus();
                    return;
                }
                finish(code);
            };
            
            const keyHandler = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    clickHandler();
                }
            };
            
            input.value = '';
            input.placeholder = `Captcho ${sbd}`;
            input.style.border = '2px solid #ffcf5a';
            input.focus();
            input.addEventListener('keydown', keyHandler);
            btn.addEventListener('click', clickHandler);
            addLog(`📷 Nhập captcha cho ${sbd}`, 'info');
            setTimeout(() => finish(null), timeout);
        });
    }

    /******************************************************************
     * PROCESS ONE SBD
     ******************************************************************/
    async function processOne(sbd) {
        state.currentSBD = sbd;
        renderResults();
        addLog(`🔍 Tra ${sbd}...`, 'info');
        
        if (!enterSBD(sbd)) return { status: 'error' };
        await refreshCaptcha();
        
        const captcha = await waitPanelCaptcha(sbd);
        if (!captcha) return { status: 'skipped' };
        
        if (!setCaptcha(captcha)) return { status: 'error' };
        
        const dataBox = getDataBox();
        if (dataBox) dataBox.innerHTML = '';
        await sleep(CONFIG.delayBeforeSubmit);
        
        if (!submitForm()) return { status: 'error' };
        
        const result = await waitForResult();
        
        if (result.status === 'found') {
            const data = parseScore(result.html, sbd);
            if (data) {
                saveResult(data);
                addLog(`✅ ${sbd} - ${data.name} (T:${data.toan}, V:${data.van}, A:${data.anh})`, 'success');
                return { status: 'found' };
            }
            addLog(`⚠️ Parse lỗi ${sbd}`, 'warn');
            return { status: 'parse_error' };
        }
        
        if (result.status === 'captcha_error') {
            addLog(`❌ Captcha sai ${sbd}`, 'error');
            return { status: 'captcha_error' };
        }
        
        if (result.status === 'not_found') {
            addLog(`ℹ️ Không có điểm ${sbd}`, 'info');
            return { status: 'not_found' };
        }
        
        addLog(`⏰ Timeout ${sbd}`, 'warn');
        return { status: 'timeout' };
    }

    /******************************************************************
     * RUN QUEUE
     ******************************************************************/
    async function runQueue() {
        if (state.isRunning) {
            addLog('⚠️ Đang chạy, hãy nhấn Dừng trước', 'warn');
            return;
        }
        if (!state.queue.length) {
            addLog('⚠️ Queue trống. Hãy tạo queue trước.', 'warn');
            return;
        }
        
        state.isRunning = true;
        renderResults();
        addLog(`🚀 Bắt đầu queue ${state.queue.length} SBD`, 'success');
        
        await selectYear();
        
        while (state.queue.length && state.isRunning) {
            const sbd = state.queue.shift();
            renderResults();
            
            let retry = 0;
            let done = false;
            
            while (retry < 3 && !done && state.isRunning) {
                const res = await processOne(sbd);
                if (['found', 'not_found', 'skipped'].includes(res.status)) {
                    done = true;
                } else if (res.status === 'captcha_error') {
                    retry++;
                    if (retry < 3) addLog(`🔄 Thử lại ${sbd} lần ${retry+1}/3`, 'info');
                } else {
                    retry++;
                }
                if (!done && retry < 3) await sleep(800);
            }
            await sleep(CONFIG.delayBetweenItems);
        }
        
        state.isRunning = false;
        state.isWaitingCaptcha = false;
        renderResults();
        addLog('🏁 Đã dừng/hoàn thành', 'success');
    }

    /******************************************************************
     * EXPORT
     ******************************************************************/
    function exportCSV() {
        if (!state.results.length) { alert('Chưa có dữ liệu'); return; }
        const headers = ['SBD','Họ tên','Toán','Anh','Văn','Ưu tiên','KK','Tổng','Môn chuyên','Điểm chuyên','Tổng chuyên','Ghi chú','Thời gian'];
        const rows = state.results.map(r => [r.sbd, r.name, r.toan, r.anh, r.van, r.uutien, r.khuyenkhich, r.tong, r.monChuyen, r.diemChuyen, r.tongChuyen, r.ghiChu, r.capturedAt]);
        const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ts10_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.csv`;
        a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
        addLog(`📁 Xuất CSV ${state.results.length} dòng`, 'success');
    }
    
    function exportJSON() {
        if (!state.results.length) { alert('Chưa có dữ liệu'); return; }
        const blob = new Blob([JSON.stringify(state.results, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ts10_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.json`;
        a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
        addLog(`📁 Xuất JSON ${state.results.length} dòng`, 'success');
    }

    /******************************************************************
     * UI PANEL
     ******************************************************************/
    function injectStyle() {
        if (document.getElementById('htStyle')) return;
        const style = document.createElement('style');
        style.id = 'htStyle';
        style.textContent = `
            #htTool * { box-sizing: border-box; }
            #htTool button { -webkit-tap-highlight-color: transparent; cursor: pointer; }
            .ht-input { width:100%; border:1px solid rgba(255,255,255,.15); border-radius:10px; background:rgba(0,0,0,.4); color:#fff; padding:8px; outline:none; font-size:12px; }
            .ht-btn { border:0; border-radius:10px; padding:8px 10px; color:#fff; font-weight:bold; cursor:pointer; }
            .ht-card { background:rgba(15,23,32,.7); border-radius:12px; padding:8px; margin-bottom:8px; }
            @media (max-width: 480px) {
                #htDraggablePanel { width:calc(100vw - 20px) !important; right:10px; bottom:10px; }
            }
        `;
        document.head.appendChild(style);
    }
    
    function createPanel() {
        if (document.getElementById('htTool')) return;
        injectStyle();
        loadState();
        
        const div = document.createElement('div');
        div.id = 'htTool';
        div.innerHTML = `
            <div id="htDraggablePanel" style="position:fixed;right:16px;bottom:16px;width:380px;max-width:calc(100vw - 20px);z-index:2147483647;background:linear-gradient(180deg,#1e2a3a,#0f1720);border:1px solid rgba(255,255,255,.1);border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.5);overflow:hidden;font-family:monospace;font-size:12px;">
                <div id="htDragHandle" style="background:#0f1720;padding:12px;cursor:grab;display:flex;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.08);">
                    <strong>🔍 TS10 Hà Tĩnh - Full</strong>
                    <div><button id="htMinimize" style="background:none;border:0;color:#cbd5e1;font-size:18px;">—</button>
                    <button id="htClose" style="background:none;border:0;color:#cbd5e1;font-size:20px;">×</button></div>
                </div>
                <div id="htPanelContent" style="padding:10px;">
                    <div class="ht-card">
                        <div style="display:grid;grid-template-columns:1fr auto;gap:6px;">
                            <input class="ht-input" id="htSingleSBD" placeholder="Thêm riêng: 080001">
                            <button class="ht-btn" id="htAddSingleBtn" style="background:#475569;">➕ Thêm</button>
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px;">
                            <input class="ht-input" id="htStartSBD" placeholder="Từ: 080001">
                            <input class="ht-input" id="htEndSBD" placeholder="Đến: 081000">
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px;">
                            <button class="ht-btn" id="htMakeRangeBtn" style="background:#475569;">📦 Tạo khoảng</button>
                            <button class="ht-btn" id="htRunBtn" style="background:#16a34a;">▶ Chạy queue</button>
                        </div>
                    </div>
                    <div class="ht-card">
                        <div style="display:grid;grid-template-columns:1fr auto;gap:6px;">
                            <input class="ht-input" id="htCaptchaInput" placeholder="Nhập captcha...">
                            <button class="ht-btn" id="htCaptchaSubmit" style="background:#f59e0b;">Gửi</button>
                        </div>
                        <div style="display:flex;gap:6px;margin-top:8px;">
                            <button class="ht-btn" id="htStopBtn" style="background:#dc2626;">⏹ Dừng</button>
                            <button class="ht-btn" id="htClearQueueBtn" style="background:#64748b;">🗑 Xoá queue</button>
                            <button class="ht-btn" id="htResetDataBtn" style="background:#991b1b;">🔄 Reset data</button>
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:8px;">
                        <div class="ht-card">📌 <b id="htCurrentSBD">---</b></div>
                        <div class="ht-card">📦 <b id="htQueueCount">0</b></div>
                        <div class="ht-card">📊 <b id="htResultCount">0</b></div>
                    </div>
                    <div class="ht-card" style="max-height:180px;overflow:auto;">
                        <table style="width:100%;font-size:10px;border-collapse:collapse;">
                            <thead><tr><th>SBD</th><th>Tên</th><th>T</th><th>A</th><th>V</th><th>Tổng</th></tr></thead>
                            <tbody id="htResultBody"></tbody>
                        </table>
                    </div>
                    <div style="display:flex;gap:6px;margin-bottom:8px;">
                        <button class="ht-btn" id="htExportCSV" style="background:#0f766e;">📄 CSV</button>
                        <button class="ht-btn" id="htExportJSON" style="background:#0f766e;">📋 JSON</button>
                    </div>
                    <div id="htLogBox" class="ht-card" style="max-height:130px;overflow:auto;font-size:10px;"></div>
                    <div style="font-size:9px;color:#94a3b8;margin-top:6px;">SBD: 001 → 080001 | 80001 → 080001</div>
                </div>
            </div>
        `;
        document.body.appendChild(div);
        
        // Bind events
        const $ = (id) => document.getElementById(id);
        $('htClose').onclick = () => div.remove();
        $('htMinimize').onclick = () => { state.minimized = !state.minimized; renderAll(); };
        $('htAddSingleBtn').onclick = () => {
            try {
                const sbd = normalizeSBD($('htSingleSBD').value);
                if (addSingleToQueue(sbd)) addLog(`➕ Đã thêm ${sbd} vào queue`, 'success');
                else addLog(`⚠️ ${sbd} đã có trong queue`, 'warn');
                renderResults();
            } catch(e) { alert(e.message); }
        };
        $('htMakeRangeBtn').onclick = () => {
            try {
                state.queue = makeRange($('htStartSBD').value, $('htEndSBD').value);
                renderResults();
                addLog(`📦 Queue ${state.queue.length} SBD: ${state.queue[0]} → ${state.queue[state.queue.length-1]}`, 'success');
            } catch(e) { alert(e.message); }
        };
        $('htRunBtn').onclick = runQueue;
        $('htStopBtn').onclick = () => { state.isRunning = false; addLog('⏹ Đã dừng', 'warn'); };
        $('htClearQueueBtn').onclick = () => { state.queue = []; renderResults(); addLog('🧹 Đã xoá queue', 'info'); };
        $('htResetDataBtn').onclick = () => {
            if (confirm('Xoá toàn bộ kết quả đã lưu?')) {
                state.results = [];
                state.logs = [];
                localStorage.removeItem(CONFIG.storageKey);
                renderAll();
                addLog('🔄 Đã reset dữ liệu', 'success');
            }
        };
        $('htExportCSV').onclick = exportCSV;
        $('htExportJSON').onclick = exportJSON;
        
        ['htSingleSBD', 'htStartSBD', 'htEndSBD'].forEach(id => {
            $(id).addEventListener('blur', function() {
                let v = normalizeSBD(this.value);
                if (v) this.value = v;
            });
        });
        
        makeDraggable($('htDraggablePanel'), $('htDragHandle'));
        renderAll();
        addLog('✅ Tool sẵn sàng. Không giới hạn queue, thu thập toàn bộ điểm.', 'success');
    }
    
    function makeDraggable(box, handle) {
        if (!box || !handle) return;
        let dragging = false, startX, startY, startLeft, startTop;
        const getPoint = (e) => ({ x: e.clientX || e.touches?.[0]?.clientX, y: e.clientY || e.touches?.[0]?.clientY });
        const start = (e) => {
            if (e.target.closest('button, input')) return;
            const p = getPoint(e);
            const rect = box.getBoundingClientRect();
            dragging = true;
            startX = p.x; startY = p.y;
            startLeft = rect.left; startTop = rect.top;
            box.style.left = rect.left + 'px';
            box.style.top = rect.top + 'px';
            box.style.right = 'auto';
            box.style.bottom = 'auto';
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', end);
            document.addEventListener('touchmove', move, { passive: false });
            document.addEventListener('touchend', end);
            e.preventDefault();
        };
        const move = (e) => {
            if (!dragging) return;
            const p = getPoint(e);
            let left = startLeft + (p.x - startX);
            let top = startTop + (p.y - startY);
            left = Math.min(Math.max(left, 0), window.innerWidth - box.offsetWidth);
            top = Math.min(Math.max(top, 0), window.innerHeight - box.offsetHeight);
            box.style.left = left + 'px';
            box.style.top = top + 'px';
            e.preventDefault();
        };
        const end = () => {
            dragging = false;
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', end);
            document.removeEventListener('touchmove', move);
            document.removeEventListener('touchend', end);
        };
        handle.addEventListener('mousedown', start);
        handle.addEventListener('touchstart', start, { passive: false });
    }
    
    setTimeout(() => { if (document.body) createPanel(); else setTimeout(arguments.callee, 200); }, 500);
})();
