// mock-ai.mjs – OpenAI-kompatibler Test-Server für das KI-Feedback (nur lokal, deterministisch, ohne Abhängigkeiten).
//
// CLI:    node test/mock-ai.mjs --port 8812 [--mode ok]      (oder MOCK_AI_PORT / MOCK_AI_MODE / MOCK_AI_DELAY_MS)
// Modul:  const mock = await startMockAI({ port: 8812 }); … mock.setMode("429"); … await mock.close();
// Worker: KI-Anbieter „custom“, baseUrl http://127.0.0.1:<port>/v1, beliebiger API-Schlüssel („bad“ → HTTP 401).
//
// Feedback-Regel: Ein Kernpunkt (Zeile/Stichpunkt der Musterlösung) gilt als „angesprochen“, wenn die Antwort sein
// erstes bedeutungstragendes Wort (≥ 4 Buchstaben, kein Füllwort) enthält – ohne Groß-/Kleinschreibung; sonst „fehlt“.
//
// Modi (MOCK_AI_MODE, POST /__mock/mode {"mode","delayMs"}):
//   ok (Vorgabe) · fenced (<think> + ```json-Zaun) · badjson · 429 (Tageslimit, hart) · 429soft (RPM, Retry-After 1 s)
//   500 · 401 · slow (Verzögerung delayMs, Vorgabe 5000) · reasoning400 (400, wenn reasoning_effort/reasoning gesendet)
// Hilfsrouten: GET /__mock/state → {mode, delayMs, count, requests:[{model, messages, …}]}, POST /__mock/reset
import http from "node:http";
import { pathToFileURL } from "node:url";

export const MOCK_MODELS = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "qwen/qwen3-32b", "whisper-large-v3"];
export const MODES = ["ok", "fenced", "badjson", "429", "429soft", "500", "401", "slow", "reasoning400"];

const STOP = new Set(("aber alle allem allen aller alles also auch auf aus bei beim bzw dabei damit dann dass dein deine dem den denn der " +
  "des dessen die dies diese diesem diesen dieser dieses doch dort durch ein eine einem einen einer eines etwa euer für gegen hat " +
  "hatte hier ihre ihren immer indem ist jede jedem jeden jeder jedes kann kein keine können mehr mit muss nach nicht noch nur " +
  "oder ohne sehr sein seine sich sie sind soll sollte über und uns unter viel vom von vor wann war waren warum was weil welche " +
  "wenn wer werden wie wird wurde wurden zum zur zwischen the and with from that this").split(" "));

/* ---------- Prompt lesen (Format aus worker/ai.js buildFeedbackMessages) ---------- */
export function parseFeedbackPrompt(text) {
  const parts = String(text || "").split(/^### Aufgabe (\d+)[ \t]*$/m);
  const out = [];
  for (let i = 1; i < parts.length; i += 2) {
    const blocks = [...parts[i + 1].matchAll(/<<<\n([\s\S]*?)\n?>>>/g)].map((m) => m[1]);
    out.push({ nr: Number(parts[i]), task: blocks[0] || "", solution: blocks[1] || "", answer: blocks[2] || "" });
  }
  return out;
}
export function keypointsOf(solution) {
  let lines = String(solution).split(/\n+/).map((l) => l.replace(/^\s*(?:[-–•*·]+|\d{1,2}[.)])\s*/, "").trim()).filter(Boolean);
  if (lines.length === 1) lines = lines[0].split(/(?<=[.!?;])\s+/).map((s) => s.trim()).filter(Boolean);
  return lines.map((l) => l.replace(/[.;]+$/, "")).slice(0, 8);
}
export function firstSignificantWord(point) {
  const words = String(point).match(/[\p{L}\p{N}]+/gu) || [];
  return words.find((w) => w.length >= 4 && !STOP.has(w.toLowerCase())) || words[0] || "";
}
export function mockFeedback(blocks) {
  return {
    aufgaben: blocks.map((b) => {
      const answer = b.answer.toLowerCase(), angesprochen = [], fehlt = [];
      for (const p of keypointsOf(b.solution)) {
        const w = firstSignificantWord(p).toLowerCase();
        (w && answer.includes(w) ? angesprochen : fehlt).push(p);
      }
      return { nr: b.nr, angesprochen, fehlt };
    }),
  };
}
// Erwartetes Ergebnis für Tests: tasks [{text, solution}], answers [string] → results wie /api/feedback
export function expectedResults(tasks, answers) {
  return tasks.map((t, i) => {
    if (!String(t.solution || "").trim()) return { covered: [], missing: [], note: "Zu dieser Aufgabe gibt es keine Musterlösung." };
    const fb = mockFeedback([{ nr: i + 1, solution: String(t.solution).trim(), answer: String(answers[i] || "").trim() }]).aufgaben[0];
    return { covered: fb.angesprochen, missing: fb.fehlt };
  });
}

