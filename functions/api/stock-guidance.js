/**
 * Cascadia Analytics - Ticker Research, guidance and outlook (PRO)
 * GET /api/stock-guidance?ticker=AAPL
 *
 * Guidance and outlook readings for the on-demand research page. The page
 * serves any ticker, so this endpoint carries no per-ticker build and no
 * house model: every row is computed from Yahoo quoteSummary modules
 * behind the shared crumb flow, and every number carries its date.
 *
 * Design rules, set by the Task 6 adaptation review:
 *   - No management guidance is fabricated. Yahoo carries no management
 *     guidance text, so no sentence in this payload is presented as a
 *     management target, framework, or commitment. The table column is
 *     "Computed outlook": the actual computed figure plus its source and
 *     date. The intro states plainly that management guidance is not
 *     shown because these modules do not carry it.
 *   - No fallback percentages. Missing data renders as Unavailable with
 *     the reason, never as an invented number. The pasted spec's hardcoded
 *     fallbacks (12.0, 10.5, 15.0, 45.0, 18.0) and its sector templates
 *     are never shipped, quoted, or used as fallback.
 *   - Direction words are mechanical readings of the computed delta in
 *     the same row, with thresholds stated in code and in the section
 *     footnote: consensus drift plus or minus 2 percent, growth delta
 *     plus or minus 1 point, revenue change plus or minus 5 percent,
 *     margin delta plus or minus 1 point, capex change plus or minus
 *     10 percent. No canned judgment labels.
 *   - No verdict synthesis. The synthesis block is data readings only:
 *     forward growth, consensus and drift, margin and cash flow deltas,
 *     next earnings date, and market price. No sentence states a
 *     judgment the data does not compute, and no Yahoo target is
 *     presented as a house value. Coverage names link through to their
 *     analyst pages, where ratings and targets live; this page never
 *     shows them.
 *   - The spec's BABA verification example is illustrative editorial
 *     about one name. Its figures are never shipped, quoted, or used as
 *     data or fallbacks for any ticker.
 * Auth: Supabase JWT + profiles.is_pro via _auth.js (401 / 403).
 */

import {
  stockGate, cleanTicker, missingTicker, dataJson, upstreamError,
  getCrumb, quoteSummary, num, f2,
} from "./_stock.js";

const numAny = (o) => (typeof o === "number" ? o : num(o));

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

const fmtEps = (v) =>
  v === null || v === undefined ? "N/A" : "$" + v.toFixed(2);

// Direction rules. Every rule is a mechanical reading of the computed
// delta in the same row; thresholds are stated here and in the section
// footnote. Null input always yields Unavailable, never a guess.
const driftDir = (d) =>
  d === null || d === undefined ? "Unavailable" : d > 2 ? "Revised up" : d < -2 ? "Revised down" : "Stable";
const growthDeltaDir = (d) =>
  d === null || d === undefined ? "Unavailable" : d > 1 ? "Accelerating" : d < -1 ? "Decelerating" : "Steady";
const revenueChangeDir = (c) =>
  c === null || c === undefined ? "Unavailable" : c > 5 ? "Growing" : c < -5 ? "Contracting" : "Flat";
const marginDir = (d) =>
  d === null || d === undefined ? "Unavailable" : d > 1 ? "Expanding" : d < -1 ? "Contracting" : "Stable";
const capexDir = (chg) =>
  chg === null || chg === undefined ? "N/A (single quarter)" : chg > 10 ? "Rising" : chg < -10 ? "Falling" : "Steady";
const fcfDir = (fcf, prevFcf) => {
  if (fcf === null || fcf === undefined) return "Unavailable";
  if (prevFcf === null || prevFcf === undefined) return fcf > 0 ? "Positive" : "Negative";
  const improved = fcf - prevFcf >= 0;
  if (fcf > 0) return improved ? "Positive and improving" : "Positive but narrowing";
  return improved ? "Negative but improving" : "Negative and widening";
};

