/**
 * Cascadia Analytics - Ticker Research, company news (PRO)
 * GET /api/stock-news?ticker=AAPL
 *
 * Latest headlines mentioning the ticker from Yahoo's search news feed,
 * behind the same house crumb flow as the other stock endpoints. Headlines
 * link out to the publisher; nothing is rewritten or summarized, so the
 * section can never invent a story.
 * Auth: Supabase JWT + profiles.is_pro via _auth.js (401 / 403).
 */

import {
  stockGate, cleanTicker, missingTicker, dataJson, upstreamError,
  getCrumb, invalidateCrumb, UA,
} from "./_stock.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function onRequest(context) {
  const gate = await stockGate(context);
  if (gate.response) return gate.response;
  const { request } = context;
  const ticker = cleanTicker(request);
  if (!ticker) return missingTicker(request);

  try {
    const build = (crumb) =>
      "https://query2.finance.yahoo.com/v1/finance/search?q=" +
      encodeURIComponent(ticker) +
      "&newsCount=12&quotesCount=0&crumb=" +
      encodeURIComponent(crumb);
    const { crumb, cookies } = await getCrumb();
    let res = await fetch(build(crumb), {
      headers: { "User-Agent": UA, Cookie: cookies },
      signal: AbortSignal.timeout(30000),
    });
    // A 429 (rate limit) or 401 (crumb rejected) gets one retry on a freshly
    // negotiated crumb before the caller surfaces an upstream error.
    if (res.status === 429 || res.status === 401) {
      await sleep(800);
      invalidateCrumb();
      const fresh = await getCrumb();
      res = await fetch(build(fresh.crumb), {
        headers: { "User-Agent": UA, Cookie: fresh.cookies },
        signal: AbortSignal.timeout(30000),
      });
    }
    if (!res.ok) throw new Error("Yahoo returned HTTP " + res.status);
    const json = await res.json();
    const items = ((json && json.news) || [])
      .filter((n) => n && n.title && n.link)
      .slice(0, 12)
      .map((n) => ({
        title: n.title,
        publisher: n.publisher || null,
        url: n.link,
        published: n.providerPublishTime
          ? new Date(n.providerPublishTime * 1000).toISOString().slice(0, 10)
          : null,
      }));

    return dataJson(
      { ticker, asOf: new Date().toISOString(), items },
      request,
      1800
    );
  } catch (err) {
    return upstreamError(request, ticker, err);
  }
}
