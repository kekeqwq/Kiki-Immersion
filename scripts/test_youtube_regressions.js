// Executes production functions in a deterministic VM (no YouTube login/network).
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const yt = fs.readFileSync('modules/youtube.js', 'utf8');
const ui = fs.readFileSync('modules/ui.js', 'utf8');
const core = fs.readFileSync('modules/core.js', 'utf8');
let checks = 0;
function check(ok, label) { assert.ok(ok, label); console.log('PASS ' + label); checks++; }
function fn(source, name) {
  const start = source.search(new RegExp('^  (?:async )?function ' + name + '\\(', 'm'));
  assert.notEqual(start, -1, name);
  const end = source.indexOf('\n  }', start);
  return source.slice(start, end + 4);
}
const listeners = new Map(), timers = [];
const box = { textContent: 'OLD SUBTITLE' };
const video = { paused: false, currentTime: 4, readyState: 4, textTracks: [],
  play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; },
  dispatchEvent() { throw new Error('Playback tick must not fake media events'); } };
const state = { enabled: true, videoId: 'A', cues: [], liveCues: [], liveMode: true, theme: 'dark' };
let id = 'A', nativeId = 'A', parsed = [];
const context = vm.createContext({
  console, URL, Event, Date, JSON, Array, Boolean, Math, Set, Map, WeakMap,
  STATE: state, MARK: '/api/timedtext', TIMEDTEXT_MARK: '/api/timedtext',
  location: { href: 'https://www.youtube.com/watch?v=A' },
  document: { getElementById: name => name === 'kiki-captions' ? box : null,
    querySelector: () => null, querySelectorAll: () => [], documentElement: { classList: { add() {} } } },
  setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {},
  currentVideoId: () => id, playerEl: () => ({ getVideoData: () => ({ video_id: nativeId }) }),
  videoEl: () => video, parseAny: () => parsed, getCueText: c => c.text || '',
  capturedBody: 'old body', capturedLastUrl: 'old url', capturedVideoId: 'A', lastPoToken: '',
  lastObservedText: '', liveToastShown: true, lastFailedVideoId: 'A', lastLoadAttemptTime: 123,
  loadingTracks: false, transcriptFetchInProgress: false,
  lastThemeSyncTime: 0, lastLeakedPopupCleanupTime: Date.now(), lastTranscriptAttemptTime: Date.now(),
  updateHud() {}, renderCue() {}, suppressNativeCaptions() {}, toast() {},
  closeLookup(resume) { context.closeResume = resume; state.pausedForLookup = false; },
  waitForPlayer: async () => {}, ensureHud() {}, ensureRoot() {}, ensureCaptionObserver() {},
  bindVideoTrackListeners() {}, loadForVideo: async () => {},
  ensureCaptionsActive() {}, queryCaptionElements: () => [], isDummyCueText: () => false,
  dismissMiniplayer() {}, cleanupLeakedTranscriptPopups() {}, updateCaptionPosition() {}, findIndex: () => -1,
  onNativeCaptionsMutated() {}, seekCue() {}, toggleWebpageFs() {},
  sleep: async () => {}, isLookupOrCardOpen: () => false, closeTranscriptPanelSilently() {},
  detectVideoLanguage: () => 'en', getTrackScore: () => 1,
  window: { addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(callback); } }
});
const top = yt.slice(yt.indexOf('  let videoGeneration'), yt.indexOf('  function currentVideoId'));
vm.runInContext(top, context);
for (const name of ['noteTimedtextUrl', 'applyLoadedCues', 'onCapturedWireBody', 'getLiveCaptionText', 'extractCuesFromVideo', 'tryLoadTranscriptPanel', 'onNavigate', 'tick']) vm.runInContext(fn(yt, name), context);
for (const name of ['playVideoSync', 'pauseVideoSync', 'togglePause']) vm.runInContext(fn(ui, name), context);
vm.runInContext(yt.slice(yt.indexOf('  // Keyboard Shortcuts'), yt.indexOf('  // SPA Navigation Observers')), context);
function dispatch(type, extras = {}) {
  const e = { key: ' ', code: 'Space', target: { tagName: 'DIV', closest: () => null },
    preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; },
    stopPropagation() {}, ...extras };
  for (const callback of listeners.get(type) || []) { callback(e); if (e.stopped) break; }
  return e;
}
(async () => {
  let nativeCalls = 0;
  listeners.get('keydown').push(() => nativeCalls++);
  dispatch('keydown');
  check(video.paused && nativeCalls === 0, 'Space pauses once and excludes a second same-window native handler');
  dispatch('keyup');
  check(video.paused, 'Space keyup does not toggle playback again');
  dispatch('keydown', { repeat: true });
  check(video.paused, 'Held Space auto-repeat does not repeatedly toggle');
  dispatch('keydown');
  check(!video.paused, 'Next Space resumes normally');
  dispatch('keydown', { defaultPrevented: true });
  check(!video.paused, 'Space already handled by an earlier native listener is not toggled twice');
  dispatch('keydown', { target: { tagName: 'INPUT', closest: () => null } });
  check(!video.paused, 'Typing Space in input does not pause');
  dispatch('keydown', { target: { tagName: 'DIV', isContentEditable: true, closest: () => null } });
  check(!video.paused, 'Typing in contenteditable does not pause');
  dispatch('keydown', { target: { tagName: 'BUTTON', closest: () => ({}) } });
  check(!video.paused, 'Focused controls retain their native Space handling');
  context.playVideoSync(); context.pauseVideoSync();
  for (const callback of timers.splice(0)) callback();
  check(video.paused, 'A user pause after play is not undone by a delayed forced-resume timer');

  state.cues = Array.from({ length: 5 }, (_, i) => ({ start: i * 1000, end: i * 1000 + 500, text: 'A' + i }));
  state.liveMode = false; state.idx = -1; video.paused = false;
  context.tick();
  check(!video.paused, 'Periodic playback tick emits no fake seeking/seeked events');

  const sessionA = vm.runInContext('videoSession()', context);
  state.tracks = [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=A' }];
  state.activeTrack = state.tracks[0]; state.liveCues = [{ text: 'A' }];
  state.capturedBody = 'old'; state.capturedLastUrl = 'old'; state.capturedVideoId = 'A';
  context.window.__kiki_capturedBody = 'old'; context.window.__kiki_capturedUrl = 'old';
  state.pausedForLookup = true;
  id = 'B'; context.location.href = 'https://www.youtube.com/watch?v=B';
  await context.onNavigate();
  check(state.cues.length === 0 && state.liveCues.length === 0 && box.textContent === '', 'SPA navigation clears structured, live and rendered subtitles');
  check(state.tracks.length === 0 && !state.activeTrack && !state.capturedBody && !context.capturedBody && !context.window.__kiki_capturedBody, 'SPA navigation invalidates track, wire and loader caches');
  check(context.closeResume === false, 'Navigation dismisses lookup without resuming a different video');
  parsed = Array.from({ length: 5 }, (_, i) => ({ text: 'OLD' + i }));
  context.applyLoadedCues(parsed, 'late fetch', null, sessionA);
  check(state.cues.length === 0, 'Late asynchronous cues from previous video are rejected');
  context.onCapturedWireBody('old wire body long enough for parsing', 'https://www.youtube.com/api/timedtext?v=A');
  check(state.cues.length === 0 && context.capturedBody === '', 'Late previous-video wire body cannot repopulate cache or cues');
  check(context.getLiveCaptionText() === '', 'Native player still reporting the old video cannot supply captions');
  nativeId = 'B';
  context.applyLoadedCues(parsed, 'current fetch', null, vm.runInContext('videoSession()', context));
  check(state.cues.length === 5, 'Current-video subtitles still load');
  id = 'A'; context.location.href = 'https://www.youtube.com/watch?v=A'; nativeId = 'A';
  await context.onNavigate();
  context.applyLoadedCues(parsed, 'old A generation', null, sessionA);
  check(state.cues.length === 0, 'A→B→A navigation rejects the first A generation too');
  id = ''; context.location.href = 'https://www.youtube.com/';
  await context.onNavigate();
  check(state.videoId === '' && state.cues.length === 0 && box.textContent === '', 'Leaving watch page clears captions on home');
  const homeKey = dispatch('keydown');
  check(!homeKey.defaultPrevented, 'Space is not hijacked outside a video page');

  id = 'B'; nativeId = 'B'; context.location.href = 'https://www.youtube.com/watch?v=B';
  await context.onNavigate();
  const segments = label => Array.from({ length: 5 }, (_, i) => ({ transcriptSegmentRenderer: {
    startMs: String(i * 1000), endMs: String(i * 1000 + 900), snippet: { runs: [{ text: label + i }] }
  } }));
  const panel = { data: { content: { transcriptRenderer: { content: { transcriptSearchPanelRenderer: {
    body: { transcriptSegmentListRenderer: { initialSegments: segments('OLD A ') } }
  } } } } }, setAttribute() {}, removeAttribute() {}, querySelectorAll: () => [] };
  context.document.querySelector = selector => selector.includes('engagement-panel') ? panel : null;
  context.lastTranscriptAttemptTime = 0;
  check(await context.tryLoadTranscriptPanel('B') === false && state.cues.length === 0,
    'A reused transcript panel with unchanged previous-video text is rejected');
  context.lastTranscriptAttemptTime = 0;
  context.sleep = async () => {
    panel.data.content.transcriptRenderer.content.transcriptSearchPanelRenderer.body.transcriptSegmentListRenderer.initialSegments = segments('NEW B ');
  };
  check(await context.tryLoadTranscriptPanel('B') === true && state.cues[0].text === 'NEW B 0',
    'A fresh current-video transcript response is accepted');
  context.document.querySelector = () => null;

  // An actual pending loader may finish after the next navigation.
  state.cues = []; state.liveMode = true;
  context.getAllCaptionTracks = () => [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=B', languageCode: 'en' }];
  let resolveOldFetch;
  context.fetchExact = () => new Promise(resolve => { resolveOldFetch = resolve; });
  const savedLoad = context.loadForVideo;
  vm.runInContext(fn(yt, 'loadForVideo'), context);
  const pendingLoad = context.loadForVideo();
  id = 'C'; nativeId = 'C'; context.location.href = 'https://www.youtube.com/watch?v=C';
  context.loadForVideo = savedLoad; // Do not start a new loader in onNavigate.
  await context.onNavigate();
  resolveOldFetch('old B response long enough');
  await pendingLoad;
  check(state.videoId === 'C' && state.cues.length === 0 && state.loadingTracks === false,
    'An in-flight previous-video fetch cannot restore subtitles or loading flags');

  const oldTrack = { kind: 'subtitles', mode: 'showing', activeCues: [], cues: Array.from({ length: 5 }, (_, i) => ({ startTime: i, endTime: i + 0.8, text: 'C old ' + i })) };
  video.textTracks = [oldTrack];
  id = 'D'; nativeId = 'D'; context.location.href = 'https://www.youtube.com/watch?v=D';
  await context.onNavigate();
  check(context.extractCuesFromVideo().length === 0, 'Reused native textTracks cannot import previous-video cue lists');
  oldTrack.cues = oldTrack.cues.map(c => ({ ...c, text: 'D fresh ' + c.startTime }));
  check(context.extractCuesFromVideo().length === 5, 'Fresh native track cues remain available after a video switch');
  video.textTracks = []; state.cues = []; state.liveMode = true;
  context.lastObservedText = state.lastObservedText = 'last live line';
  box.textContent = 'last live line';
  context.lastSelfHealFetchTime = 0;
  vm.runInContext(fn(yt, 'onNativeCaptionsMutated'), context);
  context.onNativeCaptionsMutated();
  check(box.textContent === '' && state.lastObservedText === '', 'An empty live subtitle clears the previous rendered line');

  // Core wire/resource cache filtering is tested independently of adapter hooks.
  context.window.noteTimedtextUrl = undefined;
  for (const name of ['noteTimedtextUrl', 'checkResourceTimingForTimedtext', 'handleCapturedWire']) vm.runInContext(fn(core, name), context);
  id = 'B'; context.location.href = 'https://www.youtube.com/watch?v=B';
  context.performance = { getEntriesByType: () => [{ name: 'https://www.youtube.com/api/timedtext?v=A' }] };
  check(context.checkResourceTimingForTimedtext() === '', 'ResourceTiming cannot rediscover the previous video URL');
  state.capturedBody = '';
  context.handleCapturedWire('old response body long enough', 'https://www.youtube.com/api/timedtext?v=A');
  check(state.capturedBody === '', 'Core sniffer rejects old responses before mutating shared state');
  console.log(`${checks} YouTube regression checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
