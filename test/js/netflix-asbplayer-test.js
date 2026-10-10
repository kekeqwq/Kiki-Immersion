/* Run test/netflix-asbplayer.html via a local HTTP server. No real AI calls. */
(async () => {
  const results = [];
  const wait = (ms = 80) => new Promise(resolve => setTimeout(resolve, ms));
  const check = (condition, label) => {
    results.push({ label, passed: Boolean(condition) });
    if (!condition) throw new Error(label);
  };
  const subtitles = document.querySelector('.asbplayer-subtitles-container-bottom');
  const original = subtitles.innerHTML;
  const source = () => subtitles.querySelector('[data-track="0"]');
  const card = () => document.getElementById('kiki-yomitan-card');
  const prompt = () => testRequests.at(-1)?.messages.map(m => m.content).join('\n') || '';
  function gesture(word, options = {altKey: true}) {
    const span = source();
    const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const index = node.textContent.indexOf(word);
      if (index < 0 || node.parentElement.closest('rt, rp')) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + word.length);
      const r = range.getBoundingClientRect();
      const event = new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, button: 0,
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, ...options
      });
      node.parentElement.dispatchEvent(event);
      return event;
    }
    throw new Error('Missing fixture word: ' + word);
  }
  try {
    await wait();
    const video = document.querySelector('video');
    let paused = true, time = 10, playCalls = 0;
    Object.defineProperties(video, {
      paused: { configurable: true, get: () => paused },
      currentTime: { configurable: true, get: () => time }
    });
    video.pause = () => { paused = true; };
    video.play = () => { paused = false; playCalls++; return Promise.resolve(); };

    // Yomitan's gesture must neither trigger AI nor get cancelled by Kiki.
    const other = gesture('emotion', { shiftKey: true });
    await wait();
    check(!other.defaultPrevented && testRequests.length === 0, 'Separate Yomitan gesture unchanged');

    const event = gesture('emotion');
    await wait();
    check(event.defaultPrevented && card().classList.contains('show'), 'Alt gesture opens Kiki AI');
    check(STATE.contextSource === 'asbplayer' && !!card().querySelector('.kiki-ai-chat-thread'), 'Direct AI, not dictionary lookup');
    check(prompt().includes('-It happened so fast.') && prompt().includes('-Pugsley, emotion equals weakness.'), 'All source subtitle lines sent');
    check(prompt().includes('显露情绪等于软弱') && prompt().includes('[Track 1]'), 'Reference translation sent separately');
    check(!prompt().includes('HIDDEN TRANSCRIPT') && !prompt().includes('Running'), 'No offscreen transcript or page chrome');
    closeLookup();
    check(playCalls === 0 && paused, 'Already-paused video stays paused');

    await wait(650);
    paused = false;
    gesture('weakness');
    await wait();
    check(paused && STATE.lookupVideo === video, 'Playing video pauses on lookup');
    const snapshot = STATE.paragraphContext;
    source().textContent = 'New subtitle after opening.';
    await wait();
    check(STATE.paragraphContext === snapshot, 'AI context is frozen across subtitle replacement');
    card().querySelector('.kiki-card-mode-select').dispatchEvent(new Event('change', { bubbles: true }));
    await wait();
    check(prompt().includes('emotion equals weakness') && !prompt().includes('New subtitle after opening'), 'Mode change reuses the original snapshot');
    card().querySelector('.kiki-ai-followup-input').value = 'Explain the grammar';
    card().querySelector('.kiki-ai-followup-send').click();
    await wait();
    check(prompt().includes('emotion equals weakness') && prompt().includes('Explain the grammar'), 'Follow-up requests retain the full subtitle snapshot');
    closeLookup();
    check(!paused && playCalls === 1, 'Only Kiki-paused video resumes');
    paused = true;

    await wait(650);
    subtitles.innerHTML = original;
    // Model the Fullscreen API transition; class and popup-host tests do not
    // require granting a synthetic event a trusted browser activation.
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => document.getElementById('player') });
    subtitles.querySelectorAll('.asbplayer-subtitles').forEach(el => el.className = 'asbplayer-fullscreen-subtitles');
    document.dispatchEvent(new Event('fullscreenchange'));
    gesture('emotion');
    await wait();
    check(card().parentElement.id === 'player', 'Popup mounted inside fullscreen element');
    check(prompt().includes('emotion equals weakness') && prompt().includes('显露情绪等于软弱'), 'Fullscreen multi-track context');
    await showSettingsModal('ai');
    check(document.getElementById('kiki-settings-modal').parentElement.id === 'player' &&
      document.getElementById('kiki-modal-backdrop').parentElement.id === 'player', 'Settings and backdrop mounted inside fullscreen element');
    hideSettingsModal();
    // Ensure popup clicks don't reach Netflix's player ancestor.
    let playerClicks = 0;
    const onClick = () => playerClicks++;
    document.getElementById('player').addEventListener('click', onClick);
    card().querySelector('.kiki-toggle-para-btn').click();
    check(playerClicks === 0, 'Popup controls do not toggle player playback');
    document.getElementById('player').removeEventListener('click', onClick);
    closeLookup();
    delete document.fullscreenElement;
    document.dispatchEvent(new Event('fullscreenchange'));
    check(card().parentElement === document.body, 'Popup returns to body after fullscreen');

    await wait(650);
    subtitles.innerHTML = '<div class="asbplayer-subtitles"><span data-track="0"><span class="asbplayer-subtitle-text">emotion remains</span><span class="asbplayer-subtitle-rich"><ruby>emotion<rt>reading</rt></ruby> remains</span></span></div>';
    gesture('emotion');
    await wait();
    check(STATE.sentenceContext === 'emotion remains' && !STATE.paragraphContext.includes('reading'), 'Rich/plain subtitles and ruby annotations are not duplicated');
    closeLookup();

    await wait(650);
    subtitles.innerHTML = original;
    const nativeCaret = document.caretRangeFromPoint;
    document.caretRangeFromPoint = () => null;
    gesture('emotion');
    await wait();
    document.caretRangeFromPoint = nativeCaret;
    check(STATE.lookupWord === 'emotion', 'Glyph hit-test fallback when native caret is unavailable');
    closeLookup();

    await wait(650);
    time += 5;
    source().textContent = 'A previous dialogue cue.';
    await wait();
    source().textContent = 'The emotion in this next cue.';
    await wait();
    gesture('emotion');
    await wait();
    check(prompt().includes('A previous dialogue cue.'), 'Bounded previous observed dialogue included');
    closeLookup();
    time = 1;
    video.dispatchEvent(new Event('seeking'));
    source().textContent = 'An emotion after seeking.';
    await wait(650);
    gesture('emotion');
    await wait();
    check(!prompt().includes('A previous dialogue cue.'), 'History reset on seek');
    closeLookup();

    await wait(650);
    source().textContent = 'emotion ' + 'full context '.repeat(60) + 'END_OF_COMPLETE_CUE';
    gesture('emotion');
    await wait();
    check(STATE.sentenceContext.length > 450 && prompt().includes('END_OF_COMPLETE_CUE'), 'Current subtitle is not truncated at the web 450-character limit');
    closeLookup();

    await wait(650);
    localStorage.removeItem('kiki_ai_key');
    gesture('emotion');
    await wait();
    check(card().classList.contains('show') && !!card().querySelector('.kiki-card-open-ai-cfg-btn'), 'Missing AI key shows configuration UI');
    check(localStorage.getItem('kiki_web_lookup_key') === 'alt', 'Configured trigger key preserved');
    closeLookup();
  } catch (error) {
    results.push({ label: error.stack || error.message, passed: false });
  }
  window.kikiTestResults = results;
  document.getElementById('results').dataset.results = JSON.stringify(results);
  document.getElementById('results').textContent = results.map(r => (r.passed ? 'PASS ' : 'FAIL ') + r.label).join('\n');
})();
