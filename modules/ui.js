// =============================================================
// Kiki Immersion - UI Module (Cards, HUD Bar, Subtitles Overlay, Settings Modal)
// Version: 1.3.2
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
  window.ensureHud = ensureHud;

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
      } else if (!(typeof currentVideoId === "function" ? currentVideoId() : (typeof STATE !== "undefined" && STATE.videoId))) {
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
  window.updateHud = updateHud;

  function ensureRoot() {
    let root = document.getElementById("kiki-root");
    const targetHost = document.body || document.documentElement;
    if (!root && targetHost) {
      root = document.createElement("div");
      root.id = "kiki-root";
      root.style.cssText = "position: fixed !important; inset: 0 !important; pointer-events: none !important; z-index: 2147483640 !important;";
      setHtml(root, `
        <div id="kiki-captions" class="${STATE.subsVisible === false ? 'kiki-hidden' : ''}" style="position: fixed !important; left: 50% !important; bottom: 85px !important; transform: translateX(-50%) !important; pointer-events: auto !important; z-index: 2147483645 !important; text-align: center !important; min-height: 1em !important;"></div>
      `);
      targetHost.appendChild(root);
    }
    if (root && root.parentElement !== targetHost && targetHost) {
      targetHost.appendChild(root);
    }

    ensureYomitanCard();
    if (typeof ensureCaptionObserver === "function") ensureCaptionObserver();
    if (typeof bindVideoTrackListeners === "function") bindVideoTrackListeners();
    if (typeof updateCaptionPosition === "function") updateCaptionPosition();
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
    STATE.lastLookupOpenTime = Date.now();
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

      // If modifier key is pressed (Ctrl/Alt/Meta), this is a lookup or shortcut gesture, NEVER dismiss!
      if (e.ctrlKey || e.altKey || e.metaKey) {
        return;
      }

      // Ignore dismissal if the card was just opened within the last 400ms (prevent pointerup/click of trigger gesture from dismissing)
      if (Date.now() - (STATE.lastLookupOpenTime || 0) < 400) {
        return;
      }

      const isOpen = isAnyPopupOpen();
      const withinGrace = (Date.now() - (STATE.lastLookupDismissTime || 0)) < 600;

      if (isOpen) {
        if (type === "pointerdown" || type === "touchstart" || type === "mousedown") {
          if (e.cancelable) e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          dismissAllPopups(true);
        } else {
          if (e.cancelable) e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        }
      } else if (withinGrace) {
        // Swallow remaining events of the dismissal gesture (e.g. pointerup, mouseup, click)
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

