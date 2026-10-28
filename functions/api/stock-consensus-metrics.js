/**
 * Cascadia Analytics - Ticker Research, post-earnings benchmark (PRO)
 * GET /api/stock-consensus-metrics?ticker=MSFT
 *
 * Two tables for the latest reported quarter:
 *   1. Key Metrics vs Consensus: reported figures benchmarked against
 *      consensus only where Yahoo actually carries a consensus. EPS actual
 *      versus estimate comes from earningsHistory, matched to the EDGAR
 *      reported quarter end within 45 days (the same matching rule
 *      stock-earnings.js uses). Yahoo carries no per-quarter revenue
 *      estimate in these modules, no segment split, and no consensus for
 *      operating income, net income, or free cash flow, so those consensus
 *      cells are null and render as N/A, never approximated from another
 *      quarter or from a multiplier.
 *   2. Year-over-Year comparison: the latest reported quarter versus the
 *      same fiscal quarter one year earlier, both from EDGAR XBRL.
 *
 * STATEMENT SOURCE: EDGAR XBRL companyconcept facts, fetched per us-gaap
 * tag through the shared secFetchJson helper with the house SEC user
 * agent. Ticker to CIK resolution uses the shared getCikMap helper,
 * including its overrides. Yahoo statement modules are NOT used: the
 * prior Yahoo-only version failed its acceptance check because
 * quoteSummary returns only four quarterly statements, and only revenue
 * and net income are populated there. Yahoo is retained for exactly
 * three things: company name, earningsHistory EPS actual versus
 * estimate, and the earningsTrend module fetch as before (its values are
 * not used in the tables, since a 0q estimate is a different quarter).
 *
 * QUARTER SELECTION (exact, no approximation):
 * - Income statement and EPS tags use 10-Q facts whose duration is
 *   80 to 100 days (the 3-month quarter), keyed by fiscal year and
 *   fiscal period. Where several facts share a key, the latest filed
 *   wins, so amendments supersede originals.
 * - Cash flow tags are year-to-date in filings, so quarterly values
 *   are derived by differencing within a fiscal year: Q1 equals the
 *   Q1 year-to-date value, Q2 equals Q2 year-to-date less Q1, Q3
 *   equals Q3 year-to-date less Q2, and Q4 equals the annual value
 *   less Q3 year-to-date. A quarter is present only when both inputs
 *   to its difference are present.
 * - Q4 has no 10-Q, so a Q4 quarter is derived only as the fiscal
 *   year 10-K value less the Q3 year-to-date value for the same tag
 *   and fiscal year, and only when both inputs are present and
 *   verified. Otherwise Q4 is unavailable with its reason, never
 *   approximated.
 * - The reported quarter is the latest quarter in the revenue facts
 *   (falling back to operating income, then net income, when revenue
 *   carries no quarterly facts). The prior-year partner is the same
 *   fiscal period one fiscal year earlier. The oldest available
 *   quarter is never relabeled as the prior-year quarter.
 * - Only consolidated facts with no segment dimension are used; the
 *   companyconcept endpoint returns untagged consolidated facts for
 *   these tags, and segment revenue is therefore N/A by construction.
 * - Values are in millions of the currency the facts themselves are
 *   reported in (the companyconcept unit key), with no conversion.
 *   Foreign private issuers such as BABA file annual 20-F reports and
 *   furnish quarterly results on 6-K, which are generally not XBRL
 *   tagged the way 10-Q reports are, so such names remain partial:
 *   their quarterly rows render N/A and the reason states that EDGAR
 *   carries no quarterly XBRL facts for the filer. Nothing is forced
 *   to pass by falling back to Yahoo statements or to a multiplier.
 * - Free cash flow is operating cash flow less capital expenditures
 *   for the same quarter. Capital expenditures are the absolute value
 *   of PaymentsToAcquirePropertyPlantAndEquipment, which filings
 *   report as an outflow.
 * - Null renders as N/A, never 0 and never an estimate. Beat and miss
 *   tags appear only where both an actual and a consensus exist.
 * - EDGAR fair use: at most one companyconcept request per 120 ms
 *   per call, well inside the 10 requests per second limit.
 * Auth: Supabase JWT + profiles.is_pro via _auth.js (401 / 403).
 */

