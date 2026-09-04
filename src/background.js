const DEFAULTS_LOCAL = {
  aiEnabled: false,
  aiTested: false,
  apiBase: "https://api.openai.com/v1",
  apiKey: "",
  apiModel: "gpt-4o-mini",
  aiLang: "zh",
  promptZh: "你是简洁的语言老师。学习者在字幕「{{sentence}}」里点了「{{word}}」。若该词像语音识别错误或网络新词，先猜测本意。用通顺中文解释它在本句中的意思，2–4 句。必要时注明词性。不要整句逐字翻译。",
  promptEn: "You are a concise language tutor. The learner tapped \"{{word}}\" in this subtitle: \"{{sentence}}\". If it looks like a speech-to-text error or internet slang, infer the intended word. Explain the meaning in simple English in 2-4 short sentences. Mention part of speech if clear. Do not translate the whole line unless needed for sense."
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
  if (!/\/v1$/.test(b) && !b.includes("/v1/")) {
    /* allow full custom roots */
  }
  return b;
}

async function chat({ base, key, model, system, user }) {
  const root = normalizeBase(base);
  const url = root.endsWith("/chat/completions") ? root : root + "/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + key
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    })
  });
  const text = await res.text();
  if (!res.ok) throw new Error("HTTP " + res.status + " " + text.slice(0, 240));
  const json = JSON.parse(text);
  const out = json.choices?.[0]?.message?.content;
  if (!out) throw new Error("empty model response");
  return out.trim();
}

chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  if (!msg || !msg.type) return;
  if (msg.type === "kiki-ai-test" || msg.type === "kiki-ai-explain") {
    (async () => {
      const cfg = await chrome.storage.local.get(null);
      const key = cfg.apiKey;
      const model = cfg.apiModel;
      const base = cfg.apiBase;
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
