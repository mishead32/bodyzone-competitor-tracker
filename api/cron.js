// Runs automatically every day (see vercel.json). Finds pages, reads them with Firecrawl,
// scores the results and sends them to your Google Sheet (via the Apps Script link).
const { scrape, search } = require("./_shared.js");

// ------------------------- EDIT THIS PART -------------------------
const AREA = "Mohali Chandigarh Panchkula";
const PAGES_PER_RUN = 6; // pages read per daily run (keep small: Vercel free plan stops a run after 60 seconds)

// One task per weekday (0 = Sunday ... 6 = Saturday). Times are UTC; the schedule in vercel.json runs at 7:00 AM India time.
const SCHEDULE = {
  1: "leads-corporates",
  2: "leads-societies",
  3: "leads-health",
  4: "leads-colleges",
  5: "leads-wedding",
  6: "gyms",
  0: "jobs-trends",
};

const SEARCHES = {
  "leads-corporates": "companies offices list {area} IT Park business directory",
  "leads-societies": "residential societies apartments RWA list {area}",
  "leads-health": "physiotherapy dietician wellness clinics {area} contact",
  "leads-colleges": "colleges coaching institutes {area} contact",
  "leads-wedding": "wedding planners event organisers bridal salons {area}",
};

// Competitor gym pages to read every Saturday. Add each rival's pricing page here.
const GYM_URLS = [
  "https://www.anytimefitness.com/en-in/locations/chandigarh-chandigarh-in-1058",
  "https://www.anytimefitness.com/en-in/locations/chandigarh-chandigarh-in-1107",
  "https://www.cure.fit/lp/cult/center/gyms-in-chandigarh",
  "https://fitpass.co.in/studio/pro-ultimate-gyms-sector-14-panchkula",
];

// Trainer job pages and market pages to read every Sunday.
const JOB_URLS = [
  "https://www.placementindia.com/job-detail/personal-trainer-in-anytime-fitness-at-sector-10-panchkula-1334398.htm",
  "https://www.mncjobsindia.com/jobs/gym-trainer-pb-4601334",
];
const TREND_URLS = [
  "https://fitpass.co.in/blog/best-fitness-centers-in-chandigarh",
  "https://kadence.com/knowledge/how-consumer-behaviour-is-reshaping-indias-fitness-market/",
];
// -------------------------------------------------------------------

const AREA_WORDS = ["chandigarh", "mohali", "panchkula", "zirakpur", "kharar", "sas nagar", "s.a.s. nagar", "derabassi", "dera bassi", "mullanpur"];
const arr = (v) => (Array.isArray(v) ? v : []);
const join = (v, sep) => arr(v).filter(Boolean).join(sep || ", ");

function scoreLead(o) {
  let pts = 0;
  if (o.phone || o.email) pts += 2;
  const addr = String(o.address || "").toLowerCase();
  if (AREA_WORDS.some((w) => addr.includes(w))) pts += 2;
  const n = parseInt(String(o.employee_count || "").replace(/[^0-9]/g, ""), 10);
  if (n >= 50) pts += 1;
  return pts >= 4 ? "Hot" : pts >= 2 ? "Warm" : "Cold";
}

const COLS = {
  leads: ["Score", "Organisation", "Category", "Address", "Phone", "Email", "Website", "Employees", "Notes"],
  gym: ["Gym", "Plans & prices", "Joining fee", "PT price", "Offers", "Timings", "Phone", "Address", "Facilities"],
  jobs: ["Employer", "Job title", "Location", "Salary", "Incentives", "Experience", "Qualification", "Openings", "Days & hours", "Contact", "Posted"],
  trends: ["Page", "Summary", "Key trends", "Offers / promotions", "Price points", "Popular services", "Statistics"],
};

