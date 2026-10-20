import { verifyPro, jsonResponse, handleOptions } from "./_auth.js";
import { getCrumb } from "./_stock.js";

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

async function onRequestGet(context) {
  const { searchParams } = new URL(context.request.url);
  const ticker = (searchParams.get("ticker") || "NVDA").toUpperCase().trim();

  try {
    const { crumb, cookies } = await getCrumb();
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=summaryProfile,assetProfile,defaultKeyStatistics,majorHoldersBreakdown,insiderTransactions,price&crumb=${encodeURIComponent(crumb)}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Cookie": cookies
      }
    });

    if (!res.ok) {
      throw new Error(`Upstream source returned HTTP ${res.status}`);
    }

    const json = await res.json();
    const result = json?.quoteSummary?.result?.[0];

    if (!result) {
      throw new Error(`Ticker '${ticker}' not found or lacks SEC filing data.`);
    }

    const price = result.price || {};
    const stats = result.defaultKeyStatistics || {};
    const holders = result.majorHoldersBreakdown || {};
    const assetProfile = result.assetProfile || {};
    const rawTransactions = result.insiderTransactions?.transactions || [];

    const companyName = price.longName || price.shortName || ticker;
    const currentPrice = price.regularMarketPrice?.raw || 0;
    const marketCap = price.marketCap?.raw || 0;

    const insiderPercentHeld = (holders.insidersPercentHeld?.raw || stats.heldPercentInsiders?.raw || 0) * 100;
    const tsr1y = (stats["52WeekChange"]?.raw || 0) * 100;

    const officers = assetProfile.companyOfficers || [];
    let ceo = officers.find(o => /ceo|chief executive/i.test(o.title || "")) || officers[0] || null;

    let ceoName = ceo ? ceo.name : "Management Team";
    let ceoTitle = ceo ? ceo.title : "Executive Leadership";
    let ceoTotalPay = ceo?.totalPay?.raw || 0;
    let isDollarSalary = ceoTotalPay > 0 && ceoTotalPay <= 100;

    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 6);

    let totalBuyDollars = 0;
    let totalSellDollars = 0;
    let buyCount = 0;
    let sellCount = 0;
    const monthlyBuckets = {};
    const parsedTransactions = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      monthlyBuckets[key] = { buys: 0, sells: 0 };
    }

    rawTransactions.forEach(tx => {
      const txDateStr = tx.startDate?.fmt || tx.startDate;
      if (!txDateStr) return;

      const txDate = new Date(txDateStr);
      if (txDate < cutoffDate) return;

      const text = (tx.transactionText || "").toLowerCase();
      const shares = Math.abs(tx.shares?.raw || 0);
      const val = Math.abs(tx.value?.raw || 0) || (shares * currentPrice);
      const monthKey = txDate.toISOString().slice(0, 7);

      const isGrantOrExercise = /grant|award|exercise|conversion|gift|tax/i.test(text);
      const isPurchase = /purchase|buy/i.test(text) && !isGrantOrExercise;
      const isSale = /sale|sold/i.test(text) && !isGrantOrExercise;

      if (isPurchase) {
        totalBuyDollars += val;
        buyCount++;
        if (monthlyBuckets[monthKey]) monthlyBuckets[monthKey].buys += val;
        parsedTransactions.push({
          date: txDateStr,
          filer: tx.filerName || "Insider",
          relation: tx.filerRelation || "Officer/Director",
          type: "BUY",
          shares,
          value: val
        });
      } else if (isSale) {
        totalSellDollars += val;
        sellCount++;
        if (monthlyBuckets[monthKey]) monthlyBuckets[monthKey].sells += val;
        parsedTransactions.push({
          date: txDateStr,
          filer: tx.filerName || "Insider",
          relation: tx.filerRelation || "Officer/Director",
          type: "SELL",
          shares,
          value: val
        });
      }
    });

    const netInsiderFlow = totalBuyDollars - totalSellDollars;

    let skinScore = 0;
    let convictionScore = 0;
    let compScore = 0;

    if (insiderPercentHeld >= 15.0) skinScore = 40;
    else if (insiderPercentHeld >= 10.0) skinScore = 35;
    else if (insiderPercentHeld >= 5.0) skinScore = 25;
    else if (insiderPercentHeld >= 2.0) skinScore = 15;
    else if (insiderPercentHeld >= 0.5) skinScore = 8;
    else skinScore = 2;

    if (totalBuyDollars > 500000 && netInsiderFlow > 0) {
      convictionScore = 30;
    } else if (totalBuyDollars > 0 && netInsiderFlow >= 0) {
      convictionScore = 24;
    } else if (buyCount === 0 && sellCount === 0) {
      convictionScore = 18;
    } else if (netInsiderFlow < 0 && tsr1y > 10.0) {
      convictionScore = 14;
    } else if (netInsiderFlow < 0 && tsr1y < -15.0) {
      convictionScore = 0;
    } else {
      convictionScore = 8;
    }

    let payAlignmentStatus = "Aligned";
    let payAlignmentBadge = "NEUTRAL COMP";

    if (isDollarSalary || (insiderPercentHeld > 10.0 && ceoTotalPay < 1500000)) {
      compScore = 30;
      payAlignmentStatus = "Founder Mode / Low Base Draw";
      payAlignmentBadge = "EXEMPLARY ALIGNMENT";
    } else if (tsr1y >= 15.0) {
      compScore = 26;
      payAlignmentStatus = "Stock Outperformance Matches Comp Structure";
      payAlignmentBadge = "PERFORMANCE EARNED";
    } else if (tsr1y < -15.0 && ceoTotalPay > 15000000) {
      compScore = 2;
      payAlignmentStatus = "High Pay Package Amid Severe Stock Drawdown";
      payAlignmentBadge = "AGENCY RISK // VALUE TRAP";
    } else if (tsr1y < 0.0) {
      compScore = 12;
      payAlignmentStatus = "Negative Shareholder Returns vs Static Executive Comp";
      payAlignmentBadge = "SUB-OPTIMAL ALIGNMENT";
    } else {
      compScore = 20;
      payAlignmentStatus = "Market Standard Corporate Governance";
      payAlignmentBadge = "STANDARD CORPORATE";
    }

    const totalAlignmentScore = Math.min(100, Math.max(0, skinScore + convictionScore + compScore));

    let regime = "BALANCED / TYPICAL CORPORATE";
    let regimeColor = "amber";

    if (totalAlignmentScore >= 75) {
      regime = "FOUNDER-MODE // HIGH CONVICTION";
      regimeColor = "emerald";
    } else if (totalAlignmentScore < 45) {
      regime = "HIGH AGENCY RISK // VALUE TRAP";
      regimeColor = "rose";
    }

    const flowHistory = Object.keys(monthlyBuckets).sort().map(month => ({
      month,
      buys: Math.round(monthlyBuckets[month].buys),
      sells: Math.round(monthlyBuckets[month].sells)
    }));

    const responsePayload = {
      ticker,
      companyName,
      currentPrice: Number(currentPrice.toFixed(2)),
      marketCap,
      alignmentScore: totalAlignmentScore,
      regime,
      regimeColor,
      scores: {
        skinInTheGame: { score: skinScore, max: 40, insiderPercent: Number(insiderPercentHeld.toFixed(2)) },
        convictionFlow: { score: convictionScore, max: 30, netFlowDollars: Math.round(netInsiderFlow), buyDollars: Math.round(totalBuyDollars), sellDollars: Math.round(totalSellDollars) },
        compensation: { score: compScore, max: 30, status: payAlignmentStatus, badge: payAlignmentBadge, tsr1y: Number(tsr1y.toFixed(2)), ceoPay: Math.round(ceoTotalPay), ceoName, ceoTitle }
      },
      flowHistory,
      recentFilings: parsedTransactions.slice(0, 8),
      cachedAt: new Date().toISOString()
    };

    return new Response(JSON.stringify(responsePayload), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=1800, s-maxage=1800, stale-while-revalidate=600",
        "CDN-Cache-Control": "public, max-age=1800, stale-while-revalidate=600, stale-if-error=86400"
      }
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message, ticker }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
