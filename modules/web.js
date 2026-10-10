// =============================================================
// Kiki Immersion - Web Universal Lookup Module
// Version: 1.3.4
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
    if (mode === "none") return true;
    if (mode === "ctrl") return e.ctrlKey;
    if (mode === "alt") return e.altKey;
    if (mode === "meta") return e.metaKey;
    return e.ctrlKey || e.metaKey;
  }

  function isStudyMode() {
    return (typeof STATE !== "undefined" && !!STATE.studyMode) ||
           localStorage.getItem("kiki_study_mode") === "1";
  }

  function dispatchNativeClick(target, clientX, clientY) {
    if (!target) return;
    try {
      const opts = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: clientX || 0,
        clientY: clientY || 0,
        button: 0,
        buttons: 1,
        detail: 1,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        shiftKey: false
      };
      target.dispatchEvent(new PointerEvent("pointerdown", opts));
      target.dispatchEvent(new MouseEvent("mousedown", opts));
      target.dispatchEvent(new PointerEvent("pointerup", opts));
      target.dispatchEvent(new MouseEvent("mouseup", opts));
      target.dispatchEvent(new MouseEvent("click", opts));

      const link = target.closest("a");
      if (link && link.href) {
        link.click();
      } else {
        const btn = target.closest("button, [role='button']");
        if (btn && btn !== target && typeof btn.click === "function") {
          btn.click();
        }
      }
    } catch (err) {
      try { target.click(); } catch {}
    }
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

  // asbplayer uses a different subtitle class in fullscreen. Its offscreen
  // measurement/transcript cache is never the active subtitle context.
  const ASB_SUBTITLE_SELECTOR = ".asbplayer-subtitles, .asbplayer-fullscreen-subtitles, .asb-subtitles";
  const ASB_CONTAINER_SELECTOR = ".asbplayer-subtitles-container-bottom, .asbplayer-subtitles-container-top";
  const asbCueHistory = new WeakMap();

  function asbSubtitleRoot(node) {
    const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    const root = el?.closest(ASB_SUBTITLE_SELECTOR);
    return root && !root.closest(".asbplayer-offscreen, table, [hidden]") ? root : null;
  }

  function isVisibleAsbSubtitle(el) {
    if (el.closest(".asbplayer-offscreen, table, [hidden]")) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity !== "0" &&
      r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  }

  function asbSubtitleText(el) {
    // Rich subtitles contain both plain and annotated copies. Ruby readings
    // and frequency labels are not spoken dialogue; keep only the base text.
    const plain = el.querySelector(".asbplayer-subtitle-text");
    const clone = (plain || el).cloneNode(true);
    clone.querySelectorAll("rt, rp, .asbplayer-subtitle-rich").forEach(n => n.remove());
    clone.querySelectorAll("br").forEach(n => n.replaceWith("\n"));
    return (clone.textContent || "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
  }

  function asbVideoForSubtitle(root) {
    const center = root.getBoundingClientRect();
    return Array.from(document.querySelectorAll("video")).filter(v => {
      const r = v.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && center.left < r.right && center.right > r.left &&
        center.top < r.bottom && center.bottom > r.top;
    }).sort((a, b) => {
      const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
      return br.width * br.height - ar.width * ar.height;
    })[0] || null;
  }

  function extractAsbContext(node) {
    const root = asbSubtitleRoot(node);
    if (!root) return null;
    const container = root.closest(ASB_CONTAINER_SELECTOR);
    const scope = container?.parentElement || root.parentElement;
    const video = asbVideoForSubtitle(root);
    const subtitles = Array.from(scope?.querySelectorAll(ASB_SUBTITLE_SELECTOR) || [root])
      .filter(el => isVisibleAsbSubtitle(el) && (!video || asbVideoForSubtitle(el) === video));
    if (!subtitles.includes(root)) subtitles.unshift(root);
    const seen = new Set();
    const tracks = subtitles.map(el => ({
      track: el.querySelector("[data-track]")?.getAttribute("data-track") || "?",
      text: asbSubtitleText(el)
    })).filter(item => {
      const key = item.track + ":" + item.text;
      if (!item.text || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const current = asbSubtitleText(root);
    const cue = tracks.map(t => `[Track ${t.track}]\n${t.text}`).join("\n\n");
    let previous = [];
    if (video) {
      let history = asbCueHistory.get(video);
      const time = video.currentTime;
      // Reset on episode navigation, backward seeks or long gaps.
      if (!history || history.url !== location.href || time < history.time - 1 || time > history.time + 20) {
        history = { url: location.href, time, cues: [] };
      }
      const last = history.cues[history.cues.length - 1];
      if (cue && last !== cue) history.cues.push(cue);
      history.cues = history.cues.slice(-3);
      history.time = time;
      asbCueHistory.set(video, history);
      previous = history.cues.slice(0, -1);
    }
    return {
      // ALL lines of the clicked track, not just the word's DOM token.
      sentence: current.replace(/\n+/g, " "),
      paragraph: (previous.length ? "Previous observed subtitles:\n" + previous.join("\n\n") + "\n\n" : "") +
        "Current subtitles:\n" + cue,
      video
    };
  }

  function asbCaretPoint(e, root) {
    const caret = getCaretPoint(e.clientX, e.clientY);
    if (caret?.node?.nodeType === Node.TEXT_NODE && root.contains(caret.node) &&
        !caret.node.parentElement.closest("rt, rp")) return caret;
    // A player overlay can intercept native caret hit-testing. Check actual
    // glyph rectangles, restricted to this subtitle (no page-wide tokenization).
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement.closest("rt, rp")) continue;
      for (let i = 0; i < node.length; i++) {
        if (/\s/.test(node.textContent[i])) continue;
        const r = document.createRange();
        r.setStart(node, i);
        r.setEnd(node, i + 1);
        if (Array.from(r.getClientRects()).some(b => b.width > 0 && b.height > 0 &&
            e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom)) {
          return { node, offset: i, range: r };
        }
      }
    }
    return null;
  }

  function observeAsbSubtitles() {
    if (!document.body || (!/(?:^|\.)netflix\.com$/.test(location.hostname) &&
        !location.hostname.includes("asbplayer") && !document.querySelector(ASB_SUBTITLE_SELECTOR))) return;
    const observer = new MutationObserver(records => {
      const roots = new Set();
      for (const record of records) {
        const root = asbSubtitleRoot(record.target);
        if (root) roots.add(root);
        for (const node of record.addedNodes || []) {
          if (node.nodeType !== Node.ELEMENT_NODE || node.closest(".asbplayer-offscreen")) continue;
          if (node.matches(ASB_SUBTITLE_SELECTOR)) roots.add(node);
          node.querySelectorAll(ASB_SUBTITLE_SELECTOR).forEach(el => roots.add(el));
        }
      }
      for (const root of roots) if (isVisibleAsbSubtitle(root)) extractAsbContext(root);
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    document.querySelectorAll(ASB_SUBTITLE_SELECTOR).forEach(root => {
      if (isVisibleAsbSubtitle(root)) extractAsbContext(root);
    });
    document.addEventListener("seeking", e => asbCueHistory.delete(e.target), true);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", observeAsbSubtitles, { once: true });
  else observeAsbSubtitles();

  // -------------------------------------------------------------
  // 3. Multilingual Word & Web Context Extraction (Sentence & Paragraph)
  // -------------------------------------------------------------
  function getEnclosingBlock(node) {
    let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    const inlineTags = new Set([
      "A", "ABBR", "ACRONYM", "B", "BDO", "BIG", "BR", "BUTTON", "CITE", "CODE",
      "DFN", "EM", "I", "IMG", "INPUT", "KBD", "LABEL", "MAP", "MARK", "OBJECT",
      "OUTPUT", "Q", "SAMP", "SCRIPT", "SELECT", "SMALL", "SPAN", "STRONG", "SUB",
      "SUP", "TEXTAREA", "TIME", "TT", "VAR", "RUBY", "RT", "RP", "U", "S", "STRIKE"
    ]);

    while (el && el.parentElement && el !== document.body && el !== document.documentElement) {
      const tag = el.tagName ? el.tagName.toUpperCase() : "";
      if (inlineTags.has(tag)) {
        el = el.parentElement;
        continue;
      }
      try {
        const display = window.getComputedStyle(el).display;
        if (display && display.startsWith("inline")) {
          el = el.parentElement;
          continue;
        }
      } catch {}
      break;
    }
    return el || document.body;
  }

  function extractWebContext(node, offset, term) {
    const asbContext = extractAsbContext(node);
    if (asbContext) return asbContext;
    const blockEl = getEnclosingBlock(node);
    let fullText = "";
    let globalOffset = 0;

    try {
      const preRange = document.createRange();
      preRange.selectNodeContents(blockEl);
      preRange.setEnd(node, Math.min(offset, node.textContent ? node.textContent.length : offset));
      globalOffset = preRange.toString().length;
      fullText = blockEl.textContent || "";
    } catch {
      fullText = (node.parentElement?.textContent || node.textContent || "");
      globalOffset = offset;
    }

    if (!fullText) {
      return { sentence: term || "", paragraph: term || "" };
    }

    // 1. Identify Paragraph boundaries (bounded by double-newline or block boundaries)
    let paraStart = globalOffset;
    while (paraStart > 0) {
      if (fullText[paraStart - 1] === "\n" && (paraStart >= 2 && fullText[paraStart - 2] === "\n")) {
        break;
      }
      paraStart--;
    }
    let paraEnd = globalOffset;
    while (paraEnd < fullText.length) {
      if (fullText[paraEnd] === "\n" && (paraEnd + 1 < fullText.length && fullText[paraEnd + 1] === "\n")) {
        break;
      }
      paraEnd++;
    }
    const rawParagraph = fullText.slice(paraStart, paraEnd).replace(/[ \t\r\n]+/g, " ").trim();

    // 2. Identify Sentence boundaries around globalOffset
    const sentDelimRegex = /[.!?。\n\r！？]/;
    let sentStart = globalOffset;
    while (sentStart > paraStart && !sentDelimRegex.test(fullText[sentStart - 1])) {
      sentStart--;
    }
    let sentEnd = globalOffset;
    while (sentEnd < paraEnd && !sentDelimRegex.test(fullText[sentEnd])) {
      sentEnd++;
    }
    if (sentEnd < paraEnd && sentDelimRegex.test(fullText[sentEnd])) {
      sentEnd++;
      // Include trailing quotation marks, parenthesis, or brackets (e.g. ." or .”)
      while (sentEnd < paraEnd && /["”'’」』)\]》]/.test(fullText[sentEnd])) {
        sentEnd++;
      }
    }

    let sentence = fullText.slice(sentStart, sentEnd).replace(/[ \t\r\n]+/g, " ").trim();

    // Quality check: If sentence is too short or identical to term, expand to paragraph
    if ((!sentence || sentence.length < (term?.length || 1) + 6 || sentence.toLowerCase() === term?.toLowerCase()) && rawParagraph.length > sentence.length) {
      sentence = rawParagraph;
    }

    // Limit oversized sentence length safely (e.g. max 450 chars)
    if (sentence.length > 450) {
      const idx = sentence.toLowerCase().indexOf(term?.toLowerCase() || "");
      if (idx !== -1) {
        const start = Math.max(0, idx - 180);
        const end = Math.min(sentence.length, idx + (term?.length || 0) + 180);
        sentence = (start > 0 ? "…" : "") + sentence.slice(start, end).trim() + (end < sentence.length ? "…" : "");
      } else {
        sentence = sentence.slice(0, 450) + "…";
      }
    }

    const paragraph = rawParagraph.length <= 800 ? rawParagraph : (rawParagraph.slice(0, 800) + "…");

    return { sentence, paragraph };
  }

  async function resolveTargetWordAndContext(node, offset) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return null;

    // Check if the clicked node is inside an element marked as part of a recognized phrase (e.g. LingQ phrase scan)
    const phraseHost = node.parentElement?.closest("[data-kiki-phrase]");
    if (phraseHost) {
      const phrase = phraseHost.getAttribute("data-kiki-phrase");
      if (phrase) {
        const { sentence, paragraph } = extractWebContext(node, offset, phrase);
        const hlRange = document.createRange();
        try {
          const phraseWords = phraseHost.parentElement
            ? Array.from(phraseHost.parentElement.querySelectorAll(`[data-kiki-phrase="${CSS.escape(phrase)}"]`))
            : [phraseHost];
          if (phraseWords.length > 0) {
            hlRange.setStartBefore(phraseWords[0]);
            hlRange.setEndAfter(phraseWords[phraseWords.length - 1]);
          } else {
            hlRange.selectNode(phraseHost);
          }
        } catch {
          try { hlRange.selectNode(phraseHost); } catch {}
        }
        return {
          term: phrase,
          sentence,
          paragraph,
          isJp: /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(phrase),
          range: hlRange
        };
      }
    }

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

    const isJpOrCjk = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(ch);

    if (isJpOrCjk) {
      // For Japanese/CJK, scan forward up to 16 characters and query candidate prefixes
      const forwardSlice = text.slice(idx, idx + 16);
      const searchFn = (window.localSearch && typeof window.localSearch.search === "function")
        ? (t) => window.localSearch.search(t)
        : null;
      if (searchFn) {
        const maxLen = Math.min(12, forwardSlice.length);
        const prefixSearches = [];
        for (let l = maxLen; l >= 1; l--) {
          prefixSearches.push(
            searchFn(forwardSlice.slice(0, l)).then(res => ({ len: l, res }))
          );
        }
        const searchResults = await Promise.all(prefixSearches);
        const best = searchResults.find(item => item.res && item.res.length > 0);
        if (best) {
          const matchedTerm = forwardSlice.slice(0, best.len);
          const { sentence, paragraph } = extractWebContext(node, idx, matchedTerm);
          const hlRange = document.createRange();
          try {
            hlRange.setStart(node, idx);
            hlRange.setEnd(node, idx + best.len);
          } catch {}
          return {
            term: matchedTerm,
            sentence,
            paragraph,
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
      // If Kanji followed by Hiragana (okurigana like 食べる, 美味しい), include trailing Hiragana
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
      const { sentence, paragraph } = extractWebContext(node, idx, term);
      const hlRange = document.createRange();
      try {
        hlRange.setStart(node, start);
        hlRange.setEnd(node, end);
      } catch {}
      return { term, sentence, paragraph, isJp: true, range: hlRange };
    } else {
      // Latin / English word extraction
      let start = idx;
      while (start > 0 && /[\w'-]/.test(text[start - 1])) start--;
      let end = idx;
      while (end < text.length && /[\w'-]/.test(text[end])) end++;
      const term = text.slice(start, end).replace(/^['-]+|['-]+$/g, "");
      if (!term || term.length < 1) return null;

      const { sentence, paragraph } = extractWebContext(node, idx, term);
      const hlRange = document.createRange();
      try {
        hlRange.setStart(node, start);
        hlRange.setEnd(node, end);
      } catch {}
      return { term, sentence, paragraph, isJp: false, range: hlRange };
    }
  }

  // -------------------------------------------------------------
  // 4. Modifier + Click Event Interceptor
  // -------------------------------------------------------------
  let lastTriggerTime = 0;

  async function onGlobalPointerDown(e) {
    // 0. Performance: early bailout if modifier key is not held (zero overhead)
    if (!isTriggerKeyPressed(e)) return;

    const mode = getTriggerKey();

    // Do not trigger on Kiki's own UI elements or YouTube subtitle bar
    if (e.target && typeof e.target.closest === "function" &&
        e.target.closest("#kiki-yomitan-card, #kiki-settings-modal, #kiki-hud, .kiki-toast, #kiki-captions")) {
      return;
    }

    // Only ignore form inputs where user is actively typing text
    if (e.target && typeof e.target.closest === "function" &&
        e.target.closest("input, textarea, select, [contenteditable='true']")) {
      return;
    }

    const now = Date.now();
    if (now - lastTriggerTime < 250) return;

    const asbRoot = asbSubtitleRoot(e.target) ||
      document.elementsFromPoint(e.clientX, e.clientY).map(asbSubtitleRoot).find(Boolean);
    const caret = asbRoot ? asbCaretPoint(e, asbRoot) : getCaretPoint(e.clientX, e.clientY);
    if (!caret || !caret.node) return;

    // Snapshot before any asynchronous dictionary/CJK resolution or player update.
    const asbContext = asbRoot ? extractAsbContext(caret.node) : null;
    if (asbContext) {
      // Only our configured gesture is intercepted. Yomitan's separate key is untouched.
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      const suppressPlayerGesture = ev => {
        if (ev.target?.closest?.("#kiki-yomitan-card, #kiki-settings-modal, #kiki-modal-backdrop")) return;
        const atOrigin = Math.abs(ev.clientX - e.clientX) < 6 && Math.abs(ev.clientY - e.clientY) < 6;
        if (asbSubtitleRoot(ev.target) !== asbRoot && !atOrigin) return;
        if (ev.cancelable) ev.preventDefault();
        ev.stopPropagation();
      };
      const tailEvents = ["mousedown", "pointerup", "mouseup", "click", "contextmenu"];
      tailEvents.forEach(type => window.addEventListener(type, suppressPlayerGesture, { capture: true }));
      setTimeout(() => tailEvents.forEach(type => window.removeEventListener(type, suppressPlayerGesture, true)), 600);
    }

    const resolved = await resolveTargetWordAndContext(caret.node, caret.offset);
    if (!resolved || !resolved.term) return;
    if (asbContext) {
      resolved.sentence = asbContext.sentence;
      resolved.paragraph = asbContext.paragraph;
    }

    lastTriggerTime = now;

    const studyModeActive = isStudyMode();

    if (studyModeActive) {
      // Exclusive Study Mode: Suppress all native page actions (links, sidebars, buttons)
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const suppressGesture = (ev) => {
        if (ev.cancelable) ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
      };
      window.addEventListener("click", suppressGesture, { capture: true, once: true });
      window.addEventListener("mouseup", suppressGesture, { capture: true, once: true });
      window.addEventListener("contextmenu", suppressGesture, { capture: true, once: true });
    } else {
      // Study Mode OFF (Concurrent Mode, Default):
      // When modifier keys (Ctrl/Alt/Meta) are used, standard primary clicks are often
      // converted to secondary/right-clicks by macOS (e.g. Ctrl+Click) or ignored by reader frameworks.
      // We synthesize a clean primary click on the target element so the native website action
      // (LingQ sidebar, link navigation, button click) executes in sync with dictionary lookup!
      if (mode !== "none" && !asbContext) {
        const targetEl = (caret && caret.node)
          ? (caret.node.nodeType === Node.ELEMENT_NODE ? caret.node : caret.node.parentElement)
          : e.target;
        if (targetEl) {
          setTimeout(() => {
            dispatchNativeClick(targetEl, e.clientX, e.clientY);
          }, 10);
        }
      }
    }

    // Visual selection feedback (apply only in exclusive study mode so reader focus outlines aren't cleared)
    try {
      const sel = window.getSelection();
      if (sel && resolved.range && studyModeActive) {
        sel.removeAllRanges();
        sel.addRange(resolved.range);
      }
    } catch {}

    // Ensure styles are injected
    if (typeof injectStyles === "function") {
      try { injectStyles(); } catch {}
    }

    // Show floating Yomitan card with sentence and paragraph context
    if (typeof showYomitanCard === "function") {
      if (asbContext?.video && !asbContext.video.paused) {
        STATE.lookupVideo = asbContext.video;
        STATE.pausedForLookup = true;
        asbContext.video.pause();
      }
      showYomitanCard(null, resolved.term, { x: e.clientX, y: e.clientY }, resolved.sentence,
        asbContext ? "asbplayer" : "web", resolved.paragraph);
    }
  }

  function suppressIfModifier(e) {
    const mode = getTriggerKey();
    if (mode === "none") {
      if (isStudyMode() && Date.now() - lastTriggerTime < 500) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
      return;
    }

    // In modifier mode, suppress native contextmenu when Ctrl is held to avoid Safari's context menu
    if (e.type === "contextmenu" && (e.ctrlKey || mode === "ctrl")) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  }

  // Intercept pointerdown for word lookup, and suppress native context menu only when Ctrl is held
  window.addEventListener("pointerdown", onGlobalPointerDown, { capture: true, passive: false });
  window.addEventListener("contextmenu", suppressIfModifier, { capture: true, passive: false });

  // -------------------------------------------------------------
  // 5. Global Keyboard Shortcut for Settings Modal (Option+K / Alt+K)
  // -------------------------------------------------------------
  window.addEventListener("keydown", (e) => {
    if (e.altKey && (e.key === "k" || e.key === "K" || e.code === "KeyK")) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof showSettingsModal === "function") {
        showSettingsModal("dict");
      }
    }
  }, { capture: true });

  // Ensure styles are injected on any webpage
  if (document.head || document.documentElement) {
    try { if (typeof injectStyles === "function") injectStyles(); } catch {}
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      try { if (typeof injectStyles === "function") injectStyles(); } catch {}
    }, { once: true });
  }

  // Strictly purge any rogue #kiki-hud element on non-YouTube sites
  try {
    const isYT = window.location.hostname.includes("youtube.com") || window.location.hostname.includes("youtu.be");
    if (!isYT) {
      const rogueHud = document.getElementById("kiki-hud");
      if (rogueHud) rogueHud.remove();
    }
  } catch {}

  // -------------------------------------------------------------
  // 6. LingQ Reader Phrase Scanner & Wavy Highlighter
  // -------------------------------------------------------------
  function initLingQPhraseScanner() {
    if (!window.location.hostname.includes("lingq.com")) return;

    const phraseCache = new Map();
    let isScanning = false;
    let scanPending = false;
    let lastScannedFingerprint = "";

    // Map: wordId -> { phrase: string, isLast: boolean, el: HTMLElement }
    const wordMetaMap = new Map();

    const WAVE_DARK = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 6'%3E%3Cpath d='M 0 3 Q 5 0.5 10 3 T 20 3' fill='none' stroke='%23818CF8' stroke-width='2.2' stroke-linecap='round'/%3E%3C/svg%3E")`;
    const WAVE_LIGHT = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 6'%3E%3Cpath d='M 0 3 Q 5 0.5 10 3 T 20 3' fill='none' stroke='%234F46E5' stroke-width='2.2' stroke-linecap='round'/%3E%3C/svg%3E")`;

    function injectPhraseStyles() {
      if (document.getElementById("kiki-lingq-phrase-styles")) return;
      const style = document.createElement("style");
      style.id = "kiki-lingq-phrase-styles";
      style.textContent = `
        :root {
          --kiki-phrase-wave: ${WAVE_LIGHT};
        }
        @media (prefers-color-scheme: dark) {
          :root {
            --kiki-phrase-wave: ${WAVE_DARK};
          }
        }
        [data-kiki-theme="dark"],
        .theme-luminosity-dark,
        [data-theme="dark"],
        .dark,
        [dark="true"] {
          --kiki-phrase-wave: ${WAVE_DARK} !important;
        }
        [data-kiki-theme="light"],
        .theme-luminosity-light,
        [data-theme="light"],
        .light {
          --kiki-phrase-wave: ${WAVE_LIGHT} !important;
        }
        .kiki-phrase-word {
          position: relative !important;
          cursor: pointer !important;
        }
        .kiki-phrase-word::after {
          content: "" !important;
          position: absolute !important;
          left: 0 !important;
          right: 0 !important;
          bottom: -2.5px !important;
          height: 6px !important;
          background-image: var(--kiki-phrase-wave) !important;
          background-repeat: repeat-x !important;
          background-size: 10px 6px !important;
          background-position: left bottom !important;
          pointer-events: none !important;
          z-index: 12 !important;
          transition: filter 0.15s ease !important;
        }
        .kiki-phrase-word:not(.kiki-phrase-last)::after {
          right: -0.32em !important;
        }
        .kiki-phrase-word:hover::after,
        .kiki-phrase-hover::after {
          filter: drop-shadow(0 0 2.5px rgba(129, 140, 248, 0.9)) !important;
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    }

    function updateThemeColor() {
      try {
        const isDark = (typeof isPageDark === "function" && isPageDark()) ||
                       document.body?.classList.contains("theme-luminosity-dark") ||
                       document.documentElement?.getAttribute("data-kiki-theme") === "dark" ||
                       window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
        const wave = isDark ? WAVE_DARK : WAVE_LIGHT;
        document.documentElement.style.setProperty("--kiki-phrase-wave", wave);
      } catch {}
    }

    function onPhraseEnter(e) {
      const p = e.currentTarget?.getAttribute("data-kiki-phrase");
      if (p) {
        document.querySelectorAll(`[data-kiki-phrase="${CSS.escape(p)}"]`).forEach(item => {
          item.classList.add("kiki-phrase-hover");
        });
      }
    }

    function onPhraseLeave() {
      document.querySelectorAll(".kiki-phrase-hover").forEach(item => {
        item.classList.remove("kiki-phrase-hover");
      });
    }

    // Continuous enforcer: runs in < 0.05ms, firmly restoring phrase marks on any React re-render
    function enforcePhraseMarks() {
      if (wordMetaMap.size === 0) return;
      for (const [id, meta] of wordMetaMap.entries()) {
        const el = document.getElementById(id) || (meta.el && meta.el.isConnected ? meta.el : null);
        if (!el) continue;
        if (!el.classList.contains("kiki-phrase-word")) {
          el.classList.add("kiki-phrase-word");
        }
        if (meta.isLast) {
          if (!el.classList.contains("kiki-phrase-last")) el.classList.add("kiki-phrase-last");
        } else {
          if (el.classList.contains("kiki-phrase-last")) el.classList.remove("kiki-phrase-last");
        }
        if (el.getAttribute("data-kiki-phrase") !== meta.phrase) {
          el.setAttribute("data-kiki-phrase", meta.phrase);
          el.setAttribute("title", `✦ Phrase: ${meta.phrase}`);
        }
        if (!el.__kikiPhraseBound) {
          el.__kikiPhraseBound = true;
          el.addEventListener("pointerenter", onPhraseEnter, { passive: true });
          el.addEventListener("pointerleave", onPhraseLeave, { passive: true });
        }
      }
    }

    async function checkPhraseInDict(phraseText) {
      const lower = phraseText.toLowerCase().trim();
      if (phraseCache.has(lower)) return phraseCache.get(lower);

      if (!window.localSearch || typeof window.localSearch.search !== "function") {
        return false;
      }

      try {
        const res = await window.localSearch.search(phraseText);
        const hasMatch = Array.isArray(res) && res.some(r => {
          const rTerm = (r.term || "").toLowerCase().trim();
          const rExpr = (r.expression || "").toLowerCase().trim();
          return rTerm === lower || rExpr === lower;
        });
        phraseCache.set(lower, hasMatch);
        return hasMatch;
      } catch {
        return false;
      }
    }

    async function scanLingQPhrases() {
      if (isScanning) {
        scanPending = true;
        return;
      }
      isScanning = true;
      scanPending = false;

      try {
        injectPhraseStyles();
        updateThemeColor();

        const sentences = Array.from(document.querySelectorAll(".sentence"));
        if (!sentences.length) {
          enforcePhraseMarks();
          return;
        }

        // Fingerprint reader content
        const currentFingerprint = sentences.map(s => s.id + ":" + s.textContent.trim()).join("|");
        if (currentFingerprint === lastScannedFingerprint) {
          // Content unchanged: synchronously enforce existing phrase marks
          enforcePhraseMarks();
          return;
        }

        const candidateMap = new Map();

        sentences.forEach(s => {
          const words = Array.from(s.querySelectorAll(".sentence-item"));
          if (words.length < 2) return;

          // Break words into contiguous segments unbroken by terminal punctuation
          const segments = [];
          let currentSegment = [words[0]];

          for (let i = 0; i < words.length - 1; i++) {
            const w1 = words[i];
            const w2 = words[i + 1];
            let hasDelim = false;
            let curr = w1.nextSibling;
            while (curr && curr !== w2) {
              const txt = curr.textContent || "";
              if (/[.!?;\n\r]/.test(txt)) {
                hasDelim = true;
                break;
              }
              curr = curr.nextSibling;
            }
            if (hasDelim) {
              if (currentSegment.length >= 2) segments.push(currentSegment);
              currentSegment = [w2];
            } else {
              currentSegment.push(w2);
            }
          }
          if (currentSegment.length >= 2) segments.push(currentSegment);

          // Generate candidate n-grams (length 5 down to 2)
          segments.forEach(seg => {
            const N = seg.length;
            for (let len = Math.min(5, N); len >= 2; len--) {
              for (let start = 0; start <= N - len; start++) {
                const sliceEls = seg.slice(start, start + len);
                const phrase = sliceEls.map(el => (el.textContent || "").trim()).join(" ").toLowerCase();
                if (phrase.length >= 3 && !/^[0-9\s.,'"`-]+$/.test(phrase)) {
                  if (!candidateMap.has(phrase)) candidateMap.set(phrase, []);
                  candidateMap.get(phrase).push({
                    sentence: s,
                    startIdx: start,
                    endIdx: start + len - 1,
                    len,
                    els: sliceEls
                  });
                }
              }
            }
          });
        });

        // Batch query un-cached candidates
        const uniquePhrases = Array.from(candidateMap.keys());
        const toQuery = uniquePhrases.filter(p => !phraseCache.has(p));
        if (toQuery.length > 0) {
          const promises = toQuery.map(p => checkPhraseInDict(p));
          await Promise.all(promises);
        }

        // Collect matches
        const matches = [];
        uniquePhrases.forEach(p => {
          if (phraseCache.get(p)) {
            const occs = candidateMap.get(p) || [];
            occs.forEach(occ => {
              matches.push({ phrase: p, ...occ });
            });
          }
        });

        // Sort matches by length (descending) to prefer longer phrases greedily
        matches.sort((a, b) => b.len - a.len);

        const usedWords = new Set();
        const finalMatches = [];

        matches.forEach(m => {
          const conflict = m.els.some(el => usedWords.has(el));
          if (!conflict) {
            m.els.forEach(el => usedWords.add(el));
            finalMatches.push(m);
          }
        });

        // Reset and populate wordMetaMap
        wordMetaMap.clear();
        let fallbackIdCounter = 0;

        finalMatches.forEach(m => {
          const totalEls = m.els.length;
          m.els.forEach((el, idx) => {
            let id = el.id;
            if (!id) {
              id = "kiki-w-" + (++fallbackIdCounter);
              el.id = id;
            }
            const isLast = (idx === totalEls - 1);
            wordMetaMap.set(id, {
              phrase: m.phrase,
              isLast,
              el
            });
          });
        });

        // Lock in phrase marks immediately
        enforcePhraseMarks();

        lastScannedFingerprint = currentFingerprint;
      } catch (err) {
        console.warn("[Kiki] LingQ phrase scan error:", err);
      } finally {
        isScanning = false;
        if (scanPending) {
          scanPending = false;
          scheduleScan();
        }
      }
    }

    let scanTimer = null;
    function scheduleScan(delay = 180) {
      clearTimeout(scanTimer);
      scanTimer = setTimeout(scanLingQPhrases, delay);
    }

    // 1. Observe reader container and DOM mutations for non-refresh SPA page turns
    const observer = new MutationObserver((mutations) => {
      // Synchronously lock phrase marks onto DOM elements
      enforcePhraseMarks();

      let shouldRescan = false;
      for (const m of mutations) {
        if (m.type === "childList" && (m.addedNodes.length > 0 || m.removedNodes.length > 0)) {
          shouldRescan = true;
          break;
        }
      }
      if (shouldRescan) scheduleScan(120);
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });

    // 2. Navigation & keyboard listeners for page turning
    window.addEventListener("popstate", () => scheduleScan(200));
    window.addEventListener("keydown", (e) => {
      if (["ArrowRight", "ArrowLeft", "PageDown", "PageUp", "Space"].includes(e.key)) {
        scheduleScan(300);
      }
    }, { capture: true, passive: true });

    // 3. Theme change listener
    window.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener?.("change", updateThemeColor);

    // Initial scan with retry until localSearch is ready
    let initRetries = 0;
    function tryInitialScan() {
      if (window.localSearch && typeof window.localSearch.search === "function") {
        scheduleScan(100);
      } else if (initRetries < 25) {
        initRetries++;
        setTimeout(tryInitialScan, 300);
      }
    }
    tryInitialScan();
  }

  // Auto-initialize LingQ phrase scanner if on lingq.com
  if (window.location.hostname.includes("lingq.com")) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initLingQPhraseScanner, { once: true });
    } else {
      initLingQPhraseScanner();
    }
  }

  console.log('[Kiki Immersion] Web Universal Lookup Module Loaded (Trigger: ' + getTriggerKey() + '+Click)');
})();
