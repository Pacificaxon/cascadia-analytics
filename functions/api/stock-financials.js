/**
 * Cascadia Analytics - Ticker Research, annual financial statements (PRO)
 * GET /api/stock-financials?ticker=AAPL
 *
 * Five years of annual income statement, balance sheet, and cash flow rows in
 * the exact shape app.js financialsHtml() consumes (raw dollars, capex stored
 * negative as a cash outflow, free cash flow = operating cash flow + capex).
 *
 * Primary source: SEC EDGAR company concepts (us-gaap), annual 10-K / 20-F /
 * 40-F facts only, latest filed value per fiscal year. Fallback: Yahoo
 * quoteSummary statement modules behind the house crumb flow, for filers
 * EDGAR cannot serve. Unreported line items stay null and render as N/A.
 * Auth: Supabase JWT + profiles.is_pro via _auth.js (401 / 403).
 */

import {
  stockGate, cleanTicker, missingTicker, dataJson, upstreamError,
  getCikMap, getCrumb, quoteSummary, num, SEC_UA,
} from "./_stock.js";

const ANNUAL_FORMS = /^(10-K|20-F|40-F)(\/A)?$/;

// us-gaap tag candidates per output row, first match with data wins.
const INCOME_TAGS = {
  revenue: [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
    "SalesRevenueGoodsNet",
  ],
  gross_profit: ["GrossProfit"],
  operating_income: ["OperatingIncomeLoss"],
  net_income: ["NetIncomeLoss", "ProfitLoss"],
  diluted_eps: ["EarningsPerShareDiluted"],
};
const DA_TAGS = ["DepreciationDepletionAndAmortization", "DepreciationAmortizationAndAccretionNet", "Depreciation"];
const BALANCE_TAGS = {
  total_assets: ["Assets"],
  total_liabilities: ["Liabilities"],
  total_equity: ["StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest", "StockholdersEquity"],
  cash: ["CashAndCashEquivalentsAtCarryingValue"],
  long_term_debt: ["LongTermDebtNoncurrent", "LongTermDebt"],
};
const DEBT_CURRENT_TAGS = ["LongTermDebtCurrent", "DebtCurrent", "ShortTermBorrowings"];
const DEBT_NONCURRENT_TAGS = ["LongTermDebtNoncurrent", "LongTermDebt"];
const CASHFLOW_TAGS = {
  operating_cash_flow: ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
  capex_paid: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
  financing_cash_flow: ["NetCashProvidedByUsedInFinancingActivities", "NetCashProvidedByUsedInFinancingActivitiesContinuingOperations"],
};

async function conceptFacts(cik, tag) {
  const url =
    "https://data.sec.gov/api/xbrl/companyconcept/CIK" + cik + "/us-gaap/" + tag + ".json";
  const res = await fetch(url, { headers: { "User-Agent": SEC_UA, Accept: "application/json" } });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error("EDGAR concept fetch failed: " + res.status);
  const json = await res.json();
  const units = json.units || {};
  const unitNames = Object.keys(units);
  if (!unitNames.length) return [];
  // Prefer USD (or USD/shares for per-share rows) when the filer reports in it.
  const preferred =
    unitNames.find((u) => u === "USD") ||
    unitNames.find((u) => u.indexOf("USD") === 0) ||
    unitNames[0];
  return (units[preferred] || []).map((e) => ({ ...e, _unit: preferred }));
}

// Annual facts only: fiscal-year focus, annual forms, duration of roughly a
// year for flow items. Per fiscal year the latest filed value wins (restated
// figures supersede the originals).
function annualByYear(facts, duration) {
  const byYear = {};
  for (const e of facts) {
    if (!e || typeof e.val !== "number" || !e.end) continue;
    if (e.fp !== "FY") continue;
    if (e.form && !ANNUAL_FORMS.test(e.form)) continue;
    if (duration) {
      if (!e.start) continue;
      const days = (Date.parse(e.end) - Date.parse(e.start)) / 86400000;
      if (!(days >= 300 && days <= 400)) continue;
    }
    const year = typeof e.fy === "number" ? e.fy : parseInt(String(e.end).slice(0, 4), 10);
    if (!year) continue;
    const prev = byYear[year];
    if (!prev || String(e.filed || "") >= String(prev.filed || "")) byYear[year] = e;
  }
  const out = {};
  for (const y of Object.keys(byYear)) out[y] = byYear[y].val;
  return out;
}

async function firstTagByYear(cik, tags, duration) {
  for (const tag of tags) {
    const facts = await conceptFacts(cik, tag);
    const byYear = annualByYear(facts, duration);
    if (Object.keys(byYear).length) return byYear;
  }
  return {};
}

