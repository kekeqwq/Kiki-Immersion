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
    let urlVid = "";
    try { urlVid = new URL(url, location.href).searchParams.get("v") || ""; } catch {}
    const currentId = urlVid || videoId();
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
              let urlVid = "";
              try { urlVid = new URL(url, location.href).searchParams.get("v") || ""; } catch {}
              capturedVideoId = urlVid || videoId();
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
          if (this.responseType === "" || this.responseType === "text") {
            body = this.responseText || "";
          } else if (this.responseType === "json") {
            body = typeof this.response === "string" ? this.response : JSON.stringify(this.response || "");
          } else if (this.responseType === "arraybuffer" && this.response) {
            body = new TextDecoder().decode(this.response);
          } else if (this.responseType === "blob" && this.response) {
            const reqUrl = this.__kikiUrl;
            this.response.text().then((t) => {
              if (t && t.length > 8) {
                let urlVid = "";
                try { urlVid = new URL(reqUrl, location.href).searchParams.get("v") || ""; } catch {}
                capturedVideoId = urlVid || videoId();
                window.__kikiLastBody = t;
              }
            }).catch(() => {});
          }
        } catch {}
        if (body && body.length > 8) {
          let urlVid = "";
          try { urlVid = new URL(this.__kikiUrl, location.href).searchParams.get("v") || ""; } catch {}
          capturedVideoId = urlVid || videoId();
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
        if (r && tracksFrom(r).length) return r;
      }
    } catch {}
    if (window.ytInitialPlayerResponse && tracksFrom(window.ytInitialPlayerResponse).length) {
      return window.ytInitialPlayerResponse;
    }
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

  function isPlayerReady() {
    const p = player();
    if (p && typeof p.loadModule === "function") {
      try { p.loadModule("captions"); } catch {}
    }
    return !!(
      p &&
      typeof p.getPlayerResponse === "function" &&
      (typeof p.loadModule === "function" || typeof p.getOption === "function")
    );
  }

  async function waitForPlayerReady(timeout = 4000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (isPlayerReady()) return true;
      await sleep(150);
    }
    return isPlayerReady();
  }

  function nudgeCaptions(lang) {
    try {
      const p = player();
      if (!p) return;
      if (typeof p.loadModule === "function") p.loadModule("captions");
      const code = (lang || "en").toLowerCase();
      let track = null;
      if (typeof p.getOption === "function") {
        const list = p.getOption("captions", "tracklist") || [];
        track =
          list.find((t) => (t.languageCode || "").toLowerCase() === code) ||
          list.find((t) => (t.languageCode || "").toLowerCase().startsWith(code.split(/[-_]/)[0])) ||
          list[0];
      }
      if (track && typeof p.setOption === "function") {
        try { p.setOption("captions", "track", track); } catch {}
      } else if (typeof p.setOption === "function") {
        try { p.setOption("captions", "track", { languageCode: code }); } catch {}
      }
      if (typeof p.setOption === "function") {
        try { p.setOption("captions", "reload", true); } catch {}
      }
      const ccBtn = document.querySelector(".ytp-subtitles-button");
      if (ccBtn && ccBtn.getAttribute("aria-pressed") === "false") {
        ccBtn.click();
      }
    } catch {}
  }

  async function fetchExact(url) {
    selfFetching++;
    const errors = [];
    try {
      for (const fmt of [null, "json3", "srv3", "vtt", "srv1"]) {
        try {
          const u = new URL(url, location.href);
          if (fmt !== null) {
            u.searchParams.set("fmt", fmt);
          }
          const res = await origFetch.call(window, u.toString(), {
            credentials: "include",
            cache: "no-store",
            headers: { accept: "text/vtt, text/plain, application/json, */*" }
          });
          const txt = await res.text();
          if (!res.ok) {
            errors.push((fmt || "raw") + ":http " + res.status);
            continue;
          }
          if (!txt || !txt.trim()) {
            errors.push((fmt || "raw") + ":empty");
            if (fmt === null) break;
            continue;
          }
          return txt;
        } catch (e) {
          errors.push((fmt || "raw") + ":" + (e && e.message ? e.message : e));
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
    let urlVid = "";
    try { urlVid = (baseUrl && new URL(baseUrl, location.href).searchParams.get("v")) || ""; } catch {}
    const currentId = urlVid || videoId();
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
      try {
        const raw = await fetchExact(baseUrl);
        if (raw && raw.trim().length > 20) {
          return { raw, via: "track-url" };
        }
      } catch (e) {
        errors.push(String(e.message || e));
      }
    }

    await waitForPlayerReady(3000);
    nudgeCaptions(wantLang);

    for (let i = 0; i < 20; i++) {
      if (window.__kikiLastBody && window.__kikiLastBody.trim().length > 20) {
        return { raw: window.__kikiLastBody, via: "wire-body" };
      }
      if (sourceUrl || lastUrl) {
        try {
          const raw = await fetchExact(sourceUrl || lastUrl);
          if (raw && raw.trim().length > 20) {
            return { raw, via: "captured-pot" };
          }
        } catch (e) {
          errors.push(String(e.message || e));
        }
      }
      if (i === 1 || i === 4 || i === 8 || i === 14) {
        nudgeCaptions(wantLang);
      }
      await sleep(200);
    }

    if (window.__kikiLastBody && window.__kikiLastBody.trim().length > 20) {
      return { raw: window.__kikiLastBody, via: "wire-body" };
    }

    try {
      const tracks = await innertubeTracks(videoId());
      const want = (wantLang || "").toLowerCase();
      const pick =
        tracks.find((t) => (t.languageCode || "").toLowerCase().startsWith(want) && t.kind !== "asr") ||
        tracks.find((t) => (t.languageCode || "").toLowerCase().startsWith(want)) ||
        tracks[0];
      if (pick && pick.baseUrl) {
        const raw = await fetchExact(pick.baseUrl);
        if (raw && raw.trim().length > 20) {
          return { raw, via: "innertube" };
        }
      }
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
        let tracks = [];
        try {
          const p = player();
          const tl = p && p.getOption && p.getOption("captions", "tracklist");
          if (Array.isArray(tl) && tl.length) {
            tracks = tl.map(summarize);
          }
        } catch {}
        if (!tracks.length) {
          tracks = tracksFrom(playerResponse()).map(summarize);
        }
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
        reply(d.id, { ok: true, type: "list", tracks, videoId: videoId(), audioLang, currentLang, ready: isPlayerReady() });
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
