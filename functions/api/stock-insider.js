/**
 * Cascadia Analytics - Ticker Research, insider transactions (PRO)
 * GET /api/stock-insider?ticker=AAPL
 *
 * Recent SEC Form 4 transactions from EDGAR, porting the classification in
 * ~/workspace/macro-relevance/collect_insider.py: open-market purchases (P)
 * and sales (S) are flagged as open market, while grants, exercises, tax
 * withholding, gifts, and other plan transactions are marked automatic.
 * Up to eight recent filings, 25 transactions, newest first.
 * Auth: Supabase JWT + profiles.is_pro via _auth.js (401 / 403).
 */

import {
  stockGate, cleanTicker, missingTicker, dataJson, upstreamError,
  getCikMap, secFetchJson, secFetchText,
} from "./_stock.js";

const OPEN_MARKET = { P: "buy", S: "sell" };
const AUTOMATIC = {
  M: "option exercise",
  A: "grant/award",
  F: "tax withholding",
  G: "gift",
  D: "disposition to issuer",
  C: "conversion",
  J: "other",
};

// Minimal field extraction from Form 4 XML. Workers have no DOMParser, so
// this targets the stable Form 4 element names directly.
function tagValue(xml, tag) {
  const m = new RegExp("<" + tag + ">([\\s\\S]*?)</" + tag + ">").exec(xml);
  return m ? m[1].trim() : null;
}
function blockValue(block, tag) {
  const inner = tagValue(block, tag);
  if (inner === null) return null;
  const v = inner.match(/<value>([\s\S]*?)<\/value>/);
  return v ? v[1].trim() : inner.replace(/<[^>]+>/g, "").trim() || null;
}
function footnoted(block, tag) {
  // Scope to the element itself first: most Form 4 leaf fields wrap their
  // payload in a <value> child, while plain codes (transactionCode) do not.
  const inner = tagValue(block, tag);
  if (inner === null) return null;
  const v = inner.match(/<value>([\s\S]*?)<\/value>/);
  if (v) return v[1].trim();
  const plain = inner.replace(/<[^>]+>/g, "").trim();
  return plain || null;
}

function parseForm4(xml) {
  const ownerName = tagValue(xml, "rptOwnerName") || "Unknown insider";
  let title = "Other";
  const officerTitle = tagValue(xml, "officerTitle");
  if (/<isDirector>1<\/isDirector>|<isDirector>true<\/isDirector>/.test(xml)) title = "Director";
  else if (/<isOfficer>1<\/isOfficer>|<isOfficer>true<\/isOfficer>/.test(xml)) title = officerTitle || "Officer";
  else if (/<isTenPercentOwner>1<\/isTenPercentOwner>|<isTenPercentOwner>true<\/isTenPercentOwner>/.test(xml)) title = "10% Owner";
  if (officerTitle && title !== "Director" && title !== "10% Owner") title = officerTitle;

  const txns = [];
  const blocks = [];
  const blockRe = /<(nonDerivativeTransaction|derivativeTransaction)>([\s\S]*?)<\/\1>/g;
  let bm;
  while ((bm = blockRe.exec(xml)) !== null) blocks.push(bm[2]);
  for (const block of blocks) {
    const code = footnoted(block, "transactionCode");
    if (!code) continue;
    const date = footnoted(block, "transactionDate");
    const sharesRaw = footnoted(block, "transactionShares");
    const priceRaw = footnoted(block, "transactionPricePerShare");
    const ad = footnoted(block, "transactionAcquiredDisposedCode");
    const shares = sharesRaw ? parseFloat(sharesRaw) : null;
    if (!shares || !(shares > 0)) continue;
    let txnType;
    let category;
    let codeLabel;
    if (OPEN_MARKET[code]) {
      txnType = OPEN_MARKET[code];
      category = "open_market";
      codeLabel = "open market";
    } else if (AUTOMATIC[code]) {
      if (code === "D" && ad === "A") continue; // mirrors collect_insider.py skip
      category = "automatic";
      codeLabel = AUTOMATIC[code];
      txnType = ad === "A" ? "buy" : "sell";
    } else {
      continue;
    }
    const price = priceRaw ? parseFloat(priceRaw) : null;
    const cleanPrice = price && price > 0 ? price : null;
    txns.push({
      date: date || null,
      insider: ownerName,
      title,
      type: txnType,
      category,
      code_label: codeLabel,
      shares: Math.round(shares),
      price: cleanPrice,
      value: cleanPrice ? Math.round(shares * cleanPrice) : null,
    });
  }
  return txns;
}

export async function onRequest(context) {
  const gate = await stockGate(context);
  if (gate.response) return gate.response;
  const { request } = context;
  const ticker = cleanTicker(request);
  if (!ticker) return missingTicker(request);

  try {
    const cikMap = await getCikMap(context);
    const cik = cikMap[ticker];
    if (!cik) {
      return dataJson({ ticker, available: false, transactions: [], summary: { buys: 0, sells: 0, automatic_count: 0, net_shares: 0 } }, request, 3600);
    }
    const subs = await secFetchJson("https://data.sec.gov/submissions/CIK" + cik + ".json");
    const recent = (subs.filings && subs.filings.recent) || {};
    const forms = recent.form || [];
    const accessions = recent.accessionNumber || [];
    const primaryDocs = recent.primaryDocument || [];
    const filings = [];
    for (let i = 0; i < forms.length && filings.length < 8; i++) {
      if (forms[i] === "4") filings.push({ acc: accessions[i], doc: primaryDocs[i] });
    }
    if (!filings.length) {
      return dataJson({ ticker, available: false, transactions: [], summary: { buys: 0, sells: 0, automatic_count: 0, net_shares: 0 } }, request, 3600);
    }
    const cikInt = String(parseInt(cik, 10));
    const all = [];
    for (const f of filings) {
      const accClean = String(f.acc || "").replace(/-/g, "");
      if (!accClean) continue;
      const rawName = String(f.doc || "").split("/").pop();
      const candidates = [
        "https://www.sec.gov/Archives/edgar/data/" + cikInt + "/" + accClean + "/" + rawName,
        "https://www.sec.gov/Archives/edgar/data/" + cikInt + "/" + accClean + "/" + f.doc,
      ];
      let xml = null;
      for (const url of candidates) {
        try {
          const txt = await secFetchText(url);
          if (txt.includes("<ownershipDocument")) {
            xml = txt;
            break;
          }
        } catch (e) {
          /* try the next candidate */
        }
      }
      if (!xml) continue;
      try {
        all.push(...parseForm4(xml));
      } catch (e) {
        /* skip an unparseable filing, keep the rest */
      }
    }
    all.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    const txns = all.slice(0, 25);
    let buys = 0;
    let sells = 0;
    let auto = 0;
    let net = 0;
    for (const t of txns) {
      if (t.category === "open_market") {
        if (t.type === "buy") {
          buys++;
          net += t.shares;
        } else {
          sells++;
          net -= t.shares;
        }
      } else {
        auto++;
      }
    }
    return dataJson(
      {
        ticker,
        available: txns.length > 0,
        as_of: new Date().toISOString(),
        transactions: txns,
        summary: { buys, sells, automatic_count: auto, net_shares: net },
      },
      request,
      3600
    );
  } catch (err) {
    return upstreamError(request, ticker, err);
  }
}
