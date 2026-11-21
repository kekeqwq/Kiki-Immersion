/* Called with a rendered AI card; never contacts a real API. */
window.testKikiCatppuccin = async function(check) {
  const originalTheme = STATE.theme;
  const nativeGetDictionaries = localDB.getDictionaries;
  // Palette tests do not need disk I/O; avoid headless virtual-time races
  // against IndexedDB while opening all six settings-tab/theme combinations.
  localDB.getDictionaries = async () => [];
  const card = document.getElementById('kiki-yomitan-card');
  const host = document.createElement('div');
  host.id = 'kiki-palette-fixture';
  host.innerHTML = '<div id="kiki-captions"><div class="kiki-line"><span class="kiki-word">Subtitle</span><button class="kiki-cap-ai-btn"><span class="kiki-ai-text">AI</span></button></div></div>' +
    '<div id="kiki-hud"><button class="kiki-hud-btn">Settings</button></div>' +
    '<div id="kiki-track-dropdown"><button class="kiki-dropdown-item active">Track</button></div>' +
    '<div id="kiki-toast">Toast</div><div id="kiki-loader-hud">Loader</div>';
  const page = document.createElement('div');
  page.textContent = 'Host website';
  page.style.cssText = 'color: rgb(10, 20, 30); background: rgb(240, 240, 240);';
  host.appendChild(page);
  document.body.appendChild(host);
  const rgb = hex => 'rgb(' + hex.slice(1).match(/../g).map(n => parseInt(n, 16)).join(', ') + ')';
  const color = selector => getComputedStyle(typeof selector === 'string' ? document.querySelector(selector) : selector).color;
  const bg = selector => getComputedStyle(document.querySelector(selector)).backgroundColor;
  try {
    for (const mode of ['light', 'dark']) {
      const palette = KikiTheme.palettes[mode];
      applyTheme(mode);
      await new Promise(resolve => setTimeout(resolve, 200));
      check(document.documentElement.dataset.kikiPalette === (mode === 'light' ? 'catppuccin_latte' : 'catppuccin_macchiato'), mode + ': correct Catppuccin palette identity');
      check(color(card) === rgb(palette.text) && color('.kiki-ai-answer') === rgb(palette.text), mode + ': card and streamed answer use palette text');
      check(bg('#kiki-yomitan-card') === 'rgba(' + palette.base.slice(1).match(/../g).map(n => parseInt(n,16)).join(', ') + ', 0.96)', mode + ': popup background uses palette base');
      check(color('.kiki-ai-quote-box mark') === rgb(palette.text), mode + ': highlighted quote remains readable');
      check(color('.kiki-ai-suggestion') === rgb(palette.red) && color(document.querySelector('.kiki-ai-suggestion span')) === rgb(palette.red), mode + ': suggestion and arrow share semantic palette color');
      check(color('.kiki-ai-context-badge') === rgb(mode === 'light' ? '#eff1f5' : '#24273a'), mode + ': accent badge uses contrasting foreground');
      check(color('#kiki-captions .kiki-word') === rgb(palette.text) && color('#kiki-hud .kiki-hud-btn') === rgb(palette.text), mode + ': subtitles and HUD share palette');
      check(color('#kiki-track-dropdown .active') === rgb(palette.mauve) && color('#kiki-toast') === rgb(palette.text) && color('#kiki-loader-hud') === rgb(palette.text), mode + ': tracks, toast and loader share palette');
      for (const tab of ['dict', 'ai', 'about']) {
        await showSettingsModal(tab);
        check(color('#kiki-settings-modal') === rgb(palette.text) && document.querySelector('#kiki-settings-modal .kiki-tab-btn[aria-selected="true"]').dataset.tab === tab, mode + ': ' + tab + ' settings uses palette and active-tab state');
        if (tab === 'ai') {
          check(bg('#kiki-ai-base-input') === rgb(palette.mantle) && color('#kiki-ai-base-input') === rgb(palette.text), mode + ': editable settings fields use mantle/text');
          document.getElementById('kiki-ai-key-input').value = '';
          document.getElementById('kiki-ai-ping-btn').click();
          check(color('#kiki-ai-ping-result') === rgb(palette.red), mode + ': error feedback uses semantic red');
          document.getElementById('kiki-ai-ping-result').dataset.kikiStatus = 'success';
          check(color('#kiki-ai-ping-result') === rgb(palette.green), mode + ': success feedback uses semantic green');
          const field = document.getElementById('kiki-ai-base-input');
          field.value = 'unsaved draft';
          const other = mode === 'light' ? 'dark' : 'light';
          applyTheme(other);
          check(field.value === 'unsaved draft' && color(field) === rgb(KikiTheme.palettes[other].text), mode + ': live theme switch preserves unsaved settings');
          applyTheme(mode);
        }
      }
      hideSettingsModal();
      check(color(page) === 'rgb(10, 20, 30)' && getComputedStyle(page).backgroundColor === 'rgb(240, 240, 240)', mode + ': host page colors unchanged');
    }
    document.body.classList.add('theme-luminosity-dark');
    applyTheme('auto');
    check(document.documentElement.dataset.kikiPalette === 'catppuccin_macchiato', 'Auto mode follows a dark page');
    applyTheme('light');
    check(color(card) === rgb(KikiTheme.palettes.light.text), 'Explicit Latte overrides page dark classes');
    document.body.classList.remove('theme-luminosity-dark');
    await window.testKikiPlayerOverlays(check);
  } finally {
    document.body.classList.remove('theme-luminosity-dark');
    hideSettingsModal();
    localDB.getDictionaries = nativeGetDictionaries;
    host.remove();
    applyTheme(originalTheme);
  }
};
