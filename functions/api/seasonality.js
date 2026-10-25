/**
 * Cascadia Analytics - Seasonality on-demand lookup (PRO)
 * GET /api/seasonality?ticker=AAPL&years=20
 *
 * For tickers outside the coverage universe: fetches daily adjusted closes
 * from the Yahoo Finance v8 chart endpoint and computes the same monthly
 * return matrix, per-month win rates and return stats, and 252-day
 * composite drift path as the daily collector
 * (macro-relevance/collect_seasonality.py). The years parameter selects
 * one horizon (5, 10, 20, or all; default 20); the full year by month
 * matrix is always returned so the client can render every horizon year
 * range without a second fetch.
 * Auth: Supabase JWT + profiles.is_pro via _auth.js (401 / 403).
 * Errors: 404 when no price history exists, 422 when history is too
 * short to compute seasonality, 502 when Yahoo is unreachable.
 */

import {
  stockGate, cleanTicker, missingTicker, dataJson, upstreamError,
  getCrumb, UA,
} from "./_stock.js";
import { jsonResponse } from "./_auth.js";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthStats(returns) {
  const stats = [];
  for (let m = 0; m < 12; m++) {
    const samples = returns.filter((r) => r.month === m).map((r) => r.ret);
    const n = samples.length;
    if (n === 0) {
      stats.push({ month: MONTH_NAMES[m], samples: 0, win_rate: 0,
        avg: 0, median: 0, std: 0, max_gain: 0, max_loss: 0 });
      continue;
    }
    const wins = samples.filter((r) => r > 0).length;
    const avg = samples.reduce((a, b) => a + b, 0) / n;
    const sorted = [...samples].sort((a, b) => a - b);
    const mid = Math.floor(n / 2);
    const median = n % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    const variance = n > 1
      ? samples.reduce((a, v) => a + Math.pow(v - avg, 2), 0) / (n - 1)
      : 0;
    stats.push({
      month: MONTH_NAMES[m],
      samples: n,
      win_rate: Math.round((wins / n) * 1000) / 10,
      avg: Math.round(avg * 100) / 100,
      median: Math.round(median * 100) / 100,
      std: Math.round(Math.sqrt(variance) * 100) / 100,
      max_gain: Math.round(Math.max(...samples) * 100) / 100,
      max_loss: Math.round(Math.min(...samples) * 100) / 100,
    });
  }
  return stats;
}

function highlightsFor(stats) {
  const valid = stats.filter((s) => s.samples > 0);
  if (!valid.length) return { best: null, worst: null, highest_win: null };
  const best = [...valid].sort((a, b) => b.avg - a.avg)[0];
  const worst = [...valid].sort((a, b) => a.avg - b.avg)[0];
  const highest = [...valid].sort((a, b) => b.win_rate - a.win_rate)[0];
  return {
    best: { month: best.month, avg: best.avg, win_rate: best.win_rate },
    worst: { month: worst.month, avg: worst.avg, win_rate: worst.win_rate },
    highest_win: { month: highest.month, win_rate: highest.win_rate, avg: highest.avg },
  };
}

function driftPath(days) {
  const byYear = {};
  for (const d of days) {
    (byYear[d.year] = byYear[d.year] || []).push(d.close);
  }
  const perIndex = Array.from({ length: 252 }, () => []);
  for (const yearDays of Object.values(byYear)) {
    for (let i = 1; i < Math.min(253, yearDays.length); i++) {
      const prev = yearDays[i - 1];
      const curr = yearDays[i];
      if (prev > 0) perIndex[i - 1].push((curr - prev) / prev);
    }
  }
  const path = [100.0];
  let cum = 100.0;
  for (const rets of perIndex) {
    if (rets.length) cum *= (1 + rets.reduce((a, b) => a + b, 0) / rets.length);
    path.push(Math.round(cum * 100) / 100);
  }
  return path;
}

