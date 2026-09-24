// ==UserScript==
// @name         Kiki Immersion
// @namespace    https://github.com/kekeqwq/Kiki-Immersion
// @version      1.3.1
// @description  Bilingual and interactive Japanese/English subtitles with Yomitan word lookup, offline dict caching, AI contextual engine, and global web lookup.
// @author       keke
// @match        *://*.youtube.com/*
// @match        *://youtube.com/*
// @match        *://*/*
// @include      *://*.youtube.com/*
// @include      *://youtube.com/*
// @include      *
// @run-at       document-start
// @grant        none
// @inject-into  page
// @updateURL    https://raw.githubusercontent.com/kekeqwq/Kiki-Immersion/main/dist/kiki-immersion.user.js
// @downloadURL  https://raw.githubusercontent.com/kekeqwq/Kiki-Immersion/main/dist/kiki-immersion.user.js
// ==/UserScript==

(() => {
  'use strict';

  // -------------------------------------------------------------
  // 1. Force Desktop YouTube & Early Native Lockout (YouTube Only)
  // -------------------------------------------------------------
  const isYouTubeSite = /(?:^|\.)youtube\.com$/.test(location.hostname);
  if (isYouTubeSite) {
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
  }


// >>> BEGIN MODULE: core <<<

// =============================================================
// Kiki Immersion - Core Module (State, Config, Styles, Utilities)
// Version: 1.3.1
// =============================================================

  window.__kiki_engine_version = "1.3.1";
  try {
    localStorage.setItem("kiki_engine_version", "1.3.1");
    localStorage.setItem("kiki_cache_version", "1.3.1");
  } catch (e) {}

  let savedPot = "";
  try {
    savedPot = window.__kiki_lastPoToken || sessionStorage.getItem("kiki_pot") || "";
  } catch {}

  const STATE = window.STATE = {
    enabled: true,
    subsVisible: localStorage.getItem("kiki_subs_visible") !== "0",
    webLookupKey: localStorage.getItem("kiki_web_lookup_key") || "ctrl",
    cues: [],
    liveCues: [],
    tracks: [],
    activeTrack: null,
    idx: -1,
    pausedForLookup: false,
    lookupEl: null,
    lookupWord: "",
    sentenceContext: "",
    lastLookupDismissTime: 0,
    fs: false,
    videoId: null,
    hudVisible: false,
    loadingTracks: false,
    liveMode: true,
    liveFallbackAllowed: true,
    lastObservedText: "",
    lastPoToken: savedPot,
    capturedLastUrl: window.__kiki_capturedUrl || "",
    capturedBody: window.__kiki_capturedBody || "",
    capturedVideoId: "",
    engineVersion: "1.3.1"
  };

  // -------------------------------------------------------------
  // Early TimedText Wire Sniffer & Dynamic URL Capture
  // -------------------------------------------------------------
  const TIMEDTEXT_MARK = "/api/timedtext";

  function noteTimedtextUrl(url) {
    if (typeof url !== "string" || !url.includes(TIMEDTEXT_MARK)) return;
    try {
      const u = new URL(url, location.href);
      const pot = u.searchParams.get("pot");
      if (pot && pot.length > 10) {
        STATE.lastPoToken = pot;
        try { sessionStorage.setItem("kiki_pot", pot); } catch {}
      }
    } catch {}
    let urlVid = "";
    try { urlVid = new URL(url, location.href).searchParams.get("v") || ""; } catch {}
    const cid = urlVid || (typeof currentVideoId === "function" ? currentVideoId() : STATE.videoId);
    if (STATE.capturedVideoId && cid && STATE.capturedVideoId !== cid) {
      STATE.capturedLastUrl = "";
      STATE.capturedBody = "";
    }
    STATE.capturedVideoId = cid;
    STATE.capturedLastUrl = url;
  }
  window.noteTimedtextUrl = noteTimedtextUrl;

  function checkResourceTimingForTimedtext() {
    try {
      if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") return "";
      const entries = performance.getEntriesByType("resource");
      for (let i = entries.length - 1; i >= 0; i--) {
        const name = entries[i].name;
        if (typeof name === "string" && name.includes(TIMEDTEXT_MARK)) {
          noteTimedtextUrl(name);
          return name;
        }
      }
    } catch {}
    return "";
  }
  window.checkResourceTimingForTimedtext = checkResourceTimingForTimedtext;

  function handleCapturedWire(body, url) {
    if (!body || body.trim().length < 20) return;
    noteTimedtextUrl(url);
    STATE.capturedBody = body;
    STATE.capturedLastUrl = url;
    if (typeof window.__kiki_onCapturedWireBody === "function") {
      try { window.__kiki_onCapturedWireBody(body, url); } catch {}
    }
  }

  // Hook fetch & XMLHttpRequest early for YouTube timedtext capture (only on YouTube domains)
  const isYouTubeDomain = /(?:^|\.)youtube\.com$/.test(location.hostname);
  if (isYouTubeDomain) {
    const origFetch = (window.fetch ? window.fetch.bind(window) : null);
    window.origFetch = origFetch || window.fetch;
    if (origFetch) {
      window.fetch = function (...args) {
        let reqUrl = "";
        try {
          const req = args[0];
          reqUrl = typeof req === "string" ? req : (req?.url || req?.href || (req && typeof req.toString === "function" ? req.toString() : ""));
          noteTimedtextUrl(reqUrl);
        } catch {}

        const promise = origFetch.apply(window, args);
        try {
          if (typeof reqUrl === "string" && reqUrl.includes(TIMEDTEXT_MARK)) {
            promise.then((res) => {
              try {
                res.clone().text().then((text) => {
                  if (text && text.trim().length > 20) {
                    handleCapturedWire(text, reqUrl);
                  }
                }).catch(() => {
                  try {
                    res.clone().arrayBuffer().then((buf) => {
                      if (buf && buf.byteLength > 20) {
                        const text = new TextDecoder("utf-8").decode(buf);
                        if (text && text.trim().length > 20) handleCapturedWire(text, reqUrl);
                      }
                    }).catch(() => {});
                  } catch {}
                });
              } catch {}
            }).catch(() => {});
          }
        } catch {}
        return promise;
      };
    }

    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (...args) {
      try {
        const url = args[1];
        this.__kiki_url = typeof url === "string" ? url : (url?.href || String(url || ""));
        noteTimedtextUrl(this.__kiki_url);
      } catch {}
      return origOpen.apply(this, args);
    };
    XMLHttpRequest.prototype.send = function (...args) {
      try {
        const reqUrl = this.__kiki_url;
        if (typeof reqUrl === "string" && reqUrl.includes(TIMEDTEXT_MARK)) {
          let captured = false;
          const processResponse = () => {
            if (captured) return;
            try {
              if (this.status && (this.status < 200 || this.status >= 400)) return;
              let body = "";
              try {
                if (this.responseType === "" || this.responseType === "text") {
                  body = this.responseText || "";
                } else if (this.responseType === "arraybuffer" && this.response) {
                  try {
                    body = new TextDecoder("utf-8").decode(this.response);
                  } catch (e1) {
                    try {
                      const bytes = new Uint8Array(this.response);
                      let s = "";
                      for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
                      body = decodeURIComponent(escape(s));
                    } catch (e2) {}
                  }
                } else if (this.responseType === "blob" && this.response instanceof Blob) {
                  try {
                    this.response.text().then(t => {
                      if (t && t.trim().length > 20) {
                        captured = true;
                        handleCapturedWire(t, reqUrl);
                      }
                    }).catch(() => {});
                  } catch {}
                  return;
                } else if (this.responseType === "json") {
                  body = typeof this.response === "string" ? this.response : JSON.stringify(this.response || "");
                } else if (this.responseType === "document" && this.responseXML) {
                  body = new XMLSerializer().serializeToString(this.responseXML);
                }
              } catch {}
              if (body && body.trim().length > 20) {
                captured = true;
                handleCapturedWire(body, reqUrl);
              }
            } catch {}
          };

          this.addEventListener("load", processResponse, { once: true });
          this.addEventListener("readystatechange", () => {
            if (this.readyState === 4) processResponse();
          });
        }
      } catch {}
      return origSend.apply(this, args);
    };

    try {
      const obs = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (typeof e.name === "string" && e.name.includes(TIMEDTEXT_MARK)) {
            noteTimedtextUrl(e.name);
          }
        }
      });
      obs.observe({ type: "resource", buffered: true });
    } catch {}
  }

  // -------------------------------------------------------------
  // Trusted Types Policy & Safe HTML Setter
  // YouTube CSP on Chromium / WebKit enforces Trusted Types.
  // Direct innerHTML assignment throws TypeError: This assignment requires a TrustedHTML
  // -------------------------------------------------------------
  let kikiPolicy = (typeof window !== "undefined" && window.__kiki_policy) ? window.__kiki_policy : null;
  const tt = (typeof window !== "undefined" && window.trustedTypes) ||
             (typeof unsafeWindow !== "undefined" && unsafeWindow.trustedTypes);
  if (!kikiPolicy && tt && typeof tt.createPolicy === "function") {
    try {
      kikiPolicy = tt.createPolicy("default", {
        createHTML: (s) => s,
        createScript: (s) => s,
        createScriptURL: (s) => s,
      });
      if (typeof window !== "undefined") window.__kiki_policy = kikiPolicy;
    } catch {
      const candidateNames = [
        "kiki-core-" + Math.random().toString(36).slice(2, 8),
        "kikiPolicy",
        "kiki-policy"
      ];
      for (const name of candidateNames) {
        try {
          kikiPolicy = tt.createPolicy(name, {
            createHTML: (s) => s,
            createScript: (s) => s,
            createScriptURL: (s) => s,
          });
          if (typeof window !== "undefined") window.__kiki_policy = kikiPolicy;
          break;
        } catch {}
      }
    }
  }
  if (!kikiPolicy && tt && tt.defaultPolicy) {
    kikiPolicy = tt.defaultPolicy;
    if (typeof window !== "undefined") window.__kiki_policy = kikiPolicy;
  }


  function setHtml(el, html) {
    if (!el) return;
    if (!html) {
      el.textContent = "";
      return;
    }
    if (kikiPolicy && typeof kikiPolicy.createHTML === "function") {
      try {
        el.innerHTML = kikiPolicy.createHTML(html);
        return;
      } catch {}
    }
    try {
      el.innerHTML = html;
      return;
    } catch {}
    try {
      el.textContent = "";
      const doc = new DOMParser().parseFromString(html, "text/html");
      while (doc.body.firstChild) {
        el.appendChild(doc.body.firstChild);
      }
    } catch (err) {
      console.warn("[Kiki setHtml fallback error]", err);
    }
  }

  function $(sel, root = document) { return root.querySelector(sel); }

  function playerEl() {
    return document.getElementById("movie_player") ||
           document.querySelector(".html5-video-player") ||
           document.querySelector("ytd-player") ||
           document.querySelector("#player-container") ||
           document.querySelector("#player") ||
           (videoEl() && videoEl().closest(".html5-video-player, ytd-player, #player"));
  }

  function videoEl() {
    return document.querySelector("video.html5-main-video") ||
           document.querySelector("ytd-player video") ||
           document.querySelector("#movie_player video") ||
           document.querySelector("video");
  }

  function toast(msg) {
    let el = $("#kiki-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "kiki-toast";
      (document.body || document.documentElement).appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 1400);
  }


  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }


  // -------------------------------------------------------------
  // 4. UI Styles (Serif, Clean, Touch-First)
  // -------------------------------------------------------------
  const STYLES = `
    :root {
      --kiki-paper: #EFEBE3;
      --kiki-ink: #141413;
      --kiki-accent: #D9534F;
      --kiki-font: 26px;
      --kiki-family: "Iowan Old Style", "Palatino Linotype", Palatino, "Songti SC", Georgia, serif;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --kiki-paper: #1E1E1C;
        --kiki-ink: #EFEBE3;
        --kiki-accent: #E86B5A;
      }
    }

    /* Webpage Fullscreen Mode */
    html.kiki-webpage-fs,
    html.kiki-webpage-fs body {
      overflow: hidden !important;
      width: 100% !important;
      height: 100% !important;
    }
    html.kiki-webpage-fs ytd-app, html.kiki-webpage-fs #content { overflow: hidden !important; }
    html.kiki-webpage-fs ytd-masthead, html.kiki-webpage-fs #secondary, html.kiki-webpage-fs #below,
    html.kiki-webpage-fs #related, html.kiki-webpage-fs #comments, html.kiki-webpage-fs #chat,
    html.kiki-webpage-fs #playlist, html.kiki-webpage-fs ytd-watch-next-secondary-results-renderer,
    html.kiki-webpage-fs #masthead-container, html.kiki-webpage-fs tp-yt-app-drawer,
    html.kiki-webpage-fs #guide { display: none !important; }

    html.kiki-webpage-fs ytd-watch-flexy, html.kiki-webpage-fs #player-container-outer,
    html.kiki-webpage-fs #player-container-inner, html.kiki-webpage-fs #player-container,
    html.kiki-webpage-fs #player {
      width: 100% !important; height: 100% !important; max-width: 100% !important; max-height: 100% !important;
    }
    html.kiki-webpage-fs ytd-player, html.kiki-webpage-fs #movie_player, html.kiki-webpage-fs .html5-video-player {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      width: 100% !important;
      width: 100vw !important;
      height: 100% !important;
      height: 100dvh !important;
      max-width: 100% !important;
      max-height: 100% !important;
      max-height: 100dvh !important;
      z-index: 2147483000 !important;
      background: #000 !important;
      overflow: hidden !important;
    }
    html.kiki-webpage-fs .html5-video-container {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      width: 100% !important;
      height: 100% !important;
      max-width: 100% !important;
      max-height: 100% !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      overflow: hidden !important;
    }
    html.kiki-webpage-fs video.html5-main-video {
      position: static !important;
      width: 100% !important;
      height: 100% !important;
      max-width: 100% !important;
      max-height: 100% !important;
      object-fit: contain !important;
      object-position: center center !important;
      top: 0 !important;
      left: 0 !important;
      margin: 0 auto !important;
      transform: none !important;
    }

    /* Ensure Video Player container is positioning context */
    #movie_player, .html5-video-player {
      position: relative !important;
    }

    /* Suppress YouTube Bottom-Right Miniplayer & Continue Watching Promo */
    ytd-miniplayer,
    #miniplayer,
    ytd-miniplayer-renderer,
    ytd-mealbar-promo-renderer,
    yt-mealbar-promo-renderer {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
      opacity: 0 !important;
      width: 0 !important;
      height: 0 !important;
    }

    /* Native YouTube Captions - Suppressed when Kiki is active */
    html.kiki-hide-native .ytp-caption-window-container,
    html.kiki-hide-native .ytp-caption-window,
    html.kiki-hide-native .caption-window,
    html.kiki-hide-native .ytp-caption-segment,
    html.kiki-hide-native .caption-visual-line,
    html.kiki-captions-active .ytp-caption-window-container,
    html.kiki-captions-active .ytp-caption-window,
    html.kiki-captions-active .caption-window,
    html.kiki-captions-active .ytp-caption-segment,
    html.kiki-captions-active .caption-visual-line {
      opacity: 0 !important;
      pointer-events: none !important;
      color: transparent !important;
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
    }

    /* WebKit Native HTML5 Video TextTrack Subtitle Suppression */
    video::cue,
    video.kiki-hide-native-cue::cue,
    html.kiki-hide-native video::cue,
    html.kiki-captions-active video::cue {
      opacity: 0 !important;
      color: transparent !important;
      background: transparent !important;
      font-size: 0 !important;
    }

    /* Native YouTube Controls Lockout */
    html.kiki-lock-chrome:not(.kiki-show-chrome) .ytp-chrome-bottom,
    html.kiki-lock-chrome:not(.kiki-show-chrome) .ytp-chrome-top,
    html.kiki-lock-chrome:not(.kiki-show-chrome) .ytp-gradient-bottom,
    html.kiki-lock-chrome:not(.kiki-show-chrome) .ytp-gradient-top,
    html.kiki-lock-chrome:not(.kiki-show-chrome) .ytp-pause-overlay,
    html.kiki-lock-chrome:not(.kiki-show-chrome) .ytp-player-content.ytp-iv-player-content,
    html.kiki-lock-chrome:not(.kiki-show-chrome) .ytp-touch-controls,
    html.kiki-lock-chrome:not(.kiki-show-chrome) .ytp-mobile-controls,
    html.kiki-lock-chrome:not(.kiki-show-chrome) .ytp-bezel,
    html.kiki-lock-chrome:not(.kiki-show-chrome) .ytp-doubletap-ui,
    html.kiki-lock-chrome:not(.kiki-show-chrome) .ytp-doubletap-overlay {
      opacity: 0 !important; pointer-events: none !important;
    }

    /* When Controls are explicitly requested */
    html.kiki-show-chrome #kiki-zones {
      pointer-events: none !important;
    }
    html.kiki-show-chrome .ytp-chrome-bottom,
    html.kiki-show-chrome .ytp-chrome-top,
    html.kiki-show-chrome .ytp-gradient-bottom,
    html.kiki-show-chrome .ytp-gradient-top,
    html.kiki-show-chrome .ytp-popup,
    html.kiki-show-chrome .ytp-settings-menu {
      opacity: 1 !important;
      pointer-events: auto !important;
      z-index: 2147483640 !important;
    }

    /* Root Overlay & Floating Captions */
    #kiki-root {
      position: fixed !important; inset: 0 !important; z-index: 2147483640 !important; pointer-events: none !important;
      font-family: var(--kiki-family); color: var(--kiki-ink);
    }

    /* Single-Line Captions above Video Controls */
    #kiki-captions {
      position: fixed !important; transform: translateX(-50%) !important;
      width: min(94%, 1000px) !important; pointer-events: auto !important;
      z-index: 2147483645 !important; text-align: center !important;
      min-height: 1em !important;
    }
    #kiki-captions {
      position: fixed !important; transform: translateX(-50%) !important;
      width: min(94%, 1000px) !important; pointer-events: auto !important;
      z-index: 2147483645 !important; text-align: center !important;
      min-height: 1em !important;
      transition: top 0.22s cubic-bezier(0.16, 1, 0.3, 1), bottom 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
    }
    #kiki-captions.kiki-hidden {
      display: none !important;
    }
    .kiki-line {
      display: inline-block !important; max-width: 100% !important;
      padding: 0.38em 0.95em !important; margin: 0.1em 0 !important;
      color: #FFFFFF !important;
      background: rgba(18, 18, 22, 0.72) !important;
      backdrop-filter: blur(16px) saturate(160%) !important;
      -webkit-backdrop-filter: blur(16px) saturate(160%) !important;
      border: 1.5px solid rgba(255, 255, 255, 0.28) !important;
      border-radius: 18px !important; line-height: 1.35 !important;
      font-size: var(--kiki-font, 26px) !important; font-weight: 500 !important;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.65) !important;
    }
    .kiki-word {
      display: inline !important; padding: 0.06em 0.12em !important; margin: 0 0.05em !important; cursor: pointer !important;
      border-radius: 6px !important; border-bottom: 2px solid transparent !important;
      -webkit-tap-highlight-color: transparent !important; touch-action: manipulation !important;
    }
    .kiki-word.kiki-active, .kiki-word:hover {
      background: rgba(224, 90, 71, 0.35) !important;
      border-bottom-color: var(--kiki-accent, #E86B5A) !important;
    }

    /* Yomitan Standalone Popup Card (Hub Matching Typography & Subtitle Glassmorphism) */
    #kiki-yomitan-card {
      position: fixed !important; z-index: 2147483647 !important;
      left: 50% !important; transform: translateX(-50%) !important;
      background: rgba(18, 18, 22, 0.78) !important;
      backdrop-filter: blur(20px) saturate(160%) !important;
      -webkit-backdrop-filter: blur(20px) saturate(160%) !important;
      border: 1.5px solid rgba(255, 255, 255, 0.28) !important;
      border-radius: 18px !important; box-shadow: 0 16px 48px rgba(0, 0, 0, 0.75) !important;
      color: #EFEBE3 !important;
      overflow-x: hidden !important; overflow-y: auto !important; -webkit-overflow-scrolling: touch !important;
      padding: 18px 22px !important; box-sizing: border-box !important; display: none; pointer-events: auto !important;
      width: min(580px, calc(100vw - 28px)) !important;
      max-width: min(580px, calc(100vw - 28px)) !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
    }
    #kiki-yomitan-card.show { display: block !important; }
    .kiki-card-header { margin-bottom: 12px; }
    .kiki-card-term-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
    .kiki-card-term { font-size: 22px !important; font-weight: 800; letter-spacing: -0.01em; color: #FFFFFF !important; line-height: 1.25 !important; }
    .kiki-card-reading { font-size: 14.5px !important; opacity: 0.9; color: #CBD5E1 !important; font-weight: 500; }
    .kiki-card-audio-btn {
      background: rgba(255, 255, 255, 0.12); border: 1px solid rgba(255, 255, 255, 0.2);
      color: #FFF; border-radius: 50%; width: 28px; height: 28px;
      display: inline-flex; align-items: center; justify-content: center;
      cursor: pointer; font-size: 13px; transition: background 0.15s; user-select: none;
    }
    .kiki-card-audio-btn:hover, .kiki-card-audio-btn:active { background: rgba(255, 255, 255, 0.28); }
    .kiki-card-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .kiki-badge {
      font-size: 11.5px !important; font-weight: 600; padding: 2.5px 8px !important; border-radius: 4px; line-height: 1.35;
      display: inline-flex; align-items: center;
    }
    .kiki-badge-dict { background: rgba(255, 255, 255, 0.08); color: #9B9890; border: 1px solid rgba(255, 255, 255, 0.14); }
    .kiki-badge-redirect { color: #10B981; background: rgba(16, 185, 129, 0.14); border: 1px solid rgba(16, 185, 129, 0.3); }
    .kiki-badge-pos { color: #E86B5A; background: rgba(232, 107, 90, 0.15); border: 1px solid rgba(232, 107, 90, 0.32); }
    .kiki-badge-level { color: #60A5FA; background: rgba(37, 99, 235, 0.15); border: 1px solid rgba(37, 99, 235, 0.32); }
    .kiki-badge-vocab { color: #A78BFA; background: rgba(124, 58, 237, 0.15); border: 1px solid rgba(124, 58, 237, 0.32); }
    .kiki-card-body { font-size: 15px !important; line-height: 1.65 !important; margin-top: 12px; color: #F1F5F9 !important; }
    .kiki-card-body p { margin-bottom: 8px !important; font-size: 15px !important; line-height: 1.65 !important; }
    .kiki-card-body ul, .kiki-card-body ol { margin: 6px 0 10px 18px !important; padding: 0 !important; }
    .kiki-card-body li { font-size: 15px !important; line-height: 1.65 !important; margin-bottom: 6px !important; }
    .kiki-card-body table { font-size: 14.5px !important; border-collapse: collapse; }
    .kiki-card-body td, .kiki-card-body th { padding: 4px 8px !important; font-size: 14.5px !important; }
    .kiki-card-body span, .kiki-card-body div { font-size: inherit; line-height: inherit; }
    .kiki-card-body strong, .kiki-card-body b { font-weight: 700; color: #FFFFFF !important; }
    .gloss-sc-span, .gloss-sc-div, .gloss-sc-p, .gloss-sc-li { font-size: 15px !important; line-height: 1.65 !important; }
    .kiki-card-empty { padding: 16px 0; text-align: center; opacity: 0.9; }

    /* AI Enhancements & Button Styles */
    .kiki-cap-ai-btn {
      display: inline-flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important;
      width: 38px !important; height: 38px !important; min-width: 38px !important; min-height: 38px !important;
      background: rgba(99, 102, 241, 0.38) !important;
      backdrop-filter: blur(12px) !important; -webkit-backdrop-filter: blur(12px) !important;
      border: 1.5px solid rgba(165, 180, 252, 0.5) !important; border-radius: 11px !important;
      margin-right: 10px !important; padding: 0 !important;
      cursor: pointer !important; vertical-align: middle !important; transition: all 0.15s ease !important;
      user-select: none !important; -webkit-user-select: none !important; touch-action: manipulation !important;
      line-height: 1 !important; box-sizing: border-box !important;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4) !important;
    }
    .kiki-cap-ai-btn .kiki-ai-icon {
      font-size: 13px !important; line-height: 1 !important; margin-bottom: 2px !important; color: #A5B4FC !important;
    }
    .kiki-cap-ai-btn .kiki-ai-text {
      font-size: 10.5px !important; font-weight: 800 !important; letter-spacing: 0.5px !important; line-height: 1 !important; color: #FFFFFF !important;
    }
    .kiki-cap-ai-btn:hover, .kiki-cap-ai-btn:active {
      background: rgba(99, 102, 241, 0.82) !important; border-color: #C7D2FE !important;
      box-shadow: 0 0 14px rgba(99, 102, 241, 0.65) !important;
      transform: scale(0.96) !important;
    }
    .kiki-cap-ai-btn:hover .kiki-ai-icon, .kiki-cap-ai-btn:active .kiki-ai-icon {
      color: #FFFFFF !important;
    }
    .kiki-card-ai-switch-btn {
      background: rgba(99, 102, 241, 0.25) !important; color: #C7D2FE !important;
      border: 1px solid rgba(165, 180, 252, 0.35) !important; border-radius: 6px !important;
      padding: 3px 8px !important; font-size: 11.5px !important; font-weight: 600 !important;
      cursor: pointer !important; display: inline-flex !important; align-items: center !important; gap: 4px !important;
      user-select: none !important; -webkit-user-select: none !important;
    }
    .kiki-card-ai-switch-btn:hover {
      background: rgba(99, 102, 241, 0.5) !important; color: #FFF !important;
    }
    .kiki-ai-thinking {
      animation: kikiPulse 1.5s infinite ease-in-out !important;
    }
    @keyframes kikiPulse {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 1; }
    }

    /* On-Screen Feedback Toast (Centered Glassmorphism) */
    #kiki-toast {
      position: fixed !important;
      top: 50% !important;
      left: 50% !important;
      transform: translate(-50%, -50%) !important;
      pointer-events: none !important;
      font-size: 14px !important;
      font-weight: 600 !important;
      padding: 0.65em 1.45em !important;
      background: rgba(18, 18, 22, 0.88) !important;
      color: #FFFFFF !important;
      backdrop-filter: blur(20px) saturate(180%) !important;
      -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
      border: 1.5px solid rgba(255, 255, 255, 0.35) !important;
      border-radius: 16px !important;
      opacity: 0;
      transition: opacity 0.18s ease-out !important;
      z-index: 2147483647 !important;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.8) !important;
      user-select: none !important;
      -webkit-user-select: none !important;
      max-width: min(85vw, 500px) !important;
      text-align: center !important;
    }
    #kiki-toast.show { opacity: 1 !important; }

    /* Floating Draggable Controller HUD */
    #kiki-hud {
      position: fixed !important;
      top: 64px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      bottom: auto !important;
      right: auto !important;
      z-index: 2147483647 !important;
      display: flex !important; align-items: center !important; gap: 8px !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      font-size: 13px !important; font-weight: 600 !important;
      background: #141418 !important; color: #FFFFFF !important;
      padding: 7px 15px !important; border-radius: 22px !important;
      border: 2px solid rgba(255, 255, 255, 0.85) !important;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.95) !important;
      user-select: none !important; -webkit-user-select: none !important;
      pointer-events: auto !important; cursor: grab !important;
      visibility: visible !important; opacity: 1 !important;
      touch-action: none !important;
    }
    #kiki-hud:hover { background: rgba(32, 32, 36, 0.98) !important; }
    #kiki-hud .kiki-hud-dot {
      width: 9px !important; height: 9px !important; border-radius: 50% !important;
      background: #10B981 !important; flex-shrink: 0 !important;
      box-shadow: 0 0 8px #10B981 !important;
    }
    #kiki-hud .kiki-hud-btn {
      background: rgba(255, 255, 255, 0.16) !important; border-radius: 12px !important;
      padding: 5px 11px !important; font-size: 11.5px !important; cursor: pointer !important;
      pointer-events: auto !important; touch-action: manipulation !important;
      -webkit-touch-callout: none !important; user-select: none !important; -webkit-user-select: none !important;
      border: 1px solid rgba(255, 255, 255, 0.2) !important; color: #FFFFFF !important;
      font-weight: 600 !important; -webkit-tap-highlight-color: transparent !important;
      white-space: nowrap !important; transition: background 0.12s ease, transform 0.08s ease !important;
    }
    #kiki-hud .kiki-hud-btn:hover {
      background: rgba(255, 255, 255, 0.3) !important;
    }
    #kiki-hud .kiki-hud-btn:active {
      background: rgba(255, 255, 255, 0.45) !important;
      transform: scale(0.93) !important;
    }
    #kiki-hud .kiki-hud-cc {
      min-width: 140px !important;
      max-width: 250px !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      text-align: center !important;
    }

    /* Subtitle Track Selection Dropdown Menu */
    #kiki-track-dropdown {
      position: fixed !important; z-index: 2147483647 !important;
      background: rgba(20, 20, 26, 0.95) !important;
      backdrop-filter: blur(24px) saturate(180%) !important;
      -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
      border: 1.5px solid rgba(255, 255, 255, 0.3) !important;
      border-radius: 16px !important;
      padding: 6px !important;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.85) !important;
      min-width: 240px !important;
      max-width: 340px !important;
      max-height: 380px !important;
      overflow-y: auto !important;
      -webkit-overflow-scrolling: touch !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 4px !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      user-select: none !important;
      -webkit-user-select: none !important;
    }
    .kiki-dropdown-header {
      font-size: 11px !important;
      font-weight: 700 !important;
      text-transform: uppercase !important;
      letter-spacing: 0.5px !important;
      color: #94A3B8 !important;
      padding: 6px 10px 4px !important;
    }
    .kiki-dropdown-item {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      padding: 8px 12px !important;
      border-radius: 10px !important;
      font-size: 12.5px !important;
      font-weight: 500 !important;
      color: #E2E8F0 !important;
      cursor: pointer !important;
      background: transparent !important;
      border: none !important;
      text-align: left !important;
      transition: background 0.12s ease !important;
      gap: 8px !important;
      width: 100% !important;
      box-sizing: border-box !important;
    }
    .kiki-dropdown-item:hover, .kiki-dropdown-item:active {
      background: rgba(255, 255, 255, 0.14) !important;
      color: #FFFFFF !important;
    }
    .kiki-dropdown-item.active {
      background: rgba(37, 99, 235, 0.35) !important;
      color: #93C5FD !important;
      font-weight: 700 !important;
      border: 1px solid rgba(96, 165, 250, 0.4) !important;
    }
    .kiki-dropdown-tag {
      font-size: 10.5px !important;
      padding: 1.5px 6px !important;
      border-radius: 4px !important;
      background: rgba(255, 255, 255, 0.12) !important;
      color: #CBD5E1 !important;
      flex-shrink: 0 !important;
    }
    .kiki-dropdown-sep {
      height: 1px !important;
      background: rgba(255, 255, 255, 0.12) !important;
      margin: 4px 2px !important;
    }

    #kiki-hub-iframe { display: none !important; width: 0 !important; height: 0 !important; }
  `;

  function injectStyles() {
    try {
      if (!document.getElementById('kiki-styles')) {
        const s = document.createElement('style');
        s.id = 'kiki-styles';
        s.textContent = STYLES;
        (document.head || document.documentElement || document.body).appendChild(s);
      }
      const hosts = document.querySelectorAll('ytd-player, ytd-watch-flexy, #player');
      hosts.forEach((h) => {
        try {
          if (h.shadowRoot && !h.shadowRoot.querySelector('#kiki-styles-shadow')) {
            const s = document.createElement('style');
            s.id = 'kiki-styles-shadow';
            s.textContent = STYLES;
            h.shadowRoot.appendChild(s);
          }
        } catch {}
      });
    } catch (e) {
      console.warn('[Kiki injectStyles]', e);
    }
  }



  // -------------------------------------------------------------
  // 3. Structured Content Renderer (Yomitan Spec)
  // -------------------------------------------------------------
  /**
 * Kiki Immersion - Standalone Yomitan Structured Content Renderer
 * Converts Yomitan JSON structured-content format into semantic HTML DOM nodes.
 */
class KikiStructuredContent {
    /**
     * Render structured-content to an HTMLElement
     * @param {*} content Yomitan structured content node, string, or array
     * @returns {HTMLElement|DocumentFragment|Text}
     */
    static render(content) {
        if (typeof content === 'string') {
            return document.createTextNode(content);
        }

        if (Array.isArray(content)) {
            const fragment = document.createDocumentFragment();
            for (const item of content) {
                fragment.appendChild(this.render(item));
            }
            return fragment;
        }

        if (!content || typeof content !== 'object') {
            return document.createTextNode('');
        }

        // Handle wrapper object { type: 'structured-content', content: ... }
        if (content.type === 'structured-content' && content.content) {
            return this.render(content.content);
        }

        const tag = content.tag;
        if (!tag) {
            return document.createTextNode('');
        }

        // Allowed valid HTML tags in Yomitan specification
        const validTags = new Set([
            'div', 'span', 'ol', 'ul', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
            'details', 'summary', 'ruby', 'rt', 'rp', 'br', 'img', 'a', 'p', 'b', 'i', 'strong', 'em'
        ]);

        const elementTag = validTags.has(tag) ? tag : 'span';
        const element = document.createElement(elementTag);

        // Add Yomitan class
        element.classList.add(`gloss-sc-${elementTag}`);

        // Set dataset / attributes (crucial for [data-sc-class="..."] selector matching)
        if (content.data && typeof content.data === 'object') {
            for (const [key, value] of Object.entries(content.data)) {
                if (value !== undefined && value !== null) {
                    // Both dataset and explicit attribute for maximum CSS compatibility
                    const attrName = `data-sc-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
                    element.setAttribute(attrName, String(value));
                    
                    // Also set regular class if data has class
                    if (key === 'class') {
                        const classNames = String(value).split(/\s+/).filter(Boolean);
                        classNames.forEach(c => element.classList.add(c));
                    }
                }
            }
        }

        // Set lang
        if (content.lang) {
            element.lang = content.lang;
        }

        // Set title
        if (content.title) {
            element.title = content.title;
        }

        // Set open attribute for details
        if (content.open) {
            element.setAttribute('open', '');
        }

        // Set table cell spanning
        if (elementTag === 'th' || elementTag === 'td') {
            if (typeof content.colSpan === 'number') element.colSpan = content.colSpan;
            if (typeof content.rowSpan === 'number') element.rowSpan = content.rowSpan;
        }

        // Set inline styles from style object
        if (content.style && typeof content.style === 'object') {
            for (const [prop, val] of Object.entries(content.style)) {
                try {
                    element.style[prop] = val;
                } catch (e) {
                    // Ignore invalid CSS properties
                }
            }
        }

        // Append children
        if (content.content !== undefined) {
            element.appendChild(this.render(content.content));
        }

        return element;
    }
}

window.KikiStructuredContent = KikiStructuredContent;
  window.KikiStructuredContent = KikiStructuredContent;


  // -------------------------------------------------------------
  // 5. Dictionary & AI Lookup Engine
  // -------------------------------------------------------------
  const AI_MODES = {
    quick: {
      id: "quick",
      nameZh: "⚡ 简答速查",
      nameEn: "⚡ Quick & Concise",
      descZh: "2–4 句解释，适合观影快速理解",
      descEn: "2–4 sentences, great for uninterrupted watching",
      promptZh: "你是简洁的语言老师。学习者在字幕「{{sentence}}」里点了「{{word}}」。若该词像语音识别错误或网络新词，先猜测本意。用通顺中文解释它在本句中的意思，2–4 句。必要时注明词性。不要整句逐字翻译。\n\n在回答最后以 <<<EXPLORE>>> 开头列出 2–3 个学习者可能想继续探索的方向（如本词语法句法、历史/文化背景、类似词辨析或实用造句，每行以 - 开头），并以 <<<END_EXPLORE>>> 结尾。",
      promptEn: "You are a concise language tutor. The learner tapped \"{{word}}\" in this subtitle: \"{{sentence}}\". If it looks like a speech-to-text error or internet slang, infer the intended word. Explain the meaning in simple English in 2-4 short sentences. Mention part of speech if clear. Do not translate the whole line unless needed for sense.\n\nAt the end, list 2-3 follow-up exploration topics (e.g. grammar, cultural background, confusing words, usage) wrapped between <<<EXPLORE>>> and <<<END_EXPLORE>>> with each topic starting with - ."
    },
    deep: {
      id: "deep",
      nameZh: "📚 深度精学",
      nameEn: "📚 Deep Learning",
      descZh: "全面教学解析：词义辨析、词性搭配、实用例句与记忆点",
      descEn: "In-depth breakdown: nuances, collocations, grammar & examples",
      promptZh: "你是资深语言外教。学习者在字幕「{{sentence}}」里点了「{{word}}」。请结合上下文详细教学解析：1. 本词/短语在本句中的精准含义与词性（若是网络新词或语音识别错误请推测本意）；2. 核心语法搭配、习惯用法或文化背景；3. 提供 2 个贴近日常生活的地道例句（附中文对照）；4. 记忆技巧或易混辨析。排版清晰美观。\n\n在回答最后以 <<<EXPLORE>>> 开头列出 2–3 个深入追问或拓展探索方向（每行以 - 开头），并以 <<<END_EXPLORE>>> 结尾。",
      promptEn: "You are an experienced language mentor. The learner tapped \"{{word}}\" in this subtitle: \"{{sentence}}\". Provide an insightful deep-dive breakdown: 1. Accurate contextual meaning and part of speech in this line (infer intended word if speech-to-text error or slang); 2. Core grammatical usage, collocations, or cultural nuances; 3. Two natural example sentences with translations; 4. Memory mnemonic or confusing word comparison. Keep formatting clean and structured.\n\nAt the end, list 2-3 follow-up exploration topics wrapped between <<<EXPLORE>>> and <<<END_EXPLORE>>> with each topic starting with - ."
    },
    custom: {
      id: "custom",
      nameZh: "⚙️ 自定义",
      nameEn: "⚙️ Custom Prompt",
      descZh: "自由编写自定义 Prompt 模板",
      descEn: "Use your own custom prompt template"
    }
  };

  const AI_DEFAULTS = {
    apiBase: "https://api.openai.com/v1",
    apiKey: "",
    apiModel: "gpt-4o-mini",
    aiLang: "zh",
    aiMode: "quick",
    maxTokens: "4096",
    promptZh: AI_MODES.quick.promptZh,
    promptEn: AI_MODES.quick.promptEn
  };

  function getAiConfig() {
    return {
      apiBase: localStorage.getItem("kiki_ai_base") || AI_DEFAULTS.apiBase,
      apiKey: localStorage.getItem("kiki_ai_key") || "",
      apiModel: localStorage.getItem("kiki_ai_model") || AI_DEFAULTS.apiModel,
      aiLang: localStorage.getItem("kiki_ai_lang") || AI_DEFAULTS.aiLang,
      aiMode: localStorage.getItem("kiki_ai_mode") || AI_DEFAULTS.aiMode,
      maxTokens: localStorage.getItem("kiki_ai_max_tokens") || AI_DEFAULTS.maxTokens,
      promptZh: localStorage.getItem("kiki_ai_prompt_zh") || AI_DEFAULTS.promptZh,
      promptEn: localStorage.getItem("kiki_ai_prompt_en") || AI_DEFAULTS.promptEn
    };
  }

  function saveAiConfig(cfg) {
    if (cfg.apiBase !== undefined) localStorage.setItem("kiki_ai_base", (cfg.apiBase || "").trim());
    if (cfg.apiKey !== undefined) localStorage.setItem("kiki_ai_key", (cfg.apiKey || "").trim());
    if (cfg.apiModel !== undefined) localStorage.setItem("kiki_ai_model", (cfg.apiModel || "").trim());
    if (cfg.aiLang !== undefined) localStorage.setItem("kiki_ai_lang", cfg.aiLang || "zh");
    if (cfg.aiMode !== undefined) localStorage.setItem("kiki_ai_mode", cfg.aiMode || "quick");
    if (cfg.maxTokens !== undefined) localStorage.setItem("kiki_ai_max_tokens", String(cfg.maxTokens || "4096"));
    if (cfg.promptZh !== undefined) localStorage.setItem("kiki_ai_prompt_zh", cfg.promptZh);
    if (cfg.promptEn !== undefined) localStorage.setItem("kiki_ai_prompt_en", cfg.promptEn);
    updateHud();
  }

  let activeAiAbort = null;
  function abortActiveAi() {
    if (activeAiAbort) {
      try { activeAiAbort.abort(); } catch {}
      activeAiAbort = null;
    }
  }


  function renderMarkdownText(text) {
    if (!text) return "";
    let html = escapeHtml(text);
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
    html = html.replace(/\*([^\*]+)\*/g, '<em>$1</em>');
    html = html.replace(/`([^`]+)`/g, '<code style="background: rgba(255,255,255,0.15); padding: 2px 5px; border-radius: 4px; font-family: monospace; font-size: 0.9em;">$1</code>');
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  function getSliceText(fromEl, toEl) {
    let cur = fromEl;
    let str = "";
    let blocked = false;
    while (cur) {
      const text = cur.textContent || "";
      if (cur !== fromEl && cur !== toEl && cur.nodeType === Node.TEXT_NODE) {
        // Block phrase detection across major clause/sentence punctuation
        if (/[,.?!:;()\[\]"“”—\/\\]/.test(text)) {
          blocked = true;
          break;
        }
      }
      str += text;
      if (cur === toEl) break;
      cur = cur.nextSibling;
    }
    if (blocked) return null;
    return str.trim();
  }


  function parseContentAndSuggestions(rawText, isEn, term) {
    if (!rawText) return { content: "", suggestions: [] };
    const markerStart = "<<<EXPLORE>>>";
    const markerEnd = "<<<END_EXPLORE>>>";
    const sIdx = rawText.indexOf(markerStart);
    if (sIdx === -1) {
      return {
        content: rawText.trim(),
        suggestions: [
          isEn ? `Grammar & syntax breakdown of "${term}"` : `深入剖析「${term}」在本句的语法结构`,
          isEn ? `More real-world example sentences` : `提供更多生活化地道例句`,
          isEn ? `Cultural background & similar nuances` : `探索文化背景与易混淆辨析`
        ]
      };
    }
    const content = rawText.slice(0, sIdx).trim();
    const eIdx = rawText.indexOf(markerEnd, sIdx + markerStart.length);
    const exploreBlock = eIdx !== -1 
      ? rawText.slice(sIdx + markerStart.length, eIdx)
      : rawText.slice(sIdx + markerStart.length);
    
    const lines = exploreBlock
      .split("\n")
      .map(l => l.replace(/^[\s*\-—–•\d.]+/, "").trim())
      .filter(l => l.length > 1 && !l.startsWith("<"));
    
    return {
      content,
      suggestions: lines.length ? lines.slice(0, 4) : [
        isEn ? `Grammar & syntax breakdown of "${term}"` : `深入剖析「${term}」在本句的语法结构`,
        isEn ? `More real-world example sentences` : `提供更多生活化地道例句`,
        isEn ? `Cultural background & similar nuances` : `探索文化背景与易混淆辨析`
      ]
    };
  }

  const PILL_THEMES = [
    { border: "rgba(244, 63, 94, 0.45)", bg: "rgba(244, 63, 94, 0.12)", color: "#FDA4AF", hover: "rgba(244, 63, 94, 0.22)" },
    { border: "rgba(245, 158, 11, 0.45)", bg: "rgba(245, 158, 11, 0.12)", color: "#FCD34D", hover: "rgba(245, 158, 11, 0.22)" },
    { border: "rgba(16, 185, 129, 0.45)", bg: "rgba(16, 185, 129, 0.12)", color: "#6EE7B7", hover: "rgba(16, 185, 129, 0.22)" },
    { border: "rgba(139, 92, 246, 0.45)", bg: "rgba(139, 92, 246, 0.12)", color: "#C4B5FD", hover: "rgba(139, 92, 246, 0.22)" }
  ];



// >>> END MODULE: core <<<


// >>> BEGIN MODULE: yomitan <<<

// =============================================================
// Kiki Immersion - Yomitan Offline Dictionary & Audio Engine
// Version: 1.2.2
// =============================================================

  // =============================================================
  // Built-in First-Party Offline Yomitan Dictionary & Audio Engine
  // =============================================================
  // --- JSZip Library ---
  /*!

JSZip v3.10.1 - A JavaScript class for generating and reading zip files
<http://stuartk.com/jszip>

(c) 2009-2016 Stuart Knightley <stuart [at] stuartk.com>
Dual licenced under the MIT license or GPLv3. See https://raw.github.com/Stuk/jszip/main/LICENSE.markdown.

JSZip uses the library pako released under the MIT license :
https://github.com/nodeca/pako/blob/main/LICENSE
*/

!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{("undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof self?self:this).JSZip=e()}}(function(){return function s(a,o,h){function u(r,e){if(!o[r]){if(!a[r]){var t="function"==typeof require&&require;if(!e&&t)return t(r,!0);if(l)return l(r,!0);var n=new Error("Cannot find module '"+r+"'");throw n.code="MODULE_NOT_FOUND",n}var i=o[r]={exports:{}};a[r][0].call(i.exports,function(e){var t=a[r][1][e];return u(t||e)},i,i.exports,s,a,o,h)}return o[r].exports}for(var l="function"==typeof require&&require,e=0;e<h.length;e++)u(h[e]);return u}({1:[function(e,t,r){"use strict";var d=e("./utils"),c=e("./support"),p="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";r.encode=function(e){for(var t,r,n,i,s,a,o,h=[],u=0,l=e.length,f=l,c="string"!==d.getTypeOf(e);u<e.length;)f=l-u,n=c?(t=e[u++],r=u<l?e[u++]:0,u<l?e[u++]:0):(t=e.charCodeAt(u++),r=u<l?e.charCodeAt(u++):0,u<l?e.charCodeAt(u++):0),i=t>>2,s=(3&t)<<4|r>>4,a=1<f?(15&r)<<2|n>>6:64,o=2<f?63&n:64,h.push(p.charAt(i)+p.charAt(s)+p.charAt(a)+p.charAt(o));return h.join("")},r.decode=function(e){var t,r,n,i,s,a,o=0,h=0,u="data:";if(e.substr(0,u.length)===u)throw new Error("Invalid base64 input, it looks like a data url.");var l,f=3*(e=e.replace(/[^A-Za-z0-9+/=]/g,"")).length/4;if(e.charAt(e.length-1)===p.charAt(64)&&f--,e.charAt(e.length-2)===p.charAt(64)&&f--,f%1!=0)throw new Error("Invalid base64 input, bad content length.");for(l=c.uint8array?new Uint8Array(0|f):new Array(0|f);o<e.length;)t=p.indexOf(e.charAt(o++))<<2|(i=p.indexOf(e.charAt(o++)))>>4,r=(15&i)<<4|(s=p.indexOf(e.charAt(o++)))>>2,n=(3&s)<<6|(a=p.indexOf(e.charAt(o++))),l[h++]=t,64!==s&&(l[h++]=r),64!==a&&(l[h++]=n);return l}},{"./support":30,"./utils":32}],2:[function(e,t,r){"use strict";var n=e("./external"),i=e("./stream/DataWorker"),s=e("./stream/Crc32Probe"),a=e("./stream/DataLengthProbe");function o(e,t,r,n,i){this.compressedSize=e,this.uncompressedSize=t,this.crc32=r,this.compression=n,this.compressedContent=i}o.prototype={getContentWorker:function(){var e=new i(n.Promise.resolve(this.compressedContent)).pipe(this.compression.uncompressWorker()).pipe(new a("data_length")),t=this;return e.on("end",function(){if(this.streamInfo.data_length!==t.uncompressedSize)throw new Error("Bug : uncompressed data size mismatch")}),e},getCompressedWorker:function(){return new i(n.Promise.resolve(this.compressedContent)).withStreamInfo("compressedSize",this.compressedSize).withStreamInfo("uncompressedSize",this.uncompressedSize).withStreamInfo("crc32",this.crc32).withStreamInfo("compression",this.compression)}},o.createWorkerFrom=function(e,t,r){return e.pipe(new s).pipe(new a("uncompressedSize")).pipe(t.compressWorker(r)).pipe(new a("compressedSize")).withStreamInfo("compression",t)},t.exports=o},{"./external":6,"./stream/Crc32Probe":25,"./stream/DataLengthProbe":26,"./stream/DataWorker":27}],3:[function(e,t,r){"use strict";var n=e("./stream/GenericWorker");r.STORE={magic:"\0\0",compressWorker:function(){return new n("STORE compression")},uncompressWorker:function(){return new n("STORE decompression")}},r.DEFLATE=e("./flate")},{"./flate":7,"./stream/GenericWorker":28}],4:[function(e,t,r){"use strict";var n=e("./utils");var o=function(){for(var e,t=[],r=0;r<256;r++){e=r;for(var n=0;n<8;n++)e=1&e?3988292384^e>>>1:e>>>1;t[r]=e}return t}();t.exports=function(e,t){return void 0!==e&&e.length?"string"!==n.getTypeOf(e)?function(e,t,r,n){var i=o,s=n+r;e^=-1;for(var a=n;a<s;a++)e=e>>>8^i[255&(e^t[a])];return-1^e}(0|t,e,e.length,0):function(e,t,r,n){var i=o,s=n+r;e^=-1;for(var a=n;a<s;a++)e=e>>>8^i[255&(e^t.charCodeAt(a))];return-1^e}(0|t,e,e.length,0):0}},{"./utils":32}],5:[function(e,t,r){"use strict";r.base64=!1,r.binary=!1,r.dir=!1,r.createFolders=!0,r.date=null,r.compression=null,r.compressionOptions=null,r.comment=null,r.unixPermissions=null,r.dosPermissions=null},{}],6:[function(e,t,r){"use strict";var n=null;n="undefined"!=typeof Promise?Promise:e("lie"),t.exports={Promise:n}},{lie:37}],7:[function(e,t,r){"use strict";var n="undefined"!=typeof Uint8Array&&"undefined"!=typeof Uint16Array&&"undefined"!=typeof Uint32Array,i=e("pako"),s=e("./utils"),a=e("./stream/GenericWorker"),o=n?"uint8array":"array";function h(e,t){a.call(this,"FlateWorker/"+e),this._pako=null,this._pakoAction=e,this._pakoOptions=t,this.meta={}}r.magic="\b\0",s.inherits(h,a),h.prototype.processChunk=function(e){this.meta=e.meta,null===this._pako&&this._createPako(),this._pako.push(s.transformTo(o,e.data),!1)},h.prototype.flush=function(){a.prototype.flush.call(this),null===this._pako&&this._createPako(),this._pako.push([],!0)},h.prototype.cleanUp=function(){a.prototype.cleanUp.call(this),this._pako=null},h.prototype._createPako=function(){this._pako=new i[this._pakoAction]({raw:!0,level:this._pakoOptions.level||-1});var t=this;this._pako.onData=function(e){t.push({data:e,meta:t.meta})}},r.compressWorker=function(e){return new h("Deflate",e)},r.uncompressWorker=function(){return new h("Inflate",{})}},{"./stream/GenericWorker":28,"./utils":32,pako:38}],8:[function(e,t,r){"use strict";function A(e,t){var r,n="";for(r=0;r<t;r++)n+=String.fromCharCode(255&e),e>>>=8;return n}function n(e,t,r,n,i,s){var a,o,h=e.file,u=e.compression,l=s!==O.utf8encode,f=I.transformTo("string",s(h.name)),c=I.transformTo("string",O.utf8encode(h.name)),d=h.comment,p=I.transformTo("string",s(d)),m=I.transformTo("string",O.utf8encode(d)),_=c.length!==h.name.length,g=m.length!==d.length,b="",v="",y="",w=h.dir,k=h.date,x={crc32:0,compressedSize:0,uncompressedSize:0};t&&!r||(x.crc32=e.crc32,x.compressedSize=e.compressedSize,x.uncompressedSize=e.uncompressedSize);var S=0;t&&(S|=8),l||!_&&!g||(S|=2048);var z=0,C=0;w&&(z|=16),"UNIX"===i?(C=798,z|=function(e,t){var r=e;return e||(r=t?16893:33204),(65535&r)<<16}(h.unixPermissions,w)):(C=20,z|=function(e){return 63&(e||0)}(h.dosPermissions)),a=k.getUTCHours(),a<<=6,a|=k.getUTCMinutes(),a<<=5,a|=k.getUTCSeconds()/2,o=k.getUTCFullYear()-1980,o<<=4,o|=k.getUTCMonth()+1,o<<=5,o|=k.getUTCDate(),_&&(v=A(1,1)+A(B(f),4)+c,b+="up"+A(v.length,2)+v),g&&(y=A(1,1)+A(B(p),4)+m,b+="uc"+A(y.length,2)+y);var E="";return E+="\n\0",E+=A(S,2),E+=u.magic,E+=A(a,2),E+=A(o,2),E+=A(x.crc32,4),E+=A(x.compressedSize,4),E+=A(x.uncompressedSize,4),E+=A(f.length,2),E+=A(b.length,2),{fileRecord:R.LOCAL_FILE_HEADER+E+f+b,dirRecord:R.CENTRAL_FILE_HEADER+A(C,2)+E+A(p.length,2)+"\0\0\0\0"+A(z,4)+A(n,4)+f+b+p}}var I=e("../utils"),i=e("../stream/GenericWorker"),O=e("../utf8"),B=e("../crc32"),R=e("../signature");function s(e,t,r,n){i.call(this,"ZipFileWorker"),this.bytesWritten=0,this.zipComment=t,this.zipPlatform=r,this.encodeFileName=n,this.streamFiles=e,this.accumulate=!1,this.contentBuffer=[],this.dirRecords=[],this.currentSourceOffset=0,this.entriesCount=0,this.currentFile=null,this._sources=[]}I.inherits(s,i),s.prototype.push=function(e){var t=e.meta.percent||0,r=this.entriesCount,n=this._sources.length;this.accumulate?this.contentBuffer.push(e):(this.bytesWritten+=e.data.length,i.prototype.push.call(this,{data:e.data,meta:{currentFile:this.currentFile,percent:r?(t+100*(r-n-1))/r:100}}))},s.prototype.openedSource=function(e){this.currentSourceOffset=this.bytesWritten,this.currentFile=e.file.name;var t=this.streamFiles&&!e.file.dir;if(t){var r=n(e,t,!1,this.currentSourceOffset,this.zipPlatform,this.encodeFileName);this.push({data:r.fileRecord,meta:{percent:0}})}else this.accumulate=!0},s.prototype.closedSource=function(e){this.accumulate=!1;var t=this.streamFiles&&!e.file.dir,r=n(e,t,!0,this.currentSourceOffset,this.zipPlatform,this.encodeFileName);if(this.dirRecords.push(r.dirRecord),t)this.push({data:function(e){return R.DATA_DESCRIPTOR+A(e.crc32,4)+A(e.compressedSize,4)+A(e.uncompressedSize,4)}(e),meta:{percent:100}});else for(this.push({data:r.fileRecord,meta:{percent:0}});this.contentBuffer.length;)this.push(this.contentBuffer.shift());this.currentFile=null},s.prototype.flush=function(){for(var e=this.bytesWritten,t=0;t<this.dirRecords.length;t++)this.push({data:this.dirRecords[t],meta:{percent:100}});var r=this.bytesWritten-e,n=function(e,t,r,n,i){var s=I.transformTo("string",i(n));return R.CENTRAL_DIRECTORY_END+"\0\0\0\0"+A(e,2)+A(e,2)+A(t,4)+A(r,4)+A(s.length,2)+s}(this.dirRecords.length,r,e,this.zipComment,this.encodeFileName);this.push({data:n,meta:{percent:100}})},s.prototype.prepareNextSource=function(){this.previous=this._sources.shift(),this.openedSource(this.previous.streamInfo),this.isPaused?this.previous.pause():this.previous.resume()},s.prototype.registerPrevious=function(e){this._sources.push(e);var t=this;return e.on("data",function(e){t.processChunk(e)}),e.on("end",function(){t.closedSource(t.previous.streamInfo),t._sources.length?t.prepareNextSource():t.end()}),e.on("error",function(e){t.error(e)}),this},s.prototype.resume=function(){return!!i.prototype.resume.call(this)&&(!this.previous&&this._sources.length?(this.prepareNextSource(),!0):this.previous||this._sources.length||this.generatedError?void 0:(this.end(),!0))},s.prototype.error=function(e){var t=this._sources;if(!i.prototype.error.call(this,e))return!1;for(var r=0;r<t.length;r++)try{t[r].error(e)}catch(e){}return!0},s.prototype.lock=function(){i.prototype.lock.call(this);for(var e=this._sources,t=0;t<e.length;t++)e[t].lock()},t.exports=s},{"../crc32":4,"../signature":23,"../stream/GenericWorker":28,"../utf8":31,"../utils":32}],9:[function(e,t,r){"use strict";var u=e("../compressions"),n=e("./ZipFileWorker");r.generateWorker=function(e,a,t){var o=new n(a.streamFiles,t,a.platform,a.encodeFileName),h=0;try{e.forEach(function(e,t){h++;var r=function(e,t){var r=e||t,n=u[r];if(!n)throw new Error(r+" is not a valid compression method !");return n}(t.options.compression,a.compression),n=t.options.compressionOptions||a.compressionOptions||{},i=t.dir,s=t.date;t._compressWorker(r,n).withStreamInfo("file",{name:e,dir:i,date:s,comment:t.comment||"",unixPermissions:t.unixPermissions,dosPermissions:t.dosPermissions}).pipe(o)}),o.entriesCount=h}catch(e){o.error(e)}return o}},{"../compressions":3,"./ZipFileWorker":8}],10:[function(e,t,r){"use strict";function n(){if(!(this instanceof n))return new n;if(arguments.length)throw new Error("The constructor with parameters has been removed in JSZip 3.0, please check the upgrade guide.");this.files=Object.create(null),this.comment=null,this.root="",this.clone=function(){var e=new n;for(var t in this)"function"!=typeof this[t]&&(e[t]=this[t]);return e}}(n.prototype=e("./object")).loadAsync=e("./load"),n.support=e("./support"),n.defaults=e("./defaults"),n.version="3.10.1",n.loadAsync=function(e,t){return(new n).loadAsync(e,t)},n.external=e("./external"),t.exports=n},{"./defaults":5,"./external":6,"./load":11,"./object":15,"./support":30}],11:[function(e,t,r){"use strict";var u=e("./utils"),i=e("./external"),n=e("./utf8"),s=e("./zipEntries"),a=e("./stream/Crc32Probe"),l=e("./nodejsUtils");function f(n){return new i.Promise(function(e,t){var r=n.decompressed.getContentWorker().pipe(new a);r.on("error",function(e){t(e)}).on("end",function(){r.streamInfo.crc32!==n.decompressed.crc32?t(new Error("Corrupted zip : CRC32 mismatch")):e()}).resume()})}t.exports=function(e,o){var h=this;return o=u.extend(o||{},{base64:!1,checkCRC32:!1,optimizedBinaryString:!1,createFolders:!1,decodeFileName:n.utf8decode}),l.isNode&&l.isStream(e)?i.Promise.reject(new Error("JSZip can't accept a stream when loading a zip file.")):u.prepareContent("the loaded zip file",e,!0,o.optimizedBinaryString,o.base64).then(function(e){var t=new s(o);return t.load(e),t}).then(function(e){var t=[i.Promise.resolve(e)],r=e.files;if(o.checkCRC32)for(var n=0;n<r.length;n++)t.push(f(r[n]));return i.Promise.all(t)}).then(function(e){for(var t=e.shift(),r=t.files,n=0;n<r.length;n++){var i=r[n],s=i.fileNameStr,a=u.resolve(i.fileNameStr);h.file(a,i.decompressed,{binary:!0,optimizedBinaryString:!0,date:i.date,dir:i.dir,comment:i.fileCommentStr.length?i.fileCommentStr:null,unixPermissions:i.unixPermissions,dosPermissions:i.dosPermissions,createFolders:o.createFolders}),i.dir||(h.file(a).unsafeOriginalName=s)}return t.zipComment.length&&(h.comment=t.zipComment),h})}},{"./external":6,"./nodejsUtils":14,"./stream/Crc32Probe":25,"./utf8":31,"./utils":32,"./zipEntries":33}],12:[function(e,t,r){"use strict";var n=e("../utils"),i=e("../stream/GenericWorker");function s(e,t){i.call(this,"Nodejs stream input adapter for "+e),this._upstreamEnded=!1,this._bindStream(t)}n.inherits(s,i),s.prototype._bindStream=function(e){var t=this;(this._stream=e).pause(),e.on("data",function(e){t.push({data:e,meta:{percent:0}})}).on("error",function(e){t.isPaused?this.generatedError=e:t.error(e)}).on("end",function(){t.isPaused?t._upstreamEnded=!0:t.end()})},s.prototype.pause=function(){return!!i.prototype.pause.call(this)&&(this._stream.pause(),!0)},s.prototype.resume=function(){return!!i.prototype.resume.call(this)&&(this._upstreamEnded?this.end():this._stream.resume(),!0)},t.exports=s},{"../stream/GenericWorker":28,"../utils":32}],13:[function(e,t,r){"use strict";var i=e("readable-stream").Readable;function n(e,t,r){i.call(this,t),this._helper=e;var n=this;e.on("data",function(e,t){n.push(e)||n._helper.pause(),r&&r(t)}).on("error",function(e){n.emit("error",e)}).on("end",function(){n.push(null)})}e("../utils").inherits(n,i),n.prototype._read=function(){this._helper.resume()},t.exports=n},{"../utils":32,"readable-stream":16}],14:[function(e,t,r){"use strict";t.exports={isNode:"undefined"!=typeof Buffer,newBufferFrom:function(e,t){if(Buffer.from&&Buffer.from!==Uint8Array.from)return Buffer.from(e,t);if("number"==typeof e)throw new Error('The "data" argument must not be a number');return new Buffer(e,t)},allocBuffer:function(e){if(Buffer.alloc)return Buffer.alloc(e);var t=new Buffer(e);return t.fill(0),t},isBuffer:function(e){return Buffer.isBuffer(e)},isStream:function(e){return e&&"function"==typeof e.on&&"function"==typeof e.pause&&"function"==typeof e.resume}}},{}],15:[function(e,t,r){"use strict";function s(e,t,r){var n,i=u.getTypeOf(t),s=u.extend(r||{},f);s.date=s.date||new Date,null!==s.compression&&(s.compression=s.compression.toUpperCase()),"string"==typeof s.unixPermissions&&(s.unixPermissions=parseInt(s.unixPermissions,8)),s.unixPermissions&&16384&s.unixPermissions&&(s.dir=!0),s.dosPermissions&&16&s.dosPermissions&&(s.dir=!0),s.dir&&(e=g(e)),s.createFolders&&(n=_(e))&&b.call(this,n,!0);var a="string"===i&&!1===s.binary&&!1===s.base64;r&&void 0!==r.binary||(s.binary=!a),(t instanceof c&&0===t.uncompressedSize||s.dir||!t||0===t.length)&&(s.base64=!1,s.binary=!0,t="",s.compression="STORE",i="string");var o=null;o=t instanceof c||t instanceof l?t:p.isNode&&p.isStream(t)?new m(e,t):u.prepareContent(e,t,s.binary,s.optimizedBinaryString,s.base64);var h=new d(e,o,s);this.files[e]=h}var i=e("./utf8"),u=e("./utils"),l=e("./stream/GenericWorker"),a=e("./stream/StreamHelper"),f=e("./defaults"),c=e("./compressedObject"),d=e("./zipObject"),o=e("./generate"),p=e("./nodejsUtils"),m=e("./nodejs/NodejsStreamInputAdapter"),_=function(e){"/"===e.slice(-1)&&(e=e.substring(0,e.length-1));var t=e.lastIndexOf("/");return 0<t?e.substring(0,t):""},g=function(e){return"/"!==e.slice(-1)&&(e+="/"),e},b=function(e,t){return t=void 0!==t?t:f.createFolders,e=g(e),this.files[e]||s.call(this,e,null,{dir:!0,createFolders:t}),this.files[e]};function h(e){return"[object RegExp]"===Object.prototype.toString.call(e)}var n={load:function(){throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.")},forEach:function(e){var t,r,n;for(t in this.files)n=this.files[t],(r=t.slice(this.root.length,t.length))&&t.slice(0,this.root.length)===this.root&&e(r,n)},filter:function(r){var n=[];return this.forEach(function(e,t){r(e,t)&&n.push(t)}),n},file:function(e,t,r){if(1!==arguments.length)return e=this.root+e,s.call(this,e,t,r),this;if(h(e)){var n=e;return this.filter(function(e,t){return!t.dir&&n.test(e)})}var i=this.files[this.root+e];return i&&!i.dir?i:null},folder:function(r){if(!r)return this;if(h(r))return this.filter(function(e,t){return t.dir&&r.test(e)});var e=this.root+r,t=b.call(this,e),n=this.clone();return n.root=t.name,n},remove:function(r){r=this.root+r;var e=this.files[r];if(e||("/"!==r.slice(-1)&&(r+="/"),e=this.files[r]),e&&!e.dir)delete this.files[r];else for(var t=this.filter(function(e,t){return t.name.slice(0,r.length)===r}),n=0;n<t.length;n++)delete this.files[t[n].name];return this},generate:function(){throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.")},generateInternalStream:function(e){var t,r={};try{if((r=u.extend(e||{},{streamFiles:!1,compression:"STORE",compressionOptions:null,type:"",platform:"DOS",comment:null,mimeType:"application/zip",encodeFileName:i.utf8encode})).type=r.type.toLowerCase(),r.compression=r.compression.toUpperCase(),"binarystring"===r.type&&(r.type="string"),!r.type)throw new Error("No output type specified.");u.checkSupport(r.type),"darwin"!==r.platform&&"freebsd"!==r.platform&&"linux"!==r.platform&&"sunos"!==r.platform||(r.platform="UNIX"),"win32"===r.platform&&(r.platform="DOS");var n=r.comment||this.comment||"";t=o.generateWorker(this,r,n)}catch(e){(t=new l("error")).error(e)}return new a(t,r.type||"string",r.mimeType)},generateAsync:function(e,t){return this.generateInternalStream(e).accumulate(t)},generateNodeStream:function(e,t){return(e=e||{}).type||(e.type="nodebuffer"),this.generateInternalStream(e).toNodejsStream(t)}};t.exports=n},{"./compressedObject":2,"./defaults":5,"./generate":9,"./nodejs/NodejsStreamInputAdapter":12,"./nodejsUtils":14,"./stream/GenericWorker":28,"./stream/StreamHelper":29,"./utf8":31,"./utils":32,"./zipObject":35}],16:[function(e,t,r){"use strict";t.exports=e("stream")},{stream:void 0}],17:[function(e,t,r){"use strict";var n=e("./DataReader");function i(e){n.call(this,e);for(var t=0;t<this.data.length;t++)e[t]=255&e[t]}e("../utils").inherits(i,n),i.prototype.byteAt=function(e){return this.data[this.zero+e]},i.prototype.lastIndexOfSignature=function(e){for(var t=e.charCodeAt(0),r=e.charCodeAt(1),n=e.charCodeAt(2),i=e.charCodeAt(3),s=this.length-4;0<=s;--s)if(this.data[s]===t&&this.data[s+1]===r&&this.data[s+2]===n&&this.data[s+3]===i)return s-this.zero;return-1},i.prototype.readAndCheckSignature=function(e){var t=e.charCodeAt(0),r=e.charCodeAt(1),n=e.charCodeAt(2),i=e.charCodeAt(3),s=this.readData(4);return t===s[0]&&r===s[1]&&n===s[2]&&i===s[3]},i.prototype.readData=function(e){if(this.checkOffset(e),0===e)return[];var t=this.data.slice(this.zero+this.index,this.zero+this.index+e);return this.index+=e,t},t.exports=i},{"../utils":32,"./DataReader":18}],18:[function(e,t,r){"use strict";var n=e("../utils");function i(e){this.data=e,this.length=e.length,this.index=0,this.zero=0}i.prototype={checkOffset:function(e){this.checkIndex(this.index+e)},checkIndex:function(e){if(this.length<this.zero+e||e<0)throw new Error("End of data reached (data length = "+this.length+", asked index = "+e+"). Corrupted zip ?")},setIndex:function(e){this.checkIndex(e),this.index=e},skip:function(e){this.setIndex(this.index+e)},byteAt:function(){},readInt:function(e){var t,r=0;for(this.checkOffset(e),t=this.index+e-1;t>=this.index;t--)r=(r<<8)+this.byteAt(t);return this.index+=e,r},readString:function(e){return n.transformTo("string",this.readData(e))},readData:function(){},lastIndexOfSignature:function(){},readAndCheckSignature:function(){},readDate:function(){var e=this.readInt(4);return new Date(Date.UTC(1980+(e>>25&127),(e>>21&15)-1,e>>16&31,e>>11&31,e>>5&63,(31&e)<<1))}},t.exports=i},{"../utils":32}],19:[function(e,t,r){"use strict";var n=e("./Uint8ArrayReader");function i(e){n.call(this,e)}e("../utils").inherits(i,n),i.prototype.readData=function(e){this.checkOffset(e);var t=this.data.slice(this.zero+this.index,this.zero+this.index+e);return this.index+=e,t},t.exports=i},{"../utils":32,"./Uint8ArrayReader":21}],20:[function(e,t,r){"use strict";var n=e("./DataReader");function i(e){n.call(this,e)}e("../utils").inherits(i,n),i.prototype.byteAt=function(e){return this.data.charCodeAt(this.zero+e)},i.prototype.lastIndexOfSignature=function(e){return this.data.lastIndexOf(e)-this.zero},i.prototype.readAndCheckSignature=function(e){return e===this.readData(4)},i.prototype.readData=function(e){this.checkOffset(e);var t=this.data.slice(this.zero+this.index,this.zero+this.index+e);return this.index+=e,t},t.exports=i},{"../utils":32,"./DataReader":18}],21:[function(e,t,r){"use strict";var n=e("./ArrayReader");function i(e){n.call(this,e)}e("../utils").inherits(i,n),i.prototype.readData=function(e){if(this.checkOffset(e),0===e)return new Uint8Array(0);var t=this.data.subarray(this.zero+this.index,this.zero+this.index+e);return this.index+=e,t},t.exports=i},{"../utils":32,"./ArrayReader":17}],22:[function(e,t,r){"use strict";var n=e("../utils"),i=e("../support"),s=e("./ArrayReader"),a=e("./StringReader"),o=e("./NodeBufferReader"),h=e("./Uint8ArrayReader");t.exports=function(e){var t=n.getTypeOf(e);return n.checkSupport(t),"string"!==t||i.uint8array?"nodebuffer"===t?new o(e):i.uint8array?new h(n.transformTo("uint8array",e)):new s(n.transformTo("array",e)):new a(e)}},{"../support":30,"../utils":32,"./ArrayReader":17,"./NodeBufferReader":19,"./StringReader":20,"./Uint8ArrayReader":21}],23:[function(e,t,r){"use strict";r.LOCAL_FILE_HEADER="PK",r.CENTRAL_FILE_HEADER="PK",r.CENTRAL_DIRECTORY_END="PK",r.ZIP64_CENTRAL_DIRECTORY_LOCATOR="PK",r.ZIP64_CENTRAL_DIRECTORY_END="PK",r.DATA_DESCRIPTOR="PK\b"},{}],24:[function(e,t,r){"use strict";var n=e("./GenericWorker"),i=e("../utils");function s(e){n.call(this,"ConvertWorker to "+e),this.destType=e}i.inherits(s,n),s.prototype.processChunk=function(e){this.push({data:i.transformTo(this.destType,e.data),meta:e.meta})},t.exports=s},{"../utils":32,"./GenericWorker":28}],25:[function(e,t,r){"use strict";var n=e("./GenericWorker"),i=e("../crc32");function s(){n.call(this,"Crc32Probe"),this.withStreamInfo("crc32",0)}e("../utils").inherits(s,n),s.prototype.processChunk=function(e){this.streamInfo.crc32=i(e.data,this.streamInfo.crc32||0),this.push(e)},t.exports=s},{"../crc32":4,"../utils":32,"./GenericWorker":28}],26:[function(e,t,r){"use strict";var n=e("../utils"),i=e("./GenericWorker");function s(e){i.call(this,"DataLengthProbe for "+e),this.propName=e,this.withStreamInfo(e,0)}n.inherits(s,i),s.prototype.processChunk=function(e){if(e){var t=this.streamInfo[this.propName]||0;this.streamInfo[this.propName]=t+e.data.length}i.prototype.processChunk.call(this,e)},t.exports=s},{"../utils":32,"./GenericWorker":28}],27:[function(e,t,r){"use strict";var n=e("../utils"),i=e("./GenericWorker");function s(e){i.call(this,"DataWorker");var t=this;this.dataIsReady=!1,this.index=0,this.max=0,this.data=null,this.type="",this._tickScheduled=!1,e.then(function(e){t.dataIsReady=!0,t.data=e,t.max=e&&e.length||0,t.type=n.getTypeOf(e),t.isPaused||t._tickAndRepeat()},function(e){t.error(e)})}n.inherits(s,i),s.prototype.cleanUp=function(){i.prototype.cleanUp.call(this),this.data=null},s.prototype.resume=function(){return!!i.prototype.resume.call(this)&&(!this._tickScheduled&&this.dataIsReady&&(this._tickScheduled=!0,n.delay(this._tickAndRepeat,[],this)),!0)},s.prototype._tickAndRepeat=function(){this._tickScheduled=!1,this.isPaused||this.isFinished||(this._tick(),this.isFinished||(n.delay(this._tickAndRepeat,[],this),this._tickScheduled=!0))},s.prototype._tick=function(){if(this.isPaused||this.isFinished)return!1;var e=null,t=Math.min(this.max,this.index+16384);if(this.index>=this.max)return this.end();switch(this.type){case"string":e=this.data.substring(this.index,t);break;case"uint8array":e=this.data.subarray(this.index,t);break;case"array":case"nodebuffer":e=this.data.slice(this.index,t)}return this.index=t,this.push({data:e,meta:{percent:this.max?this.index/this.max*100:0}})},t.exports=s},{"../utils":32,"./GenericWorker":28}],28:[function(e,t,r){"use strict";function n(e){this.name=e||"default",this.streamInfo={},this.generatedError=null,this.extraStreamInfo={},this.isPaused=!0,this.isFinished=!1,this.isLocked=!1,this._listeners={data:[],end:[],error:[]},this.previous=null}n.prototype={push:function(e){this.emit("data",e)},end:function(){if(this.isFinished)return!1;this.flush();try{this.emit("end"),this.cleanUp(),this.isFinished=!0}catch(e){this.emit("error",e)}return!0},error:function(e){return!this.isFinished&&(this.isPaused?this.generatedError=e:(this.isFinished=!0,this.emit("error",e),this.previous&&this.previous.error(e),this.cleanUp()),!0)},on:function(e,t){return this._listeners[e].push(t),this},cleanUp:function(){this.streamInfo=this.generatedError=this.extraStreamInfo=null,this._listeners=[]},emit:function(e,t){if(this._listeners[e])for(var r=0;r<this._listeners[e].length;r++)this._listeners[e][r].call(this,t)},pipe:function(e){return e.registerPrevious(this)},registerPrevious:function(e){if(this.isLocked)throw new Error("The stream '"+this+"' has already been used.");this.streamInfo=e.streamInfo,this.mergeStreamInfo(),this.previous=e;var t=this;return e.on("data",function(e){t.processChunk(e)}),e.on("end",function(){t.end()}),e.on("error",function(e){t.error(e)}),this},pause:function(){return!this.isPaused&&!this.isFinished&&(this.isPaused=!0,this.previous&&this.previous.pause(),!0)},resume:function(){if(!this.isPaused||this.isFinished)return!1;var e=this.isPaused=!1;return this.generatedError&&(this.error(this.generatedError),e=!0),this.previous&&this.previous.resume(),!e},flush:function(){},processChunk:function(e){this.push(e)},withStreamInfo:function(e,t){return this.extraStreamInfo[e]=t,this.mergeStreamInfo(),this},mergeStreamInfo:function(){for(var e in this.extraStreamInfo)Object.prototype.hasOwnProperty.call(this.extraStreamInfo,e)&&(this.streamInfo[e]=this.extraStreamInfo[e])},lock:function(){if(this.isLocked)throw new Error("The stream '"+this+"' has already been used.");this.isLocked=!0,this.previous&&this.previous.lock()},toString:function(){var e="Worker "+this.name;return this.previous?this.previous+" -> "+e:e}},t.exports=n},{}],29:[function(e,t,r){"use strict";var h=e("../utils"),i=e("./ConvertWorker"),s=e("./GenericWorker"),u=e("../base64"),n=e("../support"),a=e("../external"),o=null;if(n.nodestream)try{o=e("../nodejs/NodejsStreamOutputAdapter")}catch(e){}function l(e,o){return new a.Promise(function(t,r){var n=[],i=e._internalType,s=e._outputType,a=e._mimeType;e.on("data",function(e,t){n.push(e),o&&o(t)}).on("error",function(e){n=[],r(e)}).on("end",function(){try{var e=function(e,t,r){switch(e){case"blob":return h.newBlob(h.transformTo("arraybuffer",t),r);case"base64":return u.encode(t);default:return h.transformTo(e,t)}}(s,function(e,t){var r,n=0,i=null,s=0;for(r=0;r<t.length;r++)s+=t[r].length;switch(e){case"string":return t.join("");case"array":return Array.prototype.concat.apply([],t);case"uint8array":for(i=new Uint8Array(s),r=0;r<t.length;r++)i.set(t[r],n),n+=t[r].length;return i;case"nodebuffer":return Buffer.concat(t);default:throw new Error("concat : unsupported type '"+e+"'")}}(i,n),a);t(e)}catch(e){r(e)}n=[]}).resume()})}function f(e,t,r){var n=t;switch(t){case"blob":case"arraybuffer":n="uint8array";break;case"base64":n="string"}try{this._internalType=n,this._outputType=t,this._mimeType=r,h.checkSupport(n),this._worker=e.pipe(new i(n)),e.lock()}catch(e){this._worker=new s("error"),this._worker.error(e)}}f.prototype={accumulate:function(e){return l(this,e)},on:function(e,t){var r=this;return"data"===e?this._worker.on(e,function(e){t.call(r,e.data,e.meta)}):this._worker.on(e,function(){h.delay(t,arguments,r)}),this},resume:function(){return h.delay(this._worker.resume,[],this._worker),this},pause:function(){return this._worker.pause(),this},toNodejsStream:function(e){if(h.checkSupport("nodestream"),"nodebuffer"!==this._outputType)throw new Error(this._outputType+" is not supported by this method");return new o(this,{objectMode:"nodebuffer"!==this._outputType},e)}},t.exports=f},{"../base64":1,"../external":6,"../nodejs/NodejsStreamOutputAdapter":13,"../support":30,"../utils":32,"./ConvertWorker":24,"./GenericWorker":28}],30:[function(e,t,r){"use strict";if(r.base64=!0,r.array=!0,r.string=!0,r.arraybuffer="undefined"!=typeof ArrayBuffer&&"undefined"!=typeof Uint8Array,r.nodebuffer="undefined"!=typeof Buffer,r.uint8array="undefined"!=typeof Uint8Array,"undefined"==typeof ArrayBuffer)r.blob=!1;else{var n=new ArrayBuffer(0);try{r.blob=0===new Blob([n],{type:"application/zip"}).size}catch(e){try{var i=new(self.BlobBuilder||self.WebKitBlobBuilder||self.MozBlobBuilder||self.MSBlobBuilder);i.append(n),r.blob=0===i.getBlob("application/zip").size}catch(e){r.blob=!1}}}try{r.nodestream=!!e("readable-stream").Readable}catch(e){r.nodestream=!1}},{"readable-stream":16}],31:[function(e,t,s){"use strict";for(var o=e("./utils"),h=e("./support"),r=e("./nodejsUtils"),n=e("./stream/GenericWorker"),u=new Array(256),i=0;i<256;i++)u[i]=252<=i?6:248<=i?5:240<=i?4:224<=i?3:192<=i?2:1;u[254]=u[254]=1;function a(){n.call(this,"utf-8 decode"),this.leftOver=null}function l(){n.call(this,"utf-8 encode")}s.utf8encode=function(e){return h.nodebuffer?r.newBufferFrom(e,"utf-8"):function(e){var t,r,n,i,s,a=e.length,o=0;for(i=0;i<a;i++)55296==(64512&(r=e.charCodeAt(i)))&&i+1<a&&56320==(64512&(n=e.charCodeAt(i+1)))&&(r=65536+(r-55296<<10)+(n-56320),i++),o+=r<128?1:r<2048?2:r<65536?3:4;for(t=h.uint8array?new Uint8Array(o):new Array(o),i=s=0;s<o;i++)55296==(64512&(r=e.charCodeAt(i)))&&i+1<a&&56320==(64512&(n=e.charCodeAt(i+1)))&&(r=65536+(r-55296<<10)+(n-56320),i++),r<128?t[s++]=r:(r<2048?t[s++]=192|r>>>6:(r<65536?t[s++]=224|r>>>12:(t[s++]=240|r>>>18,t[s++]=128|r>>>12&63),t[s++]=128|r>>>6&63),t[s++]=128|63&r);return t}(e)},s.utf8decode=function(e){return h.nodebuffer?o.transformTo("nodebuffer",e).toString("utf-8"):function(e){var t,r,n,i,s=e.length,a=new Array(2*s);for(t=r=0;t<s;)if((n=e[t++])<128)a[r++]=n;else if(4<(i=u[n]))a[r++]=65533,t+=i-1;else{for(n&=2===i?31:3===i?15:7;1<i&&t<s;)n=n<<6|63&e[t++],i--;1<i?a[r++]=65533:n<65536?a[r++]=n:(n-=65536,a[r++]=55296|n>>10&1023,a[r++]=56320|1023&n)}return a.length!==r&&(a.subarray?a=a.subarray(0,r):a.length=r),o.applyFromCharCode(a)}(e=o.transformTo(h.uint8array?"uint8array":"array",e))},o.inherits(a,n),a.prototype.processChunk=function(e){var t=o.transformTo(h.uint8array?"uint8array":"array",e.data);if(this.leftOver&&this.leftOver.length){if(h.uint8array){var r=t;(t=new Uint8Array(r.length+this.leftOver.length)).set(this.leftOver,0),t.set(r,this.leftOver.length)}else t=this.leftOver.concat(t);this.leftOver=null}var n=function(e,t){var r;for((t=t||e.length)>e.length&&(t=e.length),r=t-1;0<=r&&128==(192&e[r]);)r--;return r<0?t:0===r?t:r+u[e[r]]>t?r:t}(t),i=t;n!==t.length&&(h.uint8array?(i=t.subarray(0,n),this.leftOver=t.subarray(n,t.length)):(i=t.slice(0,n),this.leftOver=t.slice(n,t.length))),this.push({data:s.utf8decode(i),meta:e.meta})},a.prototype.flush=function(){this.leftOver&&this.leftOver.length&&(this.push({data:s.utf8decode(this.leftOver),meta:{}}),this.leftOver=null)},s.Utf8DecodeWorker=a,o.inherits(l,n),l.prototype.processChunk=function(e){this.push({data:s.utf8encode(e.data),meta:e.meta})},s.Utf8EncodeWorker=l},{"./nodejsUtils":14,"./stream/GenericWorker":28,"./support":30,"./utils":32}],32:[function(e,t,a){"use strict";var o=e("./support"),h=e("./base64"),r=e("./nodejsUtils"),u=e("./external");function n(e){return e}function l(e,t){for(var r=0;r<e.length;++r)t[r]=255&e.charCodeAt(r);return t}e("setimmediate"),a.newBlob=function(t,r){a.checkSupport("blob");try{return new Blob([t],{type:r})}catch(e){try{var n=new(self.BlobBuilder||self.WebKitBlobBuilder||self.MozBlobBuilder||self.MSBlobBuilder);return n.append(t),n.getBlob(r)}catch(e){throw new Error("Bug : can't construct the Blob.")}}};var i={stringifyByChunk:function(e,t,r){var n=[],i=0,s=e.length;if(s<=r)return String.fromCharCode.apply(null,e);for(;i<s;)"array"===t||"nodebuffer"===t?n.push(String.fromCharCode.apply(null,e.slice(i,Math.min(i+r,s)))):n.push(String.fromCharCode.apply(null,e.subarray(i,Math.min(i+r,s)))),i+=r;return n.join("")},stringifyByChar:function(e){for(var t="",r=0;r<e.length;r++)t+=String.fromCharCode(e[r]);return t},applyCanBeUsed:{uint8array:function(){try{return o.uint8array&&1===String.fromCharCode.apply(null,new Uint8Array(1)).length}catch(e){return!1}}(),nodebuffer:function(){try{return o.nodebuffer&&1===String.fromCharCode.apply(null,r.allocBuffer(1)).length}catch(e){return!1}}()}};function s(e){var t=65536,r=a.getTypeOf(e),n=!0;if("uint8array"===r?n=i.applyCanBeUsed.uint8array:"nodebuffer"===r&&(n=i.applyCanBeUsed.nodebuffer),n)for(;1<t;)try{return i.stringifyByChunk(e,r,t)}catch(e){t=Math.floor(t/2)}return i.stringifyByChar(e)}function f(e,t){for(var r=0;r<e.length;r++)t[r]=e[r];return t}a.applyFromCharCode=s;var c={};c.string={string:n,array:function(e){return l(e,new Array(e.length))},arraybuffer:function(e){return c.string.uint8array(e).buffer},uint8array:function(e){return l(e,new Uint8Array(e.length))},nodebuffer:function(e){return l(e,r.allocBuffer(e.length))}},c.array={string:s,array:n,arraybuffer:function(e){return new Uint8Array(e).buffer},uint8array:function(e){return new Uint8Array(e)},nodebuffer:function(e){return r.newBufferFrom(e)}},c.arraybuffer={string:function(e){return s(new Uint8Array(e))},array:function(e){return f(new Uint8Array(e),new Array(e.byteLength))},arraybuffer:n,uint8array:function(e){return new Uint8Array(e)},nodebuffer:function(e){return r.newBufferFrom(new Uint8Array(e))}},c.uint8array={string:s,array:function(e){return f(e,new Array(e.length))},arraybuffer:function(e){return e.buffer},uint8array:n,nodebuffer:function(e){return r.newBufferFrom(e)}},c.nodebuffer={string:s,array:function(e){return f(e,new Array(e.length))},arraybuffer:function(e){return c.nodebuffer.uint8array(e).buffer},uint8array:function(e){return f(e,new Uint8Array(e.length))},nodebuffer:n},a.transformTo=function(e,t){if(t=t||"",!e)return t;a.checkSupport(e);var r=a.getTypeOf(t);return c[r][e](t)},a.resolve=function(e){for(var t=e.split("/"),r=[],n=0;n<t.length;n++){var i=t[n];"."===i||""===i&&0!==n&&n!==t.length-1||(".."===i?r.pop():r.push(i))}return r.join("/")},a.getTypeOf=function(e){return"string"==typeof e?"string":"[object Array]"===Object.prototype.toString.call(e)?"array":o.nodebuffer&&r.isBuffer(e)?"nodebuffer":o.uint8array&&e instanceof Uint8Array?"uint8array":o.arraybuffer&&e instanceof ArrayBuffer?"arraybuffer":void 0},a.checkSupport=function(e){if(!o[e.toLowerCase()])throw new Error(e+" is not supported by this platform")},a.MAX_VALUE_16BITS=65535,a.MAX_VALUE_32BITS=-1,a.pretty=function(e){var t,r,n="";for(r=0;r<(e||"").length;r++)n+="\\x"+((t=e.charCodeAt(r))<16?"0":"")+t.toString(16).toUpperCase();return n},a.delay=function(e,t,r){setImmediate(function(){e.apply(r||null,t||[])})},a.inherits=function(e,t){function r(){}r.prototype=t.prototype,e.prototype=new r},a.extend=function(){var e,t,r={};for(e=0;e<arguments.length;e++)for(t in arguments[e])Object.prototype.hasOwnProperty.call(arguments[e],t)&&void 0===r[t]&&(r[t]=arguments[e][t]);return r},a.prepareContent=function(r,e,n,i,s){return u.Promise.resolve(e).then(function(n){return o.blob&&(n instanceof Blob||-1!==["[object File]","[object Blob]"].indexOf(Object.prototype.toString.call(n)))&&"undefined"!=typeof FileReader?new u.Promise(function(t,r){var e=new FileReader;e.onload=function(e){t(e.target.result)},e.onerror=function(e){r(e.target.error)},e.readAsArrayBuffer(n)}):n}).then(function(e){var t=a.getTypeOf(e);return t?("arraybuffer"===t?e=a.transformTo("uint8array",e):"string"===t&&(s?e=h.decode(e):n&&!0!==i&&(e=function(e){return l(e,o.uint8array?new Uint8Array(e.length):new Array(e.length))}(e))),e):u.Promise.reject(new Error("Can't read the data of '"+r+"'. Is it in a supported JavaScript type (String, Blob, ArrayBuffer, etc) ?"))})}},{"./base64":1,"./external":6,"./nodejsUtils":14,"./support":30,setimmediate:54}],33:[function(e,t,r){"use strict";var n=e("./reader/readerFor"),i=e("./utils"),s=e("./signature"),a=e("./zipEntry"),o=e("./support");function h(e){this.files=[],this.loadOptions=e}h.prototype={checkSignature:function(e){if(!this.reader.readAndCheckSignature(e)){this.reader.index-=4;var t=this.reader.readString(4);throw new Error("Corrupted zip or bug: unexpected signature ("+i.pretty(t)+", expected "+i.pretty(e)+")")}},isSignature:function(e,t){var r=this.reader.index;this.reader.setIndex(e);var n=this.reader.readString(4)===t;return this.reader.setIndex(r),n},readBlockEndOfCentral:function(){this.diskNumber=this.reader.readInt(2),this.diskWithCentralDirStart=this.reader.readInt(2),this.centralDirRecordsOnThisDisk=this.reader.readInt(2),this.centralDirRecords=this.reader.readInt(2),this.centralDirSize=this.reader.readInt(4),this.centralDirOffset=this.reader.readInt(4),this.zipCommentLength=this.reader.readInt(2);var e=this.reader.readData(this.zipCommentLength),t=o.uint8array?"uint8array":"array",r=i.transformTo(t,e);this.zipComment=this.loadOptions.decodeFileName(r)},readBlockZip64EndOfCentral:function(){this.zip64EndOfCentralSize=this.reader.readInt(8),this.reader.skip(4),this.diskNumber=this.reader.readInt(4),this.diskWithCentralDirStart=this.reader.readInt(4),this.centralDirRecordsOnThisDisk=this.reader.readInt(8),this.centralDirRecords=this.reader.readInt(8),this.centralDirSize=this.reader.readInt(8),this.centralDirOffset=this.reader.readInt(8),this.zip64ExtensibleData={};for(var e,t,r,n=this.zip64EndOfCentralSize-44;0<n;)e=this.reader.readInt(2),t=this.reader.readInt(4),r=this.reader.readData(t),this.zip64ExtensibleData[e]={id:e,length:t,value:r}},readBlockZip64EndOfCentralLocator:function(){if(this.diskWithZip64CentralDirStart=this.reader.readInt(4),this.relativeOffsetEndOfZip64CentralDir=this.reader.readInt(8),this.disksCount=this.reader.readInt(4),1<this.disksCount)throw new Error("Multi-volumes zip are not supported")},readLocalFiles:function(){var e,t;for(e=0;e<this.files.length;e++)t=this.files[e],this.reader.setIndex(t.localHeaderOffset),this.checkSignature(s.LOCAL_FILE_HEADER),t.readLocalPart(this.reader),t.handleUTF8(),t.processAttributes()},readCentralDir:function(){var e;for(this.reader.setIndex(this.centralDirOffset);this.reader.readAndCheckSignature(s.CENTRAL_FILE_HEADER);)(e=new a({zip64:this.zip64},this.loadOptions)).readCentralPart(this.reader),this.files.push(e);if(this.centralDirRecords!==this.files.length&&0!==this.centralDirRecords&&0===this.files.length)throw new Error("Corrupted zip or bug: expected "+this.centralDirRecords+" records in central dir, got "+this.files.length)},readEndOfCentral:function(){var e=this.reader.lastIndexOfSignature(s.CENTRAL_DIRECTORY_END);if(e<0)throw!this.isSignature(0,s.LOCAL_FILE_HEADER)?new Error("Can't find end of central directory : is this a zip file ? If it is, see https://stuk.github.io/jszip/documentation/howto/read_zip.html"):new Error("Corrupted zip: can't find end of central directory");this.reader.setIndex(e);var t=e;if(this.checkSignature(s.CENTRAL_DIRECTORY_END),this.readBlockEndOfCentral(),this.diskNumber===i.MAX_VALUE_16BITS||this.diskWithCentralDirStart===i.MAX_VALUE_16BITS||this.centralDirRecordsOnThisDisk===i.MAX_VALUE_16BITS||this.centralDirRecords===i.MAX_VALUE_16BITS||this.centralDirSize===i.MAX_VALUE_32BITS||this.centralDirOffset===i.MAX_VALUE_32BITS){if(this.zip64=!0,(e=this.reader.lastIndexOfSignature(s.ZIP64_CENTRAL_DIRECTORY_LOCATOR))<0)throw new Error("Corrupted zip: can't find the ZIP64 end of central directory locator");if(this.reader.setIndex(e),this.checkSignature(s.ZIP64_CENTRAL_DIRECTORY_LOCATOR),this.readBlockZip64EndOfCentralLocator(),!this.isSignature(this.relativeOffsetEndOfZip64CentralDir,s.ZIP64_CENTRAL_DIRECTORY_END)&&(this.relativeOffsetEndOfZip64CentralDir=this.reader.lastIndexOfSignature(s.ZIP64_CENTRAL_DIRECTORY_END),this.relativeOffsetEndOfZip64CentralDir<0))throw new Error("Corrupted zip: can't find the ZIP64 end of central directory");this.reader.setIndex(this.relativeOffsetEndOfZip64CentralDir),this.checkSignature(s.ZIP64_CENTRAL_DIRECTORY_END),this.readBlockZip64EndOfCentral()}var r=this.centralDirOffset+this.centralDirSize;this.zip64&&(r+=20,r+=12+this.zip64EndOfCentralSize);var n=t-r;if(0<n)this.isSignature(t,s.CENTRAL_FILE_HEADER)||(this.reader.zero=n);else if(n<0)throw new Error("Corrupted zip: missing "+Math.abs(n)+" bytes.")},prepareReader:function(e){this.reader=n(e)},load:function(e){this.prepareReader(e),this.readEndOfCentral(),this.readCentralDir(),this.readLocalFiles()}},t.exports=h},{"./reader/readerFor":22,"./signature":23,"./support":30,"./utils":32,"./zipEntry":34}],34:[function(e,t,r){"use strict";var n=e("./reader/readerFor"),s=e("./utils"),i=e("./compressedObject"),a=e("./crc32"),o=e("./utf8"),h=e("./compressions"),u=e("./support");function l(e,t){this.options=e,this.loadOptions=t}l.prototype={isEncrypted:function(){return 1==(1&this.bitFlag)},useUTF8:function(){return 2048==(2048&this.bitFlag)},readLocalPart:function(e){var t,r;if(e.skip(22),this.fileNameLength=e.readInt(2),r=e.readInt(2),this.fileName=e.readData(this.fileNameLength),e.skip(r),-1===this.compressedSize||-1===this.uncompressedSize)throw new Error("Bug or corrupted zip : didn't get enough information from the central directory (compressedSize === -1 || uncompressedSize === -1)");if(null===(t=function(e){for(var t in h)if(Object.prototype.hasOwnProperty.call(h,t)&&h[t].magic===e)return h[t];return null}(this.compressionMethod)))throw new Error("Corrupted zip : compression "+s.pretty(this.compressionMethod)+" unknown (inner file : "+s.transformTo("string",this.fileName)+")");this.decompressed=new i(this.compressedSize,this.uncompressedSize,this.crc32,t,e.readData(this.compressedSize))},readCentralPart:function(e){this.versionMadeBy=e.readInt(2),e.skip(2),this.bitFlag=e.readInt(2),this.compressionMethod=e.readString(2),this.date=e.readDate(),this.crc32=e.readInt(4),this.compressedSize=e.readInt(4),this.uncompressedSize=e.readInt(4);var t=e.readInt(2);if(this.extraFieldsLength=e.readInt(2),this.fileCommentLength=e.readInt(2),this.diskNumberStart=e.readInt(2),this.internalFileAttributes=e.readInt(2),this.externalFileAttributes=e.readInt(4),this.localHeaderOffset=e.readInt(4),this.isEncrypted())throw new Error("Encrypted zip are not supported");e.skip(t),this.readExtraFields(e),this.parseZIP64ExtraField(e),this.fileComment=e.readData(this.fileCommentLength)},processAttributes:function(){this.unixPermissions=null,this.dosPermissions=null;var e=this.versionMadeBy>>8;this.dir=!!(16&this.externalFileAttributes),0==e&&(this.dosPermissions=63&this.externalFileAttributes),3==e&&(this.unixPermissions=this.externalFileAttributes>>16&65535),this.dir||"/"!==this.fileNameStr.slice(-1)||(this.dir=!0)},parseZIP64ExtraField:function(){if(this.extraFields[1]){var e=n(this.extraFields[1].value);this.uncompressedSize===s.MAX_VALUE_32BITS&&(this.uncompressedSize=e.readInt(8)),this.compressedSize===s.MAX_VALUE_32BITS&&(this.compressedSize=e.readInt(8)),this.localHeaderOffset===s.MAX_VALUE_32BITS&&(this.localHeaderOffset=e.readInt(8)),this.diskNumberStart===s.MAX_VALUE_32BITS&&(this.diskNumberStart=e.readInt(4))}},readExtraFields:function(e){var t,r,n,i=e.index+this.extraFieldsLength;for(this.extraFields||(this.extraFields={});e.index+4<i;)t=e.readInt(2),r=e.readInt(2),n=e.readData(r),this.extraFields[t]={id:t,length:r,value:n};e.setIndex(i)},handleUTF8:function(){var e=u.uint8array?"uint8array":"array";if(this.useUTF8())this.fileNameStr=o.utf8decode(this.fileName),this.fileCommentStr=o.utf8decode(this.fileComment);else{var t=this.findExtraFieldUnicodePath();if(null!==t)this.fileNameStr=t;else{var r=s.transformTo(e,this.fileName);this.fileNameStr=this.loadOptions.decodeFileName(r)}var n=this.findExtraFieldUnicodeComment();if(null!==n)this.fileCommentStr=n;else{var i=s.transformTo(e,this.fileComment);this.fileCommentStr=this.loadOptions.decodeFileName(i)}}},findExtraFieldUnicodePath:function(){var e=this.extraFields[28789];if(e){var t=n(e.value);return 1!==t.readInt(1)?null:a(this.fileName)!==t.readInt(4)?null:o.utf8decode(t.readData(e.length-5))}return null},findExtraFieldUnicodeComment:function(){var e=this.extraFields[25461];if(e){var t=n(e.value);return 1!==t.readInt(1)?null:a(this.fileComment)!==t.readInt(4)?null:o.utf8decode(t.readData(e.length-5))}return null}},t.exports=l},{"./compressedObject":2,"./compressions":3,"./crc32":4,"./reader/readerFor":22,"./support":30,"./utf8":31,"./utils":32}],35:[function(e,t,r){"use strict";function n(e,t,r){this.name=e,this.dir=r.dir,this.date=r.date,this.comment=r.comment,this.unixPermissions=r.unixPermissions,this.dosPermissions=r.dosPermissions,this._data=t,this._dataBinary=r.binary,this.options={compression:r.compression,compressionOptions:r.compressionOptions}}var s=e("./stream/StreamHelper"),i=e("./stream/DataWorker"),a=e("./utf8"),o=e("./compressedObject"),h=e("./stream/GenericWorker");n.prototype={internalStream:function(e){var t=null,r="string";try{if(!e)throw new Error("No output type specified.");var n="string"===(r=e.toLowerCase())||"text"===r;"binarystring"!==r&&"text"!==r||(r="string"),t=this._decompressWorker();var i=!this._dataBinary;i&&!n&&(t=t.pipe(new a.Utf8EncodeWorker)),!i&&n&&(t=t.pipe(new a.Utf8DecodeWorker))}catch(e){(t=new h("error")).error(e)}return new s(t,r,"")},async:function(e,t){return this.internalStream(e).accumulate(t)},nodeStream:function(e,t){return this.internalStream(e||"nodebuffer").toNodejsStream(t)},_compressWorker:function(e,t){if(this._data instanceof o&&this._data.compression.magic===e.magic)return this._data.getCompressedWorker();var r=this._decompressWorker();return this._dataBinary||(r=r.pipe(new a.Utf8EncodeWorker)),o.createWorkerFrom(r,e,t)},_decompressWorker:function(){return this._data instanceof o?this._data.getContentWorker():this._data instanceof h?this._data:new i(this._data)}};for(var u=["asText","asBinary","asNodeBuffer","asUint8Array","asArrayBuffer"],l=function(){throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.")},f=0;f<u.length;f++)n.prototype[u[f]]=l;t.exports=n},{"./compressedObject":2,"./stream/DataWorker":27,"./stream/GenericWorker":28,"./stream/StreamHelper":29,"./utf8":31}],36:[function(e,l,t){(function(t){"use strict";var r,n,e=t.MutationObserver||t.WebKitMutationObserver;if(e){var i=0,s=new e(u),a=t.document.createTextNode("");s.observe(a,{characterData:!0}),r=function(){a.data=i=++i%2}}else if(t.setImmediate||void 0===t.MessageChannel)r="document"in t&&"onreadystatechange"in t.document.createElement("script")?function(){var e=t.document.createElement("script");e.onreadystatechange=function(){u(),e.onreadystatechange=null,e.parentNode.removeChild(e),e=null},t.document.documentElement.appendChild(e)}:function(){setTimeout(u,0)};else{var o=new t.MessageChannel;o.port1.onmessage=u,r=function(){o.port2.postMessage(0)}}var h=[];function u(){var e,t;n=!0;for(var r=h.length;r;){for(t=h,h=[],e=-1;++e<r;)t[e]();r=h.length}n=!1}l.exports=function(e){1!==h.push(e)||n||r()}}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{})},{}],37:[function(e,t,r){"use strict";var i=e("immediate");function u(){}var l={},s=["REJECTED"],a=["FULFILLED"],n=["PENDING"];function o(e){if("function"!=typeof e)throw new TypeError("resolver must be a function");this.state=n,this.queue=[],this.outcome=void 0,e!==u&&d(this,e)}function h(e,t,r){this.promise=e,"function"==typeof t&&(this.onFulfilled=t,this.callFulfilled=this.otherCallFulfilled),"function"==typeof r&&(this.onRejected=r,this.callRejected=this.otherCallRejected)}function f(t,r,n){i(function(){var e;try{e=r(n)}catch(e){return l.reject(t,e)}e===t?l.reject(t,new TypeError("Cannot resolve promise with itself")):l.resolve(t,e)})}function c(e){var t=e&&e.then;if(e&&("object"==typeof e||"function"==typeof e)&&"function"==typeof t)return function(){t.apply(e,arguments)}}function d(t,e){var r=!1;function n(e){r||(r=!0,l.reject(t,e))}function i(e){r||(r=!0,l.resolve(t,e))}var s=p(function(){e(i,n)});"error"===s.status&&n(s.value)}function p(e,t){var r={};try{r.value=e(t),r.status="success"}catch(e){r.status="error",r.value=e}return r}(t.exports=o).prototype.finally=function(t){if("function"!=typeof t)return this;var r=this.constructor;return this.then(function(e){return r.resolve(t()).then(function(){return e})},function(e){return r.resolve(t()).then(function(){throw e})})},o.prototype.catch=function(e){return this.then(null,e)},o.prototype.then=function(e,t){if("function"!=typeof e&&this.state===a||"function"!=typeof t&&this.state===s)return this;var r=new this.constructor(u);this.state!==n?f(r,this.state===a?e:t,this.outcome):this.queue.push(new h(r,e,t));return r},h.prototype.callFulfilled=function(e){l.resolve(this.promise,e)},h.prototype.otherCallFulfilled=function(e){f(this.promise,this.onFulfilled,e)},h.prototype.callRejected=function(e){l.reject(this.promise,e)},h.prototype.otherCallRejected=function(e){f(this.promise,this.onRejected,e)},l.resolve=function(e,t){var r=p(c,t);if("error"===r.status)return l.reject(e,r.value);var n=r.value;if(n)d(e,n);else{e.state=a,e.outcome=t;for(var i=-1,s=e.queue.length;++i<s;)e.queue[i].callFulfilled(t)}return e},l.reject=function(e,t){e.state=s,e.outcome=t;for(var r=-1,n=e.queue.length;++r<n;)e.queue[r].callRejected(t);return e},o.resolve=function(e){if(e instanceof this)return e;return l.resolve(new this(u),e)},o.reject=function(e){var t=new this(u);return l.reject(t,e)},o.all=function(e){var r=this;if("[object Array]"!==Object.prototype.toString.call(e))return this.reject(new TypeError("must be an array"));var n=e.length,i=!1;if(!n)return this.resolve([]);var s=new Array(n),a=0,t=-1,o=new this(u);for(;++t<n;)h(e[t],t);return o;function h(e,t){r.resolve(e).then(function(e){s[t]=e,++a!==n||i||(i=!0,l.resolve(o,s))},function(e){i||(i=!0,l.reject(o,e))})}},o.race=function(e){var t=this;if("[object Array]"!==Object.prototype.toString.call(e))return this.reject(new TypeError("must be an array"));var r=e.length,n=!1;if(!r)return this.resolve([]);var i=-1,s=new this(u);for(;++i<r;)a=e[i],t.resolve(a).then(function(e){n||(n=!0,l.resolve(s,e))},function(e){n||(n=!0,l.reject(s,e))});var a;return s}},{immediate:36}],38:[function(e,t,r){"use strict";var n={};(0,e("./lib/utils/common").assign)(n,e("./lib/deflate"),e("./lib/inflate"),e("./lib/zlib/constants")),t.exports=n},{"./lib/deflate":39,"./lib/inflate":40,"./lib/utils/common":41,"./lib/zlib/constants":44}],39:[function(e,t,r){"use strict";var a=e("./zlib/deflate"),o=e("./utils/common"),h=e("./utils/strings"),i=e("./zlib/messages"),s=e("./zlib/zstream"),u=Object.prototype.toString,l=0,f=-1,c=0,d=8;function p(e){if(!(this instanceof p))return new p(e);this.options=o.assign({level:f,method:d,chunkSize:16384,windowBits:15,memLevel:8,strategy:c,to:""},e||{});var t=this.options;t.raw&&0<t.windowBits?t.windowBits=-t.windowBits:t.gzip&&0<t.windowBits&&t.windowBits<16&&(t.windowBits+=16),this.err=0,this.msg="",this.ended=!1,this.chunks=[],this.strm=new s,this.strm.avail_out=0;var r=a.deflateInit2(this.strm,t.level,t.method,t.windowBits,t.memLevel,t.strategy);if(r!==l)throw new Error(i[r]);if(t.header&&a.deflateSetHeader(this.strm,t.header),t.dictionary){var n;if(n="string"==typeof t.dictionary?h.string2buf(t.dictionary):"[object ArrayBuffer]"===u.call(t.dictionary)?new Uint8Array(t.dictionary):t.dictionary,(r=a.deflateSetDictionary(this.strm,n))!==l)throw new Error(i[r]);this._dict_set=!0}}function n(e,t){var r=new p(t);if(r.push(e,!0),r.err)throw r.msg||i[r.err];return r.result}p.prototype.push=function(e,t){var r,n,i=this.strm,s=this.options.chunkSize;if(this.ended)return!1;n=t===~~t?t:!0===t?4:0,"string"==typeof e?i.input=h.string2buf(e):"[object ArrayBuffer]"===u.call(e)?i.input=new Uint8Array(e):i.input=e,i.next_in=0,i.avail_in=i.input.length;do{if(0===i.avail_out&&(i.output=new o.Buf8(s),i.next_out=0,i.avail_out=s),1!==(r=a.deflate(i,n))&&r!==l)return this.onEnd(r),!(this.ended=!0);0!==i.avail_out&&(0!==i.avail_in||4!==n&&2!==n)||("string"===this.options.to?this.onData(h.buf2binstring(o.shrinkBuf(i.output,i.next_out))):this.onData(o.shrinkBuf(i.output,i.next_out)))}while((0<i.avail_in||0===i.avail_out)&&1!==r);return 4===n?(r=a.deflateEnd(this.strm),this.onEnd(r),this.ended=!0,r===l):2!==n||(this.onEnd(l),!(i.avail_out=0))},p.prototype.onData=function(e){this.chunks.push(e)},p.prototype.onEnd=function(e){e===l&&("string"===this.options.to?this.result=this.chunks.join(""):this.result=o.flattenChunks(this.chunks)),this.chunks=[],this.err=e,this.msg=this.strm.msg},r.Deflate=p,r.deflate=n,r.deflateRaw=function(e,t){return(t=t||{}).raw=!0,n(e,t)},r.gzip=function(e,t){return(t=t||{}).gzip=!0,n(e,t)}},{"./utils/common":41,"./utils/strings":42,"./zlib/deflate":46,"./zlib/messages":51,"./zlib/zstream":53}],40:[function(e,t,r){"use strict";var c=e("./zlib/inflate"),d=e("./utils/common"),p=e("./utils/strings"),m=e("./zlib/constants"),n=e("./zlib/messages"),i=e("./zlib/zstream"),s=e("./zlib/gzheader"),_=Object.prototype.toString;function a(e){if(!(this instanceof a))return new a(e);this.options=d.assign({chunkSize:16384,windowBits:0,to:""},e||{});var t=this.options;t.raw&&0<=t.windowBits&&t.windowBits<16&&(t.windowBits=-t.windowBits,0===t.windowBits&&(t.windowBits=-15)),!(0<=t.windowBits&&t.windowBits<16)||e&&e.windowBits||(t.windowBits+=32),15<t.windowBits&&t.windowBits<48&&0==(15&t.windowBits)&&(t.windowBits|=15),this.err=0,this.msg="",this.ended=!1,this.chunks=[],this.strm=new i,this.strm.avail_out=0;var r=c.inflateInit2(this.strm,t.windowBits);if(r!==m.Z_OK)throw new Error(n[r]);this.header=new s,c.inflateGetHeader(this.strm,this.header)}function o(e,t){var r=new a(t);if(r.push(e,!0),r.err)throw r.msg||n[r.err];return r.result}a.prototype.push=function(e,t){var r,n,i,s,a,o,h=this.strm,u=this.options.chunkSize,l=this.options.dictionary,f=!1;if(this.ended)return!1;n=t===~~t?t:!0===t?m.Z_FINISH:m.Z_NO_FLUSH,"string"==typeof e?h.input=p.binstring2buf(e):"[object ArrayBuffer]"===_.call(e)?h.input=new Uint8Array(e):h.input=e,h.next_in=0,h.avail_in=h.input.length;do{if(0===h.avail_out&&(h.output=new d.Buf8(u),h.next_out=0,h.avail_out=u),(r=c.inflate(h,m.Z_NO_FLUSH))===m.Z_NEED_DICT&&l&&(o="string"==typeof l?p.string2buf(l):"[object ArrayBuffer]"===_.call(l)?new Uint8Array(l):l,r=c.inflateSetDictionary(this.strm,o)),r===m.Z_BUF_ERROR&&!0===f&&(r=m.Z_OK,f=!1),r!==m.Z_STREAM_END&&r!==m.Z_OK)return this.onEnd(r),!(this.ended=!0);h.next_out&&(0!==h.avail_out&&r!==m.Z_STREAM_END&&(0!==h.avail_in||n!==m.Z_FINISH&&n!==m.Z_SYNC_FLUSH)||("string"===this.options.to?(i=p.utf8border(h.output,h.next_out),s=h.next_out-i,a=p.buf2string(h.output,i),h.next_out=s,h.avail_out=u-s,s&&d.arraySet(h.output,h.output,i,s,0),this.onData(a)):this.onData(d.shrinkBuf(h.output,h.next_out)))),0===h.avail_in&&0===h.avail_out&&(f=!0)}while((0<h.avail_in||0===h.avail_out)&&r!==m.Z_STREAM_END);return r===m.Z_STREAM_END&&(n=m.Z_FINISH),n===m.Z_FINISH?(r=c.inflateEnd(this.strm),this.onEnd(r),this.ended=!0,r===m.Z_OK):n!==m.Z_SYNC_FLUSH||(this.onEnd(m.Z_OK),!(h.avail_out=0))},a.prototype.onData=function(e){this.chunks.push(e)},a.prototype.onEnd=function(e){e===m.Z_OK&&("string"===this.options.to?this.result=this.chunks.join(""):this.result=d.flattenChunks(this.chunks)),this.chunks=[],this.err=e,this.msg=this.strm.msg},r.Inflate=a,r.inflate=o,r.inflateRaw=function(e,t){return(t=t||{}).raw=!0,o(e,t)},r.ungzip=o},{"./utils/common":41,"./utils/strings":42,"./zlib/constants":44,"./zlib/gzheader":47,"./zlib/inflate":49,"./zlib/messages":51,"./zlib/zstream":53}],41:[function(e,t,r){"use strict";var n="undefined"!=typeof Uint8Array&&"undefined"!=typeof Uint16Array&&"undefined"!=typeof Int32Array;r.assign=function(e){for(var t=Array.prototype.slice.call(arguments,1);t.length;){var r=t.shift();if(r){if("object"!=typeof r)throw new TypeError(r+"must be non-object");for(var n in r)r.hasOwnProperty(n)&&(e[n]=r[n])}}return e},r.shrinkBuf=function(e,t){return e.length===t?e:e.subarray?e.subarray(0,t):(e.length=t,e)};var i={arraySet:function(e,t,r,n,i){if(t.subarray&&e.subarray)e.set(t.subarray(r,r+n),i);else for(var s=0;s<n;s++)e[i+s]=t[r+s]},flattenChunks:function(e){var t,r,n,i,s,a;for(t=n=0,r=e.length;t<r;t++)n+=e[t].length;for(a=new Uint8Array(n),t=i=0,r=e.length;t<r;t++)s=e[t],a.set(s,i),i+=s.length;return a}},s={arraySet:function(e,t,r,n,i){for(var s=0;s<n;s++)e[i+s]=t[r+s]},flattenChunks:function(e){return[].concat.apply([],e)}};r.setTyped=function(e){e?(r.Buf8=Uint8Array,r.Buf16=Uint16Array,r.Buf32=Int32Array,r.assign(r,i)):(r.Buf8=Array,r.Buf16=Array,r.Buf32=Array,r.assign(r,s))},r.setTyped(n)},{}],42:[function(e,t,r){"use strict";var h=e("./common"),i=!0,s=!0;try{String.fromCharCode.apply(null,[0])}catch(e){i=!1}try{String.fromCharCode.apply(null,new Uint8Array(1))}catch(e){s=!1}for(var u=new h.Buf8(256),n=0;n<256;n++)u[n]=252<=n?6:248<=n?5:240<=n?4:224<=n?3:192<=n?2:1;function l(e,t){if(t<65537&&(e.subarray&&s||!e.subarray&&i))return String.fromCharCode.apply(null,h.shrinkBuf(e,t));for(var r="",n=0;n<t;n++)r+=String.fromCharCode(e[n]);return r}u[254]=u[254]=1,r.string2buf=function(e){var t,r,n,i,s,a=e.length,o=0;for(i=0;i<a;i++)55296==(64512&(r=e.charCodeAt(i)))&&i+1<a&&56320==(64512&(n=e.charCodeAt(i+1)))&&(r=65536+(r-55296<<10)+(n-56320),i++),o+=r<128?1:r<2048?2:r<65536?3:4;for(t=new h.Buf8(o),i=s=0;s<o;i++)55296==(64512&(r=e.charCodeAt(i)))&&i+1<a&&56320==(64512&(n=e.charCodeAt(i+1)))&&(r=65536+(r-55296<<10)+(n-56320),i++),r<128?t[s++]=r:(r<2048?t[s++]=192|r>>>6:(r<65536?t[s++]=224|r>>>12:(t[s++]=240|r>>>18,t[s++]=128|r>>>12&63),t[s++]=128|r>>>6&63),t[s++]=128|63&r);return t},r.buf2binstring=function(e){return l(e,e.length)},r.binstring2buf=function(e){for(var t=new h.Buf8(e.length),r=0,n=t.length;r<n;r++)t[r]=e.charCodeAt(r);return t},r.buf2string=function(e,t){var r,n,i,s,a=t||e.length,o=new Array(2*a);for(r=n=0;r<a;)if((i=e[r++])<128)o[n++]=i;else if(4<(s=u[i]))o[n++]=65533,r+=s-1;else{for(i&=2===s?31:3===s?15:7;1<s&&r<a;)i=i<<6|63&e[r++],s--;1<s?o[n++]=65533:i<65536?o[n++]=i:(i-=65536,o[n++]=55296|i>>10&1023,o[n++]=56320|1023&i)}return l(o,n)},r.utf8border=function(e,t){var r;for((t=t||e.length)>e.length&&(t=e.length),r=t-1;0<=r&&128==(192&e[r]);)r--;return r<0?t:0===r?t:r+u[e[r]]>t?r:t}},{"./common":41}],43:[function(e,t,r){"use strict";t.exports=function(e,t,r,n){for(var i=65535&e|0,s=e>>>16&65535|0,a=0;0!==r;){for(r-=a=2e3<r?2e3:r;s=s+(i=i+t[n++]|0)|0,--a;);i%=65521,s%=65521}return i|s<<16|0}},{}],44:[function(e,t,r){"use strict";t.exports={Z_NO_FLUSH:0,Z_PARTIAL_FLUSH:1,Z_SYNC_FLUSH:2,Z_FULL_FLUSH:3,Z_FINISH:4,Z_BLOCK:5,Z_TREES:6,Z_OK:0,Z_STREAM_END:1,Z_NEED_DICT:2,Z_ERRNO:-1,Z_STREAM_ERROR:-2,Z_DATA_ERROR:-3,Z_BUF_ERROR:-5,Z_NO_COMPRESSION:0,Z_BEST_SPEED:1,Z_BEST_COMPRESSION:9,Z_DEFAULT_COMPRESSION:-1,Z_FILTERED:1,Z_HUFFMAN_ONLY:2,Z_RLE:3,Z_FIXED:4,Z_DEFAULT_STRATEGY:0,Z_BINARY:0,Z_TEXT:1,Z_UNKNOWN:2,Z_DEFLATED:8}},{}],45:[function(e,t,r){"use strict";var o=function(){for(var e,t=[],r=0;r<256;r++){e=r;for(var n=0;n<8;n++)e=1&e?3988292384^e>>>1:e>>>1;t[r]=e}return t}();t.exports=function(e,t,r,n){var i=o,s=n+r;e^=-1;for(var a=n;a<s;a++)e=e>>>8^i[255&(e^t[a])];return-1^e}},{}],46:[function(e,t,r){"use strict";var h,c=e("../utils/common"),u=e("./trees"),d=e("./adler32"),p=e("./crc32"),n=e("./messages"),l=0,f=4,m=0,_=-2,g=-1,b=4,i=2,v=8,y=9,s=286,a=30,o=19,w=2*s+1,k=15,x=3,S=258,z=S+x+1,C=42,E=113,A=1,I=2,O=3,B=4;function R(e,t){return e.msg=n[t],t}function T(e){return(e<<1)-(4<e?9:0)}function D(e){for(var t=e.length;0<=--t;)e[t]=0}function F(e){var t=e.state,r=t.pending;r>e.avail_out&&(r=e.avail_out),0!==r&&(c.arraySet(e.output,t.pending_buf,t.pending_out,r,e.next_out),e.next_out+=r,t.pending_out+=r,e.total_out+=r,e.avail_out-=r,t.pending-=r,0===t.pending&&(t.pending_out=0))}function N(e,t){u._tr_flush_block(e,0<=e.block_start?e.block_start:-1,e.strstart-e.block_start,t),e.block_start=e.strstart,F(e.strm)}function U(e,t){e.pending_buf[e.pending++]=t}function P(e,t){e.pending_buf[e.pending++]=t>>>8&255,e.pending_buf[e.pending++]=255&t}function L(e,t){var r,n,i=e.max_chain_length,s=e.strstart,a=e.prev_length,o=e.nice_match,h=e.strstart>e.w_size-z?e.strstart-(e.w_size-z):0,u=e.window,l=e.w_mask,f=e.prev,c=e.strstart+S,d=u[s+a-1],p=u[s+a];e.prev_length>=e.good_match&&(i>>=2),o>e.lookahead&&(o=e.lookahead);do{if(u[(r=t)+a]===p&&u[r+a-1]===d&&u[r]===u[s]&&u[++r]===u[s+1]){s+=2,r++;do{}while(u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&u[++s]===u[++r]&&s<c);if(n=S-(c-s),s=c-S,a<n){if(e.match_start=t,o<=(a=n))break;d=u[s+a-1],p=u[s+a]}}}while((t=f[t&l])>h&&0!=--i);return a<=e.lookahead?a:e.lookahead}function j(e){var t,r,n,i,s,a,o,h,u,l,f=e.w_size;do{if(i=e.window_size-e.lookahead-e.strstart,e.strstart>=f+(f-z)){for(c.arraySet(e.window,e.window,f,f,0),e.match_start-=f,e.strstart-=f,e.block_start-=f,t=r=e.hash_size;n=e.head[--t],e.head[t]=f<=n?n-f:0,--r;);for(t=r=f;n=e.prev[--t],e.prev[t]=f<=n?n-f:0,--r;);i+=f}if(0===e.strm.avail_in)break;if(a=e.strm,o=e.window,h=e.strstart+e.lookahead,u=i,l=void 0,l=a.avail_in,u<l&&(l=u),r=0===l?0:(a.avail_in-=l,c.arraySet(o,a.input,a.next_in,l,h),1===a.state.wrap?a.adler=d(a.adler,o,l,h):2===a.state.wrap&&(a.adler=p(a.adler,o,l,h)),a.next_in+=l,a.total_in+=l,l),e.lookahead+=r,e.lookahead+e.insert>=x)for(s=e.strstart-e.insert,e.ins_h=e.window[s],e.ins_h=(e.ins_h<<e.hash_shift^e.window[s+1])&e.hash_mask;e.insert&&(e.ins_h=(e.ins_h<<e.hash_shift^e.window[s+x-1])&e.hash_mask,e.prev[s&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=s,s++,e.insert--,!(e.lookahead+e.insert<x)););}while(e.lookahead<z&&0!==e.strm.avail_in)}function Z(e,t){for(var r,n;;){if(e.lookahead<z){if(j(e),e.lookahead<z&&t===l)return A;if(0===e.lookahead)break}if(r=0,e.lookahead>=x&&(e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+x-1])&e.hash_mask,r=e.prev[e.strstart&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=e.strstart),0!==r&&e.strstart-r<=e.w_size-z&&(e.match_length=L(e,r)),e.match_length>=x)if(n=u._tr_tally(e,e.strstart-e.match_start,e.match_length-x),e.lookahead-=e.match_length,e.match_length<=e.max_lazy_match&&e.lookahead>=x){for(e.match_length--;e.strstart++,e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+x-1])&e.hash_mask,r=e.prev[e.strstart&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=e.strstart,0!=--e.match_length;);e.strstart++}else e.strstart+=e.match_length,e.match_length=0,e.ins_h=e.window[e.strstart],e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+1])&e.hash_mask;else n=u._tr_tally(e,0,e.window[e.strstart]),e.lookahead--,e.strstart++;if(n&&(N(e,!1),0===e.strm.avail_out))return A}return e.insert=e.strstart<x-1?e.strstart:x-1,t===f?(N(e,!0),0===e.strm.avail_out?O:B):e.last_lit&&(N(e,!1),0===e.strm.avail_out)?A:I}function W(e,t){for(var r,n,i;;){if(e.lookahead<z){if(j(e),e.lookahead<z&&t===l)return A;if(0===e.lookahead)break}if(r=0,e.lookahead>=x&&(e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+x-1])&e.hash_mask,r=e.prev[e.strstart&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=e.strstart),e.prev_length=e.match_length,e.prev_match=e.match_start,e.match_length=x-1,0!==r&&e.prev_length<e.max_lazy_match&&e.strstart-r<=e.w_size-z&&(e.match_length=L(e,r),e.match_length<=5&&(1===e.strategy||e.match_length===x&&4096<e.strstart-e.match_start)&&(e.match_length=x-1)),e.prev_length>=x&&e.match_length<=e.prev_length){for(i=e.strstart+e.lookahead-x,n=u._tr_tally(e,e.strstart-1-e.prev_match,e.prev_length-x),e.lookahead-=e.prev_length-1,e.prev_length-=2;++e.strstart<=i&&(e.ins_h=(e.ins_h<<e.hash_shift^e.window[e.strstart+x-1])&e.hash_mask,r=e.prev[e.strstart&e.w_mask]=e.head[e.ins_h],e.head[e.ins_h]=e.strstart),0!=--e.prev_length;);if(e.match_available=0,e.match_length=x-1,e.strstart++,n&&(N(e,!1),0===e.strm.avail_out))return A}else if(e.match_available){if((n=u._tr_tally(e,0,e.window[e.strstart-1]))&&N(e,!1),e.strstart++,e.lookahead--,0===e.strm.avail_out)return A}else e.match_available=1,e.strstart++,e.lookahead--}return e.match_available&&(n=u._tr_tally(e,0,e.window[e.strstart-1]),e.match_available=0),e.insert=e.strstart<x-1?e.strstart:x-1,t===f?(N(e,!0),0===e.strm.avail_out?O:B):e.last_lit&&(N(e,!1),0===e.strm.avail_out)?A:I}function M(e,t,r,n,i){this.good_length=e,this.max_lazy=t,this.nice_length=r,this.max_chain=n,this.func=i}function H(){this.strm=null,this.status=0,this.pending_buf=null,this.pending_buf_size=0,this.pending_out=0,this.pending=0,this.wrap=0,this.gzhead=null,this.gzindex=0,this.method=v,this.last_flush=-1,this.w_size=0,this.w_bits=0,this.w_mask=0,this.window=null,this.window_size=0,this.prev=null,this.head=null,this.ins_h=0,this.hash_size=0,this.hash_bits=0,this.hash_mask=0,this.hash_shift=0,this.block_start=0,this.match_length=0,this.prev_match=0,this.match_available=0,this.strstart=0,this.match_start=0,this.lookahead=0,this.prev_length=0,this.max_chain_length=0,this.max_lazy_match=0,this.level=0,this.strategy=0,this.good_match=0,this.nice_match=0,this.dyn_ltree=new c.Buf16(2*w),this.dyn_dtree=new c.Buf16(2*(2*a+1)),this.bl_tree=new c.Buf16(2*(2*o+1)),D(this.dyn_ltree),D(this.dyn_dtree),D(this.bl_tree),this.l_desc=null,this.d_desc=null,this.bl_desc=null,this.bl_count=new c.Buf16(k+1),this.heap=new c.Buf16(2*s+1),D(this.heap),this.heap_len=0,this.heap_max=0,this.depth=new c.Buf16(2*s+1),D(this.depth),this.l_buf=0,this.lit_bufsize=0,this.last_lit=0,this.d_buf=0,this.opt_len=0,this.static_len=0,this.matches=0,this.insert=0,this.bi_buf=0,this.bi_valid=0}function G(e){var t;return e&&e.state?(e.total_in=e.total_out=0,e.data_type=i,(t=e.state).pending=0,t.pending_out=0,t.wrap<0&&(t.wrap=-t.wrap),t.status=t.wrap?C:E,e.adler=2===t.wrap?0:1,t.last_flush=l,u._tr_init(t),m):R(e,_)}function K(e){var t=G(e);return t===m&&function(e){e.window_size=2*e.w_size,D(e.head),e.max_lazy_match=h[e.level].max_lazy,e.good_match=h[e.level].good_length,e.nice_match=h[e.level].nice_length,e.max_chain_length=h[e.level].max_chain,e.strstart=0,e.block_start=0,e.lookahead=0,e.insert=0,e.match_length=e.prev_length=x-1,e.match_available=0,e.ins_h=0}(e.state),t}function Y(e,t,r,n,i,s){if(!e)return _;var a=1;if(t===g&&(t=6),n<0?(a=0,n=-n):15<n&&(a=2,n-=16),i<1||y<i||r!==v||n<8||15<n||t<0||9<t||s<0||b<s)return R(e,_);8===n&&(n=9);var o=new H;return(e.state=o).strm=e,o.wrap=a,o.gzhead=null,o.w_bits=n,o.w_size=1<<o.w_bits,o.w_mask=o.w_size-1,o.hash_bits=i+7,o.hash_size=1<<o.hash_bits,o.hash_mask=o.hash_size-1,o.hash_shift=~~((o.hash_bits+x-1)/x),o.window=new c.Buf8(2*o.w_size),o.head=new c.Buf16(o.hash_size),o.prev=new c.Buf16(o.w_size),o.lit_bufsize=1<<i+6,o.pending_buf_size=4*o.lit_bufsize,o.pending_buf=new c.Buf8(o.pending_buf_size),o.d_buf=1*o.lit_bufsize,o.l_buf=3*o.lit_bufsize,o.level=t,o.strategy=s,o.method=r,K(e)}h=[new M(0,0,0,0,function(e,t){var r=65535;for(r>e.pending_buf_size-5&&(r=e.pending_buf_size-5);;){if(e.lookahead<=1){if(j(e),0===e.lookahead&&t===l)return A;if(0===e.lookahead)break}e.strstart+=e.lookahead,e.lookahead=0;var n=e.block_start+r;if((0===e.strstart||e.strstart>=n)&&(e.lookahead=e.strstart-n,e.strstart=n,N(e,!1),0===e.strm.avail_out))return A;if(e.strstart-e.block_start>=e.w_size-z&&(N(e,!1),0===e.strm.avail_out))return A}return e.insert=0,t===f?(N(e,!0),0===e.strm.avail_out?O:B):(e.strstart>e.block_start&&(N(e,!1),e.strm.avail_out),A)}),new M(4,4,8,4,Z),new M(4,5,16,8,Z),new M(4,6,32,32,Z),new M(4,4,16,16,W),new M(8,16,32,32,W),new M(8,16,128,128,W),new M(8,32,128,256,W),new M(32,128,258,1024,W),new M(32,258,258,4096,W)],r.deflateInit=function(e,t){return Y(e,t,v,15,8,0)},r.deflateInit2=Y,r.deflateReset=K,r.deflateResetKeep=G,r.deflateSetHeader=function(e,t){return e&&e.state?2!==e.state.wrap?_:(e.state.gzhead=t,m):_},r.deflate=function(e,t){var r,n,i,s;if(!e||!e.state||5<t||t<0)return e?R(e,_):_;if(n=e.state,!e.output||!e.input&&0!==e.avail_in||666===n.status&&t!==f)return R(e,0===e.avail_out?-5:_);if(n.strm=e,r=n.last_flush,n.last_flush=t,n.status===C)if(2===n.wrap)e.adler=0,U(n,31),U(n,139),U(n,8),n.gzhead?(U(n,(n.gzhead.text?1:0)+(n.gzhead.hcrc?2:0)+(n.gzhead.extra?4:0)+(n.gzhead.name?8:0)+(n.gzhead.comment?16:0)),U(n,255&n.gzhead.time),U(n,n.gzhead.time>>8&255),U(n,n.gzhead.time>>16&255),U(n,n.gzhead.time>>24&255),U(n,9===n.level?2:2<=n.strategy||n.level<2?4:0),U(n,255&n.gzhead.os),n.gzhead.extra&&n.gzhead.extra.length&&(U(n,255&n.gzhead.extra.length),U(n,n.gzhead.extra.length>>8&255)),n.gzhead.hcrc&&(e.adler=p(e.adler,n.pending_buf,n.pending,0)),n.gzindex=0,n.status=69):(U(n,0),U(n,0),U(n,0),U(n,0),U(n,0),U(n,9===n.level?2:2<=n.strategy||n.level<2?4:0),U(n,3),n.status=E);else{var a=v+(n.w_bits-8<<4)<<8;a|=(2<=n.strategy||n.level<2?0:n.level<6?1:6===n.level?2:3)<<6,0!==n.strstart&&(a|=32),a+=31-a%31,n.status=E,P(n,a),0!==n.strstart&&(P(n,e.adler>>>16),P(n,65535&e.adler)),e.adler=1}if(69===n.status)if(n.gzhead.extra){for(i=n.pending;n.gzindex<(65535&n.gzhead.extra.length)&&(n.pending!==n.pending_buf_size||(n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),F(e),i=n.pending,n.pending!==n.pending_buf_size));)U(n,255&n.gzhead.extra[n.gzindex]),n.gzindex++;n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),n.gzindex===n.gzhead.extra.length&&(n.gzindex=0,n.status=73)}else n.status=73;if(73===n.status)if(n.gzhead.name){i=n.pending;do{if(n.pending===n.pending_buf_size&&(n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),F(e),i=n.pending,n.pending===n.pending_buf_size)){s=1;break}s=n.gzindex<n.gzhead.name.length?255&n.gzhead.name.charCodeAt(n.gzindex++):0,U(n,s)}while(0!==s);n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),0===s&&(n.gzindex=0,n.status=91)}else n.status=91;if(91===n.status)if(n.gzhead.comment){i=n.pending;do{if(n.pending===n.pending_buf_size&&(n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),F(e),i=n.pending,n.pending===n.pending_buf_size)){s=1;break}s=n.gzindex<n.gzhead.comment.length?255&n.gzhead.comment.charCodeAt(n.gzindex++):0,U(n,s)}while(0!==s);n.gzhead.hcrc&&n.pending>i&&(e.adler=p(e.adler,n.pending_buf,n.pending-i,i)),0===s&&(n.status=103)}else n.status=103;if(103===n.status&&(n.gzhead.hcrc?(n.pending+2>n.pending_buf_size&&F(e),n.pending+2<=n.pending_buf_size&&(U(n,255&e.adler),U(n,e.adler>>8&255),e.adler=0,n.status=E)):n.status=E),0!==n.pending){if(F(e),0===e.avail_out)return n.last_flush=-1,m}else if(0===e.avail_in&&T(t)<=T(r)&&t!==f)return R(e,-5);if(666===n.status&&0!==e.avail_in)return R(e,-5);if(0!==e.avail_in||0!==n.lookahead||t!==l&&666!==n.status){var o=2===n.strategy?function(e,t){for(var r;;){if(0===e.lookahead&&(j(e),0===e.lookahead)){if(t===l)return A;break}if(e.match_length=0,r=u._tr_tally(e,0,e.window[e.strstart]),e.lookahead--,e.strstart++,r&&(N(e,!1),0===e.strm.avail_out))return A}return e.insert=0,t===f?(N(e,!0),0===e.strm.avail_out?O:B):e.last_lit&&(N(e,!1),0===e.strm.avail_out)?A:I}(n,t):3===n.strategy?function(e,t){for(var r,n,i,s,a=e.window;;){if(e.lookahead<=S){if(j(e),e.lookahead<=S&&t===l)return A;if(0===e.lookahead)break}if(e.match_length=0,e.lookahead>=x&&0<e.strstart&&(n=a[i=e.strstart-1])===a[++i]&&n===a[++i]&&n===a[++i]){s=e.strstart+S;do{}while(n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&n===a[++i]&&i<s);e.match_length=S-(s-i),e.match_length>e.lookahead&&(e.match_length=e.lookahead)}if(e.match_length>=x?(r=u._tr_tally(e,1,e.match_length-x),e.lookahead-=e.match_length,e.strstart+=e.match_length,e.match_length=0):(r=u._tr_tally(e,0,e.window[e.strstart]),e.lookahead--,e.strstart++),r&&(N(e,!1),0===e.strm.avail_out))return A}return e.insert=0,t===f?(N(e,!0),0===e.strm.avail_out?O:B):e.last_lit&&(N(e,!1),0===e.strm.avail_out)?A:I}(n,t):h[n.level].func(n,t);if(o!==O&&o!==B||(n.status=666),o===A||o===O)return 0===e.avail_out&&(n.last_flush=-1),m;if(o===I&&(1===t?u._tr_align(n):5!==t&&(u._tr_stored_block(n,0,0,!1),3===t&&(D(n.head),0===n.lookahead&&(n.strstart=0,n.block_start=0,n.insert=0))),F(e),0===e.avail_out))return n.last_flush=-1,m}return t!==f?m:n.wrap<=0?1:(2===n.wrap?(U(n,255&e.adler),U(n,e.adler>>8&255),U(n,e.adler>>16&255),U(n,e.adler>>24&255),U(n,255&e.total_in),U(n,e.total_in>>8&255),U(n,e.total_in>>16&255),U(n,e.total_in>>24&255)):(P(n,e.adler>>>16),P(n,65535&e.adler)),F(e),0<n.wrap&&(n.wrap=-n.wrap),0!==n.pending?m:1)},r.deflateEnd=function(e){var t;return e&&e.state?(t=e.state.status)!==C&&69!==t&&73!==t&&91!==t&&103!==t&&t!==E&&666!==t?R(e,_):(e.state=null,t===E?R(e,-3):m):_},r.deflateSetDictionary=function(e,t){var r,n,i,s,a,o,h,u,l=t.length;if(!e||!e.state)return _;if(2===(s=(r=e.state).wrap)||1===s&&r.status!==C||r.lookahead)return _;for(1===s&&(e.adler=d(e.adler,t,l,0)),r.wrap=0,l>=r.w_size&&(0===s&&(D(r.head),r.strstart=0,r.block_start=0,r.insert=0),u=new c.Buf8(r.w_size),c.arraySet(u,t,l-r.w_size,r.w_size,0),t=u,l=r.w_size),a=e.avail_in,o=e.next_in,h=e.input,e.avail_in=l,e.next_in=0,e.input=t,j(r);r.lookahead>=x;){for(n=r.strstart,i=r.lookahead-(x-1);r.ins_h=(r.ins_h<<r.hash_shift^r.window[n+x-1])&r.hash_mask,r.prev[n&r.w_mask]=r.head[r.ins_h],r.head[r.ins_h]=n,n++,--i;);r.strstart=n,r.lookahead=x-1,j(r)}return r.strstart+=r.lookahead,r.block_start=r.strstart,r.insert=r.lookahead,r.lookahead=0,r.match_length=r.prev_length=x-1,r.match_available=0,e.next_in=o,e.input=h,e.avail_in=a,r.wrap=s,m},r.deflateInfo="pako deflate (from Nodeca project)"},{"../utils/common":41,"./adler32":43,"./crc32":45,"./messages":51,"./trees":52}],47:[function(e,t,r){"use strict";t.exports=function(){this.text=0,this.time=0,this.xflags=0,this.os=0,this.extra=null,this.extra_len=0,this.name="",this.comment="",this.hcrc=0,this.done=!1}},{}],48:[function(e,t,r){"use strict";t.exports=function(e,t){var r,n,i,s,a,o,h,u,l,f,c,d,p,m,_,g,b,v,y,w,k,x,S,z,C;r=e.state,n=e.next_in,z=e.input,i=n+(e.avail_in-5),s=e.next_out,C=e.output,a=s-(t-e.avail_out),o=s+(e.avail_out-257),h=r.dmax,u=r.wsize,l=r.whave,f=r.wnext,c=r.window,d=r.hold,p=r.bits,m=r.lencode,_=r.distcode,g=(1<<r.lenbits)-1,b=(1<<r.distbits)-1;e:do{p<15&&(d+=z[n++]<<p,p+=8,d+=z[n++]<<p,p+=8),v=m[d&g];t:for(;;){if(d>>>=y=v>>>24,p-=y,0===(y=v>>>16&255))C[s++]=65535&v;else{if(!(16&y)){if(0==(64&y)){v=m[(65535&v)+(d&(1<<y)-1)];continue t}if(32&y){r.mode=12;break e}e.msg="invalid literal/length code",r.mode=30;break e}w=65535&v,(y&=15)&&(p<y&&(d+=z[n++]<<p,p+=8),w+=d&(1<<y)-1,d>>>=y,p-=y),p<15&&(d+=z[n++]<<p,p+=8,d+=z[n++]<<p,p+=8),v=_[d&b];r:for(;;){if(d>>>=y=v>>>24,p-=y,!(16&(y=v>>>16&255))){if(0==(64&y)){v=_[(65535&v)+(d&(1<<y)-1)];continue r}e.msg="invalid distance code",r.mode=30;break e}if(k=65535&v,p<(y&=15)&&(d+=z[n++]<<p,(p+=8)<y&&(d+=z[n++]<<p,p+=8)),h<(k+=d&(1<<y)-1)){e.msg="invalid distance too far back",r.mode=30;break e}if(d>>>=y,p-=y,(y=s-a)<k){if(l<(y=k-y)&&r.sane){e.msg="invalid distance too far back",r.mode=30;break e}if(S=c,(x=0)===f){if(x+=u-y,y<w){for(w-=y;C[s++]=c[x++],--y;);x=s-k,S=C}}else if(f<y){if(x+=u+f-y,(y-=f)<w){for(w-=y;C[s++]=c[x++],--y;);if(x=0,f<w){for(w-=y=f;C[s++]=c[x++],--y;);x=s-k,S=C}}}else if(x+=f-y,y<w){for(w-=y;C[s++]=c[x++],--y;);x=s-k,S=C}for(;2<w;)C[s++]=S[x++],C[s++]=S[x++],C[s++]=S[x++],w-=3;w&&(C[s++]=S[x++],1<w&&(C[s++]=S[x++]))}else{for(x=s-k;C[s++]=C[x++],C[s++]=C[x++],C[s++]=C[x++],2<(w-=3););w&&(C[s++]=C[x++],1<w&&(C[s++]=C[x++]))}break}}break}}while(n<i&&s<o);n-=w=p>>3,d&=(1<<(p-=w<<3))-1,e.next_in=n,e.next_out=s,e.avail_in=n<i?i-n+5:5-(n-i),e.avail_out=s<o?o-s+257:257-(s-o),r.hold=d,r.bits=p}},{}],49:[function(e,t,r){"use strict";var I=e("../utils/common"),O=e("./adler32"),B=e("./crc32"),R=e("./inffast"),T=e("./inftrees"),D=1,F=2,N=0,U=-2,P=1,n=852,i=592;function L(e){return(e>>>24&255)+(e>>>8&65280)+((65280&e)<<8)+((255&e)<<24)}function s(){this.mode=0,this.last=!1,this.wrap=0,this.havedict=!1,this.flags=0,this.dmax=0,this.check=0,this.total=0,this.head=null,this.wbits=0,this.wsize=0,this.whave=0,this.wnext=0,this.window=null,this.hold=0,this.bits=0,this.length=0,this.offset=0,this.extra=0,this.lencode=null,this.distcode=null,this.lenbits=0,this.distbits=0,this.ncode=0,this.nlen=0,this.ndist=0,this.have=0,this.next=null,this.lens=new I.Buf16(320),this.work=new I.Buf16(288),this.lendyn=null,this.distdyn=null,this.sane=0,this.back=0,this.was=0}function a(e){var t;return e&&e.state?(t=e.state,e.total_in=e.total_out=t.total=0,e.msg="",t.wrap&&(e.adler=1&t.wrap),t.mode=P,t.last=0,t.havedict=0,t.dmax=32768,t.head=null,t.hold=0,t.bits=0,t.lencode=t.lendyn=new I.Buf32(n),t.distcode=t.distdyn=new I.Buf32(i),t.sane=1,t.back=-1,N):U}function o(e){var t;return e&&e.state?((t=e.state).wsize=0,t.whave=0,t.wnext=0,a(e)):U}function h(e,t){var r,n;return e&&e.state?(n=e.state,t<0?(r=0,t=-t):(r=1+(t>>4),t<48&&(t&=15)),t&&(t<8||15<t)?U:(null!==n.window&&n.wbits!==t&&(n.window=null),n.wrap=r,n.wbits=t,o(e))):U}function u(e,t){var r,n;return e?(n=new s,(e.state=n).window=null,(r=h(e,t))!==N&&(e.state=null),r):U}var l,f,c=!0;function j(e){if(c){var t;for(l=new I.Buf32(512),f=new I.Buf32(32),t=0;t<144;)e.lens[t++]=8;for(;t<256;)e.lens[t++]=9;for(;t<280;)e.lens[t++]=7;for(;t<288;)e.lens[t++]=8;for(T(D,e.lens,0,288,l,0,e.work,{bits:9}),t=0;t<32;)e.lens[t++]=5;T(F,e.lens,0,32,f,0,e.work,{bits:5}),c=!1}e.lencode=l,e.lenbits=9,e.distcode=f,e.distbits=5}function Z(e,t,r,n){var i,s=e.state;return null===s.window&&(s.wsize=1<<s.wbits,s.wnext=0,s.whave=0,s.window=new I.Buf8(s.wsize)),n>=s.wsize?(I.arraySet(s.window,t,r-s.wsize,s.wsize,0),s.wnext=0,s.whave=s.wsize):(n<(i=s.wsize-s.wnext)&&(i=n),I.arraySet(s.window,t,r-n,i,s.wnext),(n-=i)?(I.arraySet(s.window,t,r-n,n,0),s.wnext=n,s.whave=s.wsize):(s.wnext+=i,s.wnext===s.wsize&&(s.wnext=0),s.whave<s.wsize&&(s.whave+=i))),0}r.inflateReset=o,r.inflateReset2=h,r.inflateResetKeep=a,r.inflateInit=function(e){return u(e,15)},r.inflateInit2=u,r.inflate=function(e,t){var r,n,i,s,a,o,h,u,l,f,c,d,p,m,_,g,b,v,y,w,k,x,S,z,C=0,E=new I.Buf8(4),A=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];if(!e||!e.state||!e.output||!e.input&&0!==e.avail_in)return U;12===(r=e.state).mode&&(r.mode=13),a=e.next_out,i=e.output,h=e.avail_out,s=e.next_in,n=e.input,o=e.avail_in,u=r.hold,l=r.bits,f=o,c=h,x=N;e:for(;;)switch(r.mode){case P:if(0===r.wrap){r.mode=13;break}for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(2&r.wrap&&35615===u){E[r.check=0]=255&u,E[1]=u>>>8&255,r.check=B(r.check,E,2,0),l=u=0,r.mode=2;break}if(r.flags=0,r.head&&(r.head.done=!1),!(1&r.wrap)||(((255&u)<<8)+(u>>8))%31){e.msg="incorrect header check",r.mode=30;break}if(8!=(15&u)){e.msg="unknown compression method",r.mode=30;break}if(l-=4,k=8+(15&(u>>>=4)),0===r.wbits)r.wbits=k;else if(k>r.wbits){e.msg="invalid window size",r.mode=30;break}r.dmax=1<<k,e.adler=r.check=1,r.mode=512&u?10:12,l=u=0;break;case 2:for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(r.flags=u,8!=(255&r.flags)){e.msg="unknown compression method",r.mode=30;break}if(57344&r.flags){e.msg="unknown header flags set",r.mode=30;break}r.head&&(r.head.text=u>>8&1),512&r.flags&&(E[0]=255&u,E[1]=u>>>8&255,r.check=B(r.check,E,2,0)),l=u=0,r.mode=3;case 3:for(;l<32;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.head&&(r.head.time=u),512&r.flags&&(E[0]=255&u,E[1]=u>>>8&255,E[2]=u>>>16&255,E[3]=u>>>24&255,r.check=B(r.check,E,4,0)),l=u=0,r.mode=4;case 4:for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.head&&(r.head.xflags=255&u,r.head.os=u>>8),512&r.flags&&(E[0]=255&u,E[1]=u>>>8&255,r.check=B(r.check,E,2,0)),l=u=0,r.mode=5;case 5:if(1024&r.flags){for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.length=u,r.head&&(r.head.extra_len=u),512&r.flags&&(E[0]=255&u,E[1]=u>>>8&255,r.check=B(r.check,E,2,0)),l=u=0}else r.head&&(r.head.extra=null);r.mode=6;case 6:if(1024&r.flags&&(o<(d=r.length)&&(d=o),d&&(r.head&&(k=r.head.extra_len-r.length,r.head.extra||(r.head.extra=new Array(r.head.extra_len)),I.arraySet(r.head.extra,n,s,d,k)),512&r.flags&&(r.check=B(r.check,n,d,s)),o-=d,s+=d,r.length-=d),r.length))break e;r.length=0,r.mode=7;case 7:if(2048&r.flags){if(0===o)break e;for(d=0;k=n[s+d++],r.head&&k&&r.length<65536&&(r.head.name+=String.fromCharCode(k)),k&&d<o;);if(512&r.flags&&(r.check=B(r.check,n,d,s)),o-=d,s+=d,k)break e}else r.head&&(r.head.name=null);r.length=0,r.mode=8;case 8:if(4096&r.flags){if(0===o)break e;for(d=0;k=n[s+d++],r.head&&k&&r.length<65536&&(r.head.comment+=String.fromCharCode(k)),k&&d<o;);if(512&r.flags&&(r.check=B(r.check,n,d,s)),o-=d,s+=d,k)break e}else r.head&&(r.head.comment=null);r.mode=9;case 9:if(512&r.flags){for(;l<16;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(u!==(65535&r.check)){e.msg="header crc mismatch",r.mode=30;break}l=u=0}r.head&&(r.head.hcrc=r.flags>>9&1,r.head.done=!0),e.adler=r.check=0,r.mode=12;break;case 10:for(;l<32;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}e.adler=r.check=L(u),l=u=0,r.mode=11;case 11:if(0===r.havedict)return e.next_out=a,e.avail_out=h,e.next_in=s,e.avail_in=o,r.hold=u,r.bits=l,2;e.adler=r.check=1,r.mode=12;case 12:if(5===t||6===t)break e;case 13:if(r.last){u>>>=7&l,l-=7&l,r.mode=27;break}for(;l<3;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}switch(r.last=1&u,l-=1,3&(u>>>=1)){case 0:r.mode=14;break;case 1:if(j(r),r.mode=20,6!==t)break;u>>>=2,l-=2;break e;case 2:r.mode=17;break;case 3:e.msg="invalid block type",r.mode=30}u>>>=2,l-=2;break;case 14:for(u>>>=7&l,l-=7&l;l<32;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if((65535&u)!=(u>>>16^65535)){e.msg="invalid stored block lengths",r.mode=30;break}if(r.length=65535&u,l=u=0,r.mode=15,6===t)break e;case 15:r.mode=16;case 16:if(d=r.length){if(o<d&&(d=o),h<d&&(d=h),0===d)break e;I.arraySet(i,n,s,d,a),o-=d,s+=d,h-=d,a+=d,r.length-=d;break}r.mode=12;break;case 17:for(;l<14;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(r.nlen=257+(31&u),u>>>=5,l-=5,r.ndist=1+(31&u),u>>>=5,l-=5,r.ncode=4+(15&u),u>>>=4,l-=4,286<r.nlen||30<r.ndist){e.msg="too many length or distance symbols",r.mode=30;break}r.have=0,r.mode=18;case 18:for(;r.have<r.ncode;){for(;l<3;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.lens[A[r.have++]]=7&u,u>>>=3,l-=3}for(;r.have<19;)r.lens[A[r.have++]]=0;if(r.lencode=r.lendyn,r.lenbits=7,S={bits:r.lenbits},x=T(0,r.lens,0,19,r.lencode,0,r.work,S),r.lenbits=S.bits,x){e.msg="invalid code lengths set",r.mode=30;break}r.have=0,r.mode=19;case 19:for(;r.have<r.nlen+r.ndist;){for(;g=(C=r.lencode[u&(1<<r.lenbits)-1])>>>16&255,b=65535&C,!((_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(b<16)u>>>=_,l-=_,r.lens[r.have++]=b;else{if(16===b){for(z=_+2;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(u>>>=_,l-=_,0===r.have){e.msg="invalid bit length repeat",r.mode=30;break}k=r.lens[r.have-1],d=3+(3&u),u>>>=2,l-=2}else if(17===b){for(z=_+3;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}l-=_,k=0,d=3+(7&(u>>>=_)),u>>>=3,l-=3}else{for(z=_+7;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}l-=_,k=0,d=11+(127&(u>>>=_)),u>>>=7,l-=7}if(r.have+d>r.nlen+r.ndist){e.msg="invalid bit length repeat",r.mode=30;break}for(;d--;)r.lens[r.have++]=k}}if(30===r.mode)break;if(0===r.lens[256]){e.msg="invalid code -- missing end-of-block",r.mode=30;break}if(r.lenbits=9,S={bits:r.lenbits},x=T(D,r.lens,0,r.nlen,r.lencode,0,r.work,S),r.lenbits=S.bits,x){e.msg="invalid literal/lengths set",r.mode=30;break}if(r.distbits=6,r.distcode=r.distdyn,S={bits:r.distbits},x=T(F,r.lens,r.nlen,r.ndist,r.distcode,0,r.work,S),r.distbits=S.bits,x){e.msg="invalid distances set",r.mode=30;break}if(r.mode=20,6===t)break e;case 20:r.mode=21;case 21:if(6<=o&&258<=h){e.next_out=a,e.avail_out=h,e.next_in=s,e.avail_in=o,r.hold=u,r.bits=l,R(e,c),a=e.next_out,i=e.output,h=e.avail_out,s=e.next_in,n=e.input,o=e.avail_in,u=r.hold,l=r.bits,12===r.mode&&(r.back=-1);break}for(r.back=0;g=(C=r.lencode[u&(1<<r.lenbits)-1])>>>16&255,b=65535&C,!((_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(g&&0==(240&g)){for(v=_,y=g,w=b;g=(C=r.lencode[w+((u&(1<<v+y)-1)>>v)])>>>16&255,b=65535&C,!(v+(_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}u>>>=v,l-=v,r.back+=v}if(u>>>=_,l-=_,r.back+=_,r.length=b,0===g){r.mode=26;break}if(32&g){r.back=-1,r.mode=12;break}if(64&g){e.msg="invalid literal/length code",r.mode=30;break}r.extra=15&g,r.mode=22;case 22:if(r.extra){for(z=r.extra;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.length+=u&(1<<r.extra)-1,u>>>=r.extra,l-=r.extra,r.back+=r.extra}r.was=r.length,r.mode=23;case 23:for(;g=(C=r.distcode[u&(1<<r.distbits)-1])>>>16&255,b=65535&C,!((_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(0==(240&g)){for(v=_,y=g,w=b;g=(C=r.distcode[w+((u&(1<<v+y)-1)>>v)])>>>16&255,b=65535&C,!(v+(_=C>>>24)<=l);){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}u>>>=v,l-=v,r.back+=v}if(u>>>=_,l-=_,r.back+=_,64&g){e.msg="invalid distance code",r.mode=30;break}r.offset=b,r.extra=15&g,r.mode=24;case 24:if(r.extra){for(z=r.extra;l<z;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}r.offset+=u&(1<<r.extra)-1,u>>>=r.extra,l-=r.extra,r.back+=r.extra}if(r.offset>r.dmax){e.msg="invalid distance too far back",r.mode=30;break}r.mode=25;case 25:if(0===h)break e;if(d=c-h,r.offset>d){if((d=r.offset-d)>r.whave&&r.sane){e.msg="invalid distance too far back",r.mode=30;break}p=d>r.wnext?(d-=r.wnext,r.wsize-d):r.wnext-d,d>r.length&&(d=r.length),m=r.window}else m=i,p=a-r.offset,d=r.length;for(h<d&&(d=h),h-=d,r.length-=d;i[a++]=m[p++],--d;);0===r.length&&(r.mode=21);break;case 26:if(0===h)break e;i[a++]=r.length,h--,r.mode=21;break;case 27:if(r.wrap){for(;l<32;){if(0===o)break e;o--,u|=n[s++]<<l,l+=8}if(c-=h,e.total_out+=c,r.total+=c,c&&(e.adler=r.check=r.flags?B(r.check,i,c,a-c):O(r.check,i,c,a-c)),c=h,(r.flags?u:L(u))!==r.check){e.msg="incorrect data check",r.mode=30;break}l=u=0}r.mode=28;case 28:if(r.wrap&&r.flags){for(;l<32;){if(0===o)break e;o--,u+=n[s++]<<l,l+=8}if(u!==(4294967295&r.total)){e.msg="incorrect length check",r.mode=30;break}l=u=0}r.mode=29;case 29:x=1;break e;case 30:x=-3;break e;case 31:return-4;case 32:default:return U}return e.next_out=a,e.avail_out=h,e.next_in=s,e.avail_in=o,r.hold=u,r.bits=l,(r.wsize||c!==e.avail_out&&r.mode<30&&(r.mode<27||4!==t))&&Z(e,e.output,e.next_out,c-e.avail_out)?(r.mode=31,-4):(f-=e.avail_in,c-=e.avail_out,e.total_in+=f,e.total_out+=c,r.total+=c,r.wrap&&c&&(e.adler=r.check=r.flags?B(r.check,i,c,e.next_out-c):O(r.check,i,c,e.next_out-c)),e.data_type=r.bits+(r.last?64:0)+(12===r.mode?128:0)+(20===r.mode||15===r.mode?256:0),(0==f&&0===c||4===t)&&x===N&&(x=-5),x)},r.inflateEnd=function(e){if(!e||!e.state)return U;var t=e.state;return t.window&&(t.window=null),e.state=null,N},r.inflateGetHeader=function(e,t){var r;return e&&e.state?0==(2&(r=e.state).wrap)?U:((r.head=t).done=!1,N):U},r.inflateSetDictionary=function(e,t){var r,n=t.length;return e&&e.state?0!==(r=e.state).wrap&&11!==r.mode?U:11===r.mode&&O(1,t,n,0)!==r.check?-3:Z(e,t,n,n)?(r.mode=31,-4):(r.havedict=1,N):U},r.inflateInfo="pako inflate (from Nodeca project)"},{"../utils/common":41,"./adler32":43,"./crc32":45,"./inffast":48,"./inftrees":50}],50:[function(e,t,r){"use strict";var D=e("../utils/common"),F=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258,0,0],N=[16,16,16,16,16,16,16,16,17,17,17,17,18,18,18,18,19,19,19,19,20,20,20,20,21,21,21,21,16,72,78],U=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577,0,0],P=[16,16,16,16,17,17,18,18,19,19,20,20,21,21,22,22,23,23,24,24,25,25,26,26,27,27,28,28,29,29,64,64];t.exports=function(e,t,r,n,i,s,a,o){var h,u,l,f,c,d,p,m,_,g=o.bits,b=0,v=0,y=0,w=0,k=0,x=0,S=0,z=0,C=0,E=0,A=null,I=0,O=new D.Buf16(16),B=new D.Buf16(16),R=null,T=0;for(b=0;b<=15;b++)O[b]=0;for(v=0;v<n;v++)O[t[r+v]]++;for(k=g,w=15;1<=w&&0===O[w];w--);if(w<k&&(k=w),0===w)return i[s++]=20971520,i[s++]=20971520,o.bits=1,0;for(y=1;y<w&&0===O[y];y++);for(k<y&&(k=y),b=z=1;b<=15;b++)if(z<<=1,(z-=O[b])<0)return-1;if(0<z&&(0===e||1!==w))return-1;for(B[1]=0,b=1;b<15;b++)B[b+1]=B[b]+O[b];for(v=0;v<n;v++)0!==t[r+v]&&(a[B[t[r+v]]++]=v);if(d=0===e?(A=R=a,19):1===e?(A=F,I-=257,R=N,T-=257,256):(A=U,R=P,-1),b=y,c=s,S=v=E=0,l=-1,f=(C=1<<(x=k))-1,1===e&&852<C||2===e&&592<C)return 1;for(;;){for(p=b-S,_=a[v]<d?(m=0,a[v]):a[v]>d?(m=R[T+a[v]],A[I+a[v]]):(m=96,0),h=1<<b-S,y=u=1<<x;i[c+(E>>S)+(u-=h)]=p<<24|m<<16|_|0,0!==u;);for(h=1<<b-1;E&h;)h>>=1;if(0!==h?(E&=h-1,E+=h):E=0,v++,0==--O[b]){if(b===w)break;b=t[r+a[v]]}if(k<b&&(E&f)!==l){for(0===S&&(S=k),c+=y,z=1<<(x=b-S);x+S<w&&!((z-=O[x+S])<=0);)x++,z<<=1;if(C+=1<<x,1===e&&852<C||2===e&&592<C)return 1;i[l=E&f]=k<<24|x<<16|c-s|0}}return 0!==E&&(i[c+E]=b-S<<24|64<<16|0),o.bits=k,0}},{"../utils/common":41}],51:[function(e,t,r){"use strict";t.exports={2:"need dictionary",1:"stream end",0:"","-1":"file error","-2":"stream error","-3":"data error","-4":"insufficient memory","-5":"buffer error","-6":"incompatible version"}},{}],52:[function(e,t,r){"use strict";var i=e("../utils/common"),o=0,h=1;function n(e){for(var t=e.length;0<=--t;)e[t]=0}var s=0,a=29,u=256,l=u+1+a,f=30,c=19,_=2*l+1,g=15,d=16,p=7,m=256,b=16,v=17,y=18,w=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0],k=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13],x=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,3,7],S=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15],z=new Array(2*(l+2));n(z);var C=new Array(2*f);n(C);var E=new Array(512);n(E);var A=new Array(256);n(A);var I=new Array(a);n(I);var O,B,R,T=new Array(f);function D(e,t,r,n,i){this.static_tree=e,this.extra_bits=t,this.extra_base=r,this.elems=n,this.max_length=i,this.has_stree=e&&e.length}function F(e,t){this.dyn_tree=e,this.max_code=0,this.stat_desc=t}function N(e){return e<256?E[e]:E[256+(e>>>7)]}function U(e,t){e.pending_buf[e.pending++]=255&t,e.pending_buf[e.pending++]=t>>>8&255}function P(e,t,r){e.bi_valid>d-r?(e.bi_buf|=t<<e.bi_valid&65535,U(e,e.bi_buf),e.bi_buf=t>>d-e.bi_valid,e.bi_valid+=r-d):(e.bi_buf|=t<<e.bi_valid&65535,e.bi_valid+=r)}function L(e,t,r){P(e,r[2*t],r[2*t+1])}function j(e,t){for(var r=0;r|=1&e,e>>>=1,r<<=1,0<--t;);return r>>>1}function Z(e,t,r){var n,i,s=new Array(g+1),a=0;for(n=1;n<=g;n++)s[n]=a=a+r[n-1]<<1;for(i=0;i<=t;i++){var o=e[2*i+1];0!==o&&(e[2*i]=j(s[o]++,o))}}function W(e){var t;for(t=0;t<l;t++)e.dyn_ltree[2*t]=0;for(t=0;t<f;t++)e.dyn_dtree[2*t]=0;for(t=0;t<c;t++)e.bl_tree[2*t]=0;e.dyn_ltree[2*m]=1,e.opt_len=e.static_len=0,e.last_lit=e.matches=0}function M(e){8<e.bi_valid?U(e,e.bi_buf):0<e.bi_valid&&(e.pending_buf[e.pending++]=e.bi_buf),e.bi_buf=0,e.bi_valid=0}function H(e,t,r,n){var i=2*t,s=2*r;return e[i]<e[s]||e[i]===e[s]&&n[t]<=n[r]}function G(e,t,r){for(var n=e.heap[r],i=r<<1;i<=e.heap_len&&(i<e.heap_len&&H(t,e.heap[i+1],e.heap[i],e.depth)&&i++,!H(t,n,e.heap[i],e.depth));)e.heap[r]=e.heap[i],r=i,i<<=1;e.heap[r]=n}function K(e,t,r){var n,i,s,a,o=0;if(0!==e.last_lit)for(;n=e.pending_buf[e.d_buf+2*o]<<8|e.pending_buf[e.d_buf+2*o+1],i=e.pending_buf[e.l_buf+o],o++,0===n?L(e,i,t):(L(e,(s=A[i])+u+1,t),0!==(a=w[s])&&P(e,i-=I[s],a),L(e,s=N(--n),r),0!==(a=k[s])&&P(e,n-=T[s],a)),o<e.last_lit;);L(e,m,t)}function Y(e,t){var r,n,i,s=t.dyn_tree,a=t.stat_desc.static_tree,o=t.stat_desc.has_stree,h=t.stat_desc.elems,u=-1;for(e.heap_len=0,e.heap_max=_,r=0;r<h;r++)0!==s[2*r]?(e.heap[++e.heap_len]=u=r,e.depth[r]=0):s[2*r+1]=0;for(;e.heap_len<2;)s[2*(i=e.heap[++e.heap_len]=u<2?++u:0)]=1,e.depth[i]=0,e.opt_len--,o&&(e.static_len-=a[2*i+1]);for(t.max_code=u,r=e.heap_len>>1;1<=r;r--)G(e,s,r);for(i=h;r=e.heap[1],e.heap[1]=e.heap[e.heap_len--],G(e,s,1),n=e.heap[1],e.heap[--e.heap_max]=r,e.heap[--e.heap_max]=n,s[2*i]=s[2*r]+s[2*n],e.depth[i]=(e.depth[r]>=e.depth[n]?e.depth[r]:e.depth[n])+1,s[2*r+1]=s[2*n+1]=i,e.heap[1]=i++,G(e,s,1),2<=e.heap_len;);e.heap[--e.heap_max]=e.heap[1],function(e,t){var r,n,i,s,a,o,h=t.dyn_tree,u=t.max_code,l=t.stat_desc.static_tree,f=t.stat_desc.has_stree,c=t.stat_desc.extra_bits,d=t.stat_desc.extra_base,p=t.stat_desc.max_length,m=0;for(s=0;s<=g;s++)e.bl_count[s]=0;for(h[2*e.heap[e.heap_max]+1]=0,r=e.heap_max+1;r<_;r++)p<(s=h[2*h[2*(n=e.heap[r])+1]+1]+1)&&(s=p,m++),h[2*n+1]=s,u<n||(e.bl_count[s]++,a=0,d<=n&&(a=c[n-d]),o=h[2*n],e.opt_len+=o*(s+a),f&&(e.static_len+=o*(l[2*n+1]+a)));if(0!==m){do{for(s=p-1;0===e.bl_count[s];)s--;e.bl_count[s]--,e.bl_count[s+1]+=2,e.bl_count[p]--,m-=2}while(0<m);for(s=p;0!==s;s--)for(n=e.bl_count[s];0!==n;)u<(i=e.heap[--r])||(h[2*i+1]!==s&&(e.opt_len+=(s-h[2*i+1])*h[2*i],h[2*i+1]=s),n--)}}(e,t),Z(s,u,e.bl_count)}function X(e,t,r){var n,i,s=-1,a=t[1],o=0,h=7,u=4;for(0===a&&(h=138,u=3),t[2*(r+1)+1]=65535,n=0;n<=r;n++)i=a,a=t[2*(n+1)+1],++o<h&&i===a||(o<u?e.bl_tree[2*i]+=o:0!==i?(i!==s&&e.bl_tree[2*i]++,e.bl_tree[2*b]++):o<=10?e.bl_tree[2*v]++:e.bl_tree[2*y]++,s=i,u=(o=0)===a?(h=138,3):i===a?(h=6,3):(h=7,4))}function V(e,t,r){var n,i,s=-1,a=t[1],o=0,h=7,u=4;for(0===a&&(h=138,u=3),n=0;n<=r;n++)if(i=a,a=t[2*(n+1)+1],!(++o<h&&i===a)){if(o<u)for(;L(e,i,e.bl_tree),0!=--o;);else 0!==i?(i!==s&&(L(e,i,e.bl_tree),o--),L(e,b,e.bl_tree),P(e,o-3,2)):o<=10?(L(e,v,e.bl_tree),P(e,o-3,3)):(L(e,y,e.bl_tree),P(e,o-11,7));s=i,u=(o=0)===a?(h=138,3):i===a?(h=6,3):(h=7,4)}}n(T);var q=!1;function J(e,t,r,n){P(e,(s<<1)+(n?1:0),3),function(e,t,r,n){M(e),n&&(U(e,r),U(e,~r)),i.arraySet(e.pending_buf,e.window,t,r,e.pending),e.pending+=r}(e,t,r,!0)}r._tr_init=function(e){q||(function(){var e,t,r,n,i,s=new Array(g+1);for(n=r=0;n<a-1;n++)for(I[n]=r,e=0;e<1<<w[n];e++)A[r++]=n;for(A[r-1]=n,n=i=0;n<16;n++)for(T[n]=i,e=0;e<1<<k[n];e++)E[i++]=n;for(i>>=7;n<f;n++)for(T[n]=i<<7,e=0;e<1<<k[n]-7;e++)E[256+i++]=n;for(t=0;t<=g;t++)s[t]=0;for(e=0;e<=143;)z[2*e+1]=8,e++,s[8]++;for(;e<=255;)z[2*e+1]=9,e++,s[9]++;for(;e<=279;)z[2*e+1]=7,e++,s[7]++;for(;e<=287;)z[2*e+1]=8,e++,s[8]++;for(Z(z,l+1,s),e=0;e<f;e++)C[2*e+1]=5,C[2*e]=j(e,5);O=new D(z,w,u+1,l,g),B=new D(C,k,0,f,g),R=new D(new Array(0),x,0,c,p)}(),q=!0),e.l_desc=new F(e.dyn_ltree,O),e.d_desc=new F(e.dyn_dtree,B),e.bl_desc=new F(e.bl_tree,R),e.bi_buf=0,e.bi_valid=0,W(e)},r._tr_stored_block=J,r._tr_flush_block=function(e,t,r,n){var i,s,a=0;0<e.level?(2===e.strm.data_type&&(e.strm.data_type=function(e){var t,r=4093624447;for(t=0;t<=31;t++,r>>>=1)if(1&r&&0!==e.dyn_ltree[2*t])return o;if(0!==e.dyn_ltree[18]||0!==e.dyn_ltree[20]||0!==e.dyn_ltree[26])return h;for(t=32;t<u;t++)if(0!==e.dyn_ltree[2*t])return h;return o}(e)),Y(e,e.l_desc),Y(e,e.d_desc),a=function(e){var t;for(X(e,e.dyn_ltree,e.l_desc.max_code),X(e,e.dyn_dtree,e.d_desc.max_code),Y(e,e.bl_desc),t=c-1;3<=t&&0===e.bl_tree[2*S[t]+1];t--);return e.opt_len+=3*(t+1)+5+5+4,t}(e),i=e.opt_len+3+7>>>3,(s=e.static_len+3+7>>>3)<=i&&(i=s)):i=s=r+5,r+4<=i&&-1!==t?J(e,t,r,n):4===e.strategy||s===i?(P(e,2+(n?1:0),3),K(e,z,C)):(P(e,4+(n?1:0),3),function(e,t,r,n){var i;for(P(e,t-257,5),P(e,r-1,5),P(e,n-4,4),i=0;i<n;i++)P(e,e.bl_tree[2*S[i]+1],3);V(e,e.dyn_ltree,t-1),V(e,e.dyn_dtree,r-1)}(e,e.l_desc.max_code+1,e.d_desc.max_code+1,a+1),K(e,e.dyn_ltree,e.dyn_dtree)),W(e),n&&M(e)},r._tr_tally=function(e,t,r){return e.pending_buf[e.d_buf+2*e.last_lit]=t>>>8&255,e.pending_buf[e.d_buf+2*e.last_lit+1]=255&t,e.pending_buf[e.l_buf+e.last_lit]=255&r,e.last_lit++,0===t?e.dyn_ltree[2*r]++:(e.matches++,t--,e.dyn_ltree[2*(A[r]+u+1)]++,e.dyn_dtree[2*N(t)]++),e.last_lit===e.lit_bufsize-1},r._tr_align=function(e){P(e,2,3),L(e,m,z),function(e){16===e.bi_valid?(U(e,e.bi_buf),e.bi_buf=0,e.bi_valid=0):8<=e.bi_valid&&(e.pending_buf[e.pending++]=255&e.bi_buf,e.bi_buf>>=8,e.bi_valid-=8)}(e)}},{"../utils/common":41}],53:[function(e,t,r){"use strict";t.exports=function(){this.input=null,this.next_in=0,this.avail_in=0,this.total_in=0,this.output=null,this.next_out=0,this.avail_out=0,this.total_out=0,this.msg="",this.state=null,this.data_type=2,this.adler=0}},{}],54:[function(e,t,r){(function(e){!function(r,n){"use strict";if(!r.setImmediate){var i,s,t,a,o=1,h={},u=!1,l=r.document,e=Object.getPrototypeOf&&Object.getPrototypeOf(r);e=e&&e.setTimeout?e:r,i="[object process]"==={}.toString.call(r.process)?function(e){process.nextTick(function(){c(e)})}:function(){if(r.postMessage&&!r.importScripts){var e=!0,t=r.onmessage;return r.onmessage=function(){e=!1},r.postMessage("","*"),r.onmessage=t,e}}()?(a="setImmediate$"+Math.random()+"$",r.addEventListener?r.addEventListener("message",d,!1):r.attachEvent("onmessage",d),function(e){r.postMessage(a+e,"*")}):r.MessageChannel?((t=new MessageChannel).port1.onmessage=function(e){c(e.data)},function(e){t.port2.postMessage(e)}):l&&"onreadystatechange"in l.createElement("script")?(s=l.documentElement,function(e){var t=l.createElement("script");t.onreadystatechange=function(){c(e),t.onreadystatechange=null,s.removeChild(t),t=null},s.appendChild(t)}):function(e){setTimeout(c,0,e)},e.setImmediate=function(e){"function"!=typeof e&&(e=new Function(""+e));for(var t=new Array(arguments.length-1),r=0;r<t.length;r++)t[r]=arguments[r+1];var n={callback:e,args:t};return h[o]=n,i(o),o++},e.clearImmediate=f}function f(e){delete h[e]}function c(e){if(u)setTimeout(c,0,e);else{var t=h[e];if(t){u=!0;try{!function(e){var t=e.callback,r=e.args;switch(r.length){case 0:t();break;case 1:t(r[0]);break;case 2:t(r[0],r[1]);break;case 3:t(r[0],r[1],r[2]);break;default:t.apply(n,r)}}(t)}finally{f(e),u=!1}}}}function d(e){e.source===r&&"string"==typeof e.data&&0===e.data.indexOf(a)&&c(+e.data.slice(a.length))}}("undefined"==typeof self?void 0===e?this:e:self)}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{})},{}]},{},[10])(10)});
  if (typeof JSZip !== 'undefined') window.JSZip = JSZip;

  // --- Yomitan Deinflection Rules ---
  window.DEINFLECT_RULES = {
    "-ba": [
        {"kanaIn": "ければ", "kanaOut": "い", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "えば", "kanaOut": "う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "けば", "kanaOut": "く", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "げば", "kanaOut": "ぐ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "せば", "kanaOut": "す", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "てば", "kanaOut": "つ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ねば", "kanaOut": "ぬ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "べば", "kanaOut": "ぶ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "めば", "kanaOut": "む", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "れば", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v1", "v5", "vk", "vs", "vz"]}
    ],
    "-chau": [
        {"kanaIn": "ちゃう", "kanaOut": "る", "rulesIn": ["v5"], "rulesOut": ["v1"]},
        {"kanaIn": "いじゃう", "kanaOut": "ぐ", "rulesIn": ["v5"], "rulesOut": ["v5"]},
        {"kanaIn": "いちゃう", "kanaOut": "く", "rulesIn": ["v5"], "rulesOut": ["v5"]},
        {"kanaIn": "しちゃう", "kanaOut": "す", "rulesIn": ["v5"], "rulesOut": ["v5"]},
        {"kanaIn": "っちゃう", "kanaOut": "う", "rulesIn": ["v5"], "rulesOut": ["v5"]},
        {"kanaIn": "っちゃう", "kanaOut": "く", "rulesIn": ["v5"], "rulesOut": ["v5"]},
        {"kanaIn": "っちゃう", "kanaOut": "つ", "rulesIn": ["v5"], "rulesOut": ["v5"]},
        {"kanaIn": "っちゃう", "kanaOut": "る", "rulesIn": ["v5"], "rulesOut": ["v5"]},
        {"kanaIn": "んじゃう", "kanaOut": "ぬ", "rulesIn": ["v5"], "rulesOut": ["v5"]},
        {"kanaIn": "んじゃう", "kanaOut": "ぶ", "rulesIn": ["v5"], "rulesOut": ["v5"]},
        {"kanaIn": "んじゃう", "kanaOut": "む", "rulesIn": ["v5"], "rulesOut": ["v5"]},
        {"kanaIn": "じちゃう", "kanaOut": "ずる", "rulesIn": ["v5"], "rulesOut": ["vz"]},
        {"kanaIn": "しちゃう", "kanaOut": "する", "rulesIn": ["v5"], "rulesOut": ["vs"]},
        {"kanaIn": "為ちゃう", "kanaOut": "為る", "rulesIn": ["v5"], "rulesOut": ["vs"]},
        {"kanaIn": "きちゃう", "kanaOut": "くる", "rulesIn": ["v5"], "rulesOut": ["vk"]},
        {"kanaIn": "来ちゃう", "kanaOut": "来る", "rulesIn": ["v5"], "rulesOut": ["vk"]},
        {"kanaIn": "來ちゃう", "kanaOut": "來る", "rulesIn": ["v5"], "rulesOut": ["vk"]}
    ],
    "-chimau": [
        {"kanaIn": "ちまう", "kanaOut": "る", "rulesIn": ["v5"], "rulesOut": ["v1"]},
        {"kanaIn": "いじまう", "kanaOut": "ぐ", "rulesIn": ["v5"], "rulesOut": ["v5"]},
        {"kanaIn": "いちまう", "kanaOut": "く", "rulesIn": ["v5"], "rulesOut": ["v5"]},
        {"kanaIn": "しちまう", "kanaOut": "す", "rulesIn": ["v5"], "rulesOut": ["v5"]},
        {"kanaIn": "っちまう", "kanaOut": "う", "rulesIn": ["v5"], "rulesOut": ["v5"]},
        {"kanaIn": "っちまう", "kanaOut": "く", "rulesIn": ["v5"], "rulesOut": ["v5"]},
        {"kanaIn": "っちまう", "kanaOut": "つ", "rulesIn": ["v5"], "rulesOut": ["v5"]},
        {"kanaIn": "っちまう", "kanaOut": "る", "rulesIn": ["v5"], "rulesOut": ["v5"]},
        {"kanaIn": "んじまう", "kanaOut": "ぬ", "rulesIn": ["v5"], "rulesOut": ["v5"]},
        {"kanaIn": "んじまう", "kanaOut": "ぶ", "rulesIn": ["v5"], "rulesOut": ["v5"]},
        {"kanaIn": "んじまう", "kanaOut": "む", "rulesIn": ["v5"], "rulesOut": ["v5"]},
        {"kanaIn": "じちまう", "kanaOut": "ずる", "rulesIn": ["v5"], "rulesOut": ["vz"]},
        {"kanaIn": "しちまう", "kanaOut": "する", "rulesIn": ["v5"], "rulesOut": ["vs"]},
        {"kanaIn": "為ちまう", "kanaOut": "為る", "rulesIn": ["v5"], "rulesOut": ["vs"]},
        {"kanaIn": "きちまう", "kanaOut": "くる", "rulesIn": ["v5"], "rulesOut": ["vk"]},
        {"kanaIn": "来ちまう", "kanaOut": "来る", "rulesIn": ["v5"], "rulesOut": ["vk"]},
        {"kanaIn": "來ちまう", "kanaOut": "來る", "rulesIn": ["v5"], "rulesOut": ["vk"]}
    ],
    "-shimau": [
        {"kanaIn": "てしまう", "kanaOut": "て", "rulesIn": ["v5"], "rulesOut": ["iru"]},
        {"kanaIn": "でしまう", "kanaOut": "で", "rulesIn": ["v5"], "rulesOut": ["iru"]}
    ],
    "-nasai": [
        {"kanaIn": "なさい", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "いなさい", "kanaOut": "う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "きなさい", "kanaOut": "く", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ぎなさい", "kanaOut": "ぐ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "しなさい", "kanaOut": "す", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ちなさい", "kanaOut": "つ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "になさい", "kanaOut": "ぬ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "びなさい", "kanaOut": "ぶ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "みなさい", "kanaOut": "む", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "りなさい", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "じなさい", "kanaOut": "ずる", "rulesIn": [], "rulesOut": ["vz"]},
        {"kanaIn": "しなさい", "kanaOut": "する", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "為なさい", "kanaOut": "為る", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "きなさい", "kanaOut": "くる", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "来なさい", "kanaOut": "来る", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "來なさい", "kanaOut": "來る", "rulesIn": [], "rulesOut": ["vk"]}
    ],
    "-sou": [
        {"kanaIn": "そう", "kanaOut": "い", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "そう", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "いそう", "kanaOut": "う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "きそう", "kanaOut": "く", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ぎそう", "kanaOut": "ぐ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "しそう", "kanaOut": "す", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ちそう", "kanaOut": "つ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "にそう", "kanaOut": "ぬ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "びそう", "kanaOut": "ぶ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "みそう", "kanaOut": "む", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "りそう", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "じそう", "kanaOut": "ずる", "rulesIn": [], "rulesOut": ["vz"]},
        {"kanaIn": "しそう", "kanaOut": "する", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "為そう", "kanaOut": "為る", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "きそう", "kanaOut": "くる", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "来そう", "kanaOut": "来る", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "來そう", "kanaOut": "來る", "rulesIn": [], "rulesOut": ["vk"]}
    ],
    "-sugiru": [
        {"kanaIn": "すぎる", "kanaOut": "い", "rulesIn": ["v1"], "rulesOut": ["adj-i"]},
        {"kanaIn": "すぎる", "kanaOut": "る", "rulesIn": ["v1"], "rulesOut": ["v1"]},
        {"kanaIn": "いすぎる", "kanaOut": "う", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "きすぎる", "kanaOut": "く", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "ぎすぎる", "kanaOut": "ぐ", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "しすぎる", "kanaOut": "す", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "ちすぎる", "kanaOut": "つ", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "にすぎる", "kanaOut": "ぬ", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "びすぎる", "kanaOut": "ぶ", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "みすぎる", "kanaOut": "む", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "りすぎる", "kanaOut": "る", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "じすぎる", "kanaOut": "ずる", "rulesIn": ["v1"], "rulesOut": ["vz"]},
        {"kanaIn": "しすぎる", "kanaOut": "する", "rulesIn": ["v1"], "rulesOut": ["vs"]},
        {"kanaIn": "為すぎる", "kanaOut": "為る", "rulesIn": ["v1"], "rulesOut": ["vs"]},
        {"kanaIn": "きすぎる", "kanaOut": "くる", "rulesIn": ["v1"], "rulesOut": ["vk"]},
        {"kanaIn": "来すぎる", "kanaOut": "来る", "rulesIn": ["v1"], "rulesOut": ["vk"]},
        {"kanaIn": "來すぎる", "kanaOut": "來る", "rulesIn": ["v1"], "rulesOut": ["vk"]}
    ],
    "-tai": [
        {"kanaIn": "たい", "kanaOut": "る", "rulesIn": ["adj-i"], "rulesOut": ["v1"]},
        {"kanaIn": "いたい", "kanaOut": "う", "rulesIn": ["adj-i"], "rulesOut": ["v5"]},
        {"kanaIn": "きたい", "kanaOut": "く", "rulesIn": ["adj-i"], "rulesOut": ["v5"]},
        {"kanaIn": "ぎたい", "kanaOut": "ぐ", "rulesIn": ["adj-i"], "rulesOut": ["v5"]},
        {"kanaIn": "したい", "kanaOut": "す", "rulesIn": ["adj-i"], "rulesOut": ["v5"]},
        {"kanaIn": "ちたい", "kanaOut": "つ", "rulesIn": ["adj-i"], "rulesOut": ["v5"]},
        {"kanaIn": "にたい", "kanaOut": "ぬ", "rulesIn": ["adj-i"], "rulesOut": ["v5"]},
        {"kanaIn": "びたい", "kanaOut": "ぶ", "rulesIn": ["adj-i"], "rulesOut": ["v5"]},
        {"kanaIn": "みたい", "kanaOut": "む", "rulesIn": ["adj-i"], "rulesOut": ["v5"]},
        {"kanaIn": "りたい", "kanaOut": "る", "rulesIn": ["adj-i"], "rulesOut": ["v5"]},
        {"kanaIn": "じたい", "kanaOut": "ずる", "rulesIn": ["adj-i"], "rulesOut": ["vz"]},
        {"kanaIn": "したい", "kanaOut": "する", "rulesIn": ["adj-i"], "rulesOut": ["vs"]},
        {"kanaIn": "為たい", "kanaOut": "為る", "rulesIn": ["adj-i"], "rulesOut": ["vs"]},
        {"kanaIn": "きたい", "kanaOut": "くる", "rulesIn": ["adj-i"], "rulesOut": ["vk"]},
        {"kanaIn": "来たい", "kanaOut": "来る", "rulesIn": ["adj-i"], "rulesOut": ["vk"]},
        {"kanaIn": "來たい", "kanaOut": "來る", "rulesIn": ["adj-i"], "rulesOut": ["vk"]}
    ],
    "-tara": [
        {"kanaIn": "かったら", "kanaOut": "い", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "たら", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "いたら", "kanaOut": "く", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "いだら", "kanaOut": "ぐ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "したら", "kanaOut": "す", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ったら", "kanaOut": "う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ったら", "kanaOut": "つ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ったら", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "んだら", "kanaOut": "ぬ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "んだら", "kanaOut": "ぶ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "んだら", "kanaOut": "む", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "じたら", "kanaOut": "ずる", "rulesIn": [], "rulesOut": ["vz"]},
        {"kanaIn": "したら", "kanaOut": "する", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "為たら", "kanaOut": "為る", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "きたら", "kanaOut": "くる", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "来たら", "kanaOut": "来る", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "來たら", "kanaOut": "來る", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "いったら", "kanaOut": "いく", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "おうたら", "kanaOut": "おう", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "こうたら", "kanaOut": "こう", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "そうたら", "kanaOut": "そう", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "とうたら", "kanaOut": "とう", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "行ったら", "kanaOut": "行く", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "逝ったら", "kanaOut": "逝く", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "往ったら", "kanaOut": "往く", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "請うたら", "kanaOut": "請う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "乞うたら", "kanaOut": "乞う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "恋うたら", "kanaOut": "恋う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "問うたら", "kanaOut": "問う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "負うたら", "kanaOut": "負う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "沿うたら", "kanaOut": "沿う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "添うたら", "kanaOut": "添う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "副うたら", "kanaOut": "副う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "厭うたら", "kanaOut": "厭う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "のたもうたら", "kanaOut": "のたまう", "rulesIn": [], "rulesOut": ["v5"]}
    ],
    "-tari": [
        {"kanaIn": "かったり", "kanaOut": "い", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "たり", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "いたり", "kanaOut": "く", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "いだり", "kanaOut": "ぐ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "したり", "kanaOut": "す", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ったり", "kanaOut": "う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ったり", "kanaOut": "つ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ったり", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "んだり", "kanaOut": "ぬ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "んだり", "kanaOut": "ぶ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "んだり", "kanaOut": "む", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "じたり", "kanaOut": "ずる", "rulesIn": [], "rulesOut": ["vz"]},
        {"kanaIn": "したり", "kanaOut": "する", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "為たり", "kanaOut": "為る", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "きたり", "kanaOut": "くる", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "来たり", "kanaOut": "来る", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "來たり", "kanaOut": "來る", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "いったり", "kanaOut": "いく", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "おうたり", "kanaOut": "おう", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "こうたり", "kanaOut": "こう", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "そうたり", "kanaOut": "そう", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "とうたり", "kanaOut": "とう", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "行ったり", "kanaOut": "行く", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "逝ったり", "kanaOut": "逝く", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "往ったり", "kanaOut": "往く", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "請うたり", "kanaOut": "請う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "乞うたり", "kanaOut": "乞う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "恋うたり", "kanaOut": "恋う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "問うたり", "kanaOut": "問う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "負うたり", "kanaOut": "負う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "沿うたり", "kanaOut": "沿う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "添うたり", "kanaOut": "添う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "副うたり", "kanaOut": "副う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "厭うたり", "kanaOut": "厭う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "のたもうたり", "kanaOut": "のたまう", "rulesIn": [], "rulesOut": ["v5"]}
    ],
    "-te": [
        {"kanaIn": "くて", "kanaOut": "い", "rulesIn": ["iru"], "rulesOut": ["adj-i"]},
        {"kanaIn": "て", "kanaOut": "る", "rulesIn": ["iru"], "rulesOut": ["v1"]},
        {"kanaIn": "いて", "kanaOut": "く", "rulesIn": ["iru"], "rulesOut": ["v5"]},
        {"kanaIn": "いで", "kanaOut": "ぐ", "rulesIn": ["iru"], "rulesOut": ["v5"]},
        {"kanaIn": "して", "kanaOut": "す", "rulesIn": ["iru"], "rulesOut": ["v5"]},
        {"kanaIn": "って", "kanaOut": "う", "rulesIn": ["iru"], "rulesOut": ["v5"]},
        {"kanaIn": "って", "kanaOut": "つ", "rulesIn": ["iru"], "rulesOut": ["v5"]},
        {"kanaIn": "って", "kanaOut": "る", "rulesIn": ["iru"], "rulesOut": ["v5"]},
        {"kanaIn": "んで", "kanaOut": "ぬ", "rulesIn": ["iru"], "rulesOut": ["v5"]},
        {"kanaIn": "んで", "kanaOut": "ぶ", "rulesIn": ["iru"], "rulesOut": ["v5"]},
        {"kanaIn": "んで", "kanaOut": "む", "rulesIn": ["iru"], "rulesOut": ["v5"]},
        {"kanaIn": "じて", "kanaOut": "ずる", "rulesIn": ["iru"], "rulesOut": ["vz"]},
        {"kanaIn": "して", "kanaOut": "する", "rulesIn": ["iru"], "rulesOut": ["vs"]},
        {"kanaIn": "為て", "kanaOut": "為る", "rulesIn": ["iru"], "rulesOut": ["vs"]},
        {"kanaIn": "きて", "kanaOut": "くる", "rulesIn": ["iru"], "rulesOut": ["vk"]},
        {"kanaIn": "来て", "kanaOut": "来る", "rulesIn": ["iru"], "rulesOut": ["vk"]},
        {"kanaIn": "來て", "kanaOut": "來る", "rulesIn": ["iru"], "rulesOut": ["vk"]},
        {"kanaIn": "いって", "kanaOut": "いく", "rulesIn": ["iru"], "rulesOut": ["v5"]},
        {"kanaIn": "おうて", "kanaOut": "おう", "rulesIn": ["iru"], "rulesOut": ["v5"]},
        {"kanaIn": "こうて", "kanaOut": "こう", "rulesIn": ["iru"], "rulesOut": ["v5"]},
        {"kanaIn": "そうて", "kanaOut": "そう", "rulesIn": ["iru"], "rulesOut": ["v5"]},
        {"kanaIn": "とうて", "kanaOut": "とう", "rulesIn": ["iru"], "rulesOut": ["v5"]},
        {"kanaIn": "行って", "kanaOut": "行く", "rulesIn": ["iru"], "rulesOut": ["v5"]},
        {"kanaIn": "逝って", "kanaOut": "逝く", "rulesIn": ["iru"], "rulesOut": ["v5"]},
        {"kanaIn": "往って", "kanaOut": "往く", "rulesIn": ["iru"], "rulesOut": ["v5"]},
        {"kanaIn": "請うて", "kanaOut": "請う", "rulesIn": ["iru"], "rulesOut": ["v5"]},
        {"kanaIn": "乞うて", "kanaOut": "乞う", "rulesIn": ["iru"], "rulesOut": ["v5"]},
        {"kanaIn": "恋うて", "kanaOut": "恋う", "rulesIn": ["iru"], "rulesOut": ["v5"]},
        {"kanaIn": "問うて", "kanaOut": "問う", "rulesIn": ["iru"], "rulesOut": ["v5"]},
        {"kanaIn": "負うて", "kanaOut": "負う", "rulesIn": ["iru"], "rulesOut": ["v5"]},
        {"kanaIn": "沿うて", "kanaOut": "沿う", "rulesIn": ["iru"], "rulesOut": ["v5"]},
        {"kanaIn": "添うて", "kanaOut": "添う", "rulesIn": ["iru"], "rulesOut": ["v5"]},
        {"kanaIn": "副うて", "kanaOut": "副う", "rulesIn": ["iru"], "rulesOut": ["v5"]},
        {"kanaIn": "厭うて", "kanaOut": "厭う", "rulesIn": ["iru"], "rulesOut": ["v5"]},
        {"kanaIn": "のたもうて", "kanaOut": "のたまう", "rulesIn": ["iru"], "rulesOut": ["v5"]}
    ],
    "-zu": [
        {"kanaIn": "ず", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "かず", "kanaOut": "く", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "がず", "kanaOut": "ぐ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "さず", "kanaOut": "す", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "たず", "kanaOut": "つ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "なず", "kanaOut": "ぬ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ばず", "kanaOut": "ぶ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "まず", "kanaOut": "む", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "らず", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "わず", "kanaOut": "う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ぜず", "kanaOut": "ずる", "rulesIn": [], "rulesOut": ["vz"]},
        {"kanaIn": "せず", "kanaOut": "する", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "為ず", "kanaOut": "為る", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "こず", "kanaOut": "くる", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "来ず", "kanaOut": "来る", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "來ず", "kanaOut": "來る", "rulesIn": [], "rulesOut": ["vk"]}
    ],
    "-nu": [
        {"kanaIn": "ぬ", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "かぬ", "kanaOut": "く", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "がぬ", "kanaOut": "ぐ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "さぬ", "kanaOut": "す", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "たぬ", "kanaOut": "つ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "なぬ", "kanaOut": "ぬ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ばぬ", "kanaOut": "ぶ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "まぬ", "kanaOut": "む", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "らぬ", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "わぬ", "kanaOut": "う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ぜぬ", "kanaOut": "ずる", "rulesIn": [], "rulesOut": ["vz"]},
        {"kanaIn": "せぬ", "kanaOut": "する", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "為ぬ", "kanaOut": "為る", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "こぬ", "kanaOut": "くる", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "来ぬ", "kanaOut": "来る", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "來ぬ", "kanaOut": "來る", "rulesIn": [], "rulesOut": ["vk"]}
    ],
    "adv": [
        {"kanaIn": "く", "kanaOut": "い", "rulesIn": [], "rulesOut": ["adj-i"]}
    ],
    "causative": [
        {"kanaIn": "させる", "kanaOut": "る", "rulesIn": ["v1"], "rulesOut": ["v1"]},
        {"kanaIn": "かせる", "kanaOut": "く", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "がせる", "kanaOut": "ぐ", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "させる", "kanaOut": "す", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "たせる", "kanaOut": "つ", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "なせる", "kanaOut": "ぬ", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "ばせる", "kanaOut": "ぶ", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "ませる", "kanaOut": "む", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "らせる", "kanaOut": "る", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "わせる", "kanaOut": "う", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "じさせる", "kanaOut": "ずる", "rulesIn": ["v1"], "rulesOut": ["vz"]},
        {"kanaIn": "ぜさせる", "kanaOut": "ずる", "rulesIn": ["v1"], "rulesOut": ["vz"]},
        {"kanaIn": "させる", "kanaOut": "する", "rulesIn": ["v1"], "rulesOut": ["vs"]},
        {"kanaIn": "為せる", "kanaOut": "為る", "rulesIn": ["v1"], "rulesOut": ["vs"]},
        {"kanaIn": "せさせる", "kanaOut": "する", "rulesIn": ["v1"], "rulesOut": ["vs"]},
        {"kanaIn": "為させる", "kanaOut": "為る", "rulesIn": ["v1"], "rulesOut": ["vs"]},
        {"kanaIn": "こさせる", "kanaOut": "くる", "rulesIn": ["v1"], "rulesOut": ["vk"]},
        {"kanaIn": "来させる", "kanaOut": "来る", "rulesIn": ["v1"], "rulesOut": ["vk"]},
        {"kanaIn": "來させる", "kanaOut": "來る", "rulesIn": ["v1"], "rulesOut": ["vk"]}
    ],
    "imperative": [
        {"kanaIn": "ろ", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "よ", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "え", "kanaOut": "う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "け", "kanaOut": "く", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "げ", "kanaOut": "ぐ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "せ", "kanaOut": "す", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "て", "kanaOut": "つ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ね", "kanaOut": "ぬ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "べ", "kanaOut": "ぶ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "め", "kanaOut": "む", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "れ", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "じろ", "kanaOut": "ずる", "rulesIn": [], "rulesOut": ["vz"]},
        {"kanaIn": "ぜよ", "kanaOut": "ずる", "rulesIn": [], "rulesOut": ["vz"]},
        {"kanaIn": "しろ", "kanaOut": "する", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "せよ", "kanaOut": "する", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "為ろ", "kanaOut": "為る", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "為よ", "kanaOut": "為る", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "こい", "kanaOut": "くる", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "来い", "kanaOut": "来る", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "來い", "kanaOut": "來る", "rulesIn": [], "rulesOut": ["vk"]}
    ],
    "imperative negative": [
        {"kanaIn": "な", "kanaOut": "", "rulesIn": [], "rulesOut": ["v1", "v5", "vk", "vs", "vz"]}
    ],
    "masu stem": [
        {"kanaIn": "い", "kanaOut": "いる", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "え", "kanaOut": "える", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "き", "kanaOut": "きる", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "ぎ", "kanaOut": "ぎる", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "け", "kanaOut": "ける", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "げ", "kanaOut": "げる", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "じ", "kanaOut": "じる", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "せ", "kanaOut": "せる", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "ぜ", "kanaOut": "ぜる", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "ち", "kanaOut": "ちる", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "て", "kanaOut": "てる", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "で", "kanaOut": "でる", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "に", "kanaOut": "にる", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "ね", "kanaOut": "ねる", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "ひ", "kanaOut": "ひる", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "び", "kanaOut": "びる", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "へ", "kanaOut": "へる", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "べ", "kanaOut": "べる", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "み", "kanaOut": "みる", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "め", "kanaOut": "める", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "り", "kanaOut": "りる", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "れ", "kanaOut": "れる", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "い", "kanaOut": "う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "き", "kanaOut": "く", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ぎ", "kanaOut": "ぐ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "し", "kanaOut": "す", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ち", "kanaOut": "つ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "に", "kanaOut": "ぬ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "び", "kanaOut": "ぶ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "み", "kanaOut": "む", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "り", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "き", "kanaOut": "くる", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "来", "kanaOut": "来る", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "來", "kanaOut": "來る", "rulesIn": [], "rulesOut": ["vk"]}
    ],
    "negative": [
        {"kanaIn": "くない", "kanaOut": "い", "rulesIn": ["adj-i"], "rulesOut": ["adj-i"]},
        {"kanaIn": "ない", "kanaOut": "る", "rulesIn": ["adj-i"], "rulesOut": ["v1"]},
        {"kanaIn": "かない", "kanaOut": "く", "rulesIn": ["adj-i"], "rulesOut": ["v5"]},
        {"kanaIn": "がない", "kanaOut": "ぐ", "rulesIn": ["adj-i"], "rulesOut": ["v5"]},
        {"kanaIn": "さない", "kanaOut": "す", "rulesIn": ["adj-i"], "rulesOut": ["v5"]},
        {"kanaIn": "たない", "kanaOut": "つ", "rulesIn": ["adj-i"], "rulesOut": ["v5"]},
        {"kanaIn": "なない", "kanaOut": "ぬ", "rulesIn": ["adj-i"], "rulesOut": ["v5"]},
        {"kanaIn": "ばない", "kanaOut": "ぶ", "rulesIn": ["adj-i"], "rulesOut": ["v5"]},
        {"kanaIn": "まない", "kanaOut": "む", "rulesIn": ["adj-i"], "rulesOut": ["v5"]},
        {"kanaIn": "らない", "kanaOut": "る", "rulesIn": ["adj-i"], "rulesOut": ["v5"]},
        {"kanaIn": "わない", "kanaOut": "う", "rulesIn": ["adj-i"], "rulesOut": ["v5"]},
        {"kanaIn": "じない", "kanaOut": "ずる", "rulesIn": ["adj-i"], "rulesOut": ["vz"]},
        {"kanaIn": "しない", "kanaOut": "する", "rulesIn": ["adj-i"], "rulesOut": ["vs"]},
        {"kanaIn": "為ない", "kanaOut": "為る", "rulesIn": ["adj-i"], "rulesOut": ["vs"]},
        {"kanaIn": "こない", "kanaOut": "くる", "rulesIn": ["adj-i"], "rulesOut": ["vk"]},
        {"kanaIn": "来ない", "kanaOut": "来る", "rulesIn": ["adj-i"], "rulesOut": ["vk"]},
        {"kanaIn": "來ない", "kanaOut": "來る", "rulesIn": ["adj-i"], "rulesOut": ["vk"]}
    ],
    "noun": [
        {"kanaIn": "さ", "kanaOut": "い", "rulesIn": [], "rulesOut": ["adj-i"]}
    ],
    "passive": [
        {"kanaIn": "かれる", "kanaOut": "く", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "がれる", "kanaOut": "ぐ", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "される", "kanaOut": "す", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "たれる", "kanaOut": "つ", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "なれる", "kanaOut": "ぬ", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "ばれる", "kanaOut": "ぶ", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "まれる", "kanaOut": "む", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "われる", "kanaOut": "う", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "られる", "kanaOut": "る", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "じされる", "kanaOut": "ずる", "rulesIn": ["v1"], "rulesOut": ["vz"]},
        {"kanaIn": "ぜされる", "kanaOut": "ずる", "rulesIn": ["v1"], "rulesOut": ["vz"]},
        {"kanaIn": "される", "kanaOut": "する", "rulesIn": ["v1"], "rulesOut": ["vs"]},
        {"kanaIn": "為れる", "kanaOut": "為る", "rulesIn": ["v1"], "rulesOut": ["vs"]},
        {"kanaIn": "こられる", "kanaOut": "くる", "rulesIn": ["v1"], "rulesOut": ["vk"]},
        {"kanaIn": "来られる", "kanaOut": "来る", "rulesIn": ["v1"], "rulesOut": ["vk"]},
        {"kanaIn": "來られる", "kanaOut": "來る", "rulesIn": ["v1"], "rulesOut": ["vk"]}
    ],
    "past": [
        {"kanaIn": "かった", "kanaOut": "い", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "た", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "いた", "kanaOut": "く", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "いだ", "kanaOut": "ぐ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "した", "kanaOut": "す", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "った", "kanaOut": "う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "った", "kanaOut": "つ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "った", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "んだ", "kanaOut": "ぬ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "んだ", "kanaOut": "ぶ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "んだ", "kanaOut": "む", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "じた", "kanaOut": "ずる", "rulesIn": [], "rulesOut": ["vz"]},
        {"kanaIn": "した", "kanaOut": "する", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "為た", "kanaOut": "為る", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "きた", "kanaOut": "くる", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "来た", "kanaOut": "来る", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "來た", "kanaOut": "來る", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "いった", "kanaOut": "いく", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "おうた", "kanaOut": "おう", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "こうた", "kanaOut": "こう", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "そうた", "kanaOut": "そう", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "とうた", "kanaOut": "とう", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "行った", "kanaOut": "行く", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "逝った", "kanaOut": "逝く", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "往った", "kanaOut": "往く", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "請うた", "kanaOut": "請う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "乞うた", "kanaOut": "乞う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "恋うた", "kanaOut": "恋う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "問うた", "kanaOut": "問う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "負うた", "kanaOut": "負う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "沿うた", "kanaOut": "沿う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "添うた", "kanaOut": "添う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "副うた", "kanaOut": "副う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "厭うた", "kanaOut": "厭う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "のたもうた", "kanaOut": "のたまう", "rulesIn": [], "rulesOut": ["v5"]}
    ],
    "polite": [
        {"kanaIn": "ます", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "います", "kanaOut": "う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "きます", "kanaOut": "く", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ぎます", "kanaOut": "ぐ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "します", "kanaOut": "す", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ちます", "kanaOut": "つ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "にます", "kanaOut": "ぬ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "びます", "kanaOut": "ぶ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "みます", "kanaOut": "む", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ります", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "じます", "kanaOut": "ずる", "rulesIn": [], "rulesOut": ["vz"]},
        {"kanaIn": "します", "kanaOut": "する", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "為ます", "kanaOut": "為る", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "きます", "kanaOut": "くる", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "来ます", "kanaOut": "来る", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "來ます", "kanaOut": "來る", "rulesIn": [], "rulesOut": ["vk"]}
    ],
    "polite negative": [
        {"kanaIn": "くありません", "kanaOut": "い", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "ません", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "いません", "kanaOut": "う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "きません", "kanaOut": "く", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ぎません", "kanaOut": "ぐ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "しません", "kanaOut": "す", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ちません", "kanaOut": "つ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "にません", "kanaOut": "ぬ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "びません", "kanaOut": "ぶ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "みません", "kanaOut": "む", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "りません", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "じません", "kanaOut": "ずる", "rulesIn": [], "rulesOut": ["vz"]},
        {"kanaIn": "しません", "kanaOut": "する", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "為ません", "kanaOut": "為る", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "きません", "kanaOut": "くる", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "来ません", "kanaOut": "来る", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "來ません", "kanaOut": "來る", "rulesIn": [], "rulesOut": ["vk"]}
    ],
    "polite past": [
        {"kanaIn": "ました", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "いました", "kanaOut": "う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "きました", "kanaOut": "く", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ぎました", "kanaOut": "ぐ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "しました", "kanaOut": "す", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ちました", "kanaOut": "つ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "にました", "kanaOut": "ぬ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "びました", "kanaOut": "ぶ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "みました", "kanaOut": "む", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "りました", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "じました", "kanaOut": "ずる", "rulesIn": [], "rulesOut": ["vz"]},
        {"kanaIn": "しました", "kanaOut": "する", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "為ました", "kanaOut": "為る", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "きました", "kanaOut": "くる", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "来ました", "kanaOut": "来る", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "來ました", "kanaOut": "來る", "rulesIn": [], "rulesOut": ["vk"]}
    ],
    "polite past negative": [
        {"kanaIn": "くありませんでした", "kanaOut": "い", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "ませんでした", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "いませんでした", "kanaOut": "う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "きませんでした", "kanaOut": "く", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ぎませんでした", "kanaOut": "ぐ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "しませんでした", "kanaOut": "す", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ちませんでした", "kanaOut": "つ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "にませんでした", "kanaOut": "ぬ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "びませんでした", "kanaOut": "ぶ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "みませんでした", "kanaOut": "む", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "りませんでした", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "じませんでした", "kanaOut": "ずる", "rulesIn": [], "rulesOut": ["vz"]},
        {"kanaIn": "しませんでした", "kanaOut": "する", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "為ませんでした", "kanaOut": "為る", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "きませんでした", "kanaOut": "くる", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "来ませんでした", "kanaOut": "来る", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "來ませんでした", "kanaOut": "來る", "rulesIn": [], "rulesOut": ["vk"]}
    ],
    "polite volitional": [
        {"kanaIn": "ましょう", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "いましょう", "kanaOut": "う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "きましょう", "kanaOut": "く", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ぎましょう", "kanaOut": "ぐ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "しましょう", "kanaOut": "す", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ちましょう", "kanaOut": "つ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "にましょう", "kanaOut": "ぬ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "びましょう", "kanaOut": "ぶ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "みましょう", "kanaOut": "む", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "りましょう", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "じましょう", "kanaOut": "ずる", "rulesIn": [], "rulesOut": ["vz"]},
        {"kanaIn": "しましょう", "kanaOut": "する", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "為ましょう", "kanaOut": "為る", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "きましょう", "kanaOut": "くる", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "来ましょう", "kanaOut": "来る", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "來ましょう", "kanaOut": "來る", "rulesIn": [], "rulesOut": ["vk"]}
    ],
    "potential": [
        {"kanaIn": "れる", "kanaOut": "る", "rulesIn": ["v1"], "rulesOut": ["v1", "v5"]},
        {"kanaIn": "える", "kanaOut": "う", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "ける", "kanaOut": "く", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "げる", "kanaOut": "ぐ", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "せる", "kanaOut": "す", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "てる", "kanaOut": "つ", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "ねる", "kanaOut": "ぬ", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "べる", "kanaOut": "ぶ", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "める", "kanaOut": "む", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "これる", "kanaOut": "くる", "rulesIn": ["v1"], "rulesOut": ["vk"]},
        {"kanaIn": "来れる", "kanaOut": "来る", "rulesIn": ["v1"], "rulesOut": ["vk"]},
        {"kanaIn": "來れる", "kanaOut": "來る", "rulesIn": ["v1"], "rulesOut": ["vk"]}
    ],
    "potential or passive": [
        {"kanaIn": "られる", "kanaOut": "る", "rulesIn": ["v1"], "rulesOut": ["v1"]},
        {"kanaIn": "ざれる", "kanaOut": "ずる", "rulesIn": ["v1"], "rulesOut": ["vz"]},
        {"kanaIn": "ぜられる", "kanaOut": "ずる", "rulesIn": ["v1"], "rulesOut": ["vz"]},
        {"kanaIn": "せられる", "kanaOut": "する", "rulesIn": ["v1"], "rulesOut": ["vs"]},
        {"kanaIn": "為られる", "kanaOut": "為る", "rulesIn": ["v1"], "rulesOut": ["vs"]},
        {"kanaIn": "こられる", "kanaOut": "くる", "rulesIn": ["v1"], "rulesOut": ["vk"]},
        {"kanaIn": "来られる", "kanaOut": "来る", "rulesIn": ["v1"], "rulesOut": ["vk"]},
        {"kanaIn": "來られる", "kanaOut": "來る", "rulesIn": ["v1"], "rulesOut": ["vk"]}
    ],
    "volitional": [
        {"kanaIn": "よう", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v1"]},
        {"kanaIn": "おう", "kanaOut": "う", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "こう", "kanaOut": "く", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ごう", "kanaOut": "ぐ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "そう", "kanaOut": "す", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "とう", "kanaOut": "つ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "のう", "kanaOut": "ぬ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ぼう", "kanaOut": "ぶ", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "もう", "kanaOut": "む", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "ろう", "kanaOut": "る", "rulesIn": [], "rulesOut": ["v5"]},
        {"kanaIn": "じよう", "kanaOut": "ずる", "rulesIn": [], "rulesOut": ["vz"]},
        {"kanaIn": "しよう", "kanaOut": "する", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "為よう", "kanaOut": "為る", "rulesIn": [], "rulesOut": ["vs"]},
        {"kanaIn": "こよう", "kanaOut": "くる", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "来よう", "kanaOut": "来る", "rulesIn": [], "rulesOut": ["vk"]},
        {"kanaIn": "來よう", "kanaOut": "來る", "rulesIn": [], "rulesOut": ["vk"]}
    ],
    "causative passive": [
        {"kanaIn": "かされる", "kanaOut": "く", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "がされる", "kanaOut": "ぐ", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "たされる", "kanaOut": "つ", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "なされる", "kanaOut": "ぬ", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "ばされる", "kanaOut": "ぶ", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "まされる", "kanaOut": "む", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "らされる", "kanaOut": "る", "rulesIn": ["v1"], "rulesOut": ["v5"]},
        {"kanaIn": "わされる", "kanaOut": "う", "rulesIn": ["v1"], "rulesOut": ["v5"]}
    ],
    "-toku": [
        {"kanaIn": "とく", "kanaOut": "る", "rulesIn": ["v5"], "rulesOut": ["v1"]},
        {"kanaIn": "いとく", "kanaOut": "く", "rulesIn": ["v5"], "rulesOut": ["v5"]},
        {"kanaIn": "いどく", "kanaOut": "ぐ", "rulesIn": ["v5"], "rulesOut": ["v5"]},
        {"kanaIn": "しとく", "kanaOut": "す", "rulesIn": ["v5"], "rulesOut": ["v5"]},
        {"kanaIn": "っとく", "kanaOut": "う", "rulesIn": ["v5"], "rulesOut": ["v5"]},
        {"kanaIn": "っとく", "kanaOut": "つ", "rulesIn": ["v5"], "rulesOut": ["v5"]},
        {"kanaIn": "っとく", "kanaOut": "る", "rulesIn": ["v5"], "rulesOut": ["v5"]},
        {"kanaIn": "んどく", "kanaOut": "ぬ", "rulesIn": ["v5"], "rulesOut": ["v5"]},
        {"kanaIn": "んどく", "kanaOut": "ぶ", "rulesIn": ["v5"], "rulesOut": ["v5"]},
        {"kanaIn": "んどく", "kanaOut": "む", "rulesIn": ["v5"], "rulesOut": ["v5"]},
        {"kanaIn": "じとく", "kanaOut": "ずる", "rulesIn": ["v5"], "rulesOut": ["vz"]},
        {"kanaIn": "しとく", "kanaOut": "する", "rulesIn": ["v5"], "rulesOut": ["vs"]},
        {"kanaIn": "為とく", "kanaOut": "為る", "rulesIn": ["v5"], "rulesOut": ["vs"]},
        {"kanaIn": "きとく", "kanaOut": "くる", "rulesIn": ["v5"], "rulesOut": ["vk"]},
        {"kanaIn": "来とく", "kanaOut": "来る", "rulesIn": ["v5"], "rulesOut": ["vk"]},
        {"kanaIn": "來とく", "kanaOut": "來る", "rulesIn": ["v5"], "rulesOut": ["vk"]}
    ],
    "progressive or perfect": [
        {"kanaIn": "ている", "kanaOut": "て", "rulesIn": ["v1"], "rulesOut": ["iru"]},
        {"kanaIn": "ておる", "kanaOut": "て", "rulesIn": ["v5"], "rulesOut": ["iru"]},
        {"kanaIn": "てる", "kanaOut": "て", "rulesIn": ["v1"], "rulesOut": ["iru"]},
        {"kanaIn": "でいる", "kanaOut": "で", "rulesIn": ["v1"], "rulesOut": ["iru"]},
        {"kanaIn": "でおる", "kanaOut": "で", "rulesIn": ["v5"], "rulesOut": ["iru"]},
        {"kanaIn": "でる", "kanaOut": "で", "rulesIn": ["v1"], "rulesOut": ["iru"]},
        {"kanaIn": "とる", "kanaOut": "て", "rulesIn": ["v5"], "rulesOut": ["iru"]},
        {"kanaIn": "ないでいる", "kanaOut": "ない", "rulesIn": ["v1"], "rulesOut": ["adj-i"]}
    ],
    "-ki": [
        {"kanaIn": "き", "kanaOut": "い", "rulesIn": [], "rulesOut": ["adj-i"]}
    ],
    "-ge": [
        {"kanaIn": "しげ", "kanaOut": "しい", "rulesIn": [], "rulesOut": ["adj-i"]}
    ],
    "-e": [
        {"kanaIn": "ねえ", "kanaOut": "ない", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "めえ", "kanaOut": "むい", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "みい", "kanaOut": "むい", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "ちぇえ", "kanaOut": "つい", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "ちい", "kanaOut": "つい", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "せえ", "kanaOut": "すい", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "ええ", "kanaOut": "いい", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "ええ", "kanaOut": "わい", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "ええ", "kanaOut": "よい", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "いぇえ", "kanaOut": "よい", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "うぇえ", "kanaOut": "わい", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "けえ", "kanaOut": "かい", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "げえ", "kanaOut": "がい", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "げえ", "kanaOut": "ごい", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "せえ", "kanaOut": "さい", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "めえ", "kanaOut": "まい", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "ぜえ", "kanaOut": "ずい", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "っぜえ", "kanaOut": "ずい", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "れえ", "kanaOut": "らい", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "れえ", "kanaOut": "らい", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "ちぇえ", "kanaOut": "ちゃい", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "でえ", "kanaOut": "どい", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "れえ", "kanaOut": "れい", "rulesIn": [], "rulesOut": ["adj-i"]},
        {"kanaIn": "べえ", "kanaOut": "ばい", "rulesIn": [], "rulesOut": ["adj-i"]}
    ]
}
;

  // --- Yomitan Deinflector ---
  /*
 * Copyright (C) 2016-2022  Yomichan Authors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

class Deinflector {
    constructor(reasons) {
        this.reasons = Deinflector.normalizeReasons(reasons);
    }

    deinflect(source) {
        const results = [this._createDeinflection(source, 0, [])];
        for (let i = 0; i < results.length; ++i) {
            const {rules, term, reasons} = results[i];
            for (const [reason, variants] of this.reasons) {
                for (const [kanaIn, kanaOut, rulesIn, rulesOut] of variants) {
                    if (
                        (rules !== 0 && (rules & rulesIn) === 0) ||
                        !term.endsWith(kanaIn) ||
                        (term.length - kanaIn.length + kanaOut.length) <= 0
                    ) {
                        continue;
                    }

                    results.push(this._createDeinflection(
                        term.substring(0, term.length - kanaIn.length) + kanaOut,
                        rulesOut,
                        [reason, ...reasons]
                    ));
                }
            }
        }
        return results;
    }

    _createDeinflection(term, rules, reasons) {
        return {term, rules, reasons};
    }

    static normalizeReasons(reasons) {
        const normalizedReasons = [];
        for (const [reason, reasonInfo] of Object.entries(reasons)) {
            const variants = [];
            for (const {kanaIn, kanaOut, rulesIn, rulesOut} of reasonInfo) {
                variants.push([
                    kanaIn,
                    kanaOut,
                    this.rulesToRuleFlags(rulesIn),
                    this.rulesToRuleFlags(rulesOut)
                ]);
            }
            normalizedReasons.push([reason, variants]);
        }
        return normalizedReasons;
    }

    static rulesToRuleFlags(rules) {
        const ruleTypes = this._ruleTypes;
        let value = 0;
        for (const rule of rules) {
            const ruleBits = ruleTypes.get(rule);
            if (typeof ruleBits === 'undefined') { continue; }
            value |= ruleBits;
        }
        return value;
    }
}

// eslint-disable-next-line no-underscore-dangle
Deinflector._ruleTypes = new Map([
    ['v1',    0b00000001], // Verb ichidan
    ['v5',    0b00000010], // Verb godan
    ['vs',    0b00000100], // Verb suru
    ['vk',    0b00001000], // Verb kuru
    ['vz',    0b00010000], // Verb zuru
    ['adj-i', 0b00100000], // Adjective i
    ['iru',   0b01000000] // Intermediate -iru endings for progressive or perfect tense
]);

  // --- English Lemmatizer ---
  /**
 * Lightweight English Lemmatizer for Kiki Immersion
 * Handles plural nouns, verb conjugations (-ed, -ing, -s), and common irregular verbs.
 */
class EnglishLemmatizer {
    constructor() {
        this.irregulars = new Map([
            // Common irregular verbs: [form, base, reason]
            ['am', 'be'], ['is', 'be'], ['are', 'be'], ['was', 'be'], ['were', 'be'], ['been', 'be'], ['being', 'be'],
            ['has', 'have'], ['had', 'have'], ['having', 'have'],
            ['does', 'do'], ['did', 'do'], ['done', 'do'], ['doing', 'do'],
            ['goes', 'go'], ['went', 'go'], ['gone', 'go'], ['going', 'go'],
            ['says', 'say'], ['said', 'say'],
            ['makes', 'make'], ['made', 'make'],
            ['knows', 'know'], ['knew', 'know'], ['known', 'know'],
            ['thinks', 'think'], ['thought', 'think'],
            ['takes', 'take'], ['took', 'take'], ['taken', 'take'],
            ['sees', 'see'], ['saw', 'see'], ['seen', 'see'],
            ['comes', 'come'], ['came', 'come'],
            ['finds', 'find'], ['found', 'find'],
            ['gives', 'give'], ['gave', 'give'], ['given', 'give'],
            ['tells', 'tell'], ['told', 'tell'],
            ['feels', 'feel'], ['felt', 'feel'],
            ['becomes', 'become'], ['became', 'become'],
            ['leaves', 'leave'], ['left', 'leave'],
            ['puts', 'put'],
            ['means', 'mean'], ['meant', 'mean'],
            ['keeps', 'keep'], ['kept', 'keep'],
            ['lets', 'let'],
            ['begins', 'begin'], ['began', 'begin'], ['begun', 'begin'],
            ['seems', 'seem'],
            ['helps', 'help'],
            ['shows', 'show'], ['showed', 'show'], ['shown', 'show'],
            ['hears', 'hear'], ['heard', 'hear'],
            ['plays', 'play'],
            ['runs', 'run'], ['ran', 'run'],
            ['moves', 'move'],
            ['likes', 'like'],
            ['lives', 'live'],
            ['believes', 'believe'],
            ['holds', 'hold'], ['held', 'hold'],
            ['brings', 'bring'], ['brought', 'bring'],
            ['happens', 'happen'],
            ['writes', 'write'], ['wrote', 'write'], ['written', 'write'],
            ['provides', 'provide'],
            ['sits', 'sit'], ['sat', 'sit'],
            ['stands', 'stand'], ['stood', 'stand'],
            ['loses', 'lose'], ['lost', 'lose'],
            ['pays', 'pay'], ['paid', 'pay'],
            ['meets', 'meet'], ['met', 'meet'],
            ['includes', 'include'],
            ['continues', 'continue'],
            ['sets', 'set'],
            ['learns', 'learn'], ['learnt', 'learn'],
            ['leads', 'lead'], ['led', 'lead'],
            ['understands', 'understand'], ['understood', 'understand'],
            ['watches', 'watch'],
            ['follows', 'follow'],
            ['stops', 'stop'],
            ['creates', 'create'],
            ['speaks', 'speak'], ['spoke', 'speak'], ['spoken', 'speak'],
            ['reads', 'read'],
            ['spends', 'spend'], ['spent', 'spend'],
            ['grows', 'grow'], ['grew', 'grow'], ['grown', 'grow'],
            ['opens', 'open'],
            ['walks', 'walk'],
            ['wins', 'win'], ['won', 'win'],
            ['offers', 'offer'],
            ['remembers', 'remember'],
            ['loves', 'love'],
            ['considers', 'consider'],
            ['appears', 'appear'],
            ['buys', 'buy'], ['bought', 'buy'],
            ['serves', 'serve'],
            ['dies', 'die'], ['died', 'die'], ['dying', 'die'],
            ['sends', 'send'], ['sent', 'send'],
            ['expects', 'expect'],
            ['builds', 'build'], ['built', 'build'],
            ['stays', 'stay'],
            ['falls', 'fall'], ['fell', 'fall'], ['fallen', 'fall'],
            ['cuts', 'cut'],
            ['reaches', 'reach'],
            ['kills', 'kill'],
            ['remains', 'remain'],
            ['eats', 'eat'], ['ate', 'eat'], ['eaten', 'eat'],
            ['drives', 'drive'], ['drove', 'drive'], ['driven', 'drive'],
            ['breaks', 'break'], ['broke', 'break'], ['broken', 'break'],
            ['chooses', 'choose'], ['chose', 'choose'], ['chosen', 'choose'],
            ['catches', 'catch'], ['caught', 'catch'],
            ['teaches', 'teach'], ['taught', 'teach'],
            ['sleeps', 'sleep'], ['slept', 'sleep'],
            ['drinks', 'drink'], ['drank', 'drink'], ['drunk', 'drink'],
            ['flies', 'fly'], ['flew', 'fly'], ['flown', 'fly'],
            ['swims', 'swim'], ['swam', 'swim'], ['swum', 'swim'],
            ['lies', 'lie'], ['lay', 'lie'], ['lain', 'lie'],
            ['wears', 'wear'], ['wore', 'wear'], ['worn', 'wear'],
            ['forgets', 'forget'], ['forgot', 'forget'], ['forgotten', 'forget'],
            ['bites', 'bite'], ['bit', 'bite'], ['bitten', 'bite'],
            ['hides', 'hide'], ['hid', 'hide'], ['hidden', 'hide'],
            ['rides', 'ride'], ['rode', 'ride'], ['ridden', 'ride'],
            ['shakes', 'shake'], ['shook', 'shake'], ['shaken', 'shake'],
            ['sings', 'sing'], ['sang', 'sing'], ['sung', 'sing'],
            ['rings', 'ring'], ['rang', 'ring'], ['rung', 'ring'],
            ['throws', 'throw'], ['threw', 'throw'], ['thrown', 'throw'],
            ['wakes', 'wake'], ['woke', 'wake'], ['woken', 'wake'],
            ['draws', 'draw'], ['drew', 'draw'], ['drawn', 'draw']
        ]);
    }

    /**
     * Lemmatize an English word
     * @param {string} rawWord
     * @returns {Array<{ term: string, reason: string }>}
     */
    lemmatize(rawWord) {
        if (!rawWord || typeof rawWord !== 'string') return [];
        const word = rawWord.toLowerCase().trim();
        if (!word) return [];

        const candidates = [];
        const seen = new Set();

        const add = (term, reason) => {
            if (term && term.length >= 2 && !seen.has(term)) {
                seen.add(term);
                candidates.push({ term, reason });
            }
        };

        // 1. Exact form
        add(word, 'exact');

        // Possessive 's / ’s (mom's -> mom, mums' -> mums)
        if (word.endsWith("'s") || word.endsWith("’s")) {
            add(word.slice(0, -2), 'possessive');
        }
        if (word.endsWith("'") || word.endsWith("’")) {
            add(word.slice(0, -1), 'possessive');
        }

        // 2. Irregular table lookup
        const irregularBase = this.irregulars.get(word);
        if (irregularBase) {
            add(irregularBase, 'irregular');
        }

        // 3. Regular rules
        // -ies -> -y (studies -> study, babies -> baby)
        if (word.endsWith('ies') && word.length > 4) {
            add(word.slice(0, -3) + 'y', 'plural/3sg');
        }

        // -es (boxes -> box, watches -> watch, passes -> pass)
        if (word.endsWith('es') && word.length > 3) {
            if (/(?:ch|sh|ss|x|z)es$/.test(word)) {
                add(word.slice(0, -2), 'plural/3sg');
            }
        }

        // -s (tests -> test, books -> book)
        if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) {
            add(word.slice(0, -1), 'plural/3sg');
        }

        // -ed (tested -> test, liked -> like, stopped -> stop, studied -> study)
        if (word.endsWith('ed') && word.length > 3) {
            if (word.endsWith('ied') && word.length > 4) {
                add(word.slice(0, -3) + 'y', 'past');
            }
            // stopped -> stop
            if (/([bdfgklmnprstz])\1ed$/.test(word)) {
                add(word.slice(0, -3), 'past');
            }
            // liked -> like
            add(word.slice(0, -1), 'past');
            // tested -> test
            add(word.slice(0, -2), 'past');
        }

        // -ing (testing -> test, taking -> take, running -> run)
        if (word.endsWith('ing') && word.length > 4) {
            // running -> run
            if (/([bdfgklmnprstz])\1ing$/.test(word)) {
                add(word.slice(0, -4), 'participle');
            }
            // taking -> take
            add(word.slice(0, -3) + 'e', 'participle');
            // testing -> test
            add(word.slice(0, -3), 'participle');
        }

        // -er / -est (faster -> fast, biggest -> big)
        if (word.endsWith('er') && word.length > 4) {
            add(word.slice(0, -2), 'comparative');
            add(word.slice(0, -1), 'comparative');
        }
        if (word.endsWith('est') && word.length > 5) {
            add(word.slice(0, -3), 'superlative');
            add(word.slice(0, -2), 'superlative');
        }

        return candidates;
    }
}

window.EnglishLemmatizer = EnglishLemmatizer;

  // --- First-Party IndexedDB Manager ---
  /**
 * IndexedDB Database Manager for Kiki Immersion Yomitan Dictionaries
 */
class KikiDictDB {
    constructor() {
        this.dbName = 'KikiImmersionDB';
        this.version = 1;
        this.db = null;
    }

    async open() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Dictionary metadata store
                if (!db.objectStoreNames.contains('dictionaries')) {
                    db.createObjectStore('dictionaries', { keyPath: 'id' });
                }

                // Terms store
                if (!db.objectStoreNames.contains('terms')) {
                    const termStore = db.createObjectStore('terms', { keyPath: 'id', autoIncrement: true });
                    termStore.createIndex('term', 'term', { unique: false });
                    termStore.createIndex('reading', 'reading', { unique: false });
                    termStore.createIndex('dictId', 'dictId', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    /**
     * Get all installed dictionaries metadata
     */
    async getDictionaries() {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('dictionaries', 'readonly');
            const store = tx.objectStore('dictionaries');
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Save or update dictionary metadata
     */
    async saveDictionary(meta) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('dictionaries', 'readwrite');
            const store = tx.objectStore('dictionaries');
            const req = store.put(meta);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Toggle dictionary active state
     */
    async toggleDictionary(id, enabled) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('dictionaries', 'readwrite');
            const store = tx.objectStore('dictionaries');
            const getReq = store.get(id);
            getReq.onsuccess = () => {
                const dict = getReq.result;
                if (!dict) return reject(new Error('Dictionary not found'));
                dict.enabled = enabled;
                const putReq = store.put(dict);
                putReq.onsuccess = () => resolve(dict);
                putReq.onerror = () => reject(putReq.error);
            };
            getReq.onerror = () => reject(getReq.error);
        });
    }

    /**
     * Batch insert terms into terms store
     * @param {string} dictId 
     * @param {Array} rawEntries Yomitan Format 3 term records
     * @param {number} batchSize Chunk size for write transaction
     */
    async addTermsBatch(dictId, rawEntries, batchSize = 1500) {
        const db = await this.open();

        for (let i = 0; i < rawEntries.length; i += batchSize) {
            const chunk = rawEntries.slice(i, i + batchSize);
            await new Promise((resolve, reject) => {
                const tx = db.transaction('terms', 'readwrite');
                const store = tx.objectStore('terms');

                for (let j = 0; j < chunk.length; j++) {
                    const row = chunk[j];
                    store.add({
                        dictId: dictId,
                        term: (row[0] || '').toString(),
                        reading: (row[1] || '').toString(),
                        defTags: row[2] || '',
                        rules: row[3] || '',
                        score: typeof row[4] === 'number' ? row[4] : 0,
                        glossary: Array.isArray(row[5]) ? row[5] : [row[5]],
                        seq: row[6] || 0,
                        termTags: row[7] || ''
                    });
                }

                tx.oncomplete = () => resolve();
                tx.onerror = (e) => reject(e.target.error);
            });
        }
    }

    /**
     * Delete a dictionary and cascade remove all related terms
     */
    async deleteDictionary(dictId, onProgress) {
        const db = await this.open();

        // 1. Delete metadata
        await new Promise((resolve, reject) => {
            const tx = db.transaction('dictionaries', 'readwrite');
            const req = tx.objectStore('dictionaries').delete(dictId);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });

        // 2. Cascade delete from terms
        return new Promise((resolve, reject) => {
            const tx = db.transaction('terms', 'readwrite');
            const store = tx.objectStore('terms');
            const index = store.index('dictId');
            const range = IDBKeyRange.only(dictId);
            const req = index.openKeyCursor(range);

            let deletedCount = 0;
            req.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    store.delete(cursor.primaryKey);
                    deletedCount++;
                    if (deletedCount % 2000 === 0 && onProgress) {
                        onProgress(deletedCount);
                    }
                    cursor.continue();
                } else {
                    if (onProgress) onProgress(deletedCount);
                    resolve(deletedCount);
                }
            };

            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Query terms by exact term string
     */
    async getTermsByTerm(term) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('terms', 'readonly');
            const store = tx.objectStore('terms');
            const index = store.index('term');
            const req = index.getAll(term);
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Query all custom CSS from active dictionaries
     */
    async getActiveStyles() {
        const dicts = await this.getDictionaries();
        return dicts
            .filter(d => d.enabled && d.css)
            .map(d => `/* Dictionary: ${d.title} */\n${d.css}`)
            .join('\n\n');
    }

    /**
     * Clear all dictionary data, terms, and web storage
     */
    async clearAllStorage() {
        try {
            if (this.db) {
                this.db.close();
                this.db = null;
            }
            await new Promise((resolve, reject) => {
                const req = indexedDB.deleteDatabase(this.dbName);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
                req.onblocked = () => resolve();
            });
            try { localStorage.clear(); } catch (e) {}
            try { sessionStorage.clear(); } catch (e) {}
            return true;
        } catch (e) {
            console.error('[clearAllStorage error]', e);
            throw e;
        }
    }
}

window.KikiDictDB = KikiDictDB;

  // --- Yomitan Search Engine ---
  /**
 * Multi-Language Search Engine (English Lemmatizer + Japanese Deinflector + Yomitan Redirect Resolver)
 */
class KikiSearchEngine {
    constructor(db, deinflector, englishLemmatizer) {
        this.db = db;
        this.deinflector = deinflector;
        this.englishLemmatizer = englishLemmatizer;
        this.dictCache = null;
    }

    async refreshDictCache() {
        const dicts = await this.db.getDictionaries();
        const map = new Map();
        for (const d of dicts) {
            map.set(d.id, d);
        }
        this.dictCache = map;
        return map;
    }

    /**
     * Check if a glossary entry is a Yomitan redirect pointer: ["targetTerm", ["redirect"]]
     * @param {Object} entry 
     * @returns {string|null} Target term if redirect, else null
     */
    static getRedirectTarget(entry) {
        if (!entry || !Array.isArray(entry.glossary) || entry.glossary.length === 0) {
            return null;
        }

        const firstItem = entry.glossary[0];
        // Yomitan redirect format: [targetTerm, [tag1, tag2...]]
        if (Array.isArray(firstItem) && typeof firstItem[0] === 'string' && firstItem.length >= 2) {
            const tags = firstItem[1];
            if (Array.isArray(tags)) {
                if (tags.includes('redirect') || tags.includes('see') || (entry.defTags && entry.defTags.includes('non-lemma'))) {
                    return firstItem[0];
                }
            }
        }
        return null;
    }

    /**
     * Look up word or phrase with morphological reduction and redirect resolution
     * @param {string} text Target term or phrase to search
     * @returns {Promise<Array>} List of resolved entries with full rich content
     */
    async search(text) {
        if (!text || typeof text !== 'string') return [];
        const cleanText = text.trim();
        if (!cleanText) return [];

        if (!this.dictCache) {
            await this.refreshDictCache();
        }

        const enabledDicts = new Map();
        for (const [id, dict] of this.dictCache.entries()) {
            if (dict.enabled) {
                enabledDicts.set(id, dict);
            }
        }

        if (enabledDicts.size === 0) {
            return [];
        }

        // Generate candidate terms
        const candidates = [];
        const seenCandidates = new Set();

        const addCandidate = (term, reason = '', rules = 0, isOriginal = false) => {
            if (!term) return;
            const key = `${term.toLowerCase()}:${rules}`;
            if (!seenCandidates.has(key)) {
                seenCandidates.add(key);
                candidates.push({ term, reason, rules, isOriginal });
            }
        };

        // 1. Exact raw text
        addCandidate(cleanText, '', 0, true);

        // 2. Phrase normalization (space <-> hyphen, and collapsed)
        if (cleanText.includes(' ')) {
            addCandidate(cleanText.replace(/\s+/g, '-'), 'hyphenated', 0, false);
            addCandidate(cleanText.replace(/\s+/g, ''), 'collapsed', 0, false);
        } else if (cleanText.includes('-')) {
            addCandidate(cleanText.replace(/-/g, ' '), 'spaced', 0, false);
            addCandidate(cleanText.replace(/-/g, ''), 'collapsed', 0, false);
        }

        // 3. English Lemmatization (if English characters present)
        if (this.englishLemmatizer && /[a-zA-Z]/.test(cleanText)) {
            const lemmatized = this.englishLemmatizer.lemmatize(cleanText);
            for (const item of lemmatized) {
                addCandidate(item.term, item.reason === 'exact' ? '' : item.reason, 0, item.reason === 'exact');
            }
        }

        // 4. Japanese Deinflection (if Kana/Kanji present)
        if (this.deinflector && /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(cleanText)) {
            const deinflections = this.deinflector.deinflect(cleanText);
            for (const item of deinflections) {
                addCandidate(item.term, (item.reasons || []).join(' ← '), item.rules || 0, !item.reasons || item.reasons.length === 0);
            }
        }

        // 5. Query IndexedDB for all candidates concurrently
        const queries = candidates.map(c => this.db.getTermsByTerm(c.term));
        const lowerQueries = candidates.map(c => {
            const lower = c.term.toLowerCase();
            return lower !== c.term ? this.db.getTermsByTerm(lower) : Promise.resolve([]);
        });

        const [resultsExact, resultsLower] = await Promise.all([
            Promise.all(queries),
            Promise.all(lowerQueries)
        ]);

        const rawResults = [];
        const seenKeys = new Set();

        for (let i = 0; i < candidates.length; i++) {
            const candidate = candidates[i];
            const entries = [...resultsExact[i], ...resultsLower[i]];

            for (const entry of entries) {
                const dict = enabledDicts.get(entry.dictId);
                if (!dict) continue;

                // Validate Japanese inflection rule constraints
                if (candidate.rules !== 0 && entry.rules) {
                    const entryRuleList = entry.rules.split(/\s+/).filter(Boolean);
                    const entryFlags = Deinflector.rulesToRuleFlags(entryRuleList);
                    if ((entryFlags & candidate.rules) === 0) {
                        continue;
                    }
                }

                // Unique key: dictId + term + reading + seq + defTags
                const uniqueKey = `${entry.dictId}:${entry.term.toLowerCase()}:${entry.reading}:${entry.seq || ''}:${entry.defTags || ''}`;
                if (seenKeys.has(uniqueKey)) continue;
                seenKeys.add(uniqueKey);

                rawResults.push({
                    term: entry.term,
                    reading: entry.reading,
                    source: cleanText,
                    reason: candidate.reason,
                    isOriginal: candidate.isOriginal,
                    score: entry.score || 0,
                    glossary: entry.glossary || [],
                    defTags: entry.defTags || '',
                    rules: entry.rules || '',
                    seq: entry.seq || 0,
                    dictId: entry.dictId,
                    dictTitle: dict.title,
                    redirectTo: null
                });
            }
        }

        // 6. Resolve Yomitan Redirects (e.g. "good night" -> "goodnight", "take care of" -> "take care of somebody...")
        const finalResults = [];
        const redirectPromises = [];

        for (const item of rawResults) {
            const targetTerm = KikiSearchEngine.getRedirectTarget(item);
            if (!targetTerm) {
                finalResults.push(item);
            } else {
                // Fetch target lemma from IndexedDB
                redirectPromises.push(
                    this._resolveRedirect(targetTerm, item, enabledDicts)
                );
            }
        }

        if (redirectPromises.length > 0) {
            const resolvedRedirects = await Promise.all(redirectPromises);
            for (const list of resolvedRedirects) {
                finalResults.push(...list);
            }
        }

        // 7. Ranking: exact matches first, non-redirects over redirects, score descending
        finalResults.sort((a, b) => {
            if (a.isOriginal !== b.isOriginal) {
                return a.isOriginal ? -1 : 1;
            }
            if (a.term.toLowerCase() === cleanText.toLowerCase() && b.term.toLowerCase() !== cleanText.toLowerCase()) {
                return -1;
            }
            if (b.term.toLowerCase() === cleanText.toLowerCase() && a.term.toLowerCase() !== cleanText.toLowerCase()) {
                return 1;
            }
            return (b.score || 0) - (a.score || 0);
        });

        return finalResults;
    }

    /**
     * Resolve redirect target entry
     */
    async _resolveRedirect(targetTerm, originalItem, enabledDicts) {
        // Query target in DB
        let targets = await this.db.getTermsByTerm(targetTerm);
        if (targets.length === 0 && targetTerm !== targetTerm.toLowerCase()) {
            targets = await this.db.getTermsByTerm(targetTerm.toLowerCase());
        }

        // If target not directly found and has slashes/brackets, try base head
        if (targets.length === 0 && /[/(]/.test(targetTerm)) {
            const stripped = targetTerm.replace(/\s*\(.*?\)/g, '').replace(/\/.*$/, '').trim();
            if (stripped) {
                targets = await this.db.getTermsByTerm(stripped);
            }
        }

        const dict = enabledDicts.get(originalItem.dictId);
        const resolvedList = [];

        for (const target of targets) {
            if (target.dictId !== originalItem.dictId) continue;
            // Avoid circular redirect
            if (KikiSearchEngine.getRedirectTarget(target)) continue;

            resolvedList.push({
                term: originalItem.term,
                reading: target.reading || originalItem.reading,
                source: originalItem.source,
                reason: originalItem.reason,
                isOriginal: originalItem.isOriginal,
                score: (target.score || 0) + 1,
                glossary: target.glossary || [],
                defTags: target.defTags || originalItem.defTags,
                rules: target.rules || originalItem.rules,
                seq: target.seq || originalItem.seq,
                dictId: originalItem.dictId,
                dictTitle: dict ? dict.title : originalItem.dictTitle,
                redirectTo: target.term
            });
        }

        // If target resolution succeeded, return resolved definitions
        if (resolvedList.length > 0) {
            return resolvedList;
        }

        // Fallback: keep original if target lemma not in dictionary
        return [originalItem];
    }
}

window.KikiSearchEngine = KikiSearchEngine;

  // --- Yomitan Zip Importer ---
  /**
 * Yomitan Zip Dictionary Importer for Kiki Immersion
 */
class YomitanImporter {
    constructor(db) {
        this.db = db;
    }

    /**
     * Parse and import Yomitan .zip dictionary file
     * @param {File|Blob} file Dictionary zip file
     * @param {Function} onProgress Progress callback ({ phase, current, total, percentage, message })
     */
    async importZip(file, onProgress = () => {}) {
        if (!window.JSZip) {
            throw new Error('JSZip library is not loaded');
        }

        onProgress({ phase: 'unzip', current: 0, total: 100, percentage: 0, message: 'Reading dictionary archive...' });

        const zip = new JSZip();
        const zipContent = await zip.loadAsync(file);

        // 1. Read index.json
        const indexFile = zipContent.file('index.json');
        if (!indexFile) {
            throw new Error('Invalid Yomitan dictionary: missing index.json');
        }

        const indexText = await indexFile.async('text');
        let meta;
        try {
            meta = JSON.parse(indexText);
        } catch (e) {
            throw new Error('Failed to parse index.json: ' + e.message);
        }

        // 2. Read custom CSS stylesheet if present (e.g. styles.css)
        let customCss = '';
        zipContent.forEach((relativePath, fileObj) => {
            if (relativePath.endsWith('.css')) {
                // Pick the main stylesheet
                if (!customCss || relativePath === 'styles.css') {
                    zipContent.file(relativePath).async('text').then(text => {
                        customCss = text;
                    });
                }
            }
        });
        // Await the CSS file if exists
        const cssFile = zipContent.file('styles.css') || zipContent.file(/.*\.css$/i)[0];
        if (cssFile) {
            customCss = await cssFile.async('text');
        }

        // Generate unique dictId
        const rawTitle = meta.title || 'Unknown Dictionary';
        const dictId = 'dict_' + rawTitle.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase() + '_' + Date.now().toString(36);

        // 3. Locate all term_bank_*.json files
        const bankFiles = [];
        zipContent.forEach((relativePath, fileObj) => {
            if (/^term_bank_\d+\.json$/.test(relativePath)) {
                bankFiles.push(fileObj);
            }
        });

        if (bankFiles.length === 0) {
            throw new Error('No term_bank_*.json files found in archive');
        }

        // Sort naturally: term_bank_1.json, term_bank_2.json ...
        bankFiles.sort((a, b) => {
            const numA = parseInt(a.name.match(/\d+/)[0], 10);
            const numB = parseInt(b.name.match(/\d+/)[0], 10);
            return numA - numB;
        });

        // 4. Save initial dictionary metadata
        const dictInfo = {
            id: dictId,
            title: meta.title || 'Untitled Dictionary',
            revision: meta.revision || '',
            format: meta.format || 3,
            sequenced: !!meta.sequenced,
            author: meta.author || '',
            description: meta.description || '',
            sourceLanguage: meta.sourceLanguage || '',
            targetLanguage: meta.targetLanguage || '',
            css: customCss,
            termCount: 0,
            enabled: true,
            createdAt: Date.now()
        };
        await this.db.saveDictionary(dictInfo);

        // 5. Stream banks and write in batches
        let totalImported = 0;
        const totalBanks = bankFiles.length;

        for (let i = 0; i < totalBanks; i++) {
            const bankFile = bankFiles[i];
            const bankPercentage = Math.round(((i) / totalBanks) * 100);

            onProgress({
                phase: 'import',
                current: i + 1,
                total: totalBanks,
                percentage: bankPercentage,
                message: `Importing chunk ${i + 1}/${totalBanks} (${bankFile.name})...`
            });

            const jsonStr = await bankFile.async('text');
            const entries = JSON.parse(jsonStr);

            if (Array.isArray(entries) && entries.length > 0) {
                await this.db.addTermsBatch(dictId, entries);
                totalImported += entries.length;
            }
        }

        // 6. Update final term count in metadata
        dictInfo.termCount = totalImported;
        await this.db.saveDictionary(dictInfo);

        onProgress({
            phase: 'done',
            current: totalBanks,
            total: totalBanks,
            percentage: 100,
            message: `Completed! Successfully indexed ${totalImported.toLocaleString()} entries.`
        });

        return dictInfo;
    }
}

window.YomitanImporter = YomitanImporter;

  // --- Yomitan Audio Engine ---
  /**
 * Kiki Immersion - Yomitan Audio Engine
 * Supports multi-language audio playback (English, Japanese, etc.)
 * Fallback to Web Speech Synthesis API.
 */
class KikiAudioEngine {
    constructor() {
        this.currentAudio = null;
        this.autoPlay = true;
    }

    /**
     * Get audio stream URL for term and optional reading
     */
    getAudioUrl(term, reading = '', type = 2) {
        const cleanTerm = (term || '').trim();
        const cleanReading = (reading || '').trim();
        const isJp = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(cleanTerm);

        if (isJp) {
            if (cleanReading) {
                return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(cleanReading)}&le=jap`;
            }
            return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(cleanTerm)}&le=jap`;
        }

        // English audio: type=2 (US), type=1 (UK)
        return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(cleanTerm)}&type=${type}`;
    }

    /**
     * Play word pronunciation
     * @param {string} term 
     * @param {string} reading 
     * @param {number} type 1 for UK, 2 for US
     * @returns {Promise<boolean>}
     */
    play(term, reading = '', type = 2) {
        if (!term) return Promise.resolve(false);
        const cleanTerm = term.trim();

        return new Promise((resolve) => {
            try {
                if (this.currentAudio) {
                    this.currentAudio.pause();
                    this.currentAudio = null;
                }

                const url = this.getAudioUrl(cleanTerm, reading, type);
                const audio = new Audio(url);
                this.currentAudio = audio;

                audio.onended = () => resolve(true);
                audio.onerror = () => {
                    this.playSpeech(cleanTerm);
                    resolve(true);
                };

                const playPromise = audio.play();
                if (playPromise !== undefined) {
                    playPromise.catch(() => {
                        this.playSpeech(cleanTerm);
                        resolve(true);
                    });
                }
            } catch {
                this.playSpeech(cleanTerm);
                resolve(true);
            }
        });
    }

    /**
     * Native Web Speech API fallback
     */
    playSpeech(term) {
        try {
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                const isJp = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(term);
                const utt = new SpeechSynthesisUtterance(term);
                utt.lang = isJp ? 'ja-JP' : 'en-US';
                utt.rate = 0.92;
                window.speechSynthesis.speak(utt);
            }
        } catch {}
    }
}

window.KikiAudioEngine = KikiAudioEngine;

  const localDB = new KikiDictDB();
  const localDeinflector = new Deinflector(window.DEINFLECT_RULES || {});
  const localLemmatizer = new EnglishLemmatizer();
  const localSearch = new KikiSearchEngine(localDB, localDeinflector, localLemmatizer);
  const localImporter = new YomitanImporter(localDB);
  const localAudio = new KikiAudioEngine();

  window.localDB = localDB;
  window.localSearch = localSearch;
  window.localImporter = localImporter;
  window.localAudio = localAudio;
  window.showYomitanCard = (...args) => showYomitanCard(...args);

  let cachedDictCount = 0;
  let cachedDictTitle = "";
  async function refreshDictStats() {
    try {
      if (localSearch) await localSearch.refreshDictCache();
      const dicts = await localDB.getDictionaries();
      const activeDicts = dicts.filter(d => d.enabled);
      cachedDictCount = activeDicts.length;
      cachedDictTitle = activeDicts.map(d => d.title).join(", ") || "";
      const styles = await localDB.getActiveStyles();
      if (styles) {
        let s = document.getElementById("kiki-dict-styles");
        if (!s) {
          s = document.createElement("style");
          s.id = "kiki-dict-styles";
          (document.head || document.documentElement).appendChild(s);
        }
        s.textContent = styles;
      }
      updateHud();
    } catch (err) {
      console.warn("[Kiki refreshDictStats error]", err);
    }
  }
  window.refreshDictStats = refreshDictStats;
  refreshDictStats();



  async function lookupWord(term, wordEl) {
    try {
      const cleanTerm = (term || "").trim();
      if (!cleanTerm) return [];

      const candidatePhrases = [];
      const seenPhrases = new Set([cleanTerm.toLowerCase()]);

      if (wordEl && wordEl.closest) {
        const line = wordEl.closest(".kiki-line");
        if (line) {
          const allWords = Array.from(line.querySelectorAll(".kiki-word"));
          const C = allWords.indexOf(wordEl);
          if (C !== -1 && allWords.length > 1) {
            const N = allWords.length;

            // 1. Forward phrases starting with wordEl (longest to shortest, max 5 words)
            for (let len = Math.min(5, N - C); len >= 2; len--) {
              const p = getSliceText(allWords[C], allWords[C + len - 1]);
              if (p && !seenPhrases.has(p.toLowerCase())) {
                seenPhrases.add(p.toLowerCase());
                candidatePhrases.push({
                  phrase: p,
                  priority: 20 + len,
                  wordEls: allWords.slice(C, C + len)
                });
              }
            }

            // 2. Surrounding & preceding phrases containing wordEl (longest to shortest, max 5 words)
            for (let len = Math.min(5, N); len >= 2; len--) {
              for (let s = Math.max(0, C - len + 1); s < C && s + len - 1 < N; s++) {
                const e = s + len - 1;
                if (e >= C) {
                  const p = getSliceText(allWords[s], allWords[e]);
                  if (p && !seenPhrases.has(p.toLowerCase())) {
                    seenPhrases.add(p.toLowerCase());
                    candidatePhrases.push({
                      phrase: p,
                      priority: len,
                      wordEls: allWords.slice(s, e + 1)
                    });
                  }
                }
              }
            }
          }
        }
      }

      // Query candidate phrases and single word in parallel
      const phrasePromises = candidatePhrases.map((cp) => localSearch.search(cp.phrase));
      const singleWordPromise = localSearch.search(cleanTerm);

      const [phraseResultsArr, singleWordResults] = await Promise.all([
        Promise.all(phrasePromises),
        singleWordPromise
      ]);

      const matchedPhrases = [];
      for (let i = 0; i < candidatePhrases.length; i++) {
        const res = phraseResultsArr[i];
        if (res && res.length > 0) {
          matchedPhrases.push({
            meta: candidatePhrases[i],
            results: res
          });
        }
      }

      // Sort matched phrases by priority descending (forward phrases & longer phrases first)
      matchedPhrases.sort((a, b) => b.meta.priority - a.meta.priority);

      // If a phrase matched in dictionary, highlight all words belonging to the top matched phrase
      if (matchedPhrases.length > 0) {
        const topPhrase = matchedPhrases[0];
        topPhrase.meta.wordEls.forEach((el) => el.classList.add("kiki-active"));
      }

      // Combine results: matched phrases first, then single word definitions
      const combined = [];
      const seenEntryKeys = new Set();

      const addEntry = (item) => {
        const key = `${item.dictId}:${item.term.toLowerCase()}:${item.reading}:${item.seq || ''}`;
        if (!seenEntryKeys.has(key)) {
          seenEntryKeys.add(key);
          combined.push(item);
        }
      };

      for (const mp of matchedPhrases) {
        for (const item of mp.results) {
          addEntry(item);
        }
      }

      for (const item of (singleWordResults || [])) {
        addEntry(item);
      }

      return combined;
    } catch (err) {
      console.warn("[Kiki lookupWord error]", err);
    }
    return [];
  }



// >>> END MODULE: yomitan <<<


// >>> BEGIN MODULE: ai <<<

// =============================================================
// Kiki Immersion - AI Contextual Engine & Multi-Turn Chat
// Version: 1.2.2
// =============================================================

  async function pingAiConnection({ base, key, model }) {
    let root = (base || "https://api.openai.com/v1").trim().replace(/\/+$/, "");
    const url = root.endsWith("/chat/completions") ? root : root + "/chat/completions";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + key
        },
        body: JSON.stringify({
          model: model || "gpt-4o-mini",
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 5
        }),
        signal: controller.signal
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error("HTTP " + res.status + " " + txt.slice(0, 140));
      }
      return { ok: true };
    } finally {
      clearTimeout(timer);
    }
  }

  async function streamChat({ base, key, model, system, user, messages, maxTokens, signal, onChunk, onReasoningChunk }) {
    let root = (base || "https://api.openai.com/v1").trim().replace(/\/+$/, "");
    const url = root.endsWith("/chat/completions") ? root : root + "/chat/completions";

    const chatMessages = messages && messages.length
      ? messages
      : [
          { role: "system", content: system },
          { role: "user", content: user }
        ];

    const body = {
      model: model || "gpt-4o-mini",
      stream: true,
      messages: chatMessages
    };

    const tokenLimit = parseInt(maxTokens, 10) || 4096;
    const isOModel = /^o[13]/i.test(body.model);
    if (isOModel) {
      body.max_completion_tokens = tokenLimit;
      try { body.reasoning_effort = "low"; } catch {}
    } else {
      body.temperature = 0.6;
      body.max_tokens = tokenLimit;
    }

    let firstChunk = false;
    let timer = null;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        if (!firstChunk) {
          reject(new Error("Request timed out (15s)"));
        }
      }, 15000);
    });

    const fetchPromise = (async () => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + key
        },
        body: JSON.stringify(body),
        signal
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error("HTTP " + res.status + " " + errText.slice(0, 240));
      }

      firstChunk = true;
      clearTimeout(timer);

      let accumulatedReasoning = "";
      let accumulatedContent = "";

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop();

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line || line.startsWith(":")) continue;
            if (line === "data: [DONE]") break;
            if (line.startsWith("data:")) {
              const jsonStr = line.slice(5).trim();
              try {
                const json = JSON.parse(jsonStr);
                const delta = json.choices?.[0]?.delta;
                const content = delta?.content;
                const reasoning = delta?.reasoning_content;
                if (content) {
                  accumulatedContent += content;
                  onChunk(content, false);
                } else if (reasoning) {
                  accumulatedReasoning += reasoning;
                  if (typeof onReasoningChunk === "function") {
                    onReasoningChunk(reasoning, accumulatedReasoning);
                  } else {
                    onChunk("", true);
                  }
                }
              } catch {}
            }
          }
        }

        if (buf.trim().startsWith("data:") && buf.trim() !== "data: [DONE]") {
          try {
            const json = JSON.parse(buf.trim().slice(5).trim());
            const delta = json.choices?.[0]?.delta;
            if (delta?.content) {
              accumulatedContent += delta.content;
              onChunk(delta.content, false);
            } else if (delta?.reasoning_content) {
              accumulatedReasoning += delta.reasoning_content;
              if (typeof onReasoningChunk === "function") {
                onReasoningChunk(delta.reasoning_content, accumulatedReasoning);
              } else {
                onChunk("", true);
              }
            }
          } catch {}
        }
      } else {
        const text = await res.text();
        const json = JSON.parse(text);
        const msg = json.choices?.[0]?.message;
        const out = msg?.content || "";
        const reasoning = msg?.reasoning_content || "";
        if (out) {
          accumulatedContent = out;
          onChunk(out, false);
        } else if (reasoning) {
          accumulatedReasoning = reasoning;
          if (typeof onReasoningChunk === "function") {
            onReasoningChunk(reasoning, accumulatedReasoning);
          } else {
            onChunk("", true);
          }
        } else {
          throw new Error("Empty model response");
        }
      }

      // Safe fallback: If content is empty but model produced reasoning, provide the reasoning conclusion
      if (!accumulatedContent && accumulatedReasoning) {
        const clean = accumulatedReasoning.replace(/\n+/g, " ").trim();
        const fallbackText = clean.slice(-260).trim();
        if (fallbackText) {
          onChunk(fallbackText, false);
        }
      }
    })();

    try {
      await Promise.race([fetchPromise, timeoutPromise]);
    } finally {
      clearTimeout(timer);
    }
  }


  async function explainWithAiInCard(card, term, sentence) {
    window.explainWithAiInCard = explainWithAiInCard;
    STATE.aiToken = (STATE.aiToken || 0) + 1;
    const token = STATE.aiToken;
    abortActiveAi();

    const cfg = getAiConfig();
    const isEn = cfg.aiLang === "en";
    const curMode = cfg.aiMode || "quick";
    const isWholeSentence = !term || term === sentence;
    const wordPlaceholder = isWholeSentence
      ? (isEn ? "entire sentence" : "全句")
      : term;
    const displayTerm = isWholeSentence
      ? (isEn ? "Entire Subtitle" : "全句解析")
      : term;

    let tmpl = "";
    if (curMode === "deep") {
      tmpl = isEn ? AI_MODES.deep.promptEn : AI_MODES.deep.promptZh;
    } else if (curMode === "custom") {
      tmpl = isEn ? (cfg.promptEn || AI_MODES.quick.promptEn) : (cfg.promptZh || AI_MODES.quick.promptZh);
    } else {
      tmpl = isEn ? AI_MODES.quick.promptEn : AI_MODES.quick.promptZh;
    }

    const system = String(tmpl || AI_DEFAULTS[isEn ? "promptEn" : "promptZh"])
      .replaceAll("{{word}}", wordPlaceholder)
      .replaceAll("{{sentence}}", sentence || "");
    const initialUserPrompt = isEn
      ? (isWholeSentence ? `Subtitle: ${sentence}` : `Word: ${term}\nSubtitle: ${sentence}`)
      : (isWholeSentence ? `字幕：${sentence}` : `词：${term}\n字幕：${sentence}`);

    STATE.aiMessages = [
      { role: "system", content: system },
      { role: "user", content: initialUserPrompt }
    ];

    if (STATE.lookupEl) {
      STATE.lookupEl.classList.add("kiki-active");
    }

    setHtml(card, `
      <div class="kiki-card-header">
        <div class="kiki-card-term-row" style="justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span class="kiki-card-term" style="font-size: 22px !important; font-weight: 800; color: #FFF; line-height: 1.2;">${escapeHtml(displayTerm)}</span>
            <span style="background: linear-gradient(135deg, #6366F1, #8B5CF6); color: #FFF; font-size: 11px; font-weight: 700; padding: 2.5px 8px; border-radius: 6px;">✦ AI Context</span>
            <select class="kiki-card-mode-select" style="background: rgba(255,255,255,0.12); color: #E2E8F0; font-size: 11.5px; font-weight: 600; padding: 2px 6px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); cursor: pointer; outline: none;">
              <option value="quick" ${curMode === "quick" ? "selected" : ""}>⚡ Quick</option>
              <option value="deep" ${curMode === "deep" ? "selected" : ""}>📚 Deep</option>
              <option value="custom" ${curMode === "custom" ? "selected" : ""}>⚙️ Custom</option>
            </select>
            <span style="background: rgba(255,255,255,0.08); color: #94A3B8; font-size: 11px; padding: 2px 6px; border-radius: 4px;">${escapeHtml(cfg.apiModel || 'gpt-4o-mini')}</span>
          </div>
          <button type="button" class="kiki-card-close-btn" style="background: transparent; border: none; color: #BBB; font-size: 22px; cursor: pointer; line-height: 1; padding: 0 4px;">&times;</button>
        </div>
      </div>

      <div style="background: rgba(255, 255, 255, 0.06); border-left: 3px solid #6366F1; padding: 7px 12px; border-radius: 0 8px 8px 0; margin-bottom: 12px; font-size: 13.5px; color: #CBD5E1; font-style: italic; line-height: 1.45;">
        “${escapeHtml(sentence || "(no sentence context)")}”
      </div>

      <div class="kiki-ai-scroll-container" style="font-size: 15px; line-height: 1.65; color: #F1F5F9; max-height: 380px; overflow-y: auto; padding-right: 2px;">
        <div class="kiki-ai-chat-thread">
          <!-- Turns rendered here -->
        </div>

        <!-- Follow-up Suggestions Area -->
        <div class="kiki-ai-suggestions-container" style="display: none; flex-direction: column; gap: 7px; margin-top: 14px; margin-bottom: 6px;"></div>
      </div>

      <!-- Follow-up Interactive Input Bar -->
      <div class="kiki-ai-input-wrap" style="border-top: 1px solid rgba(255, 255, 255, 0.12); padding-top: 10px; margin-top: 10px;">
        <div style="display: flex; gap: 8px; align-items: center;">
          <input type="text" class="kiki-ai-followup-input" placeholder="Ask follow-up question or explore grammar…" style="flex: 1; background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; padding: 8px 12px; color: #FFF; font-size: 13px; outline: none; box-sizing: border-box;">
          <button type="button" class="kiki-ai-followup-send" style="background: linear-gradient(135deg, #6366F1, #8B5CF6); color: #FFF; border: none; border-radius: 8px; padding: 8px 14px; font-size: 12.5px; font-weight: 700; cursor: pointer; white-space: nowrap; user-select: none;">Send</button>
        </div>
      </div>
    `);

    card.querySelector(".kiki-card-close-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      closeLookup();
    });

    const modeSelect = card.querySelector(".kiki-card-mode-select");
    modeSelect?.addEventListener("change", (e) => {
      e.stopPropagation();
      const newMode = modeSelect.value;
      saveAiConfig({ aiMode: newMode });
      explainWithAiInCard(card, term, sentence);
    });

    const scrollContainer = card.querySelector(".kiki-ai-scroll-container");
    const chatThread = card.querySelector(".kiki-ai-chat-thread");
    const suggestionsContainer = card.querySelector(".kiki-ai-suggestions-container");
    const followupInput = card.querySelector(".kiki-ai-followup-input");
    const followupSendBtn = card.querySelector(".kiki-ai-followup-send");

    function renderSuggestions(pills) {
      if (!suggestionsContainer) return;
      suggestionsContainer.innerHTML = "";
      if (!pills || !pills.length) {
        suggestionsContainer.style.display = "none";
        return;
      }
      suggestionsContainer.style.display = "flex";
      pills.forEach((pText, pIdx) => {
        const theme = PILL_THEMES[pIdx % PILL_THEMES.length];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "kiki-ai-pill-btn";
        btn.style.cssText = `border: 1px solid ${theme.border}; background: ${theme.bg}; color: ${theme.color}; border-radius: 9px; padding: 7px 12px; font-size: 12.5px; font-weight: 500; cursor: pointer; text-align: left; transition: all 0.15s; line-height: 1.4; display: flex; align-items: center; justify-content: space-between; user-select: none;`;
        btn.innerHTML = `
          <span>${escapeHtml(pText)}</span>
          <span style="opacity: 0.6; font-size: 14px; margin-left: 6px;">→</span>
        `;
        btn.addEventListener("mouseenter", () => { btn.style.background = theme.hover; });
        btn.addEventListener("mouseleave", () => { btn.style.background = theme.bg; });
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          triggerFollowUp(pText);
        });
        suggestionsContainer.appendChild(btn);
      });
      if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }

    async function streamAssistantTurn(turnEl, messagesToSend) {
      const thoughtBox = turnEl.querySelector(".kiki-ai-thought-box");
      const thoughtStatus = turnEl.querySelector(".kiki-ai-thought-status");
      const thoughtText = turnEl.querySelector(".kiki-ai-thought-text");
      const thoughtToggleBtn = turnEl.querySelector(".kiki-ai-thought-toggle-btn");
      const answerEl = turnEl.querySelector(".kiki-ai-answer");
      const initialStatus = turnEl.querySelector(".kiki-ai-initial-status");

      let thoughtAutoCollapsed = false;
      let isThoughtCollapsed = false;

      thoughtToggleBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        isThoughtCollapsed = !isThoughtCollapsed;
        if (thoughtText) thoughtText.style.display = isThoughtCollapsed ? "none" : "block";
        if (thoughtToggleBtn) thoughtToggleBtn.textContent = isThoughtCollapsed ? (isEn ? "Expand" : "展开") : (isEn ? "Collapse" : "收起");
      });

      let accumulatedContent = "";
      let accumulatedReasoning = "";

      activeAiAbort = new AbortController();
      const curAbort = activeAiAbort;

      try {
        await streamChat({
          base: cfg.apiBase,
          key: cfg.apiKey,
          model: cfg.apiModel,
          messages: messagesToSend,
          maxTokens: cfg.maxTokens,
          signal: curAbort.signal,
          onReasoningChunk: (chunk, allReasoning) => {
            if (token !== STATE.aiToken || !card.classList.contains("show")) return;
            accumulatedReasoning = allReasoning;
            if (thoughtBox) thoughtBox.style.display = "block";
            if (initialStatus) initialStatus.style.display = "none";
            if (thoughtText) {
              thoughtText.textContent = allReasoning;
              thoughtText.scrollTop = thoughtText.scrollHeight;
            }
          },
          onChunk: (text, thinking) => {
            if (token !== STATE.aiToken || !card.classList.contains("show")) return;
            if (thinking) return;
            if (text) {
              accumulatedContent += text;
              if (!thoughtAutoCollapsed && accumulatedReasoning) {
                thoughtAutoCollapsed = true;
                isThoughtCollapsed = true;
                if (thoughtText) thoughtText.style.display = "none";
                if (thoughtToggleBtn) thoughtToggleBtn.textContent = isEn ? "Expand" : "展开";
                if (thoughtStatus) {
                  const charCount = accumulatedReasoning.length;
                  thoughtStatus.innerHTML = `✦ Thinking completed ${charCount > 0 ? `(${charCount}字)` : ''}`;
                  thoughtStatus.style.color = "#8B5CF6";
                }
              }
              if (initialStatus) initialStatus.style.display = "none";
              const parsed = parseContentAndSuggestions(accumulatedContent, isEn, term);
              setHtml(answerEl, renderMarkdownText(parsed.content));
              if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
          }
        });

        // Ensure thinking box collapses when finished
        if (accumulatedReasoning && thoughtBox && !isThoughtCollapsed) {
          isThoughtCollapsed = true;
          if (thoughtText) thoughtText.style.display = "none";
          if (thoughtToggleBtn) thoughtToggleBtn.textContent = isEn ? "Expand" : "展开";
          if (thoughtStatus) {
            const charCount = accumulatedReasoning.length;
            thoughtStatus.innerHTML = `✦ Thinking completed ${charCount > 0 ? `(${charCount}字)` : ''}`;
            thoughtStatus.style.color = "#8B5CF6";
          }
        }

        if (token === STATE.aiToken && card.classList.contains("show")) {
          if (!accumulatedContent) {
            if (accumulatedReasoning) {
              const clean = accumulatedReasoning.replace(/\n+/g, " ").trim();
              const fallbackText = clean.slice(-260).trim();
              setHtml(answerEl, renderMarkdownText(fallbackText));
              STATE.aiMessages.push({ role: "assistant", content: fallbackText });
            } else {
              setHtml(answerEl, `<span style="color: #94A3B8;">(Empty response from AI)</span>`);
            }
          } else {
            const parsed = parseContentAndSuggestions(accumulatedContent, isEn, term);
            setHtml(answerEl, renderMarkdownText(parsed.content));
            STATE.aiMessages.push({ role: "assistant", content: parsed.content });
            renderSuggestions(parsed.suggestions);
          }
        }
      } catch (err) {
        if (token !== STATE.aiToken || !card.classList.contains("show")) return;
        if (curAbort.signal.aborted) return;
        setHtml(answerEl, `
          <div style="color: #F87171; font-size: 13.5px; line-height: 1.5; padding: 6px 0;">
            <div style="font-weight: 700; margin-bottom: 4px;">AI Request Failed</div>
            <div style="opacity: 0.9; margin-bottom: 8px;">${escapeHtml(err.message || String(err))}</div>
            <button type="button" class="kiki-open-ai-settings-btn" style="background: rgba(99, 102, 241, 0.3); color: #C7D2FE; border: 1px solid rgba(165, 180, 252, 0.4); border-radius: 6px; padding: 6px 12px; font-size: 12px; cursor: pointer;">⚙ Check AI Configuration</button>
          </div>
        `);
        card.querySelector(".kiki-open-ai-settings-btn")?.addEventListener("click", () => {
          showSettingsModal("ai");
        });
      } finally {
        if (activeAiAbort === curAbort) activeAiAbort = null;
        if (followupInput) followupInput.disabled = false;
        if (followupSendBtn) {
          followupSendBtn.disabled = false;
          followupSendBtn.textContent = isEn ? "Send" : "发送";
        }
      }
    }

    async function triggerFollowUp(userText) {
      if (!userText || !userText.trim()) return;
      const query = userText.trim();

      if (suggestionsContainer) suggestionsContainer.style.display = "none";
      if (followupInput) {
        followupInput.value = "";
        followupInput.disabled = true;
      }
      if (followupSendBtn) {
        followupSendBtn.disabled = true;
        followupSendBtn.textContent = "…";
      }

      // Append user bubble
      const userMsgDiv = document.createElement("div");
      userMsgDiv.style.cssText = "margin: 14px 0 10px; display: flex; justify-content: flex-end;";
      userMsgDiv.innerHTML = `
        <div style="background: rgba(99, 102, 241, 0.28); border: 1px solid rgba(165, 180, 252, 0.4); border-radius: 12px 12px 2px 12px; padding: 8px 13px; font-size: 13.5px; color: #E0E7FF; font-weight: 500; max-width: 86%;">
          ${escapeHtml(query)}
        </div>
      `;
      chatThread?.appendChild(userMsgDiv);

      // Append assistant turn container
      const turnDiv = document.createElement("div");
      turnDiv.style.cssText = "border-top: 1px dashed rgba(255, 255, 255, 0.15); padding-top: 12px; margin-top: 10px;";
      turnDiv.innerHTML = `
        <div class="kiki-ai-thought-box" style="display: none; background: rgba(255, 255, 255, 0.05); border-left: 3px solid #8B5CF6; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 12.5px; color: #94A3B8; line-height: 1.5;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; user-select: none;">
            <span class="kiki-ai-thought-status" style="font-weight: 700; color: #C4B5FD; display: inline-flex; align-items: center; gap: 6px;">
              <span>✦</span> Thinking…
            </span>
            <button type="button" class="kiki-ai-thought-toggle-btn" style="background: transparent; border: none; color: #A5B4FC; font-size: 11px; cursor: pointer; padding: 0 4px;">Collapse</button>
          </div>
          <div class="kiki-ai-thought-text" style="max-height: 140px; overflow-y: auto; white-space: pre-wrap; font-family: -apple-system, BlinkMacSystemFont, monospace; font-size: 12px; opacity: 0.88; color: #CBD5E1; line-height: 1.45;"></div>
        </div>

        <div class="kiki-ai-answer" style="font-size: 15px; line-height: 1.65; color: #F1F5F9;">
          <span class="kiki-ai-initial-status" style="color: #94A3B8; display: inline-flex; align-items: center; gap: 6px;">
            ✦ Generating…
          </span>
        </div>
      `;
      chatThread?.appendChild(turnDiv);
      if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;

      STATE.aiMessages.push({ role: "user", content: query });
      await streamAssistantTurn(turnDiv, STATE.aiMessages);
    }

    // Input listeners
    followupSendBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (followupInput) triggerFollowUp(followupInput.value);
    });
    followupInput?.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        triggerFollowUp(followupInput.value);
      }
    });

    // Initial first turn container
    const initialTurnDiv = document.createElement("div");
    initialTurnDiv.innerHTML = `
      <div class="kiki-ai-thought-box" style="display: none; background: rgba(255, 255, 255, 0.05); border-left: 3px solid #8B5CF6; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 12.5px; color: #94A3B8; line-height: 1.5;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; user-select: none;">
          <span class="kiki-ai-thought-status" style="font-weight: 700; color: #C4B5FD; display: inline-flex; align-items: center; gap: 6px;">
            <span>✦</span> Thinking…
          </span>
          <button type="button" class="kiki-ai-thought-toggle-btn" style="background: transparent; border: none; color: #A5B4FC; font-size: 11px; cursor: pointer; padding: 0 4px;">Collapse</button>
        </div>
        <div class="kiki-ai-thought-text" style="max-height: 140px; overflow-y: auto; white-space: pre-wrap; font-family: -apple-system, BlinkMacSystemFont, monospace; font-size: 12px; opacity: 0.88; color: #CBD5E1; line-height: 1.45;"></div>
      </div>

      <div class="kiki-ai-answer" style="font-size: 15px; line-height: 1.65; color: #F1F5F9;">
        <span class="kiki-ai-initial-status" style="color: #94A3B8; display: inline-flex; align-items: center; gap: 6px;">
          ✦ Connecting to AI…
        </span>
      </div>
    `;
    chatThread?.appendChild(initialTurnDiv);

    await streamAssistantTurn(initialTurnDiv, STATE.aiMessages);
  }
  window.explainWithAiInCard = explainWithAiInCard;



// >>> END MODULE: ai <<<


// >>> BEGIN MODULE: ui <<<

// =============================================================
// Kiki Immersion - UI Module (Cards, HUD Bar, Subtitles Overlay, Settings Modal)
// Version: 1.3.1
// =============================================================

  window.playVideoSync = playVideoSync;
  function playVideoSync() {
    STATE.pausedForLookup = false;
    const p = playerEl();
    if (p && typeof p.playVideo === "function") {
      try { p.playVideo(); } catch {}
    }
    const v = videoEl();
    if (v && v.paused) {
      try {
        const pr = v.play();
        if (pr && typeof pr.catch === "function") pr.catch(() => {});
      } catch {}
    }
    // Safety check after a short frame to make sure video resumed
    setTimeout(() => {
      if (STATE.enabled && !STATE.pausedForLookup && (typeof isAnyPopupOpen !== "function" || !isAnyPopupOpen())) {
        const video = videoEl();
        if (video && video.paused) {
          const player = playerEl();
          if (player && typeof player.playVideo === "function") {
            try { player.playVideo(); } catch {}
          }
          try {
            const p2 = video.play();
            if (p2 && typeof p2.catch === "function") p2.catch(() => {});
          } catch {}
        }
      }
    }, 60);
  }

  window.pauseVideoSync = pauseVideoSync;
  function pauseVideoSync() {
    const p = playerEl();
    if (p && typeof p.pauseVideo === "function") {
      try { p.pauseVideo(); } catch {}
    }
    const v = videoEl();
    if (v && !v.paused) {
      try { v.pause(); } catch {}
    }
  }

  function togglePause() {
    const v = videoEl();
    if (!v) return;
    if (v.paused) {
      playVideoSync();
      toast("play");
    } else {
      pauseVideoSync();
      toast("pause");
    }
  }

  function getPlayerHost() {
    return document.getElementById("movie_player") ||
           document.querySelector(".html5-video-player") ||
           document.querySelector("ytd-player") ||
           document.querySelector("#player-container") ||
           document.body ||
           document.documentElement;
  }

  function queryCaptionElements(selector) {
    const results = [];
    const seen = new Set();
    const addAll = (list) => {
      if (!list) return;
      for (let i = 0; i < list.length; i++) {
        const el = list[i];
        if (el && !seen.has(el)) {
          seen.add(el);
          results.push(el);
        }
      }
    };
    try {
      const p = playerEl();
      if (p) addAll(p.querySelectorAll(selector));
    } catch {}
    try {
      addAll(document.querySelectorAll(selector));
    } catch {}
    try {
      const ytd = document.querySelector("ytd-player");
      if (ytd && ytd.shadowRoot) {
        addAll(ytd.shadowRoot.querySelectorAll(selector));
      }
    } catch {}
    return results;
  }

  function makeDraggable(el) {
    if (el._kiki_drag_bound) return;
    el._kiki_drag_bound = true;
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    el.addEventListener("touchstart", (e) => {
      if (e.target.closest("button")) return;
      const touch = e.touches[0];
      if (!touch) return;
      isDragging = true;
      startX = touch.clientX;
      startY = touch.clientY;
      const rect = el.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      el.style.setProperty("transform", "none", "important");
      el.style.setProperty("left", `${Math.round(initialLeft)}px`, "important");
      el.style.setProperty("top", `${Math.round(initialTop)}px`, "important");
    }, { passive: true });

    window.addEventListener("touchmove", (e) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const maxW = window.innerWidth - el.offsetWidth - 8;
      const maxH = window.innerHeight - el.offsetHeight - 8;
      const newLeft = Math.max(8, Math.min(maxW, initialLeft + dx));
      const newTop = Math.max(8, Math.min(maxH, initialTop + dy));
      el.style.setProperty("transform", "none", "important");
      el.style.setProperty("left", `${Math.round(newLeft)}px`, "important");
      el.style.setProperty("top", `${Math.round(newTop)}px`, "important");
      el.style.setProperty("right", "auto", "important");
      el.style.setProperty("bottom", "auto", "important");
    }, { passive: true });

    window.addEventListener("touchend", () => {
      isDragging = false;
    }, { passive: true });
  }

  function keepHudAlive(ms = 7000) {
    if (STATE.hudVisible) {
      clearTimeout(toggleHud._t);
      toggleHud._t = setTimeout(() => hideHud(), ms);
    }
  }

  function bindHudButton(btn, handler) {
    if (!btn || btn._kiki_bound) return;
    btn._kiki_bound = true;
    let lastActionTime = 0;

    const runAction = (e) => {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      keepHudAlive();
      const now = Date.now();
      if (now - lastActionTime < 240) return;
      lastActionTime = now;
      try {
        handler(e);
      } catch (err) {
        console.error("[Kiki HUD button action]", err);
      }
    };

    btn.addEventListener("click", runAction);
    btn.addEventListener("touchend", runAction);
    btn.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      keepHudAlive();
    });
    btn.addEventListener("touchstart", (e) => {
      e.stopPropagation();
      keepHudAlive();
    }, { passive: false });
    btn.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      keepHudAlive();
    });
  }

  function ensureHud() {
    const targetHost = document.body || document.documentElement;
    if (!targetHost) return null;
    let hud = document.getElementById("kiki-hud");
    if (hud) {
      if (hud.parentElement !== targetHost) {
        targetHost.appendChild(hud);
      }
      // Strictly respect STATE.hudVisible - do not force visible when hidden
      if (!STATE.hudVisible) {
        if (hud.style.display !== "none") hud.style.setProperty("display", "none", "important");
        if (hud.style.visibility !== "hidden") hud.style.setProperty("visibility", "hidden", "important");
        if (hud.style.opacity !== "0") hud.style.setProperty("opacity", "0", "important");
      }
    }
    if (!hud) {
      hud = document.createElement("div");
      hud.id = "kiki-hud";
      const isVis = !!STATE.hudVisible;
      hud.style.cssText = `position: fixed !important; top: 64px !important; left: 50% !important; transform: translateX(-50%) !important; z-index: 2147483647 !important; display: ${isVis ? 'flex' : 'none'} !important; align-items: center !important; gap: 8px !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important; font-size: 13px !important; font-weight: 600 !important; background: rgba(20, 20, 24, 0.95) !important; backdrop-filter: blur(20px) saturate(180%) !important; -webkit-backdrop-filter: blur(20px) saturate(180%) !important; color: #FFFFFF !important; padding: 7px 15px !important; border-radius: 22px !important; border: 1.5px solid rgba(255, 255, 255, 0.4) !important; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.85) !important; pointer-events: auto !important; cursor: grab !important; visibility: ${isVis ? 'visible' : 'hidden'} !important; opacity: ${isVis ? '1' : '0'} !important; transition: opacity 0.2s ease, visibility 0.2s ease !important; user-select: none !important; -webkit-user-select: none !important; touch-action: none !important;`;
      setHtml(hud, `
        <div class="kiki-hud-dot" style="width: 10px !important; height: 10px !important; border-radius: 50% !important; background: #10B981 !important; flex-shrink: 0 !important; box-shadow: 0 0 10px #10B981 !important; cursor: pointer !important;" title="Click to hide bar"></div>
        <button type="button" class="kiki-hud-btn kiki-hud-settings" style="background: rgba(255, 255, 255, 0.2) !important; border-radius: 12px !important; padding: 4px 10px !important; font-size: 12px !important; cursor: pointer !important; border: 1px solid rgba(255, 255, 255, 0.3) !important; color: #FFFFFF !important; font-weight: 600 !important; white-space: nowrap !important; display: inline-flex !important; align-items: center !important; gap: 4px !important;" title="Open Settings (Dictionary & AI)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="opacity: 0.95; flex-shrink: 0; vertical-align: -1.5px;"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
          <span>Settings</span>
        </button>
        <button type="button" class="kiki-hud-btn kiki-hud-sub" style="background: rgba(255, 255, 255, 0.2) !important; border-radius: 12px !important; padding: 4px 10px !important; font-size: 12px !important; cursor: pointer !important; border: 1px solid rgba(255, 255, 255, 0.3) !important; color: #FFFFFF !important; font-weight: 600 !important; white-space: nowrap !important;" title="Toggle Subtitles Visibility">💬 Sub: On</button>
        <button type="button" class="kiki-hud-btn kiki-hud-cc" style="background: rgba(255, 255, 255, 0.2) !important; border-radius: 12px !important; padding: 4px 12px !important; font-size: 12px !important; cursor: pointer !important; border: 1px solid rgba(255, 255, 255, 0.3) !important; color: #FFFFFF !important; font-weight: 600 !important; white-space: nowrap !important; min-width: 140px !important; max-width: 250px !important; text-overflow: ellipsis !important; overflow: hidden !important;" title="Click to select subtitle track">CC: Searching... ▾</button>
        <button type="button" class="kiki-hud-btn kiki-hud-reload" style="background: rgba(255, 255, 255, 0.2) !important; border-radius: 12px !important; padding: 4px 10px !important; font-size: 12px !important; cursor: pointer !important; border: 1px solid rgba(255, 255, 255, 0.3) !important; color: #FFFFFF !important; font-weight: 600 !important; white-space: nowrap !important;" title="Reload Subtitles for Current Video">🔄 Reload</button>
        <button type="button" class="kiki-hud-btn kiki-hud-close" style="background: rgba(255, 255, 255, 0.1) !important; border-radius: 12px !important; padding: 4px 8px !important; font-size: 11px !important; cursor: pointer !important; border: 1px solid rgba(255, 255, 255, 0.2) !important; color: #A1A1AA !important; font-weight: 600 !important; line-height: 1 !important;" title="Hide Status Bar">✕</button>
      `);
      targetHost.appendChild(hud);
      makeDraggable(hud);

      const dot = hud.querySelector(".kiki-hud-dot");
      if (dot) {
        dot.addEventListener("click", (e) => {
          e.stopPropagation();
          e.preventDefault();
          if (typeof hideHud === "function") hideHud();
          else if (typeof toggleHud === "function") toggleHud(false);
        });
        dot.addEventListener("touchend", (e) => {
          e.stopPropagation();
          e.preventDefault();
          if (typeof hideHud === "function") hideHud();
          else if (typeof toggleHud === "function") toggleHud(false);
        });
      }

      const closeBtn = hud.querySelector(".kiki-hud-close");
      if (closeBtn) {
        bindHudButton(closeBtn, () => {
          if (typeof hideHud === "function") hideHud();
          else if (typeof toggleHud === "function") toggleHud(false);
        });
      }

      hud.addEventListener("pointerenter", () => {
        clearTimeout(toggleHud._t);
      });
      hud.addEventListener("pointerleave", () => {
        if (STATE.hudVisible) {
          clearTimeout(toggleHud._t);
          toggleHud._t = setTimeout(() => hideHud(), 3500);
        }
      });

      bindHudButton(hud.querySelector(".kiki-hud-settings"), () => {
        showSettingsModal("dict");
      });

      bindHudButton(hud.querySelector(".kiki-hud-sub"), () => {
        STATE.subsVisible = !(STATE.subsVisible !== false);
        localStorage.setItem("kiki_subs_visible", STATE.subsVisible ? "1" : "0");
        const box = $("#kiki-captions");
        if (box) {
          if (!STATE.subsVisible) {
            box.classList.add("kiki-hidden");
            closeLookup();
            toast("Subtitles hidden");
          } else {
            box.classList.remove("kiki-hidden");
            if (STATE.idx >= 0) renderCue(STATE.idx);
            toast("Subtitles enabled");
          }
        }
        updateHud();
      });

      bindHudButton(hud.querySelector(".kiki-hud-cc"), (e) => {
        const btn = hud.querySelector(".kiki-hud-cc");
        toggleTrackDropdown(btn);
      });

      bindHudButton(hud.querySelector(".kiki-hud-reload"), () => {
        toast("🔄 Reloading captions...");
        if (typeof window.reloadSubtitlesForVideo === "function") {
          window.reloadSubtitlesForVideo();
        } else if (typeof loadForVideo === "function") {
          loadForVideo(true);
        }
      });
    }

    return hud;
  }

  function closeTrackDropdown() {
    const d = document.getElementById("kiki-track-dropdown");
    if (d) d.remove();
    keepHudAlive(4000);
  }

  function toggleTrackDropdown(anchorBtn) {
    const existing = document.getElementById("kiki-track-dropdown");
    if (existing) {
      existing.remove();
      keepHudAlive(4000);
      return;
    }
    clearTimeout(toggleHud._t);
    const rect = anchorBtn ? anchorBtn.getBoundingClientRect() : null;
    const dropdown = document.createElement("div");
    dropdown.id = "kiki-track-dropdown";

    if (rect) {
      const top = Math.min(window.innerHeight - 280, rect.bottom + 8);
      const left = Math.max(10, Math.min(window.innerWidth - 260, rect.left + (rect.width / 2) - 120));
      dropdown.style.setProperty("top", `${Math.round(top)}px`, "important");
      dropdown.style.setProperty("left", `${Math.round(left)}px`, "important");
    } else {
      dropdown.style.setProperty("top", "110px", "important");
      dropdown.style.setProperty("left", "50%", "important");
      dropdown.style.setProperty("transform", "translateX(-50%)", "important");
    }

    const tracks = STATE.tracks || [];
    let itemsHtml = `<div class="kiki-dropdown-header">Available Tracks (${tracks.length})</div>`;

    if (!tracks.length) {
      itemsHtml += `
        <button type="button" class="kiki-dropdown-item" data-action="rescan">
          <span>🔍 No tracks discovered yet (Tap to scan)</span>
        </button>
      `;
    } else {
      tracks.forEach((t, idx) => {
        const lang = (t.languageCode || "").toUpperCase();
        const rawName = t.name?.simpleText || t.name || lang || "Track " + (idx + 1);
        const isAsr = t.kind === "asr";
        const tag = isAsr ? "Auto" : "Official";
        const isActive = STATE.activeTrack
          ? (STATE.activeTrack.baseUrl === t.baseUrl || (STATE.activeTrack.languageCode === t.languageCode && STATE.activeTrack.kind === t.kind))
          : (!STATE.liveMode && idx === 0 && STATE.cues?.length > 0);
        const check = isActive ? "✓ " : "";
        itemsHtml += `
          <button type="button" class="kiki-dropdown-item ${isActive ? 'active' : ''}" data-action="select-track" data-index="${idx}">
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${check}${escapeHtml(rawName)}</span>
            <span class="kiki-dropdown-tag">${tag}</span>
          </button>
        `;
      });
    }

    itemsHtml += `
      <div class="kiki-dropdown-sep"></div>
      <button type="button" class="kiki-dropdown-item ${STATE.liveMode ? 'active' : ''}" data-action="live-fallback">
        <span>${STATE.liveMode ? '✓ ' : ''}⚡ Realtime Subtitles (Fallback)</span>
        <span class="kiki-dropdown-tag">Live</span>
      </button>
      <button type="button" class="kiki-dropdown-item" data-action="reload-cc">
        <span>🔄 Reload All Subtitles</span>
      </button>
    `;

    setHtml(dropdown, itemsHtml);
    (document.body || document.documentElement).appendChild(dropdown);

    dropdown.addEventListener("click", (e) => {
      e.stopPropagation();
      const btn = e.target.closest(".kiki-dropdown-item");
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === "select-track") {
        const idx = parseInt(btn.dataset.index, 10);
        const trk = tracks[idx];
        if (trk && typeof window.selectSubtitleTrack === "function") {
          window.selectSubtitleTrack(trk);
        }
      } else if (action === "live-fallback") {
        if (typeof window.switchToLiveSubtitles === "function") {
          window.switchToLiveSubtitles();
        } else {
          STATE.liveMode = true;
          STATE.liveFallbackAllowed = true;
          STATE.cues = [];
          renderCue(-1);
          updateHud("CC: Live ▾");
          toast("Switched to Live Subtitles");
        }
      } else if (action === "reload-cc" || action === "rescan") {
        toast("🔄 Reloading captions...");
        if (typeof window.reloadSubtitlesForVideo === "function") {
          window.reloadSubtitlesForVideo();
        } else if (typeof loadForVideo === "function") {
          loadForVideo(true);
        }
      }
      closeTrackDropdown();
    });

    const outsideClick = (e) => {
      if (!dropdown.contains(e.target) && (!anchorBtn || !anchorBtn.contains(e.target))) {
        closeTrackDropdown();
        document.removeEventListener("click", outsideClick);
        document.removeEventListener("touchstart", outsideClick);
      }
    };
    setTimeout(() => {
      document.addEventListener("click", outsideClick);
      document.addEventListener("touchstart", outsideClick, { passive: true });
    }, 50);
  }

  function updateHud(statusText) {
    const hud = ensureHud();
    if (!hud) return;
    const subBtn = hud.querySelector(".kiki-hud-sub");
    const ccBtn = hud.querySelector(".kiki-hud-cc");

    if (subBtn) {
      const on = STATE.subsVisible !== false;
      const targetText = on ? "💬 Sub: On" : "💬 Sub: Off";
      if (subBtn.textContent !== targetText) subBtn.textContent = targetText;
      const targetBg = on ? "rgba(16, 185, 129, 0.25)" : "rgba(255, 255, 255, 0.1)";
      const targetBorder = on ? "rgba(52, 211, 153, 0.4)" : "rgba(255, 255, 255, 0.2)";
      const targetColor = on ? "#6EE7B7" : "#A1A1AA";
      if (subBtn.dataset.active !== (on ? "1" : "0")) {
        subBtn.dataset.active = on ? "1" : "0";
        subBtn.style.setProperty("background", targetBg, "important");
        subBtn.style.setProperty("border-color", targetBorder, "important");
        subBtn.style.setProperty("color", targetColor, "important");
      }
    }

    if (ccBtn) {
      let targetCc = "CC: Searching... ▾";
      if (statusText) {
        targetCc = statusText.includes("▾") ? statusText : statusText + " ▾";
      } else if (!currentVideoId()) {
        targetCc = "Home ▾";
      } else if (STATE.cues && STATE.cues.length) {
        const rawName = STATE.activeTrack?.name?.simpleText || STATE.activeTrack?.languageCode?.toUpperCase() || "Track";
        const shortName = rawName.length > 14 ? rawName.slice(0, 12) + "…" : rawName;
        targetCc = `CC: ${shortName} · ${STATE.cues.length} ▾`;
      } else if (STATE.liveMode || STATE.lastObservedText || (typeof lastObservedText !== "undefined" && lastObservedText)) {
        const trkName = STATE.activeTrack?.name?.simpleText || "";
        targetCc = trkName ? `CC: Live (${trkName.slice(0, 10)}) ▾` : "CC: Live ▾";
      } else if (STATE.loadingTracks) {
        targetCc = "CC: Loading... ▾";
      } else if (STATE.tracks && STATE.tracks.length > 0) {
        const rawName = STATE.activeTrack?.name?.simpleText || STATE.activeTrack?.languageCode?.toUpperCase() || "Track";
        const shortName = rawName.length > 14 ? rawName.slice(0, 12) + "…" : rawName;
        targetCc = `CC: ${shortName} ▾`;
      } else {
        targetCc = "CC: None ▾";
      }
      if (ccBtn.textContent !== targetCc) ccBtn.textContent = targetCc;
      if (ccBtn.getAttribute("title") !== "Click to select subtitle track") {
        ccBtn.setAttribute("title", "Click to select subtitle track");
      }
    }
  }

  function ensureRoot() {
    let root = document.getElementById("kiki-root");
    const targetHost = document.body || document.documentElement;
    if (!root && targetHost) {
      root = document.createElement("div");
      root.id = "kiki-root";
      root.style.cssText = "position: fixed !important; inset: 0 !important; pointer-events: none !important; z-index: 2147483640 !important;";
      setHtml(root, `
        <div id="kiki-captions" class="${STATE.subsVisible === false ? 'kiki-hidden' : ''}" style="position: fixed !important; pointer-events: auto !important; z-index: 2147483645 !important; text-align: center !important; min-height: 1em !important;"></div>
      `);
      targetHost.appendChild(root);
    }
    if (root && root.parentElement !== targetHost && targetHost) {
      targetHost.appendChild(root);
    }

    ensureYomitanCard();
    if (typeof ensureCaptionObserver === "function") ensureCaptionObserver();
    if (typeof bindVideoTrackListeners === "function") bindVideoTrackListeners();
    if (root) root.style.display = STATE.enabled ? "" : "none";
    document.documentElement.classList.toggle("kiki-hide-native", !!(STATE.enabled && (STATE.cues.length > 0 || (typeof lastObservedText !== "undefined" && lastObservedText))));
    document.documentElement.classList.toggle("kiki-lock-chrome", !!STATE.enabled);
    return root;
  }
  window.ensureRoot = ensureRoot;

  function getVideoRenderedRect(v) {
    const r = v.getBoundingClientRect();
    const videoWidth = v.videoWidth;
    const videoHeight = v.videoHeight;
    if (!videoWidth || !videoHeight || !r.width || !r.height) return r;

    const containerRatio = r.width / r.height;
    const videoRatio = videoWidth / videoHeight;

    let renderWidth = r.width;
    let renderHeight = r.height;
    let left = r.left;
    let top = r.top;

    if (videoRatio > containerRatio) {
      renderHeight = r.width / videoRatio;
      top = r.top + (r.height - renderHeight) / 2;
    } else {
      renderWidth = r.height * videoRatio;
      left = r.left + (r.width - renderWidth) / 2;
    }

    return {
      left,
      top,
      width: renderWidth,
      height: renderHeight,
      right: left + renderWidth,
      bottom: top + renderHeight
    };
  }

  function updateCaptionPosition() {
    const box = document.getElementById("kiki-captions");
    if (!box) return;
    if (STATE.subsVisible === false) {
      box.classList.add("kiki-hidden");
      return;
    }
    box.classList.remove("kiki-hidden");
    const v = videoEl() || playerEl();
    const showChrome = document.documentElement.classList.contains("kiki-show-chrome");
    
    // Check if native chrome bottom controls or progress bar are visible
    const cb = document.querySelector(".ytp-chrome-bottom");
    let chromeHeight = 0;
    if (showChrome && cb) {
      const cbRect = cb.getBoundingClientRect();
      chromeHeight = cbRect.height || 64;
    }
    // When native controls are visible: jump up 128px (above control bar & scrubber)
    // When native controls are hidden: settle at 38px above video picture bottom
    // Calculate distance from bottom of viewport to bottom of video
    if (v) {
      const r = getVideoRenderedRect(v);
      if (r.width > 0 && r.height > 0) {
        const bottomOffset = (window.innerHeight - r.bottom) + (showChrome ? Math.max(128, Math.round(chromeHeight + 68)) : 38);
        box.style.setProperty("position", "fixed", "important");
        box.style.setProperty("left", `${Math.round(r.left + r.width / 2)}px`, "important");
        box.style.setProperty("bottom", `${Math.round(bottomOffset)}px`, "important");
        box.style.setProperty("top", "auto", "important");
        box.style.setProperty("transform", "translateX(-50%)", "important");
        box.style.setProperty("width", `${Math.min(1000, Math.round(r.width * 0.94))}px`, "important");
        return;
      }
    }

    const fallbackBottom = showChrome ? 138 : 52;
    box.style.setProperty("position", "fixed", "important");
    box.style.setProperty("left", "50%", "important");
    box.style.setProperty("bottom", `${fallbackBottom}px`, "important");
    box.style.setProperty("top", "auto", "important");
    box.style.setProperty("transform", "translateX(-50%)", "important");
    box.style.setProperty("width", "min(94%, 1000px)", "important");
  }
  window.updateCaptionPosition = updateCaptionPosition;

  // -------------------------------------------------------------
  // 7. Yomitan Card & Word Lookup
  // -------------------------------------------------------------
  function ensureYomitanCard() {
    let card = $("#kiki-yomitan-card");
    if (!card) {
      card = document.createElement("div");
      card.id = "kiki-yomitan-card";
      (document.body || document.documentElement).appendChild(card);
    }
    return card;
  }

  let lastWordPointerTime = 0;
  let lastWordPointerEl = null;

  async function onWordPointer(e) {
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();

    const w = e.currentTarget;
    const now = Date.now();
    if (lastWordPointerEl === w && (now - lastWordPointerTime < 350)) {
      return;
    }
    lastWordPointerTime = now;
    lastWordPointerEl = w;

    const term = (w.dataset.word || w.textContent).trim();
    if (!term) return;

    const card = $("#kiki-yomitan-card");
    const isCardOpen = card && card.classList.contains("show");

    // If card is open, clicking the active word (or any word in the active phrase) closes the card and resumes playback immediately
    if (isCardOpen && (STATE.lookupEl === w || STATE.lookupWord === term || (STATE.lookupWord && STATE.lookupWord.toLowerCase().includes(term.toLowerCase())) || w.classList.contains("kiki-active"))) {
      closeLookup();
      return;
    }

    pauseVideoSync();
    STATE.pausedForLookup = true;

    document.querySelectorAll(".kiki-word.kiki-active").forEach((n) => n.classList.remove("kiki-active"));
    w.classList.add("kiki-active");
    STATE.lookupEl = w;
    STATE.lookupWord = term;

    showYomitanCard(w, term);
  }



  function positionCardAboveSubtitles(card) {
    const capBox = document.getElementById("kiki-captions");
    const pad = 14;
    const capRect = capBox ? capBox.getBoundingClientRect() : { top: window.innerHeight - 100 };

    card.style.position = "fixed";
    card.style.left = "50%";
    card.style.transform = "translateX(-50%)";
    card.style.width = `min(600px, calc(100vw - 28px))`;
    card.style.right = "auto";
    const bottomOffset = window.innerHeight - capRect.top + 14;
    card.style.bottom = `${Math.max(70, Math.round(bottomOffset))}px`;
    card.style.top = "auto";
    const availHeight = Math.round(capRect.top - pad * 2);
    card.style.maxHeight = `${Math.min(620, Math.max(380, availHeight))}px`;
  }

  window.positionFloatingCard = positionFloatingCard;
  function positionFloatingCard(card, x, y) {
    const pad = 14;
    const cardWidth = Math.min(540, window.innerWidth - pad * 2);

    let left = x - 40;
    if (left + cardWidth > window.innerWidth - pad) {
      left = window.innerWidth - cardWidth - pad;
    }
    if (left < pad) {
      left = pad;
    }

    const spaceBelow = window.innerHeight - (y + 18) - pad;
    const spaceAbove = y - 18 - pad;

    let top = "auto";
    let bottom = "auto";
    let maxHeight = 420;

    if (spaceBelow >= 240 || spaceBelow >= spaceAbove) {
      top = `${Math.round(y + 18)}px`;
      bottom = "auto";
      maxHeight = Math.min(520, Math.max(220, spaceBelow));
    } else {
      bottom = `${Math.round(window.innerHeight - y + 14)}px`;
      top = "auto";
      maxHeight = Math.min(520, Math.max(220, spaceAbove));
    }

    card.style.setProperty("position", "fixed", "important");
    card.style.setProperty("left", `${Math.round(left)}px`, "important");
    card.style.setProperty("transform", "none", "important");
    card.style.setProperty("top", top, "important");
    card.style.setProperty("bottom", bottom, "important");
    card.style.setProperty("width", `${Math.round(cardWidth)}px`, "important");
    card.style.setProperty("max-width", `calc(100vw - 28px)`, "important");
    card.style.setProperty("max-height", `${Math.round(maxHeight)}px`, "important");
  }

  function getSentenceContext() {
    if (STATE.sentenceContext) return STATE.sentenceContext;
    if (STATE.idx >= 0 && STATE.idx < STATE.cues.length) {
      return (STATE.cues[STATE.idx].text || "").trim();
    }
    const capBox = document.getElementById("kiki-captions");
    if (capBox) {
      const line = capBox.querySelector(".kiki-line");
      if (line) {
        const clone = line.cloneNode(true);
        clone.querySelectorAll(".kiki-cap-ai-btn").forEach(b => b.remove());
        return (clone.textContent || "").trim();
      }
    }
    return "";
  }

  function renderNoDefinitionCard(card, term) {
    setHtml(card, `
      <div class="kiki-card-header">
        <div class="kiki-card-term-row" style="justify-content: space-between; align-items: center;">
          <span class="kiki-card-term">${escapeHtml(term)}</span>
          <button type="button" class="kiki-card-close-btn" style="background: transparent; border: none; color: #BBB; font-size: 20px; cursor: pointer; line-height: 1; padding: 0 4px;">&times;</button>
        </div>
      </div>
      <div class="kiki-card-empty" style="padding: 10px 4px 6px;">
        <div style="font-size: 14px; font-weight: 700; margin-bottom: 6px; color: #FFF;">No definition found in local dictionary.</div>
        <div style="font-size: 12px; opacity: 0.85; margin-bottom: 14px; line-height: 1.4; color: #DDD;">
          Import an offline dictionary package or configure your AI API key for contextual fallback explanations:
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <label class="kiki-import-trigger-btn" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px; background: #2563EB; color: #FFFFFF; padding: 9px 16px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; user-select: none;">
            <span>📥 Import Yomitan Dictionary (.zip)</span>
            <input type="file" class="kiki-card-file-input" accept=".zip" style="display: none;">
          </label>
          <button type="button" class="kiki-card-open-ai-cfg-btn" style="background: rgba(99, 102, 241, 0.25); color: #C7D2FE; border: 1px solid rgba(165, 180, 252, 0.4); border-radius: 8px; padding: 9px 16px; font-size: 12px; font-weight: 600; cursor: pointer;">
            🤖 Configure AI API Key (Auto Fallback)
          </button>
          <div class="kiki-card-progress" style="display: none; flex-direction: column; gap: 5px; margin-top: 6px;">
            <div style="background: rgba(255, 255, 255, 0.15); border-radius: 4px; overflow: hidden; height: 6px;">
              <div class="kiki-card-prog-fill" style="background: #10B981; height: 100%; width: 0%; transition: width 0.2s;"></div>
            </div>
            <span class="kiki-card-prog-text" style="font-size: 11px; opacity: 0.9; color: #EEE;">Preparing...</span>
          </div>
        </div>
      </div>
    `);

    card.querySelector(".kiki-card-close-btn")?.addEventListener("click", () => {
      closeLookup();
    });

    card.querySelector(".kiki-card-open-ai-cfg-btn")?.addEventListener("click", () => {
      showSettingsModal("ai");
    });

    const fileInput = card.querySelector(".kiki-card-file-input");
    if (fileInput) {
      fileInput.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const progContainer = card.querySelector(".kiki-card-progress");
        const progFill = card.querySelector(".kiki-card-prog-fill");
        const progText = card.querySelector(".kiki-card-prog-text");
        if (progContainer) progContainer.style.display = "flex";

        try {
          toast("Starting Dictionary Import...");
          const dictInfo = await localImporter.importZip(file, ({ message, percentage }) => {
            if (progFill) progFill.style.width = percentage + "%";
            if (progText) progText.textContent = `${percentage}%: ${message}`;
          });
          await refreshDictStats();
          toast(`✦ Installed: ${dictInfo.title} (${dictInfo.termCount.toLocaleString()} terms)`);
          const newRes = await localSearch.search(term);
          if (newRes && newRes.length) {
            renderYomitanDefinitions(card, term, newRes);
            localAudio.play(newRes[0].term || term, newRes[0].reading || '');
          }
        } catch (err) {
          console.error("[Kiki dict import error]", err);
          toast("Import error: " + err.message);
          if (progText) progText.textContent = "Error: " + err.message;
        }
      });
    }
  }


  async function showYomitanCard(wordEl, term, coords = null, sentenceOverride = "") {
    window.showYomitanCard = showYomitanCard;
    STATE.lookupWord = term;
    STATE.lookupEl = wordEl;
    STATE.sentenceContext = sentenceOverride || "";
    const card = ensureYomitanCard();
    setHtml(card, `
      <div class="kiki-card-header">
        <div class="kiki-card-term-row">
          <span class="kiki-card-term">${escapeHtml(term)}</span>
          <span class="kiki-card-reading">Looking up…</span>
        </div>
      </div>
    `);
    card.classList.add("show");

    if (coords && typeof coords.x === "number") {
      positionFloatingCard(card, coords.x, coords.y);
    } else {
      positionCardAboveSubtitles(card);
    }

    const results = await lookupWord(term, wordEl);
    if (!card.classList.contains("show") || (STATE.lookupWord !== term && !results.some((r) => r.term.toLowerCase() === STATE.lookupWord.toLowerCase()))) return;

    if (!results || !results.length) {
      const cfg = getAiConfig();
      if (cfg.apiKey && cfg.apiKey.trim()) {
        explainWithAiInCard(card, term, getSentenceContext());
        return;
      }
      renderNoDefinitionCard(card, term);
      return;
    }

    // If top result is a multi-word phrase, update STATE.lookupWord to match the primary recognized term
    if (results[0]?.term) {
      STATE.lookupWord = results[0].term;
    }

    renderYomitanDefinitions(card, term, results);

    // Auto-play audio pronunciation synchronously on word lookup
    const primeReading = results[0]?.reading || "";
    localAudio.play(results[0]?.term || term, primeReading);
  }

  function renderYomitanDefinitions(card, originalTerm, results) {
    card.textContent = "";
    results.forEach((res, idx) => {
      const entryDiv = document.createElement("div");
      entryDiv.className = "kiki-card-entry";
      if (idx > 0) {
        entryDiv.style.borderTop = "1px solid rgba(255, 255, 255, 0.15)";
        entryDiv.style.marginTop = "14px";
        entryDiv.style.paddingTop = "14px";
      }

      const header = document.createElement("div");
      header.className = "kiki-card-header";

      const row = document.createElement("div");
      row.className = "kiki-card-term-row";

      const termSpan = document.createElement("span");
      termSpan.className = "kiki-card-term";
      termSpan.textContent = res.term;
      row.appendChild(termSpan);

      // Interactive Yomitan Audio Pronunciation Button
      const audioBtn = document.createElement("button");
      audioBtn.type = "button";
      audioBtn.className = "kiki-card-audio-btn";
      audioBtn.title = "Play pronunciation audio";
      audioBtn.textContent = "🔊";
      audioBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        localAudio.play(res.term, res.reading);
      });
      row.appendChild(audioBtn);

      if (idx === 0) {
        const aiSwitchBtn = document.createElement("button");
        aiSwitchBtn.type = "button";
        aiSwitchBtn.className = "kiki-card-ai-switch-btn";
        aiSwitchBtn.title = "Force AI Context Explanation";
        aiSwitchBtn.textContent = "✦ Ask AI";
        aiSwitchBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const cfg = getAiConfig();
          if (!cfg.apiKey || !cfg.apiKey.trim()) {
            showSettingsModal("ai");
            toast("Please configure your AI API Key first.");
            return;
          }
          explainWithAiInCard(card, results[0]?.term || originalTerm, getSentenceContext());
        });
        row.appendChild(aiSwitchBtn);

        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "kiki-card-close-btn";
        closeBtn.style.cssText = "margin-left: auto; background: transparent; border: none; color: #BBB; font-size: 20px; cursor: pointer; line-height: 1; padding: 0 4px;";
        closeBtn.innerHTML = "&times;";
        closeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          closeLookup();
        });
        row.appendChild(closeBtn);
      }

      if (res.reading && res.reading !== res.term) {
        const rSpan = document.createElement("span");
        rSpan.className = "kiki-card-reading";
        rSpan.textContent = `/${res.reading}/`;
        row.appendChild(rSpan);
      }

      header.appendChild(row);

      // Badges Row (Aligned with Hub Specifications)
      const badges = document.createElement("div");
      badges.className = "kiki-card-badges";

      if (res.isRedirect || res.redirectTo) {
        const b = document.createElement("span");
        b.className = "kiki-badge kiki-badge-redirect";
        b.textContent = `→ ${res.redirectTo || originalTerm}`;
        badges.appendChild(b);
      } else if (res.reason) {
        const b = document.createElement("span");
        b.className = "kiki-badge kiki-badge-redirect";
        b.textContent = `← ${res.reason}`;
        badges.appendChild(b);
      }

      (res.dictionaries || []).forEach((dict) => {
        const b = document.createElement("span");
        b.className = "kiki-badge kiki-badge-dict";
        b.textContent = dict;
        badges.appendChild(b);
      });

      (res.pos || []).forEach((pos) => {
        const b = document.createElement("span");
        b.className = "kiki-badge kiki-badge-pos";
        b.textContent = pos;
        badges.appendChild(b);
      });

      (res.level || []).forEach((lvl) => {
        const b = document.createElement("span");
        b.className = "kiki-badge kiki-badge-level";
        b.textContent = lvl;
        badges.appendChild(b);
      });

      (res.vocab || []).forEach((vcb) => {
        const b = document.createElement("span");
        b.className = "kiki-badge kiki-badge-vocab";
        b.textContent = vcb;
        badges.appendChild(b);
      });

      if (badges.children.length > 0) {
        header.appendChild(badges);
      }
      entryDiv.appendChild(header);

      const body = document.createElement("div");
      body.className = "kiki-card-body";

      if (res.glossary && res.glossary.length) {
        res.glossary.forEach((item) => {
          if (typeof item === "string") {
            const p = document.createElement("p");
            p.textContent = item;
            body.appendChild(p);
          } else if (typeof item === "object" && item !== null) {
            body.appendChild(KikiStructuredContent.render(item));
          }
        });
      }

      entryDiv.appendChild(body);
      card.appendChild(entryDiv);
    });
  }

  window.closeLookup = closeLookup;
  function closeLookup(resume = true) {
    abortActiveAi();
    STATE.lookupEl = null;
    STATE.lookupWord = "";
    STATE.sentenceContext = "";
    try {
      if (window.getSelection) {
        window.getSelection().removeAllRanges();
      }
    } catch {}
    document.querySelectorAll(".kiki-word.kiki-active").forEach((n) => n.classList.remove("kiki-active"));

    const card = $("#kiki-yomitan-card");
    if (card) card.classList.remove("show");

    const wasPausedByKiki = Boolean(STATE.pausedForLookup);
    STATE.pausedForLookup = false;
    if (resume && wasPausedByKiki) {
      playVideoSync();
    }
  }

  function isAnyPopupOpen() {
    const card = document.getElementById("kiki-yomitan-card");
    const modal = document.getElementById("kiki-settings-modal");
    return Boolean(
      (card && card.classList.contains("show")) ||
      STATE.lookupEl ||
      STATE.pausedForLookup ||
      (modal && modal.style.display !== "none")
    );
  }
  window.isAnyPopupOpen = isAnyPopupOpen;

  function dismissAllPopups(resume = true) {
    STATE.lastLookupDismissTime = Date.now();
    if (typeof window.__kiki_cancelSingleTap === "function") {
      window.__kiki_cancelSingleTap();
    }
    const modal = document.getElementById("kiki-settings-modal");
    if (modal && modal.style.display !== "none") {
      modal.style.display = "none";
    }
    closeLookup(resume);
  }
  window.dismissAllPopups = dismissAllPopups;

  // Unified popup dismissal: capture events on window to cleanly dismiss and resume without single-tap conflict
  const popupDismissEvents = ["pointerdown", "mousedown", "pointerup", "mouseup", "touchstart", "touchend", "click"];
  popupDismissEvents.forEach((type) => {
    window.addEventListener(type, (e) => {
      // Allow interaction inside popup card, words, AI button, settings modal, HUD, and toasts
      if (e.target && typeof e.target.closest === "function" &&
          e.target.closest("#kiki-yomitan-card, .kiki-word, .kiki-cap-ai-btn, #kiki-settings-modal, #kiki-hud, .kiki-toast")) {
        return;
      }

      const isOpen = isAnyPopupOpen();
      const withinGrace = (Date.now() - (STATE.lastLookupDismissTime || 0)) < 600;

      if (isOpen) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        dismissAllPopups(true);
      } else if (withinGrace) {
        // Swallow remaining events of the dismissal gesture (e.g. mouseup, click)
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    }, { capture: true });
  });


  async function clearAllStorageAndConfig() {
    if (confirm("Are you sure you want to clear ALL dictionaries, local storage, and AI configurations? This action cannot be undone.")) {
      await localDB.clearAllStorage();
      localStorage.removeItem("kiki_ai_base");
      localStorage.removeItem("kiki_ai_key");
      localStorage.removeItem("kiki_ai_model");
      localStorage.removeItem("kiki_ai_lang");
      localStorage.removeItem("kiki_ai_prompt_zh");
      localStorage.removeItem("kiki_ai_prompt_en");
      await refreshDictStats();
      toast("✦ All dictionaries and AI configurations cleared.");
      showSettingsModal("dict");
    }
  }

  async function showSettingsModal(initialTab = "dict") {
    let modal = document.getElementById("kiki-settings-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "kiki-settings-modal";
      modal.style.cssText = `
        position: fixed !important;
        top: 50% !important;
        left: 50% !important;
        transform: translate(-50%, -50%) !important;
        width: min(92vw, 500px) !important;
        max-height: 88vh !important;
        background: rgba(22, 22, 26, 0.96) !important;
        backdrop-filter: blur(24px) saturate(180%) !important;
        -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
        border: 1px solid rgba(255, 255, 255, 0.2) !important;
        border-radius: 18px !important;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.75) !important;
        z-index: 2147483647 !important;
        color: #FFFFFF !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        padding: 20px !important;
        box-sizing: border-box !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 14px !important;
        touch-action: manipulation !important;
        pointer-events: auto !important;
      `;
      const stopProp = (e) => e.stopPropagation();
      modal.addEventListener("pointerdown", stopProp);
      modal.addEventListener("touchstart", stopProp);
      modal.addEventListener("mousedown", stopProp);
      (document.body || document.documentElement).appendChild(modal);
    }

    modal.style.display = "flex";
    keepHudAlive(15000);
    let activeTab = initialTab;

    async function renderModal() {
      const dicts = await localDB.getDictionaries();
      const aiCfg = getAiConfig();

      let contentHtml = "";

      if (activeTab === "dict") {
        let listHtml = "";
        if (!dicts || !dicts.length) {
          listHtml = `<div style="font-size: 13px; color: #AAA; padding: 16px 0; text-align: center;">No dictionaries installed yet in YouTube offline storage.</div>`;
        } else {
          listHtml = dicts.map(d => `
            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255, 255, 255, 0.08); padding: 10px 14px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.1);">
              <div style="display: flex; flex-direction: column; gap: 2px;">
                <span style="font-size: 13px; font-weight: 600; color: #FFF;">${escapeHtml(d.title)}</span>
                <span style="font-size: 11px; color: #AAA;">${(d.termCount || 0).toLocaleString()} entries</span>
              </div>
              <button type="button" class="kiki-del-dict-btn" data-id="${escapeHtml(d.id)}" style="background: rgba(239, 68, 68, 0.25); color: #FCA5A5; border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 6px; padding: 4px 8px; font-size: 11px; cursor: pointer;">Delete</button>
            </div>
          `).join("");
        }

        contentHtml = `
          <div style="display: flex; flex-direction: column; gap: 8px; max-height: 220px; overflow-y: auto;">
            ${listHtml}
          </div>

          <div style="display: flex; flex-direction: column; gap: 10px; border-top: 1px solid rgba(255, 255, 255, 0.15); padding-top: 12px;">
            <label style="display: inline-flex; align-items: center; justify-content: center; gap: 6px; background: #2563EB; color: #FFFFFF; padding: 10px 14px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; user-select: none;">
              <span>📥 Import Yomitan Dict (.zip)</span>
              <input type="file" class="kiki-modal-file-input" accept=".zip" style="display: none;">
            </label>
            <div class="kiki-modal-progress" style="display: none; flex-direction: column; gap: 6px;">
              <div style="background: rgba(255, 255, 255, 0.15); border-radius: 4px; overflow: hidden; height: 6px;">
                <div class="kiki-modal-prog-fill" style="background: #10B981; height: 100%; width: 0%; transition: width 0.2s;"></div>
              </div>
              <span class="kiki-modal-prog-text" style="font-size: 11px; opacity: 0.9; color: #EEE;">Preparing...</span>
            </div>

            <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 10px 12px; margin-top: 4px;">
              <div style="font-size: 12px; font-weight: 700; color: #E2E8F0; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between;">
                <span>🌐 全局网页查词修饰键 (Web Lookup)</span>
                <span style="font-size: 11px; color: #94A3B8;">按住修饰键点击即查</span>
              </div>
              <select id="kiki-web-lookup-key-select" style="width: 100%; background: rgba(0, 0, 0, 0.4); color: #FFF; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; padding: 6px 10px; font-size: 12px; font-family: inherit; outline: none;">
                <option value="ctrl" ${(STATE.webLookupKey || localStorage.getItem("kiki_web_lookup_key") || "ctrl") === "ctrl" ? "selected" : ""}>Ctrl 键 (默认)</option>
                <option value="alt" ${(STATE.webLookupKey || localStorage.getItem("kiki_web_lookup_key")) === "alt" ? "selected" : ""}>Option / Alt 键</option>
                <option value="meta" ${(STATE.webLookupKey || localStorage.getItem("kiki_web_lookup_key")) === "meta" ? "selected" : ""}>Command / Meta 键</option>
                <option value="ctrl_or_meta" ${(STATE.webLookupKey || localStorage.getItem("kiki_web_lookup_key")) === "ctrl_or_meta" ? "selected" : ""}>Ctrl 或 Command 键</option>
              </select>
            </div>
          </div>
        `;
            } else if (activeTab === "about") {
        const cacheTime = localStorage.getItem("kiki_cache_time") || "Initial / Local";
        const engineVer = window.__kiki_engine_version || localStorage.getItem("kiki_engine_version") || localStorage.getItem("kiki_cache_version") || "1.2.5";
        const loaderVer = window.__kiki_loader_version || localStorage.getItem("kiki_loader_version") || "1.0.1";
        const modulesList = ["core", "yomitan", "ai", "ui", "youtube"];
        const modStatus = modulesList.map(m => {
          const has = !!localStorage.getItem("kiki_mod_" + m);
          return `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;color:#CBD5E1;border-bottom:1px dashed rgba(255,255,255,0.08);">
            <span>• ${m}.js</span>
            <span style="color:${has ? '#34D399' : '#818CF8'};font-weight:600;">${has ? 'Cached' : 'Active'}</span>
          </div>`;
        }).join("");

        contentHtml = `
          <div style="display: flex; flex-direction: column; gap: 12px; max-height: 420px; overflow-y: auto; padding-right: 4px;">
            <div style="background: rgba(99, 102, 241, 0.12); border: 1px solid rgba(165, 180, 252, 0.25); border-radius: 12px; padding: 12px 14px;">
              <div style="font-size: 16px; font-weight: 800; color: #FFF; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span>✦ Kiki Immersion</span>
                <span style="background: linear-gradient(135deg, #2563EB, #3B82F6); font-size: 11px; padding: 2px 7px; border-radius: 6px; font-weight: 700;">Engine v${engineVer}</span>
                <span style="background: rgba(255, 255, 255, 0.12); font-size: 11px; padding: 2px 7px; border-radius: 6px; color: #CBD5E1; font-weight: 600;">Loader v${loaderVer}</span>
              </div>
              <div style="font-size: 12px; color: #94A3B8; margin-top: 4px; line-height: 1.45;">
                Touch & Mouse YouTube Immersion with Offline Yomitan, High-DPI Subtitles, AI Context & Hot-Reload Engine.
              </div>
            </div>

            <div style="background: rgba(255, 255, 255, 0.05); border-radius: 10px; padding: 10px 12px;">
              <div style="font-size: 12px; font-weight: 700; color: #E2E8F0; margin-bottom: 6px;">📦 Core Modules Status</div>
              ${modStatus}
              <div style="font-size: 11px; color: #94A3B8; margin-top: 8px;">
                Cache Status: <span style="color: #E2E8F0;">${escapeHtml(cacheTime)}</span>
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px;">
              <button type="button" id="kiki-hot-reload-btn" style="background: linear-gradient(135deg, #2563EB, #6366F1); color: #FFF; border: none; border-radius: 10px; padding: 10px 14px; font-size: 13px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 4px 12px rgba(37,99,235,0.35);">
                <span>⚡ Check & Update Modules from GitHub (Hot-Reload)</span>
              </button>
              <button type="button" id="kiki-clear-cache-btn" style="background: rgba(255, 255, 255, 0.08); color: #CBD5E1; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 10px; padding: 8px 14px; font-size: 12px; font-weight: 600; cursor: pointer;">
                🗑 Clear Local Module Cache
              </button>
              <a href="https://github.com/kekeqwq/Kiki-Immersion" target="_blank" rel="noopener" style="text-align: center; font-size: 12px; color: #818CF8; text-decoration: none; padding-top: 4px;">
                🔗 GitHub Repository (kekeqwq/Kiki-Immersion)
              </a>
            </div>
          </div>
        `;
} else if (activeTab === "ai") {
        contentHtml = `
          <div style="display: flex; flex-direction: column; gap: 12px; max-height: 420px; overflow-y: auto; padding-right: 4px;">
            <div>
              <label style="display: block; font-size: 11.5px; font-weight: 600; color: #94A3B8; margin-bottom: 4px;">API BASE URL</label>
              <input type="text" id="kiki-ai-base-input" value="${escapeHtml(aiCfg.apiBase)}" placeholder="https://api.openai.com/v1" style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 8px 12px; color: #FFF; font-size: 13px;">
            </div>

            <div>
              <label style="display: block; font-size: 11.5px; font-weight: 600; color: #94A3B8; margin-bottom: 4px;">API KEY (OPENAI COMPATIBLE)</label>
              <div style="display: flex; gap: 6px;">
                <input type="password" id="kiki-ai-key-input" value="${escapeHtml(aiCfg.apiKey)}" placeholder="sk-..." style="flex: 1; box-sizing: border-box; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 8px 12px; color: #FFF; font-size: 13px;">
                <button type="button" id="kiki-ai-key-toggle" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #FFF; border-radius: 8px; padding: 0 10px; font-size: 11px; cursor: pointer;">Show</button>
              </div>
            </div>

            <div style="display: flex; gap: 10px;">
              <div style="flex: 1;">
                <label style="display: block; font-size: 11.5px; font-weight: 600; color: #94A3B8; margin-bottom: 4px;">MODEL</label>
                <input type="text" id="kiki-ai-model-input" value="${escapeHtml(aiCfg.apiModel)}" placeholder="gpt-4o-mini" style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 8px 12px; color: #FFF; font-size: 13px;">
              </div>
              <div style="width: 130px;">
                <label style="display: block; font-size: 11.5px; font-weight: 600; color: #94A3B8; margin-bottom: 4px;">LANGUAGE</label>
                <select id="kiki-ai-lang-select" style="width: 100%; box-sizing: border-box; background: #18181B; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 8px 10px; color: #FFF; font-size: 13px;">
                  <option value="zh" ${aiCfg.aiLang === "zh" ? "selected" : ""}>中文 (Zh)</option>
                  <option value="en" ${aiCfg.aiLang === "en" ? "selected" : ""}>English (En)</option>
                </select>
              </div>
            </div>

            <div style="display: flex; gap: 10px;">
              <div style="flex: 1;">
                <label style="display: block; font-size: 11.5px; font-weight: 600; color: #94A3B8; margin-bottom: 4px;">AI EXPLANATION MODE</label>
                <select id="kiki-ai-mode-select" style="width: 100%; box-sizing: border-box; background: #18181B; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 8px 10px; color: #FFF; font-size: 13px;">
                  <option value="quick" ${aiCfg.aiMode === "quick" ? "selected" : ""}>⚡ Quick Glance (2-4 sentences, minimal distraction)</option>
                  <option value="deep" ${aiCfg.aiMode === "deep" ? "selected" : ""}>📚 Deep Study (Detailed syntax, collocations & examples)</option>
                  <option value="custom" ${aiCfg.aiMode === "custom" ? "selected" : ""}>⚙️ Custom Prompt Template</option>
                </select>
              </div>
              <div style="width: 175px;">
                <label style="display: block; font-size: 11.5px; font-weight: 600; color: #94A3B8; margin-bottom: 4px;">MAX TOKENS LIMIT</label>
                <select id="kiki-ai-tokens-select" style="width: 100%; box-sizing: border-box; background: #18181B; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 8px 10px; color: #FFF; font-size: 13px;">
                  <option value="4096" ${String(aiCfg.maxTokens) === "4096" ? "selected" : ""}>Recommended (4096 Tokens)</option>
                  <option value="8192" ${String(aiCfg.maxTokens) === "8192" ? "selected" : ""}>Deep Reasoning (8192 Tokens)</option>
                  <option value="2048" ${String(aiCfg.maxTokens) === "2048" ? "selected" : ""}>Fast & Light (2048 Tokens)</option>
                  <option value="custom" ${!["2048", "4096", "8192"].includes(String(aiCfg.maxTokens)) ? "selected" : ""}>Custom Value</option>
                </select>
              </div>
            </div>
            <div id="kiki-ai-tokens-custom-wrap" style="display: ${!["2048", "4096", "8192"].includes(String(aiCfg.maxTokens)) ? "block" : "none"};">
              <label style="display: block; font-size: 11px; font-weight: 600; color: #94A3B8; margin-bottom: 4px;">CUSTOM MAX TOKENS VALUE</label>
              <input type="number" id="kiki-ai-tokens-custom-input" value="${escapeHtml(aiCfg.maxTokens || '4096')}" placeholder="4096" style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 7px 12px; color: #FFF; font-size: 13px;">
            </div>

            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <label style="font-size: 11.5px; font-weight: 600; color: #94A3B8;">PROMPT TEMPLATE (<span id="kiki-ai-prompt-lang-label">${aiCfg.aiLang === "en" ? "EN" : "ZH"}</span>)</label>
                <button type="button" id="kiki-ai-prompt-reset-btn" style="background: transparent; border: none; color: #A5B4FC; font-size: 11px; font-weight: 600; cursor: pointer; text-decoration: underline; padding: 0;">Reset Default</button>
              </div>
              <textarea id="kiki-ai-prompt-input" rows="4" style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 8px 10px; color: #FFF; font-size: 12px; line-height: 1.45; resize: vertical; font-family: inherit;">${escapeHtml(aiCfg.aiLang === "en" ? aiCfg.promptEn : aiCfg.promptZh)}</textarea>
              <div style="font-size: 10.5px; color: #94A3B8; margin-top: 3px;">
                Tags: <code>{{word}}</code> = tapped word, <code>{{sentence}}</code> = subtitle context.
              </div>
            </div>

            <div style="display: flex; gap: 8px; margin-top: 2px; align-items: center;">
              <button type="button" id="kiki-ai-save-btn" style="flex: 1; background: #6366F1; color: #FFFFFF; border: none; border-radius: 8px; padding: 9px 14px; font-size: 13px; font-weight: 600; cursor: pointer;">Save AI Config</button>
              <button type="button" id="kiki-ai-ping-btn" style="background: rgba(255,255,255,0.12); color: #E0E7FF; border: 1px solid rgba(255,255,255,0.25); border-radius: 8px; padding: 9px 12px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap;">Ping AI</button>
            </div>
            <div id="kiki-ai-ping-result" style="display: none; font-size: 11.5px; padding: 6px 10px; border-radius: 6px;"></div>
          </div>
        `;
      }

      setHtml(modal, `
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255, 255, 255, 0.15); padding-bottom: 12px;">
          <div style="display: flex; gap: 6px;">
            <button type="button" class="kiki-tab-btn" data-tab="dict" style="background: ${activeTab === 'dict' ? '#2563EB' : 'rgba(255,255,255,0.08)'}; color: #FFF; border: none; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.15s;">📖 Dictionaries</button>
            <button type="button" class="kiki-tab-btn" data-tab="ai" style="background: ${activeTab === 'ai' ? '#6366F1' : 'rgba(255,255,255,0.08)'}; color: #FFF; border: none; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.15s;">🤖 AI Context</button>
            <button type="button" class="kiki-tab-btn" data-tab="about" style="background: ${activeTab === 'about' ? '#10B981' : 'rgba(255,255,255,0.08)'}; color: #FFF; border: none; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.15s;">ℹ️ About & Updates</button>
          </div>
          <button type="button" class="kiki-modal-close" style="background: transparent; border: none; color: #FFF; font-size: 22px; cursor: pointer; line-height: 1; padding: 0 4px;">&times;</button>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${contentHtml}
        </div>

        <div style="border-top: 1px solid rgba(255, 255, 255, 0.12); padding-top: 10px; display: flex; justify-content: flex-end;">
          <button type="button" class="kiki-modal-clear-all" style="background: rgba(239, 68, 68, 0.18); color: #FCA5A5; border: 1px solid rgba(239, 68, 68, 0.35); border-radius: 8px; padding: 7px 12px; font-size: 11.5px; font-weight: 600; cursor: pointer;">
            🗑 Clear All (Dicts & AI Config)
          </button>
        </div>
      `);

      const closeBtn = modal.querySelector(".kiki-modal-close");
      if (closeBtn) {
        const doClose = (e) => {
          if (e.cancelable) e.preventDefault();
          e.stopPropagation();
          modal.style.display = "none";
        };
        closeBtn.addEventListener("click", doClose);
        closeBtn.addEventListener("touchend", doClose);
      }

      modal.querySelectorAll(".kiki-tab-btn").forEach(btn => {
        const switchTab = (e) => {
          if (e.cancelable) e.preventDefault();
          e.stopPropagation();
          activeTab = btn.dataset.tab;
          renderModal();
        };
        btn.addEventListener("click", switchTab);
        btn.addEventListener("touchend", switchTab);
      });

      const clearBtn = modal.querySelector(".kiki-modal-clear-all");
      if (clearBtn) {
        const doClear = (e) => {
          if (e.cancelable) e.preventDefault();
          e.stopPropagation();
          clearAllStorageAndConfig();
        };
        clearBtn.addEventListener("click", doClear);
        clearBtn.addEventListener("touchend", doClear);
      }

      
      if (activeTab === "about") {
        modal.querySelector("#kiki-hot-reload-btn")?.addEventListener("click", async (e) => {
          e.stopPropagation();
          const btn = modal.querySelector("#kiki-hot-reload-btn");
          if (btn) {
            btn.disabled = true;
            btn.innerHTML = "<span>⏳ Fetching latest modules from GitHub...</span>";
          }
          try {
            if (typeof window.__kiki_reload_modules === "function") {
              await window.__kiki_reload_modules(true);
            } else {
              const list = ["core", "yomitan", "ai", "ui", "youtube"];
              const base = "https://raw.githubusercontent.com/kekeqwq/Kiki-Immersion/main/modules/";
              let detectedVer = "1.2.5";
              await Promise.all(list.map(async (m) => {
                const r = await fetch(`${base}${m}.js?_t=${Date.now()}`, { cache: "no-store" });
                if (!r.ok) throw new Error(`HTTP ${r.status} on ${m}.js`);
                const t = await r.text();
                localStorage.setItem("kiki_mod_" + m, t);
                if (m === "core") {
                  const mVer = t.match(/window\.__kiki_engine_version\s*=\s*["']([^"']+)["']/);
                  if (mVer && mVer[1]) detectedVer = mVer[1];
                }
              }));
              localStorage.setItem("kiki_cache_version", detectedVer);
              localStorage.setItem("kiki_engine_version", detectedVer);
              localStorage.setItem("kiki_cache_time", new Date().toLocaleString());
              toast(`✅ Engine v${detectedVer} updated, reloading...`);
              setTimeout(() => location.reload(), 800);
            }
          } catch (err) {
            alert("Update failed: " + err.message);
            if (btn) {
              btn.disabled = false;
              btn.innerHTML = "<span>⚡ Check & Update Modules from GitHub (Hot-Reload)</span>";
            }
          }
        });

        modal.querySelector("#kiki-clear-cache-btn")?.addEventListener("click", (e) => {
          e.stopPropagation();
          if (confirm("Are you sure you want to clear the local module cache? Modules will be re-fetched on next reload.")) {
            ["core", "yomitan", "ai", "ui", "youtube"].forEach(m => localStorage.removeItem("kiki_mod_" + m));
            localStorage.removeItem("kiki_cache_time");
            localStorage.removeItem("kiki_cache_version");
            localStorage.removeItem("kiki_engine_version");
            toast("🗑 Local module cache cleared");
            renderModal();
          }
        });
      }

      if (activeTab === "dict") {
        modal.querySelectorAll(".kiki-del-dict-btn").forEach(btn => {
          const doDel = async (e) => {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
            const id = btn.dataset.id;
            btn.textContent = "Deleting...";
            await localDB.deleteDictionary(id);
            await refreshDictStats();
            renderModal();
          };
          btn.addEventListener("click", doDel);
          btn.addEventListener("touchend", doDel);
        });

        const fileInput = modal.querySelector(".kiki-modal-file-input");
        if (fileInput) {
          fileInput.addEventListener("change", async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const prog = modal.querySelector(".kiki-modal-progress");
            const progFill = modal.querySelector(".kiki-modal-prog-fill");
            const progText = modal.querySelector(".kiki-modal-prog-text");
            if (prog) prog.style.display = "flex";

            try {
              toast("Starting Yomitan Import...");
              const dictInfo = await localImporter.importZip(file, ({ message, percentage }) => {
                if (progFill) progFill.style.width = percentage + "%";
                if (progText) progText.textContent = `${percentage}%: ${message}`;
              });
              await refreshDictStats();
              toast(`✦ Installed: ${dictInfo.title} (${dictInfo.termCount.toLocaleString()} terms)`);
              renderModal();
            } catch (err) {
              console.error("[Kiki dict import error]", err);
              toast("Import error: " + err.message);
              if (progText) progText.textContent = "Error: " + err.message;
            }
          });
        }

        const keySelect = modal.querySelector("#kiki-web-lookup-key-select");
        if (keySelect) {
          keySelect.addEventListener("change", (e) => {
            const val = e.target.value;
            STATE.webLookupKey = val;
            try { localStorage.setItem("kiki_web_lookup_key", val); } catch {}
            toast(`✦ 全局查词修饰键: ${val}`);
          });
        }
      } else {
        const keyInput = modal.querySelector("#kiki-ai-key-input");
        const toggleBtn = modal.querySelector("#kiki-ai-key-toggle");
        if (toggleBtn && keyInput) {
          toggleBtn.addEventListener("click", () => {
            if (keyInput.type === "password") {
              keyInput.type = "text";
              toggleBtn.textContent = "Hide";
            } else {
              keyInput.type = "password";
              toggleBtn.textContent = "Show";
            }
          });
        }

        const modeSelect = modal.querySelector("#kiki-ai-mode-select");
        const tokensSelect = modal.querySelector("#kiki-ai-tokens-select");
        const tokensCustomWrap = modal.querySelector("#kiki-ai-tokens-custom-wrap");
        const tokensCustomInput = modal.querySelector("#kiki-ai-tokens-custom-input");

        tokensSelect?.addEventListener("change", () => {
          if (tokensCustomWrap) {
            tokensCustomWrap.style.display = tokensSelect.value === "custom" ? "block" : "none";
          }
        });

        const langSelect = modal.querySelector("#kiki-ai-lang-select");
        const promptInput = modal.querySelector("#kiki-ai-prompt-input");
        const promptLangLabel = modal.querySelector("#kiki-ai-prompt-lang-label");
        const resetPromptBtn = modal.querySelector("#kiki-ai-prompt-reset-btn");

        let cachedPromptZh = aiCfg.promptZh;
        let cachedPromptEn = aiCfg.promptEn;

        modeSelect?.addEventListener("change", () => {
          const m = modeSelect.value;
          const currentLang = langSelect?.value || "zh";
          if (m === "deep") {
            cachedPromptZh = AI_MODES.deep.promptZh;
            cachedPromptEn = AI_MODES.deep.promptEn;
          } else if (m === "quick") {
            cachedPromptZh = AI_MODES.quick.promptZh;
            cachedPromptEn = AI_MODES.quick.promptEn;
          }
          if (promptInput) {
            promptInput.value = currentLang === "en" ? cachedPromptEn : cachedPromptZh;
          }
        });

        langSelect?.addEventListener("change", () => {
          const currentLang = langSelect.value;
          if (currentLang === "en") {
            if (promptInput) {
              cachedPromptZh = promptInput.value;
              promptInput.value = cachedPromptEn;
            }
            if (promptLangLabel) promptLangLabel.textContent = "EN";
          } else {
            if (promptInput) {
              cachedPromptEn = promptInput.value;
              promptInput.value = cachedPromptZh;
            }
            if (promptLangLabel) promptLangLabel.textContent = "ZH";
          }
        });

        resetPromptBtn?.addEventListener("click", () => {
          const currentLang = langSelect?.value || "zh";
          const m = modeSelect?.value || "quick";
          const modeObj = AI_MODES[m] || AI_MODES.quick;
          cachedPromptEn = modeObj.promptEn || AI_MODES.quick.promptEn;
          cachedPromptZh = modeObj.promptZh || AI_MODES.quick.promptZh;
          if (promptInput) {
            promptInput.value = currentLang === "en" ? cachedPromptEn : cachedPromptZh;
          }
          toast("Prompt reset to template.");
        });

        const saveBtn = modal.querySelector("#kiki-ai-save-btn");
        if (saveBtn) {
          const doSave = (e) => {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
            const base = modal.querySelector("#kiki-ai-base-input")?.value || "";
            const key = modal.querySelector("#kiki-ai-key-input")?.value || "";
            const model = modal.querySelector("#kiki-ai-model-input")?.value || "";
            const lang = modal.querySelector("#kiki-ai-lang-select")?.value || "zh";
            const mode = modeSelect?.value || "quick";

            let maxTok = tokensSelect?.value || "4096";
            if (maxTok === "custom") {
              maxTok = (tokensCustomInput?.value || "4096").trim();
            }

            if (promptInput) {
              if (lang === "en") {
                cachedPromptEn = promptInput.value;
              } else {
                cachedPromptZh = promptInput.value;
              }
            }
            saveAiConfig({
              apiBase: base,
              apiKey: key,
              apiModel: model,
              aiLang: lang,
              aiMode: mode,
              maxTokens: maxTok,
              promptZh: cachedPromptZh,
              promptEn: cachedPromptEn
            });
            toast("✦ AI configuration saved.");
            saveBtn.textContent = "✓ Saved!";
            setTimeout(() => { saveBtn.textContent = "Save AI Config"; }, 1500);
          };
          saveBtn.addEventListener("click", doSave);
          saveBtn.addEventListener("touchend", doSave);
        }

        const pingBtn = modal.querySelector("#kiki-ai-ping-btn");
        const pingResult = modal.querySelector("#kiki-ai-ping-result");
        if (pingBtn && pingResult) {
          const doPing = async (e) => {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
            const base = modal.querySelector("#kiki-ai-base-input")?.value || "";
            const key = modal.querySelector("#kiki-ai-key-input")?.value || "";
            const model = modal.querySelector("#kiki-ai-model-input")?.value || "";
            if (!key.trim()) {
              pingResult.style.display = "block";
              pingResult.style.background = "rgba(239, 68, 68, 0.2)";
              pingResult.style.color = "#FCA5A5";
              pingResult.textContent = "Please enter an API Key first.";
              return;
            }
            pingBtn.disabled = true;
            pingBtn.textContent = "Pinging...";
            pingResult.style.display = "block";
            pingResult.style.background = "rgba(255, 255, 255, 0.1)";
            pingResult.style.color = "#EEE";
            pingResult.textContent = "Testing connection to " + (base || "OpenAI") + "...";

            try {
              const res = await pingAiConnection({ base, key, model });
              if (res.ok) {
                pingResult.style.background = "rgba(16, 185, 129, 0.2)";
                pingResult.style.color = "#6EE7B7";
                pingResult.textContent = "✓ Connected successfully! Model is responsive.";
              }
            } catch (err) {
              pingResult.style.background = "rgba(239, 68, 68, 0.2)";
              pingResult.style.color = "#FCA5A5";
              pingResult.textContent = "✗ Connection failed: " + err.message;
            } finally {
              pingBtn.disabled = false;
              pingBtn.textContent = "Ping AI";
            }
          };
          pingBtn.addEventListener("click", doPing);
          pingBtn.addEventListener("touchend", doPing);
        }
      }
    }

    renderModal();
  }
  window.showSettingsModal = showSettingsModal;
  window.showDictManagerModal = showSettingsModal;


  function tokenizeLine(text) {
    if (!text) return [];
    try {
      if (typeof Intl !== "undefined" && Intl.Segmenter) {
        const seg = new Intl.Segmenter(undefined, { granularity: "word" });
        const tokens = [];
        for (const it of seg.segment(text)) {
          tokens.push({ text: it.segment, isWord: !!it.isWordLike });
        }
        return tokens;
      }
    } catch {}

    const tokens = [];
    const re = /([\w'-]+|[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]+|[^\s\w'-]+|\s+)/g;
    let m;
    while ((m = re.exec(text))) {
      const str = m[0];
      if (/^\s+$/.test(str)) {
        tokens.push({ text: str, isWord: false });
      } else if (/[\w\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(str)) {
        tokens.push({ text: str, isWord: true });
      } else {
        tokens.push({ text: str, isWord: false });
      }
    }
    return tokens;
  }

  window.renderCue = renderCue;
  function renderCue(idx) {
    const box = $("#kiki-captions");
    if (!box) return;
    if (idx < 0 || idx >= STATE.cues.length) {
      box.textContent = "";
      return;
    }
    const cue = STATE.cues[idx];
    renderTextToBox(box, cue.text);
  }

  window.renderTextToBox = renderTextToBox;
  function renderTextToBox(box, text) {
    if (!box) return;
    if (STATE.subsVisible === false) {
      box.classList.add("kiki-hidden");
      box.textContent = "";
      return;
    }
    box.classList.remove("kiki-hidden");
    if (!text) {
      box.textContent = "";
      return;
    }
    const line = document.createElement("div");
    line.className = "kiki-line";

    // Left-side tactile rounded-square AI button
    const aiBtn = document.createElement("button");
    aiBtn.type = "button";
    aiBtn.className = "kiki-cap-ai-btn";
    aiBtn.title = "Ask AI Context Explanation";
    aiBtn.innerHTML = '<span class="kiki-ai-icon">✦</span><span class="kiki-ai-text">AI</span>';
    aiBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    aiBtn.addEventListener("touchstart", (e) => e.stopPropagation());
    aiBtn.addEventListener("click", (e) => {
      e.stopPropagation();

      const card = ensureYomitanCard();
      const cardOpen = card.classList.contains("show");

      // If card is already open showing AI, clicking AI again toggles close and resumes playback
      if (cardOpen && card.querySelector(".kiki-ai-body")) {
        closeLookup();
        return;
      }

      pauseVideoSync();
      STATE.pausedForLookup = true;

      // Reset pointer debounce to immediately allow tap on word
      lastWordPointerEl = null;
      lastWordPointerTime = 0;

      const currentWord = STATE.lookupWord || (STATE.lookupEl?.textContent || "").trim();
      const sentence = text || getSentenceContext();
      const target = currentWord || sentence;

      positionCardAboveSubtitles(card);
      card.classList.add("show");

      const cfg = getAiConfig();
      if (!cfg.apiKey || !cfg.apiKey.trim()) {
        showSettingsModal("ai");
        toast("Please configure your AI API Key first.");
        return;
      }

      explainWithAiInCard(card, target, sentence);
    });
    line.appendChild(aiBtn);

    const tokens = tokenizeLine(text);
    tokens.forEach((tok) => {
      if (!tok.isWord) {
        line.appendChild(document.createTextNode(tok.text));
      } else {
        const w = document.createElement("span");
        w.className = "kiki-word";
        w.dataset.word = tok.text;
        w.textContent = tok.text;
        w.addEventListener("pointerdown", onWordPointer);
        w.addEventListener("touchstart", onWordPointer);
        w.addEventListener("click", onWordPointer);
        line.appendChild(w);
      }
    });

    box.textContent = "";
    box.appendChild(line);
  }

  function findIndex(ms) {
    const cues = STATE.cues;
    if (!cues || !cues.length) return -1;
    for (let i = 0; i < cues.length; i++) {
      if (ms >= cues[i].start && ms < cues[i].end) return i;
    }
    return -1;
  }

  // Real-time Caption Synchronizer & WebKit TextTrack Extractor:
  // 1. Checks HTML5 video textTracks for offline or streaming cues.
  // 2. Mirrors live DOM captions from .ytp-caption-segment across all shadow roots.
  // 3. Directly suppresses native white-on-black WebKit / YouTube caption overlays.
  let nativeCaptionObserver = null;
  let observedPlayer = null;
  let lastObservedText = "";
  let liveToastShown = false;



// >>> END MODULE: ui <<<


// >>> BEGIN MODULE: web <<<

// =============================================================
// Kiki Immersion - Web Universal Lookup Module
// Version: 1.3.1
// Description: Global modifier-key word lookup for arbitrary web pages
// =============================================================

(() => {
  "use strict";

  // -------------------------------------------------------------
  // 1. Modifier Key Settings
  // -------------------------------------------------------------
  // Supported modes: 'ctrl' (default), 'alt', 'meta', 'ctrl_or_meta'
  function getTriggerKey() {
    return (typeof STATE !== "undefined" && STATE.webLookupKey) ||
           localStorage.getItem("kiki_web_lookup_key") || "ctrl";
  }

  function isTriggerKeyPressed(e) {
    const mode = getTriggerKey();
    if (mode === "ctrl") return e.ctrlKey;
    if (mode === "alt") return e.altKey;
    if (mode === "meta") return e.metaKey;
    return e.ctrlKey || e.metaKey;
  }

  // -------------------------------------------------------------
  // 2. High-Performance Zero-DOM-Mutation Caret Resolution
  // -------------------------------------------------------------
  function getCaretPoint(x, y) {
    try {
      if (document.caretRangeFromPoint) {
        const range = document.caretRangeFromPoint(x, y);
        if (range && range.startContainer) {
          return { node: range.startContainer, offset: range.startOffset, range };
        }
      }
      if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(x, y);
        if (pos && pos.offsetNode) {
          const r = document.createRange();
          r.setStart(pos.offsetNode, pos.offset);
          r.setEnd(pos.offsetNode, pos.offset);
          return { node: pos.offsetNode, offset: pos.offset, range: r };
        }
      }
    } catch {}
    return null;
  }

  // -------------------------------------------------------------
  // 3. Multilingual Word & Sentence Context Extraction
  // -------------------------------------------------------------
  async function resolveTargetWordAndContext(node, offset) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return null;
    const text = node.textContent || "";
    if (!text.trim()) return null;

    let idx = Math.max(0, Math.min(offset, text.length - 1));
    let ch = text[idx];

    // If clicked on whitespace or boundary, adjust to neighboring non-space character
    if (!ch || /\s/.test(ch)) {
      if (idx > 0 && !/\s/.test(text[idx - 1])) {
        idx--;
        ch = text[idx];
      } else if (idx < text.length - 1 && !/\s/.test(text[idx + 1])) {
        idx++;
        ch = text[idx];
      } else {
        return null;
      }
    }

    // Sentence context extraction (bounded by sentence punctuation or line breaks)
    let sentStart = idx;
    while (sentStart > 0 && !/[.!?。\n\r！？]/.test(text[sentStart - 1])) {
      sentStart--;
    }
    let sentEnd = idx;
    while (sentEnd < text.length && !/[.!?。\n\r！？]/.test(text[sentEnd])) {
      sentEnd++;
    }
    if (sentEnd < text.length && /[.!?。\n\r！？]/.test(text[sentEnd])) {
      sentEnd++;
    }
    let sentence = text.slice(sentStart, sentEnd).trim();

    if (sentence.length < 15 && node.parentElement) {
      const pText = (node.parentElement.innerText || node.parentElement.textContent || "").trim();
      if (pText.length >= sentence.length && pText.length < 400) {
        sentence = pText;
      }
    }

    const isJpOrCjk = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(ch);

    if (isJpOrCjk) {
      // For Japanese/CJK, scan forward up to 16 characters and query candidate prefixes
      const forwardSlice = text.slice(idx, idx + 16);
      if (window.localSearch && typeof window.localSearch.search === "function") {
        const maxLen = Math.min(12, forwardSlice.length);
        const prefixSearches = [];
        for (let l = maxLen; l >= 1; l--) {
          prefixSearches.push(
            window.localSearch.search(forwardSlice.slice(0, l)).then(res => ({ len: l, res }))
          );
        }
        const searchResults = await Promise.all(prefixSearches);
        const best = searchResults.find(item => item.res && item.res.length > 0);
        if (best) {
          const matchedTerm = forwardSlice.slice(0, best.len);
          // Highlight matched range
          const hlRange = document.createRange();
          try {
            hlRange.setStart(node, idx);
            hlRange.setEnd(node, idx + best.len);
          } catch {}
          return {
            term: matchedTerm,
            sentence,
            isJp: true,
            range: hlRange
          };
        }
      }
      // Fallback if not matched in dictionary: intelligently extract script block (Kanji / Katakana / Hiragana)
      let regex = /[\u4e00-\u9fff]/; // Kanji default
      if (/[\u30a0-\u30ff\u31f0-\u31ff\u30fc]/.test(ch)) {
        regex = /[\u30a0-\u30ff\u31f0-\u31ff\u30fc]/; // Katakana
      } else if (/[\u3040-\u309f]/.test(ch)) {
        regex = /[\u3040-\u309f]/; // Hiragana
      }
      let start = idx;
      while (start > 0 && regex.test(text[start - 1])) start--;
      let end = idx;
      while (end < text.length && regex.test(text[end])) end++;
      // If Kanji followed by Hiragana (okurigana like 食べる, 美味しい), include trailing Hiragana (unless it's a particle)
      if (regex.source.includes('4e00') && end < text.length && /[\u3040-\u309f]/.test(text[end])) {
        const nextChar = text[end];
        if (!/^[をにがのはでともへや]/.test(nextChar)) {
          let okuriEnd = end;
          while (okuriEnd < text.length && /[\u3040-\u309f]/.test(text[okuriEnd]) && !/^[をにがのはでともへや]/.test(text[okuriEnd]) && okuriEnd - end < 3) {
            okuriEnd++;
          }
          end = okuriEnd;
        }
      }
      const term = text.slice(start, end);
      const hlRange = document.createRange();
      try {
        hlRange.setStart(node, start);
        hlRange.setEnd(node, end);
      } catch {}
      return { term, sentence, isJp: true, range: hlRange };
    } else {
      // Latin / English word extraction
      let start = idx;
      while (start > 0 && /[\w'-]/.test(text[start - 1])) start--;
      let end = idx;
      while (end < text.length && /[\w'-]/.test(text[end])) end++;
      const term = text.slice(start, end).replace(/^['-]+|['-]+$/g, "");
      if (!term || term.length < 1) return null;

      const hlRange = document.createRange();
      try {
        hlRange.setStart(node, start);
        hlRange.setEnd(node, end);
      } catch {}
      return { term, sentence, isJp: false, range: hlRange };
    }
  }

  // -------------------------------------------------------------
  // 4. Modifier + Click Event Interceptor
  // -------------------------------------------------------------
  let lastTriggerTime = 0;

  async function onGlobalPointerDown(e) {
    // 0. Performance: early bailout if modifier key is not held (zero overhead)
    if (!isTriggerKeyPressed(e)) return;

    // Suppress native context menu and default selection immediately
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    // Do not trigger on Kiki's own UI elements
    if (e.target && typeof e.target.closest === "function" &&
        e.target.closest("#kiki-yomitan-card, #kiki-settings-modal, #kiki-hud, .kiki-toast")) {
      return;
    }

    const now = Date.now();
    if (now - lastTriggerTime < 350) return;

    const caret = getCaretPoint(e.clientX, e.clientY);
    if (!caret || !caret.node) return;

    const resolved = await resolveTargetWordAndContext(caret.node, caret.offset);
    if (!resolved || !resolved.term) return;

    lastTriggerTime = now;

    // Visual selection feedback
    try {
      const sel = window.getSelection();
      if (sel && resolved.range) {
        sel.removeAllRanges();
        sel.addRange(resolved.range);
      }
    } catch {}

    // Ensure styles are injected
    if (typeof injectStyles === "function") {
      try { injectStyles(); } catch {}
    }

    // Show floating Yomitan card with sentence context
    if (typeof showYomitanCard === "function") {
      showYomitanCard(null, resolved.term, { x: e.clientX, y: e.clientY }, resolved.sentence);
    }
  }

  function suppressIfModifier(e) {
    if (isTriggerKeyPressed(e) || (Date.now() - lastTriggerTime < 600)) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  }

  // Intercept all mouse/pointer events to completely suppress Safari's native Ctrl+Click context menu
  window.addEventListener("pointerdown", onGlobalPointerDown, { capture: true, passive: false });
  window.addEventListener("mousedown", suppressIfModifier, { capture: true, passive: false });
  window.addEventListener("mouseup", suppressIfModifier, { capture: true, passive: false });
  window.addEventListener("click", suppressIfModifier, { capture: true, passive: false });
  window.addEventListener("contextmenu", suppressIfModifier, { capture: true, passive: false });

  // Ensure styles are injected on any webpage
  if (document.head || document.documentElement) {
    try { if (typeof injectStyles === "function") injectStyles(); } catch {}
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      try { if (typeof injectStyles === "function") injectStyles(); } catch {}
    }, { once: true });
  }

  console.log('[Kiki Immersion] Web Universal Lookup Module Loaded (Trigger: ' + getTriggerKey() + '+Click)');
})();


// >>> END MODULE: web <<<


// >>> BEGIN MODULE: youtube <<<

// =============================================================
// Kiki Immersion - YouTube Adapter & Subtitle Pipeline
// Version: 1.3.1
// =============================================================

(() => {
  if (!/(?:^|\.)youtube\.com$/.test(location.hostname)) {
    return;
  }

  // -------------------------------------------------------------
  // 2. High-Fidelity TimedText Wire Sniffer
  // -------------------------------------------------------------
  const MARK = "/api/timedtext";
  let capturedBody = STATE?.capturedBody || "";
  let capturedLastUrl = STATE?.capturedLastUrl || "";
  let capturedVideoId = STATE?.capturedVideoId || "";
  let lastPoToken = STATE?.lastPoToken || "";
  let selfFetching = 0;

  function currentVideoId() {
    try {
      const u = new URL(location.href);
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      const m = u.pathname.match(/\/(?:shorts|live|watch)\/([a-zA-Z0-9_-]+)/);
      if (m) return m[1];
      return "";
    } catch {
      return "";
    }
  }

  function noteTimedtextUrl(url) {
    if (typeof window.noteTimedtextUrl === "function") {
      window.noteTimedtextUrl(url);
    }
    if (typeof url !== "string" || !url.includes(MARK)) return;
    try {
      const u = new URL(url, location.href);
      const pot = u.searchParams.get("pot");
      if (pot) {
        lastPoToken = pot;
        if (typeof STATE !== "undefined") STATE.lastPoToken = pot;
        try { sessionStorage.setItem("kiki_pot", pot); } catch {}
      }
    } catch {}
    let urlVid = "";
    try { urlVid = new URL(url, location.href).searchParams.get("v") || ""; } catch {}
    const cid = urlVid || currentVideoId();
    if (capturedVideoId && cid && capturedVideoId !== cid) {
      capturedLastUrl = "";
      capturedBody = "";
      if (typeof STATE !== "undefined") {
        STATE.capturedLastUrl = "";
        STATE.capturedBody = "";
      }
    }
    capturedVideoId = cid;
    capturedLastUrl = url;
    if (typeof STATE !== "undefined") {
      STATE.capturedVideoId = cid;
      STATE.capturedLastUrl = url;
    }
  }

  function onCapturedWireBody(body, url) {
    if (!body || body.trim().length < 20) return;
    noteTimedtextUrl(url);
    let urlVid = "";
    try { urlVid = new URL(url, location.href).searchParams.get("v") || ""; } catch {}
    capturedVideoId = urlVid || currentVideoId();
    capturedBody = body;
    capturedLastUrl = url;
    if (typeof STATE !== "undefined") {
      STATE.capturedBody = body;
      STATE.capturedLastUrl = url;
      STATE.capturedVideoId = capturedVideoId;
    }

    const curVid = currentVideoId();
    if (!capturedVideoId || capturedVideoId === curVid) {
      const cues = parseAny(body);
      if (cues && cues.length) {
        let matchedTrack = null;
        if (typeof STATE !== "undefined" && STATE.tracks && STATE.tracks.length) {
          try {
            const u = new URL(url, location.href);
            const lang = u.searchParams.get("lang");
            const kind = u.searchParams.get("kind");
            matchedTrack = STATE.tracks.find(t => 
              t.languageCode === lang && (kind === "asr" ? t.kind === "asr" : t.kind !== "asr")
            ) || STATE.tracks.find(t => t.languageCode === lang);
          } catch {}
        }
        applyLoadedCues(cues, "wire-sniffer", matchedTrack || STATE?.activeTrack);
      }
    }
  }
  window.__kiki_onCapturedWireBody = onCapturedWireBody;

  if (STATE?.capturedBody && STATE.capturedBody.trim().length > 20) {
    setTimeout(() => {
      onCapturedWireBody(STATE.capturedBody, STATE.capturedLastUrl || "");
    }, 60);
  }


  function getInnertubeKey() {
    try {
      if (window.ytcfg && typeof window.ytcfg.get === "function") {
        const k = window.ytcfg.get("INNERTUBE_API_KEY");
        if (k) return k;
      }
      if (window.ytcfg?.data_?.INNERTUBE_API_KEY) {
        return window.ytcfg.data_.INNERTUBE_API_KEY;
      }
    } catch {}
    try {
      for (const s of document.scripts) {
        const txt = s.textContent || "";
        if (txt.includes("INNERTUBE_API_KEY")) {
          const m = txt.match(/"INNERTUBE_API_KEY":\s*"([^"]+)"/);
          if (m && m[1]) return m[1];
        }
      }
    } catch {}
    try {
      const m = document.documentElement.innerHTML.match(/"INNERTUBE_API_KEY":\s*"([^"]+)"/);
      if (m && m[1]) return m[1];
    } catch {}
    return "";
  }

  function extractJsonArray(text, startKey) {
    if (!text) return null;
    const idx = text.indexOf(startKey);
    if (idx === -1) return null;
    const startBracket = text.indexOf("[", idx + startKey.length);
    if (startBracket === -1) return null;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = startBracket; i < text.length; i++) {
      const ch = text[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (ch === "[") depth++;
        else if (ch === "]") {
          depth--;
          if (depth === 0) {
            const raw = text.substring(startBracket, i + 1);
            try {
              return JSON.parse(raw);
            } catch {}
            try {
              const clean = raw.replace(/\\u0026/g, "&").replace(/\\\//g, "/");
              return JSON.parse(clean);
            } catch {}
            return null;
          }
        }
      }
    }
    return null;
  }

  function extractTracksFromHtml(html) {
    if (!html) return [];
    try {
      // 1. Direct JSON property search (standard unescaped)
      let arr = extractJsonArray(html, '"captionTracks"');
      if (Array.isArray(arr) && arr.length) return arr;

      // 2. Escaped JSON in string literals (e.g. JSON.parse('{\"captionTracks\":...}'))
      arr = extractJsonArray(html, '\\"captionTracks\\"');
      if (Array.isArray(arr) && arr.length) return arr;

      // 3. Fallback: regex search for raw timedtext URLs in script content
      const urlMatches = html.match(/https?[:\/\\]+[^"'\s<>]*timedtext[^"'\s<>]+/g);
      if (urlMatches && urlMatches.length) {
        const uniqueUrls = Array.from(new Set(urlMatches)).map(u => u.replace(/\\u0026/g, "&").replace(/\\\//g, "/").replace(/\\"/g, ""));
        const synthesized = uniqueUrls.map(u => {
          let lang = "en";
          try { lang = new URL(u).searchParams.get("lang") || "en"; } catch {}
          return {
            baseUrl: u,
            name: { simpleText: lang.toUpperCase() },
            languageCode: lang,
            vssId: "." + lang
          };
        });
        if (synthesized.length) return synthesized;
      }
    } catch {}
    return [];
  }

  function getCaptionTracksFromDom() {
    try {
      if (window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
        const ct = window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
        if (Array.isArray(ct) && ct.length) return ct;
      }
    } catch {}

    try {
      for (const s of document.scripts) {
        const txt = s.textContent || "";
        if (txt.includes("captionTracks")) {
          const tracks = extractTracksFromHtml(txt);
          if (tracks.length) return tracks;
        }
      }
    } catch {}

    return [];
  }

  async function innertubeTracks(id) {
    if (!id) return [];
    const key = getInnertubeKey();
    selfFetching++;
    try {
      const clients = [
        { clientName: "ANDROID", clientVersion: "19.29.37" },
        { clientName: "WEB", clientVersion: "2.20240901.00.00" },
        { clientName: "MWEB", clientVersion: "2.20240901.00.00" }
      ];
      for (const client of clients) {
        try {
          const url = key
            ? `https://www.youtube.com/youtubei/v1/player?prettyPrint=false&key=${encodeURIComponent(key)}`
            : "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 2500);
          try {
            const res = await origFetch.call(window, url, {
              method: "POST",
              credentials: "omit",
              headers: { "content-type": "application/json" },
              signal: ctrl.signal,
              body: JSON.stringify({
                context: { client: { ...client, hl: "en", gl: "US" } },
                videoId: id,
                contentCheckOk: true,
                racyCheckOk: true
              })
            });
            clearTimeout(tid);
            if (!res.ok) continue;
            const json = await res.json();
            const tracks = json?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            if (Array.isArray(tracks) && tracks.length) return tracks;
          } catch {} finally {
            clearTimeout(tid);
          }
        } catch {}
      }
    } catch {
      return [];
    } finally {
      selfFetching--;
    }
    return [];
  }


  function bindNativeGuard() {
    if (bindNativeGuard._on) return;
    bindNativeGuard._on = true;
    const stealTypes = ["pointerdown", "touchstart", "touchend", "touchmove", "click", "dblclick"];
    stealTypes.forEach((type) => {
      document.addEventListener(type, onNativeGuard, { capture: true, passive: false });
    });
  }

  let touchStartTime = 0;
  let touchStartX = 0;
  let touchStartY = 0;
  let lastTapTime = 0;
  let lastTapX = 0;
  let lastTapY = 0;
  let singleTapTimer = null;
  window.__kiki_cancelSingleTap = () => {
    if (singleTapTimer) {
      clearTimeout(singleTapTimer);
      singleTapTimer = null;
    }
    singleTapActionFired = false;
  };

  function isLookupOrCardOpen() {
    if (typeof window.isAnyPopupOpen === "function") {
      return window.isAnyPopupOpen();
    }
    const card = document.getElementById("kiki-yomitan-card");
    const modal = document.getElementById("kiki-settings-modal");
    return Boolean(
      (card && card.classList.contains("show")) ||
      STATE.lookupEl ||
      STATE.pausedForLookup ||
      (modal && modal.style.display !== "none")
    );
  }

  let lastLookupDismissTime = 0;

  function onNativeGuard(e) {
    if (!STATE.enabled) return;
    try { ensureHud(); ensureRoot(); } catch {}
    if (!e.isTrusted) return;
    const p = playerEl();
    if (!p || !p.contains(e.target)) return;

    if (e.target.closest("#kiki-captions") ||
        e.target.closest("#kiki-yomitan-card") ||
        e.target.closest("#kiki-hud") ||
        e.target.closest("#kiki-toast")) {
      return;
    }

    const effectiveDismissTime = Math.max(lastLookupDismissTime || 0, STATE?.lastLookupDismissTime || 0);
    if (Date.now() - effectiveDismissTime < 600) {
      if (e.cancelable) e.preventDefault();
      e.stopImmediatePropagation();
      if (singleTapTimer) {
        clearTimeout(singleTapTimer);
        singleTapTimer = null;
      }
      singleTapActionFired = false;
      return;
    }

    // Dismiss open Yomitan / AI card without triggering pause gesture
    if (isLookupOrCardOpen()) {
      if (e.cancelable) e.preventDefault();
      e.stopImmediatePropagation();
      lastLookupDismissTime = Date.now();
      if (typeof STATE !== "undefined") STATE.lastLookupDismissTime = lastLookupDismissTime;
      if (singleTapTimer) {
        clearTimeout(singleTapTimer);
        singleTapTimer = null;
      }
      singleTapActionFired = false;
      if (typeof window.dismissAllPopups === "function") {
        window.dismissAllPopups(true);
      } else if (typeof closeLookup === "function") {
        closeLookup(true);
      }
      return;
    }

    if (document.documentElement.classList.contains("kiki-show-chrome") &&
        e.target.closest(".ytp-chrome-bottom, .ytp-chrome-top, .ytp-popup, .ytp-settings-menu")) {
      return;
    }

    document.querySelectorAll(".ytp-doubletap-ui, .ytp-doubletap-overlay, .ytp-bezel, .ytp-doubletap-ui-legacy").forEach((n) => n.remove());

    if (e.type === "touchstart") {
      const t = e.touches[0];
      if (!t) return;
      touchStartTime = Date.now();
      touchStartX = t.clientX;
      touchStartY = t.clientY;

      if (e.touches.length === 2) {
        if (e.cancelable) e.preventDefault();
        e.stopImmediatePropagation();
        toggleNativeChrome();
        return;
      }

      if (e.cancelable) e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    if (e.type === "touchend") {
      const t = e.changedTouches?.[0];
      if (!t) return;
      const dx = Math.abs(t.clientX - touchStartX);
      const dy = Math.abs(t.clientY - touchStartY);
      const dt = Date.now() - touchStartTime;

      if (dx > 45 || dy > 45 || dt > 700) return;

      if (e.cancelable) e.preventDefault();
      e.stopImmediatePropagation();

      handleTap(p, t.clientX, t.clientY, "touch");
      return;
    }

    if (e.type === "pointerdown" && e.pointerType === "mouse") {
      if (e.cancelable) e.preventDefault();
      e.stopImmediatePropagation();
      handleTap(p, e.clientX, e.clientY, "mouse");
      return;
    }

    if (e.type === "dblclick") {
      if (e.cancelable) e.preventDefault();
      e.stopImmediatePropagation();
      // Native dblclick swallowed to prevent duplicate toggleWebpageFs execution
      return;
    }

    if (e.cancelable) e.preventDefault();
    e.stopImmediatePropagation();
  }

  const DOUBLE_MS = 380;
  let lastTapInputType = "touch";
  let singleTapActionFired = false;
  function handleTap(p, cx, cy, inputType = "touch") {
    lastTapInputType = inputType;
    const effectiveDismissTime = Math.max(lastLookupDismissTime || 0, STATE?.lastLookupDismissTime || 0);
    if (isLookupOrCardOpen() || (Date.now() - effectiveDismissTime < 600)) {
      if (isLookupOrCardOpen()) {
        if (typeof window.dismissAllPopups === "function") {
          window.dismissAllPopups(true);
        } else if (typeof closeLookup === "function") {
          closeLookup(true);
        }
      }
      clearTimeout(singleTapTimer);
      singleTapTimer = null;
      singleTapActionFired = false;
      return;
    }

    if (document.documentElement.classList.contains("kiki-show-chrome")) {
      hideNativeChrome();
      return;
    }

    const r = p.getBoundingClientRect();
    const relX = (cx - r.left) / r.width;
    const relY = (cy - r.top) / r.height;
    const now = Date.now();

    const isDouble = (now - lastTapTime < DOUBLE_MS) && (Math.abs(cx - lastTapX) < 100) && (Math.abs(cy - lastTapY) < 100);

    if (isDouble) {
      clearTimeout(singleTapTimer);
      singleTapTimer = null;
      lastTapTime = 0;

      // If single tap timer already fired togglePause(), restore playback on double-tap
      if (singleTapActionFired) {
        singleTapActionFired = false;
        playVideoSync();
      }

      // Mouse double-click anywhere toggles webpage fullscreen.
      // Touch (iPad) double-tap on left seeks -1, right seeks +1, center toggles webpage fullscreen.
      if (inputType === "mouse") {
        toggleWebpageFs();
      } else {
        if (relX < 0.18) {
          seekCue(-1);
          toast("← previous line");
        } else if (relX > 0.82) {
          seekCue(1);
          toast("next line →");
        } else {
          toggleWebpageFs();
        }
      }
      return;
    }

    lastTapTime = now;
    lastTapX = cx;
    lastTapY = cy;
    singleTapActionFired = false;
    clearTimeout(singleTapTimer);

    // Single click/tap top-left (<= 25% width & <= 28% height): Toggle Kiki Top Bar
    if (relY < 0.28 && relX < 0.25) {
      lastTapTime = 0;
      toggleHud();
      return;
    }

    // Single click/tap top-right (>= 75% width & <= 28% height): Toggle Native YouTube Controls
    if (relY < 0.28 && relX > 0.75) {
      lastTapTime = 0;
      toggleNativeChrome();
      return;
    }

    singleTapTimer = setTimeout(() => {
      singleTapActionFired = true;
      togglePause();
    }, 280);
  }

  window.toggleHud = toggleHud;
  function toggleHud(force) {
    STATE.hudVisible = typeof force === "boolean" ? force : !STATE.hudVisible;
    const hud = ensureHud();
    if (!hud) return;
    if (STATE.hudVisible) {
      hud.style.setProperty("display", "flex", "important");
      requestAnimationFrame(() => {
        hud.style.setProperty("visibility", "visible", "important");
        hud.style.setProperty("opacity", "1", "important");
      });
      toast("Kiki Bar: Shown");
      clearTimeout(toggleHud._t);
      toggleHud._t = setTimeout(() => hideHud(), 6000);
    } else {
      if (typeof closeTrackDropdown === "function") closeTrackDropdown();
      clearTimeout(toggleHud._t);
      hud.style.setProperty("opacity", "0", "important");
      hud.style.setProperty("visibility", "hidden", "important");
      setTimeout(() => {
        if (!STATE.hudVisible && hud) hud.style.setProperty("display", "none", "important");
      }, 200);
      toast("Kiki Bar: Hidden");
    }
  }

  function hideHud() {
    if (STATE.hudVisible) toggleHud(false);
  }

  let lastFsToggleTime = 0;
  window.toggleWebpageFs = toggleWebpageFs;
  function toggleWebpageFs(force) {
    const now = Date.now();
    if (typeof force !== "boolean" && now - lastFsToggleTime < 350) {
      return;
    }
    lastFsToggleTime = now;
    STATE.fs = typeof force === "boolean" ? force : !STATE.fs;
    document.documentElement.classList.toggle("kiki-webpage-fs", STATE.fs);
    updateHud();
    updateCaptionPosition();
    toast(STATE.fs ? "Webpage Fullscreen" : "Exit Fullscreen");
    window.dispatchEvent(new Event("resize"));
    setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
      updateCaptionPosition();
    }, 100);
  }

  function showNativeChrome() {
    document.documentElement.classList.add("kiki-show-chrome");
    updateCaptionPosition();
    updateHud();
    toast("Controls Visible");
    clearTimeout(showNativeChrome._t);
    showNativeChrome._t = setTimeout(() => {
      hideNativeChrome();
    }, 6000);
  }

  function hideNativeChrome() {
    document.documentElement.classList.remove("kiki-show-chrome");
    updateCaptionPosition();
    updateHud();
    clearTimeout(showNativeChrome._t);
  }

  function toggleNativeChrome() {
    if (document.documentElement.classList.contains("kiki-show-chrome")) {
      hideNativeChrome();
      toast("Controls Hidden");
    } else {
      showNativeChrome();
    }
  }

  function setMaxQuality() {
    const p = playerEl();
    try {
      if (p && typeof p.getAvailableQualityLevels === "function") {
        const levels = p.getAvailableQualityLevels();
        if (levels && levels.length) {
          p.setPlaybackQualityRange(levels[0], levels[0]);
          toast("Max quality: " + levels[0]);
          return;
        }
      }
    } catch {}
    toast("HD quality set");
  }

  window.seekCue = seekCue;
  function seekCue(dir) {
    const v = videoEl();
    if (!v) return;
    const cuesToUse = (!STATE.liveMode && STATE.cues && STATE.cues.length)
      ? STATE.cues
      : (STATE.liveCues && STATE.liveCues.length ? STATE.liveCues : null);
    if (cuesToUse && cuesToUse.length) {
      const curMs = v.currentTime * 1000;
      let target = -1;
      if (dir < 0) {
        for (let k = cuesToUse.length - 1; k >= 0; k--) {
          if (cuesToUse[k].start < curMs - 400) {
            target = k;
            break;
          }
        }
        if (target === -1) target = 0;
      } else {
        for (let k = 0; k < cuesToUse.length; k++) {
          if (cuesToUse[k].start > curMs + 200) {
            target = k;
            break;
          }
        }
        if (target === -1) target = cuesToUse.length - 1;
      }
      const cue = cuesToUse[target];
      if (cue) {
        v.currentTime = Math.max(0, cue.start / 1000 + 0.01);
        STATE.idx = target;
        if (!STATE.liveMode) {
          renderCue(target);
        } else {
          const box = document.getElementById("kiki-captions");
          if (box && typeof window.renderTextToBox === "function") {
            window.renderTextToBox(box, cue.text);
          }
        }
        return;
      }
    }
    v.currentTime = Math.max(0, Math.min(v.duration || Infinity, v.currentTime + dir * 5));
  }


  // -------------------------------------------------------------
  // 8. Caption Parsing, Single-Line Reconstruction & DOM Observer
  // -------------------------------------------------------------
  function flattenWords(json) {
    const words = [];
    for (const ev of json.events || []) {
      if (ev.aAppend === 1 && ev.segs) {
        const last = words[words.length - 1];
        const extra = ev.segs.map((s) => s.utf8 || "").join("");
        if (last) last.text += extra;
        continue;
      }
      if (!ev.segs || ev.tStartMs == null) continue;
      for (const seg of ev.segs) {
        const raw = (seg.utf8 || "").replace(/\n/g, " ");
        if (!raw) continue;
        words.push({
          start: ev.tStartMs + (seg.tOffsetMs || 0),
          text: raw
        });
      }
    }
    for (let i = 0; i < words.length; i++) {
      const n = words[i + 1];
      words[i].end = n ? n.start : words[i].start + 800;
    }
    return words;
  }

  function wordsToLines(words) {
    const cues = [];
    let buf = [];
    const flush = () => {
      if (!buf.length) return;
      const text = buf.map((w) => w.text).join("").replace(/\s+/g, " ").trim();
      if (text) {
        cues.push({
          start: buf[0].start,
          end: Math.max(buf[buf.length - 1].end, buf[0].start + 800),
          text
        });
      }
      buf = [];
    };
    const endPunct = /[.!?…。！？]$/;
    for (const w of words) {
      if (!buf.length) { buf.push(w); continue; }
      const prev = buf[buf.length - 1];
      const gap = w.start - prev.end;
      const dur = w.end - buf[0].start;
      const len = buf.reduce((n, x) => n + x.text.length, 0) + w.text.length;
      const prevText = buf.map((x) => x.text).join("").trim();
      if (gap > 900 || dur > 5200 || len > 92 || endPunct.test(prevText)) flush();
      buf.push(w);
    }
    flush();
    return cues;
  }

  function parseCaptions(json) {
    const words = flattenWords(json);
    if (!words.length) return [];
    const lines = wordsToLines(words);
    return lines.length ? lines : words.map((w) => ({ start: w.start, end: w.end, text: w.text.trim() })).filter((c) => c.text);
  }

  function decodeEntities(s) {
    return s
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");
  }

  function parseSrv(xml) {
    const cues = [];
    // 1. Classic timedtext XML: <text start="1.23" dur="2.45">...</text>
    const reText = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
    let m;
    while ((m = reText.exec(xml))) {
      const attrs = m[1];
      const start = parseFloat((attrs.match(/\bstart="([^"]+)"/) || [])[1] || "0") * 1000;
      const dur = parseFloat((attrs.match(/\bdur="([^"]+)"/) || [])[1] || "2") * 1000;
      const text = decodeEntities(m[2].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
      if (text) cues.push({ start, end: start + dur, text });
    }
    if (cues.length) return cues;

    // 2. Format 3 XML: <p t="1234" d="2345"><s>word</s>...</p>
    const reP = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
    while ((m = reP.exec(xml))) {
      const attrs = m[1];
      const tMatch = attrs.match(/\bt="(\d+)"/);
      const dMatch = attrs.match(/\bd="(\d+)"/);
      const start = tMatch ? parseInt(tMatch[1], 10) : 0;
      const dur = dMatch ? parseInt(dMatch[1], 10) : 2000;
      const text = decodeEntities(m[2].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
      if (text) cues.push({ start, end: start + dur, text });
    }
    return cues;
  }

  function parseVtt(vtt) {
    const cues = [];
    const blocks = vtt.replace(/\r/g, "").split(/\n\n+/);
    for (const block of blocks) {
      const lines = block.split("\n").filter(Boolean);
      const time = lines.find((l) => l.includes("-->"));
      if (!time) continue;
      const mm = time.match(/([\d:.]+)\s+-->\s+([\d:.]+)/);
      if (!mm) continue;
      const text = lines
        .slice(lines.indexOf(time) + 1)
        .join(" ")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) continue;
      cues.push({ start: vttTime(mm[1]), end: vttTime(mm[2]), text });
    }
    return cues;
  }

  function vttTime(s) {
    const p = s.split(":");
    let h = 0, m = 0, sec = 0;
    if (p.length === 3) {
      h = +p[0];
      m = +p[1];
      sec = parseFloat(p[2]);
    } else {
      m = +p[0];
      sec = parseFloat(p[1]);
    }
    return Math.round((h * 3600 + m * 60 + sec) * 1000);
  }

  function parseAny(raw) {
    if (!raw) return [];
    const t = raw.trim();
    if (t.startsWith("{") || t.startsWith("[")) {
      try { return parseCaptions(JSON.parse(t)); } catch {}
    }
    if (t.includes("<text") || t.includes("<transcript") || t.includes("<timedtext") || t.includes("<p t=")) {
      return parseSrv(t);
    }
    if (/WEBVTT/i.test(t) || t.includes("-->")) return parseVtt(t);
    try {
      return parseCaptions(JSON.parse(t));
    } catch {
      return [];
    }
  }


  function ensureCaptionObserver() {
    const p = playerEl();
    if (!p) return;
    if (nativeCaptionObserver && observedPlayer === p) return;

    if (nativeCaptionObserver) {
      try { nativeCaptionObserver.disconnect(); } catch {}
    }

    observedPlayer = p;
    nativeCaptionObserver = new MutationObserver(() => {
      onNativeCaptionsMutated();
    });

    try {
      nativeCaptionObserver.observe(p, {
        childList: true,
        subtree: true,
        characterData: true
      });
    } catch {}

    const ytd = document.querySelector("ytd-player");
    if (ytd && ytd.shadowRoot && ytd.shadowRoot !== p) {
      try {
        nativeCaptionObserver.observe(ytd.shadowRoot, {
          childList: true,
          subtree: true,
          characterData: true
        });
      } catch {}
    }
  }

  function getCueText(c) {
    if (!c) return "";
    if (typeof c.text === "string" && c.text) return c.text;
    if (typeof c.getCueAsHTML === "function") {
      try {
        const html = c.getCueAsHTML();
        return html?.textContent || "";
      } catch {}
    }
    if (typeof c.data === "string") return c.data;
    return "";
  }

  function isDummyCueText(text) {
    if (!text || !text.trim()) return true;
    const lower = text.toLowerCase().replace(/\s+/g, " ").trim();
    if (lower.length <= 1) return true;
    if (lower === "english" || lower === "japanese" || lower === "german" || lower === "french" || lower === "spanish" || lower === "chinese") return true;
    return lower.includes("click for settings") ||
           lower.includes("for settings") ||
           lower.includes("点击以查看设置") ||
           lower.includes("点击以") ||
           lower.includes("auto-generated") ||
           lower.includes("自动生成") ||
           (lower.includes("settings") && (lower.includes("english") || lower.includes("auto")));
  }

  function extractCuesFromVideo() {
    const v = videoEl();
    if (!v || !v.textTracks || !v.textTracks.length) return [];
    for (let i = 0; i < v.textTracks.length; i++) {
      const track = v.textTracks[i];
      if (track.kind === "chapters" || track.kind === "metadata") continue;
      if (track.mode === "disabled") {
        try { track.mode = "showing"; } catch {}
      }
      if (track.cues && track.cues.length > 0) {
        const cues = [];
        for (let j = 0; j < track.cues.length; j++) {
          const c = track.cues[j];
          const t = getCueText(c).replace(/<[^>]+>/g, "").trim();
          if (t && !isDummyCueText(t)) {
            cues.push({
              start: Math.round(c.startTime * 1000),
              end: Math.round(c.endTime * 1000),
              text: t
            });
          }
        }
        if (cues.length >= 5) return cues;
      }
    }
    return [];
  }

  function getLiveCaptionText() {
    function sanitize(text) {
      if (!text) return "";
      const cleaned = text.replace(/^\s*>>\s*/, "").replace(/\s*>>\s*/g, " ").trim();
      return isDummyCueText(cleaned) ? "" : cleaned;
    }

    // 1. Check HTML5 video textTracks activeCues
    const v = videoEl();
    if (v && v.textTracks && v.textTracks.length) {
      for (let i = 0; i < v.textTracks.length; i++) {
        const track = v.textTracks[i];
        if (track.mode === "disabled") {
          try { track.mode = "showing"; } catch {}
        }
        if (track.activeCues && track.activeCues.length > 0) {
          let text = "";
          for (let j = 0; j < track.activeCues.length; j++) {
            const t = getCueText(track.activeCues[j]).replace(/<[^>]+>/g, "").trim();
            if (t) text += (text ? " " : "") + t;
          }
          const s = sanitize(text);
          if (s) return s;
        }
      }
    }

    // 2. Query segmented text elements (.ytp-caption-segment)
    const segs = queryCaptionElements(".ytp-caption-segment");
    if (segs.length) {
      let text = "";
      segs.forEach((s) => {
        const t = (s.textContent || "").trim();
        if (t) text += (text ? " " : "") + t;
      });
      const s = sanitize(text);
      if (s) return s;
    }

    // 3. Caption visual lines (.caption-visual-line)
    const lines = queryCaptionElements(".caption-visual-line");
    if (lines.length) {
      let text = "";
      lines.forEach((l) => {
        const t = (l.textContent || "").trim();
        if (t) text += (text ? " " : "") + t;
      });
      const s = sanitize(text);
      if (s) return s;
    }

    // 4. Caption windows (.ytp-caption-window, .caption-window)
    const windows = queryCaptionElements(".ytp-caption-window, .caption-window");
    if (windows.length) {
      let text = "";
      windows.forEach((w) => {
        const t = (w.textContent || "").trim();
        if (t) text += (text ? " " : "") + t;
      });
      const s = sanitize(text);
      if (s) return s;
    }

    // 5. Container textContent fallback
    const containers = queryCaptionElements(".ytp-caption-window-container");
    for (const c of containers) {
      const s = sanitize(c.textContent || "");
      if (s) return s;
    }

    return "";
  }

  function suppressNativeCaptions() {
    document.documentElement.classList.add("kiki-captions-active");
    const v = videoEl();
    if (v) {
      v.classList.add("kiki-hide-native-cue");
      // Keep track mode as "showing" so cues are continuously fired in WebKit
    }

    // Directly suppress all native caption DOM elements without destroying layout geometry
    const nativeElements = queryCaptionElements(
      ".ytp-caption-window-container, .ytp-caption-window, .caption-window, .ytp-caption-segment, .caption-visual-line"
    );
    nativeElements.forEach((el) => {
      try {
        el.style.setProperty("opacity", "0", "important");
        el.style.setProperty("pointer-events", "none", "important");
        el.style.setProperty("color", "transparent", "important");
        el.style.setProperty("background", "transparent", "important");
        el.style.setProperty("border", "none", "important");
        el.style.setProperty("box-shadow", "none", "important");
      } catch {}
    });
  }

  function restoreNativeCaptions() {
    document.documentElement.classList.remove("kiki-captions-active");
    const v = videoEl();
    if (v) v.classList.remove("kiki-hide-native-cue");
    const nativeElements = queryCaptionElements(
      ".ytp-caption-window-container, .ytp-caption-window, .caption-window, .ytp-caption-segment, .caption-visual-line"
    );
    nativeElements.forEach((el) => {
      try {
        el.style.removeProperty("opacity");
        el.style.removeProperty("pointer-events");
        el.style.removeProperty("color");
        el.style.removeProperty("background");
        el.style.removeProperty("border");
        el.style.removeProperty("box-shadow");
      } catch {}
    });
  }

  let lastSelfHealFetchTime = 0;
  function onNativeCaptionsMutated() {
    suppressNativeCaptions();

    if (typeof checkResourceTimingForTimedtext === "function") {
      checkResourceTimingForTimedtext();
    }

    // 1. Check wire sniffer cache even in liveMode to upgrade live -> structured
    const curVid = currentVideoId();
    const curBody = capturedBody || STATE.capturedBody || window.__kiki_capturedBody;
    const curVidCaptured = capturedVideoId || STATE.capturedVideoId;
    if (curBody && curBody.trim().length > 20) {
      if (!curVidCaptured || curVidCaptured === curVid) {
        const cues = parseAny(curBody);
        if (cues && cues.length >= 5) {
          if (STATE.liveMode || !STATE.cues || STATE.cues.length < 5) {
            applyLoadedCues(cues, "wire-sniffer", STATE.activeTrack);
            return;
          }
        }
      }
    }

    // 2. If structured cues already loaded and active, never run live mode!
    if (!STATE.liveMode && STATE.cues && STATE.cues.length >= 5) return;

    // 3. Check if video.textTracks has loaded genuine cues
    const trackCues = extractCuesFromVideo();
    if (trackCues && trackCues.length >= 5) {
      applyLoadedCues(trackCues, "video-track", STATE.activeTrack);
      return;
    }

    // 4. Self-heal: Try upgrading with captured PoToken if available
    const pot = lastPoToken || STATE.lastPoToken || window.__kiki_lastPoToken;
    if (pot && STATE.activeTrack?.baseUrl && Date.now() - lastSelfHealFetchTime > 3500 && !loadingTracks) {
      lastSelfHealFetchTime = Date.now();
      const rawUrl = STATE.activeTrack.baseUrl;
      const targetUrl = isUrlSigned(rawUrl)
        ? rawUrl
        : (rawUrl.includes("fmt=") ? rawUrl.replace(/fmt=[^&]+/, "fmt=json3") : rawUrl + (rawUrl.includes("?") ? "&" : "?") + "fmt=json3");
      fetchExact(targetUrl, 2500).then((raw) => {
        const cues = parseAny(raw);
        if (cues && cues.length >= 5) {
          applyLoadedCues(cues, "pot-upgrade", STATE.activeTrack);
        }
      }).catch(() => {});
    }

    // 5. Check if resource timing captured a working player URL
    if (typeof checkResourceTimingForTimedtext === "function") {
      const foundUrl = checkResourceTimingForTimedtext();
      if (foundUrl && (!lastSelfHealFetchTime || Date.now() - lastSelfHealFetchTime > 3000)) {
        lastSelfHealFetchTime = Date.now();
        fetchExact(foundUrl, 2000).then((raw) => {
          const cues = parseAny(raw);
          if (cues && cues.length >= 5) {
            applyLoadedCues(cues, "wire-url", STATE.activeTrack);
          }
        }).catch(() => {});
      }
    }

    // 6. Render live caption text immediately without any blocking
    const liveText = getLiveCaptionText();
    if (liveText && liveText !== lastObservedText) {
      lastObservedText = liveText;
      STATE.lastObservedText = liveText;
      STATE.liveMode = true;

      // Accumulate into STATE.liveCues (separate from STATE.cues)
      try {
        const v = videoEl();
        const nowMs = Math.round((v ? v.currentTime : 0) * 1000);
        if (!Array.isArray(STATE.liveCues)) STATE.liveCues = [];
        if (STATE.liveCues.length > 0) {
          const prev = STATE.liveCues[STATE.liveCues.length - 1];
          if (prev && (prev.end > nowMs || nowMs - prev.start < 8000)) {
            prev.end = Math.max(nowMs, prev.start + 500);
          }
        }
        const lastCue = STATE.liveCues[STATE.liveCues.length - 1];
        if (!lastCue || lastCue.text !== liveText) {
          STATE.liveCues.push({
            start: nowMs,
            end: nowMs + 4000,
            text: liveText
          });
        }
      } catch {}

      const box = document.getElementById("kiki-captions");
      if (box && typeof window.renderTextToBox === "function") {
        window.renderTextToBox(box, liveText);
      }
      updateHud();
    }
  }

  function bindVideoTrackListeners() {
    const v = videoEl();
    if (!v || v._kiki_tracks_bound) return;
    v._kiki_tracks_bound = true;

    // When video starts playing, if captions haven't loaded yet, immediately fetch
    v.addEventListener("play", () => {
      if (!STATE.cues || !STATE.cues.length) {
        lastFailedVideoId = "";
        ensureCaptionsActive(STATE.activeTrack);
        setTimeout(() => loadForVideo(true), 250);
      }
    });

    if (!v.textTracks) return;

    function checkTrack(track) {
      if (!track) return;
      if (track.mode === "disabled") {
        try { track.mode = "showing"; } catch {}
      }
      track.addEventListener("cuechange", () => {
        onNativeCaptionsMutated();
      });
    }

    try {
      v.textTracks.addEventListener("addtrack", (e) => {
        checkTrack(e.track);
        onNativeCaptionsMutated();
      });
      for (let i = 0; i < v.textTracks.length; i++) {
        checkTrack(v.textTracks[i]);
      }
    } catch {}
  }


  // -------------------------------------------------------------
  // 9. Video Lifecycle & Robust Subtitle Engine
  // -------------------------------------------------------------
  function waitForPlayer() {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        const v = videoEl();
        const p = playerEl();
        const hasPr = p && typeof p.getPlayerResponse === "function" && Boolean(p.getPlayerResponse());
        if (p && v && (v.readyState >= 1 || v.duration > 0 || hasPr || Date.now() - t0 > 4500)) {
          clearInterval(iv);
          resolve();
        } else if (Date.now() - t0 > 8000) {
          clearInterval(iv);
          resolve();
        }
      }, 150);
    });
  }

  let loadingTracks = false;
  let lastFailedVideoId = "";
  let lastLoadAttemptTime = 0;
  let lastCaptionActivationTime = 0;

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function isTrackForCurrentVideo(track, vid) {
    if (!track || !track.baseUrl) return false;
    if (!vid) return true;
    try {
      const u = new URL(track.baseUrl, location.href);
      const trackVid = u.searchParams.get("v");
      if (trackVid && vid && trackVid !== vid) return false;
    } catch {}
    return true;
  }

  function getAllCaptionTracks(vid) {
    const curVid = vid || currentVideoId();
    const filterTracks = (list) => {
      if (!Array.isArray(list)) return [];
      return list.filter(t => isTrackForCurrentVideo(t, curVid));
    };

    const domTracks = getCaptionTracksFromDom();
    if (domTracks && domTracks.length) {
      const filtered = filterTracks(domTracks);
      if (filtered.length) return filtered;
    }

    try {
      const mp = document.getElementById("movie_player") || playerEl();
      if (mp && typeof mp.getPlayerResponse === "function") {
        const pr = mp.getPlayerResponse();
        const ct = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        const filtered = filterTracks(ct);
        if (filtered.length) return filtered;
      }
      if (mp && typeof mp.getOption === "function") {
        const tl = mp.getOption("captions", "tracklist");
        const filtered = filterTracks(tl);
        if (filtered.length) return filtered;
      }
    } catch {}
    try {
      const flexy = document.querySelector("ytd-watch-flexy");
      const ct = flexy?.playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      const filtered = filterTracks(ct);
      if (filtered.length) return filtered;
    } catch {}
    try {
      const ct = window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      const filtered = filterTracks(ct);
      if (filtered.length) return filtered;
    } catch {}
    return [];
  }

  function detectVideoLanguage() {
    try {
      const mp = document.getElementById("movie_player") || playerEl();
      if (mp && typeof mp.getPlayerResponse === "function") {
        const pr = mp.getPlayerResponse();
        const dl = pr?.microformat?.playerMicroformatRenderer?.defaultLanguage;
        if (typeof dl === "string" && dl) return dl.toLowerCase();
      }
    } catch {}
    try {
      const dl = window.ytInitialPlayerResponse?.microformat?.playerMicroformatRenderer?.defaultLanguage;
      if (typeof dl === "string" && dl) return dl.toLowerCase();
    } catch {}
    try {
      const docLang = document.documentElement.lang;
      if (docLang && typeof docLang === "string") return docLang.toLowerCase();
    } catch {}
    return "en";
  }

  function getTrackScore(t, videoLang = "en") {
    if (!t) return 0;
    const lang = (t.languageCode || "").toLowerCase();
    const isOfficial = t.kind !== "asr";
    const baseLang = videoLang.split("-")[0];
    const isPrimary = lang === videoLang || lang.startsWith(baseLang);

    // 1. Primary language official track (e.g. EN US/UK for English video, JA for Japanese video)
    if (isPrimary && isOfficial) return 1000;
    // 2. Auto-generated track of primary language
    if (isPrimary && !isOfficial) return 800;
    // 3. Other official tracks
    if (isOfficial) return 500;
    // 4. Other auto-generated tracks
    return 200;
  }

  function pickBestTrack(tracks) {
    if (!tracks || !tracks.length) return null;
    const vidLang = detectVideoLanguage();
    const sorted = [...tracks].sort((a, b) => getTrackScore(b, vidLang) - getTrackScore(a, vidLang));
    return sorted[0];
  }

  function isUrlSigned(url) {
    if (!url || typeof url !== "string") return false;
    return url.includes("&sig=") || url.includes("?sig=") || url.includes("&signature=") || url.includes("?signature=");
  }

  async function fetchExact(url, timeoutMs = 2500) {
    if (!url) return "";
    try {
      let cleanUrl = url
        .replace(/&amp;/g, "&")
        .replace(/\\u0026/g, "&")
        .replace(/\\\//g, "/");

      const token = lastPoToken || STATE?.lastPoToken || window.__kiki_lastPoToken;
      if (token && !cleanUrl.includes("&pot=") && !cleanUrl.includes("?pot=")) {
        cleanUrl += (cleanUrl.includes("?") ? "&" : "?") + `potc=1&pot=${encodeURIComponent(token)}`;
      }

      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const fetchFn = (typeof window !== "undefined" && (window.origFetch || window.fetch)) || fetch;
        const res = await fetchFn.call(window, cleanUrl, {
          credentials: "include",
          cache: "default",
          signal: ctrl.signal
        });
        clearTimeout(tid);
        if (res && res.ok) {
          const text = await res.text();
          if (text && text.trim().length > 20) {
            return text;
          }
        }
      } catch {} finally {
        clearTimeout(tid);
      }
    } catch {}
    return "";
  }

  function clickElement(el) {
    if (!el) return;
    try { el.click(); } catch {}
    try {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    } catch {}
    try {
      el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "touch" }));
      el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerType: "touch" }));
    } catch {}
  }

  function ensureCaptionsActive(targetTrack = null) {
    try {
      const p = playerEl();
      if (p) {
        if (typeof p.loadModule === "function") {
          try { p.loadModule("captions"); } catch {}
        }
        if (typeof p.setOption === "function") {
          try {
            const lang = targetTrack?.languageCode || detectVideoLanguage() || "ja";
            const trackOption = {
              languageCode: lang
            };
            if (targetTrack?.vssId || targetTrack?.vss_id) {
              trackOption.vss_id = targetTrack.vssId || targetTrack.vss_id;
            }
            p.setOption("captions", "track", trackOption);
          } catch {}
        }
        if (typeof p.toggleSubtitlesOn === "function") {
          try { p.toggleSubtitlesOn(); } catch {}
        }
      }
      const ccButtons = queryCaptionElements(".ytp-subtitles-button");
      ccButtons.forEach((btn) => {
        if (!btn) return;
        const pressed = btn.getAttribute("aria-pressed");
        if (pressed === "false" || !pressed) {
          try { btn.click(); } catch {}
        }
      });
    } catch {}
    if (typeof checkResourceTimingForTimedtext === "function") {
      checkResourceTimingForTimedtext();
    }
  }

  let transcriptFetchInProgress = false;
  let lastTranscriptAttemptTime = 0;

  function closeTranscriptPanelSilently() {
    try {
      const panel = document.querySelector('[target-id="engagement-panel-searchable-transcript"]');
      if (panel) {
        const closeBtn = panel.querySelector('button[aria-label*="lose"], button[aria-label*="关闭"], button[aria-label*="閉じる"], yt-icon-button button');
        if (closeBtn) {
          closeBtn.click();
        } else {
          panel.setAttribute("visibility", "ENGAGEMENT_PANEL_VISIBILITY_HIDDEN");
        }
      }
    } catch {}
  }

  async function tryLoadTranscriptPanel(vid, track = null) {
    if (!vid || transcriptFetchInProgress) return false;
    if (STATE.cues && STATE.cues.length >= 5 && !STATE.liveMode) return true;
    if (Date.now() - lastTranscriptAttemptTime < 3000) return false;
    lastTranscriptAttemptTime = Date.now();
    transcriptFetchInProgress = true;

    try {
      function extractFromPanel() {
        const p = document.querySelector('[target-id="engagement-panel-searchable-transcript"]');
        if (!p) return null;
        try {
          const list = p.data?.content?.transcriptRenderer?.content?.transcriptSearchPanelRenderer?.body?.transcriptSegmentListRenderer;
          const rawSegs = list?.initialSegments;
          if (rawSegs && rawSegs.length >= 5) {
            const parsed = rawSegs.map(s => {
              const r = s.transcriptSegmentRenderer;
              if (!r) return null;
              const start = parseInt(r.startMs || "0", 10);
              let end = parseInt(r.endMs || "0", 10);
              if (!end || end <= start) end = start + 3000;
              const text = (r.snippet?.runs || []).map(x => x.text).join("") || "";
              return { start, end, text };
            }).filter(c => c && c.text);
            if (parsed.length >= 5) return parsed;
          }
        } catch {}

        try {
          const domSegs = p.querySelectorAll("ytd-transcript-segment-renderer");
          if (domSegs && domSegs.length >= 5) {
            const parsed = Array.from(domSegs).map(s => {
              let start = 0, end = 0, text = "";
              if (s.data) {
                start = parseInt(s.data.startMs || "0", 10);
                end = parseInt(s.data.endMs || "0", 10);
                if (s.data.snippet?.runs) text = s.data.snippet.runs.map(x => x.text).join("");
              }
              if (!text) {
                const textEl = s.querySelector(".segment-text, yt-formatted-string");
                text = textEl ? textEl.innerText.trim() : "";
              }
              if (!end || end <= start) end = start + 3000;
              return { start, end, text };
            }).filter(c => c && c.text);
            if (parsed.length >= 5) return parsed;
          }
        } catch {}
        return null;
      }

      // Check if already populated
      let cues = extractFromPanel();
      if (cues && cues.length >= 5) {
        closeTranscriptPanelSilently();
        applyLoadedCues(cues, "transcript", track || STATE.activeTrack);
        return true;
      }

      // Trigger the panel to open and load data
      const p = document.querySelector('[target-id="engagement-panel-searchable-transcript"]');
      if (p) {
        p.setAttribute("visibility", "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED");
        p.removeAttribute("hidden");
      }

      // Also trigger transcript button if present
      const allBtns = Array.from(document.querySelectorAll("button, ytd-button-renderer"));
      const transcriptBtn = allBtns.find(b => {
        const txt = (b.innerText || b.getAttribute("aria-label") || "").toLowerCase();
        return txt.includes("transcript") || txt.includes("字幕文稿") || txt.includes("文字起こし");
      });
      if (transcriptBtn) {
        try { (transcriptBtn.querySelector("button") || transcriptBtn).click(); } catch {}
      }

      // Poll for data to arrive (up to 2.4s)
      for (let i = 0; i < 15; i++) {
        await sleep(160);
        if (currentVideoId() !== vid) break;
        cues = extractFromPanel();
        if (cues && cues.length >= 5) {
          closeTranscriptPanelSilently();
          applyLoadedCues(cues, "transcript", track || STATE.activeTrack);
          return true;
        }
      }

      closeTranscriptPanelSilently();
      return false;
    } catch (err) {
      console.warn("[Kiki transcript panel error]", err);
      closeTranscriptPanelSilently();
      return false;
    } finally {
      transcriptFetchInProgress = false;
    }
  }

  function applyLoadedCues(cues, source, track = null) {
    if (!cues || cues.length < 5) return;
    if (cues.length <= 8 && cues.some((c) => isDummyCueText(c.text))) {
      return;
    }
    STATE.cues = cues;
    STATE.liveCues = [];
    STATE.idx = -1;
    STATE.loadingTracks = false;
    loadingTracks = false;
    STATE.liveMode = false;
    STATE.liveFallbackAllowed = false;
    STATE.lastObservedText = "";
    lastObservedText = "";
    if (track) {
      STATE.activeTrack = track;
    }
    renderCue(-1);
    const v = videoEl();
    if (v && !v.paused && typeof findIndex === "function") {
      const curMs = v.currentTime * 1000;
      const i = findIndex(curMs);
      if (i >= 0) {
        STATE.idx = i;
        renderCue(i);
      }
    }
    lastFailedVideoId = "";
    suppressNativeCaptions();
    updateHud();
    const trackLabel = track?.name?.simpleText || source;
    toast(`Captions: ${cues.length} lines (${trackLabel})`);
  }

  async function selectSubtitleTrack(track) {
    if (!track) return;
    STATE.activeTrack = track;
    const trackLabel = track.name?.simpleText || track.languageCode;
    updateHud(`CC: ${trackLabel} ▾`);
    toast(`Switching to ${trackLabel}...`);

    // 1. First try fetching timedtext directly (with PoToken if known)
    if (track.baseUrl) {
      let raw = await fetchExact(track.baseUrl, 2500);
      let cues = parseAny(raw);
      if (!cues || cues.length < 5) {
        if (!track.baseUrl.includes("&sig=") && !track.baseUrl.includes("?sig=")) {
          const jsonUrl = track.baseUrl.includes("fmt=")
            ? track.baseUrl.replace(/fmt=[^&]+/, "fmt=json3")
            : track.baseUrl + (track.baseUrl.includes("?") ? "&" : "?") + "fmt=json3";
          raw = await fetchExact(jsonUrl, 2500);
          cues = parseAny(raw);
        }
      }
      if (cues && cues.length >= 5) {
        applyLoadedCues(cues, track.kind === "asr" ? "auto" : "official", track);
        return;
      }
    }

    // 2. Try loading structured cues from transcript panel
    const transcriptOk = await tryLoadTranscriptPanel(currentVideoId(), track);
    if (transcriptOk) return;

    // 3. Instruct player to switch to this track
    try {
      const p = playerEl();
      if (p && typeof p.setOption === "function") {
        const trkOpt = {
          languageCode: track.languageCode
        };
        if (track.vssId || track.vss_id) {
          trkOpt.vss_id = track.vssId || track.vss_id;
        }
        p.setOption("captions", "track", trkOpt);
      }
    } catch {}
    ensureCaptionsActive(track);

    // 3. Wait up to 1500ms for player network response to be intercepted
    for (let i = 0; i < 8; i++) {
      await sleep(180);
      if (STATE.cues && STATE.cues.length >= 5 && !STATE.liveMode) {
        return;
      }
    }

    // 4. Fallback: activate live mode for this track
    STATE.liveFallbackAllowed = true;
    STATE.liveMode = true;
    const liveText = getLiveCaptionText();
    if (liveText) {
      lastObservedText = liveText;
      STATE.lastObservedText = liveText;
      const box = document.getElementById("kiki-captions");
      if (box && typeof window.renderTextToBox === "function") {
        window.renderTextToBox(box, liveText);
      }
    }
    updateHud(`CC: Live (${trackLabel}) ▾`);
    toast(`Switched to ${trackLabel} (Realtime)`);
  }
  window.selectSubtitleTrack = selectSubtitleTrack;

  function switchToLiveSubtitles() {
    STATE.cues = [];
    STATE.liveCues = [];
    STATE.liveFallbackAllowed = true;
    STATE.liveMode = true;
    STATE.lastObservedText = "";
    lastObservedText = "";
    ensureCaptionsActive();
    const liveText = getLiveCaptionText();
    if (liveText) {
      const box = document.getElementById("kiki-captions");
      if (box && typeof window.renderTextToBox === "function") {
        window.renderTextToBox(box, liveText);
      }
    }
    updateHud("CC: Live ▾");
    toast("Switched to realtime subtitles");
  }
  window.switchToLiveSubtitles = switchToLiveSubtitles;

  async function loadForVideo(force = false) {
    if (loadingTracks && !force) return;
    const vid = currentVideoId();
    if (!vid) {
      updateHud("Home ▾");
      return;
    }

    loadingTracks = true;
    STATE.loadingTracks = true;
    STATE.liveFallbackAllowed = true;
    if (force) {
      STATE.cues = [];
      if (!STATE.liveMode && (!STATE.liveCues || !STATE.liveCues.length)) {
        STATE.liveCues = [];
        STATE.lastObservedText = "";
        lastObservedText = "";
      }
    }
    lastLoadAttemptTime = Date.now();
    if (!STATE.liveMode || !STATE.liveCues || !STATE.liveCues.length) {
      updateHud("CC: Loading... ▾");
    }

    try {
      // 0. Synchronous inspection of resource timing for any timedtext URL
      if (typeof checkResourceTimingForTimedtext === "function") {
        checkResourceTimingForTimedtext();
      }

      // 1. Wire sniffer cache / early captured body
      const cBody = capturedBody || STATE.capturedBody || window.__kiki_capturedBody;
      const cVid = capturedVideoId || STATE.capturedVideoId;
      if (cBody && (cVid === vid || !cVid) && cBody.trim().length > 20) {
        const cues = parseAny(cBody);
        if (cues && cues.length >= 5) {
          applyLoadedCues(cues, "wire-cache", STATE.activeTrack);
          return;
        }
      }

      // 2. DOM / Player extraction (with quick polling retry)
      let tracks = getAllCaptionTracks(vid);
      if (!tracks || !tracks.length) {
        for (let i = 0; i < 4; i++) {
          await sleep(150);
          tracks = getAllCaptionTracks(vid);
          if (tracks && tracks.length) break;
        }
      }

      // 3. Innertube API fallback (with abort timeout)
      if (!tracks || !tracks.length) {
        try {
          const it = await innertubeTracks(vid);
          if (it && it.length) {
            tracks = it.filter(t => isTrackForCurrentVideo(t, vid));
          }
        } catch {}
      }

      // 4. Background page fetch fallback (with abort timeout)
      if (!tracks || !tracks.length) {
        try {
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 2000);
          const res = await origFetch.call(window, `https://www.youtube.com/watch?v=${vid}`, {
            credentials: "omit",
            signal: ctrl.signal
          });
          clearTimeout(tid);
          if (res.ok) {
            const html = await res.text();
            const extracted = extractTracksFromHtml(html);
            if (extracted && extracted.length) {
              tracks = extracted.filter(t => isTrackForCurrentVideo(t, vid));
            }
          }
        } catch {}
      }

      let bestTrack = null;
      if (tracks && tracks.length) {
        const vidLang = detectVideoLanguage();
        const sorted = [...tracks].sort((a, b) => getTrackScore(b, vidLang) - getTrackScore(a, vidLang));
        STATE.tracks = sorted;
        if (!STATE.activeTrack || !sorted.some(t => t.baseUrl === STATE.activeTrack?.baseUrl)) {
          STATE.activeTrack = sorted[0];
        }
        bestTrack = STATE.activeTrack;

        // 5. Early activation: trigger YouTube player captions module & XHR right now!
        ensureCaptionsActive(bestTrack);

        // Try best prioritized track directly with fast timeout (1200ms)
        if (bestTrack && bestTrack.baseUrl) {
          let raw = await fetchExact(bestTrack.baseUrl, 1200);
          let cues = parseAny(raw);
          if (!cues || cues.length < 5) {
            if (!isUrlSigned(bestTrack.baseUrl)) {
              const jsonUrl = bestTrack.baseUrl.includes("fmt=")
                ? bestTrack.baseUrl.replace(/fmt=[^&]+/, "fmt=json3")
                : bestTrack.baseUrl + (bestTrack.baseUrl.includes("?") ? "&" : "?") + "fmt=json3";
              raw = await fetchExact(jsonUrl, 1200);
              cues = parseAny(raw);
            }
          }
          if ((!cues || cues.length < 5) && !isUrlSigned(bestTrack.baseUrl)) {
            const cleanUrl = bestTrack.baseUrl.replace(/[?&]exp=xpe/, "").replace(/\?&/, "?");
            raw = await fetchExact(cleanUrl, 1200);
            cues = parseAny(raw);
          }
          if (cues && cues.length >= 5) {
            applyLoadedCues(cues, bestTrack.kind === "asr" ? "auto" : "official", bestTrack);
            return;
          }
        }
      } else {
        ensureCaptionsActive(null);
      }

      // 6. Check if capturedLastUrl from resource timing / sniffer can be fetched directly
      const curLastUrl = capturedLastUrl || STATE.capturedLastUrl;
      if (curLastUrl && curLastUrl.includes(MARK)) {
        let raw = await fetchExact(curLastUrl, 1500);
        let cues = parseAny(raw);
        if (cues && cues.length >= 5) {
          applyLoadedCues(cues, "wire-url", bestTrack || STATE.activeTrack);
          return;
        }
      }

      // 7. Check video textTracks immediately
      const earlyCues = extractCuesFromVideo();
      if (earlyCues && earlyCues.length >= 5) {
        applyLoadedCues(earlyCues, "video-track", bestTrack || STATE.activeTrack);
        return;
      }

      // 8. Always enable live captioning fallback immediately — zero freeze, zero waiting!
      STATE.liveFallbackAllowed = true;
      STATE.liveMode = true;
      const liveText = getLiveCaptionText();
      const trkLabel = bestTrack?.name?.simpleText || bestTrack?.languageCode || "Track";
      if (liveText) {
        lastObservedText = liveText;
        STATE.lastObservedText = liveText;
        const box = document.getElementById("kiki-captions");
        if (box && typeof window.renderTextToBox === "function") {
          window.renderTextToBox(box, liveText);
        }
      }
      updateHud(`CC: Live (${trkLabel}) ▾`);

      // 9. Silent background Transcript Panel extractor
      tryLoadTranscriptPanel(vid, bestTrack);

      // 10. Background self-heal: asynchronously try direct candidates without blocking UI
      setTimeout(() => {
        const directCandidates = [
          `https://www.youtube.com/api/timedtext?v=${vid}&lang=en&fmt=json3`,
          `https://www.youtube.com/api/timedtext?v=${vid}&lang=en&kind=asr&fmt=json3`,
          `https://www.youtube.com/api/timedtext?v=${vid}&lang=ja&fmt=json3`,
          `https://www.youtube.com/api/timedtext?v=${vid}&lang=ja&kind=asr&fmt=json3`
        ];
        Promise.all(directCandidates.map(c => fetchExact(c, 1500))).then((results) => {
          if (STATE.cues && STATE.cues.length >= 5 && !STATE.liveMode) return;
          for (const raw of results) {
            const cues = parseAny(raw);
            if (cues && cues.length >= 5) {
              applyLoadedCues(cues, "direct", bestTrack);
              return;
            }
          }
        }).catch(() => {});
      }, 500);
    } finally {
      loadingTracks = false;
      STATE.loadingTracks = false;
    }
  }
  window.reloadSubtitlesForVideo = () => loadForVideo(true);

  function dismissMiniplayer() {
    try {
      const mini = document.querySelectorAll(
        "ytd-miniplayer, #miniplayer, ytd-miniplayer-renderer, ytd-mealbar-promo-renderer, yt-mealbar-promo-renderer"
      );
      mini.forEach((m) => {
        if (!currentVideoId()) {
          const v = m.querySelector("video");
          if (v && !v.paused) v.pause();
        }
        m.remove();
      });
    } catch {}
  }

  function tryAutoplay() {
    const v = videoEl();
    if (v && v.paused && v.currentTime === 0) {
      try {
        const p = v.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch {}
    }
  }

  async function onNavigate() {
    const id = currentVideoId();
    if (!id) {
      updateHud("✦ Kiki (Home)");
      return;
    }
    if (id === STATE.videoId && STATE.cues.length) return;

    STATE.videoId = id;
    STATE.cues = [];
    STATE.liveCues = [];
    STATE.idx = -1;
    lastObservedText = "";
    STATE.lastObservedText = "";
    liveToastShown = false;
    lastFailedVideoId = "";
    lastLoadAttemptTime = 0;
    STATE.liveMode = true;
    renderCue(-1);
    closeLookup();

    await waitForPlayer();
    ensureHud();
    ensureRoot();
    ensureCaptionObserver();
    bindVideoTrackListeners();
    tryAutoplay();
    await loadForVideo();
  }

  function tick() {
    try {
      dismissMiniplayer();
      ensureHud();
      ensureRoot();
      ensureCaptionObserver();
      bindVideoTrackListeners();
      updateHud();
      updateCaptionPosition();
      if (!STATE.enabled) return;

      const curVid = currentVideoId();
      if (curVid && curVid !== STATE.videoId) {
        onNavigate();
        return;
      }

      const v = videoEl();
      if (!v) return;

      if ((!STATE.cues || !STATE.cues.length) && STATE.videoId) {
        const isPlaying = v && !v.paused && (v.currentTime > 0 || v.readyState >= 1);
        const retryTimeout = isPlaying ? 3500 : 8000;
        if (!loadingTracks && !STATE.loadingTracks && Date.now() - lastLoadAttemptTime > retryTimeout) {
          loadForVideo();
        }
      }

      // Self-heal: if in liveMode and without structured cues, periodically try transcript panel
      if (STATE.liveMode && (!STATE.cues || !STATE.cues.length) && STATE.videoId) {
        if (!loadingTracks && !STATE.loadingTracks && Date.now() - lastTranscriptAttemptTime > 5000) {
          tryLoadTranscriptPanel(STATE.videoId, STATE.activeTrack);
        }
      }

      if ((!STATE.cues || !STATE.cues.length) && STATE.videoId) {
        const btn = document.querySelector(".ytp-subtitles-button");
        const alreadyOn = btn && btn.getAttribute("aria-pressed") === "true";
        if (!alreadyOn && Date.now() - lastCaptionActivationTime > 2200) {
          lastCaptionActivationTime = Date.now();
          ensureCaptionsActive(STATE.activeTrack);
        }
      }

      if (!STATE.liveMode && STATE.cues && STATE.cues.length >= 5) {
        suppressNativeCaptions();
        const curMs = v.currentTime * 1000;
        const i = findIndex(curMs);
        if (i !== STATE.idx) {
          STATE.idx = i;
          renderCue(i);
        }
      } else {
        suppressNativeCaptions();
        const liveText = getLiveCaptionText();
        if (liveText && liveText !== lastObservedText) {
          onNativeCaptionsMutated();
        }
      }
    } catch (err) {
      console.warn('[Kiki tick error]', err);
    }
  }

  // Keyboard Shortcuts
  window.addEventListener("keydown", (e) => {
    if (!STATE.enabled) return;
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable)) return;
    const k = e.key;
    if (k === "[" || k === "ArrowLeft" || k === "a" || k === "A") {
      e.preventDefault();
      e.stopPropagation();
      seekCue(-1);
      toast("← previous line");
    } else if (k === "]" || k === "ArrowRight" || k === "d" || k === "D") {
      e.preventDefault();
      e.stopPropagation();
      seekCue(1);
      toast("next line →");
    } else if (e.code === "Space" || k === " ") {
      e.preventDefault();
      e.stopPropagation();
      togglePause();
    } else if (e.altKey && (k === "f" || k === "F")) {
      e.preventDefault();
      toggleWebpageFs();
    }
  }, true);

  // SPA Navigation Observers
  document.addEventListener("yt-navigate-finish", () => setTimeout(onNavigate, 150));
  document.addEventListener("yt-player-updated", () => {
    if (!STATE.cues.length && !loadingTracks) setTimeout(onNavigate, 200);
  });
  window.addEventListener("popstate", () => setTimeout(onNavigate, 150));
  ["play", "playing", "canplay", "loadeddata"].forEach((evtName) => {
    document.addEventListener(evtName, (e) => {
      const v = videoEl();
      if (e.target === v) {
        if (!STATE.cues.length && !loadingTracks && !STATE.loadingTracks) {
          lastFailedVideoId = "";
          setTimeout(() => loadForVideo(true), 200);
        }
      }
    }, true);
  });

  bindNativeGuard();

  const initInterval = setInterval(() => {
    if (document.body || document.documentElement) {
      clearInterval(initInterval);
      try { injectStyles(); } catch (e) { console.warn('[Kiki init styles]', e); }
      try { ensureHud(); } catch (e) { console.warn('[Kiki init hud]', e); }
      try { ensureRoot(); } catch (e) { console.warn('[Kiki init root]', e); }
      try { setInterval(tick, 120); } catch (e) { console.warn('[Kiki init tick]', e); }
      try { onNavigate(); } catch (e) { console.warn('[Kiki init onNavigate]', e); }
      setTimeout(() => {
        const hudEl = document.getElementById("kiki-hud");
        const v = videoEl();
        const vState = v ? (v.paused ? "Paused" : "Play") : "NoVid";
        const hudState = hudEl ? (hudEl.offsetWidth > 0 ? `${hudEl.offsetWidth}x${hudEl.offsetHeight}` : "0px") : "NULL";
        const trkCount = v && v.textTracks ? v.textTracks.length : 0;
        const kikiVer = window.__kiki_engine_version || localStorage.getItem("kiki_cache_version") || "1.2.5";
        toast(`✦ Kiki v${kikiVer} [HUD:${hudState}|${vState}|TT:${trkCount}]`);
      }, 700);
      setTimeout(() => {
        ensureHud();
        ensureRoot();
      }, 1500);
    }
  }, 100);

  document.addEventListener("DOMContentLoaded", () => {
    try { injectStyles(); } catch {}
    try { ensureHud(); } catch {}
    try { ensureRoot(); } catch {}
    try { onNativeCaptionsMutated(); } catch {}
  });



  console.log('[Kiki Immersion] v1.3.1 Modular Engine Loaded on:', location.href);
})();


// >>> END MODULE: youtube <<<


})();
