(() => {
  "use strict";

  const SIZE = 5;
  const R = 1;                       // نصف قطر الخلية
  const W = Math.sqrt(3) * R;        // عرض الخلية (رأسها لفوق)
  const ALL_LETTERS = "ابتثجحخدذرزسشصضطظعغفقكلمنهوي".split("");
  const SVG_NS = "http://www.w3.org/2000/svg";
  const STORE = "haroof-state-v1";

  // owner: 0 فاضي، 1 أحمر، 2 أزرق
  let state = {
    letters: [],
    owners: Array(SIZE * SIZE).fill(0),
    history: [],
    wins: { red: 0, blue: 0 },
    names: { red: "الفريق الأحمر", blue: "الفريق الأزرق" },
    over: false,
  };

  const $ = (id) => document.getElementById(id);
  const board = $("board");
  const idx = (r, c) => r * SIZE + c;

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (_) {}
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE));
      if (s && s.letters && s.letters.length === SIZE * SIZE) state = { ...state, ...s };
    } catch (_) {}
  }

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

  const center = (r, c) => ({
    x: W * (c + r / 2) + W / 2,
    y: 1.5 * R * r + R,
  });

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

  function paint(winPath = []) {
    board.querySelectorAll(".cell").forEach((g) => {
      const i = +g.dataset.i;
      g.setAttribute("class", "cell " + cls[state.owners[i]] + (winPath.includes(i) ? " win" : ""));
    });
    $("winsRed").textContent = state.wins.red;
    $("winsBlue").textContent = state.wins.blue;
    $("nameRed").value = state.names.red;
    $("nameBlue").value = state.names.blue;
  }

  function neighbors(r, c) {
    return [[r, c - 1], [r, c + 1], [r - 1, c], [r + 1, c], [r - 1, c + 1], [r + 1, c - 1]]
      .filter(([a, b]) => a >= 0 && a < SIZE && b >= 0 && b < SIZE);
  }

  // يرجع مسار الفوز لو الفريق وصل، وإلا null
  function findPath(owner) {
    const startCells = [];
    for (let k = 0; k < SIZE; k++) startCells.push(owner === 1 ? [0, k] : [k, 0]);
    const isGoal = ([r, c]) => (owner === 1 ? r === SIZE - 1 : c === SIZE - 1);

    const prev = new Map();
    const queue = [];
    for (const [r, c] of startCells) {
      if (state.owners[idx(r, c)] === owner) { prev.set(idx(r, c), -1); queue.push([r, c]); }
    }
    while (queue.length) {
      const [r, c] = queue.shift();
      if (isGoal([r, c])) {
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

  function onCell(i) {
    if (state.over) return;
    state.history.push(state.owners.slice());
    state.owners[i] = (state.owners[i] + 1) % 3;
    checkWin();
    save();
  }

  function checkWin() {
    const red = findPath(1);
    const blue = findPath(2);
    const path = red || blue;
    paint(path || []);
    if (!path) return;

    state.over = true;
    const key = red ? "red" : "blue";
    state.wins[key]++;
    paint(path);
    $("winnerText").textContent = `🎉 فاز ${state.names[key]}!`;
    $("winner").hidden = false;
  }

  function clearBoard() {
    state.owners = Array(SIZE * SIZE).fill(0);
    state.history = [];
    state.over = false;
    $("winner").hidden = true;
    paint();
    save();
  }

  function undo() {
    if (state.over) {
      // تراجع عن حركة الفوز: نلغي النقطة
      const key = findPath(1) ? "red" : "blue";
      state.wins[key] = Math.max(0, state.wins[key] - 1);
      state.over = false;
      $("winner").hidden = true;
    }
    const prev = state.history.pop();
    if (prev) state.owners = prev;
    paint();
    save();
  }

  function newRound() {
    newLetters();
    clearBoard();
    build();
    save();
  }

  function toggleControls() {
    $("controls").classList.toggle("hidden");
  }
  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  }

  $("btnShuffle").onclick = newRound;
  $("btnClear").onclick = clearBoard;
  $("btnUndo").onclick = undo;
  $("btnHide").onclick = toggleControls;
  $("btnFull").onclick = toggleFull;
  $("btnNext").onclick = newRound;

  $("nameRed").oninput = (e) => { state.names.red = e.target.value; save(); };
  $("nameBlue").oninput = (e) => { state.names.blue = e.target.value; save(); };

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    const k = e.key.toLowerCase();
    if (k === "h") toggleControls();
    else if (k === "f") toggleFull();
    else if (k === "z") undo();
  });

  load();
  if (state.letters.length !== SIZE * SIZE) newLetters();
  build();
  if (state.over) {
    const p = findPath(1) || findPath(2);
    if (p) paint(p); else state.over = false;
  }
})();
