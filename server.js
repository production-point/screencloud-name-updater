import express from "express";
import helmet from "helmet";
import axios from "axios";
import dotenv from "dotenv";
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

app.post("/submit-name", async (req, res) => {
  try {
    const name = (req.body.name || "").trim().slice(0, 120); // basic guard
    if (!name) return res.status(400).json({ ok: false, error: "Name is required." });

    // Build the ScreenCloud Webhooks payload
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

    const headers = {
      "X-API-Key": API_KEY,
      "Content-Type": "application/json"
    };

    const { data } = await axios.post(WEBHOOK_URL, payload, { headers });
    // If you want to show Webhooks API response in your UI:
    return res.json({ ok: true, data });
  } catch (err) {
    console.error(err?.response?.data || err.message);
    return res.status(500).json({ ok: false, error: "Failed to post to ScreenCloud Webhooks." });
  }
});

// Health check
app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`App running on http://localhost:${PORT}`));
