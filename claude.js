(function() {
  javascript: (function() {
    if (document.getElementById('ci_panel')) return;
    var p = document.createElement('div');
    p.id = 'ci_panel';
    // ---- THAY ĐỔI CSS: bỏ max-width, max-height, thêm min và position:relative ----
    p.style.cssText = `
      position:fixed;
      top:10px;
      left:50%;
      transform:translateX(-50%);
      width:95%;
      min-width:300px;
      min-height:200px;
      background:#0d0d1a;
      color:#e0e0e0;
      border:2px solid #ff6b6b;
      border-radius:16px;
      z-index:999999;
      font-family:system-ui,apple-system,sans-serif;
      font-size:14px;
      box-shadow:0 16px 64px rgba(0,0,0,0.98);
      padding:0;
      overflow:hidden;
      display:flex;
      flex-direction:column;
      touch-action:none;
      position:relative; /* để handle định vị theo panel */
    `;

    // ---- THÊM HTML: thêm handle resize vào cuối panel ----
    p.innerHTML = `
      <div style="background:linear-gradient(135deg,#ff6b6b,#6b2d2d);padding:12px 16px;cursor:move;display:flex;justify-content:space-between;align-items:center;border-radius:16px 16px 0 0;flex-shrink:0;user-select:none;touch-action:none;">
        <span style="font-weight:700;font-size:18px;">🔥 Cookie Commander PRO</span>
        <div>
          <span id="ci_min" style="cursor:pointer;margin-right:16px;font-size:24px;line-height:1;">−</span>
          <span id="ci_close" style="cursor:pointer;font-size:24px;line-height:1;">✕</span>
        </div>
      </div>
      <div style="padding:12px 16px;overflow-y:auto;flex:1;">
        <!-- Hàng nút chức năng -->
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">
          <button id="ci_paste" style="background:#4a4a6a;border:none;color:#fff;padding:10px 14px;border-radius:8px;cursor:pointer;flex:1 0 auto;font-size:14px;font-weight:600;">📋 Paste</button>
          <button id="ci_parse" style="background:#6b4a2d;border:none;color:#fff;padding:10px 14px;border-radius:8px;cursor:pointer;flex:1 0 auto;font-size:14px;font-weight:600;">📂 Parse .txt</button>
          <button id="ci_parse_manual" style="background:#2d4a6b;border:none;color:#fff;padding:10px 14px;border-radius:8px;cursor:pointer;flex:1 0 auto;font-size:14px;font-weight:600;">🔧 Parse Manual</button>
          <button id="ci_check_expiry" style="background:#2d6b4a;border:none;color:#fff;padding:10px 14px;border-radius:8px;cursor:pointer;flex:1 0 auto;font-size:14px;font-weight:600;">⏱ Check Expiry</button>
          <button id="ci_apply" style="background:#6c63ff;border:none;color:#fff;padding:10px 20px;border-radius:8px;cursor:pointer;flex:1 0 auto;font-size:14px;font-weight:700;">▶ APPLY</button>
          <button id="ci_nuke" style="background:#8b1a1a;border:none;color:#fff;padding:10px 14px;border-radius:8px;cursor:pointer;flex:1 0 auto;font-size:14px;font-weight:700;">☠️ NUKE</button>
          <span id="ci_status" style="color:#4ec9b0;padding:8px 0;font-size:12px;flex:1;text-align:right;">● Ready</span>
        </div>

        <!-- Textarea nhập cookie -->
        <textarea id="ci_input" style="width:100%;height:130px;background:#0a0a12;color:#ce9178;border:1px solid #333;border-radius:8px;padding:10px;font-size:14px;font-family:Consolas,monospace;resize:vertical;box-sizing:border-box;outline:none;" placeholder="Paste Netscape .txt or name=value pairs"></textarea>

        <!-- Domain, path, expiry -->
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0;align-items:center;">
          <label style="color:#9cf;font-size:13px;display:flex;align-items:center;gap:4px;">Domain: <input id="ci_domain" value=".claude.ai" style="background:#0a0a12;color:#e0e0e0;border:1px solid #333;border-radius:6px;padding:6px 8px;width:120px;font-size:14px;"></label>
          <label style="color:#9cf;font-size:13px;display:flex;align-items:center;gap:4px;">Path: <input id="ci_path" value="/" style="background:#0a0a12;color:#e0e0e0;border:1px solid #333;border-radius:6px;padding:6px 8px;width:50px;font-size:14px;"></label>
          <label style="color:#9cf;font-size:13px;display:flex;align-items:center;gap:4px;">Exp days: <input id="ci_maxage" value="365" style="background:#0a0a12;color:#e0e0e0;border:1px solid #333;border-radius:6px;padding:6px 8px;width:50px;font-size:14px;"></label>
        </div>

        <!-- Bảng hiển thị expiry -->
        <div id="ci_expiry_display" style="background:#0a0a12;border:1px solid #2d4a6b;border-radius:8px;padding:8px 10px;margin-bottom:8px;max-height:200px;overflow-y:auto;font-size:12px;color:#aaa;display:block;">
          <span id="ci_expiry_content">📊 Paste cookies then click Check Expiry</span>
        </div>

        <!-- Log -->
        <div style="background:#0a0a12;border-radius:8px;padding:6px 10px;max-height:50px;overflow-y:auto;font-size:12px;color:#666;border:1px solid #1a1a1a;">
          <span id="ci_log">📋 Ready</span>
        </div>
      </div>
      <!-- ---- THÊM HANDLE RESIZE ---- -->
      <div id="ci_resize_handle" style="position:absolute;bottom:6px;right:6px;width:24px;height:24px;background:rgba(255,255,255,0.15);border-radius:50%;cursor:nwse-resize;display:flex;align-items:center;justify-content:center;font-size:18px;color:#888;user-select:none;touch-action:none;">⤡</div>
    `;

    document.body.appendChild(p);

    // ---- PHẦN JAVASCRIPT HIỆN CÓ (giữ nguyên toàn bộ) ----
    var log = document.getElementById('ci_log');
    function setLog(msg) { log.innerHTML = '📋 ' + msg; }

    document.getElementById('ci_close').onclick = function() { p.style.display = 'none'; };
    document.getElementById('ci_min').onclick = function() {
      var inp = document.getElementById('ci_input');
      var exp = document.getElementById('ci_expiry_display');
      if (inp.style.display !== 'none') {
        inp.style.display = 'none';
        exp.style.display = 'none';
        this.textContent = '+';
      } else {
        inp.style.display = 'block';
        exp.style.display = 'block';
        this.textContent = '−';
      }
    };

    // Kéo thả (giữ nguyên)
    var header = p.querySelector('div:first-child');
    var isDragging = false;
    var startX, startY, offsetX, offsetY;

    function startDrag(e) {
      if (e.target.id === 'ci_close' || e.target.id === 'ci_min') return;
      e.preventDefault();
      var rect = p.getBoundingClientRect();
      var clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
      var clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
      offsetX = clientX - rect.left;
      offsetY = clientY - rect.top;
      p.style.transform = 'none';
      p.style.left = rect.left + 'px';
      p.style.top = rect.top + 'px';
      p.style.right = 'auto';
      isDragging = true;
    }

    function onDrag(e) {
      if (!isDragging) return;
      e.preventDefault();
      var clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
      var clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
      var newLeft = clientX - offsetX;
      var newTop = clientY - offsetY;
      p.style.left = newLeft + 'px';
      p.style.top = newTop + 'px';
    }

    function endDrag(e) {
      isDragging = false;
    }

    header.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag);
    header.addEventListener('touchstart', startDrag, { passive: false });
    document.addEventListener('touchmove', onDrag, { passive: false });
    document.addEventListener('touchend', endDrag);

    // ---- CÁC HÀM XỬ LÝ (giữ nguyên) ----
    document.getElementById('ci_paste').onclick = function() {
      navigator.clipboard.readText().then(t => {
        document.getElementById('ci_input').value = t;
        setLog('Pasted');
      }).catch(() => { setLog('Cannot read clipboard'); });
    };

    function parseNetscapeLines(raw) {
      var lines = raw.split('\n').map(s => s.trim()).filter(s => s && s.includes('.claude.ai') && s.includes('\t'));
      var result = [];
      for (var i = 0; i < lines.length; i++) {
        var parts = lines[i].split('\t');
        if (parts.length >= 7) {
          var domain = parts[0].trim();
          var path = parts[2].trim();
          var expiry = parseInt(parts[4].trim()) || 0;
          var name = parts[5].trim();
          var value = parts[6].trim();
          if (name && value) result.push({ domain: domain, path: path, expiry: expiry, name: name, value: value });
        }
      }
      return result;
    }

    function renderExpiry(cookies) {
      var el = document.getElementById('ci_expiry_content');
      var now = Date.now() / 1000;
      var html = '<div style="display:grid;grid-template-columns:auto 1fr 1fr auto;gap:4px 10px;font-size:12px;">';
      html += '<div style="color:#ff6b6b;font-weight:bold;">#</div><div style="color:#ff6b6b;font-weight:bold;">Name</div><div style="color:#ff6b6b;font-weight:bold;">Expiry</div><div style="color:#ff6b6b;font-weight:bold;">Status</div>';
      for (var i = 0; i < cookies.length && i < 60; i++) {
        var c = cookies[i];
        var daysLeft = Math.floor((c.expiry - now) / 86400);
        var status = '',
          color = '';
        if (c.expiry === 0) { status = 'Session';
          color = '#ffcc66'; } else if (daysLeft < 0) { status = 'EXPIRED';
          color = '#ff3333'; } else if (daysLeft < 7) { status = 'Soon ' + daysLeft + 'd';
          color = '#ff9933'; } else { status = daysLeft + 'd';
          color = '#4ec9b0'; }
        html += '<div style="color:#888;">' + (i + 1) + '</div><div style="color:#ce9178;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + c.name + '</div><div style="color:' + color + ';">' + (c.expiry ? new Date(c.expiry * 1000).toLocaleDateString() + ' (' + daysLeft + 'd)' : 'Session') + '</div><div style="color:' + color + ';font-weight:bold;">' + status + '</div>';
      }
      if (cookies.length > 60) html += '<div style="grid-column:1/5;color:#888;text-align:center;">... and ' + (cookies.length - 60) + ' more</div>';
      html += '</div>';
      el.innerHTML = html;
    }

    document.getElementById('ci_parse').onclick = function() {
      var raw = document.getElementById('ci_input').value;
      var cookies = parseNetscapeLines(raw);
      if (cookies.length === 0) {
        var pairs = raw.split(';').map(s => s.trim()).filter(s => s && s.includes('='));
        for (var i = 0; i < pairs.length; i++) { var eq = pairs[i].indexOf('='); if (eq > 0) { cookies.push({ domain: '.claude.ai', path: '/', expiry: 0, name: pairs[i].substring(0, eq).trim(), value: pairs[i].substring(eq + 1).trim() }); } }
      if (cookies.length === 0) { setLog('⚠ No cookies parsed'); return; }
      window._parsedCookies = cookies;
      renderExpiry(cookies);
      setLog('✔ Parsed ' + cookies.length + ' cookies');
    };

    document.getElementById('ci_parse_manual').onclick = function() {
      var raw = document.getElementById('ci_input').value;
      var cookies = [];
      var pairs = raw.split(';').map(s => s.trim()).filter(s => s && s.includes('='));
      for (var i = 0; i < pairs.length; i++) { var eq = pairs[i].indexOf('='); if (eq > 0) { cookies.push({ domain: '.claude.ai', path: '/', expiry: 0, name: pairs[i].substring(0, eq).trim(), value: pairs[i].substring(eq + 1).trim() }); } }
      if (cookies.length === 0) { setLog('⚠ No name=value pairs found'); return; }
      window._parsedCookies = cookies;
      renderExpiry(cookies);
      setLog('✔ Manual parsed ' + cookies.length + ' cookies');
    };

    document.getElementById('ci_check_expiry').onclick = function() {
      if (window._parsedCookies && window._parsedCookies.length > 0) {
        renderExpiry(window._parsedCookies);
        setLog('✔ Show expiry for ' + window._parsedCookies.length + ' cookies');
      } else {
        var raw = document.getElementById('ci_input').value;
        var cookies = parseNetscapeLines(raw);
        if (cookies.length === 0) {
          var pairs = raw.split(';').map(s => s.trim()).filter(s => s && s.includes('='));
          for (var i = 0; i < pairs.length; i++) { var eq = pairs[i].indexOf('='); if (eq > 0) { cookies.push({ domain: '.claude.ai', path: '/', expiry: 0, name: pairs[i].substring(0, eq).trim(), value: pairs[i].substring(eq + 1).trim() }); } }
        }
        if (cookies.length > 0) { window._parsedCookies = cookies;
          renderExpiry(cookies);
          setLog('✔ Show expiry for ' + cookies.length + ' cookies'); } else { setLog('⚠ No cookies to check'); }
      }
    };

    document.getElementById('ci_apply').onclick = function() {
      var raw = document.getElementById('ci_input').value;
      if (!raw.trim()) { setLog('⚠ Empty'); return; }
      var cookies = parseNetscapeLines(raw);
      if (cookies.length === 0) {
        var pairs = raw.split(';').map(s => s.trim()).filter(s => s && s.includes('='));
        for (var i = 0; i < pairs.length; i++) { var eq = pairs[i].indexOf('='); if (eq > 0) { cookies.push({ domain: '.claude.ai', path: '/', expiry: 0, name: pairs[i].substring(0, eq).trim(), value: pairs[i].substring(eq + 1).trim() }); } }
      }
      if (cookies.length === 0) { setLog('⚠ No cookies to apply'); return; }
      var domain = document.getElementById('ci_domain').value || '.claude.ai';
      var path = document.getElementById('ci_path').value || '/';
      var days = parseInt(document.getElementById('ci_maxage').value) || 365;
      var exp = new Date(Date.now() + days * 86400000).toUTCString();
      var count = 0;
      for (var i = 0; i < cookies.length; i++) {
        try {
          document.cookie = cookies[i].name + '=' + cookies[i].value + '; domain=' + domain + '; path=' + path + '; expires=' + exp + '; Secure; SameSite=None';
          count++;
        } catch (e) {}
      }
      window._parsedCookies = cookies;
      renderExpiry(cookies);
      setLog('✔ Applied ' + count + ' cookies to ' + domain);
    };

    document.getElementById('ci_nuke').onclick = function() {
      if (!confirm('☠️ NUKE ALL?')) return;
      var count = 0;
      var c = document.cookie.split(';');
      for (var i = 0; i < c.length; i++) {
        var cc = c[i].trim();
        var eq = cc.indexOf('=');
        if (eq === -1) continue;
        var name = cc.substring(0, eq).trim();
        if (!name) continue;
        ['', '.claude.ai', '.ai'].forEach(function(d) {
          ['/', '/fc', ''].forEach(function(path) {
            try { document.cookie = name + '=; domain=' + d + '; path=' + path + '; expires=Thu, 01 Jan 1970 00:00:00 UTC; Secure; SameSite=None';
              count++; } catch (e) {}
          });
        });
      }
      try { localStorage.clear();
        count++; } catch (e) {}
      try { sessionStorage.clear();
        count++; } catch (e) {}
      setLog('☠️ Nuked ' + count + ' items. Reloading...');
      setTimeout(function() { location.reload(true); }, 1200);
    };

    // ---- THÊM CHỨC NĂNG RESIZE (mới) ----
    var resizeHandle = document.getElementById('ci_resize_handle');
    var isResizing = false;
    var startXResize, startYResize, startWidth, startHeight;

    function startResize(e) {
      e.preventDefault();
      e.stopPropagation(); // ngăn drag
      isResizing = true;
      var clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
      var clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
      startXResize = clientX;
      startYResize = clientY;
      startWidth = parseInt(p.style.width, 10) || p.offsetWidth;
      startHeight = parseInt(p.style.height, 10) || p.offsetHeight;
      // Bỏ giới hạn max để resize tự do
      p.style.maxWidth = 'none';
      p.style.maxHeight = 'none';
    }

    function doResize(e) {
      if (!isResizing) return;
      e.preventDefault();
      var clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
      var clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
      var dx = clientX - startXResize;
      var dy = clientY - startYResize;
      var newWidth = Math.max(300, startWidth + dx);
      var newHeight = Math.max(200, startHeight + dy);
      // Giới hạn không vượt quá viewport
      var maxW = window.innerWidth - 20;
      var maxH = window.innerHeight - 20;
      newWidth = Math.min(newWidth, maxW);
      newHeight = Math.min(newHeight, maxH);
      p.style.width = newWidth + 'px';
      p.style.height = newHeight + 'px';
    }

    function stopResize(e) {
      isResizing = false;
    }

    resizeHandle.addEventListener('mousedown', startResize);
    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);
    resizeHandle.addEventListener('touchstart', startResize, { passive: false });
    document.addEventListener('touchmove', doResize, { passive: false });
    document.addEventListener('touchend', stopResize);

    setLog('✅ Tool ready. Paste .txt -> Parse -> Check Expiry -> Apply');
  })();
})();
