/* الجرس: جوالات اللاعبين تضغط، واللعبة الرئيسية تعرف مين ضغط أول.
   يعتمد على ميزة "الغرفة" (room) في الصفحات المنشورة: كل من فاتح الصفحة يشوف حالة الباقين.
   - المقدم (الشاشة الرئيسية) ينشر حالة الجرس في حضوره (presence).
   - اللاعب يغيّر حقل buzz في حضوره، والمقدم ياخذ أول واحد يوصله. */
(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const APP = "hrf";
  const KEY = "haroof3:bell";
  let ctx = null;
  let roomNs = null;       // نتيجة claude.use("room")
  let roomTried = false;

  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { return {}; } },
    set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) {} },
  };
  const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f​-‏‪-‮⁦-⁩]/g, "").trim().slice(0, n);
  const quiet = (p) => { try { if (p && p.catch) p.catch(() => {}); } catch (_) {} };

  async function getRoom() {
    if (roomTried) return roomNs;
    roomTried = true;
    try {
      roomNs = window.claude && window.claude.use ? await window.claude.use("room") : null;
    } catch (_) { roomNs = null; }
    return roomNs;
  }

  // غرفة باسم الرمز، وإذا ما انسمح بها نرجع للغرفة العامة (ونفلتر بالرمز دايماً)
  async function joinCode(code) {
    const r = await getRoom();
    if (!r) return null;
    let ns = r;
    try { ns = await r.join("hrf-" + code); } catch (_) { ns = r; }
    return ns;
  }
  const isHostPeer = (p, code) => p && p.kind !== "agent" && p.presence && p.presence.app === APP && p.presence.role === "host" && p.presence.code === code;
  const isPlayerPeer = (p, code) => p && p.kind !== "agent" && p.presence && p.presence.app === APP && p.presence.role === "player" && p.presence.code === code;

  /* ================= جهة المقدم ================= */
  const host = { on: false, code: "", ns: null, off: null, seq: 0, armed: false, banned: [], winner: null, letter: "", roster: [], view: null, note: null, noteN: 0, noteTimer: 0 };

  const newCode = () => String(Math.floor(1000 + Math.random() * 9000));

  function publish() {
    if (!host.on || !host.ns) return;
    const t = ctx.teams();
    quiet(host.ns.presence({
      app: APP, role: "host", code: host.code,
      seq: host.seq, armed: host.armed, banned: host.banned.slice(),
      winner: host.winner, letter: host.letter,
      teams: t.map((x) => ({ n: clean(x.n, 22), c: x.c, l: x.l, d: x.d })),
      ...(host.view || {}),
      nt: host.note,
    }));
  }

  function rosterFrom(peers) {
    return peers.filter((p) => isPlayerPeer(p, host.code)).map((p) => ({
      peer: p.peer,
      name: clean(p.presence.name, 14) || "لاعب",
      team: p.presence.team === 0 || p.presence.team === 1 ? p.presence.team : -1,
    }));
  }

  function onHostPeers(change) {
    host.roster = rosterFrom(change.peers);
    ctx.onRoster(host.roster);
    renderPanel();
    if (!host.armed) return;
    // أول واحد وصلنا ضغطه (حسب وقت وصول التغيير عندنا)
    const cands = change.updated.concat(change.joined).filter((p) => {
      if (!isPlayerPeer(p, host.code)) return false;
      const b = p.presence.buzz;
      const team = p.presence.team;
      return b && b.seq === host.seq && (team === 0 || team === 1) && !host.banned.includes(team);
    }).sort((a, b) => a.updatedAt - b.updatedAt);
    if (!cands.length) return;
    const p = cands[0];
    host.armed = false;
    host.winner = { team: p.presence.team, name: clean(p.presence.name, 14) || "لاعب", peer: p.peer };
    publish();
    ctx.onBuzz(host.winner);
  }

  async function hostStart(wantedCode) {
    if (host.on) return true;
    const code = wantedCode || store.get().code || newCode();
    const ns = await joinCode(code);
    if (!ns) return false;
    host.ns = ns; host.code = code; host.on = true;
    host.off = ns.onPeers(onHostPeers);
    store.set({ on: true, code });
    publish();
    ctx.onStatus();
    return true;
  }

  function hostStop() {
    if (!host.on) return;
    try { host.off && host.off(); } catch (_) {}
    quiet(host.ns && host.ns.presence({ app: null, role: null, code: null, seq: null, armed: null, banned: null, winner: null, letter: null, teams: null, n: null, l: null, o: null, fz: null, tn: null, ph: null, md: null, ql: null, qt: null, as: null, pk: null, msg: null, sc: null, nt: null }));
    if (host.ns && host.ns.leave) quiet(host.ns.leave());
    host.on = false; host.ns = null; host.roster = []; host.armed = false; host.winner = null;
    store.set({ on: false, code: host.code });
    ctx.onRoster([]);
    ctx.onStatus();
  }

  async function hostNewCode() {
    const was = host.on;
    hostStop();
    store.set({ on: false, code: newCode() });
    if (was) await hostStart(store.get().code);
    renderPanel();
  }

  /* ---- نافذة المقدم ---- */
  function renderPanel() {
    const m = $("#bellModal");
    if (!m || m.hidden) return;
    $("#bellNA").hidden = !(roomTried && !roomNs);
    $("#bellOff").hidden = host.on || (roomTried && !roomNs);
    $("#bellOn").hidden = !host.on;
    if (!host.on) return;
    $("#bellCode").textContent = host.code;
    const teams = ctx.teams();
    [0, 1].forEach((t) => {
      $("#bellTeam" + t + "Name").textContent = teams[t].n;
      const ul = $("#bellTeam" + t + "List");
      ul.innerHTML = "";
      const mine = host.roster.filter((r) => r.team === t);
      if (!mine.length) { const li = document.createElement("li"); li.className = "empty"; li.textContent = "—"; ul.append(li); }
      mine.forEach((r) => { const li = document.createElement("li"); li.textContent = r.name; ul.append(li); });
    });
    const un = host.roster.filter((r) => r.team === -1);
    $("#bellUnassigned").textContent = un.length ? `${un.length} لاعب ما اختاروا فريق بعد` : "";
  }

  async function openPanel() {
    $("#bellModal").hidden = false;
    renderPanel();
    if (!roomTried) {
      $("#bellOff").hidden = true;
      $("#bellLoading").hidden = false;
      await getRoom();
      $("#bellLoading").hidden = true;
      renderPanel();
    }
  }

  /* ================= جهة اللاعب ================= */
  const pl = { ns: null, off: null, code: "", name: "", team: -1, n: 0, state: null, myPeer: "", pending: 0, waitTimer: 0, boardKey: "", noteK: 0, noteTimer: 0 };

  function plShow(which) {
    ["plConnect", "plTeam", "plBuzz"].forEach((id) => { $("#" + id).hidden = id !== which; });
  }

  async function plJoin() {
    const code = clean($("#plCode").value, 4).replace(/\D/g, "");
    const name = clean($("#plName").value, 14);
    const msg = $("#plMsg");
    if (code.length !== 4) { msg.textContent = "الرمز أربع أرقام."; $("#plCode").focus(); return; }
    if (!name) { msg.textContent = "اكتب اسمك."; $("#plName").focus(); return; }
    msg.textContent = "جاري الاتصال…";
    $("#plGo").disabled = true;
    const ns = await joinCode(code);
    $("#plGo").disabled = false;
    if (!ns) {
      msg.textContent = "ما قدرنا نربطك بالجرس. هالميزة تحتاج تدخل بحساب Claude وصاحب اللعبة يدعوك بالإيميل من زر Share. اللي يفتح الرابط العام كزائر ما يقدر.";
      return;
    }
    pl.ns = ns; pl.code = code; pl.name = name; pl.state = null;
    try { localStorage.setItem("haroof3:player", JSON.stringify({ code, name, team: pl.team })); } catch (_) {}
    if (pl.off) try { pl.off(); } catch (_) {}
    pl.off = ns.onPeers(onPlayerPeers);
    quiet(ns.presence({ app: APP, role: "player", code, name, team: pl.team }));
    msg.textContent = "";
    plShow("plConnect");
    $("#plMsg").textContent = "ندوّر على اللعبة…";
    clearTimeout(pl.waitTimer);
    pl.waitTimer = setTimeout(() => {
      if (!pl.state) $("#plMsg").textContent = "ما لقينا لعبة بهذا الرمز. تأكد من الرمز وإن المقدم شغّل الجرس.";
    }, 5000);
  }

  function onPlayerPeers(change) {
    const me = change.peers.find((p) => p.isMe && p.sameTab);
    if (me) pl.myPeer = me.peer;
    const h = change.peers.find((p) => isHostPeer(p, pl.code));
    pl.state = h ? h.presence : null;
    plRender();
  }

  function plSetTeam(t) {
    pl.team = t;
    try { localStorage.setItem("haroof3:player", JSON.stringify({ code: pl.code, name: pl.name, team: t })); } catch (_) {}
    if (pl.ns) quiet(pl.ns.presence({ team: t }));
    plRender();
  }

  function plRender() {
    const s = pl.state;
    if (!s) {
      if (!$("#plConnect").hidden || !$("#plBuzz").hidden || !$("#plTeam").hidden) {
        if (pl.ns) { plShow("plConnect"); $("#plMsg").textContent = "ندوّر على اللعبة…"; }
      }
      return;
    }
    const teams = Array.isArray(s.teams) && s.teams.length === 2 ? s.teams : null;
    if (!teams) return;
    clearTimeout(pl.waitTimer);
    const root = document.documentElement.style;
    root.setProperty("--pa", teams[0].c); root.setProperty("--pa-l", teams[0].l); root.setProperty("--pa-d", teams[0].d);
    root.setProperty("--pb", teams[1].c); root.setProperty("--pb-l", teams[1].l); root.setProperty("--pb-d", teams[1].d);
    $("#plA").textContent = teams[0].n;
    $("#plB").textContent = teams[1].n;

    if (pl.team !== 0 && pl.team !== 1) { plShow("plTeam"); return; }
    plShow("plBuzz");
    const box = $("#plBuzz");
    const mine = pl.team;
    box.dataset.team = String(mine);
    $("#plChip").textContent = `${pl.name} · ${teams[mine].n}` + (s.tn === mine && !s.winner ? " · دوركم" : "");

    // اللوحة الحية
    const key = [s.n, s.l, s.o, JSON.stringify(s.fz || []), s.pk].join("|");
    if (key !== pl.boardKey && ctx.drawMini) { pl.boardKey = key; ctx.drawMini($("#plBoard"), s); }

    // السؤال
    const qBox = $("#plQ");
    if (s.ph === "live" && s.qt) { qBox.hidden = false; $("#plLetter").textContent = s.ql || ""; $("#plQText").textContent = clean(s.qt, 200); }
    else if (s.ph === "prep") { qBox.hidden = false; $("#plLetter").textContent = s.ql || ""; $("#plQText").textContent = "جاهزين… السؤال جاي"; }
    else if (s.ph === "live") { qBox.hidden = false; $("#plLetter").textContent = s.ql || ""; $("#plQText").textContent = "المقدم يسأل بصوته"; }
    else qBox.hidden = true;

    // ملاحظات التخريب
    if (s.nt && s.nt.k && s.nt.k !== pl.noteK) {
      pl.noteK = s.nt.k;
      const n = $("#plNote");
      n.textContent = clean(s.nt.t, 90);
      n.hidden = false;
      n.classList.remove("show"); void n.offsetWidth; n.classList.add("show");
      clearTimeout(pl.noteTimer);
      pl.noteTimer = setTimeout(() => { n.hidden = true; }, 5500);
    }

    const banned = Array.isArray(s.banned) ? s.banned : [];
    const winner = s.winner && typeof s.winner === "object" ? s.winner : null;
    const btn = $("#plBtn"), txt = $("#plBtnText"), st = $("#plStatus");
    const race = s.md === "race";
    btn.hidden = !race;
    let mode, label, status;
    if (!race) {
      mode = "idle"; label = ""; status = clean(s.msg, 90) || "…";
    } else if (winner) {
      if (winner.peer === pl.myPeer) { mode = "won"; label = "أنت أول!"; status = "جاوب الحين"; }
      else { mode = "lost"; label = "سبقك"; status = `${clean(winner.name, 14)} ضغط أول`; }
    } else if (s.armed && !banned.includes(mine)) {
      if (pl.pending && Date.now() - pl.pending < 1500) { mode = "pending"; label = "…"; status = "وصل ضغطك"; }
      else { mode = "armed"; label = "اضغط!"; status = "أول واحد يضغط يجاوب"; }
    } else if (banned.includes(mine)) {
      mode = "banned"; label = "خسرتوا الفرصة"; status = "الفريق الثاني له فرصة";
    } else {
      mode = "idle"; label = "استنّ"; status = clean(s.msg, 90) || "السؤال الجاي";
    }
    box.dataset.mode = mode;
    txt.textContent = label;
    st.textContent = status;
    btn.disabled = mode !== "armed";
  }

  function plBuzz() {
    const s = pl.state;
    if (!s || !s.armed || !pl.ns) return;
    pl.n++;
    pl.pending = Date.now();
    quiet(pl.ns.presence({ buzz: { seq: s.seq, n: pl.n } }));
    try { navigator.vibrate && navigator.vibrate(60); } catch (_) {}
    plRender();
    setTimeout(plRender, 1600);   // لو ضاع الضغط يرجع الزر
  }

  function plLeave() {
    if (pl.off) { try { pl.off(); } catch (_) {} pl.off = null; }
    if (pl.ns) {
      quiet(pl.ns.presence({ app: null, role: null, code: null, name: null, team: null, buzz: null }));
      if (pl.ns.leave) quiet(pl.ns.leave());
    }
    pl.ns = null; pl.state = null;
    $("#player").hidden = true;
    try { history.replaceState(null, "", location.pathname + location.search); } catch (_) {}
  }

  function openPlayer() {
    $("#player").hidden = false;
    plShow("plConnect");
    $("#plMsg").textContent = "";
    try {
      const saved = JSON.parse(localStorage.getItem("haroof3:player"));
      if (saved) {
        if (saved.code) $("#plCode").value = saved.code;
        if (saved.name) $("#plName").value = saved.name;
        if (saved.team === 0 || saved.team === 1) pl.team = saved.team;
      }
    } catch (_) {}
    getRoom().then((r) => { if (!r) $("#plMsg").textContent = "ما قدرنا نربطك بالجرس. هالميزة تحتاج تدخل بحساب Claude وصاحب اللعبة يدعوك بالإيميل من زر Share. اللي يفتح الرابط العام كزائر ما يقدر."; });
  }

  /* ================= ربط العناصر ================= */
  function wire() {
    $("#bellStart").onclick = async () => {
      $("#bellStart").disabled = true;
      const ok = await hostStart();
      $("#bellStart").disabled = false;
      if (!ok) { $("#bellNA").hidden = false; $("#bellOff").hidden = true; }
      renderPanel();
    };
    $("#bellStop").onclick = () => { hostStop(); renderPanel(); };
    $("#bellNew").onclick = hostNewCode;
    $("#bellClose").onclick = () => { $("#bellModal").hidden = true; };
    $("#bellModal").addEventListener("click", (e) => { if (e.target === $("#bellModal")) $("#bellModal").hidden = true; });

    $("#plGo").onclick = plJoin;
    $("#plCode").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#plName").focus(); });
    $("#plName").addEventListener("keydown", (e) => { if (e.key === "Enter") plJoin(); });
    $("#plA").onclick = () => plSetTeam(0);
    $("#plB").onclick = () => plSetTeam(1);
    $("#plSwitch").onclick = () => plSetTeam(-1);
    $("#plExit").onclick = plLeave;
    // pointerdown أسرع من click على الجوال
    $("#plBtn").addEventListener("pointerdown", (e) => { e.preventDefault(); plBuzz(); });
    $("#plBtn").addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); plBuzz(); } });
  }

  /* ================= الواجهة العامة ================= */
  window.HaroofBell = {
    init(c) {
      ctx = c;
      wire();
      const saved = store.get();
      if (saved.on && location.hash !== "#bell") { hostStart(saved.code).then(() => ctx.onStatus()); }
      if (location.hash === "#bell") openPlayer();
    },
    openPanel, openPlayer,
    isOn: () => host.on,
    playerCount: () => host.roster.length,
    teamsChanged: publish,
    setView(v) { host.view = v; publish(); },
    setNote(text) {
      if (!host.on) return;
      host.noteN++;
      host.note = { t: clean(text, 90), k: host.noteN };
      publish();
      clearTimeout(host.noteTimer);
      host.noteTimer = setTimeout(() => { host.note = null; publish(); }, 7000);
    },
    questionOpened(letter) {
      if (!host.on) return;
      host.seq++; host.armed = true; host.banned = []; host.winner = null; host.letter = letter || "";
      publish();
    },
    questionClosed() {
      if (!host.on) return;
      host.seq++; host.armed = false; host.banned = []; host.winner = null; host.letter = "";
      publish();
    },
    // الفريق اللي ضغط جاوب غلط: نقفله ونفتح الجرس للثاني
    rearm(team) {
      if (!host.on) return { armed: false };
      if (!host.banned.includes(team)) host.banned.push(team);
      host.seq++; host.winner = null; host.armed = host.banned.length < 2;
      publish();
      return { armed: host.armed };
    },
  };
})();