import {
  stockGate, cleanTicker, missingTicker, dataJson, upstreamError,
  getCrumb, quoteSummary, num, getCikMap, secFetchJson,
} from "./_stock.js";

const DAY_MS = 86400000;
const WINDOW_S = 45 * 86400;
const EDGAR_DELAY_MS = 120;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const toM = (v) => (v === null || v === undefined ? null : Math.round(v / 1e6));
const r1 = (v) =>
  v === null || v === undefined || Number.isNaN(v) ? null : Math.round(v * 10) / 10;
const growthPct = (curr, prior) =>
  curr === null || prior === null || prior === 0
    ? null
    : r1(((curr - prior) / Math.abs(prior)) * 100);
const marginPct = (part, whole) =>
  part === null || whole === null || whole === 0 ? null : r1((part / whole) * 100);
const daysBetween = (start, end) =>
  (Date.parse(end) - Date.parse(start)) / DAY_MS;
const isoDay = (s) => (s ? String(s).slice(0, 10) : null);

// Closest entry by stamp within 45 days, mirroring the stock-earnings.js
// revFor rule (strictly under 45 days).
function matchWithin45(entries, targetRaw, stampKey) {
  if (!targetRaw) return null;
  let best = null;
  let bestDiff = WINDOW_S;
  for (const e of entries) {
    const stamp = e && e[stampKey];
    if (!stamp) continue;
    const diff = Math.abs(stamp - targetRaw);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = e;
    }
  }
  return best;
}

function normFacts(unitFacts) {
  const out = [];
  for (const f of unitFacts || []) {
    if (!f || typeof f.val !== "number" || !f.end || !f.start) continue;
    if (!f.fy || !f.fp || !f.form) continue;
    out.push({
      end: isoDay(f.end),
      start: isoDay(f.start),
      fy: String(f.fy),
      fp: String(f.fp),
      form: String(f.form),
      filed: f.filed ? String(f.filed) : "",
      val: f.val,
    });
  }
  return out;
}

// One entry per fiscal key, latest filed wins.
function pickLatestByKey(entries) {
  const map = new Map();
  for (const e of entries) {
    const key = e.fy + "|" + e.fp;
    const prev = map.get(key);
    if (!prev || e.filed >= prev.filed) map.set(key, e);
  }
  return map;
}

// Quarterly map for an income statement or EPS tag: direct 3-month
// 10-Q facts plus Q4 derived as annual less Q3 year-to-date.
export function buildQtdMap(facts) {
  const qtd = [];
  const ytd9 = [];
  const annual = [];
  for (const f of facts) {
    const dur = daysBetween(f.start, f.end);
    if (f.form.startsWith("10-Q") && dur >= 80 && dur <= 100) qtd.push(f);
    else if (f.form.startsWith("10-Q") && f.fp === "Q3" && dur >= 260 && dur <= 285) ytd9.push(f);
    else if (f.form.startsWith("10-K") && dur >= 350 && dur <= 380) annual.push(f);
  }
  const map = pickLatestByKey(qtd);
  // Fiscal-year-keyed lookups for the Q4 derivation: the annual fact
  // and the Q3 year-to-date fact share a fiscal year, not a key.
  const ytd9ByFy = new Map();
  for (const e of ytd9) {
    const prev = ytd9ByFy.get(e.fy);
    if (!prev || e.filed >= prev.filed) ytd9ByFy.set(e.fy, e);
  }
  const annualByFy = new Map();
  for (const e of annual) {
    const prev = annualByFy.get(e.fy);
    if (!prev || e.filed >= prev.filed) annualByFy.set(e.fy, e);
  }
  for (const [fy, ann] of annualByFy) {
    const ytd = ytd9ByFy.get(fy);
    if (!ytd) continue;
    const key = fy + "|Q4";
    if (!map.has(key)) {
      map.set(key, { end: ann.end, fy, fp: "Q4", val: ann.val - ytd.val, filed: ann.filed });
    }
  }
  // Re-key entries as {val, end} for lookup.
  const out = new Map();
  for (const [key, e] of map) out.set(key, { val: e.val, end: e.end });
  return out;
}

