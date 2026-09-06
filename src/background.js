const DEFAULTS_LOCAL = {
  aiEnabled: false,
  aiTested: false,
  apiBase: "https://api.openai.com/v1",
  apiKey: "",
  apiModel: "gpt-4o-mini",
  aiLang: "zh",
  promptZh: "你是简洁的语言老师。学习者在字幕「{{sentence}}」里点了「{{word}}」。若该词像语音识别错误或网络新词，先猜测本意。用通顺中文解释它在本句中的意思，2–4 句。必要时注明词性。不要整句逐字翻译。直接给出释义，切勿客套寒暄。",
  promptEn: "You are a concise language tutor. The learner tapped \"{{word}}\" in this subtitle: \"{{sentence}}\". If it looks like a speech-to-text error or internet slang, infer the intended word. Explain the meaning in simple English in 2-4 short sentences. Mention part of speech if clear. Do not translate the whole line unless needed for sense. Give the explanation directly without greetings."
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(null, (cur) => {
    chrome.storage.sync.set({
      enabled: cur.enabled !== false,
      fontSize: cur.fontSize || 28,
      hideNativeCaptions: cur.hideNativeCaptions !== false
    });
  });
  chrome.storage.local.get(null, (cur) => {
    chrome.storage.local.set({ ...DEFAULTS_LOCAL, ...cur });
  });
});

function normalizeBase(base) {
  let b = (base || "").trim().replace(/\/+$/, "");
  if (!b) b = "https://api.openai.com/v1";
  return b;
}

async function streamChat({ base, key, model, system, user, signal, onChunk }) {
  const root = normalizeBase(base);
  const url = root.endsWith("/chat/completions") ? root : root + "/chat/completions";

  const body = {
    model,
    stream: true,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  };

  const isReasoning = /^o[13]/.test(model);
  if (isReasoning) {
    body.max_completion_tokens = 250;
    try { body.reasoning_effort = "low"; } catch {}
  } else {
    body.temperature = 0.3;
    body.max_tokens = 250;
  }

  let firstChunk = false;
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      if (!firstChunk) {
        reject(new Error("Request timed out (7s)"));
      }
    }, 7000);
  });

  const fetchPromise = (async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + key
      },
      body: JSON.stringify(body),
      signal
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error("HTTP " + res.status + " " + errText.slice(0, 240));
    }

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("text/event-stream") && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (!firstChunk) {
          firstChunk = true;
          clearTimeout(timer);
        }

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || line.startsWith(":")) continue;
          if (line === "data: [DONE]") return;
          if (line.startsWith("data:")) {
            const jsonStr = line.slice(5).trim();
            try {
              const json = JSON.parse(jsonStr);
              const delta = json.choices?.[0]?.delta;
              const content = delta?.content;
              if (content) {
                onChunk(content, false);
              } else if (delta?.reasoning_content && !firstChunk) {
                onChunk("", true);
              }
            } catch {}
          }
        }
      }

      if (buf.trim().startsWith("data:") && buf.trim() !== "data: [DONE]") {
        try {
          const json = JSON.parse(buf.trim().slice(5).trim());
          const content = json.choices?.[0]?.delta?.content;
          if (content) onChunk(content, false);
        } catch {}
      }
    } else {
      firstChunk = true;
      clearTimeout(timer);
      const text = await res.text();
      const json = JSON.parse(text);
      const out = json.choices?.[0]?.message?.content;
      if (!out) throw new Error("empty model response");
      onChunk(out, false);
    }
  })();

  try {
    await Promise.race([fetchPromise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

async function chat({ base, key, model, system, user }) {
  const root = normalizeBase(base);
  const url = root.endsWith("/chat/completions") ? root : root + "/chat/completions";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const isReasoning = /^o[13]/.test(model);
    const body = {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    };
    if (isReasoning) {
      body.max_completion_tokens = 250;
    } else {
      body.temperature = 0.3;
      body.max_tokens = 250;
    }
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + key
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await res.text();
    if (!res.ok) throw new Error("HTTP " + res.status + " " + text.slice(0, 240));
    const json = JSON.parse(text);
    const out = json.choices?.[0]?.message?.content;
    if (!out) throw new Error("empty model response");
    return out.trim();
  } finally {
    clearTimeout(timer);
  }
}

function firstConfigured(cfg) {
  if (Array.isArray(cfg.providers)) {
    for (const p of cfg.providers) {
      const models = (p.models || []).map((m) => String(m || "").trim()).filter(Boolean);
      if (p.base && p.key && models[0]) return { base: p.base, key: p.key, model: models[0] };
    }
  }
  if (cfg.apiBase && cfg.apiKey && cfg.apiModel) {
    return { base: cfg.apiBase, key: cfg.apiKey, model: cfg.apiModel };
  }
  return null;
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "kiki-ai-stream") return;
  let abortCtrl = null;

  port.onDisconnect.addListener(() => {
    if (abortCtrl) {
      abortCtrl.abort();
      abortCtrl = null;
    }
  });

  port.onMessage.addListener(async (msg) => {
    if (!msg) return;
    if (msg.type === "abort") {
      if (abortCtrl) {
        abortCtrl.abort();
        abortCtrl = null;
      }
      return;
    }
    if (msg.type === "start") {
      if (abortCtrl) abortCtrl.abort();
      abortCtrl = new AbortController();
      const curCtrl = abortCtrl;
      try {
        const { base, key, model, word, sentence, lang, promptZh, promptEn } = msg;
        const isEn = lang === "en";
        const tmpl = isEn ? promptEn : promptZh;
        const system = String(tmpl || DEFAULTS_LOCAL[isEn ? "promptEn" : "promptZh"])
          .replaceAll("{{word}}", word || "")
          .replaceAll("{{sentence}}", sentence || "");
        const user = isEn
          ? `Word: ${word}\nSubtitle: ${sentence}`
          : `词：${word}\n字幕：${sentence}`;

        await streamChat({
          base,
          key,
          model,
          system,
          user,
          signal: curCtrl.signal,
          onChunk: (text, thinking) => {
            if (curCtrl.signal.aborted) return;
            port.postMessage({ type: "chunk", text, thinking: !!thinking });
          }
        });
        if (!curCtrl.signal.aborted) {
          port.postMessage({ type: "done" });
        }
      } catch (err) {
        if (!curCtrl.signal.aborted) {
          port.postMessage({ type: "error", error: String(err.message || err) });
        }
      } finally {
        if (abortCtrl === curCtrl) abortCtrl = null;
      }
    }
  });
});

chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  if (!msg || !msg.type) return;
  if (msg.type === "kiki-clear-cache") {
    chrome.storage.local.remove("aiCache", () => void chrome.runtime.lastError);
    chrome.tabs.query({ url: ["https://www.youtube.com/*", "https://youtube.com/*", "https://m.youtube.com/*"] }, (tabs) => {
      for (const tab of tabs) chrome.tabs.sendMessage(tab.id, { type: "kiki-clear-cache" }, () => void chrome.runtime.lastError);
      send({ ok: true });
    });
    return true;
  }
  if (msg.type === "kiki-ai-test" || msg.type === "kiki-ai-try" || msg.type === "kiki-ai-explain") {
    (async () => {
      const cfg = await chrome.storage.local.get(null);
      let key = msg.key || cfg.apiKey;
      let model = msg.model || cfg.apiModel;
      let base = msg.base || cfg.apiBase;
      if (msg.type === "kiki-ai-test") {
        const first = firstConfigured(cfg);
        if (!first) throw new Error("missing key or model");
        key = first.key; model = first.model; base = first.base;
      }
      if (!key || !model) throw new Error("missing key or model");
      if (msg.type === "kiki-ai-test") {
        const out = await chat({
          base,
          key,
          model,
          system: "Reply with exactly: OK",
          user: "ping"
        });
        await chrome.storage.local.set({ aiTested: true });
        send({ ok: true, text: out });
        return;
      }
      const lang = cfg.aiLang === "en" ? "en" : "zh";
      const tmpl = lang === "en" ? cfg.promptEn : cfg.promptZh;
      const system = String(tmpl || DEFAULTS_LOCAL[lang === "en" ? "promptEn" : "promptZh"])
        .replaceAll("{{word}}", msg.word || "")
        .replaceAll("{{sentence}}", msg.sentence || "");
      const user = lang === "en"
        ? `Word: ${msg.word}\nSubtitle: ${msg.sentence}`
        : `词：${msg.word}\n字幕：${msg.sentence}`;
      const out = await chat({ base, key, model, system, user });
      send({ ok: true, text: out });
    })().catch((e) => send({ ok: false, error: String(e.message || e) }));
    return true;
  }
});
