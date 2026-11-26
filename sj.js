/* سين جيم: لوحة 6 فئات × 6 خلايا (200/200/400/400/600/600)، فريقين بالدور.
   الجوالات تشوف اللوحة والسؤال والمؤقت عبر "العرض" اللي ينشره المقدم (buildView). */
(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const CATS = window.SJ_CATEGORIES || [];
  const BYID = {};
  CATS.forEach((c) => { BYID[c.id] = c; });
  const ROWS = [200, 200, 400, 400, 600, 600];
  const KEY = "haroof3:sj";
  const SEEN_KEY = "haroof3:sjseen";
  const NCOL = 6, NCELL = 36;
  // لكل عمود لونه الخاص
  const COLS = ["#ff4fa3", "#37e0ff", "#ffc94d", "#6cf08a", "#a98bff", "#ff8a5c"];
  let justDone = -1;

  let ctx = null;
  let state = null;           // اللعبة الحالية
  let open = -1;              // الخلية المفتوحة (-1 = ما فيه سؤال)
  let revealed = false;
  let hintOpen = false;
  const timer = { total: 0, left: 0, running: false, raf: 0, last: 0, lastWhole: 0 };

  const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };

  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function valid(s) {
    return !!s && Array.isArray(s.cats) && s.cats.length === NCOL && s.cats.every((id) => BYID[id]) &&
      Array.isArray(s.cells) && s.cells.length === NCELL &&
      s.cells.every((c) => c && typeof c.q === "string" && typeof c.a === "string") &&
      Array.isArray(s.used) && s.used.length === NCELL &&
      Array.isArray(s.score) && s.score.length === 2 && (s.turn === 0 || s.turn === 1) &&
      Array.isArray(s.lf) && s.lf.length === 2;
  }

  /* ---- تجهيز اللوحة: نفضّل أسئلة ما طلعت قبل ---- */
  function build(catIds) {
    let seen = load(SEEN_KEY, {});
    if (!seen || typeof seen !== "object") seen = {};
    const cells = new Array(NCELL);
    catIds.forEach((id, col) => {
      const cat = BYID[id];
      [200, 400, 600].forEach((lv, li) => {
        const pool = cat.q[String(lv)] || [];
        let fresh = pool.filter((x) => !seen[x[0]]);
        if (fresh.length < 2) { pool.forEach((x) => { delete seen[x[0]]; }); fresh = pool.slice(); }
        const pick = shuffle(fresh);
        const rest = shuffle(pool.filter((x) => !pick.slice(0, 2).includes(x)));
        const two = pick.slice(0, 2);
        two.forEach((x, k) => {
          seen[x[0]] = 1;
          cells[(li * 2 + k) * NCOL + col] = { q: x[0], a: x[1], alts: rest.map((r) => [r[0], r[1]]) };
        });
        // البدائل (للتبديل) تتوزع على الخليتين بدون تكرار
        const a = cells[(li * 2) * NCOL + col], b = cells[(li * 2 + 1) * NCOL + col];
        a.alts = rest.slice(0, Math.ceil(rest.length / 2)).map((r) => [r[0], r[1]]);
        b.alts = rest.slice(Math.ceil(rest.length / 2)).map((r) => [r[0], r[1]]);
      });
    });
    save(SEEN_KEY, seen);
    return cells;
  }

  const persist = () => { if (state) save(KEY, state); };

  /* ================= الواجهة ================= */
  const teams = () => ctx.teams();
  const pts = (i) => ROWS[Math.floor(i / NCOL)];
  const nm = (t) => teams()[t].n;

  function renderHud() {
    const tm = teams();
    [0, 1].forEach((t) => {
      $("#sjName" + t).textContent = tm[t].n;
      const sc = $("#sjScore" + t);
      if (sc.textContent !== String(state.score[t])) {
        const grew = +sc.textContent < state.score[t] && sc.textContent !== "";
        sc.textContent = state.score[t];
        if (grew) { sc.classList.remove("bump"); void sc.offsetWidth; sc.classList.add("bump"); }
      }
      $("#sjTeam" + t).classList.toggle("turn", state.turn === t);
    });
    const left = state.used.filter((u) => u < 0).length;
    $("#sjRound").textContent = left ? `باقي ${left} من ${NCELL} سؤال` : "خلصت الأسئلة";
  }

  let introTimer = 0;
  function renderBoard(intro) {
    const b = $("#sjBoard");
    b.innerHTML = "";
    if (intro) {
      b.classList.add("intro");
      clearTimeout(introTimer);
      introTimer = setTimeout(() => b.classList.remove("intro"), 2200);
    }
    state.cats.forEach((id, col) => {
      const c = BYID[id];
      const h = document.createElement("div");
      h.className = "sj-cat";
      h.style.setProperty("--cc", COLS[col]);
      h.style.setProperty("--k", String(col));
      const ic = document.createElement("span"); ic.className = "sj-cat-ic"; ic.textContent = c.icon;
      const nmEl = document.createElement("span"); nmEl.className = "sj-cat-name"; nmEl.textContent = c.name;
      h.append(ic, nmEl);
      b.append(h);
    });
    for (let i = 0; i < NCELL; i++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "sj-cell" + (i === justDone ? " just" : "");
      cell.dataset.i = String(i);
      cell.style.setProperty("--cc", COLS[i % NCOL]);
      cell.style.setProperty("--k", String((i % NCOL) + Math.floor(i / NCOL)));
      const u = state.used[i];
      if (u >= 0) {
        cell.classList.add("done");
        if (u === 0 || u === 1) cell.dataset.o = u === 0 ? "a" : "b";
        cell.textContent = u === 2 ? "✕" : "✓";
        cell.disabled = true;
      } else {
        cell.textContent = String(pts(i));
        cell.setAttribute("aria-label", `${BYID[state.cats[i % NCOL]].name} ${pts(i)}`);
      }
      b.append(cell);
    }
    justDone = -1;
    renderHud();
  }

  /* ================= المؤقت ================= */
  function timerView() {
    if (open < 0 || !timer.total) return null;
    return [Math.round(timer.left * 10) / 10, timer.total, timer.running ? 1 : 0];
  }
  function drawTimer() {
    const box = $("#sjTimer");
    if (!timer.total) { box.hidden = true; return; }
    box.hidden = false;
    $("#sjTimerText").textContent = timer.left > 0 ? Math.ceil(timer.left) : "انتهى الوقت";
    $("#sjTimerFill").style.width = Math.max(0, Math.min(100, (timer.left / timer.total) * 100)) + "%";
    box.classList.toggle("low", timer.left > 0 && timer.left <= 5);
    box.classList.toggle("done", timer.left <= 0);
    box.classList.toggle("paused", !timer.running && timer.left > 0);
  }
  function timerLoop(now) {
    if (!timer.running) return;
    timer.left = Math.max(0, timer.left - (now - timer.last) / 1000);
    timer.last = now;
    const whole = Math.ceil(timer.left);
    if (whole !== timer.lastWhole) { timer.lastWhole = whole; if (timer.left > 0 && whole <= 5) ctx.sound("tick"); }
    drawTimer();
    if (timer.left <= 0) { timer.running = false; ctx.sound("timeup"); ctx.sync(true); return; }
    timer.raf = requestAnimationFrame(timerLoop);
  }
  function timerStop() { timer.running = false; cancelAnimationFrame(timer.raf); }
  function timerStart(sec) {
    timerStop();
    timer.total = sec; timer.left = sec; timer.lastWhole = Math.ceil(sec);
    drawTimer();
    if (sec > 0) { timer.running = true; timer.last = performance.now(); timer.raf = requestAnimationFrame(timerLoop); }
  }
  function timerToggle() {
    if (!timer.total) return;
    if (timer.left <= 0) { timerStart(timer.total); }
    else if (timer.running) { timerStop(); }
    else { timer.running = true; timer.last = performance.now(); timer.raf = requestAnimationFrame(timerLoop); }
    drawTimer();
    ctx.sync(true);
  }

  /* ================= السؤال ================= */
  // تلميح تلقائي من الإجابة: أول حرف وعدد الحروف (أو عدد الخانات للأرقام)
  function hintFor(ans) {
    const a = String(ans || "").replace(/\(.*?\)/g, "").trim();
    const letters = (a.match(/[\u0621-\u064A]/g) || []);
    if (!letters.length) {
      const d = (a.match(/\d/g) || []).length;
      return d ? `رقم من ${d} ${d > 2 ? "خانات" : "خانتين"}` : "ما فيه تلميح";
    }
    const words = a.split(/\s+/).filter(Boolean);
    let first = words[0].replace(/^ال/, "") || words[0];
    first = first.replace(/[^\u0621-\u064A]/g, "").charAt(0) || letters[0];
    return `يبدأ بحرف «${first}» · ${letters.length} حروف` + (words.length > 1 ? ` · ${words.length} كلمات` : "");
  }
  function lfOn() { return ctx.lifelines(); }
  function renderQuestion() {
    const c = state.cells[open];
    const cat = BYID[state.cats[open % NCOL]];
    const t = state.turn;
    const mult = state.mult || 1;
    $("#sjQCat").textContent = cat.name;
    $("#sjQIcon").textContent = cat.icon;
    $("#sjModal .sj-sheet").style.setProperty("--cc", COLS[open % NCOL]);
    $("#sjQPts").textContent = String(pts(open) * mult) + (mult > 1 ? " ⚡" : "");
    $("#sjQTurn").textContent = `الدور على ${nm(t)}`;
    $("#sjQTurn").dataset.t = String(t);
    $("#sjQText").textContent = c.q;
    $("#sjAnsText").textContent = c.a;
    $("#sjAnswer").classList.toggle("shown", revealed);
    const lf = state.lf[t];
    const showLf = lfOn() && !revealed;
    $("#sjLf").hidden = !showLf;
    $("#sjHint").disabled = !lf.hint || hintOpen;
    $("#sjHint").textContent = lf.hint ? (hintOpen ? "💡 التلميح ظاهر" : "💡 تلميح") : "💡 ✕";
    $("#sjHintBox").hidden = !hintOpen;
    $("#sjHintText").textContent = hintOpen ? hintFor(c.a) : "";
    $("#sjDbl").disabled = !lf.dbl || mult > 1;
    $("#sjDbl").textContent = lf.dbl ? (mult > 1 ? "⚡ النقاط مضاعفة" : "⚡ ضاعف") : "⚡ ✕";
    const alts = c.alts || [];
    $("#sjSwap").disabled = !lf.swap || !alts.length;
    $("#sjSwap").textContent = lf.swap ? (alts.length ? "🔄 بدّل" : "🔄 ما فيه بديل") : "🔄 ✕";
    $("#sjOk0").textContent = `✓ ${nm(0)}`;
    $("#sjOk1").textContent = `✓ ${nm(1)}`;
  }

  function openCell(i) {
    if (!state || state.used[i] >= 0 || open >= 0) return;
    open = i; revealed = false; hintOpen = false; state.mult = 1;
    renderQuestion();
    $("#sjModal").hidden = false;
    ctx.sound("open");
    timerStart(ctx.timerSec());
    ctx.sync(true);
  }

  function closeQuestion() {
    timerStop();
    timer.total = 0;
    open = -1; revealed = false; hintOpen = false;
    if (state) state.mult = 1;
    $("#sjModal").hidden = true;
    ctx.sync(true);
  }

  function reveal() {
    if (open < 0 || revealed) return;
    revealed = true;
    timerStop();
    drawTimer();
    ctx.sound("reveal");
    renderQuestion();
    ctx.sync(true);
  }

  function finish(result) {    // 0 / 1 = الفريق اللي جاوب صح، -1 = ما أحد
    if (open < 0) return;
    const i = open;
    const picker = state.turn;
    const mult = state.mult || 1;
    let msg;
    if (result === 0 || result === 1) {
      const gain = pts(i) * (result === picker ? mult : 1);
      state.score[result] += gain;
      state.used[i] = result;
      ctx.sound("correct");
      msg = `✅ ${nm(result)} +${gain}`;
      const r = $("#sjTeam" + result).getBoundingClientRect();
      const col = ctx.teams()[result];
      ctx.fx.burst(r.left + r.width / 2, r.top + r.height / 2, [col.c, col.l, "#ffd77e", "#fff"], 34);
    } else {
      state.used[i] = 2;
      ctx.sound("wrong");
      msg = "ما أحد جاوب";
    }
    state.turn = 1 - picker;
    state.last = msg;
    justDone = i;
    persist();
    closeQuestion();
    renderBoard();
    if (state.used.every((u) => u >= 0)) setTimeout(showWin, 650);
    else ctx.sync(true);
  }

  function useDouble() {
    const lf = state.lf[state.turn];
    if (open < 0 || revealed || !lf.dbl || (state.mult || 1) > 1) return;
    lf.dbl = false; state.mult = 2;
    ctx.sound("open");
    persist(); renderQuestion(); ctx.sync(true);
  }
  function useHint() {
    const lf = state.lf[state.turn];
    if (open < 0 || revealed || !lf.hint || hintOpen) return;
    lf.hint = false; hintOpen = true;
    ctx.sound("open");
    persist(); renderQuestion(); ctx.sync(true);
  }
  function useSwap() {
    const lf = state.lf[state.turn];
    const c = state.cells[open];
    if (open < 0 || revealed || !lf.swap || !c.alts || !c.alts.length) return;
    const nx = c.alts.shift();
    lf.swap = false;
    c.q = nx[0]; c.a = nx[1];
    hintOpen = false;
    persist();
    renderQuestion();
    timerStart(ctx.timerSec());
    ctx.sound("shuffle");
    ctx.sync(true);
  }

  /* ================= الفوز ================= */
  function showWin() {
    if (!state) return;
    const [a, b] = state.score;
    const tie = a === b;
    const w = a > b ? 0 : 1;
    const col = ctx.teams()[w];
    $("#sjWinTitle").textContent = tie ? "تعادل!" : `🏆 ${nm(w)} فازوا!`;
    $("#sjWinScore").textContent = `${nm(0)} ${a} : ${b} ${nm(1)}`;
    $("#sjWin").dataset.t = tie ? "" : String(w);
    $("#sjWin").hidden = false;
    ctx.sound("win");
    ctx.fx.confetti(tie ? ["#f6b93b", "#ffd77e", "#fff"] : [col.c, col.l, "#ffd77e", "#fff"]);
    state.over = true;
    persist();
    ctx.sync(true);
  }

  /* ================= العرض لجوالات اللاعبين ================= */
  function buildView() {
    if (!state) return { g: "sj", sc: [0, 0], tn: 0 };
    const live = open >= 0;
    const c = live ? state.cells[open] : null;
    let msg;
    if (state.over) msg = "انتهت المباراة";
    else if (live) msg = revealed ? "الإجابة ظهرت" : `الدور على ${nm(state.turn)}`;
    else msg = `${nm(state.turn)} يختارون سؤال`;
    return {
      g: "sj",
      tn: state.turn,
      sc: state.score,
      ph: live ? "live" : "idle",
      qt: live ? c.q.slice(0, 200) : "",
      msg: msg.slice(0, 90),
      tm: live && !revealed ? timerView() : null,
      sj: {
        c: state.cats.map((id) => [BYID[id].icon, BYID[id].name]),
        u: state.used.map((u) => (u < 0 ? "." : u === 0 ? "a" : u === 1 ? "b" : "x")).join(""),
        cur: open,
        pt: live ? pts(open) * (state.mult || 1) : 0,
        lf: state.lf.map((l) => [l.dbl ? 1 : 0, l.swap ? 1 : 0, l.hint ? 1 : 0]),
        hn: live && hintOpen && !revealed ? hintFor(c.a) : "",
        an: live && revealed ? c.a.slice(0, 80) : "",
        ls: state.last || "",
      },
    };
  }

  /* ================= واجهة عامة ================= */
  function show() {
    const was = $("#sj").hidden;
    $("#sj").hidden = false;
    if (state) renderBoard(was);
  }
  function hide() { $("#sj").hidden = true; }

  function start(catIds) {
    const ids = catIds.filter((id) => BYID[id]).slice(0, NCOL);
    if (ids.length !== NCOL) return false;
    closeQuestion();
    $("#sjWin").hidden = true;
    state = {
      cats: ids,
      cells: build(ids),
      used: new Array(NCELL).fill(-1),
      score: [0, 0],
      turn: 0,
      lf: [{ dbl: true, swap: true, hint: true }, { dbl: true, swap: true, hint: true }],
      mult: 1,
      over: false,
      last: "",
    };
    persist();
    show();
    renderBoard(true);
    ctx.sync(true);
    return true;
  }

  function hasGame() { return !!state; }
  function hasProgress() { return !!state && !state.over && (state.score[0] || state.score[1] || state.used.some((u) => u >= 0)); }
  function end() {
    closeQuestion();
    $("#sjWin").hidden = true;
    state = null;
    try { localStorage.removeItem(KEY); } catch (_) {}
  }
  function refresh() { if (state) { renderBoard(); if (open >= 0) renderQuestion(); } }

  function init(c) {
    ctx = c;
    const s = load(KEY, null);
    state = valid(s) ? s : null;
    if (state) {
      state.lf = state.lf.map((l) => ({ dbl: !!(l && l.dbl), swap: !!(l && l.swap), hint: l && l.hint !== undefined ? !!l.hint : true }));
      state.mult = 1;
    }
    $("#sjBoard").addEventListener("click", (e) => {
      const b = e.target.closest(".sj-cell");
      if (!b || b.disabled || ctx.blocked()) return;
      openCell(+b.dataset.i);
    });
    [0, 1].forEach((t) => {
      $("#sjTeam" + t).addEventListener("click", () => {
        if (!state || open >= 0 || ctx.blocked()) return;
        state.turn = t; persist(); renderHud(); ctx.sound("turn"); ctx.sync();
      });
    });
    $("#sjReveal").onclick = reveal;
    $("#sjOk0").onclick = () => finish(0);
    $("#sjOk1").onclick = () => finish(1);
    $("#sjNobody").onclick = () => finish(-1);
    $("#sjDbl").onclick = useDouble;
    $("#sjSwap").onclick = useSwap;
    $("#sjHint").onclick = useHint;
    $("#sjTimerText").onclick = timerToggle;
    $("#sjBack").onclick = () => closeQuestion();
    $("#sjWinBoard").onclick = () => { $("#sjWin").hidden = true; };
    $("#sjWinAgain").onclick = () => { $("#sjWin").hidden = true; start(state ? state.cats : []); };
    $("#sjWinSetup").onclick = () => { $("#sjWin").hidden = true; ctx.openSetup(); };
    $("#sjSettings").onclick = () => { if (!ctx.blocked() && open < 0) ctx.openSetup(); };
    $("#sjEnd").onclick = () => {
      if (ctx.blocked() || open >= 0) return;
      ctx.confirm("ننهي اللعبة؟", "اللوحة والنتيجة تنمسح وترجعون لشاشة الإعدادات.", "إي، أنهِ اللعبة", () => ctx.endGame());
    };
    $("#sjBell").onclick = () => { if (!ctx.blocked() && open < 0) ctx.openBell(); };
    document.addEventListener("keydown", (e) => {
      if ($("#sjModal").hidden) return;
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Escape") closeQuestion();
      else if (e.key === " ") { e.preventDefault(); reveal(); }
    });
  }

  window.HaroofSJ = { init, start, show, hide, hasGame, hasProgress, end, refresh, buildView, categories: CATS };
})();
