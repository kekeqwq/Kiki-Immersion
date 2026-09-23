// ==UserScript==
// @name         Kiki Immersion
// @namespace    https://github.com/kekeqwq/Kiki-Immersion
// @version      1.0.3
// @description  Bilingual and interactive Japanese/English subtitles with Yomitan word lookup, offline dict caching, AI contextual engine & dynamic hot-reload.
// @author       keke
// @match        *://*.youtube.com/*
// @match        *://youtube.com/*
// @include      *://*.youtube.com/*
// @include      *://youtube.com/*
// @run-at       document-start
// @grant        none
// @inject-into  page
// @updateURL    https://raw.githubusercontent.com/kekeqwq/Kiki-Immersion/main/loader.user.js
// @downloadURL  https://raw.githubusercontent.com/kekeqwq/Kiki-Immersion/main/loader.user.js
// ==/UserScript==

(() => {
  "use strict";

  const KIKI_LOADER_VERSION = "1.0.3";
  const MODULES = ["core", "yomitan", "ai", "ui", "youtube"];
  const GITHUB_RAW_BASE = "https://raw.githubusercontent.com/kekeqwq/Kiki-Immersion/main/modules/";

  // -------------------------------------------------------------
  // HUD Toast Notification (Safe at document-start)
  // -------------------------------------------------------------
  function showLoaderHud(text, isError = false) {
    function mount() {
      try {
        let hudToast = document.getElementById("kiki-loader-hud");
        if (!hudToast) {
          hudToast = document.createElement("div");
          hudToast.id = "kiki-loader-hud";
          hudToast.style.cssText = "position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;background:rgba(15,23,42,0.94);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(99,102,241,0.6);border-radius:14px;padding:10px 20px;color:#E0E7FF;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,0.6);display:flex;align-items:center;gap:10px;pointer-events:none;";
          const target = document.body || document.documentElement;
          if (target) target.appendChild(hudToast);
        }
        if (hudToast) {
          hudToast.textContent = text;
          if (isError) hudToast.style.borderColor = "#F87171";
        }
        return hudToast;
      } catch (e) {
        return null;
      }
    }

    if (document.body || document.documentElement) {
      return mount();
    } else {
      document.addEventListener("DOMContentLoaded", mount, { once: true });
      return null;
    }
  }

  function hideLoaderHud(delay = 0) {
    setTimeout(() => {
      try {
        const hud = document.getElementById("kiki-loader-hud");
        if (hud) hud.remove();
      } catch (e) {}
    }, delay);
  }

  // -------------------------------------------------------------
  // 1. Force Desktop YouTube & Early Native Lockout
  // -------------------------------------------------------------
  try {
    document.cookie = "PREF=f6=40000000&f5=30000&app=desktop; domain=.youtube.com; path=/; max-age=31536000; Secure; SameSite=Lax";
  } catch (e) {}

  const isMobile = location.hostname === 'm.youtube.com' || (location.host && location.host.includes('m.youtube.com'));
  if (isMobile) {
    showLoaderHud("⏳ Kiki Immersion: Switching to Desktop YouTube...");
    const doRedirect = () => {
      try {
        const targetUrl = new URL(location.href);
        targetUrl.hostname = 'www.youtube.com';
        targetUrl.searchParams.set('app', 'desktop');
        targetUrl.searchParams.set('persist_app', '1');
        location.replace(targetUrl.toString());
      } catch (e) {
        location.href = "https://www.youtube.com/?app=desktop&persist_app=1";
      }
    };
    doRedirect();
    if (typeof document !== "undefined" && document.addEventListener) {
      document.addEventListener("DOMContentLoaded", doRedirect, { once: true });
    }
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

  const EXPECTED_CACHE_VERSION = "1.2.5";

  function hasAllCachedModules() {
    if (localStorage.getItem("kiki_cache_version") !== EXPECTED_CACHE_VERSION) return false;
    return MODULES.every(m => {
      const c = getCachedModule(m);
      return c && c.length > 50;
    });
  }

  let kikiPolicy = (typeof window !== "undefined" && window.__kiki_policy) ? window.__kiki_policy : null;
  function getPolicy() {
    if (kikiPolicy) return kikiPolicy;
    const tt = (typeof window !== "undefined" && window.trustedTypes) ||
               (typeof unsafeWindow !== "undefined" && unsafeWindow.trustedTypes);
    if (!tt || typeof tt.createPolicy !== "function") return null;

    // 1. Try 'default' policy (auto-resolves strings to TrustedScript/TrustedHTML across all sinks)
    try {
      kikiPolicy = tt.createPolicy("default", {
        createScript: s => s,
        createHTML: h => h,
        createScriptURL: u => u
      });
      if (typeof window !== "undefined") window.__kiki_policy = kikiPolicy;
      return kikiPolicy;
    } catch (e1) {}

    // 2. Try unique policy name to guarantee success without collision
    const candidateNames = [
      "kiki-loader-" + Math.random().toString(36).slice(2, 8),
      "kikiPolicy",
      "kiki-loader-exec"
    ];
    for (const name of candidateNames) {
      try {
        kikiPolicy = tt.createPolicy(name, {
          createScript: s => s,
          createHTML: h => h,
          createScriptURL: u => u
        });
        if (typeof window !== "undefined") window.__kiki_policy = kikiPolicy;
        return kikiPolicy;
      } catch (e2) {}
    }

    // 3. Fallback to existing defaultPolicy
    if (tt.defaultPolicy) {
      kikiPolicy = tt.defaultPolicy;
      if (typeof window !== "undefined") window.__kiki_policy = kikiPolicy;
      return kikiPolicy;
    }

    return null;
  }

  function executeCachedModules() {
    try {
      const fullCode = MODULES.map(m => getCachedModule(m)).join("\n;\n");
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
      } catch (fnErr) {
        // Fallback: inject inline script element into DOM
        const scriptEl = document.createElement("script");
        scriptEl.textContent = scriptSource;
        (document.head || document.documentElement).appendChild(scriptEl);
        scriptEl.remove();
      }
    } catch (e) {
      console.error("[Kiki Loader] Module execution error:", e);
      showLoaderHud("❌ Kiki Loader: Execution error: " + e.message, true);
      hideLoaderHud(4000);
    }
  }

  async function fetchModule(name) {
    const url = `${GITHUB_RAW_BASE}${name}.js?_t=${Date.now()}`;
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} on ${name}.js`);
    return await resp.text();
  }

  async function bootstrapAndFetchAll(isManual = false) {
    showLoaderHud("⏳ Kiki Immersion: Fetching core modules...");

    try {
      let detectedVersion = EXPECTED_CACHE_VERSION;
      const results = await Promise.all(MODULES.map(m => fetchModule(m)));

      // Pre-validate module syntax before committing to localStorage
      const p = getPolicy();
      for (let i = 0; i < MODULES.length; i++) {
        let src = results[i];
        if (p && typeof p.createScript === "function") {
          try { src = p.createScript(src); } catch (e) {}
        }
        try {
          new Function(src);
        } catch (syntaxErr) {
          if (syntaxErr.message && (syntaxErr.message.includes("Trusted") || syntaxErr.name === "EvalError")) {
            // Trusted Types policy restricts new Function, safe to continue
            break;
          }
          throw new Error(`Syntax error in ${MODULES[i]}.js: ${syntaxErr.message}`);
        }
      }

      results.forEach((code, idx) => {
        setCachedModule(MODULES[idx], code);
        if (MODULES[idx] === "core") {
          const mVer = code.match(/window\.__kiki_engine_version\s*=\s*["']([^"']+)["']/);
          if (mVer && mVer[1]) detectedVersion = mVer[1];
        }
      });
      localStorage.setItem("kiki_cache_version", detectedVersion);
      localStorage.setItem("kiki_engine_version", detectedVersion);
      localStorage.setItem("kiki_loader_version", KIKI_LOADER_VERSION);
      localStorage.setItem("kiki_cache_time", new Date().toLocaleString());

      showLoaderHud(`✅ Kiki Immersion: Engine v${detectedVersion} ready!`);
      hideLoaderHud(1200);

      if (isManual) {
        setTimeout(() => location.reload(), 500);
      } else {
        executeCachedModules();
      }
    } catch (err) {
      console.error("[Kiki Loader] Bootstrapping failed:", err);
      showLoaderHud("❌ Failed to fetch modules: " + err.message, true);
      hideLoaderHud(4000);
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
