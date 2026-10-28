// video.test.mjs – YouTube-Videos unter dem Material: die reinen Hilfsfunktionen aus index.html (Block VIDEO:BEGIN … VIDEO:END)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const i = html.indexOf("/* VIDEO:BEGIN"), j = html.indexOf("/* VIDEO:END */");
const { YT_ID_RE, VIDEO_LIMITS, YT_CONSENT, parseYouTube, cleanVideos, youtubeUrl, youtubeEmbedUrl, fmtVideoStart, videoTitle } =
  new Function(html.slice(i, j) + "\nreturn { YT_ID_RE, VIDEO_LIMITS, YT_CONSENT, parseYouTube, cleanVideos, youtubeUrl, youtubeEmbedUrl, fmtVideoStart, videoTitle };")();

const OTHER = "Das ist kein Link zu einem YouTube-Video. Erlaubt sind Links von youtube.com und youtu.be, z. B. https://www.youtube.com/watch?v=…";
const PLAYLIST = "Playlists lassen sich nicht einbetten – bitte den Link eines einzelnen Videos eingeben.";
const EMPTY = "Bitte den Link des YouTube-Videos eingeben.";

test("video: Block in index.html gefunden, ohne Abhängigkeiten, einmal vorhanden", () => {
  assert.ok(i > 0 && j > i);
  assert.equal(html.indexOf("/* VIDEO:BEGIN", i + 1), -1);
  assert.ok(j < html.indexOf("/* WORLDMAP:BEGIN"));
});

test("video: Grenzen wie LIMITS im Worker (worker/lib.js)", async () => {
  assert.deepEqual(VIDEO_LIMITS, { perTask: 3, title: 120, start: 86400 });
  const lib = await import("../../worker/lib.js");
  if (lib.LIMITS.videosPerTask === undefined) return;   // Worker noch ohne Videos: nichts zu vergleichen
  assert.equal(lib.LIMITS.videosPerTask, VIDEO_LIMITS.perTask);
  assert.equal(lib.LIMITS.videoTitle, VIDEO_LIMITS.title);
  assert.equal(lib.LIMITS.videoStart, VIDEO_LIMITS.start);
  if (lib.VIDEO_ID_RE) assert.equal(lib.VIDEO_ID_RE.source, YT_ID_RE.source);
});

test("video: Zustimmungstext wörtlich (du-Form, Google, IP-Adresse, Cookies, USA)", () => {
  assert.equal(YT_CONSENT, "Erst nach diesem Klick wird das Video von YouTube (Google) geladen. Dabei erhält Google unter anderem deine IP-Adresse und kann Cookies setzen; Daten können in die USA gelangen.");
});

