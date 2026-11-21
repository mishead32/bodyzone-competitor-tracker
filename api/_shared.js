// Shared Firecrawl helpers. Files starting with _ are not exposed as web addresses by Vercel.
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


function safeParse(s) {
  try { return JSON.parse(s); } catch (e) { return null; }
}

// Reads one page and returns the structured data. Throws an Error with a readable message.
async function scrape(url, modeName, apiKey, timeoutMs) {
  const mode = MODES[modeName] || MODES.gym;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || 45000);
  try {
    const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: [{ type: "json", schema: mode.schema, prompt: mode.prompt }] }),
    });
    const out = safeParse(await r.text());
    if (!r.ok || !out || out.success === false) {
      throw new Error((out && (out.error || out.message)) || "Firecrawl error (HTTP " + r.status + ")");
    }
    const data = out.data || {};
    const extracted = data.json || data.extract || null;
    if (!extracted) throw new Error("Firecrawl returned no structured data");
    return extracted;
  } catch (e) {
    if (e && e.name === "AbortError") throw new Error("Timed out reading the page");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Finds pages for a search query. Returns [{url,title,description}].
async function search(query, limit, apiKey) {
  const r = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit, country: "IN" }),
  });
  const out = safeParse(await r.text());
  if (!r.ok || !out || out.success === false) {
    throw new Error((out && (out.error || out.message)) || "Firecrawl search error (HTTP " + r.status + ")");
  }
  const items = (out.data && (out.data.web || out.data)) || [];
  return (Array.isArray(items) ? items : [])
    .filter((x) => x && x.url)
    .map((x) => ({ url: x.url, title: x.title || "", description: x.description || "" }));
}

module.exports = { MODES, scrape, search, safeParse };
