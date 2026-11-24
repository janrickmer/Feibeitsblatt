// Nachbau der Laufzeit eines Durable Objects für Tests ohne workerd: Speicher (Map), Wecker, WebSocket-Paare mit Anhang
// (serializeAttachment) und ein Namensraum wie env.LIVE. Der Raum selbst ist die echte Klasse aus worker/live.js – nur die
// 101-Antwort wird ersetzt (Node erlaubt den Status 101 in `new Response` nicht).
import { LiveRoom } from "../worker/live.js";

class FakeSocket {
  constructor() { this.peer = null; this.got = []; this.closed = null; this.att = null; this.onServerClose = null; this.accepted = false; }
  accept() { this.accepted = true; }
  send(data) { if (this.closed) throw new Error("socket closed"); this.peer.got.push(typeof data === "string" && data[0] === "{" ? JSON.parse(data) : data); }
  close(code, reason) {
    if (this.closed) return;
    this.closed = { code, reason };
    if (this.peer && !this.peer.closed) this.peer.closed = { code, reason };
    if (this.onServerClose) this.onServerClose();
  }
  serializeAttachment(v) { this.att = structuredClone(v); }
  deserializeAttachment() { return this.att == null ? null : structuredClone(this.att); }
}
export function installWebSocketPair() {
  globalThis.WebSocketPair = class { constructor() { const a = new FakeSocket(), b = new FakeSocket(); a.peer = b; b.peer = a; this[0] = a; this[1] = b; } };
}

export function fakeRoomCtx() {
  const data = new Map(), socks = [];
  const ctx = {
    data, socks, alarm: null, writes: 0, failPut: null,
    storage: {
      async get(k) { if (Array.isArray(k)) { const m = new Map(); for (const x of k) if (data.has(x)) m.set(x, structuredClone(data.get(x))); return m; } return data.has(k) ? structuredClone(data.get(k)) : undefined; },
      async put(k, v) {
        if (ctx.failPut) throw new Error(ctx.failPut);
        if (typeof k === "string") { data.set(k, structuredClone(v)); ctx.writes++; }
        else for (const [a, b] of Object.entries(k)) { data.set(a, structuredClone(b)); ctx.writes++; }
      },
      async delete(k) { return data.delete(k); },
      async deleteAll() { data.clear(); },
      async list({ prefix = "" } = {}) { return new Map([...data].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, structuredClone(v)])); },
      async setAlarm(t) { ctx.alarm = t; },
      async getAlarm() { return ctx.alarm; },
      async deleteAlarm() { ctx.alarm = null; },
    },
    acceptWebSocket(ws) { ws.hib = true; socks.push(ws); ws.onServerClose = () => { const i = socks.indexOf(ws); if (i >= 0) socks.splice(i, 1); }; },
    getWebSockets() { return socks.filter((w) => !w.closed || w.closing); },
    setWebSocketAutoResponse() {},
  };
  return ctx;
}
class TestRoom extends LiveRoom {
  upgradeResponse(client) { return { status: 101, ok: false, webSocket: client, headers: new Headers(), text: async () => "" }; }
}
export function makeRoom(env) { const ctx = fakeRoomCtx(); return { ctx, room: new TestRoom(ctx, env || {}) }; }

// Verbindung eines Geräts: send() liefert die Nachricht wie die Laufzeit an webSocketMessage, close() an webSocketClose
export async function connect(room, ctx) {
  const res = await room.fetch(new Request("https://live/ws", { headers: { Upgrade: "websocket" } }));
  const client = res.webSocket, server = client.peer;
  const dev = {
    res, client, server, got: client.got,
    get closed() { return client.closed; },
    take() { const all = client.got.splice(0); return all; },
    async send(msg) { await room.webSocketMessage(server, typeof msg === "string" ? msg : JSON.stringify(msg)); return dev.take(); },
    async close(code = 1000) {
      if (server.closed) return;
      server.closing = true; client.closed = { code };     // während webSocketClose ist die Verbindung noch in getWebSockets()
      server.closed = { code };
      await room.webSocketClose(server, code);
      server.closing = false;
      const i = ctx.socks.indexOf(server); if (i >= 0) ctx.socks.splice(i, 1);
    },
  };
  return dev;
}

// env.LIVE: Namensraum mit idFromName/get (und jurisdiction wie in der echten Laufzeit); rooms = Name → {room, ctx}
export function fakeLiveNamespace(envOf, { jurisdiction = true } = {}) {
  const rooms = new Map();
  const ns = {
    rooms, fail: null, calls: [],
    idFromName: (name) => ({ name }),
    get: (id) => ({
      fetch: async (req) => {
        ns.calls.push(new URL(req.url).pathname);
        if (ns.fail) throw new Error(ns.fail);
        let r = rooms.get(id.name);
        if (!r) { r = makeRoom(envOf()); rooms.set(id.name, r); }
        return r.room.fetch(req);
      },
    }),
  };
  if (jurisdiction) { ns.jurisdictions = []; ns.jurisdiction = (j) => { ns.jurisdictions.push(j); return ns; }; }
  return ns;
}
