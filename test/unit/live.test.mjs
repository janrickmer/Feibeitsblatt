// Live-Gruppenarbeit: Durable Object LiveRoom (worker/live.js) ohne workerd – Speicher, Wecker und Verbindungen nachgebaut
// (test/live-fake.mjs). Geprüft wird das Protokoll: Sperren je Aufgabe, Vorschau, Versionen, Zusagen für KI-Feedback und Abgabe,
// Abschluss nach der Abgabe, Aufräumen.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { LIVE, CLOSE, ROOM_RE, isLiveValue, liveKey } from "../../worker/live.js";
import { installWebSocketPair, makeRoom, connect } from "../live-fake.mjs";

installWebSocketPair();
const val = (s, n = 40) => Buffer.from(s.padEnd(n, ".")).toString("base64");
const META = val("meta");
const post = (room, path, body) => room.fetch(new Request("https://live" + path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }));
async function newRoom({ n = 3, photo = [], env } = {}) {
  const r = makeRoom(env);
  const res = await post(r.room, "/init", { code: "K7QM4X", rid: "r".repeat(64), n, photo, meta: META });
  assert.equal(res.status, 200);
  return r;
}
// D1-Attrappe für den Raum: sheet = gibt es das Blatt, subs = Liste {attempt, receivedAt}
function fakeDb(state) {
  const run = (sql, args) => {
    state.sql.push(sql);
    if (state.fail) throw new Error("D1 nicht erreichbar");
    if (/DELETE FROM live_rooms/.test(sql)) { state.registryDeleted.push(args[0]); return {}; }
    if (/AS sheet,/.test(sql)) return { sheet: state.sheet ? 1 : 0, sub: state.subs.filter((s) => s.attempt === args[1]).length };
    if (/FROM submissions/.test(sql)) { const hit = state.subs.filter((s) => s.attempt === args[1]); return { n: hit.length, at: hit.length ? Math.max(...hit.map((s) => s.receivedAt)) : null }; }
    if (/FROM sheets/.test(sql)) return { n: state.sheet ? 1 : 0 };
    throw new Error("unerwartete Abfrage: " + sql);
  };
  return { prepare: (sql) => ({ bind: (...args) => ({ first: async () => run(sql, args), run: async () => run(sql, args) }) }) };
}
const dbState = (over = {}) => ({ sheet: true, subs: [], sql: [], registryDeleted: [], fail: false, ...over });

test("Werte und Schlüssel: nur Base64-Text in Grenzen; a/f je Aufgabe, fs, sol; Foto-Aufgaben größer", () => {
  assert.equal(isLiveValue(val("x"), 100), true);
  for (const bad of [null, 5, "", "abc", "kein base64!".repeat(4), val("x", 200)]) assert.equal(isLiveValue(bad, 100), false, String(bad).slice(0, 20));
  assert.equal(isLiveValue("A".repeat(200 * 1024), LIVE.photoValue), true);   // große Werte: nur Anfang und Ende geprüft
  assert.equal(isLiveValue("!" + "A".repeat(200 * 1024), LIVE.photoValue), false);
  assert.deepEqual(liveKey("a0", 3, []), { kind: "a", i: 0, max: LIVE.textValue });
  assert.deepEqual(liveKey("a2", 3, [2]), { kind: "a", i: 2, max: LIVE.photoValue });
  assert.deepEqual(liveKey("f2", 3, [2]), { kind: "f", i: 2, max: LIVE.textValue });
  assert.equal(liveKey("fs", 3, []).kind, "fs"); assert.equal(liveKey("sol", 3, []).max, LIVE.solValue);
  for (const bad of ["a3", "a03", "a-1", "b0", "a", "m", "t", "k:a0", 0, null, "a1 "]) assert.equal(liveKey(bad, 3, []), null, String(bad));
  assert.equal(ROOM_RE.test("a".repeat(64)), true); assert.equal(ROOM_RE.test("A".repeat(64)), false);
  assert.ok(LIVE.msgBytes > LIVE.solValue && LIVE.solValue + 4096 < 2 * 1024 * 1024, "ein Wert passt in eine Nachricht und in einen Speicher-Eintrag (2 MB)");
});