test("video: parseYouTube nimmt die üblichen Links an – nur Kennung und Startzeit", () => {
  const ok = [
    ["https://youtu.be/M7lc1UVf-VE?si=TRACKING&t=1m30s", "M7lc1UVf-VE", 90],
    ["youtu.be/M7lc1UVf-VE?t=90", "M7lc1UVf-VE", 90],
    ["http://youtu.be/M7lc1UVf-VE", "M7lc1UVf-VE", 0],
    ["www.youtube.com/watch?v=aqz-KE-bpKQ", "aqz-KE-bpKQ", 0],
    ["https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=90s&si=abc&list=PL123&pp=xyz&feature=share", "aqz-KE-bpKQ", 90],
    ["https://youtube.com/watch?feature=share&v=aqz-KE-bpKQ", "aqz-KE-bpKQ", 0],
    ["https://m.youtube.com/watch?v=aqz-KE-bpKQ&t=1h2m3s", "aqz-KE-bpKQ", 3723],
    ["https://WWW.YouTube.com/watch?v=aqz-KE-bpKQ", "aqz-KE-bpKQ", 0],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ", 0],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share", "dQw4w9WgXcQ", 0],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ?start=30", "dQw4w9WgXcQ", 30],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ/", "dQw4w9WgXcQ", 0],
    ["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=45&rel=0", "dQw4w9WgXcQ", 45],
    ["https://youtube-nocookie.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ", 0],
    ["https://www.youtube.com/live/dQw4w9WgXcQ?si=x", "dQw4w9WgXcQ", 0],
    ["https://www.youtube.com/v/dQw4w9WgXcQ", "dQw4w9WgXcQ", 0],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ#t=2m", "dQw4w9WgXcQ", 120],
    ["  https://youtu.be/M7lc1UVf-VE  ", "M7lc1UVf-VE", 0],
    ["https://youtu.be/M7lc1UVf-VE?t=0", "M7lc1UVf-VE", 0],         // 0 = von vorn
    ["https://youtu.be/M7lc1UVf-VE?t=86399", "M7lc1UVf-VE", 86399],
    ["https://youtu.be/M7lc1UVf-VE?t=86400", "M7lc1UVf-VE", 0],     // zu groß: von vorn
    ["https://youtu.be/M7lc1UVf-VE?t=abc", "M7lc1UVf-VE", 0],
    // eingefügter Einbettungscode (nur der src-Wert zählt; &amp; wie im Code von YouTube)
    ['<iframe width="560" height="315" src="https://www.youtube.com/embed/M7lc1UVf-VE?si=abc&amp;start=75" title="YouTube video player" frameborder="0" allowfullscreen></iframe>', "M7lc1UVf-VE", 75],
    ["<iframe src='//www.youtube-nocookie.com/embed/aqz-KE-bpKQ'></iframe>", "aqz-KE-bpKQ", 0],
    ['<IFRAME data-x="1" SRC=https://www.youtube.com/embed/aqz-KE-bpKQ></IFRAME>', "aqz-KE-bpKQ", 0],
  ];
  for (const [input, id, start] of ok) assert.deepEqual(parseYouTube(input), { id, start }, input);
  // Groß-/Kleinschreibung der Kennung bleibt
  assert.equal(parseYouTube("https://youtu.be/AbCdEfGhIjK").id, "AbCdEfGhIjK");
});

test("video: parseYouTube lehnt alles andere mit einer Meldung ab", () => {
  for (const input of ["", "   ", null, undefined]) assert.deepEqual(parseYouTube(input), { error: EMPTY }, String(input));
  const other = [
    "https://example.org/watch?v=M7lc1UVf-VE",
    "https://www.youtube.com.evil.de/watch?v=M7lc1UVf-VE",
    "www.youtube.com.evil.de/watch?v=M7lc1UVf-VE",
    "https://evil.de/?v=M7lc1UVf-VE",
    "https://evilyoutube.com/watch?v=M7lc1UVf-VE",
    "https://music.youtube.com/watch?v=M7lc1UVf-VE",   // nur die genannten Hosts
    "https://youtube.com./watch?v=M7lc1UVf-VE",
    "javascript:alert(1)",
    "JavaScript:alert(document.cookie)",
    "data:text/html,<script>alert(1)</script>",
    "ftp://youtube.com/watch?v=M7lc1UVf-VE",
    "https://user:pw@www.youtube.com/watch?v=M7lc1UVf-VE",
    "https://www.youtube.com:8443/watch?v=M7lc1UVf-VE",
    "https://www.youtube.com/watch?v=M7lc1UVf-V",      // 10 Zeichen
    "https://www.youtube.com/watch?v=M7lc1UVf-VEx",    // 12 Zeichen
    "https://youtu.be/M7lc1UVf-V",
    "https://youtu.be/M7lc1UVf-VE1",
    "https://youtu.be/%00M7lc1UVf-V",
    "https://www.youtube.com/watch?v=../../x?a=",
    "https://www.youtube.com/@kanal",
    "https://www.youtube.com/channel/UCabcdefghijk",
    "https://www.youtube.com/",
    "https://www.youtube.com/watch",
    "https://youtu.be/",
    "https://youtu.be/M7lc1UVf-VE/extra",
    "https://www.youtube.com/embed/",
    "https://www.youtube.com/watch?v=M7lc1UVf-VE with space",
    "M7lc1UVf-VE",                                      // nur die Kennung: kein Link
    "<iframe></iframe>",
    '<iframe src="https://example.org/embed/M7lc1UVf-VE"></iframe>',
    "x".repeat(3000),
  ];
  for (const input of other) assert.deepEqual(parseYouTube(input), { error: OTHER }, input);
  for (const input of ["https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG", "youtube.com/playlist?list=PL1",
    "https://www.youtube.com/watch?list=PL1&index=2", "https://www.youtube.com/embed/videoseries?list=PL1"])
    assert.deepEqual(parseYouTube(input), { error: PLAYLIST }, input);
});

