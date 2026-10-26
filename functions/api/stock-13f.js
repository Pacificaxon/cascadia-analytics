/**
 * Cascadia Analytics - Ticker Research, institutional holdings (PRO)
 * GET /api/stock-13f?ticker=AAPL
 *
 * Current top institutional holders from Nasdaq's institutional holdings
 * API, mirroring the house collect_13f.py fetch exactly: the
 * /api/company/{ticker}/institutional-holdings path with
 * ?assetclass=stocks&limit=50, parsed from
 * data.holdingsTransactions.table.rows. (The /api/quote/... variant of
 * this path 404s, which is why the section first shipped unavailable.)
 * An unrecognized shape surfaces an upstream error rather than a
 * fabricated table, so the section renders unavailable instead of wrong.
 * Auth: Supabase JWT + profiles.is_pro via _auth.js (401 / 403).
 */

import {
  stockGate, cleanTicker, missingTicker, dataJson, upstreamError, UA,
} from "./_stock.js";

export async function onRequest(context) {
  const gate = await stockGate(context);
  if (gate.response) return gate.response;
  const { request } = context;
  const ticker = cleanTicker(request);
  if (!ticker) return missingTicker(request);

  try {
    const res = await fetch(
      "https://api.nasdaq.com/api/company/" +
        encodeURIComponent(ticker) +
        "/institutional-holdings?assetclass=stocks&limit=50",
      {
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(30000),
      }
    );
    if (!res.ok) throw new Error("Nasdaq returned HTTP " + res.status);
    const json = await res.json();
    const table =
      (json && json.data && json.data.holdingsTransactions &&
        json.data.holdingsTransactions.table) || {};
    const raw = table.rows || [];
    if (!Array.isArray(raw) || !raw.length) {
      throw new Error("Nasdaq returned no holder rows.");
    }
    const parseNum = (s) => {
      if (s === null || s === undefined) return null;
      if (typeof s === "number") return s;
      const n = parseInt(String(s).replace(/,/g, "").replace(/\$/g, "").trim(), 10);
      return Number.isNaN(n) ? null : n;
    };
    const parsePct = (s) => {
      if (s === null || s === undefined) return null;
      if (typeof s === "number") return Math.round(s * 100) / 100;
      const n = parseFloat(String(s).replace(/%/g, "").trim());
      return Number.isNaN(n) ? null : Math.round(n * 100) / 100;
    };
    const holders = raw
      .map((row) => ({
        holder: (row.ownerName || "").trim() || null,
        shares: parseNum(row.sharesHeld),
        changeShares: parseNum(row.sharesChange),
        changePct: parsePct(row.sharesChangePCT),
        marketValue: (row.marketValue || "").trim() || null,
        dateReported: (row.date || "").trim() || null,
      }))
      .filter((h) => h.holder)
      .sort((a, b) => (b.shares || 0) - (a.shares || 0))
      .slice(0, 15);

    return dataJson(
      {
        ticker,
        asOf: table.asOf || new Date().toISOString(),
        holders,
      },
      request,
      3600
    );
  } catch (err) {
    return upstreamError(request, ticker, err);
  }
}
