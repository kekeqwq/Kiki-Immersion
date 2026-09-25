// =============================================================
// Kiki Immersion - YouTube Adapter & Subtitle Pipeline
// Version: 1.3.3
// =============================================================

(() => {
  if (!/(?:^|\.)youtube\.com$/.test(location.hostname) || window.__kiki_is_bridge || window.self !== window.top) {
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
      (modal && modal.classList.contains("show") && modal.style.display !== "none")
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

      if (dx > 55 || dy > 55 || dt > 700) return;

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

  const DOUBLE_MS = 420;
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

    const isDouble = (now - lastTapTime < DOUBLE_MS) && (Math.abs(cx - lastTapX) < 110) && (Math.abs(cy - lastTapY) < 110);

    if (isDouble) {
      clearTimeout(singleTapTimer);
      singleTapTimer = null;
      lastTapTime = 0;

      // If single tap timer already fired togglePause(), restore playback on double-tap
      if (singleTapActionFired) {
        singleTapActionFired = false;
        playVideoSync();
      }

      // Left 28% seeks -1 (previous line), Right 28% seeks +1 (next line), Center 44% toggles fullscreen
      if (relX < 0.28) {
        seekCue(-1);
        toast("← previous line");
      } else if (relX > 0.72) {
        seekCue(1);
        toast("next line →");
      } else {
        toggleWebpageFs();
      }
      return;
    }

    lastTapTime = now;
    lastTapX = cx;
    lastTapY = cy;
    singleTapActionFired = false;
    clearTimeout(singleTapTimer);

    singleTapTimer = setTimeout(() => {
      singleTapActionFired = true;
      // Single click/tap top-left (<= 18% width & <= 20% height): Toggle Kiki Top Bar
      if (relY < 0.20 && relX < 0.18) {
        toggleHud();
        return;
      }

      // Single click/tap top-right (>= 82% width & <= 20% height): Toggle Native YouTube Controls
      if (relY < 0.20 && relX > 0.82) {
        toggleNativeChrome();
        return;
      }

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
    const v = videoEl();
    if (v) {
      try {
        v.dispatchEvent(new Event("seeking"));
        v.dispatchEvent(new Event("seeked"));
      } catch {}
    }
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
        // Seek to previous subtitle
        let currIdx = -1;
        for (let k = cuesToUse.length - 1; k >= 0; k--) {
          if (curMs >= cuesToUse[k].start - 150) {
            currIdx = k;
            break;
          }
        }
        if (currIdx === -1) {
          target = 0;
        } else {
          const currCue = cuesToUse[currIdx];
          // If we are in the silent gap after currCue has finished (> 300ms past its end)
          // and before the next cue starts, replay currCue itself.
          // Otherwise, reliably jump to the preceding subtitle (currIdx - 1).
          if (curMs > currCue.end + 300 && currIdx < cuesToUse.length - 1 && curMs < cuesToUse[currIdx + 1].start) {
            target = currIdx;
          } else {
            target = Math.max(0, currIdx - 1);
          }
        }
      } else {
        // Seek to next subtitle
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

  function cleanupLeakedTranscriptPopups() {
    try {
      const items = Array.from(document.querySelectorAll("ytd-menu-service-item-renderer, tp-yt-paper-item, ytd-menu-popup-renderer"));
      for (const el of items) {
        if (el.textContent && el.textContent.includes("Toggle timestamps")) {
          const dropdown = el.closest("tp-yt-iron-dropdown") || (el.tagName === "TP-YT-IRON-DROPDOWN" ? el : null);
          if (dropdown) {
            try { if (typeof dropdown.close === "function") dropdown.close(); } catch {}
            dropdown.opened = false;
            dropdown.style.setProperty("display", "none", "important");
            dropdown.style.setProperty("visibility", "hidden", "important");
            dropdown.setAttribute("hidden", "");
            dropdown.setAttribute("aria-hidden", "true");
            dropdown.setAttribute("data-kiki-suppressed", "true");
          }
          const popup = el.closest("ytd-menu-popup-renderer") || (el.tagName === "YTD-MENU-POPUP-RENDERER" ? el : null);
          if (popup) {
            try { if (typeof popup.close === "function") popup.close(); } catch {}
            popup.style.setProperty("display", "none", "important");
            popup.style.setProperty("visibility", "hidden", "important");
            popup.setAttribute("hidden", "");
            popup.setAttribute("data-kiki-suppressed", "true");
          }
        }
      }
    } catch {}
  }

  function closeTranscriptPanelSilently() {
    try {
      const panel = document.querySelector('[target-id="engagement-panel-searchable-transcript"]');
      if (panel) {
        // Specifically find the visibility / close button of the engagement panel.
        // NEVER select generic yt-icon-button button as that clicks the 3-dots "More actions" menu button and spawns "Toggle timestamps"!
        const closeBtn = panel.querySelector('#visibility-button button, yt-button-shape button[aria-label*="Close" i], button[aria-label*="Close" i], button[aria-label*="关闭"], button[aria-label*="閉じる"]');
        if (closeBtn) {
          closeBtn.click();
        } else {
          panel.setAttribute("visibility", "ENGAGEMENT_PANEL_VISIBILITY_HIDDEN");
        }
      }
      if (panel && panel.getAttribute("visibility") === "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED") {
        panel.setAttribute("visibility", "ENGAGEMENT_PANEL_VISIBILITY_HIDDEN");
      }
    } catch {}
    cleanupLeakedTranscriptPopups();
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

      // Also trigger transcript button if present (strictly avoid internal buttons of the engagement panel)
      const allBtns = Array.from(document.querySelectorAll("ytd-video-description-transcript-section-renderer button, #description button, ytd-structured-description-content-renderer button, ytd-button-renderer button, button"));
      const transcriptBtn = allBtns.find(b => {
        if (b.closest('[target-id="engagement-panel-searchable-transcript"]')) return false;
        const txt = (b.innerText || b.getAttribute("aria-label") || "").toLowerCase();
        if (txt.includes("close") || txt.includes("关闭") || txt.includes("閉じる") || txt.includes("action") || txt.includes("toggle")) return false;
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
      cleanupLeakedTranscriptPopups();
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

  let lastTimelineSyncTime = 0;
  let lastThemeSyncTime = 0;
  let lastLeakedPopupCleanupTime = 0;
  function syncNativeTimeline(v) {
    if (!v || v.paused) return;
    const now = Date.now();
    if (now - lastTimelineSyncTime < 450) return;
    lastTimelineSyncTime = now;
    try {
      v.dispatchEvent(new Event("seeking"));
      v.dispatchEvent(new Event("seeked"));
    } catch {}
  }

  function tick() {
    try {
      try { dismissMiniplayer(); } catch {}
      try { ensureHud(); } catch {}
      try { ensureRoot(); } catch {}
      try { ensureCaptionObserver(); } catch {}
      try { bindVideoTrackListeners(); } catch {}
      try { updateHud(); } catch {}
      try { updateCaptionPosition(); } catch {}
      if (!STATE.enabled) return;

      if (Date.now() - lastLeakedPopupCleanupTime > 2000) {
        lastLeakedPopupCleanupTime = Date.now();
        cleanupLeakedTranscriptPopups();
      }

      // Sync theme periodically if auto mode is on
      if (typeof applyTheme === "function" && (!STATE.theme || STATE.theme === "auto")) {
        if (Date.now() - lastThemeSyncTime > 1800) {
          lastThemeSyncTime = Date.now();
          applyTheme("auto");
        }
      }

      const curVid = currentVideoId();
      if (curVid && curVid !== STATE.videoId) {
        onNavigate();
        return;
      }

      const v = videoEl();
      if (!v) return;

      // Keep native player timeline, progress bar and current time flowing continuously on iPad/Safari
      syncNativeTimeline(v);

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
        console.log(`[Kiki Status] v${kikiVer} [HUD:${hudState}|${vState}|TT:${trkCount}]`);
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



  console.log('[Kiki Immersion] v1.3.3 Modular Engine Loaded on:', location.href);
})();
