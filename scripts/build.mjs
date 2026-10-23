// build.mjs – kopiert die statische Seite nach dist/ (Workers Static Assets, mit Kennzeichen der Worker-Kopie). Keine Abhängigkeiten.
// Fehlt index.html noch (Entwicklung), entsteht nur in dist/ ein Platzhalter – nie im Repository.
import { mkdir, rm, copyFile, readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

const PLACEHOLDER = `<!doctype html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Feibeitsblatt</title></head>
<body><main><h1>Feibeitsblatt</h1><p>Platzhalter: Die Datei index.html fehlt noch im Repository.</p></main></body>
</html>
`;

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

// Kennzeichen der vom Worker ausgelieferten Kopie (direkt hinter <meta charset>, also vor dem Skript ganz oben): Die Seite ruft die API
// dann immer über die gleiche Herkunft auf – auch unter einer eigenen Domain direkt am Worker – und nennt GitHub nicht als Empfänger.
// Die Kopie auf GitHub Pages (Repository-Wurzel) hat es nicht und ruft den Worker unter window.FEIBEITSBLATT_WORKER auf.
const HOST_MARK = '<meta name="feibeitsblatt-host" content="worker">';
const CHARSET = '<meta charset="utf-8">';
const src = join(root, "index.html");
if (existsSync(src)) {
  const html = await readFile(src, "utf8");
  if (html.split(CHARSET).length !== 2) throw new Error("index.html: genau ein " + CHARSET + " erwartet (dahinter steht das Kennzeichen der Worker-Kopie)");
  await writeFile(join(dist, "index.html"), html.replace(CHARSET, CHARSET + "\n" + HOST_MARK));
} else { await writeFile(join(dist, "index.html"), PLACEHOLDER); console.warn("Hinweis: index.html fehlt – Platzhalter in dist/ erzeugt."); }

if (!existsSync(join(root, "_headers"))) throw new Error("_headers fehlt");
await copyFile(join(root, "_headers"), join(dist, "_headers"));

for (const f of ["index.html", "_headers"]) console.log("dist/" + f + " (" + (await stat(join(dist, f))).size + " Bytes)");
