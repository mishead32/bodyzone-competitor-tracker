// Vercel serverless function: keeps the Firecrawl API key on the server (never in the browser).
const GYM_SCHEMA = {
  type: "object",
  properties: {
    gym_name: { type: "string" },
    address: { type: "string" },
    phone: { type: "string" },
    timings: { type: "string" },
    joining_fee: { type: "string" },
    personal_training_price: { type: "string" },
    offers: { type: "string" },
    facilities: { type: "array", items: { type: "string" } },
    plans: {
      type: "array",
      items: {
        type: "object",
        properties: {
          plan_name: { type: "string" },
          duration: { type: "string" },
          price: { type: "string" },
        },
      },
    },
    notes: { type: "string" },
  },
};

const GYM_PROMPT =
  "This is a gym / fitness centre website. Extract: gym name, full address, phone number, " +
  "opening timings, joining/admission fee, personal training price, current offers or discounts, " +
  "list of facilities, and every membership plan with its name, duration and price (keep the currency symbol). " +
  "Only use what is written on the page. If something is not on the page, leave it empty. Do not guess.";


const JOBS_SCHEMA = {
  type: "object",
  properties: {
    employer: { type: "string" },
    jobs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          location: { type: "string" },
          salary: { type: "string" },
          incentives: { type: "string" },
          experience_required: { type: "string" },
          qualification: { type: "string" },
          openings: { type: "string" },
          working_days_and_hours: { type: "string" },
          contact: { type: "string" },
          posted_date: { type: "string" },
        },
      },
    },
  },
};
const JOBS_PROMPT =
  "This page lists job openings, mainly for gym / fitness trainers. Extract the employer and every job: title, location, salary, incentives, " +
  "experience required, qualification, number of openings, working days and hours, contact (phone/email) and posted date. " +
  "Only use what is on the page. Leave anything not stated empty. Do not guess.";

const TRENDS_SCHEMA = {
  type: "object",
  properties: {
    page_title: { type: "string" },
    key_trends: { type: "array", items: { type: "string" } },
    offers_or_promotions: { type: "array", items: { type: "string" } },
    price_points: { type: "array", items: { type: "string" } },
    popular_services: { type: "array", items: { type: "string" } },
    statistics: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
  },
};
const TRENDS_PROMPT =
  "This page is about the fitness / gym market or local fitness offers. Extract the key trends, any running offers or promotions, " +
  "any price points (keep currency), popular services or class types, and any statistics with their year. " +
  "Only use what is written on the page. Write a 2 sentence summary. Do not guess.";

const LEADS_SCHEMA = {
  type: "object",
  properties: {
    page_title: { type: "string" },
    organisations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          category: { type: "string" },
          address: { type: "string" },
          phone: { type: "string" },
          email: { type: "string" },
          website: { type: "string" },
          employee_count: { type: "string" },
          notes: { type: "string" },
        },
      },
    },
  },
};
const LEADS_PROMPT =
  "This page lists or describes businesses and organisations (companies, offices, residential societies, clinics, institutes, wedding planners, event organisers and similar). " +
  "Extract every organisation named on the page: name, what it does (category), full address, its published business phone number, its published business email, website, " +
  "number of employees if stated, and a one-line note. Only extract business or organisation contact details that are published on the page. " +
  "Do not extract private individuals' personal phone numbers or email addresses. Leave anything not stated empty. Do not guess.";

const MODES = {
  gym: { schema: GYM_SCHEMA, prompt: GYM_PROMPT },
  jobs: { schema: JOBS_SCHEMA, prompt: JOBS_PROMPT },
  trends: { schema: TRENDS_SCHEMA, prompt: TRENDS_PROMPT },
  leads: { schema: LEADS_SCHEMA, prompt: LEADS_PROMPT },
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "FIRECRAWL_API_KEY is not set on the server" });
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
  const { url, password } = body;
  const mode = MODES[body.mode] || MODES.gym;

  const appPassword = process.env.APP_PASSWORD;
  if (appPassword && password !== appPassword) {
    return res.status(401).json({ error: "Wrong password" });
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    return res.status(400).json({ error: "Invalid URL" });
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return res.status(400).json({ error: "Only http/https URLs allowed" });
  }

  try {
    const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: parsed.toString(),
        formats: [{ type: "json", schema: mode.schema, prompt: mode.prompt }],
      }),
    });

    const text = await r.text();
    const out = safeParse(text);
    if (!r.ok || !out || out.success === false) {
      return res.status(502).json({
        error: (out && (out.error || out.message)) || "Firecrawl error (HTTP " + r.status + ")",
      });
    }

    // The extracted JSON is expected in data.json; fall back defensively.
    const data = out.data || {};
    const extracted = data.json || data.extract || null;
    if (!extracted) {
      return res.status(502).json({
        error: "Firecrawl returned no structured data",
        keys: Object.keys(data),
      });
    }
    return res.status(200).json({ url: parsed.toString(), data: extracted });
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