// Quarterly map for a cash flow tag: year-to-date facts differenced
// within each fiscal year.
export function buildCashMap(facts) {
  const ytd = [];
  for (const f of facts) {
    const dur = daysBetween(f.start, f.end);
    if (f.form.startsWith("10-Q") && f.fp === "Q1" && dur >= 80 && dur <= 100) ytd.push(f);
    else if (f.form.startsWith("10-Q") && f.fp === "Q2" && dur >= 170 && dur <= 190) ytd.push(f);
    else if (f.form.startsWith("10-Q") && f.fp === "Q3" && dur >= 260 && dur <= 285) ytd.push(f);
    else if (f.form.startsWith("10-K") && dur >= 350 && dur <= 380) ytd.push(f);
  }
  const byFy = new Map();
  for (const f of ytd) {
    if (!byFy.has(f.fy)) byFy.set(f.fy, new Map());
    const slot = f.fp === "FY" ? "Q4" : f.fp;
    const prev = byFy.get(f.fy).get(slot);
    if (!prev || f.filed >= prev.filed) byFy.get(f.fy).set(slot, f);
  }
  const out = new Map();
  for (const [fy, slots] of byFy) {
    const q1 = slots.get("Q1");
    const q2 = slots.get("Q2");
    const q3 = slots.get("Q3");
    const q4 = slots.get("Q4");
    if (q1) out.set(fy + "|Q1", { val: q1.val, end: q1.end });
    if (q1 && q2) out.set(fy + "|Q2", { val: q2.val - q1.val, end: q2.end });
    if (q2 && q3) out.set(fy + "|Q3", { val: q3.val - q2.val, end: q3.end });
    if (q3 && q4) out.set(fy + "|Q4", { val: q4.val - q3.val, end: q4.end });
  }
  return out;
}

// Choose the reporting unit for a tag: the unit with the most quarterly
// entries, preferring USD on ties. Returns {unit, map} or null.
function chooseUnit(tagData, kind) {
  const units = (tagData && tagData.units) || {};
  let best = null;
  for (const [unit, facts] of Object.entries(units)) {
    const map = kind === "cash" ? buildCashMap(normFacts(facts)) : buildQtdMap(normFacts(facts));
    if (map.size === 0) continue;
    if (!best || map.size > best.map.size || (map.size === best.map.size && unit === "USD")) {
      best = { unit, map };
    }
  }
  return best;
}