test("video: Adressen immer aus der Kennung auf festen Hosts", () => {
  assert.equal(youtubeUrl({ id: "M7lc1UVf-VE", start: 90 }), "https://www.youtube.com/watch?v=M7lc1UVf-VE&t=90s");
  assert.equal(youtubeUrl({ id: "aqz-KE-bpKQ" }), "https://www.youtube.com/watch?v=aqz-KE-bpKQ");
  assert.equal(youtubeUrl({ id: "aqz-KE-bpKQ", start: 0 }), "https://www.youtube.com/watch?v=aqz-KE-bpKQ");
  assert.equal(youtubeEmbedUrl({ id: "M7lc1UVf-VE", start: 90 }), "https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?autoplay=1&start=90");
  assert.equal(youtubeEmbedUrl({ id: "aqz-KE-bpKQ" }), "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?autoplay=1");
  // eine ungeprüfte Startzeit gelangt nie in die Adresse
  assert.equal(youtubeUrl({ id: "aqz-KE-bpKQ", start: "1;alert(1)" }), "https://www.youtube.com/watch?v=aqz-KE-bpKQ");
  assert.equal(youtubeEmbedUrl({ id: "aqz-KE-bpKQ", start: 1.5 }), "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?autoplay=1");
  // parseYouTube → youtubeUrl: Teilen-Link ohne si= (Kennung der teilenden Person)
  assert.equal(youtubeUrl(parseYouTube("https://youtu.be/M7lc1UVf-VE?si=TRACKING&t=1m30s")), "https://www.youtube.com/watch?v=M7lc1UVf-VE&t=90s");
});

test("video: Startzeit lesbar", () => {
  assert.equal(fmtVideoStart(90), "1:30");
  assert.equal(fmtVideoStart(5), "0:05");
  assert.equal(fmtVideoStart(600), "10:00");
  assert.equal(fmtVideoStart(3723), "1:02:03");
  assert.equal(fmtVideoStart(86399), "23:59:59");
});

