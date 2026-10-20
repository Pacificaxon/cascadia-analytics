// Shared helpers for the on-demand Ticker Research endpoints (PRO).
// Files prefixed with "_" are not routed by Cloudflare Pages; this module is
// imported by the stock-*.js function files in this directory.
//
// Auth mirrors pro-data.js exactly: verifyPro() from _auth.js validates the
// Supabase JWT server-side and checks profiles.is_pro via the service role.
//   401 -> no/invalid session, 403 -> valid user, not Pro.

import { verifyPro, jsonResponse, handleOptions } from "./_auth.js";

export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// SEC EDGAR fair-use User-Agent (descriptive, per SEC requirements).
export const SEC_UA = "Cascadia Analytics justin@jda-properties.com";

// Runs the standard method/auth gate for a stock endpoint. Returns
// { v } on success (v is the verifyPro result) or { response } to return
// immediately on failure.
export async function stockGate(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return { response: handleOptions(request) };
  if (request.method !== "GET") {
    return { response: jsonResponse({ error: "method_not_allowed" }, 405, request) };
  }
  const v = await verifyPro(request, env);
  if (!v.ok) return { response: jsonResponse({ error: v.error }, v.status, request) };
  if (!v.is_pro) return { response: jsonResponse({ error: "forbidden" }, 403, request) };
  return { v };
}

export function cleanTicker(request) {
  const { searchParams } = new URL(request.url);
  return (searchParams.get("ticker") || "")
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9.\-=]/g, "");
}

export function missingTicker(request) {
  return jsonResponse({ error: "missing_ticker" }, 400, request);
}

// Data responses carry the same cache contract as metrics.js / quality.js:
// browser Cache-Control plus CDN-Cache-Control with stale-if-error, so a
// cached good response can be served through an upstream outage.
export function dataJson(data, request, maxAge) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=" + maxAge,
    "CDN-Cache-Control": "public, max-age=" + maxAge + ", stale-if-error=86400",
  };
  const origin = request.headers.get("Origin");
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return new Response(JSON.stringify(data), { status: 200, headers });
}

export function upstreamError(request, ticker, err) {
  return jsonResponse(
    { error: "upstream_unavailable", ticker, detail: String((err && err.message) || err) },
    502,
    request
  );
}

// Yahoo cookie-and-crumb flow, shared by every on-demand endpoint (the
// stock-*.js endpoints here, and metrics.js / quality.js / alignment.js /
// earnings360.js, which import this instead of keeping private copies).
//
// Yahoo rate-limits the getcrumb endpoint with intermittent HTTP 429 bursts.
// A research page load fires several crumb handshakes at once across its
// panels, and a single unretried 429 used to blank whichever panel lost the
// race (the user hit this on CAH's profile header, October 20). The flow
// therefore:
//   - caches one crumb per isolate for a short TTL, so concurrent panels in
//     the same isolate share a single handshake (Yahoo crumbs stay valid far
//     longer than 10 minutes; the TTL is deliberately conservative),
//   - retries transient failures with backoff, alternating between the
//     query1 and query2 hosts,
//   - bounds each attempt with a timeout so a hung upstream cannot stall
//     the function indefinitely.
const CRUMB_TTL_MS = 10 * 60 * 1000;
const CRUMB_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
const CRUMB_DELAYS_MS = [0, 400, 1100, 2300];
let _crumbCache = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function invalidateCrumb() {
  _crumbCache = null;
}

async function fetchCrumbOnce(host) {
  const cookieRes = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": UA },
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  const setCookie = cookieRes.headers.get("set-cookie") || "";
  const cookies = setCookie
    .split(",")
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
  const crumbRes = await fetch("https://" + host + "/v1/test/getcrumb", {
    headers: { "User-Agent": UA, Cookie: cookies },
    signal: AbortSignal.timeout(15000),
  });
  if (!crumbRes.ok) throw new Error("crumb fetch failed: " + crumbRes.status);
  const crumb = (await crumbRes.text()).trim();
  if (!crumb || crumb.length > 64) throw new Error("crumb fetch failed: malformed crumb");
  return { crumb, cookies };
}

