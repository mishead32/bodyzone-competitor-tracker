// Vercel serverless function: reads one page with Firecrawl. The API key stays on the server.
const { scrape } = require("./_shared.js");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "FIRECRAWL_API_KEY is not set on the server" });
  }

  let body = req.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  const appPassword = process.env.APP_PASSWORD;
  if (appPassword && body.password !== appPassword) {
    return res.status(401).json({ error: "Wrong password" });
  }

  let parsed;
  try {
    parsed = new URL(body.url);
  } catch (e) {
    return res.status(400).json({ error: "Invalid URL" });
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return res.status(400).json({ error: "Only http/https URLs allowed" });
  }

  try {
    const data = await scrape(parsed.toString(), body.mode, apiKey, 55000);
    return res.status(200).json({ url: parsed.toString(), data });
  } catch (e) {
    return res.status(502).json({ error: String(e && e.message ? e.message : e) });
  }
};
