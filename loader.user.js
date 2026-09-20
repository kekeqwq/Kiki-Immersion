// ==UserScript==
// @name         Kiki Immersion
// @namespace    https://github.com/kekeqwq/Kiki-Immersion
// @version      1.0.0
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

  const KIKI_LOADER_VERSION = "1.0.0";
  const MODULES = ["core", "yomitan", "ai", "ui", "youtube"];
  const GITHUB_RAW_BASE = "https://raw.githubusercontent.com/kekeqwq/Kiki-Immersion/main/modules/";

  try {
    window.__kiki_loader_version = KIKI_LOADER_VERSION;
    localStorage.setItem("kiki_loader_version", KIKI_LOADER_VERSION);
  } catch (e) {}

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
      localStorage.setItem("kiki_cache_version", "1.2.0");
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
