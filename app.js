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
    size: 5, timer: 20, target: 2, mode: "bank", font: "ruqaa", sound: true,
  };
  const BANK = window.QUESTION_BANK || {};
  const MORE = window.QUESTION_BANK_MORE || {};
  for (const L in MORE) BANK[L] = (BANK[L] || []).concat(MORE[L]);

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
    if (![0, 10, 20, 30, 60].includes(out.timer)) out.timer = 20;
    if (![1, 2, 3].includes(out.target)) out.target = 2;
    if (!["bank", "host"].includes(out.mode)) out.mode = "bank";
    if (!["ruqaa", "kufi", "bold"].includes(out.font)) out.font = "ruqaa";
    out.sound = out.sound !== false;
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
  else { game.history = game.history || []; game.winPath = game.winPath || []; }

  const saveSettings = () => store.set("settings", settings);
  const saveGame = () => store.set("game", game);

  /* ================= الأصوات ================= */
  const Sound = (() => {
    let ctx = null, master = null;
    function init() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try {
          ctx = new AC();
          master = ctx.createGain();
          master.gain.value = 0.55;
          master.connect(ctx.destination);
        } catch (_) { ctx = null; return null; }
      }
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      return ctx;
    }
    function note(freq, at = 0, dur = 0.15, type = "sine", vol = 0.25, toFreq = null) {
      const t0 = ctx.currentTime + at;
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
      tap:     () => note(620, 0, 0.07, "triangle", 0.12),
      open:    () => { note(320, 0, 0.28, "sine", 0.18, 960); note(1280, 0.2, 0.18, "triangle", 0.1); },
      reveal:  () => { note(784, 0, 0.14, "sine", 0.2); note(1175, 0.09, 0.24, "sine", 0.18); },
      tick:    () => note(1050, 0, 0.05, "square", 0.06),
      correct: () => { note(659, 0, 0.14, "triangle", 0.28); note(880, 0.1, 0.14, "triangle", 0.28); note(1319, 0.2, 0.32, "triangle", 0.26); },
      wrong:   () => { note(260, 0, 0.32, "sawtooth", 0.12, 150); },
      timeup:  () => { note(196, 0, 0.32, "square", 0.12); note(185, 0.36, 0.5, "square", 0.12); },
      claim:   () => { note(440, 0, 0.09, "sine", 0.2, 880); note(1760, 0.07, 0.2, "sine", 0.07); },
      undo:    () => note(700, 0, 0.12, "sine", 0.14, 420),
      buzz:    () => { note(880, 0, 0.18, "square", 0.16); note(660, 0.1, 0.35, "square", 0.16); },
      shuffle: () => { for (let i = 0; i < 6; i++) note(500 + i * 120, i * 0.04, 0.06, "triangle", 0.08); },
      win:     () => {
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) => note(f, i * 0.12, 0.28, "triangle", 0.24));
        [523, 659, 784].forEach((f) => note(f, 0.75, 1.2, "sine", 0.12));
      },
    };
    return {
      unlock() { if (settings.sound) init(); },
      play(name) {
        if (!settings.sound || !init()) return;
        try { sounds[name] && sounds[name](); } catch (_) {}
      },
    };
  })();
  document.addEventListener("pointerdown", () => Sound.unlock(), { once: true });

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
    $("#btnSound").classList.toggle("off", !settings.sound);
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
  function dealLetters(n) {
    const base = shuffle(LETTERS);
    if (n <= base.length) return base.slice(0, n);
    return shuffle(base.concat(shuffle(LETTERS).slice(0, n - base.length)));
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
    const w = W * (N + 0.5), h = K * (1.5 * (N - 1) + 2), pad = 0.42 * K;
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
          el("polygon", { class: "ring", points: poly(x, y, 0.93) })
        );
        const txt = el("text", { class: "letter", x: x.toFixed(3), y: y.toFixed(3) });
        txt.textContent = game.letters[i];
        inner.append(txt);
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
      const wi = game.winPath.indexOf(i);
      g.classList.toggle("win", wi >= 0);
      if (wi >= 0) g.style.setProperty("--wd", (wi * 0.09).toFixed(2) + "s");
    });
    updateHud();
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
  function newMatch() {
    game = {
      size: settings.size,
      letters: dealLetters(settings.size * settings.size),
      owners: Array(settings.size * settings.size).fill(-1),
      turn: 0, score: [0, 0], round: 1,
      history: [], roundOver: false, winPath: [], winner: -1,
    };
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
    closeModal("winModal");
    renderBoard(true);
    Sound.play("shuffle");
    saveGame();
  }

  function snapshot() {
    game.history.push({
      letters: game.letters.slice(), owners: game.owners.slice(), turn: game.turn,
      score: game.score.slice(), roundOver: game.roundOver, winPath: game.winPath.slice(), winner: game.winner,
    });
    if (game.history.length > 120) game.history.shift();
  }
  function undo() {
    if (anyModalOpen()) return;
    const s = game.history.pop();
    if (!s) return;
    const lettersChanged = s.letters.join("") !== game.letters.join("");
    Object.assign(game, s);
    if (lettersChanged) renderBoard(false); else paint();
    Sound.play("undo");
    saveGame();
  }
  function clearBoard() {
    if (anyModalOpen() || game.owners.every((o) => o === -1)) return;
    snapshot();
    game.owners = game.owners.map(() => -1);
    game.roundOver = false; game.winPath = []; game.winner = -1;
    paint();
    Sound.play("undo");
    saveGame();
  }
  function reshuffle() {
    if (anyModalOpen()) return;
    if (game.roundOver) { continueAfterWin(); return; }
    snapshot();
    game.letters = dealLetters(game.size * game.size);
    game.owners = game.owners.map(() => -1);
    renderBoard(true);
    Sound.play("shuffle");
    saveGame();
  }

  function setOwner(i, t) {
    snapshot();
    game.owners[i] = t;
    if (t === 0 || t === 1) game.turn = t;
    paint();
    if (t === 0 || t === 1) claimFx(i, t);
    // اللي لوّن الخلية أول من يُفحص، وبعدها الثاني (لو عُدّلت خلية يدوياً)
    for (const team of t === 1 ? [1, 0] : [0, 1]) {
      const path = findPath(team);
      if (path) { roundWon(team, path); break; }
    }
    saveGame();
  }

  function roundWon(t, path) {
    game.score[t]++;
    game.roundOver = true;
    game.winPath = path;
    game.winner = t;
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
    $("#winName").textContent = settings.teams[t].name;
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
  $("#winSettings").onclick = () => { closeModal("winModal"); openSetup(); };

  function onCell(i) {
    Sound.unlock();
    if (anyModalOpen() || !$("#setup").hidden) return;
    if (game.roundOver) { showWin(); return; }
    if (game.owners[i] !== -1) { openEdit(i); return; }
    openQuestion(i);
  }

  /* ================= النوافذ ================= */
  function openModal(id) { $("#" + id).hidden = false; }
  function closeModal(id) { $("#" + id).hidden = true; }
  const anyModalOpen = () => $$(".modal").some((m) => !m.hidden);

  /* ---- السؤال ---- */
  function questionPool(L) {
    const seen = new Set();
    return (BANK[L] || []).map(([q, a]) => ({ q, a })).concat(custom.filter((c) => c.l === L))
      .filter((x) => !seen.has(x.q) && seen.add(x.q));
  }
  function pickQuestion(L) {
    const all = questionPool(L);
    if (!all.length) return null;
    let seen = Array.isArray(used[L]) ? used[L] : [];
    let fresh = all.filter((x) => !seen.includes(x.q));
    if (!fresh.length) { seen = []; fresh = all; }
    const q = fresh[Math.floor(Math.random() * fresh.length)];
    used[L] = seen.concat(q.q);
    store.set("used", used);
    return q;
  }

  function loadQuestion(L) {
    const box = $("#answerBox");
    box.classList.remove("shown");
    const q = settings.mode === "bank" ? pickQuestion(L) : null;
    if (q) {
      $("#qText").textContent = q.q;
      $("#qAnswer").textContent = q.a;
      box.hidden = false;
      $("#btnAnother").hidden = questionPool(L).length < 2;
    } else {
      $("#qText").textContent = settings.mode === "bank"
        ? "ما فيه أسئلة لهذا الحرف، اسألهم سؤال من عندك."
        : "اسألهم سؤال إجابته تبدأ بهذا الحرف.";
      box.hidden = true;
      $("#btnAnother").hidden = true;
    }
  }

  /* ---- الجرس (جهة المقدم) ---- */
  const Bell = window.HaroofBell || null;
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
      st.textContent = `🔔 ${info.name} (${settings.teams[info.team].name}) ضغط أول!`;
    } else if (kind === "none") {
      buzzTeam = -1;
      st.textContent = "الجرس مقفل: الفريقين جرّبوا";
    } else {
      buzzTeam = -1;
      st.textContent = "🔔 الجرس مفتوح… أول من يضغط يجاوب";
    }
    $("#buzzActions").hidden = kind !== "locked";
  }
  $("#buzzOk").onclick = () => { if (buzzTeam >= 0) resolve(buzzTeam); };
  $("#buzzBad").onclick = () => {
    if (!Bell || buzzTeam < 0) return;
    const r = Bell.rearm(buzzTeam);
    Sound.play("wrong");
    Timer.resume();
    buzzUI(r.armed ? "armed" : "none");
  };
  function updateBellBadge() {
    const b = $("#bellBadge");
    if (!Bell) { $("#btnBell").hidden = true; return; }
    const n = Bell.isOn() ? Bell.playerCount() : 0;
    b.hidden = !Bell.isOn();
    b.textContent = Bell.isOn() ? String(n) : "";
    $("#btnBell").classList.toggle("on", Bell.isOn());
  }

  function openQuestion(i) {
    picked = i;
    paint();
    const L = game.letters[i];
    $("#qLetter").textContent = L;
    $("#qLetterName").textContent = "تبدأ بحرف " + LETTER_NAMES[L];
    $("#btnA").textContent = "✓ " + settings.teams[0].name;
    $("#btnB").textContent = "✓ " + settings.teams[1].name;
    loadQuestion(L);
    // إعادة تشغيل أنيميشن الحرف
    const bl = $("#qLetter");
    bl.style.animation = "none"; void bl.offsetWidth; bl.style.animation = "";
    openModal("qModal");
    Sound.play("open");
    Timer.start(settings.timer);
    if (Bell) { Bell.questionOpened(L); buzzUI(Bell.isOn() ? "armed" : "off"); }
  }

  function resolve(result) {   // 0 أو 1 = الفريق الفايز، -1 ما أحد، null إغلاق
    if ($("#qModal").hidden) return;
    Timer.stop();
    closeModal("qModal");
    if (Bell) Bell.questionClosed();
    buzzUI("off");
    const i = picked;
    picked = -1;
    if (result === 0 || result === 1) {
      Sound.play("correct");
      setOwner(i, result);
    } else {
      if (result === -1) Sound.play("wrong");
      paint();
    }
  }

  const Timer = (() => {
    const ring = $("#timerRing"), txt = $("#timerText"), sheet = $("#qSheet");
    const C = 2 * Math.PI * 46;
    ring.style.strokeDasharray = C.toFixed(2);
    let total = 0, left = 0, raf = 0, last = 0, running = false, lastWhole = 0;
    function draw() {
      const frac = total ? Math.max(0, left / total) : 1;
      ring.style.strokeDashoffset = (C * (1 - frac)).toFixed(2);
      txt.textContent = !total ? "" : left > 0 ? Math.ceil(left) : "انتهى الوقت";
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
      start(sec) {
        this.stop();
        total = sec; left = sec; lastWhole = Math.ceil(sec);
        sheet.classList.toggle("no-timer", !sec);
        sheet.classList.remove("paused");
        draw();
        if (sec > 0) run();
      },
      stop() { running = false; cancelAnimationFrame(raf); },
      pause() { if (running) { this.stop(); sheet.classList.add("paused"); } },
      resume() { if (total && left > 0 && !running) run(); },
      toggle() {
        if (!total) return;
        if (left <= 0) { this.start(total); return; }
        if (running) { this.stop(); sheet.classList.add("paused"); } else run();
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

  $("#btnA").onclick = () => resolve(0);
  $("#btnB").onclick = () => resolve(1);
  $("#btnNone").onclick = () => resolve(-1);
  $("#btnCancel").onclick = () => resolve(null);
  $("#btnReveal").onclick = reveal;
  $("#qBadge").onclick = () => Timer.toggle();
  $("#btnAnother").onclick = () => {
    loadQuestion(game.letters[picked]);
    Sound.play("tap");
    Timer.start(settings.timer);
  };

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
      if (m.id === "qModal") resolve(null);
      else if (m.id === "editModal") finishEdit(undefined);
      else if (m.id === "customModal") closeCustom();
      else if (m.id === "winModal") { closeModal("winModal"); updateHud(); }
    });
  });

  /* ================= الإعدادات ================= */
  let draft = null;
  const NUMERIC = ["size", "timer", "target"];

  function openSetup() {
    draft = clone(settings);
    renderSetup();
    $("#btnResume").hidden = !game;
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
    $("#sizeNote").textContent = N > LETTERS.length
      ? `${N} خلية — بعض الحروف تتكرر`
      : `${N} خلية — كل حرف مرة وحدة`;
    const bankCount = Object.values(BANK).reduce((s, a) => s + a.length, 0);
    $("#bankNote").textContent = `${bankCount} سؤال جاهز` + (custom.length ? ` + ${custom.length} من عندك` : "");
    const sw = $("#swSound");
    sw.setAttribute("aria-checked", String(!!draft.sound));
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
  for (const t of [0, 1]) {
    $("#name" + t).addEventListener("input", (e) => { draft.teams[t].name = e.target.value; });
  }
  $("#swSound").onclick = () => {
    draft.sound = !draft.sound;
    settings.sound = draft.sound;
    Sound.unlock();
    Sound.play("tap");
    renderSetup();
  };

  function commitDraft() {
    draft.teams.forEach((tm, i) => { tm.name = (tm.name || "").trim() || "الفريق " + COLORS[tm.color].label; });
    settings = draft;
    draft = null;
    saveSettings();
    applyTheme();
    $("#setup").hidden = true;
    if (Bell) Bell.teamsChanged();
  }
  $("#btnStart").onclick = () => {
    Sound.unlock();
    commitDraft();
    newMatch();
    Sound.play("shuffle");
  };
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
  function toggleSound() {
    settings.sound = !settings.sound;
    saveSettings();
    applyTheme();
    if (settings.sound) { Sound.unlock(); Sound.play("tap"); }
  }
  $("#btnUndo").onclick = undo;
  $("#btnClear").onclick = clearBoard;
  $("#btnShuffle").onclick = reshuffle;
  $("#btnSettings").onclick = () => { if (!anyModalOpen()) openSetup(); };
  $("#btnBell").onclick = () => { if (Bell && !anyModalOpen()) Bell.openPanel(); };
  $("#btnPlayerMode").onclick = () => { if (Bell) Bell.openPlayer(); };
  $("#btnSound").onclick = toggleSound;
  $("#btnFull").onclick = toggleFull;
  $("#btnNextFloat").onclick = continueAfterWin;
  for (const t of [0, 1]) {
    $("#team" + t).onclick = () => {
      if (game.roundOver || anyModalOpen()) return;
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
    if (!$("#qModal").hidden) {
      if (e.key === "1") resolve(0);
      else if (e.key === "2") resolve(1);
      else if (e.key === "0") resolve(-1);
      else if (e.key === " ") { e.preventDefault(); reveal(); }
      else if (e.key === "Escape") resolve(null);
      return;
    }
    if (!$("#editModal").hidden) { if (e.key === "Escape") finishEdit(undefined); return; }
    if (!$("#customModal").hidden) { if (e.key === "Escape") closeCustom(); return; }
    if (!$("#bellModal").hidden) { if (e.key === "Escape") $("#bellModal").hidden = true; return; }
    if (!$("#player").hidden) return;
    if (!$("#winModal").hidden) { if (e.key === "Escape") { closeModal("winModal"); updateHud(); } return; }
    if (!$("#setup").hidden) return;
    const k = e.key.toLowerCase();
    if (k === "z" || k === "ئ") undo();
    else if (k === "f" || k === "ب") toggleFull();
    else if (k === "m" || k === "ة") toggleSound();
  });

  /* ================= تشغيل ================= */
  document.documentElement.setAttribute("dir", "rtl");
  document.documentElement.setAttribute("lang", "ar");
  applyTheme();
  if (Bell) {
    Bell.init({
      teams: () => settings.teams.map((t) => ({ n: t.name, c: COLORS[t.color].c, l: COLORS[t.color].l, d: COLORS[t.color].d })),
      onBuzz: (info) => {
        if ($("#qModal").hidden) return;
        Timer.pause();
        Sound.play("buzz");
        buzzUI("locked", info);
      },
      onRoster: updateBellBadge,
      onStatus: updateBellBadge,
    });
  } else {
    $("#btnBell").hidden = true;
    $("#btnPlayerMode").hidden = true;
  }
  updateBellBadge();
  const playerOnly = location.hash === "#bell";
  if (game) {
    renderBoard(true);
    if (game.roundOver && !playerOnly) setTimeout(showWin, 700);
  } else {
    newMatch();
    if (!playerOnly) openSetup();
  }
})();
