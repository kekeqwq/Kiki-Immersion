const el = document.getElementById("enabled");
chrome.storage.sync.get("enabled", (s) => {
  el.checked = s.enabled !== false;
});
el.addEventListener("change", () => {
  chrome.storage.sync.set({ enabled: el.checked });
});
