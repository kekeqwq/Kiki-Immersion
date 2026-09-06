(() => {
  if (window.__kikiPage) return;
  window.__kikiPage = true;

  const MARK = "/api/timedtext";
  let sourceUrl = "";
  let lastUrl = "";
  let selfFetching = 0;
  let capturedVideoId = "";

  function player() {
    return document.querySelector("#movie_player") || document.querySelector(".html5-video-player");
  }

  function videoId() {
    try { return new URL(location.href).searchParams.get("v") || ""; } catch { return ""; }
  }

  function isTimedtext(url) {
    return typeof url === "string" && url.includes(MARK);
  }

  function hasTlang(url) {
    try { return !!new URL(url, location.href).searchParams.get("tlang"); } catch { return false; }
  }

  function noteUrl(url) {
    if (!isTimedtext(url) || selfFetching) return;
    const currentId = videoId();
    if (capturedVideoId && currentId && capturedVideoId !== currentId) {
      sourceUrl = "";
      lastUrl = "";
      window.__kikiLastBody = "";
    }
    capturedVideoId = currentId;
    lastUrl = url;
    if (!hasTlang(url)) sourceUrl = url;
  }

  const origFetch = window.fetch;
  window.fetch = function (...args) {
    try {
      const req = args[0];
      noteUrl(typeof req === "string" ? req : req && req.url);
    } catch {}
    const p = origFetch.apply(this, args);
    try {
      const req = args[0];
      const url = typeof req === "string" ? req : req && req.url;
      if (isTimedtext(url) && !selfFetching) {
        p.then((res) => {
          res.clone().text().then((t) => {
            if (t && t.trim().length > 8) {
              capturedVideoId = videoId();
              window.__kikiLastBody = t;
            }
          }).catch(() => {});
        }).catch(() => {});
      }
    } catch {}
    return p;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__kikiUrl = typeof url === "string" ? url : "";
    noteUrl(this.__kikiUrl);
    return origOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", function () {
      try {
        if (!isTimedtext(this.__kikiUrl) || selfFetching) return;
        let body = "";
        try {
          if (this.responseType === "" || this.responseType === "text") body = this.responseText || "";
          else if (this.responseType === "json") body = JSON.stringify(this.response || "");
        } catch {}
        if (body && body.length > 8) {
          capturedVideoId = videoId();
          window.__kikiLastBody = body;
        }
      } catch {}
    });
    return origSend.apply(this, args);
  };

  try {
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) noteUrl(e.name);
    });
    obs.observe({ type: "resource", buffered: true });
  } catch {}

  function reply(id, payload) {
    window.postMessage({ source: "kiki-page", id, ...payload }, "*");
  }

  function tracksFrom(pr) {
    return pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  }

  function playerResponse() {
    try {
      const p = player();
      if (p && typeof p.getPlayerResponse === "function") {
        const r = p.getPlayerResponse();
        if (r) return r;
      }
    } catch {}
    return window.ytInitialPlayerResponse || null;
  }

  function summarize(t) {
    const name = t.name?.simpleText || t.name?.runs?.map((r) => r.text).join("") || t.languageCode || "track";
    return {
      baseUrl: t.baseUrl,
      languageCode: t.languageCode || "",
      vssId: t.vssId || "",
      kind: t.kind || "",
      name,
      isAsr: t.kind === "asr"
    };
  }

  function nudgeCaptions(lang) {
    try {
      const p = player();
      if (!p) return;
      if (typeof p.loadModule === "function") p.loadModule("captions");
      const code = lang || "en";
      if (typeof p.setOption === "function") {
        try { p.setOption("captions", "track", { languageCode: code }); } catch {}
      }
    } catch {}
  }

  async function fetchExact(url) {
    selfFetching++;
    const errors = [];
    try {
      for (const fmt of ["vtt", "srv3", "json3", "srv1", ""]) {
        try {
          const u = new URL(url, location.href);
          if (fmt) u.searchParams.set("fmt", fmt);
          else u.searchParams.delete("fmt");
          const res = await origFetch.call(window, u.toString(), {
            credentials: "include",
            cache: "no-store",
            headers: { accept: "text/vtt, text/plain, application/json, */*" }
          });
          const txt = await res.text();
          if (!res.ok) {
            errors.push(fmt + ":http " + res.status);
            continue;
          }
          if (!txt || !txt.trim()) {
            errors.push(fmt + ":empty");
            continue;
          }
          return txt;
        } catch (e) {
          errors.push(fmt + ":" + (e && e.message ? e.message : e));
        }
      }
      throw new Error(errors.join(" | ") || "empty body");
    } finally {
      selfFetching--;
    }
  }

  async function innertubeTracks(id) {
    const key = (window.ytcfg && window.ytcfg.get && window.ytcfg.get("INNERTUBE_API_KEY")) || "";
    const clientName = (window.ytcfg && window.ytcfg.get && window.ytcfg.get("INNERTUBE_CLIENT_NAME")) || "WEB";
    const clientVersion = (window.ytcfg && window.ytcfg.get && window.ytcfg.get("INNERTUBE_CLIENT_VERSION")) || "2.20260901.00.00";
    if (!key || !id) return [];
    const res = await origFetch.call(window, "https://www.youtube.com/youtubei/v1/player?prettyPrint=false&key=" + encodeURIComponent(key), {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        context: { client: { clientName, clientVersion, hl: document.documentElement.lang || "en" } },
        videoId: id,
        contentCheckOk: true,
        racyCheckOk: true
      })
    });
    if (!res.ok) return [];
    return tracksFrom(await res.json());
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async function loadCaption(wantLang, baseUrl) {
    const errors = [];
    const currentId = videoId();
    if (capturedVideoId && currentId && capturedVideoId !== currentId) {
      sourceUrl = "";
      lastUrl = "";
      window.__kikiLastBody = "";
      capturedVideoId = currentId;
    }
    if (window.__kikiLastBody && window.__kikiLastBody.trim().length > 20) {
      return { raw: window.__kikiLastBody, via: "wire-body" };
    }
    if (baseUrl) {
      try { return { raw: await fetchExact(baseUrl), via: "track-url" }; }
      catch (e) { errors.push(String(e.message || e)); }
    }
    nudgeCaptions(wantLang);
    for (let i = 0; i < 12; i++) {
      if (sourceUrl || lastUrl) break;
      if (i === 2 || i === 6) nudgeCaptions(wantLang);
      await sleep(280);
    }
    const url = sourceUrl || lastUrl;
    if (url) {
      try { return { raw: await fetchExact(url), via: "captured-pot" }; }
      catch (e) { errors.push(String(e.message || e)); }
    }
    sourceUrl = "";
    lastUrl = "";
    nudgeCaptions(wantLang);
    await sleep(500);
    const retryUrl = sourceUrl || lastUrl;
    if (retryUrl) {
      try { return { raw: await fetchExact(retryUrl), via: "captured-retry" }; }
      catch (e) { errors.push(String(e.message || e)); }
    }
    try {
      const tracks = await innertubeTracks(videoId());
      const want = (wantLang || "").toLowerCase();
      const pick =
        tracks.find((t) => (t.languageCode || "").toLowerCase().startsWith(want) && t.kind !== "asr") ||
        tracks.find((t) => (t.languageCode || "").toLowerCase().startsWith(want)) ||
        tracks[0];
      if (pick && pick.baseUrl) return { raw: await fetchExact(pick.baseUrl), via: "innertube" };
    } catch (e) {
      errors.push(String(e.message || e));
    }
    throw new Error(errors.filter(Boolean).join(" / ") || "no captured timedtext");
  }

  window.addEventListener("message", async (ev) => {
    const d = ev.data;
    if (!d || d.source !== "kiki-content") return;
    try {
      if (d.type === "list") {
        let tracks = tracksFrom(playerResponse()).map(summarize);
        if (!tracks.length) {
          try { tracks = (await innertubeTracks(videoId())).map(summarize); } catch {}
        }
        const pr = playerResponse();
        let audioLang = pr?.videoDetails?.defaultAudioLanguage || pr?.microformat?.playerMicroformatRenderer?.audioLanguage || "";
        let currentLang = "";
        try {
          const p = player();
          const cur = p && p.getOption && p.getOption("captions", "track");
          currentLang = cur?.languageCode || cur?.language || "";
        } catch {}
        reply(d.id, { ok: true, type: "list", tracks, videoId: videoId(), audioLang, currentLang });
      } else if (d.type === "fetch") {
        const out = await loadCaption(d.lang, d.baseUrl);
        reply(d.id, { ok: true, type: "fetch", raw: out.raw, via: out.via });
      } else if (d.type === "clear") {
        window.__kikiLastBody = "";
        sourceUrl = "";
        lastUrl = "";
        capturedVideoId = "";
        reply(d.id, { ok: true, type: "clear" });
      }
    } catch (e) {
      reply(d.id, { ok: false, type: d.type, error: String(e && e.message ? e.message : e) });
    }
  });
})();
