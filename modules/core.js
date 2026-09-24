// =============================================================
// Kiki Immersion - Core Module (State, Config, Styles, Utilities)
// Version: 1.3.3
// =============================================================

  window.__kiki_engine_version = "1.3.3";
  try {
    localStorage.setItem("kiki_engine_version", "1.3.3");
    localStorage.setItem("kiki_cache_version", "1.3.3");
  } catch (e) {}

  let savedPot = "";
  try {
    savedPot = window.__kiki_lastPoToken || sessionStorage.getItem("kiki_pot") || "";
  } catch {}

  const isYouTubeDomain = /(?:^|\.)youtube\.com$/.test(location.hostname);
  const STATE = window.STATE = {
    enabled: true,
    isYouTube: isYouTubeDomain,
    theme: localStorage.getItem("kiki_theme") || "auto",
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
    engineVersion: "1.3.3"
  };

  // -------------------------------------------------------------
  // Theme Management (Liquid Glass Dark & Light Modes)
  // -------------------------------------------------------------
  function isPageDark() {
    try {
      if (typeof STATE !== "undefined" && STATE.isYouTube) return true;
      const docEl = document.documentElement;
      if (docEl && (docEl.classList.contains("dark") || docEl.getAttribute("data-theme") === "dark")) return true;
      if (document.body) {
        const bColor = window.getComputedStyle(document.body).backgroundColor;
        const rgb = bColor ? bColor.match(/\d+/g) : null;
        if (rgb && rgb.length >= 3) {
          const r = +rgb[0], g = +rgb[1], b = +rgb[2];
          // Check if not transparent
          if (rgb.length < 4 || +rgb[3] > 0.1) {
            const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            if (lum < 115) return true;
          }
        }
      }
    } catch {}
    return false;
  }

  function getResolvedTheme() {
    const pref = (typeof STATE !== "undefined" && STATE.theme) ||
                 localStorage.getItem("kiki_theme") || "auto";
    if (pref === "dark") return "dark";
    if (pref === "light") return "light";
    // In "auto" mode: follow dark webpage environment (e.g. LingQ dark mode, YouTube)
    if (isPageDark()) return "dark";
    return (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  }
  window.getResolvedTheme = getResolvedTheme;

  function applyTheme(theme) {
    if (theme) {
      STATE.theme = theme;
      try { localStorage.setItem("kiki_theme", theme); } catch {}
    }
    const resolved = getResolvedTheme();
    try {
      if (document.documentElement) {
        document.documentElement.setAttribute("data-kiki-theme", resolved);
        document.documentElement.setAttribute("data-kiki-theme-pref", STATE.theme || "auto");
      }
    } catch {}
    return resolved;
  }
  window.applyTheme = applyTheme;

  // Initialize theme on script load
  applyTheme();

  // Listen to system color scheme changes in real-time (Windows & macOS)
  if (typeof window !== "undefined" && window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSchemeChange = () => {
      const pref = (typeof STATE !== "undefined" && STATE.theme) || localStorage.getItem("kiki_theme") || "auto";
      if (pref === "auto") {
        applyTheme("auto");
      }
    };
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onSchemeChange);
    } else if (typeof mq.addListener === "function") {
      mq.addListener(onSchemeChange);
    }
  }

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
  window.currentVideoId = currentVideoId;


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
  window.toast = toast;


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
      position: fixed !important;
      left: 50% !important;
      bottom: 85px !important;
      transform: translateX(-50%) !important;
      width: min(94%, 1000px) !important;
      pointer-events: auto !important;
      z-index: 2147483645 !important;
      text-align: center !important;
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
      background: rgba(16, 16, 20, 0.78) !important;
      backdrop-filter: blur(28px) saturate(180%) !important;
      -webkit-backdrop-filter: blur(28px) saturate(180%) !important;
      border: 1.5px solid rgba(255, 255, 255, 0.28) !important;
      border-radius: 20px !important;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.1), inset 0 1.5px 1.5px rgba(255, 255, 255, 0.25) !important;
      color: #F1F5F9 !important;
      overflow-x: hidden !important; overflow-y: auto !important; -webkit-overflow-scrolling: touch !important;
      padding: 18px 22px !important; box-sizing: border-box !important; display: none; pointer-events: auto !important;
      width: min(580px, calc(100vw - 28px)) !important;
      max-width: min(580px, calc(100vw - 28px)) !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
    }
    #kiki-yomitan-card.show { display: block !important; }
    .kiki-card-header { margin-bottom: 12px; }
    .kiki-card-term-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
    .kiki-card-term { font-size: 24px !important; font-weight: 800; letter-spacing: -0.02em; color: #FFFFFF !important; line-height: 1.2 !important; }
    .kiki-card-reading { font-size: 14.5px !important; opacity: 0.9; color: #CBD5E1 !important; font-weight: 500; }
    .kiki-card-audio-btn {
      background: rgba(255, 255, 255, 0.12) !important; border: 1px solid rgba(255, 255, 255, 0.22) !important;
      color: #FFF !important; border-radius: 50% !important; width: 28px !important; height: 28px !important;
      display: inline-flex !important; align-items: center !important; justify-content: center !important;
      cursor: pointer !important; font-size: 13px !important; transition: all 0.15s ease !important; user-select: none !important;
      box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.3) !important;
    }
    .kiki-card-audio-btn:hover, .kiki-card-audio-btn:active { background: rgba(255, 255, 255, 0.28) !important; transform: scale(1.06) !important; }
    .kiki-card-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .kiki-badge {
      font-size: 11.5px !important; font-weight: 700 !important; padding: 2.5px 8px !important; border-radius: 6px !important; line-height: 1.35 !important;
      display: inline-flex !important; align-items: center !important;
    }
    .kiki-badge-dict { background: rgba(255, 255, 255, 0.08) !important; color: #94A3B8 !important; border: 1px solid rgba(255, 255, 255, 0.14) !important; font-weight: 600 !important; }
    .kiki-badge-redirect { color: #34D399 !important; background: rgba(16, 185, 129, 0.2) !important; border: 1px solid rgba(16, 185, 129, 0.4) !important; }
    .kiki-badge-pos { color: #F87171 !important; background: rgba(239, 68, 68, 0.2) !important; border: 1px solid rgba(239, 68, 68, 0.4) !important; }
    .kiki-badge-level { color: #60A5FA !important; background: rgba(37, 99, 235, 0.2) !important; border: 1px solid rgba(37, 99, 235, 0.4) !important; }
    .kiki-badge-vocab { color: #A78BFA !important; background: rgba(124, 58, 237, 0.2) !important; border: 1px solid rgba(124, 58, 237, 0.4) !important; }
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
      background: linear-gradient(135deg, #6366F1, #8B5CF6) !important; color: #FFFFFF !important;
      border: none !important; border-radius: 8px !important;
      padding: 3.5px 10px !important; font-size: 11.5px !important; font-weight: 700 !important;
      cursor: pointer !important; display: inline-flex !important; align-items: center !important; gap: 4px !important;
      user-select: none !important; -webkit-user-select: none !important;
      box-shadow: 0 2px 8px rgba(99, 102, 241, 0.35) !important;
      transition: all 0.15s ease !important;
    }
    .kiki-card-ai-switch-btn:hover {
      box-shadow: 0 4px 14px rgba(99, 102, 241, 0.55) !important;
      transform: scale(0.97) !important;
    }
    .kiki-ai-thinking {
      animation: kikiPulse 1.5s infinite ease-in-out !important;
    }
    @keyframes kikiPulse {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 1; }
    }

    /* AI Card Base Styles */
    .kiki-card-mode-select {
      background: rgba(255, 255, 255, 0.12) !important;
      color: #E2E8F0 !important;
      font-size: 11.5px !important;
      font-weight: 600 !important;
      padding: 2px 6px !important;
      border-radius: 6px !important;
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
      cursor: pointer !important;
      outline: none !important;
    }
    .kiki-ai-quote-box {
      background: rgba(255, 255, 255, 0.06) !important;
      color: #CBD5E1 !important;
    }
    .kiki-ai-scroll-container {
      color: #F1F5F9 !important;
    }
    .kiki-ai-input-wrap {
      border-top: 1px solid rgba(255, 255, 255, 0.12) !important;
    }
    .kiki-ai-followup-input {
      background: rgba(0, 0, 0, 0.35) !important;
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
      color: #FFFFFF !important;
    }
    .kiki-ai-followup-input::placeholder {
      color: rgba(255, 255, 255, 0.45) !important;
    }
    .kiki-ai-thought-box {
      background: rgba(255, 255, 255, 0.05) !important;
      color: #94A3B8 !important;
    }
    .kiki-ai-thought-text {
      color: #CBD5E1 !important;
    }
    .kiki-ai-user-bubble {
      background: rgba(99, 102, 241, 0.28) !important;
      border: 1px solid rgba(165, 180, 252, 0.4) !important;
      color: #E0E7FF !important;
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

    /* Settings Modal Base Style */
    #kiki-settings-modal {
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
    }

    /* Sleek Frosted Glass Scrollbars */
    #kiki-yomitan-card::-webkit-scrollbar,
    #kiki-settings-modal::-webkit-scrollbar,
    #kiki-track-dropdown::-webkit-scrollbar,
    .kiki-ai-scroll-container::-webkit-scrollbar {
      width: 6px !important;
      height: 6px !important;
    }
    #kiki-yomitan-card::-webkit-scrollbar-track,
    #kiki-settings-modal::-webkit-scrollbar-track,
    #kiki-track-dropdown::-webkit-scrollbar-track,
    .kiki-ai-scroll-container::-webkit-scrollbar-track {
      background: transparent !important;
    }
    #kiki-yomitan-card::-webkit-scrollbar-thumb,
    #kiki-settings-modal::-webkit-scrollbar-thumb,
    #kiki-track-dropdown::-webkit-scrollbar-thumb,
    .kiki-ai-scroll-container::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.22) !important;
      border-radius: 4px !important;
    }

    /* Card buttons base */
    .kiki-card-settings-btn, .kiki-card-close-btn {
      background: transparent !important;
      border: none !important;
      color: #94A3B8 !important;
      font-size: 16px !important;
      cursor: pointer !important;
      line-height: 1 !important;
      padding: 0 4px !important;
      transition: color 0.15s ease !important;
    }
    .kiki-card-close-btn { font-size: 20px !important; }
    .kiki-card-settings-btn:hover, .kiki-card-close-btn:hover {
      color: #FFFFFF !important;
    }

    /* ========================================================= */
    /* Light Theme - White Translucent Liquid Glass              */
    /* ========================================================= */
    @media (prefers-color-scheme: light) {
      html:not([data-kiki-theme="dark"]) .kiki-line {
        color: #0F172A !important;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.78) 0%, rgba(255, 255, 255, 0.60) 100%) !important;
        backdrop-filter: blur(28px) saturate(200%) !important;
        -webkit-backdrop-filter: blur(28px) saturate(200%) !important;
        border: 1px solid rgba(255, 255, 255, 0.9) !important;
        border-radius: 18px !important;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.06), inset 0 1.5px 1.5px rgba(255, 255, 255, 1) !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-word.kiki-active,
      html:not([data-kiki-theme="dark"]) .kiki-word:hover {
        background: rgba(234, 88, 12, 0.18) !important;
        border-bottom-color: #EA580C !important;
        color: #9A3412 !important;
      }
      html:not([data-kiki-theme="dark"]) #kiki-yomitan-card {
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.76) 0%, rgba(255, 255, 255, 0.58) 100%) !important;
        backdrop-filter: blur(32px) saturate(220%) contrast(96%) brightness(104%) !important;
        -webkit-backdrop-filter: blur(32px) saturate(220%) contrast(96%) brightness(104%) !important;
        border: 1px solid rgba(255, 255, 255, 0.9) !important;
        border-radius: 20px !important;
        box-shadow: 0 24px 60px -12px rgba(15, 23, 42, 0.22), 0 8px 24px -4px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.08), inset 0 1.5px 1.5px 0 rgba(255, 255, 255, 1), inset 0 -1px 1px 0 rgba(0, 0, 0, 0.04) !important;
        color: #0F172A !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-card-term {
        font-size: 24px !important;
        font-weight: 800 !important;
        letter-spacing: -0.02em !important;
        color: #0F172A !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-card-reading {
        color: #475569 !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-card-audio-btn {
        background: rgba(0, 0, 0, 0.05) !important;
        border: 1px solid rgba(0, 0, 0, 0.08) !important;
        color: #0F172A !important;
        box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.8) !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-card-audio-btn:hover,
      html:not([data-kiki-theme="dark"]) .kiki-card-audio-btn:active {
        background: rgba(0, 0, 0, 0.1) !important;
        transform: scale(1.06) !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-card-settings-btn,
      html:not([data-kiki-theme="dark"]) .kiki-card-close-btn {
        color: #64748B !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-card-settings-btn:hover,
      html:not([data-kiki-theme="dark"]) .kiki-card-close-btn:hover {
        color: #0F172A !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-card-ai-switch-btn {
        background: linear-gradient(135deg, #6366F1, #8B5CF6) !important;
        color: #FFFFFF !important;
        border: none !important;
        border-radius: 8px !important;
        padding: 3.5px 10px !important;
        font-weight: 700 !important;
        box-shadow: 0 2px 8px rgba(99, 102, 241, 0.35) !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-card-ai-switch-btn:hover {
        box-shadow: 0 4px 14px rgba(99, 102, 241, 0.55) !important;
        transform: scale(0.97) !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-badge {
        font-size: 11.5px !important;
        font-weight: 700 !important;
        padding: 2.5px 8px !important;
        border-radius: 6px !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-badge-dict {
        background: rgba(0, 0, 0, 0.05) !important;
        color: #475569 !important;
        border: 1px solid rgba(0, 0, 0, 0.08) !important;
        font-weight: 600 !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-badge-redirect {
        color: #047857 !important;
        background: rgba(16, 185, 129, 0.14) !important;
        border: 1px solid rgba(16, 185, 129, 0.35) !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-badge-pos {
        color: #B91C1C !important;
        background: rgba(239, 68, 68, 0.14) !important;
        border: 1px solid rgba(239, 68, 68, 0.35) !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-badge-level {
        color: #1D4ED8 !important;
        background: rgba(37, 99, 235, 0.14) !important;
        border: 1px solid rgba(37, 99, 235, 0.35) !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-badge-vocab {
        color: #6D28D9 !important;
        background: rgba(124, 58, 237, 0.14) !important;
        border: 1px solid rgba(124, 58, 237, 0.35) !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-card-body {
        color: #1E293B !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-card-body strong,
      html:not([data-kiki-theme="dark"]) .kiki-card-body b {
        color: #0F172A !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-card-entry + .kiki-card-entry {
        border-top-color: rgba(0, 0, 0, 0.08) !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-cap-ai-btn {
        background: rgba(99, 102, 241, 0.9) !important;
        border-color: rgba(255, 255, 255, 0.95) !important;
        box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35) !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-cap-ai-btn .kiki-ai-icon {
        color: #EEF2FF !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-cap-ai-btn .kiki-ai-text {
        color: #FFFFFF !important;
      }
      html:not([data-kiki-theme="dark"]) #kiki-toast {
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.88) 0%, rgba(255, 255, 255, 0.72) 100%) !important;
        backdrop-filter: blur(28px) saturate(200%) !important;
        -webkit-backdrop-filter: blur(28px) saturate(200%) !important;
        color: #0F172A !important;
        border: 1px solid rgba(255, 255, 255, 0.95) !important;
        box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.08), inset 0 1px 1px rgba(255, 255, 255, 1) !important;
      }
      html:not([data-kiki-theme="dark"]) #kiki-hud {
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.82) 0%, rgba(255, 255, 255, 0.65) 100%) !important;
        backdrop-filter: blur(24px) saturate(200%) !important;
        -webkit-backdrop-filter: blur(24px) saturate(200%) !important;
        color: #0F172A !important;
        border: 1.5px solid rgba(255, 255, 255, 0.95) !important;
        box-shadow: 0 10px 32px rgba(15, 23, 42, 0.16), 0 0 0 1px rgba(0, 0, 0, 0.06) !important;
      }
      html:not([data-kiki-theme="dark"]) #kiki-hud:hover {
        background: rgba(255, 255, 255, 0.96) !important;
      }
      html:not([data-kiki-theme="dark"]) #kiki-hud .kiki-hud-btn {
        background: rgba(0, 0, 0, 0.06) !important;
        border: 1px solid rgba(0, 0, 0, 0.08) !important;
        color: #0F172A !important;
      }
      html:not([data-kiki-theme="dark"]) #kiki-hud .kiki-hud-btn:hover {
        background: rgba(0, 0, 0, 0.12) !important;
      }
      html:not([data-kiki-theme="dark"]) #kiki-track-dropdown {
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.92) 0%, rgba(255, 255, 255, 0.82) 100%) !important;
        backdrop-filter: blur(28px) saturate(200%) !important;
        -webkit-backdrop-filter: blur(28px) saturate(200%) !important;
        border: 1.5px solid rgba(255, 255, 255, 0.95) !important;
        box-shadow: 0 20px 48px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.08) !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-dropdown-header {
        color: #64748B !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-dropdown-item {
        color: #1E293B !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-dropdown-item:hover,
      html:not([data-kiki-theme="dark"]) .kiki-dropdown-item:active {
        background: rgba(0, 0, 0, 0.05) !important;
        color: #0F172A !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-dropdown-item.active {
        background: rgba(37, 99, 235, 0.1) !important;
        color: #1D4ED8 !important;
        border: 1px solid rgba(37, 99, 235, 0.25) !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-dropdown-tag {
        background: rgba(0, 0, 0, 0.06) !important;
        color: #475569 !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-dropdown-sep {
        background: rgba(0, 0, 0, 0.08) !important;
      }
      html:not([data-kiki-theme="dark"]) #kiki-settings-modal {
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.88) 0%, rgba(255, 255, 255, 0.74) 100%) !important;
        backdrop-filter: blur(32px) saturate(220%) !important;
        -webkit-backdrop-filter: blur(32px) saturate(220%) !important;
        border: 1.5px solid rgba(255, 255, 255, 0.95) !important;
        box-shadow: 0 28px 70px rgba(15, 23, 42, 0.22), 0 0 0 1px rgba(0, 0, 0, 0.08), inset 0 1.5px 1.5px rgba(255, 255, 255, 1) !important;
        color: #0F172A !important;
      }
      html:not([data-kiki-theme="dark"]) #kiki-yomitan-card::-webkit-scrollbar-thumb,
      html:not([data-kiki-theme="dark"]) #kiki-settings-modal::-webkit-scrollbar-thumb,
      html:not([data-kiki-theme="dark"]) #kiki-track-dropdown::-webkit-scrollbar-thumb,
      html:not([data-kiki-theme="dark"]) .kiki-ai-scroll-container::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.16) !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-card-mode-select {
        background: rgba(0, 0, 0, 0.06) !important;
        color: #0F172A !important;
        border: 1px solid rgba(0, 0, 0, 0.12) !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-ai-quote-box {
        background: rgba(0, 0, 0, 0.04) !important;
        color: #334155 !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-ai-scroll-container {
        color: #0F172A !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-ai-input-wrap {
        border-top: 1px solid rgba(0, 0, 0, 0.08) !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-ai-followup-input {
        background: rgba(255, 255, 255, 0.95) !important;
        border: 1px solid rgba(0, 0, 0, 0.15) !important;
        color: #0F172A !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-ai-followup-input::placeholder {
        color: #94A3B8 !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-ai-thought-box {
        background: rgba(0, 0, 0, 0.03) !important;
        color: #475569 !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-ai-thought-text {
        color: #334155 !important;
      }
      html:not([data-kiki-theme="dark"]) .kiki-ai-user-bubble {
        background: rgba(99, 102, 241, 0.12) !important;
        border: 1px solid rgba(99, 102, 241, 0.25) !important;
        color: #3730A3 !important;
      }
    }

    /* Light Theme Explicit Attribute Overrides */
    html[data-kiki-theme="light"] .kiki-line {
      color: #0F172A !important;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.78) 0%, rgba(255, 255, 255, 0.60) 100%) !important;
      backdrop-filter: blur(28px) saturate(200%) !important;
      -webkit-backdrop-filter: blur(28px) saturate(200%) !important;
      border: 1px solid rgba(255, 255, 255, 0.9) !important;
      border-radius: 18px !important;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.06), inset 0 1.5px 1.5px rgba(255, 255, 255, 1) !important;
    }
    html[data-kiki-theme="light"] .kiki-word.kiki-active,
    html[data-kiki-theme="light"] .kiki-word:hover {
      background: rgba(234, 88, 12, 0.18) !important;
      border-bottom-color: #EA580C !important;
      color: #9A3412 !important;
    }
    html[data-kiki-theme="light"] #kiki-yomitan-card {
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.76) 0%, rgba(255, 255, 255, 0.58) 100%) !important;
      backdrop-filter: blur(32px) saturate(220%) contrast(96%) brightness(104%) !important;
      -webkit-backdrop-filter: blur(32px) saturate(220%) contrast(96%) brightness(104%) !important;
      border: 1px solid rgba(255, 255, 255, 0.9) !important;
      border-radius: 20px !important;
      box-shadow: 0 24px 60px -12px rgba(15, 23, 42, 0.22), 0 8px 24px -4px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.08), inset 0 1.5px 1.5px 0 rgba(255, 255, 255, 1), inset 0 -1px 1px 0 rgba(0, 0, 0, 0.04) !important;
      color: #0F172A !important;
    }
    html[data-kiki-theme="light"] .kiki-card-term {
      font-size: 24px !important;
      font-weight: 800 !important;
      letter-spacing: -0.02em !important;
      color: #0F172A !important;
    }
    html[data-kiki-theme="light"] .kiki-card-reading {
      color: #475569 !important;
    }
    html[data-kiki-theme="light"] .kiki-card-audio-btn {
      background: rgba(0, 0, 0, 0.05) !important;
      border: 1px solid rgba(0, 0, 0, 0.08) !important;
      color: #0F172A !important;
      box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.8) !important;
    }
    html[data-kiki-theme="light"] .kiki-card-audio-btn:hover,
    html[data-kiki-theme="light"] .kiki-card-audio-btn:active {
      background: rgba(0, 0, 0, 0.1) !important;
      transform: scale(1.06) !important;
    }
    html[data-kiki-theme="light"] .kiki-card-settings-btn,
    html[data-kiki-theme="light"] .kiki-card-close-btn {
      color: #64748B !important;
    }
    html[data-kiki-theme="light"] .kiki-card-settings-btn:hover,
    html[data-kiki-theme="light"] .kiki-card-close-btn:hover {
      color: #0F172A !important;
    }
    html[data-kiki-theme="light"] .kiki-card-ai-switch-btn {
      background: linear-gradient(135deg, #6366F1, #8B5CF6) !important;
      color: #FFFFFF !important;
      border: none !important;
      border-radius: 8px !important;
      padding: 3.5px 10px !important;
      font-weight: 700 !important;
      box-shadow: 0 2px 8px rgba(99, 102, 241, 0.35) !important;
    }
    html[data-kiki-theme="light"] .kiki-card-ai-switch-btn:hover {
      box-shadow: 0 4px 14px rgba(99, 102, 241, 0.55) !important;
      transform: scale(0.97) !important;
    }
    html[data-kiki-theme="light"] .kiki-badge {
      font-size: 11.5px !important;
      font-weight: 700 !important;
      padding: 2.5px 8px !important;
      border-radius: 6px !important;
    }
    html[data-kiki-theme="light"] .kiki-badge-dict {
      background: rgba(0, 0, 0, 0.05) !important;
      color: #475569 !important;
      border: 1px solid rgba(0, 0, 0, 0.08) !important;
      font-weight: 600 !important;
    }
    html[data-kiki-theme="light"] .kiki-badge-redirect {
      color: #047857 !important;
      background: rgba(16, 185, 129, 0.14) !important;
      border: 1px solid rgba(16, 185, 129, 0.35) !important;
    }
    html[data-kiki-theme="light"] .kiki-badge-pos {
      color: #B91C1C !important;
      background: rgba(239, 68, 68, 0.14) !important;
      border: 1px solid rgba(239, 68, 68, 0.35) !important;
    }
    html[data-kiki-theme="light"] .kiki-badge-level {
      color: #1D4ED8 !important;
      background: rgba(37, 99, 235, 0.14) !important;
      border: 1px solid rgba(37, 99, 235, 0.35) !important;
    }
    html[data-kiki-theme="light"] .kiki-badge-vocab {
      color: #6D28D9 !important;
      background: rgba(124, 58, 237, 0.14) !important;
      border: 1px solid rgba(124, 58, 237, 0.35) !important;
    }
    html[data-kiki-theme="light"] .kiki-card-body {
      color: #1E293B !important;
    }
    html[data-kiki-theme="light"] .kiki-card-body strong,
    html[data-kiki-theme="light"] .kiki-card-body b {
      color: #0F172A !important;
    }
    html[data-kiki-theme="light"] .kiki-card-entry + .kiki-card-entry {
      border-top-color: rgba(0, 0, 0, 0.08) !important;
    }
    html[data-kiki-theme="light"] .kiki-cap-ai-btn {
      background: rgba(99, 102, 241, 0.9) !important;
      border-color: rgba(255, 255, 255, 0.95) !important;
      box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35) !important;
    }
    html[data-kiki-theme="light"] .kiki-cap-ai-btn .kiki-ai-icon {
      color: #EEF2FF !important;
    }
    html[data-kiki-theme="light"] .kiki-cap-ai-btn .kiki-ai-text {
      color: #FFFFFF !important;
    }
    html[data-kiki-theme="light"] #kiki-toast {
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.88) 0%, rgba(255, 255, 255, 0.72) 100%) !important;
      backdrop-filter: blur(28px) saturate(200%) !important;
      -webkit-backdrop-filter: blur(28px) saturate(200%) !important;
      color: #0F172A !important;
      border: 1px solid rgba(255, 255, 255, 0.95) !important;
      box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.08), inset 0 1px 1px rgba(255, 255, 255, 1) !important;
    }
    html[data-kiki-theme="light"] #kiki-hud {
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.82) 0%, rgba(255, 255, 255, 0.65) 100%) !important;
      backdrop-filter: blur(24px) saturate(200%) !important;
      -webkit-backdrop-filter: blur(24px) saturate(200%) !important;
      color: #0F172A !important;
      border: 1.5px solid rgba(255, 255, 255, 0.95) !important;
      box-shadow: 0 10px 32px rgba(15, 23, 42, 0.16), 0 0 0 1px rgba(0, 0, 0, 0.06) !important;
    }
    html[data-kiki-theme="light"] #kiki-hud:hover {
      background: rgba(255, 255, 255, 0.96) !important;
    }
    html[data-kiki-theme="light"] #kiki-hud .kiki-hud-btn {
      background: rgba(0, 0, 0, 0.06) !important;
      border: 1px solid rgba(0, 0, 0, 0.08) !important;
      color: #0F172A !important;
    }
    html[data-kiki-theme="light"] #kiki-hud .kiki-hud-btn:hover {
      background: rgba(0, 0, 0, 0.12) !important;
    }
    html[data-kiki-theme="light"] #kiki-track-dropdown {
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.92) 0%, rgba(255, 255, 255, 0.82) 100%) !important;
      backdrop-filter: blur(28px) saturate(200%) !important;
      -webkit-backdrop-filter: blur(28px) saturate(200%) !important;
      border: 1.5px solid rgba(255, 255, 255, 0.95) !important;
      box-shadow: 0 20px 48px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.08) !important;
    }
    html[data-kiki-theme="light"] .kiki-dropdown-header {
      color: #64748B !important;
    }
    html[data-kiki-theme="light"] .kiki-dropdown-item {
      color: #1E293B !important;
    }
    html[data-kiki-theme="light"] .kiki-dropdown-item:hover,
    html[data-kiki-theme="light"] .kiki-dropdown-item:active {
      background: rgba(0, 0, 0, 0.05) !important;
      color: #0F172A !important;
    }
    html[data-kiki-theme="light"] .kiki-dropdown-item.active {
      background: rgba(37, 99, 235, 0.1) !important;
      color: #1D4ED8 !important;
      border: 1px solid rgba(37, 99, 235, 0.25) !important;
    }
    html[data-kiki-theme="light"] .kiki-dropdown-tag {
      background: rgba(0, 0, 0, 0.06) !important;
      color: #475569 !important;
    }
    html[data-kiki-theme="light"] .kiki-dropdown-sep {
      background: rgba(0, 0, 0, 0.08) !important;
    }
    html[data-kiki-theme="light"] #kiki-settings-modal {
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.88) 0%, rgba(255, 255, 255, 0.74) 100%) !important;
      backdrop-filter: blur(32px) saturate(220%) !important;
      -webkit-backdrop-filter: blur(32px) saturate(220%) !important;
      border: 1.5px solid rgba(255, 255, 255, 0.95) !important;
      box-shadow: 0 28px 70px rgba(15, 23, 42, 0.22), 0 0 0 1px rgba(0, 0, 0, 0.08), inset 0 1.5px 1.5px rgba(255, 255, 255, 1) !important;
      color: #0F172A !important;
    }
    html[data-kiki-theme="light"] #kiki-yomitan-card::-webkit-scrollbar-thumb,
    html[data-kiki-theme="light"] #kiki-settings-modal::-webkit-scrollbar-thumb,
    html[data-kiki-theme="light"] #kiki-track-dropdown::-webkit-scrollbar-thumb,
    html[data-kiki-theme="light"] .kiki-ai-scroll-container::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.16) !important;
    }
    html[data-kiki-theme="light"] .kiki-card-mode-select {
      background: rgba(0, 0, 0, 0.06) !important;
      color: #0F172A !important;
      border: 1px solid rgba(0, 0, 0, 0.12) !important;
    }
    html[data-kiki-theme="light"] .kiki-ai-quote-box {
      background: rgba(0, 0, 0, 0.04) !important;
      color: #334155 !important;
    }
    html[data-kiki-theme="light"] .kiki-ai-scroll-container {
      color: #0F172A !important;
    }
    html[data-kiki-theme="light"] .kiki-ai-input-wrap {
      border-top: 1px solid rgba(0, 0, 0, 0.08) !important;
    }
    html[data-kiki-theme="light"] .kiki-ai-followup-input {
      background: rgba(255, 255, 255, 0.95) !important;
      border: 1px solid rgba(0, 0, 0, 0.15) !important;
      color: #0F172A !important;
    }
    html[data-kiki-theme="light"] .kiki-ai-followup-input::placeholder {
      color: #94A3B8 !important;
    }
    html[data-kiki-theme="light"] .kiki-ai-thought-box {
      background: rgba(0, 0, 0, 0.03) !important;
      color: #475569 !important;
    }
    html[data-kiki-theme="light"] .kiki-ai-thought-text {
      color: #334155 !important;
    }
    html[data-kiki-theme="light"] .kiki-ai-user-bubble {
      background: rgba(99, 102, 241, 0.12) !important;
      border: 1px solid rgba(99, 102, 241, 0.25) !important;
      color: #3730A3 !important;
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
  window.injectStyles = injectStyles;



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

