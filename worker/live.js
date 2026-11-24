// live.js – Live-Gruppenarbeit (Wunsch des Betreibers vom 24.11.2026): Durable Object „LiveRoom“, ein Raum je Gruppe.
//
// Die Gruppensprecherin bzw. der Gruppensprecher legt den Raum an; alle Geräte der Gruppe halten eine WebSocket-Verbindung dorthin.
// Der Raum speichert den gemeinsamen Stand (Antworten, KI-Feedback mit erster Fassung, nach der Abgabe die Lösungen für die PDF) –
// ausschließlich als Text, den der Browser mit einem Schlüssel aus Zugangswort und Zahlencode verschlüsselt hat. Der Server bekommt
// weder Zugangswort noch Zahlencode (nur die daraus abgeleitete Raum-Kennung) und kann die Werte nicht lesen; er ordnet nur:
//   • Sperren: in einer Aufgabe schreibt immer nur ein Gerät (Entscheidung des Betreibers), die anderen sehen den Text mitwachsen,
//   • Zusagen (claims): KI-Feedback gibt es je Aufgabe nur einmal für die ganze Gruppe, die Abgabe nur einmal,
//   • Versionen je Schlüssel, damit ein Gerät nach einer Unterbrechung nichts Neueres überschreibt.
// Free-Plan: nur SQLite-gestützte Durable Objects; WebSocket-Hibernation (keine Laufzeit zwischen den Nachrichten, deshalb kein
// setTimeout/setInterval und nie accept() auf Dauerverbindungen), Zustand der Verbindungen in serializeAttachment (≤ 2 KB).
// Bewusst eine einfache Klasse (kein `extends DurableObject`, kein RPC): so lässt sie sich ohne workerd testen (test/unit/live.test.mjs).
//
// Protokoll (JSON-Textnachrichten; „ping“ beantwortet die Laufzeit selbst mit „pong“). Schlüssel: a<i> Antwort zu Aufgabe i (0-basiert),
// f<i> erste Fassung + KI-Feedback zu Aufgabe i (nur einmal setzbar), fs Signatur des gesendeten Erstversuchs, sol Lösungen nach der Abgabe.
//   Browser → Raum
//     {t:"lock",k}            Aufgabe zum Schreiben belegen            {t:"unlock",k}   wieder freigeben
//     {t:"pv",k,v}            Vorschau beim Tippen: nur weitergereicht, nicht gespeichert (schont die Schreibgrenze des Tarifs)
//     {t:"set",k,v,base?}     Wert speichern; base = Version, auf der das Gerät aufsetzt (weicht sie ab → deny „stale“)
//     {t:"claim",ks:[f…]}     KI-Feedback zu diesen Aufgaben anfragen  {t:"release",ks}  Anfrage gescheitert/abgebrochen
//     {t:"claimsub"}          Abgabe beginnen                          {t:"unsub"}       Abgabe gescheitert/abgebrochen
//     {t:"sub",attempt,sol?}  Abgabe ist angekommen – der Raum sieht in D1 nach (Kennung der Bearbeitung, stage final) und schließt ab.
//                             Auch als Nachfrage geeignet („Hat schon jemand abgegeben?“, z. B. nach 409 final_locked): gibt es keine → deny „nosub“.
//   Raum → Browser
//     {t:"init",you,n,m:{createdAt,meta,tasks,idleDays,sub},st:{k:{v,ver}},lk:{k:[id,ms]},cl:{k:[id,ms]},sc:[id,ms]|null}
//     {t:"peers",n}  {t:"pv",k,v,by,ms}  {t:"set",k,v,ver,by,ms?}  {t:"ack",k,ver}  {t:"lock",k,by|null,ms?}
//     {t:"claim",ks,by|null,ms?}  {t:"subclaim",by|null,ms?}  {t:"sub",by,sub,sol}
//     {t:"deny",k?,claim?,sub?,ks?,why,by?,cur?}   why: bad big submitted submitting locked stale set claimed nosub noclaim unknown error
//       (cur = gespeicherter Stand {v,ver}: bei locked/stale/set, auch wenn eine Zusage abgelehnt wird, weil es das Feedback schon gibt)
//   ms = so lange gilt die Sperre bzw. Zusage noch ohne weiteres Lebenszeichen (die Uhren der Geräte gehen verschieden – deshalb eine Dauer).
//   Schließcodes: 4404 Raum gibt es nicht (mehr), 4409 zu viele Geräte, 4400 ungültige Nachricht, 4413 zu groß, 4429 zu viele Nachrichten.

