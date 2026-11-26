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
  let phase = "prep";         // prep = قبل ما ينعرض السؤال، live = السؤال ظاهر
  let qf = newQf(0);          // مؤثرات السؤال الحالي (من العجلة)
  let wheel = null;           // عجلة الحظ الحالية
  function newQf(picker) { return { picker, dbl: false, extra: 0, halve: false, freeHint: false, noLife: false, noSteal: false, swapped: false }; }
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
        const key = (x) => x[0] + "|" + (x[2] || "");
        let fresh = pool.filter((x) => !seen[key(x)]);
        if (fresh.length < 2) { pool.forEach((x) => { delete seen[key(x)]; }); fresh = pool.slice(); }
        const pick = shuffle(fresh);
        const rest = shuffle(pool.filter((x) => !pick.slice(0, 2).includes(x)));
        const two = pick.slice(0, 2);
        two.forEach((x, k) => {
          seen[key(x)] = 1;
          cells[(li * 2 + k) * NCOL + col] = { q: x[0], a: x[1], im: x[2] || "", alts: rest.map((r) => [r[0], r[1], r[2] || ""]) };
        });
        // البدائل (للتبديل) تتوزع على الخليتين بدون تكرار
        const a = cells[(li * 2) * NCOL + col], b = cells[(li * 2 + 1) * NCOL + col];
        a.alts = rest.slice(0, Math.ceil(rest.length / 2)).map((r) => [r[0], r[1], r[2] || ""]);
        b.alts = rest.slice(Math.ceil(rest.length / 2)).map((r) => [r[0], r[1], r[2] || ""]);
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
  const fmtPts = (i) => {
    const m = state.mult || 1;
    return String(Math.round(pts(i) * m)) + (m > 1 ? " ⚡" : m < 1 ? " ½" : "");
  };
  function qSeconds() {
    let sec = ctx.timerSec();
    if (!sec) return 0;
    if (qf.halve) sec = Math.max(5, Math.round(sec / 2));
    return sec + qf.extra;
  }
  const addScore = (t, n) => { state.score[t] = Math.max(0, state.score[t] + n); };

  function renderQuestion() {
    const c = state.cells[open];
    const cat = BYID[state.cats[open % NCOL]];
    const t = state.turn;
    const prep = phase === "prep";
    const on = lfOn();
    const lf = state.lf[t];
    $("#sjQCat").textContent = cat.name;
    $("#sjQIcon").textContent = cat.icon;
    $("#sjModal .sj-sheet").style.setProperty("--cc", COLS[open % NCOL]);
    $("#sjQPts").textContent = fmtPts(open);
    $("#sjQTurn").textContent = `الدور على ${nm(t)}`;
    $("#sjQTurn").dataset.t = String(t);
    $("#sjPrep").hidden = !prep;
    $("#sjLive").hidden = prep;
    const wm = wheel && wheel.msg ? "🎡 " + wheel.msg : "";
    for (const id of ["#sjWMsg", "#sjWMsg2"]) { $(id).hidden = !wm; $(id).textContent = wm; }
    if (prep) {
      $("#sjPrepLf").hidden = !on;
      $("#sjPrepNote").hidden = !on || !(lf.dbl || lf.wheel);
      $("#sjDbl").disabled = !lf.dbl || qf.dbl;
      $("#sjDbl").textContent = !lf.dbl ? "⚡ ✕" : qf.dbl ? "⚡ النقاط مضاعفة" : "⚡ ضاعف النقاط";
      $("#sjWheelBtn").disabled = !lf.wheel;
      $("#sjWheelBtn").textContent = lf.wheel ? "🎡 عجلة الحظ" : "🎡 ✕";
      return;
    }
    $("#sjQText").textContent = c.q;
    const im = $("#sjQImg");
    if (/^[a-z]{2}$/.test(c.im || "")) { im.hidden = false; im.src = "flags/" + c.im + ".svg"; } else { im.hidden = true; im.removeAttribute("src"); }
    $("#sjAnsText").textContent = c.a;
    $("#sjAnswer").classList.toggle("shown", revealed);
    $("#sjLf").hidden = !on || revealed || qf.noLife;
    $("#sjHint").disabled = !lf.hint || hintOpen;
    $("#sjHint").textContent = lf.hint ? (hintOpen ? "💡 التلميح ظاهر" : "💡 تلميح") : "💡 ✕";
    $("#sjHintBox").hidden = !hintOpen;
    $("#sjHintText").textContent = hintOpen ? hintFor(c.a) : "";
    const alts = c.alts || [];
    $("#sjSwap").disabled = !lf.swap || !alts.length;
    $("#sjSwap").textContent = lf.swap ? (alts.length ? "🔄 بدّل" : "🔄 ما فيه بديل") : "🔄 ✕";
    $("#sjOk0").textContent = `✓ ${nm(0)}`;
    $("#sjOk1").textContent = `✓ ${nm(1)}`;
    $("#sjOk" + (1 - t)).hidden = qf.noSteal;   // حصانة: الخصم ما يسرق
    $("#sjOk" + t).hidden = false;
  }

  function openCell(i) {
    if (!state || state.used[i] >= 0 || open >= 0) return;
    open = i; phase = "prep"; revealed = false; hintOpen = false; state.mult = 1;
    qf = newQf(state.turn); wheel = null;
    renderQuestion();
    $("#sjModal").hidden = false;
    ctx.sound("open");
    timer.total = 0;
    ctx.sync(true);
  }

  function showQuestion() {
    if (open < 0 || phase !== "prep") return;
    phase = "live";
    if (qf.freeHint) hintOpen = true;
    renderQuestion();
    ctx.sound("open");
    timerStart(qSeconds());
    ctx.sync(true);
  }

  function closeQuestion() {
    timerStop();
    clearTimeout(spinTimer); spinTicks.forEach(clearTimeout); spinTicks = [];
    timer.total = 0;
    open = -1; phase = "prep"; revealed = false; hintOpen = false; wheel = null;
    qf = newQf(0);
    if (state) state.mult = 1;
    $("#sjModal").hidden = true;
    $("#sjWheel").hidden = true;
    ctx.sync(true);
  }

  function reveal() {
    if (open < 0 || revealed || phase !== "live") return;
    revealed = true;
    timerStop();
    drawTimer();
    ctx.sound("reveal");
    renderQuestion();
    ctx.sync(true);
  }

  function afterTile(i, msg) {
    state.turn = 1 - qf.picker;
    state.last = msg;
    justDone = i;
    persist();
    closeQuestion();
    renderBoard();
    if (state.used.every((u) => u >= 0)) setTimeout(showWin, 650);
    else ctx.sync(true);
  }

  function finish(result) {    // 0 / 1 = الفريق اللي جاوب صح، -1 = ما أحد
    if (open < 0 || phase !== "live") return;
    const i = open;
    const answerer = state.turn;
    const mult = state.mult || 1;
    let msg;
    if (result === 0 || result === 1) {
      const gain = Math.round(pts(i) * (result === answerer ? mult : 1));
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
    afterTile(i, msg);
  }

  function useDouble() {
    const lf = state.lf[state.turn];
    if (open < 0 || phase !== "prep" || !lf.dbl || qf.dbl) return;
    lf.dbl = false; qf.dbl = true; state.mult *= 2;
    ctx.sound("open");
    persist(); renderQuestion(); ctx.sync(true);
  }
  function useHint() {
    const lf = state.lf[state.turn];
    if (open < 0 || revealed || phase !== "live" || !lf.hint || hintOpen || qf.noLife) return;
    lf.hint = false; hintOpen = true;
    ctx.sound("open");
    persist(); renderQuestion(); ctx.sync(true);
  }
  function useSwap() {
    const lf = state.lf[state.turn];
    const c = state.cells[open];
    if (open < 0 || revealed || phase !== "live" || !lf.swap || qf.noLife || !c.alts || !c.alts.length) return;
    const nx = c.alts.shift();
    lf.swap = false;
    c.q = nx[0]; c.a = nx[1]; c.im = nx[2] || "";
    hintOpen = false;
    persist();
    renderQuestion();
    timerStart(qSeconds());
    ctx.sound("shuffle");
    ctx.sync(true);
  }

  /* ================= عجلة الحظ: 20 احتمال، كل لفة 7 مختلفة ================= */
  const EFFECTS = {
    bonus50:  { k: "g", icon: "🍀", name: "+50 نقطة", desc: "هدية 50 نقطة" },
    bonus100: { k: "g", icon: "💰", name: "+100 نقطة", desc: "هدية 100 نقطة" },
    bonus200: { k: "g", icon: "💎", name: "+200 نقطة", desc: "هدية 200 نقطة" },
    dbl:      { k: "g", icon: "⚡", name: "نقاط ×2", desc: "نقاط السؤال تتضاعف" },
    triple:   { k: "g", icon: "🔥", name: "نقاط ×3", desc: "نقاط السؤال ثلاثة أضعاف" },
    extra:    { k: "g", icon: "⏱️", name: "وقت زيادة", desc: "+15 ثانية على وقتكم" },
    freeSwap: { k: "g", icon: "🔄", name: "تبديل رجع", desc: "ترجع لكم وسيلة التبديل" },
    freeHint: { k: "g", icon: "💡", name: "تلميح مجاني", desc: "يطلع لكم تلميح بدون ما يُحسب" },
    steal:    { k: "g", icon: "🥷", name: "سرقة 100", desc: "تاخذون 100 نقطة من الخصم" },
    freebie:  { k: "g", icon: "🎁", name: "هدية", desc: "تاخذون نقاط السؤال بدون سؤال" },
    immune:   { k: "g", icon: "🛡️", name: "حصانة", desc: "الخصم ما يقدر يسرق السؤال" },
    lose100:  { k: "b", icon: "💣", name: "خسارة 100", desc: "تخسرون 100 نقطة" },
    oppGets:  { k: "b", icon: "📦", name: "الخصم +100", desc: "الخصم ياخذ 100 نقطة" },
    halfTime: { k: "b", icon: "🥶", name: "نص الوقت", desc: "وقتكم ينقص للنصف" },
    halfPts:  { k: "b", icon: "📉", name: "نص النقاط", desc: "نقاط السؤال النصف" },
    skip:     { k: "b", icon: "⛔", name: "ضاع دوركم", desc: "السؤال يرجع للوحة والدور للخصم" },
    noLife:   { k: "b", icon: "🔒", name: "بدون مساعدات", desc: "بدون تبديل وتلميح لهالسؤال" },
    oppFirst: { k: "b", icon: "🎭", name: "الخصم يجاوب", desc: "السؤال يروح للخصم" },
    nothing:  { k: "n", icon: "😅", name: "ولا شي", desc: "العجلة ما أعطت شي" },
    respin:   { k: "n", icon: "🔁", name: "لفّوا ثانية", desc: "لفة مجانية ثانية" },
  };
  const WCOLS = ["#ff4fa3", "#37e0ff", "#ffc94d", "#6cf08a", "#a98bff", "#ff8a5c", "#4f8cff"];
  let spinTimer = 0, spinTicks = [];

  // 4 احتمالات حلوة + 3 من الباقي، وكل مجموعة تدور على 20 احتمال بدون تكرار قبل ما تخلص
  function drawOpts() {
    const noTime = !ctx.timerSec();
    const ok = (id) => !(noTime && (id === "extra" || id === "halfTime"));
    const G = Object.keys(EFFECTS).filter((id) => EFFECTS[id].k === "g" && ok(id));
    const O = Object.keys(EFFECTS).filter((id) => EFFECTS[id].k !== "g" && ok(id));
    state.wq = state.wq && typeof state.wq === "object" ? state.wq : { g: [], o: [] };
    const take = (key, pool, n) => {
      const out = [];
      while (out.length < n) {
        state.wq[key] = (state.wq[key] || []).filter((id) => pool.includes(id) && !out.includes(id));
        if (!state.wq[key].length) state.wq[key] = shuffle(pool).filter((id) => !out.includes(id));
        out.push(state.wq[key].shift());
      }
      return out;
    };
    return shuffle(take("g", G, 4).concat(take("o", O, 3)));
  }

  function applyEffect(id, t) {
    const o = 1 - t;
    switch (id) {
      case "bonus50": case "bonus100": case "bonus200": { const n = +id.slice(5); addScore(t, n); return { msg: `+${n} نقطة لـ ${nm(t)}` }; }
      case "dbl": state.mult *= 2; qf.dbl = true; return { msg: "نقاط السؤال ×2" };
      case "triple": state.mult *= 3; qf.dbl = true; return { msg: "نقاط السؤال ×3" };
      case "extra": qf.extra += 15; return { msg: "+15 ثانية على وقتكم" };
      case "freeSwap": state.lf[t].swap = true; return { msg: "رجعت لكم وسيلة تبديل السؤال" };
      case "freeHint": qf.freeHint = true; return { msg: "التلميح ينعرض لكم مجاناً" };
      case "steal": {
        const n = Math.min(100, state.score[o]);
        state.score[o] -= n; state.score[t] += n;
        return { msg: n ? `سرقتوا ${n} نقطة من ${nm(o)}` : `${nm(o)} ما عندهم نقاط تنسرق` };
      }
      case "freebie": {
        const g = Math.round(pts(open) * (state.mult || 1));
        state.score[t] += g; state.used[open] = t;
        return { msg: `هدية! ${nm(t)} ياخذون ${g} بدون سؤال`, after: "done" };
      }
      case "immune": qf.noSteal = true; return { msg: "الخصم ما يقدر يسرق هالسؤال منكم" };
      case "lose100": {
        const n = Math.min(100, state.score[t]);
        state.score[t] -= n;
        return { msg: n ? `خسرتوا ${n} نقطة` : "ما عندكم نقاط تنخسر" };
      }
      case "oppGets": addScore(o, 100); return { msg: `${nm(o)} ياخذون +100` };
      case "halfTime": qf.halve = true; return { msg: "وقتكم النصف" };
      case "halfPts": state.mult *= 0.5; return { msg: "نقاط السؤال النصف" };
      case "skip": return { msg: `ضاع دوركم، الدور على ${nm(o)}`, after: "skip" };
      case "noLife": qf.noLife = true; return { msg: "هالسؤال بدون تبديل وتلميح" };
      case "oppFirst": state.turn = o; qf.swapped = true; return { msg: `${nm(o)} يجاوبون هالسؤال` };
      case "respin": return { msg: "لفة مجانية ثانية", respin: true };
      default: return { msg: "ولا شي هالمرة 😅" };
    }
  }

  function wheelOpen() {
    const lf = state.lf[state.turn];
    if (open < 0 || phase !== "prep" || !lf.wheel || wheel) return;
    lf.wheel = false;
    wheel = { opts: drawOpts(), r: -1, rot: 0, spinning: false, msg: "", after: null, respin: false };
    persist();
    renderWheel();
    $("#sjWheel").hidden = false;
    ctx.sound("open");
    ctx.sync(true);
  }

  function renderWheel() {
    const svg = $("#sjWheelSvg");
    const NS = "http://www.w3.org/2000/svg";
    const g = $("#sjWheelRot");
    g.innerHTML = "";
    const n = wheel.opts.length, seg = 360 / n, R = 104;
    const rad = (d) => (d * Math.PI) / 180;
    wheel.opts.forEach((id, i) => {
      const a0 = rad(i * seg), a1 = rad((i + 1) * seg), am = rad((i + 0.5) * seg);
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", `M0 0 L${(R * Math.sin(a0)).toFixed(2)} ${(-R * Math.cos(a0)).toFixed(2)} A${R} ${R} 0 0 1 ${(R * Math.sin(a1)).toFixed(2)} ${(-R * Math.cos(a1)).toFixed(2)} Z`);
      path.setAttribute("fill", WCOLS[i % WCOLS.length]);
      path.setAttribute("stroke", "#1a0b36");
      path.setAttribute("stroke-width", "2");
      const tx = document.createElementNS(NS, "text");
      tx.setAttribute("x", (66 * Math.sin(am)).toFixed(2));
      tx.setAttribute("y", (-66 * Math.cos(am)).toFixed(2));
      tx.setAttribute("class", "sj-wheel-ic");
      tx.textContent = EFFECTS[id].icon;
      g.append(path, tx);
    });
    if (!wheel.spinning) {
      svg.style.transition = "none";
      svg.style.transform = `rotate(${wheel.rot}deg)`;
    }
    const lg = $("#sjWheelLegend");
    lg.innerHTML = "";
    wheel.opts.forEach((id, i) => {
      const e = EFFECTS[id];
      const row = document.createElement("div");
      row.className = "sj-wl" + (wheel.r === i ? " win" : "");
      row.style.setProperty("--wc", WCOLS[i % WCOLS.length]);
      const ic = document.createElement("span"); ic.className = "sj-wl-ic"; ic.textContent = e.icon;
      const tx = document.createElement("span"); tx.className = "sj-wl-tx";
      const b = document.createElement("b"); b.textContent = e.name;
      const sm = document.createElement("small"); sm.textContent = e.desc;
      tx.append(b, sm);
      row.append(ic, tx);
      lg.append(row);
    });
    $("#sjWheelSub").textContent = `${nm(state.turn)}: لفّوا العجلة، وش يطلع لكم؟`;
    const res = $("#sjWheelRes");
    res.hidden = wheel.r < 0;
    if (wheel.r >= 0) {
      const e = EFFECTS[wheel.opts[wheel.r]];
      res.dataset.k = e.k;
      res.innerHTML = "";
      const big = document.createElement("div"); big.className = "sj-wr-ic"; big.textContent = e.icon;
      const t1 = document.createElement("b"); t1.textContent = e.name;
      const t2 = document.createElement("span"); t2.textContent = wheel.msg;
      res.append(big, t1, t2);
    }
    $("#sjSpin").hidden = wheel.spinning || (wheel.r >= 0 && !wheel.respin);
    $("#sjSpin").disabled = wheel.spinning;
    $("#sjWheelOk").hidden = !(wheel.r >= 0 && !wheel.respin);
  }

  function spin() {
    if (!wheel || wheel.spinning || (wheel.r >= 0 && !wheel.respin)) return;
    const n = wheel.opts.length, seg = 360 / n;
    const r = Math.floor(Math.random() * n);
    const jitter = (Math.random() - 0.5) * seg * 0.6;
    const base = Math.ceil(wheel.rot / 360) * 360;
    const target = base + 360 * 5 + (360 - (r + 0.5) * seg) + jitter;
    wheel.spinning = true; wheel.r = -1; wheel.respin = false; wheel.msg = "";
    renderWheel();   // ما يغيّر الدوران وقت اللف
    const svg = $("#sjWheelSvg");
    svg.style.transition = "none";
    svg.style.transform = `rotate(${wheel.rot}deg)`;
    void svg.getBoundingClientRect();
    svg.style.transition = "transform 5s cubic-bezier(.12,.7,.12,1)";
    svg.style.transform = `rotate(${target}deg)`;
    wheel.rot = target;
    spinTicks.forEach(clearTimeout); spinTicks = [];
    for (let k = 1; k <= 24; k++) spinTicks.push(setTimeout(() => ctx.sound("tick"), 5000 * Math.pow(k / 24, 1.2)));
    clearTimeout(spinTimer);
    spinTimer = setTimeout(() => land(r), 5150);
    ctx.sync(true);
  }

  function land(r) {
    if (!wheel) return;
    wheel.spinning = false;
    wheel.r = r;
    const id = wheel.opts[r];
    const res = applyEffect(id, qf.picker);
    wheel.msg = res.msg;
    wheel.after = res.after || null;
    wheel.respin = !!res.respin;
    ctx.sound(EFFECTS[id].k === "g" ? "correct" : EFFECTS[id].k === "b" ? "wrong" : "open");
    try { navigator.vibrate && navigator.vibrate(EFFECTS[id].k === "b" ? [120, 60, 120] : 60); } catch (_) {}
    persist();
    renderHud();
    renderWheel();
    renderQuestion();
    ctx.sync(true);
  }

  function wheelDone() {
    if (!wheel || wheel.spinning || wheel.r < 0 || wheel.respin) return;
    const after = wheel.after;
    $("#sjWheel").hidden = true;
    if (after === "done") {
      ctx.sound("correct");
      afterTile(open, `🎁 ${wheel.msg}`);
    } else if (after === "skip") {
      afterTile(open, `⛔ ${wheel.msg}`);
    } else {
      renderQuestion();
      ctx.sync(true);
    }
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
    const showQ = live && phase === "live";
    const c = live ? state.cells[open] : null;
    let msg;
    if (state.over) msg = "انتهت المباراة";
    else if (live && phase === "prep") msg = wheel && wheel.spinning ? "🎡 العجلة تلف…" : `${nm(state.turn)} يقررون قبل السؤال`;
    else if (live) msg = revealed ? "الإجابة ظهرت" : `الدور على ${nm(state.turn)}`;
    else msg = `${nm(state.turn)} يختارون سؤال`;
    return {
      g: "sj",
      tn: state.turn,
      sc: state.score,
      ph: live ? phase : "idle",
      qt: showQ ? c.q.slice(0, 200) : "",
      im: showQ && /^[a-z]{2}$/.test(c.im || "") ? c.im : "",
      msg: msg.slice(0, 90),
      tm: showQ && !revealed ? timerView() : null,
      sj: {
        c: state.cats.map((id) => [BYID[id].icon, BYID[id].name]),
        u: state.used.map((u) => (u < 0 ? "." : u === 0 ? "a" : u === 1 ? "b" : "x")).join(""),
        cur: open,
        pt: live ? Math.round(pts(open) * (state.mult || 1)) : 0,
        lf: state.lf.map((l) => [l.dbl ? 1 : 0, l.swap ? 1 : 0, l.hint ? 1 : 0, l.wheel ? 1 : 0]),
        hn: showQ && hintOpen && !revealed ? hintFor(c.a) : "",
        an: showQ && revealed ? c.a.slice(0, 80) : "",
        ls: state.last || "",
        wh: live && wheel ? { o: wheel.opts.map((id) => [EFFECTS[id].icon, EFFECTS[id].name, EFFECTS[id].k]), r: wheel.spinning ? -1 : wheel.r, sp: wheel.spinning ? 1 : 0, m: wheel.msg || "" } : null,
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
      lf: [{ dbl: true, swap: true, hint: true, wheel: true }, { dbl: true, swap: true, hint: true, wheel: true }],
      wq: { g: [], o: [] },
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
      state.lf = state.lf.map((l) => ({ dbl: !!(l && l.dbl), swap: !!(l && l.swap), hint: l && l.hint !== undefined ? !!l.hint : true, wheel: l && l.wheel !== undefined ? !!l.wheel : true }));
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
    $("#sjShow").onclick = showQuestion;
    $("#sjWheelBtn").onclick = wheelOpen;
    $("#sjSpin").onclick = spin;
    $("#sjWheelOk").onclick = wheelDone;
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
      if (!$("#sjWheel").hidden) return;
      if (e.key === "Escape") closeQuestion();
      else if (e.key === " ") { e.preventDefault(); if (phase === "prep") showQuestion(); else reveal(); }
    });
  }

  // أدوات فحص (تشتغل بس لو الرابط فيه ?sjdebug=1)
  if (/[?&]sjdebug=1/.test(location.search)) window.__sjt = { applyEffect: (id, t) => applyEffect(id, t), state: () => state, qf: () => qf, EFFECTS, drawOpts: () => drawOpts(), qSeconds: () => qSeconds(), hintFor };
  window.HaroofSJ = { init, start, show, hide, hasGame, hasProgress, end, refresh, buildView, categories: CATS };
})();
