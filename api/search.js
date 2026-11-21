// Vercel serverless function: finds web pages for a search query using Firecrawl search.
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "FIRECRAWL_API_KEY is not set on the server" });
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
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
    const r = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, limit, country: "IN" }),
    });
    const out = safeParse(await r.text());
    if (!r.ok || !out || out.success === false) {
      return res.status(502).json({
        error: (out && (out.error || out.message)) || "Firecrawl error (HTTP " + r.status + ")",
      });
    }
    const items = (out.data && (out.data.web || out.data)) || [];
    const results = (Array.isArray(items) ? items : [])
      .filter((x) => x && x.url)
      .map((x) => ({ url: x.url, title: x.title || "", description: x.description || "" }));
    return res.status(200).json({ results });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
};

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch (e) {
    return null;
  }
}
