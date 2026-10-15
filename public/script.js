(() => {
  const M = window.Motion;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const useMotion = !!M && !reduceMotion;

  // ----- Momentum (inertia) scrolling -----
  let lenis = null;
  if (window.Lenis && !reduceMotion) {
    lenis = new window.Lenis({ lerp: 0.08, wheelMultiplier: 1, smoothWheel: true });
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

  const audio = $("#audio");
  const playBtn = $("#playBtn");
  const wave = $("#wave");
  const timeEl = $("#time");
  const toast = $("#toast");
  const likeBtn = $("#likeBtn");
  const rain = $("#rain");
  const card = $("#card");
  const headline = $("#headline");

  // ----- Waveform from the real audio -----
  // Each bar is the RMS loudness of an equal time slice, so bar i covers
  // [i/N, (i+1)/N] of the track and lines up with the playback timeline.
  const BAR_COUNT = 64;
  // Precomputed from audio/loi-chuc.m4a; used when the file can't be decoded
  // in the browser (e.g. opening index.html straight from disk blocks fetch).
  const FALLBACK_PEAKS = [0.245,0.35,0.544,0.551,0.501,0.349,0.305,0.259,0.122,0.048,0.153,0.087,0.096,0.33,0.182,0.217,0.214,0.222,0.221,0.329,0.297,0.333,0.285,0.198,0.036,0.011,0.038,0.508,0.164,0.254,0.402,1,0.32,0.01,0.008,0.002,0.002,0.002,0.002,0.002,0.002,0.003,0.023,0.814,0.437,0.504,0.317,0.178,0.21,0.242,0.189,0.23,0.167,0.276,0.211,0.013,0.003,0.002,0.002,0.002,0.002,0.002,0.002,0.002];

  const baseLayer = document.createElement("div");
  const fillLayer = document.createElement("div");
  baseLayer.className = "wave__layer wave__base";
  fillLayer.className = "wave__layer wave__fill";
  wave.append(baseLayer, fillLayer);

  const bars = [];
  const fillBars = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    bars.push(baseLayer.appendChild(document.createElement("i")));
    fillBars.push(fillLayer.appendChild(document.createElement("i")));
  }

  // Voice timeline: which slices actually contain speech. The lyric reveal
  // only advances through voiced slices, so it pauses on silences/commas.
  const VOICE_THRESHOLD = 0.05;
  let voiced = [];
  let voicedCum = [];
  let voicedTotal = 1;

  const drawPeaks = (peaks) => {
    peaks.forEach((v, i) => {
      // Gentle curve so quiet speech is still visible; silence stays a small dot
      const h = v < 0.02 ? 0 : 12 + 88 * Math.pow(v, 0.75);
      bars[i].style.height = fillBars[i].style.height = h + "%";
    });
    voiced = peaks.map((v) => (v > VOICE_THRESHOLD ? 1 : 0));
    voicedCum = [];
    let sum = 0;
    voiced.forEach((w) => { voicedCum.push(sum); sum += w; });
    voicedTotal = sum || 1;
  };

  // Map playback progress (0–1) to "how much has been spoken" (0–1)
  const spokenAt = (p) => {
    const x = Math.min(Math.max(p, 0), 1) * voiced.length;
    const i = Math.min(Math.floor(x), voiced.length - 1);
    return Math.min(1, (voicedCum[i] + voiced[i] * (x - i)) / voicedTotal);
  };
  drawPeaks(FALLBACK_PEAKS);

  const computePeaks = (buf, n) => {
    const ch = buf.getChannelData(0);
    const step = Math.floor(ch.length / n);
    const out = [];
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = i * step; j < (i + 1) * step; j++) sum += ch[j] * ch[j];
      out.push(Math.sqrt(sum / step));
    }
    const max = Math.max(...out) || 1;
    return out.map((v) => v / max);
  };

  // Decode the actual file when possible (works when served over http/https)
  fetch(audio.currentSrc || audio.src)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
    .then((data) => new OfflineAudioContext(1, 1, 44100).decodeAudioData(data))
    .then((buf) => drawPeaks(computePeaks(buf, BAR_COUNT)))
    .catch(() => {});

  // Split text into word spans so they can be staggered in. Heart icons count
  // as their own "word"; other inline elements are split recursively.
  const splitWords = (root, words = []) => {
    Array.from(root.childNodes).forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName === "BR" || node instanceof SVGElement) return;
        if (/heart/.test(node.className)) words.push(node);
        else splitWords(node, words);
        return;
      }
      if (node.nodeType !== Node.TEXT_NODE) return;
      const frag = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
        const w = document.createElement("span");
        w.className = "w";
        w.textContent = part;
        frag.appendChild(w);
        words.push(w);
      });
      node.replaceWith(frag);
    });
    return words;
  };
  const lead = $("#lead");
  const words = splitWords(headline);
  const leadWords = splitWords(lead);

  // ----- Gentle arch on the headline -----
  // Each character sits on a shallow ∩ curve per line: lifted in the middle,
  // dipping and tilting towards the ends. Uses CSS translate/rotate so it
  // composes with the Motion entrance transforms on the word spans.
  const ARCH_DEPTH = 0.22; // edge drop as a fraction of the font size
  const archChars = [];
  words.forEach((w) => {
    if (!w.classList.contains("w")) { archChars.push(w); return; }
    const text = w.textContent;
    w.textContent = "";
    for (const ch of text) {
      const s = document.createElement("span");
      s.className = "hc";
      s.textContent = ch;
      w.appendChild(s);
      archChars.push(s);
    }
  });

  const arch = () => {
    const fs = parseFloat(getComputedStyle(headline).fontSize);
    const half = headline.clientWidth / 2;
    const depth = fs * ARCH_DEPTH;
    archChars.forEach((c) => {
      // Layout offsets (relative to the headline) ignore the Motion
      // transforms that may still be running on the words.
      let x = c.offsetWidth / 2;
      for (let n = c; n && n !== headline; n = n.offsetParent) x += n.offsetLeft;
      const u = (x - half) / half; // -1 … 1 across the headline
      const y = depth * u * u;
      const angle = Math.atan((2 * depth * u) / half) * (180 / Math.PI);
      c.style.translate = `0 ${y.toFixed(2)}px`;
      c.style.rotate = `${angle.toFixed(2)}deg`;
    });
  };
  document.fonts.ready.then(arch);
  let archTimer;
  window.addEventListener("resize", () => {
    clearTimeout(archTimer);
    archTimer = setTimeout(arch, 120);
  });

  // =========================================================
  // Motion animations
  // =========================================================
  const spring = (bounce = 0.4, duration = 0.8) => ({ type: "spring", bounce, duration });
  const loop = (duration, extra = {}) => ({ duration, repeat: Infinity, repeatType: "mirror", ease: "easeInOut", ...extra });

  let playEntrance = () => {};
  if (useMotion) {
    const { animate, stagger, inView, scroll } = M;

    // Hand the hidden state over from the CSS class to inline styles
    $$("[data-a]").forEach((el) => { el.style.opacity = "0"; });
    [...words, ...leadWords].forEach((w) => { w.style.opacity = "0"; });
    document.documentElement.classList.remove("anim");

    // Entrance runs once the intro splash is dismissed
    playEntrance = () => {
      // --- Hero entrance ---
      const girlWrap = $(".hero__girl-wrap");
      animate(girlWrap, { opacity: [0, 1], scale: [0.6, 1], y: [50, 0] }, spring(0.45, 1));
      animate($(".hero__girl"), { rotate: [-1.4, 1.4], y: [0, -5] }, loop(2.6, { delay: 1 }));

      $$(".float-heart").forEach((h, i) => {
        const target = [1, 0.7, 0.6][i];
        animate(h, { opacity: [0, target], scale: [0, 1] }, { ...spring(0.6, 0.7), delay: 0.5 + i * 0.12 });
        animate(h, { y: [0, -10 - i * 3], x: [0, i % 2 ? 4 : -4] }, loop(2 + i * 0.6, { delay: 1 + i * 0.2 }));
      });

      animate(".spark", { opacity: [0, 1], scale: [0, 1] }, { ...spring(0.5, 0.6), delay: stagger(0.08, { startDelay: 0.7 }) });
      animate(".spark", { opacity: [1, 0.35] }, loop(1.2, { delay: stagger(0.3, { startDelay: 1.5 }) }));

      const note = $(".hero__note");
      animate(note, { opacity: [0, 1], scale: [0.4, 1], x: [30, 0] }, { ...spring(0.5, 0.8), delay: 0.85 });
      const line = $(".hero__note-line .draw");
      const len = line.getTotalLength();
      line.style.strokeDasharray = String(len);
      line.style.strokeDashoffset = String(len);
      animate(len, 0, {
        duration: 0.7, delay: 1.3, ease: "easeOut",
        onUpdate: (v) => { line.style.strokeDashoffset = String(v); },
      });
      const noteHeart = $(".hero__note-line .note-heart");
      noteHeart.style.transformBox = "fill-box";
      noteHeart.style.transformOrigin = "center";
      animate(noteHeart, { scale: [0, 1.4, 1] }, { duration: 0.5, delay: 1.9 });


      // --- Date + headline + lead ---
      animate(".date-band", { opacity: [0, 1], scale: [0.5, 1] }, { ...spring(0.55, 0.8), delay: 0.95 });
      $$(".mini-flower").forEach((f, i) => {
        f.style.transformOrigin = "50% 100%";
        animate(f, { rotate: i ? [8, -8] : [-8, 8] }, loop(1.6, { delay: 1.4 }));
      });

      headline.style.opacity = "1";
      animate(words, { opacity: [0, 1], y: [28, 0], filter: ["blur(6px)", "blur(0px)"] },
        { duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: stagger(0.07, { startDelay: 1.15 }) });

      const beat = (el, delay = 0) =>
        animate(el, { scale: [1, 1.25, 1, 1.12, 1] }, { duration: 1.2, repeat: Infinity, repeatDelay: 0.5, delay });
      beat($(".headline__heart"), 2);

      // "Words pull up": each word rises 20px and fades in, one after another
      lead.style.opacity = "1";
      animate(leadWords, { y: [20, 0] }, { type: "spring", stiffness: 500, damping: 25, delay: stagger(0.08, { startDelay: 1.7 }) });
      animate(leadWords, { opacity: [0, 1] }, { duration: 0.35, delay: stagger(0.08, { startDelay: 1.7 }) });
      const leadDone = 1.7 + leadWords.length * 0.08;
      // Hand-drawn underline is "drawn" the same way as the hero note line
      const leadLine = $(".lead__line .draw");
      leadLine.style.strokeDashoffset = "1";
      animate(1, 0, {
        duration: 0.7, delay: leadDone - 0.2, ease: "easeOut",
        onUpdate: (v) => { leadLine.style.strokeDashoffset = String(v); },
      });
      animate(".lead__heart", { scale: [1, 1.3] }, loop(0.7, { delay: leadDone + 0.2 }));

      // --- Card: scroll into view ---
      inView(card, () => {
        animate(card, { opacity: [0, 1], y: [60, 0], scale: [0.94, 1] }, spring(0.35, 0.9));
        animate(playBtn, { scale: [0, 1], rotate: [-90, 0] }, { ...spring(0.55, 0.8), delay: 0.25 });
        animate(bars, { scaleY: [0, 1] }, { duration: 0.45, ease: "easeOut", delay: stagger(0.012, { startDelay: 0.3, from: "center" }) });
        animate(timeEl, { opacity: [0, 1], x: [16, 0] }, { duration: 0.5, delay: 0.5 });
        animate(".wish", { opacity: [0, 1], y: [14, 0] }, { duration: 0.6, delay: 0.55 });
        animate(".sender", { opacity: [0, 1], x: [-24, 0] }, { ...spring(0.4, 0.7), delay: 0.75 });
        animate("#shareBtn", { scale: [0, 1], y: [10, 0] }, { ...spring(0.6, 0.8), delay: 0.95 });
        animate(likeBtn, { scale: [0, 1], rotate: [-40, 0] }, { ...spring(0.6, 0.8), delay: 1.05 });
      }, { amount: 0.25 });

      // --- Footer ---
      inView("#thanks", ({ target }) => {
        animate(target,{ opacity: [0, 1], y: [30, 0] }, { duration: 0.7, ease: "easeOut" });
        animate(".thanks__rule span", { scaleX: [0, 1] }, { duration: 0.6, delay: 0.25, ease: "easeOut" });
        beat($(".thanks__heart"), 0.6);
        beat($(".thanks__rule b"), 1);
      }, { amount: 0.4 });
    };

    // --- Gentle parallax on the hero while scrolling ---
    const hero = $("#hero");
    scroll(() => {
      const y = window.scrollY;
      hero.style.transform = `translateY(${y * 0.18}px)`;
      hero.style.opacity = String(Math.max(0.35, 1 - y / 900));
    });

    // --- Card tilt on mouse ---
    if (window.matchMedia("(hover: hover)").matches) {
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        animate(card, { rotateX: -py * 6, rotateY: px * 8, transformPerspective: 900 }, { duration: 0.3 });
      });
      card.addEventListener("pointerleave", () => {
        animate(card, { rotateX: 0, rotateY: 0 }, spring(0.5, 0.6));
      });
    }
  } else {
    document.documentElement.classList.remove("anim");
  }

  // =========================================================
  // Audio player
  // =========================================================
  const fmt = (s) => {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
  };

  // ----- Lyric reveal: split the wish into characters -----
  const wish = $(".wish");
  const chars = [];
  const splitChars = (root) => {
    Array.from(root.childNodes).forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) { splitChars(node); return; }
      if (node.nodeType !== Node.TEXT_NODE) return;
      const frag = document.createDocumentFragment();
      // Collapse the source indentation so the text wraps like normal prose
      const text = node.textContent.replace(/\s+/g, " ");
      for (const ch of text) {
        if (ch === " ") { frag.appendChild(document.createTextNode(" ")); continue; }
        const s = document.createElement("span");
        s.className = "c";
        s.textContent = ch;
        frag.appendChild(s);
        chars.push(s);
      }
      node.replaceWith(frag);
    });
  };
  splitChars(wish);
  const charFill = new Array(chars.length).fill(-1);

  const paintLyric = (amount) => {
    // amount: 0–1 of the text revealed; the boundary character is part-filled
    const pos = amount * chars.length;
    chars.forEach((c, i) => {
      const f = Math.round(Math.min(1, Math.max(0, pos - i)) * 100);
      if (f !== charFill[i]) {
        charFill[i] = f;
        c.style.setProperty("--f", f + "%");
      }
    });
  };

  const paint = () => {
    const p = audio.duration ? audio.currentTime / audio.duration : 0;
    fillLayer.style.setProperty("--p", (p * 100).toFixed(3) + "%");
    // Before the first play (and after it ends) the wish stays fully readable
    const started = !audio.paused || audio.currentTime > 0;
    wish.classList.toggle("is-revealing", started);
    paintLyric(started ? spokenAt(p) : 1);
    wave.setAttribute("aria-valuenow", String(Math.round(p * 100)));
    timeEl.textContent = audio.paused && audio.currentTime === 0
      ? fmt(audio.duration)
      : fmt(audio.currentTime);
  };

  let toastTimer;
  const showToast = (msg) => {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
  };

  // timeupdate only fires ~4×/s, so follow the playhead every frame while playing
  let rafId = 0;
  const tick = () => {
    paint();
    rafId = requestAnimationFrame(tick);
  };

  const setPlaying = (on) => {
    playBtn.classList.toggle("is-playing", on);
    playBtn.setAttribute("aria-label", on ? "Tạm dừng" : "Phát lời chúc");
    if (useMotion) M.animate(playBtn.querySelector(on ? ".icon-pause" : ".icon-play"), { scale: [0.3, 1], rotate: [-90, 0] }, spring(0.5, 0.5));
    cancelAnimationFrame(rafId);
    if (on) tick();
    else paint();
  };

  let audioMissing = false;
  audio.addEventListener("error", () => { audioMissing = true; });
  audio.addEventListener("loadedmetadata", paint);
  audio.addEventListener("timeupdate", paint);
  audio.addEventListener("play", () => { setPlaying(true); heartRain(18); });
  audio.addEventListener("pause", () => setPlaying(false));
  audio.addEventListener("ended", () => {
    audio.currentTime = 0;
    paint();
    heartRain(36);
  });

  playBtn.addEventListener("click", () => {
    if (useMotion) M.animate(playBtn, { scale: [0.85, 1] }, spring(0.6, 0.5));
    if (audioMissing) {
      showToast("Không tải được file ghi âm audio/loi-chuc.m4a");
      return;
    }
    if (audio.paused) {
      audio.play().catch(() => showToast("Không phát được ghi âm, thử lại nhé!"));
    } else {
      audio.pause();
    }
  });

  // Seek by clicking / dragging on the waveform
  const seekTo = (clientX) => {
    if (!audio.duration) return;
    const r = wave.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    audio.currentTime = p * audio.duration;
    paint();
  };
  wave.addEventListener("pointerdown", (e) => {
    seekTo(e.clientX);
    wave.setPointerCapture(e.pointerId);
  });
  wave.addEventListener("pointermove", (e) => {
    if (wave.hasPointerCapture(e.pointerId)) seekTo(e.clientX);
  });
  wave.addEventListener("keydown", (e) => {
    if (!audio.duration) return;
    if (e.key === "ArrowRight") audio.currentTime = Math.min(audio.duration, audio.currentTime + 3);
    else if (e.key === "ArrowLeft") audio.currentTime = Math.max(0, audio.currentTime - 3);
    else if (e.key === " " || e.key === "Enter") { e.preventDefault(); playBtn.click(); }
    else return;
    paint();
  });

  // ----- Like button: pop + burst of little hearts -----
  likeBtn.addEventListener("click", () => {
    const on = likeBtn.getAttribute("aria-pressed") !== "true";
    likeBtn.setAttribute("aria-pressed", String(on));
    if (!useMotion) return;
    M.animate(likeBtn.querySelector("svg"), { scale: on ? [0.6, 1.35, 1] : [1, 0.8, 1] }, { duration: 0.45 });
    if (on) {
      burst(likeBtn, 10);
      heartRain(14);
    }
  });

  // ----- Share: native share sheet, falling back to copying the link -----
  const shareBtn = $("#shareBtn");
  const shareData = {
    title: document.title,
    text: "Mẹ ơi, con có một lời chúc nhỏ dành cho mẹ! Mẹ bấm nghe nhé ♥",
    url: location.href.split("#")[0],
  };

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Older browsers / insecure contexts
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    }
  };

  // Web Share only accepts http(s) URLs; Chrome on Windows kills the tab
  // (RESULT_CODE_KILLED_BAD_MESSAGE) when given a file:// URL.
  const isWeb = /^https?:$/.test(location.protocol);

  shareBtn.addEventListener("click", async () => {
    if (useMotion) M.animate(shareBtn.querySelector("svg"), { y: [0, -5, 0], scale: [1, 1.15, 1] }, { duration: 0.4 });
    if (!isWeb) {
      showToast("Chia sẻ sẽ hoạt động khi trang được đưa lên web (http/https)");
      return;
    }
    if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if (err.name === "AbortError") return; // user closed the share sheet
      }
    }
    showToast((await copyText(shareData.url)) ? "Đã sao chép liên kết ♥" : "Không sao chép được liên kết");
  });

  function burst(origin, n) {
    const r = origin.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    for (let i = 0; i < n; i++) {
      const h = document.createElement("span");
      h.textContent = "♥";
      h.style.left = cx + "px";
      h.style.top = cy + "px";
      h.style.fontSize = 10 + Math.random() * 8 + "px";
      rain.appendChild(h);
      const a = (i / n) * Math.PI * 2;
      const d = 36 + Math.random() * 26;
      M.animate(h, {
        x: [0, Math.cos(a) * d],
        y: [0, Math.sin(a) * d],
        scale: [0, 1.2, 0.6],
        opacity: [1, 1, 0],
      }, { duration: 0.8, ease: "easeOut" }).then(() => h.remove());
    }
  }

  // ----- Falling hearts -----
  function heartRain(n) {
    if (!useMotion) return;
    const H = window.innerHeight;
    for (let i = 0; i < n; i++) {
      const h = document.createElement("span");
      h.textContent = Math.random() > 0.3 ? "♥" : "♡";
      h.style.left = Math.random() * 100 + "vw";
      h.style.fontSize = 10 + Math.random() * 18 + "px";
      rain.appendChild(h);
      const drift = (Math.random() - 0.5) * 120;
      M.animate(h, {
        y: [0, H + 80],
        x: [0, drift * 0.5, drift],
        rotate: [0, (Math.random() - 0.5) * 160],
        opacity: [0, 0.5 + Math.random() * 0.5, 0.9, 0],
      }, {
        duration: 3 + Math.random() * 3,
        delay: Math.random() * 1.2,
        ease: "linear",
      }).then(() => h.remove());
    }
  }

  // =========================================================
  // Intro splash
  // =========================================================
  const intro = $("#intro");
  const introOpen = $("#introOpen");
  const introTitle = $("#introTitle");
  const introStars = $("#introStars");
  const introHearts = $("#introHearts");
  let introClosed = false;
  let heartTimer = 0;

  if (lenis) lenis.stop();

  // Twinkling stars scattered around the screen
  const STAR_COLORS = ["#fff", "#fff", "#ffe7a8", "#ffd1dc"];
  for (let i = 0; i < 34; i++) {
    const s = document.createElement("span");
    s.style.left = Math.random() * 100 + "%";
    s.style.top = Math.random() * 100 + "%";
    s.style.setProperty("--s", 6 + Math.random() * 16 + "px");
    s.style.setProperty("--c", STAR_COLORS[i % STAR_COLORS.length]);
    s.style.setProperty("--d", 1.4 + Math.random() * 2 + "s");
    s.style.setProperty("--delay", -Math.random() * 3 + "s");
    introStars.appendChild(s);
  }

  // A steady stream of hearts floating up
  const spawnHeart = () => {
    const h = document.createElement("span");
    h.textContent = Math.random() > 0.35 ? "♥" : "♡";
    h.style.left = Math.random() * 100 + "%";
    h.style.fontSize = 12 + Math.random() * 22 + "px";
    h.style.setProperty("--x", (Math.random() - 0.5) * 160 + "px");
    h.style.setProperty("--r", (Math.random() - 0.5) * 90 + "deg");
    h.style.setProperty("--o", String(0.45 + Math.random() * 0.5));
    h.style.setProperty("--d", 5 + Math.random() * 4 + "s");
    h.addEventListener("animationend", () => h.remove());
    introHearts.appendChild(h);
  };
  if (!reduceMotion) {
    for (let i = 0; i < 6; i++) setTimeout(spawnHeart, i * 250);
    heartTimer = setInterval(spawnHeart, 420);
  }

  // Title letters for the staggered entrance
  const titleChars = [];
  if (useMotion) {
    const text = introTitle.textContent;
    introTitle.textContent = "";
    for (const ch of text) {
      const s = document.createElement("span");
      s.className = "ic";
      s.textContent = ch;
      introTitle.appendChild(s);
      titleChars.push(s);
    }
  }

  if (useMotion) {
    const { animate, stagger } = M;
    const items = $$("[data-i]", intro);
    items.forEach((el) => { el.style.opacity = "0"; });
    titleChars.forEach((c) => { c.style.opacity = "0"; });
    introTitle.style.opacity = "1";

    const portrait = $(".intro__portrait");
    animate(portrait, { opacity: [0, 1], scale: [0.2, 1], rotate: [-25, 0] }, { ...spring(0.5, 1.1), delay: 0.2 });
    setTimeout(() => { if (!introClosed) burst(portrait, 14); }, 650);
    // Doodles around the avatar pop in one by one, then drift gently
    const ring = $(".intro__deco .deco-ring");
    ring.style.strokeDasharray = "1";
    ring.style.strokeDashoffset = "1";
    // Drawn like a pen stroke once the avatar has settled
    animate(1, 0, { duration: 1.4, delay: 0.95, ease: [0.45, 0, 0.25, 1], onUpdate: (v) => { ring.style.strokeDashoffset = String(v); } });
    // Dashed heart trail: draw the solid mask path so the dashes appear along it
    const trail = $(".intro__deco .trail-reveal");
    trail.style.strokeDasharray = "1";
    trail.style.strokeDashoffset = "1";
    animate(1, 0, { duration: 1.3, delay: 1.9, ease: [0.45, 0, 0.25, 1], onUpdate: (v) => { trail.style.strokeDashoffset = String(v); } });
    const decos = $$(".intro__deco .deco");
    decos.forEach((d, i) => {
      d.style.transformBox = "fill-box";
      d.style.transformOrigin = "center";
      animate(d, { opacity: [0, 1], scale: [0, 1] }, { ...spring(0.6, 0.7), delay: 0.7 + i * 0.09 });
      animate(d, { y: [0, i % 2 ? -4 : 4], rotate: [0, i % 2 ? 6 : -6] }, loop(1.6 + (i % 3) * 0.5, { delay: 1.6 + i * 0.1 }));
    });

    animate(titleChars, { opacity: [0, 1], y: [30, 0], rotate: [-12, 0], filter: ["blur(8px)", "blur(0px)"] },
      { duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: stagger(0.06, { startDelay: 0.95 }) });
    animate(".intro__from", { opacity: [0, 1], y: [16, 0] }, { duration: 0.8, delay: 1.9, ease: "easeOut" });

    // Brush underline + heart divider are drawn in like pen strokes
    const drawIn = (path, delay) => {
      path.style.strokeDasharray = "1";
      path.style.strokeDashoffset = "1";
      animate(1, 0, { duration: 0.6, delay, ease: "easeOut", onUpdate: (v) => { path.style.strokeDashoffset = String(v); } });
    };
    animate(".intro__swoosh, .intro__divider", { opacity: [0, 1] }, { duration: 0.01, delay: 1.6 });
    drawIn($(".intro__swoosh path"), 1.6);
    $$(".intro__divider .line").forEach((p) => drawIn(p, 2.1));
    const divHeart = $(".intro__divider use");
    divHeart.style.transformBox = "fill-box";
    divHeart.style.transformOrigin = "center";
    animate(divHeart, { scale: [0, 1.4, 1] }, { duration: 0.5, delay: 2.4 });
    animate(introOpen, { opacity: [0, 1], scale: [0.4, 1], y: [20, 0] }, { ...spring(0.6, 0.8), delay: 2.5 });
    // Gentle "breathing" so the button invites a tap
    animate(".intro__open img", { scale: [1, 1.05], rotate: [0, -1.2] }, loop(0.9, { delay: 3.2 }));
  }

  const finishIntro = () => {
    clearInterval(heartTimer);
    intro.hidden = true;
    intro.remove();
    document.documentElement.classList.remove("intro-open");
    if (lenis) lenis.start();
  };

  const closeIntro = () => {
    if (introClosed) return;
    introClosed = true;
    window.scrollTo(0, 0);
    if (!useMotion) {
      finishIntro();
      playEntrance();
      return;
    }
    const { animate } = M;
    burst(introOpen, 16);
    heartRain(24);

    // Shrink the splash into a circle that closes on the button
    const r = introOpen.getBoundingClientRect();
    const cx = ((r.left + r.width / 2) / window.innerWidth * 100).toFixed(1);
    const cy = ((r.top + r.height / 2) / window.innerHeight * 100).toFixed(1);
    animate($("#introContent"), { scale: [1, 0.9], opacity: [1, 0] }, { duration: 0.5, ease: "easeIn" });
    animate(150, 0, {
      duration: 1, delay: 0.15, ease: [0.65, 0, 0.35, 1],
      onUpdate: (v) => { intro.style.clipPath = `circle(${v}% at ${cx}% ${cy}%)`; },
    }).then(finishIntro);
    // Start the page entrance while the circle is closing
    setTimeout(playEntrance, 450);
  };

  introOpen.addEventListener("click", closeIntro);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeIntro(); });

  paint();
})();
