/**
 * Cascadia Analytics - Ticker Research, technical analysis (PRO)
 * GET /api/stock-technicals?ticker=AAPL
 *
 * Daily, weekly, and monthly moving averages (SMA and EMA for the house
 * periods), Wilder RSI(14) per timeframe, distance from the 200-day average,
 * seasonality, and the Trend Conviction / Exhaustion gauges whose formulas
 * are ported from ~/workspace/gex-tracker/trend_engine.py (MA alignment,
 * ADX/DMI, Bollinger piercing, RSI extremes, MACD divergence, 200-day
 * stretch). Source: Yahoo v8 chart, five years daily, no crumb needed.
 *
 * Insufficient history degrades per indicator to null with an
 * insufficient-data status. A young listing still renders.
 * Auth: Supabase JWT + profiles.is_pro via _auth.js (401 / 403).
 */

import { stockGate, cleanTicker, missingTicker, dataJson, upstreamError, UA, f2 } from "./_stock.js";

const PERIODS = [10, 20, 30, 50, 100, 200];

// pandas ewm(adjust=True) as a full series: y_t = sum(w_i x_i) / sum(w_i)
// with w_i = (1 - alpha)^(t-i). Null until minPeriods observations exist.
function ewmSeries(x, alpha, minPeriods) {
  const out = new Array(x.length).fill(null);
  let numAcc = 0;
  let denAcc = 0;
  for (let i = 0; i < x.length; i++) {
    if (x[i] === null || x[i] === undefined || Number.isNaN(x[i])) {
      numAcc = 0;
      denAcc = 0;
      continue;
    }
    numAcc = x[i] + (1 - alpha) * numAcc;
    denAcc = 1 + (1 - alpha) * denAcc;
    if (i + 1 >= minPeriods) out[i] = numAcc / denAcc;
  }
  return out;
}

