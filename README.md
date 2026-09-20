# Kiki Immersion

> *Touch & Mouse YouTube Immersion with Yomitan Dictionary Lookup, Frosted Glass Subtitles, AI Contextual Engine & Dynamic Hot-Reload.*

![Platform](https://img.shields.io/badge/platform-Safari%20%7C%20Chrome%20%7C%20Edge-blue.svg) ![Release](https://img.shields.io/badge/release-v1.2.0-emerald.svg) ![Architecture](https://img.shields.io/badge/architecture-Modular%20%26%20Hot--Reload-purple.svg) ![License](https://img.shields.io/badge/license-GPL--3.0-blue.svg)

---

## 📢 Release Overview

**v1.2.0 (The Modular & Universal Engine Milestone)**:
- **Full Modular Architecture**: Decoupled the monolithic codebase into 5 dedicated modules:
  - `core.js`: Core state, styling, storage, and utility helpers.
  - `yomitan.js`: Offline IndexedDB Yomitan dictionary engine, deinflector, and audio engine.
  - `ai.js`: OpenAI streaming client, MarginNote 4 style exploration pills, and multi-turn chat.
  - `ui.js`: HUD bar, Yomitan card UI, settings modal, about/hot-update modal, and subtitles overlay.
  - `youtube.js`: YouTube player hooks, timedtext track scraper, fullscreen gestures, and SPA observer.
- **Permanent Lightweight Loader (`loader.user.js`)**:
  - Starts instantly with zero cold-start delay by executing from local storage cache.
  - Automatic first-run bootstrap: downloads modules in parallel directly from GitHub raw.
- **In-App One-Click Hot Update**:
  - Top HUD bar features a dedicated `ℹ️ About` button.
  - Interactive "关于/热更" tab displays the status of all 5 modules and cache timestamp.
  - One-click `⚡ 检查并重新从 GitHub 拉取缓存 (一键热更新)` updates the modules in-place without needing to manually replace scripts in your extension.
- **Universal Engine Unification**: Officially retired the browser-specific naming limitation in favor of **Kiki Immersion**, paving the way for seamless multi-browser compatibility (Safari, iPadOS, Chrome, Edge).

---

## 🚀 Installation Guide

Choose either installation method based on your device and browser:

### 方式一：远程直链安装 (推荐 macOS / 桌面浏览器)
适用于支持远程 URL 订阅的扩展（如 macOS Safari Userscripts、Chrome/Edge Tampermonkey、Violentmonkey）：

👉 **[点击安装 loader.user.js](https://raw.githubusercontent.com/kekeqwq/Kiki-Immersion/main/loader.user.js)**

*如果扩展未自动拦截打开，请复制上方直链并在扩展管理面板中选择「从 URL 安装/添加」。*

---

### 方式二：代码复制粘贴安装 (针对 iPadOS Userscripts 扩展)
由于 iPadOS 的 Userscripts 扩展目前不支援直接通过 remote 链接拉取脚本，请**直接复制下方代码**，在 iPadOS Userscripts 扩展中点击「新建脚本」并粘贴保存即可：

```javascript
// ==UserScript==
// @name         Kiki Immersion
// @namespace    https://github.com/kekeqwq/Kiki-Immersion
// @version      1.2.0
// @description  Bilingual and interactive Japanese/English subtitles with Yomitan word lookup, offline dict caching, AI contextual engine & dynamic hot-reload.
// @author       keke
// @match        *://*.youtube.com/*
// @match        *://youtube.com/*
// @include      *://*.youtube.com/*
// @include      *://youtube.com/*
// @run-at       document-start
// @grant        none
// @inject-into  page
// ==/UserScript==

(() => {
  "use strict";

  const KIKI_LOADER_VERSION = "1.2.0";
  const MODULES = ["core", "yomitan", "ai", "ui", "youtube"];
  const GITHUB_RAW_BASE = "https://raw.githubusercontent.com/kekeqwq/Kiki-Immersion/main/modules/";

  // 1. Force Desktop YouTube Cookie early
  try {
    document.cookie = "PREF=f6=40000000&f5=30000; domain=.youtube.com; path=/; max-age=31536000; SameSite=Lax";
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

  function executeCachedModules() {
    const fullCode = MODULES.map(m => getCachedModule(m)).join("\n;\n");
    const runner = new Function(fullCode);
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
    hudToast.innerHTML = "<span style=\"display:inline-block;animation:kiki-spin 1s linear infinite;\">⏳</span> <span>Kiki Immersion: 正在拉取最新核心组件...</span><style>@keyframes kiki-spin{100%{transform:rotate(360deg)}}</style>";

    try {
      const results = await Promise.all(MODULES.map(m => fetchModule(m)));
      results.forEach((code, idx) => {
        setCachedModule(MODULES[idx], code);
      });
      localStorage.setItem("kiki_cache_version", KIKI_LOADER_VERSION);
      localStorage.setItem("kiki_cache_time", new Date().toLocaleString());

      hudToast.innerHTML = "<span>✅</span> <span>Kiki Immersion: 核心组件已就绪！</span>";
      setTimeout(() => hudToast.remove(), 1200);

      if (isManual) {
        setTimeout(() => location.reload(), 500);
      } else {
        executeCachedModules();
      }
    } catch (err) {
      console.error("[Kiki Loader] Bootstrapping failed:", err);
      if (hudToast) {
        hudToast.innerHTML = `<span style="color:#F87171;">❌</span> <span>拉取组件失败: ${err.message}</span>`;
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
