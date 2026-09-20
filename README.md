# Kiki Immersion (Safari)

> *Touch & Mouse YouTube Immersion with Yomitan Dictionary Lookup, Frosted Glass Subtitles & Audio Engine for Safari.*

![Platform](https://img.shields.io/badge/platform-Safari-blue.svg) ![Release](https://img.shields.io/badge/release-v1.1.1-emerald.svg) ![Status](https://img.shields.io/badge/status-Verified%20100%25-success.svg) ![License](https://img.shields.io/badge/license-GPL--3.0-blue.svg)

---

## 📢 Release Overview

**v1.1.1 (Multi-Word Phrase Matching, Subtitle Toggle & HUD Responsiveness Patch)**:
- **Yomitan Multi-Word Phrase Matching**: Clicking any word searches for matching multi-word phrases and idioms (e.g. "good night") in installed Yomitan dictionaries, prioritizing matched phrases at the top with multi-word highlights and seamless toggle-to-close behavior.
- **Subtitle Visibility Switch**: Top HUD bar now includes a `💬 Sub: On/Off` toggle button to quickly show or hide subtitles for videos that do not require them.
- **Zero-Latency HUD & Gesture Engine**: Eliminated DOM Text node recreation in WebKit's high-frequency tick cycle, added `touch-action: manipulation !important;`, tactile touch scaling feedback (`scale(0.93)`), and unified `bindHudButton` event isolation ensuring crisp, single-click/tap responsiveness across macOS and iPadOS Safari.

**v1.1.0 (Core Milestone Release)**:
The two core pillars of Kiki Immersion are now complete and 100% verified on Safari (macOS & iPadOS):
1. **Offline Yomitan Dictionary Engine**: Zero-latency, first-party IndexedDB lookups, phonetic transcriptions, grammar badges, and pronunciation audio.
2. **AI Contextual Explanation Engine**: OpenAI-compatible streaming API, automatic fallback for missing words, manual forced AI with tactile 38×38px touch buttons, dual-language prompts, and customizable prompt templates.

- **Interactive Toggle Close**: Clicking/tapping an active word always closes the card and seamlessly resumes video playback, regardless of whether the card is displaying Yomitan definitions or streaming AI context.
- **Tactile Rounded-Square AI Button**: Subtitle lines feature a dedicated 38×38px (`border-radius: 11px`) touch-optimized AI button for single-tap contextual explanations.
- **Strict Non-Live Subtitle Engine**: Locks out rolling live captions, parsing subtitles into clean, whole-sentence cues with smooth transitions.
- **Glassmorphism Design**: Translucent dark frosted glass with native control clearance (jumping 69px when native controls are visible).

---

## ✨ Features & Highlights

1. **Dual-Core Learning System**
   - **First-Party Yomitan Dictionary**: Import standard `.zip` format dictionaries (OALD, Cambridge, JMdict, etc.) directly into `youtube.com`'s IndexedDB. Immune to Safari ITP restrictions.
   - **AI Contextual Explanation (OpenAI-Compatible)**:
     - **Automatic Fallback**: If a word is not found in local dictionaries and an API Key is set, automatically streams an explanation tailored to the exact subtitle context.
     - **Manual Force AI**: Subtitle line button (`✦ AI`) and card button (`✦ Ask AI`) allow switching to AI explanation at any time.
     - **Dual-Language Prompts**: Built-in optimized prompts for Chinese and English language tutors.
     - **Customizable Templates**: Edit prompt templates directly inside the player settings modal with one-click reset to defaults.
     - **Connection Diagnostics**: Built-in `Ping AI` tool to verify API base, key, and model availability.

2. **Rock-Solid Subtitle Pipeline (Strict Non-Live Mode)**
   - Pre-fetches and parses timedtext tracks into complete sentence lines (`wordsToLines`), eliminating live rolling text jitters.
   - Resilient multi-tier fallback: Wire sniffer, DOM/player extraction with polling, Format 3 XML support (`<p t="..." d="...">`), InnerTube API, and direct API endpoints.
   - Native captions are automatically suppressed to prevent duplicate or conflicting overlays.

3. **Storage & Configuration Management**
   - **Dual-Tab Modal**: Access offline dictionaries (`📖 Dict`) and AI configuration (`🤖 AI`) from the top HUD bar.
   - **One-Click Reset**: Safely purge all dictionaries, local storage, and AI configurations with one click.

4. **Dual Control Scheme (Mouse + Touch + Keyboard)**
   - Single click/tap on player: Play/Pause.
   - Click/tap any subtitle word: Immediate pause and fixed-center Yomitan card display. Re-click the word to resume.
   - Click/tap `✦ AI` button: Instant contextual AI breakdown of the word or entire subtitle.
   - Double click (mouse) / Double tap (center touch): Webpage theater fullscreen (non-native fullscreen).
   - Double tap left/right (touch) or Left/Right Arrow keys: Seek by subtitle segment.
   - Single click/tap top-left corner: Toggle floating HUD controller (auto-hides after 7 seconds).

---

## 📂 Repository Structure

```text
Kiki-Immersion-Safari/
├── test/                         # Local Testbench (Run with local HTTP server)
│   ├── index.html                # Standalone dictionary test & morphology lookup
│   ├── css/
│   │   └── style.css             # UI typography & layout
│   └── js/
│       ├── lib/
│       │   └── jszip.min.js      # Client-side archive unpacker
│       ├── db.js                 # IndexedDB storage wrapper with clearAllStorage()
│       ├── structured-content.js # Yomitan Structured Content DOM renderer
│       ├── english-lemmatizer.js # English morphological reduction
│       ├── deinflector.js        # Japanese deinflection engine
│       ├── deinflect-rules.js    # Conjugation rules dictionary
│       ├── importer.js           # Zip streaming parser & CSS extractor
│       ├── search.js             # Multi-language ranking and query engine
│       └── audio.js              # Word pronunciation audio synthesizer
└── userscript/                   # YouTube Userscript (Safari)
    └── kiki-immersion.user.js
```

---

## 🚀 Installation Guide

### Step 1: Install a Userscript Manager
Install one of the open-source Userscript extensions from the App Store:
- **[Userscripts](https://apps.apple.com/app/userscripts/id1463298887)** (Recommended for Safari)
- Or **Stay** / **Tampermonkey** for Safari

Grant the extension permission to access `youtube.com`.

### Step 2: Install the Userscript
1. In your Userscript extension, create or update the script using `userscript/kiki-immersion.user.js`.
2. Save and ensure the script is enabled.

### Step 3: Import Yomitan Dictionaries
1. Open any video on YouTube in Safari.
2. Click **`📖 Dict`** on the top HUD control bar (or click **`📥 Import Dict (.zip)`** inside any word lookup card).
3. Select your Yomitan `.zip` dictionary file (e.g. `OALD10_Yomitan_V3.3.0.zip`).
4. Terms and styles are indexed directly into Safari offline storage for instant, zero-latency lookup.
5. Use **`🗑 Clear All`** inside the manager modal anytime you wish to wipe and reset the local database.

---

## 🛠 Local Developer Testbench

To test dictionary parsing, morphology, or Yomitan structured content independently without opening YouTube:
1. Start a local HTTP server in the repository root:
   ```bash
   python3 -m http.server 8080
   ```
2. Open Safari and navigate to:
   ```text
   http://localhost:8080/test/
   ```

---

## 🎮 Gestures & Keybindings

| Input | Target | Action |
| :--- | :--- | :--- |
| **Click / Tap Subtitle Word** | Subtitle Text | Pause video & display centered Yomitan card (or AI fallback) |
| **Re-Click / Tap Active Word** | Active Word | Close card & resume video playback |
| **Click / Tap Subtitle `✦ AI`** | Subtitle Bar | Toggle AI contextual explanation for word or full sentence |
| **Click / Tap Card `✦ Ask AI`** | Yomitan Card | Switch from Yomitan definition to AI contextual explanation |
| **Click / Tap Outside Card / `×`** | Player Area | Close card & resume video playback |
| **Click / Tap Top-Left Corner** | Top-Left Corner | Toggle HUD controller (auto-hides after 8s) |
| **HUD `💬 Sub: On/Off`** | Top Bar | Toggle subtitle visibility on / off |
| **Click / Tap Top-Right Corner** | Top-Right Corner | Toggle native YouTube controls (captions jump up) |
| **HUD `📖 Dict` / `🤖 AI`** | Top Bar | Open in-player settings modal (Dictionaries & AI Configuration) |
| **Double Click (Mouse)** | Anywhere on Player | Toggle Webpage Theater Fullscreen |
| **Double Tap (Touch)** | Center Area | Toggle Webpage Theater Fullscreen |
| **Double Tap (Touch)** | Left 25% Area | Seek to previous subtitle line |
| **Double Tap (Touch)** | Right 25% Area | Seek to next subtitle line |
| **`[` or `ArrowLeft`** | Keyboard | Seek to previous subtitle line |
| **`]` or `ArrowRight`** | Keyboard | Seek to next subtitle line |
| **`Alt + F`** | Keyboard | Toggle Webpage Theater Fullscreen |

---

## 📄 License

GPL-3.0 License. Built for immersive language learners.
