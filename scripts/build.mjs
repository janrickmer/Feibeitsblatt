// build.mjs – kopiert die statische Seite nach dist/ (Workers Static Assets). Keine Abhängigkeiten.
// Fehlt index.html noch (Entwicklung), entsteht nur in dist/ ein Platzhalter – nie im Repository.
import { mkdir, rm, copyFile, writeFile, stat } from "node:fs/promises";
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

const src = join(root, "index.html");
if (existsSync(src)) await copyFile(src, join(dist, "index.html"));
else { await writeFile(join(dist, "index.html"), PLACEHOLDER); console.warn("Hinweis: index.html fehlt – Platzhalter in dist/ erzeugt."); }

if (!existsSync(join(root, "_headers"))) throw new Error("_headers fehlt");
await copyFile(join(root, "_headers"), join(dist, "_headers"));

for (const f of ["index.html", "_headers"]) console.log("dist/" + f + " (" + (await stat(join(dist, f))).size + " Bytes)");
