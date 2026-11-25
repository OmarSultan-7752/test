(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const SVG_NS = "http://www.w3.org/2000/svg";

  /* ================= بيانات ثابتة ================= */
  const LETTERS = "ابتثجحخدذرزسشصضطظعغفقكلمنهوي".split("");
  const LETTER_NAMES = {
    "ا": "الألف", "ب": "الباء", "ت": "التاء", "ث": "الثاء", "ج": "الجيم", "ح": "الحاء", "خ": "الخاء",
    "د": "الدال", "ذ": "الذال", "ر": "الراء", "ز": "الزاي", "س": "السين", "ش": "الشين", "ص": "الصاد",
    "ض": "الضاد", "ط": "الطاء", "ظ": "الظاء", "ع": "العين", "غ": "الغين", "ف": "الفاء", "ق": "القاف",
    "ك": "الكاف", "ل": "اللام", "م": "الميم", "ن": "النون", "ه": "الهاء", "و": "الواو", "ي": "الياء",
  };
  const COLORS = {
    green:  { label: "الأخضر",   c: "#1fb36b", d: "#12804b", l: "#5fd79a" },
    orange: { label: "البرتقالي", c: "#f57c2b", d: "#c25813", l: "#ffa66b" },
    red:    { label: "الأحمر",   c: "#e5484d", d: "#a8292d", l: "#ff8085" },
    blue:   { label: "الأزرق",   c: "#3a86ff", d: "#1f5fc7", l: "#7fb0ff" },
    purple: { label: "البنفسجي", c: "#8f5bf5", d: "#6236c4", l: "#b996ff" },
    pink:   { label: "الوردي",   c: "#e8458b", d: "#b02863", l: "#ff86ba" },
  };
  const DEFAULTS = {
    teams: [{ name: "الفريق الأخضر", color: "green" }, { name: "الفريق البرتقالي", color: "orange" }],
    size: 5, timer: 20, target: 2, mode: "bank", font: "ruqaa", play: "turn", level: "mixed", sab: "on",
  };
  const BANK = window.QUESTION_BANK || {};
  const MORE = window.QUESTION_BANK_MORE || {};
  for (const L in MORE) BANK[L] = (BANK[L] || []).concat(MORE[L]);
  const NICE = window.QUESTION_BANK_NICE || {};
  for (const L in NICE) BANK[L] = (BANK[L] || []).concat(NICE[L]);
  const HARD = window.QUESTION_BANK_HARD || {};

  /* ================= التخزين ================= */
  const store = {
    get(k, d) {
      try { const v = localStorage.getItem("haroof3:" + k); return v ? JSON.parse(v) : d; } catch (_) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem("haroof3:" + k, JSON.stringify(v)); } catch (_) {}
    },
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function loadSettings() {
    const s = store.get("settings", {}) || {};
    const out = { ...clone(DEFAULTS), ...s };
    if (!Array.isArray(out.teams) || out.teams.length !== 2) out.teams = clone(DEFAULTS.teams);
    out.teams = out.teams.map((t, i) => ({
      name: (t && typeof t.name === "string" && t.name.trim()) || DEFAULTS.teams[i].name,
      color: t && COLORS[t.color] ? t.color : DEFAULTS.teams[i].color,
    }));
    if (out.teams[0].color === out.teams[1].color) out.teams = clone(DEFAULTS.teams);
    if (![4, 5, 6].includes(out.size)) out.size = 5;
    if (!Number.isInteger(out.timer) || out.timer < 0 || out.timer > 600) out.timer = 20;
    if (![1, 2, 3].includes(out.target)) out.target = 2;
    if (!["bank", "host"].includes(out.mode)) out.mode = "bank";
    if (!["ruqaa", "kufi", "bold"].includes(out.font)) out.font = "ruqaa";
    if (!["turn", "race"].includes(out.play)) out.play = "turn";
    if (!["normal", "mixed", "hard"].includes(out.level)) out.level = "mixed";
    if (!["on", "off"].includes(out.sab)) out.sab = "on";
    delete out.sound;
    return out;
  }
  function validGame(g) {
    return g && [4, 5, 6].includes(g.size) &&
      Array.isArray(g.letters) && g.letters.length === g.size * g.size &&
      Array.isArray(g.owners) && g.owners.length === g.size * g.size &&
      Array.isArray(g.score) && g.score.length === 2;
  }

  let settings = loadSettings();
  let custom = store.get("custom", []);
  if (!Array.isArray(custom)) custom = [];
  let used = store.get("used", {});
  if (!used || typeof used !== "object") used = {};
  let game = store.get("game", null);
  if (!validGame(game)) game = null;
  else {
    game.history = game.history || []; game.winPath = game.winPath || [];
    game.frozen = game.frozen || {};
    game.fx = game.fx || { skip: [false, false], timeCut: [false, false], hard: [false, false] };
    game.pendingSab = game.pendingSab || null;
    game.usedSab = game.usedSab || [[], []];
  }

  const saveSettings = () => store.set("settings", settings);
  const saveGame = () => store.set("game", game);

  /* ================= الأصوات ================= */
  const Sound = (() => {
    let ctx = null, master = null, silentEl = null, alive = null, stateCb = null;
    // نخلي مسار الصوت صاحي: الايفون ينيّم الصوت لو ما فيه شي، وبعدها الأصوات القصيرة تنبلع.
    // نشغّل ضجيج خافت جداً (غير مسموع) بشكل مستمر.
    function keepAlive() {
      if (alive || !ctx) return;
      try {
        const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.003;
        const src = ctx.createBufferSource();
        src.buffer = buf; src.loop = true;
        src.connect(ctx.destination);
        src.start(0);
        alive = src;
      } catch (_) {}
    }
    // الايفون: زر الصامت يكتم صوت المتصفح، فنخلي الجلسة "تشغيل" ونشغّل مقطع صامت
    function iosAudioFix() {
      try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (_) {}
      if (silentEl) return;
      try {
        const n = 4000, bytes = new Uint8Array(44 + n);
        const dv = new DataView(bytes.buffer);
        const w = (o, str) => { for (let i = 0; i < str.length; i++) bytes[o + i] = str.charCodeAt(i); };
        w(0, "RIFF"); dv.setUint32(4, 36 + n, true); w(8, "WAVEfmt "); dv.setUint32(16, 16, true);
        dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true);
        dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); w(36, "data"); dv.setUint32(40, n, true);
        bytes.fill(128, 44);
        silentEl = new Audio(URL.createObjectURL(new Blob([bytes], { type: "audio/wav" })));
        silentEl.loop = true;
        silentEl.volume = 0.01;
        silentEl.setAttribute("playsinline", "");
        silentEl.play().catch(() => {});
      } catch (_) { silentEl = null; }
    }
    function init() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try {
          ctx = new AC();
          master = ctx.createGain();
          master.gain.value = 0.95;
          const comp = ctx.createDynamicsCompressor();
          master.connect(comp);
          comp.connect(ctx.destination);
          ctx.onstatechange = () => { if (ctx.state === "running") keepAlive(); if (stateCb) stateCb(ctx.state); };
        } catch (_) { ctx = null; return null; }
      }
      if (ctx.state === "running") keepAlive();
      if (ctx.state !== "running") {
        ctx.resume().catch(() => {});
        try { const b = ctx.createBuffer(1, 1, 22050), src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination); src.start(0); } catch (_) {}
      }
      return ctx;
    }
    function note(freq, at = 0, dur = 0.15, type = "sine", vol = 0.25, toFreq = null) {
      const t0 = ctx.currentTime + at + 0.03;   // تأخير صغير يغطي صحيان الصوت
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(master);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    }
    const sounds = {
      tap:     () => { note(660, 0, 0.12, "triangle", 0.2); note(990, 0.02, 0.09, "sine", 0.08); },
      test:    () => { [523, 659, 784].forEach((f, i) => note(f, i * 0.16, 0.3, "triangle", 0.3)); },
      open:    () => { note(320, 0, 0.28, "sine", 0.18, 960); note(1280, 0.2, 0.18, "triangle", 0.1); },
      reveal:  () => { note(784, 0, 0.14, "sine", 0.2); note(1175, 0.09, 0.24, "sine", 0.18); },
      tick:    () => note(1050, 0, 0.05, "square", 0.06),
      correct: () => { note(659, 0, 0.14, "triangle", 0.28); note(880, 0.1, 0.14, "triangle", 0.28); note(1319, 0.2, 0.32, "triangle", 0.26); },
      wrong:   () => { note(260, 0, 0.32, "sawtooth", 0.12, 150); },
      claim:   () => { note(440, 0, 0.09, "sine", 0.2, 880); note(1760, 0.07, 0.2, "sine", 0.07); },
      undo:    () => note(700, 0, 0.12, "sine", 0.14, 420),
      boom:    () => { note(160, 0, 0.45, "sawtooth", 0.3, 40); note(90, 0.02, 0.5, "square", 0.2, 30); },
      freeze:  () => { for (let i = 0; i < 5; i++) note(1800 - i * 220, i * 0.05, 0.14, "triangle", 0.1); },
      // نغمة الافتتاح: مقدمة قصيرة مثل مقدمة أغنية (3 ثواني)، مو موسيقى مستمرة
      intro:   () => {
        note(196, 0, 0.5, "sine", 0.16, 392);                                   // هبّة البداية
        [523, 622, 784, 1047].forEach((f, i) => {                                // الحروف تنزل
          note(f, 0.18 + i * 0.2, 0.34, "triangle", 0.26);
          note(f * 2, 0.18 + i * 0.2, 0.2, "sine", 0.06);
        });
        [[1047, 1.1], [932, 1.32], [784, 1.54], [1047, 1.76], [1244, 2.0]].forEach(([f, t], i) => { // اللحن
          note(f, t, i === 4 ? 0.9 : 0.24, "triangle", 0.24);
          note(f / 2, t, 0.22, "sine", 0.08);
        });
        [[130.8, 0.2], [155.6, 0.8], [196, 1.4], [155.6, 2.0]].forEach(([f, t]) => note(f, t, 0.5, "sine", 0.22));   // باص
        for (let i = 0; i < 12; i++) note(3000, 0.2 + i * 0.2, 0.03, "square", 0.025);                                 // إيقاع خفيف
        [622, 784, 932, 1244].forEach((f) => note(f, 2.0, 1.0, "triangle", 0.13));                                    // الختام
        [2093, 2637, 3136, 3951].forEach((f, i) => note(f, 2.05 + i * 0.06, 0.4, "sine", 0.045));
      },
      // بدء المباراة
      start:   () => {
        [392, 523, 659, 784].forEach((f, i) => note(f, i * 0.09, 0.22, "triangle", 0.24));
        [523, 659, 784, 1047].forEach((f) => note(f, 0.4, 0.8, "triangle", 0.18));
        note(130.8, 0.4, 0.6, "sine", 0.2);
        [2093, 2637, 3136].forEach((f, i) => note(f, 0.45 + i * 0.07, 0.35, "sine", 0.05));
      },
      // انتهاء الوقت: صوت واضح ما يتفوّت
      timeup:  () => {
        [523, 392, 294].forEach((f, i) => note(f, i * 0.17, 0.3, "sawtooth", 0.22));
        note(110, 0.5, 0.7, "sawtooth", 0.26, 70);
        note(220, 0.5, 0.7, "square", 0.12, 140);
      },
      cell:    () => note(420 + Math.random() * 380, 0, 0.1, "triangle", 0.2, 900),
      type:    () => note(1700 + Math.random() * 500, 0, 0.03, "square", 0.04),
      turn:    () => { note(523, 0, 0.1, "triangle", 0.16); note(784, 0.09, 0.18, "triangle", 0.16); },
      buzz:    () => { note(880, 0, 0.18, "square", 0.16); note(660, 0.1, 0.35, "square", 0.16); },
      shuffle: () => { for (let i = 0; i < 6; i++) note(500 + i * 120, i * 0.04, 0.06, "triangle", 0.08); },
      win:     () => {
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) => note(f, i * 0.12, 0.28, "triangle", 0.24));
        [523, 659, 784].forEach((f) => note(f, 0.75, 1.2, "sine", 0.12));
      },
    };
    return {
      unlock() { init(); iosAudioFix(); },
      running() { return !!(ctx && ctx.state === "running"); },
      state() { return ctx ? ctx.state : "لم يبدأ"; },
      onState(cb) { stateCb = cb; },
      play(name) {
        if (!init()) return;
        try { sounds[name] && sounds[name](); } catch (_) {}
      },
    };
  })();
  ["touchend", "pointerup", "click", "keydown"].forEach((ev) =>
    document.addEventListener(ev, () => { if (!Sound.running()) Sound.unlock(); else Sound.unlock(); }, { passive: true })
  );
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") Sound.unlock(); });
  // نقرة خفيفة مع كل زر
  document.addEventListener("click", (e) => {
    const b = e.target && e.target.closest ? e.target.closest("button") : null;
    if (!b || b.disabled || b.closest(".pad-btn, .buzz-btn, #splash")) return;
    Sound.play("tap");
  }, true);

  /* ================= المؤثرات (قصاصات) ================= */
  const FX = (() => {
    const cv = $("#fx");
    const ctx = cv.getContext("2d");
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let parts = [], raf = 0, dpr = 1;
    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(innerWidth * dpr);
      cv.height = Math.round(innerHeight * dpr);
    }
    addEventListener("resize", resize);
    resize();
    function tick() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      parts = parts.filter((p) => p.life > 0 && p.y < innerHeight + 40);
      for (const p of parts) {
        p.vy += p.g; p.vx *= p.drag; p.vy *= p.drag;
        p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life--;
        ctx.save();
        ctx.globalAlpha = Math.min(1, p.life / 25);
        ctx.translate(p.x * dpr, p.y * dpr);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.hex) {
          const s = p.s * dpr / 2;
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = Math.PI / 3 * k + Math.PI / 6;
            k ? ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s) : ctx.moveTo(Math.cos(a) * s, Math.sin(a) * s);
          }
          ctx.fill();
        } else {
          ctx.fillRect(-p.s * dpr / 2, -p.s * dpr / 4, p.s * dpr, p.s * dpr / 2);
        }
        ctx.restore();
      }
      if (parts.length) raf = requestAnimationFrame(tick);
      else { raf = 0; ctx.clearRect(0, 0, cv.width, cv.height); }
    }
    const add = (p) => { parts.push(p); if (!raf) raf = requestAnimationFrame(tick); };
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    return {
      burst(x, y, colors, n = 26) {
        if (reduce) return;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 5;
          add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, g: 0.2, drag: 0.97, s: 5 + Math.random() * 6,
            rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, life: 45 + Math.random() * 25, color: pick(colors), hex: Math.random() > 0.5 });
        }
      },
      confetti(colors) {
        if (reduce) return;
        for (let i = 0; i < 180; i++) {
          add({ x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.6, vx: (Math.random() - 0.5) * 3,
            vy: 2 + Math.random() * 3, g: 0.04, drag: 0.995, s: 7 + Math.random() * 7, rot: Math.random() * 6,
            vr: (Math.random() - 0.5) * 0.25, life: 220 + Math.random() * 120, color: pick(colors), hex: Math.random() > 0.6 });
        }
      },
    };
  })();

  /* ================= ألوان الفريقين ================= */
  const teamColor = (t) => COLORS[settings.teams[t].color];
  function applyTheme() {
    const root = document.documentElement.style;
    ["a", "b"].forEach((k, t) => {
      const c = teamColor(t);
      root.setProperty(`--${k}`, c.c);
      root.setProperty(`--${k}-2`, c.d);
      root.setProperty(`--${k}-l`, c.l);
    });
    document.body.dataset.font = settings.font;
  }

  /* ================= أدوات ================= */
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  /* توزيع الحروف على اللوحة حسب عدد أسئلة كل حرف:
     كل ما قلّت أسئلة الحرف (ظ مثلاً) قلّ ظهوره، عشان ما تخلص أسئلته بسرعة.
     يحسب من كل الأسئلة المتاحة (البنك + الصعبة + أسئلتك أنت).
     الاختيار عشوائي موزون: لكل حرف "تذكرة" ورقمها عشوائي مرفوع لقوة (1/وزن)، ونأخذ أعلى التذاكر. */
  const RARE_POWER = 1.5;
  function letterWeights() {
    const counts = LETTERS.map((L) => poolFor(L, "mixed").length);
    const max = Math.max(...counts, 1);
    return counts.map((c) => Math.max(0.03, Math.pow(c / max, RARE_POWER)));
  }
  function dealLetters(n) {
    const w = letterWeights();
    const tickets = [];
    const draw = (weight) => Math.pow(Math.random() || 1e-9, 1 / weight);
    LETTERS.forEach((L, i) => {
      tickets.push([L, draw(w[i])]);
      // لوحة 6×6 فيها خلايا أكثر من الحروف: نعطي كل حرف تذكرة ثانية أضعف
      if (n > LETTERS.length) tickets.push([L, draw(w[i] * 0.7)]);
    });
    tickets.sort((a, b) => b[1] - a[1]);
    return shuffle(tickets.slice(0, n).map((t) => t[0]));
  }
  function el(name, attrs = {}) {
    const e = document.createElementNS(SVG_NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  /* ================= هندسة اللوحة =================
     خلايا سداسية رأسها لفوق، والصفوف الفردية مزاحة نص خلية (شكل شبه مربع).
     الفريق 0 يوصل الصف الأول بالأخير، والفريق 1 يوصل العمود الأول بالأخير. */
  // K = نصف قطر الخلية بوحدات الرسم (كبير عشان المتصفح يرسم الحركة بدقة عالية)
  const K = 60;
  const W = Math.sqrt(3) * K;
  const center = (r, c) => ({ x: W * (c + (r & 1) * 0.5) + W / 2, y: K * (1.5 * r + 1) });
  const corner = (x, y, k, rad) => {
    const a = (Math.PI / 180) * (30 + 60 * k);
    return [x + rad * K * Math.cos(a), y + rad * K * Math.sin(a)];
  };
  const poly = (x, y, rad) =>
    [0, 1, 2, 3, 4, 5].map((k) => corner(x, y, k, rad).map((n) => n.toFixed(2)).join(",")).join(" ");
  // [رؤوس الضلع، إزاحة الجار للصف الزوجي، إزاحة الجار للصف الفردي]
  const DIRS = [
    [[5, 0], [0, 1], [0, 1]],     // يمين
    [[0, 1], [1, 0], [1, 1]],     // تحت يمين
    [[1, 2], [1, -1], [1, 0]],    // تحت يسار
    [[2, 3], [0, -1], [0, -1]],   // يسار
    [[3, 4], [-1, -1], [-1, 0]],  // فوق يسار
    [[4, 5], [-1, 0], [-1, 1]],   // فوق يمين
  ];
  function neighbors(r, c, N) {
    const out = [];
    for (const d of DIRS) {
      const o = d[1 + (r & 1)];
      const a = r + o[0], b = c + o[1];
      if (a >= 0 && a < N && b >= 0 && b < N) out.push([a, b]);
    }
    return out;
  }
  function findPath(t) {
    const N = game.size, own = game.owners;
    const prev = new Map(), q = [];
    for (let k = 0; k < N; k++) {
      const [r, c] = t === 0 ? [0, k] : [k, 0];
      const i = r * N + c;
      if (own[i] === t) { prev.set(i, -1); q.push([r, c]); }
    }
    while (q.length) {
      const [r, c] = q.shift();
      if (t === 0 ? r === N - 1 : c === N - 1) {
        const path = [];
        for (let i = r * N + c; i !== -1; i = prev.get(i)) path.push(i);
        return path.reverse();
      }
      for (const [a, b] of neighbors(r, c, N)) {
        const i = a * N + b;
        if (own[i] === t && !prev.has(i)) { prev.set(i, r * N + c); q.push([a, b]); }
      }
    }
    return null;
  }

  /* ================= رسم اللوحة ================= */
  const board = $("#board");
  let picked = -1;

  function gradient(id, top, bottom) {
    const g = el("linearGradient", { id, x1: "0", y1: "0", x2: "0", y2: "1" });
    const s1 = el("stop", { offset: "0" }); s1.style.stopColor = top;
    const s2 = el("stop", { offset: "1" }); s2.style.stopColor = bottom;
    g.append(s1, s2);
    return g;
  }

  function renderBoard(animate) {
    const N = game.size;
    board.innerHTML = "";
    const w = W * (N + 0.5), h = K * (1.5 * (N - 1) + 2), pad = 0.6 * K;
    board.setAttribute("viewBox", `${(-pad).toFixed(1)} ${(-pad).toFixed(1)} ${(w + pad * 2).toFixed(1)} ${(h + pad * 2 + 0.12 * K).toFixed(1)}`);

    const defs = el("defs");
    defs.append(
      gradient("gCell", "#fffaf0", "#f1e4c8"),
      gradient("gCellHover", "#ffffff", "#f7ecd4"),
      gradient("gA", "var(--a-l)", "var(--a)"),
      gradient("gB", "var(--b-l)", "var(--b)")
    );
    const gGlow = el("g"), gEdge = el("g"), gCells = el("g");

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const { x, y } = center(r, c);
        const i = r * N + c;

        for (const d of DIRS) {
          const o = d[1 + (r & 1)];
          const nr = r + o[0], nc = c + o[1];
          if (nr >= 0 && nr < N && nc >= 0 && nc < N) continue;
          const t = nr < 0 || nr >= N ? 0 : 1;
          const p = corner(x, y, d[0][0], 1.02), q = corner(x, y, d[0][1], 1.02);
          const at = { x1: p[0].toFixed(3), y1: p[1].toFixed(3), x2: q[0].toFixed(3), y2: q[1].toFixed(3) };
          gGlow.append(el("line", { ...at, class: "edge-glow t" + t }));
          gEdge.append(el("line", { ...at, class: "edge t" + t }));
        }

        const g = el("g", { class: "cell" + (animate ? "" : " no-anim"), "data-i": i, role: "button", tabindex: "0", "aria-label": "حرف " + LETTER_NAMES[game.letters[i]] });
        g.style.setProperty("--d", (0.04 + (r + c) * 0.035).toFixed(3) + "s");
        const inner = el("g", { class: "cell-in" });
        inner.append(
          el("polygon", { class: "hex-depth", points: poly(x, y + 0.1 * K, 0.93) }),
          el("polygon", { class: "hex", points: poly(x, y, 0.93) }),
          el("polygon", { class: "glow", points: poly(x, y, 0.93) }),
          el("polygon", { class: "ring", points: poly(x, y, 0.93) }),
          el("polygon", { class: "ice", points: poly(x, y, 0.93) }),
          el("polygon", { class: "tgt", points: poly(x, y, 0.93) })
        );
        const txt = el("text", { class: "letter", x: x.toFixed(3), y: y.toFixed(3) });
        txt.textContent = game.letters[i];
        const flake = el("text", { class: "ice-mark", x: (x + 0.52 * K).toFixed(2), y: (y - 0.5 * K).toFixed(2) });
        flake.textContent = "❄";
        inner.append(txt, flake);
        g.append(inner);
        g.addEventListener("click", () => onCell(i));
        g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onCell(i); } });
        gCells.append(g);
      }
    }
    board.append(defs, gGlow, gEdge, gCells);
    paint();
  }

  function paint() {
    $$(".cell", board).forEach((g) => {
      const i = +g.dataset.i;
      const o = game.owners[i];
      g.classList.toggle("t0", o === 0);
      g.classList.toggle("t1", o === 1);
      g.classList.toggle("picked", i === picked);
      g.classList.toggle("frozen", !!game.frozen[i]);
      g.classList.toggle("target", isTargetCell(i));
      const wi = game.winPath.indexOf(i);
      g.classList.toggle("win", wi >= 0);
      if (wi >= 0) g.style.setProperty("--wd", (wi * 0.09).toFixed(2) + "s");
    });
    board.classList.toggle("targeting", !!targetMode);
    $("#game").classList.toggle("targeting", !!targetMode);
    updateHud();
    queueSync();
  }

  /* لوحة مصغّرة تنعرض على جوالات اللاعبين (بدون تفاعل) */
  function drawMini(svg, v) {
    const N = v && v.n;
    if (![4, 5, 6].includes(N) || typeof v.l !== "string" || v.l.length !== N * N || typeof v.o !== "string") return;
    const fz = Array.isArray(v.fz) ? v.fz : [];
    svg.innerHTML = "";
    const w = W * (N + 0.5), h = K * (1.5 * (N - 1) + 2), pad = 0.5 * K;
    svg.setAttribute("viewBox", `${(-pad).toFixed(1)} ${(-pad).toFixed(1)} ${(w + pad * 2).toFixed(1)} ${(h + pad * 2).toFixed(1)}`);
    const gEdge = el("g"), gCells = el("g");
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const { x, y } = center(r, c);
        const i = r * N + c;
        for (const d of DIRS) {
          const o = d[1 + (r & 1)];
          const nr = r + o[0], nc = c + o[1];
          if (nr >= 0 && nr < N && nc >= 0 && nc < N) continue;
          const t = nr < 0 || nr >= N ? 0 : 1;
          const p = corner(x, y, d[0][0], 1.02), qq = corner(x, y, d[0][1], 1.02);
          gEdge.append(el("line", { x1: p[0].toFixed(2), y1: p[1].toFixed(2), x2: qq[0].toFixed(2), y2: qq[1].toFixed(2), class: "medge t" + t }));
        }
        const owner = v.o[i];
        const g = el("g", { class: "mcell" + (owner === "a" ? " t0" : owner === "b" ? " t1" : "") + (fz.includes(i) ? " frozen" : "") + (i === v.pk ? " picked" : "") });
        g.append(el("polygon", { class: "mhex", points: poly(x, y, 0.93) }));
        const tx = el("text", { class: "mletter", x: x.toFixed(2), y: (y + 2).toFixed(2) });
        tx.textContent = v.l[i];
        g.append(tx);
        if (fz.includes(i)) { const f = el("text", { class: "mice", x: (x + 0.5 * K).toFixed(1), y: (y - 0.45 * K).toFixed(1) }); f.textContent = "❄"; g.append(f); }
        gCells.append(g);
      }
    }
    svg.append(gEdge, gCells);
  }

  function updateHud() {
    for (const t of [0, 1]) {
      $("#tName" + t).textContent = settings.teams[t].name;
      $("#team" + t).classList.toggle("turn", !game.roundOver && game.turn === t);
      const pips = $("#pips" + t);
      pips.innerHTML = "";
      for (let k = 0; k < settings.target; k++) {
        const p = document.createElement("span");
        p.className = "pip" + (k < game.score[t] ? " on" : "");
        pips.append(p);
      }
    }
    $("#roundLabel").textContent = `الجولة ${game.round} · ${settings.target === 1 ? "جولة وحدة" : "أول من يفوز بـ" + settings.target}`;
    const nf = $("#btnNextFloat");
    nf.hidden = !(game.roundOver && $("#winModal").hidden);
    nf.textContent = game.roundOver && game.winner >= 0 && game.score[game.winner] >= settings.target
      ? "مباراة جديدة ←" : "الجولة التالية ←";
  }

  function cellCenter(i) {
    const g = board.querySelector(`.cell[data-i="${i}"] .hex`);
    if (!g) return { x: innerWidth / 2, y: innerHeight / 2 };
    const r = g.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  function claimFx(i, t) {
    const g = board.querySelector(`.cell[data-i="${i}"]`);
    if (!g) return;
    g.classList.remove("claim");
    void g.getBBox();
    g.classList.add("claim");
    setTimeout(() => g.classList.remove("claim"), 750);
    const { x, y } = cellCenter(i);
    const c = teamColor(t);
    FX.burst(x, y, [c.c, c.l, "#ffd77e"]);
  }

  /* ================= مجرى اللعبة ================= */
  const newFx = () => ({ skip: [false, false], timeCut: [false, false], hard: [false, false] });
  const nm = (t) => settings.teams[t].name;

  function newMatch() {
    game = {
      size: settings.size,
      letters: dealLetters(settings.size * settings.size),
      owners: Array(settings.size * settings.size).fill(-1),
      turn: 0, score: [0, 0], round: 1,
      history: [], roundOver: false, winPath: [], winner: -1,
      frozen: {}, fx: newFx(), pendingSab: null, usedSab: [[], []],
    };
    q = null; picked = -1;
    renderBoard(true);
    saveGame();
  }
  function newRound(starter) {
    game.size = settings.size;
    game.letters = dealLetters(game.size * game.size);
    game.owners = Array(game.size * game.size).fill(-1);
    game.round++;
    game.turn = starter;
    game.history = [];
    game.roundOver = false;
    game.winPath = [];
    game.winner = -1;
    game.frozen = {}; game.fx = newFx(); game.pendingSab = null; game.usedSab = [[], []];
    q = null; picked = -1;
    closeModal("winModal");
    renderBoard(true);
    Sound.play("shuffle");
    saveGame();
  }

  function snapshot() {
    game.history.push({
      letters: game.letters.slice(), owners: game.owners.slice(), turn: game.turn,
      score: game.score.slice(), roundOver: game.roundOver, winPath: game.winPath.slice(), winner: game.winner,
      frozen: clone(game.frozen), fx: clone(game.fx), usedSab: clone(game.usedSab),
    });
    if (game.history.length > 120) game.history.shift();
  }
  function undo() {
    if (anyModalOpen() || targetMode) return;
    const s = game.history.pop();
    if (!s) { toast("ما فيه شي تتراجع عنه"); return; }
    const lettersChanged = s.letters.join("") !== game.letters.join("");
    Object.assign(game, s);
    game.pendingSab = null;
    if (lettersChanged) renderBoard(false); else paint();
    Sound.play("undo");
    toast("↶ تراجعنا عن آخر حركة");
    saveGame();
  }

  /* ---- تأكيد (لأن confirm() ما تشتغل في الصفحات المنشورة) ---- */
  let confirmFn = null;
  function askConfirm(title, text, okLabel, fn) {
    $("#confirmTitle").textContent = title;
    $("#confirmText").textContent = text;
    $("#confirmOk").textContent = okLabel;
    confirmFn = fn;
    openModal("confirmModal");
  }
  $("#confirmOk").onclick = () => { closeModal("confirmModal"); const f = confirmFn; confirmFn = null; if (f) f(); };
  $("#confirmNo").onclick = () => { closeModal("confirmModal"); confirmFn = null; };

  function clearBoard() {
    if (anyModalOpen() || targetMode) return;
    if (game.owners.every((o) => o === -1)) { toast("اللوحة فاضية أصلاً"); return; }
    askConfirm("نمسح كل الألوان؟", "تفضى اللوحة وتبقى نفس الحروف. تقدر ترجع بزر «تراجع».", "إي، امسح", () => {
      snapshot();
      game.owners = game.owners.map(() => -1);
      game.frozen = {};
      game.roundOver = false; game.winPath = []; game.winner = -1;
      paint();
      Sound.play("undo");
      saveGame();
    });
  }
  function reshuffle() {
    if (anyModalOpen() || targetMode) return;
    if (game.roundOver) { continueAfterWin(); return; }
    const doIt = () => {
      snapshot();
      game.letters = dealLetters(game.size * game.size);
      game.owners = game.owners.map(() => -1);
      game.frozen = {};
      renderBoard(true);
      Sound.play("shuffle");
      saveGame();
    };
    if (game.owners.every((o) => o === -1)) { doIt(); return; }
    askConfirm("نبدّل الحروف؟", "تتغير كل الحروف وتنمسح الألوان. تقدر ترجع بزر «تراجع».", "إي، بدّل", doIt);
  }

  /* ---- التنبيهات السريعة ---- */
  let toastTimer = 0;
  function toast(msg, ms = 2600, share = false) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    t.classList.remove("show"); void t.offsetWidth; t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms);
    if (share) note(msg);
  }

  /* ---- تغيير مالك الخلية (ما يغيّر الدور) ---- */
  function setOwner(i, t) {
    snapshot();
    game.owners[i] = t;
    delete game.frozen[i];
    paint();
    if (t === 0 || t === 1) claimFx(i, t);
    let won = false;
    // اللي لوّن الخلية أول من يُفحص، وبعدها الثاني (لو عُدّلت خلية يدوياً)
    for (const team of t === 1 ? [1, 0] : [0, 1]) {
      const path = findPath(team);
      if (path) { roundWon(team, path); won = true; break; }
    }
    saveGame();
    return won;
  }

  function roundWon(t, path) {
    game.score[t]++;
    game.roundOver = true;
    game.winPath = path;
    game.winner = t;
    game.pendingSab = null;
    paint();
    saveGame();
    setTimeout(() => {
      Sound.play("win");
      const c = teamColor(t);
      FX.confetti([c.c, c.l, "#ffd77e", "#ffffff"]);
    }, 350);
    setTimeout(showWin, 1500);
  }

  function showWin() {
    if (!game.roundOver) return;
    const t = game.winner;
    const matchWon = game.score[t] >= settings.target;
    const sheet = $("#winSheet");
    sheet.classList.toggle("tb", t === 1);
    $("#winKicker").textContent = matchWon ? "بطل المباراة" : `فاز بالجولة ${game.round}`;
    $("#winName").textContent = nm(t);
    $("#wsA").textContent = game.score[0];
    $("#wsB").textContent = game.score[1];
    $("#winPrimary").textContent = matchWon ? "مباراة جديدة" : "الجولة التالية";
    $("#winSettings").hidden = !matchWon;
    openModal("winModal");
  }

  const isMatchOver = () => game.roundOver && game.winner >= 0 && game.score[game.winner] >= settings.target;
  function continueAfterWin() {
    closeModal("winModal");
    if (isMatchOver()) { newMatch(); Sound.play("shuffle"); }
    else newRound(game.winner === 0 ? 1 : 0);
  }
  $("#winPrimary").onclick = continueAfterWin;
  $("#winSecondary").onclick = () => { closeModal("winModal"); updateHud(); };
  $("#winSettings").onclick = () => { closeModal("winModal"); openSetup(true); };

  /* ---- الدور ---- */
  // الفرق اللي خلّص دوره: نذوّب التجميد اللي عليه
  function thaw(starter) {
    for (const k of Object.keys(game.frozen)) {
      const f = game.frozen[k];
      if (f.by !== starter) { f.left--; if (f.left <= 0) delete game.frozen[k]; }
    }
  }
  function advanceTurn(starter) {
    const opp = 1 - starter;
    if (game.fx.skip[opp]) {
      game.fx.skip[opp] = false;
      game.turn = starter;
      toast(`⛔ ضاع دور ${nm(opp)}، يعيد ${nm(starter)}`, 3400);
    } else {
      game.turn = opp;
    }
    Sound.play("turn");
    paint();
    saveGame();
  }

  function onCell(i) {
    Sound.unlock();
    if (!$("#setup").hidden || !$("#player").hidden) return;
    if (targetMode) { pickTarget(i); return; }
    if (anyModalOpen()) return;
    if (game.roundOver) { showWin(); return; }
    Sound.play("cell");
    if (game.owners[i] !== -1) { openEdit(i); return; }
    openQuestion(i);
  }

  /* ================= النوافذ ================= */
  function openModal(id) { $("#" + id).hidden = false; }
  function closeModal(id) { $("#" + id).hidden = true; }
  const anyModalOpen = () => $$(".modal").some((m) => !m.hidden);

  /* ---- بنك الأسئلة والمستوى ---- */
  const asItems = (arr) => (arr || []).map(([qq, a]) => ({ q: qq, a }));
  function poolFor(L, level) {
    const normal = asItems(BANK[L]);
    const hard = asItems(HARD[L]);
    const mine = custom.filter((c) => c.l === L);
    let arr;
    if (level === "normal") arr = normal.concat(mine);
    else if (level === "hard") arr = (hard.length >= 3 ? hard : hard.concat(normal)).concat(mine);
    else arr = normal.concat(hard, mine);
    const seen = new Set();
    return arr.filter((x) => !seen.has(x.q) && seen.add(x.q));
  }
  function pickQuestion(L, level) {
    const all = poolFor(L, level);
    if (!all.length) return null;
    let seen = Array.isArray(used[L]) ? used[L] : [];
    let fresh = all.filter((x) => !seen.includes(x.q));
    if (!fresh.length) { seen = []; fresh = all; }
    let from = fresh;
    if (level === "mixed") {
      // نص الأسئلة تقريباً من الصعبة عشان ما تصير كلها سهلة
      const hardSet = new Set(asItems(HARD[L]).map((x) => x.q));
      const hardFresh = fresh.filter((x) => hardSet.has(x.q));
      if (hardFresh.length && Math.random() < 0.5) from = hardFresh;
    }
    const item = from[Math.floor(Math.random() * from.length)];
    used[L] = seen.concat(item.q);
    store.set("used", used);
    return item;
  }

  /* ================= السؤال ================= */
  let q = null;              // السؤال الحالي
  const Bell = window.HaroofBell || null;

  function qStatusLine() {
    if (!q) return "";
    if (settings.play === "turn") return `الفرصة الحين عند ${nm(q.asked)}`;
    return "أول من يجاوب ياخذ الخلية";
  }

  function openQuestion(i) {
    if (game.frozen[i] && game.frozen[i].by !== game.turn) {
      Sound.play("wrong");
      toast(`❄️ هالحرف مجمّد! ما تقدرون تختارونه الحين`);
      return;
    }
    q = { i, L: game.letters[i], phase: "prep", starter: game.turn, asked: game.turn, stage: 0, item: null, sec: 0 };
    picked = i;
    paint();
    const L = q.L;
    const sheet = $("#qSheet");
    sheet.dataset.phase = "prep";
    sheet.dataset.play = settings.play;
    sheet.classList.remove("low", "done", "paused");
    $("#qLetter").textContent = L;
    $("#qLetterName").textContent = "تبدأ بحرف " + LETTER_NAMES[L];
    const chip = $("#qChip");
    chip.dataset.t = settings.play === "turn" ? String(q.starter) : "both";
    chip.textContent = settings.play === "turn" ? `الدور على ${nm(q.starter)}` : "السؤال للفريقين: أول من يجاوب";
    $("#prepNote").textContent = settings.play === "turn"
      ? `جهّزوا ${nm(q.starter)}… لما تكونون جاهزين اضغط «اعرض السؤال» ويبدأ العدّاد.`
      : "لما الكل جاهز اضغط «اعرض السؤال» ويبدأ العدّاد.";
    $("#prepBox").hidden = false;
    $("#liveBox").hidden = true;
    $("#btnAnother").hidden = true;
    $("#qKeys").textContent = "مسافة = اعرض السؤال";
    Timer.reset();
    const bl = $("#qLetter");
    bl.style.animation = "none"; void bl.offsetWidth; bl.style.animation = "";
    openModal("qModal");
    Sound.play("tap");
    queueSync();
  }

  /* كتابة السؤال حرف حرف في طريقة الجرس: توقف أول ما أحد يضغط الجرس */
  const Typer = (() => {
    const CHAR_MS = 50;
    let text = "", n = 0, timer = 0, active = false;
    const paintTxt = () => { const t = text.slice(0, n); $("#qBody").textContent = t; const pq = $("#padQ"); if (pq) pq.textContent = t; };
    return {
      CHAR_MS,
      start(t) {
        this.clear();
        text = t; n = 0; active = true;
        paintTxt();
        this.resume();
      },
      resume() {
        if (!active || timer || n >= text.length) { queueSync(); return; }
        timer = setInterval(() => {
          n++;
          paintTxt();
          if (n % 3 === 0) Sound.play("type");
          if (n >= text.length) { clearInterval(timer); timer = 0; queueSync(); }
        }, CHAR_MS);
        queueSync();
      },
      pause() { clearInterval(timer); timer = 0; queueSync(); },
      finish() { clearInterval(timer); timer = 0; n = text.length; paintTxt(); queueSync(); },
      clear() { clearInterval(timer); timer = 0; text = ""; n = 0; active = false; const pq = $("#padQ"); if (pq) pq.textContent = ""; },
      state() { return { active, n, len: text.length, running: !!timer }; },
    };
  })();

  function loadQuestion(level) {
    const box = $("#answerBox");
    box.classList.remove("shown");
    const item = settings.mode === "bank" ? pickQuestion(q.L, level) : null;
    q.item = item;
    if (item) {
      $("#qMark").hidden = false;
      if (settings.play === "race") { Typer.start(item.q); } else { Typer.clear(); $("#qBody").textContent = item.q; }
      $("#qAnswer").textContent = item.a;
      box.hidden = false;
      $("#btnAnother").hidden = poolFor(q.L, level).length < 2;
    } else {
      $("#qMark").hidden = true;
      Typer.clear();
      $("#qBody").textContent = settings.mode === "bank"
        ? "ما فيه أسئلة لهذا الحرف، اسألهم سؤال من عندك."
        : "المقدم يسأل: سؤال إجابته تبدأ بهذا الحرف.";
      box.hidden = true;
      $("#btnAnother").hidden = true;
    }
  }

  function showQuestion() {
    if (!q || q.phase !== "prep") return;
    q.phase = "live";
    const sheet = $("#qSheet");
    sheet.dataset.phase = "live";
    const useHard = game.fx.hard[q.starter];
    if (useHard) { game.fx.hard[q.starter] = false; toast("🔥 سؤال صعب! (تخريب من الخصم)", 3400, true); }
    q.level = useHard ? "hard" : settings.level;
    loadQuestion(q.level);
    let sec = settings.timer;
    if (game.fx.timeCut[q.starter]) {
      game.fx.timeCut[q.starter] = false;
      if (sec) { sec = Math.max(5, Math.round(sec / 2)); toast(`⏱ وقتكم صار ${sec} ثانية (تخريب من الخصم)`, 3400, true); }
    }
    q.sec = sec;
    $("#prepBox").hidden = true;
    $("#liveBox").hidden = false;
    $("#turnBox").hidden = settings.play !== "turn";
    $("#raceBox").hidden = settings.play !== "race";
    $("#btnA").textContent = "✓ " + nm(0);
    $("#btnB").textContent = "✓ " + nm(1);
    $("#turnStatus").textContent = qStatusLine();
    $("#turnStatus").dataset.t = String(q.asked);
    $("#qKeys").textContent = settings.play === "turn" ? "1 = صح · 2 = ما عرفوا · مسافة = الإجابة" : "1 · 2 = الفريق · 0 = ما أحد · مسافة = الإجابة";
    if (settings.play === "race") Timer.arm(sec); else Timer.start(sec);
    Sound.play("open");
    if (Bell && settings.play === "race") { Bell.questionOpened(q.L); buzzUI(Bell.isOn() ? "armed" : "off"); }
    else buzzUI("off");
    saveGame();
    queueSync();
  }

  function stopQuestion() {
    closePad();
    Typer.clear();
    Timer.stop();
    closeModal("qModal");
    if (Bell) Bell.questionClosed();
    buzzUI("off");
    picked = -1;
  }

  // يغيّر الحرف: نرجع للوحة بدون ما يتغير شي
  function cancelQuestion() {
    if (!q) return;
    stopQuestion();
    q = null;
    paint();
    queueSync();
  }

  function finishQuestion(result) {   // 0 أو 1 = فريق جاوب صح، -1 ما أحد
    if (!q) return;
    const { i, starter } = q;
    stopQuestion();
    q = null;
    thaw(starter);
    let won = false;
    if (result === 0 || result === 1) { Sound.play("correct"); won = setOwner(i, result); }
    else { Sound.play("wrong"); paint(); }
    if (won) { queueSync(); return; }
    if ((result === 0 || result === 1) && settings.sab === "on") {
      game.pendingSab = { team: result, starter };
      saveGame();
      setTimeout(() => { if (game.pendingSab) openSabotage(); }, 700);
    } else {
      advanceTurn(starter);
    }
    queueSync();
  }

  // «ما عرفوا» في طريقة دور بدور
  function turnFail() {
    if (!q) return;
    if (q.stage === 0) {
      q.stage = 1;
      q.asked = 1 - q.starter;
      Sound.play("wrong");
      $("#turnStatus").textContent = `ما عرفوا… ${qStatusLine()}`;
      $("#turnStatus").dataset.t = String(q.asked);
      Timer.start(q.sec);
      queueSync();
    } else {
      finishQuestion(-1);
    }
  }

  /* ---- الجرس (جهة المقدم) ---- */
  let buzzTeam = -1;
  function buzzUI(kind, info) {
    const box = $("#buzzBox");
    if (!Bell || kind === "off" || !Bell.isOn()) { box.hidden = true; return; }
    box.hidden = false;
    box.dataset.kind = kind;
    const st = $("#buzzStatus");
    if (kind === "locked") {
      buzzTeam = info.team;
      box.dataset.team = String(info.team);
      st.textContent = `🔔 ${info.name} (${nm(info.team)}) ضغط أول!`;
    } else if (kind === "none") {
      buzzTeam = -1;
      st.textContent = "الجرس مقفل: الفريقين جرّبوا";
    } else {
      buzzTeam = -1;
      st.textContent = "🔔 الجرس مفتوح… أول من يضغط يجاوب";
    }
    $("#buzzActions").hidden = kind !== "locked";
  }
  $("#buzzOk").onclick = () => { if (buzzTeam >= 0) finishQuestion(buzzTeam); };
  $("#buzzBad").onclick = () => {
    if (!Bell || buzzTeam < 0) return;
    const r = Bell.rearm(buzzTeam);
    Sound.play("wrong");
    Timer.arm(q ? q.sec : 0);
    if (r.armed) Typer.resume();
    buzzUI(r.armed ? "armed" : "none");
  };
  // أول ضغطة جرس: نوقف الكتابة ونبدأ وقت الإجابة
  function raceBuzzStarted() {
    Typer.pause();
    if (q && q.sec) Timer.start(q.sec);
  }
  function updateBellBadge() {
    const b = $("#bellBadge");
    if (!Bell) { $("#btnBell").hidden = true; return; }
    const n = Bell.isOn() ? Bell.playerCount() : 0;
    b.hidden = !Bell.isOn();
    b.textContent = Bell.isOn() ? String(n) : "";
    $("#btnBell").classList.toggle("on", Bell.isOn());
  }

  /* ---- شاشة الجرس على جوال واحد: نصف لكل فريق، وأول من يضغط يقفل ---- */
  const pad = { on: false, winner: -1, banned: [], mirror: 0 };
  function openPad() {
    if (!q || q.phase !== "live") return;
    pad.on = true; pad.winner = -1; pad.banned = [];
    $("#pad").hidden = false;
    $("#padAnsText").hidden = true;
    $("#padNameA").textContent = nm(0);
    $("#padNameB").textContent = nm(1);
    clearInterval(pad.mirror);
    pad.mirror = setInterval(() => { $("#padTimer").textContent = $("#timerText").textContent; }, 150);
    $("#padTimer").textContent = $("#timerText").textContent;
    renderPad();
    Sound.play("tap");
  }
  function closePad() {
    if (!pad.on) return;
    pad.on = false;
    clearInterval(pad.mirror);
    $("#pad").hidden = true;
  }
  function renderPad() {
    const bothBanned = pad.banned.length === 2;
    [0, 1].forEach((t) => {
      const b = $(t === 0 ? "#padA" : "#padB");
      const hint = $(t === 0 ? "#padHintA" : "#padHintB");
      const isWin = pad.winner === t;
      const banned = pad.banned.includes(t);
      b.classList.toggle("win", isWin);
      b.classList.toggle("dim", (pad.winner >= 0 && !isWin) || banned);
      b.disabled = pad.winner >= 0 || banned;
      hint.textContent = isWin ? "جاوب!" : banned ? "خسرتوا الفرصة" : pad.winner >= 0 ? "" : "اضغط!";
    });
    $("#padJudge").hidden = pad.winner < 0;
    $("#padNone").hidden = !(bothBanned && pad.winner < 0);
    $("#padStatus").textContent = pad.winner >= 0
      ? `${nm(pad.winner)} ضغطوا أول`
      : bothBanned ? "الفريقين جرّبوا" : "جاهزين… أول واحد يضغط";
  }
  function padTap(team) {
    if (!pad.on || pad.winner >= 0 || pad.banned.includes(team) || !q || q.phase !== "live") return;
    pad.winner = team;
    raceBuzzStarted();
    Sound.play("buzz");
    try { navigator.vibrate && navigator.vibrate(80); } catch (_) {}
    renderPad();
  }
  $("#btnPad").onclick = openPad;
  // pointerdown أسرع من click ويلتقط الضغطتين لو جوا بنفس اللحظة تقريباً
  $("#padA").addEventListener("pointerdown", (e) => { e.preventDefault(); padTap(0); });
  $("#padB").addEventListener("pointerdown", (e) => { e.preventDefault(); padTap(1); });
  $("#padOk").onclick = () => { const w = pad.winner; closePad(); if (w >= 0) finishQuestion(w); };
  $("#padBad").onclick = () => {
    if (pad.winner < 0) return;
    pad.banned.push(pad.winner);
    pad.winner = -1;
    Sound.play("wrong");
    Timer.arm(q ? q.sec : 0);
    if (pad.banned.length < 2) Typer.resume();
    renderPad();
  };
  $("#padNone").onclick = () => { closePad(); finishQuestion(-1); };
  $("#padClose").onclick = () => { closePad(); Timer.resume(); };
  $("#padFlip").onclick = () => { const p = $("#pad"); p.dataset.flip = p.dataset.flip === "1" ? "0" : "1"; };
  $("#padAns").onclick = () => {
    const box = $("#padAnsText");
    box.textContent = q && q.item ? "ج: " + q.item.a : "المقدم يعرف الإجابة";
    box.hidden = !box.hidden;
  };

  /* ---- المؤقت ---- */
  const Timer = (() => {
    const ring = $("#timerRing"), txt = $("#timerText"), sheet = $("#qSheet");
    const C = 2 * Math.PI * 46;
    ring.style.strokeDasharray = C.toFixed(2);
    let total = 0, left = 0, raf = 0, last = 0, running = false, lastWhole = 0, waiting = false;
    function draw() {
      const frac = total ? Math.max(0, left / total) : 1;
      ring.style.strokeDashoffset = (C * (1 - frac)).toFixed(2);
      txt.textContent = !total || waiting ? "" : left > 0 ? Math.ceil(left) : "انتهى الوقت";
      sheet.classList.toggle("low", !!total && left > 0 && left <= 5);
      sheet.classList.toggle("done", !!total && left <= 0);
    }
    function loop(now) {
      if (!running) return;
      left = Math.max(0, left - (now - last) / 1000);
      last = now;
      const whole = Math.ceil(left);
      if (whole !== lastWhole) { lastWhole = whole; if (left > 0 && whole <= 5) Sound.play("tick"); }
      draw();
      if (left <= 0) { running = false; Sound.play("timeup"); return; }
      raf = requestAnimationFrame(loop);
    }
    function run() { running = true; sheet.classList.remove("paused"); last = performance.now(); raf = requestAnimationFrame(loop); }
    return {
      // مرحلة التحضير: الحلقة كاملة بدون عدّاد
      // جاهز بس ما بدأ: ينتظر أول ضغطة جرس
      arm(sec) {
        this.stop();
        total = sec; left = sec; waiting = true; lastWhole = Math.ceil(sec);
        sheet.classList.toggle("no-timer", !sec);
        sheet.classList.add("waiting");
        sheet.classList.remove("paused", "low", "done");
        draw();
        queueSync();
      },
      reset() { this.stop(); waiting = false; sheet.classList.remove("waiting"); total = 0; left = 0; sheet.classList.add("no-timer"); sheet.classList.remove("paused", "low", "done"); draw(); ring.style.strokeDashoffset = "0"; },
      start(sec) {
        this.stop();
        total = sec; left = sec; lastWhole = Math.ceil(sec); waiting = false;
        sheet.classList.toggle("no-timer", !sec);
        sheet.classList.remove("paused", "waiting");
        draw();
        if (sec > 0) run();
        queueSync();
      },
      stop() { running = false; cancelAnimationFrame(raf); queueSync(); },
      pause() { if (running) { this.stop(); sheet.classList.add("paused"); } },
      resume() { if (!waiting && total && left > 0 && !running) { run(); queueSync(); } },
      state() { return { total, left, running, waiting }; },
      toggle() {
        if (!total || waiting) return;
        if (left <= 0) { this.start(total); return; }
        if (running) { this.stop(); sheet.classList.add("paused"); } else { run(); queueSync(); }
        Sound.play("tap");
      },
    };
  })();

  function reveal() {
    const box = $("#answerBox");
    if (box.hidden || box.classList.contains("shown")) return;
    box.classList.add("shown");
    Sound.play("reveal");
  }

  $("#btnShow").onclick = showQuestion;
  $("#btnCancel").onclick = cancelQuestion;
  $("#btnA").onclick = () => finishQuestion(0);
  $("#btnB").onclick = () => finishQuestion(1);
  $("#btnNone").onclick = () => finishQuestion(-1);
  $("#tOk").onclick = () => { if (q) finishQuestion(q.asked); };
  $("#tNo").onclick = turnFail;
  $("#btnReveal").onclick = reveal;
  $("#qBadge").onclick = () => { if (q && q.phase === "live") Timer.toggle(); };
  $("#btnAnother").onclick = () => {
    if (!q || q.phase !== "live") return;
    loadQuestion(q.level || settings.level);
    q.stage = 0; q.asked = q.starter;
    $("#turnStatus").textContent = qStatusLine();
    $("#turnStatus").dataset.t = String(q.asked);
    Sound.play("tap");
    if (settings.play === "race") Timer.arm(q.sec); else Timer.start(q.sec);
    if (Bell && settings.play === "race" && Bell.isOn()) { Bell.questionOpened(q.L); buzzUI("armed"); }
    queueSync();
  };

  /* ================= التخريب ================= */
  const SABS = [
    { id: "bomb", icon: "💣", name: "فجّر خلية", desc: "يفضّي خلية من خلاياهم",
      ok: (t) => game.owners.some((o) => o === 1 - t) },
    { id: "freeze", icon: "❄️", name: "جمّد حرف", desc: "ما يقدرون يختارونه دورين",
      ok: () => game.owners.some((o, i) => o === -1 && !game.frozen[i]) },
    { id: "time", icon: "⏱", name: "قصّر وقتهم", desc: "وقتهم ينقص للنص في سؤالهم الجاي",
      ok: (t) => settings.timer > 0 && !game.fx.timeCut[1 - t] },
    { id: "hard", icon: "🔥", name: "سؤال صعب", desc: "سؤالهم الجاي من الأسئلة الصعبة",
      ok: (t) => settings.mode === "bank" && !game.fx.hard[1 - t] },
    { id: "skip", icon: "⛔", name: "احرمهم دورهم", desc: "يفوت دورهم الجاي ويعيد دورك",
      ok: (t) => !game.fx.skip[1 - t] },
  ];

  let targetMode = null;   // { kind, team, starter }

  function openSabotage() {
    const ps = game.pendingSab;
    if (!ps) return;
    const { team } = ps, opp = 1 - team;
    $("#sabKicker").textContent = `🎯 أحسنتم يا ${nm(team)}!`;
    $("#sabTitle").textContent = `اختاروا تخريب على ${nm(opp)}`;
    const grid = $("#sabGrid");
    grid.innerHTML = "";
    SABS.forEach((s) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sab-opt";
      const used = game.usedSab[team].includes(s.id);
      b.disabled = used || !s.ok(team);
      const ic = document.createElement("span"); ic.className = "sab-ic"; ic.textContent = s.icon;
      const tx = document.createElement("span"); tx.className = "sab-tx";
      const n = document.createElement("b"); n.textContent = s.name;
      const d = document.createElement("small"); d.textContent = used ? "استخدمتوها (مرة وحدة بس)" : b.disabled ? "ما ينفع الحين" : s.desc;
      tx.append(n, d);
      b.append(ic, tx);
      b.onclick = () => chooseSabotage(s);
      grid.append(b);
    });
    openModal("sabModal");
    Sound.play("open");
  }

  function endSabotage(msg, usedId) {
    const ps = game.pendingSab;
    if (ps && usedId && !game.usedSab[ps.team].includes(usedId)) game.usedSab[ps.team].push(usedId);
    game.pendingSab = null;
    closeModal("sabModal");
    endTarget();
    if (msg) toast(msg, 4200, true);
    if (ps) advanceTurn(ps.starter);
    queueSync();
  }

  function chooseSabotage(s) {
    const ps = game.pendingSab;
    if (!ps) return;
    const team = ps.team, opp = 1 - team;
    if (s.id === "bomb" || s.id === "freeze") {
      closeModal("sabModal");
      targetMode = { kind: s.id, team };
      $("#targetText").textContent = s.id === "bomb"
        ? `💣 اضغط على خلية ${nm(opp)} عشان تنفجر`
        : "❄️ اضغط على حرف فاضي عشان يتجمّد";
      $("#targetBar").hidden = false;
      paint();
      return;
    }
    if (s.id === "time") { game.fx.timeCut[opp] = true; Sound.play("buzz"); endSabotage(`⏱ ${nm(team)} قصّروا وقت ${nm(opp)}`, "time"); }
    else if (s.id === "hard") { game.fx.hard[opp] = true; Sound.play("buzz"); endSabotage(`🔥 ${nm(team)} عطوا ${nm(opp)} سؤال صعب`, "hard"); }
    else if (s.id === "skip") { game.fx.skip[opp] = true; Sound.play("buzz"); endSabotage(`⛔ ${nm(team)} حرموا ${nm(opp)} من دورهم`, "skip"); }
  }

  function endTarget() {
    targetMode = null;
    $("#targetBar").hidden = true;
    paint();
  }

  function isTargetCell(i) {
    if (!targetMode) return false;
    if (targetMode.kind === "bomb") return game.owners[i] === 1 - targetMode.team;
    return game.owners[i] === -1 && !game.frozen[i];
  }

  function pickTarget(i) {
    if (!targetMode) return;
    if (!isTargetCell(i)) {
      Sound.play("wrong");
      toast(targetMode.kind === "bomb" ? "اختاروا خلية ملوّنة بلون الخصم" : "اختاروا حرف فاضي", 1800);
      return;
    }
    const { kind, team } = targetMode;
    const opp = 1 - team;
    if (kind === "bomb") {
      snapshot();
      game.owners[i] = -1;
      saveGame();
      const g = board.querySelector(`.cell[data-i="${i}"]`);
      if (g) { g.classList.add("boom"); setTimeout(() => g.classList.remove("boom"), 900); }
      const { x, y } = cellCenter(i);
      FX.burst(x, y, ["#ff5a5f", "#f6b93b", "#ffffff", "#ff8c42"], 40);
      Sound.play("boom");
      endSabotage(`💣 ${nm(team)} فجّروا خلية ${nm(opp)}`, "bomb");
    } else {
      game.frozen[i] = { by: team, left: 2 };
      const { x, y } = cellCenter(i);
      FX.burst(x, y, ["#bfe9ff", "#8fd3ff", "#ffffff"], 30);
      Sound.play("freeze");
      endSabotage(`❄️ ${nm(team)} جمّدوا حرفاً على ${nm(opp)}`, "freeze");
    }
  }

  $("#sabSkip").onclick = () => endSabotage(null);
  $("#targetCancel").onclick = () => { endTarget(); if (game.pendingSab) openSabotage(); };

  /* ================= مزامنة جوالات اللاعبين ================= */
  let syncQueued = false;
  function queueSync() {
    if (syncQueued || !Bell) return;
    syncQueued = true;
    setTimeout(() => { syncQueued = false; Bell.setView(buildView()); }, 0);
  }
  function statusMessage() {
    if (!game) return "";
    if (game.roundOver) return `انتهت الجولة · فاز ${nm(game.winner)}`;
    if (game.pendingSab) return `${nm(game.pendingSab.team)} يختارون تخريب…`;
    if (!q) return `الدور على ${nm(game.turn)}: يختارون حرف`;
    if (q.phase === "prep") return `${nm(q.starter)} اختاروا حرف ${q.L}… السؤال جاي`;
    return settings.play === "turn" ? qStatusLine() : "أول واحد يضغط يجاوب";
  }
  function buildView() {
    return {
      n: game.size,
      l: game.letters.join(""),
      o: game.owners.map((o) => (o < 0 ? "." : o === 0 ? "a" : "b")).join(""),
      fz: Object.keys(game.frozen).map(Number),
      tn: game.turn,
      ph: q ? q.phase : "idle",
      md: settings.play,
      ql: q ? q.L : "",
      qt: q && q.phase === "live" && q.item ? q.item.q.slice(0, 160) : "",
      as: q ? q.asked : -1,
      pk: picked,
      msg: statusMessage().slice(0, 90),
      sc: game.score,
      tm: (() => {
        const ts = Timer.state();
        return q && q.phase === "live" && ts.total > 0 && !ts.waiting ? [Math.round(ts.left * 10) / 10, ts.total, ts.running ? 1 : 0] : null;
      })(),
      sb: (() => {
        const ps = game.pendingSab;
        if (!ps) return null;
        return {
          team: ps.team,
          t: targetMode ? (targetMode.kind === "bomb" ? "💣 المقدم يختار الخلية اللي تنفجر…" : "❄️ المقدم يختار الحرف اللي يتجمّد…") : "",
          o: SABS.map((sb) => {
            const used = game.usedSab[ps.team].includes(sb.id);
            const ok = !used && sb.ok(ps.team);
            return [sb.icon, sb.name, used ? "استخدمتوها قبل" : ok ? sb.desc : "ما ينفع الحين", ok ? 0 : 1];
          }),
        };
      })(),
      qp: (() => { const ty = Typer.state(); return ty.active ? [ty.n, ty.running ? 1 : 0, Typer.CHAR_MS] : null; })(),
      fx: { sk: game.fx.skip, tc: game.fx.timeCut, hd: game.fx.hard },
      fb: Object.keys(game.frozen).map((k) => game.frozen[k].by),
    };
  }
  function note(msg) { if (Bell && Bell.setNote) Bell.setNote(String(msg).slice(0, 90)); }


  /* ---- تعديل خلية ملونة ---- */
  let editing = -1;
  function openEdit(i) {
    editing = i;
    picked = i;
    paint();
    $("#editTitle").textContent = "خلية حرف " + LETTER_NAMES[game.letters[i]];
    $("#editA").textContent = settings.teams[0].name;
    $("#editB").textContent = settings.teams[1].name;
    openModal("editModal");
    Sound.play("tap");
  }
  function finishEdit(v) {
    closeModal("editModal");
    const i = editing;
    editing = -1;
    picked = -1;
    if (v === undefined || v === game.owners[i]) { paint(); return; }
    setOwner(i, v);
  }
  $("#editA").onclick = () => finishEdit(0);
  $("#editB").onclick = () => finishEdit(1);
  $("#editEmpty").onclick = () => finishEdit(-1);
  $("#editCancel").onclick = () => finishEdit(undefined);

  /* ---- إغلاق النوافذ بالضغط خارجها ---- */
  $$(".modal").forEach((m) => {
    m.addEventListener("click", (e) => {
      if (e.target !== m) return;
      if (m.id === "qModal") cancelQuestion();
      else if (m.id === "helpModal") closeModal("helpModal");
      else if (m.id === "confirmModal") { closeModal("confirmModal"); confirmFn = null; }
      else if (m.id === "editModal") finishEdit(undefined);
      else if (m.id === "customModal") closeCustom();
      else if (m.id === "winModal") { closeModal("winModal"); updateHud(); }
    });
  });

  /* ================= الإعدادات ================= */
  let draft = null;
  const NUMERIC = ["size", "target"];

  let setupFresh = true;   // true = ما فيه لعبة شغالة (أول مرة أو بعد الإنهاء)
  function openSetup(fresh) {
    setupFresh = !!fresh;
    draft = clone(settings);
    renderSetup();
    const inGame = !setupFresh && !!game;
    $("#btnResume").hidden = !inGame;
    $("#btnBack").hidden = !inGame;
    $("#setupTop").hidden = !inGame;
    const st = $("#btnStart");
    st.textContent = inGame ? "إنهاء اللعبة وبدء مباراة جديدة" : "ابدأ مباراة جديدة";
    st.classList.toggle("danger", inGame);
    $("#setup").hidden = false;
    $("#setup").scrollTop = 0;
  }

  function renderSetup() {
    for (const t of [0, 1]) {
      const inp = $("#name" + t);
      if (document.activeElement !== inp) inp.value = draft.teams[t].name;
      const sw = $("#sw" + t);
      sw.innerHTML = "";
      for (const key of Object.keys(COLORS)) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "swatch" + (draft.teams[t].color === key ? " on" : "") + (draft.teams[1 - t].color === key ? " taken" : "");
        b.style.setProperty("--c", COLORS[key].c);
        b.title = COLORS[key].label;
        b.setAttribute("aria-label", "اللون " + COLORS[key].label);
        b.onclick = () => pickColor(t, key);
        sw.append(b);
      }
      $(`.team-edit[data-t="${t}"]`).style.setProperty("--tc", COLORS[draft.teams[t].color].c);
    }
    $$(".seg").forEach((seg) => {
      const key = seg.dataset.key;
      $$("button", seg).forEach((b) => b.classList.toggle("on", String(draft[key]) === b.dataset.v));
    });
    const N = draft.size * draft.size;
    const resizing = !setupFresh && game && draft.size !== game.size;
    $("#sizeNote").textContent = (resizing ? "⚠️ تغيير الحجم يبدأ جولة جديدة (النتيجة تبقى). " : "") + (N > LETTERS.length
      ? `${N} خلية — بعض الحروف تتكرر`
      : `${N} خلية — كل حرف مرة وحدة`) + ". الحروف قليلة الأسئلة (مثل ظ) تظهر أقل.";
    const bankCount = Object.values(BANK).reduce((s, a) => s + a.length, 0) + Object.values(HARD).reduce((s, a) => s + a.length, 0);
    $("#bankNote").textContent = `${bankCount} سؤال جاهز` + (custom.length ? ` + ${custom.length} من عندك` : "");
    const ti = $("#timerInput");
    if (document.activeElement !== ti) ti.value = String(draft.timer);
    $("#playNote").textContent = draft.play === "turn"
      ? "الفريق اللي دوره يختار حرف ويجاوب. لو ما عرف ينتقل السؤال للفريق الثاني، وبعدها الدور يروح للثاني."
      : "كل فريق يختار حرف بدوره، والسؤال للفريقين، وأول من يجاوب (أو يضغط الجرس من جواله) ياخذ الخلية.";
    $("#levelNote").textContent = draft.level === "normal"
      ? "أسئلة عامة سهلة ومتوسطة."
      : draft.level === "hard"
        ? "أسئلة صعبة (لو حرف أسئلته الصعبة قليلة تنضاف العادية)."
        : "خليط: نص الأسئلة تقريباً صعبة.";
    // معاينة الألوان في الشعار
    const root = document.documentElement.style;
    ["a", "b"].forEach((k, t) => {
      const c = COLORS[draft.teams[t].color];
      root.setProperty(`--${k}`, c.c); root.setProperty(`--${k}-2`, c.d); root.setProperty(`--${k}-l`, c.l);
    });
  }

  function pickColor(t, key) {
    const other = 1 - t;
    const old = draft.teams[t].color;
    if (old === key) return;
    const autoName = (team, color) => draft.teams[team].name === "الفريق " + COLORS[color].label;
    if (draft.teams[other].color === key) {
      // تبديل الألوان بين الفريقين
      const otherAuto = autoName(other, key);
      draft.teams[other].color = old;
      if (otherAuto) draft.teams[other].name = "الفريق " + COLORS[old].label;
    }
    if (autoName(t, old)) draft.teams[t].name = "الفريق " + COLORS[key].label;
    draft.teams[t].color = key;
    Sound.play("tap");
    renderSetup();
  }

  $$(".seg").forEach((seg) => {
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const key = seg.dataset.key;
      draft[key] = NUMERIC.includes(key) ? +b.dataset.v : b.dataset.v;
      Sound.unlock();
      Sound.play("tap");
      renderSetup();
    });
  });
  // وقت الإجابة: أرقام عربية أو إنجليزية، وفاضي أو 0 = بدون عدّاد
  $("#timerInput").addEventListener("input", (e) => {
    const digits = e.target.value
      .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x660))
      .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x6f0))
      .replace(/\D/g, "")
      .slice(0, 3);
    const n = digits === "" ? 0 : Math.min(600, parseInt(digits, 10));
    if (e.target.value !== digits) e.target.value = digits;
    if (digits !== "" && String(n) !== digits) e.target.value = String(n);
    draft.timer = n;
  });
  for (const t of [0, 1]) {
    $("#name" + t).addEventListener("input", (e) => { draft.teams[t].name = e.target.value; });
  }


  function commitDraft() {
    draft.teams.forEach((tm, i) => { tm.name = (tm.name || "").trim() || "الفريق " + COLORS[tm.color].label; });
    settings = draft;
    draft = null;
    saveSettings();
    applyTheme();
    $("#setup").hidden = true;
    if (Bell) Bell.teamsChanged();
  }
  function showSoundState() {
    const st = Sound.state();
    const ok = st === "running";
    $("#soundState").textContent = ok
      ? "✅ الصوت شغّال. إذا ما سمعت: ارفع الصوت وأطفئ زر الصامت."
      : `⚠️ الصوت ما انفتح بعد (الحالة: ${st}). المس الشاشة ثم جرّب مرة ثانية.`;
    $("#soundState").dataset.ok = ok ? "1" : "0";
  }
  $("#btnSoundTest").onclick = () => {
    Sound.unlock();
    setTimeout(() => { Sound.play("test"); showSoundState(); }, 120);
  };
  Sound.onState(showSoundState);
  $("#btnStart").onclick = () => {
    Sound.unlock();
    const hasProgress = game && (game.score[0] || game.score[1] || game.owners.some((o) => o !== -1));
    const go = () => { commitDraft(); newMatch(); Sound.play("start"); };
    if (!setupFresh && hasProgress) {
      askConfirm("ننهي اللعبة الحالية؟", "اللوحة والنتيجة تنمسح، وتبدأ مباراة جديدة بالإعدادات هذي.", "إي، أنهِ وابدأ", go);
    } else go();
  };
  $("#btnBack").onclick = () => $("#btnResume").click();
  $("#btnResume").onclick = () => {
    const sizeChanged = draft.size !== game.size;
    commitDraft();
    if (sizeChanged) newRound(game.turn);
    else renderBoard(false);
  };

  /* ---- أسئلتي ---- */
  const cLetter = $("#cLetter");
  LETTERS.forEach((L) => { const o = document.createElement("option"); o.value = L; o.textContent = L; cLetter.append(o); });
  function renderCustom() {
    const list = $("#customList");
    list.innerHTML = "";
    if (!custom.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "ما أضفت أسئلة للحين.";
      list.append(li);
      return;
    }
    custom.forEach((c, idx) => {
      const li = document.createElement("li");
      const l = document.createElement("span"); l.className = "cl"; l.textContent = c.l;
      const q = document.createElement("span"); q.className = "cq";
      q.append(document.createTextNode(c.q + " ← "));
      const b = document.createElement("b"); b.textContent = c.a; q.append(b);
      const del = document.createElement("button"); del.className = "del"; del.type = "button"; del.textContent = "×";
      del.setAttribute("aria-label", "حذف السؤال");
      del.onclick = () => { custom.splice(idx, 1); store.set("custom", custom); renderCustom(); };
      li.append(l, q, del);
      list.append(li);
    });
  }
  const HAMZA = { "أ": "ا", "إ": "ا", "آ": "ا" };
  function letterOf(answer) {
    let a = answer.trim();
    if (a.startsWith("ال") && a.length > 3) a = a.slice(2);
    const ch = HAMZA[a[0]] || a[0];
    return LETTERS.includes(ch) ? ch : null;
  }
  function parseBulk(text) {
    const ok = [], bad = [];
    text.split(/\r?\n/).forEach((line, n) => {
      if (!line.trim()) return;
      const parts = line.split(/\s*[|\t]\s*/).map((x) => x.trim()).filter(Boolean);
      let L, q, a;
      if (parts.length === 3 && LETTERS.includes(HAMZA[parts[0]] || parts[0])) {
        L = HAMZA[parts[0]] || parts[0]; q = parts[1]; a = parts[2];
      } else if (parts.length === 2) {
        q = parts[0]; a = parts[1]; L = letterOf(a);
      }
      if (L && q && a) ok.push({ l: L, q: q.slice(0, 160), a: a.slice(0, 60) });
      else bad.push(n + 1);
    });
    return { ok, bad };
  }
  $("#bulkAdd").onclick = () => {
    const { ok, bad } = parseBulk($("#bulkText").value);
    const known = new Set(custom.map((c) => c.l + "|" + c.q));
    const fresh = ok.filter((c) => !known.has(c.l + "|" + c.q));
    custom = fresh.concat(custom);
    store.set("custom", custom);
    renderCustom();
    let msg = `أُضيف ${fresh.length} سؤال`;
    if (ok.length - fresh.length) msg += ` · ${ok.length - fresh.length} مكرر`;
    if (bad.length) msg += ` · أسطر ما فهمتها: ${bad.slice(0, 8).join("، ")}${bad.length > 8 ? "…" : ""}`;
    $("#bulkNote").textContent = msg;
    if (fresh.length) { $("#bulkText").value = ""; Sound.play("correct"); }
  };
  $("#bulkCopy").onclick = () => {
    const text = custom.map((c) => `${c.l} | ${c.q} | ${c.a}`).join("\n");
    if (!text) { $("#bulkNote").textContent = "ما عندك أسئلة تنسخها."; return; }
    const fallback = () => {
      const ta = $("#bulkText");
      ta.value = text; ta.focus(); ta.select();
      $("#bulkNote").textContent = "حددتها لك في المربع، انسخها يدوياً.";
    };
    try {
      navigator.clipboard.writeText(text).then(
        () => { $("#bulkNote").textContent = `نُسخ ${custom.length} سؤال.`; },
        fallback
      );
    } catch (_) { fallback(); }
  };

  function closeCustom() { closeModal("customModal"); if (draft) renderSetup(); }
  $("#btnCustom").onclick = () => { renderCustom(); openModal("customModal"); };
  $("#customClose").onclick = closeCustom;
  $("#customForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("#cQ").value.trim(), a = $("#cA").value.trim();
    if (!q || !a) { (q ? $("#cA") : $("#cQ")).focus(); return; }
    custom.unshift({ l: cLetter.value, q, a });
    store.set("custom", custom);
    $("#cQ").value = ""; $("#cA").value = "";
    $("#cQ").focus();
    Sound.play("correct");
    renderCustom();
  });

  /* ================= شريط الأدوات ================= */
  const canFull = !!(document.fullscreenEnabled && document.documentElement.requestFullscreen);
  $("#btnFull").hidden = !canFull;
  function toggleFull() {
    if (!canFull) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }
  $("#btnUndo").onclick = undo;
  $("#btnClear").onclick = clearBoard;
  $("#btnShuffle").onclick = reshuffle;
  $("#btnSettings").onclick = () => { if (!anyModalOpen() && !targetMode) openSetup(false); };
  $("#btnEnd").onclick = () => {
    if (anyModalOpen() || targetMode) return;
    askConfirm("ننهي اللعبة؟", "اللوحة والنتيجة تنمسح وترجعون لشاشة الإعدادات.", "إي، أنهِ اللعبة", () => { newMatch(); openSetup(true); });
  };
  $("#btnBell").onclick = () => { if (Bell && !anyModalOpen() && !targetMode) Bell.openPanel(); };
  $("#btnPlayerMode").onclick = () => { if (Bell) Bell.openPlayer(); };
  $("#btnHelp").onclick = () => { if (!anyModalOpen() && !targetMode) openModal("helpModal"); };
  $("#helpClose").onclick = () => closeModal("helpModal");
  $("#btnFull").onclick = toggleFull;
  $("#btnNextFloat").onclick = continueAfterWin;
  for (const t of [0, 1]) {
    $("#team" + t).onclick = () => {
      if (game.roundOver || anyModalOpen() || targetMode) return;
      game.turn = t;
      paint();
      Sound.play("tap");
      saveGame();
    };
  }

  /* ================= لوحة المفاتيح ================= */
  document.addEventListener("keydown", (e) => {
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (!$("#qModal").hidden && q) {
      if (e.key === "Escape") { cancelQuestion(); return; }
      if (q.phase === "prep") {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); showQuestion(); }
      } else if (settings.play === "turn") {
        if (e.key === "1") finishQuestion(q.asked);
        else if (e.key === "2") turnFail();
        else if (e.key === " ") { e.preventDefault(); reveal(); }
      } else {
        if (e.key === "1") finishQuestion(0);
        else if (e.key === "2") finishQuestion(1);
        else if (e.key === "0") finishQuestion(-1);
        else if (e.key === " ") { e.preventDefault(); reveal(); }
      }
      return;
    }
    if (!$("#confirmModal").hidden) { if (e.key === "Escape") { closeModal("confirmModal"); confirmFn = null; } return; }
    if (!$("#helpModal").hidden) { if (e.key === "Escape") closeModal("helpModal"); return; }
    if (!$("#sabModal").hidden) return;
    if (!$("#editModal").hidden) { if (e.key === "Escape") finishEdit(undefined); return; }
    if (!$("#customModal").hidden) { if (e.key === "Escape") closeCustom(); return; }
    if (!$("#bellModal").hidden) { if (e.key === "Escape") $("#bellModal").hidden = true; return; }
    if (!$("#player").hidden) return;
    if (!$("#winModal").hidden) { if (e.key === "Escape") { closeModal("winModal"); updateHud(); } return; }
    if (!$("#setup").hidden) return;
    if (targetMode) { if (e.key === "Escape") $("#targetCancel").click(); return; }
    const k = e.key.toLowerCase();
    if (k === "z" || k === "ئ") undo();
    else if (k === "f" || k === "ب") toggleFull();
  });

  /* ================= إبقاء الشاشة شغالة ================= */
  async function keepAwake() {
    try {
      if (navigator.wakeLock && document.visibilityState === "visible") await navigator.wakeLock.request("screen");
    } catch (_) {}
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") keepAwake(); });
  document.addEventListener("pointerdown", keepAwake, { once: true });

  /* ================= تشغيل ================= */
  document.documentElement.setAttribute("dir", "rtl");
  document.documentElement.setAttribute("lang", "ar");
  applyTheme();
  keepAwake();
  if (Bell) {
    Bell.init({
      teams: () => settings.teams.map((t) => ({ n: t.name, c: COLORS[t.color].c, l: COLORS[t.color].l, d: COLORS[t.color].d })),
      drawMini,
      sound: (n) => Sound.play(n),
      onBuzz: (info) => {
        if ($("#qModal").hidden || !q || q.phase !== "live") return;
        raceBuzzStarted();
        Sound.play("buzz");
        buzzUI("locked", info);
      },
      onRoster: updateBellBadge,
      onStatus: () => { updateBellBadge(); queueSync(); },
    });
  } else {
    $("#btnBell").hidden = true;
    $("#btnPlayerMode").hidden = true;
  }
  updateBellBadge();
  const playerOnly = location.hash === "#bell";
  // أول فتح في الجلسة = نبدأ من شاشة الإعدادات (التحديث وسط اللعب يرجعك للوحة مباشرة)
  const newSession = (() => { try { return sessionStorage.getItem("haroof3:splash") !== "1"; } catch (_) { return true; } })();

  /* ================= شاشة الافتتاح ================= */
  (function splash() {
    const sp = $("#splash");
    if (!sp) return;
    let seen = false;
    try { seen = sessionStorage.getItem("haroof3:splash") === "1"; } catch (_) {}
    if (seen || playerOnly) { sp.hidden = true; return; }
    // حروف عايمة في الخلفية
    const bg = $("#splashBg");
    for (let i = 0; i < 26; i++) {
      const s = document.createElement("span");
      s.className = "sb";
      s.textContent = LETTERS[Math.floor(Math.random() * LETTERS.length)];
      s.style.left = (Math.random() * 100).toFixed(1) + "%";
      s.style.fontSize = (26 + Math.random() * 90).toFixed(0) + "px";
      s.style.animationDuration = (7 + Math.random() * 8).toFixed(1) + "s";
      s.style.animationDelay = (-Math.random() * 12).toFixed(1) + "s";
      s.style.setProperty("--o", (0.07 + Math.random() * 0.14).toFixed(2));
      s.style.setProperty("--r", (Math.random() * 60 - 30).toFixed(0) + "deg");
      bg.append(s);
    }
    let started = false, ended = false, t0 = 0;
    const end = () => {
      if (ended) return;
      ended = true;
      sp.classList.add("out");
      try { sessionStorage.setItem("haroof3:splash", "1"); } catch (_) {}
      setTimeout(() => { sp.hidden = true; }, 650);
    };
    const start = () => {
      if (started) return;
      started = true;
      t0 = Date.now();
      sp.classList.add("go");
      Sound.unlock();
      Sound.play("intro");
      setTimeout(end, 3100);
    };
    // لو المتصفح يسمح بالصوت نبدأ مباشرة، وإلا ننتظر أول لمسة
    Sound.unlock();
    setTimeout(() => { if (Sound.running()) start(); }, 150);
    sp.addEventListener("click", () => {
      if (!started) start();
      else if (Date.now() - t0 > 1400) end();
    });
  })();
  if (game) {
    renderBoard(true);
    if (newSession && !playerOnly) {
      const hasProgress = !game.roundOver && (game.score[0] || game.score[1] || game.owners.some((o) => o !== -1));
      game.pendingSab = null;
      openSetup(!hasProgress);   // فيه لعبة محفوظة؟ يطلع زر «رجوع للعبة»
    } else if (game.roundOver && !playerOnly) setTimeout(showWin, 700);
    else if (game.pendingSab && !playerOnly) setTimeout(() => { if (game.pendingSab) openSabotage(); }, 700);
  } else {
    newMatch();
    if (!playerOnly) openSetup(true);
  }
})();
