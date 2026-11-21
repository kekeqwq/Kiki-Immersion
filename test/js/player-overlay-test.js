// Uses real browser layout and production overlay positioning/style functions.
window.testKikiPlayerOverlays = async function(check) {
  const player = document.getElementById('player');
  const hud = document.getElementById('kiki-hud');
  const notice = document.getElementById('kiki-toast');
  const hudParent = hud.parentElement, toastParent = notice.parentElement;
  const saved = { css: player.style.cssText, isYT: STATE.isYouTube, fs: STATE.fs, hudVisible: STATE.hudVisible,
    subsVisible: STATE.subsVisible, theme: STATE.theme, html: hud.innerHTML, hudCss: hud.style.cssText, toastCss: notice.style.cssText };
  const near = (a, b) => Math.abs(a - b) < 1.1;
  const center = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  function layout(css) { player.style.cssText = css; window.positionPlayerOverlays(); }
  try {
    STATE.isYouTube = true; STATE.fs = false; STATE.hudVisible = true; STATE.subsVisible = true;
    hud.innerHTML = '<div class="kiki-hud-dot"></div><button class="kiki-hud-btn kiki-hud-settings"><span class="kiki-hud-label">Settings</span></button>' +
      '<button class="kiki-hud-btn kiki-hud-sub"></button><button class="kiki-hud-btn kiki-hud-cc">CC Track</button>' +
      '<button class="kiki-hud-btn kiki-hud-reload"><span>↻</span><span class="kiki-hud-label">Reload</span></button><button class="kiki-hud-btn kiki-hud-close">×</button>';
    updateHud();
    layout('position:fixed;inset:auto;left:40px;top:80px;width:640px;height:360px;');
    toast('Player-centered notification');
    check(near(center(hud)[0], 360) && near(hud.getBoundingClientRect().top, 92), 'Normal HUD centers over the video player, not the page/sidebar');
    check(near(center(notice)[0], 360) && near(center(notice)[1], 260), 'Normal toast centers inside the player');
    layout('position:fixed;inset:auto;left:120px;top:90px;width:480px;height:300px;');
    check(near(center(hud)[0], 360) && near(center(notice)[1], 240), 'Theater/resized player geometry updates both overlay anchors');
    layout('position:fixed;inset:auto;left:40px;top:-80px;width:640px;height:360px;');
    check(near(hud.getBoundingClientRect().top, 12) && near(center(notice)[1], 140), 'Scrolling uses the visible player region, not stale page offsets');
    layout('position:fixed;inset:auto;left:16px;top:80px;width:320px;height:240px;');
    check(hud.dataset.compact === 'true' && hud.getBoundingClientRect().width <= 297, 'Narrow players use a compact bar that stays within player bounds');
    check(getComputedStyle(hud.querySelector('.kiki-hud-label')).display === 'none', 'Compact bar hides optional labels but retains controls');
    const sub = hud.querySelector('.kiki-hud-sub');
    for (const mode of ['light', 'dark']) {
      applyTheme(mode);
      // Simulate the legacy inline !important mint color from earlier builds.
      sub.style.setProperty('color', '#6EE7B7', 'important');
      sub.style.setProperty('background', 'rgba(16,185,129,0.25)', 'important');
      updateHud();
      const color = KikiTheme.palettes[mode].mauve.slice(1).match(/../g).map(n => parseInt(n, 16));
      check(!sub.style.color && getComputedStyle(sub).color === `rgb(${color.join(', ')})`, mode + ': active subtitle button clears stale inline colors and uses Catppuccin accent');
      STATE.subsVisible = false; updateHud();
      check(sub.getAttribute('aria-pressed') === 'false' && sub.dataset.active === '0', mode + ': subtitle off state remains accessible and theme-driven');
      STATE.subsVisible = true;
    }
    player.style.cssText = `position:fixed;inset:0;width:${innerWidth}px;height:${innerHeight}px;`;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => player });
    document.dispatchEvent(new Event('fullscreenchange'));
    updateHud(); toast('Fullscreen'); positionPlayerOverlays();
    check(hud.parentElement === player && notice.parentElement === player, 'Native fullscreen mounts HUD and toast inside the fullscreen element');
    check(near(center(hud)[0], innerWidth / 2) && near(hud.getBoundingClientRect().top, 64), 'Fullscreen preserves the centered top bar placement');
    check(near(center(notice)[0], innerWidth / 2) && near(center(notice)[1], innerHeight / 2), 'Fullscreen toast stays centered in the player');
    delete document.fullscreenElement;
    document.dispatchEvent(new Event('fullscreenchange'));
    layout('position:fixed;inset:auto;left:40px;top:80px;width:640px;height:360px;');
    check(hud.parentElement === document.body && near(center(hud)[0], 360), 'Exiting native fullscreen restores the normal player anchor');
    STATE.fs = true;
    layout(`position:fixed;inset:0;width:${innerWidth}px;height:${innerHeight}px;`);
    check(near(hud.getBoundingClientRect().top, 64) && near(center(hud)[0], innerWidth / 2), 'Kiki webpage fullscreen also uses the correct centered anchor');
  } finally {
    delete document.fullscreenElement;
    Object.assign(STATE, { isYouTube: saved.isYT, fs: saved.fs, hudVisible: saved.hudVisible, subsVisible: saved.subsVisible });
    player.style.cssText = saved.css;
    hud.innerHTML = saved.html; hud.style.cssText = saved.hudCss;
    notice.style.cssText = saved.toastCss;
    hudParent.appendChild(hud); toastParent.appendChild(notice);
    applyTheme(saved.theme);
    clearTimeout(toast._t);
  }
};
