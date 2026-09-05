const FALLBACK = [
  "Georgia","Palatino Linotype","Palatino","Iowan Old Style","Times New Roman","Times",
  "Songti SC","STSong","Noto Serif SC","Source Han Serif SC","PingFang SC",
  "Hiragino Mincho ProN","Yu Mincho","MS Mincho","Malgun Gothic",
  "Segoe UI","Calibri","Cambria","Arial","Helvetica","Tahoma","Verdana",
  "Trebuchet MS","Courier New","Consolas","serif","sans-serif","monospace"
];
const sel = document.getElementById("fontFamily");
const preview = document.getElementById("preview");
function fillSelect(names, current) {
  const uniq = [...new Set(names.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  sel.innerHTML = "";
  for (const name of uniq) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    opt.style.fontFamily = name;
    sel.appendChild(opt);
  }
  if (current) {
    if (![...sel.options].some((o) => o.value === current)) {
      const opt = document.createElement("option");
      opt.value = current;
      opt.textContent = current;
      sel.appendChild(opt);
    }
    sel.value = current;
  }
  preview.style.fontFamily = sel.value;
}
async function scanLocal() {
  if (!("queryLocalFonts" in window)) {
    alert("This Chrome build has no local font API. Using the common list.");
    return;
  }
  try {
    const fonts = await window.queryLocalFonts();
    fillSelect([...FALLBACK, ...fonts.map((f) => f.family)], sel.value);
  } catch (e) {
    alert("Could not read local fonts: " + e);
  }
}
const PROMPT_ZH = "你是简洁的语言老师。学习者在字幕「{{sentence}}」里点了「{{word}}」。若该词像语音识别错误或网络新词，先猜测本意。用通顺中文解释它在本句中的意思，2–4 句。必要时注明词性。不要整句逐字翻译。";
const PROMPT_EN = "You are a concise language tutor. The learner tapped \"{{word}}\" in this subtitle: \"{{sentence}}\". If it looks like a speech-to-text error or internet slang, infer the intended word. Explain the meaning in simple English in 2-4 short sentences. Mention part of speech if clear. Do not translate the whole line unless needed for sense.";

function setAiSwitch(tested, enabled) {
  const box = document.getElementById("aiEnabled");
  box.disabled = !tested;
  box.checked = !!(tested && enabled);
}

function emptyProviders() {
  return [0, 1, 2].map(() => ({ base: "", key: "", models: ["", "", "", "", ""] }));
}

function fillProviders(s) {
  let list = emptyProviders();
  if (Array.isArray(s.providers) && s.providers.length) {
    s.providers.slice(0, 3).forEach((p, i) => {
      list[i].base = p.base || "";
      list[i].key = p.key || "";
      (p.models || []).slice(0, 5).forEach((m, j) => { list[i].models[j] = m || ""; });
    });
  } else {
    list[0].base = s.apiBase || "https://api.openai.com/v1";
    list[0].key = s.apiKey || "";
    list[0].models[0] = s.apiModel || "";
  }
  const host = document.getElementById("providers");
  host.innerHTML = "";
  list.forEach((p, i) => {
    const wrap = document.createElement("div");
    wrap.style.borderTop = i ? "1px solid #141413" : "none";
    wrap.style.paddingTop = i ? "0.8rem" : "0";
    wrap.style.marginTop = i ? "0.8rem" : "0";
    wrap.innerHTML = `
      <label class="field">Provider ${i + 1} base URL</label>
      <input class="p-base" type="text" placeholder="${i ? "optional" : "https://api.openai.com/v1"}" />
      <label class="field">Provider ${i + 1} API key</label>
      <input class="p-key" type="password" />
      ${[0,1,2,3,4].map((j) => `<label class="field">Model ${j + 1}</label><input class="p-model" data-i="${j}" type="text" placeholder="${j ? "optional" : "gpt-4o-mini / grok-3"}" />`).join("")}
    `;
    wrap.querySelector(".p-base").value = p.base;
    wrap.querySelector(".p-key").value = p.key;
    wrap.querySelectorAll(".p-model").forEach((el, j) => { el.value = p.models[j] || ""; });
    host.appendChild(wrap);
  });
}

function readProviders() {
  return [...document.querySelectorAll("#providers > div")].map((wrap) => ({
    base: wrap.querySelector(".p-base").value.trim(),
    key: wrap.querySelector(".p-key").value.trim(),
    models: [...wrap.querySelectorAll(".p-model")].map((el) => el.value.trim())
  }));
}

function hexish(v, fallback) {
  const s = String(v || "").trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s) ? s : fallback;
}

