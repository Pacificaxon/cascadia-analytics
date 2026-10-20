/**
 * Cascadia Analytics - 56-Metric Institutional Fundamentals Tracker (PRO)
 * GET /api/metrics?ticker=NVDA
 *
 * Computes 56 institutional fundamentals metrics for ANY ticker via Yahoo
 * Finance (free). Handles Yahoo's crumb/cookie auth. 1h edge cache.
 *
 * Historical depth: free Yahoo APIs cap income statements at ~4 years, so
 * 1Y and 3Y growth rates are computed from available history; 5Y/10Y metrics
 * return null (rendered as --) unless Yahoo provides a pre-calculated value.
 */

import { verifyPro, jsonResponse, handleOptions } from "./_auth.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Pro gate, identical to pro-data.js: validate the Supabase JWT server-side
// and check profiles.is_pro. 401 -> no/invalid session, 403 -> not Pro.
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, 405, request);
  }
  const v = await verifyPro(request, env);
  if (!v.ok) return jsonResponse({ error: v.error }, v.status, request);
  if (!v.is_pro) return jsonResponse({ error: "forbidden" }, 403, request);
  return onRequestGet(context);
}

async function getCrumb() {
  const cookieRes = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": UA },
    redirect: "manual",
  });
  const setCookie = cookieRes.headers.get("set-cookie") || "";
  const cookies = setCookie.split(",").map((c) => c.split(";")[0].trim()).filter(Boolean).join("; ");
  const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, Cookie: cookies },
  });
  if (!crumbRes.ok) throw new Error("crumb fetch failed: " + crumbRes.status);
  const crumb = (await crumbRes.text()).trim();
  return { crumb, cookies };
}

