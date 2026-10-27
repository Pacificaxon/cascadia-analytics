/**
 * Cascadia Analytics - Ticker Research, financial model adjustments (PRO)
 * GET /api/stock-model-update?ticker=AAPL
 *
 * Post-earnings model update matrix for the on-demand research page. The
 * page serves any ticker, so this endpoint carries no per-ticker build and
 * no house model: every row is computed from Yahoo quoteSummary modules
 * behind the shared crumb flow, and every number carries its date.
 *
 * Design rules, set by the Task 2 adaptation review:
 *   - Prior assumption is never invented. The research page carries no
 *     house model, and DCF scenario paths are multi-year projections, not
 *     prior assumptions for the just reported print, so the column reads
 *     "No house model" for every row and every ticker. The table leads
 *     with the reported print and the consensus trend instead.
 *   - No verdict synthesis. The synthesis block is data readings only:
 *     print versus consensus, margin and cash flow deltas, revision drift,
 *     share context, and market price. No sentence states a judgment the
 *     data does not compute, and no Yahoo target is presented as a house
 *     value. Coverage names link through to their analyst pages, where
 *     ratings and targets live; this page never shows them.
 *   - Missing data renders as unavailable with the reason, never as a
 *     fabricated row. The sample table from the pasted spec is
 *     illustrative only and is never shipped, quoted, or used as fallback.
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

const NO_MODEL = "No house model";

// Pure computation over one quoteSummary result, exported for testing.
// Returns the payload body (before the HTTP envelope).
export function buildModelUpdate(ticker, r) {
  const price = (r && r.price) || {};
  const fin = (r && r.financialData) || {};
  const stats = (r && r.defaultKeyStatistics) || {};

  // Latest reported quarter: earnings history sorted newest first, first
  // entry carrying an actual EPS.
  const history = ((r && r.earningsHistory && r.earningsHistory.history) || [])
    .slice()
    .sort((a, b) => ((b.quarter && b.quarter.raw) || 0) - ((a.quarter && a.quarter.raw) || 0));
  let latestPrint = null;
  for (const q of history) {
    const act = num(q.epsActual);
    if (act === null) continue;
    const est = num(q.epsEstimate);
    latestPrint = {
      quarterEnd: isoDate(q.quarter && q.quarter.raw),
      quarterRaw: (q.quarter && q.quarter.raw) || null,
      epsActual: f2(act),
      epsEstimate: f2(est),
      surprisePct:
        est !== null && est !== 0 ? f2(((act - est) / Math.abs(est)) * 100) : null,
    };
    break;
  }

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
      // Yahoo zero-fills gross profit and operating income when the field
      // is unpopulated in a quarterly statement. An exact 0 alongside
      // nonzero revenue is a data gap, never a real 0.0% margin, so it
      // renders as unavailable rather than a false margin.
      const gpRaw = num(s.grossProfit);
      const opRaw = num(s.operatingIncome);
      const gp = gpRaw === 0 ? null : gpRaw;
      const op = opRaw === 0 ? null : opRaw;
      return {
        endDate: isoDate(s.endDate && s.endDate.raw),
        endRaw: (s.endDate && s.endDate.raw) || null,
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

  // Match the newest statement to the reported quarter when the end dates
  // sit within 45 days, the same tolerance the earnings endpoint uses.
  let printRevenue = null;
  let printSameQuarter = false;
  if (latestPrint && cur) {
    if (
      latestPrint.quarterRaw &&
      cur.endRaw &&
      Math.abs(latestPrint.quarterRaw - cur.endRaw) <= 45 * 86400
    ) {
      printRevenue = cur.revenue;
      printSameQuarter = true;
    }
  }

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

  const shares = {
    outstanding: num(stats.sharesOutstanding),
    float: num(stats.floatShares),
  };

  // Consensus revisions, mirroring the earnings endpoint parse exactly.
  const trends = (r && r.earningsTrend && r.earningsTrend.trend) || [];
  const revBlock = (period) => {
    const t = trends.find((x) => x.period === period);
    if (!t) return null;
    const est = t.earningsEstimate || {};
    const et = t.epsTrend || {};
    const er = t.epsRevisions || {};
    const curVal = num(est.avg);
    const ago90 = num(et["90daysAgo"]);
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
      up7d: numAny(er.upLast7days),
      down7d: numAny(er.downLast7Days),
      up30d: numAny(er.upLast30days),
      down30d: numAny(er.downLast30days),
    };
  };
  const revisions = { quarter: revBlock("0q"), annual: revBlock("0y") };

  const trailingRevenueGrowthPct =
    fin.revenueGrowth && typeof fin.revenueGrowth.raw === "number"
      ? f2(fin.revenueGrowth.raw * 100)
      : null;

  const marketPrice = num(price.regularMarketPrice);
  const priceDate =
    isoDate(price.regularMarketTime && price.regularMarketTime.raw) || null;

  // Rows. Suggested change and reason are computed from the readings
  // above; prior assumption is never inferred from a scenario path.
  const rows = [];

  if (latestPrint) {
    const revPart =
      printRevenue !== null
        ? "; revenue " +
          fmtMoney(printRevenue) +
          (printSameQuarter
            ? ""
            : " (newest statement, ended " + (cur.endDate || "date unavailable") + ")")
        : "";
    rows.push({
      item: "Latest reported print",
      priorAssumption: NO_MODEL,
      suggestedChange:
        "EPS " +
        fmtEps(latestPrint.epsActual) +
        " vs " +
        fmtEps(latestPrint.epsEstimate) +
        " est. (surprise " +
        fmtPct(latestPrint.surprisePct) +
        ")" +
        revPart,
      reason:
        "Latest reported quarter from Yahoo earnings history, ended " +
        (latestPrint.quarterEnd || "date unavailable") +
        ". Revenue estimates are not carried in these modules, so no revenue surprise is computed.",
    });
  } else {
    rows.push({
      item: "Latest reported print",
      priorAssumption: NO_MODEL,
      suggestedChange: "Unavailable",
      reason: "No reported quarter with an actual EPS in the fetched earnings history for " + ticker + ".",
    });
  }

  if (deltas && cur && prev) {
    rows.push({
      item: "Revenue and margin trend",
      priorAssumption: NO_MODEL,
      suggestedChange:
        "Revenue " +
        fmtPct(deltas.revenueChangePct) +
        " vs prior quarter; gross margin " +
        fmtPp(deltas.grossMarginDeltaPp) +
        "; operating margin " +
        fmtPp(deltas.opMarginDeltaPp),
      reason:
        "Quarterly statements ended " +
        (cur.endDate || "date unavailable") +
        " vs " +
        (prev.endDate || "date unavailable") +
        ": revenue " +
        fmtMoney(cur.revenue) +
        " vs " +
        fmtMoney(prev.revenue) +
        ", gross margin " +
        (cur.grossMargin !== null ? cur.grossMargin.toFixed(1) + "%" : "N/A") +
        " vs " +
        (prev.grossMargin !== null ? prev.grossMargin.toFixed(1) + "%" : "N/A") +
        ", operating margin " +
        (cur.opMargin !== null ? cur.opMargin.toFixed(1) + "%" : "N/A") +
        " vs " +
        (prev.opMargin !== null ? prev.opMargin.toFixed(1) + "%" : "N/A") +
        ".",
    });
  } else {
    rows.push({
      item: "Revenue and margin trend",
      priorAssumption: NO_MODEL,
      suggestedChange: "Unavailable",
      reason: "Fewer than two quarterly statements returned for " + ticker + ", so no quarter over quarter delta is computed.",
    });
  }

  if (flowCur) {
    rows.push({
      item: "Cash flow and capex",
      priorAssumption: NO_MODEL,
      suggestedChange:
        "Quarterly free cash flow " +
        fmtMoney(flowCur.fcf) +
        " (operating cash flow " +
        fmtMoney(flowCur.ocf) +
        " less capex " +
        fmtMoney(flowCur.capex) +
        "); annualized capex run-rate " +
        fmtMoney(annualizedCapex),
      reason:
        "Quarterly cash flow statement ended " +
        (flowCur.endDate || "date unavailable") +
        (flowPrev && flowPrev.fcf !== null
          ? "; prior quarter free cash flow " + fmtMoney(flowPrev.fcf) + "."
          : "."),
    });
  } else {
    rows.push({
      item: "Cash flow and capex",
      priorAssumption: NO_MODEL,
      suggestedChange: "Unavailable",
      reason: "No quarterly cash flow statement returned for " + ticker + ".",
    });
  }

  if (shares.outstanding !== null || shares.float !== null) {
    rows.push({
      item: "Share count",
      priorAssumption: NO_MODEL,
      suggestedChange:
        "Shares outstanding " +
        (shares.outstanding !== null ? (shares.outstanding / 1e9).toFixed(2) + "B" : "N/A") +
        "; float " +
        (shares.float !== null ? (shares.float / 1e9).toFixed(2) + "B" : "N/A"),
      reason: "No prior-period share count in the fetched modules, so no drift is computed.",
    });
  } else {
    rows.push({
      item: "Share count",
      priorAssumption: NO_MODEL,
      suggestedChange: "Unavailable",
      reason: "No share count returned in the fetched modules for " + ticker + ".",
    });
  }

  if (revisions.quarter || revisions.annual) {
    const qPart = revisions.quarter
      ? "Current-quarter consensus EPS " +
        fmtEps(revisions.quarter.consensus) +
        " (" +
        (revisions.quarter.analysts !== null ? revisions.quarter.analysts : "N/A") +
        " analysts, 90-day drift " +
        fmtPct(revisions.quarter.drift90dPct) +
        ")"
      : "Current-quarter consensus unavailable";
    const yPart = revisions.annual
      ? "Current-year consensus EPS " +
        fmtEps(revisions.annual.consensus) +
        " (" +
        (revisions.annual.analysts !== null ? revisions.annual.analysts : "N/A") +
        " analysts, 90-day drift " +
        fmtPct(revisions.annual.drift90dPct) +
        ")"
      : "Current-year consensus unavailable";
    rows.push({
      item: "Consensus revisions",
      priorAssumption: NO_MODEL,
      suggestedChange: qPart + "; " + yPart + ".",
      reason: "Yahoo earningsTrend, current quarter and current year periods.",
    });
  } else {
    rows.push({
      item: "Consensus revisions",
      priorAssumption: NO_MODEL,
      suggestedChange: "Unavailable",
      reason: "No current quarter or current year trend entry returned for " + ticker + ".",
    });
  }

  if (trailingRevenueGrowthPct !== null) {
    rows.push({
      item: "Trailing revenue growth",
      priorAssumption: NO_MODEL,
      suggestedChange:
        "Trailing quarterly revenue growth " + fmtPct(trailingRevenueGrowthPct) + " year over year.",
      reason: "Yahoo financialData trailing reading, not a forecast.",
    });
  } else {
    rows.push({
      item: "Trailing revenue growth",
      priorAssumption: NO_MODEL,
      suggestedChange: "Unavailable",
      reason: "financialData revenue growth not returned for " + ticker + ".",
    });
  }

  // Synthesis: data readings only, each dated. No verdict sentence.
  const synthesis = [];
  if (latestPrint) {
    synthesis.push(
      "Latest print, quarter ended " +
        (latestPrint.quarterEnd || "date unavailable") +
        ": EPS " +
        fmtEps(latestPrint.epsActual) +
        " vs " +
        fmtEps(latestPrint.epsEstimate) +
        " consensus, surprise " +
        fmtPct(latestPrint.surprisePct) +
        "."
    );
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
  if (shares.outstanding !== null || shares.float !== null) {
    synthesis.push(
      "Shares outstanding " +
        (shares.outstanding !== null ? (shares.outstanding / 1e9).toFixed(2) + "B" : "N/A") +
        "; float " +
        (shares.float !== null ? (shares.float / 1e9).toFixed(2) + "B" : "N/A") +
        ". No drift computed."
    );
  }
  if (revisions.quarter || revisions.annual) {
    const parts = [];
    if (revisions.quarter) {
      parts.push(
        "current-quarter consensus EPS " +
          fmtEps(revisions.quarter.consensus) +
          ", 90-day drift " +
          fmtPct(revisions.quarter.drift90dPct)
      );
    }
    if (revisions.annual) {
      parts.push(
        "current-year consensus EPS " +
          fmtEps(revisions.annual.consensus) +
          ", 90-day drift " +
          fmtPct(revisions.annual.drift90dPct)
      );
    }
    synthesis.push("Consensus revisions: " + parts.join("; ") + ".");
  }
  if (trailingRevenueGrowthPct !== null) {
    synthesis.push(
      "Trailing quarterly revenue growth " + fmtPct(trailingRevenueGrowthPct) + " year over year."
    );
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
    price: marketPrice,
    priceDate,
    latestPrint,
    deltas: deltas
      ? { current: cur, prior: prev, revenueChangePct: deltas.revenueChangePct, grossMarginDeltaPp: deltas.grossMarginDeltaPp, opMarginDeltaPp: deltas.opMarginDeltaPp }
      : null,
    cashflow: flowCur
      ? { current: flowCur, prior: flowPrev, annualizedCapex }
      : null,
    shares,
    revisions,
    trailingRevenueGrowthPct,
    rows,
    synthesis,
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
      "price,earningsHistory,incomeStatementHistoryQuarterly,cashflowStatementHistoryQuarterly,earningsTrend,defaultKeyStatistics,financialData",
      crumb,
      cookies
    );
    return dataJson(buildModelUpdate(ticker, r), request, 1800);
  } catch (err) {
    return upstreamError(request, ticker, err);
  }
}
