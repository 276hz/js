// ==UserScript==
// @name         Tra cứu điểm TS10 - Hà Tĩnh (Pro Mobile)
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Floating menu kéo thả, auto format SBD, tra cứu hàng loạt hoặc riêng lẻ
// @match        https://hatinh.edu.vn/tracuudiemthi_ts10*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ===== HÀM TIỆN ÍCH =====
    const formatSBD = (num) => String(num).padStart(6, '0');
    const parseSBD = (val) => {
        let s = String(val).replace(/\D/g, '');
        if (s.length === 5) s = '0' + s;
        return parseInt(s, 10);
    };

    // ===== TRẠNG THÁI =====
    let state = {
        isRunning: false,
        currentSBD: 080001,
        startSBD: 080001,
        endSBD: 081000,
        results: [],
        logs: []
    };

    // ===== RENDER LOGS & RESULTS =====
    function addLog(msg, type = 'info') {
        const time = new Date().toLocaleTimeString();
        state.logs.unshift({ time, msg, type });
        if (state.logs.length > 50) state.logs.pop();
        const container = document.getElementById('logContainer');
        if (container) {
            container.innerHTML = state.logs.slice(0, 30).map(log => 
                `<div style="color: ${log.type === 'error' ? '#ff8888' : (log.type === 'success' ? '#88ff88' : '#cccccc')}; border-bottom: 1px solid #2c3e50; padding: 4px 0; font-size: 11px;">
                    <span style="color: #888;">[${log.time}]</span> ${log.msg}
                </div>`
            ).join('');
        }
        console.log(`[${time}] ${msg}`);
    }

    function renderResults() {
        const tbody = document.getElementById('resultTableBody');
        if (!tbody) return;
        tbody.innerHTML = state.results.map(r => `
            <tr style="border-bottom: 1px solid #2c3e50;">
                <td style="padding: 6px 4px;">${r.sbd}</td>
                <td style="padding: 6px 4px; max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${r.name || '---'}</td>
                <td style="padding: 6px 4px;">${r.toan || '---'}</td>
                <td style="padding: 6px 4px;">${r.anh || '---'}</td>
                <td style="padding: 6px 4px;">${r.van || '---'}</td>
                <td style="padding: 6px 4px; font-weight: bold;">${r.tong || '---'}</td>
            </tr>
        `).join('');
        document.getElementById('resultCount').innerText = state.results.length;
    }

    function parseScoreFromHTML(html, sbd) {
        try {
            const sbdStr = formatSBD(sbd);
            const regex = new RegExp(`${sbdStr}<\\/td>\\s*<td>([^<]+)<\\/td>\\s*<td>([^<]+)<\\/td>\\s*<td>([^<]+)<\\/td>\\s*<td>([^<]+)<\\/td>\\s*<td>([^<]+)<\\/td>\\s*<td>([^<]+)<\\/td>\\s*<td>([^<]+)<\\/td>`, 'i');
            const match = html.match(regex);
            if (match) {
                return {
                    sbd: sbdStr,
                    name: match[1].trim(),
                    toan: match[2].trim(),
                    anh: match[3].trim(),
                    van: match[4].trim(),
                    uutien: match[5].trim(),
                    khuyenkhich: match[6].trim(),
                    tong: match[7].trim()
                };
            }
            return null;
        } catch(e) { return null; }
    }

    // ===== DOM ACTIONS =====
    async function selectYear2026() {
        const yearLink = document.querySelector('#list-scoreTable16 a.dataset-link[data-id="6a20d0ef6a8b6fc19307df36"]');
        if (yearLink) { yearLink.click(); await new Promise(r => setTimeout(r, 800)); }
    }

    function enterSBD(sbd) {
        const input = document.querySelector('#searchForm16 input[name="keyword"]');
        if (input) { input.value = formatSBD(sbd); return true; }
        return false;
    }

    function refreshCaptcha() {
        const btn = document.querySelector('.captcha-refresh');
        if (btn) btn.click();
    }

    function submitForm() {
        const btn = document.querySelector('#searchForm16 button[type="submit"]');
        if (btn) btn.click();
    }

    function setCaptchaCode(code) {
        const input = document.querySelector('#searchForm16 input#captcha_code');
        if (input) { input.value = code; return true; }
        return false;
    }

    function waitForResult(sbd, timeout = 15000) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const checkInterval = setInterval(() => {
                const dataDiv = document.querySelector('#data16');
                if (dataDiv && dataDiv.innerHTML.length > 0) {
                    const html = dataDiv.innerHTML;
                    if (html.includes('Sai mã bảo mật')) {
                        clearInterval(checkInterval);
                        resolve({ status: 'captcha_error', html });
                    } else if (html.includes('không tìm thấy')) {
                        clearInterval(checkInterval);
                        resolve({ status: 'not_found', html });
                    } else if (html.includes('Điểm môn Toán')) {
                        clearInterval(checkInterval);
                        resolve({ status: 'found', html });
                    }
                }
                if (Date.now() - startTime > timeout) {
                    clearInterval(checkInterval);
                    resolve({ status: 'timeout', html: '' });
                }
            }, 500);
        });
    }

    async function processOneSBD(sbd) {
        addLog(`🔍 SBD ${formatSBD(sbd)}...`);
        enterSBD(sbd);
        await new Promise(r => setTimeout(r, 300));
        refreshCaptcha();
        await new Promise(r => setTimeout(r, 500));
        
        const captcha = await new Promise((resolve) => {
            const input = document.getElementById('captchaInput');
            const btn = document.getElementById('submitCaptchaBtn');
            const handler = () => {
                const code = input.value.trim();
                if (code) {
                    input.removeEventListener('keypress', keyHandler);
                    btn.removeEventListener('click', handler);
                    resolve(code);
                }
            };
            const keyHandler = (e) => { if (e.key === 'Enter') handler(); };
            input.addEventListener('keypress', keyHandler);
            btn.addEventListener('click', handler);
            input.value = '';
            input.style.border = '2px solid #f39c12';
            input.focus();
            addLog(`📷 Nhập captcha cho SBD ${formatSBD(sbd)}`, 'info');
            setTimeout(() => {
                if (input) {
                    input.removeEventListener('keypress', keyHandler);
                    btn.removeEventListener('click', handler);
                    input.style.border = '';
                    resolve(null);
                }
            }, 45000);
        });
        
        if (!captcha) {
            addLog(`⏭️ Bỏ qua SBD ${formatSBD(sbd)}`, 'error');
            return { status: 'skipped' };
        }
        
        setCaptchaCode(captcha);
        document.getElementById('captchaInput').style.border = '';
        await new Promise(r => setTimeout(r, 200));
        submitForm();
        
        const result = await waitForResult(sbd);
        if (result.status === 'found') {
            const data = parseScoreFromHTML(result.html, sbd);
            if (data) {
                state.results.unshift(data);
                renderResults();
                addLog(`✅ ${data.sbd} - ${data.name} (T:${data.toan}, V:${data.van}, A:${data.anh})`, 'success');
                return { status: 'found' };
            }
        } else if (result.status === 'captcha_error') {
            addLog(`❌ Captcha sai SBD ${formatSBD(sbd)}`, 'error');
            return { status: 'captcha_error' };
        } else if (result.status === 'not_found') {
            addLog(`❌ Không có điểm SBD ${formatSBD(sbd)}`, 'info');
            return { status: 'not_found' };
        }
        return { status: 'error' };
    }

    async function startLoop() {
        if (state.isRunning) return;
        state.isRunning = true;
        await selectYear2026();
        
        for (let sbd = state.currentSBD; sbd <= state.endSBD; sbd++) {
            if (!state.isRunning) break;
            state.currentSBD = sbd;
            const displaySpan = document.getElementById('currentSBDDisplay');
            if (displaySpan) displaySpan.innerText = formatSBD(sbd);
            
            let retry = 0;
            let done = false;
            while (retry < 3 && !done && state.isRunning) {
                const res = await processOneSBD(sbd);
                if (res.status === 'found' || res.status === 'not_found') {
                    done = true;
                } else if (res.status === 'captcha_error') {
                    retry++;
                    if (retry < 3) addLog(`🔄 Thử lại SBD ${formatSBD(sbd)} (lần ${retry+1})`, 'info');
                    await new Promise(r => setTimeout(r, 1000));
                } else {
                    retry++;
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
            await new Promise(r => setTimeout(r, 600));
        }
        state.isRunning = false;
        addLog('🏁 Hoàn thành!', 'success');
    }

    // ===== EXPORT =====
    function exportCSV() {
        if (!state.results.length) { alert('Chưa có dữ liệu'); return; }
        const headers = ['SBD','Họ tên','Toán','Anh','Văn','Ưu tiên','KK','Tổng'];
        const rows = state.results.map(r => [r.sbd, r.name, r.toan, r.anh, r.van, r.uutien, r.khuyenkhich, r.tong]);
        const csv = [headers, ...rows].map(row => row.map(c => `"${c}"`).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `tracuu_${new Date().toISOString().slice(0,19)}.csv`;
        link.click();
        addLog(`📁 Xuất ${state.results.length} kết quả CSV`, 'success');
    }

    function exportJSON() {
        if (!state.results.length) { alert('Chưa có dữ liệu'); return; }
        const blob = new Blob([JSON.stringify(state.results, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `tracuu_${new Date().toISOString().slice(0,19)}.json`;
        link.click();
        addLog(`📁 Xuất ${state.results.length} kết quả JSON`, 'success');
    }

    // ===== TẠO FLOATING MENU (DRAGGABLE) =====
    function createDraggablePanel() {
        const panel = document.createElement('div');
        panel.id = 'autoToolPanel';
        panel.innerHTML = `
            <div style="position: fixed; bottom: 20px; right: 20px; z-index: 99999; background: #1e2a3a; border-radius: 16px; box-shadow: 0 8px 20px rgba(0,0,0,0.5); width: 360px; max-width: calc(100vw - 20px); font-family: monospace; font-size: 12px; color: #ecf0f1; overflow: hidden; cursor: move;" id="draggablePanel">
                <div style="background: #0f1720; padding: 12px; text-align: center; cursor: grab;" id="dragHandle">
                    <strong>🔍 AUTO TS10 - HÀ TĨNH</strong>
                    <button id="closeTool" style="float: right; background: none; border: none; color: #aaa; font-size: 20px; cursor: pointer;">&times;</button>
                </div>
                <div style="padding: 12px; cursor: auto;">
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <input type="number" id="startSBD" placeholder="Bắt đầu" value="80001" style="flex:1; padding: 8px; background:#2c3e50; border:none; color:white; border-radius:8px; font-size: 14px;">
                        <input type="number" id="endSBD" placeholder="Kết thúc" value="81000" style="flex:1; padding: 8px; background:#2c3e50; border:none; color:white; border-radius:8px; font-size: 14px;">
                    </div>
                    <div style="display: flex; gap: 8px; margin-top: 8px;">
                        <input type="number" id="singleSBD" placeholder="Tra riêng (080123)" style="flex:1; padding: 8px; background:#2c3e50; border:none; color:white; border-radius:8px; font-size: 14px;">
                    </div>
                    <div style="display: flex; gap: 6px; margin-top: 8px;">
                        <input type="text" id="captchaInput" placeholder="Nhập captcha..." style="flex:2; padding: 8px; background:#2c3e50; border:1px solid #f39c12; color:white; border-radius:8px; font-size: 14px;">
                        <button id="submitCaptchaBtn" style="background:#f39c12; border:none; padding: 8px 12px; border-radius:8px; font-weight:bold;">Gửi</button>
                    </div>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px;">
                        <button id="startBtn" style="background:#27ae60; padding: 8px 12px; border:none; border-radius:8px; color:white; font-weight:bold;">▶ Bắt đầu</button>
                        <button id="pauseBtn" style="background:#e67e22; padding: 8px 12px; border:none; border-radius:8px; color:white; font-weight:bold;">⏸ Dừng</button>
                        <button id="singleBtn" style="background:#3498db; padding: 8px 12px; border:none; border-radius:8px; color:white; font-weight:bold;">🎯 Tra riêng</button>
                        <button id="resetBtn" style="background:#e74c3c; padding: 8px 12px; border:none; border-radius:8px; color:white; font-weight:bold;">Reset</button>
                        <button id="exportCSV" style="background:#2c3e50; border:1px solid #3498db; padding: 8px 12px; border-radius:8px; color:white;">CSV</button>
                        <button id="exportJSON" style="background:#2c3e50; border:1px solid #3498db; padding: 8px 12px; border-radius:8px; color:white;">JSON</button>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 8px; font-size: 11px; background:#0f1720; padding: 6px; border-radius:8px;">
                        <span>📌 SBD: <strong id="currentSBDDisplay">---</strong></span>
                        <span>📊 Kết quả: <strong id="resultCount">0</strong></span>
                    </div>
                    <div style="max-height: 180px; overflow-y: auto; margin-top: 8px; background:#0f1720; border-radius:8px;">
                        <table style="width:100%; font-size: 10px; border-collapse: collapse;">
                            <thead><tr style="background:#1a252f; position: sticky; top:0;"><th>SBD</th><th>Tên</th><th>T</th><th>A</th><th>V</th><th>Tổng</th></tr></thead>
                            <tbody id="resultTableBody"></tbody>
                        </table>
                    </div>
                    <div id="logContainer" style="max-height: 120px; overflow-y: auto; margin-top: 8px; background:#0f1720; border-radius:8px; padding: 6px; font-size: 10px;"></div>
                </div>
            </div>
        `;
        document.body.appendChild(panel);
        
        // Draggable functionality
        const dragPanel = document.getElementById('draggablePanel');
        const dragHandle = document.getElementById('dragHandle');
        let isDragging = false;
        let offsetX, offsetY;
        
        dragHandle.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            isDragging = true;
            offsetX = e.clientX - dragPanel.offsetLeft;
            offsetY = e.clientY - dragPanel.offsetTop;
            dragPanel.style.cursor = 'grabbing';
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            let left = e.clientX - offsetX;
            let top = e.clientY - offsetY;
            left = Math.min(Math.max(left, 10), window.innerWidth - dragPanel.offsetWidth - 10);
            top = Math.min(Math.max(top, 10), window.innerHeight - dragPanel.offsetHeight - 10);
            dragPanel.style.left = left + 'px';
            dragPanel.style.right = 'auto';
            dragPanel.style.bottom = 'auto';
            dragPanel.style.top = top + 'px';
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
            dragPanel.style.cursor = 'move';
        });
        
        // Touch support for mobile
        dragHandle.addEventListener('touchstart', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            const touch = e.touches[0];
            offsetX = touch.clientX - dragPanel.offsetLeft;
            offsetY = touch.clientY - dragPanel.offsetTop;
            dragPanel.style.cursor = 'grabbing';
            e.preventDefault();
        });
        
        document.addEventListener('touchmove', (e) => {
            if (!offsetX && !offsetY) return;
            const touch = e.touches[0];
            let left = touch.clientX - offsetX;
            let top = touch.clientY - offsetY;
            left = Math.min(Math.max(left, 10), window.innerWidth - dragPanel.offsetWidth - 10);
            top = Math.min(Math.max(top, 10), window.innerHeight - dragPanel.offsetHeight - 10);
            dragPanel.style.left = left + 'px';
            dragPanel.style.right = 'auto';
            dragPanel.style.bottom = 'auto';
            dragPanel.style.top = top + 'px';
        });
        
        document.addEventListener('touchend', () => {
            offsetX = offsetY = null;
            dragPanel.style.cursor = 'move';
        });
        
        // Event listeners
        document.getElementById('closeTool').onclick = () => dragPanel.remove();
        document.getElementById('startBtn').onclick = () => {
            if (state.isRunning) return;
            let start = parseSBD(document.getElementById('startSBD').value);
            let end = parseSBD(document.getElementById('endSBD').value);
            if (isNaN(start) || isNaN(end) || start > end) { alert('SBD không hợp lệ'); return; }
            state.startSBD = start;
            state.endSBD = end;
            state.currentSBD = start;
            addLog(`🚀 Bắt đầu: ${formatSBD(start)} → ${formatSBD(end)}`, 'success');
            startLoop();
        };
        document.getElementById('pauseBtn').onclick = () => {
            if (state.isRunning) {
                state.isRunning = false;
                addLog('⏸ Đã dừng', 'info');
            }
        };
        document.getElementById('singleBtn').onclick = async () => {
            if (state.isRunning) { addLog('⚠️ Đang chạy, hãy dừng trước', 'error'); return; }
            let sbd = parseSBD(document.getElementById('singleSBD').value);
            if (isNaN(sbd)) { alert('Nhập SBD hợp lệ (VD: 80123 hoặc 080123)'); return; }
            state.isRunning = true;
            state.currentSBD = sbd;
            state.endSBD = sbd;
            if (document.getElementById('currentSBDDisplay')) document.getElementById('currentSBDDisplay').innerText = formatSBD(sbd);
            addLog(`🎯 Tra riêng SBD ${formatSBD(sbd)}`, 'success');
            await startLoop();
        };
        document.getElementById('resetBtn').onclick = () => {
            state.isRunning = false;
            state.results = [];
            renderResults();
            addLog('🔄 Đã reset danh sách', 'info');
        };
        document.getElementById('exportCSV').onclick = exportCSV;
        document.getElementById('exportJSON').onclick = exportJSON;
        
        renderResults();
        addLog('✅ Sẵn sàng! Kéo thả menu bằng thanh tiêu đề.', 'success');
    }
    
    setTimeout(() => {
        if (!document.getElementById('autoToolPanel')) createDraggablePanel();
    }, 1000);
})();
