// env.mjs – gemeinsame Konstanten der Browser-Tests (Ports, Pfade).
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const E2E_PORT = Number(process.env.E2E_PORT || 8787);
export const MOCK_PORT = Number(process.env.E2E_MOCK_PORT || 8790);
export const E2E_STATE = join(ROOT, ".wrangler", "e2e");
export const BASE_URL = "http://127.0.0.1:" + E2E_PORT;
export const MOCK_URL = "http://127.0.0.1:" + MOCK_PORT;
