/**
 * Cascadia Analytics - Ticker Research, segment performance (PRO)
 * GET /api/stock-segments?ticker=MSFT
 *
 * Segment revenue and segment operating income for the latest reported
 * segment period, with year-over-year growth against the same period one
 * year earlier, plus a revenue-mix visual driven by the same rows.
 *
 * STATEMENT SOURCE: EDGAR filing documents, not the XBRL API. The
 * companyconcept and companyfacts endpoints carry no segment-dimension
 * facts at all (verified for MSFT, NVDA, and AAPL: zero dimension facts
 * in each companyfacts file), so segment data cannot come from them.
 * Instead this endpoint reads the segment detail report inside the
 * latest 10-Q filing on EDGAR: the submissions file gives the filing,
 * FilingSummary.xml names the segment detail report, and that report
 * table carries segment revenue and operating income for the current
 * and prior-year periods. If no 10-Q yields a segment report, recent
 * 10-K filings are tried the same way and the period is labeled as a
 * fiscal year. Yahoo is not used at all: its quarterly statements carry
 * no segment split, and the company name comes from the EDGAR
 * submissions file.
 *
 * HONESTY RULES (same standing rules as the benchmark module):
 * - No proportional splits, no invented growth rates, no invented
 *   operating income shares. Every figure is read from the filing's
 *   segment report table or it renders as N/A.
 * - No narrative commentary about a company's strategy. The intro line
 *   is computed from the data returned (segment count, total segment
 *   revenue, period dates) or the section is unavailable with its
 *   reason.
 * - The Notable column carries only computed values (margin and share
 *   of segment revenue), never invented narrative notes.
 * - Segment rows are exactly the blocks the filing presents. No
 *   sub-segment hierarchy is synthesized: detail reports present
 *   segments flat, so rows are flat. Blocks named as eliminations are
 *   kept in the table but excluded from the visual total.
 * - Period labels come from the report's own date columns, never from
 *   calendar-month arithmetic. Values are in millions of the currency
 *   the report header states, scaled from the header's stated unit
 *   (millions, thousands, or billions). Null renders as N/A, never 0.
 * - Foreign private issuers such as BABA file annual 20-F reports and
 *   furnish quarterly results on 6-K, which are not XBRL tagged this
 *   way, so such names render unavailable with the reason stated.
 *   Nothing is forced to pass by falling back to Yahoo statements or
 *   to a multiplier.
 * - EDGAR fair use: requests are sequential with a 120 ms gap, well
 *   inside the 10 requests per second limit. Three EDGAR requests per
 *   filing tried (submissions is fetched once).
 * Auth: Supabase JWT + profiles.is_pro via _auth.js (401 / 403).
 */

import {
  stockGate, cleanTicker, missingTicker, dataJson, upstreamError,
  getCikMap, secFetchJson, secFetchText,
} from "./_stock.js";

const EDGAR_DELAY_MS = 120;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r1 = (v) =>
  v === null || v === undefined || Number.isNaN(v) ? null : Math.round(v * 10) / 10;
const growthPct = (curr, prior) =>
  curr === null || prior === null || prior === 0
    ? null
    : r1(((curr - prior) / Math.abs(prior)) * 100);
const pct = (part, whole) =>
  part === null || whole === null || whole === 0 ? null : r1((part / whole) * 100);

const MONTHS = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

function parseReportDate(s) {
  const m = String(s || "").match(
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2}),\s+(\d{4})/
  );
  if (!m) return null;
  return m[3] + "-" + MONTHS[m[1]] + "-" + String(m[2]).padStart(2, "0");
}

