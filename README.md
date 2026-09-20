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

  // -------------------------------------------------------------
  // 1. Force Desktop YouTube & Early Native Lockout
  // -------------------------------------------------------------
  try {
    document.cookie = "PREF=f6=40000000&f5=30000&app=desktop; domain=.youtube.com; path=/; max-age=31536000; SameSite=Lax";
  } catch (e) {}

  if (location.hostname === 'm.youtube.com' || location.host.includes('m.youtube.com')) {
    const targetUrl = new URL(location.href);
    targetUrl.hostname = 'www.youtube.com';
    targetUrl.searchParams.set('app', 'desktop');
    targetUrl.searchParams.set('persist_app', '1');
    location.replace(targetUrl.toString());
    return;
  }

  try {
    Object.defineProperty(navigator, 'platform', { get: () => "MacIntel" });
  } catch (e) {}

  if (document.documentElement) {
    document.documentElement.classList.add("kiki-lock-chrome");
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      document.documentElement.classList.add("kiki-lock-chrome");
    }, { once: true });
  }

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
    try {
      const runner = new Function(scriptSource);
      runner();
    } catch (e) {
      console.error("[Kiki Loader] Module execution error:", e);
    }
  }

  async function fetchModule(name) {
    const url = `${GITHUB_RAW_BASE}${name}.js?_t=${Date.now()}`;
    const resp = await fetch(url, { cache: "no-store" });
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

> **Tip**: After installing the Loader, the first time you open any YouTube page, it will automatically fetch and cache all core modules locally. Subsequent visits load with **zero latency** from local storage. To check for updates, simply click the update button in the `ℹ️ About` panel on the player HUD bar!

---

## ✨ Features & Highlights

1. **Dual-Core Learning System**
   - **First-Party Yomitan Dictionary**: Import standard `.zip` format dictionaries (OALD, Cambridge, JMdict, etc.) directly into `youtube.com`'s IndexedDB.
   - **High-DPI Font Typography**: Explicit pixel sizing (`22px` headwords, `15px` definitions with 1.65 line height), eliminating YouTube's `10px` root rem scaling trap.
   - **AI Contextual Explanation Engine**:
     - **MarginNote 4 Style Exploration Pills**: Dynamically provides 2~4 clickable follow-up pills tailored to the video sentence and response.
     - **Real-Time Reasoning Progress & Auto-Collapse**: Streaming reasoning tokens fold neatly into a purple `✦ Reasoning Complete` status bar.
     - **Multi-Turn Conversational Chat**: Pinned bottom input bar for continuous inquiries with conversation memory.
     - **Mode Switcher**: One-click switching between `⚡ Quick Glance`, `📚 Deep Study`, and `⚙️ Custom`.
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
├── loader.user.js            # Permanent lightweight loader entrypoint (~100 lines)
├── modules/                  # Modular source code
│   ├── core.js               # Core state, storage, helper utilities, styles
│   ├── yomitan.js            # Yomitan offline IndexedDB dictionary & audio
│   ├── ai.js                 # AI explanation engine, streaming & exploration pills
│   ├── ui.js                 # HUD bar, card layout, settings & update modal
│   └── youtube.js            # YouTube DOM adapter, subtitle capture & gestures
├── manifest.json             # Module registry and metadata manifest
├── scripts/                  # Build and bundling scripts
│   ├── bundle.py             # Generates dist single-file bundle
│   └── build_all.py          # Build and sync utilities
└── dist/
    └── kiki-immersion.user.js # Standalone monolithic bundle (fully offline)
```

---

## 📄 License

GPL-3.0 License. Open-source touch-first YouTube immersion player.