test("Raum anlegen: nur einmal; Kopf mit Aufgabenzahl und Foto-Aufgaben; Wecker; /info; ohne Raum 404 und Schließcode 4404", async () => {
  const { room, ctx } = makeRoom();
  assert.equal((await room.fetch(new Request("https://live/info"))).status, 404);
  const gone = await connect(room, ctx);
  assert.deepEqual(gone.closed, { code: CLOSE.gone, reason: "gone" }); assert.equal(ctx.socks.length, 0); assert.equal(ctx.data.size, 0);
  for (const bad of [{ code: "K7QM4X", rid: "r", n: 0, meta: META }, { code: "K7QM4X", rid: "r", n: 31, meta: META }, { code: "K7QM4X", rid: "r", n: 2, meta: "x" }, { rid: "r", n: 2, meta: META }])
    assert.equal((await post(room, "/init", bad)).status, 400);
  assert.equal(ctx.data.size, 0);
  const res = await post(room, "/init", { code: "K7QM4X", rid: "rid1", n: 4, photo: [3, 9, "x", 1.5], meta: META });
  assert.equal(res.status, 200);
  const m = ctx.data.get("m");
  assert.deepEqual({ ...m, createdAt: 0 }, { v: 1, code: "K7QM4X", rid: "rid1", n: 4, photo: [3], meta: META, createdAt: 0, sub: null });
  assert.ok(ctx.alarm > Date.now() + LIVE.idleDays * 86400e3);
  assert.equal((await post(room, "/init", { code: "K7QM4X", rid: "rid1", n: 4, meta: META })).status, 409);
  const info = await (await room.fetch(new Request("https://live/info"))).json();
  assert.deepEqual(info, { ok: true, createdAt: m.createdAt, submitted: false });
  assert.equal((await room.fetch(new Request("https://live/ws"))).status, 426);
  assert.equal((await room.fetch(new Request("https://live/nix"))).status, 404);
});

test("Verbinden: Begrüßung mit Stand, Sperren und Gerätezahl; die anderen erfahren die neue Zahl; höchstens 24 Geräte", async () => {
  const { room, ctx } = await newRoom();
  const a = await connect(room, ctx);
  let init = a.take()[0];
  assert.equal(init.t, "init"); assert.match(init.you, /^[0-9a-f]{12}$/); assert.equal(init.n, 1);
  assert.deepEqual(init.m, { createdAt: ctx.data.get("m").createdAt, meta: META, tasks: 3, idleDays: 30, sub: null });
  assert.deepEqual([init.st, init.lk, init.cl, init.sc], [{}, {}, {}, null]);
  assert.deepEqual(await a.send({ t: "set", k: "a1", v: val("Hallo") }), [{ t: "ack", k: "a1", ver: 1 }]);
  const b = await connect(room, ctx);
  init = b.take()[0];
  assert.equal(init.n, 2); assert.notEqual(init.you, a.server.att.id);
  assert.deepEqual(init.st, { a1: { v: val("Hallo"), ver: 1 } });
  assert.deepEqual(Object.keys(init.lk), ["a1"]); assert.equal(init.lk.a1[0], a.server.att.id); assert.ok(init.lk.a1[1] > 0 && init.lk.a1[1] <= LIVE.lockMs);
  assert.deepEqual(a.take(), [{ t: "peers", n: 2 }]);
  // „ping“ beantwortet die Laufzeit selbst; alles andere muss JSON mit t sein
  const many = [];
  for (let i = 2; i < LIVE.maxConns; i++) many.push(await connect(room, ctx));
  assert.equal(ctx.getWebSockets().length, LIVE.maxConns);
  const over = await connect(room, ctx);
  assert.deepEqual(over.closed, { code: CLOSE.full, reason: "full" }); assert.equal(ctx.getWebSockets().length, LIVE.maxConns);
  await many[0].close();
  assert.equal(ctx.getWebSockets().length, LIVE.maxConns - 1);
  assert.deepEqual(a.take().at(-1), { t: "peers", n: LIVE.maxConns - 1 });
});

