(() => {
  // =========================
  // AUDIO TO TEXT TRANSCRIPT EXTRACTOR - ULTIMATE
  // Tự lấy transcript từ trang, giữ SPK_1 / SPK_2..., timestamp, beautify, copy + tải file
  // =========================

  const CONFIG = {
    fileName: "beautified-transcript.txt",

    // Output format:
    // "plain"    => SPK_1 [0:00]\nText
    // "markdown" => **SPK_1** `[0:00]`\nText
    // "srt"      => gần giống subtitle, nhưng timestamp audio dạng mm:ss nên chỉ convert cơ bản
    format: "plain",

    copyToClipboard: true,
    downloadFile: true,
    printTable: true,

    // Nếu text bị tách thành nhiều dòng ngắn thì nối lại thành 1 đoạn
    joinTextLines: true,

    // Bỏ các block không có text
    removeEmptyBlocks: true
  };

  const bodyText = document.body.innerText || "";

  const normalizeLine = line =>
    String(line || "")
      .replace(/\u00A0/g, " ")
      .replace(/[ \t]+/g, " ")
      .trim();

  const lines = bodyText
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);

  const isSpeaker = line => /^SPK[\s_-]*\d+$/i.test(line);

  const normalizeSpeaker = line => {
    const n = line.match(/\d+/)?.[0] || "";
    return `SPK_${n}`;
  };

  const isTimestamp = line => {
    // 0:00, 12:34, 1:02:03
    if (!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(line)) return false;

    const parts = line.split(":").map(Number);

    if (parts.length === 2) {
      const [m, s] = parts;
      return m >= 0 && s >= 0 && s < 60;
    }

    if (parts.length === 3) {
      const [h, m, s] = parts;
      return h >= 0 && m >= 0 && m < 60 && s >= 0 && s < 60;
    }

    return false;
  };

  const timestampToSeconds = t => {
    const p = t.split(":").map(Number);
    if (p.length === 2) return p[0] * 60 + p[1];
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    return 0;
  };

  const secondsToSrtTime = sec => {
    sec = Math.max(0, Number(sec) || 0);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const pad = n => String(n).padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(s)},000`;
  };

  // Dòng có khả năng là text thật
  const isLikelyText = line => {
    if (!line) return false;
    if (isSpeaker(line)) return false;
    if (isTimestamp(line)) return false;

    // Loại các dòng UI ngắn, không có chữ cái hoặc quá giống nút/menu
    if (line.length <= 2) return false;
    if (/^[^\p{L}\p{N}]+$/u.test(line)) return false;

    return true;
  };

  // =========================
  // PARSER CHÍNH
  // Chỉ ăn pattern: SPK_x -> timestamp -> text
  // Không cần danh sách junk cụ thể
  // =========================

  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!isSpeaker(line)) {
      i++;
      continue;
    }

    const speaker = normalizeSpeaker(line);
    let j = i + 1;

    // Cho phép có vài dòng rác ngắn giữa speaker và timestamp
    while (j < lines.length && !isTimestamp(lines[j]) && !isSpeaker(lines[j])) {
      j++;
    }

    if (j >= lines.length || !isTimestamp(lines[j])) {
      i++;
      continue;
    }

    const time = lines[j];
    j++;

    const textLines = [];

    while (j < lines.length) {
      const current = lines[j];

      // Gặp speaker tiếp theo => hết block hiện tại
      if (isSpeaker(current)) break;

      // Nếu gặp timestamp lẻ ngay sau block nhưng không có speaker, thường là timeline/duration rác
      // Tuy nhiên nếu text chưa có gì thì bỏ qua timestamp đó
      if (isTimestamp(current)) {
        if (textLines.length === 0) {
          j++;
          continue;
        }

        // Nếu sau timestamp là text nhưng không có speaker, vẫn coi là block tiếp theo cùng speaker
        // Dừng để xử lý ở logic fallback bên dưới
        break;
      }

      if (isLikelyText(current)) textLines.push(current);
      j++;
    }

    const text = CONFIG.joinTextLines
      ? textLines.join(" ").replace(/\s+/g, " ").trim()
      : textLines.join("\n").trim();

    blocks.push({ speaker, time, text });

    i = j;
  }

  // =========================
  // FALLBACK
  // Một số trang render dạng: SPK_1 0:00 text cùng dòng
  // =========================

  if (blocks.filter(b => b.text).length === 0) {
    const compact = bodyText.replace(/\s+/g, " ").trim();

    const re = /(SPK[\s_-]*\d+)\s+(\d{1,2}:\d{2}(?::\d{2})?)\s+([\s\S]*?)(?=\s+SPK[\s_-]*\d+\s+\d{1,2}:\d{2}(?::\d{2})?|\s*$)/gi;

    let m;
    while ((m = re.exec(compact))) {
      blocks.push({
        speaker: normalizeSpeaker(m[1]),
        time: m[2],
        text: normalizeLine(m[3])
      });
    }
  }

  let validBlocks = CONFIG.removeEmptyBlocks
    ? blocks.filter(b => b.text && b.text.length > 0)
    : blocks;

  // Sort nhẹ theo thời gian nếu bị DOM đảo
  validBlocks = validBlocks
    .map((b, idx) => ({ ...b, _idx: idx, _sec: timestampToSeconds(b.time) }))
    .sort((a, b) => a._sec - b._sec || a._idx - b._idx)
    .map(({ _idx, _sec, ...b }) => b);

  const makePlain = () =>
    validBlocks
      .map(b => `${b.speaker} [${b.time}]\n${b.text}`)
      .join("\n\n")
      .trim();

  const makeMarkdown = () =>
    [
      "# Transcript",
      "",
      ...validBlocks.flatMap(b => [
        `**${b.speaker}** \`[${b.time}]\``,
        "",
        b.text,
        ""
      ])
    ].join("\n").trim();

  const makeSrt = () =>
    validBlocks
      .map((b, idx) => {
        const start = timestampToSeconds(b.time);
        const next = validBlocks[idx + 1]
          ? timestampToSeconds(validBlocks[idx + 1].time)
          : start + 4;

        const end = Math.max(start + 1, next);

        return [
          idx + 1,
          `${secondsToSrtTime(start)} --> ${secondsToSrtTime(end)}`,
          `${b.speaker}: ${b.text}`
        ].join("\n");
      })
      .join("\n\n")
      .trim();

  let output = "";

  if (CONFIG.format === "markdown") output = makeMarkdown();
  else if (CONFIG.format === "srt") output = makeSrt();
  else output = makePlain();

  if (!output) {
    console.warn("Không tìm thấy transcript theo pattern SPK_x + timestamp.");
    alert("❌ Không tìm thấy transcript. Hãy bật Speaker Labels/Timestamps hoặc kéo tới phần transcript rồi chạy lại.");
    return;
  }

  console.log("✅ Transcript blocks:", validBlocks.length);
  console.log(output);

  if (CONFIG.printTable) {
    console.table(validBlocks);
  }

  if (CONFIG.copyToClipboard) {
    try {
      copy(output);
    } catch {
      navigator.clipboard?.writeText(output);
    }
  }

  if (CONFIG.downloadFile) {
    const ext = CONFIG.format === "srt" ? "srt" : CONFIG.format === "markdown" ? "md" : "txt";
    const fileName = CONFIG.fileName.replace(/\.\w+$/, `.${ext}`);

    const blob = new Blob([output], {
      type: "text/plain;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  alert(`✅ Done!\nLấy được ${validBlocks.length} đoạn.\nĐã copy${CONFIG.downloadFile ? " + tải file" : ""}.`);
})();
