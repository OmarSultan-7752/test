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
  let roomNs = null;       // نتيجة claude.use("room") أو الاتصال المستقل
  let roomTried = false;
  let hostFailed = false;   // فشل الاتصال عند المقدم (خدمة الجرس العامة)
  let transport = "claude"; // "claude" داخل claude.ai، و"mqtt" لما تنفتح اللعبة مستقلة

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
    if (!roomNs && window.HaroofRTC) { roomNs = window.HaroofRTC; transport = "mqtt"; }
    return roomNs;
  }
  const noRoomMsg = () => transport === "mqtt"
    ? "ما قدرنا نتصل بخدمة الجرس. تأكد من الإنترنت وجرّب مرة ثانية."
    : "ما قدرنا نربطك بالجرس. هالميزة تحتاج تدخل بحساب Claude وصاحب اللعبة يدعوك بالإيميل من زر Share. اللي يفتح الرابط العام كزائر ما يقدر.";

  // غرفة باسم الرمز، وإذا ما انسمح بها نرجع للغرفة العامة (ونفلتر بالرمز دايماً)
  async function joinCode(code) {
    const r = await getRoom();
    if (!r) return null;
    if (transport === "mqtt") {
      // اللاعب: أول رقم من الرمز = السيرفر، والباقي اسم الغرفة
      if (!/^[1-9]\d{5}$/.test(code) || +code[0] > (r.brokers || 1)) return null;
      try { return await r.join("hrf-" + code.slice(1), { broker: +code[0] - 1 }); } catch (_) { return null; }
    }
    let ns = r;
    try { ns = await r.join("hrf-" + code); } catch (_) { ns = r; }
    return ns;
  }
  const isHostPeer = (p, code) => p && p.kind !== "agent" && p.presence && p.presence.app === APP && p.presence.role === "host" && p.presence.code === code;
  const isPlayerPeer = (p, code) => p && p.kind !== "agent" && p.presence && p.presence.app === APP && p.presence.role === "player" && p.presence.code === code;

  /* ================= جهة المقدم ================= */
  const host = { on: false, code: "", ns: null, off: null, seq: 0, armed: false, banned: [], winner: null, letter: "", roster: [], view: null, note: null, noteN: 0, noteTimer: 0 };

  // داخل claude.ai الغرفة مقصورة على المدعوين فالرمز 4 أرقام، وفي الخدمة العامة نخليه 6 عشان يصعب تخمينه
  const newCode = () => (transport === "mqtt"
    ? String(Math.floor(100000 + Math.random() * 900000))
    : String(Math.floor(1000 + Math.random() * 9000)));

  function publish(urgent) {
    if (!host.on || !host.ns) return;
    const t = ctx.teams();
    quiet(host.ns.presence({
      app: APP, role: "host", code: host.code,
      seq: host.seq, armed: host.armed, banned: host.banned.slice(),
      winner: host.winner, letter: host.letter,
      teams: t.map((x) => ({ n: clean(x.n, 22), c: x.c, l: x.l, d: x.d })),
      ...(host.view || {}),
      nt: host.note,
    }, urgent ? { now: true } : undefined));
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
    publish(true);
    ctx.onBuzz(host.winner);
  }

  async function hostStart(wantedCode) {
    if (host.on) return true;
    await getRoom();
    let code = wantedCode || store.get().code || newCode();
    let ns;
    if (transport === "mqtt") {
      // المقدم: يجرب السيرفرات بالتوازي ويأخذ أسرعها، والرمز يحمل رقمه
      let prefer = -1, suffix;
      const saved = String(code);
      if (/^[1-9]\d{5}$/.test(saved) && +saved[0] <= (roomNs.brokers || 1)) { prefer = +saved[0] - 1; suffix = saved.slice(1); }
      else suffix = String(Math.floor(10000 + Math.random() * 90000));
      try { ns = await roomNs.join("hrf-" + suffix, { prefer }); } catch (_) { ns = null; }
      if (ns) code = String(ns.broker + 1) + suffix;
    } else {
      ns = await joinCode(code);
    }
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
    store.set({ on: false, code: "" });
    if (was) await hostStart();
    renderPanel();
  }

  /* ---- نافذة المقدم ---- */
  function renderPanel() {
    const m = $("#bellModal");
    if (!m || m.hidden) return;
    const warn = $(".bell-warn");
    if (warn) warn.hidden = transport === "mqtt";
    const pub = $("#bellPublic");
    if (pub) pub.hidden = transport !== "mqtt";
    $("#bellNA").hidden = !((roomTried && !roomNs) || hostFailed);
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
  const pl = { ns: null, off: null, code: "", name: "", team: -1, n: 0, state: null, myPeer: "", pending: 0, waitTimer: 0, failTimer: 0, boardKey: "", noteK: 0, noteTimer: 0, tm: null, tmKey: "", tick: 0, lastMode: "", lastWhole: 0, everHost: false, sbKey: "", qt: "", qp: null, qKey: "", shown: -1, mineCnt: -1, oppCnt: -1 };

  function plShow(which) {
    ["plConnect", "plTeam", "plBuzz"].forEach((id) => { $("#" + id).hidden = id !== which; });
  }

  async function plJoin() {
    const code = clean($("#plCode").value, 6).replace(/\D/g, "");
    const name = clean($("#plName").value, 14);
    const msg = $("#plMsg");
    if (code.length < 4) { msg.textContent = "اكتب الرمز كامل."; $("#plCode").focus(); return; }
    if (!name) { msg.textContent = "اكتب اسمك."; $("#plName").focus(); return; }
    await getRoom();
    if (transport === "mqtt" && !/^[1-9]\d{5}$/.test(code)) { msg.textContent = "الرمز غير صحيح، تأكد منه (6 أرقام)."; $("#plCode").focus(); return; }
    msg.textContent = "جاري الاتصال… قد ياخذ ثواني";
    $("#plGo").disabled = true;
    const ns = await joinCode(code);
    $("#plGo").disabled = false;
    if (!ns) {
      msg.textContent = noRoomMsg();
      return;
    }
    pl.ns = ns; pl.code = code; pl.name = name; pl.state = null;
    try { localStorage.setItem("haroof3:player", JSON.stringify({ code, name, team: pl.team })); } catch (_) {}
    if (pl.off) try { pl.off(); } catch (_) {}
    pl.off = ns.onPeers(onPlayerPeers);
    quiet(ns.presence({ app: APP, role: "player", code, name, team: pl.team }));
    msg.textContent = "";
    plShow("plConnect");
    $("#plMsg").textContent = "جاري الدخول للعبة… قد ياخذ ثواني";
    clearTimeout(pl.waitTimer);
    pl.waitTimer = setTimeout(() => {
      if (!pl.state) $("#plMsg").textContent = "لسه نحاول… (تأكد من الرمز وإن المقدم شغّل الجرس)";
    }, 12000);
    clearTimeout(pl.failTimer);
    pl.failTimer = setTimeout(() => {
      if (!pl.state) $("#plMsg").textContent = "ما لقينا اللعبة. تأكد من الرمز، وإن المقدم شغّل الجرس، وإن الإنترنت شغال.";
    }, 30000);
    startPlayerTick();
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
      if (pl.everHost && !$("#plBuzz").hidden) {
        // كنا متصلين والمقدم اختفى: نبقى على الشاشة وننتظره
        $("#plStatus").textContent = "المقدم غير متصل… ننتظره";
        $("#plBuzz").dataset.mode = "idle";
        $("#plBtn").disabled = true;
        $("#plConn").textContent = "🟡 المقدم غير متصل";
        return;
      }
      if (!$("#plConnect").hidden || !$("#plBuzz").hidden || !$("#plTeam").hidden) {
        if (pl.ns) { plShow("plConnect"); $("#plMsg").textContent = "جاري الدخول للعبة… قد ياخذ ثواني"; }
      }
      return;
    }
    pl.everHost = true;
    const teams = Array.isArray(s.teams) && s.teams.length === 2 ? s.teams : null;
    if (!teams) return;
    clearTimeout(pl.waitTimer); clearTimeout(pl.failTimer);
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

    // النتيجة
    const sc = Array.isArray(s.sc) ? s.sc : [0, 0];
    $("#psN0").textContent = teams[0].n; $("#psS0").textContent = sc[0] || 0;
    $("#psN1").textContent = teams[1].n; $("#psS1").textContent = sc[1] || 0;

    // المؤقت (نستقبل الباقي من المقدم ونكمل العد محلياً)
    const tmKey = JSON.stringify(s.tm || null);
    if (tmKey !== pl.tmKey) {
      pl.tmKey = tmKey;
      pl.tm = Array.isArray(s.tm) && +s.tm[1] > 0 ? { left: +s.tm[0], total: +s.tm[1], running: !!s.tm[2], at: Date.now() } : null;
      pl.lastWhole = 0;
    }
    tickTimer();

    // سين جيم: لوحة الفئات والسؤال (بدون جرس)
    if (s.g === "sj" && s.sj && typeof s.sj === "object") { plRenderSj(s, teams, mine); return; }
    { const lg = $(".player-top .logo"); if (lg) lg.textContent = "حروف"; document.body.dataset.world = "letters"; }
    $("#plWheel").hidden = true;
    $("#plSj").hidden = true; $("#plBoard").toggleAttribute("hidden", false); $("#plQ").classList.remove("sj");
    pl.sjKey = ""; pl.sjMine = -1; pl.sjOpp = -1; pl.sjQ = "";

    // شارات التخريب اللي علينا
    const fxs = s.fx || {};
    const chips = [];
    if (fxs.sk && fxs.sk[mine]) chips.push("⛔ دوركم القادم ضايع");
    if (fxs.tc && fxs.tc[mine]) chips.push("⏱ وقتكم نص في سؤالكم القادم");
    if (fxs.hd && fxs.hd[mine]) chips.push("🔥 سؤالكم القادم صعب");
    const fz = Array.isArray(s.fz) ? s.fz : [], fb = Array.isArray(s.fb) ? s.fb : [];
    const frozenOnUs = fz.filter((_, k) => fb[k] !== mine).length;
    if (frozenOnUs) chips.push(`❄️ ${frozenOnUs} ${frozenOnUs > 1 ? "حروف مجمّدة" : "حرف مجمّد"} عليكم`);
    const fxBox = $("#plFx");
    fxBox.innerHTML = "";
    chips.forEach((t) => { const c = document.createElement("span"); c.textContent = t; fxBox.append(c); });
    fxBox.hidden = !chips.length;
    $("#plConn").textContent = "🟢 متصل";

    // اللوحة الحية
    const key = [s.n, s.l, s.o, JSON.stringify(s.fz || []), s.pk].join("|");
    if (key !== pl.boardKey && ctx.drawMini) {
      pl.boardKey = key; ctx.drawMini($("#plBoard"), s);
      const mc = (s.o.match(mine === 0 ? /a/g : /b/g) || []).length, oc = (s.o.match(mine === 0 ? /b/g : /a/g) || []).length;
      if (pl.mineCnt >= 0 && ctx.sound) {
        if (mc > pl.mineCnt) ctx.sound("correct");
        else if (oc > pl.oppCnt) ctx.sound("wrong");
      }
      pl.mineCnt = mc; pl.oppCnt = oc;
    }

    // السؤال
    const qBox = $("#plQ");
    if (s.ph === "live" && s.qt) {
      qBox.hidden = false; $("#plLetter").textContent = s.ql || "";
      const qKey = JSON.stringify([s.qt, s.qp]);
      if (qKey !== pl.qKey) {
        pl.qKey = qKey;
        pl.qt = clean(s.qt, 200);
        pl.qp = Array.isArray(s.qp) ? { n: +s.qp[0] || 0, run: !!s.qp[1], ms: +s.qp[2] || 50, at: Date.now() } : null;
        pl.shown = -1;
      }
      tickTyping();
    }
    else if (s.ph === "prep") { pl.qt = ""; pl.qKey = ""; qBox.hidden = false; $("#plLetter").textContent = s.ql || ""; $("#plQText").textContent = "جاهزين… السؤال جاي"; }
    else if (s.ph === "live") { pl.qt = ""; pl.qKey = ""; qBox.hidden = false; $("#plLetter").textContent = s.ql || ""; $("#plQText").textContent = "المقدم يسأل بصوته"; }
    else { pl.qt = ""; pl.qKey = ""; qBox.hidden = true; }

    // ملاحظات التخريب
    if (s.nt && s.nt.k && s.nt.k !== pl.noteK) {
      pl.noteK = s.nt.k;
      const full = clean(s.nt.t, 90);
      const n = $("#plNote");
      n.textContent = full;
      n.hidden = false;
      n.classList.remove("show"); void n.offsetWidth; n.classList.add("show");
      clearTimeout(pl.noteTimer);
      pl.noteTimer = setTimeout(() => { n.hidden = true; }, 12000);
      showSab(full);
    }

    // قائمة التخريب: تظهر للجميع عشان يعرفون الخيارات بدون ما المقدم يقرأها
    renderSabMenu(s, teams, mine);

    if (s.winner || s.st === 0 || s.st === 1) freezeTyping();   // أي فريق ضغط: الكتابة تقف عندنا فوراً

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
    } else if (s.st === 0 || s.st === 1) {
      if (s.st === mine) { mode = "won"; label = "جاوبوا!"; status = "الفرصة عندكم، بدون جرس"; }
      else { mode = "lost"; label = "انتظروا"; status = `الفرصة عند ${clean(teams[s.st].n, 22)}`; }
    } else if (s.armed && !banned.includes(mine)) {
      if (pl.pending && Date.now() - pl.pending < 1500) { mode = "pending"; label = "…"; status = "وصل ضغطك"; }
      else { mode = "armed"; label = "اضغط!"; status = "أول واحد يضغط يجاوب"; }
    } else if (banned.includes(mine)) {
      mode = "banned"; label = "خسرتوا الفرصة"; status = "الفريق الثاني له فرصة";
    } else {
      mode = "idle"; label = "استنّ"; status = clean(s.msg, 90) || "السؤال الجاي";
    }
    if (mode === "armed" && pl.lastMode !== "armed" && ctx.sound) ctx.sound("open");
    pl.lastMode = mode;
    box.dataset.mode = mode;
    txt.textContent = label;
    st.textContent = status;
    btn.disabled = mode !== "armed";
  }

  const SJ_ROWS = [200, 200, 400, 400, 600, 600];
  const SJ_COLS = ["#ff4fa3", "#37e0ff", "#ffc94d", "#6cf08a", "#a98bff", "#ff8a5c"];
  function plRenderSj(s, teams, mine) {
    const sj = s.sj;
    const lg = $(".player-top .logo"); if (lg) lg.textContent = "سين جيم";
    document.body.dataset.world = "sj";
    $("#plBoard").toggleAttribute("hidden", true);
    $("#plConn").textContent = "🟢 متصل";
    pl.boardKey = ""; pl.mineCnt = -1; pl.oppCnt = -1;
    $("#plSabMenu").hidden = true;
    pl.sbKey = "";

    // اللوحة
    const cats = Array.isArray(sj.c) ? sj.c.slice(0, 6) : [];
    const u = clean(sj.u, 36);
    const cur = Number.isInteger(sj.cur) ? sj.cur : -1;
    const grid = $("#plSj");
    grid.hidden = false;
    const key = JSON.stringify([cats, u, cur]);
    if (key !== pl.sjKey) {
      pl.sjKey = key;
      grid.innerHTML = "";
      cats.forEach((c, col) => {
        const h = document.createElement("div");
        h.className = "pl-sj-h";
        h.style.setProperty("--cc", SJ_COLS[col]);
        const ic = document.createElement("span"); ic.textContent = clean(c && c[0], 4);
        const nm = document.createElement("b"); nm.textContent = clean(c && c[1], 24);
        h.append(ic, nm);
        grid.append(h);
      });
      for (let i = 0; i < 36; i++) {
        const ch = u[i] || ".";
        const d = document.createElement("div");
        d.style.setProperty("--cc", SJ_COLS[i % 6]);
        d.className = "pl-sj-c" + (ch === "a" ? " a" : ch === "b" ? " b" : ch === "x" ? " x" : "") + (i === cur ? " cur" : "");
        d.textContent = ch === "." ? String(SJ_ROWS[Math.floor(i / 6)]) : ch === "x" ? "✕" : "✓";
        grid.append(d);
      }
      const mc = (u.match(mine === 0 ? /a/g : /b/g) || []).length, oc = (u.match(mine === 0 ? /b/g : /a/g) || []).length;
      if (pl.sjMine >= 0 && ctx.sound) {
        if (mc > pl.sjMine) ctx.sound("correct");
        else if (oc > pl.sjOpp) ctx.sound("wrong");
        else if (/x/.test(u) && u.split("x").length - 1 > (pl.sjX || 0)) ctx.sound("wrong");
      }
      pl.sjMine = mc; pl.sjOpp = oc; pl.sjX = u.split("x").length - 1;
    }

    // السؤال (كامل، بدون كتابة تدريجية)
    const qBox = $("#plQ");
    qBox.classList.add("sj");
    pl.qt = ""; pl.qKey = "";
    if (s.ph === "live" && s.qt) {
      qBox.hidden = false;
      $("#plLetter").textContent = String(Math.max(0, +sj.pt || 0));
      $("#plQText").textContent = clean(s.qt, 200) + (sj.hn ? "\n💡 " + clean(sj.hn, 60) : "");
      if (pl.sjQ !== s.qt && ctx.sound) ctx.sound("open");
      pl.sjQ = s.qt;
    } else if (s.ph === "prep") {
      qBox.hidden = false;
      $("#plLetter").textContent = String(Math.max(0, +sj.pt || 0));
      $("#plQText").textContent = "🔒 جاهزين… السؤال بينعرض بعد قرار المضاعفة والعجلة";
      pl.sjQ = "";
    } else { qBox.hidden = true; pl.sjQ = ""; }

    // عجلة الحظ
    const wbox = $("#plWheel");
    const wh = sj.wh && Array.isArray(sj.wh.o) ? sj.wh : null;
    if (!wh) { wbox.hidden = true; pl.whKey = ""; }
    else {
      wbox.hidden = false;
      const key = JSON.stringify(wh);
      if (key !== pl.whKey) {
        const prevR = pl.whR;
        pl.whKey = key; pl.whR = wh.r;
        wbox.innerHTML = "";
        wbox.classList.toggle("spin", !!wh.sp);
        const t = document.createElement("div"); t.className = "pw-t"; t.textContent = wh.sp ? "🎡 العجلة تلف…" : "🎡 عجلة الحظ";
        const o = document.createElement("div"); o.className = "pw-o";
        wh.o.slice(0, 7).forEach((x, i) => {
          const sp = document.createElement("span");
          if (wh.r === i) sp.className = "win";
          sp.textContent = clean(x && x[0], 4) + " " + clean(x && x[1], 20);
          o.append(sp);
        });
        wbox.append(t, o);
        if (wh.r >= 0 && wh.m) { const m = document.createElement("div"); m.className = "pw-m"; m.textContent = clean(wh.m, 80); wbox.append(m); }
        if (wh.r >= 0 && prevR !== wh.r && ctx.sound) { const k = wh.o[wh.r] && wh.o[wh.r][2]; ctx.sound(k === "g" ? "correct" : k === "b" ? "wrong" : "open"); }
      }
    }

    // وسائل المساعدة
    const lf = Array.isArray(sj.lf) && Array.isArray(sj.lf[mine]) ? sj.lf[mine] : [0, 0];
    const fxBox = $("#plFx");
    fxBox.innerHTML = "";
    [[lf[0], "⚡ عندكم مضاعفة نقاط"], [lf[1], "🔄 عندكم تبديل سؤال"], [lf[2], "💡 عندكم تلميح"], [lf[3], "🎡 عندكم عجلة حظ"]].forEach(([on, t]) => {
      if (!on) return;
      const c = document.createElement("span"); c.className = "ok"; c.textContent = t; fxBox.append(c);
    });
    fxBox.hidden = !fxBox.childElementCount;

    // الحالة (ما فيه جرس في سين جيم)
    const box = $("#plBuzz");
    box.dataset.mode = "idle";
    $("#plBtn").hidden = true;
    $("#plBtn").disabled = true;
    const an = clean(sj.an, 80);
    const last = clean(sj.ls, 60);
    $("#plStatus").textContent = an ? `الإجابة: ${an}` : (!qBox.hidden ? clean(s.msg, 90) : (last ? last + " · " : "") + clean(s.msg, 90)) || "…";
  }

  function tickTimer() {
    const box = $("#plTimer"), t = pl.tm;
    if (!t) { box.hidden = true; return; }
    const left = t.running ? Math.max(0, t.left - (Date.now() - t.at) / 1000) : t.left;
    box.hidden = false;
    $("#plTimerText").textContent = left > 0 ? Math.ceil(left) : "انتهى الوقت";
    $("#plTimerFill").style.width = Math.max(0, Math.min(100, (left / t.total) * 100)) + "%";
    box.classList.toggle("low", left > 0 && left <= 5);
    box.classList.toggle("done", left <= 0);
    box.classList.toggle("paused", !t.running && left > 0);
    const whole = Math.ceil(left);
    if (t.running && whole !== pl.lastWhole) {
      pl.lastWhole = whole;
      if (left > 0 && whole <= 5 && ctx.sound) ctx.sound("tick");
      if (left <= 0) { if (ctx.sound) ctx.sound("timeup"); try { navigator.vibrate && navigator.vibrate([200, 80, 200]); } catch (_) {} }
    }
  }
  // كتابة السؤال عند اللاعب: نكمل محلياً من آخر حالة وصلتنا من المقدم
  function tickTyping() {
    if (!pl.qt) return;
    const t = pl.qp;
    const len = pl.qt.length;
    const shown = !t ? len : t.run ? Math.min(len, t.n + Math.floor((Date.now() - t.at) / t.ms)) : Math.min(len, t.n);
    if (shown !== pl.shown) { pl.shown = shown; $("#plQText").textContent = pl.qt.slice(0, shown); }
  }

  function renderSabMenu(s, teams, mine) {
    const box = $("#plSabMenu");
    const sb = s.sb && typeof s.sb === "object" && Array.isArray(s.sb.o) ? s.sb : null;
    if (!sb) { box.hidden = true; pl.sbKey = ""; return; }
    const key = JSON.stringify(sb) + "|" + mine;
    if (key === pl.sbKey) return;
    const first = box.hidden;
    pl.sbKey = key;
    const t = sb.team === 0 || sb.team === 1 ? sb.team : 0;
    $("#plSabTitle").textContent = `🎯 ${clean(teams[t].n, 22)} ياخذون تخريب على ${clean(teams[1 - t].n, 22)}`;
    $("#plSabSub").textContent = sb.t
      ? clean(sb.t, 80)
      : t === mine ? "اختاروا واحد وقولوا للمقدم" : "المقدم ينفّذ اختيارهم… انتظروا";
    const list = $("#plSabList");
    list.innerHTML = "";
    sb.o.slice(0, 8).forEach((o) => {
      const row = document.createElement("div");
      row.className = "sm-row" + (o[3] ? " off" : "");
      const ic = document.createElement("span"); ic.className = "sm-ic"; ic.textContent = clean(o[0], 4);
      const tx = document.createElement("span"); tx.className = "sm-tx";
      const b = document.createElement("b"); b.textContent = clean(o[1], 24);
      const sm = document.createElement("small"); sm.textContent = clean(o[2], 60);
      tx.append(b, sm); row.append(ic, tx); list.append(row);
    });
    box.hidden = false;
    if (first) { if (ctx.sound) ctx.sound("open"); try { navigator.vibrate && navigator.vibrate(60); } catch (_) {} }
  }

  // نوقف كتابة السؤال عندنا فوراً (بدون ما ننتظر رد المقدم)
  function freezeTyping() {
    if (pl.qp && pl.qp.run) {
      const n = pl.shown >= 0 ? pl.shown : pl.qp.n;
      pl.qp = { n, run: false, ms: pl.qp.ms, at: Date.now() };
      tickTyping();
    }
  }

  // إعلان التخريب بشاشة كاملة عشان الكل يعرف
  function showSab(text) {
    const box = $("#plSab");
    if (!box) return;
    const parts = text.split(" ");
    const icon = parts[0] || "🎯";
    $("#plSabIc").textContent = icon;
    $("#plSabTx").textContent = parts.slice(1).join(" ");
    box.hidden = false;
    box.classList.remove("show"); void box.offsetWidth; box.classList.add("show");
    if (ctx.sound) ctx.sound(icon.startsWith("💣") ? "boom" : icon.startsWith("❄") ? "freeze" : "buzz");
    try { navigator.vibrate && navigator.vibrate([80, 50, 80, 50, 160]); } catch (_) {}
    clearTimeout(pl.sabTimer);
    pl.sabTimer = setTimeout(() => { box.hidden = true; }, 4500);
  }

  function startPlayerTick() {
    clearInterval(pl.tick);
    let n = 0;
    pl.tick = setInterval(() => {
      if (!pl.ns) return;
      if (pl.state) { tickTimer(); tickTyping(); }
      if (++n % 4 === 0 && pl.ns.connected && !pl.ns.connected()) $("#plConn").textContent = "🟠 يعيد الاتصال…";
    }, 70);
  }

  function plBuzz() {
    const s = pl.state;
    if (!s || !s.armed || !pl.ns) return;
    pl.n++;
    pl.pending = Date.now();
    quiet(pl.ns.presence({ buzz: { seq: s.seq, n: pl.n } }, { now: true }));
    freezeTyping();
    if (ctx.sound) ctx.sound("buzz");
    try { navigator.vibrate && navigator.vibrate(60); } catch (_) {}
    plRender();
    setTimeout(plRender, 1600);   // لو ضاع الضغط يرجع الزر
  }

  function plLeave() {
    clearInterval(pl.tick); clearTimeout(pl.waitTimer); clearTimeout(pl.failTimer);
    pl.everHost = false; pl.tm = null; pl.tmKey = ""; pl.lastMode = ""; pl.sjKey = ""; pl.sjQ = ""; pl.sjMine = -1; pl.sjOpp = -1;
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
    getRoom().then((r) => { if (!r) $("#plMsg").textContent = noRoomMsg(); });
  }

  /* ================= ربط العناصر ================= */
  function wire() {
    $("#bellStart").onclick = async () => {
      $("#bellStart").disabled = true;
      hostFailed = false;
      const ok = await hostStart();
      $("#bellStart").disabled = false;
      if (!ok) {
        hostFailed = true;
        $("#bellNAText").textContent = transport === "mqtt"
          ? "ما قدرنا نتصل بخدمة الجرس. تأكد من الإنترنت وجرّب مرة ثانية."
          : "الجرس يشتغل بس لما تفتح اللعبة من الرابط المنشور وأنت مسجّل دخول.";
        if (transport !== "mqtt") $("#bellOff").hidden = true;
      }
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
    setView(v, urgent) { host.view = v; publish(urgent); },
    setNote(text) {
      if (!host.on) return;
      host.noteN++;
      host.note = { t: clean(text, 90), k: host.noteN };
      publish();
      clearTimeout(host.noteTimer);
      host.noteTimer = setTimeout(() => { host.note = null; publish(); }, 10000);
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
      host.seq++; host.winner = null; host.armed = false;   // الفرصة تنتقل مباشرة للثاني بدون جرس
      publish(true);
      return { armed: false };
    },
  };
})();