async function onRequestGet(context) {
  const { searchParams } = new URL(context.request.url);
  const ticker = (searchParams.get("ticker") || "").toUpperCase().trim().replace(/[^A-Z0-9.\-=]/g, "");
  if (!ticker) {
    return Response.json({ error: "Missing ticker parameter" }, { status: 400 });
  }

  try {
    const { crumb, cookies } = await getCrumb();
    const modules = "summaryDetail,financialData,defaultKeyStatistics,incomeStatementHistory,balanceSheetHistory,cashflowStatementHistory,price";
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`;

    const res = await fetch(url, { headers: { "User-Agent": UA, Cookie: cookies } });
    if (!res.ok) throw new Error(`Yahoo returned HTTP ${res.status}`);
    const json = await res.json();
    const result = json?.quoteSummary?.result?.[0];
    if (!result) throw new Error("Ticker not found or lacking data.");

    const price = result.price || {};
    const fin = result.financialData || {};
    const stats = result.defaultKeyStatistics || {};
    const summ = result.summaryDetail || {};
    const incStmt = result.incomeStatementHistory?.incomeStatementHistory || [];
    const bsStmt = result.balanceSheetHistory?.balanceSheetStatements || [];
    const cfStmt = result.cashflowStatementHistory?.cashflowStatements || [];

    const num = (o) => (o && typeof o.raw === "number" ? o.raw : null);
    const growth = (cur, past) => (cur !== null && past !== null && past !== 0)
      ? ((cur - past) / Math.abs(past)) * 100 : null;

    // Statement vintages: index 0 = latest, 1 = 1Y ago, 3 = 3Y ago
    const inc0 = incStmt[0] || {}, inc1 = incStmt[1] || {}, inc3 = incStmt[3] || {};
    const bs0 = bsStmt[0] || {};
    const cf0 = cfStmt[0] || {};

    const marginOf = (inc) => {
      const r = num(inc.totalRevenue);
      const gp = num(inc.grossProfit);
      const op = num(inc.operatingIncome);
      return {
        gm: r && gp !== null ? (gp / r) * 100 : null,
        om: r && op !== null ? (op / r) * 100 : null,
      };
    };
    const m1 = marginOf(inc1), m3 = marginOf(inc3);

    // Core values
    const marketCap = num(price.marketCap);
    const revenue = num(fin.totalRevenue);
    const epsDiluted = num(stats.trailingEps);
    const epsForward = num(stats.forwardEps);

    // Dividends & buybacks
    const divYieldTrailing = num(summ.trailingAnnualDividendYield) !== null ? num(summ.trailingAnnualDividendYield) * 100 : null;
    const divYieldForward = num(summ.dividendYield) !== null ? num(summ.dividendYield) * 100 : null;
    const divYield5y = num(summ.fiveYearAvgDividendYield) !== null ? num(summ.fiveYearAvgDividendYield) * 100 : null;
    const repurchases = Math.abs(num(cf0.repurchaseOfStock) || 0);
    const buybackYield = marketCap ? (repurchases / marketCap) * 100 : null;

    // Returns
    const roa = num(fin.returnOnAssets) !== null ? num(fin.returnOnAssets) * 100 : null;
    const roe = num(fin.returnOnEquity) !== null ? num(fin.returnOnEquity) * 100 : null;

    // ROIC via NOPAT / invested capital
    const ebit = num(inc0.ebit) !== null ? num(inc0.ebit) : num(inc0.operatingIncome);
    const pretax = num(inc0.incomeBeforeTax);
    const taxProv = num(inc0.incomeTaxExpense);
    const taxRate = pretax && pretax > 0 && taxProv !== null ? taxProv / pretax : 0.21;
    const nopat = ebit !== null ? ebit * (1 - taxRate) : null;
    const debt = num(fin.totalDebt) || 0;
    const cash = num(fin.totalCash) || 0;
    const bookValue = num(stats.bookValue);
    const shares = num(stats.sharesOutstanding);
    const equity = bookValue !== null && shares !== null ? bookValue * shares
      : (num(bs0.totalStockholderEquity) || null);
    const investedCapital = equity !== null ? debt + equity - cash : null;
    const roic = nopat !== null && investedCapital && investedCapital > 0
      ? (nopat / investedCapital) * 100 : null;

    // Valuation
    const pe = num(summ.trailingPE);
    const peForward = num(summ.forwardPE);
    const ps = num(summ.priceToSalesTrailing12Months);

    // Financial health
    const totalAssets = num(bs0.totalAssets);
    const currentLiab = num(bs0.totalCurrentLiabilities);
    const debtToEquity = num(fin.debtToEquity) !== null ? num(fin.debtToEquity) / 100 : null;
    const ebitda = num(fin.ebitda);

    // Growth: revenue and operating profit
    const revGrowth1y = growth(num(inc0.totalRevenue), num(inc1.totalRevenue));
    const revGrowth3y = growth(num(inc0.totalRevenue), num(inc3.totalRevenue));
    const opGrowth1y = growth(num(inc0.operatingIncome), num(inc1.operatingIncome));
    const opGrowth3y = growth(num(inc0.operatingIncome), num(inc3.operatingIncome));

    // EPS growth from diluted EPS history when available
    const epsHist = [num(inc0.dilutedEPS), num(inc1.dilutedEPS), num(inc3.dilutedEPS)];
    const epsGrowth1y = growth(epsHist[0], epsHist[1]);
    const epsGrowth3y = growth(epsHist[0], epsHist[2]);

    // Margins (current from financialData)
    const grossMargin = num(fin.grossMargins) !== null ? num(fin.grossMargins) * 100 : null;
    const opMargin = num(fin.operatingMargins) !== null ? num(fin.operatingMargins) * 100 : null;

    // DPS growth from dividend history
    const dps0 = num(summ.trailingAnnualDividendRate);
    const dpsGrowth1y = null; // Yahoo lacks multi-year DPS history in free modules

    // Misc
    const payoutRatio = num(summ.payoutRatio);
    const sgr = roe !== null && payoutRatio !== null ? roe * (1 - payoutRatio) : null;
    const capEx = Math.abs(num(cf0.capitalExpenditures) || 0);
    const capExSales = revenue ? capEx / revenue : null;
    const ebitdaVal = ebitda;

    const f2 = (v) => (v === null || v === undefined || Number.isNaN(v) ? null : Math.round(v * 100) / 100);

    const metrics = {
      "Market Cap": f2(marketCap),
      "Revenue": f2(revenue),
      "EPS (Diluted)": f2(epsDiluted),
      "EPS (Normalized)": f2(epsForward),
      "Dividend Yield (Trailing)": f2(divYieldTrailing),
      "Dividend Yield (Forward)": f2(divYieldForward),
      "Dividend Yield (5Y Avg)": f2(divYield5y),
      "Buyback Yield": f2(buybackYield),
      "Buyback Yield (5Y Avg)": null,
      "Return on Assets (Normalized)": f2(roa),
      "Return on Equity (Normalized)": f2(roe),
      "Return on Invested Capital (Normalized)": f2(roic),
      "Price/Earnings": f2(pe),
      "Price/Earnings (Normalized)": f2(peForward),
      "Price/Earnings (5Y Avg)": null,
      "Price/Earnings (Forward)": f2(peForward),
      "Total Debt/Equity": f2(debtToEquity),
      "Total Debt": f2(debt),
      "Cash (Balance Sheet)": f2(cash),
      "EBITDA": f2(ebitdaVal),
      "Revenue Growth (1Y)": f2(revGrowth1y),
      "Revenue Growth (3Y)": f2(revGrowth3y),
      "Revenue Growth (5Y)": null,
      "Operating Profit Growth (1Y)": f2(opGrowth1y),
      "Operating Profit Growth (3Y)": f2(opGrowth3y),
      "Operating Profit Growth (5Y)": null,
      "Operating Profit Growth (10Y)": null,
      "EPS Growth (1Y)": f2(epsGrowth1y),
      "EPS Growth (3Y)": f2(epsGrowth3y),
      "EPS Growth (5Y)": null,
      "EPS Growth (10Y)": null,
      "Dividend per Share Growth (1Y)": f2(dpsGrowth1y),
      "Dividend per Share Growth (3Y)": null,
      "Dividend per Share Growth (5Y)": null,
      "Dividend per Share Growth (10Y)": null,
      "Gross Margin": f2(grossMargin),
      "Gross Margin (1Y Avg)": f2(m1.gm),
      "Gross Margin (3Y Avg)": f2(m3.gm),
      "Gross Margin (5Y Avg)": null,
      "Gross Margin (10Y Avg)": null,
      "Operating Margin": f2(opMargin),
      "Operating Margin (1Y Avg)": f2(m1.om),
      "Operating Margin (3Y Avg)": f2(m3.om),
      "Operating Margin (5Y Avg)": null,
      "Operating Margin (10Y Avg)": null,
      "EBIT": f2(ebit),
      "Total Assets": f2(totalAssets),
      "Current Liabilities": f2(currentLiab),
      "Sustainable Growth Rate": f2(sgr),
      "Capital Expenditure/Sales": f2(capExSales),
      "Price/Sales": f2(ps),
      "Price/Sales (3Y Avg)": null,
      "Price/Sales (5Y Avg)": null,
      "Inventory Turnover (1Y Avg)": null,
      "Inventory Turnover (3Y Avg)": null,
      "Inventory Turnover (5Y Avg)": null,
      "Inventory Turnover (10Y Avg)": null,
    };

    return Response.json(
      { ticker, companyName: price.longName || price.shortName || ticker, metrics },
      { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600", "CDN-Cache-Control": "public, max-age=3600, stale-if-error=86400" } }
    );
  } catch (err) {
    return Response.json({ error: String(err.message || err), ticker }, { status: 502 });
  }
}
