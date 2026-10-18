/**
 * Cascadia Analytics - On-Demand Quality Snapshot (PRO)
 * GET /api/quality?ticker=NVDA
 *
 * Computes ROIC, CROIC, Rule of 40, and operating efficiency for ANY ticker
 * via Yahoo Finance (free). Handles Yahoo's crumb/cookie auth.
 *
 * Lightweight by design: small JSON payload, cached 1h at the edge.
 * For DCF-covered tickers, the full Investment Scorecard remains the deeper read.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function getCrumb() {
  // Step 1: get cookies from Yahoo homepage
  const cookieRes = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": UA },
    redirect: "manual",
  });
  const setCookie = cookieRes.headers.get("set-cookie") || "";
  const cookies = setCookie.split(",").map((c) => c.split(";")[0].trim()).filter(Boolean).join("; ");

  // Step 2: get crumb token
  const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, Cookie: cookies },
  });
  if (!crumbRes.ok) throw new Error("crumb fetch failed: " + crumbRes.status);
  const crumb = (await crumbRes.text()).trim();
  return { crumb, cookies };
}

export async function onRequestGet(context) {
  const { searchParams } = new URL(context.request.url);
  const ticker = (searchParams.get("ticker") || "").toUpperCase().trim().replace(/[^A-Z0-9.\-=]/g, "");
  if (!ticker) {
    return Response.json({ error: "Missing ticker parameter" }, { status: 400 });
  }

  try {
    const { crumb, cookies } = await getCrumb();
    const url =
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}` +
      `?modules=summaryProfile,financialData,defaultKeyStatistics,incomeStatementHistory` +
      `&crumb=${encodeURIComponent(crumb)}`;

    const res = await fetch(url, { headers: { "User-Agent": UA, Cookie: cookies } });
    if (!res.ok) throw new Error(`Yahoo returned HTTP ${res.status}`);
    const json = await res.json();
    const result = json?.quoteSummary?.result?.[0];
    if (!result) throw new Error("Ticker not found or no data");

    const fin = result.financialData || {};
    const prof = result.summaryProfile || {};
    const ks = result.defaultKeyStatistics || {};
    const inc = result.incomeStatementHistory?.incomeStatementHistory?.[0] || {};
    const prevInc = result.incomeStatementHistory?.incomeStatementHistory?.[1] || {};

    const num = (o) => (o && typeof o.raw === "number" ? o.raw : null);
    const revenue = num(fin.totalRevenue) || 1;
    const fcf = num(fin.freeCashflow) || 0;

    // EBIT: prefer operatingMargins * revenue (reliable) over spotty statement EBIT.
    // If no margin data (some foreign tickers), leave null rather than fake a 0.
    const opMargin = num(fin.operatingMargins);
    let ebit = num(inc.ebit);
    if (!ebit && opMargin !== null) ebit = revenue * opMargin;
    if (!ebit) ebit = null;

    const pretax = num(inc.incomeBeforeTax);
    const taxProvision = num(inc.incomeTaxExpense);
    const employees = prof.fullTimeEmployees || null;
    const totalDebt = num(fin.totalDebt) || 0;
    const totalCash = num(fin.totalCash) || 0;

    // Equity: bookValue * shares (balance sheet API is often sparse)
    const bookValue = num(ks.bookValue);
    const shares = num(ks.sharesOutstanding);
    const equity = bookValue && shares ? bookValue * shares : 1;

    const totalAssets = equity + totalDebt; // approximation when BS missing

    const effectiveTaxRate = pretax && pretax > 0 && taxProvision ? taxProvision / pretax : 0.21;
    const nopat = ebit !== null ? ebit * (1 - effectiveTaxRate) : null;
    const investedCapital = totalDebt + equity - totalCash;

    const roic = nopat !== null && investedCapital > 0 ? (nopat / investedCapital) * 100 : null;
    const croic = investedCapital > 0 ? (fcf / investedCapital) * 100 : null;
    const roa = (num(fin.returnOnAssets) || 0) * 100;
    const roe = (num(fin.returnOnEquity) || 0) * 100;
    const revPerEmployee = employees ? revenue / employees : 0;
    const assetTurnover = revenue / totalAssets;

    const revGrowth = (num(fin.revenueGrowth) || 0) * 100;
    const fcfMargin = (fcf / revenue) * 100;
    const ruleOf40 = revGrowth + fcfMargin;

    let operatingLeverage = null;
    const opex = num(inc.totalOperatingExpenses);
    const prevOpex = num(prevInc.totalOperatingExpenses);
    const incRev = num(inc.totalRevenue);
    const prevRev = num(prevInc.totalRevenue);
    if (opex && prevOpex && incRev && prevRev && prevOpex !== 0 && prevRev !== 0) {
      const opexGrowth = ((opex - prevOpex) / prevOpex) * 100;
      const histRevGrowth = ((incRev - prevRev) / prevRev) * 100;
      operatingLeverage = histRevGrowth - opexGrowth;
    }

    // Simplified quality heuristic (0-100). The full Investment Scorecard
    // remains the deeper read for DCF-covered names.
    // If ROIC can't be computed (foreign tickers), ROE backs it up for scoring.
    const scoringRoic = roic !== null ? roic : roe;
    let score = 0;
    if (scoringRoic > 15) score += 25; else if (scoringRoic > 8) score += 15;
    if (roic !== null && croic !== null && croic > roic && roic > 0) score += 15;
    if (ruleOf40 >= 40) score += 25; else if (ruleOf40 >= 20) score += 10;
    if (revPerEmployee > 500000) score += 20; else if (revPerEmployee > 250000) score += 10;
    if (roe > 15) score += 15; else if (roe > 8) score += 5;

    const qualityScore = Math.min(100, score);

    const f2 = (v) => (v === null || v === undefined || Number.isNaN(v) ? null : Math.round(v * 100) / 100);

    return Response.json(
      {
        ticker,
        sector: prof.sector || "Unknown",
        industry: prof.industry || "Unknown",
        qualityScore,
        capitalReturns: { roic: f2(roic), croic: f2(croic), roe: f2(roe), roa: f2(roa) },
        efficiency: {
          revPerEmployee: employees ? Math.round(revPerEmployee) : null,
          assetTurnover: f2(assetTurnover),
          operatingLeverage: operatingLeverage !== null ? f2(operatingLeverage) : null,
          employees,
        },
        growthEngine: { ruleOf40: f2(ruleOf40), revGrowth: f2(revGrowth), fcfMargin: f2(fcfMargin) },
      },
      { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" } }
    );
  } catch (err) {
    return Response.json({ error: String(err.message || err), ticker }, { status: 502 });
  }
}