export const LIVE = {
  idleDays: 30,                 // Raum ohne Abgabe: so lange nach der letzten Änderung gelöscht
  lockMs: 30e3,                 // Schreib-Sperre einer Aufgabe ohne Lebenszeichen (jede Eingabe verlängert sie)
  claimMs: 6 * 60e3,            // laufende KI-Anfrage (der Browser wiederholt bei „ausgelastet“ bis zu 4 Minuten)
  submitMs: 3 * 60e3,           // laufende Abgabe
  maxConns: 24,                 // Geräte je Raum (Gruppe ≤ 10, dazu Tabs und kurzzeitig doppelte Verbindungen beim Neuverbinden)
  textValue: 64 * 1024,         // verschlüsselte Antwort (≤ 8000 Zeichen) bzw. erste Fassung + KI-Feedback einer Aufgabe
  photoValue: 640 * 1024,       // Antwort einer Foto-Aufgabe (JPEG als data:-URL im verschlüsselten Wert)
  solValue: 1536 * 1024,        // Lösungen nach der Abgabe (für die PDF aller Gruppenmitglieder), samt Fotos
  metaValue: 4096,              // Angaben der Gruppe (Kürzel, Klasse, Kennung der Bearbeitung) – verschlüsselt
  sigValue: 256,
  msgBytes: 1700 * 1024,
  touchMs: 10 * 60e3,           // „zuletzt geändert“ höchstens so oft fortschreiben (spart Schreibvorgänge)
  setsPerMin: 150,              // Änderungen je Verbindung und Minute (die Seite sendet beim Tippen höchstens etwa alle 1–2 s)
};
export const ROOM_RE = /^[0-9a-f]{64}$/;
const ATTEMPT = /^[0-9a-f]{16}$/;
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const IDLE_MS = LIVE.idleDays * 86400e3;
const CHECK_MS = 86400e3;   // nach der Abgabe: täglich nachsehen, ob es sie noch gibt (Löschfrist der Lehrkraft)
export const CLOSE = { gone: 4404, full: 4409, bad: 4400, big: 4413, flood: 4429 };

// Verschlüsselter Wert: Base64-Text (IV + AES-GCM), für den Server undurchsichtig. Das Muster nur bei kleinen Werten prüfen –
// große (Fotos) kosten sonst unnötig Rechenzeit; entschlüsseln kann sie ohnehin nur die Gruppe.
export function isLiveValue(v, max) {
  if (typeof v !== "string" || v.length < 24 || v.length > max) return false;
  return v.length > 96 * 1024 ? B64_RE.test(v.slice(0, 256)) && B64_RE.test(v.slice(-256)) : B64_RE.test(v);
}
// Schlüssel des gemeinsamen Stands: a<i> = Antwort zu Aufgabe i (0-basiert), f<i> = erste Fassung + KI-Feedback zu Aufgabe i (nur einmal
// setzbar), fs = Signatur des zuletzt gesendeten Erstversuchs, sol = Lösungen nach der Abgabe.
export function liveKey(k, n, photo) {
  if (typeof k !== "string") return null;
  const m = /^([af])(0|[1-9]\d?)$/.exec(k);
  if (m) {
    const i = Number(m[2]);
    if (!(i < n)) return null;
    return { kind: m[1], i, max: m[1] === "a" && photo.includes(i) ? LIVE.photoValue : LIVE.textValue };
  }
  if (k === "fs") return { kind: "fs", i: -1, max: LIVE.sigValue };
  if (k === "sol") return { kind: "sol", i: -1, max: LIVE.solValue };
  return null;
}
const newId = () => { const u = new Uint8Array(6); crypto.getRandomValues(u); let s = ""; for (const b of u) s += (b < 16 ? "0" : "") + b.toString(16); return s; };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