function paintPreview() {
  const color = hexish(document.getElementById("captionColor").value, "#141413");
  const bg = hexish(document.getElementById("captionBg").value, "#EFEBE3");
  const a = Number(document.getElementById("captionBgAlpha").value);
  document.getElementById("alphaLabel").textContent = a + "%";
  preview.style.fontFamily = sel.value;
  preview.style.fontSize = (document.getElementById("fontSize").value || 28) + "px";
  preview.style.color = color;
  preview.style.background = colorMix(bg, a);
}

function colorMix(hex, alpha) {
  const h = hexish(hex, "#EFEBE3").slice(1);
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${(alpha || 0) / 100})`;
}

function bindColor(textId, pickId) {
  const text = document.getElementById(textId);
  const pick = document.getElementById(pickId);
  const syncPick = () => {
    const v = hexish(text.value, pick.value || "#000000");
    if (v.length === 4) {
      pick.value = "#" + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
    } else pick.value = v;
  };
  text.addEventListener("input", () => { syncPick(); paintPreview(); });
  pick.addEventListener("input", () => { text.value = pick.value; paintPreview(); });
  return syncPick;
}

const syncColorPick = bindColor("captionColor", "captionColorPick");
const syncBgPick = bindColor("captionBg", "captionBgPick");

function load() {
  chrome.storage.sync.get(null, (s) => {
    document.getElementById("enabled").checked = s.enabled !== false;
    document.getElementById("hideNativeCaptions").checked = s.hideNativeCaptions !== false;
    document.getElementById("fontSize").value = s.fontSize || 28;
    document.getElementById("captionColor").value = s.captionColor || "#141413";
    document.getElementById("captionBg").value = s.captionBg || "#EFEBE3";
    document.getElementById("captionBgAlpha").value = s.captionBgAlpha != null ? s.captionBgAlpha : 86;
    fillSelect(FALLBACK, s.fontFamily || "Georgia");
    syncColorPick();
    syncBgPick();
    paintPreview();
  });
  chrome.storage.local.get(null, (s) => {
    fillProviders(s);
    document.getElementById("aiLang").value = s.aiLang || "zh";
    document.getElementById("promptZh").value = s.promptZh || PROMPT_ZH;
    document.getElementById("promptEn").value = s.promptEn || PROMPT_EN;
    setAiSwitch(!!s.aiTested, !!s.aiEnabled);
    document.getElementById("aiStatus").textContent = s.aiTested ? "tested" : "";
  });
}
sel.addEventListener("change", paintPreview);
document.getElementById("fontSize").addEventListener("input", paintPreview);
document.getElementById("captionBgAlpha").addEventListener("input", paintPreview);
document.getElementById("scanFonts").addEventListener("click", scanLocal);
document.getElementById("save").addEventListener("click", () => {
  chrome.storage.sync.set({
    enabled: document.getElementById("enabled").checked,
    hideNativeCaptions: document.getElementById("hideNativeCaptions").checked,
    fontSize: Number(document.getElementById("fontSize").value) || 28,
    fontFamily: sel.value,
    captionColor: hexish(document.getElementById("captionColor").value, "#141413"),
    captionBg: hexish(document.getElementById("captionBg").value, "#EFEBE3"),
    captionBgAlpha: Number(document.getElementById("captionBgAlpha").value)
  });
  chrome.storage.local.get(["aiTested"], (s) => {
    const providers = readProviders();
    chrome.storage.local.set({
      providers,
      apiBase: providers[0]?.base || "",
      apiKey: providers[0]?.key || "",
      apiModel: providers[0]?.models?.[0] || "",
      aiLang: document.getElementById("aiLang").value,
      promptZh: document.getElementById("promptZh").value,
      promptEn: document.getElementById("promptEn").value,
      aiEnabled: s.aiTested && document.getElementById("aiEnabled").checked
    }, () => {
      document.getElementById("save").textContent = "Saved";
      setTimeout(() => (document.getElementById("save").textContent = "Save"), 800);
    });
  });
});

document.getElementById("aiTest").addEventListener("click", async () => {
  const status = document.getElementById("aiStatus");
  status.textContent = "testing…";
  const providers = readProviders();
  try {
    if (chrome.permissions && chrome.permissions.request) {
      await chrome.permissions.request({ origins: ["https://*/*", "http://127.0.0.1/*"] });
    }
  } catch {}
  chrome.storage.local.set({
    providers,
    apiBase: providers[0]?.base || "",
    apiKey: providers[0]?.key || "",
    apiModel: providers[0]?.models?.[0] || "",
    aiLang: document.getElementById("aiLang").value,
    promptZh: document.getElementById("promptZh").value,
    promptEn: document.getElementById("promptEn").value
  }, () => {
    chrome.runtime.sendMessage({ type: "kiki-ai-test" }, (res) => {
      if (chrome.runtime.lastError) {
        status.textContent = chrome.runtime.lastError.message;
        setAiSwitch(false, false);
        return;
      }
      if (!res || !res.ok) {
        status.textContent = res?.error || "failed";
        chrome.storage.local.set({ aiTested: false, aiEnabled: false });
        setAiSwitch(false, false);
        return;
      }
      status.textContent = "ok — fallback available";
      setAiSwitch(true, true);
      chrome.storage.local.set({ aiTested: true, aiEnabled: true });
    });
  });
});

function collectConfig(cb) {
  chrome.storage.local.get(null, (local) => {
    cb({
      kiki: 1,
      enabled: document.getElementById("enabled").checked,
      hideNativeCaptions: document.getElementById("hideNativeCaptions").checked,
      fontSize: Number(document.getElementById("fontSize").value) || 28,
      fontFamily: sel.value,
      captionColor: hexish(document.getElementById("captionColor").value, "#141413"),
      captionBg: hexish(document.getElementById("captionBg").value, "#EFEBE3"),
      captionBgAlpha: Number(document.getElementById("captionBgAlpha").value),
      providers: readProviders(),
      apiBase: (readProviders()[0] || {}).base || "",
      apiKey: (readProviders()[0] || {}).key || "",
      apiModel: ((readProviders()[0] || {}).models || [])[0] || "",
      aiLang: document.getElementById("aiLang").value,
      promptZh: document.getElementById("promptZh").value,
      promptEn: document.getElementById("promptEn").value,
      aiEnabled: document.getElementById("aiEnabled").checked,
      aiTested: !!local.aiTested
    });
  });
}
document.getElementById("clearCache").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "kiki-clear-cache" }, () => {
    document.getElementById("clearCache").textContent = "Cleared";
    setTimeout(() => (document.getElementById("clearCache").textContent = "Clear caption cache"), 900);
  });
});
document.getElementById("exportCfg").addEventListener("click", () => {
  collectConfig((cfg) => {
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "kiki-immersion.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });
});
document.getElementById("importCfg").addEventListener("click", () => {
  document.getElementById("importFile").click();
});
document.getElementById("importFile").addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const cfg = JSON.parse(String(reader.result));
      document.getElementById("enabled").checked = cfg.enabled !== false;
      document.getElementById("hideNativeCaptions").checked = cfg.hideNativeCaptions !== false;
      document.getElementById("fontSize").value = cfg.fontSize || 28;
      if (cfg.fontFamily) fillSelect([...FALLBACK, cfg.fontFamily], cfg.fontFamily);
      document.getElementById("captionColor").value = cfg.captionColor || "#141413";
      document.getElementById("captionBg").value = cfg.captionBg || "#EFEBE3";
      document.getElementById("captionBgAlpha").value = cfg.captionBgAlpha != null ? cfg.captionBgAlpha : 86;
      syncColorPick();
      syncBgPick();
      paintPreview();
      fillProviders(cfg);
      document.getElementById("aiLang").value = cfg.aiLang || "zh";
      if (cfg.promptZh) document.getElementById("promptZh").value = cfg.promptZh;
      if (cfg.promptEn) document.getElementById("promptEn").value = cfg.promptEn;
      chrome.storage.sync.set({
        enabled: cfg.enabled !== false,
        hideNativeCaptions: cfg.hideNativeCaptions !== false,
        fontSize: Number(cfg.fontSize) || 28,
        fontFamily: cfg.fontFamily || sel.value,
        captionColor: hexish(cfg.captionColor, "#141413"),
        captionBg: hexish(cfg.captionBg, "#EFEBE3"),
        captionBgAlpha: Number(cfg.captionBgAlpha != null ? cfg.captionBgAlpha : 86)
      });
      chrome.storage.local.set({
        providers: cfg.providers || readProviders(),
        apiBase: cfg.apiBase || (cfg.providers && cfg.providers[0] && cfg.providers[0].base) || "",
        apiKey: cfg.apiKey || (cfg.providers && cfg.providers[0] && cfg.providers[0].key) || "",
        apiModel: cfg.apiModel || (cfg.providers && cfg.providers[0] && cfg.providers[0].models && cfg.providers[0].models[0]) || "",
        aiLang: cfg.aiLang || "zh",
        promptZh: cfg.promptZh || PROMPT_ZH,
        promptEn: cfg.promptEn || PROMPT_EN,
        aiTested: !!cfg.aiTested,
        aiEnabled: !!(cfg.aiTested && cfg.aiEnabled)
      }, () => {
        setAiSwitch(!!cfg.aiTested, !!(cfg.aiTested && cfg.aiEnabled));
        document.getElementById("aiStatus").textContent = "imported";
      });
    } catch (err) {
      alert("Invalid config: " + err);
    }
  };
  reader.readAsText(file);
});

load();