// Pure computation over one quoteSummary result, exported for testing.
// Returns the payload body (before the HTTP envelope).
export function buildGuidance(ticker, r) {
  const price = (r && r.price) || {};
  const profile = (r && r.summaryProfile) || {};
  const fin = (r && r.financialData) || {};
  const stats = (r && r.defaultKeyStatistics) || {};

  // Consensus trend blocks, mirroring the model-update endpoint parse.
  const trends = (r && r.earningsTrend && r.earningsTrend.trend) || [];
  const trendBlock = (period) => {
    const t = trends.find((x) => x.period === period);
    if (!t) return null;
    const est = t.earningsEstimate || {};
    const et = t.epsTrend || {};
    const er = t.epsRevisions || {};
    const curVal = num(est.avg);
    const ago90 = num(et["90daysAgo"]);
    const growth = num(t.growth);
    return {
      period,
      endDate: (t.endDate && t.endDate.fmt) || null,
      consensus: curVal,
      analysts: numAny(est.numberOfAnalysts),
      consensus90dAgo: ago90,
      drift90dPct:
        curVal !== null && ago90 !== null && ago90 !== 0
          ? f2(((curVal - ago90) / Math.abs(ago90)) * 100)
          : null,
      growthPct: growth !== null ? f2(growth * 100) : null,
      up7d: numAny(er.upLast7days),
      down7d: numAny(er.downLast7Days),
      up30d: numAny(er.upLast30days),
      down30d: numAny(er.downLast30days),
    };
  };
  const consensus = {
    quarter: trendBlock("0q"),
    nextQuarter: trendBlock("+1q"),
    year: trendBlock("0y"),
    nextYear: trendBlock("+1y"),
  };

  // Quarterly statements, newest first by end date. Order independent.
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
      const gp = num(s.grossProfit);
      const op = num(s.operatingIncome);
      return {
        endDate: isoDate(s.endDate && s.endDate.raw),
        revenue: rev,
        grossMargin: rev !== null && rev !== 0 && gp !== null ? f2((gp / rev) * 100) : null,
        opMargin: rev !== null && rev !== 0 && op !== null ? f2((op / rev) * 100) : null,
      };
    });
  const cur = stmts[0] || null;
  const prev = stmts[1] || null;
  const deltas =
    cur && prev
      ? {
          revenueChangePct:
            cur.revenue !== null && prev.revenue !== null && prev.revenue !== 0
              ? f2(((cur.revenue - prev.revenue) / Math.abs(prev.revenue)) * 100)
              : null,
          grossMarginDeltaPp:
            cur.grossMargin !== null && prev.grossMargin !== null
              ? f2(cur.grossMargin - prev.grossMargin)
              : null,
          opMarginDeltaPp:
            cur.opMargin !== null && prev.opMargin !== null ? f2(cur.opMargin - prev.opMargin) : null,
        }
      : null;

  // Quarterly cash flow, newest first by end date.
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
      return {
        endDate: isoDate(s.endDate && s.endDate.raw),
        ocf,
        capex,
        fcf: ocf !== null && capex !== null ? ocf - capex : null,
      };
    });
  const flowCur = flows[0] || null;
  const flowPrev = flows[1] || null;
  const annualizedCapex = flowCur && flowCur.capex !== null ? flowCur.capex * 4 : null;
  const annualizedCapexPrev = flowPrev && flowPrev.capex !== null ? flowPrev.capex * 4 : null;
  const capexChangePct =
    annualizedCapex !== null && annualizedCapexPrev !== null && annualizedCapexPrev !== 0
      ? f2(((annualizedCapex - annualizedCapexPrev) / Math.abs(annualizedCapexPrev)) * 100)
      : null;

  // Next earnings date from calendar events, when Yahoo carries one.
  let nextEarningsDate = null;
  const cal = r && r.calendarEvents;
  if (cal && Array.isArray(cal.earningsDate) && cal.earningsDate.length) {
    const first = cal.earningsDate[0];
    nextEarningsDate = (first && first.fmt) || isoDate(first && first.raw);
  }

  const trailingRevenueGrowthPct =
    fin.revenueGrowth && typeof fin.revenueGrowth.raw === "number"
      ? f2(fin.revenueGrowth.raw * 100)
      : null;

  const marketPrice = num(price.regularMarketPrice);
  const priceDate = isoDate(price.regularMarketTime && price.regularMarketTime.raw) || null;

  // Rows. Item, Computed outlook, Direction. Every outlook cell carries
  // its figure, source, and date; every direction is computed from the
  // figure in the same row. Unavailable rows carry the reason, never a
  // fabricated figure.
  const rows = [];
  let computedCount = 0;
  const push = (item, outlook, direction, computed) => {
    rows.push({ item, outlook, direction });
    if (computed) computedCount++;
  };

  // Forward growth: next-year consensus growth vs current-year growth.
  const ny = consensus.nextYear;
  const cy = consensus.year;
  if (ny && cy && ny.growthPct !== null && cy.growthPct !== null) {
    const delta = f2(ny.growthPct - cy.growthPct);
    push(
      "Forward revenue growth (consensus)",
      "Next-year growth estimate " +
        fmtPct(ny.growthPct) +
        " vs current-year growth estimate " +
        fmtPct(cy.growthPct) +
        " (Yahoo earningsTrend" +
        (ny.endDate ? ", next-year period ends " + ny.endDate : "") +
        (cy.endDate ? ", current-year period ends " + cy.endDate : "") +
        ").",
      growthDeltaDir(delta),
      true
    );
  } else {
    push(
      "Forward revenue growth (consensus)",
      "Unavailable: next-year or current-year growth estimate not returned in Yahoo earningsTrend for " + ticker + ".",
      "Unavailable",
      false
    );
  }

  // Consensus EPS rows, one per period, each with its own drift direction.
  const consensusRows = [
    ["Current quarter consensus", consensus.quarter],
    ["Next quarter consensus", consensus.nextQuarter],
    ["Current year consensus", consensus.year],
    ["Next year consensus", consensus.nextYear],
  ];
  for (const [label, b] of consensusRows) {
    if (b && b.consensus !== null) {
      push(
        label,
        "Consensus EPS " +
          fmtEps(b.consensus) +
          " (" +
          (b.analysts !== null ? b.analysts : "N/A") +
          " analysts; 90-day drift " +
          fmtPct(b.drift90dPct) +
          (b.endDate ? "; period ends " + b.endDate : "") +
          "; Yahoo earningsTrend).",
        driftDir(b.drift90dPct),
        true
      );
    } else {
      push(
        label,
        "Unavailable: no " + label.toLowerCase() + " entry with a consensus EPS in Yahoo earningsTrend for " + ticker + ".",
        "Unavailable",
        false
      );
    }
  }

  // Statement trend rows.
  if (deltas && cur && prev) {
    push(
      "Revenue trend",
      "Revenue " +
        fmtPct(deltas.revenueChangePct) +
        " vs prior quarter: " +
        fmtMoney(cur.revenue) +
        " (quarter ended " +
        (cur.endDate || "date unavailable") +
        ") vs " +
        fmtMoney(prev.revenue) +
        " (quarter ended " +
        (prev.endDate || "date unavailable") +
        "); quarterly statements.",
      revenueChangeDir(deltas.revenueChangePct),
      true
    );
    push(
      "Gross margin trend",
      "Gross margin " +
        (cur.grossMargin !== null ? cur.grossMargin.toFixed(1) + "%" : "N/A") +
        " vs " +
        (prev.grossMargin !== null ? prev.grossMargin.toFixed(1) + "%" : "N/A") +
        " (" +
        fmtPp(deltas.grossMarginDeltaPp) +
        "); quarters ended " +
        (cur.endDate || "date unavailable") +
        " vs " +
        (prev.endDate || "date unavailable") +
        ".",
      marginDir(deltas.grossMarginDeltaPp),
      true
    );
    push(
      "Operating margin trend",
      "Operating margin " +
        (cur.opMargin !== null ? cur.opMargin.toFixed(1) + "%" : "N/A") +
        " vs " +
        (prev.opMargin !== null ? prev.opMargin.toFixed(1) + "%" : "N/A") +
        " (" +
        fmtPp(deltas.opMarginDeltaPp) +
        "); quarters ended " +
        (cur.endDate || "date unavailable") +
        " vs " +
        (prev.endDate || "date unavailable") +
        ".",
      marginDir(deltas.opMarginDeltaPp),
      true
    );
  } else {
    push(
      "Revenue trend",
      "Unavailable: fewer than two quarterly statements returned for " + ticker + ", so no quarter over quarter revenue change is computed.",
      "Unavailable",
      false
    );
    push(
      "Gross margin trend",
      "Unavailable: fewer than two quarterly statements returned for " + ticker + ", so no gross margin delta is computed.",
      "Unavailable",
      false
    );
    push(
      "Operating margin trend",
      "Unavailable: fewer than two quarterly statements returned for " + ticker + ", so no operating margin delta is computed.",
      "Unavailable",
      false
    );
  }

  // Cash flow rows.
  if (flowCur) {
    push(
      "Free cash flow",
      "Quarterly free cash flow " +
        fmtMoney(flowCur.fcf) +
        " (operating cash flow " +
        fmtMoney(flowCur.ocf) +
        " less capex " +
        fmtMoney(flowCur.capex) +
        "; quarter ended " +
        (flowCur.endDate || "date unavailable") +
        ")" +
        (flowPrev && flowPrev.fcf !== null ? "; prior quarter free cash flow " + fmtMoney(flowPrev.fcf) + "." : "."),
      fcfDir(flowCur.fcf, flowPrev ? flowPrev.fcf : null),
      true
    );
  } else {
    push(
      "Free cash flow",
      "Unavailable: no quarterly cash flow statement returned for " + ticker + ".",
      "Unavailable",
      false
    );
  }

  if (annualizedCapex !== null) {
    push(
      "Capex run-rate",
      "Annualized capex run-rate " +
        fmtMoney(annualizedCapex) +
        " (quarterly capex " +
        fmtMoney(flowCur.capex) +
        "; quarter ended " +
        (flowCur.endDate || "date unavailable") +
        ")" +
        (annualizedCapexPrev !== null
          ? "; prior quarter annualized run-rate " + fmtMoney(annualizedCapexPrev) + " (" + fmtPct(capexChangePct) + ")."
          : "; no prior quarter capex returned, so no change is computed."),
      capexDir(capexChangePct),
      true
    );
  } else {
    push(
      "Capex run-rate",
      "Unavailable: no quarterly capex figure returned for " + ticker + ".",
      "Unavailable",
      false
    );
  }

  // Synthesis: data readings only, each dated. No verdict sentence.
  const synthesis = [];
  if (ny && cy && ny.growthPct !== null && cy.growthPct !== null) {
    synthesis.push(
      "Forward growth estimates (Yahoo earningsTrend): next-year " +
        fmtPct(ny.growthPct) +
        " vs current-year " +
        fmtPct(cy.growthPct) +
        ", a delta of " +
        fmtPp(f2(ny.growthPct - cy.growthPct)) +
        "."
    );
  }
  for (const [label, b] of consensusRows) {
    if (b && b.consensus !== null) {
      synthesis.push(
        label +
          ": consensus EPS " +
          fmtEps(b.consensus) +
          " (" +
          (b.analysts !== null ? b.analysts : "N/A") +
          " analysts), 90-day drift " +
          fmtPct(b.drift90dPct) +
          (b.endDate ? ", period ends " + b.endDate : "") +
          "."
      );
    }
  }
  if (deltas && cur && prev) {
    synthesis.push(
      "Quarterly statements, " +
        (cur.endDate || "date unavailable") +
        " vs " +
        (prev.endDate || "date unavailable") +
        ": revenue " +
        fmtPct(deltas.revenueChangePct) +
        ", gross margin " +
        fmtPp(deltas.grossMarginDeltaPp) +
        ", operating margin " +
        fmtPp(deltas.opMarginDeltaPp) +
        "."
    );
  }
  if (flowCur) {
    synthesis.push(
      "Cash flow, quarter ended " +
        (flowCur.endDate || "date unavailable") +
        ": operating cash flow " +
        fmtMoney(flowCur.ocf) +
        ", capex " +
        fmtMoney(flowCur.capex) +
        ", free cash flow " +
        fmtMoney(flowCur.fcf) +
        ", annualized capex run-rate " +
        fmtMoney(annualizedCapex) +
        "."
    );
  }
  if (trailingRevenueGrowthPct !== null) {
    synthesis.push(
      "Trailing quarterly revenue growth " + fmtPct(trailingRevenueGrowthPct) + " year over year (Yahoo financialData, not a forecast)."
    );
  }
  if (nextEarningsDate) {
    synthesis.push("Next earnings date carried by Yahoo calendar events: " + nextEarningsDate + ".");
  }
  if (marketPrice !== null) {
    synthesis.push(
      "Market price $" +
        marketPrice.toFixed(2) +
        (priceDate ? " as of " + priceDate : "") +
        "."
    );
  }

  return {
    ticker,
    asOf: new Date().toISOString(),
    available: true,
    companyName: price.longName || price.shortName || ticker,
    sector: profile.sector || null,
    price: marketPrice,
    priceDate,
    nextEarningsDate,
    trailingRevenueGrowthPct,
    consensus,
    deltas: deltas
      ? { current: cur, prior: prev, revenueChangePct: deltas.revenueChangePct, grossMarginDeltaPp: deltas.grossMarginDeltaPp, opMarginDeltaPp: deltas.opMarginDeltaPp }
      : null,
    cashflow: flowCur
      ? { current: flowCur, prior: flowPrev, annualizedCapex, annualizedCapexPrev, capexChangePct }
      : null,
    shares: {
      outstanding: num(stats.sharesOutstanding),
      float: num(stats.floatShares),
    },
    rows,
    synthesis,
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
      "price,summaryProfile,financialData,defaultKeyStatistics,earningsHistory,earningsTrend,incomeStatementHistoryQuarterly,cashflowStatementHistoryQuarterly,calendarEvents",
      crumb,
      cookies
    );
    return dataJson(buildGuidance(ticker, r), request, 1800);
  } catch (err) {
    return upstreamError(request, ticker, err);
  }
}