const TAG_SPECS = [
  { key: "revenue", candidates: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"], kind: "qtd" },
  { key: "cost", candidates: ["CostOfRevenue", "CostOfGoodsAndServicesSold"], kind: "qtd" },
  { key: "operatingIncome", candidates: ["OperatingIncomeLoss"], kind: "qtd" },
  { key: "netIncome", candidates: ["NetIncomeLoss"], kind: "qtd" },
  { key: "ocf", candidates: ["NetCashProvidedByUsedInOperatingActivities"], kind: "cash" },
  { key: "capex", candidates: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"], kind: "cash" },
  { key: "dilutedEps", candidates: ["EarningsPerShareDiluted"], kind: "qtd" },
];

// Fetch every statement tag for one CIK. Multi-candidate tags (revenue,
// cost) evaluate every candidate and keep the one whose quarterly map
// runs latest, breaking ties by listed order then map size: a filer can
// retire a tag mid-history, and the first non-empty candidate may be
// stale by years (observed: MSFT "Revenues" ends in 2010 while the
// contract-revenue tag runs current). Per-tag failures leave that tag
// empty rather than failing the whole response; throws only when no tag
// fetch succeeds at all, which signals an EDGAR outage rather than a
// filer that simply does not tag a value.
export async function fetchEdgarStatements(cik) {
  const tags = {};
  let entityName = null;
  let anyOk = false;
  let firstCall = true;
  const maxEnd = (map) => {
    let best = "";
    for (const e of map.values()) if (e.end > best) best = e.end;
    return best;
  };
  for (const spec of TAG_SPECS) {
    let best = null;
    for (let ci = 0; ci < spec.candidates.length; ci++) {
      const tag = spec.candidates[ci];
      if (!firstCall) await sleep(EDGAR_DELAY_MS);
      firstCall = false;
      try {
        const data = await secFetchJson(
          "https://data.sec.gov/api/xbrl/companyconcept/CIK" + cik + "/us-gaap/" + tag + ".json"
        );
        anyOk = true;
        if (!entityName && data && data.entityName) entityName = data.entityName;
        const chosen = chooseUnit(data, spec.kind);
        if (!chosen) continue;
        const cand = { chosen, order: ci, end: maxEnd(chosen.map) };
        if (
          !best ||
          cand.end > best.end ||
          (cand.end === best.end && (cand.order < best.order ||
            (cand.order === best.order && cand.chosen.map.size > best.chosen.map.size)))
        ) {
          best = cand;
        }
      } catch (e) {
        // 404 means the filer does not use this tag; any other failure
        // leaves the tag empty and the next candidate is tried.
      }
    }
    tags[spec.key] = best ? best.chosen : null;
  }
  if (!anyOk) throw new Error("EDGAR companyconcept fetch failed for every tag");
  return { tags, entityName };
}

function latestKey(map) {
  let bestKey = null;
  let bestEnd = "";
  for (const [key, e] of map) {
    if (e.end > bestEnd) {
      bestEnd = e.end;
      bestKey = key;
    }
  }
  return bestKey;
}

function splitKey(key) {
  const i = key.indexOf("|");
  return { fy: key.slice(0, i), fp: key.slice(i + 1) };
}

// Resolve the reported and prior-year quarters from the EDGAR maps.
export function resolveEdgarQuarters(edgar) {
  const tags = edgar.tags || {};
  const order = ["revenue", "operatingIncome", "netIncome"];
  let curKey = null;
  let curMap = null;
  for (const k of order) {
    if (tags[k] && tags[k].map.size) {
      curKey = latestKey(tags[k].map);
      curMap = tags[k].map;
      break;
    }
  }
  if (!curKey) return { current: null, prior: null, currentKey: null, priorKey: null };
  const { fy, fp } = splitKey(curKey);
  const priorKey = String(Number(fy) - 1) + "|" + fp;
  const at = (tagKey, key) => {
    const t = tags[tagKey];
    if (!t) return null;
    const e = t.map.get(key);
    return e || null;
  };
  const pickEnd = (key) => {
    for (const k of order) {
      const e = at(k, key);
      if (e) return e.end;
    }
    return null;
  };
  const money = (tagKey, key) => {
    const e = at(tagKey, key);
    return e ? toM(e.val) : null;
  };
  const moneyAbs = (tagKey, key) => {
    const e = at(tagKey, key);
    return e ? Math.abs(toM(e.val)) : null;
  };
  const perShare = (tagKey, key) => {
    const e = at(tagKey, key);
    return e ? e.val : null;
  };
  const quarter = (key) => {
    if (!key) return null;
    return {
      revenue: money("revenue", key),
      cost: money("cost", key),
      operatingIncome: money("operatingIncome", key),
      netIncome: money("netIncome", key),
      dilutedEps: perShare("dilutedEps", key),
      ocf: money("ocf", key),
      capex: moneyAbs("capex", key),
      end: pickEnd(key),
    };
  };
  const current = quarter(curKey);
  const prior = quarter(priorKey);
  current.fcf = current.ocf !== null && current.capex !== null ? current.ocf - current.capex : null;
  prior.fcf = prior.ocf !== null && prior.capex !== null ? prior.ocf - prior.capex : null;
  const priorIdentified =
    (tags.revenue && tags.revenue.map.has(priorKey)) ||
    (tags.operatingIncome && tags.operatingIncome.map.has(priorKey)) ||
    (tags.netIncome && tags.netIncome.map.has(priorKey));
  return { current, prior, currentKey: curKey, priorKey, priorIdentified };
}

export function buildBenchmark(ticker, parts) {
  const { companyName, currency, edgar, epsActual, epsEstimate } = parts;
  const { current: qCurr, prior: qPrior, priorIdentified } = resolveEdgarQuarters(edgar);
  const epsSurprise =
    epsActual !== null && epsEstimate !== null && epsEstimate !== 0
      ? r1(((epsActual - epsEstimate) / Math.abs(epsEstimate)) * 100)
      : null;

  const noConsensus = (metric, actual, unit) => ({
    metric,
    actual,
    consensus: null,
    unit,
    tag: "No consensus on file",
    tagType: "na",
    magnitude: null,
  });

  const consensusMetrics = [
    noConsensus("Revenue", qCurr ? qCurr.revenue : null, "millions"),
    noConsensus("Segment and cloud revenue", null, "millions"),
    {
      metric: "Non-GAAP EPS",
      actual: epsActual,
      consensus: epsEstimate,
      unit: "eps",
      tag:
        epsSurprise === null ? "No consensus on file" : epsSurprise >= 0 ? "Beat" : "Miss",
      tagType: epsSurprise === null ? "na" : epsSurprise >= 0 ? "beat" : "miss",
      magnitude: epsSurprise,
    },
    noConsensus("Adjusted EBITA", null, "millions"),
    noConsensus("GAAP operating income", qCurr ? qCurr.operatingIncome : null, "millions"),
    noConsensus("GAAP net income", qCurr ? qCurr.netIncome : null, "millions"),
    noConsensus("Free cash flow", qCurr ? qCurr.fcf : null, "millions"),
  ];

  const yoyAvailable = Boolean(qCurr && priorIdentified);
  const yoyReason = !qCurr
    ? "EDGAR carries no quarterly XBRL facts for this filer, so the reported quarter cannot be identified."
    : !priorIdentified
      ? "EDGAR carries no facts for the same fiscal quarter one year earlier, so the prior-year quarter cannot be identified."
      : null;
  let yoy = [];
  let priorLabel = null;
  if (yoyAvailable) {
    priorLabel = qPrior.end ? "Quarter ended " + qPrior.end : null;
    const moneyRow = (metric, curr, prior, opts) => {
      const row = {
        metric,
        current: curr,
        prior,
        unit: (opts && opts.unit) || "millions",
        marginCurrent: null,
        marginPrior: null,
        changePct: growthPct(curr, prior),
        changeUnit: "pct",
        changeType: "neutral",
      };
      if (row.changePct !== null) {
        row.changeType = row.changePct > 0 ? "positive" : row.changePct < 0 ? "negative" : "neutral";
      }
      return row;
    };
    const costRow = moneyRow("Cost of revenue", qCurr.cost, qPrior.cost);
    costRow.marginCurrent = marginPct(qCurr.cost, qCurr.revenue);
    costRow.marginPrior = marginPct(qPrior.cost, qPrior.revenue);
    if (costRow.marginCurrent !== null && costRow.marginPrior !== null) {
      costRow.changePct = r1(costRow.marginCurrent - costRow.marginPrior);
      costRow.changeUnit = "pp";
      costRow.changeType =
        costRow.changePct > 0 ? "negative" : costRow.changePct < 0 ? "positive" : "neutral";
    } else {
      costRow.changePct = null;
    }
    const opRow = moneyRow("Income from operations (GAAP)", qCurr.operatingIncome, qPrior.operatingIncome);
    opRow.marginCurrent = marginPct(qCurr.operatingIncome, qCurr.revenue);
    opRow.marginPrior = marginPct(qPrior.operatingIncome, qPrior.revenue);
    const ebitdaRow = moneyRow("Adjusted EBITDA", null, null);
    ebitdaRow.marginCurrent = null;
    ebitdaRow.marginPrior = null;
    const ebitaRow = moneyRow("Adjusted EBITA", null, null);
    ebitaRow.marginCurrent = null;
    ebitaRow.marginPrior = null;
    yoy = [
      moneyRow("Revenue", qCurr.revenue, qPrior.revenue),
      costRow,
      opRow,
      ebitdaRow,
      ebitaRow,
      moneyRow("Net income (GAAP)", qCurr.netIncome, qPrior.netIncome),
      moneyRow("Diluted EPS (GAAP)", qCurr.dilutedEps, qPrior.dilutedEps, { unit: "eps" }),
      moneyRow("Operating cash flow", qCurr.ocf, qPrior.ocf),
      moneyRow("Capital expenditures", qCurr.capex, qPrior.capex),
      moneyRow("Free cash flow", qCurr.fcf, qPrior.fcf),
    ];
  }

  return {
    ticker,
    asOf: new Date().toISOString(),
    companyName,
    currency,
    currentLabel: qCurr && qCurr.end ? "Quarter ended " + qCurr.end : null,
    priorLabel,
    consensusMetrics,
    yoyAvailable,
    yoyReason,
    yoy,
  };
}

export async function onRequest(context) {
  const gate = await stockGate(context);
  if (gate.response) return gate.response;
  const { request } = context;
  const ticker = cleanTicker(request);
  if (!ticker) return missingTicker(request);

  try {
    const cikMap = await getCikMap(context);
    const cik = cikMap[ticker] || cikMap[ticker.replace(".", "-")] || null;
    let edgar = { tags: {}, entityName: null };
    if (cik) {
      try {
        edgar = await fetchEdgarStatements(cik);
      } catch (e) {
        return upstreamError(request, ticker, e);
      }
    }
    const currency =
      (edgar.tags.revenue && edgar.tags.revenue.unit) ||
      (edgar.tags.operatingIncome && edgar.tags.operatingIncome.unit) ||
      (edgar.tags.netIncome && edgar.tags.netIncome.unit) ||
      null;

    // Yahoo, best effort, for exactly: company name and EPS actual
    // versus estimate. A Yahoo failure leaves EPS as N/A but does not
    // drop the EDGAR tables.
    let companyName = edgar.entityName || ticker;
    let epsActual = null;
    let epsEstimate = null;
    try {
      const { crumb, cookies } = await getCrumb();
      const r = await quoteSummary(ticker, "price,earningsHistory,earningsTrend", crumb, cookies);
      const price = r.price || {};
      companyName = price.longName || price.shortName || companyName;
      const history = ((r.earningsHistory && r.earningsHistory.history) || [])
        .slice()
        .sort((a, b) => ((b.quarter && b.quarter.raw) || 0) - ((a.quarter && a.quarter.raw) || 0));
      if (history.length) {
        const resolved = resolveEdgarQuarters(edgar);
        const targetRaw = resolved.current && resolved.current.end
          ? Math.round(Date.parse(resolved.current.end) / 1000)
          : null;
        const matched = targetRaw
          ? matchWithin45(
              history.map((q) => ({ raw: q.quarter && q.quarter.raw, q })),
              targetRaw,
              "raw"
            )
          : null;
        const entry = matched ? matched.q : history[0];
        epsActual = num(entry.epsActual);
        epsEstimate = num(entry.epsEstimate);
      }
    } catch (e) {
      // Yahoo unavailable: EPS renders N/A, EDGAR tables still stand.
    }

    return dataJson(
      buildBenchmark(ticker, { companyName, currency, edgar, epsActual, epsEstimate }),
      request,
      3600
    );
  } catch (err) {
    return upstreamError(request, ticker, err);
  }
}
