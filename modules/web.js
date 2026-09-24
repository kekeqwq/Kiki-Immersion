// =============================================================
// Kiki Immersion - Web Universal Lookup Module
// Version: 1.3.2
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
  window.addEventListener("pointerup", suppressIfModifier, { capture: true, passive: false });
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
