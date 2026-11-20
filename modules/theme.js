// Catppuccin UI tokens shared by every Kiki surface. Official Latte/Macchiato
// palette: https://catppuccin.com/palette/ (MIT). Never style the host website.
(() => {
  "use strict";
  const palettes = {
    light: {
      rosewater: "#dc8a78", flamingo: "#dd7878", pink: "#ea76cb", mauve: "#8839ef",
      red: "#d20f39", maroon: "#e64553", peach: "#fe640b", yellow: "#df8e1d",
      green: "#40a02b", teal: "#179299", sky: "#04a5e5", sapphire: "#209fb5",
      blue: "#1e66f5", lavender: "#7287fd", text: "#4c4f69", subtext1: "#5c5f77",
      subtext0: "#6c6f85", overlay2: "#7c7f93", overlay1: "#8c8fa1", overlay0: "#9ca0b0",
      surface2: "#acb0be", surface1: "#bcc0cc", surface0: "#ccd0da",
      base: "#eff1f5", mantle: "#e6e9ef", crust: "#dce0e8"
    },
    dark: {
      rosewater: "#f4dbd6", flamingo: "#f0c6c6", pink: "#f5bde6", mauve: "#c6a0f6",
      red: "#ed8796", maroon: "#ee99a0", peach: "#f5a97f", yellow: "#eed49f",
      green: "#a6da95", teal: "#8bd5ca", sky: "#91d7e3", sapphire: "#7dc4e4",
      blue: "#8aadf4", lavender: "#b7bdf8", text: "#cad3f5", subtext1: "#b8c0e0",
      subtext0: "#a5adcb", overlay2: "#939ab7", overlay1: "#8087a2", overlay0: "#6e738d",
      surface2: "#5b6078", surface1: "#494d64", surface0: "#363a4f",
      base: "#24273a", mantle: "#1e2030", crust: "#181926"
    }
  };
  const rgb = hex => hex.slice(1).match(/../g).map(n => parseInt(n, 16)).join(", ");
  function tokens(p, light) {
    return Object.entries(p).map(([name, value]) => `--kiki-${name}: ${value}; --kiki-${name}-rgb: ${rgb(value)};`).join("\n") + `
      --kiki-accent: var(--kiki-mauve);
      --kiki-on-accent: ${light ? "#eff1f5" : "#24273a"};
      --kiki-panel: rgba(var(--kiki-base-rgb), 0.96);
      --kiki-panel-raised: rgba(var(--kiki-mantle-rgb), 0.97);
      --kiki-border: var(--kiki-surface1);
      --kiki-soft: rgba(var(--kiki-surface0-rgb), 0.55);
      --kiki-shadow: 0 20px 56px rgba(${light ? "76, 79, 105, 0.20" : "24, 25, 38, 0.55"});
      --kiki-paper: var(--kiki-base); --kiki-ink: var(--kiki-text);
      --kiki-phrase-wavy: var(--kiki-mauve);
    `;
  }
  const roots = ":is(#kiki-yomitan-card, #kiki-settings-modal, #kiki-hud, #kiki-track-dropdown, #kiki-toast, #kiki-loader-hud)";
  const ui = `html[data-kiki-theme] ${roots}`;
  const card = 'html[data-kiki-theme] #kiki-yomitan-card';
  const modal = 'html[data-kiki-theme] #kiki-settings-modal';
  const captions = 'html[data-kiki-theme] #kiki-captions';
  const css = `
    :root { ${tokens(palettes.dark, false)} }
    html[data-kiki-theme="light"] { ${tokens(palettes.light, true)} }
    ${ui} {
      color: var(--kiki-text) !important;
      background: var(--kiki-panel) !important;
      border-color: var(--kiki-border) !important;
      box-shadow: var(--kiki-shadow) !important;
      backdrop-filter: blur(24px) saturate(110%) !important;
      -webkit-backdrop-filter: blur(24px) saturate(110%) !important;
      color-scheme: dark !important;
    }
    html[data-kiki-theme="light"] ${roots} { color-scheme: light !important; }
    ${ui} * {
      border-color: var(--kiki-border) !important;
      text-shadow: none !important;
    }
    /* Inline legacy colors also occur in imported dictionary structured
       content and streamed AI Markdown. Resolve them locally, not on body. */
    ${ui} :is(div, span, p, strong, b, em, i, li, td, th, label, summary, code, pre) {
      color: var(--kiki-text) !important;
    }
    ${ui} :is(a, a *) { color: var(--kiki-blue) !important; }
    ${ui} :is(a:hover, a:hover *) { color: var(--kiki-mauve) !important; }
    ${ui} :is(input, textarea, select, option) {
      background: var(--kiki-mantle) !important;
      color: var(--kiki-text) !important;
      border-color: var(--kiki-surface1) !important;
      caret-color: var(--kiki-mauve) !important;
      accent-color: var(--kiki-mauve) !important;
    }
    ${ui} :is(input, textarea)::placeholder { color: var(--kiki-subtext0) !important; opacity: 1; }
    ${ui} :is(input, textarea, select, button, a):focus-visible {
      outline: 2px solid var(--kiki-mauve) !important;
      outline-offset: 2px !important;
    }
    ${ui} :is(button, button *, .kiki-import-trigger-btn, .kiki-import-trigger-btn *) {
      color: var(--kiki-text) !important;
    }
    ${ui} :is(button, .kiki-import-trigger-btn) {
      background: var(--kiki-soft) !important;
      border-color: var(--kiki-border) !important;
      box-shadow: none !important;
    }
    ${ui} :is(button, .kiki-import-trigger-btn):hover {
      background: var(--kiki-surface0) !important;
    }
    ${ui} button:disabled { opacity: 0.45 !important; }
    ${ui} [data-kiki-status="error"], ${card} .kiki-ai-error, ${card} .kiki-ai-error div {
      color: var(--kiki-red) !important;
    }
    ${ui} [data-kiki-status="success"] { color: var(--kiki-green) !important; }
    html[data-kiki-theme] #kiki-loader-hud[data-kiki-status="error"] { border-color: var(--kiki-red) !important; }
    ${ui} :is(code, pre) { background: var(--kiki-mantle) !important; }
    ${ui} hr { border-color: var(--kiki-surface1) !important; }
    ${ui} ::selection { background: var(--kiki-lavender) !important; color: var(--kiki-crust) !important; }
    ${ui} ::-webkit-scrollbar-track { background: transparent !important; }
    ${ui} ::-webkit-scrollbar-thumb { background: var(--kiki-surface2) !important; }
    ${ui}::-webkit-scrollbar-thumb { background: var(--kiki-surface2) !important; }
    ${ui} { scrollbar-color: var(--kiki-surface2) transparent; }
    ${card} :is(.kiki-card-body, .kiki-ai-scroll-container, .kiki-ai-answer) { color: var(--kiki-text) !important; }
    ${card} :is(.kiki-card-reading, .kiki-card-empty, .kiki-card-prog-text, .kiki-ai-thought-text) {
      color: var(--kiki-subtext1) !important;
    }
    ${card} :is(.kiki-ai-quote-box, .kiki-ai-thought-box, .kiki-ai-user-bubble) {
      background: var(--kiki-soft) !important;
      color: var(--kiki-subtext1) !important;
      border-color: var(--kiki-mauve) !important;
    }
    ${card} :is(.kiki-ai-thought-status, .kiki-ai-thought-status *, .kiki-ai-thought-toggle-btn) {
      color: var(--kiki-mauve) !important;
    }
    ${card} mark, ${card} .kiki-ai-quote-box mark {
      background: rgba(var(--kiki-mauve-rgb), 0.20) !important;
      color: var(--kiki-text) !important;
    }
    ${card} :is(.kiki-card-ai-switch-btn, .kiki-ai-followup-send),
    ${modal} :is(#kiki-ai-save-btn, #kiki-hot-reload-btn),
    ${ui} .kiki-import-trigger-btn {
      background: var(--kiki-mauve) !important;
      color: var(--kiki-on-accent) !important;
      border-color: var(--kiki-mauve) !important;
    }
    ${ui} :is(.kiki-card-ai-switch-btn, .kiki-ai-followup-send, .kiki-import-trigger-btn) * {
      color: var(--kiki-on-accent) !important;
    }
    ${card} :is(.kiki-card-settings-btn, .kiki-card-close-btn, .kiki-ai-copy-btn, .kiki-toggle-para-btn),
    ${modal} .kiki-modal-close { background: transparent !important; color: var(--kiki-subtext1) !important; }
    ${card} .kiki-toggle-para-btn { color: var(--kiki-blue) !important; }
    ${card} .kiki-ai-context-badge { background: var(--kiki-mauve) !important; color: var(--kiki-on-accent) !important; }
    ${card} .kiki-ai-model-badge { background: var(--kiki-soft) !important; color: var(--kiki-subtext0) !important; }
    ${modal} [style*="var(--kiki-subtext0)"] { color: var(--kiki-subtext0) !important; }
    ${modal} [style*="var(--kiki-subtext1)"] { color: var(--kiki-subtext1) !important; }
    ${card} .kiki-card-body [style*="background"] { background: var(--kiki-soft) !important; }
    ${card} .kiki-badge { background: var(--kiki-soft) !important; }
    ${card} .kiki-badge-dict { color: var(--kiki-subtext0) !important; }
    ${card} .kiki-badge-redirect { color: var(--kiki-green) !important; }
    ${card} .kiki-badge-pos { color: var(--kiki-red) !important; }
    ${card} .kiki-badge-level { color: var(--kiki-blue) !important; }
    ${card} .kiki-badge-vocab { color: var(--kiki-mauve) !important; }
    ${modal} :is(div, span)[style*="background"],
    ${modal} [data-kiki-surface] { background: var(--kiki-soft) !important; }
    ${modal} .kiki-tab-btn[aria-selected="true"] {
      background: var(--kiki-mauve) !important; color: var(--kiki-on-accent) !important;
    }
    ${modal} .kiki-del-dict-btn { background: rgba(var(--kiki-red-rgb), 0.15) !important; color: var(--kiki-red) !important; }
    ${modal} #kiki-ai-ping-result { background: var(--kiki-soft) !important; color: var(--kiki-text) !important; }
    ${modal} #kiki-ai-ping-result[data-kiki-status="error"] { color: var(--kiki-red) !important; }
    ${modal} #kiki-ai-ping-result[data-kiki-status="success"] { color: var(--kiki-green) !important; }
    ${ui} :is(.kiki-modal-prog-fill, .kiki-card-prog-fill) { background: var(--kiki-green) !important; }
    html[data-kiki-theme] #kiki-modal-backdrop { background: rgba(var(--kiki-crust-rgb), 0.65) !important; }
    html[data-kiki-theme] #kiki-hud:hover { background: var(--kiki-panel-raised) !important; }
    html[data-kiki-theme] #kiki-hud .kiki-hud-btn {
      background: var(--kiki-soft) !important; color: var(--kiki-text) !important; border-color: var(--kiki-border) !important;
    }
    html[data-kiki-theme] #kiki-hud .kiki-hud-btn:hover { background: var(--kiki-surface0) !important; }
    html[data-kiki-theme] #kiki-hud .kiki-hud-dot { background: var(--kiki-green) !important; box-shadow: none !important; }
    html[data-kiki-theme] #kiki-track-dropdown :is(.kiki-dropdown-header, .kiki-dropdown-tag) { color: var(--kiki-subtext0) !important; }
    html[data-kiki-theme] #kiki-track-dropdown .kiki-dropdown-item.active {
      background: rgba(var(--kiki-mauve-rgb), 0.18) !important; color: var(--kiki-mauve) !important;
    }
    html[data-kiki-theme] #kiki-track-dropdown .kiki-dropdown-tag { background: var(--kiki-soft) !important; }
    html[data-kiki-theme] #kiki-track-dropdown .kiki-dropdown-sep { background: var(--kiki-surface1) !important; }
    ${captions} .kiki-line {
      background: var(--kiki-panel) !important; color: var(--kiki-text) !important;
      border-color: var(--kiki-border) !important; box-shadow: var(--kiki-shadow) !important;
      text-shadow: none !important;
    }
    ${captions} .kiki-word { color: var(--kiki-text) !important; text-shadow: none !important; }
    ${captions} :is(.kiki-word:hover, .kiki-word.kiki-active) {
      background: rgba(var(--kiki-mauve-rgb), 0.22) !important;
      color: var(--kiki-text) !important; border-bottom-color: var(--kiki-mauve) !important;
    }
    ${captions} .kiki-cap-ai-btn {
      background: var(--kiki-mauve) !important; border-color: var(--kiki-mauve) !important; box-shadow: none !important;
    }
    ${captions} .kiki-cap-ai-btn :is(.kiki-ai-icon, .kiki-ai-text) { color: var(--kiki-on-accent) !important; }
    ${["red", "yellow", "green", "mauve"].map(name => `${card} [data-kiki-pill="${name}"] { --kiki-pill: var(--kiki-${name}); --kiki-pill-rgb: var(--kiki-${name}-rgb); }`).join("\n")}
    ${card} .kiki-ai-suggestion {
      background: rgba(var(--kiki-pill-rgb), 0.12) !important;
      border-color: rgba(var(--kiki-pill-rgb), 0.45) !important;
      color: var(--kiki-pill) !important;
      transition: background-color 0.15s ease !important;
    }
    ${card} .kiki-ai-suggestion * { color: var(--kiki-pill) !important; }
    ${card} .kiki-ai-suggestion:hover { background: rgba(var(--kiki-pill-rgb), 0.22) !important; }
  `;
  window.KikiTheme = Object.freeze({ palettes, css });
})();
