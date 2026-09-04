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

function load() {
  chrome.storage.sync.get(null, (s) => {
    document.getElementById("enabled").checked = s.enabled !== false;
    document.getElementById("hideNativeCaptions").checked = s.hideNativeCaptions !== false;
    document.getElementById("fontSize").value = s.fontSize || 28;
    fillSelect(FALLBACK, s.fontFamily || "Georgia");
    preview.style.fontSize = (s.fontSize || 28) + "px";
  });
  chrome.storage.local.get(null, (s) => {
    document.getElementById("apiBase").value = s.apiBase || "https://api.openai.com/v1";
    document.getElementById("apiKey").value = s.apiKey || "";
    document.getElementById("apiModel").value = s.apiModel || "gpt-4o-mini";
    document.getElementById("aiLang").value = s.aiLang || "zh";
    document.getElementById("promptZh").value = s.promptZh || PROMPT_ZH;
    document.getElementById("promptEn").value = s.promptEn || PROMPT_EN;
    setAiSwitch(!!s.aiTested, !!s.aiEnabled);
    document.getElementById("aiStatus").textContent = s.aiTested ? "tested" : "";
  });
}
sel.addEventListener("change", () => { preview.style.fontFamily = sel.value; });
document.getElementById("fontSize").addEventListener("input", () => {
  preview.style.fontSize = document.getElementById("fontSize").value + "px";
});
document.getElementById("scanFonts").addEventListener("click", scanLocal);
document.getElementById("save").addEventListener("click", () => {
  chrome.storage.sync.set({
    enabled: document.getElementById("enabled").checked,
    hideNativeCaptions: document.getElementById("hideNativeCaptions").checked,
    fontSize: Number(document.getElementById("fontSize").value) || 28,
    fontFamily: sel.value
  });
  chrome.storage.local.get(["aiTested"], (s) => {
    chrome.storage.local.set({
      apiBase: document.getElementById("apiBase").value.trim(),
      apiKey: document.getElementById("apiKey").value.trim(),
      apiModel: document.getElementById("apiModel").value.trim(),
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
  const base = document.getElementById("apiBase").value.trim();
  try {
    if (chrome.permissions && chrome.permissions.request) {
      await chrome.permissions.request({ origins: ["https://*/*", "http://127.0.0.1/*"] });
    }
  } catch {}
  chrome.storage.local.set({
    apiBase: base,
    apiKey: document.getElementById("apiKey").value.trim(),
    apiModel: document.getElementById("apiModel").value.trim(),
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

load();
