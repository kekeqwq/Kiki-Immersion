# Kiki Immersion (Safari)

> *Touch & Mouse YouTube Immersion with Yomitan Dictionary Lookup, Frosted Glass Subtitles & Audio Engine for Safari.*

![Platform](https://img.shields.io/badge/platform-Safari-blue.svg) ![Release](https://img.shields.io/badge/release-v1.0.0-emerald.svg) ![Status](https://img.shields.io/badge/status-Verified%20100%25-success.svg) ![License](https://img.shields.io/badge/license-GPL--3.0-blue.svg)

---

## 📢 Release Overview

**v1.0.0 (Verified Stable Release)**:
- **Comprehensive Safari Support**: 100% verified and tested across touch and mouse input modes in Safari.
- **Strict Non-Live Subtitle Engine**: Fully locks out unbuffered word-by-word streaming live captions. Captions are parsed and presented as stable, complete sentence cues with clean transitions, preventing words from popping out one by one.
- **Frosted Glassmorphism Subtitles & Word Card**: Translucent dark frosted glass (`rgba(18, 18, 22, 0.75)`, `backdrop-filter: blur(16px) saturate(160%)`, `border: 1.5px solid rgba(255, 255, 255, 0.28)`).
- **Fixed-Center Yomitan Card**: Word lookup card is firmly anchored above the subtitle container in the horizontal center (`left: 50%; transform: translateX(-50%)`), completely detached from individual word X positions.
- **Native Control Bar Clearance**: Captions smoothly lift 69px above the scrub bar when native controls are invoked, and settle back down when controls hide.

---

## ✨ Features & Highlights

1. **Rock-Solid Subtitle Pipeline (Strict Non-Live Mode)**
   - Pre-fetches and parses timedtext tracks into complete sentence lines (`wordsToLines`), eliminating live rolling text jitters.
   - Resilient multi-tier fallback: Wire sniffer, DOM/player extraction with polling, Format 3 XML support (`<p t="..." d="...">`), InnerTube API, and direct API endpoints.
   - Native captions are automatically suppressed to prevent duplicate or conflicting overlays.

2. **First-Party Yomitan Dictionary & Audio Engine**
   - Import standard `.zip` Yomitan format dictionaries (e.g. Oxford Advanced Learner's Dictionary OALD 10, Cambridge, JMdict, Daijirin).
   - First-party IndexedDB storage within `youtube.com`: Completely immune to Safari Intelligent Tracking Prevention (ITP) and cross-origin iframe partitioning.
   - Automatic and manual word pronunciation audio (`🔊`).
   - Full Yomitan **Structured Content** specification renderer with phonetic transcriptions, grammar badges (POS, CEFR levels), and definitions.

3. **Storage Management & One-Click Reset**
   - **Clear All Storage**: Available directly inside the in-player Dictionary Manager (`📖 Dict`) modal to reset all IndexedDB databases and offline caches in one click.

4. **Dual Control Scheme (Mouse + Touch + Keyboard)**
   - Single click/tap on player: Play/Pause.
   - Click/tap any subtitle word: Immediate pause and fixed-center Yomitan card display.
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
| **Click / Tap Subtitle Word** | Subtitle Text | Pause video & display centered Yomitan card |
| **Click / Tap Outside Card** | Player Area | Close dictionary card & resume playback |
| **Click / Tap Top-Left Corner** | Top-Left Corner | Toggle HUD controller (7s auto-hide) |
| **Click / Tap Top-Right Corner** | Top-Right Corner | Toggle native YouTube controls (captions jump up 69px) |
| **HUD `📖 Dict` Button** | Top Bar | Open in-player Dictionary Manager (Import / Delete / Clear) |
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
