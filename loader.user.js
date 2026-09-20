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

  try {
    window.__kiki_loader_version = KIKI_LOADER_VERSION;
    localStorage.setItem("kiki_loader_version", KIKI_LOADER_VERSION);
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
    const fullCode = MODULES.map(m => getCachedModule(m)).join("\n;\n");
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
      localStorage.setItem("kiki_cache_version", "1.2.2");
      localStorage.setItem("kiki_loader_version", KIKI_LOADER_VERSION);
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
