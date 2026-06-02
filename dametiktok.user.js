// ==UserScript==
// @name         Ziokatz Tool V2
// @namespace    Ziokatz
// @version      V2
// @description  Auto Fill TikTok Report Form - Speed Boost
// @match        https://www.tiktok.com/legal/report/feedback*
// @run-at       document-end
// @grant        none
// ==/UserScript==
 

(function () {
    'use strict';

    const ACCESS_KEY = "Ziokatz";
    const STORAGE_KEY = "bb_pink_v1";
    const HOST_ID = "bb-tool-root";
    const PANEL_ID = "bb-panel";
    const STYLE_ID = "bb-panel-styles-hacker";
    const TIKTOK_URL = "https://www.tiktok.com/legal/report/feedback";

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const DELAY_TIME = isMobile ? 400 : 300;
    const INPUT_DELAY = isMobile ? 2000 : 1500;
    const WAIT_AFTER_SELECT = isMobile ? 1000 : 800;
    const MAX_RETRIES = 8;
    const TOPIC_OPTION_INDEX = 5;
    const CATEGORY_OPTION_INDEX = 0;
    const MIN_DETAIL_LENGTH = 50;

    const LANG = {
        topicUnderage: [
            "Report an underage user",
            "Báo cáo người dùng chưa đủ tuổi"
        ],
        categoryParent: [
            "I'm a parent or legal guardian",
            "Tôi là phụ huynh hoặc người giám hộ hợp pháp"
        ],
        selectOption: [
            "Select an option",
            "Chọn một tùy chọn",
            "Chọn"
        ],
        contactEmail: ["contact email", "email liên hệ"],
        theirUsername: ["their username", "username của", "underage user"],
        additionalDetails: [
            "additional details",
            "chi tiết bổ sung",
            "tell us more"
        ],
        username: ["username"]
    };

    function checkAccess() {
        if (sessionStorage.getItem("bb_access") === "true") {
            return true;
        }

        const key = prompt("Ziokatz - Key\n\nNhập Key Để Dùng Tool:");

        if (key === null) {
            return false;
        }

        if (key !== ACCESS_KEY) {
            alert("Sai Key!");
            return false;
        }

        sessionStorage.setItem("bb_access", "true");
        return true;
    }

    function loadData() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        } catch (err) {
            console.warn("[Ziokatz Tool] localStorage corrupt, reset.", err);
            return {};
        }
    }

    function persistData(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function isToolElement(el) {
        return !!(el && el.closest && el.closest("#" + HOST_ID));
    }

    function queryForm(selector) {
        return [...document.querySelectorAll(selector)]
            .filter(el => !isToolElement(el));
    }

    function normalizeText(text) {
        return (text || "")
            .trim()
            .toLowerCase()
            .replace(/[''']/g, "'")
            .replace(/["""]/g, '"');
    }

    function safeClick(el) {
        if (!el || !el.offsetParent) {
            return false;
        }

        el.scrollIntoView({ block: "center", inline: "center" });
        if (el.hasAttribute("aria-hidden")) {
            el.removeAttribute("aria-hidden");
        }

        el.focus();
        const opts = { bubbles: true, cancelable: true, view: window };
        el.dispatchEvent(new MouseEvent("pointerdown", opts));
        el.dispatchEvent(new MouseEvent("mousedown", opts));
        el.dispatchEvent(new MouseEvent("pointerup", opts));
        el.dispatchEvent(new MouseEvent("mouseup", opts));
        el.dispatchEvent(new MouseEvent("click", opts));
        return true;
    }

    function findButtonByKeywords(keywords) {
        const selectors = [
            "button",
            '[role="button"]',
            '[role="option"]',
            '[role="menuitem"]',
            "li",
            "div[tabindex]",
            "span",
            "label"
        ];

        const all = queryForm(selectors.join(","));

        for (const el of all) {
            if (!el.offsetParent) {
                continue;
            }

            const txt = normalizeText(el.innerText);
            if (!txt) {
                continue;
            }

            for (const keyword of keywords) {
                const kw = normalizeText(keyword);
                if (txt === kw || txt.includes(kw)) {
                    const clickable =
                        el.closest('[role="button"], [role="option"], button, li, label') || el;
                    if (clickable && !isToolElement(clickable)) {
                        return clickable;
                    }
                }
            }
        }

        return null;
    }

    function simulateInputWithTracker(element, text) {
        if (!element) {
            return;
        }

        element.focus();

        const lastValue = element.value;
        const proto = element instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;

        if (nativeSetter) {
            nativeSetter.call(element, text);
        } else {
            element.value = text;
        }

        const tracker = element._valueTracker;
        if (tracker) {
            tracker.setValue(lastValue);
        }

        element.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            cancelable: true,
            data: text
        }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
    }

    async function waitFor(fn, timeoutMs = 8000, intervalMs = 300) {
        const start = Date.now();

        while (Date.now() - start < timeoutMs) {
            if (fn()) {
                return true;
            }
            await sleep(intervalMs);
        }

        return false;
    }

    async function scrollToEl(el) {
        if (!el) {
            return;
        }

        el.scrollIntoView({ block: "center", inline: "center" });
        await sleep(200);
    }

    function isVisibleEl(el) {
        if (!el || isToolElement(el)) {
            return false;
        }

        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function getFormDropdownTriggers() {
        const comboboxes = queryForm('[role="combobox"]').filter(isVisibleEl);
        if (comboboxes.length >= 2) {
            return comboboxes.slice(0, 2);
        }

        const triggers = [];

        for (const key of ["topic", "category"]) {
            const label = queryForm("label, span, div, p").find(el => {
                const txt = normalizeText(el.innerText);
                return txt === key ||
                    txt === key + " *" ||
                    txt.startsWith(key + " ");
            });

            if (!label) {
                continue;
            }

            let node = label.parentElement;

            for (let depth = 0; depth < 6 && node; depth++) {
                const trigger = node.querySelector(
                    '[role="combobox"], select, [aria-haspopup="listbox"], button'
                );

                if (trigger && isVisibleEl(trigger)) {
                    triggers.push(trigger);
                    break;
                }

                node = node.parentElement;
            }
        }

        if (triggers.length >= 2) {
            return triggers.slice(0, 2);
        }

        const fallback = queryForm(
            'select, [role="combobox"], [aria-haspopup="listbox"]'
        ).filter(isVisibleEl);

        return fallback.slice(0, 2);
    }

    function getOpenListboxOptions() {
        const listboxes = [...document.querySelectorAll('[role="listbox"]')]
            .filter(el => !isToolElement(el));

        for (const list of listboxes) {
            const opts = [...list.querySelectorAll('[role="option"], li')]
                .filter(el => {
                    if (isToolElement(el)) {
                        return false;
                    }

                    const txt = (el.innerText || "").trim();
                    if (!txt || txt.length > 120) {
                        return false;
                    }

                    return isVisibleEl(el);
                });

            if (opts.length >= 3) {
                return opts;
            }
        }

        return queryForm('[role="option"], [role="menuitem"]')
            .filter(el => {
                const txt = (el.innerText || "").trim();
                return txt && txt.length <= 120 && isVisibleEl(el);
            });
    }

    async function selectNativeSelectOption(selectEl, optionIndex) {
        const options = [...selectEl.options].filter(opt => {
            const txt = normalizeText(opt.textContent);
            return txt && !txt.includes("select an option");
        });

        if (options.length > optionIndex) {
            selectEl.selectedIndex = options[optionIndex].index;
            selectEl.dispatchEvent(new Event("input", { bubbles: true }));
            selectEl.dispatchEvent(new Event("change", { bubbles: true }));
            await sleep(WAIT_AFTER_SELECT);
            return true;
        }

        return false;
    }

    async function selectDropdownByPosition(dropdownIndex, optionIndex) {
        for (let retry = 0; retry < MAX_RETRIES; retry++) {
            const triggers = getFormDropdownTriggers();

            if (triggers.length <= dropdownIndex) {
                await sleep(400);
                continue;
            }

            const trigger = triggers[dropdownIndex];

            if (trigger.tagName === "SELECT") {
                if (await selectNativeSelectOption(trigger, optionIndex)) {
                    return true;
                }
            }

            safeClick(trigger);
            await sleep(DELAY_TIME);

            const options = getOpenListboxOptions();

            if (options.length > optionIndex) {
                safeClick(options[optionIndex]);
                await sleep(WAIT_AFTER_SELECT);
                return true;
            }

            const keywordLists = [
                LANG.topicUnderage,
                LANG.categoryParent
            ];
            const fallback = findButtonByKeywords(keywordLists[dropdownIndex] || []);

            if (fallback && safeClick(fallback)) {
                await sleep(WAIT_AFTER_SELECT);
                return true;
            }

            await sleep(400);
        }

        console.warn(
            "[Ziokatz Tool] Không chọn được dropdown",
            dropdownIndex + 1,
            "option",
            optionIndex + 1
        );
        return false;
    }

    async function selectDropdownOption(keywords) {
        for (let retry = 0; retry < MAX_RETRIES; retry++) {
            let option = findButtonByKeywords(keywords);
            if (option && safeClick(option)) {
                await sleep(WAIT_AFTER_SELECT);
                return true;
            }

            const opener = findButtonByKeywords(LANG.selectOption) ||
                queryForm('[role="combobox"], [aria-haspopup="listbox"]').find(isVisibleEl);

            if (opener) {
                safeClick(opener);
                await sleep(DELAY_TIME);
            }

            option = findButtonByKeywords(keywords);
            if (option && safeClick(option)) {
                await sleep(WAIT_AFTER_SELECT);
                return true;
            }

            await sleep(400);
        }

        console.warn("[Ziokatz Tool] Không chọn được:", keywords[0]);
        return false;
    }

    function fieldMeta(el) {
        const label = el.closest("label")?.innerText || "";
        const aria = el.getAttribute("aria-label") || "";
        const labelledBy = el.getAttribute("aria-labelledby");
        let labelFromId = "";

        if (labelledBy) {
            labelFromId = labelledBy
                .split(/\s+/)
                .map(id => document.getElementById(id)?.innerText || "")
                .join(" ");
        }

        return normalizeText(
            (el.placeholder || "") + " " +
            (el.name || "") + " " +
            (el.id || "") + " " +
            aria + " " +
            label + " " +
            labelFromId
        );
    }

    function findInputByHints(hints, excludeHints = []) {
        const els = queryForm('input:not([type="file"]):not([type="checkbox"]), textarea');

        return els.find(el => {
            const txt = fieldMeta(el);

            if (excludeHints.some(ex => txt.includes(normalizeText(ex)))) {
                return false;
            }

            return hints.some(h => txt.includes(normalizeText(h)));
        }) || null;
    }

    function formatUsername(val) {
        const trimmed = val.trim();
        if (!trimmed) {
            return "";
        }

        return trimmed.startsWith("@") ? trimmed : "@" + trimmed;
    }

    function getFormTextInputs() {
        return queryForm(
            'input:not([type="file"]):not([type="checkbox"]):not([type="hidden"])'
        ).filter(isVisibleEl);
    }

    function getFormTextareas() {
        return queryForm("textarea").filter(isVisibleEl);
    }

    function findLabelElement(labelTexts) {
        const candidates = queryForm("label, div, span, p");

        for (const search of labelTexts) {
            const normalized = normalizeText(search);
            const labelEl = candidates.find(el => {
                const txt = normalizeText(el.innerText);
                if (!txt || txt.length > 60) {
                    return false;
                }

                if (normalized === "username") {
                    return txt === "username" ||
                        txt === "username *" ||
                        txt.startsWith("username *");
                }

                return txt === normalized ||
                    txt === normalized + " *" ||
                    txt.startsWith(normalized + " *");
            });

            if (labelEl) {
                return labelEl;
            }
        }

        return null;
    }

    function findFieldNearLabel(labelTexts, tagFilter) {
        const labelEl = findLabelElement(labelTexts);

        if (!labelEl) {
            return null;
        }

        const forId = labelEl.getAttribute("for");
        if (forId) {
            const target = document.getElementById(forId);
            if (target && !isToolElement(target)) {
                if (!tagFilter || target.matches(tagFilter)) {
                    return target;
                }
            }
        }

        let node = labelEl.nextElementSibling;
        let steps = 0;

        while (node && steps < 4) {
            if (node.matches("input, textarea") && !isToolElement(node)) {
                if (!tagFilter || node.matches(tagFilter)) {
                    return node;
                }
            }

            const directChild = [...node.children].find(child => {
                return child.matches("input, textarea") && !isToolElement(child);
            });

            if (directChild && (!tagFilter || directChild.matches(tagFilter))) {
                return directChild;
            }

            node = node.nextElementSibling;
            steps++;
        }

        const parent = labelEl.parentElement;
        if (parent) {
            const directField = [...parent.children].find(child => {
                if (child === labelEl) {
                    return false;
                }

                if (child.matches("input, textarea") && !isToolElement(child)) {
                    return !tagFilter || child.matches(tagFilter);
                }

                const nested = child.querySelector?.("input, textarea");
                return nested && !isToolElement(nested) &&
                    (!tagFilter || nested.matches(tagFilter));
            });

            if (directField) {
                return directField.matches("input, textarea")
                    ? directField
                    : directField.querySelector("input, textarea");
            }
        }

        return null;
    }

    function findInputNearLabel(labelTexts) {
        return findFieldNearLabel(
            labelTexts,
            'input:not([type="checkbox"]):not([type="file"]):not([type="hidden"])'
        );
    }

    function findFieldByLabel(labelTexts, tagFilter) {
        return findFieldNearLabel(labelTexts, tagFilter);
    }

    function ensureMinDetail(text) {
        return (text || "").trim();
    }

    async function fillAndVerify(el, value, retries = 3) {
        if (!el || value === undefined || value === null || value === "") {
            return false;
        }

        await scrollToEl(el);

        for (let i = 0; i < retries; i++) {
            simulateInputWithTracker(el, value);
            await sleep(DELAY_TIME);

            if (el.value.trim() === String(value).trim()) {
                return true;
            }
        }

        console.warn("[Ziokatz Tool] Không xác nhận được giá trị:", value);
        return false;
    }

    async function fillFormFieldsOrdered(user1, user2, email, detail) {
        await waitFor(() => getFormTextInputs().length >= 3, 10000);
        await waitFor(() => getFormTextareas().length >= 1, 10000);

        const inputs = getFormTextInputs();
        const textareas = getFormTextareas();

        let reporterInput = findInputNearLabel(["username"]) || inputs[0];
        let emailInput = findInputNearLabel(LANG.contactEmail) || inputs[1];
        let theirInput = findInputNearLabel(["their username"]) || inputs[2];
        const detailArea =
            findFieldByLabel(LANG.additionalDetails, "textarea") ||
            textareas.find(el => fieldMeta(el).includes("tell us more")) ||
            textareas[0];

        if (emailInput === reporterInput) {
            emailInput = inputs[1] || emailInput;
        }

        if (theirInput === reporterInput || theirInput === emailInput) {
            theirInput = inputs[2] || theirInput;
        }

        await fillAndVerify(reporterInput, formatUsername(user1));

        if (email && emailInput && emailInput.tagName !== "TEXTAREA") {
            const emailOk = await fillAndVerify(emailInput, email);
            if (!emailOk && inputs[1] && inputs[1] !== reporterInput) {
                await fillAndVerify(inputs[1], email);
            }
        }

        await fillAndVerify(theirInput, formatUsername(user2));

        let detailText = (detail || "").trim();

        if (detailArea) {
            const finalDetail = ensureMinDetail(detailText);
            const detailOk = await fillAndVerify(detailArea, finalDetail);
            if (!detailOk) {
                console.warn("[Ziokatz Tool] Additional details chưa đủ 50 ký tự.");
            }
        }

        await sleep(INPUT_DELAY);
    }

    async function runFillForm(dataRef) {
        const user1 = document.getElementById("bb-user1").value;
        const user2 = document.getElementById("bb-user2").value;
        const detail = document.getElementById("bb-detail").value;

        let emails = document.getElementById("bb-email").value
            .split("\n")
            .map(v => v.trim())
            .filter(Boolean);

        const currentEmail = emails[0] || "";
        emails.shift();
        document.getElementById("bb-email").value = emails.join("\n");

        await selectDropdownByPosition(0, TOPIC_OPTION_INDEX);

        await waitFor(() => {
            return getFormDropdownTriggers().length >= 2 ||
                getFormTextInputs().length >= 1 ||
                findButtonByKeywords(LANG.categoryParent);
        }, 10000);

        await selectDropdownByPosition(1, CATEGORY_OPTION_INDEX);
        await sleep(DELAY_TIME);

        await fillFormFieldsOrdered(user1, user2, currentEmail, detail);

        const realUpload = queryForm('input[type="file"]')[0];
        const localUpload = document.getElementById("bb-image");

        if (realUpload && localUpload?.files?.length > 0) {
            await scrollToEl(realUpload);

            const dt = new DataTransfer();
            dt.items.add(localUpload.files[0]);
            realUpload.files = dt.files;
            realUpload.dispatchEvent(new Event("change", { bubbles: true }));
            await sleep(DELAY_TIME);
        }

        const declarationKeywords = [
            "I ensure, to the best of my ability",
            "By submitting, I acknowledge"
        ];

        async function tickDeclarationBox(keyword) {
            const textEl = queryForm("label, div, span, p, li").find(el => {
                const txt = (el.innerText || "").trim();
                return txt.includes(keyword) && txt.length < 250;
            });

            if (!textEl) {
                return false;
            }

            let checkbox = null;
            let node = textEl;

            for (let depth = 0; depth < 8 && node; depth++) {
                checkbox = node.querySelector?.(
                    '[role="checkbox"], input[type="checkbox"]'
                );

                if (!checkbox && node.matches?.('[role="checkbox"], input[type="checkbox"]')) {
                    checkbox = node;
                }

                if (!checkbox && node.previousElementSibling?.matches?.(
                    '[role="checkbox"], input[type="checkbox"]'
                )) {
                    checkbox = node.previousElementSibling;
                }

                if (checkbox) {
                    break;
                }

                node = node.parentElement;
            }

            const clickables = [
                checkbox,
                textEl.closest("label"),
                checkbox?.closest("label"),
                textEl.parentElement
            ].filter(Boolean);

            for (let attempt = 0; attempt < 4; attempt++) {
                for (const el of clickables) {
                    await scrollToEl(el);
                    safeClick(el);

                    if (el.type === "checkbox") {
                        el.click();
                    }

                    await sleep(DELAY_TIME);
                }

                if (checkbox?.type === "checkbox" && checkbox.checked) {
                    return true;
                }

                if (checkbox?.getAttribute?.("aria-checked") === "true") {
                    return true;
                }
            }

            return false;
        }

        for (const keyword of declarationKeywords) {
            await tickDeclarationBox(keyword);
        }

        const roleChecks = queryForm('[role="checkbox"]');

        for (const box of roleChecks.slice(-2)) {
            if (box.getAttribute("aria-checked") === "true") {
                continue;
            }

            for (let attempt = 0; attempt < 4; attempt++) {
                await scrollToEl(box);
                safeClick(box);
                await sleep(DELAY_TIME);

                if (box.getAttribute("aria-checked") === "true") {
                    break;
                }
            }
        }

        const checks = queryForm('input[type="checkbox"]');

        if (checks.length >= 2) {
            for (let i = checks.length - 2; i < checks.length; i++) {
                if (checks[i].checked) {
                    continue;
                }

                for (let attempt = 0; attempt < 4; attempt++) {
                    await scrollToEl(checks[i]);
                    checks[i].click();
                    safeClick(checks[i]);
                    await sleep(DELAY_TIME);

                    if (checks[i].checked) {
                        break;
                    }
                }
            }
        }

        Object.assign(dataRef, {
            user1,
            user2,
            email: document.getElementById("bb-email").value,
            detail
        });
        persistData(dataRef);

        await sleep(DELAY_TIME);
        window.open(TIKTOK_URL, "_blank");
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
#${HOST_ID} {
    position: fixed !important;
    inset: 0 !important;
    width: 0 !important;
    height: 0 !important;
    z-index: 2147483647 !important;
    pointer-events: none !important;
    overflow: visible !important;
}

#${PANEL_ID} {
    position: fixed !important;
    top: 100px !important;
    left: 40px !important;
    width: 350px !important;
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
    pointer-events: auto !important;
    background: linear-gradient(180deg, #0a0f0a 0%, #050805 100%);
    border: 1px solid #00ff41;
    border-radius: 4px;
    overflow: hidden;
    color: #39ff14;
    font-family: Consolas, "Courier New", monospace;
    box-shadow:
        0 0 10px rgba(0, 255, 65, 0.35),
        0 0 30px rgba(0, 255, 65, 0.15),
        inset 0 0 30px rgba(0, 255, 65, 0.03);
}

#bb-header {
    background: linear-gradient(90deg, #001a00 0%, #000000 50%, #001a00 100%);
    padding: 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: move;
    color: #00ff41;
    border-bottom: 1px solid #00ff41;
    box-shadow: 0 0 12px rgba(0, 255, 65, 0.25);
}

#bb-title {
    font-size: 18px;
    font-weight: bold;
    letter-spacing: 1px;
    text-shadow: 0 0 8px #00ff41;
    text-transform: uppercase;
}

#bb-version {
    font-size: 10px;
    color: #7dff7d;
    letter-spacing: 0.5px;
    margin-top: 2px;
}

#bb-content {
    padding: 12px;
    max-height: 80vh;
    overflow: auto;
    background: #050805;
}

#bb-content label {
    display: block;
    margin-top: 10px;
    margin-bottom: 4px;
    color: #00e676;
    font-size: 12px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
}

#bb-content input,
#bb-content textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 10px;
    border-radius: 2px;
    border: 1px solid #1b5e20;
    background: #0a120a;
    color: #39ff14;
    outline: none;
    font-family: Consolas, "Courier New", monospace;
    box-shadow: inset 0 0 8px rgba(0, 0, 0, 0.6);
}

#bb-content input:focus,
#bb-content textarea:focus {
    border-color: #00ff41;
    box-shadow:
        inset 0 0 8px rgba(0, 0, 0, 0.6),
        0 0 8px rgba(0, 255, 65, 0.35);
}

#bb-content textarea {
    min-height: 70px;
    resize: vertical;
}

#bb-content input[type="file"] {
    color: #7dff7d;
    font-size: 11px;
}

#bb-content input[type="file"]::file-selector-button {
    border: 1px solid #00ff41;
    background: #001a00;
    color: #00ff41;
    padding: 6px 10px;
    border-radius: 2px;
    cursor: pointer;
    font-family: Consolas, "Courier New", monospace;
    margin-right: 8px;
}

.bb-btns {
    display: flex;
    gap: 10px;
    margin-top: 15px;
    flex-wrap: wrap;
}

.bb-btns button,
#bb-music,
#bb-minimize,
#bb-open-link {
    border: 1px solid #00ff41;
    padding: 10px;
    border-radius: 2px;
    background: #001400;
    color: #00ff41;
    cursor: pointer;
    font-weight: bold;
    font-family: Consolas, "Courier New", monospace;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    box-shadow: 0 0 8px rgba(0, 255, 65, 0.2);
    transition: background 0.15s, box-shadow 0.15s;
}

.bb-btns button:hover,
#bb-music:hover,
#bb-minimize:hover,
#bb-open-link:hover {
    background: #003300;
    box-shadow: 0 0 14px rgba(0, 255, 65, 0.45);
}

.bb-btns button:disabled {
    opacity: 0.6;
    cursor: wait;
}

.bb-btns button {
    flex: 1;
    min-width: 120px;
}

#bb-open-link {
    width: 100%;
    margin-top: 8px;
}

#bb-minimize {
    width: 40px;
    min-width: 40px;
    flex: none;
}

.bb-music-wrap {
    margin-top: 10px;
}

#${PANEL_ID}.minimized #bb-content {
    display: none;
}
`;
        (document.head || document.documentElement).appendChild(style);
    }

    function getHost() {
        let host = document.getElementById(HOST_ID);

        if (!host) {
            host = document.createElement("div");
            host.id = HOST_ID;
            document.documentElement.appendChild(host);
        } else if (host.parentElement !== document.documentElement) {
            document.documentElement.appendChild(host);
        }

        return host;
    }

    function bindPanelEvents(panel, dataRef) {
        if (panel.dataset.bbBound === "1") {
            return;
        }

        panel.dataset.bbBound = "1";
        let isRunning = false;

        document.getElementById("bb-save").onclick = () => {
            const formData = {
                user1: document.getElementById("bb-user1").value,
                email: document.getElementById("bb-email").value,
                user2: document.getElementById("bb-user2").value,
                detail: document.getElementById("bb-detail").value
            };

            Object.assign(dataRef, formData);
            persistData(formData);
            alert("Đã Lưu!");
        };

        document.getElementById("bb-minimize").onclick = () => {
            panel.classList.toggle("minimized");
        };

        document.getElementById("bb-music").onclick = () => {
            const audio = document.getElementById("bb-audio");
            audio.volume = 0.5;
            audio.play().catch(() => {});
        };

        document.getElementById("bb-open-link").onclick = () => {
            window.open(TIKTOK_URL, "_blank");
        };

        document.getElementById("bb-start").onclick = async () => {
            if (isRunning) {
                return;
            }

            isRunning = true;
            const btn = document.getElementById("bb-start");
            const oldText = btn.textContent;
            btn.textContent = "ĐANG CHẠY...";
            btn.disabled = true;

            try {
                await runFillForm(dataRef);
            } catch (err) {
                console.error("[Ziokatz Tool]", err);
                alert("Lỗi khi chạy: " + err.message);
            } finally {
                isRunning = false;
                btn.textContent = oldText;
                btn.disabled = false;
            }
        };
    }

    function createPanelElement() {
        const panel = document.createElement("div");
        panel.id = PANEL_ID;
        panel.innerHTML = `
<div id="bb-header">
    <div>
        <div id="bb-title">Ziokatz Tool</div>
        <div id="bb-version">Tool Auto Report TikTok V2</div>
    </div>
    <button id="bb-minimize" type="button">—</button>
</div>
<div id="bb-content">
    <label>Username 1</label>
    <input id="bb-user1" type="text">

    <label>Email</label>
    <textarea id="bb-email" placeholder="1 email mỗi dòng"></textarea>

    <label>Username 2</label>
    <input id="bb-user2" type="text">

    <label>Chi Tiết Bổ Sung</label>
    <textarea id="bb-detail"></textarea>

    <label>Ảnh Upload</label>
    <input id="bb-image" type="file" accept="image/*">

    <div class="bb-btns">
        <button id="bb-save" type="button">Lưu Form</button>
        <button id="bb-start" type="button">START</button>
    </div>

    <button id="bb-open-link" type="button">Mở Link TikTok</button>

    <div class="bb-music-wrap">
        <button id="bb-music" type="button">🔊 Mở Nhạc</button>
        <audio id="bb-audio" loop src="https://files.catbox.moe/6r4m9x.mp3"></audio>
    </div>
</div>
`;
        return panel;
    }

    function loadFormValues(dataRef) {
        document.getElementById("bb-user1").value = dataRef.user1 || "";
        document.getElementById("bb-email").value = dataRef.email || "";
        document.getElementById("bb-user2").value = dataRef.user2 || "";
        document.getElementById("bb-detail").value = dataRef.detail || "";
    }

    function ensurePanel(dataRef) {
        injectStyles();

        const host = getHost();
        let panel = document.getElementById(PANEL_ID);

        if (panel && !host.contains(panel)) {
            host.appendChild(panel);
        }

        if (!panel) {
            panel = createPanelElement();
            host.appendChild(panel);
            loadFormValues(dataRef);
            bindPanelEvents(panel, dataRef);
        }

        return panel;
    }

    function startTool() {
        if (!checkAccess()) {
            return;
        }

        const dataRef = loadData();
        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        ensurePanel(dataRef);
        sessionStorage.removeItem("bb_auto_start");

        if (!window.__bbPinkDragBound) {
            window.__bbPinkDragBound = true;

            document.addEventListener("mousemove", (e) => {
                const currentPanel = document.getElementById(PANEL_ID);
                if (!dragging || !currentPanel) {
                    return;
                }

                currentPanel.style.left = (e.clientX - offsetX) + "px";
                currentPanel.style.top = (e.clientY - offsetY) + "px";
            });

            document.addEventListener("mouseup", () => {
                dragging = false;
            });

            document.addEventListener("mousedown", (e) => {
                const header = e.target.closest("#bb-header");
                const currentPanel = document.getElementById(PANEL_ID);
                if (!header || !currentPanel) {
                    return;
                }

                dragging = true;
                offsetX = e.clientX - currentPanel.offsetLeft;
                offsetY = e.clientY - currentPanel.offsetTop;
            });
        }

        if (!window.__bbPinkKeepAliveStarted) {
            window.__bbPinkKeepAliveStarted = true;

            const keepAlive = () => {
                if (sessionStorage.getItem("bb_access") !== "true") {
                    return;
                }
                ensurePanel(dataRef);
            };

            window.__bbPinkKeepAlive = keepAlive;

            setInterval(keepAlive, 1000);

            const observer = new MutationObserver(keepAlive);
            observer.observe(document.documentElement, {
                childList: true,
                subtree: true
            });

            window.addEventListener("load", keepAlive);
            document.addEventListener("visibilitychange", () => {
                if (!document.hidden) {
                    keepAlive();
                }
            });
        } else if (typeof window.__bbPinkKeepAlive === "function") {
            window.__bbPinkKeepAlive();
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", startTool);
    } else {
        startTool();
    }
})();
