// ==UserScript==
// @name         Tra cứu điểm hàng loạt - Hà Tĩnh
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Tự động tra cứu SBD từ 080001 trở lên, hỗ trợ nhập captcha thủ công
// @author       You
// @match        https://hatinh.edu.vn/tracuudiemthi_ts10*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ===== CẤU HÌNH =====
    let currentSBD = 80001;        // SBD bắt đầu (080001)
    let maxSBD = 81000;            // SBD kết thúc (tạm dừng ở 081000, bạn sửa tùy ý)
    let isRunning = false;
    let currentCaptchaCode = '';
    let resultList = [];            // Lưu kết quả tìm được

    // ===== TẠO GIAO DIỆN =====
    const panel = document.createElement('div');
    panel.innerHTML = `
        <div style="position: fixed; bottom: 20px; right: 20px; z-index: 99999; background: #2c3e50; color: white; padding: 15px; border-radius: 8px; width: 320px; font-family: monospace; font-size: 13px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                <strong>🔍 TRA CỨU HÀNG LOẠT</strong>
                <button id="closePanel" style="background: none; border: none; color: white; cursor: pointer;">✖</button>
            </div>
            <div style="margin-bottom: 8px;">
                <label>SBD hiện tại: <span id="sbdDisplay" style="font-weight: bold; color: #f1c40f;">080001</span></label>
            </div>
            <div style="margin-bottom: 8px;">
                <label>SBD kết thúc: <input type="number" id="maxSBDInput" value="81000" style="width: 100px; margin-left: 5px;"></label>
            </div>
            <div style="margin-bottom: 8px;">
                <label>Nhập captcha: 
                    <input type="text" id="captchaInput" style="width: 100px; margin-left: 5px;" placeholder="Mã">
                    <button id="submitCaptchaBtn" style="margin-left: 5px;">✅ Gửi</button>
                </label>
            </div>
            <div style="margin-bottom: 8px;">
                <button id="startBtn" style="background: #27ae60; color: white; border: none; padding: 5px 10px; cursor: pointer;">▶ Bắt đầu</button>
                <button id="pauseBtn" style="background: #e67e22; color: white; border: none; padding: 5px 10px; cursor: pointer;">⏸ Tạm dừng</button>
                <button id="resetBtn" style="background: #e74c3c; color: white; border: none; padding: 5px 10px; cursor: pointer;">🔄 Reset</button>
            </div>
            <div style="margin-top: 8px; max-height: 200px; overflow-y: auto; font-size: 11px; background: #1a252f; padding: 5px; border-radius: 4px;">
                <div id="logArea">✅ Sẵn sàng. Nhấn Bắt đầu.<br></div>
            </div>
            <div style="margin-top: 8px;">
                <button id="exportBtn" style="background: #3498db; color: white; border: none; padding: 3px 8px; cursor: pointer;">📋 Xuất kết quả</button>
            </div>
        </div>
    `;
    document.body.appendChild(panel);

    // Đóng panel
    document.getElementById('closePanel').onclick = () => panel.remove();

    // ===== LOG =====
    function log(msg) {
        const logDiv = document.getElementById('logArea');
        if (logDiv) {
            logDiv.innerHTML += `📌 ${new Date().toLocaleTimeString()} - ${msg}<br>`;
            logDiv.scrollTop = logDiv.scrollHeight;
        }
        console.log(msg);
    }

    // ===== CẬP NHẬT SBD HIỂN THỊ =====
    function updateDisplay() {
        const sbdDisplay = document.getElementById('sbdDisplay');
        if (sbdDisplay) {
            sbdDisplay.innerText = String(currentSBD).padStart(6, '0');
        }
    }

    // ===== CHỌN NĂM (mặc định 2026) =====
    function selectYear2026() {
        const yearLink = document.querySelector('#list-scoreTable16 a.dataset-link[data-id="6a20d0ef6a8b6fc19307df36"]');
        if (yearLink) {
            yearLink.click();
            setTimeout(() => log('✅ Đã chọn năm 2026'), 500);
        } else {
            log('⚠️ Không tìm thấy link năm 2026');
        }
    }

    // ===== NHẬP SBD =====
    function enterSBD(sbd) {
        const sbdInput = document.querySelector('#searchForm16 input[name="keyword"]');
        if (sbdInput) {
            sbdInput.value = String(sbd).padStart(6, '0');
            log(`📝 Đã nhập SBD: ${String(sbd).padStart(6, '0')}`);
            return true;
        }
        log('❌ Không tìm thấy ô nhập SBD');
        return false;
    }

    // ===== LẤY ẢNH CAPTCHA MỚI =====
    function refreshCaptcha() {
        const refreshBtn = document.querySelector('.captcha-refresh');
        if (refreshBtn) {
            refreshBtn.click();
            log('🔄 Đã làm mới captcha');
        }
    }

    // ===== SUBMIT FORM =====
    function submitForm() {
        const submitBtn = document.querySelector('#searchForm16 button[type="submit"]');
        if (submitBtn) {
            submitBtn.click();
            log('⏳ Đã gửi form, đợi kết quả...');
            return true;
        }
        return false;
    }

    // ===== THEO DÕI KẾT QUẢ =====
    function waitForResult(sbd) {
        return new Promise((resolve) => {
            let attempts = 0;
            const observer = new MutationObserver((mutations, obs) => {
                const dataDiv = document.querySelector('#data16');
                if (dataDiv && dataDiv.innerHTML.length > 0 && !dataDiv.innerHTML.includes('Đang tải')) {
                    const html = dataDiv.innerHTML;
                    // Kiểm tra có bảng kết quả không
                    if (html.includes('Điểm môn Toán') || html.includes('không tìm thấy') || html.includes('Sai mã bảo mật')) {
                        obs.disconnect();
                        if (html.includes('không tìm thấy')) {
                            log(`❌ SBD ${String(sbd).padStart(6, '0')}: KHÔNG có kết quả`);
                            resolve({ found: false, data: null });
                        } else if (html.includes('Sai mã bảo mật')) {
                            log(`⚠️ SBD ${String(sbd).padStart(6, '0')}: CAPTCHA SAI`);
                            resolve({ found: false, error: 'captcha_error' });
                        } else {
                            // Parse thông tin từ bảng
                            const nameMatch = html.match(/<td>080001<\/td>\s*<td>([^<]+)<\/td>/);
                            const name = nameMatch ? nameMatch[1] : 'Không rõ';
                            log(`🎉 SBD ${String(sbd).padStart(6, '0')}: TÌM THẤY - ${name}`);
                            resolve({ found: true, data: html, name: name });
                        }
                        return;
                    }
                }
                attempts++;
                if (attempts > 30) { // timeout 15 giây
                    obs.disconnect();
                    log(`⏰ Timeout SBD ${String(sbd).padStart(6, '0')}`);
                    resolve({ found: false, error: 'timeout' });
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                resolve({ found: false, error: 'timeout' });
            }, 15000);
        });
    }

    // ===== XỬ LÝ MỘT SBD =====
    async function processOneSBD(sbd) {
        // 1. Nhập SBD
        enterSBD(sbd);
        await new Promise(r => setTimeout(r, 300));
        
        // 2. Làm mới captcha
        refreshCaptcha();
        await new Promise(r => setTimeout(r, 500));
        
        // 3. Đợi người dùng nhập captcha (cơ chế promise)
        log(`✏️ Vui lòng nhập captcha cho SBD ${String(sbd).padStart(6, '0')}`);
        
        const captcha = await waitForCaptchaInput();
        if (!captcha) {
            log(`⚠️ Bỏ qua SBD ${sbd} do không nhập captcha`);
            return { success: false, skip: true };
        }
        
        // 4. Nhập captcha vào form
        const captchaInput = document.querySelector('#searchForm16 input#captcha_code');
        if (captchaInput) {
            captchaInput.value = captcha;
            log(`🔐 Đã nhập captcha: ${captcha}`);
        }
        
        // 5. Submit
        submitForm();
        
        // 6. Chờ kết quả
        const result = await waitForResult(sbd);
        
        if (result.found) {
            resultList.push({
                sbd: String(sbd).padStart(6, '0'),
                name: result.name,
                html: result.data
            });
            log(`✅ ĐÃ LƯU: ${String(sbd).padStart(6, '0')} - ${result.name}`);
        } else if (result.error === 'captcha_error') {
            log(`🔄 Captcha sai, sẽ thử lại SBD ${sbd}`);
            return { success: false, retry: true };
        }
        
        return { success: result.found, retry: false };
    }
    
    // ===== HÀM ĐỢI NHẬP CAPTCHA =====
    let captchaResolver = null;
    function waitForCaptchaInput() {
        return new Promise((resolve) => {
            captchaResolver = resolve;
            // Hiển thị ô nhập captcha nổi bật
            const input = document.getElementById('captchaInput');
            if (input) {
                input.value = '';
                input.focus();
                input.style.border = '2px solid #f1c40f';
                setTimeout(() => {
                    if (input) input.style.border = '';
                }, 1000);
            }
        });
    }
    
    // Bắt sự kiện từ nút Gửi captcha
    document.getElementById('submitCaptchaBtn').onclick = () => {
        const input = document.getElementById('captchaInput');
        if (input && captchaResolver) {
            const code = input.value.trim();
            if (code) {
                captchaResolver(code);
                captchaResolver = null;
                input.value = '';
                log(`📨 Đã nhận captcha: ${code}`);
            } else {
                alert('Vui lòng nhập captcha!');
            }
        }
    };
    
    // ===== VÒNG LẶP CHÍNH =====
    async function startLoop() {
        if (isRunning) return;
        isRunning = true;
        
        // Chọn năm 2026
        selectYear2026();
        await new Promise(r => setTimeout(r, 1000));
        
        while (currentSBD <= maxSBD && isRunning) {
            updateDisplay();
            const result = await processOneSBD(currentSBD);
            
            if (result.retry) {
                // Thử lại cùng SBD
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }
            
            // Chuyển SBD tiếp theo
            currentSBD++;
            await new Promise(r => setTimeout(r, 500));
        }
        
        if (currentSBD > maxSBD) {
            log('🏁 HOÀN THÀNH! Đã tra cứu xong toàn bộ SBD.');
        }
        isRunning = false;
    }
    
    // ===== NÚT ĐIỀU KHIỂN =====
    document.getElementById('startBtn').onclick = () => {
        if (isRunning) {
            log('⚠️ Đang chạy, không thể bắt đầu lại');
            return;
        }
        const maxVal = parseInt(document.getElementById('maxSBDInput').value);
        if (!isNaN(maxVal) && maxVal > currentSBD) {
            maxSBD = maxVal;
        }
        log(`🚀 Bắt đầu từ SBD ${String(currentSBD).padStart(6, '0')} đến ${String(maxSBD).padStart(6, '0')}`);
        startLoop();
    };
    
    document.getElementById('pauseBtn').onclick = () => {
        if (isRunning) {
            isRunning = false;
            log('⏸ Đã tạm dừng. Nhấn Bắt đầu để tiếp tục.');
        } else {
            log('⚠️ Chưa chạy hoặc đã dừng');
        }
    };
    
    document.getElementById('resetBtn').onclick = () => {
        isRunning = false;
        currentSBD = 80001;
        maxSBD = 81000;
        document.getElementById('maxSBDInput').value = 81000;
        resultList = [];
        updateDisplay();
        log('🔄 Đã reset. SBD bắt đầu: 080001');
    };
    
    document.getElementById('exportBtn').onclick = () => {
        if (resultList.length === 0) {
            alert('Chưa có kết quả nào!');
            return;
        }
        let text = 'SBD,Họ tên\n';
        resultList.forEach(r => {
            text += `${r.sbd},${r.name}\n`;
        });
        const blob = new Blob([text], { type: 'text/csv' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `ketqua_sbd_${new Date().toISOString().slice(0,19)}.csv`;
        link.click();
        log(`📁 Đã xuất ${resultList.length} kết quả ra CSV`);
    };
    
    updateDisplay();
    log('✅ Tool đã sẵn sàng! Nhấn "Bắt đầu" để chạy.');
})();
