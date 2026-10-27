/**
 * Cascadia Analytics - Ticker Research, key performance indicators (PRO)
 * GET /api/stock-kpis?ticker=AAPL
 *
 * Key performance indicators for the on-demand research page. The page
 * serves any ticker, so this endpoint carries no per-ticker build and no
 * house model: every row is computed from Yahoo quoteSummary modules
 * behind the shared crumb flow, and every number carries its quarter
 * end date.
 *
 * Design rules, set by the Task 7 adaptation review:
 *   - No fabricated segment metrics. The pasted spec's rows built from
 *     revenue fractions (25 percent of revenue as AI revenue, 85 percent
 *     as ARR, 35 percent growing at revenue growth plus 8 points, 40
 *     percent of revenue growth as transaction growth) and its invented
 *     counts (64M tier-1 members, 650 institutional customers, retention
 *     above 115 percent) are never shipped, quoted, or used as fallback.
 *     The table carries only rows computed from returned statement data:
 *     revenue, gross margin, operating margin, capex, free cash flow,
 *     net cash, and buybacks. Neutral row names for every ticker; no
 *     sector-invented segment names.
 *   - No fallback percentages. Missing data renders as Unavailable with
 *     the reason, never an invented number. The pasted spec's hardcoded
 *     defaults (12.0, 3.2, 25) and its BABA verification example figures
 *     are never shipped, quoted, or used as data or fallbacks.
 *   - Yahoo zero-fill rule, copied from the model-update endpoint: Yahoo
 *     returns gross profit and operating income as raw 0 when the field
 *     is unpopulated in a quarterly statement. An exact 0 alongside
 *     nonzero revenue is a data gap, never a real 0.0% margin, so it
 *     maps to null and renders Unavailable.
 *   - No verdict language. The Detail column states computed deltas and
 *     dates only, never judgments, unless the row carries the number
 *     that computes that reading. No Yahoo target is presented as a
 *     house value. Coverage names link through to their analyst pages,
 *     where ratings and targets live; this page never shows them.
 * Auth: Supabase JWT + profiles.is_pro via _auth.js (401 / 403).
 */

import {
  stockGate, cleanTicker, missingTicker, dataJson, upstreamError,
  getCrumb, quoteSummary, num, f2,
} from "./_stock.js";

const isoDate = (raw) => {
  if (typeof raw !== "number" || !raw) return null;
  return new Date(raw * 1000).toISOString().slice(0, 10);
};

const fmtMoney = (v) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "N/A";
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 1e12) return sign + "$" + (a / 1e12).toFixed(2) + "T";
  if (a >= 1e9) return sign + "$" + (a / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return sign + "$" + (a / 1e6).toFixed(1) + "M";
  if (a >= 1e3) return sign + "$" + (a / 1e3).toFixed(1) + "K";
  return sign + "$" + a.toFixed(0);
};

const fmtPct = (v) =>
  v === null || v === undefined ? "N/A" : (v >= 0 ? "+" : "") + v.toFixed(1) + "%";

const fmtPp = (v) =>
  v === null || v === undefined ? "N/A" : (v >= 0 ? "+" : "") + v.toFixed(1) + " pp";

const pctChange = (cur, prev) =>
  cur !== null && prev !== null && prev !== 0
    ? f2(((cur - prev) / Math.abs(prev)) * 100)
    : null;