export async function getCrumb() {
  if (_crumbCache && _crumbCache.expires > Date.now()) {
    return { crumb: _crumbCache.crumb, cookies: _crumbCache.cookies };
  }
  let lastErr = null;
  for (let attempt = 0; attempt < CRUMB_DELAYS_MS.length; attempt++) {
    if (CRUMB_DELAYS_MS[attempt]) {
      await sleep(CRUMB_DELAYS_MS[attempt] + Math.floor(Math.random() * 250));
    }
    try {
      const got = await fetchCrumbOnce(CRUMB_HOSTS[attempt % CRUMB_HOSTS.length]);
      _crumbCache = { crumb: got.crumb, cookies: got.cookies, expires: Date.now() + CRUMB_TTL_MS };
      return got;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("crumb fetch failed");
}

export async function quoteSummary(ticker, modules, crumb, cookies) {
  const build = (c) =>
    "https://query2.finance.yahoo.com/v10/finance/quoteSummary/" +
    encodeURIComponent(ticker) +
    "?modules=" +
    modules +
    "&crumb=" +
    encodeURIComponent(c);
  let res = await fetch(build(crumb), {
    headers: { "User-Agent": UA, Cookie: cookies },
    signal: AbortSignal.timeout(30000),
  });
  // A 429 (rate limit) or 401 (crumb rejected) gets one retry on a freshly
  // negotiated crumb before the caller surfaces an upstream error.
  if (res.status === 429 || res.status === 401) {
    invalidateCrumb();
    const fresh = await getCrumb();
    res = await fetch(build(fresh.crumb), {
      headers: { "User-Agent": UA, Cookie: fresh.cookies },
      signal: AbortSignal.timeout(30000),
    });
  }
  if (!res.ok) throw new Error("Yahoo returned HTTP " + res.status);
  const json = await res.json();
  const result = json && json.quoteSummary && json.quoteSummary.result && json.quoteSummary.result[0];
  if (!result) throw new Error("Ticker not found or lacking data.");
  return result;
}

export const num = (o) => (o && typeof o.raw === "number" ? o.raw : null);
export const f2 = (v) =>
  v === null || v === undefined || Number.isNaN(v) ? null : Math.round(v * 100) / 100;

// ---- SEC EDGAR CIK resolution -------------------------------------------
// ticker -> zero-padded CIK from EDGAR's company tickers file, cached at the
// edge (Cache API) and in-isolate. Overrides mirror collect_insider.py for
// foreign filers missing from the file.
const CIK_OVERRIDES = { RNMBY: "0001136934", TSM: "0001046179" };
let _cikMapCache = null;

export async function getCikMap(context) {
  if (_cikMapCache) return _cikMapCache;
  const cacheKey = "https://cascadia.internal/edgar/company_tickers.json";
  let text = null;
  try {
    if (typeof caches !== "undefined" && caches.default) {
      const hit = await caches.default.match(cacheKey);
      if (hit) text = await hit.text();
    }
  } catch (e) {
    /* cache is best-effort */
  }
  if (!text) {
    const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
      headers: { "User-Agent": SEC_UA },
    });
    if (!res.ok) throw new Error("EDGAR tickers fetch failed: " + res.status);
    text = await res.text();
    try {
      if (typeof caches !== "undefined" && caches.default) {
        const put = new Response(text, {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=86400",
            "CDN-Cache-Control": "public, max-age=86400, stale-if-error=604800",
          },
        });
        if (context && typeof context.waitUntil === "function") context.waitUntil(caches.default.put(cacheKey, put));
        else await caches.default.put(cacheKey, put);
      }
    } catch (e) {
      /* cache is best-effort */
    }
  }
  const data = JSON.parse(text);
  const map = {};
  for (const entry of Object.values(data)) {
    const t = (entry.ticker || "").toUpperCase();
    const cik = String(entry.cik_str || "").padStart(10, "0");
    if (t && cik) map[t] = cik;
  }
  Object.assign(map, CIK_OVERRIDES);
  _cikMapCache = map;
  return map;
}

export async function secFetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": SEC_UA, Accept: "application/json" } });
  if (!res.ok) throw new Error("EDGAR returned HTTP " + res.status);
  return res.json();
}

export async function secFetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": SEC_UA } });
  if (!res.ok) throw new Error("EDGAR returned HTTP " + res.status);
  return res.text();
}
