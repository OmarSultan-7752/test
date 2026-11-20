(() => {
  "use strict";

  const R = 1;                       // نصف قطر الخلية
  const W = Math.sqrt(3) * R;        // عرض الخلية (رأسها لفوق)
  const ALL_LETTERS = "ابتثجحخدذرزسشصضطظعغفقكلمنهوي".split("");
  const SVG_NS = "http://www.w3.org/2000/svg";
  const STORE = "haroof-state-v2";

  let SIZE = 5;

  // owner: 0 فاضي، 1 أحمر، 2 أزرق
  let state = {
    letters: [],
    owners: [],
    history: [],          // كل عنصر: { owners, turn, wins }
    wins: { red: 0, blue: 0 },
    names: { red: "الفريق الأحمر", blue: "الفريق الأزرق" },
    turn: 1,              // مين يختار الحرف الجاي
    over: false,
    settings: { size: 5, timer: 20, quick: false, sound: true },
  };

  const $ = (id) => document.getElementById(id);
  const board = $("board");
  const idx = (r, c) => r * SIZE + c;
  const teamKey = (t) => (t === 1 ? "red" : "blue");

  /* ---------- حفظ وتحميل ---------- */
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (_) {}
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE));
      if (!s) return;
      const size = (s.settings && s.settings.size) || 5;
      if (s.letters && s.letters.length === size * size && s.owners && s.owners.length === size * size) {
        state = { ...state, ...s, settings: { ...state.settings, ...s.settings } };
        SIZE = size;
      } else if (s.settings) {
        state.settings = { ...state.settings, ...s.settings };
        state.wins = s.wins || state.wins;
        state.names = s.names || state.names;
        SIZE = state.settings.size;
      }
    } catch (_) {}
  }

  /* ---------- أصوات ---------- */
  let audio;
  function tone(freq, dur = 0.12, delay = 0, type = "sine", vol = 0.15) {
    if (!state.settings.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audio.currentTime + delay;
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(audio.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    } catch (_) {}
  }
  const sfx = {
    place: () => tone(660, 0.12, 0, "triangle"),
    wrong: () => tone(180, 0.25, 0, "sawtooth", 0.1),
    tick: () => tone(880, 0.06, 0, "square", 0.06),
    timeUp: () => { tone(220, 0.35, 0, "sawtooth", 0.12); tone(180, 0.45, 0.2, "sawtooth", 0.12); },
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, i * 0.14, "triangle", 0.18)),
  };

  /* ---------- الحروف ---------- */
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function newLetters() {
    state.letters = shuffle(ALL_LETTERS).slice(0, SIZE * SIZE);
  }

  /* ---------- رسم اللوحة ---------- */
  const center = (r, c) => ({ x: W * (c + r / 2) + W / 2, y: 1.5 * R * r + R });

  // رؤوس الخلية: 0 يمين-تحت، 1 تحت، 2 يسار-تحت، 3 يسار-فوق، 4 فوق، 5 يمين-فوق
  const vertex = (cx, cy, k, rad = R) => {
    const a = (Math.PI / 180) * (30 + 60 * k);
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  };
  const pts = (cx, cy, ks, rad = R) =>
    ks.map((k) => vertex(cx, cy, k, rad).map((n) => n.toFixed(3)).join(",")).join(" ");

  function el(name, attrs = {}) {
    const e = document.createElementNS(SVG_NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function build() {
    board.innerHTML = "";
    const totalW = W * (SIZE + (SIZE - 1) / 2);
    const totalH = 1.5 * R * (SIZE - 1) + 2 * R;
    const pad = 0.5;
    board.setAttribute("viewBox", `${-pad} ${-pad} ${totalW + pad * 2} ${totalH + pad * 2}`);

    const edges = el("g");
    const cells = el("g");

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const { x, y } = center(r, c);

        // حدود اللوحة: أحمر فوق وتحت، أزرق يمين ويسار
        if (r === 0)        edges.append(el("polyline", { class: "edge red",  points: pts(x, y, [3, 4, 5]) }));
        if (r === SIZE - 1) edges.append(el("polyline", { class: "edge red",  points: pts(x, y, [0, 1, 2]) }));
        if (c === 0)        edges.append(el("polyline", { class: "edge blue", points: pts(x, y, [1, 2, 3]) }));
        if (c === SIZE - 1) edges.append(el("polyline", { class: "edge blue", points: pts(x, y, [4, 5, 0]) }));

        const g = el("g", { class: "cell", "data-i": idx(r, c) });
        g.append(el("polygon", { class: "hex", points: pts(x, y, [0, 1, 2, 3, 4, 5], R * 0.95) }));
        const t = el("text", { class: "letter", x: x.toFixed(3), y: (y + 0.05).toFixed(3) });
        t.textContent = state.letters[idx(r, c)];
        g.append(t);
        g.addEventListener("click", () => onCell(idx(r, c)));
        cells.append(g);
      }
    }
    board.append(edges, cells);
    paint();
  }

  const cls = ["", "red", "blue"];
  let pickedCell = -1;
  let winPath = [];

  function paint() {
    board.querySelectorAll(".cell").forEach((g) => {
      const i = +g.dataset.i;
      g.setAttribute(
        "class",
        "cell " + cls[state.owners[i]] +
          (winPath.includes(i) ? " win" : "") +
          (i === pickedCell ? " pick" : "")
      );
    });
    $("winsRed").textContent = state.wins.red;
    $("winsBlue").textContent = state.wins.blue;
    if (document.activeElement !== $("nameRed")) $("nameRed").value = state.names.red;
    if (document.activeElement !== $("nameBlue")) $("nameBlue").value = state.names.blue;
    $("teamRed").classList.toggle("turn", state.turn === 1);
    $("teamBlue").classList.toggle("turn", state.turn === 2);
    $("hint").textContent = state.settings.quick
      ? "اضغط على الخلية: أحمر ← أزرق ← فاضي"
      : "اضغط على حرف لتفتح السؤال";
  }

  /* ---------- منطق الفوز ---------- */
  function neighbors(r, c) {
    return [[r, c - 1], [r, c + 1], [r - 1, c], [r + 1, c], [r - 1, c + 1], [r + 1, c - 1]]
      .filter(([a, b]) => a >= 0 && a < SIZE && b >= 0 && b < SIZE);
  }

  // يرجع مسار الفوز لو الفريق وصل، وإلا null
  function findPath(owner) {
    const prev = new Map();
    const queue = [];
    for (let k = 0; k < SIZE; k++) {
      const [r, c] = owner === 1 ? [0, k] : [k, 0];
      if (state.owners[idx(r, c)] === owner) { prev.set(idx(r, c), -1); queue.push([r, c]); }
    }
    while (queue.length) {
      const [r, c] = queue.shift();
      if (owner === 1 ? r === SIZE - 1 : c === SIZE - 1) {
        const path = [];
        for (let i = idx(r, c); i !== -1; i = prev.get(i)) path.push(i);
        return path;
      }
      for (const [a, b] of neighbors(r, c)) {
        const i = idx(a, b);
        if (state.owners[i] === owner && !prev.has(i)) { prev.set(i, idx(r, c)); queue.push([a, b]); }
      }
    }
    return null;
  }

  function checkWin() {
    const red = findPath(1);
    const blue = findPath(2);
    winPath = red || blue || [];
    paint();
    if (!winPath.length) return;

    state.over = true;
    const key = red ? "red" : "blue";
    state.wins[key]++;
    paint();
    sfx.win();
    $("winnerText").textContent = `🎉 فاز ${state.names[key]}!`;
    $("winner").hidden = false;
  }

  /* ---------- الحركات ---------- */
  function snapshot() {
    state.history.push({
      owners: state.owners.slice(),
      turn: state.turn,
      wins: { ...state.wins },
    });
  }

  function setOwner(i, owner) {
    snapshot();
    state.owners[i] = owner;
    if (owner) { state.turn = owner; sfx.place(); }
    checkWin();
    save();
  }

  function onCell(i) {
    if (state.over || !$("panel").hidden) return;
    if (state.settings.quick) {
      setOwner(i, (state.owners[i] + 1) % 3);
    } else if (state.owners[i] !== 0) {
      setOwner(i, 0);        // الضغط على خلية ملونة يفضّيها (لتصحيح الأخطاء)
    } else {
      openPanel(i);
    }
  }

  /* ---------- نافذة السؤال والمؤقت ---------- */
  let timerId = null;
  let timeLeft = 0;

  function openPanel(i) {
    pickedCell = i;
    paint();
    $("panelLetter").textContent = state.letters[i];
    $("pRed").textContent = `${state.names.red} ✓`;
    $("pBlue").textContent = `${state.names.blue} ✓`;
    $("panel").hidden = false;
    startTimer();
  }

  function startTimer() {
    stopTimer();
    const total = state.settings.timer;
    const fill = $("timerFill");
    const txt = $("timerText");
    fill.parentElement.style.visibility = total ? "visible" : "hidden";
    if (!total) { txt.textContent = "⏱ بدون مؤقت"; return; }
    timeLeft = total;
    const render = () => {
      txt.textContent = timeLeft > 0 ? timeLeft : "انتهى الوقت!";
      txt.classList.toggle("low", timeLeft <= 5);
      fill.style.width = (timeLeft / total) * 100 + "%";
    };
    render();
    timerId = setInterval(() => {
      timeLeft--;
      render();
      if (timeLeft <= 0) { stopTimer(); sfx.timeUp(); }
      else if (timeLeft <= 5) sfx.tick();
    }, 1000);
  }

  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }

  function closePanel(result) {   // result: 1 أحمر، 2 أزرق، 0 ما أحد، null إلغاء
    stopTimer();
    $("panel").hidden = true;
    const i = pickedCell;
    pickedCell = -1;
    paint();
    if (result === 1 || result === 2) setOwner(i, result);
    else if (result === 0) sfx.wrong();
  }

  $("pRed").onclick = () => closePanel(1);
  $("pBlue").onclick = () => closePanel(2);
  $("pNone").onclick = () => closePanel(0);

  /* ---------- أزرار التحكم ---------- */
  function clearBoard() {
    state.owners = Array(SIZE * SIZE).fill(0);
    state.history = [];
    state.over = false;
    winPath = [];
    $("winner").hidden = true;
    paint();
    save();
  }

  function undo() {
    if (!$("panel").hidden) return;
    const prev = state.history.pop();
    if (!prev) return;
    state.owners = prev.owners;
    state.turn = prev.turn;
    state.wins = prev.wins;
    state.over = false;
    winPath = [];
    $("winner").hidden = true;
    paint();
    save();
  }

  function newRound() {
    newLetters();
    state.turn = 1;
    clearBoard();
    build();
    save();
  }

  function toggleControls() { $("controls").classList.toggle("hidden"); }
  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.()?.catch?.(() => {});
  }

  $("btnShuffle").onclick = newRound;
  $("btnClear").onclick = clearBoard;
  $("btnUndo").onclick = undo;
  $("btnHide").onclick = toggleControls;
  $("btnFull").onclick = toggleFull;
  $("btnNext").onclick = newRound;

  $("selSize").onchange = (e) => {
    SIZE = +e.target.value;
    state.settings.size = SIZE;
    newRound();
  };
  $("selTimer").onchange = (e) => { state.settings.timer = +e.target.value; save(); };
  $("chkQuick").onchange = (e) => { state.settings.quick = e.target.checked; paint(); save(); };
  $("chkSound").onchange = (e) => { state.settings.sound = e.target.checked; save(); };

  $("nameRed").oninput = (e) => { state.names.red = e.target.value; save(); };
  $("nameBlue").oninput = (e) => { state.names.blue = e.target.value; save(); };

  // الضغط على لوحة الفريق (مو على الاسم) يحدد دوره
  for (const [id, t] of [["teamRed", 1], ["teamBlue", 2]]) {
    $(id).addEventListener("click", (e) => {
      if (e.target.tagName === "INPUT") return;
      state.turn = t;
      paint();
      save();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" && e.target.type === "text") return;
    if (!$("panel").hidden) {
      if (e.key === "1") closePanel(1);
      else if (e.key === "2") closePanel(2);
      else if (e.key === "0") closePanel(0);
      else if (e.key === "Escape") closePanel(null);
      return;
    }
    const k = e.key.toLowerCase();
    if (k === "h") toggleControls();
    else if (k === "f") toggleFull();
    else if (k === "z") undo();
  });

  /* ---------- تشغيل ---------- */
  if (!document.fullscreenEnabled) $("btnFull").hidden = true;
  load();
  if (state.letters.length !== SIZE * SIZE) newLetters();
  if (state.owners.length !== SIZE * SIZE) state.owners = Array(SIZE * SIZE).fill(0);
  $("selSize").value = String(SIZE);
  $("selTimer").value = String(state.settings.timer);
  $("chkQuick").checked = state.settings.quick;
  $("chkSound").checked = state.settings.sound;
  build();
  if (state.over) {
    const p = findPath(1) || findPath(2);
    if (p) { winPath = p; paint(); } else state.over = false;
  }
})();
