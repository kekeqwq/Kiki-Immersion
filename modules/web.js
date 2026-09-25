// =============================================================
// Kiki Immersion - Web Universal Lookup Module
// Version: 1.3.3
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

    const caret = getCaretPoint(e.clientX, e.clientY);
    if (!caret || !caret.node) return;

    const resolved = await resolveTargetWordAndContext(caret.node, caret.offset);
    if (!resolved || !resolved.term) return;

    // DO NOT preventDefault or stopPropagation on word clicks!
    // This allows the website's native click handlers (e.g. LingQ's sidebar, reader controls)
    // to execute concurrently without being blocked by Kiki.
    if (mode !== "none" && e.ctrlKey) {
      if (e.cancelable) e.preventDefault();
    }

    lastTriggerTime = now;

    // Visual selection feedback (apply only in modifier mode so we do not clear reader focus outlines)
    try {
      const sel = window.getSelection();
      if (sel && resolved.range && mode !== "none") {
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
      showYomitanCard(null, resolved.term, { x: e.clientX, y: e.clientY }, resolved.sentence, "web", resolved.paragraph);
    }
  }

  function suppressIfModifier(e) {
    const mode = getTriggerKey();
    if (mode === "none") return;

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

  console.log('[Kiki Immersion] Web Universal Lookup Module Loaded (Trigger: ' + getTriggerKey() + '+Click)');
})();