// Turns one page's data into rows: [{key, cells}]
function toRows(mode, d, week) {
  if (mode === "leads") {
    return arr(d.organisations).filter((o) => o && o.name).map((o) => ({
      key: (o.name + "|" + String(o.phone || "").replace(/\D/g, "")).toLowerCase(),
      cells: [scoreLead(o), o.name, o.category, o.address, o.phone, o.email, o.website, o.employee_count, o.notes],
    }));
  }
  if (mode === "gym") {
    return [{
      key: (d.gym_name || "") + "|" + week,
      cells: [d.gym_name, arr(d.plans).map((p) => [p.plan_name, p.duration, p.price].filter(Boolean).join(" - ")).join("\n"),
        d.joining_fee, d.personal_training_price, d.offers, d.timings, d.phone, d.address, join(d.facilities)],
    }];
  }
  if (mode === "jobs") {
    return arr(d.jobs).map((j) => ({
      key: [d.employer, j.title, j.location].join("|").toLowerCase(),
      cells: [d.employer, j.title, j.location, j.salary, j.incentives, j.experience_required, j.qualification, j.openings, j.working_days_and_hours, j.contact, j.posted_date],
    }));
  }
  return [{
    key: (d.page_title || "") + "|" + week,
    cells: [d.page_title, d.summary, join(d.key_trends, "\n"), join(d.offers_or_promotions, "\n"), join(d.price_points, "\n"), join(d.popular_services), join(d.statistics, "\n")],
  }];
}

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return d.getUTCFullYear() + "-W" + Math.ceil(((d - y0) / 864e5 + 1) / 7);
}

async function runTask(task, apiKey) {
  const jobs = []; // {url, mode}
  if (SEARCHES[task]) {
    const found = await search(SEARCHES[task].replace("{area}", AREA), 10, apiKey);
    found.slice(0, PAGES_PER_RUN).forEach((x) => jobs.push({ url: x.url, mode: "leads" }));
  } else if (task === "gyms") {
    GYM_URLS.slice(0, PAGES_PER_RUN).forEach((u) => jobs.push({ url: u, mode: "gym" }));
  } else if (task === "jobs-trends") {
    JOB_URLS.forEach((u) => jobs.push({ url: u, mode: "jobs" }));
    TREND_URLS.forEach((u) => jobs.push({ url: u, mode: "trends" }));
  } else {
    throw new Error("Unknown task: " + task);
  }

  const week = isoWeek(new Date());
  const settled = await Promise.allSettled(jobs.map((j) => scrape(j.url, j.mode, apiKey, 45000)));
  const groups = {}; // mode -> {cols, rows, seen}
  const errors = [];
  let pagesOk = 0;
  settled.forEach((s, i) => {
    const j = jobs[i];
    if (s.status !== "fulfilled") {
      errors.push({ url: j.url, error: String(s.reason && s.reason.message ? s.reason.message : s.reason) });
      return;
    }
    pagesOk++;
    const g = groups[j.mode] || (groups[j.mode] = { cols: COLS[j.mode], rows: [], seen: new Set() });
    toRows(j.mode, s.value, week).forEach((r) => {
      if (g.seen.has(r.key)) return;
      g.seen.add(r.key);
      g.rows.push({ key: r.key, cells: r.cells.map((c) => (c == null ? "" : String(c))), source: j.url });
    });
  });
  return { task, pagesTried: jobs.length, pagesOk, errors, groups };
}

module.exports = async (req, res) => {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "FIRECRAWL_API_KEY is not set" });

  // Allowed callers: Vercel's scheduler (CRON_SECRET) or you in a browser (?key=APP_PASSWORD).
  const cronSecret = process.env.CRON_SECRET;
  const appPassword = process.env.APP_PASSWORD;
  const q = req.query || {};
  const viaCron = cronSecret && req.headers && req.headers.authorization === "Bearer " + cronSecret;
  const viaKey = appPassword && q.key === appPassword;
  if (!viaCron && !viaKey) return res.status(401).json({ error: "Not allowed" });

  const task = q.task || SCHEDULE[new Date().getUTCDay()];
  const dryRun = q.dry === "1";

  try {
    const result = await runTask(task, apiKey);
    const hook = process.env.SHEET_WEBHOOK_URL;
    const secret = process.env.SHEET_WEBHOOK_SECRET;
    let sheet = "not sent (dry run or SHEET_WEBHOOK_URL not set)";
    if (hook && !dryRun) {
      const payload = {
        secret, task: result.task, pagesTried: result.pagesTried, pagesOk: result.pagesOk, errors: result.errors,
        groups: Object.keys(result.groups).map((m) => ({ mode: m, cols: result.groups[m].cols, rows: result.groups[m].rows })),
      };
      const r = await fetch(hook, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
      sheet = (await r.text()).slice(0, 500);
    }
    const counts = {};
    Object.keys(result.groups).forEach((m) => (counts[m] = result.groups[m].rows.length));
    return res.status(200).json({ ok: true, task: result.task, pagesTried: result.pagesTried, pagesOk: result.pagesOk, rowsFound: counts, errors: result.errors, sheet });
  } catch (e) {
    return res.status(500).json({ ok: false, task, error: String(e && e.message ? e.message : e) });
  }
};
