/**
 * Cascadia Analytics - Ticker Research, options positioning (PRO)
 * GET /api/stock-options?ticker=AAPL
 *
 * Gamma exposure and volatility skew from CBOE delayed chains, porting the
 * house collectors exactly:
 *   GEX: ~/workspace/gex-tracker/track_tickers.py (gamma from the chain,
 *   GEX = gamma x OI x 100 x spot, calls positive and puts negative,
 *   per-strike profile within 20% of spot, walls within 15%, zero-gamma
 *   flip from a plus-or-minus 30% Black-Scholes sweep at r = 5.2%).
 *   Skew: ~/workspace/gex-tracker/track_ticker_skew.py (7% OTM put minus
 *   7% OTM call IV near 30 DTE, tiered strike bands for coarse grids).
 * Output shapes match the ticker_gex / ticker_skew entries the site's
 * renderers consume. No usable options market returns available: false.
 * Auth: Supabase JWT + profiles.is_pro via _auth.js (401 / 403).
 */

import { stockGate, cleanTicker, missingTicker, dataJson } from "./_stock.js";
import { jsonResponse } from "./_auth.js";

const CBOE_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const RISK_FREE = 0.052;

function parseOcc(occ) {
  const m = /^([A-Z0-9]{1,6})(\d{6})([CP])(\d{8})$/.exec(occ || "");
  if (!m) return null;
  const yy = 2000 + parseInt(m[2].slice(0, 2), 10);
  const mm = parseInt(m[2].slice(2, 4), 10);
  const dd = parseInt(m[2].slice(4, 6), 10);
  return { exp: Date.UTC(yy, mm - 1, dd), cp: m[3], strike: parseInt(m[4], 10) / 1000 };
}

function bsGamma(spot, strike, tYears, iv, r = RISK_FREE) {
  if (tYears <= 0 || iv <= 0 || spot <= 0 || strike <= 0) return 0;
  const d1 = (Math.log(spot / strike) + (r + 0.5 * iv * iv) * tYears) / (iv * Math.sqrt(tYears));
  const nd1 = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
  return nd1 / (spot * iv * Math.sqrt(tYears));
}

const round = (v, d) => {
  const p = Math.pow(10, d);
  return Math.round(v * p) / p;
};

function computeGex(contracts, spot, todayMs) {
  let callGex = 0;
  let putGex = 0;
  for (const c of contracts) {
    const g = c.gamma * c.oi * 100 * spot;
    if (c.cp === "C") callGex += g;
    else putGex -= g;
  }
  const totalGex = callGex + putGex;

  const strikeGex = {};
  for (const c of contracts) {
    const g = c.gamma * c.oi * 100 * spot;
    const key = c.strike;
    if (!strikeGex[key]) strikeGex[key] = { call_gex: 0, put_gex: 0, call_oi: 0, put_oi: 0 };
    if (c.cp === "C") {
      strikeGex[key].call_gex += g;
      strikeGex[key].call_oi += c.oi;
    } else {
      strikeGex[key].put_gex += -g;
      strikeGex[key].put_oi += c.oi;
    }
  }
  const strikes = [];
  for (const k of Object.keys(strikeGex).map(Number).sort((a, b) => a - b)) {
    if (Math.abs(k - spot) / spot > 0.2) continue;
    const s = strikeGex[k];
    strikes.push({
      strike: round(k, 2),
      call_gex: round(s.call_gex / 1e6, 3),
      put_gex: round(s.put_gex / 1e6, 3),
      net_gex: round((s.call_gex + s.put_gex) / 1e6, 3),
      call_oi: s.call_oi,
      put_oi: s.put_oi,
      total_oi: s.call_oi + s.put_oi,
    });
  }
  const agg = [];
  let cum = 0;
  for (const s of strikes) {
    cum += s.net_gex;
    agg.push({ strike: s.strike, agg_gex: round(cum, 3) });
  }
  const nearbyNet = strikes.filter((s) => Math.abs(s.strike - spot) / spot < 0.15);
  let callWall = null;
  let putWall = null;
  if (nearbyNet.length) {
    callWall = nearbyNet.reduce((a, b) => (b.net_gex > a.net_gex ? b : a)).strike;
    putWall = nearbyNet.reduce((a, b) => (b.net_gex < a.net_gex ? b : a)).strike;
  }

  // Zero-gamma sweep, plus-or-minus 30% in 1% steps (track_tickers.py).
  const levels = [];
  for (let pct = -30; pct <= 30; pct++) {
    const simSpot = spot * (1 + pct / 100);
    let simGex = 0;
    for (const c of contracts) {
      const g = bsGamma(simSpot, c.strike, c.t, c.iv);
      const contrib = g * c.oi * 100 * simSpot;
      simGex += c.cp === "C" ? contrib : -contrib;
    }
    levels.push([simSpot, simGex]);
  }
  let zeroGamma = null;
  for (let i = 0; i < levels.length - 1; i++) {
    const [p1, g1] = levels[i];
    const [p2, g2] = levels[i + 1];
    if (g1 >= 0 !== g2 >= 0 && g1 !== g2) {
      const frac = Math.abs(g1) / (Math.abs(g1) + Math.abs(g2));
      zeroGamma = p1 + frac * (p2 - p1);
      break;
    }
  }

  return {
    spot: round(spot, 2),
    total_gex: round(totalGex / 1e6, 2),
    call_gex: round(callGex / 1e6, 2),
    put_gex: round(putGex / 1e6, 2),
    gex_unit: "M",
    regime: totalGex > 0 ? "positive" : "negative",
    zero_gamma: zeroGamma ? round(zeroGamma, 2) : null,
    call_wall: callWall !== null ? round(callWall, 2) : null,
    put_wall: putWall !== null ? round(putWall, 2) : null,
    contracts_analyzed: contracts.length,
    strikes,
    agg_curve: agg,
    as_of: new Date().toISOString(),
    available: true,
  };
}

