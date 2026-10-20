/**
 * Cascadia Analytics - Ticker Research, header and key metrics (PRO)
 * GET /api/stock-profile?ticker=AAPL
 *
 * Company header (name, exchange, sector, industry, price, market cap,
 * business summary exactly as Yahoo's profile carries it) plus the standard
 * valuation strip. Yahoo quoteSummary behind the house cookie-and-crumb flow.
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
      "summaryProfile,assetProfile,price,summaryDetail,defaultKeyStatistics",
      crumb,
      cookies
    );
    const price = r.price || {};
    const prof = r.summaryProfile || {};
    const asset = r.assetProfile || {};
    const summ = r.summaryDetail || {};
    const stats = r.defaultKeyStatistics || {};

    const divYield = num(summ.dividendYield);
    const payload = {
      ticker,
      asOf: new Date().toISOString(),
      header: {
        name: price.longName || price.shortName || ticker,
        ticker,
        exchange: price.exchangeName || null,
        sector: prof.sector || asset.sector || null,
        industry: prof.industry || asset.industry || null,
        price: num(price.regularMarketPrice),
        change: f2(num(price.regularMarketChange)),
        changePercent: f2(num(price.regularMarketChangePercent) !== null ? num(price.regularMarketChangePercent) * 100 : null),
        marketCap: num(price.marketCap),
        description: prof.longBusinessSummary || asset.longBusinessSummary || null,
      },
      keyMetrics: {
        peTrailing: f2(num(summ.trailingPE)),
        peForward: f2(num(summ.forwardPE)),
        peg: f2(num(stats.pegRatio)),
        priceToSales: f2(num(summ.priceToSalesTrailing12Months)),
        priceToBook: f2(num(stats.priceToBook)),
        evToRevenue: f2(num(stats.enterpriseToRevenue)),
        evToEbitda: f2(num(stats.enterpriseToEbitda)),
        dividendYield: divYield !== null ? f2(divYield * 100) : null,
        beta: f2(num(summ.beta) !== null ? num(summ.beta) : num(stats.beta)),
        week52Low: f2(num(summ.fiftyTwoWeekLow)),
        week52High: f2(num(summ.fiftyTwoWeekHigh)),
      },
    };
    return dataJson(payload, request, 3600);
  } catch (err) {
    return upstreamError(request, ticker, err);
  }
}
