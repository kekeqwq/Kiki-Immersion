import os

MODULE_ORDER = ['core', 'yomitan', 'ai', 'ui', 'youtube']

header = """// ==UserScript==
// @name         Kiki Immersion
// @namespace    https://github.com/kekeqwq/Kiki-Immersion
// @version      1.2.7
// @description  Bilingual and interactive Japanese/English subtitles with Yomitan word lookup, offline dict caching, and touch/mouse gestures.
// @author       keke
// @match        *://*.youtube.com/*
// @match        *://youtube.com/*
// @include      *://*.youtube.com/*
// @include      *://youtube.com/*
// @run-at       document-start
// @grant        none
// @inject-into  page
// @updateURL    https://raw.githubusercontent.com/kekeqwq/Kiki-Immersion/main/dist/kiki-immersion.user.js
// @downloadURL  https://raw.githubusercontent.com/kekeqwq/Kiki-Immersion/main/dist/kiki-immersion.user.js
// ==/UserScript==

(() => {
  'use strict';

  // -------------------------------------------------------------
  // 1. Force Desktop YouTube & Early Native Lockout
  // -------------------------------------------------------------
  try {
    document.cookie = "PREF=f6=40000000&f5=30000&app=desktop; domain=.youtube.com; path=/; max-age=31536000; SameSite=Lax";
  } catch (e) {}

  if (location.hostname === 'm.youtube.com' || location.host.includes('m.youtube.com')) {
    const targetUrl = new URL(location.href);
    targetUrl.hostname = 'www.youtube.com';
    targetUrl.searchParams.set('app', 'desktop');
    targetUrl.searchParams.set('persist_app', '1');
    location.replace(targetUrl.toString());
    return;
  }

  try {
    Object.defineProperty(navigator, 'platform', { get: () => "MacIntel" });
  } catch (e) {}

  if (document.documentElement) {
    document.documentElement.classList.add("kiki-lock-chrome");
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      document.documentElement.classList.add("kiki-lock-chrome");
    }, { once: true });
  }
"""

footer = """
})();
"""

parts = [header]
for mod in MODULE_ORDER:
    path = f"modules/{mod}.js"
    with open(path) as f:
        parts.append(f"\n// >>> BEGIN MODULE: {mod} <<<\n")
        parts.append(f.read())
        parts.append(f"\n// >>> END MODULE: {mod} <<<\n")

parts.append(footer)
bundle_code = "\n".join(parts)

os.makedirs("dist", exist_ok=True)
with open("dist/kiki-immersion.user.js", "w") as f:
    f.write(bundle_code)

os.makedirs("userscript", exist_ok=True)
with open("userscript/kiki-immersion.user.js", "w") as f:
    f.write(bundle_code)

print(f"Bundled successfully into dist & userscript ({len(bundle_code)} bytes)")