function smaSeries(x, period) {
  const out = new Array(x.length).fill(null);
  let sum = 0;
  for (let i = 0; i < x.length; i++) {
    sum += x[i];
    if (i >= period) sum -= x[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function emaSeries(x, period) {
  const out = new Array(x.length).fill(null);
  if (x.length < period) return out;
  const k = 2 / (period + 1);
  let ema = 0;
  for (let i = 0; i < period; i++) ema += x[i];
  ema /= period;
  out[period - 1] = ema;
  for (let i = period; i < x.length; i++) {
    ema = x[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

// Wilder RSI via exponentially weighted gain/loss means, the trend_engine
// formulation (ewm alpha = 1/14 over clipped deltas).
function rsiSeries(closes, length = 14) {
  const gains = [0];
  const losses = [0];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains.push(d > 0 ? d : 0);
    losses.push(d < 0 ? -d : 0);
  }
  const g = ewmSeries(gains, 1 / length, length);
  const l = ewmSeries(losses, 1 / length, length);
  return closes.map((_, i) => {
    if (g[i] === null || l[i] === null) return null;
    const rs = g[i] / (l[i] === 0 ? 1e-10 : l[i]);
    return 100 - 100 / (1 + rs);
  });
}

function macdHist(closes) {
  const ef = ewmSeries(closes, 2 / (12 + 1), 12);
  const es = ewmSeries(closes, 2 / (26 + 1), 26);
  const line = closes.map((_, i) => (ef[i] !== null && es[i] !== null ? ef[i] - es[i] : null));
  // Signal: ewm over the MACD line with its leading nulls skipped, matching
  // pandas min_periods semantics closely enough for divergence detection.
  const firstValid = line.findIndex((v) => v !== null);
  if (firstValid < 0) return line.map(() => null);
  const tail = line.slice(firstValid);
  const sigTail = ewmSeries(tail, 2 / (9 + 1), 9);
  const sig = line.map((_, i) => (i < firstValid ? null : sigTail[i - firstValid]));
  return line.map((v, i) => (v !== null && sig[i] !== null ? v - sig[i] : null));
}

function rollingStd(x, period) {
  const out = new Array(x.length).fill(null);
  for (let i = period - 1; i < x.length; i++) {
    const win = x.slice(i - period + 1, i + 1);
    const mean = win.reduce((a, b) => a + b, 0) / period;
    const varSum = win.reduce((a, b) => a + (b - mean) * (b - mean), 0);
    out[i] = Math.sqrt(varSum / (period - 1));
  }
  return out;
}

function adxDmi(bars, length = 14) {
  const n = bars.length;
  const plusDm = [0];
  const minusDm = [0];
  const tr = [0];
  for (let i = 1; i < n; i++) {
    const up = bars[i].h - bars[i - 1].h;
    const dn = bars[i - 1].l - bars[i].l;
    plusDm.push(up > dn && up > 0 ? up : 0);
    minusDm.push(dn > up && dn > 0 ? dn : 0);
    tr.push(
      Math.max(
        bars[i].h - bars[i].l,
        Math.abs(bars[i].h - bars[i - 1].c),
        Math.abs(bars[i].l - bars[i - 1].c)
      )
    );
  }
  const atr = ewmSeries(tr, 1 / length, length);
  const pDm = ewmSeries(plusDm, 1 / length, length);
  const mDm = ewmSeries(minusDm, 1 / length, length);
  const pdi = bars.map((_, i) => (atr[i] ? (100 * pDm[i]) / atr[i] : null));
  const mdi = bars.map((_, i) => (atr[i] ? (100 * mDm[i]) / atr[i] : null));
  const dx = bars.map((_, i) => {
    if (pdi[i] === null || mdi[i] === null) return null;
    const denom = pdi[i] + mdi[i];
    return denom === 0 ? null : (100 * Math.abs(pdi[i] - mdi[i])) / denom;
  });
  // ADX is an ewm over dx; pandas skips the leading NaN run, so evaluate the
  // smoothing over the first-valid tail like the MACD signal above.
  const firstValid = dx.findIndex((v) => v !== null);
  let adx = dx.map(() => null);
  if (firstValid >= 0) {
    const tail = dx.slice(firstValid);
    const smoothed = ewmSeries(tail, 1 / length, length);
    adx = dx.map((_, i) => (i < firstValid ? null : smoothed[i - firstValid]));
  }
  const last = (arr) => {
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i] !== null) return arr[i];
    return null;
  };
  return { adx: last(adx), pdi: last(pdi), mdi: last(mdi) };
}

// Trend Conviction and Exhaustion, ported line for line from
// trend_engine.py analyze(). Requires 210+ daily bars, like the original.
function trendGauges(bars) {
  if (!bars || bars.length < 210) {
    return { status: "insufficient_data", trendScore: null, exhaustionScore: null, direction: null, alignment: null, adx: null, rsi: null, reversalFlags: [] };
  }
  const closes = bars.map((b) => b.c);
  const highs = bars.map((b) => b.h);
  const lows = bars.map((b) => b.l);
  const price = closes[closes.length - 1];
  const rsi = rsiSeries(closes);
  const rs = rsi[rsi.length - 1];
  const { adx: a, pdi: pd_, mdi: md_ } = adxDmi(bars);
  const sma20 = smaSeries(closes, 20);
  const sma50 = smaSeries(closes, 50);
  const sma200 = smaSeries(closes, 200);
  const s20 = sma20[sma20.length - 1];
  const s50 = sma50[sma50.length - 1];
  const s200 = sma200[sma200.length - 1];
  const bbMid = sma20;
  const bbStd = rollingStd(closes, 20);
  const bbu = bbMid[bbMid.length - 1] + 2 * bbStd[bbStd.length - 1];
  const bbl = bbMid[bbMid.length - 1] - 2 * bbStd[bbStd.length - 1];
  const hist = macdHist(closes);

  let trendScore = 0;
  let alignment;
  const direction = pd_ !== null && md_ !== null && pd_ > md_ ? "Bullish" : "Bearish";
  if (price > s20 && s20 > s50 && s50 > s200) {
    trendScore += 40;
    alignment = "Full Bullish Stack";
  } else if (price < s20 && s20 < s50 && s50 < s200) {
    trendScore += 40;
    alignment = "Full Bearish Stack";
  } else {
    trendScore += 10;
    alignment = "Mixed / Choppy";
  }
  if (a !== null && a > 30) trendScore += 40;
  else if (a !== null && a > 20) trendScore += 20;
  const spread = pd_ !== null && md_ !== null ? Math.abs(pd_ - md_) : 0;
  if (spread > 15) trendScore += 20;
  else if (spread > 5) trendScore += 10;

  let exh = 0;
  const flags = [];
  if (price > bbu) {
    exh += 25;
    flags.push("Price above upper Bollinger Band (overextended)");
  } else if (price < bbl) {
    exh += 25;
    flags.push("Price below lower Bollinger Band (oversold)");
  }
  if (rs !== null && rs > 75) {
    exh += 20;
    flags.push("RSI " + Math.round(rs) + " severely overbought");
  } else if (rs !== null && rs < 25) {
    exh += 20;
    flags.push("RSI " + Math.round(rs) + " severely oversold");
  }
  const seg = (arr, from, to) => arr.slice(from, to).filter((v) => v !== null);
  const maxOf = (arr) => (arr.length ? Math.max(...arr) : null);
  const minOf = (arr) => (arr.length ? Math.min(...arr) : null);
  const rh = maxOf(seg(hist, hist.length - 10));
  const ph = maxOf(seg(hist, hist.length - 30, hist.length - 10));
  const rl = minOf(seg(hist, hist.length - 10));
  const pl = minOf(seg(hist, hist.length - 30, hist.length - 10));
  const rph = maxOf(highs.slice(-10));
  const pph = maxOf(highs.slice(-30, -10));
  const rpl = minOf(lows.slice(-10));
  const ppl = minOf(lows.slice(-30, -10));
  if (direction === "Bullish" && rh !== null && ph !== null && rph > pph && rh < ph) {
    exh += 40;
    flags.push("Bearish MACD divergence: price higher high, momentum lower high");
  } else if (direction === "Bearish" && rl !== null && pl !== null && rpl < ppl && rl > pl) {
    exh += 40;
    flags.push("Bullish MACD divergence: price lower low, momentum higher low");
  }
  const dist200 = Math.abs(price - s200) / s200;
  if (dist200 > 0.25) {
    exh += 15;
    flags.push(Math.round(dist200 * 100) + "% from 200-day average (stretched)");
  }
  exh = Math.min(100, exh);
  if (!flags.length) flags.push("No exhaustion signals");
  return {
    status: "ok",
    trendScore,
    exhaustionScore: exh,
    direction,
    alignment,
    adx: a !== null ? f2(a) : null,
    rsi: rs !== null ? f2(rs) : null,
    reversalFlags: flags,
  };
}

function aggregate(bars, mode) {
  if (mode === "daily") return bars;
  const out = [];
  let cur = null;
  let curKey = null;
  for (const b of bars) {
    const d = new Date(b.t);
    let key;
    if (mode === "monthly") {
      key = d.getUTCFullYear() * 12 + d.getUTCMonth();
    } else {
      // ISO-style week bucket: the Monday of the bar's week
      const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      const dow = (monday.getUTCDay() + 6) % 7;
      monday.setUTCDate(monday.getUTCDate() - dow);
      key = monday.getTime();
    }
    if (!cur || key !== curKey) {
      cur = { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v };
      curKey = key;
      out.push(cur);
    } else {
      cur.h = Math.max(cur.h, b.h);
      cur.l = Math.min(cur.l, b.l);
      cur.c = b.c;
      cur.v += b.v;
    }
  }
  return out;
}

function timeframeBlock(bars) {
  const closes = bars.map((b) => b.c);
  const price = closes.length ? closes[closes.length - 1] : null;
  const sma = {};
  const ema = {};
  const smaSer = {};
  for (const p of PERIODS) {
    const s = smaSeries(closes, p);
    const e = emaSeries(closes, p);
    sma[p] = f2(s[s.length - 1]);
    ema[p] = f2(e[e.length - 1]);
    smaSer[p] = s;
  }
  const rsi = rsiSeries(closes);
  const rsiVal = rsi.length ? rsi[rsi.length - 1] : null;
  let signal = null;
  const s20 = sma[20];
  const s50 = sma[50];
  if (price !== null && s20 !== null && s50 !== null) {
    if (price > s20 && price > s50) signal = "Bullish";
    else if (price < s20 && price < s50) signal = "Bearish";
    else signal = "Neutral";
  }
  const CHART_BARS = 130;
  const start = Math.max(0, bars.length - CHART_BARS);
  const chart = {
    dates: bars.slice(start).map((b) => new Date(b.t).toISOString().slice(0, 10)),
    close: bars.slice(start).map((b) => f2(b.c)),
    sma10: smaSer[10].slice(start).map((v) => (v === null ? null : f2(v))),
    sma20: smaSer[20].slice(start).map((v) => (v === null ? null : f2(v))),
    sma50: smaSer[50].slice(start).map((v) => (v === null ? null : f2(v))),
    sma200: smaSer[200].slice(start).map((v) => (v === null ? null : f2(v))),
  };
  return {
    bars: bars.length,
    status: bars.length >= 15 ? "ok" : "insufficient_data",
    price: f2(price),
    sma,
    ema,
    rsi: {
      value: rsiVal !== null ? f2(rsiVal) : null,
      status: rsiVal === null ? "INSUFFICIENT_DATA" : rsiVal > 70 ? "OVERBOUGHT" : rsiVal < 30 ? "OVERSOLD" : "NEUTRAL",
    },
    signal,
    chart,
  };
}

// Seasonality exactly as app.js seasonalityHtml computes it from daily
// OHLCV: full-month return from the first trading day's open to the last
// trading day's close, months with outsized moves filtered out.
function seasonality(bars) {
  const byMonth = {};
  for (const b of bars) {
    const d = new Date(b.t);
    const k = d.getUTCFullYear() * 12 + d.getUTCMonth();
    if (!byMonth[k]) byMonth[k] = [];
    byMonth[k].push(b);
  }
  const rets = Array.from({ length: 12 }, () => []);
  for (const k of Object.keys(byMonth).sort()) {
    const days = byMonth[k];
    if (days.length < 2) continue;
    const first = days[0].o;
    const last = days[days.length - 1].c;
    if (!first || !last) continue;
    const r = (last / first - 1) * 100;
    if (!Number.isFinite(r) || Math.abs(r) > 60) continue;
    rets[new Date(days[0].t).getUTCMonth()].push(r);
  }
  return rets.map((arr, i) => ({
    month: i,
    avgReturn: arr.length ? f2(arr.reduce((a, b) => a + b, 0) / arr.length) : null,
    years: arr.length,
  }));
}

export async function onRequest(context) {
  const gate = await stockGate(context);
  if (gate.response) return gate.response;
  const { request } = context;
  const ticker = cleanTicker(request);
  if (!ticker) return missingTicker(request);

  try {
    const url =
      "https://query1.finance.yahoo.com/v8/finance/chart/" +
      encodeURIComponent(ticker) +
      "?range=5y&interval=1d";
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error("Yahoo chart returned HTTP " + res.status);
    const json = await res.json();
    const result = json && json.chart && json.chart.result && json.chart.result[0];
    if (!result || !result.timestamp) throw new Error("No chart data.");
    const q = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
    const bars = [];
    for (let i = 0; i < result.timestamp.length; i++) {
      const c = q.close && q.close[i];
      if (c === null || c === undefined) continue;
      bars.push({
        t: result.timestamp[i] * 1000,
        o: (q.open && q.open[i]) || c,
        h: (q.high && q.high[i]) || c,
        l: (q.low && q.low[i]) || c,
        c,
        v: (q.volume && q.volume[i]) || 0,
      });
    }
    if (!bars.length) throw new Error("No price history.");

    const daily = timeframeBlock(bars);
    const weeklyBars = aggregate(bars, "weekly");
    const monthlyBars = aggregate(bars, "monthly");
    const s200 = daily.sma[200];
    const payload = {
      ticker,
      asOf: new Date(bars[bars.length - 1].t).toISOString().slice(0, 10),
      price: daily.price,
      dist200: s200 ? f2(((daily.price - s200) / s200) * 100) : null,
      timeframes: {
        daily,
        weekly: timeframeBlock(weeklyBars),
        monthly: timeframeBlock(monthlyBars),
      },
      trend: trendGauges(bars),
      seasonality: seasonality(bars),
    };
    return dataJson(payload, request, 3600);
  } catch (err) {
    return upstreamError(request, ticker, err);
  }
}
