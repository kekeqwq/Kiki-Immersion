# Kiki Immersion

Chrome MV3 overlay for YouTube immersion on a touch screen.

Captions only (no translation). Official English US/UK first; otherwise auto-generated word flashes are merged into readable lines. Word tap pauses for Yomitan.

Version 1.1.0

## Gestures

Player chrome is locked. Clicks on the video do not reveal YouTube controls except the top-right pocket.

```
+-----------+----------------------+-----------+
| top-left  | middle TOP           | top-right |
| DOUBLE    | SINGLE               | SINGLE    |
| max       | play / pause         | show      |
| quality   |                      | controls  |
+-----------+----------------------+-----------+
| left      | middle BOTTOM        | right     |
| DOUBLE    | DOUBLE               | DOUBLE    |
| prev cue  | webpage fullscreen   | next cue  |
+-----------+----------------------+-----------+
|              tappable captions               |
```

| Input | Action |
| --- | --- |
| Tap a caption word | Pause + select the word for Yomitan |
| Close dictionary / tap empty after lookup | Resume |
| Single tap middle-top | Play / pause |
| Double-tap left | Previous line |
| Double-tap right | Next line |
| Double-tap middle-bottom | Webpage fullscreen (not OS / YouTube native fullscreen) |
| Double-tap top-left pocket | Highest available quality (`highres` / 2160 / 1440 / 1080… Premium included) |
| Single tap top-right pocket | Show native YouTube chrome for ~4s |
| Anywhere else | No chrome, no seek |

Keyboard: `[` `]` seek lines, `Alt+F` webpage fullscreen.

Player chrome also has **K** (on/off) and **CC** (track picker).

## Install

1. Chrome → `chrome://extensions` → Developer mode
2. Load unpacked → this folder
3. Install Yomitan and enable touch scanning
4. Open a YouTube watch page that has captions

## Notes

- Webpage fullscreen is CSS on the watch page, not `requestFullscreen()`.
- Native YouTube captions are hidden while the overlay is on.
- Bilibili is not in 1.0.


## Lookup

Tap a word: pause + Yomitan. Tap the **same** word again: close and resume. Tap a **different** word: stay paused and look that one up.

If Yomitan has no entry and AI fallback is tested + enabled, Kiki asks your OpenAI-compatible endpoint to explain the word in the current line (Chinese or English prompt).

xAI / Grok is OpenAI-compatible: base `https://api.x.ai/v1`.
