import express from "express";
import helmet from "helmet";
import axios from "axios";
import dotenv from "dotenv";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// 🔧 Sanitize & validate env vars (trailing spaces/newlines are a common culprit)
const WEBHOOK_URL = (process.env.WEBHOOK_URL || "").trim();
const API_KEY = (process.env.API_KEY || "").trim();
const PORT = process.env.PORT || 3000;

if (!WEBHOOK_URL || !API_KEY) {
  console.error("Missing WEBHOOK_URL or API_KEY in environment.");
  process.exit(1);
}

// Log masked config at startup (helps catch wrong region/UUID instantly)
try {
  const u = new URL(WEBHOOK_URL);
  const maskedPath =
    u.pathname.length > 14 ? `${u.pathname.slice(0, 14)}…` : u.pathname;
  console.log(
    `[webhook] host=${u.host} path=${maskedPath} keyLen=${API_KEY.length}`
  );
} catch {
  console.warn("WEBHOOK_URL is not a valid URL");
}

// --- simple persistence of last pushed name (ephemeral across redeploys) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = process.env.DATA_PATH || path.join(__dirname, "data", "state.json");
let state = { lastName: null, updatedAt: null };

async function loadState() {
  try { state = JSON.parse(await fs.readFile(DATA_PATH, "utf8")); } catch {}
}
async function saveState() {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(state), "utf8");
}

// 💥 Stronger error surfacing + axios timeout
const axiosCfg = {
  headers: { "X-API-Key": API_KEY, "Content-Type": "application/json" },
  timeout: 10000
};

app.post("/submit-name", async (req, res) => {
  try {
    const name = (req.body.name || "").trim().slice(0, 120);
    if (!name) return res.status(400).json({ ok: false, error: "Name is required." });

    const payload = {
      items: [
        {
          content: {
            title: { content: `Welcome, ${name}!` },
            body:  { content: `Say hi to ${name} 👋` }
          }
        }
      ]
    };

    const r = await axios.post(WEBHOOK_URL, payload, axiosCfg);

    state.lastName = name;
    state.updatedAt = new Date().toISOString();
    await saveState();

    return res.json({ ok: true, status: r.status, data: r.data });
  } catch (err) {
    const status = err?.response?.status || 500;
    const details = err?.response?.data || err.message;
    console.error("Webhook error:", status, details);
    return res.status(status).json({ ok: false, error: "Failed to post to ScreenCloud Webhooks.", status, details });
  }
});

app.get("/current", (_req, res) => {
  res.json({ lastName: state.lastName, updatedAt: state.updatedAt });
});

// 🔎 Diagnostics (does NOT reveal secrets)
app.get("/diag", (_req, res) => {
  let host = null, path = null, valid = true;
  try { const u = new URL(WEBHOOK_URL); host = u.host; path = u.pathname; } catch { valid = false; }
  res.json({
    ok: true,
    webhook: { host, pathLength: path ? path.length : 0, valid },
    apiKey: { length: API_KEY.length },
  });
});

// ▶️ Self-test: posts a known payload via the same code path
app.post("/self-test", async (_req, res) => {
  try {
    const payload = {
      items: [
        {
          content: {
            title: { content: "Railway self-test" },
            body:  { content: "If you see this on screen, the app is wired correctly." }
          }
        }
      ]
    };
    const r = await axios.post(WEBHOOK_URL, payload, axiosCfg);
    return res.json({ ok: true, status: r.status, data: r.data });
  } catch (err) {
    const status = err?.response?.status || 500;
    const details = err?.response?.data || err.message;
    console.error("Self-test error:", status, details);
    return res.status(status).json({ ok: false, error: "Self-test failed.", status, details });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

loadState().finally(() => {
  app.listen(PORT, () => console.log(`App running on http://localhost:${PORT}`));
});
