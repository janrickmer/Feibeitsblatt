// serve.mjs – Start-Hilfe für die Browser-Tests (webServer in playwright.config.mjs): frischer Zustand in .wrangler/e2e,
// Build nach dist/, dann `wrangler dev --local` auf 127.0.0.1:8787 mit zufälligem SETTINGS_SECRET (wie im Betrieb:
// der KI-Schlüssel liegt verschlüsselt in D1). Playwright beendet die ganze Prozessgruppe am Ende.
import { spawn, spawnSync } from "node:child_process";
import { rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { E2E_PORT, E2E_STATE, ROOT } from "./env.mjs";

rmSync(E2E_STATE, { recursive: true, force: true });
mkdirSync(E2E_STATE, { recursive: true });

const build = spawnSync(process.execPath, ["scripts/build.mjs"], { cwd: ROOT, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status || 1);

const wrangler = spawn(join(ROOT, "node_modules", ".bin", "wrangler"), ["dev", "--local", "--ip", "127.0.0.1", "--port", String(E2E_PORT),
  "--persist-to", E2E_STATE, "--show-interactive-dev-session=false",
  "--var", "SETTINGS_SECRET:" + randomBytes(32).toString("base64")],
{ cwd: ROOT, stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" } });

const stop = (sig) => { try { wrangler.kill(sig); } catch {} };
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));
wrangler.on("exit", (code, sig) => process.exit(code ?? (sig ? 1 : 0)));