function computeSkew(options, spot, todayMs) {
  const all = [];
  const puts = [];
  const calls = [];
  for (const opt of options) {
    const parsed = parseOcc(opt.option);
    if (!parsed) continue;
    const dte = Math.round((parsed.exp - todayMs) / 86400000);
    if (dte < 25 || dte > 35) continue;
    const iv = opt.iv;
    if (!iv || iv <= 0) continue;
    const moneyness = parsed.strike / spot;
    all.push({ cp: parsed.cp, moneyness, iv, strike: parsed.strike, dte });
    if (parsed.cp === "P" && moneyness >= 0.9 && moneyness <= 0.96) {
      puts.push([Math.abs(moneyness - 0.93), iv, parsed.strike, dte]);
    } else if (parsed.cp === "C" && moneyness >= 1.04 && moneyness <= 1.1) {
      calls.push([Math.abs(moneyness - 1.07), iv, parsed.strike, dte]);
    }
  }
  // Tier 2 fallback for a side the primary bands missed (coarse strike
  // grids), same window and IV requirement, strikes used still disclosed.
  let tierPuts = puts;
  let tierCalls = calls;
  if (!tierPuts.length) {
    tierPuts = all
      .filter((c) => c.cp === "P" && c.moneyness >= 0.82 && c.moneyness <= 0.995)
      .map((c) => [Math.abs(c.moneyness - 0.93), c.iv, c.strike, c.dte]);
  }
  if (!tierCalls.length) {
    tierCalls = all
      .filter((c) => c.cp === "C" && c.moneyness >= 1.005 && c.moneyness <= 1.18)
      .map((c) => [Math.abs(c.moneyness - 1.07), c.iv, c.strike, c.dte]);
  }
  if (!tierPuts.length || !tierCalls.length) return null;
  const byDist = (a, b) => a[0] - b[0];
  tierPuts.sort(byDist);
  tierCalls.sort(byDist);
  const putIv = tierPuts[0][1];
  const callIv = tierCalls[0][1];
  const skewVp = round((putIv - callIv) * 100, 1);
  let regime;
  let label;
  if (skewVp >= 15) {
    regime = "extreme_fear";
    label = "Extreme fear";
  } else if (skewVp >= 10) {
    regime = "elevated_fear";
    label = "Elevated fear";
  } else if (skewVp >= 5) {
    regime = "normal";
    label = "Normal skew";
  } else {
    regime = "complacent";
    label = "Complacent";
  }
  // IV-by-strike curve for the research page's skew chart. The chart
  // renderer draws nothing without a curve array, which is why the
  // on-demand skew panel previously showed only the headline IV pair.
  // One point per strike inside 25% of spot, from the same 25-35 DTE
  // window; where several expiries share a strike and side, keep the one
  // nearest 30 DTE. IVs are percents, matching put_iv / call_iv below.
  const byStrikeSide = {};
  for (const c of all) {
    if (c.moneyness < 0.75 || c.moneyness > 1.25) continue;
    const key = c.strike + ":" + c.cp;
    const prev = byStrikeSide[key];
    if (!prev || Math.abs(c.dte - 30) < Math.abs(prev.dte - 30)) byStrikeSide[key] = c;
  }
  const strikeSet = {};
  for (const key of Object.keys(byStrikeSide)) strikeSet[key.split(":")[0]] = true;
  const curve = Object.keys(strikeSet)
    .map(Number)
    .sort((a, b) => a - b)
    .map((s) => {
      const p = byStrikeSide[s + ":P"];
      const cl = byStrikeSide[s + ":C"];
      return {
        strike: s,
        put_iv: p ? round(p.iv * 100, 1) : null,
        call_iv: cl ? round(cl.iv * 100, 1) : null,
      };
    });
  const dteCounts = {};
  for (const key of Object.keys(byStrikeSide)) {
    const d = byStrikeSide[key].dte;
    dteCounts[d] = (dteCounts[d] || 0) + 1;
  }
  let curveDte = tierPuts[0][3];
  let bestCount = 0;
  for (const d of Object.keys(dteCounts)) {
    if (dteCounts[d] > bestCount) { bestCount = dteCounts[d]; curveDte = Number(d); }
  }
  return {
    spot: round(spot, 2),
    curve,
    curve_dte: curveDte,
    put_iv: round(putIv * 100, 1),
    call_iv: round(callIv * 100, 1),
    put_strike: round(tierPuts[0][2], 2),
    call_strike: round(tierCalls[0][2], 2),
    dte: tierPuts[0][3],
    skew: skewVp,
    regime,
    regime_label: label,
    trend: null,
    skew_change: null,
    as_of: new Date().toISOString(),
    available: true,
  };
}

