// =============================================================
// Kiki Immersion - YouTube Adapter & Subtitle Pipeline
// Version: 1.2.0
// =============================================================

  // -------------------------------------------------------------
  // 2. High-Fidelity TimedText Wire Sniffer
  // -------------------------------------------------------------
  const MARK = "/api/timedtext";
  let capturedBody = "";
  let capturedLastUrl = "";
  let capturedVideoId = "";
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
    if (typeof url !== "string" || !url.includes(MARK) || selfFetching) return;
    let urlVid = "";
    try { urlVid = new URL(url, location.href).searchParams.get("v") || ""; } catch {}
    const cid = urlVid || currentVideoId();
    if (capturedVideoId && cid && capturedVideoId !== cid) {
      capturedLastUrl = "";
      capturedBody = "";
    }
    capturedVideoId = cid;
    capturedLastUrl = url;
  }

  function onCapturedWireBody(body, url) {
    if (!body || body.trim().length < 20) return;
    let urlVid = "";
    try { urlVid = new URL(url, location.href).searchParams.get("v") || ""; } catch {}
    capturedVideoId = urlVid || currentVideoId();
    capturedBody = body;
    capturedLastUrl = url;

    const curVid = currentVideoId();
    if (!capturedVideoId || capturedVideoId === curVid) {
      const cues = parseAny(body);
      if (cues && cues.length) {
        applyLoadedCues(cues, "wire-sniffer");
      }
    }
  }

  const origFetch = window.fetch;
  window.fetch = function (...args) {
    let reqUrl = "";
    try {
      const req = args[0];
      reqUrl = typeof req === "string" ? req : (req?.url || req?.href || "");
      noteTimedtextUrl(reqUrl);
    } catch {}

    const promise = origFetch.apply(this, args);
    try {
      if (typeof reqUrl === "string" && reqUrl.includes(MARK) && !selfFetching) {
        promise.then((res) => {
          try {
            res.clone().text().then((text) => {
              if (text && text.trim().length > 20) {
                onCapturedWireBody(text, reqUrl);
              }
            }).catch(() => {});
          } catch {}
        }).catch(() => {});
      }
    } catch {}
    return promise;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__kiki_url = typeof url === "string" ? url : (url?.href || String(url || ""));
    noteTimedtextUrl(this.__kiki_url);
    return origOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", function () {
      try {
        const reqUrl = this.__kiki_url;
        if (typeof reqUrl !== "string" || !reqUrl.includes(MARK) || selfFetching) return;
        let body = "";
        try {
          if (this.responseType === "" || this.responseType === "text") {
            body = this.responseText || "";
          } else if (this.responseType === "json") {
            body = typeof this.response === "string" ? this.response : JSON.stringify(this.response || "");
          } else if (this.responseType === "arraybuffer" && this.response) {
            body = new TextDecoder("utf-8").decode(this.response);
          } else if (this.responseType === "blob" && this.response) {
            this.response.text().then((t) => {
              if (t && t.trim().length > 20) {
                onCapturedWireBody(t, reqUrl);
              }
            }).catch(() => {});
            return;
          }
        } catch {}
        if (body && body.trim().length > 20) {
          onCapturedWireBody(body, reqUrl);
        }
      } catch {}
    });
    return origSend.apply(this, args);
  };

  try {
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (typeof e.name === "string" && e.name.includes(MARK)) {
          noteTimedtextUrl(e.name);
        }
      }
    });
    obs.observe({ type: "resource", buffered: true });
  } catch {}

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
    if (STATE.lookupEl) {
      closeLookup();
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
      hud.style.setProperty("visibility", "visible", "important");
      hud.style.setProperty("opacity", "1", "important");
      toast("Kiki Bar: Shown");
      clearTimeout(toggleHud._t);
      toggleHud._t = setTimeout(() => hideHud(), 7000);
    } else {
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
    if (STATE.cues && STATE.cues.length) {
      const curMs = v.currentTime * 1000;
      let i = STATE.idx;
      if (dir < 0) {
        i = Math.max(0, (i < 0 ? findIndex(curMs) : i) - 1);
      } else {
        i = Math.min(STATE.cues.length - 1, (i < 0 ? findIndex(curMs) : i) + 1);
      }
      const cue = STATE.cues[i];
      if (cue) {
        v.currentTime = cue.start / 1000 + 0.01;
        STATE.idx = i;
        renderCue(i);
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
    if (!text) return true;
    const lower = text.toLowerCase().replace(/\s+/g, " ");
    return lower.includes("click for settings") ||
           lower.includes("for settings") ||
           lower.includes("点击以查看设置") ||
           lower.includes("点击以") ||
           (lower.includes("auto-generated") && lower.includes("english")) ||
           (lower.includes("自动生成") && lower.includes("英语")) ||
           (lower.includes("settings") && (lower.includes("english") || lower.includes("auto")));
  }

  function extractCuesFromVideo() {
    const v = videoEl();
    if (!v || !v.textTracks || !v.textTracks.length) return [];
    for (let i = 0; i < v.textTracks.length; i++) {
      const track = v.textTracks[i];
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
        if (cues.length > 2) return cues;
      }
    }
    return [];
  }

  function getLiveCaptionText() {
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
          if (text) return text;
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
      if (text) return text;
    }

    // 3. Caption visual lines (.caption-visual-line)
    const lines = queryCaptionElements(".caption-visual-line");
    if (lines.length) {
      let text = "";
      lines.forEach((l) => {
        const t = (l.textContent || "").trim();
        if (t) text += (text ? " " : "") + t;
      });
      if (text) return text;
    }

    // 4. Caption windows (.ytp-caption-window, .caption-window)
    const windows = queryCaptionElements(".ytp-caption-window, .caption-window");
    if (windows.length) {
      let text = "";
      windows.forEach((w) => {
        const t = (w.textContent || "").trim();
        if (t) text += (text ? " " : "") + t;
      });
      if (text) return text;
    }

    // 5. Container textContent fallback
    const containers = queryCaptionElements(".ytp-caption-window-container");
    for (const c of containers) {
      const t = (c.textContent || "").trim();
      if (t) return t.replace(/^\s*>>\s*/, "").replace(/\s*>>\s*/g, " ").trim();
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

  function onNativeCaptionsMutated() {
    suppressNativeCaptions();

    // If structured cues not yet loaded, check if video.textTracks has loaded genuine cues
    if (!STATE.cues || !STATE.cues.length) {
      const trackCues = extractCuesFromVideo();
      if (trackCues && trackCues.length > 2) {
        applyLoadedCues(trackCues, "video-track");
        return;
      }

      // Fallback: render live caption text if available so user sees subtitles immediately
      const liveText = getLiveCaptionText();
      if (liveText && liveText !== lastObservedText) {
        lastObservedText = liveText;
        STATE.liveMode = true;
        const box = document.getElementById("kiki-captions");
        if (box && typeof window.renderTextToBox === "function") {
          window.renderTextToBox(box, liveText);
        }
      }
    }
  }

  function bindVideoTrackListeners() {
    const v = videoEl();
    if (!v || v._kiki_tracks_bound) return;
    v._kiki_tracks_bound = true;

    // When video starts playing, if captions haven't loaded yet, immediately fetch
    v.addEventListener("play", () => {
      if (!STATE.cues || !STATE.cues.length) {
        loadForVideo();
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
        if (p && v && (v.readyState >= 1 || v.duration > 0 || Date.now() - t0 > 1500)) {
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

  function pickBestTrack(tracks) {
    if (!tracks || !tracks.length) return null;
    const enOfficial = tracks.find(t => {
      const code = (t.languageCode || "").toLowerCase();
      return code.startsWith("en") && t.kind !== "asr";
    });
    if (enOfficial) return enOfficial;

    const enAny = tracks.find(t => (t.languageCode || "").toLowerCase().startsWith("en"));
    if (enAny) return enAny;

    const jaOfficial = tracks.find(t => {
      const code = (t.languageCode || "").toLowerCase();
      return code.startsWith("ja") && t.kind !== "asr";
    });
    if (jaOfficial) return jaOfficial;

    return tracks[0];
  }

  async function fetchExact(url, timeoutMs = 2500) {
    if (!url) return "";
    selfFetching++;
    try {
      const cleanUrl = url
        .replace(/&amp;/g, "&")
        .replace(/\\u0026/g, "&")
        .replace(/\\\//g, "/");
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await origFetch.call(window, cleanUrl, {
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
    } finally {
      selfFetching--;
    }
    return "";
  }

  function clickElement(el) {
    if (!el) return;
    try { el.click(); } catch {}
    try {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    } catch {}
  }

  function ensureCaptionsActive() {
    try {
      const p = playerEl();
      if (p) {
        if (typeof p.loadModule === "function") {
          try { p.loadModule("captions"); } catch {}
        }
        if (typeof p.setOption === "function") {
          try { p.setOption("captions", "track", { languageCode: "en" }); } catch {}
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
          clickElement(btn);
        }
      });
    } catch {}
  }

  function applyLoadedCues(cues, source) {
    if (!cues || !cues.length) return;
    if (cues.length <= 2 && cues.some((c) => isDummyCueText(c.text))) {
      return;
    }
    STATE.cues = cues;
    STATE.idx = -1;
    STATE.loadingTracks = false;
    loadingTracks = false;
    renderCue(-1);
    lastFailedVideoId = "";
    suppressNativeCaptions();
    updateHud(`✦ CC: ${cues.length}`);
    toast(`Captions: ${cues.length} lines (${source})`);
  }

  async function loadForVideo() {
    if (loadingTracks) return;
    const vid = currentVideoId();
    if (!vid) {
      updateHud("✦ Kiki (Home)");
      return;
    }

    loadingTracks = true;
    STATE.loadingTracks = true;
    lastLoadAttemptTime = Date.now();
    updateHud("✦ Loading CC...");

    try {
      // 1. Wire sniffer cache
      if (capturedBody && (capturedVideoId === vid || !capturedVideoId) && capturedBody.trim().length > 20) {
        const cues = parseAny(capturedBody);
        if (cues && cues.length) {
          applyLoadedCues(cues, "wire-cache");
          return;
        }
      }

      // 2. DOM / Player extraction (with quick polling retry)
      let tracks = getAllCaptionTracks(vid);
      if (!tracks || !tracks.length) {
        for (let i = 0; i < 4; i++) {
          await sleep(250);
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
          const tid = setTimeout(() => ctrl.abort(), 2500);
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

      if (tracks && tracks.length) {
        STATE.tracks = tracks;
        const sorted = [...tracks].sort((a, b) => {
          const aEn = (a.languageCode || "").toLowerCase().startsWith("en");
          const bEn = (b.languageCode || "").toLowerCase().startsWith("en");
          if (aEn && !bEn) return -1;
          if (!aEn && bEn) return 1;
          const aOfficial = a.kind !== "asr";
          const bOfficial = b.kind !== "asr";
          if (aOfficial && !bOfficial) return -1;
          if (!aOfficial && bOfficial) return 1;
          return 0;
        });

        // Limit to top 3 tracks to avoid long sequential delays
        for (const pick of sorted.slice(0, 3)) {
          if (!pick || !pick.baseUrl) continue;
          // Try baseUrl directly first
          let raw = await fetchExact(pick.baseUrl, 2000);
          let cues = parseAny(raw);
          if (!cues || !cues.length) {
            // Then try with fmt=json3
            const jsonUrl = pick.baseUrl.includes("fmt=")
              ? pick.baseUrl.replace(/fmt=[^&]+/, "fmt=json3")
              : pick.baseUrl + (pick.baseUrl.includes("?") ? "&" : "?") + "fmt=json3";
            raw = await fetchExact(jsonUrl, 2000);
            cues = parseAny(raw);
          }
          if (cues && cues.length) {
            applyLoadedCues(cues, pick.kind === "asr" ? "auto" : "official");
            return;
          }
        }
      }

      // 5. Direct timedtext API calls
      const directCandidates = [
        `https://www.youtube.com/api/timedtext?v=${vid}&lang=en&fmt=json3`,
        `https://www.youtube.com/api/timedtext?v=${vid}&lang=en&kind=asr&fmt=json3`,
        `https://www.youtube.com/api/timedtext?v=${vid}&lang=ja&fmt=json3`,
        `https://www.youtube.com/api/timedtext?v=${vid}&lang=ja&kind=asr&fmt=json3`
      ];
      for (const cand of directCandidates) {
        try {
          const raw = await fetchExact(cand, 2000);
          const cues = parseAny(raw);
          if (cues && cues.length) {
            applyLoadedCues(cues, "direct");
            return;
          }
        } catch {}
      }

      // 6. Native module activation attempt & textTracks extraction
      ensureCaptionsActive();
      const trackCues = extractCuesFromVideo();
      if (trackCues && trackCues.length > 2) {
        applyLoadedCues(trackCues, "video-track");
        return;
      }

      lastFailedVideoId = vid;
      updateHud("✦ CC: None (Tap to Search)");
    } finally {
      loadingTracks = false;
      STATE.loadingTracks = false;
    }
  }

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
    STATE.idx = -1;
    lastObservedText = "";
    liveToastShown = false;
    lastFailedVideoId = "";
    lastLoadAttemptTime = 0;
    STATE.liveMode = false;
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
      onNativeCaptionsMutated();
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

      if (!STATE.cues.length && STATE.videoId) {
        if (!loadingTracks && !STATE.loadingTracks && !(lastFailedVideoId === STATE.videoId && Date.now() - lastLoadAttemptTime < 30000)) {
          loadForVideo();
        }
      }

      if (!STATE.cues.length && STATE.videoId) {
        const btn = document.querySelector(".ytp-subtitles-button");
        const alreadyOn = btn && btn.getAttribute("aria-pressed") === "true";
        if (!alreadyOn && Date.now() - lastCaptionActivationTime > 2200) {
          lastCaptionActivationTime = Date.now();
          ensureCaptionsActive();
        }
      }

      if (STATE.cues.length) {
        suppressNativeCaptions();
        const curMs = v.currentTime * 1000;
        const i = findIndex(curMs);
        if (i !== STATE.idx) {
          STATE.idx = i;
          renderCue(i);
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
    if (e.key === "[" || e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      seekCue(-1);
      toast("← previous line");
    } else if (e.key === "]" || e.key === "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      seekCue(1);
      toast("next line →");
    } else if (e.altKey && (e.key === "f" || e.key === "F")) {
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
  document.addEventListener("play", (e) => {
    const v = videoEl();
    if (e.target === v) {
      ensureCaptionsActive();
      if (!STATE.cues.length && !loadingTracks) {
        setTimeout(loadForVideo, 300);
      }
    }
  }, true);

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
        const kikiVer = window.__kiki_engine_version || localStorage.getItem("kiki_cache_version") || "1.2.0";
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



  console.log('[Kiki Immersion] v1.2.0 Modular Engine Loaded on:', location.href);
