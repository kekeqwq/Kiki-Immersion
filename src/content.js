(() => {
  const STATE = {
    enabled: true,
    fontSize: 28,
    fontFamily: "Iowan Old Style, Palatino Linotype, Palatino, Songti SC, serif",
    hideNativeCaptions: true,
    captionColor: "#141413",
    captionBg: "#EFEBE3",
    captionBgAlpha: 86,
    preferredLangs: ["en-US", "en-GB", "en"],
    cues: [],
    tracks: [],
    trackKey: null,
    idx: -1,
    pausedForLookup: false,
    lookupEl: null,
    aiEnabled: false,
    aiToken: 0,
    audioLang: "",
    currentLang: "",
    fs: false,
    videoId: null,
    forceReload: false,
    tapTimer: null,
    lastTap: null,
    req: 0
  };

  const DOUBLE_MS = 320;

  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function playerEl() {
    return $("#movie_player") || $(".html5-video-player");
  }

  function videoEl() {
    return $("video.html5-main-video") || $("ytd-player video") || $("video");
  }

  function injectPage() {}

  function pageCall(type, extra = {}, timeout = 8000) {
    const id = "k" + ++STATE.req;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        reject(new Error("page bridge timeout"));
      }, timeout);
      function onMsg(ev) {
        const d = ev.data;
        if (!d || d.source !== "kiki-page" || d.id !== id) return;
        clearTimeout(t);
        window.removeEventListener("message", onMsg);
        if (!d.ok) reject(new Error(d.error || "page error"));
        else resolve(d);
      }
      window.addEventListener("message", onMsg);
      window.postMessage({ source: "kiki-content", id, type, ...extra }, "*");
    });
  }

  function toast(msg) {
    const el = $("#kiki-toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 1100);
  }

  function ensureRoot() {
    const host = playerEl();
    if (!host) return null;
    let root = $("#kiki-root");
    if (root && root.parentElement !== host) root.remove();
    if (!$("#kiki-root")) {
      root = document.createElement("div");
      root.id = "kiki-root";
      root.innerHTML = `
        <div id="kiki-zones">
          <div class="kiki-zone kiki-hd" data-zone="hd" data-act="dbl"></div>
          <div class="kiki-zone kiki-pause" data-zone="pause" data-act="single"></div>
          <div class="kiki-zone kiki-ctrl" data-zone="ctrl" data-act="single"></div>
          <div class="kiki-zone kiki-left" data-zone="left" data-act="dbl"></div>
          <div class="kiki-zone kiki-fs" data-zone="fs" data-act="dbl"></div>
          <div class="kiki-zone kiki-right" data-zone="right" data-act="dbl"></div>
        </div>
        <div id="kiki-captions"></div>
        <div id="kiki-ai" hidden>
          <div class="kiki-ai-hd">Kiki</div>
          <div class="kiki-ai-bd">…</div>
        </div>
        <div id="kiki-toast"></div>
      `;
      host.appendChild(root);
      bindZones(root);
    }
    paintRoot(root);
    root.style.display = STATE.enabled ? "" : "none";
    document.documentElement.classList.toggle("kiki-hide-native", STATE.enabled && STATE.hideNativeCaptions);
    document.documentElement.classList.toggle("kiki-lock-chrome", !!STATE.enabled);
    return root;
  }

  function ensureChromeButtons() {
    const bar = $(".ytp-right-controls");
    if (!bar || !STATE.enabled && !$("#kiki-btn-toggle") && false) {
      /* still insert so user can turn back on */
    }
    if (!bar) return;
    if ($("#kiki-btn-toggle") && $("#kiki-btn-toggle").parentElement === bar) {
      syncChromeButtons();
      return;
    }
    $("#kiki-btn-toggle")?.remove();
    $("#kiki-btn-track")?.remove();
    $("#kiki-track-menu")?.remove();

    const toggle = document.createElement("button");
    toggle.id = "kiki-btn-toggle";
    toggle.className = "ytp-button kiki-ytp-btn";
    toggle.title = "Kiki Immersion on/off";
    toggle.type = "button";
    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      STATE.enabled = !STATE.enabled;
      chrome.storage.sync.set({ enabled: STATE.enabled });
      applyEnabled();
    });

    const track = document.createElement("button");
    track.id = "kiki-btn-track";
    track.className = "ytp-button kiki-ytp-btn";
    track.title = "Kiki caption track";
    track.type = "button";
    track.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleTrackMenu();
    });

    const menu = document.createElement("div");
    menu.id = "kiki-track-menu";
    bar.parentElement.appendChild(menu);
    bar.insertBefore(track, bar.firstChild);
    bar.insertBefore(toggle, track);
    syncChromeButtons();
  }

  function syncChromeButtons() {
    const t = $("#kiki-btn-toggle");
    const k = $("#kiki-btn-track");
    if (t) {
      t.classList.toggle("kiki-off", !STATE.enabled);
      t.innerHTML = `<span class="kiki-ytp-label">K</span>`;
    }
    if (k) k.innerHTML = `<span class="kiki-ytp-label">CC</span>`;
    renderTrackMenu();
  }

  function toggleTrackMenu() {
    const menu = $("#kiki-track-menu");
    if (!menu) return;
    menu.classList.toggle("open");
    renderTrackMenu();
  }

  function renderTrackMenu() {
    const menu = $("#kiki-track-menu");
    if (!menu) return;
    if (!STATE.tracks.length) {
      menu.innerHTML = `<div class="kiki-item muted">No tracks yet</div>`;
      return;
    }
    menu.innerHTML = STATE.tracks
      .map((t) => {
        const key = trackKey(t);
        const on = key === STATE.trackKey ? "on" : "";
        const tag = t.isAsr ? "auto" : "official";
        return `<button type="button" class="kiki-item ${on}" data-key="${escapeAttr(key)}"><span>${escapeHtml(t.name)}</span><em>${tag} · ${escapeHtml(t.languageCode)}</em></button>`;
      })
      .join("");
    menu.querySelectorAll(".kiki-item[data-key]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const key = btn.getAttribute("data-key");
        const t = STATE.tracks.find((x) => trackKey(x) === key);
        menu.classList.remove("open");
        if (t) await applyTrack(t, true);
      });
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }

  function trackKey(t) {
    return `${t.vssId || ""}|${t.languageCode}|${t.kind || ""}|${t.name}`;
  }

  function tokenize(text) {
    if (!text) return [];
    try {
      const seg = new Intl.Segmenter(undefined, { granularity: "word" });
      return [...seg.segment(text)].map((s) => ({
        t: s.segment,
        word: s.isWordLike !== false && /\S/.test(s.segment)
      }));
    } catch {
      return text.split(/(\s+)/).map((t) => ({ t, word: /\S/.test(t) }));
    }
  }

  function renderCue(i) {
    const box = $("#kiki-captions");
    if (!box) return;
    box.innerHTML = "";
    if (!STATE.enabled || i < 0 || !STATE.cues[i]) return;
    const src = STATE.cues[i].text;
    const line = document.createElement("div");
    line.className = "kiki-line";
    tokenize(src).forEach((tok) => {
      if (!tok.word) {
        line.appendChild(document.createTextNode(tok.t));
        return;
      }
      const w = document.createElement("span");
      w.className = "kiki-word";
      w.textContent = tok.t;
      w.addEventListener("pointerdown", onWordPointer, { passive: false });
      line.appendChild(w);
    });
    box.appendChild(line);
    requestAnimationFrame(placeAi);
  }

  function onWordPointer(e) {
    e.stopPropagation();
    if (e.pointerType === "touch" || e.pointerType === "pen") e.preventDefault();
    const word = e.currentTarget;
    if (STATE.lookupEl === word) {
      closeLookup();
      return;
    }
    openLookup(word, e);
  }

  function sentenceText() {
    return ($("#kiki-captions")?.innerText || "").replace(/\s+/g, " ").trim();
  }

  function openLookup(word, e) {
    STATE.aiToken++;
    clearTimeout(scheduleAiFallback._t);
    const prev = STATE.lookupEl;
    if (prev && prev !== word) dismissYomitan(prev);
    document.querySelectorAll(".kiki-word.kiki-active").forEach((n) => n.classList.remove("kiki-active"));
    word.classList.add("kiki-active");
    STATE.lookupEl = word;
    const v = videoEl();
    if (v && !v.paused) v.pause();
    STATE.pausedForLookup = true;
    hideAi();
    setAiTitle("KIKI");
    const token = STATE.aiToken;
    const x = e?.clientX || word.getBoundingClientRect().left;
    const y = e?.clientY || word.getBoundingClientRect().top;
    setTimeout(() => {
      if (token !== STATE.aiToken || STATE.lookupEl !== word) return;
      const range = document.createRange();
      range.selectNodeContents(word);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      word.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }));
      word.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }));
      scheduleAiFallback(word.textContent, sentenceText(), token);
    }, prev && prev !== word ? 140 : 0);
  }

  function closeLookup() {
    STATE.aiToken++;
    clearTimeout(scheduleAiFallback._t);
    const active = STATE.lookupEl;
    STATE.lookupEl = null;
    STATE.pausedForLookup = false;
    document.querySelectorAll(".kiki-word.kiki-active").forEach((n) => n.classList.remove("kiki-active"));
    const sel = window.getSelection();
    sel.removeAllRanges();
    hideAi();
    dismissYomitan(active);
    const v = videoEl();
    if (v) v.play().catch(() => {});
  }

  function fireEsc(target) {
    const opts = { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true, cancelable: true };
    target.dispatchEvent(new KeyboardEvent("keydown", opts));
    target.dispatchEvent(new KeyboardEvent("keyup", opts));
  }

  function revealYomitanFrames() {
    document.querySelectorAll("iframe, [id*='yomitan'], [class*='yomitan'], [id*='yomichan'], [class*='yomichan']").forEach((n) => {
      const blob = ((n.id || "") + (n.className || "") + (n.src || "") + (n.title || "")).toLowerCase();
      if (!blob.includes("yomitan") && !blob.includes("yomichan")) return;
      n.style.removeProperty("display");
      n.style.removeProperty("visibility");
      n.removeAttribute("hidden");
    });
  }

  function dismissYomitan(word) {
    if (word) {
      word.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, view: window }));
      word.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true, view: window }));
    }
    fireEsc(document);
    fireEsc(window);
    document.querySelectorAll("iframe").forEach((f) => {
      try { fireEsc(f.contentWindow || f); } catch {}
      const blob = ((f.id || "") + (f.className || "") + (f.src || "") + (f.title || "")).toLowerCase();
      if (blob.includes("yomitan") || blob.includes("yomichan")) {
        f.style.setProperty("display", "none", "important");
        f.style.setProperty("visibility", "hidden", "important");
        f.setAttribute("hidden", "");
      }
    });
    document.querySelectorAll("[id*='yomitan'], [class*='yomitan'], [id*='yomichan'], [class*='yomichan']").forEach((n) => {
      n.style.setProperty("display", "none", "important");
      n.style.setProperty("visibility", "hidden", "important");
    });
    setTimeout(() => {
      fireEsc(document);
      document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 8, clientY: 8, view: window }));
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 8, clientY: 8, view: window }));
    }, 40);
  }

  function yomitanOpen() {
    const nodes = document.querySelectorAll("iframe, [id*='yomitan' i], [class*='yomitan' i], [id*='yomichan' i], [class*='yomichan' i]");
    for (const n of nodes) {
      const blob = `${n.id || ""} ${n.className || ""} ${n.src || ""} ${n.title || ""}`.toLowerCase();
      if (!/yomitan|yomichan/.test(blob)) continue;
      if (n.hidden) continue;
      const st = window.getComputedStyle(n);
      if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) continue;
      const r = n.getBoundingClientRect();
      if (r.width >= 60 && r.height >= 60) return true;
    }
    return false;
  }

  function scheduleAiFallback(word, sentence, token) {
    clearTimeout(scheduleAiFallback._t);
    if (!STATE.aiEnabled) return;
    if (token == null) token = STATE.aiToken;
    let tries = 0;
    const tick = () => {
      if (token !== STATE.aiToken || !STATE.lookupEl || STATE.lookupEl.textContent !== word) return;
      if (yomitanOpen()) {
        hideAi();
        return;
      }
      tries += 1;
      if (tries < 8) {
        scheduleAiFallback._t = setTimeout(tick, 220);
        return;
      }
      askAi(word, sentence, token);
    };
    scheduleAiFallback._t = setTimeout(tick, 220);
  }

  function setAiTitle(title) {
    const hd = $("#kiki-ai .kiki-ai-hd");
    if (hd) hd.textContent = title || "KIKI";
  }

  function hideAi() {
    const el = $("#kiki-ai");
    if (el) {
      el.hidden = true;
      el.querySelector(".kiki-ai-bd").textContent = "";
      setAiTitle("KIKI");
    }
  }

  function showAi(text, model) {
    const el = $("#kiki-ai");
    if (!el) return;
    el.hidden = false;
    el.querySelector(".kiki-ai-bd").textContent = String(text || "").replace(/\*\*/g, "");
    setAiTitle(model ? `KIKI — ${model}` : "KIKI");
    placeAi();
  }

  function placeAi() {
    const root = $("#kiki-root");
    const cap = $("#kiki-captions");
    const ai = $("#kiki-ai");
    if (!root || !cap || !ai || ai.hidden) return;
    const rr = root.getBoundingClientRect();
    const cr = cap.getBoundingClientRect();
    const gap = 18;
    const bottom = Math.max(72, rr.bottom - cr.top + gap);
    ai.style.bottom = bottom + "px";
  }

  function askAi(word, sentence, token) {
    if (token == null) token = STATE.aiToken;
    chrome.storage.local.get(null, async (cfg) => {
      if (token !== STATE.aiToken || !STATE.lookupEl) return;
      if (yomitanOpen()) { hideAi(); return; }
      const chain = providerChain(cfg);
      if (!chain.length) {
        showAi("No API / model configured");
        return;
      }
      for (let i = 0; i < chain.length; i++) {
        const step = chain[i];
        if (token !== STATE.aiToken || !STATE.lookupEl) return;
        if (yomitanOpen()) { hideAi(); return; }
        showAi(step.startMsg);
        const res = await sendTry({ ...step, word, sentence });
        if (token !== STATE.aiToken || !STATE.lookupEl) return;
        if (res && res.ok) {
          showAi(res.text, step.model);
          return;
        }
        const why = shortErr(res && res.error);
        const next = chain[i + 1];
        showAi(next ? `${why}\n${next.retryMsg}` : `${why}\nAll configured endpoints failed`);
      }
    });
  }

  function providerChain(cfg) {
    const slots = normalizeProviders(cfg);
    const out = [];
    slots.forEach((p, pi) => {
      p.models.forEach((model, mi) => {
        out.push({
          base: p.base,
          key: p.key,
          model,
          startMsg: pi === 0 && mi === 0 ? "…" : `Trying ${model}`,
          retryMsg: mi + 1 < p.models.length
            ? `${model} failed, retrying ${p.models[mi + 1]}`
            : `${model} failed, trying the next API`
        });
      });
    });
    return out;
  }

  function normalizeProviders(cfg) {
    if (Array.isArray(cfg.providers) && cfg.providers.length) {
      return cfg.providers
        .map((p) => ({
          base: (p.base || "").trim(),
          key: (p.key || "").trim(),
          models: (p.models || []).map((m) => String(m || "").trim()).filter(Boolean).slice(0, 5)
        }))
        .filter((p) => p.base && p.key && p.models.length);
    }
    const models = [cfg.apiModel].filter(Boolean);
    if (cfg.apiBase && cfg.apiKey && models.length) {
      return [{ base: cfg.apiBase, key: cfg.apiKey, models }];
    }
    return [];
  }

  function shortErr(e) {
    const s = String(e || "请求失败");
    if (/location is not supported/i.test(s)) return "This provider does not support the current region";
    if (/quota|billing|insufficient/i.test(s)) return "Quota or billing error";
    if (/401|unauthorized|invalid api key/i.test(s)) return "Invalid API key";
    if (/429|rate limit/i.test(s)) return "Rate limited";
    return s.slice(0, 180);
  }

  function sendTry(payload) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "kiki-ai-try", ...payload }, (res) => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(res || { ok: false, error: "no response" });
      });
    });
  }

  function resumeIfNeeded() {
    closeLookup();
  }

  function bindZones(root) {
    root.querySelectorAll(".kiki-zone").forEach((z) => {
      z.addEventListener("pointerdown", onZonePointer, { passive: false, capture: true });
      z.addEventListener("dblclick", (e) => { e.preventDefault(); e.stopPropagation(); }, true);
    });
    bindNativeGuard();
  }

  function bindNativeGuard() {
    if (bindNativeGuard._on) return;
    bindNativeGuard._on = true;
    const stealTypes = ["pointerdown", "pointerup", "pointercancel", "touchstart", "touchend", "touchcancel", "click", "dblclick"];
    stealTypes.forEach((type) => {
      document.addEventListener(type, onNativeGuard, { capture: true, passive: false });
    });
  }

  function onNativeGuard(e) {
    if (!STATE.enabled) return;
    const p = playerEl();
    if (!p || !p.contains(e.target)) return;
    if (e.target.closest("#kiki-captions") || e.target.closest("#kiki-ai") || e.target.closest("#kiki-track-menu")) return;
    if (e.target.closest("#kiki-btn-toggle") || e.target.closest("#kiki-btn-track")) return;
    if (document.documentElement.classList.contains("kiki-show-chrome") && e.target.closest(".ytp-chrome-bottom, .ytp-chrome-top, .ytp-popup")) return;
    const r = p.getBoundingClientRect();
    if (r.width < 8) return;
    const y = (e.clientY - r.top) / r.height;
    if (e.clientY == null && e.touches && e.touches[0]) {
      /* touchstart */
    }
    const cx = e.clientX != null ? e.clientX : e.changedTouches?.[0]?.clientX;
    const cy = e.clientY != null ? e.clientY : e.changedTouches?.[0]?.clientY;
    if (cx == null) return;
    const yn = (cy - r.top) / r.height;
    if (yn > 0.82) return;
    if (e.cancelable) e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === "pointerdown") {
      const fake = { currentTarget: zoneFromPoint(p, cx, cy), target: e.target, preventDefault() {}, stopPropagation() {} };
      if (fake.currentTarget) onZonePointer(fake);
    }
    document.querySelectorAll(".ytp-doubletap-ui, .ytp-doubletap-ui-legacy, .ytp-doubletap-overlay").forEach((n) => n.remove());
  }

  function zoneFromPoint(p, cx, cy) {
    const r = p.getBoundingClientRect();
    const x = (cx - r.left) / r.width;
    const y = (cy - r.top) / r.height;
    const top = y < 0.22;
    let name = "fs";
    if (top && x < 0.18) name = "hd";
    else if (top && x > 0.82) name = "ctrl";
    else if (top) name = "pause";
    else if (x < 0.18) name = "left";
    else if (x > 0.82) name = "right";
    else name = "fs";
    return p.querySelector(`.kiki-zone[data-zone="${name}"]`);
  }

  function onZonePointer(e) {
    if (e.target.closest && e.target.closest(".kiki-word")) return;
    e.preventDefault();
    e.stopPropagation();
    const zone = e.currentTarget.dataset.zone;
    const act = e.currentTarget.dataset.act;
    const now = Date.now();
    if (STATE.lastTap && STATE.lastTap.zone === zone && now - STATE.lastTap.t < DOUBLE_MS) {
      clearTimeout(STATE.tapTimer);
      STATE.lastTap = null;
      onZoneAction(zone, "dbl");
      return;
    }
    STATE.lastTap = { zone, t: now };
    clearTimeout(STATE.tapTimer);
    STATE.tapTimer = setTimeout(() => {
      STATE.lastTap = null;
      if (act === "single") onZoneAction(zone, "single");
    }, DOUBLE_MS);
  }

  function onZoneAction(zone, kind) {
    if (zone === "left" && kind === "dbl") {
      seekCue(-1);
      toast("← previous");
    } else if (zone === "right" && kind === "dbl") {
      seekCue(1);
      toast("next →");
    } else if (zone === "fs" && kind === "dbl") {
      toggleWebpageFs();
    } else if (zone === "pause" && kind === "single") {
      togglePause();
    } else if (zone === "hd" && kind === "dbl") {
      setMaxQuality();
    } else if (zone === "ctrl" && kind === "single") {
      showNativeChrome();
    }
  }

  function togglePause() {
    const v = videoEl();
    if (!v) return;
    if (v.paused) {
      STATE.pausedForLookup = false;
      v.play().catch(() => {});
      toast("play");
    } else {
      v.pause();
      toast("pause");
    }
  }

  function setMaxQuality() {
    const p = playerEl();
    if (!p) return;
    let levels = [];
    try { levels = p.getAvailableQualityLevels() || []; } catch {}
    const order = ["highres", "hd2160", "hd1440", "hd1080", "hd720", "large", "medium", "small"];
    const best = order.find((q) => levels.includes(q)) || (levels[0] && levels[0] !== "auto" ? levels[0] : "hd1080");
    try { p.setPlaybackQuality(best); } catch {}
    try { p.setPlaybackQualityRange(best, best); } catch {}
    toast("quality " + best);
  }

  function showNativeChrome() {
    document.documentElement.classList.add("kiki-show-chrome");
    toast("controls");
    clearTimeout(showNativeChrome._t);
    showNativeChrome._t = setTimeout(() => {
      document.documentElement.classList.remove("kiki-show-chrome");
    }, 4000);
  }

  function seekCue(dir) {
    const v = videoEl();
    if (!v || !STATE.cues.length) return;
    const t = v.currentTime * 1000;
    let i = STATE.idx;
    if (dir < 0) i = Math.max(0, (i < 0 ? findIndex(t) : i) - 1);
    else i = Math.min(STATE.cues.length - 1, (i < 0 ? findIndex(t) : i) + 1);
    const cue = STATE.cues[i];
    if (!cue) return;
    v.currentTime = cue.start / 1000 + 0.01;
    STATE.idx = i;
    renderCue(i);
  }

  function toggleWebpageFs() {
    STATE.fs = !STATE.fs;
    document.documentElement.classList.toggle("kiki-webpage-fs", STATE.fs);
    toast(STATE.fs ? "webpage fullscreen" : "exit webpage fullscreen");
    window.dispatchEvent(new Event("resize"));
    setTimeout(() => window.dispatchEvent(new Event("resize")), 80);
  }

  function findIndex(ms) {
    const cues = STATE.cues;
    for (let i = 0; i < cues.length; i++) {
      if (ms >= cues[i].start && ms < cues[i].end) return i;
    }
    for (let i = cues.length - 1; i >= 0; i--) {
      if (ms >= cues[i].start) return i;
    }
    return -1;
  }

  function tick() {
    ensureRoot();
    ensureChromeButtons();
    if (!STATE.enabled) return;
    const v = videoEl();
    if (!v || !STATE.cues.length) return;
    const i = findIndex(v.currentTime * 1000);
    if (i !== STATE.idx) {
      STATE.idx = i;
      renderCue(i);
    }
  }

  function videoIdFromUrl() {
    try {
      return new URL(location.href).searchParams.get("v");
    } catch {
      return null;
    }
  }

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
      const text = buf
        .map((w) => w.text)
        .join("")
        .replace(/\s+/g, " ")
        .trim();
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
      if (!buf.length) {
        buf.push(w);
        continue;
      }
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
    const re = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
    let m;
    while ((m = re.exec(xml))) {
      const attrs = m[1];
      const start = parseFloat((attrs.match(/\bstart="([^"]+)"/) || [])[1] || "0") * 1000;
      const dur = parseFloat((attrs.match(/\bdur="([^"]+)"/) || [])[1] || "2") * 1000;
      const text = decodeEntities(m[2].replace(/<[^>]+>/g, "")).replace(/\n/g, " ").trim();
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
      try {
        return parseCaptions(JSON.parse(t));
      } catch {
        return [];
      }
    }
    if (t.includes("<text") || t.includes("<transcript")) return parseSrv(t);
    if (/WEBVTT/i.test(t) || t.includes("-->")) return parseVtt(t);
    try {
      return parseCaptions(JSON.parse(t));
    } catch {
      return [];
    }
  }

  function langPrefix(code) {
    return String(code || "").toLowerCase().split(/[-_]/)[0];
  }

  function scoreTrack(t) {
    let s = 0;
    const lang = (t.languageCode || "").toLowerCase();
    const vss = (t.vssId || "").toLowerCase();
    const prefix = langPrefix(lang);
    const audio = langPrefix(STATE.audioLang);
    const current = langPrefix(STATE.currentLang);
    if (!t.isAsr) s += 80;
    if (current && (prefix === current || lang === STATE.currentLang.toLowerCase())) s += 120;
    if (audio && prefix === audio) s += 90;
    if (!audio && !current) {
      if (lang === "en-us" || vss.includes(".en-us")) s += 50;
      else if (lang === "en-gb" || vss.includes(".en-gb")) s += 48;
      else if (prefix === "en") s += 40;
    } else if (prefix === "en" && audio && audio !== "en") s -= 20;
    if (/comment|description|song|karaoke|forced/i.test(t.name)) s -= 40;
    return s;
  }

  function pickDefault(tracks) {
    if (!tracks.length) return null;
    return [...tracks].sort((a, b) => scoreTrack(b) - scoreTrack(a))[0];
  }

  async function applyTrack(track, userPicked) {
    try { await pageCall("clear", {}, 1500); } catch {}
    STATE.trackKey = trackKey(track);
    if (userPicked) chrome.storage.sync.set({ lastTrackLang: track.languageCode, lastTrackAsr: !!track.isAsr });
    try {
      const res = await pageCall("fetch", { baseUrl: track.baseUrl, lang: track.languageCode || "en" }, 18000);
      STATE.cues = parseAny(res.raw || "");
      STATE.idx = -1;
      renderCue(-1);
      const kind = track.isAsr ? "auto" : "official";
      if (!STATE.cues.length) toast("caption empty");
      else toast(`${kind}: ${STATE.cues.length} lines`);
    } catch (e) {
      console.warn("[kiki] fetch", e);
      toast("caption fetch failed");
    }
    renderTrackMenu();
  }

  async function loadForVideo() {
    injectPage();
    await sleep(150);
    let data;
    for (let i = 0; i < 8; i++) {
      try {
        data = await pageCall("list");
        if (data.tracks && data.tracks.length) break;
      } catch {}
      await sleep(350);
    }
    if (!data || !data.tracks || !data.tracks.length) {
      STATE.tracks = [];
      STATE.cues = [];
      renderCue(-1);
      renderTrackMenu();
      toast("no captions");
      return;
    }
    STATE.tracks = data.tracks;
    STATE.audioLang = data.audioLang || "";
    STATE.currentLang = data.currentLang || "";
    const preferred = pickDefault(STATE.tracks);
    await applyTrack(preferred, false);
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function onNavigate() {
    const id = videoIdFromUrl();
    if (!id) return;
    if (!STATE.forceReload && id === STATE.videoId && STATE.cues.length) return;
    STATE.videoId = id;
    STATE.cues = [];
    STATE.idx = -1;
    await waitForPlayer();
    ensureRoot();
    ensureChromeButtons();
    await loadForVideo();
  }

  function waitForPlayer() {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (playerEl() && videoEl()) {
          clearInterval(iv);
          resolve();
        } else if (Date.now() - t0 > 15000) {
          clearInterval(iv);
          resolve();
        }
      }, 200);
    });
  }

  function applyEnabled() {
    const root = $("#kiki-root");
    if (root) root.style.display = STATE.enabled ? "" : "none";
    document.documentElement.classList.toggle("kiki-hide-native", STATE.enabled && STATE.hideNativeCaptions);
    document.documentElement.classList.toggle("kiki-lock-chrome", !!STATE.enabled);
    if (!STATE.enabled) document.documentElement.classList.remove("kiki-webpage-fs");
    syncChromeButtons();
  }

  function paintRoot(root) {
    if (!root) return;
    root.style.setProperty("--kiki-font", `${STATE.fontSize}px`);
    root.style.setProperty("--kiki-family", STATE.fontFamily);
    root.style.setProperty("--kiki-ink", STATE.captionColor || "#141413");
    root.style.setProperty("--kiki-paper", STATE.captionBg || "#EFEBE3");
    root.style.setProperty("--kiki-bg-alpha", String(STATE.captionBgAlpha ?? 86));
  }

  function applySettings(s) {
    if (s.enabled != null) STATE.enabled = s.enabled;
    if (s.fontSize != null) STATE.fontSize = s.fontSize;
    if (s.fontFamily != null) STATE.fontFamily = s.fontFamily;
    if (s.hideNativeCaptions != null) STATE.hideNativeCaptions = s.hideNativeCaptions;
    if (s.captionColor) STATE.captionColor = s.captionColor;
    if (s.captionBg) STATE.captionBg = s.captionBg;
    if (s.captionBgAlpha != null) STATE.captionBgAlpha = Number(s.captionBgAlpha);
    paintRoot($("#kiki-root"));
    applyEnabled();
    renderCue(STATE.idx);
    placeAi();
  }

  async function clearCaptionCache() {
    STATE.forceReload = true;
    STATE.videoId = null;
    STATE.cues = [];
    STATE.tracks = [];
    STATE.trackKey = null;
    STATE.audioLang = "";
    STATE.currentLang = "";
    try { await pageCall("clear", {}, 1500); } catch {}
    toast("cache cleared");
    await onNavigate();
    STATE.forceReload = false;
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "kiki-clear-cache") clearCaptionCache();
  });

  injectPage();

  chrome.storage.sync.get(null, (s) => {
    applySettings(s || {});
    onNavigate();
  });
  chrome.storage.local.get(["aiEnabled", "aiTested"], (s) => {
    STATE.aiEnabled = !!(s.aiEnabled && s.aiTested);
  });
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === "local" && (ch.aiEnabled || ch.aiTested)) {
      chrome.storage.local.get(["aiEnabled", "aiTested"], (s) => {
        STATE.aiEnabled = !!(s.aiEnabled && s.aiTested);
      });
    }
  });

  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== "sync") return;
    const next = {};
    for (const [k, v] of Object.entries(ch)) next[k] = v.newValue;
    applySettings(next);
  });

  document.addEventListener("yt-navigate-finish", () => setTimeout(onNavigate, 300));
  document.addEventListener("yt-navigate-start", () => {
    STATE.videoId = null;
  });

  setInterval(tick, 120);
  window.addEventListener("resize", () => requestAnimationFrame(placeAi));

  document.addEventListener("click", (e) => {
    const menu = $("#kiki-track-menu");
    if (!menu || !menu.classList.contains("open")) return;
    if (menu.contains(e.target) || e.target.closest("#kiki-btn-track")) return;
    menu.classList.remove("open");
  });

  window.addEventListener("keydown", (e) => {
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    if (e.key === "[") seekCue(-1);
    if (e.key === "]") seekCue(1);
    if (e.key === "f" && e.altKey) {
      e.preventDefault();
      toggleWebpageFs();
    }
  });
})();