async function edgarFinancials(cik) {
  const incomeKeys = Object.keys(INCOME_TAGS);
  const incomeMaps = {};
  for (const k of incomeKeys) incomeMaps[k] = await firstTagByYear(cik, INCOME_TAGS[k], true);
  const daMap = await firstTagByYear(cik, DA_TAGS, true);
  const balanceMaps = {};
  for (const k of Object.keys(BALANCE_TAGS)) balanceMaps[k] = await firstTagByYear(cik, BALANCE_TAGS[k], false);
  const debtCur = await firstTagByYear(cik, DEBT_CURRENT_TAGS, false);
  const debtNon = await firstTagByYear(cik, DEBT_NONCURRENT_TAGS, false);
  const cfMaps = {};
  for (const k of Object.keys(CASHFLOW_TAGS)) cfMaps[k] = await firstTagByYear(cik, CASHFLOW_TAGS[k], true);

  const yearsOf = (maps) => {
    const s = new Set();
    maps.forEach((m) => Object.keys(m).forEach((y) => s.add(Number(y))));
    return [...s].sort((a, b) => b - a).slice(0, 5);
  };
  const pick = (m, y) => (m && m[y] !== undefined ? m[y] : null);

  const income = yearsOf(incomeKeys.map((k) => incomeMaps[k])).map((y) => {
    const op = pick(incomeMaps.operating_income, y);
    const da = pick(daMap, y);
    return {
      year: y,
      revenue: pick(incomeMaps.revenue, y),
      gross_profit: pick(incomeMaps.gross_profit, y),
      operating_income: op,
      net_income: pick(incomeMaps.net_income, y),
      diluted_eps: pick(incomeMaps.diluted_eps, y),
      ebitda: op !== null && da !== null ? op + da : null,
    };
  });
  const balance = yearsOf([...Object.values(BALANCE_TAGS).map((_, i) => balanceMaps[Object.keys(BALANCE_TAGS)[i]]), debtCur, debtNon]).map((y) => {
    const cur = pick(debtCur, y);
    const non = pick(debtNon, y);
    return {
      year: y,
      total_assets: pick(balanceMaps.total_assets, y),
      total_liabilities: pick(balanceMaps.total_liabilities, y),
      total_equity: pick(balanceMaps.total_equity, y),
      cash: pick(balanceMaps.cash, y),
      long_term_debt: pick(balanceMaps.long_term_debt, y),
      total_debt: cur === null && non === null ? null : (cur || 0) + (non || 0),
    };
  });
  const cashflow = yearsOf(Object.keys(CASHFLOW_TAGS).map((k) => cfMaps[k])).map((y) => {
    const ocf = pick(cfMaps.operating_cash_flow, y);
    const paid = pick(cfMaps.capex_paid, y);
    const capex = paid !== null ? -Math.abs(paid) : null;
    return {
      year: y,
      operating_cash_flow: ocf,
      capex,
      financing_cash_flow: pick(cfMaps.financing_cash_flow, y),
      free_cash_flow: ocf !== null && capex !== null ? ocf + capex : null,
    };
  });
  return { income, balance, cashflow };
}

function yahooFinancials(r) {
  const yearOf = (stmt) => {
    const raw = stmt && stmt.endDate && stmt.endDate.raw;
    return raw ? new Date(raw * 1000).getUTCFullYear() : null;
  };
  const mapStmt = (arr, fn) =>
    (arr || [])
      .map(fn)
      .filter((row) => row.year)
      .sort((a, b) => b.year - a.year)
      .slice(0, 5);
  const income = mapStmt(r.incomeStatementHistory && r.incomeStatementHistory.incomeStatementHistory, (s) => ({
    year: yearOf(s),
    revenue: num(s.totalRevenue),
    // Yahoo zero-fills gross profit for thin filers that do not break it
    // out; a reported zero against real revenue is a gap, not a figure.
    gross_profit: num(s.grossProfit) === 0 && num(s.totalRevenue) ? null : num(s.grossProfit),
    operating_income: num(s.operatingIncome),
    net_income: num(s.netIncome),
    diluted_eps: num(s.dilutedEPS),
    ebitda: num(s.ebitda),
  }));
  const balance = mapStmt(r.balanceSheetHistory && r.balanceSheetHistory.balanceSheetStatements, (s) => {
    const lt = num(s.longTermDebt);
    const st = num(s.shortLongTermDebt);
    return {
      year: yearOf(s),
      total_assets: num(s.totalAssets),
      total_liabilities: num(s.totalLiab),
      total_equity: num(s.totalStockholderEquity),
      cash: num(s.cash),
      long_term_debt: lt,
      total_debt: lt === null && st === null ? null : (lt || 0) + (st || 0),
    };
  });
  const cashflow = mapStmt(r.cashflowStatementHistory && r.cashflowStatementHistory.cashflowStatements, (s) => {
    const ocf = num(s.totalCashFromOperatingActivities);
    const capex = num(s.capitalExpenditures);
    return {
      year: yearOf(s),
      operating_cash_flow: ocf,
      capex,
      financing_cash_flow: num(s.totalCashFromFinancingActivities),
      free_cash_flow: ocf !== null && capex !== null ? ocf + capex : null,
    };
  });
  return { income, balance, cashflow };
}

export async function onRequest(context) {
  const gate = await stockGate(context);
  if (gate.response) return gate.response;
  const { request } = context;
  const ticker = cleanTicker(request);
  if (!ticker) return missingTicker(request);

  let fin = null;
  let source = null;
  try {
    const cikMap = await getCikMap(context);
    const cik = cikMap[ticker];
    if (cik) {
      const ed = await edgarFinancials(cik);
      if (ed.income.filter((r) => r.revenue !== null || r.net_income !== null).length >= 2) {
        fin = ed;
        source = "SEC EDGAR company filings";
      }
    }
  } catch (e) {
    console.warn("stock-financials EDGAR path failed for " + ticker + ":", e.message);
  }
  if (!fin) {
    try {
      const { crumb, cookies } = await getCrumb();
      const r = await quoteSummary(
        ticker,
        "incomeStatementHistory,balanceSheetHistory,cashflowStatementHistory",
        crumb,
        cookies
      );
      fin = yahooFinancials(r);
      source = "company filings via Yahoo Finance";
    } catch (err) {
      return upstreamError(request, ticker, err);
    }
  }
  if (!fin.income.length && !fin.balance.length && !fin.cashflow.length) {
    return upstreamError(request, ticker, new Error("No annual statements found."));
  }
  return dataJson({ ticker, asOf: new Date().toISOString(), source, ...fin }, request, 86400);
}