test("video: cleanVideos prüft fremde Daten wie videosOut im Worker", () => {
  assert.deepEqual(cleanVideos(undefined), []);
  assert.deepEqual(cleanVideos("x"), []);
  assert.deepEqual(cleanVideos([null, 1, "M7lc1UVf-VE", {}, { id: 42 }]), []);
  assert.deepEqual(cleanVideos([{ id: "M7lc1UVf-VE", start: 90, title: "Fotosynthese", url: "https://evil.de", html: "<b>" }]),
    [{ id: "M7lc1UVf-VE", start: 90, title: "Fotosynthese" }]);
  // ungültige Kennungen fallen weg, ungültige Startzeit = von vorn, Doppelte (Kennung + Startzeit) nur einmal, höchstens 3
  assert.deepEqual(cleanVideos([
    { id: "../../x?a=" }, { id: "javascript:x" }, { id: "M7lc1UVf-V" }, { id: "m7lc1uvf-ve" },
    { id: "M7lc1UVf-VE", start: "1;alert(1)" }, { id: "M7lc1UVf-VE", start: 0 }, { id: "M7lc1UVf-VE", start: 90 },
    { id: "aqz-KE-bpKQ", start: 86400 }, { id: "dQw4w9WgXcQ" },
  ]), [{ id: "m7lc1uvf-ve" }, { id: "M7lc1UVf-VE" }, { id: "M7lc1UVf-VE", start: 90 }]);
  assert.deepEqual(cleanVideos([{ id: "aqz-KE-bpKQ", start: -5 }, { id: "aqz-KE-bpKQ", start: 1.5 }, { id: "aqz-KE-bpKQ", start: 86399 }]),
    [{ id: "aqz-KE-bpKQ" }, { id: "aqz-KE-bpKQ", start: 86399 }]);
  // Titel: einzeilig, ohne Steuer- und Bidi-Zeichen, gekappt; nur Text (kein HTML-Verarbeiten hier – Anzeige per textContent)
  assert.deepEqual(cleanVideos([{ id: "aqz-KE-bpKQ", title: "  Foto\nsynthese\u202e \u0007 " }]), [{ id: "aqz-KE-bpKQ", title: "Foto synthese" }]);
  assert.deepEqual(cleanVideos([{ id: "aqz-KE-bpKQ", title: "<img src=x onerror=alert(1)>" }]), [{ id: "aqz-KE-bpKQ", title: "<img src=x onerror=alert(1)>" }]);
  assert.equal(cleanVideos([{ id: "aqz-KE-bpKQ", title: "x".repeat(5000) }])[0].title.length, 120);
  assert.deepEqual(cleanVideos([{ id: "aqz-KE-bpKQ", title: 42 }, { id: "dQw4w9WgXcQ", title: "   " }]), [{ id: "aqz-KE-bpKQ" }, { id: "dQw4w9WgXcQ" }]);
  const emoji = "a".repeat(119) + "😀";   // kein halbes Ersatzzeichen-Paar am Ende
  assert.equal(videoTitle(emoji), "a".repeat(119));
  // erneut geprüft unverändert (Vorlage, Sicherung)
  const once = cleanVideos([{ id: "M7lc1UVf-VE", start: 90, title: "Titel" }, { id: "aqz-KE-bpKQ" }]);
  assert.deepEqual(cleanVideos(once), once);
});

test("video: Kennungen behalten Groß-/Kleinschreibung (kein toLowerCase)", () => {
  assert.ok(YT_ID_RE.test("M7lc1UVf-VE") && YT_ID_RE.test("aqz-KE-bpKQ") && YT_ID_RE.test("___________"));
  assert.ok(!YT_ID_RE.test("M7lc1UVf-V") && !YT_ID_RE.test("M7lc1UVf-VE1") && !YT_ID_RE.test("M7lc1UVf+VE") && !YT_ID_RE.test("M7lc1UVf VE"));
  assert.deepEqual(cleanVideos([{ id: "AbCdEfGhIjK" }, { id: "abcdefghijk" }]), [{ id: "AbCdEfGhIjK" }, { id: "abcdefghijk" }]);
});

test("video: index.html – CSP erlaubt nur youtube-nocookie als Frame, keine Vorschaubilder", () => {
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html)[1];
  const dir = (name) => (csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(name + " ")) || "");
  assert.equal(dir("frame-src"), "frame-src https://www.youtube-nocookie.com");
  assert.equal(dir("img-src"), "img-src 'self' data: blob:");
  assert.doesNotMatch(html, /https:\/\/i\.ytimg\.com|youtube\.com\/oembed|<link[^>]+rel="(preconnect|dns-prefetch)"/);
});

test("video: index.html – iframe erst nach dem Klick, mit Referrer-Policy, sandbox und Titel; nie innerHTML", () => {
  const a = html.indexOf("function videoBlock("), b = html.indexOf("\n}\n", a);
  assert.ok(a > 0 && b > a);
  const src = html.slice(a, b);
  assert.ok(src.includes('referrerpolicy: "strict-origin-when-cross-origin"'));
  assert.ok(src.includes('sandbox: "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"'));
  assert.ok(src.includes('allow: "autoplay; encrypted-media; picture-in-picture; fullscreen"'));
  assert.ok(src.includes("youtubeEmbedUrl(v)") && src.includes('"YouTube-Video: " + name'));
  assert.ok(src.indexOf('h("iframe"') > src.indexOf('addEventListener("click"'));   // das iframe entsteht im Klick
  assert.doesNotMatch(src, /innerHTML|localStorage|store\.set/);
});