test("Eine Person je Aufgabe: Sperre, Vorschau, Versionen; verschiedene Aufgaben gleichzeitig; Freigabe und Ablauf", async (t) => {
  mock.timers.enable({ apis: ["Date"], now: 1_800_000_000_000 });
  t.after(() => mock.timers.reset());
  const { room, ctx } = await newRoom();
  const a = await connect(room, ctx), b = await connect(room, ctx);
  const idA = a.take()[0].you, idB = b.take()[0].you; a.take();
  // A belegt Aufgabe 1 (alle erfahren es, auch A), B wird abgewiesen – beim Belegen, bei der Vorschau und beim Speichern
  assert.deepEqual(await a.send({ t: "lock", k: "a0" }), [{ t: "lock", k: "a0", by: idA, ms: LIVE.lockMs }]);
  assert.deepEqual(b.take(), [{ t: "lock", k: "a0", by: idA, ms: LIVE.lockMs }]);
  assert.deepEqual(await b.send({ t: "lock", k: "a0" }), [{ t: "deny", k: "a0", why: "locked", by: idA }]);
  assert.deepEqual(await b.send({ t: "pv", k: "a0", v: val("B") }), [{ t: "deny", k: "a0", why: "locked", by: idA }]);
  assert.deepEqual(await b.send({ t: "set", k: "a0", v: val("B") }), [{ t: "deny", k: "a0", why: "locked", by: idA, cur: null }]);
  // Vorschau: nur weitergereicht, nichts gespeichert
  const w0 = ctx.writes;
  assert.deepEqual(await a.send({ t: "pv", k: "a0", v: val("Ha") }), []);
  assert.deepEqual(b.take(), [{ t: "pv", k: "a0", v: val("Ha"), by: idA, ms: LIVE.lockMs }]);
  assert.equal(ctx.writes, w0); assert.equal(ctx.data.has("k:a0"), false);
  // Speichern: Version 1, die anderen bekommen den Wert; B schreibt gleichzeitig in Aufgabe 2 (ohne vorheriges „lock“)
  assert.deepEqual(await a.send({ t: "set", k: "a0", v: val("Hallo"), base: 0 }), [{ t: "ack", k: "a0", ver: 1 }]);
  assert.deepEqual(b.take(), [{ t: "set", k: "a0", v: val("Hallo"), ver: 1, by: idA, ms: LIVE.lockMs }]);
  assert.deepEqual(await b.send({ t: "pv", k: "a1", v: val("Welt") }), []);
  assert.deepEqual(a.take(), [{ t: "lock", k: "a1", by: idB, ms: LIVE.lockMs }, { t: "pv", k: "a1", v: val("Welt"), by: idB, ms: LIVE.lockMs }]);
  assert.deepEqual(await b.send({ t: "set", k: "a1", v: val("Welt!") }), [{ t: "ack", k: "a1", ver: 1 }]);
  assert.deepEqual(a.take(), [{ t: "set", k: "a1", v: val("Welt!"), ver: 1, by: idB, ms: LIVE.lockMs }]);
  assert.deepEqual(ctx.data.get("k:a0"), { v: val("Hallo"), ver: 1 });
  // Freigabe: B darf Aufgabe 1 übernehmen – aber nur auf dem neuesten Stand (base); sonst „stale“ mit dem aktuellen Wert
  assert.deepEqual(await a.send({ t: "unlock", k: "a0" }), [{ t: "lock", k: "a0", by: null }]);
  assert.deepEqual(b.take(), [{ t: "lock", k: "a0", by: null }]);
  assert.deepEqual(await b.send({ t: "set", k: "a0", v: val("alt"), base: 0 }), [{ t: "deny", k: "a0", why: "stale", cur: { v: val("Hallo"), ver: 1 } }]);
  assert.deepEqual(await b.send({ t: "set", k: "a0", v: val("Hallo B"), base: 1 }), [{ t: "ack", k: "a0", ver: 2 }]);
  assert.deepEqual(a.take(), [{ t: "set", k: "a0", v: val("Hallo B"), ver: 2, by: idB, ms: LIVE.lockMs }, { t: "lock", k: "a0", by: idB, ms: LIVE.lockMs }]);
  assert.deepEqual(await a.send({ t: "set", k: "a0", v: val("A"), base: 2 }), [{ t: "deny", k: "a0", why: "locked", by: idB, cur: { v: val("Hallo B"), ver: 2 } }]);
  // Ohne Lebenszeichen läuft die Sperre ab (30 s) – danach kann A übernehmen; jede Eingabe hätte sie verlängert
  mock.timers.tick(LIVE.lockMs - 1000);
  assert.equal((await a.send({ t: "lock", k: "a0" }))[0].why, "locked");
  mock.timers.tick(1001);
  assert.deepEqual(await a.send({ t: "lock", k: "a0" }), [{ t: "lock", k: "a0", by: idA, ms: LIVE.lockMs }]);
  b.take();
  assert.deepEqual(await b.send({ t: "set", k: "a0", v: val("B spät"), base: 2 }), [{ t: "deny", k: "a0", why: "locked", by: idA, cur: { v: val("Hallo B"), ver: 2 } }]);
  // Verbindung weg: ihre Sperren sind sofort frei, die anderen erfahren es
  await a.close();
  assert.deepEqual(b.take(), [{ t: "lock", k: "a0", by: null }, { t: "peers", n: 1 }]);
  assert.deepEqual(await b.send({ t: "set", k: "a0", v: val("B frei"), base: 2 }), [{ t: "ack", k: "a0", ver: 3 }]);
  // Ungültiges: unbekannter Schlüssel, zu großer Wert, unbekannte Nachricht
  assert.deepEqual(await b.send({ t: "lock", k: "a9" }), [{ t: "deny", k: "a9", why: "bad" }]);
  assert.deepEqual(await b.send({ t: "lock", k: "f0" }), [{ t: "deny", k: "f0", why: "bad" }]);
  assert.deepEqual(await b.send({ t: "set", k: "a2", v: "A".repeat(LIVE.textValue + 4) }), [{ t: "deny", k: "a2", why: "big" }]);
  assert.deepEqual(await b.send({ t: "set", k: "zz", v: val("x") }), [{ t: "deny", k: "zz", why: "bad" }]);
  assert.deepEqual(await b.send({ t: "nix" }), [{ t: "deny", why: "unknown" }]);
});

