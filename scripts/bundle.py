import os

MODULE_ORDER = ['core', 'yomitan', 'ai', 'ui', 'youtube']

header = """// ==UserScript==
// @name         Kiki Immersion
// @namespace    https://github.com/kekeqwq/Kiki-Immersion
// @version      1.2.1
// @description  Bilingual and interactive Japanese/English subtitles with Yomitan word lookup, offline dict caching, and touch/mouse gestures.
// @author       keke
// @match        *://*.youtube.com/*
// @match        *://youtube.com/*
// @include      *://*.youtube.com/*
// @include      *://youtube.com/*
// @run-at       document-start
// @grant        none
// @inject-into  page
// ==/UserScript==

(() => {
  'use strict';
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

print(f"Bundled successfully into dist/kiki-immersion.user.js ({len(bundle_code)} bytes)")