export async function onRequest(context) {
  const gate = await stockGate(context);
  if (gate.response) return gate.response;
  const { request } = context;
  const ticker = cleanTicker(request);
  if (!ticker) return missingTicker(request);

  const unavailable = { ticker, available: false, gex: null, skew: null };
  let data;
  try {
    const res = await fetch("https://cdn.cboe.com/api/global/delayed_quotes/options/" + encodeURIComponent(ticker) + ".json", {
      headers: { "User-Agent": CBOE_UA },
    });
    if (!res.ok) return jsonResponse(unavailable, 200, request);
    const json = await res.json();
    data = json && json.data;
  } catch (e) {
    return jsonResponse(unavailable, 200, request);
  }
  const spot = data && data.current_price;
  if (!spot || spot <= 0 || !Array.isArray(data.options)) {
    return jsonResponse(unavailable, 200, request);
  }

  // The collectors anchor "today" to the New York date; match that so DTE
  // windows line up with the daily GEX and skew runs.
  const etParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const et = {};
  for (const p of etParts) et[p.type] = p.value;
  const todayMs = Date.UTC(Number(et.year), Number(et.month) - 1, Number(et.day));
  const contracts = [];
  for (const opt of data.options) {
    const oi = opt.open_interest || 0;
    if (oi <= 0) continue;
    const gamma = opt.gamma;
    const iv = opt.iv;
    if (gamma === null || gamma === undefined || iv === null || iv === undefined || iv <= 0) continue;
    const parsed = parseOcc(opt.option);
    if (!parsed || !parsed.strike) continue;
    const t = (parsed.exp - todayMs) / (365 * 86400000);
    if (t <= 0 || t > 2) continue;
    contracts.push({ strike: parsed.strike, cp: parsed.cp, oi, iv, t, gamma });
  }
  if (!contracts.length) return jsonResponse(unavailable, 200, request);

  const gex = computeGex(contracts, spot, todayMs);
  const skew = computeSkew(data.options, spot, todayMs);
  return dataJson({ ticker, available: true, gex, skew }, request, 1800);
}
