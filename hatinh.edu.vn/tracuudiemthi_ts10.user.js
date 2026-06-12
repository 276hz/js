// ==UserScript==
// @name         Tra cứu điểm tự động - Hà Tĩnh (Pro)
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Auto tra cứu SBD theo khoảng hoặc đơn lẻ, lưu kết quả, xuất CSV/JSON
// @match        https://hatinh.edu.vn/tracuudiemthi_ts10*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ===== TRẠNG THÁI =====
    let state = {
        isRunning: false,
        currentSBD: null,
        startSBD: 80001,
        endSBD: 81000,
        results: [],           // [{ sbd, name, toan, anh, van, uutien, khuyenkhich, tong, total: true }]
        logs: []
    };

    // ===== HÀM LOG =====
    function addLog(msg, type = 'info') {
        const time = new Date().toLocaleTimeString();
        state.logs.unshift({ time, msg, type });
        if (state.logs.length > 100) state.logs.pop();
        renderLogs();
        console.log(`[${time}] ${msg}`);
    }

    // ===== HIỂN THỊ LOGS =====
    function renderLogs() {
        const container = document.getElementById('logContainer');
        if (!container) return;
        container.innerHTML = state.logs.map(log => 
            `<div style="color: ${log.type === 'error' ? '#e74c3c' : (log.type === 'success' ? '#2ecc71' : '#bdc3c7')}; border-bottom: 1px solid #34495e; padding: 4px 0;">
                <span style="color: #7f8c8d; font-size: 10px;">[${log.time}]</span> ${log.msg}
            </div>`
        ).join('');
    }

    // ===== HIỂN THỊ KẾT QUẢ =====
    function renderResults() {
        const tbody = document.getElementById('resultTableBody');
        if (!tbody) return;
        tbody.innerHTML = state.results.map(r => `
            <tr style="border-bottom: 1px solid #34495e;">
                <td style="padding: 4px;">${r.sbd}</td>
                <td style="padding: 4px;">${r.name || '---'}</td>
                <td style="padding: 4px;">${r.toan || '---'}</td>
                <td style="padding: 4px;">${r.anh || '---'}</td>
                <td style="padding: 4px;">${r.van || '---'}</td>
                <td style="padding: 4px;">${r.tong || '---'}</td>
            </tr>
        `).join('');
        document.getElementById('resultCount').innerText = state.results.length;
    }

    // ===== PARSE ĐIỂM TỪ HTML =====
    function parseScoreFromHTML(html, sbd) {
        try {
            // Tìm dòng có SBD trong bảng
            const sbdStr = String(sbd).padStart(6, '0');
            const regex = new RegExp(`${sbdStr}<\/td>\\s*<td>([^<]+)<\/td>\\s*<td>([^<]+)<\/td>\\s*<td>([^<]+)<\/td>\\s*<td>([^<]+)<\/td>\\s*<td>([^<]+)<\/td>\\s*<td>([^<]+)<\/td>\\s*<td>([^<]+)<\/td>`, 'i');
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
                    tong: match[7].trim(),
                    total: true
                };
            }
            return null;
        } catch(e) {
            addLog(`Lỗi parse HTML cho SBD ${sbd}: ${e.message}`, 'error');
            return null;
        }
    }

    // ===== CÁC HÀM THAO TÁC DOM =====
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
            input.value = String(sbd).padStart(6, '0');
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

    // ===== CHỜ KẾT QUẢ =====
    function waitForResult(sbd, timeout = 15000) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const checkInterval = setInterval(() => {
                const dataDiv = document.querySelector('#data16');
                if (dataDiv && dataDiv.innerHTML.length > 0) {
                    const html = dataDiv.innerHTML;
                    if (html.includes('Sai mã bảo mật') || html.includes('Mã bảo mật không đúng')) {
                        clearInterval(checkInterval);
                        resolve({ status: 'captcha_error', html });
                    } else if (html.includes('không tìm thấy') || html.includes('Không có dữ liệu')) {
                        clearInterval(checkInterval);
                        resolve({ status: 'not_found', html });
                    } else if (html.includes('Điểm môn Toán') && html.includes('</table>')) {
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

    // ===== XỬ LÝ MỘT SBD (có nhập captcha thủ công) =====
    async function processOneSBD(sbd) {
        addLog(`🔍 Đang xử lý SBD ${String(sbd).padStart(6, '0')}...`);
        
        // Nhập SBD
        enterSBD(sbd);
        await new Promise(r => setTimeout(r, 300));
        
        // Refresh captcha
        refreshCaptcha();
        await new Promise(r => setTimeout(r, 500));
        
        // Tạo promise đợi captcha từ người dùng
        const captcha = await new Promise((resolve) => {
            // Hiển thị ô nhập captcha nổi bật
            const captchaInput = document.getElementById('captchaInput');
            const submitBtn = document.getElementById('submitCaptchaBtn');
            const tempHandler = (code) => {
                captchaInput.removeEventListener('keypress', keyHandler);
                submitBtn.removeEventListener('click', clickHandler);
                resolve(code);
            };
            const keyHandler = (e) => {
                if (e.key === 'Enter') {
                    const code = captchaInput.value.trim();
                    if (code) tempHandler(code);
                }
            };
            const clickHandler = () => {
                const code = captchaInput.value.trim();
                if (code) tempHandler(code);
            };
            captchaInput.addEventListener('keypress', keyHandler);
            submitBtn.addEventListener('click', clickHandler);
            captchaInput.value = '';
            captchaInput.style.border = '2px solid #f39c12';
            captchaInput.focus();
            addLog(`📷 Vui lòng nhập captcha cho SBD ${String(sbd).padStart(6, '0')}`, 'info');
            
            // Timeout sau 30s nếu không nhập -> bỏ qua SBD này
            setTimeout(() => {
                if (captchaInput && submitBtn) {
                    captchaInput.removeEventListener('keypress', keyHandler);
                    submitBtn.removeEventListener('click', clickHandler);
                    captchaInput.style.border = '';
                    resolve(null);
                }
            }, 30000);
        });
        
        if (!captcha) {
            addLog(`⏭️ Bỏ qua SBD ${sbd} do không nhập captcha`, 'error');
            return { status: 'skipped' };
        }
        
        // Nhập captcha vào form
        setCaptchaCode(captcha);
        document.getElementById('captchaInput').style.border = '';
        await new Promise(r => setTimeout(r, 200));
        
        // Submit
        submitForm();
        
        // Chờ kết quả
        const result = await waitForResult(sbd);
        
        if (result.status === 'captcha_error') {
            addLog(`❌ Captcha sai cho SBD ${sbd}, thử lại...`, 'error');
            return { status: 'captcha_error' };
        } else if (result.status === 'found') {
            const scoreData = parseScoreFromHTML(result.html, sbd);
            if (scoreData) {
                state.results.unshift(scoreData);
                renderResults();
                addLog(`✅ TÌM THẤY: ${scoreData.sbd} - ${scoreData.name} (Toán: ${scoreData.toan}, Văn: ${scoreData.van}, Anh: ${scoreData.anh}, Tổng: ${scoreData.tong})`, 'success');
                return { status: 'found', data: scoreData };
            } else {
                addLog(`⚠️ Có kết quả nhưng parse lỗi SBD ${sbd}`, 'error');
                return { status: 'parse_error' };
            }
        } else if (result.status === 'not_found') {
            addLog(`❌ Không tìm thấy điểm cho SBD ${sbd}`, 'info');
            return { status: 'not_found' };
        } else {
            addLog(`⏰ Timeout SBD ${sbd}`, 'error');
            return { status: 'timeout' };
        }
    }

    // ===== VÒNG LẶP CHÍNH =====
    async function startLoop() {
        if (state.isRunning) {
            addLog('⚠️ Tool đang chạy, không thể bắt đầu lại', 'error');
            return;
        }
        
        state.isRunning = true;
        await selectYear2026();
        
        for (let sbd = state.currentSBD; sbd <= state.endSBD; sbd++) {
            if (!state.isRunning) {
                addLog('⏸ Đã dừng theo yêu cầu', 'info');
                break;
            }
            state.currentSBD = sbd;
            document.getElementById('currentSBDDisplay').innerText = String(sbd).padStart(6, '0');
            
            let retryCount = 0;
            let success = false;
            while (retryCount < 3 && !success && state.isRunning) {
                const result = await processOneSBD(sbd);
                if (result.status === 'found' || result.status === 'not_found') {
                    success = true;
                } else if (result.status === 'captcha_error') {
                    retryCount++;
                    if (retryCount < 3) {
                        addLog(`🔄 Thử lại SBD ${sbd} (lần ${retryCount+1}/3)`, 'info');
                        await new Promise(r => setTimeout(r, 1000));
                    } else {
                        addLog(`❌ Bỏ qua SBD ${sbd} sau 3 lần captcha sai`, 'error');
                    }
                } else {
                    retryCount++;
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
            
            // Delay giữa các SBD
            await new Promise(r => setTimeout(r, 500));
        }
        
        state.isRunning = false;
        addLog('🏁 HOÀN THÀNH! Đã tra cứu xong toàn bộ SBD.', 'success');
    }

    // ===== TẢI KẾT QUẢ =====
    function exportToCSV() {
        if (state.results.length === 0) {
            alert('Chưa có kết quả nào!');
            return;
        }
        const headers = ['SBD', 'Họ tên', 'Toán', 'Tiếng Anh', 'Ngữ văn', 'Điểm ưu tiên', 'Điểm khuyến khích', 'Tổng điểm'];
        const rows = state.results.map(r => [r.sbd, r.name, r.toan, r.anh, r.van, r.uutien, r.khuyenkhich, r.tong]);
        const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `tracuu_diem_${new Date().toISOString().slice(0,19)}.csv`;
        link.click();
        addLog(`📁 Đã xuất ${state.results.length} kết quả ra CSV`, 'success');
    }

    function exportToJSON() {
        if (state.results.length === 0) {
            alert('Chưa có kết quả nào!');
            return;
        }
        const json = JSON.stringify(state.results, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `tracuu_diem_${new Date().toISOString().slice(0,19)}.json`;
        link.click();
        addLog(`📁 Đã xuất ${state.results.length} kết quả ra JSON`, 'success');
    }

    // ===== TẠO GIAO DIỆN =====
    function createPanel() {
        const panel = document.createElement('div');
        panel.id = 'autoToolPanel';
        panel.innerHTML = `
            <div style="position: fixed; bottom: 20px; right: 20px; z-index: 99999; background: #1e2a3a; color: #ecf0f1; width: 480px; max-width: 90vw; border-radius: 12px; font-family: 'Segoe UI', monospace; font-size: 12px; box-shadow: 0 8px 20px rgba(0,0,0,0.4); display: flex; flex-direction: column; overflow: hidden;">
                
                <!-- Header -->
                <div style="background: #0f1720; padding: 10px 15px; display: flex; justify-content: space-between; align-items: center; cursor: move;">
                    <strong style="font-size: 14px;">🔍 AUTO TRA CỨU ĐIỂM TS10 - HÀ TĨNH</strong>
                    <button id="closeTool" style="background: none; border: none; color: #95a5a6; cursor: pointer; font-size: 18px;">&times;</button>
                </div>
                
                <!-- Input area -->
                <div style="padding: 12px 15px; background: #0f1720; border-bottom: 1px solid #2c3e50;">
                    <div style="display: flex; gap: 10px; margin-bottom: 10px; flex-wrap: wrap;">
                        <div style="flex: 1;">
                            <label style="font-size: 11px; color: #bdc3c7;">SBD bắt đầu</label>
                            <input type="number" id="startSBD" value="80001" style="width: 100%; padding: 5px; background: #2c3e50; border: 1px solid #3d5a6c; color: white; border-radius: 4px;">
                        </div>
                        <div style="flex: 1;">
                            <label style="font-size: 11px; color: #bdc3c7;">SBD kết thúc</label>
                            <input type="number" id="endSBD" value="81000" style="width: 100%; padding: 5px; background: #2c3e50; border: 1px solid #3d5a6c; color: white; border-radius: 4px;">
                        </div>
                        <div style="flex: 1;">
                            <label style="font-size: 11px; color: #bdc3c7;">Tìm riêng (bỏ qua khoảng)</label>
                            <input type="number" id="singleSBD" placeholder="VD: 080123" style="width: 100%; padding: 5px; background: #2c3e50; border: 1px solid #3d5a6c; color: white; border-radius: 4px;">
                        </div>
                    </div>
                    
                    <!-- Captcha input row -->
                    <div style="display: flex; gap: 8px; align-items: center; margin-top: 8px;">
                        <input type="text" id="captchaInput" placeholder="Nhập mã captcha tại đây..." style="flex: 2; padding: 6px; background: #2c3e50; border: 1px solid #f39c12; color: white; border-radius: 4px; font-size: 13px;">
                        <button id="submitCaptchaBtn" style="background: #f39c12; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold;">📨 Gửi captcha</button>
                    </div>
                </div>
                
                <!-- Control buttons -->
                <div style="padding: 12px 15px; background: #0f1720; display: flex; gap: 8px; flex-wrap: wrap; border-bottom: 1px solid #2c3e50;">
                    <button id="startBtn" style="background: #27ae60; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; color: white;">▶ Bắt đầu</button>
                    <button id="pauseBtn" style="background: #e67e22; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; color: white;">⏸ Tạm dừng</button>
                    <button id="singleBtn" style="background: #3498db; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; color: white;">🎯 Tra SBD riêng</button>
                    <button id="resetBtn" style="background: #e74c3c; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; color: white;">🔄 Reset</button>
                    <button id="exportCSV" style="background: #2c3e50; border: 1px solid #3498db; padding: 6px 12px; border-radius: 4px; cursor: pointer; color: #ecf0f1;">📄 CSV</button>
                    <button id="exportJSON" style="background: #2c3e50; border: 1px solid #3498db; padding: 6px 12px; border-radius: 4px; cursor: pointer; color: #ecf0f1;">📋 JSON</button>
                </div>
                
                <!-- Status bar -->
                <div style="padding: 8px 15px; background: #0f1720; display: flex; justify-content: space-between; font-size: 11px; border-bottom: 1px solid #2c3e50;">
                    <span>📌 Đang xử lý: <strong id="currentSBDDisplay">---</strong></span>
                    <span>📊 Đã thu thập: <strong id="resultCount">0</strong> kết quả</span>
                </div>
                
                <!-- Results table -->
                <div style="max-height: 250px; overflow-y: auto; background: #0f1720;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                        <thead style="background: #1a252f; position: sticky; top: 0;">
                            <tr>
                                <th style="padding: 6px; text-align: left;">SBD</th>
                                <th style="padding: 6px; text-align: left;">Họ tên</th>
                                <th style="padding: 6px; text-align: left;">Toán</th>
                                <th style="padding: 6px; text-align: left;">Anh</th>
                                <th style="padding: 6px; text-align: left;">Văn</th>
                                <th style="padding: 6px; text-align: left;">Tổng</th>
                            </tr>
                        </thead>
                        <tbody id="resultTableBody"></tbody>
                    </table>
                </div>
                
                <!-- Logs -->
                <div style="max-height: 150px; overflow-y: auto; background: #0f1720; border-top: 1px solid #2c3e50; padding: 8px 12px; font-family: monospace; font-size: 10px;">
                    <div id="logContainer"></div>
                </div>
            </div>
        `;
        document.body.appendChild(panel);
        
        // Bind events
        document.getElementById('closeTool').onclick = () => panel.remove();
        document.getElementById('startBtn').onclick = async () => {
            if (state.isRunning) return;
            const start = parseInt(document.getElementById('startSBD').value);
            const end = parseInt(document.getElementById('endSBD').value);
            if (isNaN(start) || isNaN(end) || start > end) {
                alert('SBD bắt đầu phải nhỏ hơn SBD kết thúc');
                return;
            }
            state.startSBD = start;
            state.endSBD = end;
            state.currentSBD = start;
            addLog(`🚀 Bắt đầu từ SBD ${String(start).padStart(6, '0')} đến ${String(end).padStart(6, '0')}`, 'success');
            startLoop();
        };
        document.getElementById('pauseBtn').onclick = () => {
            if (state.isRunning) {
                state.isRunning = false;
                addLog('⏸ Đã tạm dừng', 'info');
            } else {
                addLog('⚠️ Tool không chạy', 'error');
            }
        };
        document.getElementById('singleBtn').onclick = async () => {
            if (state.isRunning) {
                addLog('⚠️ Đang chạy, hãy tạm dừng trước khi tra riêng', 'error');
                return;
            }
            const single = parseInt(document.getElementById('singleSBD').value);
            if (isNaN(single)) {
                alert('Nhập SBD cần tra (VD: 80123)');
                return;
            }
            state.isRunning = true;
            state.currentSBD = single;
            state.endSBD = single;
            document.getElementById('currentSBDDisplay').innerText = String(single).padStart(6, '0');
            addLog(`🎯 Tra riêng SBD ${String(single).padStart(6, '0')}`, 'success');
            await startLoop();
        };
        document.getElementById('resetBtn').onclick = () => {
            state.isRunning = false;
            state.results = [];
            state.currentSBD = parseInt(document.getElementById('startSBD').value) || 80001;
            renderResults();
            addLog('🔄 Đã reset danh sách kết quả', 'info');
        };
        document.getElementById('exportCSV').onclick = exportToCSV;
        document.getElementById('exportJSON').onclick = exportToJSON;
        
        renderResults();
        addLog('✅ Tool đã sẵn sàng. Chọn khoảng SBD và nhấn Bắt đầu.', 'success');
    }
    
    // Khởi tạo
    setTimeout(() => {
        if (!document.getElementById('autoToolPanel')) {
            createPanel();
        }
    }, 1000);
})();
