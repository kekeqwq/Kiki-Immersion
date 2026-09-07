# Kiki Immersion

> *A small watcher. Large type. One line at a time.*

![Version](https://img.shields.io/badge/version-1.7.7-blue.svg) ![Manifest](https://img.shields.io/badge/Chrome-MV3-success.svg) ![Platform](https://img.shields.io/badge/touch--first-YouTube-red.svg) ![License](https://img.shields.io/badge/license-GPL--3.0-blue.svg)

A touch-first Chrome (MV3) extension designed for language immersion on YouTube. Built specifically for touchscreen devices (tablets, 2-in-1 laptops) as well as desktop setups.

Instead of cluttering your screen with distracting bilingual machine translations, Kiki delivers pure target-language immersion: clean single-line captions, accidental-touch prevention, one-tap Yomitan dictionary lookup with automatic resume, and multi-provider streaming AI contextual tutor fallback.

---

## Features

### 1. Pure Target Language Immersion (No Machine Translation)
- **Original Audio First**: Prioritizes official native tracks (e.g., English US/UK).
- **Auto-Generated Caption Reconstruction**: YouTube's auto-generated rolling word flashes are automatically merged and cleaned into natural, readable, stable single-line sentences.
- **Clean Chrome**: Completely overrides and hides YouTube's native captions.

### 2. Touch-First Gesture Engine (Anti-Accidental-Touch)
- **Player Lockout**: Native YouTube click listeners are intercepted, preventing accidental palm/finger touches from scrubbing the timeline or popping up oversized controls.
- **6 Dedicated Touch Zones**: Quickly seek cues, toggle playback, jump to the highest available video resolution, or enter cinema webpage fullscreen with intuitive single/double taps.

### 3. Interactive Word Lookup & Smart Auto-Resume
- **Tap a Word**: Video automatically pauses and triggers a precise Yomitan popup.
- **Tap Same Word Again**: Closes the dictionary and immediately resumes playback.
- **Tap a Different Word**: Stays paused and smoothly looks up the newly selected word.
- **Tap Video Area**: Closes active lookup cards and resumes playback.

### 4. Multi-Provider Streaming AI Fallback Tutor
- **Contextual Explanations**: When a word has no dictionary entry (slang, colloquialisms, idioms, or speech-to-text recognition errors) or when clicking the `Ask AI` button, Kiki queries your AI endpoint.
- **Multi-Provider Support**: Configure up to **3 OpenAI-compatible providers** (OpenAI, xAI / Grok, DeepSeek, Ollama, OpenRouter, etc.), with up to 5 models per provider.
- **Live SSE Streaming**: Typing responses stream smoothly directly above the caption bar without blocking video content.
- **Reasoning Model Support**: Optimized token budgets and parameter tuning for reasoning models (such as `o1` and `o3`).
- **Customizable Prompts**: Define prompts in English or Chinese with `{{word}}` and `{{sentence}}` template variables.
- **Connection Diagnostics**: Built-in `Test API` button reports live connectivity, status, and response latency.

### 5. Paper & Ink Typography
- **Editorial Aesthetics**: Designed with warm paper (`#EFEBE3`) and sumi ink (`#141413`) palettes.
- **Local Font Access**: Directly browse and select locally installed system fonts via the Local Font Access API.
- **Full Customization**: Adjust font size, text color, background color, and background opacity.
- **Backup & Migration**: One-click JSON export/import for all configurations, plus an instant caption cache cleaner.

---

## Gesture Map

The player video surface is mapped into the following touch regions:

```
+------------------+------------------------------+------------------+
|     Top-Left     |          Middle-Top          |    Top-Right     |
|    DOUBLE-TAP    |          SINGLE-TAP          |    SINGLE-TAP    |
|   Max Quality    |         Play / Pause         |  Show Controls   |
|   (Auto 4K/HD)   |        (Toggle Video)        |   (Native ~4s)   |
+------------------+------------------------------+------------------+
|       Left       |        Middle-Bottom         |      Right       |
|    DOUBLE-TAP    |          DOUBLE-TAP          |    DOUBLE-TAP    |
|   Previous Cue   |      Webpage Fullscreen      |     Next Cue     |
|   (Rewind line)  |        (Theater Mode)        |   (Forward line) |
+------------------+------------------------------+------------------+
|                   Interactive Caption Bar (Word Lookup)             |
+--------------------------------------------------------------------+
```

| Input | Action |
| :--- | :--- |
| **Tap caption word** | Pause video & trigger Yomitan lookup on the word |
| **Tap same word again** | Dismiss dictionary popup & resume playback |
| **Tap different word** | Remain paused & look up the new word |
| **Double-tap Left** | Seek back to the start of the previous caption line |
| **Double-tap Right** | Seek forward to the next caption line |
| **Single-tap Middle-Top** | Toggle **Play / Pause** (dismisses dictionary/AI if open) |
| **Double-tap Middle-Bottom** | Toggle **Webpage Fullscreen** (clean theater mode without window distortion) |
| **Double-tap Top-Left** | Switch immediately to the **highest available quality** (`highres`, 4K, 2K, 1080p Premium) |
| **Single-tap Top-Right** | Temporarily reveal native YouTube controls for ~4 seconds |
| **Any other touch** | Ignored to prevent accidental timeline scrub |

### Keyboard Shortcuts

- `[` : Rewind to previous subtitle line
- `]` : Jump to next subtitle line
- `Alt + F` : Toggle webpage fullscreen

---

## On-Screen Controls

Discreet floating capsule buttons are anchored on the player:
- **K**: Toggle Kiki Immersion overlay on/off.
- **CC**: Caption track picker (switch between available languages).
- **AI Button**: Positioned at the end of the active subtitle line to query the AI model on demand.

---

## Installation

1. Clone or download this repository:
   ```bash
   git clone https://github.com/kekeqwq/kiki-immersion.git
   ```
2. Open Chrome (or Edge, Brave, or any Chromium-based browser) and navigate to:
   ```text
   chrome://extensions
   ```
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the project root directory.
5. *(Recommended)* Install **[Yomitan](https://github.com/themoeway/yomitan)**, import your preferred dictionaries, and enable "Touch scanning" in Yomitan settings.
6. Open any YouTube video with captions to start immersion!

---

## Configuration & Options

Right-click the extension icon and choose **Options** to configure:

1. **Overlay**: Master toggle and YouTube native caption suppression.
2. **Captions**:
   - Font size slider (16px to 64px).
   - Local font selector (click **Read local fonts** to scan system fonts).
   - Text color, background color, and background opacity.
3. **AI Fallback**:
   - Manage up to 3 OpenAI-compatible API providers (base URL, API key, model list).
   - Test endpoints with live status and latency checks.
   - Choose explanation language (`English` or `Chinese`) and customize prompt templates.
   - Toggle **Use AI when Yomitan has no entry**.
4. **Backup**:
   - **Clear caption cache**: Resets cached subtitle tracks (resolves stuck video tracks).
   - **Export / Import**: Plain JSON configuration backup and restore.

---

## License

[GNU General Public License v3.0](LICENSE)