function stripTags(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseValue(raw) {
  const s = stripTags(raw);
  if (!s || s === "-" || s === "--" || s === "—") return null;
  const neg = /^\(.*\)$/.test(s);
  const cleaned = s.replace(/[$,%()]/g, "").replace(/,/g, "").trim();
  if (!cleaned) return null;
  const num = Number(cleaned);
  if (Number.isNaN(num)) return null;
  return neg ? -num : num;
}

function parseRows(htmlText) {
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(htmlText)) !== null) {
    const cells = [];
    const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let c;
    while ((c = tdRe.exec(m[1])) !== null) cells.push(stripTags(c[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

// FilingSummary.xml reports: { menu, name, file }.
function parseFilingSummary(xml) {
  const reports = [];
  const repRe = /<Report\b[^>]*>([\s\S]*?)<\/Report>/gi;
  let m;
  const tag = (block, name) => {
    const t = new RegExp("<" + name + ">([\\s\\S]*?)</" + name + ">", "i").exec(block);
    return t ? stripTags(t[1]) : "";
  };
  while ((m = repRe.exec(xml)) !== null) {
    reports.push({
      menu: tag(m[1], "MenuCategory"),
      name: tag(m[1], "ShortName") || tag(m[1], "LongName"),
      file: tag(m[1], "HtmlFileName"),
    });
  }
  return reports;
}

// Segment detail report candidates, best first. Geographic, market
// platform, concentration, narrative, reconciling, and unearned-revenue
// schedules are not business segments and are excluded, even though
// their names mention segments. Preference goes to reports that carry
// operating income, then to reportable-segment schedules, then to other
// revenue-carrying segment reports.
const SEGMENT_EXCLUDE = /geographic|market platform|concentration|narrative|reconciling|unearned/i;
function segmentReportCandidates(reports) {
  const byMenu = (menu) =>
    reports.filter(
      (r) =>
        r.file &&
        (!menu || r.menu === menu) &&
        /segment/i.test(r.name) &&
        !SEGMENT_EXCLUDE.test(r.name)
    );
  let cands = byMenu("Details");
  if (!cands.length) cands = byMenu(null);
  const score = (r) =>
    /operating income/i.test(r.name)
      ? 0
      : /reportable segments/i.test(r.name)
        ? 1
        : /revenue/i.test(r.name)
          ? 2
          : 3;
  cands.sort((a, b) => score(a) - score(b));
  return cands;
}

// Parse one segment detail report table into period labels and segments.
// Returns null when the table does not yield a usable segment block.
function parseSegmentReport(htmlText) {
  const rows = parseRows(htmlText);
  // Report scale and currency come from the header row, e.g.
  // "Segment ... (Detail) - USD ($) $ in Millions".
  const head = rows.slice(0, 3).map((r) => r.join(" ")).join(" ");
  let scale = 1;
  if (/in Thousands/i.test(head)) scale = 1 / 1000;
  else if (/in Billions/i.test(head)) scale = 1000;
  const curMatch = head.match(/\b(USD|EUR|GBP|JPY|CHF|CAD|AUD|CNY|RMB)\b/);
  const currency = curMatch ? curMatch[1] : null;

  // Locate the period group header row ("3 Months Ended" / "12 Months Ended").
  let groupIdx = -1;
  let groupKind = null;
  for (let i = 0; i < rows.length; i++) {
    const joined = rows[i].join(" ");
    if (/3 Months Ended/i.test(joined)) { groupIdx = i; groupKind = "quarter"; break; }
    if (/12 Months Ended/i.test(joined)) { groupIdx = i; groupKind = "annual"; break; }
  }
  if (groupIdx < 0 || groupIdx + 1 >= rows.length) return null;
  const groupCells = rows[groupIdx].slice(1);
  // The date row usually carries no leading label cell, so it holds exactly
  // two dates per group; if it does carry one, drop it.
  const rawDateCells = rows[groupIdx + 1];
  const dateCells =
    rawDateCells.length === groupCells.length * 2 + 1
      ? rawDateCells.slice(1)
      : rawDateCells;
  // Groups pair up with date columns two at a time, in order.
  let currentLabel = null;
  let priorLabel = null;
  let colCurrent = 1;
  let colPrior = 2;
  for (let g = 0; g < groupCells.length; g++) {
    const d0 = parseReportDate(dateCells[g * 2]);
    const d1 = parseReportDate(dateCells[g * 2 + 1]);
    const header = groupCells[g] || "";
    if (/3 Months Ended/i.test(header) || /12 Months Ended/i.test(header)) {
      if (d0) {
        currentLabel = d0;
        priorLabel = d1;
        colCurrent = 1 + g * 2;
        colPrior = 2 + g * 2;
        groupKind = /3 Months Ended/i.test(header) ? "quarter" : "annual";
        break;
      }
    }
  }
  if (!currentLabel) return null;

  const segments = [];
  let current = null;
  const isLineItems = (label) => /\[Line Items\]/.test(label);
  for (let i = groupIdx + 2; i < rows.length; i++) {
    const cells = rows[i];
    const label = cells[0] || "";
    if (!label || label === "X" || label.startsWith("-")) break;
    const valueCells = cells.slice(1);
    const allEmpty = valueCells.every((c) => !c);
    if (allEmpty) {
      // A named block header starts a new segment; the unnamed first block
      // is the consolidated total and is skipped, not presented as a segment.
      if (isLineItems(label)) continue;
      current = {
        name: label,
        revenue: null,
        priorRevenue: null,
        opInc: null,
        priorOpInc: null,
      };
      segments.push(current);
      continue;
    }
    if (!current) continue;
    if (/^Revenue$/i.test(label)) {
      current.revenue = parseValue(cells[colCurrent]);
      current.priorRevenue = parseValue(cells[colPrior]);
    } else if (/^Operating income/i.test(label)) {
      current.opInc = parseValue(cells[colCurrent]);
      current.priorOpInc = parseValue(cells[colPrior]);
    }
  }

  // Scale raw report values into millions and drop blocks with no revenue.
  const usable = segments
    .map((s) => ({
      name: s.name,
      revenue: s.revenue === null ? null : Math.round(s.revenue * scale),
      priorRevenue: s.priorRevenue === null ? null : Math.round(s.priorRevenue * scale),
      opInc: s.opInc === null ? null : Math.round(s.opInc * scale),
      priorOpInc: s.priorOpInc === null ? null : Math.round(s.priorOpInc * scale),
    }))
    .filter((s) => s.revenue !== null);
  if (!usable.length) return null;
  // Repeated block names mean the report was not a segment breakdown
  // (for example a geographic schedule repeating one line item), so the
  // candidate is rejected rather than rendered with duplicate labels.
  const seenNames = new Set();
  for (const s of usable) {
    if (seenNames.has(s.name)) return null;
    seenNames.add(s.name);
  }

  // Rollup blocks: a block whose revenue exactly equals the sum of the
  // blocks nested under it ("Parent | Child" naming) is the total of its
  // children, not a segment of its own, so it is dropped and the total
  // becomes the sum of the leaf segments. When every remaining row
  // shares one parent prefix, the prefix is stripped for display.
  let leaves = usable;
  const rollups = new Set();
  for (const s of usable) {
    const children = usable.filter(
      (o) => o !== s && o.name.startsWith(s.name + " | ")
    );
    if (!children.length) continue;
    const childSum = children.reduce((a, o) => a + (o.revenue || 0), 0);
    if (Math.abs(childSum - (s.revenue || 0)) <= 2) rollups.add(s.name);
  }
  if (rollups.size) leaves = usable.filter((s) => !rollups.has(s.name));
  if (leaves.length >= 2 && leaves.every((s) => s.name.includes(" | "))) {
    const prefix = leaves[0].name.split(" | ")[0];
    if (leaves.every((s) => s.name.startsWith(prefix + " | "))) {
      leaves = leaves.map((s) => ({
        ...s,
        name: s.name.slice(prefix.length + 3),
      }));
    }
  }

  const isElim = (name) => /eliminat/i.test(name);
  const visualTotal = leaves
    .filter((s) => !isElim(s.name) && s.revenue > 0)
    .reduce((a, s) => a + s.revenue, 0);
  const out = leaves.map((s) => ({
    name: s.name,
    revenue: s.revenue,
    priorRevenue: s.priorRevenue,
    yoyPct: growthPct(s.revenue, s.priorRevenue),
    opInc: s.opInc,
    priorOpInc: s.priorOpInc,
    marginPct: pct(s.opInc, s.revenue),
    sharePct: pct(s.revenue, visualTotal),
    isElimination: isElim(s.name),
  }));
  return {
    periodType: groupKind,
    currentLabel:
      groupKind === "quarter"
        ? "Quarter ended " + currentLabel
        : "Fiscal year ended " + currentLabel,
    priorLabel:
      priorLabel
        ? groupKind === "quarter"
          ? "Quarter ended " + priorLabel
          : "Fiscal year ended " + priorLabel
        : null,
    currency,
    totalRevenue: visualTotal,
    segments: out,
  };
}

export { parseFilingSummary, segmentReportCandidates, parseSegmentReport, parseReportDate };

export async function onRequest(context) {
  const gate = await stockGate(context);
  if (gate.response) return gate.response;
  const { request } = context;
  const ticker = cleanTicker(request);
  if (!ticker) return missingTicker(request);

  try {
    const cikMap = await getCikMap(context);
    const cik = cikMap[ticker];
    if (!cik) {
      return dataJson(
        {
          ticker,
          available: false,
          reason: "No EDGAR CIK was found for this ticker, so no filing segment data is available.",
        },
        request,
        3600
      );
    }
    const cikPath = String(parseInt(cik, 10));
    await sleep(EDGAR_DELAY_MS);
    const subs = await secFetchJson(
      "https://data.sec.gov/submissions/CIK" + cik + ".json"
    );
    const companyName = subs.name || ticker;
    const rec = (subs.filings && subs.filings.recent) || {};
    const forms = rec.form || [];
    const filings = [];
    for (let i = 0; i < forms.length; i++) {
      if (forms[i] === "10-Q" || forms[i] === "10-K") {
        filings.push({
          form: forms[i],
          accession: rec.accessionNumber[i],
          reportDate: rec.reportDate[i],
        });
      }
    }
    // Latest 10-Q filings first, then 10-K filings; at most five attempts.
    filings.sort((a, b) => (a.form === "10-Q" && b.form !== "10-Q" ? -1 : a.form !== "10-Q" && b.form === "10-Q" ? 1 : 0));
    const attempts = filings.slice(0, 5);
    if (!attempts.length) {
      return dataJson(
        {
          ticker,
          companyName,
          available: false,
          reason:
            "No 10-Q or 10-K filing was found on EDGAR for this filer, so no segment detail report is available. Quarterly results furnished on 6-K are not XBRL tagged this way.",
        },
        request,
        3600
      );
    }

    for (const filing of attempts) {
      const dir =
        "https://www.sec.gov/Archives/edgar/data/" +
        cikPath +
        "/" +
        filing.accession.replace(/-/g, "") +
        "/";
      try {
        await sleep(EDGAR_DELAY_MS);
        const summary = await secFetchText(dir + "FilingSummary.xml");
        const candidates = segmentReportCandidates(parseFilingSummary(summary));
        for (const cand of candidates) {
          try {
            await sleep(EDGAR_DELAY_MS);
            const report = await secFetchText(dir + cand.file);
            const parsed = parseSegmentReport(report);
            if (parsed) {
              return dataJson(
                {
                  ticker,
                  companyName,
                  available: true,
                  filingForm: filing.form,
                  filingAccession: filing.accession,
                  ...parsed,
                },
                request,
                3600
              );
            }
          } catch (e) {
            /* try the next candidate report */
          }
        }
      } catch (e) {
        /* try the next filing */
      }
    }

    return dataJson(
      {
        ticker,
        companyName,
        available: false,
        reason:
          "No segment detail report was found in the latest 10-Q or 10-K filings on EDGAR for this filer, so segment revenue and segment operating income are unavailable.",
      },
      request,
      3600
    );
  } catch (err) {
    return upstreamError(request, ticker, err);
  }
}