test("KI-Feedback nur einmal je Aufgabe für die ganze Gruppe: Zusage, Aufgabe so lange gesperrt, Ergebnis nur einmal setzbar", async (t) => {
  mock.timers.enable({ apis: ["Date"], now: 1_800_000_000_000 });
  t.after(() => mock.timers.reset());
  const { room, ctx } = await newRoom();
  const a = await connect(room, ctx), b = await connect(room, ctx);
  const idA = a.take()[0].you, idB = b.take()[0].you; a.take();
  // B schreibt gerade in Aufgabe 2 → A bekommt die Zusage für die Aufgaben 1 und 2 nicht, für Aufgabe 1 allein schon
  await b.send({ t: "lock", k: "a1" }); a.take(); b.take();
  assert.deepEqual(await a.send({ t: "claim", ks: ["f0", "f1"] }), [{ t: "deny", claim: true, ks: ["f0", "f1"], k: "f1", why: "locked", by: idB }]);
  assert.deepEqual(await a.send({ t: "claim", ks: ["f0"] }), [{ t: "claim", ks: ["f0"], by: idA, ms: LIVE.claimMs }]);
  assert.deepEqual(b.take(), [{ t: "claim", ks: ["f0"], by: idA, ms: LIVE.claimMs }]);
  assert.deepEqual(await b.send({ t: "claim", ks: ["f0"] }), [{ t: "deny", claim: true, ks: ["f0"], k: "f0", why: "claimed", by: idA }]);
  // während der Anfrage ist die Antwort der Aufgabe für die anderen gesperrt (sie ist die „erste Fassung“)
  assert.deepEqual(await b.send({ t: "set", k: "a0", v: val("B") }), [{ t: "deny", k: "a0", why: "locked", by: idA, cur: null }]);
  assert.deepEqual(await b.send({ t: "set", k: "f0", v: val("B-Feedback") }), [{ t: "deny", k: "f0", why: "claimed", by: idA }]);
  // eine neue Verbindung sieht Zusage und Sperre
  const c = await connect(room, ctx);
  const init = c.take()[0];
  assert.equal(init.cl.f0[0], idA); assert.equal(init.lk.a0[0], idA); assert.equal(init.lk.a1[0], idB); assert.ok(init.cl.f0[1] <= LIVE.claimMs);
  await c.close(); a.take(); b.take();
  // Ergebnis: gespeichert, Zusage und Sperre frei; ein zweites Feedback zur selben Aufgabe gibt es nie mehr
  const free = [{ t: "claim", ks: ["f0"], by: null }, { t: "lock", k: "a0", by: null }];   // die Freigabe geht an alle, auch an A selbst
  assert.deepEqual(await a.send({ t: "set", k: "f0", v: val("Feedback 1") }), [{ t: "ack", k: "f0", ver: 1 }, ...free]);
  assert.deepEqual(b.take(), [{ t: "set", k: "f0", v: val("Feedback 1"), ver: 1, by: idA }, ...free]);
  assert.deepEqual(await b.send({ t: "claim", ks: ["f0"] }), [{ t: "deny", claim: true, ks: ["f0"], k: "f0", why: "set" }]);
  assert.deepEqual(await b.send({ t: "set", k: "f0", v: val("zweites") }), [{ t: "deny", k: "f0", why: "set", cur: { v: val("Feedback 1"), ver: 1 } }]);
  assert.deepEqual(ctx.data.get("k:f0"), { v: val("Feedback 1"), ver: 1 });
  assert.deepEqual(await b.send({ t: "set", k: "a0", v: val("überarbeitet") }), [{ t: "ack", k: "a0", ver: 1 }]);
  // Anfrage gescheitert: freigeben; läuft sie ohne Nachricht ab (6 min), ist die Aufgabe ebenfalls wieder frei
  await b.send({ t: "unlock", k: "a1" }); await b.send({ t: "unlock", k: "a0" }); a.take(); b.take();
  assert.equal((await a.send({ t: "claim", ks: ["f1", "f2"] }))[0].by, idA); b.take();
  assert.deepEqual(await a.send({ t: "release", ks: ["f1"] }), [{ t: "claim", ks: ["f1"], by: null }]);
  assert.deepEqual(b.take(), [{ t: "claim", ks: ["f1"], by: null }]);
  assert.equal((await b.send({ t: "claim", ks: ["f1"] }))[0].by, idB); a.take();
  assert.equal((await b.send({ t: "claim", ks: ["f2"] }))[0].why, "claimed");
  mock.timers.tick(LIVE.claimMs + 1);
  assert.equal((await b.send({ t: "claim", ks: ["f2"] }))[0].by, idB);
  // Verbindung mit Zusage weg: frei
  a.take();
  await b.close();
  const got = a.take();
  assert.deepEqual(got.at(-1), { t: "peers", n: 1 });
  assert.ok(got.some((x) => x.t === "claim" && x.by === null && x.ks.includes("f2")));
  assert.ok(got.some((x) => x.t === "lock" && x.k === "a2" && x.by === null));
  // ungültige Zusagen
  for (const ks of [[], ["a0"], ["f9"], "f1", Array.from({ length: 31 }, () => "f1").map((x, i) => x + i)]) assert.equal((await a.send({ t: "claim", ks }))[0].why, "bad");
});

