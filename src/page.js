(() => {
  if (window.__kikiPage) return;
  window.__kikiPage = true;

  const MARK = "/api/timedtext";
  let sourceUrl = "";
  let lastUrl = "";
  let selfFetching = 0;

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
            if (t && t.trim().length > 8) window.__kikiLastBody = t;
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
        if (body && body.length > 8) window.__kikiLastBody = body;
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
    try {
      const u = new URL(url, location.href);
      u.searchParams.set("fmt", "json3");
      const res = await origFetch.call(window, u.toString(), { credentials: "include", cache: "no-store" });
      const txt = await res.text();
      if (!res.ok) throw new Error("http " + res.status);
      if (!txt || !txt.trim()) throw new Error("empty body");
      return txt;
    } finally {
      selfFetching--;
    }
  }

  async function androidTracks(id) {
    const key = (window.ytcfg && window.ytcfg.get && window.ytcfg.get("INNERTUBE_API_KEY")) || "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
    const res = await origFetch.call(window, "https://www.youtube.com/youtubei/v1/player?prettyPrint=false&key=" + encodeURIComponent(key), {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: "19.29.37",
            androidSdkVersion: 30,
            hl: "en",
            gl: "US"
          }
        },
        videoId: id,
        contentCheckOk: true,
        racyCheckOk: true
      })
    });
    return tracksFrom(await res.json());
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async function loadCaption(wantLang) {
    if (window.__kikiLastBody && window.__kikiLastBody.trim().length > 20) {
      return { raw: window.__kikiLastBody, via: "wire-body" };
    }
    nudgeCaptions(wantLang);
    for (let i = 0; i < 16; i++) {
      if (sourceUrl) break;
      if (i === 3 || i === 8) nudgeCaptions(wantLang);
      await sleep(350);
    }
    const url = sourceUrl || lastUrl;
    if (url) return { raw: await fetchExact(url), via: "captured-pot" };

    const tracks = await androidTracks(videoId());
    const pick =
      tracks.find((t) => (t.languageCode || "").startsWith(wantLang || "en") && t.kind !== "asr") ||
      tracks.find((t) => (t.languageCode || "").startsWith(wantLang || "en")) ||
      tracks[0];
    if (!pick || !pick.baseUrl) throw new Error("no captured timedtext");
    return { raw: await fetchExact(pick.baseUrl), via: "android" };
  }

  window.addEventListener("message", async (ev) => {
    const d = ev.data;
    if (!d || d.source !== "kiki-content") return;
    try {
      if (d.type === "list") {
        let tracks = tracksFrom(playerResponse()).map(summarize);
        if (!tracks.length) {
          try { tracks = (await androidTracks(videoId())).map(summarize); } catch {}
        }
        reply(d.id, { ok: true, type: "list", tracks, videoId: videoId() });
      } else if (d.type === "fetch") {
        const out = await loadCaption(d.lang);
        reply(d.id, { ok: true, type: "fetch", raw: out.raw, via: out.via });
      }
    } catch (e) {
      reply(d.id, { ok: false, type: d.type, error: String(e && e.message ? e.message : e) });
    }
  });
})();
