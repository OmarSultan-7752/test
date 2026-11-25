/* اتصال مستقل عن Claude للجرس وجوالات اللاعبين.
   يستخدم سيرفر MQTT عام ومجاني (بدون حسابات) عبر WebSocket مشفّر.
   يعطي نفس واجهة "الغرفة" اللي يستخدمها bell.js: join(name) ← presence / peers / onPeers / leave.
   كل جهاز ينشر حالته (presence) برسالة محفوظة (retained) على موضوع خاص به،
   فأي جهاز يدخل متأخر ياخذ الحالة الحالية مباشرة.
   ملاحظة: السيرفر عام، فاللي يعرف الرمز يقدر يدخل الغرفة. الإجابات ما تنرسل أبداً. */
(() => {
  "use strict";
  if (!window.mqtt) return;

  const BROKERS = window.HRF_BROKERS || [
    "wss://broker.emqx.io:8084/mqtt",
    "wss://broker.hivemq.com:8884/mqtt",
    "wss://test.mosquitto.org:8081",
  ];
  const ROOT = "haroof-game-v1";
  const HEARTBEAT = 25000;       // نعيد نشر حالتنا كل 25 ثانية
  const STALE = 120000;          // أي جهاز ما سمعنا منه 2 دقيقة نعتبره طلع
  const myId = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");

  function connectTo(url, willTopic) {
    return new Promise((resolve, reject) => {
      let done = false;
      const c = window.mqtt.connect(url, {
        clientId: "hrf-" + myId + "-" + Math.random().toString(16).slice(2, 6),
        clean: true,
        keepalive: 30,
        reconnectPeriod: 2000,
        connectTimeout: 7000,
        will: { topic: willTopic, payload: "", qos: 0, retain: true },
      });
      const fail = (e) => { if (done) return; done = true; try { c.end(true); } catch (_) {} reject(e || new Error("connect failed")); };
      const t = setTimeout(() => fail(new Error("timeout")), 8000);
      c.once("connect", () => { if (done) return; done = true; clearTimeout(t); resolve(c); });
      c.once("error", (e) => { clearTimeout(t); fail(e); });
    });
  }

  async function connectAny(willTopic) {
    let last = null;
    for (const url of BROKERS) {
      try { return await connectTo(url, willTopic); } catch (e) { last = e; }
    }
    throw last || new Error("no broker");
  }

  async function join(name) {
    if (!/^[a-z0-9][a-z0-9_.-]{0,47}$/.test(name)) throw new Error("bad room name");
    const base = `${ROOT}/${name}/p/`;
    const myTopic = base + myId;
    const client = await connectAny(myTopic);

    const peers = new Map();            // id → { presence, updatedAt, t }
    const handlers = new Set();
    let mine = {};
    let pubTimer = 0, notifyTimer = 0, sweepTimer = 0, beatTimer = 0;
    let left = false;
    const pend = { joined: new Set(), updated: new Set(), left: [] };

    const toPeer = (id, v) => Object.freeze({
      peer: id, by: null, isMe: id === myId, sameTab: id === myId,
      kind: "viewer", guest: false, presence: v.presence, updatedAt: v.updatedAt,
    });
    const snapshot = () => Object.freeze([...peers.entries()].map(([id, v]) => v.peer || (v.peer = toPeer(id, v))));

    function notify() {
      notifyTimer = 0;
      if (!handlers.size) { pend.joined.clear(); pend.updated.clear(); pend.left = []; return; }
      const snap = snapshot();
      const byId = (id) => snap.find((p) => p.peer === id);
      const change = {
        peers: snap,
        joined: [...pend.joined].map(byId).filter(Boolean),
        updated: [...pend.updated].map(byId).filter(Boolean),
        left: pend.left,
      };
      pend.joined.clear(); pend.updated.clear(); pend.left = [];
      for (const h of [...handlers]) { try { h(change); } catch (_) {} }
    }
    const schedule = () => { if (!notifyTimer) notifyTimer = setTimeout(notify, 0); };

    function publishNow() {
      pubTimer = 0;
      if (left || !client.connected) return;
      client.publish(myTopic, JSON.stringify({ p: mine, t: Date.now() }), { qos: 0, retain: true });
    }
    const publishSoon = () => { if (!pubTimer) pubTimer = setTimeout(publishNow, 40); };

    function setPeer(id, presence) {
      const had = peers.has(id);
      peers.set(id, { presence: Object.freeze(presence), updatedAt: Date.now() });
      (had ? pend.updated : pend.joined).add(id);
      schedule();
    }

    client.on("message", (topic, payload) => {
      if (!topic.startsWith(base)) return;
      const id = topic.slice(base.length);
      const text = payload.toString();
      if (!text) {                       // رسالة فاضية = الجهاز طلع
        if (peers.delete(id)) { pend.left.push(id); schedule(); }
        return;
      }
      let msg;
      try { msg = JSON.parse(text); } catch (_) { return; }
      if (!msg || typeof msg.p !== "object" || msg.p === null) return;
      setPeer(id, msg.p);
    });

    // بعد إعادة الاتصال نعيد نشر حالتنا
    client.on("connect", () => { if (!left) publishSoon(); });

    await new Promise((resolve, reject) => {
      client.subscribe(base + "+", { qos: 0 }, (err) => (err ? reject(err) : resolve()));
    });

    beatTimer = setInterval(publishNow, HEARTBEAT);
    // أي جهاز ما سمعنا منه شي (حتى نبضة القلب) أكثر من دقيقتين نعتبره طلع
    sweepTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, v] of peers) {
        if (id !== myId && now - v.updatedAt > STALE) { peers.delete(id); pend.left.push(id); }
      }
      if (pend.left.length) schedule();
    }, 15000);

    return {
      name,
      transport: "mqtt",
      presence(patch) {
        for (const k in patch) { if (patch[k] === null) delete mine[k]; else mine[k] = patch[k]; }
        if (JSON.stringify(mine).length > 3800) return Promise.reject(new Error("presence too large"));
        setPeer(myId, { ...mine });
        publishSoon();
        return Promise.resolve();
      },
      peers: snapshot,
      onPeers(handler) {
        handlers.add(handler);
        setTimeout(() => { if (handlers.has(handler)) handler({ peers: snapshot(), joined: snapshot(), left: [], updated: [] }); }, 0);
        return () => handlers.delete(handler);
      },
      connected: () => !!client.connected,
      leave() {
        if (left) return Promise.resolve();
        left = true;
        clearInterval(beatTimer); clearInterval(sweepTimer); clearTimeout(pubTimer); clearTimeout(notifyTimer);
        handlers.clear();
        return new Promise((resolve) => {
          try {
            client.publish(myTopic, "", { qos: 0, retain: true }, () => { client.end(false, {}, resolve); });
            setTimeout(resolve, 800);
          } catch (_) { resolve(); }
        });
      },
    };
  }

  window.HaroofRTC = { join, transport: "mqtt" };
})();