test("Abgabe nur einmal je Gruppe: Zusage, Prüfung in D1, Abschluss – danach nur noch die Lösungen für die PDF", async (t) => {
  mock.timers.enable({ apis: ["Date"], now: 1_800_000_000_000 });
  t.after(() => mock.timers.reset());
  const state = dbState();
  const { room, ctx } = await newRoom({ env: { DB: fakeDb(state) } });
  const a = await connect(room, ctx), b = await connect(room, ctx);
  const idA = a.take()[0].you, idB = b.take()[0].you; a.take();
  await a.send({ t: "set", k: "a0", v: val("Antwort") }); b.take();
  // solange jemand schreibt oder die KI fragt: keine Abgabe
  assert.deepEqual(await b.send({ t: "claimsub" }), [{ t: "deny", sub: true, why: "locked", by: idA, k: "a0" }]);
  await a.send({ t: "unlock", k: "a0" }); b.take();
  await a.send({ t: "claim", ks: ["f1"] }); b.take();
  assert.deepEqual(await b.send({ t: "claimsub" }), [{ t: "deny", sub: true, why: "claimed", by: idA }]);
  await a.send({ t: "release", ks: ["f1"] }); b.take();
  // B gibt ab: alle anderen sind so lange gesperrt
  assert.deepEqual(await b.send({ t: "claimsub" }), [{ t: "subclaim", by: idB, ms: LIVE.submitMs }]);
  assert.deepEqual(a.take(), [{ t: "subclaim", by: idB, ms: LIVE.submitMs }]);
  for (const [msg, want] of [[{ t: "lock", k: "a0" }, { t: "deny", k: "a0", why: "submitting", by: idB }], [{ t: "claimsub" }, { t: "deny", sub: true, why: "submitting", by: idB }],
    [{ t: "claim", ks: ["f0"] }, { t: "deny", claim: true, ks: ["f0"], why: "submitting", by: idB }]]) assert.deepEqual(await a.send(msg), [want]);
  assert.equal((await a.send({ t: "set", k: "a0", v: val("zu spät"), base: 1 }))[0].why, "submitting");
  const c = await connect(room, ctx);
  assert.equal(c.take()[0].sc[0], idB); await c.close(); a.take(); b.take();
  // Abgabe gescheitert → frei; neu belegt
  assert.deepEqual(await b.send({ t: "unsub" }), [{ t: "subclaim", by: null }]);
  assert.deepEqual(a.take(), [{ t: "subclaim", by: null }]);
  await b.send({ t: "claimsub" }); a.take(); b.take();
  // „sub“ zählt nur, wenn es die Abgabe in D1 gibt (Kennung der Bearbeitung, stage final) – der Eingang kommt aus der Datenbank
  const attempt = "0123456789abcdef", receivedAt = Date.now() - 1234;
  assert.deepEqual(await b.send({ t: "sub", attempt, receivedAt, sol: val("Lösungen") }), [{ t: "deny", sub: true, why: "nosub" }]);
  for (const bad of [{ attempt: "xyz", receivedAt }, { attempt, receivedAt: "1" }, { attempt, receivedAt: -5 }, { attempt, receivedAt, sol: "kein base64!" }]) assert.equal((await b.send({ t: "sub", ...bad }))[0].why, "bad");
  assert.equal(ctx.data.get("m").sub, null);
  state.subs.push({ attempt, receivedAt });
  const got = await b.send({ t: "sub", attempt, receivedAt: 42, sol: val("Lösungen") });   // ein falsch gemeldeter Eingang zählt nicht
  const subMsg = { t: "sub", by: idB, sub: { receivedAt, at: Date.now(), gone: false }, sol: { v: val("Lösungen"), ver: 1 } };
  assert.deepEqual(got, [subMsg]); assert.deepEqual(a.take(), [subMsg]);
  assert.deepEqual(ctx.data.get("m").sub, { attempt, receivedAt, at: Date.now() });
  assert.equal(ctx.alarm, Date.now() + 86400e3, "nach der Abgabe täglich nachsehen");
  // danach: nichts mehr änderbar, keine zweite Abgabe; nur die Lösungen lassen sich erneuern (finale KI-Rückmeldung kam dazu)
  for (const [msg, why] of [[{ t: "lock", k: "a0" }, "submitted"], [{ t: "pv", k: "a0", v: val("x") }, "submitted"], [{ t: "set", k: "a0", v: val("x") }, "submitted"],
    [{ t: "set", k: "f1", v: val("x") }, "submitted"], [{ t: "claim", ks: ["f1"] }, "submitted"], [{ t: "claimsub" }, "submitted"], [{ t: "sub", attempt, receivedAt }, "submitted"]])
    assert.equal((await a.send(msg))[0].why, why, JSON.stringify(msg));
  assert.deepEqual(await b.send({ t: "set", k: "sol", v: val("Lösungen + finale Rückmeldung") }), [{ t: "ack", k: "sol", ver: 2 }]);
  assert.deepEqual(a.take(), [{ t: "set", k: "sol", v: val("Lösungen + finale Rückmeldung"), ver: 2, by: idB }]);
  // wer später wieder öffnet, sieht: abgegeben – samt Lösungen
  const d = await connect(room, ctx);
  const init = d.take()[0];
  assert.deepEqual(init.m.sub, { receivedAt, at: ctx.data.get("m").sub.at, gone: false }); assert.equal("attempt" in init.m.sub, false);
  assert.equal(init.st.sol.ver, 2); assert.equal(init.st.a0.ver, 1);
  assert.equal((await (await room.fetch(new Request("https://live/info"))).json()).submitted, true);
});

