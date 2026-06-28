// ==UserScript==
// @name         🔥 Tool Rename FB - Đồng Bộ Tên & Ảnh IG
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  Đồng bộ tên và ảnh đại diện từ Instagram sang Facebook với nhiều tùy chọn
// @author       XERA FER
// @match        https://www.facebook.com/*
// @match        https://facebook.com/*
// @grant        none
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// ==/UserScript==

(function() {
    'use strict';

    // ============================================
    // 🎨 CSS STYLES
    // ============================================
    const styles = `
        .xera-tool-container {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 999999;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        
        .xera-tool-btn {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: linear-gradient(145deg, #1a73e8, #0d47a1);
            color: white;
            border: none;
            box-shadow: 0 8px 25px rgba(26, 115, 232, 0.4);
            cursor: pointer;
            font-size: 28px;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: pulse 2s infinite;
        }
        
        .xera-tool-btn:hover {
            transform: scale(1.1);
            box-shadow: 0 12px 35px rgba(26, 115, 232, 0.6);
        }
        
        @keyframes pulse {
            0% { box-shadow: 0 8px 25px rgba(26, 115, 232, 0.4); }
            50% { box-shadow: 0 8px 35px rgba(26, 115, 232, 0.7); }
            100% { box-shadow: 0 8px 25px rgba(26, 115, 232, 0.4); }
        }
        
        .xera-menu {
            display: none;
            position: fixed;
            bottom: 90px;
            right: 20px;
            width: 380px;
            max-height: 500px;
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            padding: 20px;
            overflow-y: auto;
            animation: slideUp 0.3s ease;
            z-index: 999999;
        }
        
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(20px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
        
        .xera-menu.active {
            display: block;
        }
        
        .xera-title {
            font-size: 20px;
            font-weight: bold;
            color: #1a73e8;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .xera-title span {
            background: #1a73e8;
            color: white;
            padding: 2px 10px;
            border-radius: 20px;
            font-size: 12px;
        }
        
        .xera-option {
            padding: 12px 16px;
            margin: 8px 0;
            border-radius: 12px;
            border: 2px solid #e8ecf1;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        
        .xera-option:hover {
            border-color: #1a73e8;
            background: #f0f7ff;
            transform: translateX(5px);
        }
        
        .xera-option .icon {
            font-size: 22px;
            width: 40px;
            text-align: center;
        }
        
        .xera-option .info {
            flex: 1;
        }
        
        .xera-option .info .name {
            font-weight: 600;
            color: #1a1a1a;
            font-size: 14px;
        }
        
        .xera-option .info .desc {
            font-size: 12px;
            color: #888;
            margin-top: 2px;
        }
        
        .xera-option .badge {
            background: #1a73e8;
            color: white;
            padding: 2px 10px;
            border-radius: 20px;
            font-size: 11px;
        }
        
        .xera-close {
            position: absolute;
            top: 12px;
            right: 16px;
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #999;
            transition: all 0.2s;
        }
        
        .xera-close:hover {
            color: #333;
            transform: rotate(90deg);
        }
        
        .xera-status {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 9999999;
            padding: 16px 30px;
            border-radius: 12px;
            background: white;
            box-shadow: 0 8px 30px rgba(0,0,0,0.2);
            font-family: 'Segoe UI', sans-serif;
            display: none;
            align-items: center;
            gap: 12px;
            animation: slideDown 0.3s ease;
            max-width: 90%;
        }
        
        @keyframes slideDown {
            from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
            to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        
        .xera-status.success { border-left: 5px solid #34a853; }
        .xera-status.error { border-left: 5px solid #ea4335; }
        .xera-status.loading { border-left: 5px solid #fbbc04; }
        
        .xera-status .xera-status-icon { font-size: 24px; }
        .xera-status .xera-status-msg { font-size: 14px; color: #333; }
        .xera-status .xera-status-sub { font-size: 12px; color: #888; margin-top: 4px; }
        
        .xera-divider {
            border: none;
            border-top: 2px solid #e8ecf1;
            margin: 12px 0;
        }
        
        .xera-footer {
            text-align: center;
            font-size: 11px;
            color: #bbb;
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid #e8ecf1;
        }
        
        .xera-footer a {
            color: #1a73e8;
            text-decoration: none;
        }
        
        .xera-menu::-webkit-scrollbar {
            width: 6px;
        }
        .xera-menu::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 10px;
        }
        .xera-menu::-webkit-scrollbar-thumb {
            background: #c1c1c1;
            border-radius: 10px;
        }
        .xera-menu::-webkit-scrollbar-thumb:hover {
            background: #a8a8a8;
        }
    `;

    // ============================================
    // 🎨 INJECT CSS
    // ============================================
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);

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
        const status = document.getElementById('xera-status');
        if(!status) return;
        status.className = 'xera-status ' + type;
        status.style.display = 'flex';
        document.querySelector('.xera-status-icon').textContent = icon;
        document.querySelector('.xera-status-msg').textContent = msg;
        document.querySelector('.xera-status-sub').textContent = sub || '';
        
        if(type !== 'loading') {
            setTimeout(() => {
                status.style.display = 'none';
            }, 5000);
        }
    }

    function hideStatus() {
        const status = document.getElementById('xera-status');
        if(status) status.style.display = 'none';
    }

    // ============================================
    // 🚀 MAIN EXECUTION
    // ============================================
    async function executeAction(choice) {
        hideStatus();
        
        // Kiểm tra đăng nhập
        let dtsg, userid;
        try {
            dtsg = require(["DTSGInitData"]).token;
            userid = require(["CurrentUserInitialData"]).USER_ID;
        } catch(e) {
            showStatus('❌', 'Chưa đăng nhập Facebook!', 'Vui lòng đăng nhập và thử lại', 'error');
            return;
        }
        
        if(!dtsg || !userid || userid === "0") {
            showStatus('❌', 'Không tìm thấy token!', 'Vui lòng đăng nhập lại Facebook', 'error');
            return;
        }

        let needUid = ["1","2","3","5"].includes(choice);
        let uid = "";
        let newName = "";
        
        // Nhập UID
        if(needUid) {
            uid = prompt("📸 Nhập UID Instagram:\n(Ví dụ: vanvy.nguyen)", "");
            if(!uid) return;
            uid = uid.split("/").pop().split("?")[0];
        }
        
        // Nhập tên mới
        if(["4","5"].includes(choice)) {
            newName = prompt("✏️ Nhập tên mới (có icon/emoji):\n(Ví dụ: 🌸 VAN VY 🌸)", "");
            if(newName === null) return;
            newName = newName.trim();
            if(!newName) {
                showStatus('❌', 'Tên không được để trống!', '', 'error');
                return;
            }
        }
        
        // Xác nhận
        let confirmMsg = "🔄 Xác nhận thực hiện:\n\n";
        if(choice === "1") confirmMsg += "📝 Đồng bộ TÊN + ẢNH từ IG\n";
        else if(choice === "2") confirmMsg += "📝 Đồng bộ TÊN từ IG\n";
        else if(choice === "3") confirmMsg += "📸 Đồng bộ ẢNH từ IG\n";
        else if(choice === "4") confirmMsg += "✏️ Đổi tên thủ công\n";
        else if(choice === "5") confirmMsg += "✏️ Đổi tên + Đồng bộ ảnh từ IG\n";
        
        if(needUid) confirmMsg += "🆔 IG: " + uid + "\n";
        if(["4","5"].includes(choice)) confirmMsg += "📝 Tên mới: " + newName + "\n";
        confirmMsg += "\nTiếp tục?";
        
        if(!confirm(confirmMsg)) return;
        
        // ============================================
        // 📦 BUILD PAYLOAD
        // ============================================
        let resources = [];
        let sourceOfTruth = [];
        
        switch(choice) {
            case "1":
                resources = ["NAME", "PROFILE_PHOTO"];
                sourceOfTruth = [{resource_source: "IG"}, {resource_source: "FB"}];
                break;
            case "2":
                resources = ["NAME"];
                sourceOfTruth = [{resource_source: "IG"}, {resource_source: "FB"}];
                break;
            case "3":
                resources = ["PROFILE_PHOTO"];
                sourceOfTruth = [{resource_source: "IG"}, {resource_source: "FB"}];
                break;
            case "4":
                resources = ["NAME"];
                sourceOfTruth = [{resource_source: "FB"}, {resource_source: "FB"}];
                break;
            case "5":
                resources = ["NAME", "PROFILE_PHOTO"];
                sourceOfTruth = [{resource_source: "FB"}, {resource_source: "IG"}];
                break;
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
            sync_logging_params: {
                client_flow_type: "IM_SETTINGS"
            },
            interface: "FB_WEB",
            feta_profile_sync: false
        };
        
        if(["4","5"].includes(choice)) {
            variables.full_name = newName;
            variables.first_name = newName.split(" ")[0] || newName;
            variables.last_name = newName.split(" ").slice(1).join(" ") || "";
        }
        
        // ============================================
        // 📤 SEND REQUEST
        // ============================================
        showStatus('⏳', 'Đang đồng bộ...', 'Vui lòng chờ', 'loading');
        
        try {
            let url = "https://accountscenter.facebook.com/api/graphql/";
            let data = "fb_dtsg=" + dtsg + 
                       "&__user=" + userid + 
                       "&variables=" + encodeURIComponent(JSON.stringify(variables)) + 
                       "&av=" + userid + 
                       "&fb_api_req_friendly_name=useFXIMUpdateNameMutation" +
                       "&fb_api_caller_class=RelayModern" +
                       "&server_timestamps=true" +
                       "&doc_id=9388416374608398";
            
            let resp = await fetch(url, {
                method: "POST",
                body: data,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                }
            });
            
            let result = await resp.json();
            
            if(result.errors) {
                let errorMsg = result.errors.map(e => e.message || e).join("\n");
                showStatus('❌', 'Đồng bộ thất bại!', errorMsg, 'error');
            } else {
                let msg = "✅ Đồng bộ thành công!\n\n";
                if(resources.includes("NAME")) msg += "📝 Đã cập nhật tên\n";
                if(resources.includes("PROFILE_PHOTO")) msg += "📸 Đã đồng bộ ảnh\n";
                if(["4","5"].includes(choice)) msg += "✏️ " + newName + "\n";
                if(needUid) msg += "🆔 IG: " + uid;
                
                showStatus('✅', 'Đồng bộ thành công!', msg, 'success');
                
                setTimeout(() => {
                    if(confirm("🔄 Reload trang để thấy thay đổi?")) {
                        location.reload();
                    }
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
        // Container
        const container = document.createElement('div');
        container.className = 'xera-tool-container';
        container.id = 'xera-container';
        
        // Status
        const status = document.createElement('div');
        status.className = 'xera-status';
        status.id = 'xera-status';
        status.innerHTML = `
            <span class="xera-status-icon"></span>
            <div>
                <div class="xera-status-msg"></div>
                <div class="xera-status-sub"></div>
            </div>
        `;
        document.body.appendChild(status);
        
        // Button
        const btn = document.createElement('button');
        btn.className = 'xera-tool-btn';
        btn.id = 'xera-btn';
        btn.innerHTML = '🔥';
        btn.title = 'Tool Rename FB';
        container.appendChild(btn);
        
        // Menu
        const menu = document.createElement('div');
        menu.className = 'xera-menu';
        menu.id = 'xera-menu';
        menu.innerHTML = `
            <button class="xera-close" id="xera-close">✕</button>
            
            <div class="xera-title">
                🔥 Tool Rename FB
                <span>v2.0</span>
            </div>
            
            <div class="xera-option" data-choice="1">
                <div class="icon">📝</div>
                <div class="info">
                    <div class="name">Đồng bộ tên + ảnh từ IG</div>
                    <div class="desc">Copy tên và ảnh đại diện từ Instagram</div>
                </div>
                <span class="badge">Full</span>
            </div>
            
            <div class="xera-option" data-choice="2">
                <div class="icon">✏️</div>
                <div class="info">
                    <div class="name">Chỉ đồng bộ tên</div>
                    <div class="desc">Copy tên từ Instagram, giữ nguyên ảnh</div>
                </div>
            </div>
            
            <div class="xera-option" data-choice="3">
                <div class="icon">📸</div>
                <div class="info">
                    <div class="name">Chỉ đồng bộ ảnh</div>
                    <div class="desc">Copy ảnh đại diện từ Instagram</div>
                </div>
            </div>
            
            <hr class="xera-divider">
            
            <div class="xera-option" data-choice="4">
                <div class="icon">🎨</div>
                <div class="info">
                    <div class="name">Đổi tên thủ công</div>
                    <div class="desc">Tự nhập tên mới (có icon/emoji)</div>
                </div>
                <span class="badge">Custom</span>
            </div>
            
            <div class="xera-option" data-choice="5">
                <div class="icon">🚀</div>
                <div class="info">
                    <div class="name">Đổi tên + đồng bộ ảnh</div>
                    <div class="desc">Tên thủ công + ảnh từ Instagram</div>
                </div>
                <span class="badge">Pro</span>
            </div>
            
            <div class="xera-footer">
                Made with ❤️ by ng nhat huyy
            </div>
        `;
        container.appendChild(menu);
        document.body.appendChild(container);
        
        // ============================================
        // 🎯 EVENT LISTENERS
        // ============================================
        // Toggle menu
        document.getElementById('xera-btn').addEventListener('click', () => {
            const m = document.getElementById('xera-menu');
            m.classList.toggle('active');
        });
        
        // Close menu
        document.getElementById('xera-close').addEventListener('click', () => {
            document.getElementById('xera-menu').classList.remove('active');
        });
        
        // Click outside to close
        document.addEventListener('click', (e) => {
            const container = document.getElementById('xera-container');
            const menu = document.getElementById('xera-menu');
            if(!container.contains(e.target) && menu.classList.contains('active')) {
                menu.classList.remove('active');
            }
        });
        
        // Option click
        document.querySelectorAll('.xera-option').forEach(el => {
            el.addEventListener('click', () => {
                const choice = el.dataset.choice;
                document.getElementById('xera-menu').classList.remove('active');
                setTimeout(() => executeAction(choice), 300);
            });
        });
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
