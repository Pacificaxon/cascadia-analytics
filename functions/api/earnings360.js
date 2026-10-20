/**
 * Cascadia Analytics - Earnings Event Matrix (PRO)
 * GET /api/earnings360?ticker=NVDA
 *
 * On-demand institutional earnings preview for ANY ticker:
 *  1. Pulls live price, fundamentals, and the front-month options chain from Yahoo Finance
 *     (crumb/cookie auth, same pattern as /api/quality).
 *  2. Computes the front-month ATM straddle implied move and the put/call open-interest ratio
 *     with plain math, so the AI cannot hallucinate options metrics.
 *  3. Feeds those grounded numbers plus the next earnings date into Gemini Flash, which
 *     synthesizes the 5-pillar narrative (macro, micro, history, options mechanics, verdict).
 *
 * Requires the GEMINI_API_KEY secret in Cloudflare Pages env vars.
 * Cached 1h at the edge to stay inside Gemini's free-tier rate limits.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const GEMINI_MODEL = "gemini-3.8-flash";
const GROQ_MODEL = "openai/gpt-oss-120b";
const OPENROUTER_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";
// Timeouts so a hung upstream becomes a fast fallback instead of a hung request.
const YAHOO_TIMEOUT_MS = 10000;
const AI_TIMEOUT_MS = 15000;
const OPENROUTER_TIMEOUT_MS = 30000;
const tmo = (ms) => ({ signal: AbortSignal.timeout(ms) });

async function getCrumb() {
  const cookieRes = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": UA },
    redirect: "manual",
    ...tmo(YAHOO_TIMEOUT_MS),
  });
  const setCookie = cookieRes.headers.get("set-cookie") || "";
  const cookies = setCookie.split(",").map((c) => c.split(";")[0].trim()).filter(Boolean).join("; ");
  const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, Cookie: cookies },
    ...tmo(YAHOO_TIMEOUT_MS),
  });
  if (!crumbRes.ok) throw new Error("crumb fetch failed: " + crumbRes.status);
  const crumb = (await crumbRes.text()).trim();
  return { crumb, cookies };
}

const num = (o) => (o && typeof o.raw === "number" ? o.raw : null);

function buildPrompt(tk, g) {
  const opts = g.impliedMove !== null
    ? `The ${g.expiryDate} expiry at-the-money straddle implies a move of plus or minus ${g.impliedMove}% (±$${g.impliedMoveDollars}) into that expiry${g.isEarningsExpiry ? ", which is the first expiry capturing the next earnings date" : ""}. The put/call open-interest ratio on that expiry is ${g.putCallRatio}.`
    : "No liquid options chain was found for the selected expiry, so no implied move could be computed. Say so plainly instead of inventing one.";
  const bounds = g.bullTarget !== null
    ? `- Mathematical +1 standard deviation (Bull) target: $${g.bullTarget}\n- Mathematical -1 standard deviation (Bear) target: $${g.bearTarget}`
    : "- No options-implied bounds available; estimate reasonable scenario targets from fundamentals and say the bounds are estimated, not options-implied.";
  return (
    `Act as an institutional quantitative analyst and macro strategist. Write a probabilistic earnings preview and price-reaction analysis for ${tk}. Think in distributions, not binaries: assign explicit probabilities to Bull, Base, and Bear scenarios.\n\n` +
    `GROUNDED DATA (treat these as facts, never contradict them):\n` +
    `- Ticker: ${tk} (${g.companyName}), ${g.sector} / ${g.industry}\n` +
    `- Current price: $${g.price}\n` +
    `- Next earnings date: ${g.earningsDate}\n` +
    `- Gross margin: ${g.grossMargin}, revenue growth YoY: ${g.revGrowth}\n` +
    `- Options market: ${opts}\n` +
    `${bounds}\n\n` +
    `HOUSE STYLE (mandatory): never use em dashes. Never use the "label: explanation" pattern; write flowing sentences instead. ` +
    `Never ask rhetorical questions; use transitions like however, while, and furthermore. Be precise and quantitative, ` +
    `confident without arrogance, and concede uncertainty where the data is thin. No markdown, no bullet lists, plain paragraphs.\n\n` +
    `Return ONLY a strict JSON object with exactly these fields, no markdown fences, no commentary outside the json:\n` +
    `{\n` +
    `  "macroDynamics": "How the current yield curve, Fed policy, liquidity conditions, and any tariff or supply-chain forces bear on this specific sector and company.",\n` +
    `  "microFundamentals": "Operating metrics, margin trajectory, and the top two narrative drivers institutional investors are focused on for ${tk}.",\n` +
    `  "historicalCommentary": "How management tone and execution against guidance have evolved over the last four quarters, from your knowledge base.",\n` +
    `  "optionsMechanics": "What the options market is pricing. Reference the grounded implied move and put/call ratio above. Discuss IV crush dynamics and dealer positioning effects on the post-earnings move.",\n` +
    `  "scenarios": {\n` +
    `    "bull": { "probability": <integer 0-100>, "priceTarget": "${g.bullTarget !== null ? "$" + g.bullTarget : "your estimated bull target as $X.XX"}", "trigger": "The specific fundamental beat that drives this outcome.", "reaction": "How algorithmic and dealer flow reacts post-print in this scenario." },\n` +
    `    "base": { "probability": <integer 0-100, must be the highest of the three>, "priceTarget": "Your estimated base-case settlement price as $X.XX, near current spot.", "trigger": "The most likely fundamental outcome.", "reaction": "The most likely post-earnings market flow." },\n` +
    `    "bear": { "probability": <integer 0-100>, "priceTarget": "${g.bearTarget !== null ? "$" + g.bearTarget : "your estimated bear target as $X.XX"}", "trigger": "The specific miss or guidance cut that drives this outcome.", "reaction": "How dealer hedging accelerates the move in this scenario." }\n` +
    `  }\n` +
    `}\n` +
    `CRITICAL: bull.probability + base.probability + bear.probability MUST sum to exactly 100, and base.probability MUST be the highest of the three. ` +
    `Use the grounded $${g.bullTarget !== null ? g.bullTarget + " / $" + g.bearTarget : "bounds"} for the bull and bear price targets exactly as given; never invent different ones.`
  );
}

async function callGemini(prompt, apiKey) {
  const gUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const gRes = await fetch(gUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...tmo(AI_TIMEOUT_MS),
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    }),
  });
  if (gRes.status === 429) {
    const e = new Error("Gemini rate-limited");
    e.code = 429;
    throw e;
  }
  if (!gRes.ok) {
    const b = await gRes.text().catch(() => "");
    throw new Error(`Gemini HTTP ${gRes.status}: ${b.slice(0, 160)}`);
  }
  const gJson = await gRes.json();
  const rawText = gJson?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("Empty response from Gemini.");
  return rawText;
}

async function callGroq(prompt, apiKey) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    ...tmo(AI_TIMEOUT_MS),
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    }),
  });
  if (r.status === 429) {
    const e = new Error("Groq rate-limited");
    e.code = 429;
    throw e;
  }
  if (!r.ok) {
    const b = await r.text().catch(() => "");
    throw new Error(`Groq HTTP ${r.status}: ${b.slice(0, 160)}`);
  }
  const j = await r.json();
  const text = j?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty response from Groq.");
  return text;
}

async function callOpenRouter(prompt, apiKey) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    ...tmo(OPENROUTER_TIMEOUT_MS),
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });
  if (r.status === 429) {
    const e = new Error("OpenRouter rate-limited");
    e.code = 429;
    throw e;
  }
  if (!r.ok) {
    const b = await r.text().catch(() => "");
    throw new Error(`OpenRouter HTTP ${r.status}: ${b.slice(0, 160)}`);
  }
  const j = await r.json();
  const text = j?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty response from OpenRouter.");
  return text;
}

export async function onRequestGet(context) {
  const { searchParams } = new URL(context.request.url);
  const ticker = (searchParams.get("ticker") || "").toUpperCase().trim().replace(/[^A-Z0-9.\-=]/g, "");
  if (!ticker) {
    return Response.json({ error: "Missing ticker parameter" }, { status: 400 });
  }

  const GEMINI_API_KEY = context.env && context.env.GEMINI_API_KEY;
  const GROQ_API_KEY = context.env && context.env.GROQ_API_KEY;
  const OPENROUTER_API_KEY = context.env && context.env.OPENROUTER_API_KEY;
  if (!GEMINI_API_KEY && !GROQ_API_KEY && !OPENROUTER_API_KEY) {
    return Response.json(
      { error: "AI analysis is not configured yet (missing API key).", ticker },
      { status: 503 }
    );
  }

  try {
    const { crumb, cookies } = await getCrumb();
    const H = { "User-Agent": UA, Cookie: cookies };
    const cb = `&crumb=${encodeURIComponent(crumb)}`;

    // Live quote, profile, fundamentals, and the earnings calendar in one call.
    const qUrl =
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}` +
      `?modules=price,summaryProfile,financialData,calendarEvents${cb}`;
    const qRes = await fetch(qUrl, { headers: H, ...tmo(YAHOO_TIMEOUT_MS) });
    if (!qRes.ok) throw new Error(`Yahoo quote returned HTTP ${qRes.status}`);
    const qJson = await qRes.json();
    const q = qJson?.quoteSummary?.result?.[0];
    if (!q) throw new Error("Ticker not found or unsupported.");

    const price = num(q.price?.regularMarketPrice) || 0;
    const companyName = q.price?.longName || q.price?.shortName || ticker;
    const sector = q.summaryProfile?.sector || "Unknown";
    const industry = q.summaryProfile?.industry || "Unknown";
    const fin = q.financialData || {};
    const grossMargin = fin.grossMargins?.fmt || "N/A";
    const revGrowth = fin.revenueGrowth?.fmt || "N/A";

    let earningsDate = "not published";
    let earningsTs = null;
    const ed = q.calendarEvents?.earningsDate;
    if (ed && ed.raw) {
      earningsTs = ed.raw;
      const d = new Date(ed.raw * 1000);
      earningsDate = d.toISOString().slice(0, 10);
    } else if (q.calendarEvents?.earningsDate?.fmt) {
      earningsDate = q.calendarEvents.earningsDate.fmt;
    }

    // Options-implied move: the user can pick which expiry's straddle to use.
    // Default is the first expiry on/after the earnings date (the "earnings move"),
    // falling back to front-month when no earnings date is published.
    const expiryParam = parseInt(searchParams.get("expiry") || "", 10) || null;
    // numOf: Yahoo sometimes returns numbers flat, sometimes as {raw, fmt} objects.
    const numOf = (v) => {
      if (typeof v === "number") return v;
      if (v && typeof v.raw === "number") return v.raw;
      return 0;
    };
    let impliedMove = null;
    let impliedMoveDollars = null;
    let putCallRatio = null;
    let expirations = [];
    let selectedExpiry = null;
    let expiryDate = null;
    let isEarningsExpiry = false;
    let earningsExpiryTs = null;
    try {
      const oUrl = `https://query2.finance.yahoo.com/v7/finance/options/${ticker}?${cb.slice(1)}`;
      const oRes = await fetch(oUrl, { headers: H, ...tmo(YAHOO_TIMEOUT_MS) });
      if (oRes.ok) {
        const oJson = await oRes.json();
        const chain = oJson?.optionChain?.result?.[0];
        const expDates = (chain?.expirationDates || []).filter((t) => typeof t === "number" && t > 0);
        const fmtExp = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);
        expirations = expDates.slice(0, 12).map((ts) => ({ ts, date: fmtExp(ts) }));
        // Default expiry: first one capturing earnings, else first expiry at
        // least 7 days out (a 0DTE/near-term straddle is noise for this purpose).
        let defExpiry = expDates[0] || null;
        let earningsExpiry = null;
        if (earningsTs) {
          earningsExpiry = expDates.find((t) => t >= earningsTs) || null;
          if (earningsExpiry) defExpiry = earningsExpiry;
        } else {
          const weekOut = Math.floor(Date.now() / 1000) + 7 * 86400;
          defExpiry = expDates.find((t) => t >= weekOut) || defExpiry;
        }
        selectedExpiry = expiryParam && expDates.includes(expiryParam) ? expiryParam : defExpiry;
        earningsExpiryTs = earningsExpiry;
        isEarningsExpiry = !!(earningsExpiry && selectedExpiry === earningsExpiry);
        // Fetch the chain for the selected expiry (base call already returns front-month).
        let exp = chain?.options?.[0];
        if (selectedExpiry && exp && exp.expirationDate !== selectedExpiry) {
          const eUrl = `https://query2.finance.yahoo.com/v7/finance/options/${ticker}?date=${selectedExpiry}&${cb.slice(1)}`;
          const eRes = await fetch(eUrl, { headers: H, ...tmo(YAHOO_TIMEOUT_MS) });
          if (eRes.ok) {
            const eJson = await eRes.json();
            exp = eJson?.optionChain?.result?.[0]?.options?.[0] || exp;
          }
        }
        if (selectedExpiry) expiryDate = fmtExp(selectedExpiry);
        const calls = (exp && exp.calls) || [];
        const puts = (exp && exp.puts) || [];
        if (calls.length && puts.length && price > 0) {
          const atm = (arr) =>
            arr.reduce((a, b) => (Math.abs(numOf(b.strike) - price) < Math.abs(numOf(a.strike) - price) ? b : a));
          const c = atm(calls);
          const p = atm(puts);
          const callPx = numOf(c.lastPrice) || numOf(c.bid);
          const putPx = numOf(p.lastPrice) || numOf(p.bid);
          if (callPx > 0 && putPx > 0) {
            impliedMove = Math.round(((callPx + putPx) / price) * 10000) / 100;
            impliedMoveDollars = Math.round((callPx + putPx) * 100) / 100;
          }
          const callOI = calls.reduce((s, x) => s + numOf(x.openInterest), 0);
          const putOI = puts.reduce((s, x) => s + numOf(x.openInterest), 0);
          if (callOI > 0) putCallRatio = Math.round((putOI / callOI) * 100) / 100;
        }
      }
    } catch (e) {
      // Options are a bonus; the analysis still works without them.
    }

    const grounded = {
      ticker,
      companyName,
      sector,
      industry,
      price: Math.round(price * 100) / 100,
      earningsDate,
      grossMargin,
      revGrowth,
      impliedMove,
      impliedMoveDollars,
      putCallRatio,
      expiryDate,
      isEarningsExpiry,
      // Mathematical +/-1 sigma bounds from the live straddle. The AI maps its
      // fundamental scenarios to these exact dollar levels, never inventing targets.
      bullTarget: impliedMoveDollars !== null ? Math.round((price + impliedMoveDollars) * 100) / 100 : null,
      bearTarget: impliedMoveDollars !== null ? Math.round((price - impliedMoveDollars) * 100) / 100 : null,
    };

    // AI synthesis: Gemini first, then Groq, then OpenRouter. Each provider is
    // tried with parse; any failure (timeout, HTTP error, malformed JSON)
    // falls through to the next provider.
    const prompt = buildPrompt(ticker, grounded);
    const required = ["macroDynamics", "microFundamentals", "historicalCommentary", "optionsMechanics"];
    const providerErrors = [];
    const errTag = (e) => (e && e.name === "TimeoutError" ? "timeout" : (e && e.code === 429 ? "429" : String((e && e.message) || e)));
    const parseStrict = (rawText) => {
      const start = rawText.indexOf("{");
      const end = rawText.lastIndexOf("}");
      if (start < 0 || end <= start) throw new Error("no JSON object found");
      const analysis = JSON.parse(rawText.slice(start, end + 1));
      for (const k of required) {
        if (typeof analysis[k] !== "string" || !analysis[k].trim()) throw new Error("incomplete analysis");
      }
      // Probabilistic Scenario Matrix validation: bull/base/bear with probabilities summing to 100, base highest.
      const sc = analysis.scenarios;
      if (!sc || typeof sc !== "object") throw new Error("missing scenarios");
      for (const name of ["bull", "base", "bear"]) {
        const s = sc[name];
        if (!s || typeof s !== "object") throw new Error("missing scenario " + name);
        if (!Number.isInteger(s.probability) || s.probability < 0 || s.probability > 100) throw new Error("bad probability in " + name);
        for (const k of ["priceTarget", "trigger", "reaction"]) {
          if (typeof s[k] !== "string" || !s[k].trim()) throw new Error("missing " + k + " in " + name);
        }
      }
      const total = sc.bull.probability + sc.base.probability + sc.bear.probability;
      if (total !== 100) throw new Error("probabilities sum to " + total + ", not 100");
      if (sc.base.probability < sc.bull.probability || sc.base.probability < sc.bear.probability) throw new Error("base is not the highest probability");
      return analysis;
    };
    const tryProvider = async (name, apiKey, fn) => {
      if (!apiKey) {
        providerErrors.push(name + ": no key");
        return null;
      }
      try {
        const rawText = await fn(prompt, apiKey);
        const analysis = parseStrict(rawText);
        return { analysis, provider: name };
      } catch (e) {
        providerErrors.push(name + ": " + errTag(e));
        return null;
      }
    };
    let result = await tryProvider("gemini", GEMINI_API_KEY, callGemini);
    if (!result) result = await tryProvider("groq", GROQ_API_KEY, callGroq);
    if (!result) result = await tryProvider("openrouter", OPENROUTER_API_KEY, callOpenRouter);
    if (!result) {
      const limited = providerErrors.some((m) => m.includes("429"));
      return Response.json(
        {
          error: limited
            ? "AI analysis is rate-limited right now. Try again in a minute."
            : `AI analysis failed [${providerErrors.join("; ")}]`,
          ticker,
        },
        { status: limited ? 429 : 502 }
      );
    }
    const { analysis, provider } = result;

    return Response.json(
      { ...grounded, provider, analysis, expirations, selectedExpiry, earningsExpiryTs },
      { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600", "CDN-Cache-Control": "public, max-age=3600, stale-if-error=86400" } }
    );
  } catch (err) {
    return Response.json({ error: String(err.message || err), ticker }, { status: 502 });
  }
}