test("Abgabe von einer neuen Verbindung (kurz getrennt) zählt, wenn D1 sie kennt; ohne Datenbank genügt die Zusage; vor der Abgabe keine Lösungen", async () => {
  const state = dbState();
  let r = await newRoom({ env: { DB: fakeDb(state) } });
  let a = await connect(r.room, r.ctx); a.take();
  assert.deepEqual(await a.send({ t: "set", k: "sol", v: val("zu früh") }), [{ t: "deny", k: "sol", why: "nosub" }]);
  const attempt = "fedcba9876543210", receivedAt = 1_799_999_000_000;
  // Nachfrage ohne Abgabe („Hat schon jemand abgegeben?“): nosub, nichts ändert sich
  assert.deepEqual(await a.send({ t: "sub", attempt }), [{ t: "deny", sub: true, why: "nosub" }]);
  state.subs.push({ attempt, receivedAt });
  const done = await a.send({ t: "sub", attempt });   // ohne Zusage, ohne Eingang, ohne Lösungen: die Datenbank entscheidet
  assert.equal(done[0].t, "sub"); assert.equal(done[0].sub.receivedAt, receivedAt); assert.equal(done[0].sol, null);
  assert.equal(r.ctx.data.has("k:sol"), false); assert.deepEqual({ ...r.ctx.data.get("m").sub, at: 0 }, { attempt, receivedAt, at: 0 });
  // Datenbank nicht erreichbar: ohne Zusage abgelehnt, mit Zusage und gemeldetem Eingang angenommen
  state.fail = true;
  r = await newRoom({ env: { DB: fakeDb(state) } });
  a = await connect(r.room, r.ctx); a.take();
  assert.deepEqual(await a.send({ t: "sub", attempt, receivedAt }), [{ t: "deny", sub: true, why: "noclaim" }]);
  await a.send({ t: "claimsub" });
  assert.deepEqual(await a.send({ t: "sub", attempt }), [{ t: "deny", sub: true, why: "noclaim" }]);
  const viaClaim = await a.send({ t: "sub", attempt, receivedAt });
  assert.equal(viaClaim[0].t, "sub"); assert.equal(viaClaim[0].sub.receivedAt, receivedAt);
  // ohne env.DB (reiner Protokolltest): ebenso
  r = await newRoom();
  a = await connect(r.room, r.ctx); a.take();
  assert.equal((await a.send({ t: "sub", attempt, receivedAt }))[0].why, "noclaim");
});