export class LiveRoom {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.store = ctx.storage;
    this.m = undefined;        // Kopf des Raums (undefined = noch nicht gelesen, null = gibt es nicht)
    this.touched = 0;
    // „ping“ beantwortet die Laufzeit selbst mit „pong“, ohne das Objekt zu wecken (keine Kosten): so merkt der Browser tote Verbindungen
    try { if (typeof WebSocketRequestResponsePair === "function" && ctx.setWebSocketAutoResponse) ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong")); } catch {}
  }
  // 101-Antwort getrennt: Node (Unit-Tests) erlaubt den Status 101 in `new Response` nicht
  upgradeResponse(client) { return new Response(null, { status: 101, webSocket: client }); }
  async head() {
    if (this.m === undefined) {
      this.m = (await this.store.get("m")) || null;
      this.touched = (await this.store.get("t")) || (this.m ? this.m.createdAt : 0);
    }
    return this.m;
  }
  async touch(now) {
    if (now - this.touched < LIVE.touchMs) return;
    this.touched = now;
    await this.store.put("t", now);
  }
  sockets(except) { return this.ctx.getWebSockets().filter((w) => w !== except); }
  att(ws) { try { return ws.deserializeAttachment() || {}; } catch { return {}; } }
  send(ws, msg) { try { ws.send(typeof msg === "string" ? msg : JSON.stringify(msg)); } catch {} }
  broadcast(msg, except) { const s = JSON.stringify(msg); for (const w of this.sockets(except)) this.send(w, s); }
  bye(ws, code, reason) { try { ws.close(code, reason || ""); } catch {} }
  // Wer hält gerade was? Aus den Anhängen aller offenen Verbindungen (überleben den Ruhezustand), abgelaufene Einträge zählen nicht.
  holders(now, except) {
    const lock = new Map(), claim = new Map(), until = new Map(); let sub = null, subUntil = 0;
    for (const w of this.sockets(except)) {
      const a = this.att(w); if (!a.id) continue;
      if (a.s > now) { sub = a.id; subUntil = a.s; }
      if (a.cu > now) for (const k of a.c || []) {   // die Aufgabe einer laufenden KI-Anfrage bleibt gesperrt
        claim.set(k, a.id); until.set(k, a.cu);
        lock.set("a" + k.slice(1), a.id); until.set("a" + k.slice(1), a.cu);
      }
      if (a.lu > now) for (const k of a.l || []) if (!lock.has(k)) { lock.set(k, a.id); until.set(k, a.lu); }
    }
    return { lock, claim, sub, until, subUntil };
  }
  // Für die Begrüßung: {Schlüssel: [Verbindung, Restdauer in ms]}
  left(map, until, now) { const o = {}; for (const [k, id] of map) o[k] = [id, Math.max(0, (until.get(k) || now) - now)]; return o; }