/* ---------- Server ---------- */
const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};
const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = []; req.on("data", (c) => chunks.push(c)); req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8"))); req.on("error", reject);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createMockAI({ mode = process.env.MOCK_AI_MODE || "ok", delayMs = Number(process.env.MOCK_AI_DELAY_MS) || 0 } = {}) {
  const state = { mode, delayMs, requests: [] };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://x");
      const path = url.pathname.replace(/\/+$/, "");
      if (path === "/__mock/state" && req.method === "GET") return send(res, 200, { mode: state.mode, delayMs: state.delayMs, count: state.requests.length, requests: state.requests });
      if (path === "/__mock/reset" && req.method === "POST") { state.requests = []; return send(res, 200, { ok: true }); }
      if (path === "/__mock/mode" && req.method === "POST") {
        const b = JSON.parse((await readBody(req)) || "{}");
        if (b.mode) state.mode = String(b.mode);
        if (b.delayMs != null) state.delayMs = Number(b.delayMs) || 0;
        return send(res, 200, { ok: true, mode: state.mode, delayMs: state.delayMs });
      }
      const key = (/^Bearer\s+(.+)$/i.exec(req.headers.authorization || "") || [])[1] || "";
      if (!key || key === "bad" || state.mode === "401") return send(res, 401, { error: { message: "Invalid API Key", type: "invalid_request_error", code: "invalid_api_key" } });

      if (path === "/v1/models" && req.method === "GET")
        return send(res, 200, { object: "list", data: MOCK_MODELS.map((id) => ({ id, object: "model", owned_by: "mock" })) });

      if (path === "/v1/chat/completions" && req.method === "POST") {
        const body = JSON.parse((await readBody(req)) || "{}");
        const messages = Array.isArray(body.messages) ? body.messages : [];
        state.requests.push({ model: body.model, messages, response_format: body.response_format, temperature: body.temperature,
          reasoning_effort: body.reasoning_effort, reasoning: body.reasoning, at: Date.now() });
        if (state.mode === "slow") await sleep(state.delayMs || 5000);
        else if (state.delayMs) await sleep(state.delayMs);
        if (state.mode === "429") return send(res, 429, { error: { message: "Rate limit reached for model `" + body.model + "` on tokens per day (TPD): Limit 200000, Used 200000. Please try again in 7m12s.", type: "tokens", code: "rate_limit_exceeded" } });
        if (state.mode === "429soft") return send(res, 429, { error: { message: "Rate limit reached on requests per minute (RPM): Limit 30. Please try again in 1s.", type: "requests" } }, { "retry-after": "1" });
        if (state.mode === "500") return send(res, 500, { error: { message: "Internal server error" } });
        if (state.mode === "reasoning400" && (body.reasoning_effort != null || body.reasoning != null))
          return send(res, 400, { error: { message: "property 'reasoning_effort' is unsupported for this model", type: "invalid_request_error" } });
        const user = messages.filter((m) => m && m.role === "user").map((m) => String(m.content || "")).join("\n");
        const blocks = parseFeedbackPrompt(user);
        let content = blocks.length ? JSON.stringify(mockFeedback(blocks)) : JSON.stringify({ ok: true, antwort: "Verbindung steht." });
        if (state.mode === "fenced") content = "<think>Ich prüfe die Kernpunkte.</think>\n```json\n" + content + "\n```";
        if (state.mode === "badjson") content = "Das ist leider kein JSON.";
        return send(res, 200, { id: "mock-" + state.requests.length, object: "chat.completion", created: Math.floor(Date.now() / 1000), model: body.model || "mock",
          choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
      }
      return send(res, 404, { error: { message: "Not found: " + path, code: 404 } });
    } catch (e) {
      return send(res, 500, { error: { message: "Mock-Fehler: " + (e && e.message) } });
    }
  });
  return { server, state };
}

export async function startMockAI({ port = 0, host = "127.0.0.1", ...opts } = {}) {
  const { server, state } = createMockAI(opts);
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, host, resolve); });
  const p = server.address().port;
  return {
    server, state, port: p, url: "http://" + host + ":" + p + "/v1",
    setMode(mode, delayMs) { state.mode = mode; if (delayMs != null) state.delayMs = delayMs; },
    reset() { state.requests = []; },
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (name) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : undefined; };
  const port = Number(arg("port") || process.env.MOCK_AI_PORT || 8812);
  const mock = await startMockAI({ port, mode: arg("mode") || process.env.MOCK_AI_MODE || "ok" });
  console.log("Mock-KI läuft auf " + mock.url + " (Modus " + mock.state.mode + ")");
  const stop = () => mock.close().then(() => process.exit(0));
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
}
