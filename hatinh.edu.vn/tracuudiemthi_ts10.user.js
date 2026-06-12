// ==UserScript==
// @name         Tra cứu điểm TS10 - Mobile
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  Floating menu kéo thả, tra cứu SBD
// @match        https://hatinh.edu.vn/tracuudiemthi_ts10*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // Hàm format SBD (80001 -> 080001)
    const formatSBD = (num) => String(num).padStart(6, '0');
    
    // Hàm parse SBD từ input
    const parseSBD = (val) => {
        let s = String(val).replace(/\D/g, '');
        if (s.length === 5) s = '0' + s;
        return parseInt(s, 10);
    };

    // State
    let isRunning = false;
    let currentSBD = 080001;
    let endSBD = 081000;
    let results = [];
    let logs = [];

    // Thêm log
    function addLog(msg, type = 'info') {
        const time = new Date().toLocaleTimeString();
        logs.unshift({ time, msg, type });
        if (logs.length > 40) logs.pop();
        const container = document.getElementById('logContainer');
        if (container) {
            container.innerHTML = logs.slice(0, 20).map(log => 
                `<div style="color: ${log.type === 'error' ? '#ff8888' : (log.type === 'success' ? '#88ff88' : '#aaa')}; border-bottom: 1px solid #2c3e50; padding: 4px 0; font-size: 10px;">
                    <span style="color: #666;">[${log.time}]</span> ${log.msg}
                </div>`
            ).join('');
        }
        console.log(`[${time}] ${msg}`);
    }

    // Render bảng kết quả
    function renderResults() {
        const tbody = document.getElementById('resultTableBody');
        if (!tbody) return;
        tbody.innerHTML = results.map(r => `
            <tr style="border-bottom: 1px solid #2c3e50;">
                <td style="padding: 5px 3px;">${r.sbd}</td>
                <td style="padding: 5px 3px; max-width: 70px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${r.name || '---'}</td>
                <td style="padding: 5px 3px;">${r.toan || '---'}</td>
                <td style="padding: 5px 3px;">${r.anh || '---'}</td>
                <td style="padding: 5px 3px;">${r.van || '---'}</td>
                <td style="padding: 5px 3px; font-weight: bold;">${r.tong || '---'}</td>
            </tr>
        `).join('');
        document.getElementById('resultCount').innerText = results.length;
    }

    // Parse điểm từ HTML
    function parseScore(html, sbd) {
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
                    tong: match[7].trim()
                };
            }
            return null;
        } catch(e) { return null; }
    }

    // Các hàm DOM
    function selectYear2026() {
        const link = document.querySelector('#list-scoreTable16 a.dataset-link[data-id="6a20d0ef6a8b6fc19307df36"]');
        if (link) link.click();
    }

    function enterSBD(sbd) {
        const input = document.querySelector('#searchForm16 input[name="keyword"]');
        if (input) input.value = formatSBD(sbd);
    }

    function refreshCaptcha() {
        const btn = document.querySelector('.captcha-refresh');
        if (btn) btn.click();
    }

    function submitForm() {
        const btn = document.querySelector('#searchForm16 button[type="submit"]');
        if (btn) btn.click();
    }

    function setCaptcha(code) {
        const input = document.querySelector('#searchForm16 input#captcha_code');
        if (input) input.value = code;
    }

    function waitForResult(sbd, timeout = 15000) {
        return new Promise((resolve) => {
            const start = Date.now();
            const interval = setInterval(() => {
                const div = document.querySelector('#data16');
                if (div && div.innerHTML.length > 0) {
                    const html = div.innerHTML;
                    if (html.includes('Sai mã bảo mật')) {
                        clearInterval(interval);
                        resolve({ status: 'captcha_error', html });
                    } else if (html.includes('không tìm thấy')) {
                        clearInterval(interval);
                        resolve({ status: 'not_found', html });
                    } else if (html.includes('Điểm môn Toán')) {
                        clearInterval(interval);
                        resolve({ status: 'found', html });
                    }
                }
                if (Date.now() - start > timeout) {
                    clearInterval(interval);
                    resolve({ status: 'timeout', html: '' });
                }
            }, 500);
        });
    }

    // Xử lý 1 SBD
    async function processSBD(sbd) {
        addLog(`🔍 SBD ${formatSBD(sbd)}`);
        enterSBD(sbd);
        await new Promise(r => setTimeout(r, 300));
        refreshCaptcha();
        await new Promise(r => setTimeout(r, 500));
        
        // Đợi người dùng nhập captcha
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
            addLog(`📷 Nhập captcha cho ${formatSBD(sbd)}`, 'info');
            setTimeout(() => {
                input.removeEventListener('keypress', keyHandler);
                btn.removeEventListener('click', handler);
                input.style.border = '';
                resolve(null);
            }, 60000);
        });
        
        if (!captcha) {
            addLog(`⏭️ Bỏ qua ${formatSBD(sbd)}`, 'error');
            return false;
        }
        
        setCaptcha(captcha);
        document.getElementById('captchaInput').style.border = '';
        await new Promise(r => setTimeout(r, 200));
        submitForm();
        
        const result = await waitForResult(sbd);
        if (result.status === 'found') {
            const data = parseScore(result.html, sbd);
            if (data) {
                results.unshift(data);
                renderResults();
                addLog(`✅ ${data.sbd} - ${data.name} (T:${data.toan}, V:${data.van}, A:${data.anh})`, 'success');
                return true;
            }
        } else if (result.status === 'captcha_error') {
            addLog(`❌ Captcha sai ${formatSBD(sbd)}`, 'error');
            return false;
        } else if (result.status === 'not_found') {
            addLog(`❌ Không có điểm ${formatSBD(sbd)}`, 'info');
            return true;
        }
        return false;
    }

    // Vòng lặp chính
    async function startLoop() {
        if (isRunning) return;
        isRunning = true;
        selectYear2026();
        await new Promise(r => setTimeout(r, 1000));
        
        for (let sbd = currentSBD; sbd <= endSBD; sbd++) {
            if (!isRunning) break;
            currentSBD = sbd;
            const display = document.getElementById('currentSBDDisplay');
            if (display) display.innerText = formatSBD(sbd);
            
            let success = false;
            for (let retry = 0; retry < 3 && !success; retry++) {
                const ok = await processSBD(sbd);
                if (ok) success = true;
                else if (retry < 2) {
                    addLog(`🔄 Thử lại ${formatSBD(sbd)} (lần ${retry+2}/3)`, 'info');
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
            await new Promise(r => setTimeout(r, 500));
        }
        isRunning = false;
        addLog('🏁 Hoàn thành!', 'success');
    }

    // Xuất file
    function exportCSV() {
        if (!results.length) { alert('Chưa có dữ liệu'); return; }
        const headers = ['SBD','Họ tên','Toán','Anh','Văn','Tổng'];
        const rows = results.map(r => [r.sbd, r.name, r.toan, r.anh, r.van, r.tong]);
        const csv = [headers, ...rows].map(row => row.map(c => `"${c}"`).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `diem_${Date.now()}.csv`;
        link.click();
        addLog(`📁 Xuất ${results.length} kết quả CSV`, 'success');
    }

    function exportJSON() {
        if (!results.length) { alert('Chưa có dữ liệu'); return; }
        const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `diem_${Date.now()}.json`;
        link.click();
        addLog(`📁 Xuất ${results.length} kết quả JSON`, 'success');
    }

    // Tạo panel
    function createPanel() {
        // Kiểm tra nếu panel đã tồn tại
        if (document.getElementById('autoToolPanel')) return;
        
        const panel = document.createElement('div');
        panel.id = 'autoToolPanel';
        panel.innerHTML = `
            <div style="position: fixed; bottom: 10px; right: 10px; z-index: 99999; background: #1a252f; border-radius: 16px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); width: 340px; max-width: calc(100vw - 20px); font-family: monospace; font-size: 12px; color: #ecf0f1; overflow: hidden;" id="dragPanel">
                <div style="background: #0f1720; padding: 10px; text-align: center; cursor: grab; user-select: none;" id="dragHandle">
                    <strong>🔍 AUTO TS10</strong>
                    <button id="closeTool" style="float: right; background: none; border: none; color: #aaa; font-size: 20px; cursor: pointer;">&times;</button>
                </div>
                <div style="padding: 10px;">
                    <div style="display: flex; gap: 8px;">
                        <input type="number" id="startSBD" placeholder="Bắt đầu" value="80001" style="flex:1; padding: 8px; background:#2c3e50; border:none; color:#fff; border-radius:8px;">
                        <input type="number" id="endSBD" placeholder="Kết thúc" value="81000" style="flex:1; padding: 8px; background:#2c3e50; border:none; color:#fff; border-radius:8px;">
                    </div>
                    <div style="display: flex; gap: 8px; margin-top: 8px;">
                        <input type="number" id="singleSBD" placeholder="Tra riêng" style="flex:1; padding: 8px; background:#2c3e50; border:none; color:#fff; border-radius:8px;">
                    </div>
                    <div style="display: flex; gap: 6px; margin-top: 8px;">
                        <input type="text" id="captchaInput" placeholder="Nhập captcha" style="flex:2; padding: 8px; background:#2c3e50; border:1px solid #f39c12; color:#fff; border-radius:8px;">
                        <button id="submitCaptchaBtn" style="background:#f39c12; border:none; padding: 8px 12px; border-radius:8px; font-weight:bold;">Gửi</button>
                    </div>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px;">
                        <button id="startBtn" style="background:#27ae60; padding: 8px 12px; border:none; border-radius:8px; color:#fff;">▶ Bắt đầu</button>
                        <button id="pauseBtn" style="background:#e67e22; padding: 8px 12px; border:none; border-radius:8px; color:#fff;">⏸ Dừng</button>
                        <button id="singleBtn" style="background:#3498db; padding: 8px 12px; border:none; border-radius:8px; color:#fff;">🎯 Tra</button>
                        <button id="resetBtn" style="background:#e74c3c; padding: 8px 12px; border:none; border-radius:8px; color:#fff;">Reset</button>
                        <button id="exportCSV" style="background:#2c3e50; border:1px solid #3498db; padding: 8px 12px; border-radius:8px;">CSV</button>
                        <button id="exportJSON" style="background:#2c3e50; border:1px solid #3498db; padding: 8px 12px; border-radius:8px;">JSON</button>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 8px; background:#0f1720; padding: 6px; border-radius:8px;">
                        <span>📌 <strong id="currentSBDDisplay">---</strong></span>
                        <span>📊 <strong id="resultCount">0</strong></span>
                    </div>
                    <div style="max-height: 160px; overflow-y: auto; margin-top: 8px; background:#0f1720; border-radius:8px;">
                        <table style="width:100%; font-size: 9px; border-collapse: collapse;">
                            <thead><tr style="background:#1a252f;"><th>SBD</th><th>Tên</th><th>T</th><th>A</th><th>V</th><th>Tổng</th></tr></thead>
                            <tbody id="resultTableBody"></tbody>
                        </table>
                    </div>
                    <div id="logContainer" style="max-height: 100px; overflow-y: auto; margin-top: 8px; background:#0f1720; border-radius:8px; padding: 6px; font-size: 9px;"></div>
                </div>
            </div>
        `;
        document.body.appendChild(panel);
        
        // Kéo thả
        const dragPanel = document.getElementById('dragPanel');
        const dragHandle = document.getElementById('dragHandle');
        let isDrag = false, startX, startY, startLeft, startTop;
        
        const onMove = (e) => {
            if (!isDrag) return;
            const clientX = e.clientX || (e.touches ? e.touches[0].clientX : 0);
            const clientY = e.clientY || (e.touches ? e.touches[0].clientY : 0);
            let left = startLeft + (clientX - startX);
            let top = startTop + (clientY - startY);
            left = Math.min(Math.max(left, 5), window.innerWidth - dragPanel.offsetWidth - 5);
            top = Math.min(Math.max(top, 5), window.innerHeight - dragPanel.offsetHeight - 5);
            dragPanel.style.left = left + 'px';
            dragPanel.style.right = 'auto';
            dragPanel.style.bottom = 'auto';
            dragPanel.style.top = top + 'px';
        };
        
        const onUp = () => {
            isDrag = false;
            dragHandle.style.cursor = 'grab';
        };
        
        dragHandle.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            isDrag = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = dragPanel.offsetLeft;
            startTop = dragPanel.offsetTop;
            dragHandle.style.cursor = 'grabbing';
            e.preventDefault();
        });
        
        dragHandle.addEventListener('touchstart', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            const touch = e.touches[0];
            isDrag = true;
            startX = touch.clientX;
            startY = touch.clientY;
            startLeft = dragPanel.offsetLeft;
            startTop = dragPanel.offsetTop;
            dragHandle.style.cursor = 'grabbing';
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onMove);
        document.addEventListener('touchend', onUp);
        
        // Button events
        document.getElementById('closeTool').onclick = () => panel.remove();
        document.getElementById('startBtn').onclick = () => {
            if (isRunning) { addLog('Đang chạy!', 'error'); return; }
            let start = parseSBD(document.getElementById('startSBD').value);
            let end = parseSBD(document.getElementById('endSBD').value);
            if (isNaN(start) || isNaN(end) || start > end) { alert('SBD không hợp lệ'); return; }
            currentSBD = start;
            endSBD = end;
            addLog(`🚀 Bắt đầu: ${formatSBD(start)} → ${formatSBD(end)}`, 'success');
            startLoop();
        };
        document.getElementById('pauseBtn').onclick = () => {
            if (isRunning) {
                isRunning = false;
                addLog('⏸ Đã dừng', 'info');
            }
        };
        document.getElementById('singleBtn').onclick = async () => {
            if (isRunning) { addLog('Đang chạy, hãy dừng trước', 'error'); return; }
            let sbd = parseSBD(document.getElementById('singleSBD').value);
            if (isNaN(sbd)) { alert('Nhập SBD (VD: 80123)'); return; }
            isRunning = true;
            currentSBD = sbd;
            endSBD = sbd;
            document.getElementById('currentSBDDisplay').innerText = formatSBD(sbd);
            addLog(`🎯 Tra riêng ${formatSBD(sbd)}`, 'success');
            startLoop();
        };
        document.getElementById('resetBtn').onclick = () => {
            isRunning = false;
            results = [];
            renderResults();
            addLog('🔄 Đã reset', 'info');
        };
        document.getElementById('exportCSV').onclick = exportCSV;
        document.getElementById('exportJSON').onclick = exportJSON;
        
        renderResults();
        addLog('✅ Sẵn sàng! Kéo thả menu bằng thanh tiêu đề', 'success');
    }
    
    // Khởi tạo khi trang load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(createPanel, 500));
    } else {
        setTimeout(createPanel, 500);
    }
})();
