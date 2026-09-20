# Kiki Immersion

> *Touch & Mouse YouTube Immersion with Yomitan Dictionary Lookup, Frosted Glass Subtitles, AI Contextual Engine & Dynamic Hot-Reload.*

![Platform](https://img.shields.io/badge/platform-Safari%20%7C%20Chrome%20%7C%20Edge-blue.svg) ![Release](https://img.shields.io/badge/engine-v1.2.2-emerald.svg) ![Loader](https://img.shields.io/badge/loader-v1.0.1-purple.svg) ![Architecture](https://img.shields.io/badge/architecture-Modular%20%26%20Hot--Reload-purple.svg) ![License](https://img.shields.io/badge/license-GPL--3.0-blue.svg)

---

## 📢 Release Overview

**Loader v1.0.1 (iPadOS Desktop Redirection Fix)**:
- **Immediate Desktop Enforcement**: Enforces `PREF` desktop cookies and redirects `m.youtube.com` to `www.youtube.com` right at `document-start` before fetching modules, preventing iPadOS Safari from getting trapped on the mobile web interface during fresh installation.
- **Root-level Redirection**: Moved redirection logic directly into the controllable local loader script rather than delayed remote modules.

**v1.2.2 (HUD Auto-Hide, Interactive Dismiss & Vector Settings Icon)**:
- **HUD Auto-Hide & Persistence Fix**: Fixed a bug where background caption updates repeatedly unhid the top bar; now smoothly auto-hides after 6 seconds of inactivity (or 3.5s after pointer leaves).
- **Multiple Manual Dismiss Controls**: Easily hide the HUD anytime by tapping the top-left video corner, clicking the green status dot `[●]`, or clicking the new `✕` close button on the bar.
- **Crisp Vector Settings Icon**: Replaced fragile font-dependent gear text glyph with an inline vector SVG icon that renders sharply and consistently across macOS, iPadOS, iOS, Chrome, and Windows.
- **Track Dropdown Safety**: Automatically keeps the HUD open while the subtitle tracks dropdown menu is being browsed.

**v1.2.1 (Streamlined HUD, Track Dropdown & True Subtitle Fallback)**:
- **Streamlined HUD Bar**: Refined to 5 essential, high-utility controls: `Settings`, `ℹ️ About`, `💬 Sub: On/Off`, `CC Status (with Dropdown)`, and `🔄 Reload`.
- **Elongated Subtitle Track Status**: Displays the active track name and loaded line count (e.g., `CC: English · 142 ▾`, `CC: English (auto) · 98 ▾`, `CC: Live ▾`).
- **Interactive Track Dropdown Menu**: Clicking the CC status button opens a dropdown listing all available official and auto-generated subtitle tracks, allowing instant manual track switching.
- **Strict Subtitle Priority**: Prioritizes official native audio language tracks, followed by auto-generated captions, with realtime word-by-word subtitles as true fallback.
- **Centered Toast Notifications**: Re-anchored feedback toasts to the exact center of the screen so they are never obscured by top bars or controls.

---

## 🚀 Installation Guide

Choose either installation method based on your device and browser:

### Method 1: Remote URL Installation (Recommended for macOS & Desktop Browsers)
For extensions that support remote URL subscriptions (e.g., macOS Safari Userscripts, Chrome/Edge Tampermonkey, Violentmonkey):

👉 **[Install loader.user.js](https://raw.githubusercontent.com/kekeqwq/Kiki-Immersion/main/loader.user.js)**

*If your extension does not automatically intercept the link, copy the URL and select "Install from URL" in your extension dashboard.*

---

### Method 2: Copy-Paste Installation (For iPadOS Userscripts Extension)
Since iPadOS Userscripts does not support direct remote URL script installation, copy the code below, create a new script in Userscripts, and paste it:

```javascript
// ==UserScript==
// @name         Kiki Immersion
// @namespace    https://github.com/kekeqwq/Kiki-Immersion
// @version      1.0.1
// @description  Bilingual and interactive Japanese/English subtitles with Yomitan word lookup, offline dict caching, AI contextual engine & dynamic hot-reload.
// @author       keke
// @match        https://m.youtube.com/*
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @match        *://m.youtube.com/*
// @match        *://www.youtube.com/*
// @match        *://*.youtube.com/*
// @match        *://youtube.com/*
// @include      https://m.youtube.com/*
// @include      https://www.youtube.com/*
// @include      https://youtube.com/*
// @include      *://m.youtube.com/*
// @include      *://www.youtube.com/*
// @include      *://*.youtube.com/*
// @include      *://youtube.com/*
// @run-at       document-start
// @grant        none
// @inject-into  page
// ==/UserScript==

(() => {
  "use strict";

  const KIKI_LOADER_VERSION = "1.0.1";
  const MODULES = ["core", "yomitan", "ai", "ui", "youtube"];
  const GITHUB_RAW_BASE = "https://raw.githubusercontent.com/kekeqwq/Kiki-Immersion/main/modules/";

  // 1. Force Desktop YouTube Cookie (app=desktop is required for YouTube server to bypass m.youtube)
  function ensureDesktopPreferences() {
    try {
      const match = document.cookie.match(/(?:^|;\s*)PREF=([^;]*)/);
      let pref = match ? match[1] : "";
      if (/app=[^&]*/.test(pref)) {
        pref = pref.replace(/app=[^&]*/g, "app=desktop");
      } else {
        pref = "app=desktop" + (pref ? "&" + pref : "");
      }
      if (!pref.includes("f6=40000000")) pref += "&f6=40000000";
      if (!pref.includes("f5=30000")) pref += "&f5=30000";
      const baseVal = `PREF=${pref}; max-age=31536000; path=/; Secure; SameSite=Lax`;
      document.cookie = baseVal;
      document.cookie = `${baseVal}; domain=.youtube.com`;
      document.cookie = `${baseVal}; domain=youtube.com`;
    } catch (e) {}
  }

  ensureDesktopPreferences();

  // 2. Immediately intercept mobile YouTube domain
  const isMobile = location.hostname === "m.youtube.com" || location.host.includes("m.youtube.com");
  if (isMobile) {
    try {
      const targetUrl = new URL(location.href);
      targetUrl.hostname = "www.youtube.com";
      targetUrl.searchParams.set("app", "desktop");
      targetUrl.searchParams.set("persist_app", "1");
      location.replace(targetUrl.href);
    } catch (e) {
      location.href = "https://www.youtube.com/?app=desktop&persist_app=1";
    }
    return;
  }

  document.addEventListener("click", (e) => {
    try {
      const link = e.target && e.target.closest ? e.target.closest("a") : null;
      if (link && link.href && link.hostname && link.hostname.includes("m.youtube.com")) {
        e.preventDefault();
        e.stopPropagation();
        const target = new URL(link.href);
        target.hostname = "www.youtube.com";
        target.searchParams.set("app", "desktop");
        target.searchParams.set("persist_app", "1");
        location.href = target.href;
      }
    } catch (err) {}
  }, true);

  // 3. Spoof desktop browser environment so YouTube desktop web app never bounces back on iPad
  try {
    const desktopUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
    Object.defineProperty(navigator, "userAgent", { get: () => desktopUA, configurable: true });
    Object.defineProperty(navigator, "appVersion", { get: () => "5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15", configurable: true });
    Object.defineProperty(navigator, "platform", { get: () => "MacIntel", configurable: true });
  } catch (e) {}

  function getCachedModule(name) {
    try {
      return localStorage.getItem("kiki_mod_" + name);
    } catch (e) {
      return null;
    }
  }

  function setCachedModule(name, code) {
    try {
      localStorage.setItem("kiki_mod_" + name, code);
    } catch (e) {}
  }

  function hasAllCachedModules() {
    return MODULES.every(m => {
      const c = getCachedModule(m);
      return c && c.length > 50;
    });
  }

  let kikiPolicy = null;
  function getPolicy() {
    if (kikiPolicy) return kikiPolicy;
    if (window.trustedTypes && window.trustedTypes.createPolicy) {
      try {
        kikiPolicy = window.trustedTypes.createPolicy("kiki-loader-exec", { createScript: s => s, createHTML: h => h });
      } catch (e) {
        kikiPolicy = window.trustedTypes.defaultPolicy || { createScript: s => s };
      }
    }
    return kikiPolicy;
  }

  function executeCachedModules() {
    const fullCode = MODULES.map(m => getCachedModule(m)).join("
;
");
    let scriptSource = fullCode;
    const p = getPolicy();
    if (p && typeof p.createScript === "function") {
      try {
        scriptSource = p.createScript(fullCode);
      } catch (e) {}
    }
    const runner = new Function(scriptSource);
    runner();
  }

  async function fetchModule(name) {
    const url = `${GITHUB_RAW_BASE}${name}.js?_t=${Date.now()}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} on ${name}.js`);
    return await resp.text();
  }

  async function bootstrapAndFetchAll(isManual = false) {
    let hudToast = document.getElementById("kiki-loader-hud");
    if (!hudToast) {
      hudToast = document.createElement("div");
      hudToast.id = "kiki-loader-hud";
      hudToast.style.cssText = "position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;background:rgba(15,23,42,0.94);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(99,102,241,0.6);border-radius:14px;padding:10px 20px;color:#E0E7FF;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,0.6);display:flex;align-items:center;gap:10px;pointer-events:none;";
      (document.body || document.documentElement).appendChild(hudToast);
    }
    hudToast.textContent = "⏳ Kiki Immersion: Fetching core modules...";

    try {
      const results = await Promise.all(MODULES.map(m => fetchModule(m)));
      results.forEach((code, idx) => {
        setCachedModule(MODULES[idx], code);
      });
      localStorage.setItem("kiki_cache_version", KIKI_LOADER_VERSION);
      localStorage.setItem("kiki_cache_time", new Date().toLocaleString());

      hudToast.textContent = "✅ Kiki Immersion: Core modules ready!";
      setTimeout(() => hudToast.remove(), 1200);

      if (isManual) {
        setTimeout(() => location.reload(), 500);
      } else {
        executeCachedModules();
      }
    } catch (err) {
      console.error("[Kiki Loader] Bootstrapping failed:", err);
      if (hudToast) {
        hudToast.textContent = "❌ Failed to fetch modules: " + err.message;
        hudToast.style.borderColor = "#F87171";
        setTimeout(() => hudToast.remove(), 4000);
      }
      throw err;
    }
  }

  // Hot-reload API exposed for About modal & dev
  window.__kiki_reload_modules = bootstrapAndFetchAll;

  // Boot execution
  if (hasAllCachedModules()) {
    try {
      executeCachedModules();
    } catch (err) {
      console.error("[Kiki Loader] Execution of cached modules failed, re-fetching...", err);
      bootstrapAndFetchAll(false);
    }
  } else {
    // First time install or cache cleared: bootstrap from raw GitHub
    bootstrapAndFetchAll(false);
  }
})();
```

> **提示**：安装 Loader 后，首次打开任意 YouTube 页面将自动并发拉取核心组件并缓存至本地；后续使用将实现 **0 延迟本地秒开**。需要更新时，只需在播放器顶部的 `ℹ️ About` 面板中点击「一键热更新」即可！

---

## ✨ Features & Highlights

1. **Dual-Core Learning System**
   - **First-Party Yomitan Dictionary**: Import standard `.zip` format dictionaries (OALD, Cambridge, JMdict, etc.) directly into `youtube.com`'s IndexedDB.
   - **High-DPI Font Typography**: Explicit pixel sizing (`22px` headwords, `15px` definitions with 1.65 line height), eliminating YouTube's `10px` root rem scaling trap.
   - **AI Contextual Explanation Engine**:
     - **MarginNote 4 Style Exploration Pills**: Dynamically provides 2~4 clickable follow-up pills tailored to the video sentence and response.
     - **Real-Time Reasoning Progress & Auto-Collapse**: Streaming reasoning tokens fold neatly into a purple `✦ 思考完成` status bar.
     - **Multi-Turn Conversational Chat**: Pinned bottom input bar for continuous inquiries with conversation memory.
     - **Mode Switcher**: One-click switching between `⚡ 简答速查` (Quick Glance), `📚 深度精学` (Deep Study), and `⚙️ 自定义` (Custom).
     - **Max Tokens Presets**: Friendly presets (`4096` default, `8192`, `2048`, custom) to prevent answer cutoffs.

2. **Rock-Solid Subtitle Pipeline (Strict Non-Live Mode)**
   - Wire-level `/api/timedtext` interceptor and complete sentence line reconstruction.
   - Multi-word phrase matching and highlight in subtitles.

3. **Touch-First Gesture Engine**
   - Double-tap center screen (64% area) for rock-solid webpage fullscreen toggling with debounce protection.
   - Touch left/right 18% zones for instant subtitle cue seeking.

4. **Standalone Bundle (Optional)**
   - For users who prefer a single monolithic offline script without dynamic loader bootstrapping, download [`dist/kiki-immersion.user.js`](https://raw.githubusercontent.com/kekeqwq/Kiki-Immersion/main/dist/kiki-immersion.user.js).

---

## 🛠 Project Structure

```text
Kiki-Immersion/
├── loader.user.js            # 永久轻量级 Loader 引导程序 (~100 行)
├── modules/                  # 核心模块化代码库
│   ├── core.js               # 核心状态、存储、通用函数、样式
│   ├── yomitan.js            # Yomitan 离线 IndexedDB 词典引擎与音频
│   ├── ai.js                 # AI 语境解析、流式多轮与 MarginNote 胶囊
│   ├── ui.js                 # HUD 控制条、卡片排版、设置与热更面板
│   └── youtube.js            # YouTube DOM 适配、字幕抓取与手势全屏
├── manifest.json             # 模块注册清单与元数据
├── scripts/                  # 本地自动化打包与构建脚本
│   ├── bundle.py             # 毫秒级生成 dist 单文件 Bundle
│   └── build_all.py          # 构建与同步脚本
└── dist/
    └── kiki-immersion.user.js # 单文件完整发布产物 (供完全离线使用)
```

---

## 📄 License

GPL-3.0 License. Open-source touch-first YouTube immersion player.
