/**
 * Cascadia Analytics - Ticker Research, earnings record (PRO)
 * GET /api/stock-earnings?ticker=AAPL
 *
 * Next scheduled earnings date plus the last four reported quarters (EPS
 * estimate versus actual, surprise percent computed from the two, revenue
 * actuals from the quarterly income statement). Sourced from Yahoo
 * quoteSummary behind the house crumb flow, the same data
 * collect_earnings_dashboard.py builds on. Yahoo does not carry per-quarter
 * revenue estimates or announcement dates in these modules, so revenue
 * estimate and one-day reaction return null and render as N/A rather than
 * being approximated from the fiscal quarter end date.
 * Auth: Supabase JWT + profiles.is_pro via _auth.js (401 / 403).
 */

import {
  stockGate, cleanTicker, missingTicker, dataJson, upstreamError,
  getCrumb, quoteSummary, num, f2,
} from "./_stock.js";

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
      "calendarEvents,earningsHistory,incomeStatementHistoryQuarterly",
      crumb,
      cookies
    );

    const cal = (r.calendarEvents && r.calendarEvents.earnings) || {};
    const nextDates = cal.earningsDate || [];
    const next = nextDates.length ? nextDates[0] : null;

    // Quarterly revenue actuals keyed by statement end date (unix seconds).
    const revByEnd = {};
    const qInc =
      (r.incomeStatementHistoryQuarterly &&
        r.incomeStatementHistoryQuarterly.incomeStatementHistory) ||
      [];
    for (const s of qInc) {
      const end = s.endDate && s.endDate.raw;
      if (end) revByEnd[end] = num(s.totalRevenue);
    }
    const revFor = (quarterRaw) => {
      if (!quarterRaw) return null;
      if (revByEnd[quarterRaw] !== undefined) return revByEnd[quarterRaw];
      // Statement end dates can sit a few days off the earningsHistory
      // quarter stamp; accept the closest statement within 45 days.
      let best = null;
      let bestDiff = 45 * 86400;
      for (const end of Object.keys(revByEnd)) {
        const diff = Math.abs(Number(end) - quarterRaw);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = revByEnd[end];
        }
      }
      return best;
    };

    const history = ((r.earningsHistory && r.earningsHistory.history) || [])
      .slice()
      .sort((a, b) => ((b.quarter && b.quarter.raw) || 0) - ((a.quarter && a.quarter.raw) || 0))
      .slice(0, 4)
      .map((q) => {
        const est = num(q.epsEstimate);
        const act = num(q.epsActual);
        const surprise =
          est !== null && act !== null && est !== 0 ? f2(((act - est) / Math.abs(est)) * 100) : null;
        return {
          quarter: (q.quarter && q.quarter.fmt) || null,
          quarterEnd: q.quarter && q.quarter.raw ? new Date(q.quarter.raw * 1000).toISOString().slice(0, 10) : null,
          epsEstimate: f2(est),
          epsActual: f2(act),
          surprisePercent: surprise,
          revenueEstimate: null,
          revenueActual: revFor(q.quarter && q.quarter.raw),
          reaction1d: null,
        };
      });

    return dataJson(
      {
        ticker,
        asOf: new Date().toISOString(),
        nextEarningsDate: next ? next.fmt || null : null,
        nextEarningsDateRaw: next ? next.raw || null : null,
        quarters: history,
      },
      request,
      3600
    );
  } catch (err) {
    return upstreamError(request, ticker, err);
  }
}
