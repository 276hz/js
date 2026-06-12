// ==UserScript==
// @name         Tra cứu điểm tự động - Hà Tĩnh (Mobile)
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Auto tra cứu SBD, hỗ trợ mobile, tự động thêm số 0 đầu SBD
// @match        https://hatinh.edu.vn/tracuudiemthi_ts10*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Hàm chuyển SBD thành chuỗi 6 số (vd: 80001 -> "080001")
    function formatSBD(num) {
        return String(num).padStart(6, '0');
    }

    // Hàm đọc SBD từ input (hỗ trợ cả dạng 80001 và 080001)
    function parseSBD(inputValue) {
        let val = String(inputValue).replace(/\D/g, '');
        if (val.length === 5) val = '0' + val;
        return parseInt(val, 10);
    }

    let state = {
        isRunning: false,
        currentSBD: 80001,
        startSBD: 80001,
        endSBD: 81000,
        results: [],
        logs: []
    };

    function addLog(msg, type = 'info') {
        const time = new Date().toLocaleTimeString();
        state.logs.unshift({ time, msg, type });
        if (state.logs.length > 50) state.logs.pop();
        renderLogs();
        console.log(`[${time}] ${msg}`);
    }

    function renderLogs() {
        const container = document.getElementById('logContainer');
        if (!container) return;
        container.innerHTML = state.logs.slice(0, 20).map(log => 
            `<div style="color: ${log.type === 'error' ? '#f66' : (log.type === 'success' ? '#6f6' : '#aaa')}; border-bottom: 1px solid #2c3e50; padding: 4px 0; font-size: 11px;">
                <span style="color: #888;">[${log.time}]</span> ${log.msg}
            </div>`
        ).join('');
    }

    function renderResults() {
        const tbody = document.getElementById('resultTableBody');
        if (!tbody) return;
        tbody.innerHTML = state.results.map(r => `
            <tr style="border-bottom: 1px solid #2c3e50;">
                <td style="padding: 6px;">${r.sbd}</td>
                <td style="padding: 6px;">${r.name || '---'}</td>
                <td style="padding: 6px;">${r.toan || '---'}</td>
                <td style="padding: 6px;">${r.anh || '---'}</td>
                <td style="padding: 6px;">${r.van || '---'}</td>
                <td style="padding: 6px;">${r.tong || '---'}</td>
            </tr>
        `).join('');
        document.getElementById('resultCount').innerText = state.results.length;
    }

    function parseScoreFromHTML(html, sbd) {
        try {
            const sbdStr = formatSBD(sbd);
            // Regex tìm dòng trong bảng điểm
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
        } catch(e) {
            return null;
        }
    }

    // DOM actions
    function selectYear2026() {
        return new Promise((resolve) => {
            const yearLink = document.querySelector('#list-scoreTable16 a.dataset-link[data-id="6a20d0ef6a8b6fc19307df36"]');
            if (yearLink) {
                yearLink.click();
                setTimeout(resolve, 800);
            } else {
                resolve();
            }
        });
    }

    function enterSBD(sbd) {
        const input = document.querySelector('#searchForm16 input[name="keyword"]');
        if (input) {
            input.value = formatSBD(sbd);
            return true;
        }
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
        if (input) {
            input.value = code;
            return true;
        }
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
            const keyHandler = (e) => {
                if (e.key === 'Enter') handler();
            };
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
            document.getElementById('currentSBDDisplay').innerText = formatSBD(sbd);
            
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

    function exportCSV() {
        if (!state.results.length) { alert('Chưa có dữ liệu'); return; }
        const headers = ['SBD','Họ tên','Toán','Anh','Văn','Ưu tiên','KK','Tổng'];
        const rows = state.results.map(r => [r.sbd, r.name, r.toan, r.anh, r.van, r.uutien, r.khuyenkhich, r.tong]);
        const csv = [headers, ...rows].map(row => row.map(c => `"${c}"`).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `diem_${new Date().toISOString().slice(0,19)}.csv`;
        link.click();
        addLog(`📁 Xuất ${state.results.length} dòng CSV`, 'success');
    }

    function exportJSON() {
        if (!state.results.length) { alert('Chưa có dữ liệu'); return; }
        const blob = new Blob([JSON.stringify(state.results, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `diem_${new Date().toISOString().slice(0,19)}.json`;
        link.click();
        addLog(`📁 Xuất ${state.results.length} dòng JSON`, 'success');
    }

    function createPanel() {
        const panel = document.createElement('div');
        panel.id = 'autoToolPanel';
        panel.innerHTML = `
            <div style="position: fixed; bottom: 10px; right: 10px; left: 10px; z-index: 99999; background: #1e2a3a; color: #ecf0f1; border-radius: 12px; font-family: monospace; font-size: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); max-width: 500px; margin: auto;">
                <div style="background: #0f1720; padding: 10px; text-align: center; border-radius: 12px 12px 0 0;">
                    <strong>🔍 AUTO TS10 - HÀ TĨNH</strong>
                    <button id="closeTool" style="float: right; background: none; border: none; color: #aaa; font-size: 20px;">&times;</button>
                </div>
                <div style="padding: 10px;">
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <input type="number" id="startSBD" placeholder="Bắt đầu" value="80001" style="flex:1; padding: 8px; background:#2c3e50; border:none; color:white; border-radius:6px;">
                        <input type="number" id="endSBD" placeholder="Kết thúc" value="81000" style="flex:1; padding: 8px; background:#2c3e50; border:none; color:white; border-radius:6px;">
                        <input type="number" id="singleSBD" placeholder="Tra riêng (080123)" style="flex:1; padding: 8px; background:#2c3e50; border:none; color:white; border-radius:6px;">
                    </div>
                    <div style="display: flex; gap: 6px; margin-top: 8px;">
                        <input type="text" id="captchaInput" placeholder="Nhập captcha..." style="flex:2; padding: 8px; background:#2c3e50; border:1px solid #f39c12; color:white; border-radius:6px;">
                        <button id="submitCaptchaBtn" style="background:#f39c12; border:none; padding: 8px 12px; border-radius:6px;">Gửi</button>
                    </div>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px;">
                        <button id="startBtn" style="background:#27ae60; padding: 8px 12px; border:none; border-radius:6px; color:white;">▶ Bắt đầu</button>
                        <button id="pauseBtn" style="background:#e67e22; padding: 8px 12px; border:none; border-radius:6px; color:white;">⏸ Dừng</button>
                        <button id="singleBtn" style="background:#3498db; padding: 8px 12px; border:none; border-radius:6px; color:white;">🎯 Tra riêng</button>
                        <button id="resetBtn" style="background:#e74c3c; padding: 8px 12px; border:none; border-radius:6px; color:white;">Reset</button>
                        <button id="exportCSV" style="background:#2c3e50; border:1px solid #3498db; padding: 8px 12px; border-radius:6px; color:white;">CSV</button>
                        <button id="exportJSON" style="background:#2c3e50; border:1px solid #3498db; padding: 8px 12px; border-radius:6px; color:white;">JSON</button>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 8px; font-size: 11px;">
                        <span>📌 SBD: <strong id="currentSBDDisplay">---</strong></span>
                        <span>📊 Kết quả: <strong id="resultCount">0</strong></span>
                    </div>
                    <div style="max-height: 200px; overflow-y: auto; margin-top: 8px; background:#0f1720; border-radius:6px;">
                        <table style="width:100%; font-size: 10px; border-collapse: collapse;">
                            <thead><tr style="background:#1a252f;"><th>SBD</th><th>Tên</th><th>T</th><th>A</th><th>V</th><th>Tổng</th></tr></thead>
                            <tbody id="resultTableBody"></tbody>
                        </table>
                    </div>
                    <div id="logContainer" style="max-height: 120px; overflow-y: auto; margin-top: 8px; background:#0f1720; border-radius:6px; padding: 6px; font-size: 10px;"></div>
                </div>
            </div>
        `;
        document.body.appendChild(panel);
        
        document.getElementById('closeTool').onclick = () => panel.remove();
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
            document.getElementById('currentSBDDisplay').innerText = formatSBD(sbd);
            addLog(`🎯 Tra riêng SBD ${formatSBD(sbd)}`, 'success');
            await startLoop();
        };
        document.getElementById('resetBtn').onclick = () => {
            state.isRunning = false;
            state.results = [];
            renderResults();
            addLog('🔄 Đã reset', 'info');
        };
        document.getElementById('exportCSV').onclick = exportCSV;
        document.getElementById('exportJSON').onclick = exportJSON;
        renderResults();
        addLog('✅ Sẵn sàng! SBD tự động thêm số 0 (80001 → 080001)', 'success');
    }
    
    setTimeout(() => {
        if (!document.getElementById('autoToolPanel')) createPanel();
    }, 1000);
})();