function monthlyReturns(days) {
  const monthEnd = new Map();
  for (const d of days) {
    monthEnd.set(d.year + "-" + String(d.month + 1).padStart(2, "0"), d);
  }
  const keys = [...monthEnd.keys()].sort();
  const out = [];
  for (let i = 1; i < keys.length; i++) {
    const prev = monthEnd.get(keys[i - 1]);
    const curr = monthEnd.get(keys[i]);
    const diff = (curr.year - prev.year) * 12 + (curr.month - prev.month);
    if (diff !== 1 || prev.close <= 0) continue;
    out.push({
      year: curr.year,
      month: curr.month,
      ret: ((curr.close - prev.close) / prev.close) * 100,
    });
  }
  return out;
}

async function fetchChart(ticker) {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/"
    + encodeURIComponent(ticker) + "?range=max&interval=1d";
  let res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(30000),
  });
  if (res.status === 401 || res.status === 429) {
    const { crumb, cookies } = await getCrumb();
    res = await fetch(url + "&crumb=" + encodeURIComponent(crumb), {
      headers: { "User-Agent": UA, Cookie: cookies },
      signal: AbortSignal.timeout(30000),
    });
  }
  if (!res.ok) throw new Error("Yahoo returned HTTP " + res.status);
  return res.json();
}

export async function onRequest(context) {
  const gate = await stockGate(context);
  if (gate.response) return gate.response;
  const { request } = context;
  const ticker = cleanTicker(request);
  if (!ticker) return missingTicker(request);
  const { searchParams } = new URL(request.url);
  const yearsParam = searchParams.get("years") || "20";
  const horizon = ["5", "10", "20", "all"].includes(yearsParam) ? yearsParam : "20";

  try {
    const data = await fetchChart(ticker);
    const result = data.chart && data.chart.result && data.chart.result[0];
    if (!result || !result.timestamp || !result.timestamp.length) {
      return jsonResponse({ error: "not_found", ticker }, 404, request);
    }
    const timestamps = result.timestamp;
    const closes = (result.indicators
      && result.indicators.adjclose
      && result.indicators.adjclose[0]
      && result.indicators.adjclose[0].adjclose)
      || (result.indicators
        && result.indicators.quote
        && result.indicators.quote[0]
        && result.indicators.quote[0].close)
      || [];
    const meta = result.meta || {};
    const days = [];
    for (let i = 0; i < timestamps.length; i++) {
      const c = closes[i];
      if (c === null || c === undefined || Number.isNaN(c)) continue;
      const d = new Date(timestamps[i] * 1000);
      days.push({
        year: d.getUTCFullYear(),
        month: d.getUTCMonth(),
        close: Number(c),
      });
    }
    if (days.length < 60) {
      return jsonResponse({ error: "insufficient_data", ticker }, 422, request);
    }
    const currentYear = new Date().getUTCFullYear();
    const minYear = horizon === "all" ? 0 : currentYear - parseInt(horizon, 10);
    const horizonDays = days.filter((d) => d.year >= minYear);
    const hReturns = monthlyReturns(horizonDays);
    const stats = monthStats(hReturns);
    const fullReturns = monthlyReturns(days);
    const matrix = {};
    for (const r of fullReturns) {
      (matrix[r.year] = matrix[r.year] || Array(12).fill(null))[r.month]
        = Math.round(r.ret * 100) / 100;
    }
    const last = days[days.length - 1];
    const payload = {
      ticker,
      companyName: meta.shortName || meta.longName || ticker,
      currency: meta.currency || "USD",
      exchange: meta.exchangeName || null,
      as_of_date: new Date(timestamps[timestamps.length - 1] * 1000)
        .toISOString().split("T")[0],
      first_year: days[0].year,
      latest_price: Math.round(last.close * 100) / 100,
      horizon,
      matrix,
      months: stats,
      drift: driftPath(horizonDays),
      highlights: highlightsFor(stats),
    };
    return dataJson(payload, request, 86400);
  } catch (err) {
    return upstreamError(request, ticker, err);
  }
}