test("Schutz: kaputte Nachrichten trennen (4400), zu große (4413), Dauerfeuer (4429); ein Speicherfehler kostet nichts", async (t) => {
  mock.timers.enable({ apis: ["Date"], now: 1_800_000_000_000 });
  t.after(() => mock.timers.reset());
  const { room, ctx } = await newRoom();
  let a = await connect(room, ctx); a.take();
  await a.send("kein json"); assert.equal(a.closed.code, CLOSE.bad);
  a = await connect(room, ctx); a.take();
  await a.send("[1]"); assert.equal(a.closed.code, CLOSE.bad);
  a = await connect(room, ctx); a.take();
  await room.webSocketMessage(a.server, new ArrayBuffer(4)); assert.equal(a.closed.code, CLOSE.bad);
  a = await connect(room, ctx); a.take();
  await a.send("x".repeat(LIVE.msgBytes + 1)); assert.equal(a.closed.code, CLOSE.big);
  // Speicherfehler (z. B. Tagesgrenze): deny „error“, die Verbindung bleibt, nichts gespeichert
  a = await connect(room, ctx); a.take();
  ctx.failPut = "Exceeded allowed rows written";
  assert.deepEqual(await a.send({ t: "set", k: "a0", v: val("x") }), [{ t: "deny", why: "error" }]);
  assert.equal(a.closed, null); assert.equal(ctx.data.has("k:a0"), false);
  ctx.failPut = null;
  assert.deepEqual(await a.send({ t: "set", k: "a0", v: val("x") }), [{ t: "ack", k: "a0", ver: 1 }]);
  // Dauerfeuer: mehr als 150 Änderungen/Vorschauen in einer Minute → getrennt; in der nächsten Minute zählt es neu
  for (let i = 0; i < LIVE.setsPerMin - 2; i++) await a.send({ t: "pv", k: "a0", v: val("x" + i) });
  assert.equal(a.closed, null);
  mock.timers.tick(61e3);
  for (let i = 0; i < LIVE.setsPerMin; i++) await a.send({ t: "pv", k: "a0", v: val("y" + i) });
  assert.equal(a.closed, null);
  await a.send({ t: "set", k: "a0", v: val("z") });
  assert.equal(a.closed.code, CLOSE.flood);
});

test("„zuletzt geändert“ wird höchstens alle 10 Minuten fortgeschrieben (Schreibgrenze): je Änderung sonst genau ein Eintrag", async (t) => {
  mock.timers.enable({ apis: ["Date"], now: 1_800_000_000_000 });
  t.after(() => mock.timers.reset());
  const { room, ctx } = await newRoom();
  const a = await connect(room, ctx); a.take();
  let w = ctx.writes;
  for (let i = 1; i <= 5; i++) await a.send({ t: "set", k: "a0", v: val("v" + i), base: i - 1 });
  assert.equal(ctx.writes - w, 5);
  mock.timers.tick(LIVE.touchMs + 1); w = ctx.writes;
  await a.send({ t: "set", k: "a0", v: val("später"), base: 5 });
  assert.equal(ctx.writes - w, 2); assert.equal(ctx.data.get("t"), Date.now());
  await a.send({ t: "lock", k: "a1" }); await a.send({ t: "unlock", k: "a1" }); await a.send({ t: "claim", ks: ["f1"] }); await a.send({ t: "release", ks: ["f1"] });
  assert.equal(ctx.writes - w, 2, "Sperren und Zusagen schreiben nichts in den Speicher");
});

