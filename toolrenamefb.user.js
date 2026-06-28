// ==UserScript==
// @name         🔥 Tool Rename FB Pro
// @namespace    http://tampermonkey.net/
// @version      3.0.0
// @description  Đồng bộ tên & ảnh Instagram sang Facebook | Draggable + Resizable
// @author       XERA FER
// @match        https://www.facebook.com/*
// @match        https://facebook.com/*
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    // ============================================
    // 🎨 CSS STYLES
    // ============================================
    GM_addStyle(`
        /* ===== CONTAINER ===== */
        .xera-container {
            position: fixed !important;
            z-index: 999999 !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            user-select: none !important;
        }
        
        /* ===== DRAG HANDLE ===== */
        .xera-header {
            background: linear-gradient(135deg, #1a73e8, #0d47a1) !important;
            color: white !important;
            padding: 12px 16px !important;
            border-radius: 12px 12px 0 0 !important;
            cursor: move !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            min-height: 44px !important;
        }
        
        .xera-header-title {
            font-size: 16px !important;
            font-weight: 700 !important;
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
        }
        
        .xera-header-title span {
            background: rgba(255,255,255,0.2) !important;
            padding: 2px 10px !important;
            border-radius: 20px !important;
            font-size: 10px !important;
        }
        
        .xera-header-actions {
            display: flex !important;
            gap: 6px !important;
        }
        
        .xera-header-btn {
            background: rgba(255,255,255,0.15) !important;
            border: none !important;
            color: white !important;
            width: 30px !important;
            height: 30px !important;
            border-radius: 6px !important;
            cursor: pointer !important;
            font-size: 14px !important;
            transition: all 0.2s !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
        }
        
        .xera-header-btn:hover {
            background: rgba(255,255,255,0.3) !important;
        }
        
        /* ===== BODY ===== */
        .xera-body {
            background: white !important;
            border-radius: 0 0 12px 12px !important;
            padding: 14px !important;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3) !important;
            overflow: hidden !important;
        }
        
        /* ===== RESIZE HANDLE ===== */
        .xera-resize {
            position: absolute !important;
            bottom: 0 !important;
            right: 0 !important;
            width: 16px !important;
            height: 16px !important;
            cursor: nwse-resize !important;
            background: linear-gradient(135deg, transparent 50%, #1a73e8 50%) !important;
            border-radius: 0 0 12px 0 !important;
            opacity: 0.6 !important;
            transition: opacity 0.2s !important;
        }
        
        .xera-resize:hover {
            opacity: 1 !important;
        }
        
        /* ===== OPTIONS ===== */
        .xera-option {
            padding: 10px 14px !important;
            margin: 6px 0 !important;
            border-radius: 10px !important;
            border: 2px solid #e8ecf1 !important;
            cursor: pointer !important;
            transition: all 0.2s ease !important;
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
            background: white !important;
        }
        
        .xera-option:hover {
            border-color: #1a73e8 !important;
            background: #f0f7ff !important;
            transform: translateX(4px) !important;
        }
        
        .xera-option .icon {
            font-size: 20px !important;
            width: 36px !important;
            text-align: center !important;
            flex-shrink: 0 !important;
        }
        
        .xera-option .info {
            flex: 1 !important;
            min-width: 0 !important;
        }
        
        .xera-option .info .name {
            font-weight: 600 !important;
            color: #1a1a1a !important;
            font-size: 13px !important;
        }
        
        .xera-option .info .desc {
            font-size: 11px !important;
            color: #888 !important;
            margin-top: 1px !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
        }
        
        .xera-option .badge {
            background: #1a73e8 !important;
            color: white !important;
            padding: 2px 10px !important;
            border-radius: 20px !important;
            font-size: 10px !important;
            flex-shrink: 0 !important;
        }
        
        .xera-option .badge.pro {
            background: linear-gradient(135deg, #f093fb, #f5576c) !important;
        }
        
        .xera-option .badge.custom {
            background: linear-gradient(135deg, #4facfe, #00f2fe) !important;
        }
        
        .xera-divider {
            border: none !important;
            border-top: 2px solid #e8ecf1 !important;
            margin: 10px 0 !important;
        }
        
        .xera-footer {
            text-align: center !important;
            font-size: 10px !important;
            color: #bbb !important;
            margin-top: 10px !important;
            padding-top: 10px !important;
            border-top: 1px solid #e8ecf1 !important;
        }
        
        .xera-footer a {
            color: #1a73e8 !important;
            text-decoration: none !important;
        }
        
        /* ===== MINIMIZED ===== */
        .xera-minimized .xera-body {
            display: none !important;
        }
        
        .xera-minimized .xera-resize {
            display: none !important;
        }
        
        .xera-minimized .xera-header {
            border-radius: 12px !important;
            cursor: pointer !important;
        }
        
        /* ===== STATUS ===== */
        .xera-status {
            position: fixed !important;
            top: 20px !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            z-index: 9999999 !important;
            padding: 14px 24px !important;
            border-radius: 12px !important;
            background: white !important;
            box-shadow: 0 8px 30px rgba(0,0,0,0.2) !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            display: none !important;
            align-items: center !important;
            gap: 12px !important;
            animation: xeraSlideDown 0.3s ease !important;
            max-width: 90% !important;
            border-left: 5px solid #1a73e8 !important;
        }
        
        .xera-status.success { border-left-color: #34a853 !important; }
        .xera-status.error { border-left-color: #ea4335 !important; }
        .xera-status.loading { border-left-color: #fbbc04 !important; }
        
        .xera-status .xera-status-icon { font-size: 22px !important; }
        .xera-status .xera-status-msg { font-size: 14px !important; color: #333 !important; font-weight: 500 !important; }
        .xera-status .xera-status-sub { font-size: 12px !important; color: #888 !important; margin-top: 2px !important; }
        
        @keyframes xeraSlideDown {
            from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
            to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        
        /* ===== SCROLLBAR ===== */
        .xera-body::-webkit-scrollbar {
            width: 4px !important;
        }
        .xera-body::-webkit-scrollbar-track {
            background: #f1f1f1 !important;
            border-radius: 10px !important;
        }
        .xera-body::-webkit-scrollbar-thumb {
            background: #c1c1c1 !important;
            border-radius: 10px !important;
        }
    `);

    // ============================================
    // 🛠️ CORE FUNCTIONS
    // ============================================
    function ClientMutation() {
        return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11)
            .replace(/[018]/g, c => 
                (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4)
                .toString(16)
            );
    }

    function showStatus(icon, msg, sub, type) {
        let status = document.querySelector('.xera-status');
        if(!status) {
            status = document.createElement('div');
            status.className = 'xera-status';
            status.innerHTML = `
                <span class="xera-status-icon"></span>
                <div>
                    <div class="xera-status-msg"></div>
                    <div class="xera-status-sub"></div>
                </div>
            `;
            document.body.appendChild(status);
        }
        status.className = 'xera-status ' + type;
        status.style.display = 'flex';
        status.querySelector('.xera-status-icon').textContent = icon;
        status.querySelector('.xera-status-msg').textContent = msg;
        status.querySelector('.xera-status-sub').textContent = sub || '';
        
        if(type !== 'loading') {
            clearTimeout(status._timeout);
            status._timeout = setTimeout(() => {
                status.style.display = 'none';
            }, 5000);
        }
    }

    function hideStatus() {
        const status = document.querySelector('.xera-status');
        if(status) status.style.display = 'none';
    }

    // ============================================
    // 🚀 EXECUTE
    // ============================================
    async function executeAction(choice) {
        hideStatus();
        
        let dtsg, userid;
        try {
            dtsg = require(["DTSGInitData"]).token;
            userid = require(["CurrentUserInitialData"]).USER_ID;
        } catch(e) {
            showStatus('❌', 'Chưa đăng nhập!', 'Vui lòng đăng nhập Facebook', 'error');
            return;
        }
        
        if(!dtsg || !userid || userid === "0") {
            showStatus('❌', 'Lỗi token!', 'Đăng nhập lại Facebook', 'error');
            return;
        }

        let needUid = ["1","2","3","5"].includes(choice);
        let uid = "", newName = "";
        
        if(needUid) {
            uid = prompt("📸 Nhập UID Instagram:\n(Ví dụ: vanvy.nguyen)", "");
            if(!uid) return;
            uid = uid.split("/").pop().split("?")[0];
        }
        
        if(["4","5"].includes(choice)) {
            newName = prompt("✏️ Nhập tên mới (có icon/emoji):\n(Ví dụ: 🌸 VAN VY 🌸)", "");
            if(newName === null) return;
            newName = newName.trim();
            if(!newName) {
                showStatus('❌', 'Tên không được để trống!', '', 'error');
                return;
            }
        }
        
        // Build payload
        let resources = [], sourceOfTruth = [];
        let actionNames = {
            "1": "Đồng bộ tên + ảnh từ IG",
            "2": "Đồng bộ tên từ IG",
            "3": "Đồng bộ ảnh từ IG",
            "4": "Đổi tên thủ công",
            "5": "Đổi tên + đồng bộ ảnh từ IG"
        };
        
        if(!confirm(`🔄 Xác nhận:\n\n${actionNames[choice]}\n${needUid ? '🆔 IG: ' + uid : ''}\n${['4','5'].includes(choice) ? '📝 ' + newName : ''}\n\nTiếp tục?`)) return;
        
        switch(choice) {
            case "1": resources = ["NAME","PROFILE_PHOTO"]; sourceOfTruth = [{resource_source:"IG"},{resource_source:"FB"}]; break;
            case "2": resources = ["NAME"]; sourceOfTruth = [{resource_source:"IG"},{resource_source:"FB"}]; break;
            case "3": resources = ["PROFILE_PHOTO"]; sourceOfTruth = [{resource_source:"IG"},{resource_source:"FB"}]; break;
            case "4": resources = ["NAME"]; sourceOfTruth = [{resource_source:"FB"},{resource_source:"FB"}]; break;
            case "5": resources = ["NAME","PROFILE_PHOTO"]; sourceOfTruth = [{resource_source:"FB"},{resource_source:"IG"}]; break;
        }
        
        let variables = {
            client_mutation_id: ClientMutation(),
            accounts_to_sync: needUid ? [uid, userid] : [userid],
            resources_to_sync: resources,
            resources_to_unsync: null,
            scale: 3,
            source_of_truth_array: sourceOfTruth,
            source_account: userid,
            family_device_id: "device_id_fetch_datr",
            username_unsync_params: null,
            platform: "FACEBOOK",
            sync_logging_params: { client_flow_type: "IM_SETTINGS" },
            interface: "FB_WEB",
            feta_profile_sync: false
        };
        
        if(["4","5"].includes(choice)) {
            variables.full_name = newName;
            variables.first_name = newName.split(" ")[0] || newName;
            variables.last_name = newName.split(" ").slice(1).join(" ") || "";
        }
        
        showStatus('⏳', 'Đang đồng bộ...', 'Vui lòng chờ', 'loading');
        
        try {
            let resp = await fetch("https://accountscenter.facebook.com/api/graphql/", {
                method: "POST",
                body: "fb_dtsg=" + dtsg + "&__user=" + userid + "&variables=" + encodeURIComponent(JSON.stringify(variables)) + "&av=" + userid + "&fb_api_req_friendly_name=useFXIMUpdateNameMutation&fb_api_caller_class=RelayModern&server_timestamps=true&doc_id=9388416374608398",
                headers: { "Content-Type": "application/x-www-form-urlencoded" }
            });
            
            let result = await resp.json();
            
            if(result.errors) {
                showStatus('❌', 'Đồng bộ thất bại!', result.errors.map(e=>e.message||e).join("\n"), 'error');
            } else {
                let msg = "✅ Đồng bộ thành công!\n";
                if(resources.includes("NAME")) msg += "📝 Đã cập nhật tên\n";
                if(resources.includes("PROFILE_PHOTO")) msg += "📸 Đã đồng bộ ảnh\n";
                if(['4','5'].includes(choice)) msg += "✏️ " + newName;
                showStatus('✅', 'Thành công!', msg, 'success');
                setTimeout(() => {
                    if(confirm("🔄 Reload để thấy thay đổi?")) location.reload();
                }, 1500);
            }
        } catch(err) {
            showStatus('❌', 'Lỗi kết nối!', err.message || err, 'error');
        }
    }

    // ============================================
    // 🎨 BUILD UI
    // ============================================
    function buildUI() {
        // STATUS
        const status = document.createElement('div');
        status.className = 'xera-status';
        status.innerHTML = `
            <span class="xera-status-icon"></span>
            <div>
                <div class="xera-status-msg"></div>
                <div class="xera-status-sub"></div>
            </div>
        `;
        document.body.appendChild(status);

        // CONTAINER
        const container = document.createElement('div');
        container.className = 'xera-container';
        container.id = 'xera-container';
        container.style.cssText = `
            width: 340px;
            min-width: 280px;
            max-width: 500px;
            top: 80px;
            right: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            border-radius: 12px;
            background: white;
        `;

        // HEADER
        const header = document.createElement('div');
        header.className = 'xera-header';
        header.id = 'xera-header';
        header.innerHTML = `
            <div class="xera-header-title">
                🔥 Tool Rename FB
                <span>v3.0</span>
            </div>
            <div class="xera-header-actions">
                <button class="xera-header-btn" id="xera-minimize" title="Thu gọn">─</button>
                <button class="xera-header-btn" id="xera-close" title="Đóng">✕</button>
            </div>
        `;
        container.appendChild(header);

        // BODY
        const body = document.createElement('div');
        body.className = 'xera-body';
        body.id = 'xera-body';
        body.style.cssText = `
            max-height: 400px;
            overflow-y: auto;
        `;
        body.innerHTML = `
            <div class="xera-option" data-choice="1">
                <div class="icon">📝</div>
                <div class="info">
                    <div class="name">Đồng bộ tên + ảnh</div>
                    <div class="desc">Copy tên và ảnh từ Instagram</div>
                </div>
                <span class="badge">Full</span>
            </div>
            
            <div class="xera-option" data-choice="2">
                <div class="icon">✏️</div>
                <div class="info">
                    <div class="name">Chỉ đồng bộ tên</div>
                    <div class="desc">Copy tên từ Instagram</div>
                </div>
            </div>
            
            <div class="xera-option" data-choice="3">
                <div class="icon">📸</div>
                <div class="info">
                    <div class="name">Chỉ đồng bộ ảnh</div>
                    <div class="desc">Copy ảnh từ Instagram</div>
                </div>
            </div>
            
            <hr class="xera-divider">
            
            <div class="xera-option" data-choice="4">
                <div class="icon">🎨</div>
                <div class="info">
                    <div class="name">Đổi tên thủ công</div>
                    <div class="desc">Tự nhập tên mới (có icon)</div>
                </div>
                <span class="badge custom">Custom</span>
            </div>
            
            <div class="xera-option" data-choice="5">
                <div class="icon">🚀</div>
                <div class="info">
                    <div class="name">Đổi tên + đồng bộ ảnh</div>
                    <div class="desc">Tên thủ công + ảnh từ IG</div>
                </div>
                <span class="badge pro">Pro</span>
            </div>
            
            <div class="xera-footer">
                Made with ❤️ by XNHAU.com
            </div>
        `;
        container.appendChild(body);

        // RESIZE HANDLE
        const resize = document.createElement('div');
        resize.className = 'xera-resize';
        resize.id = 'xera-resize';
        container.appendChild(resize);

        document.body.appendChild(container);

        // ============================================
        // 🎯 DRAGGABLE
        // ============================================
        let isDragging = false, dragX = 0, dragY = 0, startX = 0, startY = 0;
        
        header.addEventListener('mousedown', (e) => {
            if(e.target.closest('.xera-header-actions')) return;
            isDragging = true;
            const rect = container.getBoundingClientRect();
            dragX = e.clientX - rect.left;
            dragY = e.clientY - rect.top;
            container.style.cursor = 'grabbing';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if(!isDragging) return;
            let x = e.clientX - dragX;
            let y = e.clientY - dragY;
            x = Math.max(0, Math.min(window.innerWidth - container.offsetWidth, x));
            y = Math.max(0, Math.min(window.innerHeight - container.offsetHeight, y));
            container.style.left = x + 'px';
            container.style.top = y + 'px';
            container.style.right = 'auto';
        });

        document.addEventListener('mouseup', () => {
            if(isDragging) {
                isDragging = false;
                container.style.cursor = '';
            }
        });

        // ============================================
        // 🎯 RESIZABLE
        // ============================================
        let isResizing = false;
        
        resize.addEventListener('mousedown', (e) => {
            isResizing = true;
            e.preventDefault();
            e.stopPropagation();
        });

        document.addEventListener('mousemove', (e) => {
            if(!isResizing) return;
            let w = e.clientX - container.getBoundingClientRect().left;
            let h = e.clientY - container.getBoundingClientRect().top;
            w = Math.max(280, Math.min(500, w));
            h = Math.max(200, Math.min(500, h));
            container.style.width = w + 'px';
            body.style.maxHeight = (h - 60) + 'px';
        });

        document.addEventListener('mouseup', () => {
            if(isResizing) {
                isResizing = false;
            }
        });

        // ============================================
        // 🎯 MINIMIZE
        // ============================================
        let isMinimized = false;
        document.getElementById('xera-minimize').addEventListener('click', () => {
            isMinimized = !isMinimized;
            container.classList.toggle('xera-minimized');
            document.getElementById('xera-minimize').textContent = isMinimized ? '□' : '─';
        });

        // Click header when minimized to expand
        header.addEventListener('dblclick', () => {
            if(isMinimized) {
                document.getElementById('xera-minimize').click();
            }
        });

        // ============================================
        // 🎯 CLOSE
        // ============================================
        document.getElementById('xera-close').addEventListener('click', () => {
            container.style.display = 'none';
        });

        // ============================================
        // 🎯 OPTIONS
        // ============================================
        document.querySelectorAll('.xera-option').forEach(el => {
            el.addEventListener('click', () => {
                const choice = el.dataset.choice;
                setTimeout(() => executeAction(choice), 100);
            });
        });

        // ============================================
        // 🎯 KEYBOARD SHORTCUT
        // ============================================
        document.addEventListener('keydown', (e) => {
            if(e.key === 'Escape' && !container.classList.contains('xera-minimized')) {
                document.getElementById('xera-minimize').click();
            }
            if(e.ctrlKey && e.shiftKey && e.key === 'R') {
                e.preventDefault();
                container.style.display = container.style.display === 'none' ? 'block' : 'none';
            }
        });

        // Restore position from localStorage
        try {
            const saved = JSON.parse(localStorage.getItem('xera_tool_pos') || '{}');
            if(saved.left) container.style.left = saved.left + 'px';
            if(saved.top) container.style.top = saved.top + 'px';
            if(saved.right) container.style.right = saved.right + 'px';
            if(saved.width) {
                container.style.width = saved.width + 'px';
                body.style.maxHeight = (saved.height - 60) + 'px';
            }
        } catch(e) {}
        
        // Save position on resize
        const savePos = () => {
            const rect = container.getBoundingClientRect();
            localStorage.setItem('xera_tool_pos', JSON.stringify({
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height
            }));
        };
        
        window.addEventListener('resize', savePos);
        const observer = new MutationObserver(savePos);
        observer.observe(container, {attributes: true, attributeFilter: ['style']});
    }

    // ============================================
    // 🚀 INIT
    // ============================================
    if(document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildUI);
    } else {
        buildUI();
    }

})();
