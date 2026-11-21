// Google Apps Script. Receives results from the Vercel tool, adds new rows to this Google Sheet,
// skips duplicates, and emails you a short summary after every run.

const SECRET = "CHANGE-ME-TO-A-LONG-RANDOM-TEXT"; // must be exactly the same as SHEET_WEBHOOK_SECRET in Vercel
const EXTRA_EMAILS = ""; // optional: more people to email, separated by commas, e.g. "boss@example.com"

const TAB_NAMES = {
  leads: "Leads",
  gym: "Competitor Gyms",
  jobs: "Trainer Jobs",
  trends: "Local Trends",
};

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ ok: false, error: "Bad data" });
  }
  if (data.secret !== SECRET) {
    return reply({ ok: false, error: "Wrong secret" });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const summary = [];
  let hot = [];

  (data.groups || []).forEach(function (g) {
    const sheet = getTab(ss, TAB_NAMES[g.mode] || g.mode, g.cols);
    const keyCol = g.cols.length + 3; // hidden key column
    const last = sheet.getLastRow();
    const existing = {};
    if (last > 1) {
      sheet.getRange(2, keyCol, last - 1, 1).getValues().forEach(function (r) {
        if (r[0]) existing[r[0]] = true;
      });
    }
    const today = Utilities.formatDate(new Date(), "Asia/Kolkata", "dd/MM/yyyy");
    const fresh = [];
    (g.rows || []).forEach(function (r) {
      if (existing[r.key]) return;
      existing[r.key] = true;
      fresh.push(r.cells.concat([r.source, today, r.key]));
      if (g.mode === "leads" && r.cells[0] === "Hot") hot.push(r.cells[1]);
    });
    if (fresh.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, fresh.length, g.cols.length + 3).setValues(fresh);
    }
    summary.push(g.mode + ": " + fresh.length + " new of " + (g.rows || []).length + " found");
  });

  sendSummary(data, summary, hot, ss.getUrl());
  return reply({ ok: true, summary: summary });
}

function getTab(ss, name, cols) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    const header = cols.concat(["Source link", "Added on", "Key"]);
    sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight("bold");
    sheet.setFrozenRows(1);
    sheet.hideColumns(header.length); // the Key column is only for removing duplicates
  }
  return sheet;
}

function sendSummary(data, summary, hot, url) {
  const me = Session.getEffectiveUser().getEmail();
  const to = EXTRA_EMAILS ? me + "," + EXTRA_EMAILS : me;
  let body = "Task: " + data.task + "\n" +
    "Pages read: " + data.pagesOk + " of " + data.pagesTried + "\n\n" +
    summary.join("\n") + "\n";
  if (hot.length) body += "\nHot leads today:\n- " + hot.slice(0, 15).join("\n- ") + "\n";
  if ((data.errors || []).length) {
    body += "\nPages that failed:\n" + data.errors.map(function (x) { return "- " + x.url + " (" + x.error + ")"; }).join("\n") + "\n";
  }
  body += "\nSheet: " + url;
  MailApp.sendEmail(to, "Bodyzone market intelligence: " + data.task, body);
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
