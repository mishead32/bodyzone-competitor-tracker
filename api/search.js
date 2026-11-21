// Vercel serverless function: finds web pages for a search query using Firecrawl.
const { search } = require("./_shared.js");

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

  const query = String(body.query || "").trim().slice(0, 500);
  if (!query) {
    return res.status(400).json({ error: "Please enter what to search for" });
  }
  let limit = parseInt(body.limit, 10);
  if (!(limit >= 1 && limit <= 20)) limit = 10;

  try {
    const results = await search(query, limit, apiKey);
    return res.status(200).json({ results });
  } catch (e) {
    return res.status(502).json({ error: String(e && e.message ? e.message : e) });
  }
};
