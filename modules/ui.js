// =============================================================
// Kiki Immersion - UI Module (Cards, HUD Bar, Subtitles Overlay, Settings Modal)
// Version: 1.2.0
// =============================================================

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
  }

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

  function keepHudAlive(ms = 8000) {
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
    if (hud && hud.parentElement !== targetHost) {
      targetHost.appendChild(hud);
    }
    if (!hud) {
      hud = document.createElement("div");
      hud.id = "kiki-hud";
      hud.style.cssText = "position: fixed !important; top: 64px !important; left: 50% !important; transform: translateX(-50%) !important; z-index: 2147483647 !important; display: none !important; align-items: center !important; gap: 8px !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important; font-size: 13px !important; font-weight: 600 !important; background: rgba(20, 20, 24, 0.92) !important; backdrop-filter: blur(20px) saturate(180%) !important; -webkit-backdrop-filter: blur(20px) saturate(180%) !important; color: #FFFFFF !important; padding: 7px 15px !important; border-radius: 22px !important; border: 1.5px solid rgba(255, 255, 255, 0.4) !important; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.85) !important; pointer-events: auto !important; cursor: grab !important; visibility: hidden !important; opacity: 0 !important; transition: opacity 0.2s ease, visibility 0.2s ease !important; user-select: none !important; -webkit-user-select: none !important; touch-action: none !important;";
      setHtml(hud, `
        <div class="kiki-hud-dot" style="width: 10px !important; height: 10px !important; border-radius: 50% !important; background: #10B981 !important; flex-shrink: 0 !important; box-shadow: 0 0 10px #10B981 !important;"></div>
        <button type="button" class="kiki-hud-btn kiki-hud-title" style="background: rgba(255, 255, 255, 0.2) !important; border-radius: 12px !important; padding: 4px 10px !important; font-size: 12px !important; cursor: pointer !important; border: 1px solid rgba(255, 255, 255, 0.3) !important; color: #FFFFFF !important; font-weight: 700 !important; white-space: nowrap !important;" title="Tap for diagnostics">✦ Kiki</button>
        <button type="button" class="kiki-hud-btn kiki-hud-sub" style="background: rgba(255, 255, 255, 0.2) !important; border-radius: 12px !important; padding: 4px 10px !important; font-size: 12px !important; cursor: pointer !important; border: 1px solid rgba(255, 255, 255, 0.3) !important; color: #FFFFFF !important; font-weight: 600 !important; white-space: nowrap !important;" title="Toggle Subtitles Visibility">💬 Sub: On</button>
        <button type="button" class="kiki-hud-btn kiki-hud-cc" style="background: rgba(255, 255, 255, 0.2) !important; border-radius: 12px !important; padding: 4px 10px !important; font-size: 12px !important; cursor: pointer !important; border: 1px solid rgba(255, 255, 255, 0.3) !important; color: #FFFFFF !important; font-weight: 600 !important; white-space: nowrap !important;">CC: Searching...</button>
        <button type="button" class="kiki-hud-btn kiki-hud-dict" style="background: rgba(255, 255, 255, 0.2) !important; border-radius: 12px !important; padding: 4px 10px !important; font-size: 12px !important; cursor: pointer !important; border: 1px solid rgba(255, 255, 255, 0.3) !important; color: #FFFFFF !important; font-weight: 600 !important; white-space: nowrap !important;">📖 Dict: 0</button>
        <button type="button" class="kiki-hud-btn kiki-hud-ai" style="background: rgba(255, 255, 255, 0.2) !important; border-radius: 12px !important; padding: 4px 10px !important; font-size: 12px !important; cursor: pointer !important; border: 1px solid rgba(255, 255, 255, 0.3) !important; color: #FFFFFF !important; font-weight: 600 !important; white-space: nowrap !important;" title="AI API Configuration">🤖 AI: Off</button>
        <button type="button" class="kiki-hud-btn kiki-hud-fs" style="background: rgba(255, 255, 255, 0.2) !important; border-radius: 12px !important; padding: 4px 10px !important; font-size: 12px !important; cursor: pointer !important; border: 1px solid rgba(255, 255, 255, 0.3) !important; color: #FFFFFF !important; font-weight: 600 !important; white-space: nowrap !important;">⛶ Fullscreen</button>
        <button type="button" class="kiki-hud-btn kiki-hud-about" style="background: rgba(255, 255, 255, 0.2) !important; border-radius: 12px !important; padding: 4px 10px !important; font-size: 12px !important; cursor: pointer !important; border: 1px solid rgba(255, 255, 255, 0.3) !important; color: #FFFFFF !important; font-weight: 600 !important; white-space: nowrap !important;" title="About & Hot-Update">ℹ️ About</button>
        <button type="button" class="kiki-hud-btn kiki-hud-ctrl" style="background: rgba(255, 255, 255, 0.2) !important; border-radius: 12px !important; padding: 4px 10px !important; font-size: 12px !important; cursor: pointer !important; border: 1px solid rgba(255, 255, 255, 0.3) !important; color: #FFFFFF !important; font-weight: 600 !important; white-space: nowrap !important;">⚙ Controls</button>
      `);
      targetHost.appendChild(hud);
      makeDraggable(hud);

      hud.addEventListener("pointerenter", () => {
        clearTimeout(toggleHud._t);
      });
      hud.addEventListener("pointerleave", () => {
        if (STATE.hudVisible) {
          clearTimeout(toggleHud._t);
          toggleHud._t = setTimeout(() => hideHud(), 4000);
        }
      });

      bindHudButton(hud.querySelector(".kiki-hud-sub"), () => {
        STATE.subsVisible = !(STATE.subsVisible !== false);
        localStorage.setItem("kiki_subs_visible", STATE.subsVisible ? "1" : "0");
        const box = $("#kiki-captions");
        if (box) {
          if (!STATE.subsVisible) {
            box.classList.add("kiki-hidden");
            closeLookup();
            toast("✦ Subtitles hidden");
          } else {
            box.classList.remove("kiki-hidden");
            if (STATE.idx >= 0) renderCue(STATE.idx);
            toast("✦ Subtitles enabled");
          }
        }
        updateHud();
      });

      bindHudButton(hud.querySelector(".kiki-hud-fs"), () => {
        toggleWebpageFs();
      });

      bindHudButton(hud.querySelector(".kiki-hud-about"), () => {
        showSettingsModal("about");
      });

      bindHudButton(hud.querySelector(".kiki-hud-ctrl"), () => {
        toggleNativeChrome();
      });

      bindHudButton(hud.querySelector(".kiki-hud-dict"), () => {
        showSettingsModal("dict");
      });

      bindHudButton(hud.querySelector(".kiki-hud-ai"), () => {
        showSettingsModal("ai");
      });

      bindHudButton(hud.querySelector(".kiki-hud-cc"), () => {
        toast("Activating Captions...");
        ensureCaptionsActive();
        loadForVideo();
      });

      bindHudButton(hud.querySelector(".kiki-hud-title"), () => {
        const cueCount = STATE.cues ? STATE.cues.length : 0;
        const v = videoEl();
        const status = v ? (v.paused ? "Paused" : "Playing") : "No Video";
        const live = lastObservedText ? "YES" : "NO";
        const trackCount = v && v.textTracks ? v.textTracks.length : 0;
        const domCount = queryCaptionElements(".ytp-caption-segment, .caption-visual-line").length;
        const kikiVer = window.__kiki_engine_version || localStorage.getItem("kiki_cache_version") || "1.2.0";
        toast(`✦ Kiki v${kikiVer} [${status}] | CC=${cueCount} | Live=${live} | DOM=${domCount} | Trk=${trackCount}`);
      });
    }

    return hud;
  }

  function updateHud(statusText) {
    const hud = ensureHud();
    if (!hud) return;
    const subBtn = hud.querySelector(".kiki-hud-sub");
    const ccBtn = hud.querySelector(".kiki-hud-cc");
    const fsBtn = hud.querySelector(".kiki-hud-fs");
    const ctrlBtn = hud.querySelector(".kiki-hud-ctrl");
    const dictBtn = hud.querySelector(".kiki-hud-dict");
    const aiBtn = hud.querySelector(".kiki-hud-ai");

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
      let targetCc = "CC: Searching...";
      if (statusText) {
        targetCc = statusText;
      } else if (!currentVideoId()) {
        targetCc = "Home";
      } else if (STATE.cues && STATE.cues.length) {
        targetCc = `CC: ${STATE.cues.length}`;
      } else if (STATE.loadingTracks) {
        targetCc = "Loading CC...";
      } else {
        targetCc = "CC: None (Tap to Search)";
      }
      if (ccBtn.textContent !== targetCc) ccBtn.textContent = targetCc;
    }

    if (fsBtn) {
      const targetFs = STATE.fs ? "✕ Exit FS" : "⛶ Fullscreen";
      if (fsBtn.textContent !== targetFs) fsBtn.textContent = targetFs;
    }

    if (ctrlBtn) {
      const showChrome = document.documentElement.classList.contains("kiki-show-chrome");
      const targetCtrl = showChrome ? "✕ Hide Bar" : "⚙ Controls";
      if (ctrlBtn.textContent !== targetCtrl) ctrlBtn.textContent = targetCtrl;
    }

    if (dictBtn) {
      const targetDict = cachedDictCount > 0 ? `📖 Dict: ${cachedDictCount}` : "📖 Import Dict";
      if (dictBtn.textContent !== targetDict) dictBtn.textContent = targetDict;
    }

    if (aiBtn) {
      const cfg = getAiConfig();
      const hasKey = !!(cfg.apiKey && cfg.apiKey.trim());
      const targetAi = hasKey ? "🤖 AI: On" : "🤖 AI: Off";
      if (aiBtn.textContent !== targetAi) aiBtn.textContent = targetAi;
      if (aiBtn.dataset.active !== (hasKey ? "1" : "0")) {
        aiBtn.dataset.active = hasKey ? "1" : "0";
        aiBtn.style.setProperty("background", hasKey ? "rgba(99, 102, 241, 0.35)" : "rgba(255, 255, 255, 0.2)", "important");
        aiBtn.style.setProperty("border-color", hasKey ? "rgba(165, 180, 252, 0.5)" : "rgba(255, 255, 255, 0.3)", "important");
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
    // When native controls are hidden: settle at 44px above video bottom
    // Calculate distance from bottom of viewport to bottom of video
    if (v) {
      const r = v.getBoundingClientRect();
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

  function getSentenceContext() {
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


  async function showYomitanCard(wordEl, term) {
    window.showYomitanCard = showYomitanCard;
    STATE.lookupWord = term;
    STATE.lookupEl = wordEl;
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

    positionCardAboveSubtitles(card);

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

  function closeLookup() {
    abortActiveAi();
    STATE.lookupEl = null;
    STATE.lookupWord = "";
    document.querySelectorAll(".kiki-word.kiki-active").forEach((n) => n.classList.remove("kiki-active"));

    const card = $("#kiki-yomitan-card");
    if (card) card.classList.remove("show");

    if (STATE.pausedForLookup) {
      STATE.pausedForLookup = false;
      playVideoSync();
    }
  }

  document.addEventListener("pointerdown", (e) => {
    const card = $("#kiki-yomitan-card");
    const cardOpen = card && card.classList.contains("show");
    if ((STATE.lookupEl || cardOpen) && !e.target.closest("#kiki-yomitan-card, .kiki-word, .kiki-cap-ai-btn, #kiki-settings-modal, #kiki-hud, .kiki-toast")) {
      closeLookup();
    }
    const modal = document.getElementById("kiki-settings-modal");
    if (modal && modal.style.display !== "none" && !e.target.closest("#kiki-settings-modal, #kiki-hud")) {
      modal.style.display = "none";
    }
  }, true);


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
              await Promise.all(list.map(async (m) => {
                const r = await fetch(`${base}${m}.js?_t=${Date.now()}`);
                if (!r.ok) throw new Error(`HTTP ${r.status} on ${m}.js`);
                const t = await r.text();
                localStorage.setItem("kiki_mod_" + m, t);
              }));
              localStorage.setItem("kiki_cache_version", "1.2.0");
              localStorage.setItem("kiki_cache_time", new Date().toLocaleString());
              toast("✅ Core modules updated, reloading...");
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
            toast("🗑 Local module cache cleared");
            renderModal();
          }
        });
      }

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
          </div>
        `;
            } else if (activeTab === "about") {
        const cacheTime = localStorage.getItem("kiki_cache_time") || "Initial / Local";
        const engineVer = localStorage.getItem("kiki_cache_version") || "1.2.0";
        const loaderVer = localStorage.getItem("kiki_loader_version") || (window.__kiki_loader_version || "1.0.0");
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
              await Promise.all(list.map(async (m) => {
                const r = await fetch(`${base}${m}.js?_t=${Date.now()}`, { cache: "no-store" });
                if (!r.ok) throw new Error(`HTTP ${r.status} on ${m}.js`);
                const t = await r.text();
                localStorage.setItem("kiki_mod_" + m, t);
              }));
              localStorage.setItem("kiki_cache_version", "1.2.0");
              localStorage.setItem("kiki_cache_time", new Date().toLocaleString());
              toast("✅ Core modules updated, reloading...");
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