test("Aufräumen (Wecker): 30 Tage ohne Änderung → alles weg; Blatt gelöscht → alles weg; Abgabe gelöscht → Lösungen weg, Vermerk bleibt", async (t) => {
  mock.timers.enable({ apis: ["Date"], now: 1_800_000_000_000 });
  t.after(() => mock.timers.reset());
  const day = 86400e3;
  // ohne Abgabe: vor Ablauf wird der Wecker nur neu gestellt, danach ist der Raum leer und aus dem Verzeichnis ausgetragen
  let state = dbState();
  let { room, ctx } = await newRoom({ env: { DB: fakeDb(state) } });
  const a = await connect(room, ctx); a.take();
  mock.timers.tick(20 * day);
  await a.send({ t: "set", k: "a0", v: val("Tag 20") });
  mock.timers.tick(11 * day);   // Tag 31 nach dem Anlegen, 11 Tage nach der letzten Änderung
  await room.alarm();
  assert.equal(ctx.data.has("m"), true); assert.equal(ctx.alarm, ctx.data.get("t") + 30 * day + 3600e3);
  mock.timers.tick(20 * day);
  await room.alarm();
  assert.equal(ctx.data.size, 0); assert.equal(ctx.alarm, null); assert.deepEqual(state.registryDeleted, ["r".repeat(64)]);
  assert.equal(a.closed.code, CLOSE.gone);
  const late = await connect(room, ctx); assert.equal(late.closed.code, CLOSE.gone);
  await room.alarm();   // Wecker ohne Raum: nichts
  // Blatt gelöscht
  state = dbState();
  ({ room, ctx } = await newRoom({ env: { DB: fakeDb(state) } }));
  state.sheet = false;
  await room.alarm();
  assert.equal(ctx.data.size, 0); assert.deepEqual(state.registryDeleted, ["r".repeat(64)]);
  // Datenbank nicht erreichbar: nichts löschen
  state = dbState({ fail: true });
  ({ room, ctx } = await newRoom({ env: { DB: fakeDb(state) } }));
  await room.alarm();
  assert.equal(ctx.data.has("m"), true);
  // nach der Abgabe: solange es sie gibt, bleiben die Lösungen (täglich geprüft); mit der Löschfrist verschwinden sie
  const attempt = "00112233445566ff", receivedAt = Date.now();
  state = dbState({ subs: [{ attempt, receivedAt }] });
  ({ room, ctx } = await newRoom({ env: { DB: fakeDb(state) } }));
  const b = await connect(room, ctx); b.take();
  await b.send({ t: "sub", attempt, receivedAt, sol: val("Lösungen") });
  await b.close();
  mock.timers.tick(day);
  await room.alarm();
  assert.equal(ctx.data.has("k:sol"), true); assert.equal(ctx.alarm, Date.now() + day);
  mock.timers.tick(40 * day);   // länger als 30 Tage ohne Änderung: ein abgegebener Raum bleibt (der Vermerk gehört zum Blatt)
  await room.alarm();
  assert.equal(ctx.data.has("k:sol"), true);
  state.subs = [];
  await room.alarm();
  assert.equal(ctx.data.has("k:sol"), false); assert.equal(ctx.data.get("m").sub.gone, true); assert.equal(ctx.alarm, Date.now() + 30 * day);
  const c = await connect(room, ctx);
  const init = c.take()[0];
  assert.deepEqual(init.m.sub, { receivedAt, at: ctx.data.get("m").sub.at, gone: true }); assert.equal("sol" in init.st, false);
  assert.deepEqual(await c.send({ t: "set", k: "sol", v: val("wieder da") }), [{ t: "deny", k: "sol", why: "nosub" }]);
  // dasselbe beim Verbinden (ohne auf den Wecker zu warten); kurz nach der Abgabe wird nicht nachgesehen
  state = dbState({ subs: [{ attempt, receivedAt: Date.now() }] });
  ({ room, ctx } = await newRoom({ env: { DB: fakeDb(state) } }));
  const d = await connect(room, ctx); d.take();
  await d.send({ t: "sub", attempt, receivedAt: Date.now(), sol: val("Lösungen") });
  state.subs = []; state.sql.length = 0;
  let e = await connect(room, ctx);
  assert.equal(e.take()[0].st.sol.ver, 1); assert.equal(state.sql.length, 0);
  mock.timers.tick(61e3);
  e = await connect(room, ctx);
  assert.equal(e.take()[0].m.sub.gone, true); assert.equal(ctx.data.has("k:sol"), false);
  // Blatt weg, während jemand verbinden will: Raum leer, 4404
  state.sheet = false;
  ({ room, ctx } = await newRoom({ env: { DB: fakeDb(state) } }));
  const f = await connect(room, ctx); f.take();
  state.subs = [{ attempt, receivedAt: Date.now() }];
  await f.send({ t: "sub", attempt, receivedAt: Date.now() });
  mock.timers.tick(61e3);
  const g = await connect(room, ctx);
  assert.equal(g.closed.code, CLOSE.gone); assert.equal(ctx.data.size, 0);
});

test("/wipe (Blatt gelöscht): Raum leer, Verbindungen mit 4404 getrennt", async () => {
  const { room, ctx } = await newRoom();
  const a = await connect(room, ctx); a.take();
  await a.send({ t: "set", k: "a0", v: val("x") });
  assert.equal((await post(room, "/wipe")).status, 200);
  assert.equal(ctx.data.size, 0); assert.equal(a.closed.code, CLOSE.gone);
  assert.equal((await room.fetch(new Request("https://live/info"))).status, 404);
  // danach lässt sich derselbe Raum (dasselbe Zugangswort) neu anlegen
  assert.equal((await post(room, "/init", { code: "K7QM4X", rid: "r".repeat(64), n: 2, meta: META })).status, 200);
});