  async fetch(request) {
    const url = new URL(request.url), path = url.pathname;
    if (path === "/ws") return this.connect(request);
    if (path === "/init" && request.method === "POST") return this.init(await request.json());
    if (path === "/info") {
      const m = await this.head();
      if (!m) return json({ ok: false }, 404);
      return json({ ok: true, createdAt: m.createdAt, submitted: !!m.sub });
    }
    if (path === "/wipe" && request.method === "POST") { await this.wipe(false); return json({ ok: true }); }
    return json({ ok: false }, 404);
  }
  async init(b) {
    if (await this.head()) return json({ ok: false, code: "room_taken" }, 409);
    const n = Number(b.n), photo = Array.isArray(b.photo) ? b.photo.map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < n) : [];
    if (!Number.isInteger(n) || n < 1 || n > 30 || typeof b.code !== "string" || typeof b.rid !== "string" || !isLiveValue(b.meta, LIVE.metaValue)) return json({ ok: false }, 400);
    const now = Date.now();
    this.m = { v: 1, code: b.code, rid: b.rid, n, photo, meta: b.meta, createdAt: now, sub: null };
    this.touched = now;
    await this.store.put({ m: this.m, t: now });
    await this.store.setAlarm(now + IDLE_MS + 3600e3);
    return json({ ok: true, createdAt: now });
  }
  // Nach der Abgabe: Gibt es sie (und das Blatt) noch? Sonst verschwinden die Lösungen für die PDF (Löschfrist der Lehrkraft, oder
  // die Lehrkraft hat den Eintrag gelöscht) – der Vermerk „abgegeben“ bleibt. Wurde die Abgabe beim Abschließen nicht in der Datenbank
  // gesehen (sie war nicht erreichbar), in der ersten Minute nicht nachsehen.
  async checkSubmission(m, now) {
    if (!m.sub || m.sub.gone || (!m.sub.ok && now - m.sub.at < 60e3) || !this.env || !this.env.DB) return m;
    let row;
    try {
      row = await this.env.DB.prepare(
        "SELECT (SELECT COUNT(*) FROM sheets WHERE code=?1) AS sheet, (SELECT COUNT(*) FROM submissions WHERE sheet_code=?1 AND attempt=?2 AND stage='final') AS sub")
        .bind(m.code, m.sub.attempt).first();
    } catch { return m; }   // Datenbank gerade nicht erreichbar: nichts löschen
    if (!row) return m;
    if (!Number(row.sheet)) { await this.wipe(true); return null; }
    if (!Number(row.sub)) {
      m.sub = { ...m.sub, gone: true };
      await this.store.put("m", m);
      await this.store.delete("k:sol");
    }
    return m;
  }
  async connect(request) {
    if ((request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") return json({ ok: false }, 426);
    const pair = new WebSocketPair(), client = pair[0], server = pair[1];
    const refuse = (code, why) => { try { server.accept(); server.close(code, why); } catch {} return this.upgradeResponse(client); };
    let m = await this.head();
    const now = Date.now();
    if (m) m = await this.checkSubmission(m, now);
    if (!m) return refuse(CLOSE.gone, "gone");
    if (this.ctx.getWebSockets().length >= LIVE.maxConns) return refuse(CLOSE.full, "full");
    this.ctx.acceptWebSocket(server);
    const id = newId();
    server.serializeAttachment({ id });
    const st = {};
    for (const [k, val] of await this.store.list({ prefix: "k:" })) st[k.slice(2)] = val;
    const h = this.holders(now);
    this.send(server, { t: "init", you: id, n: this.ctx.getWebSockets().length, m: { createdAt: m.createdAt, meta: m.meta, tasks: m.n, idleDays: LIVE.idleDays,
      sub: m.sub ? { receivedAt: m.sub.receivedAt, at: m.sub.at, gone: !!m.sub.gone } : null },
    st, lk: this.left(h.lock, h.until, now), cl: this.left(h.claim, h.until, now), sc: h.sub ? [h.sub, Math.max(0, h.subUntil - now)] : null });
    this.broadcast({ t: "peers", n: this.ctx.getWebSockets().length }, server);
    return this.upgradeResponse(client);
  }

  async webSocketMessage(ws, raw) {
    try { return await this.onMessage(ws, raw); }
    // z. B. Tagesgrenze des Speichers erreicht: nichts verloren geben – das Gerät behält seinen Text und versucht es erneut.
    // Mit dem Schlüssel der Nachricht (falls lesbar), damit der Browser weiß, welche Eingabe gemeint ist.
    catch {
      let k; try { const m = JSON.parse(raw); if (m && typeof m.k === "string" && m.k.length <= 8) k = m.k; } catch {}
      this.send(ws, k ? { t: "deny", k, why: "error" } : { t: "deny", why: "error" });
    }
  }
  async onMessage(ws, raw) {
    if (typeof raw !== "string") return this.bye(ws, CLOSE.bad, "text");
    if (raw.length > LIVE.msgBytes) return this.bye(ws, CLOSE.big, "big");
    let msg;
    try { msg = JSON.parse(raw); } catch { return this.bye(ws, CLOSE.bad, "json"); }
    if (!msg || typeof msg !== "object" || typeof msg.t !== "string") return this.bye(ws, CLOSE.bad, "msg");
    const m = await this.head();
    if (!m) return this.bye(ws, CLOSE.gone, "gone");
    const now = Date.now(), a = this.att(ws);
    if (!a.id) return this.bye(ws, CLOSE.bad, "id");
    const others = this.holders(now, ws);          // was die anderen Verbindungen halten
    const mine = (k) => (a.lu > now && (a.l || []).includes(k)) || (a.cu > now && (a.c || []).includes("f" + k.slice(1)));
    const save = () => { try { ws.serializeAttachment(a); } catch {} };
    const deny = (extra) => this.send(ws, { t: "deny", ...extra });
    if (msg.t === "set" || msg.t === "pv") {   // Schutz der Tagesgrenzen: eine Verbindung, die unablässig schreibt, wird getrennt
      if (!(a.wt > now - 60e3)) { a.wt = now; a.w = 0; }
      a.w = (a.w || 0) + 1; save();
      if (a.w > LIVE.setsPerMin) return this.bye(ws, CLOSE.flood, "flood");
    }
    switch (msg.t) {
      case "lock": {
        const info = liveKey(msg.k, m.n, m.photo);
        if (!info || info.kind !== "a") return deny({ k: msg.k, why: "bad" });
        if (m.sub) return deny({ k: msg.k, why: "submitted" });
        if (others.sub) return deny({ k: msg.k, why: "submitting", by: others.sub });
        const by = others.lock.get(msg.k);
        if (by) return deny({ k: msg.k, why: "locked", by });
        a.l = [...new Set([...(a.lu > now ? a.l || [] : []), msg.k])].slice(-40); a.lu = now + LIVE.lockMs; save();
        return this.broadcast({ t: "lock", k: msg.k, by: a.id, ms: LIVE.lockMs });
      }
      case "pv": {   // Vorschau beim Tippen: die anderen sehen den Text mitwachsen; gespeichert wird erst mit „set“
        const info = liveKey(msg.k, m.n, m.photo);
        if (!info || info.kind !== "a" || !isLiveValue(msg.v, LIVE.textValue)) return deny({ k: msg.k, why: "bad" });
        if (m.sub) return deny({ k: msg.k, why: "submitted" });
        if (others.sub) return deny({ k: msg.k, why: "submitting", by: others.sub });
        const by = others.lock.get(msg.k);
        if (by) return deny({ k: msg.k, why: "locked", by });
        const fresh = !mine(msg.k);
        a.l = [...new Set([...(a.lu > now ? a.l || [] : []), msg.k])].slice(-40); a.lu = now + LIVE.lockMs; save();
        if (fresh) this.broadcast({ t: "lock", k: msg.k, by: a.id, ms: LIVE.lockMs }, ws);
        return this.broadcast({ t: "pv", k: msg.k, v: msg.v, by: a.id, ms: LIVE.lockMs }, ws);
      }
      case "unlock": {
        if (!(a.l || []).includes(msg.k)) return;
        a.l = a.l.filter((k) => k !== msg.k); save();
        // „frei“ nur melden, wenn die Aufgabe wirklich frei ist (eine abgelaufene eigene Sperre kann längst ein anderes Gerät halten)
        if (!mine(msg.k) && !others.lock.has(msg.k)) this.broadcast({ t: "lock", k: msg.k, by: null });
        return;
      }
      case "set": return this.onSet(ws, a, msg, m, now, others, mine, save, deny);
      case "claim": {   // KI-Feedback zu diesen Aufgaben: nur einmal je Aufgabe für die ganze Gruppe
        const ks = Array.isArray(msg.ks) ? [...new Set(msg.ks)] : [];
        if (!ks.length || ks.length > 30 || ks.some((k) => { const i = liveKey(k, m.n, m.photo); return !i || i.kind !== "f"; })) return deny({ claim: true, ks, why: "bad" });
        if (m.sub) return deny({ claim: true, ks, why: "submitted" });
        if (others.sub) return deny({ claim: true, ks, why: "submitting", by: others.sub });
        const have = await this.store.get(ks.map((k) => "k:" + k));
        for (const k of ks) {
          // schon vorhanden: gleich mitliefern (dem Gerät kann die Nachricht dazu entgangen sein)
          if (have.has("k:" + k)) { const c = have.get("k:" + k); return deny({ claim: true, ks, k, why: "set", cur: { v: c.v, ver: c.ver } }); }
          if (others.claim.has(k)) return deny({ claim: true, ks, k, why: "claimed", by: others.claim.get(k) });
          const lk = others.lock.get("a" + k.slice(1));
          if (lk) return deny({ claim: true, ks, k, why: "locked", by: lk });
        }
        a.c = [...new Set([...(a.cu > now ? a.c || [] : []), ...ks])]; a.cu = now + LIVE.claimMs; save();
        return this.broadcast({ t: "claim", ks, by: a.id, ms: LIVE.claimMs });
      }
      case "release": {
        const ks = (Array.isArray(msg.ks) ? msg.ks : []).filter((k) => (a.c || []).includes(k));
        if (!ks.length) return;
        a.c = a.c.filter((k) => !ks.includes(k)); save();
        return this.broadcast({ t: "claim", ks, by: null });
      }
      case "claimsub": {   // Abgabe: nur einmal je Gruppe; solange jemand schreibt oder die KI fragt, nicht
        if (m.sub) return deny({ sub: true, why: "submitted" });
        if (others.sub) return deny({ sub: true, why: "submitting", by: others.sub });
        if (others.claim.size) return deny({ sub: true, why: "claimed", by: [...others.claim.values()][0] });
        if (others.lock.size) return deny({ sub: true, why: "locked", by: [...others.lock.values()][0], k: [...others.lock.keys()][0] });
        a.s = now + LIVE.submitMs; save();
        return this.broadcast({ t: "subclaim", by: a.id, ms: LIVE.submitMs });
      }
      case "unsub": {
        if (!(a.s > 0)) return;
        a.s = 0; save();
        return this.broadcast({ t: "subclaim", by: null });
      }
      case "sub": {   // Abgabe ist beim Server angekommen (POST /api/submit war erfolgreich): Raum abschließen
        if (m.sub) return deny({ sub: true, why: "submitted" });
        if (typeof msg.attempt !== "string" || !ATTEMPT.test(msg.attempt)) return deny({ sub: true, why: "bad" });
        if (msg.receivedAt != null && !(Number.isSafeInteger(msg.receivedAt) && msg.receivedAt > 0)) return deny({ sub: true, why: "bad" });
        if (msg.sol != null && !isLiveValue(msg.sol, LIVE.solValue)) return deny({ sub: true, why: "bad" });
        // Gibt es die Abgabe wirklich? Dann zählt sie – auch von einer neuen Verbindung (das Gerät war beim Senden kurz getrennt) oder
        // von einem anderen Gerät (das abgebende Gerät wurde geschlossen, bevor es dem Raum Bescheid sagen konnte). Der Eingang kommt aus
        // der Datenbank. Ist sie gerade nicht erreichbar, genügt die Zusage dieser Verbindung („claimsub“) mit dem gemeldeten Eingang.
        const seen = await this.submissionSeen(m.code, msg.attempt);
        if (seen === 0) return deny({ sub: true, why: "nosub" });
        if (seen === null && !(a.s > 0 && msg.receivedAt)) return deny({ sub: true, why: "noclaim" });
        m.sub = { attempt: msg.attempt, receivedAt: seen || msg.receivedAt, at: now, ok: seen ? 1 : 0 };
        const put = { m, t: now };
        let sol = null;
        if (msg.sol != null) { const cur = await this.store.get("k:sol"); sol = { v: msg.sol, ver: (cur ? cur.ver : 0) + 1 }; put["k:sol"] = sol; }
        await this.store.put(put);
        this.touched = now;
        try { await this.store.setAlarm(now + CHECK_MS); } catch {}
        a.s = 0; a.l = []; a.c = []; save();
        return this.broadcast({ t: "sub", by: a.id, sub: { receivedAt: m.sub.receivedAt, at: now, gone: false }, sol });
      }
      default: return deny({ why: "unknown" });
    }
  }
  // Eingang (ms) der Abgabe (stage final) mit dieser Kennung bei diesem Blatt; 0 = es gibt keine; null = nicht feststellbar
  async submissionSeen(code, attempt) {
    if (!this.env || !this.env.DB) return null;
    try {
      const row = await this.env.DB.prepare("SELECT MAX(received_at) AS at, COUNT(*) AS n FROM submissions WHERE sheet_code=?1 AND attempt=?2 AND stage='final'")
        .bind(code, attempt).first();
      return row ? (Number(row.n) > 0 ? Number(row.at) : 0) : null;
    } catch { return null; }
  }
  async onSet(ws, a, msg, m, now, others, mine, save, deny) {
    const k = msg.k, info = liveKey(k, m.n, m.photo);
    if (!info || !isLiveValue(msg.v, info.max)) return deny({ k, why: info ? "big" : "bad" });
    const cur = await this.store.get("k:" + k);
    const curOut = cur ? { v: cur.v, ver: cur.ver } : null;
    let lockNow = false, freed = null;
    if (info.kind === "a") {
      if (m.sub) return deny({ k, why: "submitted", cur: curOut });
      if (others.sub) return deny({ k, why: "submitting", by: others.sub, cur: curOut });
      const by = others.lock.get(k);
      if (by) return deny({ k, why: "locked", by, cur: curOut });
      // Stand, auf dem das Gerät aufsetzt, ist nicht mehr der neueste (z. B. nach einer Unterbrechung): nichts überschreiben
      if (msg.base != null && (cur ? cur.ver : 0) !== msg.base) return deny({ k, why: "stale", cur: curOut });
      if (!mine(k)) lockNow = true;
      if (lockNow || (a.l || []).includes(k)) { a.l = [...new Set([...(a.lu > now ? a.l || [] : []), k])].slice(-40); a.lu = now + LIVE.lockMs; }
    } else if (info.kind === "f") {
      if (m.sub) return deny({ k, why: "submitted", cur: curOut });
      if (cur) return deny({ k, why: "set", cur: curOut });   // KI-Feedback zu dieser Aufgabe gibt es schon – nur einmal je Gruppe
      const by = others.claim.get(k);
      if (by) return deny({ k, why: "claimed", by });
      if ((a.c || []).includes(k)) { a.c = a.c.filter((x) => x !== k); freed = k; }
    } else if (info.kind === "sol") {
      if (!m.sub || m.sub.gone) return deny({ k, why: "nosub" });
    }
    const ver = (cur ? cur.ver : 0) + 1;
    await this.store.put("k:" + k, { v: msg.v, ver });
    try { await this.touch(now); } catch {}   // der Wert ist gespeichert – „zuletzt geändert“ darf daran nichts mehr ändern
    save();
    this.send(ws, { t: "ack", k, ver });
    const holds = info.kind === "a" && (a.l || []).includes(k);   // die Sperre läuft mit jeder Eingabe neu
    this.broadcast(holds ? { t: "set", k, v: msg.v, ver, by: a.id, ms: LIVE.lockMs } : { t: "set", k, v: msg.v, ver, by: a.id }, ws);
    if (lockNow) this.broadcast({ t: "lock", k, by: a.id, ms: LIVE.lockMs }, ws);
    if (freed) {
      this.broadcast({ t: "claim", ks: [freed], by: null });
      const ak = "a" + freed.slice(1);
      if (!mine(ak)) this.broadcast({ t: "lock", k: ak, by: null });
    }
  }
  // Verbindung weg: was sie hielt, ist wieder frei
  async webSocketClose(ws, code) {
    const a = this.att(ws), now = Date.now();
    try { ws.close(code === 1005 || code === 1006 || !code ? 1000 : code, ""); } catch {}
    const rest = this.sockets(ws);
    if (a.id) {
      const h = this.holders(now, ws);
      for (const k of new Set([...(a.lu > now ? a.l || [] : []), ...(a.cu > now ? (a.c || []).map((x) => "a" + x.slice(1)) : [])])) if (!h.lock.has(k)) this.broadcastTo(rest, { t: "lock", k, by: null });
      const cs = a.cu > now ? (a.c || []).filter((k) => !h.claim.has(k)) : [];
      if (cs.length) this.broadcastTo(rest, { t: "claim", ks: cs, by: null });
      if (a.s > now && !h.sub) this.broadcastTo(rest, { t: "subclaim", by: null });
    }
    this.broadcastTo(rest, { t: "peers", n: rest.length });
  }
  async webSocketError(ws) { return this.webSocketClose(ws, 1011); }
  broadcastTo(list, msg) { const s = JSON.stringify(msg); for (const w of list) this.send(w, s); }

  // Aufräumen: Blatt gelöscht → alles weg; ohne Abgabe 30 Tage nach der letzten Änderung alles weg; nach der Abgabe verschwinden die
  // Lösungen mit der Abgabe (Löschfrist), der Vermerk bleibt, solange es das Blatt gibt.
  async alarm() {
    let m = await this.head();
    if (!m) return;
    const now = Date.now();
    let sheet = 1;
    try { if (this.env && this.env.DB) sheet = Number((await this.env.DB.prepare("SELECT COUNT(*) AS n FROM sheets WHERE code=?1").bind(m.code).first() || {}).n); } catch { sheet = 1; }
    if (!sheet) return this.wipe(true);
    // nach der Abgabe täglich, bis sie gelöscht ist (dann verschwinden die Lösungen); danach nur noch selten (gibt es das Blatt noch?)
    if (m.sub) { m = await this.checkSubmission(m, now); if (!m) return; return this.store.setAlarm(now + (m.sub.gone ? IDLE_MS : CHECK_MS)); }
    if (now - this.touched >= IDLE_MS) return this.wipe(true);
    return this.store.setAlarm(this.touched + IDLE_MS + 3600e3);
  }
  async wipe(registry) {
    const m = await this.head();
    for (const w of this.ctx.getWebSockets()) this.bye(w, CLOSE.gone, "gone");
    try { await this.store.deleteAlarm(); } catch {}
    await this.store.deleteAll();
    this.m = null; this.touched = 0;
    if (registry && m && m.rid && this.env && this.env.DB) { try { await this.env.DB.prepare("DELETE FROM live_rooms WHERE rid=?1").bind(m.rid).run(); } catch {} }
  }
}
