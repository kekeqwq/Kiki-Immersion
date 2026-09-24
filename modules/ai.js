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
          <div style="display: flex; align-items: center; gap: 4px;">
            <button type="button" class="kiki-card-settings-btn" title="Settings (Dictionaries, AI, Modifiers)" style="background: transparent; border: none; color: #BBB; font-size: 16px; cursor: pointer; line-height: 1; padding: 0 4px;">⚙</button>
            <button type="button" class="kiki-card-close-btn" style="background: transparent; border: none; color: #BBB; font-size: 22px; cursor: pointer; line-height: 1; padding: 0 4px;">&times;</button>
          </div>
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

    card.querySelector(".kiki-card-settings-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      showSettingsModal("ai");
    });

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

