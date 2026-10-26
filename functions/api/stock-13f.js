/**
 * Cascadia Analytics - Ticker Research, institutional holdings (PRO)
 * GET /api/stock-13f?ticker=AAPL
 *
 * Current top institutional holders from Nasdaq's public
 * institutional-holdings endpoint (no key, browser-style headers). The
 * response shape is parsed defensively: Nasdaq has changed this payload
 * before, and an unrecognized shape surfaces an upstream error rather
 * than a fabricated table, so the section renders unavailable instead
 * of wrong.
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
      "https://api.nasdaq.com/api/quote/" +
        encodeURIComponent(ticker) +
        "/institutional-holdings?assetclass=stocks",
      {
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          "Accept-Language": "en-US",
        },
        signal: AbortSignal.timeout(30000),
      }
    );
    if (!res.ok) throw new Error("Nasdaq returned HTTP " + res.status);
    const json = await res.json();
    const data = (json && json.data) || {};
    const raw =
      data.activePositions || data.holdings || data.institutionalHoldings || [];
    if (!Array.isArray(raw) || !raw.length) {
      throw new Error("Nasdaq returned no holder rows.");
    }
    const holders = raw
      .map((h) => ({
        holder: h.ownerName || h.holder || h.name || null,
        shares:
          typeof h.sharesHeld === "number"
            ? h.sharesHeld
            : typeof h.shares === "number"
              ? h.shares
              : null,
        changePct:
          typeof h.pctChange === "number"
            ? Math.round(h.pctChange * 100) / 100
            : typeof h.changePct === "number"
              ? Math.round(h.changePct * 100) / 100
              : null,
        dateReported: h.dateReported || h.date || null,
      }))
      .filter((h) => h.holder)
      .sort((a, b) => (b.shares || 0) - (a.shares || 0))
      .slice(0, 15);

    return dataJson(
      {
        ticker,
        asOf: new Date().toISOString(),
        totalInstitutionalShares:
          typeof data.totalInstitutionalShares === "number"
            ? data.totalInstitutionalShares
            : null,
        holders,
      },
      request,
      3600
    );
  } catch (err) {
    return upstreamError(request, ticker, err);
  }
}
