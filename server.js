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

const { WEBHOOK_URL, API_KEY, PORT = 3000 } = process.env;
if (!WEBHOOK_URL || !API_KEY) {
  console.error("Missing WEBHOOK_URL or API_KEY in environment.");
  process.exit(1);
}

// --- simple persistence for “last pushed” name ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = process.env.DATA_PATH || path.join(__dirname, "data", "state.json");

let state = { lastName: null, updatedAt: null };

async function loadState() {
  try {
    const txt = await fs.readFile(DATA_PATH, "utf8");
    state = JSON.parse(txt);
  } catch (_) {
    // first run or file missing; ignore
  }
}
async function saveState() {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(state), "utf8");
}

// --- API: submit a new name (push to ScreenCloud, then cache locally) ---
app.post("/submit-name", async (req, res) => {
  try {
    const name = (req.body.name || "").trim().slice(0, 120);
    if (!name) return res.status(400).json({ ok: false, error: "Name is required." });

    const payload = {
      items: [
        {
          content: {
            title: { content: `Welcome, ${name}!` },
            body: { content: `Say hi to ${name} 👋` }
          }
        }
      ]
    };

    const headers = { "X-API-Key": API_KEY, "Content-Type": "application/json" };
    const { data } = await axios.post(WEBHOOK_URL, payload, { headers });

    // update local state after a successful push
    state.lastName = name;
    state.updatedAt = new Date().toISOString();
    await saveState();

    return res.json({ ok: true, data });
  } catch (err) {
    console.error(err?.response?.data || err.message);
    return res.status(500).json({ ok: false, error: "Failed to post to ScreenCloud Webhooks." });
  }
});

// --- API: get current (last pushed) name ---
app.get("/current", (_req, res) => {
  res.json({ lastName: state.lastName, updatedAt: state.updatedAt });
});

// Health check
app.get("/health", (_req, res) => res.json({ ok: true }));

// start server after loading cached state
loadState().finally(() => {
  app.listen(PORT, () => console.log(`App running on http://localhost:${PORT}`));
});