// Pure computation over one quoteSummary result, exported for testing.
// Returns the payload body (before the HTTP envelope).
export function buildKpis(ticker, r) {
  const price = (r && r.price) || {};

  // Quarterly income statements, newest first by end date. Order
  // independent. Yahoo zero-fills gross profit and operating income
  // when the field is unpopulated: an exact 0 alongside nonzero revenue
  // maps to null, never a false 0.0% margin.
  const stmts = (
    (r &&
      r.incomeStatementHistoryQuarterly &&
      r.incomeStatementHistoryQuarterly.incomeStatementHistory) ||
    []
  )
    .slice()
    .sort((a, b) => ((b.endDate && b.endDate.raw) || 0) - ((a.endDate && a.endDate.raw) || 0))
    .map((s) => {
      const rev = num(s.totalRevenue);
      const gpRaw = num(s.grossProfit);
      const opRaw = num(s.operatingIncome);
      const gp = gpRaw === 0 ? null : gpRaw;
      const op = opRaw === 0 ? null : opRaw;
      return {
        endDate: isoDate(s.endDate && s.endDate.raw),
        revenue: rev,
        grossMargin: rev !== null && rev !== 0 && gp !== null ? f2((gp / rev) * 100) : null,
        opMargin: rev !== null && rev !== 0 && op !== null ? f2((op / rev) * 100) : null,
      };
    });
  const cur = stmts[0] || null;
  const prev = stmts[1] || null;
  const yearAgo = stmts[3] || null;

  // Quarterly cash flow statements, newest first by end date. Capex is
  // returned as a negative outflow, so it is absolutized. Buybacks come
  // from repurchaseOfStock where the statement carries it; an absent
  // field is Unavailable, never a revenue fraction.
  const flows = (
    (r &&
      r.cashflowStatementHistoryQuarterly &&
      r.cashflowStatementHistoryQuarterly.cashflowStatements) ||
    []
  )
    .slice()
    .sort((a, b) => ((b.endDate && b.endDate.raw) || 0) - ((a.endDate && a.endDate.raw) || 0))
    .map((s) => {
      const ocf = num(s.totalCashFromOperatingActivities);
      const capexRaw = num(s.capitalExpenditures);
      const capex = capexRaw === null ? null : Math.abs(capexRaw);
      const rep = num(s.repurchaseOfStock);
      const repAlt = rep === null ? num(s.commonStockRepurchased) : null;
      const buybacksRaw = rep !== null ? rep : repAlt;
      const buybacks = buybacksRaw === null ? null : Math.abs(buybacksRaw);
      return {
        endDate: isoDate(s.endDate && s.endDate.raw),
        ocf,
        capex,
        fcf: ocf !== null && capex !== null ? ocf - capex : null,
        buybacks,
      };
    });
  const flowCur = flows[0] || null;
  const flowPrev = flows[1] || null;
  const flowYearAgo = flows[3] || null;

  // Quarterly balance sheets, newest first by end date. Net cash is
  // cash plus short-term investments less total debt; any missing
  // component makes net cash Unavailable with the component named.
  const sheets = (
    (r &&
      r.balanceSheetHistoryQuarterly &&
      r.balanceSheetHistoryQuarterly.balanceSheetStatements) ||
    []
  )
    .slice()
    .sort((a, b) => ((b.endDate && b.endDate.raw) || 0) - ((a.endDate && a.endDate.raw) || 0))
    .map((s) => {
      const cashRaw = num(s.cash);
      const cash = cashRaw !== null ? cashRaw : num(s.totalCash);
      const sti = num(s.shortTermInvestments);
      const debtRaw = num(s.totalDebt);
      const debt = debtRaw !== null ? debtRaw : num(s.longTermDebt);
      return {
        endDate: isoDate(s.endDate && s.endDate.raw),
        cash,
        sti,
        debt,
        netCash: cash !== null && sti !== null && debt !== null ? cash + sti - debt : null,
      };
    });
  const balCur = sheets[0] || null;

  // Rows. KPI, This Q, Detail. Every detail carries its figure, source
  // statement, and quarter end date. Unavailable rows carry the reason.
  const rows = [];
  let computedCount = 0;
  const push = (kpi, thisQ, detail, computed) => {
    rows.push({ kpi, thisQ, detail });
    if (computed) computedCount++;
  };

  // Revenue with quarter over quarter and year over year change.
  if (cur && cur.revenue !== null) {
    const qoq = prev ? pctChange(cur.revenue, prev.revenue) : null;
    const yoy = yearAgo ? pctChange(cur.revenue, yearAgo.revenue) : null;
    let detail = "Quarter ended " + (cur.endDate || "date unavailable") + ".";
    if (prev && prev.revenue !== null) {
      detail +=
        " Change " +
        fmtPct(qoq) +
        " vs prior quarter (" +
        fmtMoney(prev.revenue) +
        ", ended " +
        (prev.endDate || "date unavailable") +
        ").";
    } else {
      detail += " Prior quarter statement not returned, so no quarter over quarter change is computed.";
    }
    if (yearAgo && yearAgo.revenue !== null) {
      detail +=
        " Change " +
        fmtPct(yoy) +
        " vs year-ago quarter (" +
        fmtMoney(yearAgo.revenue) +
        ", ended " +
        (yearAgo.endDate || "date unavailable") +
        ").";
    } else {
      detail += " Year-ago quarter statement not returned, so no year over year change is computed.";
    }
    push("Revenue", fmtMoney(cur.revenue), detail, true);
  } else {
    push(
      "Revenue",
      "Unavailable",
      "Unavailable: no quarterly revenue figure returned for " + ticker + ".",
      false
    );
  }

  // Gross margin with prior-quarter delta.
  if (cur && cur.grossMargin !== null) {
    let detail = "Quarter ended " + (cur.endDate || "date unavailable") + ".";
    if (prev && prev.grossMargin !== null) {
      detail +=
        " Change " +
        fmtPp(f2(cur.grossMargin - prev.grossMargin)) +
        " vs prior quarter (" +
        prev.grossMargin.toFixed(1) +
        "%, ended " +
        (prev.endDate || "date unavailable") +
        ").";
    } else {
      detail += " Prior quarter gross margin not returned, so no delta is computed.";
    }
    push("Gross margin", cur.grossMargin.toFixed(1) + "%", detail, true);
  } else {
    push(
      "Gross margin",
      "Unavailable",
      "Unavailable: gross profit not returned for the latest quarter for " + ticker + ".",
      false
    );
  }

  // Operating margin with prior-quarter delta.
  if (cur && cur.opMargin !== null) {
    let detail = "Quarter ended " + (cur.endDate || "date unavailable") + ".";
    if (prev && prev.opMargin !== null) {
      detail +=
        " Change " +
        fmtPp(f2(cur.opMargin - prev.opMargin)) +
        " vs prior quarter (" +
        prev.opMargin.toFixed(1) +
        "%, ended " +
        (prev.endDate || "date unavailable") +
        ").";
    } else {
      detail += " Prior quarter operating margin not returned, so no delta is computed.";
    }
    push("Operating margin", cur.opMargin.toFixed(1) + "%", detail, true);
  } else {
    push(
      "Operating margin",
      "Unavailable",
      "Unavailable: operating income not returned for the latest quarter for " + ticker + ".",
      false
    );
  }

  // Capex with prior-quarter and year-ago change.
  if (flowCur && flowCur.capex !== null) {
    const qoq = flowPrev ? pctChange(flowCur.capex, flowPrev.capex) : null;
    const yoy = flowYearAgo ? pctChange(flowCur.capex, flowYearAgo.capex) : null;
    let detail = "Quarter ended " + (flowCur.endDate || "date unavailable") + ".";
    if (flowPrev && flowPrev.capex !== null) {
      detail +=
        " Change " +
        fmtPct(qoq) +
        " vs prior quarter (" +
        fmtMoney(flowPrev.capex) +
        ").";
    } else {
      detail += " Prior quarter capex not returned, so no quarter over quarter change is computed.";
    }
    if (flowYearAgo && flowYearAgo.capex !== null) {
      detail +=
        " Change " +
        fmtPct(yoy) +
        " vs year-ago quarter (" +
        fmtMoney(flowYearAgo.capex) +
        ").";
    } else {
      detail += " Year-ago quarter capex not returned, so no year over year change is computed.";
    }
    push("Capital expenditures", fmtMoney(flowCur.capex), detail, true);
  } else {
    push(
      "Capital expenditures",
      "Unavailable",
      "Unavailable: no quarterly capex figure returned for " + ticker + ".",
      false
    );
  }

  // Free cash flow with components and prior-quarter comparison.
  if (flowCur && flowCur.fcf !== null) {
    let detail =
      "Operating cash flow " +
      fmtMoney(flowCur.ocf) +
      " less capex " +
      fmtMoney(flowCur.capex) +
      "; quarter ended " +
      (flowCur.endDate || "date unavailable") +
      ".";
    if (flowPrev && flowPrev.fcf !== null) {
      detail += " Prior quarter free cash flow " + fmtMoney(flowPrev.fcf) + ".";
    } else {
      detail += " Prior quarter free cash flow not returned, so no comparison is computed.";
    }
    push("Free cash flow", fmtMoney(flowCur.fcf), detail, true);
  } else {
    push(
      "Free cash flow",
      "Unavailable",
      "Unavailable: operating cash flow or capex not returned for the latest quarter for " + ticker + ".",
      false
    );
  }

  // Net cash from the latest balance sheet, components named.
  if (balCur && balCur.netCash !== null) {
    push(
      "Net cash",
      fmtMoney(balCur.netCash),
      "Cash " +
        fmtMoney(balCur.cash) +
        " plus short-term investments " +
        fmtMoney(balCur.sti) +
        " less total debt " +
        fmtMoney(balCur.debt) +
        "; balance sheet date " +
        (balCur.endDate || "date unavailable") +
        ".",
      true
    );
  } else if (balCur) {
    const missing = [];
    if (balCur.cash === null) missing.push("cash");
    if (balCur.sti === null) missing.push("short-term investments");
    if (balCur.debt === null) missing.push("total debt");
    push(
      "Net cash",
      "Unavailable",
      "Unavailable: " +
        missing.join(", ") +
        " not returned in the latest balance sheet statement for " +
        ticker +
        ", so net cash is not computed.",
      false
    );
  } else {
    push(
      "Net cash",
      "Unavailable",
      "Unavailable: no quarterly balance sheet statement returned for " + ticker + ".",
      false
    );
  }

  // Buybacks from the latest cash flow statement.
  if (flowCur && flowCur.buybacks !== null) {
    push(
      "Share buybacks",
      fmtMoney(flowCur.buybacks),
      "Shares repurchased in the quarter ended " +
        (flowCur.endDate || "date unavailable") +
        " (Yahoo cash flow statement, repurchase of stock).",
      true
    );
  } else {
    push(
      "Share buybacks",
      "Unavailable",
      "Unavailable: no share repurchase figure returned in the latest quarterly cash flow statement for " + ticker + ".",
      false
    );
  }

  const marketPrice = num(price.regularMarketPrice);
  const priceDate = isoDate(price.regularMarketTime && price.regularMarketTime.raw) || null;

  return {
    ticker,
    asOf: new Date().toISOString(),
    available: true,
    companyName: price.longName || price.shortName || ticker,
    currency: price.currency || "USD",
    price: marketPrice,
    priceDate,
    statementDates: {
      income: cur ? cur.endDate : null,
      incomePrior: prev ? prev.endDate : null,
      incomeYearAgo: yearAgo ? yearAgo.endDate : null,
      cashflow: flowCur ? flowCur.endDate : null,
      balanceSheet: balCur ? balCur.endDate : null,
    },
    rows,
    hasReadings: computedCount > 0,
  };
}

export async function onRequest(context) {
  const gate = await stockGate(context);
  if (gate.response) return gate.response;
  const { request } = context;
  const ticker = cleanTicker(request);
  if (!ticker) return missingTicker(request);

  try {
    const { crumb, cookies } = await getCrumb();
    const r = await quoteSummary(
      ticker,
      "price,incomeStatementHistoryQuarterly,cashflowStatementHistoryQuarterly,balanceSheetHistoryQuarterly",
      crumb,
      cookies
    );
    return dataJson(buildKpis(ticker, r), request, 1800);
  } catch (err) {
    return upstreamError(request, ticker, err);
  }
}
