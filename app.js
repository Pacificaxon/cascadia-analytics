/* Cascadia Analytics, single-page app */
(function () {
 "use strict";
 // D is defined below as a Proxy (after PRO_DATA/fetchProData) merging free + Pro API data
 const app = document.getElementById("app");
 const PRO_KEY = "cascadia_pro";

 /* ---------- helpers ---------- */
 const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");
 const fmt$ = (n, d) => {
  if (n == null || isNaN(n)) return " - ";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: d != null ? d : 2, maximumFractionDigits: d != null ? d : 2 });
 };
 const fmtM = (n) => {
  if (n == null || isNaN(n)) return " - ";
  const a = Math.abs(n);
  if (a >= 1000) return "$" + (n / 1000).toFixed(1) + "B";
  return "$" + Math.round(n) + "M";
 };
 const fmtPct = (n, d) => (n == null || isNaN(n)) ? " - " : (n >= 0 ? "+" : "") + Number(n).toFixed(d != null ? d : 1) + "%";
 const cls = (n) => (n == null || isNaN(n)) ? "" : (n >= 0 ? "pos" : "neg");
 // Company logos (Clearbit) and industries for ticker headers
 const TICKER_META = {
  "ALAB": { domain: "asteralabs.com", industry: "Semiconductors" },
  "AMKR": { domain: "amkor.com", industry: "Semiconductors" },
  "AMPX": { domain: "amprius.com", industry: "Batteries" },
  "ASML": { domain: "asml.com", industry: "Semiconductor Equipment" },
  "AVAV": { domain: "avinc.com", industry: "Aerospace & Defense" },
  "AVGO": { domain: "broadcom.com", industry: "Semiconductors" },
  "AXON": { domain: "axon.com", industry: "Aerospace & Defense" },
  "BSX": { domain: "bostonscientific.com", industry: "Medical Devices" },
  "CDNL": { domain: "cardinalhealth.com", industry: "Healthcare" },
  "CSX": { domain: "csx.com", industry: "Railroads" },
  "ENS": { domain: "enersys.com", industry: "Electrical Equipment" },
  "IA": { domain: "i-a.com", industry: "Technology" },
  "INTC": { domain: "intel.com", industry: "Semiconductors" },
  "ISRG": { domain: "intuitive.com", industry: "Medical Devices" },
  "LEU": { domain: "centrusenergy.com", industry: "Uranium" },
  "LRCX": { domain: "lamresearch.com", industry: "Semiconductor Equipment" },
  "MELI": { domain: "mercadolibre.com", industry: "E-commerce" },
  "META": { domain: "meta.com", industry: "Social Media" },
  "MITK": { domain: "miteksystems.com", industry: "Software" },
  "MRNA": { domain: "moderna.com", industry: "Biotechnology" },
  "MRVL": { domain: "marvell.com", industry: "Semiconductors" },
  "MSI": { domain: "motorolasolutions.com", industry: "Telecom Equipment" },
  "NSC": { domain: "nscorp.com", industry: "Railroads" },
  "PANW": { domain: "paloaltonetworks.com", industry: "Cybersecurity" },
  "PLPC": { domain: "preformed.com", industry: "Industrials" },
  "POWW": { domain: "ammunitionstore.com", industry: "Ammunition" },
  "RBRK": { domain: "rubrik.com", industry: "Cybersecurity" },
  "RNMBY": { domain: "rheinmetall.com", industry: "Aerospace & Defense" },
  "ROAD": { domain: "construction.com", industry: "Construction" },
  "SMTC": { domain: "semtech.com", industry: "Semiconductors" },
  "SNPS": { domain: "synopsys.com", industry: "Semiconductors" },
  "TSM": { domain: "tsmc.com", industry: "Semiconductors" },
  "TTMI": { domain: "ttm.com", industry: "Electronics" },
  "UNP": { domain: "up.com", industry: "Railroads" },
  "VIAV": { domain: "viavisolutions.com", industry: "Telecom Equipment" },
  "VLO": { domain: "valero.com", industry: "Refining" },
  "VST": { domain: "vistracorp.com", industry: "Utilities" },
 };
 const tickerLogo = (tk) => {
  const meta = TICKER_META[tk];
  if (!meta || !meta.domain) return "";
  // Primary: DuckDuckGo icons (reliable). Fallback: Clearbit (higher quality when up).
  return '<img src="https://icons.duckduckgo.com/ip3/' + meta.domain + '.ico" alt="" ' +
   'style="width:36px;height:36px;border-radius:8px;object-fit:contain;background:#fff;padding:2px;" ' +
   'onerror="this.onerror=null;this.src=\'https://logo.clearbit.com/' + meta.domain + '\';" />';
 };
 const tickerIndustry = (tk) => {
  const meta = TICKER_META[tk];
  return meta && meta.industry ? meta.industry : "";
 };
 // Daily % change from price history (last two closes), as of the daily refresh
 // Timestamp of the daily refresh (from price_date, with time if available)
 // Prefers the MA collector's collected_at (has hour:minute), falls back to price_date
 const refreshTs = (t) => {
  try {
   const ma = (D.ticker_ma || {})[t.ticker];
   if (ma && ma.daily && ma.daily.collected_at) return ma.daily.collected_at;
  } catch (e) {}
  return t.price_date || t.as_of || "";
 };
 // Upside color: red for downside, yellow for 0-10% (hold), green for >10%
 const upsideCls = (n) => {
  if (n == null || isNaN(n)) return "";
  if (n < 0) return "neg";
  if (n <= 10) return "hold";
  return "pos";
 };
 const timeAgo = (ts) => {
  if (!ts) return "";
  const t = new Date(ts).getTime(), now = Date.now(), m = Math.floor((now - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
 };
 const isPro = () => {
  // Server-verified only. No localStorage fallback (prevents devtools bypass).
  return proVerified === true;
 };
 const setPro = (v) => { /* no-op: Pro status comes from Supabase only */ };

 /* ---------- Supabase Auth + server-verified Pro ---------- */
 const SUPABASE_URL = "https://tlrfqoqefltxodoynqmh.supabase.co";
 const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRscmZxb3FlZmx0eG9kb3lucW1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5ODc5MjIsImV4cCI6MjEwNzU2MzkyMn0.XB9l2J69wGVxkUF7cGTjCzCb4QBwCdiuoRMycoy4tW8";
 // Cookie-based storage for iOS Safari ITP compatibility (localStorage gets capped)
 // Remember-me controls cookie persistence: persistent (1yr) vs session-only
 let rememberMe = true; // default to persistent, updated at login
 const cookieStorage = {
  getItem: (key) => {
   try {
    const match = document.cookie.match(new RegExp('(^| )' + key + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
   } catch (e) { return null; }
  },
  setItem: (key, value) => {
   try {
    const persist = rememberMe ? '; max-age=31536000' : ''; // session cookie if not remembered
    document.cookie = key + '=' + encodeURIComponent(value) + '; path=/' + persist + '; SameSite=Lax; Secure';
   } catch (e) {}
  },
  removeItem: (key) => {
   try {
    document.cookie = key + '=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
   } catch (e) {}
  }
 };
 // Use cookie storage if available, fallback to default (localStorage)
 // PKCE flow for better iOS compatibility
 const supa = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
   storage: cookieStorage,
   flowType: 'pkce',
   persistSession: true,
   detectSessionInUrl: true,
   autoRefreshToken: true
  }
 }) : null;
 // Re-validate session when tab becomes visible (iOS background tab handling)
 if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", async () => {
   if (document.visibilityState === "visible" && supa) {
    try {
     const { data: { session }, error } = await supa.auth.getSession();
     if (error || !session) {
      await supa.auth.refreshSession();
     }
     // Re-check Pro status after tab wake
     refreshAuth();
    } catch (e) {}
   }
  });
 }
 let authUser = null;
 let proVerified = null; // null = not yet checked this load; true/false after server verification
 let isAdmin = false;
 let PRO_DATA = null; // Pro-only data fetched from /api/pro-data (never in public bundle)

 async function fetchProData() {
  if (!supa) {
   console.warn("fetchProData: no supa client");
   return null;
  }
  try {
   // Refresh session first to ensure token is valid (fixes 401s from stale tokens)
   try {
    await supa.auth.refreshSession();
   } catch (refreshErr) {
    console.warn("Session refresh failed:", refreshErr.message);
   }
   const { data: { session } } = await supa.auth.getSession();
   if (!session) {
    console.warn("fetchProData: no session");
    return null;
   }
   const res = await fetch("/api/pro-data", {
    headers: { "Authorization": "Bearer " + session.access_token }
   });
   if (!res.ok) {
    console.warn("fetchProData: API returned", res.status);
    // Store the error status for debug display
    window._proDataError = "HTTP " + res.status;
    return null;
   }
   window._proDataError = null;
   const json = await res.json();
   const sections = json.sections || {};
   // Flatten to match SITE_DATA shape
   const flat = {};
   if (sections.gex) {
    flat.gex_data = sections.gex.gex_data;
    flat.ticker_gex = sections.gex.ticker_gex;
   }
   if (sections.volatility_skew) {
    flat.skew_data = sections.volatility_skew.skew_data;
    flat.ticker_skew = sections.volatility_skew.ticker_skew;
   }
   if (sections.unusual_options_flow) flat.ticker_options = sections.unusual_options_flow;
   if (sections.market_leadership) flat.leadership = sections.market_leadership;
   if (sections.macro_analysis) flat.market_analysis_report = sections.macro_analysis;
   if (sections.rsi_cyclical_defensive) flat.rsi_cd_history = sections.rsi_cyclical_defensive;
   if (sections.ticker_ma) flat.ticker_ma = sections.ticker_ma;
   if (sections.ticker_ohlcv) flat.ticker_ohlcv = sections.ticker_ohlcv;
   if (sections.macro_indicators) flat.macro_indicators = sections.macro_indicators;
   if (sections.technical_analysis) flat.technical_analysis = sections.technical_analysis;
   if (sections.ticker_macro_takes) flat.ticker_macro_takes = sections.ticker_macro_takes;
   if (sections.premarket_report) flat.premarket_report = sections.premarket_report;
   if (sections.fear_index) flat.fear_index = sections.fear_index;
   if (sections.rotation_analysis) flat.rotation_analysis = sections.rotation_analysis;
   if (sections.screener_data) flat.screener_data = sections.screener_data;
   if (sections.minervini_data) flat.minervini_data = sections.minervini_data;
   if (sections.earnings_dashboard) flat.earnings_dashboard = sections.earnings_dashboard;
   if (sections.liquidity) flat.liquidity = sections.liquidity;
   if (sections.comps_matrix) flat.comps_matrix = sections.comps_matrix;
   if (sections.correction_risk) flat.correction_risk = sections.correction_risk;
   if (sections.liquidity_drain) flat.liquidity_drain = sections.liquidity_drain;
   if (sections.rv_shock) flat.rv_shock = sections.rv_shock;
   if (sections.contagion) flat.contagion = sections.contagion;
   if (sections.dynamic_concentration) flat.dynamic_concentration = sections.dynamic_concentration;
   if (sections.margin_leverage) flat.margin_leverage = sections.margin_leverage;
   if (sections.sector_rotation) flat.sector_rotation = sections.sector_rotation;
   if (sections.trend_signals) flat.trend_signals = sections.trend_signals;
   if (sections.flow_divergence) flat.flow_divergence = sections.flow_divergence;
   // Transcript tone: merge per-ticker detail files into flat.transcript_tone[tk]
   if (sections.transcript_tone_detail) {
    flat.transcript_tone = flat.transcript_tone || {};
    Object.keys(sections.transcript_tone_detail).forEach((tk) => {
     flat.transcript_tone[tk] = sections.transcript_tone_detail[tk];
    });
   }
   if (sections.ticker_short_interest) flat.ticker_short_interest = sections.ticker_short_interest;
   // DCF targets merged per-ticker
   flat._dcf_targets = sections.dcf_targets || {};
   flat._fcf_projections = sections.fcf_projections || {};
   return flat;
  } catch (e) {
   console.warn("fetchProData failed:", e.message);
   return null;
  }
 }
 // Ensure Pro data is loaded before rendering Pro-gated routes
 // Call this at the start of any route that needs PRO_DATA
 async function ensureProData() {
  if (PRO_DATA) return; // Already loaded
  // Don't check isPro() here - auth may not have completed yet
  // fetchProData() will return null if no valid session
  try {
   const data = await fetchProData();
   if (data) PRO_DATA = data;
  } catch (e) {
   console.error("ensureProData failed:", e);
  }
 }
 // Proxy D to fall back to PRO_DATA for Pro sections
 const _D_raw = window.SITE_DATA || {};
 const D = new Proxy(_D_raw, {
  get(target, prop) {
   if (prop === "_dcf_targets" || prop === "_fcf_projections") return undefined;
   // Pro sections from API
   if (PRO_DATA && PRO_DATA[prop] !== undefined) return PRO_DATA[prop];
   // DCF targets per ticker
   if (prop === "tickers" && PRO_DATA && PRO_DATA._dcf_targets) {
    const merged = {};
    for (const tk in target.tickers) {
     merged[tk] = { ...target.tickers[tk], ...(PRO_DATA._dcf_targets[tk] || {}) };
     if (PRO_DATA._fcf_projections[tk]) merged[tk].fcf = PRO_DATA._fcf_projections[tk];
    }
    return merged;
   }
   return target[prop];
  }
 });

 // Tickers/order derived from D (Proxy merges free + Pro API data when available)
 let TICKERS = D.tickers || {};
 const ORDER = D.ticker_order || Object.keys(TICKERS).sort();
 // Refresh TICKERS after Pro data loads (merges DCF targets)
 function refreshTickers() {
  TICKERS = D.tickers || {};
 }

 async function refreshAuth() {
  if (!supa) { proVerified = false; render(); return; }
  const prevProState = isPro();
  try {
   const { data: { session } } = await supa.auth.getSession();
   authUser = session ? session.user : null;
   if (authUser) {
    const { data, error } = await supa.from("profiles")
     .select("is_pro, is_admin").eq("user_id", authUser.id).single();
    if (!error && data) {
     isAdmin = !!data.is_admin;
     proVerified = !!(data.is_pro || data.is_admin);
    } else if (error) {
     // Query failed (network/RLS) - keep previous Pro status, don't fail closed
     // on transient errors. Only reset if we get a definitive non-Pro response.
     console.warn("Pro status check failed, keeping previous:", error.message);
    } else {
     // No profile row yet (trigger may lag), treat as non-Pro, retry next load
     isAdmin = false;
     proVerified = false;
    }
   } else {
    // No session - user is logged out
    isAdmin = false;
    proVerified = false;
   }
  } catch (e) {
   // Network/Supabase failure: keep previous Pro status (don't fail closed on transient errors)
   console.warn("Auth refresh failed, keeping previous Pro status:", e.message);
  }
  // Fetch Pro data from server-gated API if verified
  // Never clear existing PRO_DATA on failure, only update on success
  if (proVerified === true) {
   const newData = await fetchProData();
   if (newData) {
    PRO_DATA = newData;
   }
   // If API fetch failed but we have cached data, keep it
   // If API fetch failed and no cached data, PRO_DATA stays as-is (may be null)
  }
  // Do NOT set PRO_DATA = null here - preserves data across navigations
  refreshTickers();
  updateAuthBtn();
  // Debounce renders to prevent flashing: only re-render once if Pro state changed
  // (fixes iOS race condition where initial render happens before auth completes)
  if (prevProState !== isPro()) {
   // Clear any pending render to avoid multiple flashes
   if (window._proRenderTimeout) clearTimeout(window._proRenderTimeout);
   window._proRenderTimeout = setTimeout(() => {
    render();
    window._proRenderTimeout = null;
   }, 300);
  } else {
   render();
  }
  // Re-run visual embedding after auth completes (for analysis route)
  // This ensures visuals load even if PRO_DATA wasn't ready on first render
  setTimeout(() => {
   try {
    const route = location.hash.replace(/^#\/?/, "").split("?")[0].split("/")[0];
    if (route === "analysis" && typeof embedAnalysisVisuals === "function") {
     embedAnalysisVisuals();
    }
   } catch (e) {}
  }, 600);
 }

 // Listen for auth changes (login/logout in another tab, token refresh)
 function initAuthListener() {
  if (!supa) return;
  supa.auth.onAuthStateChange(() => { refreshAuth(); });
 }

 function shortEmail(e) {
  if (!e) return "";
  return e.length > 22 ? e.slice(0, 20) + "…" : e;
 }

 function updateAuthBtn() {
  const b = document.getElementById("auth-btn");
  if (!b) return;
  if (authUser) {
   b.textContent = shortEmail(authUser.email);
   b.classList.add("logged-in");
   b.title = authUser.email + (isAdmin ? " (Admin)" : proVerified ? " (Pro)" : "") + ", click to log out";
   b.onclick = () => doLogout();
  } else {
   b.textContent = "Log in";
   b.classList.remove("logged-in");
   b.title = "";
   b.onclick = () => showAuthModal("login");
  }
 }

 async function doLogout() {
  try { if (supa) await supa.auth.signOut(); } catch (e) {}
  // Backup: clear Supabase session from storage directly in case signOut didn't fully propagate
  try {
   Object.keys(localStorage).forEach((k) => {
    if (k.startsWith("sb-") && k.includes("auth-token")) localStorage.removeItem(k);
   });
   Object.keys(sessionStorage).forEach((k) => {
    if (k.startsWith("sb-") && k.includes("auth-token")) sessionStorage.removeItem(k);
   });
  } catch (e) {}
  authUser = null; proVerified = false; isAdmin = false;
  PRO_DATA = null; // Clear Pro data on explicit logout
  setPro(false);
  document.getElementById("modal-root").innerHTML = "";
  updateAuthBtn();
  render();
 }

 function openPdfModal(pdfUrl, title) {
  const root = document.getElementById("modal-root");
  root.innerHTML =
   '<div class="modal-back" id="pdf-mb" style="position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:1000;display:flex;flex-direction:column;">' +
   '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#161b26;">' +
   '<div style="font-size:14px;font-weight:600;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(title || "Research Note") + "</div>" +
   '<button id="pdf-close" style="background:#7d4fc9;color:#fff;border:none;border-radius:8px;padding:10px 18px;font-size:14px;font-weight:600;cursor:pointer;min-width:80px;">Close</button>' +
   "</div>" +
   '<iframe src="' + esc(pdfUrl) + '" style="flex:1;border:none;background:#fff;" title="PDF Viewer"></iframe>' +
   "</div>";
  document.getElementById("pdf-close").addEventListener("click", () => { root.innerHTML = ""; });
  document.getElementById("pdf-mb").addEventListener("click", (e) => {
   if (e.target.id === "pdf-mb") root.innerHTML = "";
  });
 }
 window.openPdfModal = openPdfModal;

 function showAuthModal(mode) {
  const root = document.getElementById("modal-root");
  const isLogin = mode === "login";
  root.innerHTML =
   '<div class="modal-back" id="mb"><div class="modal">' +
   '<div class="modal-logo"><img src="logo-icon.png" alt="Cascadia Analytics"></div>' +
   "<h3>" + (isLogin ? "Log in" : "Create account") + "</h3>" +
   "<p style='color:var(--muted);font-size:14px'>" +
   (isLogin ? "Log in to access your Pro subscription." : "Create a free account. Upgrade to Pro anytime for $19/month.") + "</p>" +
   '<input id="auth-email" type="email" placeholder="Email" autocomplete="email" style="margin-bottom:8px;">' +
   '<input id="auth-pass" type="password" placeholder="Password" autocomplete="' + (isLogin ? "current-password" : "new-password") + '">' +
   (isLogin ? '<label style="display:flex;align-items:center;gap:8px;margin:10px 0;font-size:13px;color:var(--muted);cursor:pointer;">' +
    '<input type="checkbox" id="auth-remember" checked style="width:16px;height:16px;accent-color:var(--gold);"> Remember me</label>' : "") +
   '<div class="err" id="auth-err"></div>' +
   '<button class="btn" id="auth-go" style="width:100%">' + (isLogin ? "Log in" : "Sign up") + "</button>" +
   '<button class="btn secondary" id="auth-switch" style="width:100%;margin-top:8px;">' +
   (isLogin ? "Need an account? Sign up" : "Have an account? Log in") + "</button>" +
   '<button class="btn secondary" id="auth-x" style="width:100%;margin-top:8px;">Close</button>' +
   "</div></div>";
  const close = () => { root.innerHTML = ""; };
  document.getElementById("mb").onclick = (e) => { if (e.target.id === "mb" || e.target.id === "auth-x") close(); };
  document.getElementById("auth-switch").onclick = () => showAuthModal(isLogin ? "signup" : "login");
  const submit = async () => {
   const email = document.getElementById("auth-email").value.trim();
   const pass = document.getElementById("auth-pass").value;
   const errEl = document.getElementById("auth-err");
   errEl.textContent = "";
   if (!email || !pass) { errEl.textContent = "Enter your email and password."; return; }
   if (!supa) { errEl.textContent = "Auth unavailable. Try again later."; return; }
   document.getElementById("auth-go").disabled = true;
   try {
    let res;
    if (isLogin) {
     // Capture remember-me preference before sign-in (controls cookie persistence)
     const rememberEl = document.getElementById("auth-remember");
     rememberMe = rememberEl ? rememberEl.checked : true;
     res = await supa.auth.signInWithPassword({ email, password: pass });
    }
    else res = await supa.auth.signUp({ email, password: pass });
    if (res.error) throw res.error;
    close();
    await refreshAuth();
   } catch (e) {
    errEl.textContent = e.message || "Something went wrong.";
    document.getElementById("auth-go").disabled = false;
   }
  };
  document.getElementById("auth-go").onclick = submit;
  document.getElementById("auth-pass").addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
 }

 /* ---------- Cascadia Score (v1: DCF upside based) ---------- */
 function cascadiaScore(t) {
  // Multi-factor score: valuation 40%, price momentum 30%, earnings momentum 20%, options flow 10%
  let total = 0, weight = 0;

  // 1. Valuation (40%): base-case upside mapped to 0-100
  if (t.upside_base != null) {
   const vScore = Math.max(0, Math.min(100, 50 + t.upside_base * 0.8));
   total += vScore * 0.40; weight += 0.40;
  }

  // 2. Price momentum (30%): from MA signals
  const tk = t.ticker;
  const ma = (D.ticker_ma || {})[tk];
  if (ma && ma.daily && ma.daily.signal) {
   const sig = ma.daily.signal.toLowerCase();
   const mScore = sig.includes("strong buy") ? 90 : sig.includes("strong sell") ? 10 :
    sig.includes("buy") ? 70 : sig.includes("sell") ? 30 : 50;
   total += mScore * 0.30; weight += 0.30;
  }

  // 3. Earnings momentum (20%): from most recent quarter verdict
  const eh = (D.earnings_history || {})[tk];
  if (eh && eh.length && eh[0].verdict) {
   const v = (eh[0].verdict.label || "").toLowerCase();
   const eScore = v.includes("bullish") ? 80 : v.includes("bearish") ? 20 : 50;
   total += eScore * 0.20; weight += 0.20;
  }

  // 4. Options flow (10%): bullish vs bearish prints
  const opt = (D.ticker_options || {})[tk];
  if (opt && Array.isArray(opt) && opt.length) {
   let bull = 0, bear = 0;
   opt.forEach((o) => {
    const d = (o.direction || "").toLowerCase();
    if (d.includes("bull")) bull++; else if (d.includes("bear")) bear++;
   });
   if (bull + bear > 0) {
    const oScore = 50 + (bull - bear) / (bull + bear) * 50;
    total += oScore * 0.10; weight += 0.10;
   }
  }

  if (!weight) return null;
  return Math.max(1, Math.min(100, Math.round(total / weight)));
 }
 function scoreClass(s) { return s >= 65 ? "score-hi" : s >= 40 ? "score-mid" : "score-lo"; }
 function scoreTooltip(t) {
  const s = cascadiaScore(t);
  if (s == null) return "Cascadia Score: not available.";
  const parts = [];
  if (t.upside_base != null) parts.push("valuation " + (t.upside_base >= 0 ? "+" : "") + t.upside_base.toFixed(1) + "% upside (40%)");
  const ma = (D.ticker_ma || {})[t.ticker];
  if (ma && ma.daily && ma.daily.signal) parts.push("momentum: " + ma.daily.signal + " (30%)");
  const eh = (D.earnings_history || {})[t.ticker];
  if (eh && eh.length && eh[0].verdict) parts.push("earnings: " + eh[0].verdict.label + " (20%)");
  return "Cascadia Score: " + s + "/100. Weighted: " + parts.join(", ") + ".";
 }

 /* ---------- paywall ---------- */
 const UPGRADE_URL = D.stripe_payment_link || "#";
 function proTeaser(title, desc) {
  return '<div class="locked-teaser">' +
   '<div class="lock-icon"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>' +
   "<h3>" + esc(title) + "</h3><p>" + esc(desc) + "</p>" +
   '<a class="cta-btn" href="javascript:void(0)" id="teaser-pricing">See Pro Plans</a>' +
   '<div class="pro-price">Cascadia Analytics Pro, $19/month. Cancel anytime.</div></div>';
 }
 function gated(title, desc, innerHtml) {
  if (!isPro()) return proTeaser(title, desc);
  // If innerHtml generation threw, it would have been caught by caller;
  // this handles the case where innerHtml is an error string
  return innerHtml;
 }
 // Safe wrapper for Pro HTML that might throw during generation
 function gatedSafe(title, desc, htmlFn) {
  if (!isPro()) return proTeaser(title, desc);
  try {
   return htmlFn();
  } catch (e) {
   console.error("Pro section render failed:", title, e);
   return '<div class="card"><p style="color:#f85149;">This section failed to load. Please refresh the page.</p></div>';
  }
 }

 /* ---------- router ---------- */
 const routes = {};
 function route(path, fn) { routes[path] = fn; }
 function nav(path) { location.hash = "#/" + path; }
 function currentRoute() {
  const h = location.hash.replace(/^#\/?/, "").split("?")[0]; // Strip query params
  const parts = h.split("/");
  return { name: parts[0] || "home", param: decodeURIComponent(parts[1] || "") };
 }
function bindZoomHandlers() {
    // Click/tap to zoom: open modal with larger chart
    document.querySelectorAll(".zoomable-chart").forEach((el) => {
     if (el.dataset.zoomBound) return;
     el.dataset.zoomBound = "1";
     el.addEventListener("click", () => {
      const kind = el.dataset.chart;
      const titles = {
       jaw: "Alligator Jaw, S&P 500 vs Forward EPS",
       voldiv: "Volatility Divergence, VIX vs MOVE",
       themerot: "Theme Rotation, RS Quadrant",
       smcap: "Small/Mid Cap, vs 200-Day MA",
       creditvol: "Credit Spreads vs VIX",
       breadth: "Market Breadth",
       rsicd: "RSI: Cyclicals vs Defensives (XLY/XLP)",
       "gex-ticker": "Gamma Exposure, " + (el.dataset.ticker || ""),
       "skew-ticker": "Volatility Skew, " + (el.dataset.ticker || ""),
       "gex-index": "Gamma Exposure, " + (el.dataset.symbol || ""),
       trends: "Trading Trends, " + (el.dataset.ticker || ""),
       aaii: "AAII Investor Sentiment",
       breakeven: "10Y Breakeven Inflation",
       "correction-risk": "Correction Risk Model",
       "liquidity-drain": "Liquidity Drain Model",
       "contagion": "Cross-Asset Contagion Tracker",
       "flow-divergence": "Institutional Flow Divergence",
       "concentration": "Dynamic Concentration Risk Gauge",
       "margin-leverage": "Systemic Leverage, Margin YoY vs SPY YoY",
       "sector-rotation": "Offense vs Defense, RSPD/RSPS vs XLY/XLP",
       cot: "Commitments of Traders",
       macro: "Macroeconomic Analysis",
       leadership: "Market Leadership, MLS by Component",
       income: "Income Statement, " + (el.dataset.ticker || ""),
       balance: "Balance Sheet, " + (el.dataset.ticker || ""),
       cashflow: "Cash Flow, " + (el.dataset.ticker || ""),
      };
      // For GEX ticker (HTML, not a Chart.js chart): show enlarged HTML
      if (kind === "gex-ticker") {
       const tk = el.dataset.ticker;
       const tg = (D.ticker_gex || {})[tk];
       if (!tg || !tg.available) return;
       let modal = document.getElementById("chart-zoom-modal");
       if (modal) modal.remove();
       modal = document.createElement("div");
       modal.id = "chart-zoom-modal";
       modal.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;padding:20px;cursor:zoom-out;overflow-y:auto;";
       modal.innerHTML = '<div style="background:#131722;border-radius:12px;padding:24px;width:100%;max-width:700px;margin:auto;" onclick="event.stopPropagation()">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
        '<div style="font-size:16px;font-weight:700;color:#e8ecf1;">Gamma Exposure, ' + esc(tk) + '</div>' +
        '<button id="zoom-close" style="background:#2a3448;border:0;color:#c8d0dc;font-size:18px;width:36px;height:36px;border-radius:8px;cursor:pointer;">✕</button></div>' +
        tickerGexHtml(tk, tg) + "</div>";
       document.body.appendChild(modal);
       const close = () => modal.remove();
       modal.addEventListener("click", close);
       document.getElementById("zoom-close").addEventListener("click", close);
       return;
      }
      // For agency flow (on-demand chart): show enlarged chart
      if (kind && kind.indexOf("agency-flow-") === 0) {
       const tk = kind.replace("agency-flow-", "");
       const a = _agencyCache[tk];
       if (!a || !a.flowHistory || !a.flowHistory.length) return;
       let modal = document.getElementById("chart-zoom-modal");
       if (modal) modal.remove();
       modal = document.createElement("div");
       modal.id = "chart-zoom-modal";
       modal.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;padding:20px;cursor:zoom-out;overflow-y:auto;";
       modal.innerHTML = '<div style="background:#131722;border-radius:12px;padding:24px;width:100%;max-width:700px;margin:auto;" onclick="event.stopPropagation()">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
        '<div style="font-size:16px;font-weight:700;color:#e8ecf1;">Agency Risk Flow, ' + esc(tk) + '</div>' +
        '<button id="zoom-close" style="background:#2a3448;border:0;color:#c8d0dc;font-size:18px;width:36px;height:36px;border-radius:8px;cursor:pointer;">✕</button></div>' +
        '<div style="position:relative;height:400px;"><canvas id="agency-flow-zoom"></canvas></div></div>';
       document.body.appendChild(modal);
       const close = () => modal.remove();
       modal.addEventListener("click", close);
       document.getElementById("zoom-close").addEventListener("click", close);
       const zc = document.getElementById("agency-flow-zoom");
       new Chart(zc, {
        type: "bar",
        data: {
         labels: a.flowHistory.map(function(x) { return x.month; }),
         datasets: [
          { label: "Buys ($)", data: a.flowHistory.map(function(x) { return x.buys; }), backgroundColor: "#3fb950" },
          { label: "Sells ($)", data: a.flowHistory.map(function(x) { return x.sells; }), backgroundColor: "#f85149" }
         ]
        },
        options: {
         animation: false, responsive: true, maintainAspectRatio: false,
         plugins: { legend: { labels: { color: "#8b949e", font: { size: 12 } } } },
         scales: {
          x: { ticks: { color: "#e8ecf1", font: { size: 12 } }, grid: { display: false } },
          y: { ticks: { color: "#e8ecf1", font: { size: 12 } }, grid: { color: "rgba(42,46,57,0.4)" } }
         }
        }
       });
       return;
      }
      // For skew ticker (HTML, not a Chart.js chart): show enlarged HTML
      if (kind === "skew-ticker") {
       const tk = el.dataset.ticker;
       const ts = (D.ticker_skew || {})[tk];
       if (!ts || !ts.available) return;
       let modal = document.getElementById("chart-zoom-modal");
       if (modal) modal.remove();
       modal = document.createElement("div");
       modal.id = "chart-zoom-modal";
       modal.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;padding:20px;cursor:zoom-out;overflow-y:auto;";
       modal.innerHTML = '<div style="background:#131722;border-radius:12px;padding:24px;width:100%;max-width:700px;margin:auto;" onclick="event.stopPropagation()">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
        '<div style="font-size:16px;font-weight:700;color:#e8ecf1;">Volatility Skew, ' + esc(tk) + '</div>' +
        '<button id="zoom-close" style="background:#2a3448;border:0;color:#c8d0dc;font-size:18px;width:36px;height:36px;border-radius:8px;cursor:pointer;">✕</button></div>' +
        tickerSkewHtml(tk, ts) + "</div>";
       document.body.appendChild(modal);
       const close = () => modal.remove();
       modal.addEventListener("click", close);
       document.getElementById("zoom-close").addEventListener("click", close);
       return;
      }
      // For GEX index (price levels chart): show enlarged chart
      if (kind === "gex-index") {
       const sym = el.dataset.symbol;
       const d = (D.gex_data.indices || {})[sym];
       if (!d || !d.available) return;
       let modal = document.getElementById("chart-zoom-modal");
       if (modal) modal.remove();
       modal = document.createElement("div");
       modal.id = "chart-zoom-modal";
       modal.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;padding:20px;cursor:zoom-out;";
       modal.innerHTML = '<div style="background:#131722;border-radius:12px;padding:20px;width:100%;max-width:800px;max-height:90vh;display:flex;flex-direction:column;" onclick="event.stopPropagation()">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
        '<div style="font-size:16px;font-weight:700;color:#e8ecf1;">Gamma Exposure, ' + esc(sym) + ' Price Levels</div>' +
        '<button id="zoom-close" style="background:#2a3448;border:0;color:#c8d0dc;font-size:18px;width:36px;height:36px;border-radius:8px;cursor:pointer;">✕</button></div>' +
        '<div style="position:relative;flex:1;min-height:300px;"><canvas id="zoom-chart"></canvas></div></div>';
       document.body.appendChild(modal);
       const close = () => modal.remove();
       modal.addEventListener("click", close);
       document.getElementById("zoom-close").addEventListener("click", close);
       const zc = document.getElementById("zoom-chart");
       try {
        const levels = [];
        if (d.put_wall != null) levels.push({ label: "Put Wall (support)", value: d.put_wall, color: "#f85149" });
        levels.push({ label: "Spot", value: d.spot, color: "#e8ecf1" });
        if (d.zero_gamma != null) levels.push({ label: "Zero Gamma (flip)", value: d.zero_gamma, color: "#c678dd" });
        if (d.call_wall != null) levels.push({ label: "Call Wall (resistance)", value: d.call_wall, color: "#3fb950" });
        levels.sort((a, b) => a.value - b.value);
        new Chart(zc, {
         type: "bar",
         data: {
          labels: levels.map((l) => l.label),
          datasets: [{
           data: levels.map((l) => l.value),
           backgroundColor: levels.map((l) => l.color),
           borderWidth: 0,
          }],
         },
         options: {
          indexAxis: "y",
          responsive: true, maintainAspectRatio: false,
          plugins: {
           legend: { display: false },
           tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1, titleColor: "#d1d4dc", bodyColor: "#d1d4dc", padding: 12,
            callbacks: { label: (c) => " $" + c.parsed.x.toFixed(2) } },
          },
          scales: {
           x: { ticks: { color: "#e8ecf1", callback: (v) => "$" + v.toFixed(0) }, grid: { color: "rgba(42,46,57,0.4)" } },
           y: { ticks: { color: "#c8d0dc" }, grid: { display: false } },
          },
         },
        });
       } catch (e) { console.error("GEX zoom chart error", e); }
       return;
      }
      // build modal
      let modal = document.getElementById("chart-zoom-modal");
      if (modal) modal.remove();
      modal = document.createElement("div");
      modal.id = "chart-zoom-modal";
      modal.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;padding:20px;cursor:zoom-out;";
      modal.innerHTML = '<div style="background:#131722;border-radius:12px;padding:20px;width:100%;max-width:1000px;max-height:90vh;display:flex;flex-direction:column;" onclick="event.stopPropagation()">' +
       '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
       '<div style="font-size:16px;font-weight:700;color:#e8ecf1;">' + (titles[kind] || "Chart") + '</div>' +
       '<button id="zoom-close" style="background:#2a3448;border:0;color:#c8d0dc;font-size:18px;width:36px;height:36px;border-radius:8px;cursor:pointer;">✕</button></div>' +
       '<div style="position:relative;flex:1;min-height:400px;"><canvas id="zoom-chart"></canvas></div></div>';
      document.body.appendChild(modal);
      const close = () => modal.remove();
      modal.addEventListener("click", close);
      document.getElementById("zoom-close").addEventListener("click", close);
      // render enlarged chart
      const zc = document.getElementById("zoom-chart");
      try {
       if (kind === "jaw") {
        const hist = D.jaw_history.history;
        new Chart(zc, {
         type: "line",
         data: { labels: hist.map((r) => r.date), datasets: [
          { label: "S&P 500", data: hist.map((r) => r.price), borderColor: "#ffd60a", borderWidth: 2, pointRadius: 0, tension: 0.1, yAxisID: "y" },
          { label: "Forward 12m EPS", data: hist.map((r) => r.forward_eps), borderColor: "#00e676", borderWidth: 2, pointRadius: 0, tension: 0.1, yAxisID: "y1" },
         ]},
         options: { responsive: true, maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: { legend: { labels: { color: "#c8d0dc" } },
           tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1, titleColor: "#d1d4dc", bodyColor: "#d1d4dc", padding: 12 } },
          scales: {
           x: { ticks: { color: "#e8ecf1", maxTicksLimit: 12, maxRotation: 0 }, grid: { color: "rgba(42,46,57,0.4)" } },
           y: { position: "left", ticks: { color: "#ffd60a" }, grid: { color: "rgba(42,46,57,0.4)" }, title: { display: true, text: "S&P 500", color: "#ffd60a" } },
           y1: { position: "right", ticks: { color: "#00e676" }, grid: { display: false }, title: { display: true, text: "Fwd EPS ($)", color: "#00e676" } } } }
        });
       } else if (kind === "voldiv") {
        const hist = D.vol_div_history.history;
        new Chart(zc, {
         type: "line",
         data: { labels: hist.map((r) => r.date), datasets: [
          { label: "Divergence (MOVE z − VIX z)", data: hist.map((r) => r.divergence), borderColor: "#f23645", backgroundColor: "rgba(242,54,69,0.1)", borderWidth: 2.5, pointRadius: 0, tension: 0.1, fill: true },
          { label: "MOVE z-score", data: hist.map((r) => r.move_z), borderColor: "#ff9800", borderWidth: 1.5, pointRadius: 0, tension: 0.1, borderDash: [5, 3] },
          { label: "VIX z-score", data: hist.map((r) => r.vix_z), borderColor: "#2962ff", borderWidth: 1.5, pointRadius: 0, tension: 0.1, borderDash: [5, 3] },
         ]},
         options: { responsive: true, maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: { legend: { labels: { color: "#c8d0dc" } },
           tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1, titleColor: "#d1d4dc", bodyColor: "#d1d4dc", padding: 12 } },
          scales: {
           x: { ticks: { color: "#e8ecf1", maxTicksLimit: 12, maxRotation: 0 }, grid: { color: "rgba(42,46,57,0.4)" } },
           y: { ticks: { color: "#e8ecf1" }, grid: { color: "rgba(42,46,57,0.4)" }, title: { display: true, text: "z-score", color: "#e8ecf1" } } } }
        });
       } else if (kind === "themerot") {
        const trh = D.theme_rot_history;
        const latest = trh.history[trh.history.length - 1];
        const themes = latest.themes || {};
        const qColors = { Leading: "#3fb950", Improving: "#c678dd", Weakening: "#d29922", Lagging: "#f85149" };
        const xs = Object.values(themes).map((v) => v.x), ys = Object.values(themes).map((v) => v.y);
        const maxAbs = Math.max(Math.abs(Math.min(...xs)), Math.abs(Math.max(...xs)), Math.abs(Math.min(...ys)), Math.abs(Math.max(...ys)), 5);
        const pad = Math.ceil(maxAbs * 1.15);
        new Chart(zc, {
         type: "scatter",
         data: { datasets: Object.entries(themes).map(([name, vals]) => ({
          label: name, data: [{ x: vals.x, y: vals.y }],
          backgroundColor: qColors[vals.q] || "#e8ecf1", pointRadius: 9, pointHoverRadius: 12,
         }))},
         options: { responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false },
           tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1, titleColor: "#d1d4dc", bodyColor: "#d1d4dc", padding: 12,
            callbacks: {
             title: (items) => items[0].dataset.label + " (" + (themes[items[0].dataset.label] || {}).q + ")",
             label: (c) => " RS vs 70d avg: " + c.parsed.x.toFixed(1) + "%, 20d momentum: " + c.parsed.y.toFixed(1) + "%"
            } } },
          scales: {
           x: { min: -pad, max: pad, ticks: { color: "#e8ecf1" }, grid: { color: "rgba(42,46,57,0.4)" }, title: { display: true, text: "Relative strength vs 70d avg (%) →", color: "#e8ecf1" } },
           y: { min: -pad, max: pad, ticks: { color: "#e8ecf1" }, grid: { color: "rgba(42,46,57,0.4)" }, title: { display: true, text: "20d momentum (%) →", color: "#e8ecf1" } } } },
         plugins: [quadBg]
        });
       } else if (kind === "smcap") {
        const hist = D.smcap_history.history;
        new Chart(zc, {
         type: "line",
         data: { labels: hist.map((r) => r.date), datasets: [
          { label: "RUT vs 200d (%)", data: hist.map((r) => r.rut_vs_200d), borderColor: "#f85149", borderWidth: 2, pointRadius: 0, tension: 0.1 },
          { label: "MID vs 200d (%)", data: hist.map((r) => r.mid_vs_200d), borderColor: "#58a6ff", borderWidth: 2, pointRadius: 0, tension: 0.1 },
         ]},
         options: { responsive: true, maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: { legend: { labels: { color: "#c8d0dc" } },
           tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1, titleColor: "#d1d4dc", bodyColor: "#d1d4dc", padding: 12 } },
          scales: {
           x: { ticks: { color: "#e8ecf1", maxTicksLimit: 12, maxRotation: 0 }, grid: { color: "rgba(42,46,57,0.4)" } },
           y: { ticks: { color: "#e8ecf1", callback: (v) => v.toFixed(0) + "%" }, grid: { color: "rgba(42,46,57,0.4)" } } } }
        });
       } else if (kind === "creditvol") {
        const hist = D.credit_vol_history.history;
        new Chart(zc, {
         type: "line",
         data: { labels: hist.map((r) => r.date), datasets: [
          { label: "Spread − VIX z-diff", data: hist.map((r) => r.diff), borderColor: "#f23645", backgroundColor: "rgba(242,54,69,0.1)", borderWidth: 2.5, pointRadius: 0, tension: 0.1, fill: true },
          { label: "Spread z", data: hist.map((r) => r.spread_z), borderColor: "#ff9800", borderWidth: 1.5, pointRadius: 0, tension: 0.1, borderDash: [5, 3] },
          { label: "VIX z", data: hist.map((r) => r.vix_z), borderColor: "#2962ff", borderWidth: 1.5, pointRadius: 0, tension: 0.1, borderDash: [5, 3] },
         ]},
         options: { responsive: true, maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: { legend: { labels: { color: "#c8d0dc" } },
           tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1, titleColor: "#d1d4dc", bodyColor: "#d1d4dc", padding: 12 } },
          scales: {
           x: { ticks: { color: "#e8ecf1", maxTicksLimit: 12, maxRotation: 0 }, grid: { color: "rgba(42,46,57,0.4)" } },
           y: { ticks: { color: "#e8ecf1" }, grid: { color: "rgba(42,46,57,0.4)" }, title: { display: true, text: "z-score", color: "#e8ecf1" } } } }
        });
       } else if (kind === "breadth") {
        const hist = D.breadth_history.history;
        new Chart(zc, {
         type: "line",
         data: { labels: hist.map((r) => r.date), datasets: [
          { label: "Breadth spread (pp)", data: hist.map((r) => r.breadth_spread), borderColor: "#58a6ff", borderWidth: 2, pointRadius: 0, tension: 0.1, yAxisID: "y" },
          { label: "% above 50d", data: hist.map((r) => r.pct_above_50d), borderColor: "#c678dd", borderWidth: 1.5, pointRadius: 0, tension: 0.1, borderDash: [5, 3], yAxisID: "y1" },
          { label: "% above 200d", data: hist.map((r) => r.pct_above_200d), borderColor: "#d29922", borderWidth: 1.5, pointRadius: 0, tension: 0.1, borderDash: [5, 3], yAxisID: "y1" },
         ]},
         options: { responsive: true, maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: { legend: { labels: { color: "#c8d0dc" } },
           tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1, titleColor: "#d1d4dc", bodyColor: "#d1d4dc", padding: 12 } },
          scales: {
           x: { ticks: { color: "#e8ecf1", maxTicksLimit: 12, maxRotation: 0 }, grid: { color: "rgba(42,46,57,0.4)" } },
           y: { position: "left", ticks: { color: "#58a6ff" }, grid: { color: "rgba(42,46,57,0.4)" } },
           y1: { position: "right", ticks: { color: "#e8ecf1", callback: (v) => v.toFixed(0) + "%" }, grid: { display: false } } } }
        });
       } else if (kind === "rsicd") {
        const hist = D.rsi_cd_history.history;
        new Chart(zc, {
         type: "line",
         data: { labels: hist.map((r) => r.date), datasets: [
          { label: "RSI (14)", data: hist.map((r) => r.rsi), borderColor: "#c678dd", borderWidth: 2.5, pointRadius: 0, tension: 0.1 },
          { label: "Overbought (70)", data: hist.map(() => 70), borderColor: "#f85149", borderWidth: 1, pointRadius: 0, borderDash: [5, 3] },
          { label: "Oversold (30)", data: hist.map(() => 30), borderColor: "#3fb950", borderWidth: 1, pointRadius: 0, borderDash: [5, 3] },
         ]},
         options: { responsive: true, maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: { legend: { labels: { color: "#c8d0dc" } },
           tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1, titleColor: "#d1d4dc", bodyColor: "#d1d4dc", padding: 12 } },
          scales: {
           x: { ticks: { color: "#e8ecf1", maxTicksLimit: 12, maxRotation: 0 }, grid: { color: "rgba(42,46,57,0.4)" } },
           y: { min: 0, max: 100, ticks: { color: "#e8ecf1" }, grid: { color: "rgba(42,46,57,0.4)" },
            title: { display: true, text: "RSI", color: "#e8ecf1" } } } }
        });
       } else if (kind === "aaii") {
        const hist = (D.aaii_sentiment.history || []);
        new Chart(zc, {
         type: "line",
         data: { labels: hist.map((r) => r.week_ending), datasets: [
          { label: "Bullish %", data: hist.map((r) => r.bullish), borderColor: "#3fb950", borderWidth: 2.5, pointRadius: 0, tension: 0.1 },
          { label: "Neutral %", data: hist.map((r) => r.neutral), borderColor: "#c8d0dc", borderWidth: 1.5, pointRadius: 0, tension: 0.1, borderDash: [5, 3] },
          { label: "Bearish %", data: hist.map((r) => r.bearish), borderColor: "#f85149", borderWidth: 2.5, pointRadius: 0, tension: 0.1 },
         ]},
         options: { responsive: true, maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: { legend: { labels: { color: "#c8d0dc" } },
           tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1, titleColor: "#d1d4dc", bodyColor: "#d1d4dc", padding: 12,
            callbacks: { label: (c) => " " + c.dataset.label + ": " + c.parsed.y.toFixed(1) + "%" } } },
          scales: {
           x: { ticks: { color: "#e8ecf1", maxTicksLimit: 12, maxRotation: 0 }, grid: { color: "rgba(42,46,57,0.4)" } },
           y: { ticks: { color: "#e8ecf1", callback: (v) => v + "%" }, grid: { color: "rgba(42,46,57,0.4)" },
            title: { display: true, text: "Sentiment %", color: "#e8ecf1" } } } }
        });
       } else if (kind === "breakeven") {
        const bdata = D.breakeven_inflation || {};
        const hist = (bdata.history || []).slice(-756);
        if (!hist.length) return;
        try {
        // Resolve the actual <canvas> whether zc is the div or the canvas
        const canvas = zc.tagName === "CANVAS" ? zc : (zc.querySelector("canvas") || document.getElementById("breakeven-chart"));
        if (!canvas) return;
        const existingChart = Chart.getChart(canvas);
        if (existingChart) existingChart.destroy();
        const ctx0 = canvas.getContext("2d");
        const grad = ctx0.createLinearGradient(0, 0, 0, 300);
        grad.addColorStop(0, "rgba(6,182,212,0.35)");
        grad.addColorStop(1, "rgba(6,182,212,0)");
        new Chart(canvas, {
         type: "line",
         data: { labels: hist.map((r) => r.date), datasets: [
          { label: "10Y Breakeven (%)", data: hist.map((r) => r.value), borderColor: "#06b6d4", borderWidth: 1.5, backgroundColor: grad, fill: true, pointRadius: 0, pointHoverRadius: 4, tension: 0.1 },
         ]},
         options: { animation: false, responsive: true, maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: { legend: { display: false },
           tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1, titleColor: "#d1d4dc", bodyColor: "#d1d4dc", padding: 12,
            callbacks: { label: (c) => " " + c.parsed.y.toFixed(2) + "%" } } },
          scales: {
           x: { ticks: { color: "#6b7280", maxTicksLimit: 6, maxRotation: 0 }, grid: { display: false } },
           y: { position: "right", ticks: { color: "#6b7280", callback: (v) => v.toFixed(1) + "%" }, grid: { color: "rgba(42,46,57,0.4)" } } } }
        });
        } catch (e) { console.error("Breakeven chart error:", e); }
       } else if (kind === "erp") {
        const edata = D.implied_erp || {};
        const hist = (edata.history || []).slice(-365);
        if (!hist.length) return;
        try {
        const canvas = zc.tagName === "CANVAS" ? zc : (zc.querySelector("canvas") || document.getElementById("erp-chart"));
        if (!canvas) return;
        const existingChart = Chart.getChart(canvas);
        if (existingChart) existingChart.destroy();
        const ctx0 = canvas.getContext("2d");
        const grad = ctx0.createLinearGradient(0, 0, 0, 300);
        grad.addColorStop(0, "rgba(201,169,97,0.35)");
        grad.addColorStop(1, "rgba(201,169,97,0)");
        new Chart(canvas, {
         type: "line",
         data: { labels: hist.map((r) => r.date), datasets: [
          { label: "Implied ERP (%)", data: hist.map((r) => r.erp * 100), borderColor: "#c9a961", borderWidth: 1.5, backgroundColor: grad, fill: true, pointRadius: 0, pointHoverRadius: 4, tension: 0.1 },
         ]},
         options: { animation: false, responsive: true, maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: { legend: { display: false },
           tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1, titleColor: "#d1d4dc", bodyColor: "#d1d4dc", padding: 12,
            callbacks: { label: (c) => " " + c.parsed.y.toFixed(2) + "%" } } },
          scales: {
           x: { ticks: { color: "#6b7280", maxTicksLimit: 6, maxRotation: 0 }, grid: { display: false } },
           y: { position: "right", ticks: { color: "#6b7280", callback: (v) => v.toFixed(1) + "%" }, grid: { color: "rgba(42,46,57,0.4)" } } } }
        });
        } catch (e) { console.error("ERP chart error:", e); }
       } else if (kind === "correction-risk") {
        const cr = D.correction_risk || {};
        const hist = cr.history || [];
        if (!hist.length) return;
        try {
         const canvas = zc.tagName === "CANVAS" ? zc : (zc.querySelector("canvas") || document.getElementById("correction-risk-chart"));
         if (!canvas) return;
         const existing = Chart.getChart(canvas);
         if (existing) existing.destroy();
         new Chart(canvas, {
          data: {
           labels: hist.map((r) => r.date),
           datasets: [
            {type: "line", label: "SPY", data: hist.map((r) => r.price), borderColor: "#c99a6b", borderWidth: 2, pointRadius: 0, yAxisID: "yPrice"},
            {type: "bar", label: "Risk Score", data: hist.map((r) => r.score), backgroundColor: hist.map((r) => r.color), yAxisID: "yScore", barPercentage: 1.0, categoryPercentage: 1.0},
           ],
          },
          options: {animation: false, responsive: true, maintainAspectRatio: false,
           interaction: {mode: "index", intersect: false},
           plugins: {legend: {display: false}},
           scales: {
            x: {ticks: {color: "#6b7280", maxTicksLimit: 8}, grid: {display: false}},
            yPrice: {position: "left", ticks: {color: "#c99a6b"}, grid: {color: "rgba(42,46,57,0.4)"}},
            yScore: {position: "right", min: 0, max: 100, ticks: {color: "#8b949e", stepSize: 25}, grid: {display: false}},
           }},
         });
        } catch (e) { console.error("Correction risk chart error:", e); }
       } else if (kind === "liquidity-drain") {
        const ld = D.liquidity_drain || {};
        const hist = ld.history || [];
        if (!hist.length) return;
        try {
         const canvas = zc.tagName === "CANVAS" ? zc : (zc.querySelector("canvas") || document.getElementById("liquidity-drain-chart"));
         if (!canvas) return;
         const old = Chart.getChart(canvas);
         if (old) old.destroy();
         new Chart(canvas, {
          data: {
           labels: hist.map((r) => r.date),
           datasets: [
            { type: "line", label: "Net Liquidity ($B)", data: hist.map((r) => r.netLiquidity),
              borderColor: "#c9a961", borderWidth: 2, pointRadius: 0, tension: 0.2, yAxisID: "yLiq" },
            { type: "line", label: "SPY", data: hist.map((r) => r.spy),
              borderColor: "#58a6ff", borderWidth: 2, borderDash: [5, 5], pointRadius: 0, tension: 0.2, yAxisID: "ySpy" },
           ]},
          options: { animation: false, responsive: true, maintainAspectRatio: false,
           interaction: { mode: "index", intersect: false },
           plugins: { legend: { labels: { color: "#8b949e", boxWidth: 12 } } },
           scales: {
            x: {ticks: {color: "#6b7280", maxTicksLimit: 10}, grid: {display: false}},
            yLiq: {position: "left", ticks: {color: "#c9a961"}, grid: {color: "rgba(42,46,57,0.4)"}},
            ySpy: {position: "right", ticks: {color: "#58a6ff"}, grid: {display: false}},
           }},
         });
        } catch (e) { console.error("Liquidity drain chart error:", e); }
       } else if (kind === "contagion") {
        const cg = D.contagion || {};
        const hist = cg.history || [];
        if (!hist.length) return;
        try {
         const canvas = zc.tagName === "CANVAS" ? zc : (zc.querySelector("canvas") || document.getElementById("contagion-chart"));
         if (!canvas) return;
         const old = Chart.getChart(canvas);
         if (old) old.destroy();
         new Chart(canvas, {
          data: {
           labels: hist.map((r) => r.date),
           datasets: [
            { type: "line", label: "Contagion Score", data: hist.map((r) => r.contagionScore),
              borderColor: "#d29922", backgroundColor: "rgba(210,153,34,0.1)", fill: true,
              borderWidth: 2, pointRadius: 0, tension: 0.2, yAxisID: "yScore" },
            { type: "line", label: "SPY", data: hist.map((r) => r.spy),
              borderColor: "#58a6ff", borderWidth: 2, borderDash: [5, 4], pointRadius: 0, tension: 0.2, yAxisID: "ySpy" },
           ]},
          options: { animation: false, responsive: true, maintainAspectRatio: false,
           interaction: { mode: "index", intersect: false },
           plugins: { legend: { labels: { color: "#8b949e", boxWidth: 12 } } },
           scales: {
            x: {ticks: {color: "#6b7280", maxTicksLimit: 10}, grid: {display: false}},
            yScore: {position: "left", min: 0, max: 100, ticks: {color: "#d29922"}, grid: {color: "rgba(42,46,57,0.4)"}},
            ySpy: {position: "right", ticks: {color: "#58a6ff"}, grid: {display: false}},
           }},
         });
        } catch (e) { console.error("Contagion chart error:", e); }
       } else if (kind === "flow-divergence") {
        const F = D.flow_divergence || {};
        const hist = F.history || [];
        if (!hist.length) return;
        try {
         const canvas = zc.tagName === "CANVAS" ? zc : (zc.querySelector("canvas") || document.getElementById("flow-divergence-chart"));
         if (!canvas) return;
         const old = Chart.getChart(canvas);
         if (old) old.destroy();
         new Chart(canvas, {
          data: {
           labels: hist.map((r) => r.date),
           datasets: [
            { type: "line", label: "Divergence Oscillator", data: hist.map((r) => r.oscillator),
              borderColor: "#f85149", backgroundColor: "rgba(248,81,73,0.1)", fill: true,
              borderWidth: 2, pointRadius: 0, tension: 0.2, yAxisID: "yOsc" },
            { type: "line", label: "SPY", data: hist.map((r) => r.spy),
              borderColor: "#58a6ff", borderWidth: 2, borderDash: [5, 4], pointRadius: 0, tension: 0.2, yAxisID: "ySpy" },
           ]},
          options: { animation: false, responsive: true, maintainAspectRatio: false,
           interaction: { mode: "index", intersect: false },
           plugins: { legend: { labels: { color: "#8b949e", boxWidth: 12 } } },
           scales: {
            x: {ticks: {color: "#6b7280", maxTicksLimit: 10}, grid: {display: false}},
            yOsc: {position: "left", min: -3, max: 3, ticks: {color: "#f85149"}, grid: {color: "rgba(42,46,57,0.4)"}},
            ySpy: {position: "right", ticks: {color: "#58a6ff"}, grid: {display: false}},
           }},
         });
        } catch (e) { console.error("Flow divergence chart error:", e); }
       } else if (kind === "concentration") {
        const K = D.dynamic_concentration || {};
        const hist = K.history || [];
        const leader = (K.leader || {}).ticker || "Leader";
        if (!hist.length) return;
        try {
         const canvas = zc.tagName === "CANVAS" ? zc : (zc.querySelector("canvas") || document.getElementById("concentration-chart"));
         if (!canvas) return;
         const old = Chart.getChart(canvas);
         if (old) old.destroy();
         new Chart(canvas, {
          data: {
           labels: hist.map((r) => r.date),
           datasets: [
            { type: "line", label: "Leader: " + leader, data: hist.map((r) => r.leader),
              borderColor: "#3fb950", backgroundColor: "rgba(63,185,80,0.1)", fill: true,
              borderWidth: 2, pointRadius: 0, tension: 0.2 },
            { type: "line", label: "SPY", data: hist.map((r) => r.spy),
              borderColor: "#58a6ff", borderWidth: 2, pointRadius: 0, tension: 0.2 },
            { type: "line", label: "RSP", data: hist.map((r) => r.rsp),
              borderColor: "#8b949e", borderWidth: 2, borderDash: [4, 4], pointRadius: 0, tension: 0.2 },
           ]},
          options: { animation: false, responsive: true, maintainAspectRatio: false,
           interaction: { mode: "index", intersect: false },
           plugins: { legend: { labels: { color: "#8b949e", boxWidth: 12 } } },
           scales: {
            x: {ticks: {color: "#6b7280", maxTicksLimit: 10}, grid: {display: false}},
            y: {ticks: {color: "#8b949e"}, grid: {color: "rgba(42,46,57,0.4)"}},
           }},
         });
        } catch (e) { console.error("Concentration chart error:", e); }
       } else if (kind === "margin-leverage") {
        const ML = D.margin_leverage || {};
        const hist = ML.history || [];
        if (!hist.length) return;
        try {
         const canvas = zc.tagName === "CANVAS" ? zc : (zc.querySelector("canvas") || document.getElementById("margin-leverage-chart"));
         if (!canvas) return;
         const old = Chart.getChart(canvas);
         if (old) old.destroy();
         new Chart(canvas, {
          data: {
           labels: hist.map((r) => r.date),
           datasets: [
            { type: "line", label: "Margin Debt YoY (%)", data: hist.map((r) => r.marginYoY),
              borderColor: "#f85149", borderWidth: 2, pointRadius: 0, tension: 0.2 },
            { type: "line", label: "SPY YoY (%)", data: hist.map((r) => r.spyYoY),
              borderColor: "#58a6ff", borderWidth: 2, borderDash: [5, 5], pointRadius: 0, tension: 0.2 },
           ]},
          options: { animation: false, responsive: true, maintainAspectRatio: false,
           interaction: { mode: "index", intersect: false },
           plugins: { legend: { labels: { color: "#8b949e", boxWidth: 12 } } },
           scales: {
            x: {ticks: {color: "#6b7280", maxTicksLimit: 10}, grid: {display: false}},
            y: {ticks: {color: "#8b949e", callback: (v) => v + "%"}, grid: {color: "rgba(42,46,57,0.4)"}},
           }},
         });
        } catch (e) { console.error("Margin leverage chart error:", e); }
       } else if (kind === "sector-rotation") {
        const SR = D.sector_rotation || {};
        const hist = SR.history || [];
        if (!hist.length) return;
        try {
         const canvas = zc.tagName === "CANVAS" ? zc : (zc.querySelector("canvas") || document.getElementById("sector-rotation-chart"));
         if (!canvas) return;
         const old = Chart.getChart(canvas);
         if (old) old.destroy();
         new Chart(canvas, {
          data: {
           labels: hist.map((r) => r.date),
           datasets: [
            { type: "line", label: "RSPD/RSPS (equal-wt)", data: hist.map((r) => r.rspdRsps),
              borderColor: "#58a6ff", borderWidth: 2, pointRadius: 0, tension: 0.2 },
            { type: "line", label: "XLY/XLP (cap-wt)", data: hist.map((r) => r.xlyXlp),
              borderColor: "#d29922", borderWidth: 2, pointRadius: 0, tension: 0.2 },
           ]},
          options: { animation: false, responsive: true, maintainAspectRatio: false,
           interaction: { mode: "index", intersect: false },
           plugins: { legend: { labels: { color: "#8b949e", boxWidth: 12 } } },
           scales: {
            x: {ticks: {color: "#6b7280", maxTicksLimit: 10}, grid: {display: false}},
            y: {ticks: {color: "#8b949e"}, grid: {color: "rgba(42,46,57,0.4)"}},
           }},
         });
        } catch (e) { console.error("Sector rotation chart error:", e); }
       } else if (kind === "cot") {
        const hist = (D.cot_data.history || []);
        const mkey = D.cot_data.markets.SPX ? "SPX" : Object.keys(D.cot_data.markets)[0];
        new Chart(zc, {
         type: "line",
         data: { labels: hist.map((r) => r.report_date), datasets: [
          { label: "Commercials net", data: hist.map((r) => (r.markets[mkey] || {}).commercials?.net), borderColor: "#58a6ff", borderWidth: 2.5, pointRadius: 0, tension: 0.1 },
          { label: "Large Specs net", data: hist.map((r) => (r.markets[mkey] || {}).large_specs?.net), borderColor: "#c678dd", borderWidth: 2.5, pointRadius: 0, tension: 0.1 },
          { label: "Small Specs net", data: hist.map((r) => (r.markets[mkey] || {}).small_specs?.net), borderColor: "#d29922", borderWidth: 2, pointRadius: 0, tension: 0.1, borderDash: [5, 3] },
         ]},
         options: { responsive: true, maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: { legend: { labels: { color: "#c8d0dc" } },
           tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1, titleColor: "#d1d4dc", bodyColor: "#d1d4dc", padding: 12,
            callbacks: { label: (c) => " " + c.dataset.label + ": " + (c.parsed.y >= 0 ? "+" : "") + Math.round(c.parsed.y).toLocaleString() } } },
          scales: {
           x: { ticks: { color: "#e8ecf1", maxTicksLimit: 12, maxRotation: 0 }, grid: { color: "rgba(42,46,57,0.4)" } },
           y: { ticks: { color: "#e8ecf1", callback: (v) => (v / 1000) + "k" }, grid: { color: "rgba(42,46,57,0.4)" },
            title: { display: true, text: "Net contracts", color: "#e8ecf1" } } } }
        });
       } else if (kind === "macro") {
        const hist = ((D.macro_indicators || {}).history || []);
        const labels = hist.map((r) => {
         const [y, m] = r.month.split("-");
         return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m)-1] + " " + y.slice(2);
        });
        const series = [
         { key: "pmi", label: "Manufacturing PMI", color: "#a3e635" },
         { key: "ppi_yoy", label: "PPI (Producer Price)", color: "#a5b4fc" },
         { key: "retail_mom", label: "Retail Sales", color: "#22c55e" },
         { key: "cpi_yoy", label: "CPI (Consumer Price)", color: "#7dd3fc" },
         { key: "wti_crude", label: "WTI Crude ($)", color: "#f5a623" },
         { key: "gasoline_retail", label: "Gasoline Retail ($/gal)", color: "#ff6b6b" },
         { key: "diesel_retail", label: "Diesel Retail ($/gal)", color: "#c44dff" },
        ];
        const normalize = (vals) => {
         const nums = vals.filter((v) => v != null);
         if (!nums.length) return vals;
         const mn = Math.min(...nums), mx = Math.max(...nums);
         const range = mx - mn || 1;
         return vals.map((v) => v == null ? null : ((v - mn) / range) * 100);
        };
        new Chart(zc, {
         type: "line",
         data: { labels: labels, datasets: series.map((s) => ({
          label: s.label,
          data: normalize(hist.map((r) => r[s.key])),
          borderColor: s.color, backgroundColor: s.color,
          borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: s.color, tension: 0.3,
         }))},
         options: { responsive: true, maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: { legend: { labels: { color: "#c8d0dc", usePointStyle: true, padding: 20 } },
           tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1, titleColor: "#d1d4dc", bodyColor: "#d1d4dc", padding: 12,
            callbacks: { label: (c) => " " + c.dataset.label + ": " + c.parsed.y.toFixed(0) + "% (normalized)" } } },
          scales: {
           x: { ticks: { color: "#e8ecf1", maxTicksLimit: 12, maxRotation: 0 }, grid: { color: "rgba(42,46,57,0.4)" } },
           y: { min: -50, max: 150, ticks: { color: "#e8ecf1", callback: (v) => v + "%" }, grid: { color: "rgba(42,46,57,0.4)" },
            title: { display: true, text: "Normalized (0–100%)", color: "#e8ecf1" } } } }
        });
       } else if (kind === "leadership") {
        const leaders = (D.leadership.leaders || []);
        const labels = leaders.map((l) => l.ticker);
        new Chart(zc, {
         type: "bar",
         data: {
          labels: labels,
          datasets: [
           { label: "Relative Strength (50%)", data: leaders.map((l) => +(l.rs_score * 0.50).toFixed(1)), backgroundColor: "#58a6ff", borderWidth: 0 },
           { label: "Trend Efficiency (30%)", data: leaders.map((l) => +(l.trend_score * 0.30).toFixed(1)), backgroundColor: "#d29922", borderWidth: 0 },
           { label: "Institutional Volume (20%)", data: leaders.map((l) => +(l.vol_score * 0.20).toFixed(1)), backgroundColor: "#3fb950", borderWidth: 0 },
          ],
         },
         options: { indexAxis: "y", responsive: true, maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: { legend: { labels: { color: "#c8d0dc", boxWidth: 12 } },
           tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1, titleColor: "#fff", bodyColor: "#e8ecf1", padding: 12,
            callbacks: { afterBody: (items) => {
             const l = leaders[items[0].dataIndex];
             return "MLS: " + l.mls.toFixed(1) + "  |  " + l.sector + "  |  $" + l.price.toFixed(2);
            } } } },
          scales: {
           x: { stacked: true, max: 100, ticks: { color: "#e8ecf1" }, grid: { color: "rgba(42,46,57,0.4)" }, title: { display: true, text: "MLS (0-100)", color: "#e8ecf1" } },
           y: { stacked: true, ticks: { color: "#fff", font: { size: 14, weight: "bold" } }, grid: { display: false } } } }
        });
       } else if (kind === "trends") {
        const tk2 = el.dataset.ticker;
        const t = (D.ticker_trends || {})[tk2];
        if (t && t.quarters) {
         new Chart(zc, {
          data: {
           labels: t.quarters,
           datasets: [
            { type: "bar", label: "HF Buys", data: t.hedge_funds.buys, backgroundColor: "#00C805", borderRadius: 3, yAxisID: "yVol" },
            { type: "bar", label: "HF Sells", data: t.hedge_funds.sells, backgroundColor: "#FF5000", borderRadius: 3, yAxisID: "yVol" },
            { type: "bar", label: "Insider Buys", data: t.insiders.buys, backgroundColor: "#00C805", borderRadius: 3, hidden: true, yAxisID: "yVol" },
            { type: "bar", label: "Insider Sells", data: t.insiders.sells, backgroundColor: "#FF5000", borderRadius: 3, hidden: true, yAxisID: "yVol" },
            { type: "line", label: "Price", data: t.prices, borderColor: "#2979FF", borderWidth: 2.5, pointRadius: 3, tension: 0.3, yAxisID: "yPrice", spanGaps: true },
           ],
          },
          options: { responsive: true, maintainAspectRatio: false,
           interaction: { mode: "index", intersect: false },
           plugins: { legend: { labels: { color: "#c8d0dc", boxWidth: 12 } },
            tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1, titleColor: "#fff", bodyColor: "#e8ecf1", padding: 12 } },
           scales: {
            x: { ticks: { color: "#e8ecf1", maxTicksLimit: 8 }, grid: { color: "rgba(42,46,57,0.4)" } },
            yVol: { position: "left", ticks: { color: "#e8ecf1", callback: (v) => v === 0 ? "0" : (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + "M" : Math.round(v / 1e3) + "K") }, grid: { color: "rgba(42,46,57,0.4)" }, title: { display: true, text: "Shares", color: "#e8ecf1" } },
            yPrice: { position: "right", ticks: { color: "#2979FF", callback: (v) => "$" + v }, grid: { display: false }, title: { display: true, text: "Price", color: "#2979FF" } } } }
         });
        }
       } else if (kind === "income") {
        const tk2 = el.dataset.ticker;
        const mode = el.dataset.mode || "quarterly";
        const t2 = (D.tickers || {})[tk2];
        const ic = t2 && t2.income_chart;
        const records = (ic && ic[mode]) || [];
        const fmtM = (v) => {
         if (v == null) return "N/A";
         const a = Math.abs(v), s = v < 0 ? "-" : "";
         if (a >= 1e9) return s + "$" + (a / 1e9).toFixed(2) + "B";
         if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(1) + "M";
         return s + "$" + Math.round(a).toLocaleString();
        };
        new Chart(zc, {
         data: {
          labels: records.map((r) => r.period),
          datasets: [
           { type: "line", label: "Net margin %", data: records.map((r) => r.net_margin_pct),
             borderColor: "#f97316", backgroundColor: "#f97316", borderWidth: 2.5,
             pointRadius: 4, pointBackgroundColor: "#131722", pointBorderColor: "#f97316", pointBorderWidth: 2,
             yAxisID: "yMargin", order: 1, tension: 0.15, spanGaps: true },
           { type: "bar", label: "Revenue", data: records.map((r) => r.revenue),
             backgroundColor: "#3b82f6", borderRadius: 3, yAxisID: "yAmount", order: 2 },
           { type: "bar", label: "Net income", data: records.map((r) => r.net_income),
             backgroundColor: "#22d3ee", borderRadius: 3, yAxisID: "yAmount", order: 3 },
          ],
         },
         options: { responsive: true, maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: { legend: { labels: { color: "#c8d0dc", boxWidth: 12 } },
           tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1, titleColor: "#fff", bodyColor: "#e8ecf1", padding: 12,
            callbacks: { label: (c) => c.dataset.yAxisID === "yMargin"
             ? " Net margin: " + (c.parsed.y == null ? "N/A" : c.parsed.y.toFixed(1) + "%")
             : " " + c.dataset.label + ": " + fmtM(c.parsed.y) } } },
          scales: {
           x: { ticks: { color: "#e8ecf1" }, grid: { color: "rgba(42,46,57,0.4)" } },
           yMargin: { position: "left", ticks: { color: "#e8ecf1", callback: (v) => v + "%" }, grid: { color: "rgba(42,46,57,0.4)" }, title: { display: true, text: "Net margin %", color: "#f97316" } },
           yAmount: { position: "right", ticks: { color: "#e8ecf1", callback: fmtM }, grid: { display: false }, title: { display: true, text: "Revenue / Net income", color: "#e8ecf1" } } } }
        });
       } else if (kind === "balance" || kind === "cashflow") {
        const tk2 = el.dataset.ticker;
        const t2 = (D.tickers || {})[tk2];
        const ic = t2 && t2.income_chart;
        const isBal = kind === "balance";
        const mode = el.dataset.mode || (isBal ? "balance_quarterly" : "cashflow_quarterly");
        const records = (ic && ic[mode]) || [];
        const fmtM = (v) => {
         if (v == null) return "N/A";
         const a = Math.abs(v), s = v < 0 ? "-" : "";
         if (a >= 1e9) return s + "$" + (a / 1e9).toFixed(2) + "B";
         if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(1) + "M";
         return s + "$" + Math.round(a).toLocaleString();
        };
        const ds = isBal ? [
         { type: "line", label: "Current ratio", data: records.map((r) => r.current_ratio),
           borderColor: "#f97316", borderWidth: 2.5, pointRadius: 4,
           pointBackgroundColor: "#131722", pointBorderColor: "#f97316", pointBorderWidth: 2,
           yAxisID: "yRatio", order: 1, tension: 0.15, spanGaps: true },
         { type: "bar", label: "Cash & equivalents", data: records.map((r) => r.cash),
           backgroundColor: "#3fb950", borderRadius: 3, yAxisID: "yAmount", order: 2 },
         { type: "bar", label: "Total debt", data: records.map((r) => r.total_debt),
           backgroundColor: "#f85149", borderRadius: 3, yAxisID: "yAmount", order: 3 },
        ] : [
         { type: "line", label: "FCF margin %", data: records.map((r) => r.fcf_margin_pct),
           borderColor: "#f97316", borderWidth: 2.5, pointRadius: 4,
           pointBackgroundColor: "#131722", pointBorderColor: "#f97316", pointBorderWidth: 2,
           yAxisID: "yRatio", order: 1, tension: 0.15, spanGaps: true },
         { type: "bar", label: "Operating cash flow", data: records.map((r) => r.operating_cash_flow),
           backgroundColor: "#3b82f6", borderRadius: 3, yAxisID: "yAmount", order: 2 },
         { type: "bar", label: "CapEx", data: records.map((r) => r.capex),
           backgroundColor: "#f85149", borderRadius: 3, yAxisID: "yAmount", order: 3 },
         { type: "bar", label: "Free cash flow", data: records.map((r) => r.free_cash_flow),
           backgroundColor: "#22d3ee", borderRadius: 3, yAxisID: "yAmount", order: 4 },
        ];
        new Chart(zc, {
         data: { labels: records.map((r) => r.period), datasets: ds },
         options: { responsive: true, maintainAspectRatio: false, animation: false,
          interaction: { mode: "index", intersect: false },
          plugins: { legend: { labels: { color: "#c8d0dc", boxWidth: 12 } },
           tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1, titleColor: "#fff", bodyColor: "#e8ecf1", padding: 12,
            callbacks: { label: (c) => {
             if (c.dataset.yAxisID === "yRatio") {
              const unit = isBal ? "x" : "%";
              return " " + c.dataset.label + ": " + (c.parsed.y == null ? "N/A" : c.parsed.y.toFixed(isBal ? 2 : 1) + unit);
             }
             let extra = "";
             if (isBal && c.dataset.label === "Total debt") {
              const de = records[c.dataIndex] && records[c.dataIndex].debt_to_equity;
              if (de != null) extra = " (D/E " + de.toFixed(2) + "x)";
             }
             return " " + c.dataset.label + ": " + fmtM(c.parsed.y) + extra;
            } } } },
          scales: {
           x: { ticks: { color: "#e8ecf1" }, grid: { color: "rgba(42,46,57,0.4)" } },
           yRatio: { position: "left", ticks: { color: "#e8ecf1", callback: (v) => v + (isBal ? "x" : "%") }, grid: { color: "rgba(42,46,57,0.4)" },
            title: { display: true, text: isBal ? "Current ratio" : "FCF margin %", color: "#f97316" } },
           yAmount: { position: "right", ticks: { color: "#e8ecf1", callback: fmtM }, grid: { display: false },
            title: { display: true, text: isBal ? "Cash / Debt" : "Cash flow", color: "#e8ecf1" } } } }
        });
       }
      } catch (e) { console.error("Zoom chart error", e); }
     });
    });
}

 function render() {
  const r = currentRoute();
  // Destroy existing Chart.js instances before re-rendering (prevents "canvas already in use")
  // Uses Chart.getChart() official API to find charts by canvas element
  try {
   if (typeof Chart !== "undefined" && Chart.getChart) {
    document.querySelectorAll("canvas").forEach((cv) => {
     try {
      const chart = Chart.getChart(cv);
      if (chart) chart.destroy();
     } catch (e) {}
    });
   }
  } catch (e) {}
  // Save scroll position of the route we're leaving
  try {
    const prevHash = sessionStorage.getItem("__last_hash");
    if (prevHash && prevHash !== location.hash) {
      sessionStorage.setItem("__scroll_" + prevHash, String(window.scrollY || 0));
    }
    sessionStorage.setItem("__last_hash", location.hash);
  } catch (e) {}
  // Clear GEX strike chart registry for fresh render
  Object.keys(gexStrikeChartData).forEach((k) => delete gexStrikeChartData[k]);
  document.querySelectorAll(".topnav a[data-route]").forEach((b) =>
   b.classList.toggle("active", b.dataset.route === r.name));
  syncCoveragePick(r);
  updateProBtn();
  if (r.name === "ticker" && routes.ticker) routes.ticker(r.param);
  else if (routes[r.name]) routes[r.name]();
  else routes.home();
  // Draw GEX strike charts after HTML is in the DOM
  drawGexStrikeCharts();
  // Restore scroll position if returning to same route (e.g., after tab switch)
  // Skip on fresh navigation (hash changed) to avoid jumping
  try {
   const prevHash = sessionStorage.getItem("__last_hash");
   // __last_hash was just set to current hash above, so check if we have a saved position
   // and the page is at the top (indicating a reset happened)
   const saved = sessionStorage.getItem("__scroll_" + location.hash);
   if (saved != null && window.scrollY === 0) {
    const y = parseInt(saved, 10);
    if (!isNaN(y) && y > 100) {
     // Only restore if user had scrolled significantly
     requestAnimationFrame(() => window.scrollTo(0, y));
    }
   }
  } catch (e) {}
  // Bind click-to-zoom handlers for any zoomable charts on this page
  bindZoomHandlers();
 }
 function updateProBtn() {
  const b = document.getElementById("pro-btn");
  if (!b) return;
  updateAuthBtn();
  if (isPro()) {
   b.textContent = isAdmin ? "Admin" : "Pro Active";
   b.classList.add("unlocked");
   b.onclick = showProModal;
  } else {
   b.textContent = "Go Pro";
   b.classList.remove("unlocked");
   b.onclick = showPricingModal;
  }
  // Debug: double-tap the Pro button to see auth status (admin only)
  b.ondblclick = (e) => {
   e.preventDefault();
   if (isAdmin) showDebugPanel();
  };
  // Also support double-tap via touch for iOS
  let lastTap = 0;
  b.addEventListener("touchend", (e) => {
   const now = Date.now();
   if (now - lastTap < 400) {
    e.preventDefault();
    if (isAdmin) showDebugPanel();
   }
   lastTap = now;
  });
 }
 // Debug panel for iOS troubleshooting (admin only)
 function showDebugPanel() {
  const info = [
   "isPro(): " + isPro(),
   "proVerified: " + proVerified,
   "isAdmin: " + isAdmin,
   "authUser: " + (authUser ? authUser.email : "null"),
   "PRO_DATA: " + (PRO_DATA ? "loaded (" + Object.keys(PRO_DATA).length + " keys)" : "null"),
   "Route: " + (location.hash || "#/"),
   "Time: " + new Date().toLocaleTimeString()
  ].join("\n");
  alert("DEBUG INFO:\n\n" + info + "\n\nCopy this and send to support if Pro is locked.");
 }
 function showProModal() {
  const root = document.getElementById("modal-root");
  let statusLine;
  if (isPro()) {
   statusLine = "<p style='color:var(--muted);font-size:14px'>" +
    (authUser ? "Signed in as <b>" + esc(authUser.email) + "</b>. " : "") +
    (isAdmin ? "Admin access is active." : "Your Pro subscription is active.") + "</p>";
  } else if (authUser) {
   statusLine = "<p style='color:var(--muted);font-size:14px'>Signed in as <b>" + esc(authUser.email) + "</b>. Subscribe below, your account upgrades automatically after checkout.</p>";
  } else {
   statusLine = "<p style='color:var(--muted);font-size:14px'>Log in or create an account first, then subscribe, your Pro access is tied to your account email.</p>";
  }
  root.innerHTML =
   '<div class="modal-back" id="mb"><div class="modal">' +
   '<div class="modal-logo"><img src="logo-icon.png" alt="Cascadia Analytics"></div>' +
   "<h3>Cascadia Analytics Pro</h3>" +
   "<p style='color:var(--muted);font-size:14px'>Market Internals, options flow, moving averages, the assumption sandbox, earnings revisions, seasonality, Cascadia Scores, screener, exports, earnings history, and client notes. $19/month.</p>" +
   statusLine +
   (isPro()
    ? '<a href="https://billing.stripe.com/p/login/14AbJ16A77FXa180hGbbG00" target="_blank" rel="noopener" class="btn" style="display:block;text-align:center;width:100%;margin-bottom:8px;text-decoration:none;">Manage subscription</a>' +
     '<div id="nl-toggle-wrap" style="margin:12px 0;padding:12px;border:1px solid var(--border);border-radius:8px;"></div>' +
     '<button class="btn secondary" id="pro-logout" style="width:100%">Log out</button>'
    : (authUser
     ? '<a class="cta-btn" style="display:block;text-align:center;margin:14px 0;" href="' + esc(UPGRADE_URL) + '" target="_blank" rel="noopener">Subscribe, $19/mo</a>'
     : '<button class="btn" id="pro-login" style="width:100%">Log in / Sign up</button>')) +
   '<button class="btn secondary" id="pro-x" style="width:100%;margin-top:8px;">Close</button>' +
   "</div></div>";
  document.getElementById("mb").onclick = (e) => { if (e.target.id === "mb" || e.target.id === "pro-x") root.innerHTML = ""; };
  const li = document.getElementById("pro-login");
  if (li) li.onclick = () => showAuthModal("login");
  const lo = document.getElementById("pro-logout");
  if (lo) lo.onclick = () => doLogout();
  // Newsletter toggle for Pro users
  const nlWrap = document.getElementById("nl-toggle-wrap");
  if (nlWrap) renderNewsletterToggle(nlWrap);
 }

 // Morning briefing newsletter toggle (Pro only)
 async function newsletterStatus() {
  try {
   if (!authUser) return null;
   const { data, error } = await supa.from("profiles")
    .select("is_pro, newsletter_subscribed")
    .eq("user_id", authUser.id).maybeSingle();
   if (error) return null;
   return { is_pro: data?.is_pro || false, subscribed: data?.newsletter_subscribed || false };
  } catch (e) { return null; }
 }
 async function renderNewsletterToggle(wrap) {
  wrap.innerHTML = "<p style='color:var(--muted);font-size:13px'>Loading newsletter settings...</p>";
  const st = await newsletterStatus();
  if (!st || !st.is_pro) { wrap.innerHTML = ""; return; }
  const on = !!st.subscribed;
  wrap.innerHTML =
   "<label style='display:flex;align-items:center;gap:10px;cursor:pointer;font-size:14px'>" +
   "<input type='checkbox' id='nl-check' " + (on ? "checked" : "") + " style='width:18px;height:18px;accent-color:#c7af7f'>" +
   "<span><b>Morning briefing newsletter</b><br><span style='color:var(--muted);font-size:12px'>Daily pre-market email with the full market analysis. Unsubscribe anytime.</span></span></label>";
  document.getElementById("nl-check").onchange = async (e) => {
   const want = e.target.checked;
   try {
    const upd = {
     newsletter_subscribed: want,
     updated_at: new Date().toISOString(),
     ...(want
      ? { newsletter_subscribed_at: new Date().toISOString(), newsletter_unsubscribed_at: null }
      : { newsletter_unsubscribed_at: new Date().toISOString() })
    };
    const { error } = await supa.from("profiles").update(upd).eq("user_id", authUser.id);
    if (error) throw error;
   } catch (err) {
    e.target.checked = !want;
    alert("Could not update newsletter setting. Please try again.");
   }
  };
 }
 // Post-checkout newsletter signup prompt
 async function maybeShowNewsletterPrompt() {
  const st = await newsletterStatus();
  if (!st || !st.is_pro || st.subscribed) return;
  // Don't nag: only show once per session after a fresh upgrade
  if (sessionStorage.getItem("__nl_prompted")) return;
  sessionStorage.setItem("__nl_prompted", "1");
  const root = document.getElementById("modal-root");
  root.innerHTML =
   '<div class="modal-back" id="mb"><div class="modal">' +
   '<div class="modal-logo"><img src="logo-icon.png" alt="Cascadia Analytics"></div>' +
   "<h3>Welcome to Pro</h3>" +
   "<p style='color:var(--muted);font-size:14px'>Want the morning briefing in your inbox? A daily pre-market email with the full market analysis, gamma levels, Fed odds, and macro takes. Free with Pro, unsubscribe anytime.</p>" +
   '<button class="cta-btn" id="nl-yes" style="display:block;width:100%;margin:12px 0;">Yes, send me the briefing</button>' +
   '<button class="btn secondary" id="nl-no" style="width:100%">Not now</button>' +
   "</div></div>";
  document.getElementById("nl-yes").onclick = async () => {
   try {
    await supa.from("profiles").update({
     newsletter_subscribed: true,
     newsletter_subscribed_at: new Date().toISOString(),
     newsletter_unsubscribed_at: null,
     updated_at: new Date().toISOString()
    }).eq("user_id", authUser.id);
   } catch (e) {}
   root.innerHTML = "";
  };
  document.getElementById("nl-no").onclick = () => { root.innerHTML = ""; };
 }

 document.getElementById("brand-home").onclick = () => nav("");
 // Topnav uses direct <a href="#/..."> links; no JS click handlers needed
 window.addEventListener("hashchange", render);
 // Save scroll position when tab is hidden (mobile tab switch)
 document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
   try {
    sessionStorage.setItem("__scroll_" + location.hash, String(window.scrollY || 0));
   } catch (e) {}
  } else if (document.visibilityState === "visible") {
   // Restore scroll position when returning to the tab (fixes mobile tab-switch reset)
   try {
    const saved = sessionStorage.getItem("__scroll_" + location.hash);
    if (saved != null) {
     const y = parseInt(saved, 10);
     if (!isNaN(y) && y > 0) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
       window.scrollTo(0, y);
       // Double-check after a short delay (mobile browsers may reset)
       setTimeout(() => {
        if (Math.abs(window.scrollY - y) > 50) {
         window.scrollTo(0, y);
        }
       }, 100);
      });
     }
    }
   } catch (e) {}
  }
 });
 // Delegated handler for Pro teaser "See Pro Plans" links
 document.addEventListener("click", (e) => {
  if (e.target && e.target.id === "teaser-pricing") {
   e.preventDefault();
   showPricingModal();
  }
 });

 /* ---------- artifact chrome: snapshot line + coverage selector ---------- */
 function setSnapshot() {
  const el = document.getElementById("snapshot-line");
  if (!el) return;
  let s = "MODEL SNAPSHOT";
  if (D.generated_at) {
   const d = new Date(D.generated_at);
   if (!isNaN(d)) {
    const M = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    s = "MODEL SNAPSHOT · " + String(d.getUTCDate()).padStart(2, "0") + " " + M[d.getUTCMonth()] + " " + d.getUTCFullYear();
   }
  }
  el.textContent = s;
 }
 function populateCoverage() {
  const sel = document.getElementById("coverage-pick");
  if (!sel) return;
  sel.innerHTML = '<option value="">HOME · Macro &amp; market intelligence</option>' +
   ORDER.map((tk) => '<option value="' + esc(tk) + '">' + esc(tk) + ", " + esc(TICKERS[tk].name) + "</option>").join("");
  sel.addEventListener("change", () => {
   if (sel.value) nav("ticker/" + sel.value);
   else nav("");
  });
 }
 function syncCoveragePick(r) {
  const sel = document.getElementById("coverage-pick");
  if (!sel) return;
  sel.value = (r.name === "ticker" && TICKERS[r.param.toUpperCase()]) ? r.param.toUpperCase() : "";
 }


 function tickerInsiderHtml(tk) {
  const d = (D.ticker_insider || {})[tk];
  if (!d || !d.transactions || !d.transactions.length) {
   return '<p style="color:var(--muted)">No recent insider transactions filed.</p>';
  }
  const s = d.summary || {};
  const omBuys = s.buys || 0, omSells = s.sells || 0;
  // Summary line: highlight open-market conviction activity
  let h = '<div style="display:flex;gap:16px;margin-bottom:12px;font-size:13px;">';
  h += '<div><span style="color:var(--muted)">Open-market buys:</span> <b style="color:#3fb950">' + omBuys + '</b></div>';
  h += '<div><span style="color:var(--muted)">Open-market sells:</span> <b style="color:#f85149">' + omSells + '</b></div>';
  if (s.automatic_count) h += '<div><span style="color:var(--muted)">Automatic:</span> ' + s.automatic_count + '</div>';
  h += '</div>';
  h += '<div style="overflow-x:auto;"><table style="width:100%;font-size:12px;border-collapse:collapse;">';
  h += '<thead><tr style="color:var(--muted);text-align:left;border-bottom:1px solid #2a3348;">' +
   '<th style="padding:6px 8px;">Date</th><th style="padding:6px 8px;">Insider</th>' +
   '<th style="padding:6px 8px;">Type</th><th style="padding:6px 8px;text-align:right;">Shares</th>' +
   '<th style="padding:6px 8px;text-align:right;">Price</th><th style="padding:6px 8px;text-align:right;">Value</th></tr></thead><tbody>';
  d.transactions.slice(0, 15).forEach((t) => {
   const isOM = t.category === "open_market";
   const isBuy = t.type === "buy";
   // Open market = conviction: highlighted. Automatic = dimmed.
   const rowStyle = isOM
    ? (isBuy ? "background:rgba(63,185,80,0.08);" : "background:rgba(248,81,73,0.08);")
    : "opacity:0.55;";
   const typeColor = isBuy ? "#3fb950" : "#f85149";
   const typeLabel = (isBuy ? "Buy" : "Sell") + (isOM ? "" : ' <span style="color:var(--muted);font-size:10px;">(' + esc(t.code_label || "auto") + ")</span>");
   const convictBadge = isOM ? ' <span style="font-size:9px;background:' + (isBuy ? "#3fb950" : "#f85149") + ';color:#fff;padding:1px 5px;border-radius:3px;font-weight:700;">OPEN MARKET</span>' : "";
   h += '<tr style="border-bottom:1px solid #1a2030;' + rowStyle + '">' +
    '<td style="padding:6px 8px;color:var(--muted);">' + esc(t.date || "") + '</td>' +
    '<td style="padding:6px 8px;">' + esc(t.insider || "") +
    (t.title ? '<div style="font-size:10px;color:var(--muted);">' + esc(t.title) + '</div>' : '') + '</td>' +
    '<td style="padding:6px 8px;color:' + typeColor + ';font-weight:700;">' + typeLabel + convictBadge + '</td>' +
    '<td style="padding:6px 8px;text-align:right;">' + (t.shares != null ? t.shares.toLocaleString() : "-") + '</td>' +
    '<td style="padding:6px 8px;text-align:right;">' + (t.price != null ? "$" + t.price.toFixed(2) : "-") + '</td>' +
    '<td style="padding:6px 8px;text-align:right;">' + (t.value != null ? "$" + Math.round(t.value).toLocaleString() : "-") + '</td></tr>';
  });
  h += '</tbody></table></div>';
  h += '<p style="font-size:11px;color:var(--muted);margin-top:8px;">Open-market buys/sells signal conviction. ' +
   'Automatic transactions (tax withholding, option exercises, grants) are routine and dimmed. Source: SEC Form 4.</p>';
  return h;
 }


 function tickerTrendsHtml(tk) {
  const t = (D.ticker_trends || {})[tk];
  const hf = (D.ticker_13f || {})[tk];
  if (!t || !t.quarters) {
   return '<p style="color:var(--muted)">Trading trends data unavailable.</p>';
  }
  const chartId = "trends-chart-" + tk.replace(/[^A-Z0-9]/gi, "");
  // Store for tab switching
  trendsData[chartId] = { tk: tk, tab: "hedge_funds" };
  let h = '<div style="display:flex;gap:8px;margin-bottom:12px;">';
  h += '<button data-trends-tab="hedge_funds" data-trends-chart="' + chartId + '" style="flex:1;padding:8px;border:0;border-radius:8px;background:#2c2c2e;color:#fff;font-weight:700;font-size:12px;cursor:pointer;">Hedge funds</button>';
  h += '<button data-trends-tab="insiders" data-trends-chart="' + chartId + '" style="flex:1;padding:8px;border:0;border-radius:8px;background:transparent;color:#8b8fa3;font-weight:700;font-size:12px;cursor:pointer;">Insiders</button>';
  h += '</div>';
  // Legend
  h += '<div style="display:flex;gap:16px;font-size:11px;color:#8b8fa3;margin-bottom:8px;">';
  h += '<span><span style="display:inline-block;width:12px;height:4px;background:#00C805;border-radius:2px;vertical-align:middle;"></span> Buy</span>';
  h += '<span><span style="display:inline-block;width:12px;height:4px;background:#FF5000;border-radius:2px;vertical-align:middle;"></span> Sell</span>';
  h += '<span><span style="display:inline-block;width:12px;height:4px;background:#2979FF;border-radius:2px;vertical-align:middle;"></span> Price</span>';
  h += '</div>';
  h += '<div class="zoomable-chart" data-chart="trends" data-ticker="' + esc(tk) + '" style="position:relative;cursor:zoom-in;" title="Click to zoom"><canvas id="' + chartId + '" style="max-height:300px;"></canvas>';
  h += '<div style="position:absolute;top:8px;right:10px;font-size:11px;color:#e8ecf1;background:rgba(19,23,34,0.8);padding:2px 8px;border-radius:4px;">⛶ click to zoom</div></div>';
  h += '<div id="' + chartId + '-table" style="margin-top:16px;"></div>';
  // Defer chart draw until DOM is ready
  setTimeout(() => drawTrendsChart(chartId), 50);
  return h;
 }

 function drawTrendsChart(chartId) {
  const meta = trendsData[chartId];
  if (!meta || typeof Chart === "undefined") return;
  const t = (D.ticker_trends || {})[meta.tk];
  if (!t) return;
  const cv = document.getElementById(chartId);
  if (!cv) return;
  try { const ex = Chart.getChart(cv); if (ex) ex.destroy(); } catch (e) {}
  const isHF = meta.tab === "hedge_funds";
  const vol = isHF ? t.hedge_funds : t.insiders;
  const labels = t.quarters.map((q) => q.replace(" ", "\n"));
  // For hedge funds, only show bars where we have real snapshot data
  const buys = vol.buys.map((v, i) => (isHF && !vol.has_data[i] ? null : v));
  const sells = vol.sells.map((v, i) => (isHF && !vol.has_data[i] ? null : v));
  new Chart(cv, {
   data: {
    labels: labels,
    datasets: [
     { type: "bar", label: "Buy", data: buys, backgroundColor: "#00C805", borderRadius: 3, barPercentage: 0.6, categoryPercentage: 0.6, yAxisID: "yVol" },
     { type: "bar", label: "Sell", data: sells, backgroundColor: "#FF5000", borderRadius: 3, barPercentage: 0.6, categoryPercentage: 0.6, yAxisID: "yVol" },
     { type: "line", label: "Price", data: t.prices, borderColor: "#2979FF", borderWidth: 2, pointRadius: 0, tension: 0.3, yAxisID: "yPrice", spanGaps: true },
    ],
   },
   options: {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
     x: { grid: { display: false }, ticks: { color: "#8b8fa3", font: { size: 10 } } },
     yVol: { position: "left", grid: { color: "#1a2030" },
      ticks: { color: "#8b8fa3", font: { size: 10 },
       callback: (v) => v === 0 ? "0" : (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + "M" : Math.round(v / 1e3) + "K") } },
     yPrice: { position: "right", grid: { display: false },
      ticks: { color: "#2979FF", font: { size: 10 }, callback: (v) => "$" + v } },
    },
   },
  });
  // Render the table for the active tab
  drawTrendsTable(chartId);
 }

 function drawTrendsTable(chartId) {
  const meta = trendsData[chartId];
  if (!meta) return;
  const el = document.getElementById(chartId + "-table");
  if (!el) return;
  const isHF = meta.tab === "hedge_funds";
  let h = "";
  if (isHF) {
   const d = (D.ticker_13f || {})[meta.tk];
   const holders = (d && d.holders || []).slice(0, 10);
   if (!holders.length) {
    h = '<p style="color:var(--muted);font-size:12px;">No institutional holder data.</p>';
   } else {
    h = '<div style="display:grid;grid-template-columns:1fr auto auto;gap:4px 12px;font-size:11px;color:var(--muted);padding:6px 0;border-bottom:1px solid #1a2030;"><div>Hedge fund</div><div>Activity</div><div style="text-align:right;">Shares</div></div>';
    holders.forEach((x) => {
     const isBuy = x.activity === "buy";
     const col = isBuy ? "#00C805" : (x.activity === "sell" ? "#FF5000" : "#8b8fa3");
     const act = x.activity === "hold" ? "Hold" : (isBuy ? "Buy" : "Sell");
     h += '<div style="display:grid;grid-template-columns:1fr auto auto;gap:4px 12px;font-size:12px;padding:8px 0;border-bottom:1px solid #141a28;align-items:center;">' +
      '<div><div style="font-weight:700;color:#e8ecf1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;">' + esc(x.name) + '</div>' +
      '<div style="font-size:10px;color:var(--muted);">' + esc(x.change_pct || "") + '</div></div>' +
      '<div style="color:' + col + ';font-weight:700;">' + act + '</div>' +
      '<div style="text-align:right;font-weight:700;color:#e8ecf1;">' + Math.abs(x.shares_change || 0).toLocaleString() + '</div></div>';
    });
    if (d && d.data_as_of) h += '<p style="font-size:10px;color:var(--muted);margin-top:6px;">13F data as of ' + esc(d.data_as_of) + '. Quarterly bars build from real snapshots going forward.</p>';
   }
  } else {
   const d = (D.ticker_insider || {})[meta.tk];
   const txns = (d && d.transactions || []).filter((x) => x.category === "open_market").slice(0, 10);
   if (!txns.length) {
    h = '<p style="color:var(--muted);font-size:12px;">No open-market insider transactions.</p>';
   } else {
    h = '<div style="display:grid;grid-template-columns:1fr auto auto;gap:4px 12px;font-size:11px;color:var(--muted);padding:6px 0;border-bottom:1px solid #1a2030;"><div>Insider</div><div>Activity</div><div style="text-align:right;">Shares</div></div>';
    txns.forEach((x) => {
     const isBuy = x.type === "buy";
     const col = isBuy ? "#00C805" : "#FF5000";
     h += '<div style="display:grid;grid-template-columns:1fr auto auto;gap:4px 12px;font-size:12px;padding:8px 0;border-bottom:1px solid #141a28;align-items:center;">' +
      '<div><div style="font-weight:700;color:#e8ecf1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;">' + esc(x.insider || "") + '</div>' +
      '<div style="font-size:10px;color:var(--muted);">' + esc(x.title || "") + " · " + esc(x.date || "") + '</div></div>' +
      '<div style="color:' + col + ';font-weight:700;">' + (isBuy ? "Buy" : "Sell") + '</div>' +
      '<div style="text-align:right;font-weight:700;color:#e8ecf1;">' + (x.shares || 0).toLocaleString() + '</div></div>';
    });
   }
  }
  el.innerHTML = h;
 }

 // Tab switching for Trading Trends (delegated)
 document.addEventListener("click", (e) => {
  const btn = e.target && e.target.closest ? e.target.closest("[data-trends-tab]") : null;
  if (!btn) return;
  const chartId = btn.getAttribute("data-trends-chart");
  const tab = btn.getAttribute("data-trends-tab");
  if (trendsData[chartId]) trendsData[chartId].tab = tab;
  // Update button styles
  document.querySelectorAll('[data-trends-chart="' + chartId + '"]').forEach((b) => {
   const active = b.getAttribute("data-trends-tab") === tab;
   b.style.background = active ? "#2c2c2e" : "transparent";
   b.style.color = active ? "#fff" : "#8b8fa3";
  });
  drawTrendsChart(chartId);
 });


 function tickerGexHtml(tk, d) {
  const isPos = d.regime === "positive";
  const regimeColor = isPos ? "#3fb950" : "#f85149";
  const regimeLabel = isPos ? "POSITIVE, volatility dampener" : "NEGATIVE, volatility amplifier";
  const regimeIcon = isPos ? "🟢" : "🔴";
  const unit = d.gex_unit || "M";
  const spotVsZG = d.zero_gamma != null
   ? (d.spot >= d.zero_gamma
    ? '<span style="color:#3fb950">above</span> zero gamma, dealers dampening moves'
    : '<span style="color:#f85149">below</span> zero gamma, dealers amplifying moves')
   : " - ";
  // Interactive GEX bar: visual split of call vs put gamma
  const total = Math.abs(d.call_gex) + Math.abs(d.put_gex);
  const callPct = total > 0 ? (Math.abs(d.call_gex) / total * 100).toFixed(1) : 50;
  const putPct = total > 0 ? (Math.abs(d.put_gex) / total * 100).toFixed(1) : 50;
  return '<div style="position:relative;margin-bottom:8px;">' +
   '<div style="display:flex;height:28px;border-radius:6px;overflow:hidden;margin:12px 0;" title="Call GEX vs Put GEX">' +
   '<div style="width:' + callPct + '%;background:#3fb950;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#0a0f0a;" title="Call GEX: +' + d.call_gex.toFixed(2) + unit + '">+' + d.call_gex.toFixed(1) + unit + '</div>' +
   '<div style="width:' + putPct + '%;background:#f85149;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;" title="Put GEX: ' + d.put_gex.toFixed(2) + unit + '">' + d.put_gex.toFixed(1) + unit + '</div>' +
   "</div>" +
   "</div>" +
   '<div style="text-align:center;margin-bottom:12px;"><span style="font-size:13px;color:' + regimeColor + ';font-weight:700;">' + regimeIcon + " " + regimeLabel + "</span></div>" +
   '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0;">' +
   '<div><div style="font-size:11px;color:#e8ecf1;">SPOT</div><div style="font-size:20px;font-weight:700;color:#e8ecf1;">$' + d.spot.toFixed(2) + "</div></div>" +
   '<div><div style="font-size:11px;color:#e8ecf1;">NET GEX</div><div style="font-size:20px;font-weight:700;color:' + regimeColor + ';">' +
   (d.total_gex >= 0 ? "+" : "") + d.total_gex.toFixed(2) + unit + "</div></div>" +
   '<div><div style="font-size:11px;color:#e8ecf1;">ZERO GAMMA</div><div style="font-size:15px;font-weight:600;color:#e8ecf1;">' +
   (d.zero_gamma != null ? "$" + d.zero_gamma.toFixed(2) : " - ") + "</div>" +
   '<div style="font-size:12px;color:#e8ecf1;">Spot ' + spotVsZG + "</div></div>" +
   '<div><div style="font-size:11px;color:#e8ecf1;">WALLS</div><div style="font-size:15px;font-weight:600;">' +
   '<span style="color:#3fb950;" title="Call wall (resistance)">C $' + (d.call_wall != null ? d.call_wall.toFixed(0) : " - ") + "</span>" +
   ' <span style="color:#e8ecf1;">/</span> ' +
   '<span style="color:#f85149;" title="Put wall (support)">P $' + (d.put_wall != null ? d.put_wall.toFixed(0) : " - ") + "</span></div></div>" +
   "</div>" +
   '<div class="panel-about" style="text-align:left;max-width:none;margin:12px 0;">' +
   "<p><b>What is this?</b> Gamma exposure measures how options dealers will hedge as " + esc(tk) + " moves. " +
   "Dealers who sold options must buy/sell shares to stay neutral, their hedging pushes the stock.</p>" +
   (isPos
    ? "<p><b style='color:#3fb950'>Positive GEX</b>, dealers buy dips and sell rips, <i>dampening</i> volatility. Expect choppy, range-bound action. Favor mean-reversion: buy support, sell resistance quickly.</p>"
    : "<p><b style='color:#f85149'>Negative GEX</b>, dealers sell into declines and buy into rallies, <i>amplifying</i> moves. Expect wider swings and trending action. Favor momentum/breakouts; widen stops and reduce size.</p>") +
   "<p><b>Zero gamma ($" + (d.zero_gamma != null ? d.zero_gamma.toFixed(2) : " - ") + ")</b> is the flip point, above it dealers stabilize, below it they accelerate. " +
   "The <b style='color:#3fb950'>call wall</b> acts as resistance and the <b style='color:#f85149'>put wall</b> as support.</p>" +
   "</div>" +
   '<div style="font-size:12px;color:#e8ecf1;">' + d.contracts_analyzed.toLocaleString() + " contracts analyzed</div>" +
   '<div class="panel-asof">As of ' + esc((d.as_of || "").slice(0, 16).replace("T", " ")) + "</div>";
 }

 function tickerSkewHtml(tk, d) {
  const regimeColors = {
   extreme_fear: "#f85149", elevated_fear: "#d29922",
   normal: "#58a6ff", complacent: "#3fb950",
  };
  const rc = regimeColors[d.regime] || "#e8ecf1";
  const trendIcon = d.trend === "steepening" ? "📈" : d.trend === "flattening" ? "📉" : "➡️";
  const trendText = d.trend === "steepening" ? "Steepening, fear rising" :
   d.trend === "flattening" ? "Flattening, fear fading" : "Stable";
  const maxIV = Math.max(d.put_iv, d.call_iv, 1);
  const putPct = (d.put_iv / maxIV * 100).toFixed(1);
  const callPct = (d.call_iv / maxIV * 100).toFixed(1);
  return '<div style="position:relative;margin-bottom:8px;">' +
   '<div style="margin:12px 0;">' +
   '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
   '<span style="font-size:11px;color:#e8ecf1;width:70px;">Put IV</span>' +
   '<div style="flex:1;height:22px;background:#1a2030;border-radius:4px;overflow:hidden;">' +
   '<div style="width:' + putPct + '%;height:100%;background:#f85149;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;font-size:11px;font-weight:700;color:#fff;">' + d.put_iv.toFixed(1) + "%</div></div></div>" +
   '<div style="display:flex;align-items:center;gap:8px;">' +
   '<span style="font-size:11px;color:#e8ecf1;width:70px;">Call IV</span>' +
   '<div style="flex:1;height:22px;background:#1a2030;border-radius:4px;overflow:hidden;">' +
   '<div style="width:' + callPct + '%;height:100%;background:#3fb950;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;font-size:11px;font-weight:700;color:#0a0f0a;">' + d.call_iv.toFixed(1) + "%</div></div></div>" +
   "</div>" +
   "</div>" +
   '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0;">' +
   '<div><div style="font-size:11px;color:#e8ecf1;">SKEW</div>' +
   '<div style="font-size:20px;font-weight:700;color:' + rc + ';">+' + d.skew.toFixed(1) + " vp</div>" +
   '<div style="font-size:12px;color:' + rc + ';">' + esc(d.regime_label || "") + "</div></div>" +
   '<div><div style="font-size:11px;color:#e8ecf1;">TREND</div>' +
   '<div style="font-size:14px;font-weight:600;color:#e8ecf1;">' + trendIcon + " " + trendText + "</div>" +
   (d.skew_change != null ? '<div style="font-size:11px;color:#e8ecf1;">' + (d.skew_change >= 0 ? "+" : "") + d.skew_change.toFixed(1) + " vs prior</div>" : "") + "</div>" +
   "</div>" +
   '<div class="panel-about" style="text-align:left;max-width:none;margin:12px 0;">' +
   "<p><b>What is this?</b> Volatility skew compares what investors pay for downside puts versus upside calls on " + esc(tk) + ". " +
   "A high skew means puts are expensive, institutions are aggressively hedging.</p>" +
   (d.regime === "extreme_fear" || d.regime === "elevated_fear"
    ? "<p><b style='color:#f85149'>Steep skew</b>, fear is elevated. If you're bullish, consider selling put spreads to collect inflated premium. Capitulation bottoms often form when skew peaks.</p>"
    : d.regime === "complacent"
    ? "<p><b style='color:#3fb950'>Flat skew</b>, complacency. Downside protection is cheap, good time to hedge if bearish. But extreme flatness can signal euphoric tops.</p>"
    : "<p>Skew is in the normal range for equities. No extreme positioning to fade.</p>") +
   "</div>" +
   '<div style="font-size:12px;color:#e8ecf1;">Put $' + d.put_strike.toFixed(2) + " / Call $" + d.call_strike.toFixed(2) + " · " + d.dte + " DTE</div>" +
   '<div class="panel-asof">As of ' + esc((d.as_of || "").slice(0, 16).replace("T", " ")) + "</div>";
 }

 /* Dark Pool & Off-Exchange Flow (Pro) */
 function darkPoolHtml(tk) {
  const dp = D.dark_pool || {};
  const tickers = dp.tickers || {};
  const d = tickers[tk];
  if (!d) return '<p style="color:var(--muted)">No dark pool data for this ticker.</p>';
  const sentimentColors = {
   "BULLISH ACCUMULATION": "#3fb950",
   "MODERATE BUY BIAS": "#58a6ff",
   "INSTITUTIONAL DISTRIBUTION": "#f85149",
   "BEARISH FADE": "#d29922",
   "NEUTRAL / BALANCED": "#8b949e",
  };
  const sc = sentimentColors[d.sentiment] || "#e8ecf1";
  const flowM = d.net_dark_flow_usd / 1e6;
  const flowStr = (flowM >= 0 ? "+$" : "-$") + Math.abs(flowM).toFixed(1) + "M";
  const zStr = (d.z_score >= 0 ? "+" : "") + d.z_score.toFixed(2);
  let h = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:12px 0;">' +
   '<div><div style="font-size:11px;color:#8b949e;">DARK SHORT RATIO</div>' +
   '<div style="font-size:20px;font-weight:700;color:' + sc + ';">' + d.dpsr.toFixed(1) + '%</div>' +
   '<div style="font-size:11px;color:#8b949e;">' + (d.dpsr >= 50 ? "Dealers shorting to fill buys" : d.dpsr < 40 ? "Dealers absorbing sells" : "Balanced") + "</div></div>" +
   '<div><div style="font-size:11px;color:#8b949e;">PARTICIPATION</div>' +
   '<div style="font-size:20px;font-weight:700;color:#e8ecf1;">' + d.dpr.toFixed(1) + '%</div>' +
   '<div style="font-size:11px;color:#8b949e;">of volume off-exchange</div></div>' +
   '<div><div style="font-size:11px;color:#8b949e;">NET DARK FLOW</div>' +
   '<div style="font-size:20px;font-weight:700;color:' + (flowM >= 0 ? "#3fb950" : "#f85149") + ';">' + flowStr + "</div>" +
   '<div style="font-size:11px;color:#8b949e;">Z-score ' + zStr + "</div></div>" +
   "</div>" +
   '<div style="margin:12px 0;padding:10px 12px;border-radius:8px;background:rgba(255,255,255,0.03);border-left:3px solid ' + sc + ';">' +
   '<div style="font-size:13px;font-weight:700;color:' + sc + ';">' + esc(d.sentiment) + "</div>" +
   '<div style="font-size:12px;color:#8b949e;margin-top:4px;">High dark short ratio (&gt;50%) means wholesale dealers are selling short from inventory to satisfy aggressive institutional buy orders. Low ratio (&lt;40%) means dealers are absorbing institutional sell tickets.</div>' +
   "</div>";
  // 10-day DPSR history bars
  if (d.history && d.history.length > 1) {
   const hist = d.history.slice(-10);
   const maxDpsr = Math.max(...hist.map(x => x.dpsr * 100), 60);
   h += '<div style="margin:12px 0;"><div style="font-size:11px;color:#8b949e;margin-bottom:6px;">DARK SHORT RATIO, LAST 10 SESSIONS</div>' +
    '<div style="display:flex;align-items:flex-end;gap:3px;height:60px;">' +
    hist.map(x => {
     const v = x.dpsr * 100;
     const ht = Math.max(4, (v / maxDpsr * 56));
     const c = v >= 55 ? "#3fb950" : v >= 50 ? "#58a6ff" : v < 40 ? "#f85149" : "#8b949e";
     return '<div title="' + x.date + ": " + v.toFixed(1) + '%" style="flex:1;background:' + c + ";height:" + ht + 'px;border-radius:2px;min-width:8px;"></div>';
    }).join("") +
    "</div></div>";
  }
  const macro = dp.macro || {};
  if (macro.dix) {
   h += '<div class="panel-asof">S&P 500 Dark Pool Index (DIX): ' + (macro.dix * 100).toFixed(1) + "% (" + esc(macro.regime || "") + ") · As of " + esc(d.date || "") + "</div>";
  }
  return h;
 }

 /* Trend Conviction & Exhaustion gauges (per-ticker, from trend_signals.json) */
 function trendGaugesHtml(tk) {
  const sig = ((D.trend_signals || {}).tickers || {})[tk];
  if (!sig) return "";
  const tc = sig.trendScore >= 60 ? "#3fb950" : sig.trendScore >= 30 ? "#d29922" : "#8b949e";
  const ec = sig.exhaustionScore >= 60 ? "#f85149" : sig.exhaustionScore >= 30 ? "#d29922" : "#3fb950";
  const flags = (sig.reversalFlags || []).map((f) =>
   '<div style="font-size:11px;color:' + (f.indexOf("No exhaustion") === 0 ? "#8b949e" : "#f85149") + ';margin-top:4px;">' + esc(f) + "</div>").join("");
  return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">' +
   '<div style="background:#161b26;border-radius:10px;padding:12px;">' +
   '<div style="font-size:11px;color:#8b949e;letter-spacing:0.5px;">TREND CONVICTION</div>' +
   '<div style="font-size:28px;font-weight:800;color:' + tc + ';">' + sig.trendScore + '<span style="font-size:14px;color:#8b949e;">/100</span></div>' +
   '<div style="font-size:11px;color:#e8ecf1;margin-top:2px;">' + esc(sig.alignment) + " · ADX " + sig.adx + " · " + esc(sig.trendDirection) + "</div>" +
   '<div style="font-size:11px;color:#6b7280;margin-top:4px;">High RSI alone does not kill a trend. Conviction above 60 means the trend is structurally sound.</div></div>' +
   '<div style="background:#161b26;border-radius:10px;padding:12px;">' +
   '<div style="font-size:11px;color:#8b949e;letter-spacing:0.5px;">EXHAUSTION / REVERSAL RISK</div>' +
   '<div style="font-size:28px;font-weight:800;color:' + ec + ';">' + sig.exhaustionScore + '<span style="font-size:14px;color:#8b949e;">/100</span></div>' +
   '<div style="font-size:11px;color:#e8ecf1;margin-top:2px;">RSI ' + sig.rsi + "</div>" + flags +
   "</div></div>";
 }

 /* Multi-timeframe Technical Analysis (Pro) */
 function technicalAnalysisHtml(tk) {
  const ta = (D.technical_analysis || {})[tk];
  if (!ta) return '<div class="card"><p style="color:var(--muted)">Technical analysis not available for ' + esc(tk) + '.</p></div>';

  const biasColor = { BULLISH: "#3fb950", BEARISH: "#f85149", NEUTRAL: "#d29922" };
  const bc = biasColor[ta.confluence.overallBias] || "#e8ecf1";

  const tfCard = (name, tf) => {
   const tc = biasColor[tf.trend] || "#e8ecf1";
   return '<div style="background:#161b26;border-radius:10px;padding:14px;flex:1;min-width:200px;">' +
    '<div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:8px;">' + name + ' <span style="color:' + tc + ';">' + tf.trend + "</span></div>" +
    '<div style="font-size:12px;color:#e8ecf1;margin-bottom:4px;">RSI(14): <b>' + tf.rsi.value.toFixed(1) + "</b> (" + tf.rsi.status + ")</div>" +
    '<div style="font-size:12px;color:#e8ecf1;margin-bottom:4px;">MACD: ' + esc(tf.macd.signal) + "</div>" +
    '<div style="font-size:12px;color:#e8ecf1;margin-bottom:4px;">EMA50 vs EMA200: ' + esc(tf.movingAverages.ema50VsEma200) + "</div>" +
    (tf.keyPattern ? '<div style="font-size:12px;color:#e8ecf1;margin-bottom:4px;">Pattern: ' + esc(tf.keyPattern) + "</div>" : "") +
    '<div style="font-size:12px;color:#a0a8b8;">' + esc(tf.summary) + "</div>" +
    "</div>";
  };

  const kl = ta.keyLevels;
  const supHtml = kl.support.map((s, i) => '<div>S' + (i+1) + ': <b>$' + s.toFixed(2) + "</b></div>").join("");
  const resHtml = kl.resistance.map((r, i) => '<div>R' + (i+1) + ': <b>$' + r.toFixed(2) + "</b></div>").join("");

  return '<div class="card">' +
   '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">' +
   '<div style="font-size:15px;font-weight:700;">Overall: <span style="color:' + bc + ';">' + ta.confluence.overallBias + "</span></div>" +
   '<div style="font-size:13px;color:#e8ecf1;">Confidence: <b>' + ta.confluence.confidenceScore + '%</b></div>' +
   '<div style="font-size:12px;color:#a0a8b8;">' + ta.confluence.timeframeAlignment.replace(/_/g, " ") + "</div>" +
   "</div>" +
   trendGaugesHtml(tk) +
   '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">' +
   tfCard("Daily", ta.timeframes.daily) + tfCard("Weekly", ta.timeframes.weekly) + tfCard("Monthly", ta.timeframes.monthly) +
   "</div>" +
   '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">' +
   '<div><div style="font-size:13px;font-weight:700;color:#3fb950;margin-bottom:6px;">Support</div><div style="font-size:13px;color:#e8ecf1;">' + supHtml + "</div></div>" +
   '<div><div style="font-size:13px;font-weight:700;color:#f85149;margin-bottom:6px;">Resistance</div><div style="font-size:13px;color:#e8ecf1;">' + resHtml + "</div></div>" +
   "</div>" +
   '<div style="font-size:13px;color:#e8ecf1;margin-bottom:8px;">Entry Zone: <b>' + esc(kl.suggestedEntryZone) + "</b> · Stop: <b>$" + kl.stopLoss.toFixed(2) + "</b> · Target: <b>$" + kl.targetPrice.toFixed(2) + "</b></div>" +
   '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
   '<div style="background:#0f2818;border-radius:8px;padding:12px;"><div style="font-size:12px;font-weight:700;color:#3fb950;margin-bottom:4px;">Bullish Case</div><div style="font-size:12px;color:#e8ecf1;">' + esc(ta.scenarios.bullishCase) + "</div></div>" +
   '<div style="background:#2a1215;border-radius:8px;padding:12px;"><div style="font-size:12px;font-weight:700;color:#f85149;margin-bottom:4px;">Bearish Case</div><div style="font-size:12px;color:#e8ecf1;">' + esc(ta.scenarios.bearishCase) + "</div></div>" +
   "</div>" +
   '<div style="font-size:12px;color:#a0a8b8;margin-top:8px;">Risk/Reward: <b>' + esc(ta.scenarios.riskRewardRatio) + "</b> · As of " + esc(ta.asOfDate) + "</div>" +
   "</div>";
 }

 /* Barchart-style Gamma Exposure by Strike chart.
   Bars: net GEX per strike (blue=positive/call-heavy, orange=negative/put-heavy).
   Line: aggregate (cumulative) GEX. Vertical markers: spot, zero gamma (flip),
   call wall, put wall. Background shading: green above flip, pink below. */
 let gexStrikeChart = null;
 // Registry for GEX strike chart data (drawn after HTML insertion)
 const gexStrikeChartData = {};
 const trendsData = {};
 function gexStrikeChartHtml(tk, d, chartId) {
  if (!d.strikes || !d.strikes.length) return '<p style="color:#e8ecf1">Strike-level data unavailable.</p>';
  const unit = d.gex_unit || "M";
  // Store data for later drawing
  gexStrikeChartData[chartId] = {
   strikes: d.strikes,
   agg: d.agg_curve || [],
   spot: d.spot,
   zero_gamma: d.zero_gamma,
   call_wall: d.call_wall,
   put_wall: d.put_wall,
   unit: unit,
  };
  return '<div class="zoomable-chart" style="position:relative;margin:12px 0;cursor:zoom-in;" title="Click to zoom">' +
   '<canvas id="' + chartId + '" style="max-height:380px;"></canvas>' +
   '<div style="position:absolute;top:8px;right:10px;font-size:11px;color:#e8ecf1;background:rgba(19,23,34,0.8);padding:2px 8px;border-radius:4px;">⛶ click to zoom</div></div>' +
   '<div style="font-size:12px;color:#e8ecf1;text-align:center;margin-bottom:8px;">' +
   '<span style="color:#2f6fed;">■</span> Net GEX by strike &nbsp; ' +
   '<span style="color:#58a6ff;"> - </span> Aggregate GEX &nbsp; ' +
   '<span style="color:#3fb950;"> - </span> Spot $' + d.spot.toFixed(2) + ' &nbsp; ' +
   '<span style="color:#f85149;"> - </span> Gamma flip $' + (d.zero_gamma != null ? d.zero_gamma.toFixed(2) : " - ") +
   "</div>";
 }

 /* Embed visuals into Market Analysis reports.
   The report HTML contains <div data-embed-visual="key"></div> placeholders.
   Supported keys: fed-funds, macro, gex, skew */
 function embedAnalysisVisuals() {
  // Use requestAnimationFrame to ensure DOM reflow completes on iOS WebKit
  // before querying for placeholders
  requestAnimationFrame(async () => {
   // Ensure Pro data is loaded before attempting to embed visuals
   await ensureProData();
   let placeholders;
   try {
    // Query within the app container to avoid detached nodes from previous renders
    const container = document.getElementById("app") || document;
    placeholders = container.querySelectorAll("[data-embed-visual]");
   } catch (e) {
    console.error("Visual placeholder query failed:", e);
    return;
   }
   if (!placeholders.length) return;
   // Gemini's diagnostic patch: shows the real reason on screen
   // Uses simple summary cards (nested tracker functions aren't in scope here)
   function renderVisual(el, key) {
    const gens = {
     "fed-funds": () => {
      const d = D.fed_funds;
      if (!d || !d.available) return null;
      return '<div class="card" style="padding:16px;"><h4>Fed Funds Futures</h4>' +
       '<p style="font-size:13px;">EFFR: ' + esc(d.effr || "-") + ' | Target: ' + esc(d.target_range || "-") + '</p>' +
       '<p style="font-size:12px;color:var(--muted);">See Market Internals for full probability table.</p></div>';
     },
     "macro": () => {
      const d = D.macro_indicators;
      if (!d) return null;
      const hist = d.history || [];
      const latest = hist[hist.length - 1] || {};
      return '<div class="card" style="padding:16px;"><h4>Macro Snapshot</h4>' +
       '<p style="font-size:13px;">CPI: ' + (latest.cpi_yoy != null ? latest.cpi_yoy.toFixed(1) + "%" : "-") +
       ' | PPI: ' + (latest.ppi_yoy != null ? latest.ppi_yoy.toFixed(1) + "%" : "-") +
       ' | PMI: ' + (latest.pmi != null ? latest.pmi.toFixed(1) : "-") + '</p>' +
       '<p style="font-size:12px;color:var(--muted);">See Market Internals for full chart.</p></div>';
     },
     "gex": () => {
      const d = D.gex_data;
      if (!d || !d.indices) return null;
      let h = '<div class="card" style="padding:16px;"><h4>Gamma Positioning</h4>';
      ["QQQ", "SPY"].forEach((idx) => {
       const g = d.indices[idx];
       if (g) {
        h += '<p style="font-size:13px;"><b>' + idx + ':</b> Spot $' + (g.spot != null ? g.spot.toFixed(2) : "-") +
         ' | Net GEX ' + (g.net_gex != null ? g.net_gex.toFixed(2) : "-") + '</p>';
       }
      });
      h += '<p style="font-size:12px;color:var(--muted);">See Market Internals for full GEX charts.</p></div>';
      return h;
     },
     "skew": () => {
      const d = D.skew_data;
      if (!d || !d.indices) return null;
      let h = '<div class="card" style="padding:16px;"><h4>Volatility Skew</h4>';
      ["QQQ", "SPY"].forEach((idx) => {
       const s = d.indices[idx];
       if (s) {
        h += '<p style="font-size:13px;"><b>' + idx + ':</b> Skew ' + (s.skew != null ? s.skew.toFixed(1) : "-") + '</p>';
       }
      });
      h += '<p style="font-size:12px;color:var(--muted);">See Market Internals for full skew charts.</p></div>';
      return h;
     }
    };
    try {
     const html = gens[key] ? gens[key]() : null;
     if (html == null) {
      const keys = PRO_DATA ? Object.keys(PRO_DATA).join(",") : "null";
      el.textContent = key + ": no data. connected=" + el.isConnected + " keys=" + keys;
      return;
     }
     el.innerHTML = html;
     // Draw charts after HTML insertion
     try {
      if (key === "macro") drawMacroSnapshot();
      if (key === "gex") drawGexStrikeCharts();
     } catch (drawErr) {
      console.error("Chart draw failed:", key, drawErr);
     }
    } catch (e) {
     el.textContent = key + " threw: " + (e && e.message ? e.message : e);
    }
   }
   placeholders.forEach((el) => {
    let key = null;
    try {
     key = el.getAttribute("data-embed-visual");
    } catch (e) {
     key = null;
    }
    if (!key) {
     el.innerHTML = '<p style="color:#e8ecf1;opacity:0.6;">Visual unavailable.</p>';
     return;
    }
    renderVisual(el, key);
   });
  });
 }

 /* Simplified macro chart snapshot for embedding in analysis reports */
 function drawMacroSnapshot() {
  const cv = document.getElementById("macro-chart");
  const d = D.macro_indicators;
  if (!cv || !d || !(d.history || []).length || typeof Chart === "undefined") return;
  if (cv.dataset.drawn) return;
  cv.dataset.drawn = "1";
  const hist = d.history;
  const labels = hist.map((r) => {
   const parts = (r.month || "").split("-");
   return parts.length === 2 ? ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(parts[1])-1] : r.month;
  });
  const series = [
   { key: "cpi_yoy", label: "CPI YoY %", color: "#7dd3fc" },
   { key: "ppi_yoy", label: "PPI YoY %", color: "#a5b4fc" },
   { key: "retail_mom", label: "Retail MoM %", color: "#22c55e" },
   { key: "pmi", label: "PMI", color: "#a3e635" },
  ];
  new Chart(cv, {
   type: "line",
   data: {
    labels: labels,
    datasets: series.map((s) => ({
     label: s.label,
     data: hist.map((r) => r[s.key]),
     borderColor: s.color,
     backgroundColor: s.color,
     borderWidth: 2, pointRadius: 2, tension: 0.3,
    })),
   },
   options: {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { labels: { color: "#e8ecf1", boxWidth: 12, font: { size: 11 } } } },
    scales: {
     x: { ticks: { color: "#e8ecf1", maxTicksLimit: 8 }, grid: { color: "rgba(255,255,255,0.06)" } },
     y: { ticks: { color: "#e8ecf1" }, grid: { color: "rgba(255,255,255,0.06)" } },
    },
   },
  });
 }

 function drawGexStrikeCharts() {
  if (typeof Chart === "undefined") return;
  Object.keys(gexStrikeChartData).forEach((chartId) => {
   const ctx = document.getElementById(chartId);
   if (!ctx) return;
   // Don't redraw if already has a chart
   if (ctx.dataset.gexDrawn) return;
   ctx.dataset.gexDrawn = "1";
   const d = gexStrikeChartData[chartId];
   const labels = d.strikes.map((s) => s.strike);
   const barData = d.strikes.map((s) => s.net_gex);
   const barColors = d.strikes.map((s) => s.net_gex >= 0 ? "#2f6fed" : "#f0a030");
   const aggMap = {};
   d.agg.forEach((a) => { aggMap[a.strike] = a.agg_gex; });
   const aggData = labels.map((k) => aggMap[k] !== undefined ? aggMap[k] : null);
   const ann = {};
   if (d.spot != null) ann.spot = { type: "line", xMin: d.spot, xMax: d.spot, borderColor: "#3fb950", borderWidth: 2, label: { display: true, content: "Spot", position: "start", color: "#3fb950", font: { size: 10 } } };
   if (d.zero_gamma != null) ann.flip = { type: "line", xMin: d.zero_gamma, xMax: d.zero_gamma, borderColor: "#f85149", borderWidth: 2, borderDash: [6, 4], label: { display: true, content: "Flip", position: "start", color: "#f85149", font: { size: 10 } } };
   if (d.call_wall != null) ann.cwall = { type: "line", xMin: d.call_wall, xMax: d.call_wall, borderColor: "#3fb950", borderWidth: 1, borderDash: [3, 3], label: { display: true, content: "C wall", position: "end", color: "#3fb950", font: { size: 9 } } };
   if (d.put_wall != null) ann.pwall = { type: "line", xMin: d.put_wall, xMax: d.put_wall, borderColor: "#f85149", borderWidth: 1, borderDash: [3, 3], label: { display: true, content: "P wall", position: "end", color: "#f85149", font: { size: 9 } } };
   new Chart(ctx, {
    type: "bar",
    data: { labels: labels, datasets: [
     { type: "bar", label: "Net GEX by strike (" + d.unit + ")", data: barData, backgroundColor: barColors, borderWidth: 0, barPercentage: 0.9, categoryPercentage: 0.9, yAxisID: "y" },
     { type: "line", label: "Aggregate GEX (" + d.unit + ")", data: aggData, borderColor: "#58a6ff", borderWidth: 2, pointRadius: 0, tension: 0.3, yAxisID: "y1" },
    ]},
    options: {
     responsive: true, maintainAspectRatio: true, interaction: { mode: "index", intersect: false },
     plugins: {
      legend: { labels: { color: "#e8ecf1", boxWidth: 12, font: { size: 11 } } },
      tooltip: { callbacks: { label: (c) => {
       const s = d.strikes[c.dataIndex];
       if (!s) return "";
       return " Net: " + s.net_gex + d.unit + " (C +" + s.call_gex + d.unit + " / P " + s.put_gex + d.unit + ") · OI " + s.total_oi.toLocaleString();
      }}},
      annotation: { annotations: ann },
     },
     scales: {
      x: { title: { display: true, text: "Strike Price", color: "#e8ecf1" }, ticks: { color: "#e8ecf1", maxTicksLimit: 12 }, grid: { color: "rgba(255,255,255,0.06)" } },
      y: { title: { display: true, text: "Net GEX (" + d.unit + ")", color: "#e8ecf1" }, ticks: { color: "#e8ecf1" }, grid: { color: "rgba(255,255,255,0.06)" } },
      y1: { position: "right", title: { display: true, text: "Aggregate (" + d.unit + ")", color: "#58a6ff" }, ticks: { color: "#58a6ff" }, grid: { drawOnChartArea: false } },
     },
    },
   });
  });
 }

 /* ---------- artifact news layout ---------- */
 function fmtTs(ts) {
  if (!ts) return "";
  try {
   const p = {};
   new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(new Date(ts))
    .forEach((x) => { p[x.type] = x.value; });
   return p.month + " " + p.day + " at " + p.hour + ":" + p.minute + " " + p.dayPeriod + " PDT";
  } catch (e) { return ""; }
 }
 function newsRow(o) {
  const badgeHtml = o.badge
   ? '<a href="#/ticker/' + esc(o.badge) + '" class="tk-badge" data-tk-link style="text-decoration:none;cursor:pointer;" onclick="event.stopPropagation()">' + esc(o.badge) + "</a>"
   : "";
  const headHtml = o.url
   ? '<a href="' + esc(o.url) + '" target="_blank" rel="noopener" class="news-h" style="text-decoration:none;color:inherit;cursor:pointer;" onclick="event.stopPropagation()">' + esc(o.headline) + "</a>"
   : '<div class="news-h">' + esc(o.headline) + "</div>";
  return '<div class="news-row">' +
   "<div>" + badgeHtml + "</div>" +
   "<div>" + headHtml +
   (o.sub ? '<div class="news-sub">' + esc(o.sub) + "</div>" : "") + "</div>" +
   '<div class="news-ts">' + esc(o.ts) + " ·<br>" + esc(o.source) + "</div></div>";
 }
 function newsSection(id, label, title, tags, rowsHtml) {
  return '<section class="news-sec" id="' + id + '">' +
   '<div class="news-sec-head"><div><div class="mono-label">' + esc(label) + "</div>" +
   '<div class="news-sec-title">' + esc(title) + "</div></div>" +
   (tags ? '<div class="news-sec-tags">' + esc(tags) + "</div>" : "") + "</div>" +
   '<div class="news-scroll">' +
   (rowsHtml || '<div class="news-empty">No recent items.</div>') + "</div></section>";
 }

 /* ---------- shared bits ---------- */
 function tickerLink(tk) { return '<a href="#/ticker/' + esc(tk) + '">' + esc(tk) + "</a>"; }
 function earningsCalRows() {
  const cal = D.earnings_calendar || {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rows = [];
  const tbd = [];
  Object.keys(cal).forEach((tk) => {
   const ds = cal[tk];
   if (!ds || !/^\d{4}-\d{2}-\d{2}$/.test(ds)) { tbd.push(tk); return; }
   const d = new Date(ds + "T12:00:00");
   const days = Math.round((d - today) / 86400000);
   if (days < 0) return; // past dates drop off
   const t = (TICKERS[tk] || {});
   rows.push({ tk: tk, name: t.name || tk, date: ds, days: days });
  });
  rows.sort((a, b) => a.days - b.days || (a.tk < b.tk ? -1 : 1));
  let h = "";
  rows.forEach((r) => {
   const d = new Date(r.date + "T12:00:00");
   const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
   let cd;
   if (r.days === 0) cd = '<span class="earn-today">today</span>';
   else if (r.days === 1) cd = "tomorrow";
   else cd = "in " + r.days + " days";
   const urgent = r.days <= 7 ? ' class="earn-soon"' : "";
   h += '<tr><td><span class="ticker-cell">' + tickerLink(r.tk) + "</span></td>" +
    "<td>" + esc(r.name) + "</td><td>" + esc(dateStr) + "</td>" +
    "<td" + urgent + ">" + cd + "</td></tr>";
  });
  tbd.sort().forEach((tk) => {
   const t = (TICKERS[tk] || {});
   h += '<tr><td><span class="ticker-cell">' + tickerLink(tk) + "</span></td>" +
    "<td>" + esc(t.name || tk) + '</td><td class="earn-tbd">TBD</td><td class="earn-tbd"> - </td></tr>';
  });
  return h || '<tr><td colspan="4">No upcoming earnings dates.</td></tr>';
 }
 function ratingCls(r) {
  r = String(r || "").toLowerCase();
  if (r.startsWith("strong buy")) return "rating-strong-buy";
  if (r.startsWith("buy")) return "rating-buy";
  if (r.startsWith("sell")) return "rating-sell";
  return "rating-hold";
 }

 /* ================= HOME ================= */
 route("home", function () {
  const macro = (D.macro_feed || []).filter((m) => m.url).slice(0, 14);
  const news = (D.company_news || []).filter((n) => n.url).slice(0, 12);
  const panels = D.panels || [];

  let h = '<div class="crumb">MACRO INTELLIGENCE · DCF COVERAGE</div>';
  h += '<div class="hero"><div>' +
   '<h1 class="hero-h" style="color:var(--gold);">The signals moving markets, in one research view.</h1>' +
   "<p class='hero-sub' style=\"color:var(--gold);opacity:0.85;\">Track macro releases and central-bank commentary, gauge market risk across nine quantitative models, " +
   "screen 500+ stocks on quality and momentum factors, then move directly into company valuation work across " + ORDER.length + " DCF-covered names.</p></div>" +
   '<div class="hero-right">' +
   '<div class="statbox"><div class="mono-label">Coverage</div><div class="statbox-v">' + ORDER.length + " DCF models</div></div>" +
   '<div class="statbox"><div class="mono-label">Macro wire</div><div class="statbox-v">Newest first</div></div>' +
   "</div></div>";
  h += '<div class="hero-btns">' +
   '<button class="btn-gold" id="btn-browse">Browse ticker coverage ↓</button>' +
   '<a href="#/monitor" class="btn-gold" id="btn-internals" style="text-decoration:none;display:inline-block;">Open Market Internals ↓</a></div>';

  // company news, artifact layout
  h += newsSection("cn-sec", "SINGLE-COMPANY WIRE", "Company News", "Offerings · Regulation · Contracts",
   news.length ? news.map((m) => newsRow({
    badge: m.ticker, headline: m.headline, sub: m.summary, ts: fmtTs(m.timestamp), source: m.source, url: m.url
   })).join("") : "");

  // macro wire, artifact layout
  h += newsSection("macro-sec", "MACRO WIRE", "Macro Wire", "Rates · Inflation · Geopolitics",
   macro.length ? macro.map((m) => newsRow({
    badge: "", headline: m.headline, sub: m.detail, ts: fmtTs(m.timestamp), source: m.source, url: m.url
   })).join("") : "");

  // market performance (Seeking Alpha: ETFs, index moves, market wraps)
  const perf = (D.market_performance || []).filter((n) => n.url).slice(0, 10);
  if (perf.length) {
   h += newsSection("perf-sec", "MARKET PERFORMANCE", "Market Performance", "ETFs · Index Moves · Market Wraps",
    perf.map((m) => newsRow({
     badge: "", headline: m.headline, sub: "", ts: fmtTs(m.timestamp), source: m.source || "Seeking Alpha", url: m.url
    })).join(""));
  }


  // upcoming earnings
  h += '<div class="section" id="earnings-cal-sec"><div class="section-title">Upcoming Earnings</div>' +
   '<div class="section-sub">Next reported earnings date per covered name, soonest first.</div>' +
   '<div class="table-wrap"><table class="coverage earn-cal"><thead><tr>' +
   "<th>Ticker</th><th>Company</th><th>Earnings Date</th><th>Countdown</th>" +
   "</tr></thead><tbody>" + earningsCalRows() + "</tbody></table></div></div>";

  // coverage table
  h += '<div class="section" id="coverage-sec"><div class="section-title">Coverage</div>' +
   '<div class="section-sub">' + ORDER.length + " names · click a row for full research · prices as of " + esc(refreshTs(TICKERS[ORDER[0]])) + "</div>" +
   '<div class="table-wrap"><table class="coverage"><thead><tr>' +
   "<th>Ticker</th><th>Price</th><th>Bear</th><th>Base</th><th>Bull</th><th>Blended</th><th>Upside</th><th>Rating</th>" +
   "</tr></thead><tbody>";
  h += ORDER.map((tk) => {
   const t = TICKERS[tk];
   return '<tr data-tk="' + esc(tk) + '"><td><a href="#/ticker/' + esc(tk) + '" class="ticker-cell" style="text-decoration:none;">' + esc(tk) + "</a></td>" +
    '<td>' + fmt$(t.price) + '<div style="font-size:10px;color:var(--muted);">' + esc(refreshTs(t)) + "</div></td>" +
    "<td>" + fmt$(t.bear, 0) + "</td><td>" + fmt$(t.base, 0) +
    "</td><td>" + fmt$(t.bull, 0) + "</td><td>" + fmt$(t.blended, 0) + "</td>" +
    '<td class="' + upsideCls(t.upside_base) + '">' + fmtPct(t.upside_base) + "</td>" +
    '<td class="' + ratingCls(t.rating) + '">' + esc(t.rating || " - ") + "</td></tr>";
  }).join("");
  h += "</tbody></table></div></div>";

  app.innerHTML = h;
  app.querySelectorAll("tr[data-tk]").forEach((tr) =>
   tr.addEventListener("click", () => nav("ticker/" + tr.dataset.tk)));
  // News rows use inline links: ticker badge -> ticker page, headline -> external article.
  // No row-level handlers needed.
  const bb = document.getElementById("btn-browse");
  if (bb) bb.addEventListener("click", () => document.getElementById("coverage-sec").scrollIntoView({ behavior: "smooth" }));
  // btn-internals is now a direct <a href="#/monitor"> link, no JS handler needed
 });

 /* ---------- Market Leadership HTML (Pro-gated) ---------- */
 function leadershipHtml(d) {
  if (!d || !d.available || !(d.leaders || []).length) {
   return '<div class="card"><p style="color:var(--muted)">No leadership data available.</p></div>';
  }
  let h = '<div class="card"><h3>Market Leadership <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></h3>';
  h += '<div style="font-size:12px;color:var(--muted);margin-bottom:10px;">Top ' + d.leaders.length + ' leaders from ' + (d.universe_size || "S&P 500") + ' stocks · As of ' + esc((d.as_of || "").slice(0, 10)) + '</div>';
  h += '<div class="table-wrap"><table class="coverage"><thead><tr>' +
   '<th>Ticker</th><th>Name</th><th>Sector</th><th>MLS</th><th title="Relative Strength percentile vs S&P 500 (0-100)">RS Pctl</th><th>Trend</th><th>Price</th><th>vs 50-day</th>' +
   '</tr></thead><tbody>';
  d.leaders.forEach((l) => {
   const vsSma = l.sma50 ? ((l.price / l.sma50 - 1) * 100) : null;
   const vsCls = vsSma == null ? "" : (vsSma >= 0 ? "pos" : "neg");
   // Show RS percentile (more differentiated than capped rs_score)
   const rsDisplay = l.rs_percentile != null ? l.rs_percentile.toFixed(1) : (l.rs_score != null ? l.rs_score : "-");
   h += '<tr><td><b>' + esc(l.ticker) + '</b></td>' +
    '<td>' + esc(l.name || "") + '</td>' +
    '<td style="font-size:11px;">' + esc(l.sector || "") + '</td>' +
    '<td class="pos"><b>' + (l.mls != null ? l.mls.toFixed(1) : "-") + '</b></td>' +
    '<td>' + rsDisplay + '</td>' +
    '<td>' + (l.trend_score != null ? l.trend_score.toFixed(1) : "-") + '</td>' +
    '<td>' + fmt$(l.price) + '</td>' +
    '<td class="' + vsCls + '">' + (vsSma == null ? "-" : (vsSma >= 0 ? "+" : "") + vsSma.toFixed(1) + "%") + '</td></tr>';
  });
  h += '</tbody></table></div>';
  // Rotation signals
  const rots = d.rotations || [];
  if (rots.length) {
   h += '<div style="margin-top:12px;"><div style="font-size:13px;font-weight:600;margin-bottom:6px;">Rotation Signals</div>';
   rots.slice(0, 5).forEach((r) => {
    const actionColor = r.action === "ADDED" ? "pos" : (r.action === "REMOVED" ? "neg" : "");
    h += '<div style="font-size:12px;margin-bottom:4px;"><span class="' + actionColor + '"><b>' + esc(r.action) + '</b></span> ' +
     '<b>' + esc(r.ticker) + '</b> <span style="color:var(--muted);">' + esc(r.date || "") + ' · ' + esc(r.reason || "") + '</span></div>';
   });
   h += '</div>';
  }
  h += '<div class="panel-about"><p><b>What is this?</b> The Market Leadership Score (MLS) identifies the strongest stocks in the S&P 500 using relative strength, trend, and volume. ' +
   'Stocks scoring 85+ with RS percentile above 95 are flagged as leaders. New additions signal emerging strength; removals warn of fading momentum.</p></div>';
  h += '</div>';
  return h;
 }

 route("monitor", function () {
  try {
  const panels = D.panels || [];
  let h = '<div class="crumb">MARKET INTERNALS · VOLATILITY · MACRO</div>';
  h += '<div class="hero"><div>' +
   '<h1 class="hero-h">Market Internals.</h1>' +
   "<p class='hero-sub'>Breadth, positioning, volatility, and macro, the market\u2019s internal risk signals in one view.</p></div>" +
   '</div>';

  // market internals (Pro)
  h += '<div class="section" id="internals-sec"><div class="section-title">Market Internals</div>' +
   '<div class="section-sub">Breadth, valuation-vs-earnings, rotation, and credit signals.</div>';
  // AAII Investor Sentiment, FREE, at the top
  if (D.aaii_sentiment && D.aaii_sentiment.bullish != null) {
   h += aaiiSentimentHtml(D.aaii_sentiment);
  }
  // COT Positioning, FREE, at the top
  if (D.cot_data && D.cot_data.markets) {
   h += cotHtml(D.cot_data);
  }
  // FOMC Fed Funds Futures, FREE, updates every morning
  if (D.fed_funds && D.fed_funds.available) {
   h += fedFundsHtml(D.fed_funds);
  }
  // 10Y Breakeven Inflation, FREE, updates every morning
  if (D.breakeven_inflation && D.breakeven_inflation.latest != null) {
   h += breakevenHtml(D.breakeven_inflation);
  }
  // Implied ERP, FREE data + chart, PRO analysis
  if (D.implied_erp && D.implied_erp.erp != null) {
   h += erpHtml(D.implied_erp, isPro);
  }
  // Market Internals trackers - each individually Pro-locked with badge
  h += '<div class="section"><div class="section-title">Market Internals Trackers</div>' +
   '<div class="section-sub">Breadth, positioning, volatility, and rotation signals. Free users see previews below.</div></div>';
  h += '<div style="display:flex;flex-direction:column;gap:16px;">' + panels.map((p) => {
   try {
    let title = esc(p.name);
    if (/alligator/i.test(p.name)) {
     const isOpen = /jaw\s*open/i.test(p.summary || "");
     title = (isOpen ? "🔴 " : "🟢 ") + title;
    }
    // interactive VIX vs MOVE divergence tracker (live data, not static image)
    let chartHtml = "";
    if (/volatility divergence/i.test(p.name) && D.vol_div_history && (D.vol_div_history.history || []).length) {
     chartHtml = '<div class="zoomable-chart" data-chart="voldiv" style="position:relative;height:280px;margin-bottom:8px;cursor:zoom-in;" title="Click to zoom"><canvas id="voldiv-chart"></canvas>' +
      '<div style="position:absolute;top:8px;right:10px;font-size:11px;color:#e8ecf1;background:rgba(19,23,34,0.8);padding:2px 8px;border-radius:4px;">⛶ click to zoom</div></div>';
    } else if (/alligator/i.test(p.name) && D.jaw_history && (D.jaw_history.history || []).length) {
     chartHtml = '<div class="zoomable-chart" data-chart="jaw" style="position:relative;height:280px;margin-bottom:8px;cursor:zoom-in;" title="Click to zoom"><canvas id="jaw-chart"></canvas>' +
      '<div style="position:absolute;top:8px;right:10px;font-size:11px;color:#e8ecf1;background:rgba(19,23,34,0.8);padding:2px 8px;border-radius:4px;">⛶ click to zoom</div></div>';
    } else if (/theme rotation/i.test(p.name) && D.theme_rot_history && (D.theme_rot_history.history || []).length) {
     chartHtml = '<div class="zoomable-chart" data-chart="themerot" style="position:relative;height:280px;margin-bottom:8px;cursor:zoom-in;" title="Click to zoom"><canvas id="themerot-chart"></canvas>' +
      '<div style="position:absolute;top:8px;right:10px;font-size:11px;color:#e8ecf1;background:rgba(19,23,34,0.8);padding:2px 8px;border-radius:4px;">⛶ click to zoom</div></div>';
    } else if (/small.*mid|mid.*cap/i.test(p.name) && D.smcap_history && (D.smcap_history.history || []).length) {
     chartHtml = '<div class="zoomable-chart" data-chart="smcap" style="position:relative;height:280px;margin-bottom:8px;cursor:zoom-in;" title="Click to zoom"><canvas id="smcap-chart"></canvas>' +
      '<div style="position:absolute;top:8px;right:10px;font-size:11px;color:#e8ecf1;background:rgba(19,23,34,0.8);padding:2px 8px;border-radius:4px;">⛶ click to zoom</div></div>';
    } else if (/credit spread/i.test(p.name) && D.credit_vol_history && (D.credit_vol_history.history || []).length) {
     chartHtml = '<div class="zoomable-chart" data-chart="creditvol" style="position:relative;height:280px;margin-bottom:8px;cursor:zoom-in;" title="Click to zoom"><canvas id="creditvol-chart"></canvas>' +
      '<div style="position:absolute;top:8px;right:10px;font-size:11px;color:#e8ecf1;background:rgba(19,23,34,0.8);padding:2px 8px;border-radius:4px;">⛶ click to zoom</div></div>';
    } else if (/market breadth/i.test(p.name) && D.breadth_history && (D.breadth_history.history || []).length) {
     chartHtml = '<div class="zoomable-chart" data-chart="breadth" style="position:relative;height:280px;margin-bottom:8px;cursor:zoom-in;" title="Click to zoom"><canvas id="breadth-chart"></canvas>' +
      '<div style="position:absolute;top:8px;right:10px;font-size:11px;color:#e8ecf1;background:rgba(19,23,34,0.8);padding:2px 8px;border-radius:4px;">⛶ click to zoom</div></div>';
     // 52-week highs/lows: 10d, 21d (1mo), 63d (3mo), trend view
     const bh = D.breadth_history;
     if (bh && bh.current && bh.current.new_highs_10d != null) {
      const cur = bh.current;
      const row = (label, nh, nl, net) => {
       const netColor = net >= 0 ? "#3fb950" : "#f85149";
       const total = nh + nl;
       const nhPct = total > 0 ? (nh / total * 100).toFixed(0) : 50;
       return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">' +
        '<span style="font-size:11px;color:#e8ecf1;width:70px;">' + label + "</span>" +
        '<div style="flex:1;height:20px;border-radius:4px;overflow:hidden;display:flex;border:1px solid #2a3448;">' +
        '<div style="width:' + nhPct + '%;background:#3fb950;"></div>' +
        '<div style="flex:1;background:#f85149;"></div></div>' +
        '<span style="font-size:12px;color:#3fb950;min-width:52px;text-align:right;">' + nh + "H</span>" +
        '<span style="font-size:12px;color:#f85149;min-width:52px;text-align:right;">' + nl + "L</span>" +
        '<span style="font-size:13px;font-weight:700;color:' + netColor + ';min-width:56px;text-align:right;">' + (net >= 0 ? "+" : "") + net + "</span></div>";
      };
      chartHtml += '<div style="margin:8px 0;padding:10px;background:#1a2030;border-radius:8px;">' +
       '<div style="font-size:11px;color:#e8ecf1;margin-bottom:8px;">52-WEEK HIGHS vs LOWS <span style="opacity:0.6;"> - trend across timeframes</span></div>' +
       row("10-day", cur.new_highs_10d, cur.new_lows_10d, cur.hl_net_10d) +
       row("1-month", cur.new_highs_21d, cur.new_lows_21d, cur.hl_net_21d) +
       row("3-month", cur.new_highs_63d, cur.new_lows_63d, cur.hl_net_63d) +
       "</div>";
     }
    } else if (p.chart) {
     chartHtml = '<img class="panel-chart" src="' + esc(p.chart) + '" alt="' + esc(p.name) + '" loading="lazy">';
    }
    // Explainer: visual first, then plain-English explanation of what the user is seeing
    const explainerHtml = trackerExplainer(p);
    const proBadge = ' <span style="font-size:10px;background:#7d4fc9;color:#fff;padding:2px 7px;border-radius:4px;vertical-align:middle;">PRO</span>';
    const panelHtml = '<div class="card"><h3>' + title + proBadge + "</h3>" + chartHtml + explainerHtml +
    (p.about ? '<div class="panel-about">' + esc(p.about) + "</div>" : "") +
    '<div class="panel-summary">' + esc(p.summary || "") + "</div>" +
    '<div class="panel-asof">As of ' + esc((p.as_of || "").slice(0, 10)) + (p.stale ? " · stale" : "") + "</div></div>";
    // Each tracker individually Pro-locked. Free users get a generic teaser, never real data.
    const teaserDesc = {
     "Market Breadth": "Advance/decline trends, new highs vs lows, and what participation says about rally health.",
     "Volatility Divergence": "When volatility and price disagree, reversals often follow. See where they stand.",
     "Credit Spreads vs VIX": "Bond market stress vs stock market calm. Divergences warn of coming repricing.",
     "Alligator Jaw": "Price vs earnings revision momentum. Open jaws have preceded every major drawdown.",
     "Theme Rotation": "Which market themes are leading and fading, updated daily.",
     "Small/Mid Cap": "Breadth beyond the mega-caps. When small caps lag, rallies are fragile.",
    }[p.name] || "Pro market internals tracker";
    return gated(p.name, teaserDesc, panelHtml);
   } catch (panelErr) {
    console.error("Panel render failed:", p.name, panelErr);
    return '<div class="card"><p style="color:#f85149;">Failed to load ' + esc(p.name) + '</p></div>';
   }
   }).join("") + "</div>";

  /* ---------- tracker explainers (visual first, explanation after) ---------- */
  /* ---------- GEX tracker HTML (Pro-gated) ---------- */
  /* ---------- Global Liquidity Tracker HTML (Pro-gated) ---------- */
  function liquidityHtml() {
   const L = D.liquidity || {};
   if (!L.total_score && L.total_score !== 0) return '<p style="color:var(--muted)">Liquidity data unavailable.</p>';
   const colorMap = { green: "#3fb950", amber: "#d29922", red: "#f85149" };
   const c = colorMap[L.color] || "#e8ecf1";
   const m = L.metrics || {};
   let h = '<div style="display:flex;align-items:center;gap:16px;margin:12px 0;padding:16px;border-radius:12px;background:rgba(255,255,255,0.02);border:1px solid #2a3448;">' +
    '<div style="text-align:center;min-width:90px;"><div style="font-size:11px;color:#8b949e;letter-spacing:0.5px;">SCORE</div>' +
    '<div style="font-size:36px;font-weight:800;color:' + c + ';">' + L.total_score + '<span style="font-size:16px;color:#8b949e;">/100</span></div></div>' +
    '<div><div style="font-size:14px;font-weight:700;color:' + c + ';">' + esc(L.regime || "") + "</div>" +
    '<div style="font-size:12px;color:#8b949e;margin-top:4px;">Net liquidity $' + (m.net_liquidity_b != null ? m.net_liquidity_b.toLocaleString() : "-") + "B" +
    (m.net_liquidity_4w_change_b != null ? ' (' + (m.net_liquidity_4w_change_b >= 0 ? "+" : "") + m.net_liquidity_4w_change_b + "B 4W)" : "") + "</div></div>" +
    "</div>";
   // 4-factor breakdown
   h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0;">';
   (L.score_breakdown || []).forEach((b) => {
    const bc = b.points > 0 ? "#3fb950" : "#f85149";
    h += '<div style="background:#161b26;border-radius:10px;padding:12px;border-left:3px solid ' + bc + ';">' +
     '<div style="font-size:12px;font-weight:600;color:#e8ecf1;">' + esc(b.metric) + "</div>" +
     '<div style="font-size:11px;color:' + bc + ';margin-top:2px;font-weight:600;">' + esc(b.status) + " (" + b.points + " pts)</div>" +
     '<div style="font-size:11px;color:#8b949e;margin-top:2px;">' + esc(b.value) + "</div>" +
     (b.detail ? '<div style="font-size:11px;color:#8b949e;margin-top:2px;font-style:italic;">' + esc(b.detail) + "</div>" : "") +
     "</div>";
   });
   h += "</div>";
   // Fed balance sheet decomposition
   h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:12px 0;">' +
    '<div style="text-align:center;"><div style="font-size:11px;color:#8b949e;">FED ASSETS</div><div style="font-size:16px;font-weight:700;color:#e8ecf1;">$' + (m.fed_assets_b != null ? m.fed_assets_b.toLocaleString() : "-") + "B</div></div>" +
    '<div style="text-align:center;"><div style="font-size:11px;color:#8b949e;">TGA</div><div style="font-size:16px;font-weight:700;color:#e8ecf1;">$' + (m.tga_b != null ? m.tga_b.toLocaleString() : "-") + "B</div></div>" +
    '<div style="text-align:center;"><div style="font-size:11px;color:#8b949e;">REVERSE REPO</div><div style="font-size:16px;font-weight:700;color:#e8ecf1;">$' + (m.rrp_b != null ? m.rrp_b.toLocaleString() : "-") + "B</div></div>" +
    "</div>";
   // Net liquidity history chart (simple bars)
   if (L.history && L.history.length > 10) {
    const hist = L.history.slice(-60);
    const vals = hist.map(x => x.net_liquidity_b);
    const mn = Math.min(...vals), mx = Math.max(...vals);
    h += '<div style="margin:12px 0;"><div style="font-size:11px;color:#8b949e;margin-bottom:6px;">NET US LIQUIDITY, LAST 60 SESSIONS ($B)</div>' +
     '<div style="display:flex;align-items:flex-end;gap:1px;height:70px;">' +
     hist.map(x => {
      const ht = 8 + ((x.net_liquidity_b - mn) / Math.max(1, mx - mn) * 58);
      return '<div title="' + x.date + ": $" + x.net_liquidity_b.toLocaleString() + 'B" style="flex:1;background:#58a6ff;height:' + ht.toFixed(0) + 'px;border-radius:1px;min-width:2px;opacity:0.8;"></div>';
     }).join("") + "</div></div>";
   }
   // Explainer card: why liquidity matters
   h += '<div class="panel-about" style="text-align:left;max-width:none;margin:16px 0;">' +
    '<div style="font-size:13px;font-weight:700;color:#e8ecf1;margin-bottom:8px;">Why global liquidity matters</div>' +
    '<div style="font-size:12px;color:#8b949e;line-height:1.6;">' +
    '<p style="margin:0 0 8px;">On an institutional desk, the saying goes: earnings drive single stocks, but liquidity drives the market. Since 2008, asset prices have tracked central bank balance sheets more than fundamentals.</p>' +
    '<p style="margin:0 0 8px;"><b style="color:#e8ecf1;">The multiple expansion engine:</b> abundant liquidity means cheap capital. Institutions lever up and push cash out the risk curve, expanding P/E multiples across the board.</p>' +
    '<p style="margin:0 0 8px;"><b style="color:#e8ecf1;">The dollar wrecking ball:</b> the world runs on dollars. A strong DXY tightens financial conditions globally, choking emerging markets and multinationals on expensive USD debt.</p>' +
    '<p style="margin:0 0 8px;"><b style="color:#e8ecf1;">Stealth QE:</b> true net US liquidity = Fed assets minus the Treasury General Account minus reverse repo. Even during QT, a draining TGA or RRP can push net liquidity higher, sparking stealth bull markets.</p>' +
    '<p style="margin:0;"><b style="color:#e8ecf1;">Desk rule of thumb:</b> scores of 75+ mean structural tailwinds favor risk assets (expand exposure, buy dips). Scores of 25 or below mean contraction (tighten stops, favor defensives, hold cash).</p>' +
    "</div></div>";
   h += '<div class="panel-asof">As of ' + esc(L.as_of || "") + " · Sources: FRED (WALCL, WTREGEN, RRPONTSYD), Yahoo Finance (DXY, VIX, HYG, IEF)</div>";
   return h;
  }

  /* ---------- Macroeconomic Analysis HTML (Pro-gated) ---------- */
  function macroAnalysisHtml(d) {
   const hist = d.history || [];
   const first = hist[0] || {};
   const latest = hist[hist.length - 1] || {};
   // Metric cards (latest print values)
   const latestLabel = latest.month ? latest.month.slice(5) + " Print" : "Latest";
   const metrics = [
    { key: "pmi", label: "Manufacturing PMI", value: latest.pmi != null ? latest.pmi.toFixed(1) : " - ",
     tag: "Leading", color: "#a3e635", raw: latest.pmi },
    { key: "ppi_yoy", label: "PPI (Producer Price)", value: latest.ppi_yoy != null ? "+" + latest.ppi_yoy.toFixed(1) + "%" : " - ",
     tag: "Leading", color: "#a5b4fc", raw: latest.ppi_yoy },
    { key: "retail_mom", label: "Retail Sales", value: latest.retail_mom != null ? (latest.retail_mom >= 0 ? "+" : "") + latest.retail_mom.toFixed(1) + "%" : " - ",
     tag: "Coincident", color: "#22c55e", raw: latest.retail_mom },
    { key: "cpi_yoy", label: "CPI (Consumer Price)", value: latest.cpi_yoy != null ? "+" + latest.cpi_yoy.toFixed(1) + "%" : " - ",
     tag: "Lagging", color: "#7dd3fc", raw: latest.cpi_yoy },
    { key: "wti_crude", label: "WTI Crude", value: latest.wti_crude != null ? "$" + latest.wti_crude.toFixed(0) : " - ",
     tag: "Energy", color: "#f5a623", raw: latest.wti_crude },
    { key: "gasoline_retail", label: "Gasoline (Retail)", value: latest.gasoline_retail != null ? "$" + latest.gasoline_retail.toFixed(2) : " - ",
     tag: "Energy", color: "#ff6b6b", raw: latest.gasoline_retail },
    { key: "diesel_retail", label: "Diesel (Retail)", value: latest.diesel_retail != null ? "$" + latest.diesel_retail.toFixed(2) : " - ",
     tag: "Energy", color: "#c44dff", raw: latest.diesel_retail },
   ];
   const cardsHtml = metrics.map((m) =>
    '<div style="background:#161b26;border-radius:10px;padding:14px;flex:1;min-width:140px;">' +
    '<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#e8ecf1;">' + esc(m.label) +
    '<span style="width:8px;height:8px;border-radius:50%;background:' + m.color + ';display:inline-block;"></span></div>' +
    '<div style="font-size:22px;font-weight:700;color:#fff;margin:4px 0;">' + m.value + "</div>" +
    '<div style="font-size:11px;color:#e8ecf1;opacity:0.6;">' + latestLabel + ' • ' + m.tag + "</div></div>"
   ).join("");
   // Toggle pills
   const pillsHtml = metrics.map((m, i) =>
    '<button data-macro-idx="' + i + '" style="display:inline-flex;align-items:center;gap:8px;background:#1e3a5f;border:1px solid #2a4a73;color:#e8ecf1;' +
    'border-radius:20px;padding:8px 16px;margin:4px;font-size:13px;cursor:pointer;">' +
    '<span style="width:22px;height:22px;border-radius:50%;background:' + m.color + ';display:inline-block;"></span>' +
    esc(m.label) + "</button>"
   ).join("");
   // Analyst report (right-hand side), scrollable with history
   const reportHistory = d.report_history || [];
   const latestReport = reportHistory[reportHistory.length - 1] || {};
   const reportOpts = reportHistory.map((r, i) =>
    '<option value="' + i + '"' + (i === reportHistory.length - 1 ? " selected" : "") + ">" +
    esc(r.date || "") + "</option>"
   ).join("");
   const reportSectionsHtml = (latestReport.report && latestReport.report.sections || []).map((s) =>
    '<div style="margin-bottom:14px;">' +
    '<div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:6px;">' + esc(s.heading) + "</div>" +
    '<div style="font-size:13px;color:#e8ecf1;opacity:0.85;line-height:1.6;">' + s.body + "</div></div>"
   ).join("");
   const reportHtml =
    '<div style="background:#161b26;border-radius:12px;padding:20px;display:flex;flex-direction:column;max-height:640px;">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">' +
    '<span style="font-size:14px;">📊</span>' +
    '<span style="font-size:15px;font-weight:700;color:#fff;">Macro Analyst Report</span></div>' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">' +
    '<span style="font-size:12px;color:#e8ecf1;opacity:0.7;">Report date:</span>' +
    '<select id="macro-report-date" style="background:#0f1420;color:#e8ecf1;border:1px solid #2a4a73;border-radius:6px;' +
    'padding:4px 8px;font-size:12px;cursor:pointer;max-width:200px;">' + reportOpts + "</select></div>" +
    '<div id="macro-report-body" style="overflow-y:auto;flex:1;padding-right:6px;">' +
    '<div id="macro-report-date-label" style="font-size:11px;color:#e8ecf1;opacity:0.6;margin-bottom:12px;">' +
    esc(latestReport.date || "") + (latestReport.data_through ? ", " + esc(latestReport.data_through) : "") + "</div>" +
    '<div id="macro-report-sections">' + reportSectionsHtml + "</div>" +
    "</div></div>" +
    '<script>window.__macroReportHistory = ' + JSON.stringify(reportHistory) + ';</script>';
   return '<div style="margin-bottom:12px;">' +
    '<h2 style="color:#fff;font-size:20px;margin:0 0 4px;">Economic Trends & Macro Indicators</h2>' +
    '<p style="color:#e8ecf1;opacity:0.6;font-size:13px;margin:0 0 16px;">Compare trends across CPI, PPI, Retail Sales & PMI to detect leading vs. lagging signals.</p>' +
    '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">' + cardsHtml + "</div>" +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start;">' +
    '<div style="background:#161b26;border-radius:12px;padding:20px;min-width:0;">' +
    '<div style="font-size:13px;color:#e8ecf1;margin-bottom:8px;">Metrics</div>' +
    '<div style="margin-bottom:16px;">' + pillsHtml + "</div>" +
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">' +
    '<span style="font-size:13px;color:#e8ecf1;">Scaling Mode</span>' +
    '<div style="margin-left:auto;display:flex;background:#0f1420;border-radius:20px;padding:3px;">' +
    '<button id="macro-norm-btn" style="background:#1e3a5f;color:#fff;border:0;border-radius:17px;padding:6px 16px;font-size:12px;cursor:pointer;">Normalized (0–100%)</button>' +
    '<button id="macro-raw-btn" style="background:transparent;color:#e8ecf1;opacity:0.6;border:0;border-radius:17px;padding:6px 16px;font-size:12px;cursor:pointer;">Raw Prints</button>' +
    "</div></div>" +
    '<div class="zoomable-chart" data-chart="macro" style="position:relative;height:320px;cursor:zoom-in;" title="Click to zoom"><canvas id="macro-chart"></canvas>' +
    '<div style="position:absolute;top:8px;right:10px;font-size:11px;color:#e8ecf1;background:rgba(19,23,34,0.8);padding:2px 8px;border-radius:4px;">⛶ click to zoom</div></div>' +
    '<div id="macro-legend" style="display:flex;justify-content:center;gap:20px;margin-top:12px;flex-wrap:wrap;"></div>' +
    "</div>" +
    reportHtml +
    "</div>" +
    '<div style="background:#161b26;border-radius:8px;padding:14px;margin-top:12px;">' +
    '<span style="font-size:13px;font-weight:700;color:#fff;">Leading Signal: </span>' +
    '<span style="font-size:13px;color:#e8ecf1;opacity:0.8;">Producer Price Inflation (PPI) peaked in June (2.6%) prior to the decelerating ' +
    'Consumer Price Inflation (CPI) downward trend, illustrating the classical pipeline transmission lag.</span>' +
    "</div></div>";
  }

  /* ---------- COT Positioning HTML (FREE) ---------- */
  function cotHtml(d) {
   const markets = d.markets || {};
   const order = ["SPX", "NDX"];
   const cards = order
    .map((k) => markets[k])
    .filter((m) => m)
    .map((m) => {
     const fmt = (n) => (n >= 0 ? "+" : "") + n.toLocaleString();
     const c = m.commercials, l = m.large_specs, s = m.small_specs;
     // Net positioning bars (as % of OI)
     const bar = (label, grp, color) => {
      const pct = Math.abs(grp.net_pct_oi);
      const w = Math.min(pct * 4, 100); // scale for visibility
      const dir = grp.net >= 0 ? "long" : "short";
      return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
       '<span style="font-size:11px;color:#e8ecf1;width:110px;">' + label + '</span>' +
       '<div style="flex:1;height:20px;background:#1a2030;border-radius:4px;position:relative;overflow:hidden;">' +
       '<div style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:#363c4e;"></div>' +
       '<div style="position:absolute;top:0;bottom:0;' +
       (grp.net >= 0 ? "left:50%;width:" + (w / 2) + "%;" : "right:50%;width:" + (w / 2) + "%;") +
       'background:' + color + ';display:flex;align-items:center;' +
       (grp.net >= 0 ? "justify-content:flex-start;padding-left:6px;" : "justify-content:flex-end;padding-right:6px;") +
       'font-size:10px;font-weight:700;color:#fff;white-space:nowrap;">' + fmt(grp.net) + "</div></div>" +
       '<span style="font-size:10px;color:#e8ecf1;width:70px;text-align:right;">net ' + dir + "</span></div>";
     };
     // Extreme badges
     const extBadge = (grp) => {
      const e = grp.extreme || "";
      if (e === "extreme_long") return ' <span style="font-size:10px;background:#f85149;color:#fff;padding:1px 6px;border-radius:3px;">EXTREME LONG</span>';
      if (e === "extreme_short") return ' <span style="font-size:10px;background:#f85149;color:#fff;padding:1px 6px;border-radius:3px;">EXTREME SHORT</span>';
      if (e === "elevated_long" || e === "elevated_short") return ' <span style="font-size:10px;background:#d29922;color:#000;padding:1px 6px;border-radius:3px;">ELEVATED</span>';
      return "";
     };
     // Smart money read
     let read;
     if (l.net < 0 && c.net < 0 && s.net > 0) {
      read = "Institutions net short, retail net long, classic contrarian setup. Smart money is hedged; dumb money is exposed.";
     } else if (l.net > 0 && c.net > 0) {
      read = "Both commercials and large specs net long, institutional conviction is bullish.";
     } else if (l.extreme === "extreme_long" || l.extreme === "extreme_short") {
      read = "<b style='color:#f85149'>Large specs at extreme positioning</b>, crowded trade, reversal risk elevated.";
     } else {
      read = "Positioning is mixed, no strong structural signal this week.";
     }
     return '<div class="card" style="margin-bottom:12px;"><h3>' + esc(m.name) + " Futures</h3>" +
      '<div style="margin:12px 0;">' +
      bar("Commercials 🏦", c, "#58a6ff") +
      bar("Large Specs 📊", l, "#c678dd") +
      bar("Small Specs 👥", s, "#d29922") +
      "</div>" +
      '<div style="font-size:12px;color:#c8d0dc;margin:8px 0;">' + read + "</div>" +
      '<div style="font-size:11px;color:#e8ecf1;">' +
      "Commercials" + extBadge(c) + " · Large Specs" + extBadge(l) + " · Small Specs" + extBadge(s) + "</div>" +
      '<div class="panel-asof">CFTC data as of ' + esc(d.report_date || "") + " (published Friday, 3-day lag)</div></div>";
    }).join("");
   return '<div class="card" style="margin-bottom:16px;"><h3>Commitments of Traders (COT) <span style="font-size:10px;background:#3fb950;color:#fff;padding:2px 7px;border-radius:4px;vertical-align:middle;">FREE</span></h3>' +
    '<div class="section-sub">Where is institutional capital positioned? Weekly CFTC futures data.</div>' +
    '<div class="zoomable-chart" data-chart="cot" style="position:relative;height:240px;margin-bottom:8px;cursor:zoom-in;" title="Click to zoom"><canvas id="cot-chart"></canvas>' +
    '<div style="position:absolute;top:8px;right:10px;font-size:11px;color:#e8ecf1;background:rgba(19,23,34,0.8);padding:2px 8px;border-radius:4px;">⛶ click to zoom</div></div>' +
    cards +
    '<div class="panel-about" style="text-align:left;max-width:none;margin:12px 0;">' +
    "<p><b>What is this?</b> The CFTC's weekly Commitments of Traders report reveals how three groups are positioned in futures: " +
    "<b style='color:#58a6ff'>Commercials</b> (hedgers, the \"smart money\", contrarian), " +
    "<b style='color:#c678dd'>Large Speculators</b> (hedge funds, trend followers), " +
    "<b style='color:#d29922'>Small Speculators</b> (retail, often wrong at turning points).</p>" +
    "<p><b>How swing traders use it.</b> When Large Specs hit multi-year extremes, the trend is crowded and ripe for reversal. " +
    "When Commercials quietly build extreme positions against the trend, they're front-running the turn. " +
    "Divergences (price makes new highs but specs reduce longs) signal a trap.</p>" +
    "<p><b>The lag:</b> Data is as of Tuesday, published Friday, use as a structural backdrop, not for timing entries.</p>" +
    "</div></div>";
  }

  /* ---------- Fed Funds Futures HTML (FREE) ---------- */
  /* ---------- 10Y Breakeven Inflation HTML (FREE) ---------- */
  function breakevenHtml(d) {
   const latest = d.latest, chg = d.change_bps || 0;
   const chgCls = chg > 0 ? "#3fb950" : chg < 0 ? "#f85149" : "#8b949e";
   const chgTxt = (chg >= 0 ? "+" : "") + chg.toFixed(1) + " bps";
   const cid = "breakeven-chart";
   // Reading: above 2.5% = elevated expectations, below 2% = disinflation fears
   const read = latest >= 2.5 ? "Elevated" : latest < 2.0 ? "Subdued" : "Anchored";
   const readCls = latest >= 2.5 ? "#f85149" : latest < 2.0 ? "#58a6ff" : "#3fb950";
   let h = '<div class="section"><div class="section-title">10Y Breakeven Inflation <span style="font-size:11px;background:#3fb950;color:#0d1117;padding:2px 8px;border-radius:4px;vertical-align:middle;font-weight:700;">FREE</span></div>';
   h += '<div class="card"><div style="display:flex;flex-wrap:wrap;gap:24px;align-items:baseline;margin-bottom:12px;">' +
    '<div><div style="font-size:11px;color:#8b949e;letter-spacing:0.5px;">LATEST READING</div>' +
    '<div style="font-size:36px;font-weight:700;color:#fff;font-family:monospace;">' + latest.toFixed(2) + '%</div></div>' +
    '<div><div style="font-size:11px;color:#8b949e;letter-spacing:0.5px;">DAY CHANGE</div>' +
    '<div style="font-size:20px;font-weight:700;color:' + chgCls + ';font-family:monospace;">' + chgTxt + '</div></div>' +
    '<div><div style="font-size:11px;color:#8b949e;letter-spacing:0.5px;">READING</div>' +
    '<div style="font-size:20px;font-weight:700;color:' + readCls + ';">' + read + '</div></div>' +
    '<div style="font-size:11px;color:#8b949e;">As of ' + esc(d.as_of || "") + ' · FRED T10YIE</div></div>' +
    '<div class="zoomable-chart" data-chart="breakeven" style="position:relative;height:300px;margin-bottom:8px;cursor:zoom-in;" title="Click to zoom"><canvas id="' + cid + '"></canvas>' +
    '<div style="position:absolute;top:8px;right:10px;font-size:11px;color:#e8ecf1;background:rgba(19,23,34,0.8);padding:2px 8px;border-radius:4px;">⛶ click to zoom</div></div>';
   // Explanation card
   h += '<div style="background:#161b26;border:1px solid #2a3448;border-radius:8px;padding:16px;margin-top:12px;">' +
    '<div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:8px;">What is this?</div>' +
    '<div style="font-size:13px;color:#e8ecf1;line-height:1.6;">' +
    'The <b>10-year breakeven inflation rate</b> is the market\'s implied average annual inflation expectation over the next 10 years. ' +
    'It is calculated as the 10-year nominal Treasury yield minus the 10-year TIPS (inflation-protected) real yield. ' +
    'When investors demand more compensation for expected inflation, the breakeven rate rises.</div>' +
    '<div style="font-size:13px;font-weight:700;color:#fff;margin:12px 0 8px;">Why it matters</div>' +
    '<div style="font-size:13px;color:#e8ecf1;line-height:1.6;">' +
    'Rising breakevens signal the bond market expects hotter inflation, which typically pressures growth-stock multiples and supports commodities, energy, and value. ' +
    'Falling breakevens signal disinflation fears, which favors long-duration growth. The Fed watches this closely: ' +
    'a breakeven persistently above 2.5% argues against rate cuts, while one sliding toward 2% or below gives the Fed room to ease. ' +
    'For equity positioning, compare the trend here against CPI prints: when breakevens lead CPI higher, inflation trades have room to run.</div>' +
    '<div style="font-size:11px;color:#8b949e;margin-top:8px;">Source: Federal Reserve Bank of St. Louis (FRED series T10YIE), updated every trading morning.</div></div>';
   h += '</div></div>';
   return h;
  }
  /* ---------- Implied ERP HTML (FREE data, PRO analysis) ---------- */
  function erpHtml(d, isPro) {
   const erp = d.erp, spx = d.spx, tenY = d.ten_y;
   const erpPct = (erp * 100).toFixed(2);
   // Reading: ERP vs history
   const read = erp >= 0.045 ? "Elevated" : erp < 0.03 ? "Compressed" : "Normal";
   const readCls = erp >= 0.045 ? "#f85149" : erp < 0.03 ? "#58a6ff" : "#3fb950";
   const cid = "erp-chart";
   let h = '<div class="section"><div class="section-title">Implied Equity Risk Premium <span style="font-size:11px;background:#3fb950;color:#0d1117;padding:2px 8px;border-radius:4px;vertical-align:middle;font-weight:700;">FREE</span></div>';
   h += '<div class="card"><div style="display:flex;flex-wrap:wrap;gap:24px;align-items:baseline;margin-bottom:12px;">' +
    '<div><div style="font-size:11px;color:#8b949e;letter-spacing:0.5px;">IMPLIED ERP</div>' +
    '<div style="font-size:36px;font-weight:700;color:#fff;font-family:monospace;">' + erpPct + '%</div></div>' +
    '<div><div style="font-size:11px;color:#8b949e;letter-spacing:0.5px;">S&P 500</div>' +
    '<div style="font-size:20px;font-weight:700;color:#fff;font-family:monospace;">' + spx.toLocaleString() + '</div></div>' +
    '<div><div style="font-size:11px;color:#8b949e;letter-spacing:0.5px;">10Y YIELD</div>' +
    '<div style="font-size:20px;font-weight:700;color:#fff;font-family:monospace;">' + (tenY * 100).toFixed(2) + '%</div></div>' +
    '<div><div style="font-size:11px;color:#8b949e;letter-spacing:0.5px;">READING</div>' +
    '<div style="font-size:20px;font-weight:700;color:' + readCls + ';">' + read + '</div></div>' +
    '<div style="font-size:11px;color:#8b949e;">As of ' + esc(d.as_of || "") + ' · Live from DCF model</div></div>' +
    '<div class="zoomable-chart" data-chart="erp" style="position:relative;height:300px;margin-bottom:8px;cursor:zoom-in;" title="Click to zoom"><canvas id="' + cid + '"></canvas>' +
    '<div style="position:absolute;top:8px;right:10px;font-size:11px;color:#e8ecf1;background:rgba(19,23,34,0.8);padding:2px 8px;border-radius:4px;">⛶ click to zoom</div></div>';
   if (isPro) {
    h += '<div style="background:#161b26;border:1px solid #2a3448;border-radius:8px;padding:16px;margin-top:12px;">' +
     '<div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:8px;">What this tells you</div>' +
     '<div style="font-size:13px;color:#e8ecf1;line-height:1.6;">' +
     'The <b>implied equity risk premium</b> is the extra return investors demand for holding stocks over risk-free Treasuries, solved live from market prices via a Damodaran-style dividend discount model. ' +
     'It is the single most important input to every DCF on this site: a higher ERP means a higher discount rate and lower valuations across the board.</div>' +
     '<div style="font-size:13px;font-weight:700;color:#fff;margin:12px 0 8px;">How to read it</div>' +
     '<div style="font-size:13px;color:#e8ecf1;line-height:1.6;">' +
     'An <b>elevated ERP (above 4.5%)</b> means the market is pricing significant risk into equities. This is typically a contrarian bullish signal for long-term buyers, as long as earnings hold up. ' +
     'A <b>compressed ERP (below 3.0%)</b> means investors are accepting thin compensation for equity risk, often late in a bull market when complacency runs high. ' +
     'Watch the ERP against the 10Y: when the 10Y rises faster than the ERP, the equity discount rate climbs and growth multiples compress. ' +
     'The current 10Y at ' + (tenY * 100).toFixed(2) + '% is doing most of the work in today\'s discount rates.</div>' +
     '<div style="font-size:11px;color:#8b949e;margin-top:8px;">Source: Live DCF model ERP tab (GOOGLEFINANCE + Damodaran DDM solver), updated daily.</div></div>';
   } else {
    h += '<div style="background:#161b26;border:1px solid #2a3448;border-radius:8px;padding:16px;margin-top:12px;text-align:center;">' +
     '<div style="font-size:13px;color:#e8ecf1;margin-bottom:8px;">The full analysis of what this ERP reading means for positioning is a Pro feature.</div>' +
     '<button class="btn" onclick="openProModal()">See Pro Plans</button></div>';
   }
   h += '</div></div>';
   return h;
  }
  function fedFundsHtml(d) {
   if (!d || !d.available) return '<p style="color:#e8ecf1">Fed funds futures data unavailable.</p>';
   const meetings = (d.meetings || []).slice(0, 6);
   // Build probability table
   const rows = meetings.map((m) => {
    const probs = m.probabilities || {};
    // Sort by probability desc
    const sorted = Object.entries(probs).sort((a, b) => b[1] - a[1]);
    const top = sorted[0];
    const cells = sorted.map(([range, pct]) => {
     const isTop = range === top[0];
     const bg = isTop ? "background:rgba(47,111,237,0.25);" : "";
     const fw = isTop ? "font-weight:700;" : "";
     return '<td style="padding:8px 12px;text-align:center;' + bg + fw + 'color:#e8ecf1;font-size:13px;">' +
      esc(range) + '<br><span style="font-size:15px;">' + pct.toFixed(1) + '%</span></td>';
    }).join("");
    // Format date
    let dateStr = m.date;
    try {
     const dt = new Date(m.date + "T12:00:00");
     dateStr = dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch (e) {}
    return '<tr style="border-bottom:1px solid rgba(255,255,255,0.06);">' +
     '<td style="padding:8px 12px;color:#fff;font-weight:600;font-size:13px;white-space:nowrap;">' + esc(dateStr) + "</td>" + cells + "</tr>";
   }).join("");

   // Collect all unique ranges for header
   const allRanges = [];
   meetings.forEach((m) => {
    Object.keys(m.probabilities || {}).forEach((r) => {
     if (!allRanges.includes(r)) allRanges.push(r);
    });
   });
   // Sort ranges numerically
   allRanges.sort((a, b) => parseFloat(a) - parseFloat(b));

   return '<div class="section" style="max-width:none;"><div class="section-title">FOMC Fed Funds Futures <span style="font-size:11px;background:#3fb950;color:#0a0f0a;padding:2px 8px;border-radius:4px;vertical-align:middle;">FREE</span></div>' +
    '<div class="section-sub">What the futures market is pricing for upcoming FOMC meetings. Updates every morning.</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">' +
    '<div class="card" style="padding:16px;"><div style="font-size:11px;color:#e8ecf1;margin-bottom:4px;">EFFECTIVE FED FUNDS RATE</div>' +
    '<div style="font-size:28px;font-weight:800;color:#fff;">' + (d.effr != null ? d.effr.toFixed(2) + "%" : " - ") + "</div></div>" +
    '<div class="card" style="padding:16px;"><div style="font-size:11px;color:#e8ecf1;margin-bottom:4px;">CURRENT TARGET RANGE</div>' +
    '<div style="font-size:28px;font-weight:800;color:#fff;">' + esc(d.current_target || " - ") + "</div></div></div>" +
    '<div style="overflow-x:auto;margin-bottom:12px;"><table style="width:100%;border-collapse:collapse;min-width:600px;">' +
    '<thead><tr style="border-bottom:2px solid rgba(255,255,255,0.1);">' +
    '<th style="padding:8px 12px;text-align:left;color:#e8ecf1;font-size:12px;">FOMC Meeting</th>' +
    allRanges.map((r) => '<th style="padding:8px 12px;text-align:center;color:#e8ecf1;font-size:12px;">' + esc(r) + "</th>").join("") +
    "</tr></thead><tbody>" + rows + "</tbody></table></div>" +
    '<div class="panel-about" style="text-align:left;max-width:none;">' +
    "<p><b>What is this?</b> The CME FedWatch tool translates 30-Day Fed Funds futures prices into probabilities for each possible target range at upcoming FOMC meetings. " +
    "It's the market's consensus on where rates are headed.</p>" +
    "<p><b>How to read it:</b> Each row is an FOMC meeting. The highlighted cell is the highest-probability outcome. " +
    "When probabilities shift sharply day-over-day, it usually maps to a specific data release (CPI, jobs) or Fed-speak.</p>" +
    '<p><a href="https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html" target="_blank" rel="noopener" style="color:#58a6ff;">View on CME FedWatch →</a></p>' +
    "</div>" +
    '<div class="panel-asof">As of ' + esc((d.as_of || "").slice(0, 16).replace("T", " ")) + " ET · Trade date " + esc(d.trade_date || "") + "</div></div>";
  }

  /* ---------- AAII Sentiment HTML (FREE) ---------- */
  function aaiiSentimentHtml(d) {
   const b = d.bullish, n = d.neutral, br = d.bearish;
   const spread = d.bull_bear_spread;
   const spreadColor = spread >= 0 ? "#3fb950" : "#f85149";
   const avg = d.historical_avg || {};
   // Contrarian read
   let contrarian;
   if (br >= 45) {
    contrarian = "<b style='color:#3fb950'>Contrarian bullish:</b> extreme fear often marks bottoms, the crowd is already positioned for a drop.";
   } else if (b >= 50) {
    contrarian = "<b style='color:#f85149'>Contrarian bearish:</b> extreme greed often marks tops, the crowd is all-in.";
   } else if (Math.abs(spread) < 5) {
    contrarian = "Bulls and bears are evenly split, no strong contrarian signal.";
   } else if (spread > 0) {
    contrarian = "Bulls outnumber bears, mild contrarian caution.";
   } else {
    contrarian = "Bears outnumber bulls, mild contrarian optimism.";
   }
   const chg = (v) => v != null ? ' <span style="font-size:11px;color:' + (v >= 0 ? "#3fb950" : "#f85149") + ';">(' + (v >= 0 ? "+" : "") + v.toFixed(1) + "pt)</span>" : "";
   return '<div class="card" style="margin-bottom:16px;"><h3>AAII Investor Sentiment <span style="font-size:10px;background:#3fb950;color:#fff;padding:2px 7px;border-radius:4px;vertical-align:middle;">FREE</span></h3>' +
    '<div class="section-sub">Weekly survey of individual investors, are they bullish or bearish on stocks over the next 6 months?</div>' +
    '<div class="zoomable-chart" data-chart="aaii" style="position:relative;height:220px;margin-bottom:8px;cursor:zoom-in;" title="Click to zoom"><canvas id="aaii-chart"></canvas>' +
    '<div style="position:absolute;top:8px;right:10px;font-size:11px;color:#e8ecf1;background:rgba(19,23,34,0.8);padding:2px 8px;border-radius:4px;">⛶ click to zoom</div></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:12px 0;text-align:center;">' +
    '<div><div style="font-size:11px;color:#e8ecf1;">🐂 BULLISH</div>' +
    '<div style="font-size:22px;font-weight:700;color:#3fb950;">' + b.toFixed(1) + "%" + "</div>" +
    '<div style="font-size:11px;color:#e8ecf1;">avg ' + (avg.bullish != null ? avg.bullish.toFixed(1) : " - ") + "%" + chg(d.bullish_change) + "</div></div>" +
    '<div><div style="font-size:11px;color:#e8ecf1;">➖ NEUTRAL</div>' +
    '<div style="font-size:22px;font-weight:700;color:#c8d0dc;">' + n.toFixed(1) + "%" + "</div>" +
    '<div style="font-size:11px;color:#e8ecf1;">avg ' + (avg.neutral != null ? avg.neutral.toFixed(1) : " - ") + "%</div></div>" +
    '<div><div style="font-size:11px;color:#e8ecf1;">🐻 BEARISH</div>' +
    '<div style="font-size:22px;font-weight:700;color:#f85149;">' + br.toFixed(1) + "%" + "</div>" +
    '<div style="font-size:11px;color:#e8ecf1;">avg ' + (avg.bearish != null ? avg.bearish.toFixed(1) : " - ") + "%" + chg(d.bearish_change) + "</div></div>" +
    "</div>" +
    '<div style="text-align:center;margin:8px 0;">' +
    '<span style="font-size:13px;color:#e8ecf1;">Bull-Bear Spread: </span>' +
    '<span style="font-size:16px;font-weight:700;color:' + spreadColor + ';">' + (spread >= 0 ? "+" : "") + spread.toFixed(1) + "%</span></div>" +
    '<div class="panel-about" style="text-align:left;max-width:none;margin:12px 0;">' +
    "<p><b>What is this?</b> Every week, the American Association of Individual Investors asks its members: " +
    "will stocks be higher, lower, or about the same in 6 months? It's a direct read on retail investor psychology.</p>" +
    "<p><b>How to use it (contrarian).</b> " + contrarian + "</p>" +
    "<p><b>Current read:</b> " + b.toFixed(1) + "% bullish vs " + br.toFixed(1) + "% bearish " +
    "(historical avg: " + (avg.bullish || 37.5).toFixed(1) + "% / " + (avg.bearish || 31.5).toFixed(1) + "%). " +
    (br > (avg.bearish || 31.5) ? "Bearish sentiment is running above average, the crowd is nervous." :
     b > (avg.bullish || 37.5) ? "Bullish sentiment is running above average, the crowd is optimistic." :
     "Sentiment is near historical norms.") + "</p>" +
    "</div>" +
    '<div class="panel-asof">Week ending ' + esc(d.week_ending || "") + " · Source: AAII Sentiment Survey</div></div>";
  }

  /* ---------- Volatility Skew HTML (Pro-gated) ---------- */
  function skewTrackerHtml(skewData) {
   const indices = skewData.indices || {};
   const order = ["QQQ", "SPY", "SPX"];
   const cards = order
    .map((sym) => indices[sym])
    .filter((d) => d && d.available)
    .map((d) => {
     const regimeColors = {
      extreme_fear: "#f85149", elevated_fear: "#d29922",
      normal: "#58a6ff", complacent: "#3fb950",
     };
     const rc = regimeColors[d.regime] || "#e8ecf1";
     const trendIcon = d.trend === "steepening" ? "📈" : d.trend === "flattening" ? "📉" : "➡️";
     const trendLabel = d.trend === "steepening" ? "Steepening (fear rising)" :
      d.trend === "flattening" ? "Flattening (fear fading)" : "Stable";
     const maxIV = Math.max(d.put_iv, d.call_iv, 1);
     const putPct = (d.put_iv / maxIV * 100).toFixed(1);
     const callPct = (d.call_iv / maxIV * 100).toFixed(1);
     return '<div class="card" style="margin-bottom:12px;"><h3>' + esc(d.symbol) +
      ' <span style="font-size:12px;color:' + rc + ';">' + esc(d.regime_label || "") + "</span></h3>" +
      '<div style="margin:12px 0;">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
      '<span style="font-size:11px;color:#e8ecf1;width:70px;">Put IV</span>' +
      '<div style="flex:1;height:22px;background:#1a2030;border-radius:4px;overflow:hidden;">' +
      '<div style="width:' + putPct + '%;height:100%;background:#f85149;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;font-size:11px;font-weight:700;color:#fff;">' + d.put_iv.toFixed(1) + "%</div></div></div>" +
      '<div style="display:flex;align-items:center;gap:8px;">' +
      '<span style="font-size:11px;color:#e8ecf1;width:70px;">Call IV</span>' +
      '<div style="flex:1;height:22px;background:#1a2030;border-radius:4px;overflow:hidden;">' +
      '<div style="width:' + callPct + '%;height:100%;background:#3fb950;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;font-size:11px;font-weight:700;color:#0a0f0a;">' + d.call_iv.toFixed(1) + "%</div></div></div>" +
      "</div>" +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0;">' +
      '<div><div style="font-size:11px;color:#e8ecf1;">SKEW</div>' +
      '<div style="font-size:20px;font-weight:700;color:' + rc + ';">+' + d.skew.toFixed(1) + " vp</div></div>" +
      '<div><div style="font-size:11px;color:#e8ecf1;">TREND</div>' +
      '<div style="font-size:14px;font-weight:600;color:#e8ecf1;">' + trendIcon + " " + trendLabel + "</div>" +
      (d.skew_change != null ? '<div style="font-size:11px;color:#e8ecf1;">' + (d.skew_change >= 0 ? "+" : "") + d.skew_change.toFixed(1) + " vs 5d avg</div>" : "") + "</div>" +
      "</div>" +
      '<div style="font-size:12px;color:#e8ecf1;">Put $' + d.put_strike.toFixed(0) + " / Call $" + d.call_strike.toFixed(0) + " · " + d.dte + " DTE</div>" +
      '<div class="panel-asof">As of ' + esc((d.as_of || "").slice(0, 16).replace("T", " ")) + "</div></div>";
    }).join("");
   return cards || '<p style="color:var(--muted)">Skew data unavailable.</p>';
  }


  function gexTrackerHtml(gexData) {
   const indices = gexData.indices || {};
   // Prefer QQQ and SPY (SPX often blocked); fall back to whatever is available
   const order = ["QQQ", "SPY", "SPX"];
   const cards = order
    .map((sym) => indices[sym])
    .filter((d) => d && d.available)
    .map((d) => {
     const isPos = d.regime === "positive";
     const regimeColor = isPos ? "#3fb950" : "#f85149";
     const regimeLabel = isPos ? "POSITIVE, volatility dampener" : "NEGATIVE, volatility amplifier";
     const regimeIcon = isPos ? "🟢" : "🔴";
     const spotVsZG = d.zero_gamma != null
      ? (d.spot >= d.zero_gamma
       ? '<span style="color:#3fb950">above</span>'
       : '<span style="color:#f85149">below</span>')
      : " - ";
     const chartId = "gex-chart-" + d.symbol.toLowerCase();
     const strikeChartId = "gex-strike-" + d.symbol.toLowerCase();
     // Indices use billions; gexStrikeChartHtml expects unit in data
     const dWithUnit = Object.assign({}, d, {gex_unit: "B"});
     return '<div class="card" style="margin-bottom:12px;"><h3>' + esc(d.symbol) +
      ' <span style="font-size:12px;color:' + regimeColor + ';">' + regimeIcon + " " + regimeLabel + "</span></h3>" +
      '<div class="zoomable-chart" data-chart="gex-index" data-symbol="' + esc(d.symbol) + '" style="position:relative;height:200px;margin-bottom:8px;cursor:zoom-in;" title="Click to zoom"><canvas id="' + chartId + '"></canvas>' +
      '<div style="position:absolute;top:8px;right:10px;font-size:11px;color:#e8ecf1;background:rgba(19,23,34,0.8);padding:2px 8px;border-radius:4px;">⛶ click to zoom</div></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0;">' +
      '<div><div style="font-size:11px;color:#e8ecf1;">SPOT</div><div style="font-size:20px;font-weight:700;color:#e8ecf1;">$' + d.spot.toFixed(2) + "</div></div>" +
      '<div><div style="font-size:11px;color:#e8ecf1;">TOTAL GEX</div><div style="font-size:20px;font-weight:700;color:' + regimeColor + ';">' +
      (d.total_gex >= 0 ? "+" : "") + d.total_gex.toFixed(2) + "B</div></div>" +
      '<div><div style="font-size:11px;color:#e8ecf1;">ZERO GAMMA</div><div style="font-size:16px;font-weight:600;color:#e8ecf1;">' +
      (d.zero_gamma != null ? "$" + d.zero_gamma.toFixed(2) + " <span style='font-size:12px;color:#e8ecf1;'>(spot " + spotVsZG + ")</span>" : " - ") + "</div></div>" +
      '<div><div style="font-size:11px;color:#e8ecf1;">CALL WALL / PUT WALL</div><div style="font-size:16px;font-weight:600;color:#e8ecf1;">' +
      (d.call_wall != null ? "$" + d.call_wall.toFixed(0) : " - ") + ' <span style="color:#e8ecf1;">/</span> ' +
      (d.put_wall != null ? "$" + d.put_wall.toFixed(0) : " - ") + "</div></div>" +
      "</div>" +
      '<div style="font-size:12px;color:#e8ecf1;margin-top:8px;">Call GEX +' + d.call_gex.toFixed(2) + "B · Put GEX " + d.put_gex.toFixed(2) + "B · " +
      d.contracts_analyzed.toLocaleString() + " contracts</div>" +
      '<div class="section-title" style="margin-top:12px;">GEX by Strike</div>' +
      gexStrikeChartHtml(d.symbol, dWithUnit, strikeChartId) +
      '<div class="panel-asof">As of ' + esc((d.as_of || "").slice(0, 16).replace("T", " ")) + "</div></div>";
    }).join("");
   if (!cards) return '<p style="color:var(--muted)">GEX data unavailable.</p>';
   return cards;
  }

  function trackerExplainer(p) {
   const wrap = (inner) => '<div class="panel-about" style="text-align:left;max-width:none;margin:0 0 12px;">' + inner + "</div>";
   const name = (p.name || "").toLowerCase();

   if (/volatility divergence/.test(name) && D.vol_div_history && (D.vol_div_history.history || []).length) {
    const cur = D.vol_div_history.history[D.vol_div_history.history.length - 1];
    const div = cur.divergence, mz = cur.move_z, vz = cur.vix_z;
    const read = Math.abs(div) >= 2 ? "extreme" : Math.abs(div) >= 1 ? "elevated" : "normal";
    return wrap(
     "<p><b>What am I looking at?</b> This chart compares fear in two different markets: stocks (VIX) and bonds (MOVE). " +
     "Both are converted to z-scores, how unusual today's reading is versus the last year, so they can be compared apples-to-apples. " +
     "The red line is the gap between them: bond fear minus stock fear.</p>" +
     "<p><b>How to read it.</b> When the red line is near zero, stocks and bonds agree about risk. " +
     "When it spikes above <b>+2</b>, the bond market is much more scared than the stock market, bonds are pricing in danger that stocks are ignoring. " +
     "When it drops below <b>−2</b>, stocks are more fearful than bonds.</p>" +
     "<p><b>What does today\u2019s reading mean?</b> Divergence is <b>" + (div >= 0 ? "+" : "") + div.toFixed(2) + " (" + read + ")</b>, " +
     "MOVE z-score " + (mz >= 0 ? "+" : "") + mz.toFixed(2) + ", VIX z-score " + (vz >= 0 ? "+" : "") + vz.toFixed(2) + ". " +
     (Math.abs(div) >= 2
      ? "Bond-market fear is running far ahead of stock-market fear. This kind of dislocation has historically resolved with either bonds calming down or stocks catching down to the fear, watch for which one moves first."
      : Math.abs(div) >= 1
      ? "A meaningful gap is opening between bond and stock fear. Not yet extreme, but worth watching, if it widens toward ±2, it becomes a real signal."
      : "Stocks and bonds are broadly in agreement about risk. No dislocation to act on.") + "</p>"
    );
   }

   if (/alligator/.test(name) && D.jaw_history && D.jaw_history.current) {
    const cur = D.jaw_history.current;
    const open = cur.jaw_open;
    return wrap(
     "<p><b>What am I looking at?</b> This chart plots two lines: the <b style='color:#ffd60a'>S&P 500 price</b> (yellow, left axis) " +
     "and <b style='color:#00e676'>forward 12-month earnings estimates</b> (green, right axis), what analysts expect S&P 500 companies to earn over the next year. " +
     "In a healthy market, these two move together: prices rise because earnings are expected to rise.</p>" +
     "<p><b>What is the \u2018jaw\u2019?</b> The jaw <b>opens</b> when prices keep climbing to new highs <i>while</i> earnings estimates are being cut. " +
     "Picture an alligator opening its mouth: the top jaw (price) rises while the bottom jaw (earnings) drops. " +
     "That divergence preceded the 2022 bear market, investors were paying more for shrinking earnings.</p>" +
     "<p><b>What does today\u2019s reading mean?</b> The jaw is <b>" + (open ? "OPEN \uD83D\uDD34" : "CLOSED \uD83D\uDFE2") + "</b>, " +
     "S&amp;P 500 at " + cur.price.toFixed(0) + " (" + (cur.pct_below_high * 100).toFixed(1) + "% below its 52-week high), " +
     "forward EPS at $" + cur.forward_eps.toFixed(0) + " with a " + (cur.eps_chg4w >= 0 ? "+" : "") + (cur.eps_chg4w * 100).toFixed(1) + "% 4-week revision trend. " +
     (open
      ? "Prices are near highs while earnings momentum is negative, the classic warning setup. This does not mean sell everything, but it means the rally is running on multiple expansion rather than earnings growth, which is fragile."
      : "Price and earnings are moving in the same direction. The market\u2019s advance is supported by earnings expectations, which is the healthy configuration.") + "</p>"
    );
   }

   if (/credit spread/.test(name) && D.credit_vol_history && (D.credit_vol_history.history || []).length) {
    const cur = D.credit_vol_history.history[D.credit_vol_history.history.length - 1];
    const div = cur.diff;
    return wrap(
     "<p><b>What am I looking at?</b> This chart compares stress in corporate credit markets against stock-market fear. " +
     "The spread proxy (SHY minus HYG, the gap between safe short-term Treasuries and risky high-yield bonds) is converted to a z-score, " +
     "as is the VIX. The red line is the difference: credit stress minus equity fear.</p>" +
     "<p><b>How to read it.</b> Credit markets are often called the \u2018smart money\u2019, bond investors tend to sniff out trouble before stock investors. " +
     "When the red line spikes above <b>+2</b>, credit is flashing warning signs that stocks haven\u2019t priced in yet. " +
     "When it drops below <b>−2</b>, stocks are panicking about something credit markets don\u2019t see.</p>" +
     "<p><b>What does today\u2019s reading mean?</b> Spread-minus-VIX is <b>" + (div >= 0 ? "+" : "") + div.toFixed(2) + "</b> " +
     "(spread z " + (cur.spread_z >= 0 ? "+" : "") + cur.spread_z.toFixed(2) + ", VIX z " + (cur.vix_z >= 0 ? "+" : "") + cur.vix_z.toFixed(2) + "). " +
     (Math.abs(div) >= 2
      ? "Credit stress is diverging sharply from equity fear, one of these markets is wrong, and credit usually wins that argument. Treat equity exposure with extra caution until they reconverge."
      : "Credit and equity fear are roughly aligned. No warning from the bond market right now.") + "</p>"
    );
   }

   if (/market breadth/.test(name) && D.breadth_history && (D.breadth_history.history || []).length) {
    const cur = D.breadth_history.history[D.breadth_history.history.length - 1];
    // Small/mid-cap detail, the canary for breadth deterioration
    let smcHtml = "";
    const smc = D.small_midcap_history;
    if (smc && (smc.history || []).length) {
     const s = smc.history[smc.history.length - 1];
     const rutBelow = s.rut_vs_200d < 0, midBelow = s.mid_vs_200d < 0;
     const rutBear = s.rut_dd_52w <= -20, midBear = s.mid_dd_52w <= -20;
     smcHtml = "<p><b>Small &amp; mid-caps: the breadth canary.</b> " +
      "Russell 2000 sits <b>" + s.rut_vs_200d.toFixed(1) + "% " + (rutBelow ? "below" : "above") + "</b> its 200-day MA " +
      "(" + s.rut_dd_52w.toFixed(1) + "% below its 52-week high)" +
      (rutBear ? ", <b>in bear market territory</b>" : "") + ". " +
      "S&amp;P 400 MidCap sits <b>" + s.mid_vs_200d.toFixed(1) + "% " + (midBelow ? "below" : "above") + "</b> its 200-day MA " +
      "(" + s.mid_dd_52w.toFixed(1) + "% below its high)" +
      (midBear ? ", <b>in bear market territory</b>" : "") + ". " +
      (rutBelow && midBelow
       ? "Both small and mid-caps have broken below their long-term trend lines, this is textbook breadth deterioration. When the broad market's foot soldiers are in technical downtrends while mega-caps hold the index up, the rally is running on fumes. "
       : rutBelow || midBelow
       ? "One of the two is below its 200-day, early warning that breadth is thinning beneath the surface. "
       : "Both holding above their 200-day MAs, the broad market still has a healthy base. ") +
      "Small-caps are the most rate-sensitive segment of the market (floating-rate debt, no pricing power). When CPI runs hot and Fed hike expectations surge, they break first, watch them as the leading indicator for whether breadth damage is spreading or healing.</p>";
    }
    return wrap(
     "<p><b>What am I looking at?</b> This chart measures whether the <i>whole</i> market is participating in the rally, or just a handful of big stocks. " +
     "The blue line is the <b>breadth spread</b>: how far the median S&P 500 stock sits below its 52-week high, minus how far the index itself sits below its high. " +
     "The green and amber lines show what percentage of stocks are above their 50-day and 200-day moving averages.</p>" +
     "<p><b>How to read it.</b> In a healthy rally, most stocks rise together, the breadth spread stays near zero and the % above moving averages is high. " +
     "When the spread drops below <b>−10 percentage points</b>, a few giants are holding the index up while the average stock lags badly. " +
     "That\u2019s a narrow, fragile market, the kind that breaks hard when the leaders stumble.</p>" +
     "<p><b>What does today\u2019s reading mean?</b> Breadth spread is <b>" + cur.breadth_spread.toFixed(1) + "pp</b>, " +
     cur.pct_above_50d.toFixed(0) + "% of stocks above their 50-day MA and " + cur.pct_above_200d.toFixed(0) + "% above their 200-day MA. " +
     (cur.new_highs_10d != null ? "52-week highs vs lows, <b>10-day:</b> " + cur.new_highs_10d + "H/" + cur.new_lows_10d + "L " +
      "(net " + (cur.hl_net_10d >= 0 ? "+" : "") + cur.hl_net_10d + "); " +
      "<b>1-month:</b> " + cur.new_highs_21d + "H/" + cur.new_lows_21d + "L " +
      "(net " + (cur.hl_net_21d >= 0 ? "+" : "") + cur.hl_net_21d + "); " +
      "<b>3-month:</b> " + cur.new_highs_63d + "H/" + cur.new_lows_63d + "L " +
      "(net " + (cur.hl_net_63d >= 0 ? "+" : "") + cur.hl_net_63d + "). " : "") +
     (cur.breadth_spread <= -10
      ? "Breadth is extremely narrow, the index is masking broad weakness underneath. Rallies built this narrow have a poor track record of lasting."
      : cur.breadth_spread <= -5
      ? "Breadth is thinning, the rally is increasingly carried by fewer names. Worth watching, but not yet at the danger zone."
      : "Participation looks reasonably broad. The advance has support beyond just the mega-caps.") + "</p>" +
     smcHtml
    );
   }

   if (/theme rotation/.test(name) && D.theme_rot_history && (D.theme_rot_history.history || []).length) {
    const latest = D.theme_rot_history.history[D.theme_rot_history.history.length - 1];
    const themes = latest.themes || {};
    const byQ = {};
    Object.entries(themes).forEach(([n, v]) => { (byQ[v.q] = byQ[v.q] || []).push(n); });
    const fmtQ = (q) => (byQ[q] || []).join(", ") || "none";
    return wrap(
     "<p><b>What am I looking at?</b> Each dot is a market theme (AI &amp; semiconductors, energy, cybersecurity, etc.). " +
     "The <b>horizontal axis</b> shows how the theme is doing versus the S&amp;P 500 over a longer window, right means outperforming. " +
     "The <b>vertical axis</b> shows its recent momentum, up means accelerating.</p>" +
     "<p><b>The four quadrants.</b> <b style='color:#3fb950'>LEADING</b> (top-right): beating the market and accelerating, the current winners. " +
     "<b style='color:#c678dd'>IMPROVING</b> (top-left): still behind but turning up, potential future leaders. " +
     "<b style='color:#d29922'>WEAKENING</b> (bottom-right): ahead but fading, take profits here. " +
     "<b style='color:#f85149'>LAGGING</b> (bottom-left): behind and getting worse, avoid.</p>" +
     "<p><b>Where things stand today.</b> Leading: <b>" + esc(fmtQ("Leading")) + "</b>. " +
     "Improving: <b>" + esc(fmtQ("Improving")) + "</b>. " +
     "Weakening: <b>" + esc(fmtQ("Weakening")) + "</b>. " +
     "Lagging: <b>" + esc(fmtQ("Lagging")) + "</b>.</p>"
    );
   }

   if (/small.*mid|mid.*cap/.test(name) && D.smcap_history && (D.smcap_history.history || []).length) {
    const cur = D.smcap_history.history[D.smcap_history.history.length - 1];
    return wrap(
     "<p><b>What am I looking at?</b> This chart tracks small-caps (Russell 2000) and mid-caps (S&amp;P 400) against their own 200-day moving averages, " +
     "the classic long-term trend line. When an index is above its 200-day MA, the long-term trend is up; below it, the trend is down.</p>" +
     "<p><b>Why does it matter?</b> Small and mid-caps are more sensitive to the domestic economy and credit conditions than mega-cap tech. " +
     "When they break below their 200-day MAs while the S&amp;P 500 holds up, it often means the rally is running on a narrow set of large stocks " +
     "and underlying economic breadth is deteriorating.</p>" +
     "<p><b>What does today\u2019s reading mean?</b> Russell 2000 is <b>" + cur.rut_vs_200d.toFixed(1) + "%</b> vs its 200-day MA " +
     "(" + cur.rut_dd_52w.toFixed(1) + "% below its 52-week high). S&amp;P 400 MidCap is <b>" + cur.mid_vs_200d.toFixed(1) + "%</b> vs its 200-day MA " +
     "(" + cur.mid_dd_52w.toFixed(1) + "% below its high). " +
     (cur.rut_vs_200d < 0 && cur.mid_vs_200d < 0
      ? "Both are below their long-term trend lines, small and mid-caps are in technical downtrends even if the headline index looks fine."
      : cur.rut_vs_200d < 0 || cur.mid_vs_200d < 0
      ? "Mixed, one is above its trend line and the other below. The smaller-cap complex is not moving together."
      : "Both hold above their 200-day MAs, the broad market\u2019s long-term uptrend is intact across capitalizations.") + "</p>"
    );
   }

   return "";
  }

  // RSI Cyclical vs Defensive, Pro-gated interactive tracker
  if (D.rsi_cd_history && (D.rsi_cd_history.history || []).length) {
   const rsiCur = D.rsi_cd_history.current || {};
   const rsiVal = rsiCur.rsi != null ? rsiCur.rsi.toFixed(1) : " - ";
   const rsiSignal = (rsiCur.signal || "neutral").toUpperCase();
   const ratioVal = rsiCur.ratio != null ? rsiCur.ratio.toFixed(3) : " - ";
   const maVal = rsiCur.ratio_ma50 != null ? rsiCur.ratio_ma50.toFixed(3) : " - ";
   const vsMa = (rsiCur.ratio != null && rsiCur.ratio_ma50) ? ((rsiCur.ratio / rsiCur.ratio_ma50 - 1) * 100).toFixed(1) : " - ";
   const explainer =
    '<div class="panel-about" style="text-align:left;max-width:none;margin:0 0 12px;">' +
    '<p><b>What am I looking at?</b> This chart answers one question: <i>is money flowing toward risk or toward safety right now?</i> ' +
    'It does that by comparing two baskets of stocks. <b>Cyclicals</b> (tracked by the ETF <b>XLY</b>) are companies that do well when the economy is growing, think retailers, restaurants, car makers, airlines. ' +
    '<b>Defensives</b> (tracked by the ETF <b>XLP</b>) are companies people buy from no matter what, think toothpaste, cereal, soap, medicine.</p>' +
    '<p><b>The ratio.</b> We divide the cyclical basket by the defensive basket (XLY ÷ XLP). When the line rises, cyclicals are beating defensives, investors feel confident and are buying risk. ' +
    'When it falls, defensives are winning, investors are nervous and hiding in safety. Right now the ratio sits at <b>' + ratioVal + '</b>, which is <b>' + vsMa + '%</b> ' +
    (parseFloat(vsMa) >= 0 ? 'above' : 'below') + ' its 50-day average of ' + maVal + ', so the recent tilt has been ' +
    (parseFloat(vsMa) >= 0 ? 'toward risk' : 'toward safety') + '.</p>' +
    '<p><b>What is RSI?</b> RSI (Relative Strength Index) measures <i>how fast</i> the ratio is moving, on a 0–100 scale. Think of it as a speedometer for sector rotation. ' +
    'A high RSI means cyclicals are outperforming defensives at an unusually fast clip. A low RSI means the rotation into safety is happening unusually fast.</p>' +
    '<p><b>How to read the levels.</b></p>' +
    '<ul style="margin:6px 0 6px 18px;">' +
    '<li><b>Above 70 (overbought)</b>, Cyclicals have sprinted ahead of defensives. This often happens right before professional investors take profits on risky stocks and rotate into safer ones. It is a yellow flag, not a sell signal, strong trends can stay overbought for weeks.</li>' +
    '<li><b>Below 30 (oversold)</b>, Fear has pushed too much money into safety too fast. Cyclicals are historically cheap relative to defensives here, and these moments have often marked good entry points for risk assets.</li>' +
    '<li><b>Between 30 and 70 (neutral)</b>, Normal rotation. No extreme to act on.</li></ul>' +
    '<p><b>What does today\u2019s reading mean?</b> The RSI is <b>' + rsiVal + ' (' + rsiSignal + ')</b>. ' +
    (parseFloat(rsiVal) > 70 ? 'Cyclicals are running hot, the market is aggressively risk-on, and history says a cooling rotation toward defensives becomes more likely from here. Consider whether your portfolio has enough defensive ballast.'
    : parseFloat(rsiVal) < 30 ? 'Fear is extreme, money has fled to safety at a pace that rarely lasts. Cyclicals are unusually cheap versus defensives, which has historically been a good time to add risk selectively.'
    : 'No extreme in either direction. Sector rotation is proceeding at a normal pace, which means this indicator is not flashing a warning or an opportunity right now, it is simply confirming a balanced market.') + '</p>' +
    '<p style="color:#e8ecf1;font-size:12px;"><b>One caveat:</b> defensive stocks (especially utilities and staples) are sensitive to interest rates, they behave a bit like bonds. A sudden spike in rates can crush defensives and make the ratio jump even when the economy is not actually accelerating. Always check this signal against the broader market internals above.</p>' +
    '</div>';
   const rsiHtml = '<div class="zoomable-chart" data-chart="rsicd" style="position:relative;height:280px;margin-bottom:8px;cursor:zoom-in;" title="Click to zoom"><canvas id="rsicd-chart"></canvas>' +
    '<div style="position:absolute;top:8px;right:10px;font-size:11px;color:#e8ecf1;background:rgba(19,23,34,0.8);padding:2px 8px;border-radius:4px;">⛶ click to zoom</div></div>' +
    '<div class="panel-summary">XLY ÷ XLP ratio with 14-period RSI. Current RSI ' + rsiVal +
    ' (' + rsiSignal + '). Ratio ' + ratioVal +
    ' vs 50-day MA ' + maVal + '.</div>' +
    '<div class="panel-asof">As of ' + esc((D.rsi_cd_history.as_of || "").slice(0, 10)) + "</div>";
   h += '<div class="section" style="max-width:none;"><div class="section-title">RSI: Cyclicals vs Defensives <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>' +
    '<div class="section-sub">Risk-on / risk-off momentum, 14-period RSI on the XLY÷XLP ratio. Above 70 = cyclicals overbought, below 30 = oversold.</div>' +
    gated("RSI: Cyclicals vs Defensives", "14-period RSI on the XLY÷XLP ratio, spot sector rotation extremes before they reverse.", rsiHtml + explainer) +
    "</div>";
  }

  // GEX (Gamma Exposure), Pro-gated, daily refresh at 7:00 AM PT
  if (D.gex_data && D.gex_data.indices) {
   const gexHtml = gexTrackerHtml(D.gex_data);
   const gexExplainer =
    '<div class="panel-about" style="text-align:left;max-width:none;margin:0 0 12px;">' +
    '<p><b>What am I looking at?</b> Gamma exposure (GEX) estimates how much market makers will be forced to buy or sell ' +
    'as prices move. Market makers take the opposite side of options trades and must hedge to stay delta-neutral. ' +
    'GEX tells you which direction their hedging will push the market.</p>' +
    '<p><b>The two regimes.</b> <b style="color:#3fb950">Positive GEX</b> (green) means dealers are long gamma, ' +
    'they buy dips and sell rips, dampening volatility. Breakouts tend to fail; mean-reversion works. ' +
    '<b style="color:#f85149">Negative GEX</b> (red) means dealers are short gamma, they sell into declines and buy into rallies, ' +
    'amplifying moves. Trends run further; breakouts are more likely to stick. Widen stops and reduce size.</p>' +
    '<p><b>Key levels.</b> <b>Zero Gamma</b> is the price where GEX flips sign, crossing it often marks a regime change. ' +
    '<b>Call Wall</b> (resistance) and <b>Put Wall</b> (support) are strikes with the heaviest gamma concentration, ' +
    'they act as magnets or barriers for price.</p>' +
    '<p><b>How we calculate it.</b> GEX per contract = option gamma × open interest × 100 × spot price. ' +
    'Calls add positive GEX, puts add negative GEX (dealers assumed short both). The zero gamma level is found by ' +
    're-simulating every option\u2019s gamma via Black-Scholes across hypothetical price levels and finding where total GEX crosses zero. ' +
    'Data: CBOE delayed options chains, refreshed daily at 7:00 AM PT on trading days.</p>' +
    "</div>";
   h += '<div class="section" style="max-width:none;"><div class="section-title">Gamma Exposure (GEX) <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>' +
    '<div class="section-sub">Options dealer positioning, will market makers dampen or amplify the next move? Updates daily at 7:00 AM PT.</div>' +
    gated("Gamma Exposure (GEX)", "Daily dealer gamma positioning for QQQ and SPY, spot the volatility regime before it shifts.", gexHtml + gexExplainer) +
    "</div>";
  }

  // Volatility Skew, Pro-gated, indices on homepage
  if (D.skew_data && D.skew_data.indices) {
   const skewHtml = skewTrackerHtml(D.skew_data);
   const skewExplainer =
    '<div class="panel-about" style="text-align:left;max-width:none;margin:0 0 12px;">' +
    '<p><b>What am I looking at?</b> Volatility skew measures how much more investors pay for downside protection ' +
    '(OTM puts) versus upside speculation (OTM calls). We compare the implied volatility of ~7% OTM puts and calls, ' +
    '~30 days to expiration. A positive number means puts are pricier, the market is paying up for crash insurance.</p>' +
    '<p><b>How to read it.</b> <b style="color:#f85149">Steep skew (8+ vol points)</b> = heavy hedging demand, ' +
    'institutions bracing for a drop, bearish signal. <b style="color:#3fb950">Flat skew (under 5)</b> = complacency, ' +
    'cheap downside protection, often bullish, but extreme flatness can mark euphoric tops.</p>' +
    '<p><b>For swing traders.</b> When skew is steep, downside puts are overpriced, consider selling put credit spreads ' +
    'if bullish. When skew is flat, puts are cheap, buying protection is capital-efficient. ' +
    'Watch the trend: <i>steepening</i> skew into a selloff often marks capitulation bottoms.</p>' +
    '<p><b>Data:</b> CBOE delayed options chains, refreshed daily. SPY used as SPX proxy (SPX chain often blocked).</p>' +
    "</div>";
   h += '<div class="section" style="max-width:none;"><div class="section-title">Volatility Skew <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>' +
    '<div class="section-sub">Put vs call implied volatility, what is smart money paying for? Updates daily.</div>' +
    gated("Volatility Skew", "Daily put/call IV skew for QQQ and SPY, read institutional fear.", skewHtml + skewExplainer) +
    "</div>";
  }
  // render interactive vol divergence chart after DOM insert
  setTimeout(() => {
   const cv = document.getElementById("voldiv-chart");
   const vd = D.vol_div_history;
   if (cv && vd && (vd.history || []).length) {
   try {
    const hist = vd.history;
    const labels = hist.map((r) => r.date);
    const div = hist.map((r) => r.divergence);
    const vz = hist.map((r) => r.vix_z);
    const mz = hist.map((r) => r.move_z);
    new Chart(cv, {
     type: "line",
     data: { labels, datasets: [
      { label: "Divergence (MOVE z − VIX z)", data: div, borderColor: "#f23645", backgroundColor: "rgba(242,54,69,0.1)",
       borderWidth: 2.5, pointRadius: 0, tension: 0.1, fill: true, order: 1 },
      { label: "MOVE z-score", data: mz, borderColor: "#ff9800", borderWidth: 1.5,
       pointRadius: 0, tension: 0.1, borderDash: [5, 3], order: 2 },
      { label: "VIX z-score", data: vz, borderColor: "#2962ff", borderWidth: 1.5,
       pointRadius: 0, tension: 0.1, borderDash: [5, 3], order: 2 },
     ]},
     options: {
          animation: false, responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
       legend: { labels: { color: "#c8d0dc", boxWidth: 20, font: { size: 11 } } },
       tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1,
        titleColor: "#d1d4dc", bodyColor: "#d1d4dc", padding: 10,
        callbacks: {
         label: (c) => " " + c.dataset.label + ": " + (c.parsed.y != null ? c.parsed.y.toFixed(2) : " - ")
        } }
      },
      scales: {
       x: { ticks: { color: "#e8ecf1", maxTicksLimit: 6, maxRotation: 0 }, grid: { color: "rgba(42,46,57,0.4)" } },
       y: { ticks: { color: "#e8ecf1" }, grid: { color: "rgba(42,46,57,0.4)" },
        title: { display: true, text: "z-score", color: "#e8ecf1", font: { size: 11 } } }
      } }
    });
   } catch (e) { console.error("VolDiv chart error", e); }
   } // end voldiv guard
   // Alligator Jaw interactive chart: price vs forward EPS (dual axis)
   const jc = document.getElementById("jaw-chart");
   const jh = D.jaw_history;
   if (jc && jh && (jh.history || []).length) {
    try {
     const hist = jh.history;
     const labels = hist.map((r) => r.date);
     const prices = hist.map((r) => r.price);
     const eps = hist.map((r) => r.forward_eps);
     // shade jaw-open periods
     const jawOpen = hist.map((r) => r.jaw_open);
     new Chart(jc, {
      type: "line",
      data: { labels, datasets: [
       { label: "S&P 500", data: prices, borderColor: "#ffd60a", borderWidth: 2,
        pointRadius: 0, tension: 0.1, yAxisID: "y", order: 1 },
       { label: "Forward 12m EPS", data: eps, borderColor: "#00e676", borderWidth: 2,
        pointRadius: 0, tension: 0.1, yAxisID: "y1", order: 1 },
      ]},
      options: {
          animation: false, responsive: true, maintainAspectRatio: false,
       interaction: { mode: "index", intersect: false },
       plugins: {
        legend: { labels: { color: "#c8d0dc", boxWidth: 20, font: { size: 11 } } },
        tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1,
         titleColor: "#d1d4dc", bodyColor: "#d1d4dc", padding: 10,
         callbacks: {
          label: (c) => {
           const r = hist[c.dataIndex];
           if (c.dataset.label === "S&P 500")
            return " Price: " + c.parsed.y.toFixed(0) + " (" + (r.pct_below_high * 100).toFixed(1) + "% below high)";
           return " Fwd EPS: $" + c.parsed.y.toFixed(2) + " (4w chg " + (r.eps_chg4w * 100).toFixed(1) + "%)" +
            (r.jaw_open ? " [JAW OPEN]" : "");
          }
         } }
       },
       scales: {
        x: { ticks: { color: "#e8ecf1", maxTicksLimit: 6, maxRotation: 0 }, grid: { color: "rgba(42,46,57,0.4)" } },
        y: { type: "linear", position: "left", ticks: { color: "#ffd60a" }, grid: { color: "rgba(42,46,57,0.4)" },
         title: { display: true, text: "S&P 500", color: "#ffd60a", font: { size: 11 } } },
        y1: { type: "linear", position: "right", ticks: { color: "#00e676" }, grid: { display: false },
         title: { display: true, text: "Fwd EPS ($)", color: "#00e676", font: { size: 11 } } }
       } }
     });
    } catch (e) { console.error("Jaw chart error", e); }
   }
   // Theme Rotation interactive chart: scatter of themes (x = vs 70d avg, y = 20d momentum)
   // Quadrant backgrounds: green=leading (top-right), blue=improving (top-left),
   // amber=weakening (bottom-right), red=lagging (bottom-left)
   const quadBg = {
    id: "quadBg",
    beforeDraw(chart) {
     const { ctx, chartArea, scales } = chart;
     const x0 = scales.x.getPixelForValue(0), y0 = scales.y.getPixelForValue(0);
     const { left, right, top, bottom } = chartArea;
     ctx.save();
     ctx.fillStyle = "rgba(63,185,80,0.06)"; ctx.fillRect(x0, top, right - x0, y0 - top);   // leading
     ctx.fillStyle = "rgba(198,120,221,0.06)"; ctx.fillRect(left, top, x0 - left, y0 - top);   // improving
     ctx.fillStyle = "rgba(210,153,34,0.06)"; ctx.fillRect(x0, y0, right - x0, bottom - y0);   // weakening
     ctx.fillStyle = "rgba(248,81,73,0.06)"; ctx.fillRect(left, y0, x0 - left, bottom - y0);  // lagging
     // zero axes
     ctx.strokeStyle = "rgba(200,208,220,0.5)"; ctx.lineWidth = 1;
     ctx.beginPath(); ctx.moveTo(x0, top); ctx.lineTo(x0, bottom); ctx.stroke();
     ctx.beginPath(); ctx.moveTo(left, y0); ctx.lineTo(right, y0); ctx.stroke();
     // quadrant labels
     ctx.fillStyle = "rgba(200,208,220,0.55)"; ctx.font = "11px sans-serif"; ctx.textAlign = "center";
     ctx.fillText("LEADING", (x0 + right) / 2, top + 16);
     ctx.fillText("IMPROVING", (left + x0) / 2, top + 16);
     ctx.fillText("WEAKENING", (x0 + right) / 2, bottom - 8);
     ctx.fillText("LAGGING", (left + x0) / 2, bottom - 8);
     ctx.restore();
    }
   };
   const trc = document.getElementById("themerot-chart");
   const trh = D.theme_rot_history;
   if (trc && trh && (trh.history || []).length) {
    try {
     const latest = trh.history[trh.history.length - 1];
     const themes = latest.themes || {};
     const qColors = { Leading: "#3fb950", Improving: "#c678dd", Weakening: "#d29922", Lagging: "#f85149" };
     // symmetric axis range so all four quadrants always show
     const xs = Object.values(themes).map((v) => v.x), ys = Object.values(themes).map((v) => v.y);
     const maxAbs = Math.max(Math.abs(Math.min(...xs)), Math.abs(Math.max(...xs)), Math.abs(Math.min(...ys)), Math.abs(Math.max(...ys)), 5);
     const pad = Math.ceil(maxAbs * 1.15);
     const datasets = Object.entries(themes).map(([name, vals]) => ({
      label: name,
      data: [{ x: vals.x, y: vals.y }],
      backgroundColor: qColors[vals.q] || "#e8ecf1",
      pointRadius: 7, pointHoverRadius: 10,
     }));
     new Chart(trc, {
      type: "scatter",
      data: { datasets },
      options: {
          animation: false, responsive: true, maintainAspectRatio: false,
       plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1,
         titleColor: "#d1d4dc", bodyColor: "#d1d4dc", padding: 10,
         callbacks: {
          title: (items) => items[0].dataset.label + " (" + (themes[items[0].dataset.label] || {}).q + ")",
          label: (c) => " RS vs 70d avg: " + c.parsed.x.toFixed(1) + "%, 20d momentum: " + c.parsed.y.toFixed(1) + "%"
         } }
       },
       scales: {
        x: { min: -pad, max: pad, ticks: { color: "#e8ecf1" }, grid: { color: "rgba(42,46,57,0.4)" },
         title: { display: true, text: "Relative strength vs 70d avg (%) →", color: "#e8ecf1", font: { size: 11 } } },
        y: { min: -pad, max: pad, ticks: { color: "#e8ecf1" }, grid: { color: "rgba(42,46,57,0.4)" },
         title: { display: true, text: "20d momentum (%) →", color: "#e8ecf1", font: { size: 11 } } }
       } },
      plugins: [quadBg]
     });
    } catch (e) { console.error("ThemeRot chart error", e); }
   }
   // Small/Mid Cap interactive chart: vs 200d MA over time
   const smc = document.getElementById("smcap-chart");
   const smh = D.smcap_history;
   if (smc && smh && (smh.history || []).length) {
    try {
     const hist = smh.history;
     new Chart(smc, {
      type: "line",
      data: { labels: hist.map((r) => r.date), datasets: [
       { label: "RUT vs 200d (%)", data: hist.map((r) => r.rut_vs_200d), borderColor: "#f85149", borderWidth: 2, pointRadius: 0, tension: 0.1 },
       { label: "MID vs 200d (%)", data: hist.map((r) => r.mid_vs_200d), borderColor: "#58a6ff", borderWidth: 2, pointRadius: 0, tension: 0.1 },
      ]},
      options: {
          animation: false, responsive: true, maintainAspectRatio: false,
       interaction: { mode: "index", intersect: false },
       plugins: {
        legend: { labels: { color: "#c8d0dc", boxWidth: 20, font: { size: 11 } } },
        tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1,
         titleColor: "#d1d4dc", bodyColor: "#d1d4dc", padding: 10 }
       },
       scales: {
        x: { ticks: { color: "#e8ecf1", maxTicksLimit: 6, maxRotation: 0 }, grid: { color: "rgba(42,46,57,0.4)" } },
        y: { ticks: { color: "#e8ecf1", callback: (v) => v.toFixed(0) + "%" }, grid: { color: "rgba(42,46,57,0.4)" } }
       } }
     });
    } catch (e) { console.error("SmCap chart error", e); }
   }
   // Credit Spreads vs VIX interactive chart
   const cvc = document.getElementById("creditvol-chart");
   const cvh = D.credit_vol_history;
   if (cvc && cvh && (cvh.history || []).length) {
    try {
     const hist = cvh.history;
     new Chart(cvc, {
      type: "line",
      data: { labels: hist.map((r) => r.date), datasets: [
       { label: "Spread − VIX z-diff", data: hist.map((r) => r.diff), borderColor: "#f23645", backgroundColor: "rgba(242,54,69,0.1)", borderWidth: 2.5, pointRadius: 0, tension: 0.1, fill: true },
       { label: "Spread z", data: hist.map((r) => r.spread_z), borderColor: "#ff9800", borderWidth: 1.5, pointRadius: 0, tension: 0.1, borderDash: [5, 3] },
       { label: "VIX z", data: hist.map((r) => r.vix_z), borderColor: "#2962ff", borderWidth: 1.5, pointRadius: 0, tension: 0.1, borderDash: [5, 3] },
      ]},
      options: {
          animation: false, responsive: true, maintainAspectRatio: false,
       interaction: { mode: "index", intersect: false },
       plugins: { legend: { labels: { color: "#c8d0dc", boxWidth: 20, font: { size: 11 } } },
        tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1, titleColor: "#d1d4dc", bodyColor: "#d1d4dc", padding: 10 } },
       scales: {
        x: { ticks: { color: "#e8ecf1", maxTicksLimit: 6, maxRotation: 0 }, grid: { color: "rgba(42,46,57,0.4)" } },
        y: { ticks: { color: "#e8ecf1" }, grid: { color: "rgba(42,46,57,0.4)" }, title: { display: true, text: "z-score", color: "#e8ecf1", font: { size: 11 } } } } }
     });
    } catch (e) { console.error("CreditVol chart error", e); }
   }
   // Market Breadth interactive chart
   const brc = document.getElementById("breadth-chart");
   const brh = D.breadth_history;
   if (brc && brh && (brh.history || []).length) {
    try {
     const hist = brh.history;
     new Chart(brc, {
      type: "line",
      data: { labels: hist.map((r) => r.date), datasets: [
       { label: "Breadth spread (pp)", data: hist.map((r) => r.breadth_spread), borderColor: "#58a6ff", borderWidth: 2, pointRadius: 0, tension: 0.1, yAxisID: "y" },
       { label: "% above 50d", data: hist.map((r) => r.pct_above_50d), borderColor: "#c678dd", borderWidth: 1.5, pointRadius: 0, tension: 0.1, borderDash: [5, 3], yAxisID: "y1" },
       { label: "% above 200d", data: hist.map((r) => r.pct_above_200d), borderColor: "#d29922", borderWidth: 1.5, pointRadius: 0, tension: 0.1, borderDash: [5, 3], yAxisID: "y1" },
      ]},
      options: {
          animation: false, responsive: true, maintainAspectRatio: false,
       interaction: { mode: "index", intersect: false },
       plugins: { legend: { labels: { color: "#c8d0dc", boxWidth: 20, font: { size: 11 } } },
        tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1, titleColor: "#d1d4dc", bodyColor: "#d1d4dc", padding: 10 } },
       scales: {
        x: { ticks: { color: "#e8ecf1", maxTicksLimit: 6, maxRotation: 0 }, grid: { color: "rgba(42,46,57,0.4)" } },
        y: { position: "left", ticks: { color: "#58a6ff" }, grid: { color: "rgba(42,46,57,0.4)" } },
        y1: { position: "right", ticks: { color: "#e8ecf1", callback: (v) => v.toFixed(0) + "%" }, grid: { display: false } } } }
     });
    } catch (e) { console.error("Breadth chart error", e); }
   }
   // RSI Cyclical vs Defensive interactive chart (dual panel: ratio + RSI)
   const rc = document.getElementById("rsicd-chart");
   const rh = D.rsi_cd_history;
   if (rc && rh && (rh.history || []).length) {
    try {
     const hist = rh.history;
     // Build overbought/oversold bands as background
     new Chart(rc, {
      type: "line",
      data: { labels: hist.map((r) => r.date), datasets: [
       { label: "RSI (14)", data: hist.map((r) => r.rsi), borderColor: "#c678dd", borderWidth: 2, pointRadius: 0, tension: 0.1, yAxisID: "y" },
       { label: "Overbought (70)", data: hist.map(() => 70), borderColor: "#f85149", borderWidth: 1, pointRadius: 0, borderDash: [5, 3], yAxisID: "y" },
       { label: "Oversold (30)", data: hist.map(() => 30), borderColor: "#3fb950", borderWidth: 1, pointRadius: 0, borderDash: [5, 3], yAxisID: "y" },
      ]},
      options: {
          animation: false, responsive: true, maintainAspectRatio: false,
       interaction: { mode: "index", intersect: false },
       plugins: {
        legend: { labels: { color: "#c8d0dc", boxWidth: 20, font: { size: 11 } } },
        tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1,
         titleColor: "#d1d4dc", bodyColor: "#d1d4dc", padding: 10,
         callbacks: {
          label: (c) => {
           if (c.dataset.label === "RSI (14)") {
            const r = hist[c.dataIndex];
            return " RSI: " + c.parsed.y.toFixed(1) + " (" + r.signal + ") · Ratio " + r.ratio.toFixed(3);
           }
           return " " + c.dataset.label + ": " + c.parsed.y;
          }
         } }
       },
       scales: {
        x: { ticks: { color: "#e8ecf1", maxTicksLimit: 6, maxRotation: 0 }, grid: { color: "rgba(42,46,57,0.4)" } },
        y: { min: 0, max: 100, ticks: { color: "#e8ecf1" }, grid: { color: "rgba(42,46,57,0.4)" },
         title: { display: true, text: "RSI", color: "#e8ecf1", font: { size: 11 } } }
       } }
     });
    } catch (e) { console.error("RSICD chart error", e); }
   }
   // AAII Sentiment chart (free): bullish/neutral/bearish over time
   const aaiiCv = document.getElementById("aaii-chart");
   const aaiiD = D.aaii_sentiment;
   if (aaiiCv && aaiiD && (aaiiD.history || []).length) {
    try {
     const hist = aaiiD.history;
     new Chart(aaiiCv, {
      type: "line",
      data: { labels: hist.map((r) => r.week_ending), datasets: [
       { label: "Bullish %", data: hist.map((r) => r.bullish), borderColor: "#3fb950", borderWidth: 2, pointRadius: 0, tension: 0.1 },
       { label: "Neutral %", data: hist.map((r) => r.neutral), borderColor: "#c8d0dc", borderWidth: 1.5, pointRadius: 0, tension: 0.1, borderDash: [5, 3] },
       { label: "Bearish %", data: hist.map((r) => r.bearish), borderColor: "#f85149", borderWidth: 2, pointRadius: 0, tension: 0.1 },
      ]},
      options: {
          animation: false, responsive: true, maintainAspectRatio: false,
       interaction: { mode: "index", intersect: false },
       plugins: {
        legend: { labels: { color: "#c8d0dc", boxWidth: 20, font: { size: 11 } } },
        tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1,
         titleColor: "#d1d4dc", bodyColor: "#d1d4dc", padding: 10,
         callbacks: { label: (c) => " " + c.dataset.label + ": " + c.parsed.y.toFixed(1) + "%" } }
       },
       scales: {
        x: { ticks: { color: "#e8ecf1", maxTicksLimit: 6, maxRotation: 0 }, grid: { color: "rgba(42,46,57,0.4)" } },
        y: { ticks: { color: "#e8ecf1", callback: (v) => v + "%" }, grid: { color: "rgba(42,46,57,0.4)" },
         title: { display: true, text: "Sentiment %", color: "#e8ecf1", font: { size: 11 } } }
       } }
     });
    } catch (e) { console.error("AAII chart error", e); }
   }
   // 10Y Breakeven Inflation chart (free)
   const beCv = document.getElementById("breakeven-chart");
   const beD = D.breakeven_inflation;
   if (beCv && beD && (beD.history || []).length) {
    try {
     const hist = beD.history.slice(-756);
     const ctx0 = beCv.getContext("2d");
     const grad = ctx0.createLinearGradient(0, 0, 0, 300);
     grad.addColorStop(0, "rgba(6,182,212,0.35)");
     grad.addColorStop(1, "rgba(6,182,212,0)");
     new Chart(beCv, {
      type: "line",
      data: { labels: hist.map((r) => r.date),
       datasets: [{label: "10Y Breakeven (%)", data: hist.map((r) => r.value),
        borderColor: "#06b6d4", borderWidth: 1.5, backgroundColor: grad, fill: true,
        pointRadius: 0, pointHoverRadius: 4, tension: 0.1}]},
      options: { animation: false, responsive: true, maintainAspectRatio: false,
       interaction: {mode: "index", intersect: false},
       plugins: {legend: {display: false},
        tooltip: {backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1,
         titleColor: "#d1d4dc", bodyColor: "#d1d4dc", padding: 12,
         callbacks: {label: (c) => " " + c.parsed.y.toFixed(2) + "%"}}},
       scales: {
        x: {ticks: {color: "#6b7280", maxTicksLimit: 6, maxRotation: 0}, grid: {display: false}},
        y: {position: "right", ticks: {color: "#6b7280", callback: (v) => v.toFixed(1) + "%"}, grid: {color: "rgba(42,46,57,0.4)"}}}}
     });
    } catch (e) { console.error("Breakeven chart error", e); }
   }
   // COT chart (free): net positioning over time for SPX
   const cotCv = document.getElementById("cot-chart");
   const cotD = D.cot_data;
   if (cotCv && cotD && (cotD.history || []).length) {
    try {
     const hist = cotD.history;
     // Use SPX (or first available market)
     const mkey = cotD.markets.SPX ? "SPX" : Object.keys(cotD.markets)[0];
     new Chart(cotCv, {
      type: "line",
      data: { labels: hist.map((r) => r.report_date), datasets: [
       { label: "Commercials net", data: hist.map((r) => (r.markets[mkey] || {}).commercials?.net), borderColor: "#58a6ff", borderWidth: 2, pointRadius: 0, tension: 0.1 },
       { label: "Large Specs net", data: hist.map((r) => (r.markets[mkey] || {}).large_specs?.net), borderColor: "#c678dd", borderWidth: 2, pointRadius: 0, tension: 0.1 },
       { label: "Small Specs net", data: hist.map((r) => (r.markets[mkey] || {}).small_specs?.net), borderColor: "#d29922", borderWidth: 1.5, pointRadius: 0, tension: 0.1, borderDash: [5, 3] },
      ]},
      options: {
          animation: false, responsive: true, maintainAspectRatio: false,
       interaction: { mode: "index", intersect: false },
       plugins: {
        legend: { labels: { color: "#c8d0dc", boxWidth: 20, font: { size: 11 } } },
        tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1,
         titleColor: "#d1d4dc", bodyColor: "#d1d4dc", padding: 10,
         callbacks: { label: (c) => " " + c.dataset.label + ": " + (c.parsed.y >= 0 ? "+" : "") + Math.round(c.parsed.y).toLocaleString() + " contracts" } }
       },
       scales: {
        x: { ticks: { color: "#e8ecf1", maxTicksLimit: 6, maxRotation: 0 }, grid: { color: "rgba(42,46,57,0.4)" } },
        y: { ticks: { color: "#e8ecf1", callback: (v) => (v / 1000) + "k" }, grid: { color: "rgba(42,46,57,0.4)" },
         title: { display: true, text: "Net contracts", color: "#e8ecf1", font: { size: 11 } } }
       } }
     });
    } catch (e) { console.error("COT chart error", e); }
   }
   // Macroeconomic chart (Pro): matches "Economic Trends & Macro Indicators" design
   const macroCv = document.getElementById("macro-chart");
   const macroD = D.macro_indicators;
   if (macroCv && macroD && (macroD.history || []).length) {
    try {
     const hist = macroD.history;
     const labels = hist.map((r) => {
      const [y, m] = r.month.split("-");
      return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m)-1];
     });
     // Series config matching screenshot colors
     const series = [
      { key: "pmi", label: "Manufacturing PMI", color: "#a3e635" },
      { key: "ppi_yoy", label: "PPI (Producer Price)", color: "#a5b4fc" },
      { key: "retail_mom", label: "Retail Sales", color: "#22c55e" },
      { key: "cpi_yoy", label: "CPI (Consumer Price)", color: "#7dd3fc" },
      { key: "wti_crude", label: "WTI Crude ($)", color: "#f5a623" },
      { key: "gasoline_retail", label: "Gasoline Retail ($/gal)", color: "#ff6b6b" },
      { key: "diesel_retail", label: "Diesel Retail ($/gal)", color: "#c44dff" },
     ];
     // Normalize each series to 0-100% based on its min/max
     const normalize = (vals) => {
      const nums = vals.filter((v) => v != null);
      if (!nums.length) return vals;
      const mn = Math.min(...nums), mx = Math.max(...nums);
      const range = mx - mn || 1;
      return vals.map((v) => v == null ? null : ((v - mn) / range) * 100);
     };
     let normalizedMode = true;
     const buildDatasets = () => series.map((s) => {
      const raw = hist.map((r) => r[s.key]);
      return {
       label: s.label,
       data: normalizedMode ? normalize(raw) : raw,
       borderColor: s.color,
       backgroundColor: s.color,
       borderWidth: 2, pointRadius: 3, pointBackgroundColor: s.color,
       tension: 0.3,
      };
     });
     const chart = new Chart(macroCv, {
      type: "line",
      data: { labels: labels, datasets: buildDatasets() },
      options: {
          animation: false, responsive: true, maintainAspectRatio: false,
       interaction: { mode: "index", intersect: false },
       plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1,
         titleColor: "#d1d4dc", bodyColor: "#d1d4dc", padding: 10,
         callbacks: {
          label: (c) => {
           if (normalizedMode) return " " + c.dataset.label + ": " + c.parsed.y.toFixed(0) + "%";
           const s = series[c.datasetIndex];
           const raw = hist[c.dataIndex][s.key];
           return " " + c.dataset.label + ": " + (raw != null ? raw.toFixed(1) : " - ") +
            (s.key === "pmi" ? "" : "%");
          }
         } }
       },
       scales: {
        x: { ticks: { color: "#e8ecf1", maxTicksLimit: 9, maxRotation: 0 }, grid: { color: "rgba(42,46,57,0.4)" } },
        y: normalizedMode
         ? { min: -50, max: 150, ticks: { color: "#e8ecf1", callback: (v) => v + "%" }, grid: { color: "rgba(42,46,57,0.4)" } }
         : { ticks: { color: "#e8ecf1" }, grid: { color: "rgba(42,46,57,0.4)" } },
       } }
     });
     // Bottom legend
     const legendEl = document.getElementById("macro-legend");
     if (legendEl) {
      legendEl.innerHTML = series.map((s) =>
       '<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#e8ecf1;">' +
       '<span style="width:14px;height:14px;border-radius:50%;background:' + s.color + ';display:inline-block;"></span>' +
       esc(s.label) + "</span>"
      ).join("");
     }
     // Scaling toggle
     const normBtn = document.getElementById("macro-norm-btn");
     const rawBtn = document.getElementById("macro-raw-btn");
     const setMode = (norm) => {
      normalizedMode = norm;
      chart.data.datasets = buildDatasets();
      chart.options.scales.y = norm
       ? { min: -50, max: 150, ticks: { color: "#e8ecf1", callback: (v) => v + "%" }, grid: { color: "rgba(42,46,57,0.4)" } }
       : { ticks: { color: "#e8ecf1" }, grid: { color: "rgba(42,46,57,0.4)" } };
      chart.update();
      if (normBtn && rawBtn) {
       normBtn.style.background = norm ? "#1e3a5f" : "transparent";
       normBtn.style.opacity = norm ? "1" : "0.6";
       rawBtn.style.background = norm ? "transparent" : "#1e3a5f";
       rawBtn.style.opacity = norm ? "0.6" : "1";
      }
     };
     if (normBtn) normBtn.addEventListener("click", (e) => { e.stopPropagation(); setMode(true); });
     if (rawBtn) rawBtn.addEventListener("click", (e) => { e.stopPropagation(); setMode(false); });
     // Report date selector, swap between historical reports
     const reportSel = document.getElementById("macro-report-date");
     if (reportSel && window.__macroReportHistory) {
      reportSel.addEventListener("change", (e) => {
       e.stopPropagation();
       const idx = parseInt(reportSel.value);
       const r = window.__macroReportHistory[idx];
       if (!r) return;
       const label = document.getElementById("macro-report-date-label");
       const sections = document.getElementById("macro-report-sections");
       const body = document.getElementById("macro-report-body");
       if (label) label.textContent = (r.date || "") + (r.data_through ? ", " + r.data_through : "");
       if (sections && r.report && r.report.sections) {
        sections.innerHTML = r.report.sections.map((s) =>
         '<div style="margin-bottom:14px;">' +
         '<div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:6px;">' + s.heading.replace(/</g, "&lt;") + "</div>" +
         '<div style="font-size:13px;color:#e8ecf1;opacity:0.85;line-height:1.6;">' + s.body + "</div></div>"
        ).join("");
       }
       if (body) body.scrollTop = 0;
      });
     }
     // Metric pills toggle datasets
     document.querySelectorAll("[data-macro-idx]").forEach((pill) => {
      pill.addEventListener("click", (e) => {
       e.stopPropagation();
       const idx = parseInt(pill.dataset.macroIdx);
       const meta = chart.getDatasetMeta(idx);
       meta.hidden = meta.hidden === null ? !chart.data.datasets[idx].hidden : !meta.hidden;
       chart.update();
       pill.style.opacity = meta.hidden ? "0.4" : "1";
      });
     });
     // Store chart for zoom handler
     macroCv._chart = chart;
     macroCv._series = series;
     macroCv._hist = hist;
     macroCv._labels = labels;
    } catch (e) { console.error("Macro chart error", e); }
   }
   // GEX index charts: price levels (spot vs zero gamma vs walls) as horizontal bar
   if (D.gex_data && D.gex_data.indices) {
    ["QQQ", "SPY", "SPX"].forEach((sym) => {
     const d = D.gex_data.indices[sym];
     const cv = document.getElementById("gex-chart-" + sym.toLowerCase());
     if (!cv || !d || !d.available) return;
     try {
      // Price level chart: show put wall, spot, zero gamma, call wall
      const levels = [];
      if (d.put_wall != null) levels.push({ label: "Put Wall", value: d.put_wall, color: "#f85149" });
      levels.push({ label: "Spot", value: d.spot, color: "#e8ecf1" });
      if (d.zero_gamma != null) levels.push({ label: "Zero Gamma", value: d.zero_gamma, color: "#c678dd" });
      if (d.call_wall != null) levels.push({ label: "Call Wall", value: d.call_wall, color: "#3fb950" });
      // Sort by price for the bar chart
      levels.sort((a, b) => a.value - b.value);
      new Chart(cv, {
       type: "bar",
       data: {
        labels: levels.map((l) => l.label),
        datasets: [{
         data: levels.map((l) => l.value),
         backgroundColor: levels.map((l) => l.color),
         borderWidth: 0,
        }],
       },
       options: {
          animation: false,
        indexAxis: "y",
        responsive: true, maintainAspectRatio: false,
        plugins: {
         legend: { display: false },
         tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1,
          titleColor: "#d1d4dc", bodyColor: "#d1d4dc", padding: 10,
          callbacks: { label: (c) => " $" + c.parsed.x.toFixed(2) } },
        },
        scales: {
         x: { ticks: { color: "#e8ecf1", callback: (v) => "$" + v.toFixed(0) }, grid: { color: "rgba(42,46,57,0.4)" } },
         y: { ticks: { color: "#c8d0dc", font: { size: 11 } }, grid: { display: false } },
        },
       },
      });
     } catch (e) { console.error("GEX chart error for " + sym, e); }
    });
   }
   // Click/tap to zoom: bind handlers for all zoomable charts
   bindZoomHandlers();
  }, 200);
  h += "</div>";

  // Macroeconomic Analysis, Pro-gated (always show section; gatedSafe shows teaser for free users)
  h += '<div class="section" id="macro-sec" style="max-width:none;"><div class="section-title">Macroeconomic Analysis <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>' +
   '<div class="section-sub">CPI, PPI, retail sales, and PMI, the macro backdrop driving Fed policy and market regimes. Updates as reports are released.</div>' +
   gatedSafe("Macroeconomic Analysis", "CPI, PPI, retail sales, consumer health, and PMI, the macro forces moving markets.",
    () => macroAnalysisHtml(D.macro_indicators || { history: [] })) +
   "</div>";

  // Market Leadership, Pro-gated
  if (D.leadership && D.leadership.available && (D.leadership.leaders || []).length) {
   h += gated("Market Leadership", "Automated S&P 500 leader tracking with composite scoring and rotation signals.",
    leadershipHtml(D.leadership));
  }

  app.innerHTML = h;
  try { drawLeadershipChart(); } catch (e) { console.error("Leadership chart failed:", e); }
  } catch (routeErr) {
   console.error("Monitor route failed:", routeErr);
   app.innerHTML = '<div class="card"><h3>Market Internals</h3><p style="color:#f85149;">Failed to load: ' + esc(routeErr.message) + '</p><p>Please refresh the page.</p></div>';
  }
 });

 /* ================= ALERTS ================= */
 // Pro users can subscribe to email alerts for any market internals monitor
 const ALERT_TRACKERS = [
  { key: "aaii_sentiment", name: "AAII Investor Sentiment", desc: "Weekly sentiment survey, notified when new results publish (Thursdays)." },
  { key: "cot_positioning", name: "COT Positioning", desc: "Weekly futures positioning, notified when new CFTC data publishes (Fridays)." },
  { key: "volatility_divergence", name: "Volatility Divergence", desc: "VIX vs MOVE divergence, notified on significant regime shifts." },
  { key: "alligator_jaw", name: "Alligator Jaw", desc: "S&P 500 vs forward EPS, notified when the jaw opens or closes." },
  { key: "credit_spreads", name: "Credit Spreads vs VIX", desc: "Credit stress vs equity fear, notified on divergence extremes." },
  { key: "market_breadth", name: "Market Breadth", desc: "Breadth monitor, notified on significant breadth deterioration/improvement." },
  { key: "theme_rotation", name: "Theme Rotation", desc: "Sector rotation, notified when leadership rotates." },
  { key: "small_midcap", name: "Small/Mid Cap Monitor", desc: "Small/mid-cap trend, notified on trend changes vs 200-day MA." },
  { key: "rsi_cyclical_defensive", name: "RSI: Cyclicals vs Defensives", desc: "Risk-on/risk-off momentum, notified on overbought/oversold extremes." },
  { key: "gex", name: "Gamma Exposure (GEX)", desc: "Dealer positioning, notified on volatility regime shifts." },
  { key: "volatility_skew", name: "Volatility Skew", desc: "Put/call skew, notified on significant fear spikes." },
  { key: "macro_analysis", name: "Macroeconomic Analysis", desc: "CPI, PPI, retail sales, PMI, energy, notified when new reports are released." },
  { key: "fear_index", name: "Quantitative Fear Index", desc: "0-100 market fear gauge, notified when extreme tail risk is detected (score 75+)." },
 ];

 function premarketHtml() {
  const pm = D.premarket_report;
  if (!pm || !pm.data) {
   return '<div class="section"><div class="section-title">Pre-Market Snapshot</div>' +
    '<div class="card"><p style="color:var(--muted)">Pre-market data has not been collected yet. Check back after the morning refresh.</p></div></div>';
  }
  const fmtPrice = (p) => p >= 100 ? p.toFixed(2) : p.toFixed(2);
  const cell = (ticker, d) => {
   const chg = d.change_pct || 0;
   const col = chg > 0 ? "#3fb950" : (chg < 0 ? "#f85149" : "#8b8fa3");
   const arrow = chg > 0 ? "▲" : (chg < 0 ? "▼" : "–");
   const qt = d.quote_time ? '<div style="font-size:10px;color:var(--muted);margin-top:3px;">' + esc(d.quote_time) + '</div>' : '';
   return '<div style="background:#161b26;border-radius:8px;padding:10px 12px;">' +
    '<div style="font-size:10px;color:var(--muted);margin-bottom:2px;">' + esc(d.name || ticker) + '</div>' +
    '<div style="font-size:15px;font-weight:700;color:#e8ecf1;">' + fmtPrice(d.price) + '</div>' +
    '<div style="font-size:12px;font-weight:700;color:' + col + ';">' + arrow + " " + (chg > 0 ? "+" : "") + chg.toFixed(2) + "%</div>" + qt + "</div>";
  };
  let h = '<div class="section" style="max-width:none;"><div class="section-title">Pre-Market Snapshot</div>';
  h += '<div class="section-sub">Cross-asset prices vs prior close, collected ' + esc(pm.timestamp || "") + ". Each card shows when its quote last printed. Updates every trading morning before the open.</div>";
  Object.keys(pm.data).forEach((cat) => {
   const tickers = pm.data[cat];
   const keys = Object.keys(tickers);
   if (!keys.length) return;
   h += '<div style="font-size:12px;font-weight:700;color:#e8ecf1;margin:14px 0 8px;letter-spacing:0.5px;">' + esc(cat.toUpperCase()) + '</div>';
   h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;">';
   keys.forEach((tk) => { h += cell(tk, tickers[tk]); });
   h += '</div>';
  });
  if (pm.insights && pm.insights.length) {
   h += '<div style="font-size:12px;font-weight:700;color:#e8ecf1;margin:16px 0 8px;letter-spacing:0.5px;">WHAT IT MEANS</div>';
   h += '<div class="card" style="padding:16px 20px;">';
   pm.insights.forEach((ins) => {
    h += '<div style="display:flex;gap:10px;margin-bottom:10px;font-size:13px;line-height:1.6;color:#e8ecf1;">' +
     '<span style="color:#d4a017;flex-shrink:0;">▸</span><span>' + esc(ins) + '</span></div>';
   });
   h += '</div>';
  }
  h += "</div>";
  return h;
 }

 function rotationHtml() {
  const ro = D.rotation_analysis;
  if (!ro || !ro.pairs_trading_book) {
   return '<div class="section"><div class="section-title">Rotation & Pairs Matrix <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>' +
    '<div class="card"><p style="color:var(--muted)">Rotation analysis has not been computed yet. Check back after the morning refresh.</p></div></div>';
  }
  const intel = ro.desk_intel || {};
  const fmtPct = (v) => {
   const col = v > 0 ? "#3fb950" : (v < 0 ? "#f85149" : "#8b8fa3");
   return '<span style="color:' + col + ';font-weight:700;">' + (v > 0 ? "+" : "") + v.toFixed(2) + "%</span>";
  };
  let h = '<div class="section" style="max-width:none;"><div class="section-title">Rotation & Pairs Matrix <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>';
  h += '<div class="section-sub">Cross-asset rotation, factor regimes, and systematic long/short pairs with 20-day rolling Z-scores. As of ' + esc(ro.timestamp || "") + '.</div>';

  // Regime cards
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-bottom:12px;">';
  h += '<div class="card" style="padding:16px;"><div style="font-size:11px;color:var(--muted);letter-spacing:1px;margin-bottom:6px;">MACRO REGIME</div>' +
   '<div style="font-size:18px;font-weight:800;color:#e8ecf1;">' + esc(intel.regime || "N/A") + '</div></div>';
  h += '<div class="card" style="padding:16px;"><div style="font-size:11px;color:var(--muted);letter-spacing:1px;margin-bottom:6px;">CYCLICALS VS DEFENSIVES (1D)</div>' +
   '<div style="font-size:18px;">' + fmtPct(intel.cyc_def_spread_1d || 0) + '</div></div>';
  h += '<div class="card" style="padding:16px;"><div style="font-size:11px;color:var(--muted);letter-spacing:1px;margin-bottom:6px;">HIGH BETA VS LOW VOL (1D)</div>' +
   '<div style="font-size:18px;">' + fmtPct(intel.beta_vol_spread_1d || 0) + '</div></div>';
  h += '</div>';

  // Desk notes
  if (intel.commentary && intel.commentary.length) {
   h += '<div class="card" style="padding:16px 20px;margin-bottom:16px;border-left:3px solid #2979FF;">' +
    '<div style="font-size:11px;font-weight:700;color:#2979FF;letter-spacing:1px;margin-bottom:8px;">DESK NOTES</div>';
   intel.commentary.forEach((n) => {
    h += '<div style="display:flex;gap:10px;margin-bottom:8px;font-size:13px;line-height:1.6;color:#e8ecf1;">' +
     '<span style="color:#2979FF;flex-shrink:0;">›</span><span>' + esc(n) + '</span></div>';
   });
   h += '</div>';
  }

  // Pairs book
  h += '<div style="font-size:12px;font-weight:700;color:#e8ecf1;margin:0 0 8px;letter-spacing:0.5px;">SYSTEMATIC LONG/SHORT PAIRS BOOK <span style="font-size:10px;background:#7d4fc9;color:#fff;padding:2px 7px;border-radius:4px;vertical-align:middle;">PRO</span></div>';
  h += '<div style="overflow-x:auto;margin-bottom:16px;"><table style="width:100%;border-collapse:collapse;font-size:12px;">';
  h += '<thead><tr style="border-bottom:1px solid #2a3242;color:var(--muted);font-size:10px;letter-spacing:0.5px;">' +
   '<th style="text-align:left;padding:8px;">PAIR</th><th style="text-align:left;padding:8px;">THESIS</th>' +
   '<th style="text-align:right;padding:8px;">1D SPREAD</th><th style="text-align:right;padding:8px;">5D SPREAD</th>' +
   '<th style="text-align:center;padding:8px;">20D Z</th><th style="text-align:right;padding:8px;">SIGNAL</th></tr></thead><tbody>';
  (ro.pairs_trading_book || []).forEach((p) => {
   const z = p.z_score || 0;
   const zc = z >= 2 ? "#f85149" : (z <= -2 ? "#3fb950" : "#8b8fa3");
   const bc = p.bias === "short" ? "#f85149" : (p.bias === "long" ? "#3fb950" : (p.bias.indexOf("momentum") === 0 ? "#2979FF" : "#8b8fa3"));
   h += '<tr style="border-bottom:1px solid #1c2330;">' +
    '<td style="padding:10px 8px;"><span style="color:#3fb950;font-weight:700;">' + esc(p.long_leg) + '</span>' +
    '<span style="color:var(--muted);"> / </span><span style="color:#f85149;font-weight:700;">' + esc(p.short_leg) + '</span>' +
    '<div style="font-size:10px;color:var(--muted);margin-top:2px;">' + esc(p.name) + '</div></td>' +
    '<td style="padding:10px 8px;font-size:11px;color:var(--muted);max-width:220px;">' + esc(p.thesis) + '</td>' +
    '<td style="padding:10px 8px;text-align:right;">' + fmtPct(p.spread_1d || 0) + '</td>' +
    '<td style="padding:10px 8px;text-align:right;">' + fmtPct(p.spread_5d || 0) + '</td>' +
    '<td style="padding:10px 8px;text-align:center;font-weight:700;color:' + zc + ';">' + z.toFixed(2) + 'σ</td>' +
    '<td style="padding:10px 8px;text-align:right;"><span style="font-size:10px;font-weight:700;color:' + bc + ';border:1px solid ' + bc + ';border-radius:4px;padding:3px 8px;white-space:nowrap;">' + esc(p.signal) + '</span></td></tr>';
  });
  h += '</tbody></table></div>';

  // Sectors + globals
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;">';
  h += '<div><div style="font-size:12px;font-weight:700;color:#e8ecf1;margin-bottom:8px;letter-spacing:0.5px;">SECTORS & SUB-INDUSTRIES</div>';
  h += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">';
  h += '<thead><tr style="border-bottom:1px solid #2a3242;color:var(--muted);font-size:10px;">' +
   '<th style="text-align:left;padding:6px;">SECTOR</th><th style="text-align:left;padding:6px;">GROUP</th>' +
   '<th style="text-align:right;padding:6px;">1D</th><th style="text-align:right;padding:6px;">5D</th><th style="text-align:right;padding:6px;">20D</th></tr></thead><tbody>';
  (ro.sectors || []).forEach((s) => {
   h += '<tr style="border-bottom:1px solid #1c2330;"><td style="padding:6px;"><b style="color:#e8ecf1;">' + esc(s.symbol) + '</b> <span style="font-size:10px;color:var(--muted);">' + esc(s.name) + '</span></td>' +
    '<td style="padding:6px;font-size:10px;color:var(--muted);">' + esc(s.group) + '</td>' +
    '<td style="padding:6px;text-align:right;">' + fmtPct(s.chg_1d || 0) + '</td>' +
    '<td style="padding:6px;text-align:right;">' + fmtPct(s.chg_5d || 0) + '</td>' +
    '<td style="padding:6px;text-align:right;">' + fmtPct(s.chg_20d || 0) + '</td></tr>';
  });
  h += '</tbody></table></div></div>';
  h += '<div><div style="font-size:12px;font-weight:700;color:#e8ecf1;margin-bottom:8px;letter-spacing:0.5px;">GLOBAL INDICES</div>';
  h += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">';
  h += '<thead><tr style="border-bottom:1px solid #2a3242;color:var(--muted);font-size:10px;">' +
   '<th style="text-align:left;padding:6px;">INDEX</th><th style="text-align:right;padding:6px;">PRICE</th>' +
   '<th style="text-align:right;padding:6px;">1D</th><th style="text-align:right;padding:6px;">5D</th><th style="text-align:right;padding:6px;">20D</th></tr></thead><tbody>';
  (ro.global_indices || []).forEach((g) => {
   h += '<tr style="border-bottom:1px solid #1c2330;"><td style="padding:6px;"><b style="color:#e8ecf1;">' + esc(g.symbol) + '</b> <span style="font-size:10px;color:var(--muted);">' + esc(g.name) + '</span></td>' +
    '<td style="padding:6px;text-align:right;color:#e8ecf1;">' + g.price.toFixed(2) + '</td>' +
    '<td style="padding:6px;text-align:right;">' + fmtPct(g.chg_1d || 0) + '</td>' +
    '<td style="padding:6px;text-align:right;">' + fmtPct(g.chg_5d || 0) + '</td>' +
    '<td style="padding:6px;text-align:right;">' + fmtPct(g.chg_20d || 0) + '</td></tr>';
  });
  h += '</tbody></table></div></div>';
  h += '</div></div>';
  return h;
 }

 function fearIndexHtml() {
  const fi = D.fear_index;
  if (!fi || fi.fear_index === undefined) {
   return '<div class="section"><div class="section-title">Quantitative Fear Index <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>' +
    '<div class="card"><p style="color:var(--muted)">The Fear Index has not been computed yet. Check back after the morning refresh.</p></div></div>';
  }
  const score = fi.fear_index;
  const label = fi.sentiment || "";
  const color = score >= 75 ? "#f85149" : (score >= 55 ? "#ff7b1c" : (score >= 45 ? "#d4a017" : "#3fb950"));
  const canvasId = "fear-hist-" + Math.random().toString(36).slice(2, 8);
  let h = '<div class="section" style="max-width:none;"><div class="section-title">Quantitative Fear Index <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>';
  h += '<div class="section-sub">A quantitative Fear Index combines fixed-strike downside option skew, volatility term structure backwardation, credit spread stress, safe-haven capital rotation, and market momentum into a single daily 0-100 gauge (0 = Extreme Complacency, 100 = Extreme Panic). Computed every trading morning. As of ' + esc(fi.timestamp || "") + '.</div>';
  // Gauge card
  h += '<div class="card" style="padding:24px;text-align:center;">';
  h += '<div style="font-size:11px;color:var(--muted);letter-spacing:1.5px;margin-bottom:8px;">FEAR INDEX</div>';
  h += '<div style="font-size:56px;font-weight:800;color:' + color + ';line-height:1;">' + score + '</div>';
  h += '<div style="font-size:14px;font-weight:700;color:' + color + ';margin-top:6px;letter-spacing:1px;">' + esc(label).toUpperCase() + '</div>';
  // Meter bar
  h += '<div style="display:flex;height:10px;border-radius:5px;overflow:hidden;margin:16px auto 4px;max-width:520px;">' +
   '<div style="flex:25;background:#3fb950;"></div><div style="flex:20;background:#7bbf3f;"></div>' +
   '<div style="flex:10;background:#d4a017;"></div><div style="flex:20;background:#ff7b1c;"></div>' +
   '<div style="flex:25;background:#f85149;"></div></div>';
  h += '<div style="display:flex;justify-content:space-between;max-width:520px;margin:0 auto;font-size:10px;color:var(--muted);">' +
   '<span>COMPLACENCY</span><span>NEUTRAL</span><span>EXTREME FEAR</span></div>';
  h += '</div>';
  // Component cards: name + current score + reading. Weights and methodology stay private.
  const inds = fi.indicators || {};
  const keys = Object.keys(inds);
  if (keys.length) {
   h += '<div style="font-size:12px;font-weight:700;color:#e8ecf1;margin:16px 0 8px;letter-spacing:0.5px;">MODEL COMPONENTS</div>';
   h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;">';
   keys.forEach((k) => {
    const c = inds[k];
    const cs = c.score || 0;
    const cc = cs > 60 ? "#ff7b1c" : (cs < 40 ? "#3fb950" : "#e8ecf1");
    h += '<div style="background:#161b26;border-radius:8px;padding:12px;">' +
     '<div style="font-size:11px;color:var(--muted);margin-bottom:4px;">' + esc(c.name) + '</div>' +
     '<div style="font-size:20px;font-weight:700;color:' + cc + ';">' + cs + '</div>' +
     '<div style="font-size:11px;color:var(--muted);margin-top:2px;">' + esc(c.details) + '</div></div>';
   });
   h += '</div>';
  }
  if (fi.history && fi.history.length > 1) {
   h += '<div style="font-size:12px;font-weight:700;color:#e8ecf1;margin:16px 0 8px;letter-spacing:0.5px;">30-DAY HISTORY</div>';
   h += '<div class="card" style="padding:16px;"><div style="height:180px;"><canvas id="' + canvasId + '"></canvas></div></div>';
   const histData = fi.history.map((p) => ({ x: p.date, y: p.score }));
   const histLabel = JSON.stringify(histData.map((p) => {
    const s = p.y;
    const lab = s >= 75 ? "Extreme Fear" : (s >= 55 ? "Elevated Fear" : (s >= 45 ? "Neutral" : (s >= 25 ? "Complacency" : "Extreme Complacency")));
    return p.x.slice(5) + " | " + s + " (" + lab + ")";
   }));
   h += '<script>if(window.Chart){new Chart(document.getElementById("' + canvasId + '"),{type:"line",data:{labels:' +
    JSON.stringify(histData.map((p) => p.x.slice(5))) + ',datasets:[{data:' + JSON.stringify(histData.map((p) => p.y)) +
    ',borderColor:"#2979FF",borderWidth:2,tension:0.3,fill:false,pointRadius:3,pointHoverRadius:5}]},' +
    'options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},' +
    'plugins:{legend:{display:false},tooltip:{callbacks:{title:function(items){return ' + histLabel + '[items[0].dataIndex];}}},' +
    'zoom:{zoom:{wheel:{enabled:true},pinch:{enabled:true},mode:"x"},pan:{enabled:true,mode:"x"}}},' +
    'scales:{x:{grid:{display:false},ticks:{color:"#525252",font:{size:9}}},' +
    'y:{min:0,max:100,grid:{color:"#1a1a1a"},ticks:{color:"#525252",font:{size:9},stepSize:25}}}}});}</script>';
  }
  h += '</div>';
  return h;
 }

 route("analysis", async function () {
  // Ensure Pro data is loaded before rendering (fixes race condition)
  await ensureProData();
  if (!isPro()) {
   app.innerHTML = '<div class="crumb">MORNING BRIEFING</div>' +
    '<div class="hero"><div>' +
    '<h1 class="hero-h">Morning Briefing.</h1>' +
    "<p class='hero-sub'>Institutional-grade briefing synthesizing macro, internals, and derivatives positioning. Updated every trading morning.</p></div></div>" +
    '<div class="section"><div class="section-title">Morning Market Analysis <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>' +
    proTeaser("Morning Briefing, Pro", "Institutional-grade morning briefing: macro, internals, gamma positioning, and what to watch today.") + "</div>";
   return;
  }
  const r = D.market_analysis_report;
  let h = '<div class="crumb">MORNING BRIEFING</div>';
  h += '<div class="hero"><div>' +
   '<h1 class="hero-h">Morning Briefing.</h1>' +
   "<p class='hero-sub'>Institutional-grade briefing synthesizing macro, internals, and derivatives positioning. Updated every trading morning.</p></div></div>";
  // Pre-market cross-asset snapshot (Pro)
  h += premarketHtml();
  // Rotation & Pairs Engine (Pro), before the morning briefing
  h += rotationHtml();
  if (r && r.available) {
   h += '<div class="section" style="max-width:none;">' +
    '<div class="section-sub">Published ' + esc((r.as_of || "").slice(0, 16).replace("T", " ")) + " ET</div>" +
    '<div class="card" style="padding:28px;line-height:1.7;font-size:15px;color:#e8ecf1;">' +
    r.html +
    "</div></div>";
   // Previous reports dropdown (identical style to macro analysis section)
   if (r.previous && r.previous.length) {
    const briefingOpts = '<option value="0">Current (' + esc((r.as_of || "").slice(0, 10)) + ')</option>' +
     r.previous.map((p, i) =>
      '<option value="' + (i + 1) + '">' + esc(p.date) + ' - ' + esc((p.headline || "").slice(0, 40)) + '</option>'
     ).join("");
    h += '<div class="section"><div class="section-title">Previous Briefings</div>' +
     '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">' +
     '<span style="font-size:12px;color:#e8ecf1;opacity:0.7;">Select date:</span>' +
     '<select id="briefing-date" style="background:#0f1420;color:#e8ecf1;border:1px solid #2a4a73;border-radius:6px;' +
     'padding:4px 8px;font-size:12px;cursor:pointer;max-width:300px;">' + briefingOpts + "</select></div>" +
     '<div id="briefing-body">' +
     '<div id="briefing-content">' + r.html + "</div>" +
     "</div>" +
     '<script>window.__briefingHistory = ' + JSON.stringify([{ date: r.as_of, headline: r.headline, html: r.html }].concat(r.previous)) + ';</script>' +
     "</div>";
   }
  } else {
   h += '<div class="card"><p style="color:#e8ecf1;">The morning briefing has not been generated yet. Check back after the morning refresh.</p></div>';
  }
  app.innerHTML = h;
  // Wire briefing date dropdown (identical to macro analysis section)
  const briefingSel = document.getElementById("briefing-date");
  if (briefingSel && window.__briefingHistory) {
   briefingSel.addEventListener("change", (e) => {
    e.stopPropagation();
    const idx = parseInt(briefingSel.value);
    const b = window.__briefingHistory[idx];
    if (!b) return;
    const content = document.getElementById("briefing-content");
    if (content && b.html) {
     content.innerHTML = b.html;
     embedAnalysisVisuals();
     // Scroll to top of briefing
     const body = document.getElementById("briefing-body");
     if (body) body.scrollTop = 0;
    }
   });
  }
  // Legacy: wire previous report links (if any remain)
  document.querySelectorAll("[data-report]").forEach((a) => {
   a.addEventListener("click", () => {
    const date = a.dataset.report;
    const prev = (D.market_analysis_report.previous || []).find((p) => p.date === date);
    if (prev && prev.html) {
     document.querySelector(".card").innerHTML = prev.html +
      '<div style="margin-top:20px;"><a href="javascript:void(0)" id="back-current" style="color:#58a6ff;">← Back to current report</a></div>';
     document.getElementById("back-current").addEventListener("click", () => render());
     embedAnalysisVisuals();
    }
   });
  });
  // Embed any visuals referenced in the report
  embedAnalysisVisuals();
 });

 route("alerts", function () {
  if (!isPro()) {
   app.innerHTML = '<div class="section"><div class="section-title">Email Alerts</div>' +
    '<div class="card"><h3>Pro Feature</h3><p>Email alerts for market internals monitors are available to Pro subscribers.</p>' +
    '<button class="btn-gold" onclick="document.getElementById(\'pro-btn\').click()">Go Pro</button></div></div>';
   return;
  }

  let h = '<div class="crumb">PRO · EMAIL ALERTS</div>';
  h += '<div class="hero"><div>' +
   '<h1 class="hero-h">Market Alerts.</h1>' +
   "<p class='hero-sub'>Get notified when the monitors you care about update. Toggle any tracker below.</p></div></div>";
  h += '<div class="section"><div class="section-title">Your Alert Subscriptions</div>' +
   '<div class="section-sub">We\'ll email you at ' + esc(authUser ? authUser.email : "") + ' when these update.</div>' +
   '<div id="alerts-list" style="display:flex;flex-direction:column;gap:12px;">' +
   '<p style="color:#e8ecf1;">Loading your subscriptions...</p></div></div>' +
   '<div class="section"><div class="section-title">Moving Average Cross Alerts</div>' +
   '<div class="section-sub">Get notified when a stock or index crosses its moving average. Works for all current and future coverage tickers.</div>' +
   '<div style="background:#161b26;border-radius:10px;padding:16px;margin-bottom:12px;">' +
   '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px;">' +
   '<div><label style="font-size:12px;color:#e8ecf1;display:block;margin-bottom:4px;">Symbol</label>' +
   '<select id="ma-symbol" style="width:100%;padding:8px;border-radius:6px;background:#0f1420;color:#fff;border:1px solid #2a3448;"></select></div>' +
   '<div><label style="font-size:12px;color:#e8ecf1;display:block;margin-bottom:4px;">MA Period</label>' +
   '<select id="ma-period" style="width:100%;padding:8px;border-radius:6px;background:#0f1420;color:#fff;border:1px solid #2a3448;">' +
   '<option value="10">10-day</option><option value="20">20-day</option>' +
   '<option value="50" selected>50-day</option><option value="100">100-day</option>' +
   '<option value="200">200-day</option></select></div>' +
   '<div><label style="font-size:12px;color:#e8ecf1;display:block;margin-bottom:4px;">Direction</label>' +
   '<select id="ma-direction" style="width:100%;padding:8px;border-radius:6px;background:#0f1420;color:#fff;border:1px solid #2a3448;">' +
   '<option value="either" selected>Either direction</option>' +
   '<option value="above">Cross above (bullish)</option>' +
   '<option value="below">Cross below (bearish)</option></select></div></div>' +
   '<button id="ma-add-btn" class="btn-gold" style="padding:8px 20px;">Add MA Alert</button></div>' +
   '<div id="ma-alerts-list" style="display:flex;flex-direction:column;gap:8px;"><p style="color:#e8ecf1;">Loading...</p></div></div>' +
   '<div class="section"><div class="section-title">Custom Price Alerts</div>' +
   '<div class="section-sub">Get notified when a covered stock hits your target price.</div>' +
   '<div style="background:#161b26;border-radius:10px;padding:16px;margin-bottom:12px;">' +
   '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px;">' +
   '<div><label style="font-size:12px;color:#e8ecf1;display:block;margin-bottom:4px;">Ticker</label>' +
   '<select id="price-ticker" style="width:100%;padding:8px;border-radius:6px;background:#0f1420;color:#fff;border:1px solid #2a3448;"></select></div>' +
   '<div><label style="font-size:12px;color:#e8ecf1;display:block;margin-bottom:4px;">Target Price ($)</label>' +
   '<input id="price-target" type="number" step="0.01" min="0" placeholder="e.g. 450.00" ' +
   'style="width:100%;padding:8px;border-radius:6px;background:#0f1420;color:#fff;border:1px solid #2a3448;"></div>' +
   '<div><label style="font-size:12px;color:#e8ecf1;display:block;margin-bottom:4px;">Trigger When</label>' +
   '<select id="price-direction" style="width:100%;padding:8px;border-radius:6px;background:#0f1420;color:#fff;border:1px solid #2a3448;">' +
   '<option value="above" selected>Price rises above target</option>' +
   '<option value="below">Price falls below target</option></select></div></div>' +
   '<button id="price-add-btn" class="btn-gold" style="padding:8px 20px;">Add Price Alert</button></div>' +
   '<div id="price-alerts-list" style="display:flex;flex-direction:column;gap:8px;"><p style="color:#e8ecf1;">Loading...</p></div></div>';

  app.innerHTML = h;

  // Single batched load: all three lists fetch in parallel and render in one
  // synchronous pass, so the page populates once instead of flashing 3 times
  loadAllAlerts();
 });

 /* Batch-load all alert sections in parallel, then render synchronously.
    Fetching the three lists together and writing the DOM in one pass avoids
    the staggered re-renders that made the page flash on first navigation. */
 async function loadAllAlerts() {
  if (!authUser) return;
  populateMaSymbols();
  wireAlertButtons();
  const listEl = document.getElementById("alerts-list");
  const maListEl = document.getElementById("ma-alerts-list");
  const priceListEl = document.getElementById("price-alerts-list");
  if (!listEl || !maListEl || !priceListEl) return;
  try {
   const [tRes, mRes, pRes] = await Promise.all([
    supa.from("alert_subscriptions").select("tracker_key, is_active")
     .eq("user_id", authUser.id).eq("subscription_type", "tracker"),
    supa.from("alert_subscriptions").select("id, ticker, ma_period, ma_direction, is_active")
     .eq("user_id", authUser.id).eq("subscription_type", "ma_cross").eq("is_active", true).order("ticker"),
    supa.from("alert_subscriptions").select("id, ticker, target_price, price_direction, is_active")
     .eq("user_id", authUser.id).eq("subscription_type", "price_alert").eq("is_active", true).order("ticker"),
   ]);
   if (tRes.error) throw tRes.error;
   if (mRes.error) throw mRes.error;
   if (pRes.error) throw pRes.error;
   const activeMap = {};
   (tRes.data || []).forEach((s) => { activeMap[s.tracker_key] = s.is_active; });
   // All three renders happen back-to-back with no awaits between: one visual update
   renderTrackerToggles(activeMap);
   renderMaAlerts(mRes.data || []);
   renderPriceAlerts(pRes.data || []);
  } catch (err) {
   console.error("Failed to load alerts:", err);
   listEl.innerHTML = '<p style="color:#f85149;">Failed to load subscriptions. Please try again.</p>';
   maListEl.innerHTML = '<p style="color:#f85149;">Failed to load MA alerts.</p>';
   priceListEl.innerHTML = '<p style="color:#f85149;">Failed to load price alerts.</p>';
  }
 }

 // Thin wrappers kept for the add/remove mutation paths (re-render everything at once)
 async function loadAlertSubscriptions() { return loadAllAlerts(); }
 async function loadMaAlerts() { return loadAllAlerts(); }
 async function loadPriceAlerts() { return loadAllAlerts(); }

 function renderTrackerToggles(activeMap) {
  const listEl = document.getElementById("alerts-list");
  if (!listEl) return;
  listEl.innerHTML = ALERT_TRACKERS.map((t) => {
    const isOn = activeMap[t.key] === true;
    return '<div style="background:#161b26;border-radius:10px;padding:16px;display:flex;align-items:center;gap:16px;">' +
     '<div style="flex:1;">' +
     '<div style="font-size:15px;font-weight:700;color:#fff;margin-bottom:4px;">' + esc(t.name) + "</div>" +
     '<div style="font-size:13px;color:#e8ecf1;opacity:0.7;">' + esc(t.desc) + "</div></div>" +
     '<label style="position:relative;display:inline-block;width:52px;height:28px;cursor:pointer;flex-shrink:0;">' +
     '<input type="checkbox" data-tracker="' + t.key + '" ' + (isOn ? "checked" : "") +
     ' style="opacity:0;width:0;height:0;" class="alert-toggle">' +
     '<span style="position:absolute;top:0;left:0;right:0;bottom:0;background:' + (isOn ? "#3fb950" : "#2a2f3a") +
     ';border-radius:28px;transition:0.2s;"></span>' +
     '<span style="position:absolute;top:3px;left:' + (isOn ? "27px" : "3px") + ';width:22px;height:22px;background:#fff;' +
     'border-radius:50%;transition:0.2s;"></span>' +
     "</label></div>";
   }).join("");

   // Attach toggle handlers
   listEl.querySelectorAll(".alert-toggle").forEach((toggle) => {
    toggle.addEventListener("change", async (e) => {
     const trackerKey = e.target.dataset.tracker;
     const isActive = e.target.checked;
     await saveAlertSubscription(trackerKey, isActive);
     // Update visual
     const slider = e.target.nextElementSibling;
     const knob = slider.nextElementSibling;
     if (slider) slider.style.background = isActive ? "#3fb950" : "#2a2f3a";
     if (knob) knob.style.left = isActive ? "27px" : "3px";
    });
   });
 }

 async function saveAlertSubscription(trackerKey, isActive) {
  if (!authUser) return;
  try {
   // Upsert: update if exists, insert if not
   const { data: existing } = await supa
    .from("alert_subscriptions")
    .select("id")
    .eq("user_id", authUser.id)
    .eq("subscription_type", "tracker")
    .eq("tracker_key", trackerKey)
    .single();

   if (existing) {
    await supa
     .from("alert_subscriptions")
     .update({ is_active: isActive })
     .eq("id", existing.id);
   } else {
    await supa
     .from("alert_subscriptions")
     .insert({
      user_id: authUser.id,
      subscription_type: "tracker",
      tracker_key: trackerKey,
      is_active: isActive,
     });
   }
  } catch (err) {
   console.error("Failed to save subscription:", err);
  }
 }

 /* ---------- MA Cross Alerts ---------- */
 function populateMaSymbols() {
  const sel = document.getElementById("ma-symbol");
  const priceSel = document.getElementById("price-ticker");
  if (!sel) return;
  // Indices first, then all coverage tickers (auto-includes future additions)
  let opts = '<option value="QQQ">QQQ, Nasdaq 100</option><option value="SPY">SPY, S&P 500</option>';
  opts += ORDER.map((tk) => '<option value="' + esc(tk) + '">' + esc(tk) + ", " + esc((TICKERS[tk] || {}).name || "") + "</option>").join("");
  sel.innerHTML = opts;
  if (priceSel) {
   priceSel.innerHTML = ORDER.map((tk) => '<option value="' + esc(tk) + '">' + esc(tk) + ", " + esc((TICKERS[tk] || {}).name || "") + "</option>").join("");
  }
 }

 function renderMaAlerts(data) {
  const listEl = document.getElementById("ma-alerts-list");
  if (!listEl) return;
  {
   if (!data || !data.length) {
    listEl.innerHTML = '<p style="color:#e8ecf1;opacity:0.6;">No MA cross alerts yet. Add one above.</p>';
   } else {
    listEl.innerHTML = data.map((s) => {
     const dirLabel = s.ma_direction === "above" ? "cross above" : s.ma_direction === "below" ? "cross below" : "cross either way";
     return '<div style="background:#161b26;border-radius:8px;padding:12px 16px;display:flex;align-items:center;gap:12px;">' +
      '<div style="flex:1;font-size:14px;color:#fff;"><b>' + esc(s.ticker) + "</b> " + dirLabel +
      ' <b>' + s.ma_period + "-day MA</b></div>" +
      '<button data-ma-del="' + s.id + '" style="background:#f85149;border:0;color:#fff;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;">Remove</button></div>';
    }).join("");
    listEl.querySelectorAll("[data-ma-del]").forEach((btn) => {
     btn.addEventListener("click", async () => {
      await supa.from("alert_subscriptions").update({ is_active: false }).eq("id", btn.dataset.maDel);
      loadMaAlerts();
     });
    });
   }
  }
 }

 /* Wire the MA and price "Add" buttons once (called from loadAllAlerts) */
 function wireAlertButtons() {
  const maAddBtn = document.getElementById("ma-add-btn");
  if (maAddBtn && !maAddBtn.dataset.wired) {
   maAddBtn.dataset.wired = "1";
   maAddBtn.addEventListener("click", async () => {
    const ticker = document.getElementById("ma-symbol").value;
    const period = parseInt(document.getElementById("ma-period").value, 10);
    const direction = document.getElementById("ma-direction").value;
    if (!ticker) return;
    const { error } = await supa.from("alert_subscriptions").insert({
     user_id: authUser.id,
     subscription_type: "ma_cross",
     ticker: ticker,
     ma_period: period,
     ma_direction: direction,
     is_active: true,
    });
    if (error) { console.error("Failed to add MA alert:", error); return; }
    loadMaAlerts();
   });
  }
  const priceAddBtn = document.getElementById("price-add-btn");
  if (priceAddBtn && !priceAddBtn.dataset.wired) {
   priceAddBtn.dataset.wired = "1";
   priceAddBtn.addEventListener("click", async () => {
    const ticker = document.getElementById("price-ticker").value;
    const target = parseFloat(document.getElementById("price-target").value);
    const direction = document.getElementById("price-direction").value;
    if (!ticker || !target || target <= 0) return;
    const { error } = await supa.from("alert_subscriptions").insert({
     user_id: authUser.id,
     subscription_type: "price_alert",
     ticker: ticker,
     target_price: target,
     price_direction: direction,
     is_active: true,
    });
    if (error) { console.error("Failed to add price alert:", error); return; }
    document.getElementById("price-target").value = "";
    loadPriceAlerts();
   });
  }
 }

 /* ---------- Price Alerts ---------- */
 function renderPriceAlerts(data) {
  const listEl = document.getElementById("price-alerts-list");
  if (!listEl) return;
  {
   if (!data || !data.length) {
    listEl.innerHTML = '<p style="color:#e8ecf1;opacity:0.6;">No price alerts yet. Add one above.</p>';
   } else {
    listEl.innerHTML = data.map((s) => {
     const dirLabel = s.price_direction === "above" ? "rises above" : "falls below";
     return '<div style="background:#161b26;border-radius:8px;padding:12px 16px;display:flex;align-items:center;gap:12px;">' +
      '<div style="flex:1;font-size:14px;color:#fff;"><b>' + esc(s.ticker) + "</b> " + dirLabel +
      ' <b>$' + parseFloat(s.target_price).toFixed(2) + "</b></div>" +
      '<button data-price-del="' + s.id + '" style="background:#f85149;border:0;color:#fff;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;">Remove</button></div>';
    }).join("");
    listEl.querySelectorAll("[data-price-del]").forEach((btn) => {
     btn.addEventListener("click", async () => {
      await supa.from("alert_subscriptions").update({ is_active: false }).eq("id", btn.dataset.priceDel);
      loadPriceAlerts();
     });
    });
   }
  }
 }

 /* ================= TICKER ================= */
 let fcfChart = null, priceChart = null, sandboxChart = null;

 route("ticker", function (tk) {
  tk = (tk || "").toUpperCase();
  const t = TICKERS[tk];
  if (!t) { app.innerHTML = '<div class="card"><h3>Unknown ticker</h3><p><a href="#/">Back home</a></p></div>'; return; }
  if (fcfChart) { fcfChart.destroy(); fcfChart = null; }
  if (priceChart) { priceChart.destroy(); priceChart = null; }
  if (sandboxChart) { sandboxChart.destroy(); sandboxChart = null; }

  const score = cascadiaScore(t);
  const attrScore = t.scorecard && t.scorecard.score;
  const attrBand = attrScore != null ? (attrScore >= 80 ? "Highly Attractive" : attrScore >= 65 ? "Attractive" : attrScore >= 50 ? "Fair" : attrScore >= 35 ? "Unattractive" : "Avoid") : null;
  let h = '<div class="tk-kicker">DCF COVERAGE · SINGLE-NAME RESEARCH</div>';
  h += '<div class="ticker-head" style="display:flex;align-items:center;gap:12px;"><div>' + tickerLogo(tk) + '</div><div><h1 style="margin:0;">' + esc(tk) + '</h1><span class="co-name">' + esc(t.name) + "</span>";
  const ind = tickerIndustry(tk);
  if (ind) h += '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' + esc(ind) + "</div>";
  h += "</div>";
  // Scores: Cascadia Score and Growth & Value Index (scorecard), labelled and distinguishable
  if (isPro()) {
    h += '<div style="display:flex;gap:16px;align-items:center;margin-left:8px;">';
    if (score != null) {
      h += '<div style="text-align:center;"><span class="score-badge ' + scoreClass(score) + '" title="' + esc(scoreTooltip(t)) + '">' + score + '</span><div style="font-size:10px;color:var(--muted);margin-top:4px;letter-spacing:0.5px;">CASCADIA</div></div>';
    }
    if (attrScore != null) {
      h += '<div style="text-align:center;"><span class="score-badge ' + scoreClass(attrScore) + '" style="border:2px solid #c9a961;" title="Investment Scorecard: ' + attrBand + ' (Pro)">' + attrScore + '</span><div style="font-size:10px;color:#c9a961;margin-top:4px;letter-spacing:0.5px;font-weight:600;">GROWTH &amp; VALUE INDEX</div></div>';
    }
    h += '</div>';
  }
  h += "</div>";
  h += '<div class="price-line"><span class="price-big">' + fmt$(t.price) + "</span>" +
   '<span class="price-date">AS OF ' + esc(refreshTs(t)) + "</span>" +
   '<span class="' + ratingCls(t.rating) + '">' + esc(t.rating || "") + "</span></div>";

  // target cards
  h += '<div class="target-cards">' +
   [["Bear", t.bear, "bear", t.bear != null && t.price ? (t.bear / t.price - 1) * 100 : null],
    ["Base", t.base, "base", t.upside_base],
    ["Bull", t.bull, "bull", t.bear != null && t.price ? (t.bull / t.price - 1) * 100 : null]
   ].map((c) =>
    '<div class="target-card ' + c[2] + '"><div class="lbl">' + c[0] + '</div>' +
    '<div class="val">' + fmt$(c[1], 0) + '</div>' +
    '<div class="up ' + cls(c[3]) + '">' + fmtPct(c[3]) + " vs price</div></div>"
   ).join("") + "</div>";
  h += '<div class="blended-bar"><span class="blbl">Blended target (bear/base/bull probability-weighted)</span>' +
   '<span class="blval">' + fmt$(t.blended, 2) + "</span></div>";
  if (t.wacc) h += '<div class="wacc-line">WACC ' + (t.wacc * 100).toFixed(2) + "%" +
   (t.shares_m ? " · " + t.shares_m.toFixed(1) + "M DILUTED SHARES" : "") + "</div>";

  // price history
  if (t.history && t.history.length > 5) {
   h += '<div class="card"><h3>Price History</h3><div class="chart-box"><canvas id="price-chart"></canvas></div></div>';
  }

  // FCF chart (free, interactive tooltips)
  const fcf = t.fcf || {};
  const hasFcf = fcf.base && fcf.base.fcf_m && fcf.base.fcf_m.length;
  if (hasFcf) {
   h += '<div class="card"><h3>Unlevered Free Cash Flow Projection</h3>' +
    '<div class="section-sub">Modeled unlevered FCF by scenario. Hover or tap a bar for values.</div>' +
    '<div class="chart-box"><canvas id="fcf-chart"></canvas></div></div>';
  }

  // Reverse DCF note (free)
  h += '<div class="card"><h3>Reverse DCF</h3><div class="section-sub">What the market is pricing in at the current quote.</div>' +
   reverseDcfHtml(t) + "</div>";

  // Valuation multiples (free) - logo colors: forest green + gold
  h += '<div class="card"><h3>Valuation</h3><div class="section-sub">Market cap, enterprise value and trading multiples.</div>' +
   valuationHtml(t) + "</div>";

  // Sum of the parts (AXON only, Pro-gated)
  if (t.sotp) {
   h += '<div class="section"><div class="section-title">Sum of the Parts</div>';
   h += gated("Sum of the Parts, Pro",
    "Axon's five-segment bottom-up build: 2036 revenue and EBITDA by business line.",
    sotpHtml(t));
   h += "</div>";
  }

  // Rails three-way comparison (UNP/CSX/NSC, free)
  if (t.rails_comp) {
   h += '<div class="section"><div class="section-title">Class 1 Rails Comparison</div>' +
    '<div class="section-sub">Side-by-side DCF targets for the three US Class 1 rails.</div>' +
    '<div class="card">' + railsCompHtml(t) + "</div></div>";
  }

  // Financial statements (free for all)
  if (t.financials) {
   h += '<div class="section"><div class="section-title">Financials</div>';
   h += financialsHtml(t);
   h += "</div>";
  }

  // Moving averages (Pro)
  h += '<div class="section"><div class="section-title">Moving Averages</div>';
  h += gated("Moving Averages, Pro", "Daily, weekly, and monthly trend signals with 10/20/30/50/100/200-period SMAs and EMAs.", '<div class="section-head"><h2>Moving Averages</h2><p>Daily, weekly, and monthly trend signals with 10/20/30/50/100/200-period SMAs and EMAs.</p></div>' + maHtml(tk));
  h += "</div>";

  // Trading Trends (FREE), quarterly hedge fund + insider flows with price
  h += '<div class="section"><div class="section-title">Trading Trends</div>';
  h += '<div class="section-sub">Quarterly institutional and insider buy/sell flows with the price trend. Hedge fund data from 13F filings, insider data from SEC Form 4.</div>';
  h += tickerTrendsHtml(tk);
  h += "</div>";

  // Insider Transactions (FREE), SEC Form 4
  h += '<div class="section"><div class="section-title">Insider Transactions</div>';
  h += '<div class="section-sub">Recent insider buys and sells from SEC Form 4 filings. Open-market transactions signal conviction and are highlighted.</div>';
  h += tickerInsiderHtml(tk);
  h += "</div>";

  // Agency Risk (Pro) - Executive Alignment & Agency Risk Score
  h += '<div class="section"><div class="section-title">Agency Risk</div>';
  h += gated("Agency Risk, Pro", "Executive alignment score: insider ownership, open-market Form 4 flow, and pay-for-performance. Detects value traps and mercenary management.", '<div id="agency-risk-' + tk + '"><div style="text-align:center;padding:20px;color:var(--muted);">Loading agency risk data...</div></div><script>loadAgencyRisk("' + tk + '")</script>');
  h += "</div>";

  // Seasonality (Pro) - average monthly returns from price history
  h += '<div class="section"><div class="section-title">Seasonality</div>';
  h += gated("Seasonality, Pro", "Average monthly returns by calendar month, computed from price history.", seasonalityHtml(tk));
  h += "</div>";

  // Options flow (Pro)
  h += '<div class="section"><div class="section-title">Unusual Options Flow</div>';
  h += gated("Options Flow, Pro", "Large, unusual prints over the last 10 trading days with directional read.", optionsHtml(tk));
  h += "</div>";

  // Dark Pool & Off-Exchange Flow (FREE), FINRA Reg SHO daily
  h += '<div class="section"><div class="section-title">Dark Pool Flow</div>';
  h += '<div style="font-size:12px;color:var(--muted);margin-bottom:8px;">Institutional off-exchange sentiment for ' + esc(tk) + ' from FINRA Reg SHO daily files. High dark short ratio means dealers are shorting to fill institutional buy orders (accumulation).</div>';
  h += darkPoolHtml(tk);
  h += "</div>";

  // Gamma Exposure (Pro), per-ticker dealer positioning
  const tg = (D.ticker_gex || {})[tk];
  h += '<div class="section"><div class="section-title">Gamma Exposure (GEX) <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>';
  h += gated("Gamma Exposure, Pro",
   "Live dealer gamma positioning for " + tk + ", see whether market makers will dampen or amplify the next move.",
   (tg && tg.available) ? tickerGexHtml(tk, tg) +
   '<div class="section-title" style="margin-top:16px;">GEX by Strike</div>' +
   gexStrikeChartHtml(tk, tg, "gex-strike-" + tk) : '<div class="card"><p style="color:var(--muted)">No GEX data available for this ticker.</p></div>');
  h += "</div>";

  // Volatility Skew (Pro), per-ticker put/call IV skew
  const ts = (D.ticker_skew || {})[tk];
  h += '<div class="section"><div class="section-title">Volatility Skew <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>';
  h += gated("Volatility Skew, Pro",
   "Put vs call implied volatility for " + tk + ", what is smart money paying for?",
   (ts && ts.available) ? tickerSkewHtml(tk, ts) : '<div class="card"><p style="color:var(--muted)">No skew data available for this ticker.</p></div>');
  h += "</div>";

  // Short Interest (Pro), FINRA biweekly data
  h += '<div class="section"><div class="section-title">Short Interest <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>';
  h += gated("Short Interest, Pro",
   "Biweekly short interest for " + tk + " from FINRA, red bars show shares short, white line shows days to cover.",
   '<div id="short-interest-' + esc(tk) + '"></div>');
  h += "</div>";

  // Technical Analysis (Pro), multi-timeframe
  h += '<div class="section"><div class="section-title">Technical Analysis <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>';
  h += gatedSafe("Technical Analysis, Pro",
   "Multi-timeframe technical analysis (daily, weekly, monthly) with RSI, MACD, moving averages, and key levels for " + tk + ".",
   () => technicalAnalysisHtml(tk));
  h += "</div>";

  // Company-specific significant news (free)
  const cnews = (D.company_news || []).filter((n) => n.ticker === tk).slice(0, 5);
  if (cnews.length) {
   h += '<div class="section"><div class="section-title">Company News</div><div class="card">';
   h += cnews.map((n) => '<div class="news-item"><div class="news-headline">' + esc(n.headline) + "</div>" +
    '<div class="panel-summary">' + esc(n.summary || "") + "</div>" +
    '<div class="news-meta"><span>' + esc(n.category || "").replace(/_/g, " ") + " · " + timeAgo(n.timestamp) + "</span>" +
    (n.url ? ' <a href="' + esc(n.url) + '" target="_blank" rel="noopener" style="color:#58a6ff;">Source</a>' : "") +
    "</div></div>").join("");
   h += "</div></div>";
  }

  // Macro takes: headlines/links free, take analysis Pro-gated, indicator trends free
  const takes = (D.ticker_macro || {})[tk] || [];
  const proTakes = (D.ticker_macro_takes || {})[tk] || [];
  const indTakes = (D.ticker_indicator_takes || {})[tk] || [];
  // For Pro users, use the full takes with analysis text
  const displayTakes = isPro() && proTakes.length ? proTakes : takes;
  if (takes.length || indTakes.length) {
   h += '<div class="section"><div class="section-title">Macro Takes</div><div class="card">';
   // 12-month indicator trends first (structural macro context, free)
   if (indTakes.length) {
    h += '<div style="font-size:12px;font-weight:700;color:#c9a961;margin-bottom:8px;">12-MONTH INDICATOR TRENDS</div>';
    h += indTakes.map((m) => '<div class="news-item">' +
     '<div class="news-headline">' + esc(m.headline) + "</div>" +
     '<div class="panel-summary">' + esc(m.take || "") + "</div>" +
     '<div class="news-meta"><span>' + esc(m.period || "") + "</span></div></div>").join("");
   }
   // Recent news takes: headlines + links free, analysis Pro-gated
   if (takes.length) {
    h += '<div style="font-size:12px;font-weight:700;color:#c9a961;margin:12px 0 8px;">RECENT MACRO NEWS</div>';
    h += displayTakes.map((m) => '<div class="news-item">' +
     (m.url ? '<a href="' + esc(m.url) + '" target="_blank" rel="noopener" class="news-h" style="text-decoration:none;color:inherit;"><div class="news-headline">' + esc(m.headline) + "</div></a>"
      : '<div class="news-headline">' + esc(m.headline) + "</div>") +
     (isPro() && m.take ? '<div class="panel-summary">' + esc(m.take) + "</div>"
      : '<div style="font-size:12px;color:var(--muted);font-style:italic;">Pro analysis available. <a href="#/pricing" style="color:#c9a961;">Upgrade to Pro</a></div>') +
     '<div class="news-meta"><span>' + timeAgo(m.timestamp) + (m.source ? " · " + esc(m.source) : "") + "</span></div></div>").join("");
   }
   h += "</div></div>";
  }

  // Bellwether readthroughs (free)
  const rts = (D.readthroughs || {})[tk] || [];
  if (rts.length) {
   h += '<div class="section"><div class="section-title">Bellwether Read-Throughs</div><div class="card">';
   h += rts.map((r) => '<div class="news-item"><div class="news-headline">' + esc(r.bellwether) + ", " + esc(r.quarter || "") + "</div>" +
    '<div class="panel-summary">' + esc(r.text) + "</div>" +
    '<div class="news-meta"><span>' + esc(r.date || "") + "</span></div></div>").join("");
   h += "</div></div>";
  }

  // Earnings history (Pro)
  // Earnings date & whisper (free) - confirmed date, consensus vs whisper
  h += '<div class="section"><div class="section-title">Earnings Date & Whisper</div>' + earningsDateHtml(tk) + "</div>";

  // Earnings revisions (free) - Zacks-style 90-day revision trends
  h += '<div class="section"><div class="section-title">Earnings Revisions</div>' + revisionsHtml(tk) + "</div>";

  h += '<div class="section"><div class="section-title">Earnings History</div>';
  h += gated("Earnings History, Pro", "Four-quarter rolling earnings reviews: verdict, bull/bear cases, KPIs, guidance.", earningsHtml(tk));
  h += "</div>";

  // Earnings Call Tone (Pro) - AI NLP analysis of executive tone
  const toneData = (D.transcript_tone || {})[tk];
  if (toneData) {
   h += '<div class="section"><div class="section-title">Earnings Call Tone <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>';
   h += gated("Earnings Tone, Pro", "AI-powered NLP analysis of the latest earnings call: executive confidence, tone classification, pillar breakdown, and Q&A deconstruction.", toneHtml(tk, toneData));
   h += "</div>";
  }

  // Client note (Pro)
  h += '<div class="section"><div class="section-title">Client Note</div>';
  h += gated("Client Note, Pro", "Full research note with model detail.",
   t.note && t.note.pdf_exists
    ? '<div class="card"><h3>' + esc(t.name) + ", Research Note</h3>" +
     '<div class="panel-summary">Published ' + esc(t.note.published_date || "") + "</div>" +
     '<div style="margin-top:12px;"><button class="btn" onclick="openPdfModal(\'' + esc(t.note.pdf).replace(/'/g, "\\'") + '\', \'' + esc(t.name + ", Research Note").replace(/'/g, "\\'") + '\')">Open PDF</button></div></div>'
    : '<div class="card"><p style="color:var(--muted)">No client note published for this ticker yet.</p></div>');
  h += "</div>";

  // Investment Scorecard (Pro)
  h += '<div class="section"><div class="section-title">Investment Scorecard</div>';
  h += gated("Investment Scorecard, Pro", "One-glance 0-100 Growth & Value Index with five pillar breakdowns.",
   t.scorecard && t.scorecard.pdf_exists
    ? '<div class="card"><h3>' + esc(t.name) + ", Investment Scorecard</h3>" +
     '<div style="margin-top:12px;"><button class="btn" onclick="openPdfModal(\'' + esc(t.scorecard.pdf).replace(/'/g, "\\'") + '\', \'' + esc(t.name + ", Investment Scorecard").replace(/'/g, "\\'") + '\')">Open PDF</button></div></div>'
    : '<div class="card"><p style="color:var(--muted)">No scorecard published for this ticker yet.</p></div>');
  h += "</div>";

  // Assumption sandbox (Pro)
  h += '<div class="section"><div class="section-title">Assumption Sandbox</div>';
  h += gated("Assumption Sandbox, Pro", "Rebuild the valuation with your own assumptions: drag the sliders and watch the implied price move.",
   '<div class="card" id="sandbox-card"></div>');
  h += "</div>";

  app.innerHTML = h;
  drawPriceChart(t);
  drawFcfChart(t);
  if (isPro()) initSandbox(tk, t);
  wireEarningsTabs(tk);
  wireFinTabs(tk);
  wireIncomeChart(tk);
  wireBalanceChart(tk);
  wireCashflowChart(tk);
  wireValuation(tk);
  // Short interest chart (Pro), render after DOM insert
  // Retry up to 5 times waiting for ShortInterestChart to load
  let siAttempts = 0;
  const tryRenderSI = () => {
   const siEl = document.getElementById("short-interest-" + tk);
   if (siEl && typeof ShortInterestChart !== "undefined") {
    ShortInterestChart.render(siEl, { ticker: tk, dataUrl: "ticker_short_interest.json" });
   } else if (siEl && siAttempts < 5) {
    siAttempts++;
    setTimeout(tryRenderSI, 500);
   } else if (siEl) {
    siEl.innerHTML = '<div class="card"><p style="color:var(--muted)">Short interest data unavailable.</p></div>';
   }
  };
  setTimeout(tryRenderSI, 100);
 });

 function reverseDcfHtml(t) {
  if (t.upside_base == null) return '<p style="color:var(--muted)">Not available.</p>';
  const u = t.upside_base;
  const verdict = u > 25 ? "The market is pricing in a bear-case outcome; the base case implies significant upside." :
   u > 10 ? "The market is pricing in below-base-case growth; moderate upside to the base target." :
   u > -10 ? "The market is pricing in roughly the base case; the stock screens as fairly valued on our numbers." :
   "The market is pricing in a bull-case outcome; limited upside to our targets at the current quote.";
  let h = '<div class="panel-summary">Base-case upside of&nbsp;<b class="' + cls(u) + '">' + fmtPct(u) + "</b>&nbsp;at&nbsp;" + fmt$(t.price) +
   ". " + verdict + "</div>";

  // Price vs targets visual
  if (t.bear != null && t.base != null && t.bull != null && t.price != null) {
   const lo = Math.min(t.bear, t.price) * 0.9, hi = Math.max(t.bull, t.price) * 1.05;
   const pct = (v) => ((v - lo) / (hi - lo) * 100).toFixed(1);
   const dot = (v, color) =>
    '<div style="position:absolute;left:' + pct(v) + '%;top:-4px;bottom:-4px;width:2px;background:' + color + ';" title="' + fmt$(v) + '"></div>';
   h += '<div style="margin:20px 0 12px;">' +
    '<div style="font-size:13px;color:#c8d0dc;margin-bottom:12px;font-weight:600;">Price vs targets</div>' +
    '<div style="position:relative;height:10px;background:#2a3448;border-radius:5px;margin:0 12px;">' +
    dot(t.bear, "#f87171") + dot(t.base, "#c9a961") + dot(t.bull, "#6a9a6a") +
    '<div style="position:absolute;left:' + pct(t.price) + '%;top:-7px;width:14px;height:24px;background:#fff;border-radius:3px;transform:translateX(-50%);box-shadow:0 0 8px rgba(255,255,255,0.4);" title="Current: ' + fmt$(t.price) + '"></div>' +
    "</div>" +
    '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:10px;padding:0 4px;">' +
    '<div style="font-size:13px;"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#f87171;margin-right:6px;"></span><span style="color:#e8ecf1;">Bear ' + fmt$(t.bear) + '</span></div>' +
    '<div style="font-size:13px;"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#fff;margin-right:6px;"></span><span style="color:#e8ecf1;font-weight:700;">Current ' + fmt$(t.price) + '</span></div>' +
    '<div style="font-size:13px;"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#c9a961;margin-right:6px;"></span><span style="color:#e8ecf1;">Base ' + fmt$(t.base) + '</span></div>' +
    '<div style="font-size:13px;"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#6a9a6a;margin-right:6px;"></span><span style="color:#e8ecf1;">Bull ' + fmt$(t.bull) + '</span></div>' +
    "</div></div>";
  }

  // Reverse DCF from the DCF sheet (source of truth for market-implied CAGR).
  // The sheet's Reverse DCF tab computes this properly with the full model;
  // the old JS recomputation used a flawed single-point growth approximation.
  const rdcf = t.reverse_dcf;
  if (rdcf && rdcf.implied_cagr != null) {
   const cagrPct = (rdcf.implied_cagr * 100).toFixed(1);
   h += '<div style="margin-top:20px;padding:14px;background:#16191f;border:1px solid #232833;border-radius:12px;">' +
    '<div style="font-size:13px;color:#c8d0dc;font-weight:600;margin-bottom:8px;">Market-implied revenue CAGR</div>' +
    '<div style="font-size:28px;font-weight:800;color:#c7af7f;">' + cagrPct + '%</div>';
   if (rdcf.verdict && typeof rdcf.verdict === "string" && rdcf.verdict.length > 2)
    h += '<div style="font-size:13px;color:#9ba3af;margin-top:6px;">' + esc(rdcf.verdict) + "</div>";
   if (rdcf.fcf_margin != null)
    h += '<div style="font-size:12px;color:#8b93a7;margin-top:6px;">Base-case FCF margin: ' + (rdcf.fcf_margin * 100).toFixed(1) + '% (held flat)</div>';
   h += "</div>";
   const tbl = rdcf.table || [];
   if (tbl.length) {
    // Pick rows at 10% CAGR increments (e.g., -10%, 0%, 10%, 20%...)
    // plus the market-implied row, sorted by CAGR
    const picked = [];
    const seen = new Set();
    for (const r of tbl) {
     const gPct = Math.round(r[0] * 100);
     if (gPct % 10 === 0 && !seen.has(gPct)) {
      seen.add(gPct);
      picked.push(r);
     }
    }
    // Always include the market-implied row
    let implRow = null;
    let bestDiff = 0.005;
    for (const r of tbl) {
     const d = Math.abs(r[0] - rdcf.implied_cagr);
     if (d < bestDiff) { bestDiff = d; implRow = r; }
    }
    if (implRow && !picked.includes(implRow)) picked.push(implRow);
    picked.sort((a, b) => a[0] - b[0]);
    const rows = picked.slice(0, 14);
    h += '<div style="margin-top:16px;"><div style="font-size:13px;color:#c8d0dc;margin-bottom:10px;font-weight:600;">Implied price by revenue CAGR (from DCF model)</div>' +
     '<div class="table-wrap"><table class="coverage ma-table" style="color:#e8ecf1;"><thead><tr><th style="color:#a8b0bc;">CAGR</th><th style="color:#a8b0bc;">Implied price</th><th style="color:#a8b0bc;">vs current</th></tr></thead><tbody>' +
     rows.map((r) => {
      const g = r[0] * 100, p = r[2];
      if (p == null) return "";
      const isImpl = Math.abs(r[0] - rdcf.implied_cagr) < 0.015;
      const chg = t.price ? (p / t.price - 1) * 100 : null;
      return "<tr" + (isImpl ? ' style="background:rgba(201,169,97,0.15);"' : "") + '><td style="color:#e8ecf1;">' + g.toFixed(1) + "%" + (isImpl ? " \u2190 market" : "") + '</td><td style="color:#e8ecf1;">' + fmt$(p) +
       '</td><td class="' + (chg == null ? "" : cls(chg)) + '">' + (chg == null ? "N/A" : fmtPct(chg)) + "</td></tr>";
     }).join("") + "</tbody></table></div></div>";
   }
  } else {
   h += '<p style="color:var(--muted);margin-top:12px;">Reverse DCF details unavailable for this ticker.</p>';
  }
  return h;
 }

 function railsCompHtml(t) {
  const rc = t.rails_comp;
  if (!rc) return "";
  const tks = rc.tickers;
  function fmtVal(v, format) {
   if (v == null) return " - ";
   if (format === "currency") return fmt$(v);
   if (format === "percent") return fmtPct(v * 100);
   if (format === "multiple") return v.toFixed(1) + "x";
   return String(v);
  }
  let h = '<div class="table-wrap"><table class="coverage"><thead><tr><th></th>' +
   tks.map((tk) => "<th>" + tickerLink(tk) + "</th>").join("") + "</tr></thead><tbody>";
  rc.metrics.forEach((m) => {
   const rowCls = m.highlight ? ' class="sotp-total"' : "";
   h += "<tr" + rowCls + "><td>" + esc(m.label) + "</td>" +
    tks.map((tk) => {
     const v = m[tk];
     const cellCls = m.format === "percent" ? cls(v * 100) : "";
     return '<td class="' + cellCls + '">' + fmtVal(v, m.format) + "</td>";
    }).join("") + "</tr>";
  });
  h += "</tbody></table></div>";
  h += '<div class="panel-summary">Best long (highest upside): <b>' + esc(rc.best_long) + "</b>. " + esc(rc.note) + "</div>";
  return h;
 }

 function financialsHtml(t) {
  const f = t.financials;
  if (!f) return '<div class="card"><p style="color:var(--muted)">Financial statements not available.</p></div>';
  // Line item definitions: [label, key, format]
  const INC_ROWS = [
   ["Revenue", "revenue", "$M"],
   ["Gross Profit", "gross_profit", "$M"],
   ["Operating Income", "operating_income", "$M"],
   ["Net Income", "net_income", "$M"],
   ["EBITDA", "ebitda", "$M"],
   ["Diluted EPS", "diluted_eps", "$"],
  ];
  const BAL_ROWS = [
   ["Total Assets", "total_assets", "$M"],
   ["Total Liabilities", "total_liabilities", "$M"],
   ["Total Equity", "total_equity", "$M"],
   ["Cash & Equivalents", "cash", "$M"],
   ["Long-Term Debt", "long_term_debt", "$M"],
   ["Total Debt", "total_debt", "$M"],
  ];
  const CF_ROWS = [
   ["Operating Cash Flow", "operating_cash_flow", "$M"],
   ["Capital Expenditures", "capex", "$M"],
   ["Free Cash Flow", "free_cash_flow", "$M"],
   ["Financing Cash Flow", "financing_cash_flow", "$M"],
  ];
  function fmtVal(v, fmt) {
   if (v == null) return " - ";
   if (fmt === "$") return "$" + Number(v).toFixed(2);
   return (v < 0 ? "-$" : "$") + Math.abs(v / 1e6).toLocaleString("en-US", {maximumFractionDigits: 1}) + "M";
  }
  function yoy(rows, key, years) {
   // YoY % change for the most recent year
   if (years.length < 2) return "";
   const cur = rows.find(r => r.year === years[0]);
   const prev = rows.find(r => r.year === years[1]);
   if (!cur || !prev) return "";
   const c = cur[key], p = prev[key];
   if (c == null || p == null || p === 0) return "";
   const chg = (c - p) / Math.abs(p) * 100;
   const cls = chg >= 0 ? "up" : "down";
   const arrow = chg >= 0 ? "▲" : "▼";
   return ' <span class="yoy ' + cls + '">' + arrow + " " + Math.abs(chg).toFixed(1) + "%</span>";
  }
  function stmtTable(rows, defs) {
   if (!rows || !rows.length) return '<p style="color:var(--muted)">No data.</p>';
   const years = rows.map(r => r.year).sort((a, b) => b - a);
   let h = '<div class="table-wrap"><table class="fin-table"><thead><tr><th></th>';
   years.forEach(y => { h += "<th class=\"num\">" + y + "</th>"; });
   h += "</tr></thead><tbody>";
   defs.forEach(([label, key, fmt]) => {
    h += "<tr><td>" + label + "</td>";
    years.forEach(y => {
     const row = rows.find(r => r.year === y);
     const v = row ? row[key] : null;
     h += '<td class="num">' + fmtVal(v, fmt) + (y === years[0] ? yoy(rows, key, years) : "") + "</td>";
    });
    h += "</tr>";
   });
   h += "</tbody></table></div>";
   return h;
  }
  const uid = "fin-" + t.ticker;
  let h = '<div class="card"><h3>Financial Statements</h3>' +
   '<div class="section-sub">Annual filings via Yahoo Finance. All values in $M unless noted. Free for all readers.</div>' +
   '<div class="fin-tabs" id="' + uid + '-tabs">' +
   '<button class="fin-tab active" data-fin="income">Income Statement</button>' +
   '<button class="fin-tab" data-fin="balance">Balance Sheet</button>' +
   '<button class="fin-tab" data-fin="cashflow">Cash Flow</button>' +
   "</div>" +
   '<div class="fin-panel" id="' + uid + '-income">' + incomeChartHtml(t) + stmtTable(f.income, INC_ROWS) + "</div>" +
   '<div class="fin-panel" id="' + uid + '-balance" style="display:none">' + balanceChartHtml(t) + stmtTable(f.balance, BAL_ROWS) + "</div>" +
   '<div class="fin-panel" id="' + uid + '-cashflow" style="display:none">' + cashflowChartHtml(t) + stmtTable(f.cashflow, CF_ROWS) + "</div>" +
   '<div class="panel-asof">Source: company filings via Yahoo Finance</div></div>';
  return h;
 }

 // Interactive dual-axis income chart: Revenue + Net Income bars, Net Margin % line
 // Annual/Quarterly toggle. Data from t.income_chart (collect_income_charts.py).
 function incomeChartHtml(t) {
  const ic = t.income_chart;
  if (!ic || (!ic.annual.length && !ic.quarterly.length)) return "";
  const uid = "inc-" + t.ticker;
  let h = '<div style="margin-bottom:20px;">' +
   '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">' +
   '<div style="font-size:14px;font-weight:700;color:#e8ecf1;">Revenue, Net Income & Margin</div>' +
   '<div class="inc-toggle" id="' + uid + '-toggle" style="display:inline-flex;padding:3px;background:#0f1420;border-radius:8px;">' +
   '<button data-mode="annual" style="padding:5px 14px;font-size:12px;font-weight:600;border:0;border-radius:6px;cursor:pointer;background:transparent;color:#8b93a7;">Annual</button>' +
   '<button data-mode="quarterly" class="active" style="padding:5px 14px;font-size:12px;font-weight:600;border:0;border-radius:6px;cursor:pointer;background:#2a4a73;color:#fff;">Quarterly</button>' +
   "</div></div>" +
   '<div class="zoomable-chart" data-chart="income" data-ticker="' + esc(t.ticker) + '" data-mode="quarterly" id="' + uid + '-wrap" style="position:relative;height:300px;cursor:zoom-in;" title="Click to zoom">' +
   '<canvas id="' + uid + '-canvas"></canvas></div>' +
   '<div style="display:flex;align-items:center;justify-content:center;gap:20px;margin-top:10px;font-size:12px;color:#c8d0dc;">' +
   '<span style="display:flex;align-items:center;gap:6px;"><span style="width:12px;height:12px;border-radius:3px;background:#3b82f6;display:inline-block;"></span>Revenue</span>' +
   '<span style="display:flex;align-items:center;gap:6px;"><span style="width:12px;height:12px;border-radius:3px;background:#22d3ee;display:inline-block;"></span>Net income</span>' +
   '<span style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;border:2px solid #f97316;display:inline-block;"></span>Net margin %</span>' +
   "</div>" +
   (ic.collected_at ? '<div style="font-size:11px;color:#8b93a7;margin-top:6px;text-align:right;">Updated ' + esc(ic.collected_at) + "</div>" : "") +
   "</div>";
  return h;
 }

 // Render (or re-render) the income chart for a ticker + mode
 // Guard against rapid re-renders (prevents flashing on load)
 function renderIncomeChart(tk, mode) {
  const t = (D.tickers || {})[tk];
  const ic = t && t.income_chart;
  if (!ic) return;
  const uid = "inc-" + tk;
  const canvas = document.getElementById(uid + "-canvas");
  if (!canvas) return;
  const now = Date.now();
  if (canvas._lastRender && now - canvas._lastRender < 300) return;
  canvas._lastRender = now;
  const records = ic[mode] || [];
  const fmtMoney = (v) => {
   if (v == null) return "N/A";
   const a = Math.abs(v), s = v < 0 ? "-" : "";
   if (a >= 1e9) return s + "$" + (a / 1e9).toFixed(2) + "B";
   if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(1) + "M";
   return s + "$" + Math.round(a).toLocaleString();
  };
  if (canvas._chart) canvas._chart.destroy();
  canvas._chart = new Chart(canvas, {
   data: {
    labels: records.map((r) => r.period),
    datasets: [
     {
      type: "line", label: "Net margin %",
      data: records.map((r) => r.net_margin_pct),
      borderColor: "#f97316", backgroundColor: "#f97316",
      borderWidth: 2, pointRadius: 4, pointHoverRadius: 6,
      pointBackgroundColor: "#131722", pointBorderColor: "#f97316", pointBorderWidth: 2,
      yAxisID: "yMargin", order: 1, tension: 0.15, spanGaps: true,
     },
     {
      type: "bar", label: "Revenue",
      data: records.map((r) => r.revenue),
      backgroundColor: "#3b82f6", borderRadius: 3,
      barPercentage: 0.7, categoryPercentage: 0.65,
      yAxisID: "yAmount", order: 2,
     },
     {
      type: "bar", label: "Net income",
      data: records.map((r) => r.net_income),
      backgroundColor: "#22d3ee", borderRadius: 3,
      barPercentage: 0.7, categoryPercentage: 0.65,
      yAxisID: "yAmount", order: 3,
     },
    ],
   },
   options: {
    responsive: true, maintainAspectRatio: false,
    animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
     legend: { display: false },
     tooltip: {
      backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1,
      titleColor: "#d1d4dc", bodyColor: "#d1d4dc", padding: 12,
      callbacks: {
       label: (c) => {
        if (c.dataset.yAxisID === "yMargin")
         return " Net margin: " + (c.parsed.y == null ? "N/A" : c.parsed.y.toFixed(1) + "%");
        return " " + c.dataset.label + ": " + fmtMoney(c.parsed.y);
       },
      },
     },
    },
    scales: {
     x: { ticks: { color: "#e8ecf1", font: { size: 11 } }, grid: { color: "rgba(42,46,57,0.35)" } },
     yMargin: {
      type: "linear", position: "left",
      ticks: { color: "#a1a1aa", callback: (v) => v + "%", font: { size: 11 } },
      grid: { color: (c) => c.tick.value === 0 ? "#52525b" : "rgba(42,46,57,0.35)" },
     },
     yAmount: {
      type: "linear", position: "right",
      ticks: { color: "#a1a1aa", callback: fmtMoney, font: { size: 11 } },
      grid: { display: false },
     },
    },
   },
  });
  // Update toggle button styles + wrap mode for zoom
  const wrap = document.getElementById(uid + "-wrap");
  if (wrap) wrap.dataset.mode = mode;
  const tog = document.getElementById(uid + "-toggle");
  if (tog) tog.querySelectorAll("button").forEach((b) => {
   const active = b.dataset.mode === mode;
   b.classList.toggle("active", active);
   b.style.background = active ? "#2a4a73" : "transparent";
   b.style.color = active ? "#fff" : "#8b93a7";
  });
 }

 function sotpHtml(t) {
  const s = t.sotp;
  if (!s || !s.segments) return '<p style="color:var(--muted)">Not available.</p>';
  if (s.years) return sotpDetailHtml(s);
  let h = '<div class="card"><h3>Full Sum of the Parts <span style="font-family:var(--mono);font-size:11px;color:var(--muted);font-weight:400;letter-spacing:1px;">· ' + esc(s.as_of || "") + "</span></h3>" +
   '<div class="section-sub">Bottom-up segment build. The parts sum to $' + esc(s.total_revenue_b) + 'B in 2036 revenue, landing just shy of the $30.3B Bull-case target.</div>' +
   '<div class="table-wrap"><table class="sotp-table"><thead><tr>' +
   "<th>Segment</th><th>2036 Revenue</th><th>2036 EBITDA</th><th>EBITDA Margin</th>" +
   "</tr></thead><tbody>";
  s.segments.forEach((sg) => {
   h += "<tr><td><div class=\"sotp-name\">" + esc(sg.name) + "</div>" +
    '<div class="sotp-note">' + esc(sg.note || "") + "</div></td>" +
    '<td class="num">$' + esc(sg.revenue_b) + "B</td>" +
    '<td class="num">$' + esc(sg.ebitda_b) + "B</td>" +
    '<td class="num">' + esc(sg.margin || " - ") + "</td></tr>";
  });
  h += '<tr class="sotp-total"><td><div class="sotp-name">Sum of the parts</div></td>' +
   '<td class="num">$' + esc(s.total_revenue_b) + "B</td>" +
   '<td class="num">$' + esc(s.total_ebitda_b) + "B</td>" +
   '<td class="num"> - </td></tr>';
  h += "</tbody></table></div></div>";
  return h;
 }

 function sotpDetailHtml(s) {
  const years = s.years;
  const yrHead = years.map(function(y) { return '<th class="num">' + y + '</th>'; }).join('');
  const money = function(v) { return v == null ? '--' : '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }) + 'M'; };
  const pct1 = function(v) { return v == null ? '--' : v.toFixed(1) + '%'; };
  const segShort = ['Dedrone', 'Surveillance', 'Evidence.com', 'TASER', 'Body Cams'];

  let h = '<div class="card"><h3>Full Sum of the Parts</h3>' +
   '<div class="section-sub">Every segment modeled year by year: Revenue to EBITDA to EBIT to NOPAT to Unlevered FCF. ' +
   '2026 baselines sum to $3.7B. The parts build to $29.5B revenue / $11.2B EBITDA in 2036.</div>';

  h += '<h4 style="margin:18px 0 8px;color:var(--gold)">Revenue by Segment ($M)</h4>' +
   '<div class="table-wrap"><table class="sotp-table sotp-wide"><thead><tr><th>Segment</th>' + yrHead + '</tr></thead><tbody>';
  s.segments.forEach(function(sg, i) {
   h += '<tr><td><div class="sotp-name">' + esc(segShort[i]) + '</div></td>' +
    sg.revenue.map(function(v) { return '<td class="num">' + money(v) + '</td>'; }).join('') + '</tr>';
  });
  h += '<tr class="sotp-total"><td><div class="sotp-name">Total Revenue</div></td>' +
   s.totals.revenue.map(function(v) { return '<td class="num">' + money(v) + '</td>'; }).join('') + '</tr>';
  h += '</tbody></table></div>';

  h += '<h4 style="margin:18px 0 8px;color:var(--gold)">EBITDA by Segment ($M)</h4>' +
   '<div class="table-wrap"><table class="sotp-table sotp-wide"><thead><tr><th>Segment</th>' + yrHead + '</tr></thead><tbody>';
  s.segments.forEach(function(sg, i) {
   h += '<tr><td><div class="sotp-name">' + esc(segShort[i]) + '</div>' +
    '<div class="sotp-note">' + pct1(sg.ebitda_margin[0]) + ' to ' + pct1(sg.ebitda_margin[10]) + ' margin</div></td>' +
    sg.ebitda.map(function(v) { return '<td class="num">' + money(v) + '</td>'; }).join('') + '</tr>';
  });
  h += '<tr class="sotp-total"><td><div class="sotp-name">Total EBITDA</div>' +
   '<div class="sotp-note">' + pct1(s.totals.ebitda_margin[0]) + ' to ' + pct1(s.totals.ebitda_margin[10]) + ' blended</div></td>' +
   s.totals.ebitda.map(function(v) { return '<td class="num">' + money(v) + '</td>'; }).join('') + '</tr>';
  h += '</tbody></table></div>';

  h += '<h4 style="margin:18px 0 8px;color:var(--gold)">Unlevered FCF by Segment ($M)</h4>' +
   '<div class="table-wrap"><table class="sotp-table sotp-wide"><thead><tr><th>Segment</th>' + yrHead + '</tr></thead><tbody>';
  s.segments.forEach(function(sg, i) {
   h += '<tr><td><div class="sotp-name">' + esc(segShort[i]) + '</div>' +
    '<div class="sotp-note">FCF margin ' + pct1(sg.fcf_margin[0]) + ' to ' + pct1(sg.fcf_margin[10]) + '</div></td>' +
    sg.fcf.map(function(v) { return '<td class="num">' + money(v) + '</td>'; }).join('') + '</tr>';
  });
  h += '<tr class="sotp-total"><td><div class="sotp-name">Total Unlevered FCF</div>' +
   '<div class="sotp-note">' + pct1(s.totals.fcf_margin[0]) + ' to ' + pct1(s.totals.fcf_margin[10]) + ' blended</div></td>' +
   s.totals.fcf.map(function(v) { return '<td class="num">' + money(v) + '</td>'; }).join('') + '</tr>';
  h += '</tbody></table></div>';

  h += '<h4 style="margin:18px 0 8px;color:var(--gold)">Revenue Mix (% of total)</h4>' +
   '<div class="table-wrap"><table class="sotp-table sotp-wide"><thead><tr><th>Segment</th>' + yrHead + '</tr></thead><tbody>';
  s.mix.forEach(function(m, i) {
   h += '<tr><td><div class="sotp-name">' + esc(segShort[i]) + '</div></td>' +
    m.mix.map(function(v) { return '<td class="num">' + pct1(v) + '</td>'; }).join('') + '</tr>';
  });
  h += '</tbody></table></div>';

  const r = s.reconciliation;
  h += '<h4 style="margin:18px 0 8px;color:var(--gold)">Reconciliation vs Bull Case</h4>' +
   '<div class="table-wrap"><table class="sotp-table"><tbody>' +
   '<tr><td><div class="sotp-name">SOTP 2036 revenue</div></td><td class="num">' + money(r.sotp_2036_revenue) + '</td></tr>' +
   '<tr><td><div class="sotp-name">SOTP 2036 EBITDA</div></td><td class="num">' + money(r.sotp_2036_ebitda) + '</td></tr>' +
   '<tr><td><div class="sotp-name">Bull-case 2036 revenue (DCF top-down)</div></td><td class="num">' + money(r.bull_case_2036_revenue) + '</td></tr>' +
   '</tbody></table></div>';

  h += '<div class="flock-callout">' +
   '<div class="flock-title">Estimate of terminal revenue impact from flock backlash</div>' +
   '<div class="flock-number">-' + money(Math.abs(r.gap)) + '</div>' +
   '<div class="flock-desc">Revenue deficit in the SOTP total vs the Bull-case 2036 target, ' +
   'attributed to the Flock controversy. The Bull case assumes full recovery of the ' +
   'mass-surveillance pipeline; the SOTP prices in a permanent haircut to RTCC/ALPR adoption.</div>' +
   '</div>';

  h += '<div class="panel-asof">Source: AXON DCF workbook, Segment Build tab. All $ in millions.</div></div>';
  return h;
 }

 function maHtml(tk) {
  const m = (D.ticker_ma || {})[tk];
  if (!m) return '<div class="card"><p style="color:var(--muted)">No moving-average data for this ticker.</p></div>';
  const ohlcv = (D.ticker_ohlcv || {})[tk] || [];
  let h = "";
  const chartCfgs = [];
  ["daily", "weekly", "monthly"].forEach((tf) => {
   const d = m[tf];
   if (!d) return;
   const cid = "ma-cust-" + tk + "-" + tf;
   chartCfgs.push({ cid, tf });
   h += '<div class="card"><h3 style="text-transform:capitalize">' + tf + ' <span class="verdict ' +
    (String(d.signal || "").toLowerCase().includes("buy") ? "bullish" : String(d.signal || "").toLowerCase().includes("sell") ? "bearish" : "neutral") +
    '">' + esc(d.signal || "") + "</span></h3>" +
    '<div style="position:relative;height:420px;margin-bottom:8px;background:#131722;border-radius:8px;"><canvas id="' + cid + '"></canvas></div>' +
    '<div style="font-size:12px;color:#a8b0bc;margin-bottom:10px;">Overlays: ' +
    '<b style="color:#f23645;">SMA 10</b> · <b style="color:#ff9800;">SMA 20</b> · ' +
    '<b style="color:#2962ff;">SMA 50</b> · <b style="color:#00bcd4;">SMA 200</b> (simple moving averages)</div>' +
    '<div class="table-wrap"><table class="coverage ma-table"><thead><tr><th>Period</th><th>SMA</th><th>EMA</th></tr></thead><tbody>' +
    ["10", "20", "30", "50", "100", "200"].map((p) =>
     "<tr><td>" + p + "</td><td>" + fmt$((d.sma || {})[p]) + "</td><td>" + fmt$((d.ema || {})[p]) + "</td></tr>"
    ).join("") + "</tbody></table></div>" +
    '<div class="panel-asof">Price ' + fmt$(d.price) + " · as of " + esc(d.as_of || "") + "</div></div>";
  });
  // render custom candlestick charts after DOM insert (TradingView-style dark theme)
  setTimeout(() => {
   chartCfgs.forEach(({ cid, tf }) => {
    const cv = document.getElementById(cid);
    if (!cv || !ohlcv.length) return;
    try {
     let bars = ohlcv.map((r) => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] || 0 }));
     if (tf === "weekly") {
      const agg = [];
      bars.forEach((b) => {
       const w = Math.floor(b.t / (7 * 864e5));
       const p = agg[agg.length - 1];
       if (!p || p.w !== w) agg.push({ w, t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v });
       else { p.h = Math.max(p.h, b.h); p.l = Math.min(p.l, b.l); p.c = b.c; p.v += b.v; }
      });
      bars = agg;
     } else if (tf === "monthly") {
      const agg = [];
      bars.forEach((b) => {
       const dt = new Date(b.t), k = dt.getFullYear() * 12 + dt.getMonth();
       const p = agg[agg.length - 1];
       if (!p || p.k !== k) agg.push({ k, t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v });
       else { p.h = Math.max(p.h, b.h); p.l = Math.min(p.l, b.l); p.c = b.c; p.v += b.v; }
      });
      bars = agg;
     }
     // limit to last 120 bars for readability
     if (bars.length > 120) bars = bars.slice(-120);
     const up = bars.map((b) => b.c >= b.o);
     const labels = bars.map((b) => new Date(b.t).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
     const bodies = bars.map((b) => [Math.min(b.o, b.c), Math.max(b.o, b.c)]);
     const closes = bars.map((b) => b.c);
     const vols = bars.map((b) => b.v);
     const sma = (n) => closes.map((_, i) => i < n - 1 ? null : closes.slice(i - n + 1, i + 1).reduce((a, b2) => a + b2, 0) / n);
     const smaDs = (label, data, color) => ({
      type: "line", label, data,
      borderColor: color, borderWidth: 2, pointRadius: 0, tension: 0, spanGaps: true,
      order: 1, yAxisID: "y"
     });
     const UP = "#26a69a", DN = "#ef5350";
     const wickPlugin = {
      id: "wicks-" + cid,
      afterDatasetsDraw(chart) {
       const ctx = chart.ctx, yS = chart.scales.y;
       const meta = chart.getDatasetMeta(0);
       bars.forEach((b, i) => {
        const el = meta.data[i];
        if (!el) return;
        ctx.save();
        ctx.strokeStyle = up[i] ? UP : DN;
        ctx.lineWidth = Math.max(1, el.width * 0.12);
        ctx.beginPath();
        ctx.moveTo(el.x, yS.getPixelForValue(b.h));
        ctx.lineTo(el.x, yS.getPixelForValue(b.l));
        ctx.stroke();
        ctx.restore();
       });
      }
     };
     const fmtVol = (v) => v >= 1e9 ? (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? (v / 1e3).toFixed(0) + "K" : String(Math.round(v));
     new Chart(cv, {
      type: "bar",
      data: { labels, datasets: [
       { label: "Price", data: bodies, backgroundColor: up.map((u) => u ? UP : DN),
        borderColor: up.map((u) => u ? UP : DN), borderWidth: 1,
        order: 2, yAxisID: "y", barPercentage: 0.65, categoryPercentage: 0.9 },
       { label: "Volume", data: vols, type: "bar",
        backgroundColor: up.map((u) => u ? "rgba(38,166,154,0.45)" : "rgba(239,83,80,0.45)"),
        borderWidth: 0, order: 3, yAxisID: "y1", barPercentage: 0.65, categoryPercentage: 0.9 },
       smaDs("SMA 10", sma(10), "#f23645"),
       smaDs("SMA 20", sma(20), "#ff9800"),
       smaDs("SMA 50", sma(50), "#2962ff"),
       ...(closes.length >= 100 ? [smaDs("SMA 200", sma(200), "#00bcd4")] : []),
      ]},
      options: {
       responsive: true, maintainAspectRatio: false,
       interaction: { mode: "index", intersect: false },
       plugins: {
        legend: { display: false },
        tooltip: {
         backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1,
         titleColor: "#d1d4dc", bodyColor: "#d1d4dc", padding: 10, displayColors: false,
         callbacks: {
          title: (items) => items.length ? labels[items[0].dataIndex] : "",
          label: (c) => {
           if (c.dataset.label === "Volume") return " Volume: " + fmtVol(c.parsed.y);
           if (c.dataset.label === "Price") {
            const b = bars[c.dataIndex];
            if (b) return " O " + b.o.toFixed(2) + " H " + b.h.toFixed(2) + " L " + b.l.toFixed(2) + " C " + b.c.toFixed(2);
           }
           return " " + c.dataset.label + ": " + (c.parsed.y != null ? c.parsed.y.toFixed(2) : "-");
          }
         }
        }
       },
       scales: {
        x: { ticks: { color: "#e8ecf1", maxTicksLimit: 8, maxRotation: 0 }, grid: { color: "rgba(42,46,57,0.5)" } },
        y: { position: "right", ticks: { color: "#e8ecf1", callback: (v) => v.toFixed(0) }, grid: { color: "rgba(42,46,57,0.5)" } },
        y1: { position: "right", display: false, max: Math.max(...vols, 1) * 5, grid: { display: false } }
       }
      },
      plugins: [wickPlugin]
     });
    } catch (e) { console.error("Custom MA chart error", e); }
   });
  }, 150);
  return h || '<div class="card"><p style="color:var(--muted)">No data.</p></div>';
 }


 function seasonalityHtml(tk) {
  const t = TICKERS[tk];
  // prefer daily OHLCV for seasonality; fall back to monthly history
  const ohlcv = (D.ticker_ohlcv || {})[tk] || [];
  const hist = (t && t.history) || [];
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const rets = months.map(() => []);
  if (ohlcv.length >= 60) {
   // daily data: compute full-month returns (first trading day -> last trading day of each month)
   const byMonth = {};
   ohlcv.forEach((r) => {
    const d = new Date(r[0]), k = d.getFullYear() * 12 + d.getMonth();
    if (!byMonth[k]) byMonth[k] = [];
    byMonth[k].push(r);
   });
   Object.keys(byMonth).sort().forEach((k) => {
    const days = byMonth[k];
    if (days.length < 2) return;
    const first = days[0][1], last = days[days.length - 1][4]; // open of first, close of last
    if (!first || !last) return;
    const r = (last / first - 1) * 100;
    if (!isFinite(r) || Math.abs(r) > 60) return;
    rets[new Date(days[0][0]).getMonth()].push(r);
   });
  } else if (hist.length >= 24) {
   // fallback: monthly closes, MoM return per point
   const sorted = [...hist].sort((a, b) => a[0] - b[0]);
   for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1][1], cur = sorted[i][1];
    if (!prev || !cur) continue;
    const r = (cur / prev - 1) * 100;
    if (!isFinite(r) || Math.abs(r) > 50) continue;
    rets[new Date(sorted[i][0]).getMonth()].push(r);
   }
  } else {
   return '<div class="card"><p style="color:var(--muted)">Not enough price history for seasonality.</p></div>';
  }
  const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const avgs = rets.map(avg);
  const maxA = Math.max(...avgs.filter((v) => v != null).map(Math.abs), 1);
  let h = '<div class="card"><div style="font-size:13px;color:#c8d0dc;margin-bottom:12px;">Average monthly return by calendar month (from available price history).</div>';
  h += '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;">';
  months.forEach((name, i) => {
   const v = avgs[i], n = rets[i].length;
   const barW = v == null ? 0 : Math.abs(v) / maxA * 100;
   const col = v == null ? "#555" : v >= 0 ? "#6a9a6a" : "#f87171";
   h += '<div style="background:#1a2332;border-radius:6px;padding:10px 8px;text-align:center;">' +
    '<div style="font-size:12px;color:#a8b0bc;margin-bottom:4px;">' + name + '</div>' +
    '<div style="font-size:16px;font-weight:700;color:' + col + ';">' + (v == null ? " - " : (v >= 0 ? "+" : "") + v.toFixed(1) + "%") + "</div>" +
    '<div style="height:4px;background:#2a3448;border-radius:2px;margin-top:6px;overflow:hidden;">' +
    '<div style="height:100%;width:' + barW.toFixed(0) + '%;background:' + col + ';border-radius:2px;"></div></div>' +
    '<div style="font-size:10px;color:#7a8494;margin-top:4px;">' + n + ' yrs</div></div>';
  });
  h += "</div>";
  // best/worst months
  const ranked = avgs.map((v, i) => ({ v, i })).filter((x) => x.v != null).sort((a, b) => b.v - a.v);
  if (ranked.length) {
   h += '<div class="panel-summary" style="margin-top:10px;color:#c8d0dc;">Strongest: <b style="color:#6a9a6a;">' + months[ranked[0].i] + " (" + (ranked[0].v >= 0 ? "+" : "") + ranked[0].v.toFixed(1) + "%)</b>" +
    ' · Weakest: <b style="color:#f87171;">' + months[ranked[ranked.length - 1].i] + " (" + ranked[ranked.length - 1].v.toFixed(1) + "%)</b></div>";
  }
  return h + "</div>";
 }

 function optionsHtml(tk) {
  const prints = (D.ticker_options || {})[tk] || [];
  if (!prints.length) return '<div class="card"><p style="color:var(--muted)">No unusual prints in the last 10 trading days.</p></div>';
  let h = '<div class="card"><div class="table-wrap"><table class="coverage"><thead><tr>' +
   "<th>Date</th><th>Type</th><th>Strike</th><th>Exp</th><th>Premium</th><th>Direction</th></tr></thead><tbody>";
  h += prints.map((p) => {
   // Use the collector's sentiment directly (bought put = bearish, sold put = bullish, etc.)
   const sentiment = String(p.sentiment || "").toLowerCase();
   const bull = sentiment === "bullish";
   const label = sentiment ? (bull ? "Bullish" : "Bearish") : " - ";
   // Premium is in dollars; format as $K/$M
   const prem = p.premium;
   let premTxt = " - ";
   if (prem != null && !isNaN(prem)) {
    if (prem >= 1e6) premTxt = "$" + (prem / 1e6).toFixed(1) + "M";
    else if (prem >= 1e3) premTxt = "$" + Math.round(prem / 1e3) + "K";
    else premTxt = "$" + Math.round(prem);
   }
   return "<tr><td>" + esc(p.date || "") + "</td><td>" + esc(p.type || p.kind || "") + "</td><td>" +
    esc(p.strike || "") + "</td><td>" + esc(p.expiry || p.exp || "") + "</td><td>" +
    premTxt + '</td><td class="' + (bull ? "pos" : "neg") + '">' + label + "</td></tr>";
  }).join("");
  return h + "</tbody></table></div></div>";
 }

 function earningsDateHtml(tk) {
  const est = (D.earnings_estimates || {})[tk];
  if (!est) return '<div class="card"><p style="color:var(--muted)">No earnings data available.</p></div>';
  const fmtDate = (d) => {
   if (!d) return "TBD";
   const dt = new Date(d + "T12:00:00");
   return dt.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  };
  const q = est.quarter || {};
  const consensusEps = q.eps_consensus != null ? "$" + q.eps_consensus.toFixed(2) : "N/A";
  const revEst = q.rev_consensus != null ?
   (q.rev_consensus >= 1e9 ? "$" + (q.rev_consensus/1e9).toFixed(1) + "B" :
    q.rev_consensus >= 1e6 ? "$" + (q.rev_consensus/1e6).toFixed(1) + "M" : "$" + q.rev_consensus.toFixed(0)) : "N/A";
  const whisper = est.whisper != null ? "$" + est.whisper.toFixed(2) : "—";
  const confirmed = est.earnings_date_confirmed ?
   '<span style="display:inline-flex;align-items:center;gap:4px;color:#10b981;font-size:12px;"><span style="width:16px;height:16px;border-radius:50%;background:#122b1e;border:1px solid #1b5e3b;display:inline-flex;align-items:center;justify-content:center;font-size:10px;">✓</span>Confirmed</span>' : "";
  let h = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">';
  // Earnings Date card
  h += '<div class="card" style="background:#14161d;border:1px solid #232733;border-radius:16px;padding:24px;">' +
   '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
   '<span style="color:#c99a6b;font-weight:600;font-size:13px;">Earnings Date</span>' + confirmed + "</div>" +
   '<div style="color:#9ba1b0;font-size:13px;margin-bottom:12px;">' + esc(est.fiscal_period || "") + "</div>" +
   '<div style="color:#fff;font-size:32px;font-weight:800;margin-bottom:4px;">' + fmtDate(est.earnings_date) + "</div>" +
   '<div style="color:#9ba1b0;font-size:13px;">' + (est.as_of ? "Updated " + esc(est.as_of) : "") + "</div></div>";
  // Whisper card
  h += '<div class="card" style="background:#14161d;border:1px solid #232733;border-radius:16px;padding:24px;">' +
   '<div style="color:#c99a6b;font-weight:600;font-size:13px;margin-bottom:6px;">Earnings Whisper</div>' +
   '<div style="color:#fff;font-size:32px;font-weight:800;min-height:38px;display:flex;align-items:center;">' + whisper + "</div>" +
   '<div style="color:#9ba1b0;font-size:13px;margin-top:8px;">vs ' + consensusEps + "</div>" +
   '<div style="color:#9ba1b0;font-size:13px;">Rev est ' + revEst + "</div></div>";
  h += "</div>";
  // EPS bar chart (logo colors: gold for estimated, forest green for actual)
  const epsHist = est.eps_history || [];
  if (epsHist.length > 0) {
   const chartId = "eps-chart-" + tk.replace(/[^A-Z0-9]/gi, "");
   h += '<div class="card" style="background:#14161d;border:1px solid #232733;border-radius:16px;padding:24px;margin-bottom:16px;">' +
    '<div style="color:#fff;font-size:20px;font-weight:700;margin-bottom:12px;">Earnings</div>' +
    '<div style="display:flex;gap:24px;margin-bottom:16px;font-size:13px;color:#9ba1b0;">' +
    '<span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#c9a86a;margin-right:6px;"></span>Estimated EPS</span>' +
    '<span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#5a7d5a;margin-right:6px;"></span>Actual EPS</span></div>' +
    '<div style="position:relative;height:280px;"><canvas id="' + chartId + '"></canvas></div>';
   if (est.earnings_date) {
    h += '<div style="margin-top:16px;padding:12px 16px;border:1px solid #2a2f3d;border-radius:12px;color:#c8d0dc;font-size:14px;">' +
     '<b style="color:#fff;">Next earnings:</b> Expected on ' + fmtDate(est.earnings_date) + "</div>";
   }
   h += "</div>";
   // Store data for chart rendering
   if (!window._epsChartData) window._epsChartData = {};
   window._epsChartData[chartId] = epsHist;
   setTimeout(() => drawEpsChart(chartId), 100);
  }
  if (est.whisper == null) {
   h += '<p style="font-size:11px;color:var(--muted);margin-top:8px;">Whisper numbers require a paid Earnings Whisper subscription and are not available from free data sources.</p>';
  }
  return h;
 }

 function drawEpsChart(chartId) {
  const data = (window._epsChartData || {})[chartId];
  if (!data || typeof Chart === "undefined") return;
  const cv = document.getElementById(chartId);
  if (!cv) return;
  // Reverse to chronological order
  const hist = [...data].reverse();
  const labels = hist.map((e) => {
   const d = new Date(e.date + "T12:00:00");
   const q = Math.floor(d.getMonth() / 3) + 1;
   return "Q" + q + " FY" + String(d.getFullYear()).slice(2);
  });
  new Chart(cv, {
   type: "bar",
   data: {
    labels: labels,
    datasets: [
     {
      label: "Estimated EPS",
      data: hist.map((e) => e.estimated_eps),
      backgroundColor: "#c9a86a",
      borderRadius: 4,
     },
     {
      label: "Actual EPS",
      data: hist.map((e) => e.reported_eps),
      backgroundColor: "#5a7d5a",
      borderRadius: 4,
     },
    ],
   },
   options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
     legend: { display: false },
     tooltip: {
      callbacks: {
       label: (ctx) => ctx.dataset.label + ": $" + (ctx.raw != null ? ctx.raw.toFixed(2) : "N/A"),
      },
     },
    },
    scales: {
     x: { ticks: { color: "#9ba1b0" }, grid: { display: false } },
     y: {
      ticks: { color: "#9ba1b0", callback: (v) => "$" + v.toFixed(2) },
      grid: { color: "rgba(42,46,57,0.4)" },
     },
    },
   },
  });
 }

 function revisionsHtml(tk) {
  const r = (D.earnings_revisions || {})[tk];
  const est = (D.earnings_estimates || {})[tk];
  if (!r && !est) return '<div class="card"><p style="color:var(--muted)">No revision data available.</p></div>';
  const fmtRev = (v) => {
   if (v == null) return "N/A";
   if (Math.abs(v) >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
   if (Math.abs(v) >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
   return "$" + v.toFixed(0);
  };
  const row = (label, p) => {
   if (!p || p.consensus == null) return "<tr><td>" + esc(label) + '</td><td colspan="5" style="color:var(--muted)">No estimates</td></tr>';
   const up7 = p.up_7d || 0, dn7 = p.down_7d || 0;
   const up30 = p.up_30d || 0, dn30 = p.down_30d || 0;
   const drift = p.drift_90d_pct;
   const driftCls = drift == null ? "" : drift > 0.5 ? "bullish" : drift < -0.5 ? "bearish" : "neutral";
   const driftTxt = drift == null ? " - " : (drift >= 0 ? "+" : "") + drift.toFixed(1) + "%";
   const rev = (u, d) => '<span style="color:#6a9a6a;">▲' + u + '</span> <span style="color:#f87171;">▼' + d + '</span>';
   // Revenue consensus from earnings_estimates (matched by period label)
   let revCell = '<span style="color:var(--muted)">N/A</span>';
   if (est) {
    const eq = label === "Upcoming quarter" ? est.quarter : est.annual;
    if (eq && eq.rev_consensus != null) {
     revCell = fmtRev(eq.rev_consensus) + '<div style="font-size:11px;color:var(--muted);">' + (eq.rev_analysts || 0) + ' analysts</div>';
    }
   }
   return "<tr><td><b>" + esc(p.label || label) + "</b><div style='font-size:11px;color:var(--muted);'>" + (p.analysts || 0) + " analysts</div></td>" +
    "<td>$" + p.consensus.toFixed(2) + "</td><td>" + revCell + "</td>" +
    "<td>" + rev(up7, dn7) + '</td><td>' + rev(up30, dn30) + "</td>" +
    '<td class="' + driftCls + '">' + driftTxt + "</td></tr>";
  };
  const asOf = (r && r.as_of) || (est && est.as_of) || "";
  return '<div class="card"><div style="font-size:13px;color:#c8d0dc;margin-bottom:10px;">Analyst EPS and revenue estimates, up/down counts and 90-day consensus drift.</div>' +
   '<div class="table-wrap"><table class="coverage ma-table" style="color:#e8ecf1;"><thead><tr>' +
   '<th style="color:#a8b0bc;">Period</th><th style="color:#a8b0bc;">Consensus EPS</th><th style="color:#a8b0bc;">Revenue Est.</th><th style="color:#a8b0bc;">7-day</th><th style="color:#a8b0bc;">30-day</th><th style="color:#a8b0bc;">90-day drift</th>' +
   "</tr></thead><tbody>" +
   row("Upcoming quarter", r.quarter) + row("Full year", r.annual) +
   '</tbody></table></div><div class="panel-asof" style="color:#a8b0bc;">As of ' + esc(asOf) + " · Source: Yahoo Finance</div></div>";
 }

 /* ---------- Earnings Call Tone (Pro, Gemini Flash NLP) ---------- */
 function toneHtml(tk, d) {
  if (!d || d.confidenceScore == null) return '<div class="card"><p style="color:var(--muted)">No transcript analysis available yet for this ticker.</p></div>';
  const toneCls = d.netToneScore > 40 ? "#3fb950" : d.netToneScore >= 0 ? "#d29922" : "#f85149";
  const delta = d.toneShiftDelta || 0;
  const deltaCls = delta >= 0 ? "#3fb950" : "#f85149";
  const deltaTxt = (delta >= 0 ? "▲ +" : "▼ ") + delta + " pts";
  const pillars = d.pillarBreakdown || {};
  const pillarNames = { demandEnvironment: "Demand Environment", pricingPower: "Pricing Power", marginOutlook: "Margin Outlook", capexAndAi: "CapEx & AI" };
  let pillarHtml = "";
  Object.keys(pillarNames).forEach((k) => {
   const p = pillars[k];
   if (!p) return;
   const sc = p.score || 0;
   const scCls = sc >= 80 ? "#3fb950" : sc >= 60 ? "#58a6ff" : "#f85149";
   pillarHtml += '<div style="background:#161b26;border-radius:8px;padding:12px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
    '<span style="font-size:12px;color:#e8ecf1;font-weight:600;">' + pillarNames[k] + '</span>' +
    '<span style="font-size:14px;font-weight:700;color:' + scCls + ';">' + sc + '</span></div>' +
    '<div style="font-size:12px;color:#a8b0bc;line-height:1.5;">' + esc(p.assessment || "") + '</div></div>';
  });
  let qaHtml = "";
  (d.qaDeconstruction || []).forEach((q) => {
   const convCls = q.defenseConviction === "High" ? "#3fb950" : q.defenseConviction === "Moderate" ? "#d29922" : "#f85149";
   qaHtml += '<div style="background:#161b26;border-radius:8px;padding:14px;margin-bottom:10px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px;">' +
    '<span style="font-size:13px;font-weight:700;color:#fff;">' + esc(q.analyst || "Analyst") + '</span>' +
    '<span style="font-size:11px;color:' + convCls + ';font-weight:600;">Conviction: ' + esc(q.defenseConviction || "") + '</span></div>' +
    '<div style="font-size:11px;color:#8b949e;margin-bottom:4px;">' + esc(q.targetTheme || "") + '</div>' +
    '<div style="font-size:12px;color:#e8ecf1;margin-bottom:6px;"><b style="color:#8b949e;">Q:</b> ' + esc(q.questionSummary || "") + '</div>' +
    '<div style="font-size:12px;color:#e8ecf1;"><b style="color:#c9a961;">Defense:</b> ' + esc(q.managementDefense || "") + '</div></div>';
  });
  const kwHtml = (d.hedgingKeywordsFound || []).map((kw) =>
   '<span style="background:#1a2332;border:1px solid #2a3448;color:#a8b0bc;padding:2px 8px;border-radius:4px;font-size:11px;">"' + esc(kw) + '"</span>').join(" ");
  return '<div class="card">' +
   '<div style="display:flex;flex-wrap:wrap;gap:20px;align-items:center;margin-bottom:16px;">' +
   '<div><div style="font-size:11px;color:#8b949e;letter-spacing:0.5px;">CONFIDENCE</div>' +
   '<div style="font-size:32px;font-weight:700;color:#fff;">' + d.confidenceScore + '<span style="font-size:14px;color:#8b949e;">/100</span></div></div>' +
   '<div><div style="font-size:11px;color:#8b949e;letter-spacing:0.5px;">TONE</div>' +
   '<div style="font-size:20px;font-weight:700;color:' + toneCls + ';">' + esc(d.toneClassification || "") + '</div></div>' +
   '<div><div style="font-size:11px;color:#8b949e;letter-spacing:0.5px;">QOQ SHIFT</div>' +
   '<div style="font-size:20px;font-weight:700;color:' + deltaCls + ';">' + deltaTxt + '</div></div>' +
   '<div><div style="font-size:11px;color:#8b949e;letter-spacing:0.5px;">HEDGING</div>' +
   '<div style="font-size:16px;font-weight:600;color:#e8ecf1;">' + esc(d.hedgingFrequency || "") + '</div></div></div>' +
   '<div style="font-size:12px;color:#8b949e;margin-bottom:12px;">' + esc(d.quarter || "") + ' call · Net tone ' + (d.netToneScore >= 0 ? "+" : "") + d.netToneScore + ' · Keywords: ' + kwHtml + '</div>' +
   '<div style="font-size:13px;font-weight:700;color:#fff;margin:14px 0 8px;">PILLAR BREAKDOWN</div>' +
   '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-bottom:6px;">' + pillarHtml + '</div>' +
   '<div style="font-size:13px;font-weight:700;color:#fff;margin:14px 0 8px;">Q&A DECONSTRUCTION</div>' + qaHtml +
   '<div class="panel-asof">AI analysis via Gemini Flash · Source: earnings call transcript</div></div>';
 }
 function earningsHtml(tk) {
  const hist = (D.earnings_history || {})[tk] || [];
  if (!hist.length) return '<div class="card"><p style="color:var(--muted)">No earnings reviews yet for this ticker. Coverage begins with the next reported quarter.</p></div>';
  let h = '<div class="tabs" id="eq-tabs">' + hist.map((q, i) =>
   '<button data-qi="' + i + '" class="' + (i === 0 ? "active" : "") + '">' + esc(q.quarter) + "</button>").join("") + "</div>";
  h += '<div id="eq-body">' + hist.map((q, i) => '<div class="eq-pane" data-qi="' + i + '" style="' + (i === 0 ? "" : "display:none") + '">' +
   eqPane(q) + "</div>").join("") + "</div>";
  return h;
 }
 function eqPane(q) {
  const v = q.verdict || {};
  const vl = String(v.label || "").toLowerCase();
  let h = '<div class="card"><h3>' + esc(q.headline || "") + '</h3><div style="margin:8px 0;"><span class="verdict ' +
   (vl.includes("bull") ? "bullish" : vl.includes("bear") ? "bearish" : "neutral") + '">' + esc(v.label || "") + "</span></div>" +
   '<div class="panel-summary">' + esc(q.summary || "") + "</div>";
  if (q.metrics && q.metrics.length) {
   h += '<table class="metrics-table">' + q.metrics.map((m) =>
    "<tr><td>" + esc(m.label) + "</td><td><b>" + esc(m.value) + "</b><div class='ctx'>" + esc(m.context || "") + "</div></td></tr>").join("") + "</table>";
  }
  h += '<div class="panel-summary" style="margin-top:8px;">' + esc(v.explanation || "") + "</div></div>";
  const caseCol = (title, items, headerBg) => {
   if (!items || !items.length) return "";
   return '<div style="flex:1;min-width:280px;border:1px solid var(--border);border-radius:8px;overflow:hidden;">' +
    '<div style="background:' + headerBg + ';color:#fff;font-weight:700;padding:10px 14px;font-size:14px;">' + title + "</div>" +
    '<div style="padding:12px 14px;">' + items.map((c) =>
     '<div style="margin-bottom:12px;"><div style="font-size:13.5px;"><span style="color:' + headerBg + ';">●</span> <b>' + esc(c.title || "") + "</b></div>" +
     '<ul style="margin:6px 0 6px 18px;color:var(--muted);font-size:13.5px;">' +
     (c.bullets || []).map((b) => "<li>" + esc(b) + "</li>").join("") + "</ul>" +
     (c.watch ? '<div style="font-size:13px;"><b>What to watch:</b> <span style="color:var(--muted)">' + esc(c.watch) + "</span></div>" : "") +
     "</div>").join("") + "</div></div>";
  };
  if ((q.bull_case && q.bull_case.length) || (q.bear_case && q.bear_case.length)) {
   h += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin:12px 0;">' +
    caseCol("What supports the bull case", q.bull_case, "#2d7a4f") +
    caseCol("What supports the bear case", q.bear_case, "#a03a3a") + "</div>";
  }
  if (q.guidance && q.guidance.length) {
   h += '<div class="card"><h3>Guidance</h3>' + q.guidance.map((g) =>
    '<div class="news-item"><div class="news-headline">' + esc(g.item || g.label || "") + "</div>" +
    '<div class="panel-summary">' + esc(g.detail || g.status || "") + "</div></div>").join("") + "</div>";
  }
  if (q.key_questions && q.key_questions.length) {
   h += '<div class="card"><h3>Key Questions</h3><ul style="margin:6px 0 6px 18px;color:var(--muted);font-size:13.5px;">' +
    q.key_questions.map((x) => "<li>" + esc(typeof x === "string" ? x : (x.q || x.question || "")) + "</li>").join("") + "</ul></div>";
  }
  return h;
 }
 function wireEarningsTabs() {
  const tabs = document.getElementById("eq-tabs");
  if (!tabs) return;
  tabs.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
   tabs.querySelectorAll("button").forEach((x) => x.classList.remove("active"));
   b.classList.add("active");
   document.querySelectorAll(".eq-pane").forEach((p) => p.style.display = p.dataset.qi === b.dataset.qi ? "" : "none");
  }));
 }
 function wireFinTabs(tk) {
  const tabs = document.getElementById("fin-" + tk + "-tabs");
  if (!tabs) return;
  tabs.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
   tabs.querySelectorAll("button").forEach((x) => x.classList.remove("active"));
   b.classList.add("active");
   const uid = "fin-" + tk;
   ["income", "balance", "cashflow"].forEach((k) => {
    const p = document.getElementById(uid + "-" + k);
    if (p) p.style.display = k === b.dataset.fin ? "" : "none";
   });
   // Re-render charts when their tab becomes visible (canvas sizing)
   // Balance/cashflow charts render lazily on first tab open to avoid
   // flashing and sizing issues from rendering in hidden tabs
   if (b.dataset.fin === "income") {
    const wrap = document.getElementById("inc-" + tk + "-wrap");
    renderIncomeChart(tk, wrap ? wrap.dataset.mode || "quarterly" : "quarterly");
   } else if (b.dataset.fin === "balance") {
    const wrap = document.getElementById("bal-" + tk + "-wrap");
    if (wrap && !wrap.dataset.rendered) {
     wrap.dataset.rendered = "1";
     renderBalanceChart(tk, "balance_quarterly");
    } else {
     renderBalanceChart(tk, wrap ? wrap.dataset.mode || "balance_quarterly" : "balance_quarterly");
    }
   } else if (b.dataset.fin === "cashflow") {
    const wrap = document.getElementById("cf-" + tk + "-wrap");
    if (wrap && !wrap.dataset.rendered) {
     wrap.dataset.rendered = "1";
     renderCashflowChart(tk, "cashflow_quarterly");
    } else {
     renderCashflowChart(tk, wrap ? wrap.dataset.mode || "cashflow_quarterly" : "cashflow_quarterly");
    }
   }
  }));
 }

 // Bind Annual/Quarterly toggle + initial render for the income chart
 function wireIncomeChart(tk) {
  const t = (D.tickers || {})[tk];
  if (!t || !t.income_chart) return;
  const tog = document.getElementById("inc-" + tk + "-toggle");
  if (tog) tog.querySelectorAll("button").forEach((b) => b.addEventListener("click", (e) => {
   e.stopPropagation();
   renderIncomeChart(tk, b.dataset.mode);
  }));
  renderIncomeChart(tk, "quarterly");
 }

 // Valuation multiples section (free): market cap, EV, year switcher, multiple cards
 // Logo colors: forest green #46634d, gold #c7af7f
 function valuationHtml(t) {
  const v = t.valuation;
  if (!v || !v.years || !v.years.length)
   return '<p style="color:var(--muted)">Valuation data not available.</p>';
  const uid = "val-" + t.ticker;
  const fmtBig = (n) => {
   if (n == null) return "N/A";
   const a = Math.abs(n);
   if (a >= 1e12) return "$" + (n / 1e12).toFixed(2) + "T";
   if (a >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
   if (a >= 1e6) return "$" + (n / 1e6).toFixed(0) + "M";
   return "$" + Math.round(n).toLocaleString();
  };
  const fmtX = (n, dec) => n == null ? "N/A" : n.toFixed(dec == null ? 1 : dec) + "x";
  // Default to NTM (forward) if available, else TTM
  const defIdx = v.years.findIndex((y) => y.is_estimate);
  const dIdx = defIdx >= 0 ? defIdx : 0;
  let h = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;">' +
   '<div style="background:#16191f;border:1px solid #232833;border-radius:12px;padding:16px;">' +
   '<div style="font-size:12px;color:#9ba3af;margin-bottom:6px;">Market cap</div>' +
   '<div style="font-size:24px;font-weight:800;color:#c7af7f;">' + fmtBig(v.market_cap) + "</div></div>" +
   '<div style="background:#16191f;border:1px solid #232833;border-radius:12px;padding:16px;">' +
   '<div style="font-size:12px;color:#9ba3af;margin-bottom:6px;">Enterprise value</div>' +
   '<div style="font-size:24px;font-weight:800;color:#c7af7f;">' + fmtBig(v.enterprise_value) + "</div></div>" +
   "</div>";
  // Year switcher pills
  h += '<div id="' + uid + '-pills" style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">' +
   v.years.map((y, i) =>
    '<button data-vyear="' + i + '" style="padding:6px 18px;font-size:13px;font-weight:700;border:0;border-radius:999px;cursor:pointer;' +
    (i === dIdx ? "background:#c7af7f;color:#0d0f12;" : "background:#1c2028;color:#9ba3af;") + '">' +
    esc(y.label) + "</button>").join("") + "</div>";
  // Multiple cards grid (data embedded as JSON in data attribute)
  h += '<div id="' + uid + '-cards" data-years=\'' + JSON.stringify(v.years).replace(/'/g, "&#39;") + "'></div>";
  h += '<div style="font-size:11px;color:#8b93a7;margin-top:10px;">' +
   "TTM figures from reported financials. Forward estimates from analyst consensus (Yahoo Finance). " +
   "EV/GP, EV/EBITDA, EV/EBIT and EV/FCF for estimate years hold TTM margins flat." +
   (v.collected_at ? " Updated " + esc(v.collected_at) + "." : "") + "</div>";
  return h;
 }

 function renderValuation(tk, yearIdx) {
  const el = document.getElementById("val-" + tk + "-cards");
  if (!el) return;
  let years;
  try { years = JSON.parse(el.dataset.years); } catch (e) { return; }
  if (!years || !years[yearIdx]) return;
  const y = years[yearIdx];
  const fmtX = (n, dec) => n == null ? "N/A" : n.toFixed(dec == null ? 1 : dec) + "x";
  const cards = [
   ["EV / Revenue", fmtX(y.ev_revenue, 2)],
   ["EV / GP", fmtX(y.ev_gp)],
   ["EV / EBITDA", fmtX(y.ev_ebitda)],
   ["EV / EBIT", fmtX(y.ev_ebit)],
   ["EV / FCF", fmtX(y.ev_fcf)],
   ["P / E", fmtX(y.pe)],
   ["PEG", y.peg == null ? "N/A" : y.peg.toFixed(2) + "x"],
  ];
  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;">' +
   cards.map((c) =>
    '<div style="background:#16191f;border:1px solid #232833;border-radius:12px;padding:14px;">' +
    '<div style="font-size:12px;color:#9ba3af;margin-bottom:6px;">' + c[0] + "</div>" +
    '<div style="font-size:22px;font-weight:800;color:' + (c[1] === "N/A" ? "#5a6270" : "#e8ecf1") + ';">' + c[1] + "</div></div>"
   ).join("") + "</div>";
  // Update pill styles
  const pills = document.getElementById("val-" + tk + "-pills");
  if (pills) pills.querySelectorAll("button").forEach((b) => {
   const active = parseInt(b.dataset.vyear, 10) === yearIdx;
   b.style.background = active ? "#c7af7f" : "#1c2028";
   b.style.color = active ? "#0d0f12" : "#9ba3af";
  });
 }

 function wireValuation(tk) {
  const t = (D.tickers || {})[tk];
  if (!t || !t.valuation || !t.valuation.years || !t.valuation.years.length) return;
  const pills = document.getElementById("val-" + tk + "-pills");
  if (pills) pills.querySelectorAll("button").forEach((b) => b.addEventListener("click", (e) => {
   e.stopPropagation();
   renderValuation(tk, parseInt(b.dataset.vyear, 10));
  }));
  const defIdx = t.valuation.years.findIndex((y) => y.is_estimate);
  renderValuation(tk, defIdx >= 0 ? defIdx : 0);
 }

 // Balance Sheet chart HTML: Cash vs Total Debt bars + Current Ratio line
 // (balance sheet health & liquidity view)
 function balanceChartHtml(t) {
  const ic = t.income_chart;
  if (!ic || (!ic.balance_annual.length && !ic.balance_quarterly.length)) return "";
  const uid = "bal-" + t.ticker;
  return '<div style="margin-bottom:20px;">' +
   '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">' +
   '<div style="font-size:14px;font-weight:700;color:#e8ecf1;">Balance Sheet Health & Liquidity</div>' +
   '<div class="inc-toggle" id="' + uid + '-toggle" style="display:inline-flex;padding:3px;background:#0f1420;border-radius:8px;">' +
   '<button data-mode="balance_annual" style="padding:5px 14px;font-size:12px;font-weight:600;border:0;border-radius:6px;cursor:pointer;background:transparent;color:#8b93a7;">Annual</button>' +
   '<button data-mode="balance_quarterly" class="active" style="padding:5px 14px;font-size:12px;font-weight:600;border:0;border-radius:6px;cursor:pointer;background:#2a4a73;color:#fff;">Quarterly</button>' +
   "</div></div>" +
   '<div class="zoomable-chart" data-chart="balance" data-ticker="' + esc(t.ticker) + '" data-mode="balance_quarterly" id="' + uid + '-wrap" style="position:relative;height:300px;cursor:zoom-in;" title="Click to zoom">' +
   '<canvas id="' + uid + '-canvas"></canvas></div>' +
   '<div style="display:flex;align-items:center;justify-content:center;gap:20px;margin-top:10px;font-size:12px;color:#c8d0dc;flex-wrap:wrap;">' +
   '<span style="display:flex;align-items:center;gap:6px;"><span style="width:12px;height:12px;border-radius:3px;background:#3fb950;display:inline-block;"></span>Cash & equivalents</span>' +
   '<span style="display:flex;align-items:center;gap:6px;"><span style="width:12px;height:12px;border-radius:3px;background:#f85149;display:inline-block;"></span>Total debt</span>' +
   '<span style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;border:2px solid #f97316;display:inline-block;"></span>Current ratio</span>' +
   "</div>" +
   (ic.collected_at ? '<div style="font-size:11px;color:#8b93a7;margin-top:6px;text-align:right;">Updated ' + esc(ic.collected_at) + "</div>" : "") +
   "</div>";
 }

 function renderBalanceChart(tk, mode) {
  const t = (D.tickers || {})[tk];
  const ic = t && t.income_chart;
  if (!ic) return;
  const uid = "bal-" + tk;
  const canvas = document.getElementById(uid + "-canvas");
  if (!canvas) return;
  const now = Date.now();
  if (canvas._lastRender && now - canvas._lastRender < 300) return;
  canvas._lastRender = now;
  const records = ic[mode] || [];
  const fmtMoney = (v) => {
   if (v == null) return "N/A";
   const a = Math.abs(v), s = v < 0 ? "-" : "";
   if (a >= 1e9) return s + "$" + (a / 1e9).toFixed(2) + "B";
   if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(1) + "M";
   return s + "$" + Math.round(a).toLocaleString();
  };
  if (canvas._chart) canvas._chart.destroy();
  canvas._chart = new Chart(canvas, {
   data: {
    labels: records.map((r) => r.period),
    datasets: [
     { type: "line", label: "Current ratio", data: records.map((r) => r.current_ratio),
       borderColor: "#f97316", borderWidth: 2, pointRadius: 4, pointHoverRadius: 6,
       pointBackgroundColor: "#131722", pointBorderColor: "#f97316", pointBorderWidth: 2,
       yAxisID: "yRatio", order: 1, tension: 0.15, spanGaps: true },
     { type: "bar", label: "Cash & equivalents", data: records.map((r) => r.cash),
       backgroundColor: "#3fb950", borderRadius: 3, barPercentage: 0.7, categoryPercentage: 0.65, yAxisID: "yAmount", order: 2 },
     { type: "bar", label: "Total debt", data: records.map((r) => r.total_debt),
       backgroundColor: "#f85149", borderRadius: 3, barPercentage: 0.7, categoryPercentage: 0.65, yAxisID: "yAmount", order: 3 },
    ],
   },
   options: {
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { display: false },
     tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1,
      titleColor: "#d1d4dc", bodyColor: "#d1d4dc", padding: 12,
      callbacks: { label: (c) => {
       if (c.dataset.yAxisID === "yRatio")
        return " Current ratio: " + (c.parsed.y == null ? "N/A" : c.parsed.y.toFixed(2) + "x");
       let extra = "";
       if (c.dataset.label === "Total debt") {
        const de = records[c.dataIndex] && records[c.dataIndex].debt_to_equity;
        if (de != null) extra = " (D/E " + de.toFixed(2) + "x)";
       }
       return " " + c.dataset.label + ": " + fmtMoney(c.parsed.y) + extra;
      } } } },
    scales: {
     x: { ticks: { color: "#e8ecf1", font: { size: 11 } }, grid: { color: "rgba(42,46,57,0.35)" } },
     yRatio: { type: "linear", position: "left",
      ticks: { color: "#a1a1aa", callback: (v) => v + "x", font: { size: 11 } },
      grid: { color: (c) => c.tick.value === 0 ? "#52525b" : "rgba(42,46,57,0.35)" } },
     yAmount: { type: "linear", position: "right",
      ticks: { color: "#a1a1aa", callback: fmtMoney, font: { size: 11 } }, grid: { display: false } },
    },
   },
  });
  const wrap = document.getElementById(uid + "-wrap");
  if (wrap) wrap.dataset.mode = mode;
  const tog = document.getElementById(uid + "-toggle");
  if (tog) tog.querySelectorAll("button").forEach((b) => {
   const active = b.dataset.mode === mode;
   b.style.background = active ? "#2a4a73" : "transparent";
   b.style.color = active ? "#fff" : "#8b93a7";
  });
 }

 // Cash Flow chart HTML: OCF/Capex/FCF bars + FCF Margin line
 function cashflowChartHtml(t) {
  const ic = t.income_chart;
  if (!ic || (!ic.cashflow_annual.length && !ic.cashflow_quarterly.length)) return "";
  const uid = "cf-" + t.ticker;
  return '<div style="margin-bottom:20px;">' +
   '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">' +
   '<div style="font-size:14px;font-weight:700;color:#e8ecf1;">Cash Flow & FCF Margin</div>' +
   '<div class="inc-toggle" id="' + uid + '-toggle" style="display:inline-flex;padding:3px;background:#0f1420;border-radius:8px;">' +
   '<button data-mode="cashflow_annual" style="padding:5px 14px;font-size:12px;font-weight:600;border:0;border-radius:6px;cursor:pointer;background:transparent;color:#8b93a7;">Annual</button>' +
   '<button data-mode="cashflow_quarterly" class="active" style="padding:5px 14px;font-size:12px;font-weight:600;border:0;border-radius:6px;cursor:pointer;background:#2a4a73;color:#fff;">Quarterly</button>' +
   "</div></div>" +
   '<div class="zoomable-chart" data-chart="cashflow" data-ticker="' + esc(t.ticker) + '" data-mode="cashflow_quarterly" id="' + uid + '-wrap" style="position:relative;height:300px;cursor:zoom-in;" title="Click to zoom">' +
   '<canvas id="' + uid + '-canvas"></canvas></div>' +
   '<div style="display:flex;align-items:center;justify-content:center;gap:20px;margin-top:10px;font-size:12px;color:#c8d0dc;flex-wrap:wrap;">' +
   '<span style="display:flex;align-items:center;gap:6px;"><span style="width:12px;height:12px;border-radius:3px;background:#3b82f6;display:inline-block;"></span>Operating cash flow</span>' +
   '<span style="display:flex;align-items:center;gap:6px;"><span style="width:12px;height:12px;border-radius:3px;background:#f85149;display:inline-block;"></span>CapEx</span>' +
   '<span style="display:flex;align-items:center;gap:6px;"><span style="width:12px;height:12px;border-radius:3px;background:#22d3ee;display:inline-block;"></span>Free cash flow</span>' +
   '<span style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;border:2px solid #f97316;display:inline-block;"></span>FCF margin %</span>' +
   "</div>" +
   (ic.collected_at ? '<div style="font-size:11px;color:#8b93a7;margin-top:6px;text-align:right;">Updated ' + esc(ic.collected_at) + "</div>" : "") +
   "</div>";
 }

 function renderCashflowChart(tk, mode) {
  const t = (D.tickers || {})[tk];
  const ic = t && t.income_chart;
  if (!ic) return;
  const uid = "cf-" + tk;
  const canvas = document.getElementById(uid + "-canvas");
  if (!canvas) return;
  const now = Date.now();
  if (canvas._lastRender && now - canvas._lastRender < 300) return;
  canvas._lastRender = now;
  const records = ic[mode] || [];
  const fmtMoney = (v) => {
   if (v == null) return "N/A";
   const a = Math.abs(v), s = v < 0 ? "-" : "";
   if (a >= 1e9) return s + "$" + (a / 1e9).toFixed(2) + "B";
   if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(1) + "M";
   return s + "$" + Math.round(a).toLocaleString();
  };
  if (canvas._chart) canvas._chart.destroy();
  canvas._chart = new Chart(canvas, {
   data: {
    labels: records.map((r) => r.period),
    datasets: [
     { type: "line", label: "FCF margin %", data: records.map((r) => r.fcf_margin_pct),
       borderColor: "#f97316", borderWidth: 2, pointRadius: 4, pointHoverRadius: 6,
       pointBackgroundColor: "#131722", pointBorderColor: "#f97316", pointBorderWidth: 2,
       yAxisID: "yMargin", order: 1, tension: 0.15, spanGaps: true },
     { type: "bar", label: "Operating cash flow", data: records.map((r) => r.operating_cash_flow),
       backgroundColor: "#3b82f6", borderRadius: 3, barPercentage: 0.7, categoryPercentage: 0.65, yAxisID: "yAmount", order: 2 },
     { type: "bar", label: "CapEx", data: records.map((r) => r.capex),
       backgroundColor: "#f85149", borderRadius: 3, barPercentage: 0.7, categoryPercentage: 0.65, yAxisID: "yAmount", order: 3 },
     { type: "bar", label: "Free cash flow", data: records.map((r) => r.free_cash_flow),
       backgroundColor: "#22d3ee", borderRadius: 3, barPercentage: 0.7, categoryPercentage: 0.65, yAxisID: "yAmount", order: 4 },
    ],
   },
   options: {
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { display: false },
     tooltip: { backgroundColor: "#1e2530", borderColor: "#363c4e", borderWidth: 1,
      titleColor: "#d1d4dc", bodyColor: "#d1d4dc", padding: 12,
      callbacks: { label: (c) => c.dataset.yAxisID === "yMargin"
       ? " FCF margin: " + (c.parsed.y == null ? "N/A" : c.parsed.y.toFixed(1) + "%")
       : " " + c.dataset.label + ": " + fmtMoney(c.parsed.y) } } },
    scales: {
     x: { ticks: { color: "#e8ecf1", font: { size: 11 } }, grid: { color: "rgba(42,46,57,0.35)" } },
     yMargin: { type: "linear", position: "left",
      ticks: { color: "#a1a1aa", callback: (v) => v + "%", font: { size: 11 } },
      grid: { color: (c) => c.tick.value === 0 ? "#52525b" : "rgba(42,46,57,0.35)" } },
     yAmount: { type: "linear", position: "right",
      ticks: { color: "#a1a1aa", callback: fmtMoney, font: { size: 11 } }, grid: { display: false } },
    },
   },
  });
  const wrap = document.getElementById(uid + "-wrap");
  if (wrap) wrap.dataset.mode = mode;
  const tog = document.getElementById(uid + "-toggle");
  if (tog) tog.querySelectorAll("button").forEach((b) => {
   const active = b.dataset.mode === mode;
   b.style.background = active ? "#2a4a73" : "transparent";
   b.style.color = active ? "#fff" : "#8b93a7";
  });
 }

 function wireBalanceChart(tk) {
  const t = (D.tickers || {})[tk];
  if (!t || !t.income_chart) return;
  const tog = document.getElementById("bal-" + tk + "-toggle");
  if (tog) tog.querySelectorAll("button").forEach((b) => b.addEventListener("click", (e) => {
   e.stopPropagation();
   renderBalanceChart(tk, b.dataset.mode);
  }));
 }

 function wireCashflowChart(tk) {
  const t = (D.tickers || {})[tk];
  if (!t || !t.income_chart) return;
  const tog = document.getElementById("cf-" + tk + "-toggle");
  if (tog) tog.querySelectorAll("button").forEach((b) => b.addEventListener("click", (e) => {
   e.stopPropagation();
   renderCashflowChart(tk, b.dataset.mode);
  }));
 }

 /* ---------- charts ---------- */
 function drawPriceChart(t) {
  const el = document.getElementById("price-chart");
  if (!el || !t.history || !t.history.length) return;
  const pts = t.history.filter((_, i) => i % 4 === 0);
  priceChart = new Chart(el, {
   type: "line",
   data: { labels: pts.map((p) => { const d = new Date(p[0]); return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }),
    datasets: [{ data: pts.map((p) => p[1]), borderColor: "#c9a961", borderWidth: 2, pointRadius: 0, pointHoverRadius: 5,
     pointHoverBackgroundColor: "#c9a961", pointHoverBorderColor: "#fff", fill: true,
     backgroundColor: "rgba(201,169,97,0.08)", tension: 0.2 }] },
   options: { responsive: true, maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { display: false },
     tooltip: { backgroundColor: "#253041", borderColor: "#c9a961", borderWidth: 1,
      titleColor: "#ffffff", bodyColor: "#c9a961", padding: 12, displayColors: false,
      callbacks: {
       label: (c) => " Price: " + fmt$(c.parsed.y),
       afterLabel: (c) => {
        const i = c.dataIndex;
        if (i > 0) {
         const prev = c.dataset.data[i - 1], cur = c.parsed.y;
         const chg = ((cur - prev) / prev * 100);
         return " Change: " + (chg >= 0 ? "+" : "") + chg.toFixed(2) + "%";
        }
        return "";
       }
      } } },
    scales: { x: { ticks: { color: "#7a8494", maxTicksLimit: 8 }, grid: { display: false } },
     y: { ticks: { color: "#7a8494", callback: (v) => "$" + v }, grid: { color: "#333f52" } } } }
  });
 }
 function drawFcfChart(t) {
  const el = document.getElementById("fcf-chart");
  const fcf = t.fcf || {};
  if (!el || !fcf.base) return;
  const years = fcf.base.years || [];
  const ds = [];
  const cfg = [["bear", "#f87171", "Bear"], ["base", "#c9a961", "Base"], ["bull", "#6a9a6a", "Bull"]];
  cfg.forEach(([k, color, lbl]) => {
   if (fcf[k] && fcf[k].fcf_m) ds.push({ label: lbl, data: fcf[k].fcf_m, backgroundColor: color, borderRadius: 3 });
  });
  fcfChart = new Chart(el, {
   type: "bar",
   data: { labels: years, datasets: ds },
   options: { responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: "#a8b0bd" } },
     tooltip: { callbacks: { label: (c) => " " + c.dataset.label + ": " + fmtM(c.parsed.y) } } },
    scales: { x: { ticks: { color: "#7a8494" }, grid: { display: false } },
     y: { ticks: { color: "#7a8494", callback: (v) => "$" + v + "M" }, grid: { color: "#333f52" } } } }
  });
 }

 /* ---------- assumption sandbox ---------- */
 function initSandbox(tk, t) {
  const card = document.getElementById("sandbox-card");
  if (!card) return;
  // baseline: base-case FCF path if available, else user-editable starting point
  const fcf = t.fcf || {};
  let base0 = 100, gBear = 10, gBase = 20, gBull = 35, horizon = 5;
  if (fcf.base && fcf.base.fcf_m && fcf.base.fcf_m.length >= 2) {
   const arr = fcf.base.fcf_m.filter((v) => v > 0);
   if (arr.length) base0 = Math.round(arr[0]);
   const n = fcf.base.fcf_m.length;
   const cagr = (a) => {
    const x = a.filter((v) => v > 0);
    if (x.length < 2) return null;
    return (Math.pow(x[x.length - 1] / x[0], 1 / (x.length - 1)) - 1) * 100;
   };
   const gb = cagr(fcf.base.fcf_m); if (gb != null) gBase = Math.round(Math.max(-20, Math.min(80, gb)));
   if (fcf.bear) { const g = cagr(fcf.bear.fcf_m || []); if (g != null) gBear = Math.round(Math.max(-20, Math.min(80, g))); }
   if (fcf.bull) { const g = cagr(fcf.bull.fcf_m || []); if (g != null) gBull = Math.round(Math.max(-20, Math.min(80, g))); }
   // enforce ordering: bear <= base <= bull (bull must always have highest target)
   gBear = Math.min(gBear, gBase, gBull);
   gBull = Math.max(gBear, gBase, gBull);
   gBase = Math.max(gBear, Math.min(gBase, gBull));
   horizon = Math.max(5, Math.min(10, n));
  }
  const wacc = t.wacc || 0.10;
  // shares_m must come from market data, never default to a hardcoded value
  const shares = t.shares_m;
  if (!shares) return '<div class="card"><p style="color:var(--muted)">Share count unavailable, simulator cannot compute implied prices.</p></div>';
  // pick display unit from company scale: billions for large FCF, millions for small
  const useB = Math.abs(base0) >= 500;
  const uDiv = useB ? 1000 : 1, uSuf = useB ? "B" : "M";
  const uFmt = (vM) => {
   const v = vM / uDiv;
   // for very large values, use compact formatting to avoid "$95,000M"
   if (Math.abs(v) >= 1000 && !useB) return "$" + (v / 1000).toFixed(1) + "B";
   return "$" + v.toFixed(1) + uSuf;
  };
  const f0disp = (base0 / uDiv).toFixed(1);
  // minimum is the TTM FCF (can be negative), user can slide up to positive as the company grows
  const f0min = f0disp, f0max = useB ? 50 : 5000, f0step = useB ? 0.1 : 1;

  card.innerHTML =
   '<h3>Interactive Free Cash Flow Simulation</h3>' +
   '<div class="section-sub">Project ' + esc(t.name) + ' unlevered free cash flow from your own baseline. Drag the sliders.</div>' +
   '<div class="sandbox-stats">' +
   '<div><div class="stat-v" id="sb-start">' + uFmt(base0) + '</div><div class="stat-l">Starting Base</div></div>' +
   '<div class="stat-c"><div class="stat-v" id="sb-base-t" style="color:var(--base)"> - </div><div class="stat-l" id="sb-base-l">Base terminal UFCF</div></div>' +
   '<div class="stat-c"><div class="stat-v" id="sb-bull-t" style="color:var(--bull)"> - </div><div class="stat-l" id="sb-bull-l">Bull terminal UFCF</div></div>' +
   "</div>" +
   '<div class="chart-box tall"><canvas id="sandbox-chart"></canvas></div>' +
   '<div style="display:flex;gap:10px;justify-content:center;margin:6px 0;">' +
   '<span style="font-size:13px;color:var(--muted)"><span style="color:var(--bull)">&#9632;</span> Bull</span>' +
   '<span style="font-size:13px;color:var(--muted)"><span style="color:var(--base)">&#9632;</span> Base</span>' +
   '<span style="font-size:13px;color:var(--muted)"><span style="color:var(--bear)">&#9632;</span> Bear</span></div>' +
   '<h3 style="margin-top:18px;">Adjust DCF Model Growth &amp; Margin Assumptions</h3>' +
   '<div class="collapsible-head" id="sb-coll">Parameters <span>&#9650;</span></div>' +
   '<div class="param-grid" id="sb-params">' +
   sbParam("sb-fcf0", "Base UFCF ($" + uSuf + ")", f0disp, f0min, f0max, f0step, uFmt(base0)) +
   sbParam("sb-gbear", "Bear UFCF Growth (%)", gBear, -20, 80, 1, gBear + "%") +
   sbParam("sb-gbase", "Base UFCF Growth (%)", gBase, -20, 80, 1, gBase + "%") +
   sbParam("sb-gbull", "Bull UFCF Growth (%)", gBull, -20, 80, 1, gBull + "%") +
   sbParam("sb-horiz", "DCF Horizon (Years)", horizon, 5, 10, 1, horizon + " years") +
   "</div>" +
   '<div class="sandbox-note">Simplified sensitivity model: constant growth, WACC ' + (wacc * 100).toFixed(1) +
   '%, terminal growth 3%. Illustrative only, not the full DCF.</div>' +
   '<div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;">' +
   '<button class="btn secondary" id="sb-csv">Export CSV</button></div>';

  const $ = (id) => document.getElementById(id);
  const els = { fcf0: $("sb-fcf0"), gbear: $("sb-gbear"), gbase: $("sb-gbase"), gbull: $("sb-gbull"), horiz: $("sb-horiz") };
  const ctx = $("sandbox-chart").getContext("2d");
  sandboxChart = new Chart(ctx, {
   type: "line",
   data: { labels: [], datasets: [
    { label: "Bull", borderColor: "#6a9a6a", backgroundColor: "rgba(106,154,106,0.12)", fill: true, tension: 0.3, pointRadius: 0, pointHoverRadius: 5, data: [] },
    { label: "Base", borderColor: "#c9a961", backgroundColor: "rgba(201,169,97,0.12)", fill: true, tension: 0.3, pointRadius: 0, pointHoverRadius: 5, data: [] },
    { label: "Bear", borderColor: "#f87171", backgroundColor: "rgba(248,113,113,0.10)", fill: true, tension: 0.3, pointRadius: 0, pointHoverRadius: 5, data: [] }
   ]},
   options: { responsive: true, maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { display: false },
     tooltip: {
      titleColor: "#fff", bodyColor: "#dfe6ef", backgroundColor: "rgba(20,28,40,0.95)", borderColor: "#3a4658", borderWidth: 1,
      padding: 12, titleFont: { weight: "bold" },
      callbacks: {
       title: (items) => "Year " + items[0].label,
       label: (c) => " " + c.dataset.label + ": " + uFmt(c.parsed.y * uDiv)
      }
     } },
    scales: { x: { title: { display: true, text: "Years", color: "#7a8494" }, ticks: { color: "#7a8494" }, grid: { display: false } },
     y: { title: { display: true, text: "UFCF ($" + uSuf + ")", color: "#7a8494" }, ticks: { color: "#7a8494", callback: (v) => "$" + v + uSuf }, grid: { color: "#333f52" } } } }
  });

  function update() {
   const f0dispV = +els.fcf0.value, f0 = f0dispV * uDiv, gb = +els.gbear.value / 100, gn = +els.gbase.value / 100,
    gu = +els.gbull.value / 100, hz = +els.horiz.value;
   document.querySelector('#sb-fcf0').closest(".param").querySelector(".pval").textContent = uFmt(f0);
   document.querySelector('#sb-gbear').closest(".param").querySelector(".pval").textContent = els.gbear.value + "%";
   document.querySelector('#sb-gbase').closest(".param").querySelector(".pval").textContent = els.gbase.value + "%";
   document.querySelector('#sb-gbull').closest(".param").querySelector(".pval").textContent = els.gbull.value + "%";
   document.querySelector('#sb-horiz').closest(".param").querySelector(".pval").textContent = hz + " years";
   const labels = [], bull = [], base = [], bear = [];
   for (let y = 0; y <= hz; y++) {
    labels.push(y);
    bull.push(f0 * Math.pow(1 + gu, y) / uDiv);
    base.push(f0 * Math.pow(1 + gn, y) / uDiv);
    bear.push(f0 * Math.pow(1 + gb, y) / uDiv);
   }
   sandboxChart.data.labels = labels;
   sandboxChart.data.datasets[0].data = bull;
   sandboxChart.data.datasets[1].data = base;
   sandboxChart.data.datasets[2].data = bear;
   sandboxChart.update();
   $("sb-start").textContent = uFmt(f0);
   $("sb-base-t").textContent = uFmt(base[hz] * uDiv);
   $("sb-bull-t").textContent = uFmt(bull[hz] * uDiv);
   $("sb-base-l").textContent = "Base Yr-" + hz + " UFCF";
   $("sb-bull-l").textContent = "Bull Yr-" + hz + " UFCF";
   // implied price targets for all three scenarios
   const implPrice = (arr) => {
    let p = 0;
    for (let y = 1; y <= hz; y++) p += (arr[y] * uDiv) / Math.pow(1 + wacc, y);
    const tval = ((arr[hz] * uDiv) * 1.03) / (wacc - 0.03) / Math.pow(1 + wacc, hz);
    return (p + tval) / shares;
   };
   const pBear = implPrice(bear), pBase = implPrice(base), pBull = implPrice(bull);
   let iv = document.getElementById("sb-implied");
   if (!iv) {
    const d = document.createElement("div");
    d.id = "sb-implied";
    d.style.cssText = "margin-top:14px;";
    card.appendChild(d); iv = d;
   }
   const row = (label, p, color) =>
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">' +
    '<span style="font-size:13px;color:' + color + ';font-weight:600;">' + label + '</span>' +
    '<span style="font-size:15px;color:var(--text);font-weight:700;">' + fmt$(p) +
    ' <span class="' + cls(t.price ? p / t.price - 1 : 0) + '" style="font-size:12px;font-weight:400;">(' + fmtPct(t.price ? (p / t.price - 1) * 100 : 0) + ')</span></span></div>';
   iv.innerHTML = '<div style="font-size:13px;color:#c8d0dc;font-weight:600;margin-bottom:4px;">Implied price targets at these assumptions</div>' +
    row("Bear case", pBear, "#f87171") + row("Base case", pBase, "#c9a961") + row("Bull case", pBull, "#6a9a6a");
  }
  Object.values(els).forEach((el) => el.addEventListener("input", update));
  // sync number inputs with sliders both ways
  Object.keys(els).forEach((k) => {
   const slider = els[k], num = $(slider.id + "-num");
   if (!num) return;
   const clamp = (v) => Math.max(+slider.min, Math.min(+slider.max, isNaN(v) ? +slider.value : v));
   slider.addEventListener("input", () => { num.value = slider.value; });
   num.addEventListener("input", () => { slider.value = clamp(+num.value); update(); });
   num.addEventListener("change", () => { num.value = clamp(+num.value); slider.value = num.value; update(); });
  });
  $("sb-coll").addEventListener("click", () => {
   const p = $("sb-params"), open = p.style.display !== "none";
   p.style.display = open ? "none" : "";
   $("sb-coll").querySelector("span").innerHTML = open ? "&#9660;" : "&#9650;";
  });
  $("sb-csv").addEventListener("click", () => {
   const f0 = +els.fcf0.value * uDiv, gb = +els.gbear.value / 100, gn = +els.gbase.value / 100,
    gu = +els.gbull.value / 100, hz = +els.horiz.value;
   let csv = "year,bear_fcf_m,base_fcf_m,bull_fcf_m\n";
   for (let y = 0; y <= hz; y++)
    csv += y + "," + (f0 * Math.pow(1 + gb, y)).toFixed(1) + "," + (f0 * Math.pow(1 + gn, y)).toFixed(1) + "," + (f0 * Math.pow(1 + gu, y)).toFixed(1) + "\n";
   dl(tk + "_sandbox.csv", csv, "text/csv");
  });
  update();
 }
 function sbParam(id, label, val, min, max, step, valTxt) {
  return '<div class="param"><label>' + esc(label) + ' <span class="pval">' + esc(valTxt) + "</span></label>" +
   '<div class="param-row"><input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '">' +
   '<input type="number" id="' + id + '-num" class="param-num" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '" aria-label="' + esc(label) + ' value"></div></div>';
 }
 function dl(name, content, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
 }

 /* ================= SCREENER (Pro) ================= */
 /* Quantitative factor screener (Pro): institutional alpha factors on a liquid universe */
 function quantScreenerHtml() {
  const sd = D.screener_data;
  const meta = (sd && sd.metadata) || {};
  let h = '<div class="section" style="max-width:none;margin-top:32px;"><div class="section-title">Quantitative Factor Screener <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>';
  h += '<div class="section-sub">Institutional alpha factors across the full S&P 500. Refreshed twice per quarter to capture earnings-season changes. Updated ' + esc((meta.lastUpdated || "").slice(0, 16).replace("T", " ")) + ' UTC.</div>';
  h += '<div class="card" style="display:flex;gap:16px;flex-wrap:wrap;">';
  h += '<div style="flex:1;min-width:220px;"><label style="font-size:11px;color:var(--muted);letter-spacing:1px;">SEARCH</label><br>' +
   '<input id="q-search" type="text" placeholder="Ticker or company" style="width:100%;background:#0d1117;border:1px solid #2a3242;border-radius:6px;color:#e8ecf1;padding:8px 10px;margin-top:4px;"></div>';
  const slider = (id, label, min, max, step, val, unit) =>
   '<div style="flex:1;min-width:160px;"><label style="font-size:11px;color:var(--muted);letter-spacing:1px;">' + label + ': <b id="' + id + '-v" style="color:#e8ecf1;">' + val + unit + '</b></label><br>' +
   '<input id="' + id + '" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '" style="width:100%;margin-top:8px;accent-color:#38bdf8;"></div>';
  h += slider("q-roic", "MIN ROIC", -10, 80, 1, 15, "%");
  h += slider("q-peg", "MAX PEG", 0.5, 5, 0.1, 2, "x");
  h += slider("q-fcf", "MIN FCF YIELD", -5, 15, 0.5, 0, "%");
  h += slider("q-evebitda", "MAX EV/EBITDA", 5, 80, 1, 35, "x");
  h += slider("q-fscore", "MIN PIOTROSKI", 1, 9, 1, 7, "/9");
  h += slider("q-surp", "MIN EARNINGS SURPRISE", -10, 30, 1, 0, "%");
  h += '</div>';
  h += '<div class="card" style="display:flex;gap:20px;flex-wrap:wrap;align-items:center;">';
  const tog = (id, label) =>
   '<label style="font-size:12px;color:#e8ecf1;cursor:pointer;display:flex;align-items:center;gap:8px;">' +
   '<input id="' + id + '" type="checkbox" style="accent-color:#38bdf8;width:16px;height:16px;">' + label + '</label>';
  h += tog("q-oplev", "Revenue growth > COGS growth");
  h += tog("q-margexp", "YoY margin expansion");
  h += tog("q-golden", "Golden trend (price > 50 > 200 SMA)");
  h += '<button class="btn secondary" id="q-reset" style="margin-left:auto;">Reset</button>';
  h += '<button class="btn secondary" id="q-export">Export CSV</button>';
  h += '</div>';
  h += '<div class="card"><div style="font-size:12px;color:var(--muted);margin-bottom:8px;">MATCHING: <b id="q-count" style="color:#38bdf8;"></b></div>';
  h += '<div class="table-wrap"><table class="coverage"><thead><tr>' +
   '<th data-qsort="ticker" style="cursor:pointer;">Ticker</th>' +
   '<th data-qsort="price" style="cursor:pointer;text-align:right;">Price</th>' +
   '<th data-qsort="roic" style="cursor:pointer;text-align:right;">ROIC</th>' +
   '<th data-qsort="pegRatio" style="cursor:pointer;text-align:right;">PEG</th>' +
   '<th data-qsort="fcfYield" style="cursor:pointer;text-align:right;">FCF Yld</th>' +
   '<th data-qsort="evToEbitda" style="cursor:pointer;text-align:right;">EV/EBITDA</th>' +
   '<th style="text-align:center;">Op Lev</th>' +
   '<th data-qsort="piotroskiFScore" style="cursor:pointer;text-align:center;">F-Score</th>' +
   '<th data-qsort="earningsSurprisePct" style="cursor:pointer;text-align:right;">Surprise</th>' +
   '<th style="text-align:center;">Trend</th>' +
   '</tr></thead><tbody id="q-body"></tbody></table></div>';
  h += '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;font-size:12px;">' +
   '<button class="btn secondary" id="q-prev">Prev</button><span id="q-page" style="color:var(--muted);align-self:center;"></span>' +
   '<button class="btn secondary" id="q-next">Next</button></div></div></div>';
  return h;
 }

 function initQuantScreener() {
  const sd = D.screener_data;
  const stocks = (sd && sd.data) || [];
  const body = document.getElementById("q-body");
  if (!body) return;
  let sortCol = "roic", sortDir = "desc", page = 1;
  const perPage = 20;
  const val = (id) => +document.getElementById(id).value;
  const chk = (id) => document.getElementById(id).checked;

  function filtered() {
   const term = document.getElementById("q-search").value.toLowerCase();
   const r = stocks.filter((s) => {
    if (term && !(s.ticker.toLowerCase().includes(term) || (s.companyName || "").toLowerCase().includes(term))) return false;
    if (s.roic < val("q-roic")) return false;
    if (s.pegRatio > 0 && s.pegRatio > val("q-peg")) return false;
    if (s.fcfYield < val("q-fcf")) return false;
    if (s.evToEbitda > 0 && s.evToEbitda > val("q-evebitda")) return false;
    if ((s.piotroskiFScore || 0) < val("q-fscore")) return false;
    if (s.earningsSurprisePct < val("q-surp")) return false;
    if (chk("q-oplev") && !s.operatingLeverage) return false;
    if (chk("q-margexp") && !(s.grossMarginExpanding && s.operatingMarginExpanding)) return false;
    if (chk("q-golden") && !s.goldenTrend) return false;
    return true;
   });
   r.sort((a, b) => {
    const av = a[sortCol], bv = b[sortCol];
    if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === "asc" ? (av - bv) : (bv - av);
   });
   return r;
  }

  function draw() {
   const rows = filtered();
   const pages = Math.max(1, Math.ceil(rows.length / perPage));
   if (page > pages) page = pages;
   const slice = rows.slice((page - 1) * perPage, page * perPage);
   document.getElementById("q-count").textContent = rows.length + " / " + stocks.length;
   document.getElementById("q-page").textContent = "Page " + page + " of " + pages;
   body.innerHTML = slice.map((s) => {
    const bull = s.goldenTrend ? '<span style="color:#3fb950;font-weight:700;">▲ BULL</span>' : '<span style="color:#8b8fa3;">▼ WEAK</span>';
    const oplev = s.operatingLeverage ? '<span style="color:#3fb950;font-weight:700;">YES</span>' : '<span style="color:#8b8fa3;">-</span>';
    const fs = s.piotroskiFScore;
    const fsc = fs == null ? "#8b8fa3" : (fs >= 8 ? "#38bdf8" : (fs >= 6 ? "#e8ecf1" : "#f85149"));
    return '<tr><td><b style="color:#e8ecf1;">' + esc(s.ticker) + '</b> <span style="font-size:10px;color:var(--muted);">' + esc(s.companyName || "") + '</span></td>' +
     '<td style="text-align:right;">' + fmt$(s.price) + '</td>' +
     '<td style="text-align:right;color:' + (s.roic >= 20 ? "#3fb950" : "#e8ecf1") + ';">' + s.roic.toFixed(1) + '%</td>' +
     '<td style="text-align:right;">' + (s.pegRatio > 0 ? s.pegRatio.toFixed(2) : "N/A") + '</td>' +
     '<td style="text-align:right;">' + s.fcfYield.toFixed(1) + '%</td>' +
     '<td style="text-align:right;">' + (s.evToEbitda > 0 ? s.evToEbitda.toFixed(1) + "x" : "N/A") + '</td>' +
     '<td style="text-align:center;">' + oplev + '</td>' +
     '<td style="text-align:center;font-weight:700;color:' + fsc + ';">' + (fs == null ? "N/A" : fs + "/9") + '</td>' +
     '<td style="text-align:right;color:' + (s.earningsSurprisePct > 0 ? "#3fb950" : (s.earningsSurprisePct < 0 ? "#f85149" : "#8b8fa3")) + ';">' +
     (s.earningsSurprisePct > 0 ? "+" : "") + s.earningsSurprisePct.toFixed(1) + '%</td>' +
     '<td style="text-align:center;">' + bull + '</td></tr>';
   }).join("") || '<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:24px;">No securities match the selected criteria.</td></tr>';
  }

  ["q-search", "q-roic", "q-peg", "q-fcf", "q-evebitda", "q-fscore", "q-surp", "q-oplev", "q-margexp", "q-golden"].forEach((id) => {
   const el = document.getElementById(id);
   el.addEventListener(el.type === "checkbox" || el.type === "text" ? "input" : "input", () => {
    const lbl = document.getElementById(id + "-v");
    if (lbl) {
     const unit = id === "q-peg" || id === "q-evebitda" ? "x" : (id === "q-fscore" ? "/9" : "%");
     lbl.textContent = el.value + unit;
    }
    page = 1;
    draw();
   });
  });
  document.querySelectorAll("[data-qsort]").forEach((th) => th.addEventListener("click", () => {
   const c = th.dataset.qsort;
   if (sortCol === c) sortDir = sortDir === "asc" ? "desc" : "asc";
   else { sortCol = c; sortDir = "desc"; }
   draw();
  }));
  document.getElementById("q-prev").addEventListener("click", () => { if (page > 1) { page--; draw(); } });
  document.getElementById("q-next").addEventListener("click", () => { page++; draw(); });
  document.getElementById("q-reset").addEventListener("click", () => {
   document.getElementById("q-search").value = "";
   const d = { "q-roic": 15, "q-peg": 2, "q-fcf": 0, "q-evebitda": 35, "q-fscore": 7, "q-surp": 0 };
   Object.keys(d).forEach((id) => {
    document.getElementById(id).value = d[id];
    const lbl = document.getElementById(id + "-v");
    if (lbl) lbl.textContent = d[id] + (id === "q-peg" || id === "q-evebitda" ? "x" : (id === "q-fscore" ? "/9" : "%"));
   });
   ["q-oplev", "q-margexp", "q-golden"].forEach((id) => document.getElementById(id).checked = false);
   page = 1; draw();
  });
  document.getElementById("q-export").addEventListener("click", () => {
   const rows = filtered();
   const csv = "ticker,company,sector,price,roic,peg,fcf_yield,ev_ebitda,op_leverage,piotroski,surprise_pct,golden_trend\n" +
    rows.map((s) => [s.ticker, '"' + (s.companyName || "").replace(/"/g, "") + '"', '"' + (s.sector || "").replace(/"/g, "") + '"',
     s.price, s.roic, s.pegRatio, s.fcfYield, s.evToEbitda, s.operatingLeverage ? "YES" : "NO",
     s.piotroskiFScore == null ? "" : s.piotroskiFScore, s.earningsSurprisePct, s.goldenTrend ? "BULL" : "WEAK"].join(",")).join("\n");
   dl("quant_screener.csv", csv, "text/csv");
  });
  draw();
 }

 /* Trend & Reversal screener (Pro): conviction + exhaustion across coverage */
 function trendScreenerHtml() {
  const tk = ((D.trend_signals || {}).tickers) || {};
  const keys = Object.keys(tk).sort();
  let h = '<div class="section" style="max-width:none;margin-top:32px;"><div class="section-title">Trend & Reversal Screener <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>';
  h += '<div class="section-sub">Trend Conviction (is this a real trend?) vs Exhaustion Risk (is momentum diverging?) for every coverage ticker. ' +
   'High conviction + low exhaustion = healthy trend. High conviction + high exhaustion = crowded trade, tighten up. Updated ' +
   esc((((D.trend_signals || {}).timestampUTC) || "").slice(0, 16).replace("T", " ")) + ' UTC, every trading morning.</div>';
  h += '<div class="card"><div class="table-wrap"><table class="coverage"><thead><tr>' +
   '<th data-tsort="ticker" style="cursor:pointer;">Ticker</th>' +
   '<th data-tsort="price" style="cursor:pointer;text-align:right;">Price</th>' +
   '<th data-tsort="trend" style="cursor:pointer;text-align:right;">Conviction</th>' +
   '<th data-tsort="exh" style="cursor:pointer;text-align:right;">Exhaustion</th>' +
   '<th data-tsort="dir" style="cursor:pointer;">Direction</th>' +
   '<th data-tsort="adx" style="cursor:pointer;text-align:right;">ADX</th>' +
   '<th data-tsort="rsi" style="cursor:pointer;text-align:right;">RSI</th>' +
   '<th>Signal</th>' +
   '</tr></thead><tbody id="trend-body"></tbody></table></div></div></div>';
  return h;
 }
 function initTrendScreener() {
  const tk = ((D.trend_signals || {}).tickers) || {};
  const body = document.getElementById("trend-body");
  if (!body) return;
  let sortK = "trend", sortD = -1;
  const sigLabel = (s) => {
   if (s.trendScore >= 60 && s.exhaustionScore < 40) return '<span style="color:#3fb950;font-weight:700;">Healthy trend</span>';
   if (s.trendScore >= 60 && s.exhaustionScore >= 60) return '<span style="color:#f85149;font-weight:700;">Crowded, caution</span>';
   if (s.exhaustionScore >= 60) return '<span style="color:#d29922;font-weight:700;">Reversal risk</span>';
   if (s.trendScore < 30) return '<span style="color:#8b949e;">Chop</span>';
   return '<span style="color:#e8ecf1;">Developing</span>';
  };
  const draw = () => {
   const rows = Object.keys(tk).map((k) => ({ k, s: tk[k] }));
   rows.sort((a, b) => {
    const av = sortK === "ticker" ? a.k : sortK === "dir" ? a.s.trendDirection :
     sortK === "trend" ? a.s.trendScore : sortK === "exh" ? a.s.exhaustionScore :
     sortK === "adx" ? a.s.adx : sortK === "rsi" ? a.s.rsi : a.s.price;
    const bv = sortK === "ticker" ? b.k : sortK === "dir" ? b.s.trendDirection :
     sortK === "trend" ? b.s.trendScore : sortK === "exh" ? b.s.exhaustionScore :
     sortK === "adx" ? b.s.adx : sortK === "rsi" ? b.s.rsi : b.s.price;
    return (av > bv ? 1 : av < bv ? -1 : 0) * sortD;
   });
   body.innerHTML = rows.map((r) => {
    const s = r.s;
    const tc = s.trendScore >= 60 ? "#3fb950" : s.trendScore >= 30 ? "#d29922" : "#8b949e";
    const ec = s.exhaustionScore >= 60 ? "#f85149" : s.exhaustionScore >= 30 ? "#d29922" : "#3fb950";
    return '<tr style="cursor:pointer;" data-tk="' + r.k + '">' +
     '<td style="font-weight:700;"><a href="#/' + r.k + '" style="color:#58a6ff;">' + r.k + "</a></td>" +
     '<td style="text-align:right;">$' + s.price.toFixed(2) + "</td>" +
     '<td style="text-align:right;color:' + tc + ';font-weight:700;">' + s.trendScore + "</td>" +
     '<td style="text-align:right;color:' + ec + ';font-weight:700;">' + s.exhaustionScore + "</td>" +
     '<td style="color:' + (s.trendDirection === "Bullish" ? "#3fb950" : "#f85149") + ';">' + s.trendDirection + "</td>" +
     '<td style="text-align:right;">' + s.adx + "</td>" +
     '<td style="text-align:right;">' + s.rsi + "</td>" +
     "<td>" + sigLabel(s) + "</td></tr>";
   }).join("");
  };
  document.querySelectorAll("[data-tsort]").forEach((th) => {
   th.addEventListener("click", () => {
    const k = th.getAttribute("data-tsort");
    if (sortK === k) sortD *= -1; else { sortK = k; sortD = -1; }
    draw();
   });
  });
  draw();
 }

 /* Technical factor screener: Minervini Trend Template (Pro) */
 function minerviniHtml() {
  const md = D.minervini_data;
  const meta = (md && md.metadata) || {};
  let h = '<div class="section" style="max-width:none;margin-top:32px;"><div class="section-title">Technical Factor Screener <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>';
  h += '<div class="section-sub">Mark Minervini Trend Template: 8 Stage-2 uptrend criteria plus a 1-99 RS rating across the full S&P 500. ' +
   (meta.fullStage2Count != null ? '<b style="color:#3fb950;">' + meta.fullStage2Count + ' names pass all 8</b>. ' : '') +
   'Updated ' + esc((meta.lastUpdated || "").slice(0, 16).replace("T", " ")) + ' UTC, every trading morning. Click a row to inspect its criteria card.</div>';
  h += '<div style="display:grid;grid-template-columns:1fr;gap:16px;" id="min-wrap">';
  h += '<div class="card"><div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:12px;">' +
   '<input id="m-search" type="text" placeholder="Filter ticker" style="background:#0d1117;border:1px solid #2a3242;border-radius:6px;color:#e8ecf1;padding:8px 10px;">' +
   '<button class="btn secondary m-filter" data-f="all">All</button>' +
   '<button class="btn secondary m-filter" data-f="8">8/8 pass</button>' +
   '<button class="btn secondary m-filter" data-f="7">7+ pass</button>' +
   '<button class="btn secondary" id="m-export" style="margin-left:auto;">Export CSV</button></div>';
  h += '<style>@media (max-width:640px){.min-grid{grid-template-columns:1fr !important;}}</style>';
  h += '<div style="display:grid;grid-template-columns:minmax(0,7fr) minmax(0,5fr);gap:16px;" class="min-grid">';
  h += '<div class="table-wrap"><table class="coverage"><thead><tr>' +
   '<th data-msort="ticker" style="cursor:pointer;">Ticker</th>' +
   '<th data-msort="price" style="cursor:pointer;text-align:right;">Price</th>' +
   '<th data-msort="sma50" style="cursor:pointer;text-align:right;">SMA 50</th>' +
   '<th data-msort="sma200" style="cursor:pointer;text-align:right;">SMA 200</th>' +
   '<th data-msort="rsRating" style="cursor:pointer;text-align:right;">RS</th>' +
   '<th data-msort="totalPassed" style="cursor:pointer;text-align:center;">Score</th>' +
   '</tr></thead><tbody id="m-body"></tbody></table></div>';
  h += '<div id="m-card"></div>';
  h += '</div></div></div>';
  return h;
 }

 function initMinervini() {
  const md = D.minervini_data;
  const stocks = (md && md.data) || [];
  const body = document.getElementById("m-body");
  if (!body) return;
  let filter = "all", sortCol = "totalPassed", sortDir = "desc", selected = stocks.length ? stocks[0].ticker : null;

  function filtered() {
   const term = document.getElementById("m-search").value.toLowerCase();
   const r = stocks.filter((s) => {
    if (term && !s.ticker.toLowerCase().includes(term)) return false;
    if (filter === "8" && s.totalPassed !== 8) return false;
    if (filter === "7" && s.totalPassed < 7) return false;
    return true;
   });
   r.sort((a, b) => {
    const av = a[sortCol], bv = b[sortCol];
    if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === "asc" ? (av - bv) : (bv - av);
   });
   return r;
  }

  function cardHtml(s) {
   if (!s) return '<div class="card"><p style="color:var(--muted);text-align:center;padding:24px;">Select a ticker to inspect its 8-point criteria.</p></div>';
   const badge = s.meetsAll
    ? '<span style="font-size:10px;font-weight:700;color:#3fb950;border:1px solid #3fb950;border-radius:4px;padding:3px 8px;">STAGE 2 CONFIRMED</span>'
    : '<span style="font-size:10px;font-weight:700;color:#f85149;border:1px solid #f85149;border-radius:4px;padding:3px 8px;">NON-QUALIFIED</span>';
   let h = '<div class="card" style="padding:0;overflow:hidden;"><div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid #2a3242;">' +
    '<div><div style="font-size:10px;color:var(--muted);letter-spacing:1px;">INSPECTING</div>' +
    '<div style="font-size:18px;font-weight:800;color:#e8ecf1;">' + esc(s.ticker) + ' <span style="font-size:13px;font-weight:400;color:var(--muted);">' + fmt$(s.price) + '</span></div></div>' + badge + '</div>';
   h += '<table style="width:100%;border-collapse:collapse;font-size:11px;"><thead><tr style="background:#14b8a6;">' +
    '<th colspan="2" style="padding:8px;color:#0a0d14;font-size:11px;letter-spacing:1px;">CRITERIA</th></tr></thead><tbody>';
   s.criteria.forEach((c) => {
    const bg = c.passed ? "background:rgba(63,185,80,0.08);" : "background:rgba(248,81,73,0.08);";
    const col = c.passed ? "#3fb950" : "#f85149";
    h += '<tr style="border-bottom:1px solid #1c2330;' + bg + '">' +
     '<td style="padding:8px 10px;color:#e8ecf1;">' + esc(c.label) + '<div style="font-size:10px;color:var(--muted);margin-top:2px;">' + esc(c.value) + '</div></td>' +
     '<td style="padding:8px 10px;text-align:center;font-weight:800;color:' + col + ';min-width:64px;">' + (c.passed ? "yes" : "no") + '</td></tr>';
   });
   h += '<tr style="background:#161b26;font-weight:700;"><td style="padding:10px;color:#e8ecf1;">Meet minervini criteria</td>' +
    '<td style="padding:10px;text-align:center;color:#e8ecf1;">(' + s.totalPassed + ' of 8)</td></tr>';
   h += '</tbody></table>';
   h += '<div style="padding:12px 16px;font-size:11px;color:var(--muted);line-height:1.8;">' +
    '<div><b style="color:#e8ecf1;">52W Low:</b> ' + fmt$(s.low52w) + ' (+' + s.pctAboveLow.toFixed(1) + '%)</div>' +
    '<div><b style="color:#e8ecf1;">52W High:</b> ' + fmt$(s.high52w) + ' (-' + s.pctFromHigh.toFixed(1) + '%)</div>' +
    '<div><b style="color:#e8ecf1;">RS Percentile:</b> ' + s.rsRating + ' / 99</div></div></div>';
   return h;
  }

  function draw() {
   const rows = filtered();
   body.innerHTML = rows.map((s) => {
    const sel = s.ticker === selected ? ' style="background:#1a2233;"' : "";
    const rsc = s.rsRating >= 70 ? "#3fb950" : "#f85149";
    const sc = s.totalPassed === 8 ? "#3fb950" : (s.totalPassed >= 6 ? "#f0b429" : "#f85149");
    return '<tr data-tk="' + esc(s.ticker) + '"' + sel + ' style="cursor:pointer;">' +
     '<td><b style="color:#e8ecf1;">' + esc(s.ticker) + '</b></td>' +
     '<td style="text-align:right;">' + fmt$(s.price) + '</td>' +
     '<td style="text-align:right;color:var(--muted);">' + fmt$(s.sma50) + '</td>' +
     '<td style="text-align:right;color:var(--muted);">' + fmt$(s.sma200) + '</td>' +
     '<td style="text-align:right;font-weight:700;color:' + rsc + ';">' + s.rsRating.toFixed(1) + '</td>' +
     '<td style="text-align:center;font-weight:700;color:' + sc + ';">' + s.totalPassed + ' / 8</td></tr>';
   }).join("") || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px;">No matches.</td></tr>';
   body.querySelectorAll("tr[data-tk]").forEach((tr) => tr.addEventListener("click", () => {
    selected = tr.dataset.tk;
    draw();
   }));
   const sel = stocks.find((x) => x.ticker === selected);
   document.getElementById("m-card").innerHTML = cardHtml(sel);
  }

  document.getElementById("m-search").addEventListener("input", draw);
  document.querySelectorAll(".m-filter").forEach((b) => b.addEventListener("click", () => {
   filter = b.dataset.f;
   document.querySelectorAll(".m-filter").forEach((x) => x.classList.remove("active"));
   b.classList.add("active");
   draw();
  }));
  document.querySelectorAll("[data-msort]").forEach((th) => th.addEventListener("click", () => {
   const c = th.dataset.msort;
   if (sortCol === c) sortDir = sortDir === "asc" ? "desc" : "asc";
   else { sortCol = c; sortDir = "desc"; }
   draw();
  }));
  document.getElementById("m-export").addEventListener("click", () => {
   const rows = filtered();
   const csv = "ticker,price,sma50,sma150,sma200,rs_rating,total_passed,meets_all\n" +
    rows.map((s) => [s.ticker, s.price, s.sma50, s.sma150, s.sma200, s.rsRating, s.totalPassed, s.meetsAll ? "YES" : "NO"].join(",")).join("\n");
   dl("minervini_screener.csv", csv, "text/csv");
  });
  const firstFilter = document.querySelector('.m-filter[data-f="all"]');
  if (firstFilter) firstFilter.classList.add("active");
  draw();
 }

 route("screener", function () {
  const pro = isPro();
  // Coverage screener is FREE; factor screeners below are Pro
  let h = '<div class="section"><div class="section-title">Premium Screener</div>' +
   '<div class="section-sub">Filter the coverage universe. Methodology: Cascadia Score = weighted multi-factor: valuation (base-case upside, 40%), price momentum (MA signals, 30%), earnings momentum (latest verdict, 20%), options flow sentiment (10%). Scored 1–100.</div>';
  h += '<div class="card"><div class="filter-bar">' +
   '<select id="f-rating"><option value="">Any rating</option><option>Buy</option><option>Hold</option><option>Sell</option></select>' +
   '<select id="f-score"><option value="">Any score</option><option value="65">Score 65+</option><option value="50">Score 50+</option><option value="40">Score 40+</option></select>' +
   '<select id="f-upside"><option value="">Any upside</option><option value="20">Upside 20%+</option><option value="0">Positive upside</option><option value="-20">Upside &gt; -20%</option></select>' +
   '<button class="btn secondary" id="f-export">Export CSV</button>' +
   "</div>" +
   '<div class="table-wrap"><table class="coverage"><thead><tr>' +
   "<th>Ticker</th><th>Score</th><th>Growth &amp; Value Index</th><th>Price</th><th>Base</th><th>Upside</th><th>Rating</th>" +
   "</tr></thead><tbody id='scr-body'></tbody></table></div></div></div>";
  app.innerHTML = h;
  const body = document.getElementById("scr-body");
  function rows() {
   const fr = document.getElementById("f-rating").value;
   const fs = +document.getElementById("f-score").value || 0;
   const fu = document.getElementById("f-upside").value === "" ? -999 : +document.getElementById("f-upside").value;
   return ORDER.map((tk) => ({ tk, t: TICKERS[tk], s: cascadiaScore(TICKERS[tk]) }))
    .filter((r) => (!fr || (r.t.rating || "").startsWith(fr)) && (r.s == null || r.s >= fs) && ((r.t.upside_base || -999) >= fu))
    .sort((a, b) => (b.s || 0) - (a.s || 0));
  }
  function draw() {
   body.innerHTML = rows().map((r) => {
    const attr = r.t.scorecard && r.t.scorecard.score;
    const attrBand = attr != null ? (attr >= 80 ? "Highly Attractive" : attr >= 65 ? "Attractive" : attr >= 50 ? "Fair" : attr >= 35 ? "Unattractive" : "Avoid") : null;
    return '<tr data-tk="' + esc(r.tk) + '"><td><a href="#/ticker/' + esc(r.tk) + '" class="ticker-cell" style="text-decoration:none;">' + esc(r.tk) + "</a></td>" +
    "<td>" + (r.s != null ? '<span class="score-badge ' + scoreClass(r.s) + '" style="width:36px;height:36px;font-size:13px;" title="' + esc(scoreTooltip(r.t)) + '">' + r.s + "</span>" : " - ") + "</td>" +
    "<td>" + (attr != null ? '<span class="score-badge ' + scoreClass(attr) + '" style="width:36px;height:36px;font-size:13px;" title="Investment Scorecard: ' + attrBand + '">' + attr + "</span>" : " - ") + "</td>" +
    "<td>" + fmt$(r.t.price) + "</td><td>" + fmt$(r.t.base, 0) + "</td>" +
    '<td class="' + cls(r.t.upside_base) + '">' + fmtPct(r.t.upside_base) + "</td>" +
    '<td class="' + ratingCls(r.t.rating) + '">' + esc(r.t.rating || " - ") + "</td></tr>"; }).join("") ||
    '<tr><td colspan="7" style="text-align:center;color:var(--muted)">No matches.</td></tr>';
   body.querySelectorAll("tr[data-tk]").forEach((tr) => tr.addEventListener("click", () => nav("ticker/" + tr.dataset.tk)));
  }
  ["f-rating", "f-score", "f-upside"].forEach((id) => document.getElementById(id).addEventListener("change", draw));
  document.getElementById("f-export").addEventListener("click", () => {
   const csv = "ticker,name,score,growth_value_index,price,base,upside_pct,rating\n" + rows().map((r) => {
    const attr = r.t.scorecard && r.t.scorecard.score;
    return [r.tk, '"' + (r.t.name || "").replace(/"/g, "") + '"', r.s || "", attr || "", r.t.price || "", r.t.base || "", r.t.upside_base || "", r.t.rating || ""].join(","); }).join("\n");
   dl("cascadia_screener.csv", csv, "text/csv");
  });
  draw();
  if (pro) {
   // Quantitative factor screener (Pro), under the coverage screener
   const quantDiv = document.createElement("div");
   quantDiv.innerHTML = quantScreenerHtml();
   app.appendChild(quantDiv);
   initQuantScreener();
   // Technical factor screener: Minervini Trend Template (Pro), below quantitative
   const minDiv = document.createElement("div");
   minDiv.innerHTML = minerviniHtml();
   app.appendChild(minDiv);
   initMinervini();
   // Trend & Reversal screener (Pro), below Minervini
   const trendDiv = document.createElement("div");
   trendDiv.innerHTML = trendScreenerHtml();
   app.appendChild(trendDiv);
   initTrendScreener();
  } else {
   const t1 = document.createElement("div");
   t1.innerHTML = '<div class="section" style="max-width:none;margin-top:32px;"><div class="section-title">Quantitative Factor Screener <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>' +
    proTeaser("Quantitative Factor Screener, Pro", "Screen the full S&P 500 on institutional alpha factors: ROIC, PEG, FCF yield, EV/EBITDA, Piotroski F-Score, operating leverage, golden trend. Sliders, sortable columns, CSV export.") + "</div>";
   app.appendChild(t1);
   const t2 = document.createElement("div");
   t2.innerHTML = '<div class="section" style="max-width:none;margin-top:32px;"><div class="section-title">Technical Factor Screener <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>' +
    proTeaser("Technical Factor Screener, Pro", "Mark Minervini Trend Template: 8 Stage-2 uptrend criteria plus a 1-99 RS rating across the full S&P 500. Click any ticker to inspect its full criteria card.") + "</div>";
   app.appendChild(t2);
   const t3 = document.createElement("div");
   t3.innerHTML = '<div class="section" style="max-width:none;margin-top:32px;"><div class="section-title">Trend & Reversal Screener <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>' +
    proTeaser("Trend & Reversal Screener, Pro", "Trend Conviction vs Exhaustion Risk for every coverage ticker. Spot healthy trends, crowded trades, and MACD divergences before reversals.") + "</div>";
   app.appendChild(t3);
  }
 });

 /* ================= EARNINGS DASHBOARD (Pro) ================= */
 route("earnings", async function () {
  await ensureProData();
  if (!isPro()) {
   app.innerHTML = '<div class="crumb">EARNINGS DASHBOARD</div>' +
    '<div class="hero"><div><h1 class="hero-h">Earnings Dashboard.</h1>' +
    "<p class='hero-sub'>8 quarters of earnings surprises and price reactions for every covered ticker.</p></div></div>" +
    '<div class="section"><div class="section-title">Earnings Dashboard <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>' +
    proTeaser("Earnings Dashboard, Pro", "Track earnings beats/misses and 1-day price reactions across 8 quarters for all covered tickers.") + "</div>";
   return;
  }
  const dash = (D.earnings_dashboard || {});
  const tickers = Object.keys(dash).sort();
  if (!tickers.length) {
   app.innerHTML = '<div class="section"><div class="section-title">Earnings Dashboard <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div><div class="card"><p style="color:var(--muted)">No earnings dashboard data yet. Check back after the morning refresh.</p></div></div>';
   return;
  }
  const fmt$ = (v, isB) => {
   if (v == null || isNaN(v)) return "N/A";
   if (isB) return "$" + (v / 1e9).toFixed(2) + "B";
   return "$" + v.toFixed(2);
  };
  const fmtPct = (v) => {
   if (v == null || isNaN(v)) return "N/A";
   const s = (Math.abs(v * 100)).toFixed(1) + "%";
   return v > 0 ? "+" + s : v < 0 ? "-" + s : s;
  };
  const fmtD = (d) => {
   if (!d) return "N/A";
   return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };
  let sel = tickers[0];
  const renderDash = (tk) => {
   const d = dash[tk];
   if (!d) return "";
   let h = '<div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:20px;">';
   // Ticker card
   h += '<div class="card" style="padding:24px;"><div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;"><div>' + tickerLogo(tk) + '</div><h1 style="font-size:28px;margin:0;">' + esc(tk) + ' <span style="font-weight:400;font-size:18px;color:var(--muted)">- ' + esc(d.name || tk) + '</span></h1></div>';
   if (d.upcoming) {
    h += '<p style="color:var(--muted);margin:0;">Next earnings: <b style="color:#fff;">' + fmtD(d.upcoming.date) + '</b>';
    if (d.upcoming.eps_est != null) h += ' &nbsp; Est. EPS ' + fmt$(d.upcoming.eps_est);
    if (d.upcoming.rev_est != null) h += ' &nbsp; Est. Rev ' + fmt$(d.upcoming.rev_est, true);
    h += '</p>';
   } else {
    h += '<p style="color:var(--muted);margin:0;">Next earnings: TBD</p>';
   }
   h += '<p style="font-size:11px;color:var(--muted);margin:8px 0 0;">Updated ' + esc(d.as_of || "") + '</p></div>';
   // Upcoming estimates card
   h += '<div class="card" style="padding:24px;text-align:center;"><div style="font-size:11px;color:#c9a86a;font-weight:700;letter-spacing:1px;margin-bottom:12px;">UPCOMING ESTIMATES</div>';
   h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">';
   h += '<div><div style="font-size:11px;color:var(--muted);">Est. Revenue</div><div style="font-size:20px;font-weight:700;color:#c9a86a;">' + (d.upcoming ? fmt$(d.upcoming.rev_est, true) : "N/A") + '</div></div>';
   h += '<div><div style="font-size:11px;color:var(--muted);">Est. EPS</div><div style="font-size:20px;font-weight:700;color:#c9a86a;">' + (d.upcoming ? fmt$(d.upcoming.eps_est) : "N/A") + '</div></div>';
   h += '</div></div></div>';
   // History table
   h += '<div class="card" style="padding:0;overflow:hidden;"><div style="padding:16px 24px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;"><b>Past 8 Quarters: Earnings & Price Reactions</b><span style="font-size:11px;color:var(--muted);">Updated ' + esc(d.collected_at || d.as_of || "") + '</span></div>';
   h += '<div class="table-wrap"><table class="coverage"><thead><tr><th>Report Date</th><th>Revenue vs Est.</th><th>EPS vs Est.</th><th>1-Day Reaction</th></tr></thead><tbody>';
   (d.history || []).forEach((q) => {
    const revCls = q.rev_surprise_pct == null ? "" : (q.rev_surprise_pct >= 0 ? "pos" : "neg");
    const epsCls = q.eps_surprise_pct == null ? "" : (q.eps_surprise_pct >= 0 ? "pos" : "neg");
    const reactCls = q.price_reaction == null ? "" : (q.price_reaction >= 0 ? "pos" : "neg");
    const reactTxt = q.price_reaction == null ? "N/A" : (q.price_reaction >= 0 ? "Up +" : "Down ") + Math.abs(q.price_reaction * 100).toFixed(1) + "%";
    h += "<tr><td>" + fmtD(q.date) + "</td>" +
     '<td><span class="' + revCls + '">' + fmt$(q.rev_act, true) + ' vs ' + fmt$(q.rev_est, true) + ' (' + fmtPct(q.rev_surprise_pct) + ')</span></td>' +
     '<td><span class="' + epsCls + '">' + fmt$(q.eps_act) + ' vs ' + fmt$(q.eps_est) + ' (' + fmtPct(q.eps_surprise_pct) + ')</span></td>' +
     '<td class="' + reactCls + '"><b>' + reactTxt + '</b></td></tr>';
   });
   h += "</tbody></table></div></div>";
   return h;
  };
  let h = '<div class="crumb">PRO · EARNINGS DASHBOARD</div>' +
   '<div class="hero"><div><h1 class="hero-h">Earnings Dashboard.</h1>' +
   "<p class='hero-sub'>8 quarters of earnings surprises and 1-day price reactions for every covered ticker. Refreshed every trading morning.</p></div></div>";
  h += '<div class="section"><div class="section-title">Earnings Dashboard <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>';
  h += '<div class="card" style="margin-bottom:16px;"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;"><span style="font-size:12px;color:var(--muted);">Ticker:</span>';
  h += '<select id="ed-ticker" style="padding:8px 12px;border-radius:6px;background:var(--bg);border:1px solid var(--border);color:#fff;font-size:14px;">' +
   tickers.map((t) => '<option value="' + esc(t) + '"' + (t === sel ? " selected" : "") + '>' + esc(t) + '</option>').join("") + '</select>';
  h += '<span style="font-size:11px;color:var(--muted);margin-left:auto;">Auto-sync: 12:00 UTC weekdays</span></div></div>';
  h += '<div id="ed-body">' + renderDash(sel) + '</div></div>';
  app.innerHTML = h;
  document.getElementById("ed-ticker").addEventListener("change", (e) => {
   document.getElementById("ed-body").innerHTML = renderDash(e.target.value);
  });
 });

 /* ================= COMPS MATRIX (PRO) ================= */
 route("comps", async function () {
  await ensureProData();
  if (!isPro()) {
   app.innerHTML = '<div class="crumb">COMPS MATRIX</div>' +
    '<div class="hero"><div><h1 class="hero-h">Relative Valuation.</h1>' +
    "<p class='hero-sub'>Cross-reference DCF values with regression-modeled peer multiples.</p></div></div>" +
    '<div class="section"><div class="section-title">Comps Matrix <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>' +
    proTeaser("Comps Matrix, Pro", "OLS regression of EV/Revenue and P/E against NTM growth across all " + ORDER.length + " tickers. Find discounted growth and stretched multiples.") + "</div>";
   return;
  }
  const cm = D.comps_matrix || {};
  const recs = cm.records || [];
  const meta = cm.metadata || {};
  if (!recs.length) {
   app.innerHTML = '<div class="crumb">COMPS MATRIX</div><div class="card"><p style="color:var(--muted)">No comps data available yet.</p></div>';
   return;
  }
  const discounts = [...recs].sort((a, b) => a.evRevDiscountPct - b.evRevDiscountPct).slice(0, 3);
  const premiums = [...recs].sort((a, b) => b.evRevDiscountPct - a.evRevDiscountPct).slice(0, 3);
  let h = '<div class="crumb">COMPS MATRIX</div>' +
   '<div class="hero"><div><h1 class="hero-h">Relative Valuation.</h1>' +
   "<p class='hero-sub'>NTM growth vs trading multiples with OLS peer regression. Updated " + esc((meta.lastUpdated || "").slice(0, 10)) + ".</p></div></div>";
  // Anomaly cards
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;margin-bottom:16px;">';
  h += '<div class="card" style="border:1px solid rgba(63,185,80,0.3);"><div style="font-size:12px;font-weight:700;color:#3fb950;margin-bottom:8px;">DISCOUNTED GROWTH</div>';
  discounts.forEach((d) => {
   h += '<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #1f2937;">' +
    '<span><b>' + esc(d.ticker) + '</b> <span style="color:#8b949e;">' + esc(d.name) + '</span></span>' +
    '<span style="color:#3fb950;font-weight:700;">' + d.evRevDiscountPct + '%</span></div>';
  });
  h += '</div>';
  h += '<div class="card" style="border:1px solid rgba(248,81,73,0.3);"><div style="font-size:12px;font-weight:700;color:#f85149;margin-bottom:8px;">PREMIUM MULTIPLES</div>';
  premiums.forEach((p) => {
   h += '<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #1f2937;">' +
    '<span><b>' + esc(p.ticker) + '</b> <span style="color:#8b949e;">' + esc(p.name) + '</span></span>' +
    '<span style="color:#f85149;font-weight:700;">+' + p.evRevDiscountPct + '%</span></div>';
  });
  h += '</div></div>';
  // Scatter chart
  h += '<div class="section"><div class="section-title">Growth vs Multiple <span style="font-size:11px;color:#8b949e;">(bubble size = market cap)</span></div>';
  h += '<div style="margin-bottom:8px;"><button class="btn" id="comps-toggle" style="font-size:12px;">Switch to Forward P/E</button></div>';
  h += '<div class="zoomable-chart" data-chart="comps" style="position:relative;height:420px;cursor:zoom-in;" title="Click to zoom"><canvas id="comps-chart"></canvas>' +
   '<div style="position:absolute;top:8px;right:10px;font-size:11px;color:#e8ecf1;background:rgba(19,23,34,0.8);padding:2px 8px;border-radius:4px;">⛶ click to zoom</div></div>';
  h += '<div style="font-size:11px;color:#8b949e;margin-top:6px;">Sector-relative OLS: each dashed line is the fair-value frontier for that GICS sector. Discounts/premiums are measured against sector peers, not the broad market.</div></div>';
  // Table
  h += '<div class="section"><div class="section-title">Comps Table</div><div class="card" style="overflow-x:auto;">';
  h += '<table style="width:100%;font-size:12px;border-collapse:collapse;"><thead><tr style="border-bottom:1px solid #2a3448;color:#8b949e;text-align:right;">' +
   '<th style="text-align:left;padding:8px;">Ticker</th><th style="text-align:left;padding:8px;">Sector</th>' +
   '<th style="padding:8px;">NTM Growth</th><th style="padding:8px;">EV/Rev</th><th style="padding:8px;">vs Peer</th>' +
   '<th style="padding:8px;">Fwd P/E</th><th style="padding:8px;">Status</th></tr></thead><tbody>';
  [...recs].sort((a, b) => a.evRevDiscountPct - b.evRevDiscountPct).forEach((r) => {
   const dc = r.evRevDiscountPct < 0 ? "#3fb950" : r.evRevDiscountPct > 0 ? "#f85149" : "#8b949e";
   const sc = r.status === "Discounted Growth" ? "#3fb950" : r.status === "Premium Multiple" ? "#f85149" : "#8b949e";
   h += '<tr style="border-bottom:1px solid #1a2332;">' +
    '<td style="padding:8px;"><a href="#/ticker/' + esc(r.ticker) + '" style="color:#58a6ff;font-weight:700;">' + esc(r.ticker) + '</a></td>' +
    '<td style="padding:8px;color:#8b949e;">' + esc(r.sector) + '</td>' +
    '<td style="padding:8px;text-align:right;">' + r.ntmRevGrowth + '%</td>' +
    '<td style="padding:8px;text-align:right;">' + r.ntmEvRevenue + 'x</td>' +
    '<td style="padding:8px;text-align:right;color:' + dc + ';font-weight:700;">' + (r.evRevDiscountPct > 0 ? "+" : "") + r.evRevDiscountPct + '%</td>' +
    '<td style="padding:8px;text-align:right;">' + (r.forwardPe > 0 ? r.forwardPe + "x" : "—") + '</td>' +
    '<td style="padding:8px;text-align:right;color:' + sc + ';">' + esc(r.status) + '</td></tr>';
  });
  h += '</tbody></table></div>';
  h += '<div class="panel-asof">Source: yfinance consensus estimates · OLS regression across coverage universe</div></div>';
  app.innerHTML = h;
  bindZoomHandlers();
  // Toggle button
  let usePE = false;
  document.getElementById("comps-toggle").addEventListener("click", function () {
   usePE = !usePE;
   this.textContent = usePE ? "Switch to EV/Revenue" : "Switch to Forward P/E";
   drawCompsChart(usePE);
  });
  drawCompsChart(false);
  function drawCompsChart(usePE) {
   const cv = document.getElementById("comps-chart");
   if (!cv || !window.Chart) return;
   const old = Chart.getChart(cv);
   if (old) old.destroy();
   const yKey = usePE ? "forwardPe" : "ntmEvRevenue";
   const colors = {"Semiconductors":"#10b981","Enterprise Software":"#38bdf8","Mega-Cap Tech":"#a855f7","Consumer & Marketplace":"#f59e0b","Fintech & Digital Assets":"#ec4899","Public Safety & Defense Tech":"#c99a6b","MedTech":"#6366f1","MedTech & Robotics":"#6366f1",
    "Information Technology":"#38bdf8","Health Care":"#6366f1","Financials":"#10b981","Consumer Discretionary":"#f59e0b","Consumer Staples":"#84cc16","Industrials":"#94a3b8","Energy":"#ef4444","Utilities":"#facc15","Real Estate":"#a855f7","Materials":"#f97316","Communication Services":"#ec4899","Other":"#6b7280"};
   const bySec = {};
   recs.forEach((r) => {
    if (usePE && !(r.forwardPe > 0 && r.forwardPe < 150)) return;
    (bySec[r.sector] = bySec[r.sector] || []).push(r);
   });
   const datasets = Object.keys(bySec).map((sec) => ({
    type: "bubble",
    label: sec,
    data: bySec[sec].map((r) => ({x: r.ntmRevGrowth, y: r[yKey], ticker: r.ticker, r: Math.max(4, Math.min(14, Math.log10(r.marketCap || 1e9) * 1.1))})),
    backgroundColor: (colors[sec] || "#38bdf8") + "AA",
    borderColor: colors[sec] || "#38bdf8",
    borderWidth: 1,
   }));
   // Sector-relative trendlines: each visible sector gets its own OLS line
   const secRegs = (meta.sectorRegressions || {});
   const xs = recs.map((r) => r.ntmRevGrowth);
   const x0 = Math.floor(Math.min(...xs, 0)), x1 = Math.ceil(Math.max(...xs, 60));
   Object.keys(bySec).forEach((sec) => {
    const sr = secRegs[sec];
    const rr = sr && (usePE ? sr.forwardPe : sr.evRevenue);
    if (!rr) return;
    datasets.unshift({type: "line", label: sec + " fair value", data: [{x: x0, y: rr.slope * x0 + rr.intercept}, {x: x1, y: rr.slope * x1 + rr.intercept}],
     borderColor: colors[sec] || "#c99a6b", borderWidth: 1.5, borderDash: [6, 4], pointRadius: 0, fill: false});
   });
   new Chart(cv, {data: {datasets}, options: {animation: false, responsive: true, maintainAspectRatio: false,
    plugins: {legend: {position: "bottom", labels: {color: "#8b949e", boxWidth: 10, font: {size: 10}}},
     tooltip: {callbacks: {title: (it) => it[0].raw.ticker || it[0].dataset.label || "Fair value", label: (c) => c.raw.ticker ? ["Growth: " + c.raw.x.toFixed(1) + "%", "Multiple: " + c.raw.y.toFixed(1) + "x"] : "Sector fair: " + c.raw.y.toFixed(1) + "x"}}},
    scales: {x: {title: {display: true, text: "NTM Revenue Growth (%)", color: "#8b949e"}, ticks: {color: "#8b949e", callback: (v) => v + "%"}, grid: {color: "rgba(42,46,57,0.4)"}},
     y: {title: {display: true, text: usePE ? "Forward P/E (x)" : "NTM EV/Revenue (x)", color: "#8b949e"}, ticks: {color: "#8b949e", callback: (v) => v + "x"}, grid: {color: "rgba(42,46,57,0.4)"}}}}});
  }
 });

 /* ================= RISK MODELS (PRO) ================= */
 function liquidityDrainHtml() {
  const L = D.liquidity_drain || {};
  if (L.totalScore == null) {
   return '<div class="section"><div class="section-title">Liquidity Drain Model <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>' +
    '<div class="card"><p style="color:var(--muted)">Liquidity data unavailable. Check back after the next refresh.</p></div></div>';
  }
  const colorMap = { emerald: "#3fb950", amber: "#d29922", rose: "#f85149" };
  const c = colorMap[L.color] || "#e8ecf1";
  const m = L.currentMetrics || {};
  let h = '<div class="section"><div class="section-title">Liquidity Drain Model <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>' +
   '<div class="section-sub">Net US liquidity, USD strength, and yield curve dynamics. Markets rarely crash when liquidity expands; they become vulnerable when it drains.</div>';
  h += '<div style="display:flex;align-items:center;gap:16px;margin:12px 0;padding:16px;border-radius:12px;background:rgba(255,255,255,0.02);border:1px solid #2a3448;">' +
   '<div style="text-align:center;min-width:90px;"><div style="font-size:11px;color:#8b949e;letter-spacing:0.5px;">SCORE</div>' +
   '<div style="font-size:36px;font-weight:800;color:' + c + ';">' + L.totalScore + '<span style="font-size:16px;color:#8b949e;">/100</span></div></div>' +
   '<div><div style="font-size:14px;font-weight:700;color:' + c + ';">' + esc(L.regime || "") + "</div>" +
   '<div style="font-size:12px;color:#8b949e;margin-top:4px;">Net liquidity $' + (m.netLiquidityB != null ? m.netLiquidityB.toLocaleString() : "-") + "B" +
   (m.dxy != null ? " · DXY " + m.dxy : "") +
   (m.t10y2y != null ? " · 10Y-2Y " + m.t10y2y + "%" : "") + "</div></div></div>";
  h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:12px 0;">';
  (L.scoreBreakdown || []).forEach((b) => {
   const bc = b.points >= 30 ? "#3fb950" : b.points > 0 ? "#d29922" : "#f85149";
   h += '<div style="background:#161b26;border-radius:10px;padding:12px;border-left:3px solid ' + bc + ';">' +
    '<div style="font-size:12px;font-weight:600;color:#e8ecf1;">' + esc(b.metric) + "</div>" +
    '<div style="font-size:11px;color:' + bc + ';margin-top:2px;font-weight:600;">' + esc(b.status) + " (" + b.points + " pts)</div>" +
    '<div style="font-size:11px;color:#8b949e;margin-top:2px;">' + esc(b.value || "") + "</div></div>";
  });
  h += "</div>";
  // Chart: net liquidity vs SPY
  h += '<div class="zoomable-chart" data-chart="liquidity-drain" style="position:relative;height:280px;margin:12px 0;cursor:zoom-in;" title="Click to zoom"><canvas id="liquidity-drain-chart"></canvas>' +
   '<div style="position:absolute;top:8px;right:10px;font-size:11px;color:#e8ecf1;background:rgba(19,23,34,0.8);padding:2px 8px;border-radius:4px;">⛶ click to zoom</div></div>';
  h += '<div class="panel-asof">As of ' + esc((L.as_of || "").slice(0, 10)) + "</div></div>";
  return h;
 }

 function rvShockHtml() {
  const R = D.rv_shock || {};
  if (!R.countdown) {
   return '<div class="section"><div class="section-title">RV Shock Model <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>' +
    '<div class="card"><p style="color:var(--muted)">RV Shock data unavailable. Check back after the next refresh.</p></div></div>';
  }
  const cd = R.countdown, rv = R.rvCurrent || {};
  const colorMap = { emerald: "#3fb950", amber: "#d29922", rose: "#f85149" };
  const c = colorMap[cd.statusColor] || "#e8ecf1";
  const vcf = rv.vcfExposurePercentile || 0;
  const vcfColor = vcf >= 80 ? "#f85149" : vcf >= 50 ? "#d29922" : "#3fb950";

  let h = '<div class="section"><div class="section-title">RV Shock Model <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>' +
   '<div class="section-sub">Realized volatility shocks and systematic fund positioning. When volatility has been quiet too long, mechanical sellers are fully loaded.</div>';

  // What this means (for everyone)
  const explainerHtml = '<div class="card" style="margin-bottom:12px;"><div style="font-size:13px;font-weight:700;color:#e8ecf1;margin-bottom:8px;">What this model tells you</div>' +
   '<div style="font-size:13px;color:#9ba3af;line-height:1.6;">' +
   '<b style="color:#e8ecf1;">The simple version:</b> Markets go through calm stretches and stormy stretches. This model counts how long it has been since the last storm. The longer the calm lasts, the more likely a storm is coming, because big automated funds pile into stocks when things are quiet and are forced to sell when volatility spikes.<br><br>' +
   '<b style="color:#e8ecf1;">For long-term investors:</b> When the gauge reads OVERDUE, consider it a yellow light, not a sell signal. It is a good time to make sure your position sizes are comfortable and avoid adding leverage. When it reads RECENTLY UNWOUND, the mechanical selling pressure has passed.<br><br>' +
   '<b style="color:#e8ecf1;">For active traders:</b> An OVERDUE reading with VCF exposure above 80% has historically preceded pullbacks. The forward price action tables below show exactly what happened in the 15 trading days after each past signal: the hit rate, average decline, and worst case. Use these as a statistical roadmap, not a prediction.' +
   '</div></div>';

  // Status banner
  h += '<div style="display:flex;align-items:center;gap:16px;margin:12px 0;padding:16px;border-radius:12px;background:rgba(255,255,255,0.02);border:1px solid #2a3448;">' +
   '<div><div style="font-size:11px;color:#8b949e;letter-spacing:0.5px;">STATUS</div>' +
   '<div style="font-size:20px;font-weight:800;color:' + c + ';">' + esc(cd.statusLabel) + "</div>" +
   '<div style="font-size:12px;color:#8b949e;margin-top:4px;max-width:600px;">' + esc(cd.statusDesc) + "</div></div></div>";

  // Countdown stats
  h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:12px 0;">';
  const statCard = (label, val, sub) =>
   '<div style="background:#161b26;border-radius:10px;padding:12px;text-align:center;">' +
   '<div style="font-size:11px;color:#8b949e;">' + label + '</div>' +
   '<div style="font-size:24px;font-weight:800;color:#e8ecf1;">' + val + '</div>' +
   '<div style="font-size:11px;color:#8b949e;">' + sub + '</div></div>';
  h += statCard("AVG TIME BETWEEN SHOCKS", cd.avgTimeBetweenTd + " td", "~" + cd.avgTimeBetweenCal + " calendar days");
  h += statCard("MEDIAN GAP", cd.medianGapTd + " td", "shortest " + cd.shortestGapTd + " / longest " + cd.longestGapTd);
  h += statCard("SINCE LAST SHOCK", cd.sinceLastSpikeTd + " td", "last: " + esc(cd.lastSpikeDate || ""));
  h += "</div>";

  // VCF exposure bar
  h += '<div class="card" style="margin:12px 0;"><div style="font-size:13px;font-weight:700;color:#e8ecf1;margin-bottom:4px;">Systematic fund exposure (the "spring tension")</div>' +
   '<div style="font-size:12px;color:#8b949e;margin-bottom:10px;">Volatility-control funds mechanically buy stocks when realized volatility is low and sell when it spikes. Low volatility = they are fully loaded = the spring is coiled tight.</div>' +
   '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">' +
   '<span style="font-size:12px;color:#8b949e;">Estimated equity exposure</span>' +
   '<span style="font-size:28px;font-weight:800;color:' + vcfColor + ';">' + vcf + '%</span></div>' +
   '<div style="width:100%;background:#1f2937;height:10px;border-radius:5px;overflow:hidden;">' +
   '<div style="height:100%;width:' + vcf + '%;background:' + vcfColor + ';border-radius:5px;"></div></div>' +
   '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:10px;">' +
   '<div style="text-align:center;"><div style="font-size:11px;color:#8b949e;">10-day RV</div><div style="font-size:16px;font-weight:700;color:#e8ecf1;">' + (rv.rv10 != null ? rv.rv10 + "%" : "-") + '</div></div>' +
   '<div style="text-align:center;"><div style="font-size:11px;color:#8b949e;">20-day RV</div><div style="font-size:16px;font-weight:700;color:#e8ecf1;">' + (rv.rv20 != null ? rv.rv20 + "%" : "-") + '</div></div>' +
   '<div style="text-align:center;"><div style="font-size:11px;color:#8b949e;">60-day RV</div><div style="font-size:16px;font-weight:700;color:#e8ecf1;">' + (rv.rv60 != null ? rv.rv60 + "%" : "-") + '</div></div>' +
   "</div></div>";

  // Forward PA tables
  ["signal1", "signal2"].forEach((key) => {
   const sig = R[key] || {};
   const sum = sig.summary || {};
   const rows = sig.rows || [];
   if (!sum.signalCount) return;
   h += '<div style="margin:16px 0;"><div style="font-size:14px;font-weight:700;color:#e8ecf1;margin-bottom:4px;">' + esc(sig.title || key) + '</div>' +
    '<div style="font-size:12px;color:#8b949e;margin-bottom:8px;">What happened in the 15 trading days after each past signal. ' +
    '<b style="color:#3fb950;">Hit rate ' + (sum.hitRate != null ? sum.hitRate : "-") + '%</b> (' + esc(sum.hitFraction || "") + ') ' +
    'means that share of signals saw a peak decline worse than -1.5%. Avg peak decline <b style="color:#f85149;">' + (sum.avgPeakDecline != null ? sum.avgPeakDecline : "-") + '%</b>, ' +
    'worst <b style="color:#f85149;">' + (sum.worstDecline != null ? sum.worstDecline : "-") + '%</b>.</div>';
   h += '<div class="table-wrap" style="max-height:400px;overflow-y:auto;"><table class="coverage ma-table" style="color:#e8ecf1;font-size:11px;"><thead><tr>' +
    '<th style="color:#a8b0bc;position:sticky;top:0;background:#161b26;">Date</th>';
   for (let d = 1; d <= 15; d++) h += '<th style="color:#a8b0bc;position:sticky;top:0;background:#161b26;">D+' + d + "</th>";
   h += '<th style="color:#a8b0bc;position:sticky;top:0;background:#161b26;">Max DD</th></tr></thead><tbody>';
   rows.forEach((r) => {
    h += '<tr><td style="color:#e8ecf1;font-weight:600;white-space:nowrap;">' + esc(r.date) + "</td>";
    for (let d = 1; d <= 15; d++) {
     const v = (r.returns || {})["D+" + d];
     const col = v == null ? "#8b949e" : v < 0 ? "#f85149" : "#3fb950";
     h += '<td style="color:' + col + ';">' + (v == null ? "-" : (v > 0 ? "+" : "") + v + "%") + "</td>";
    }
    h += '<td style="color:#f85149;font-weight:700;">' + (r.peakDecline != null ? r.peakDecline + "%" : "-") + "</td></tr>";
   });
   // Average row
   const avg = sum.averageCurve || {};
   h += '<tr style="background:rgba(201,169,97,0.08);font-weight:700;"><td style="color:#c9a961;">AVG</td>';
   for (let d = 1; d <= 15; d++) {
    const v = avg["D+" + d];
    const col = v == null ? "#8b949e" : v < 0 ? "#f85149" : "#3fb950";
    h += '<td style="color:' + col + ';">' + (v == null ? "-" : (v > 0 ? "+" : "") + v + "%") + "</td>";
   }
   h += '<td style="color:#c9a961;">' + (sum.avgPeakDecline != null ? sum.avgPeakDecline + "%" : "-") + "</td></tr>";
   h += "</tbody></table></div></div>";
  });

  h += '<div class="panel-asof">As of ' + esc((R.as_of || "").slice(0, 10)) + " · SPY $" + (R.currentPrice != null ? R.currentPrice : "-") + "</div></div>";
  h += explainerHtml;
  return h;
 }

 function concentrationHtml() {
  const K = D.dynamic_concentration || {};
  if (K.score == null) {
   return '<div class="section"><div class="section-title">Dynamic Concentration Risk Gauge <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>' +
    '<div class="card"><p style="color:var(--muted)">Concentration data unavailable. Check back after the next refresh.</p></div></div>';
  }
  const colorMap = { emerald: "#3fb950", amber: "#d29922", rose: "#f85149" };
  const c = colorMap[K.color] || "#e8ecf1";
  const leader = K.leader || {};

  let h = '<div class="section"><div class="section-title">Dynamic Concentration Risk Gauge <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>' +
   '<div class="section-sub">Which sector is leading, how stretched it is, and whether the index can survive without it.</div>';

  const explainerHtml = '<div class="card" style="margin-bottom:12px;"><div style="font-size:13px;font-weight:700;color:#e8ecf1;margin-bottom:8px;">What this model tells you</div>' +
   '<div style="font-size:13px;color:#9ba3af;line-height:1.6;">' +
   '<b style="color:#e8ecf1;">The simple version:</b> The stock market is sometimes carried by one hot sector while everything else goes nowhere. This model finds which sector is leading right now, checks how stretched it is, and warns you when the market depends too much on that one area.<br><br>' +
   '<b style="color:#e8ecf1;">For long-term investors:</b> A high fragility score means your index fund is more concentrated than it looks. If the leading sector stumbles, the whole index drops with it even if most companies are fine. Consider whether you are comfortable with that.<br><br>' +
   '<b style="color:#e8ecf1;">For active traders:</b> When the leader detaches from the average stock (low correlation), leadership is fragile. Rotations out of the leading sector tend to be violent. Do not chase the leader into parabolic moves.' +
   '</div></div>';

  h += '<div style="display:flex;align-items:center;gap:16px;margin:12px 0;padding:16px;border-radius:12px;background:rgba(255,255,255,0.02);border:1px solid #2a3448;">' +
   '<div><div style="font-size:11px;color:#8b949e;letter-spacing:0.5px;">STRUCTURAL FRAGILITY</div>' +
   '<div style="font-size:20px;font-weight:800;color:' + c + ';">' + esc(K.regime) + "</div>" +
   '<div style="font-size:12px;color:#9ba3af;margin-top:4px;max-width:560px;">' + esc(K.description || "") + "</div></div>" +
   '<div style="margin-left:auto;text-align:right;flex-shrink:0;"><div style="font-size:11px;color:#8b949e;">SCORE</div>' +
   '<div style="font-size:36px;font-weight:800;color:' + c + ';">' + K.score + '<span style="font-size:16px;color:#8b949e;">/100</span></div></div></div>';

  h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:12px 0;">';
  h += '<div style="background:#161b26;border-radius:10px;padding:12px;"><div style="font-size:11px;color:#8b949e;">CURRENT LEADER</div>' +
   '<div style="font-size:18px;font-weight:800;color:#e8ecf1;">' + esc(leader.ticker || "-") + '</div>' +
   '<div style="font-size:11px;color:#8b949e;">' + esc(leader.name || "") + ' · +' + (leader.momentum90d != null ? leader.momentum90d : "-") + '% (90d)</div></div>';
  h += '<div style="background:#161b26;border-radius:10px;padding:12px;"><div style="font-size:11px;color:#8b949e;">LEADER VS 200-DAY AVG</div>' +
   '<div style="font-size:18px;font-weight:800;color:#e8ecf1;">+' + (leader.extension200dma != null ? leader.extension200dma : "-") + '%</div>' +
   '<div style="font-size:11px;color:#8b949e;">Distance above long-term trend</div></div>';
  h += '<div style="background:#161b26;border-radius:10px;padding:12px;"><div style="font-size:11px;color:#8b949e;">SPY VS EQUAL-WEIGHT</div>' +
   '<div style="font-size:18px;font-weight:800;color:#e8ecf1;">' + ((K.metrics || {}).capVsEqualSpread > 0 ? "+" : "") + ((K.metrics || {}).capVsEqualSpread != null ? (K.metrics || {}).capVsEqualSpread : "-") + '%</div>' +
   '<div style="font-size:11px;color:#8b949e;">60-day cap-weight lead</div></div>';
  h += "</div>";

  (K.scoreBreakdown || []).forEach((b) => {
   const bc = b.points >= 30 ? "#f85149" : b.points >= 15 ? "#d29922" : "#3fb950";
   h += '<div style="background:#161b26;border-radius:10px;padding:12px;margin:8px 0;border-left:3px solid ' + bc + ';">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;">' +
    '<div style="font-size:12px;font-weight:700;color:#e8ecf1;">' + esc(b.metric) + '</div>' +
    '<div style="font-size:11px;font-weight:700;color:' + bc + ';">' + b.points + ' PTS</div></div>' +
    '<div style="font-size:13px;color:' + bc + ';font-weight:600;margin-top:2px;">' + esc(b.status) + '</div>' +
    '<div style="font-size:12px;color:#8b949e;margin-top:2px;">' + esc(b.value || "") + "</div>" +
    '<div style="font-size:11px;color:#6b7280;margin-top:4px;">' + esc(b.detail || "") + "</div></div>";
  });

  h += '<div class="zoomable-chart" data-chart="concentration" style="position:relative;height:280px;margin:12px 0;cursor:zoom-in;" title="Click to zoom"><canvas id="concentration-chart"></canvas>' +
   '<div style="position:absolute;top:8px;right:10px;font-size:11px;color:#e8ecf1;background:rgba(19,23,34,0.8);padding:2px 8px;border-radius:4px;">⛶ click to zoom</div></div>';
  h += '<div class="panel-asof">As of ' + esc((K.as_of || "").slice(0, 10)) + "</div></div>";
  h += explainerHtml;
  return h;
 }

 function marginLeverageHtml() {
  const M = D.margin_leverage || {};
  if (M.score == null) {
   return '<div class="section"><div class="section-title">Systemic Leverage Model <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>' +
    '<div class="card"><p style="color:var(--muted)">Margin debt data unavailable. Check back after the next refresh.</p></div></div>';
  }
  const colorMap = { emerald: "#3fb950", amber: "#d29922", rose: "#f85149" };
  const c = colorMap[M.color] || "#e8ecf1";
  const m = M.metrics || {};
  const stale = M.metadata && M.metadata.stale;

  let h = '<div class="section"><div class="section-title">Systemic Leverage Model <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>' +
   '<div class="section-sub">How much traders are borrowing to buy stocks. Leverage measures what investors are actually doing with their money, not just how they feel.</div>';

  // Score banner
  h += '<div style="display:flex;align-items:center;gap:16px;margin:12px 0;padding:16px;border-radius:12px;background:rgba(255,255,255,0.02);border:1px solid #2a3448;">' +
   '<div style="text-align:center;min-width:90px;"><div style="font-size:11px;color:#8b949e;letter-spacing:0.5px;">SCORE</div>' +
   '<div style="font-size:36px;font-weight:800;color:' + c + ';">' + M.score + '<span style="font-size:16px;color:#8b949e;">/100</span></div></div>' +
   '<div><div style="font-size:14px;font-weight:700;color:' + c + ';">' + esc(M.regime || "") + "</div>" +
   '<div style="font-size:12px;color:#8b949e;margin-top:4px;">Margin debt $' + (m.debtB != null ? m.debtB.toLocaleString() : "-") + "B" +
   (m.marginYoY != null ? " · YoY " + (m.marginYoY >= 0 ? "+" : "") + m.marginYoY + "%" : "") +
   (m.zScore != null ? " · Leverage z-score " + (m.zScore >= 0 ? "+" : "") + m.zScore : "") + "</div>";
  if (M.capitulation) {
   h += '<div style="margin-top:8px;padding:8px 12px;border-radius:8px;background:rgba(63,185,80,0.1);border:1px solid #3fb950;font-size:12px;color:#3fb950;font-weight:700;">CAPITULATION REACHED: forced liquidations exhausted. Historically a contrarian buy signal.</div>';
  }
  if (m.divergence) {
   h += '<div style="margin-top:8px;padding:8px 12px;border-radius:8px;background:rgba(210,153,34,0.1);border:1px solid #d29922;font-size:12px;color:#d29922;font-weight:700;">LEVERAGE DIVERGENCE: market rising while borrowing falls. The rally is running on fumes.</div>';
  }
  h += "</div></div>";

  // Score breakdown
  h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:12px 0;">';
  (M.scoreBreakdown || []).forEach((b) => {
   const bc = b.points >= 30 ? "#f85149" : b.points > 0 ? "#d29922" : "#3fb950";
   h += '<div style="background:#161b26;border-radius:10px;padding:12px;border-left:3px solid ' + bc + ';">' +
    '<div style="font-size:12px;font-weight:600;color:#e8ecf1;">' + esc(b.metric) + "</div>" +
    '<div style="font-size:11px;color:' + bc + ';margin-top:2px;font-weight:600;">' + esc(b.status) + " (" + b.points + " pts)</div>" +
    '<div style="font-size:11px;color:#8b949e;margin-top:2px;">' + esc(b.value || "") + "</div></div>";
  });
  h += "</div>";

  // Chart: margin YoY vs SPY YoY
  h += '<div class="zoomable-chart" data-chart="margin-leverage" style="position:relative;height:280px;margin:12px 0;cursor:zoom-in;" title="Click to zoom"><canvas id="margin-leverage-chart"></canvas>' +
   '<div style="position:absolute;top:8px;right:10px;font-size:11px;color:#e8ecf1;background:rgba(19,23,34,0.8);padding:2px 8px;border-radius:4px;">⛶ click to zoom</div></div>';
  h += '<div class="panel-asof">As of ' + esc((M.metadata && M.metadata.latestDataMonth) || (M.as_of || "").slice(0, 7)) + " (FINRA monthly)" + (stale ? " · showing last available" : "") + "</div>";

  // Explainer AFTER visuals (standing rule)
  h += '<div class="card" style="margin-bottom:12px;"><div style="font-size:13px;font-weight:700;color:#e8ecf1;margin-bottom:8px;">What this model tells you</div>' +
   '<div style="font-size:13px;color:#9ba3af;line-height:1.6;">' +
   '<b style="color:#e8ecf1;">The simple version:</b> This tracks how much money stock traders are borrowing to buy shares. When borrowing explodes, it means euphoria: everyone is maxing out to chase the rally. When borrowing collapses, it means forced selling is over and the weak hands are gone. Sentiment surveys tell you how people feel; this tells you what they are doing with real money.<br><br>' +
   '<b style="color:#e8ecf1;">For long-term investors:</b> Ignore headlines about margin debt hitting "record highs": in dollar terms it almost always does during a bull market. What matters is the growth rate. When year-over-year growth passes 35%, the market has historically been close to a top. When it drops below negative 15%, forced liquidations are usually finished and that has marked major bottoms. This data updates monthly, so treat it as a slow background gauge, not a trading signal.<br><br>' +
   '<b style="color:#e8ecf1;">For active traders:</b> Watch for the divergence: the S&P making new highs while margin debt shrinks. That means the rally is running on multiple expansion rather than fresh leveraged capital, and it has preceded major tops by months. A z-score above 2 on the debt-to-market ratio means the market is structurally over-levered and vulnerable to a sharp flush on any catalyst.' +
   "</div></div>";

  h += "</div>";
  return h;
 }

 function sectorRotationHtml() {
  const S = D.sector_rotation || {};
  if (S.score == null) {
   return '<div class="section"><div class="section-title">Offense vs Defense <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>' +
    '<div class="card"><p style="color:var(--muted)">Sector rotation data unavailable. Check back after the next refresh.</p></div></div>';
  }
  const colorMap = { emerald: "#3fb950", amber: "#d29922", rose: "#f85149", slate: "#8b949e" };
  const c = colorMap[S.color] || "#e8ecf1";
  const m = S.metrics || {};
  const r = S.ratios || {};
  const stale = S.metadata && S.metadata.stale;

  let h = '<div class="section"><div class="section-title">Offense vs Defense <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>' +
   '<div class="section-sub">Consumer Discretionary vs Consumer Staples, cap-weighted and equal-weighted. When institutions hide in toothpaste and toilet paper, the rally is hollow.</div>';

  // Score banner
  h += '<div style="display:flex;align-items:center;gap:16px;margin:12px 0;padding:16px;border-radius:12px;background:rgba(255,255,255,0.02);border:1px solid #2a3448;">' +
   '<div style="text-align:center;min-width:90px;"><div style="font-size:11px;color:#8b949e;letter-spacing:0.5px;">SCORE</div>' +
   '<div style="font-size:36px;font-weight:800;color:' + c + ';">' + S.score + '<span style="font-size:16px;color:#8b949e;">/100</span></div></div>' +
   '<div><div style="font-size:14px;font-weight:700;color:' + c + ';">' + esc(S.regime || "") + "</div>" +
   '<div style="font-size:12px;color:#8b949e;margin-top:4px;">RSPD/RSPS ' + (m.rspdRsps != null ? m.rspdRsps : "-") +
   " · XLY/XLP " + (m.xlyXlp != null ? m.xlyXlp : "-") + "</div>";
  if (S.dualBreakdown) {
   h += '<div style="margin-top:8px;padding:8px 12px;border-radius:8px;background:rgba(248,81,73,0.1);border:1px solid #f85149;font-size:12px;color:#f85149;font-weight:700;">DUAL BREAKDOWN: both ratios at 52-week lows. Institutions are sheltering across the entire consumer sector.</div>';
  }
  h += "</div></div>";

  // Ratio cards
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0;">';
  [["rspd_rsps", "RSPD / RSPS", "Equal-weighted"], ["xly_xlp", "XLY / XLP", "Cap-weighted"]].forEach(([key, pair, wt]) => {
   const rr = r[key] || {};
   const pct = rr.rangePercentile != null ? rr.rangePercentile : null;
   const bc = pct == null ? "#8b949e" : pct <= 10 ? "#f85149" : pct <= 30 ? "#d29922" : pct >= 70 ? "#3fb950" : "#8b949e";
   h += '<div style="background:#161b26;border-radius:10px;padding:12px;border-left:3px solid ' + bc + ';">' +
    '<div style="font-size:12px;font-weight:600;color:#e8ecf1;">' + pair + ' <span style="color:#8b949e;font-weight:400;">(' + wt + ")</span></div>" +
    '<div style="font-size:20px;font-weight:800;color:#e8ecf1;margin-top:4px;">' + (rr.current != null ? rr.current : "-") + "</div>" +
    '<div style="font-size:11px;color:' + bc + ';margin-top:2px;font-weight:600;">' +
    (rr.isAt52wLow ? "52-WEEK LOW" : pct != null ? pct + "% of 52w range" : "") + "</div>" +
    '<div style="font-size:11px;color:#8b949e;margin-top:2px;">52w ' + (rr.low52w != null ? rr.low52w : "-") + " – " + (rr.high52w != null ? rr.high52w : "-") +
    (rr.aboveSma200 != null ? (rr.aboveSma200 ? " · above 200-day avg" : " · below 200-day avg") : "") + "</div></div>";
  });
  h += "</div>";

  // Chart: both ratios
  h += '<div class="zoomable-chart" data-chart="sector-rotation" style="position:relative;height:280px;margin:12px 0;cursor:zoom-in;" title="Click to zoom"><canvas id="sector-rotation-chart"></canvas>' +
   '<div style="position:absolute;top:8px;right:10px;font-size:11px;color:#e8ecf1;background:rgba(19,23,34,0.8);padding:2px 8px;border-radius:4px;">⛶ click to zoom</div></div>';
  h += '<div class="panel-asof">As of ' + esc((S.as_of || "").slice(0, 10)) + (stale ? " · showing last available" : "") + "</div>";

  // Explainer AFTER visuals (standing rule)
  h += '<div class="card" style="margin-bottom:12px;"><div style="font-size:13px;font-weight:700;color:#e8ecf1;margin-bottom:8px;">What this model tells you</div>' +
   '<div style="font-size:13px;color:#9ba3af;line-height:1.6;">' +
   '<b style="color:#e8ecf1;">The simple version:</b> This compares stocks people buy when they feel rich (restaurants, travel, cars) against stocks people buy no matter what (groceries, toothpaste). When money rotates into the boring stuff, big investors are bracing for trouble, even if the headline index still looks fine.<br><br>' +
   '<b style="color:#e8ecf1;">For long-term investors:</b> The equal-weighted line is the honest one. The cap-weighted version is dominated by Amazon and Tesla, so two stocks can mask what the other 98 are doing. When both lines break to 52-week lows together, the entire consumer sector is weakening, not just a mega-cap wobble. That has historically lined up with late-cycle caution, not a buying opportunity.<br><br>' +
   '<b style="color:#e8ecf1;">For active traders:</b> A low oscillator reading while the S&P makes new highs is the classic hollow rally: the index is carried by a narrowing set of winners while institutions de-risk underneath. Use it as a regime filter. When this gauge reads extreme defensive, tighten stops and reduce cyclical exposure rather than chasing breakouts.' +
   "</div></div>";

  h += "</div>";
  return h;
 }

 function flowDivergenceHtml() {  const F = D.flow_divergence || {};
  if (!F.current) {
   return '<div class="section"><div class="section-title">Institutional Flow Divergence <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>' +
    '<div class="card"><p style="color:var(--muted)">Flow divergence data unavailable. Check back after the next refresh.</p></div></div>';
  }
  const cur = F.current;
  const colorMap = { emerald: "#3fb950", amber: "#d29922", rose: "#f85149", slate: "#8b949e" };
  const c = colorMap[cur.color] || "#e8ecf1";

  let h = '<div class="section"><div class="section-title">Institutional Flow Divergence <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>' +
   '<div class="section-sub">Retail sentiment vs institutional positioning, as a contrarian risk gauge.</div>';

  // Plain-English explainer
  const explainerHtml = '<div class="card" style="margin-bottom:12px;"><div style="font-size:13px;font-weight:700;color:#e8ecf1;margin-bottom:8px;">What this model tells you</div>' +
   '<div style="font-size:13px;color:#9ba3af;line-height:1.6;">' +
   '<b style="color:#e8ecf1;">The simple version:</b> This model compares what everyday investors are feeling against what big institutions are actually doing. When the crowd is extremely optimistic but institutions are quietly hedging or selling, the market is vulnerable. When the crowd is fearful but institutions are buying, it is often a good time to be.<br><br>' +
   '<b style="color:#e8ecf1;">For long-term investors:</b> Extreme readings are rare and worth respecting. A HIGH VULNERABILITY reading means tops tend to form in this setup, so avoid adding aggressively. An INSTITUTIONAL ACCUMULATION reading means fear is high while smart buyers step in, historically a good backdrop for long-term purchases.<br><br>' +
   '<b style="color:#e8ecf1;">For active traders:</b> The oscillator crossing +2.0 is the highest-conviction short-term risk signal on this page. Treat it like a storm warning: reduce leverage, tighten stops, and do not chase breakouts.' +
   '</div></div>';

  // Status banner
  h += '<div style="display:flex;align-items:center;gap:16px;margin:12px 0;padding:16px;border-radius:12px;background:rgba(255,255,255,0.02);border:1px solid #2a3448;">' +
   '<div><div style="font-size:11px;color:#8b949e;letter-spacing:0.5px;">FLOW REGIME</div>' +
   '<div style="font-size:20px;font-weight:800;color:' + c + ';">' + esc(cur.status) + "</div>" +
   '<div style="font-size:12px;color:#9ba3af;margin-top:4px;max-width:560px;">' + esc(cur.description || "") + "</div></div>" +
   '<div style="margin-left:auto;text-align:right;flex-shrink:0;"><div style="font-size:11px;color:#8b949e;">OSCILLATOR</div>' +
   '<div style="font-size:36px;font-weight:800;color:' + c + ';">' + (cur.oscillator > 0 ? "+" : "") + cur.oscillator + '<span style="font-size:16px;color:#8b949e;">σ</span></div></div></div>';

  // Component cards
  const ret = cur.retail || {}, inst = cur.institutional || {};
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0;">';
  h += '<div style="background:#161b26;border-radius:10px;padding:12px;">' +
   '<div style="font-size:12px;font-weight:700;color:#e8ecf1;">Retail Sentiment</div>' +
   '<div style="font-size:11px;color:#8b949e;margin:2px 0;">' + esc(ret.metric || "") + '</div>' +
   '<div style="font-size:20px;font-weight:800;color:#e8ecf1;">' + esc(ret.value || "-") + '</div>' +
   '<div style="font-size:11px;color:#8b949e;">Z-score ' + (ret.zScore > 0 ? "+" : "") + (ret.zScore != null ? ret.zScore : "-") + ' · ' + esc(ret.reading || "") + "</div>" +
   '<div style="font-size:11px;color:#6b7280;margin-top:6px;">' + esc(ret.detail || "") + "</div></div>";
  h += '<div style="background:#161b26;border-radius:10px;padding:12px;">' +
   '<div style="font-size:12px;font-weight:700;color:#e8ecf1;">Institutional Positioning</div>' +
   '<div style="font-size:11px;color:#8b949e;margin:2px 0;">' + esc(inst.dixMetric || "") + ': <b style="color:#e8ecf1;">' + esc(inst.dixValue || "-") + '</b></div>' +
   '<div style="font-size:11px;color:#8b949e;margin:2px 0;">' + esc(inst.cotMetric || "") + ': <b style="color:#e8ecf1;">' + esc(inst.cotValue || "-") + '</b></div>' +
   '<div style="font-size:11px;color:#6b7280;margin-top:6px;">' + esc(inst.dixDetail || "") + " " + esc(inst.cotDetail || "") + "</div></div>";
  h += "</div>";

  // History chart
  h += '<div class="zoomable-chart" data-chart="flow-divergence" style="position:relative;height:280px;margin:12px 0;cursor:zoom-in;" title="Click to zoom"><canvas id="flow-divergence-chart"></canvas>' +
   '<div style="position:absolute;top:8px;right:10px;font-size:11px;color:#e8ecf1;background:rgba(19,23,34,0.8);padding:2px 8px;border-radius:4px;">⛶ click to zoom</div></div>';
  h += '<div class="panel-asof">As of ' + esc((F.as_of || "").slice(0, 10)) + "</div></div>";
  h += explainerHtml;
  return h;
 }

 function contagionHtml() {  const C = D.contagion || {};
  if (!C.composite) {
   return '<div class="section"><div class="section-title">Cross-Asset Contagion Tracker <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>' +
    '<div class="card"><p style="color:var(--muted)">Contagion data unavailable. Check back after the next refresh.</p></div></div>';
  }
  const comp = C.composite, pillars = C.pillars || {};
  const colorMap = { emerald: "#3fb950", amber: "#d29922", rose: "#f85149", slate: "#8b949e" };
  const c = colorMap[comp.threatColor] || "#e8ecf1";

  let h = '<div class="section"><div class="section-title">Cross-Asset Contagion Tracker <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>' +
   '<div class="section-sub">Currency, rates, and commodity stress as early warnings before shocks reach stocks.</div>';

  // Plain-English explainer
  const explainerHtml = '<div class="card" style="margin-bottom:12px;"><div style="font-size:13px;font-weight:700;color:#e8ecf1;margin-bottom:8px;">What this model tells you</div>' +
   '<div style="font-size:13px;color:#9ba3af;line-height:1.6;">' +
   '<b style="color:#e8ecf1;">The simple version:</b> Sometimes trouble starts outside the stock market, in currencies, bonds, or commodities, and spills over later. This model watches those three areas and warns you when they are flashing red while stocks still look calm.<br><br>' +
   '<b style="color:#e8ecf1;">For long-term investors:</b> A CRITICAL or ELEVATED reading means the odds of a market drawdown driven by outside forces are higher than normal. It is not a sell signal, but a good time to check that you are comfortable with your risk level.<br><br>' +
   '<b style="color:#e8ecf1;">For active traders:</b> The divergence warning is the highest-value signal here. When stocks are calm (VIX under 20) but this model is flashing, history says the calm is often false. Tighten stops and reduce size into strength.' +
   '</div></div>';

  // Threat banner
  h += '<div style="display:flex;align-items:center;gap:16px;margin:12px 0;padding:16px;border-radius:12px;background:rgba(255,255,255,0.02);border:1px solid #2a3448;">' +
   '<div><div style="font-size:11px;color:#8b949e;letter-spacing:0.5px;">THREAT LEVEL</div>' +
   '<div style="font-size:20px;font-weight:800;color:' + c + ';">' + esc(comp.threatLevel) + '</div>' +
   '<div style="font-size:11px;color:#8b949e;margin-top:2px;">' + esc(comp.threatBadge || "") + "</div></div>" +
   '<div style="margin-left:auto;text-align:right;"><div style="font-size:11px;color:#8b949e;">SCORE</div>' +
   '<div style="font-size:36px;font-weight:800;color:' + c + ';">' + comp.score + '<span style="font-size:16px;color:#8b949e;">/100</span></div></div></div>';

  // Divergence warning
  if (comp.divergenceActive) {
   h += '<div style="background:rgba(248,81,73,0.08);border:1px solid rgba(248,81,73,0.4);border-radius:12px;padding:14px;margin:12px 0;">' +
    '<div style="font-size:12px;font-weight:700;color:#f85149;margin-bottom:4px;">DIVERGENCE WARNING</div>' +
    '<div style="font-size:13px;color:#e8ecf1;">' + esc(comp.divergenceText || "") + "</div></div>";
  }

  // Three pillars
  h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:12px 0;">';
  ["currency", "rates", "commodities"].forEach((key) => {
   const p = pillars[key] || {};
   const pc = (p.score || 0) >= 50 ? "#f85149" : (p.score || 0) >= 30 ? "#d29922" : "#3fb950";
   h += '<div style="background:#161b26;border-radius:10px;padding:12px;border-top:3px solid ' + pc + ';">' +
    '<div style="font-size:12px;font-weight:700;color:#e8ecf1;">' + esc(p.title || key) + '</div>' +
    '<div style="font-size:11px;color:#8b949e;margin:2px 0;">Weight ' + esc(p.weight || "") + " · " + esc(p.status || "") + "</div>" +
    '<div style="font-size:20px;font-weight:800;color:' + pc + ';">' + (p.score != null ? p.score : "-") + '<span style="font-size:12px;color:#8b949e;">/100</span></div>';
   (p.metrics || []).forEach((m) => {
    h += '<div style="margin-top:8px;padding-top:8px;border-top:1px solid #232833;">' +
     '<div style="font-size:11px;color:#e8ecf1;font-weight:600;">' + esc(m.label) + (m.stress ? ' <span style="color:#f85149;">●</span>' : "") + "</div>" +
     '<div style="font-size:12px;color:' + (m.stress ? "#f85149" : "#8b949e") + ';font-weight:600;">' + esc(m.value) + "</div>" +
     '<div style="font-size:11px;color:#6b7280;margin-top:2px;">' + esc(m.detail || "") + "</div></div>";
   });
   h += "</div>";
  });
  h += "</div>";

  // History chart
  h += '<div class="zoomable-chart" data-chart="contagion" style="position:relative;height:280px;margin:12px 0;cursor:zoom-in;" title="Click to zoom"><canvas id="contagion-chart"></canvas>' +
   '<div style="position:absolute;top:8px;right:10px;font-size:11px;color:#e8ecf1;background:rgba(19,23,34,0.8);padding:2px 8px;border-radius:4px;">⛶ click to zoom</div></div>';
  h += '<div class="panel-asof">As of ' + esc((C.as_of || "").slice(0, 10)) + "</div></div>";
  h += explainerHtml;
  return h;
 }

 function correctionRiskHtml() {
  const cr = D.correction_risk || {};
  if (!cr.totalRiskScore && cr.totalRiskScore !== 0) {
   return '<div class="section"><div class="section-title">Correction Risk Model <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>' +
    '<div class="card"><p style="color:var(--muted)">The Correction Risk Model has not been computed yet. Check back after the next refresh.</p></div></div>';
  }
  const score = cr.totalRiskScore;
  const regime = cr.regime || "";
  const colorMap = {emerald: "#10b981", amber: "#f59e0b", rose: "#f43f5e", slate: "#94a3b8"};
  const rc = colorMap[cr.color] || "#94a3b8";
  let h = '<div class="section" style="max-width:none;"><div class="section-title">Correction Risk Model <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>';
  h += '<div class="section-sub">Multi-factor risk score combining price extension, volatility trend, credit stress, and market breadth. Signals when a market top is forming. Updated ' + esc((cr.as_of || "").slice(0, 10)) + '.</div>';
  // Regime banner
  h += '<div class="card" style="border:1px solid ' + rc + '55;padding:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">';
  h += '<div><div style="font-size:11px;color:#8b949e;letter-spacing:1.5px;">CURRENT REGIME</div>' +
   '<div style="font-size:28px;font-weight:800;color:' + rc + ';">' + esc(regime) + '</div></div>';
  h += '<div style="text-align:right;"><div style="font-size:48px;font-weight:800;color:' + rc + ';line-height:1;">' + score + '<span style="font-size:20px;color:#8b949e;">/100</span></div>' +
   '<div style="font-size:11px;color:#8b949e;">LEVEL ' + (cr.riskLevel || 1) + '</div></div></div>';
  // Breakdown cards
  const bd = cr.scoreBreakdown || [];
  if (bd.length) {
   h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;margin-top:12px;">';
   bd.forEach((b) => {
    const bc = b.points > 0 ? "#f43f5e" : "#10b981";
    h += '<div class="card" style="padding:14px;"><div style="font-size:11px;color:#c99a6b;font-weight:700;letter-spacing:0.5px;">' + esc(b.metric).toUpperCase() + '</div>' +
     '<div style="font-size:14px;font-weight:700;color:' + bc + ';margin:4px 0;">' + esc(b.status) + ' (' + b.points + ' pts)</div>' +
     '<div style="font-size:12px;color:#8b949e;">' + esc(b.value) + '</div></div>';
   });
   h += '</div>';
  }
  // History chart
  h += '<div class="section-title" style="margin-top:16px;">Risk Score History (90 days)</div>';
  h += '<div class="zoomable-chart" data-chart="correction-risk" style="position:relative;height:320px;cursor:zoom-in;" title="Click to zoom"><canvas id="correction-risk-chart"></canvas>' +
   '<div style="position:absolute;top:8px;right:10px;font-size:11px;color:#e8ecf1;background:rgba(19,23,34,0.8);padding:2px 8px;border-radius:4px;">⛶ click to zoom</div></div>';
  h += '</div>';
  return h;
 }

 // Composite risk banner for the free daily snapshot: overall assessment
 // across all risk models. Computed in build.py; auto-picks up new models.
 function compositeBanner() {
  const rh = D.risk_headlines || {};
  const comp = rh.composite || {};
  if (comp.score == null) return "";
  const colorMap = { emerald: "#3fb950", amber: "#d29922", rose: "#f85149", slate: "#8b949e" };
  const c = colorMap[comp.color] || "#e8ecf1";
  const comps = comp.components || [];
  const pillars = comp.pillars || [];
  // Top 3 risk contributors
  const top = comps.slice().sort((a, b) => b.risk - a.risk).slice(0, 3);
  const nameMap = { correction_risk: "Correction", liquidity_drain: "Liquidity", rv_shock: "RV Shock",
   contagion: "Contagion", flow_divergence: "Flow Div.", concentration: "Concentration",
   margin_leverage: "Margin Lev.", sector_rotation: "Rotation", fear_index: "Fear" };
  let h = '<div style="display:flex;align-items:center;gap:20px;margin:12px 0 4px;padding:20px;border-radius:12px;background:rgba(255,255,255,0.02);border:1px solid #2a3448;">' +
   '<div style="text-align:center;min-width:110px;"><div style="font-size:11px;color:#8b949e;letter-spacing:1px;">CASCADIA COMPOSITE<br>RISK INDEX</div>' +
   '<div style="font-size:44px;font-weight:800;color:' + c + ';">' + comp.score + '<span style="font-size:18px;color:#8b949e;">/100</span></div>' +
   '<div style="font-size:13px;font-weight:700;color:' + c + ';">' + esc(comp.regime || "") + "</div>" +
   '<div style="font-size:11px;color:#8b949e;margin-top:6px;font-style:italic;">Algorithmic synthesis across ' + (comp.model_count || comps.length) + ' independent quantitative models, spanning Macro Liquidity, Cross-Asset Contagion, Vol-Control Exposure, and Structural Breadth.</div></div>' +
   '<div style="flex:1;"><div style="font-size:12px;color:#8b949e;margin-bottom:8px;">Composite of ' + (comp.model_count || comps.length) + ' models (equal-weighted)' +
   (comp.primary_driver ? ' · Primary driver: <span style="color:#e8ecf1;font-weight:600;">' + esc(comp.primary_driver) + "</span>" : "") + "</div>";
  // Pillar bars
  if (pillars.length) {
   h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">';
   pillars.forEach((p) => {
    const pc = p.score >= 65 ? "#f85149" : p.score >= 45 ? "#d29922" : p.score >= 25 ? "#8b949e" : "#3fb950";
    h += '<div><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;">' +
     '<span style="color:#8b949e;">' + esc(p.pillar) + '</span><span style="color:' + pc + ';font-weight:700;">' + p.score + "</span></div>" +
     '<div style="height:4px;background:#1f2937;border-radius:2px;overflow:hidden;"><div style="height:100%;width:' + Math.min(100, p.score) + '%;background:' + pc + ';border-radius:2px;"></div></div></div>';
   });
   h += "</div>";
  }
  h += '<div style="display:flex;gap:12px;flex-wrap:wrap;">';
  top.forEach((t) => {
   const tc = t.risk >= 70 ? "#f85149" : t.risk >= 50 ? "#d29922" : "#8b949e";
   h += '<div style="font-size:12px;"><span style="color:#8b949e;">' + esc(nameMap[t.model] || t.model) + '</span> ' +
    '<span style="color:' + tc + ';font-weight:700;">' + t.risk + "</span></div>";
  });
  h += '</div><div style="font-size:11px;color:#8b949e;margin-top:8px;">Highest risk contributors right now</div></div></div>';
  return h;
 }

 // Quality snapshot: on-demand ROIC / CROIC / Rule of 40 for any ticker (PRO).
 // Backend: /api/quality edge function (Yahoo Finance, free).
 let _qualityCache = {};
 async function fetchQuality(ticker) {
  const tk = (ticker || "").toUpperCase().trim();
  if (!tk) return { error: "Enter a ticker." };
  if (_qualityCache[tk]) return _qualityCache[tk];
  try {
   const res = await fetch("/api/quality?ticker=" + encodeURIComponent(tk));
   const j = await res.json();
   if (j.error) return { error: j.error };
   _qualityCache[tk] = j;
   return j;
  } catch (e) {
   return { error: "Could not load quality data. Try again shortly." };
  }
 }
 function qualityCard(title, value, sub, good) {
  const vc = good === true ? "#3fb950" : good === false ? "#f85149" : "#e8ecf1";
  return '<div style="background:#161b26;border-radius:10px;padding:12px;">' +
   '<div style="font-size:11px;color:#8b949e;letter-spacing:0.5px;">' + esc(title) + "</div>" +
   '<div style="font-size:22px;font-weight:800;color:' + vc + ';margin-top:4px;">' + value + "</div>" +
   (sub ? '<div style="font-size:11px;color:#8b949e;margin-top:2px;">' + esc(sub) + "</div>" : "") + "</div>";
 }
 function renderQualityResult(q) {
  const el = document.getElementById("quality-result");
  if (!el) return;
  if (q.error) {
   el.innerHTML = '<div class="card"><p style="color:#f85149;">' + esc(q.error) + "</p></div>";
   return;
  }
  const cr = q.capitalReturns || {}, ef = q.efficiency || {}, ge = q.growthEngine || {};
  const qs = q.qualityScore || 0;
  const qc = qs >= 75 ? "#3fb950" : qs >= 45 ? "#d29922" : "#f85149";
  const fmtPct = (v) => (v === null || v === undefined ? "N/A" : v + "%");
  const fmtMoney = (v) => (v === null || v === undefined ? "N/A" : "$" + Math.round(v).toLocaleString());
  let h = '<div style="display:flex;align-items:center;gap:20px;margin:12px 0;padding:20px;border-radius:12px;background:rgba(255,255,255,0.02);border:1px solid #2a3448;">' +
   '<div><div style="font-size:28px;font-weight:800;color:#e8ecf1;">' + esc(q.ticker) + "</div>" +
   '<div style="font-size:12px;color:#8b949e;">' + esc(q.sector || "") + " · " + esc(q.industry || "") + "</div></div>" +
   '<div style="margin-left:auto;text-align:center;"><div style="font-size:11px;color:#8b949e;letter-spacing:1px;">QUALITY SCORE</div>' +
   '<div style="font-size:44px;font-weight:800;color:' + qc + ';">' + qs + '<span style="font-size:18px;color:#8b949e;">/100</span></div></div></div>';
  h += '<div class="section-title" style="margin-top:16px;">Capital Returns</div>' +
   '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin:8px 0;">' +
   qualityCard("ROIC", fmtPct(cr.roic), "Return on invested capital", cr.roic !== null && cr.roic > 15) +
   qualityCard("CROIC", fmtPct(cr.croic), "Cash return on IC" + (cr.croic !== null && cr.roic !== null && cr.croic > cr.roic ? " · cash converts" : ""), cr.croic !== null && cr.roic !== null && cr.croic > cr.roic) +
   qualityCard("ROE", fmtPct(cr.roe), "Return on equity", cr.roe !== null && cr.roe > 15) +
   qualityCard("ROA", fmtPct(cr.roa), "Return on assets", null) + "</div>";
  h += '<div class="section-title" style="margin-top:16px;">Operating Efficiency</div>' +
   '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin:8px 0;">' +
   qualityCard("Rev / Employee", fmtMoney(ef.revPerEmployee), ef.employees ? ef.employees.toLocaleString() + " employees" : "", ef.revPerEmployee !== null && ef.revPerEmployee > 500000) +
   qualityCard("Asset Turnover", ef.assetTurnover !== null ? ef.assetTurnover + "x" : "N/A", "Revenue / total assets", null) +
   qualityCard("Operating Leverage", ef.operatingLeverage !== null ? (ef.operatingLeverage > 0 ? "+" : "") + ef.operatingLeverage + "%" : "N/A", "Rev growth minus opex growth", ef.operatingLeverage !== null && ef.operatingLeverage > 0) + "</div>";
  h += '<div class="section-title" style="margin-top:16px;">Growth & Cash Engine</div>' +
   '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin:8px 0;">' +
   qualityCard("Rule of 40", ge.ruleOf40 !== null ? ge.ruleOf40 : "N/A", "Revenue growth + FCF margin", ge.ruleOf40 !== null && ge.ruleOf40 >= 40) +
   qualityCard("Revenue Growth", fmtPct(ge.revGrowth), "Year over year", ge.revGrowth !== null && ge.revGrowth > 20) +
   qualityCard("FCF Margin", fmtPct(ge.fcfMargin), "Free cash flow / revenue", ge.fcfMargin !== null && ge.fcfMargin > 20) + "</div>";
  h += '<div class="card" style="margin-top:12px;"><div style="font-size:12px;color:#8b949e;line-height:1.6;">A simplified on-demand screen. For DCF-covered names, the full Investment Scorecard and valuation work remain the deeper read.</div></div>';
  el.innerHTML = h;
 }
 async function runQualitySearch() {
  const inp = document.getElementById("quality-ticker");
  const el = document.getElementById("quality-result");
  if (!inp || !el) return;
  const tk = inp.value.toUpperCase().trim();
  if (!tk) return;
  el.innerHTML = '<div class="card"><p style="color:#8b949e;">Analyzing ' + esc(tk) + "...</p></div>";
  const q = await fetchQuality(tk);
  renderQualityResult(q);
 }
 // Agency Risk: on-demand Executive Alignment & Agency Risk Score (PRO).
 // Backend: /api/alignment edge function (Yahoo Finance, free).
 let _agencyCache = {};
 async function fetchAgencyRisk(ticker) {
  const tk = (ticker || "").toUpperCase().trim();
  if (!tk) return { error: "No ticker." };
  if (_agencyCache[tk]) return _agencyCache[tk];
  try {
   const res = await fetch("/api/alignment?ticker=" + encodeURIComponent(tk));
   const j = await res.json();
   if (j.error) return { error: j.error };
   _agencyCache[tk] = j;
   return j;
  } catch (e) {
   return { error: "Could not load agency risk data. Try again shortly." };
  }
 }
 function fmtMoney(v) {
  if (v == null || v === 0) return "$0";
  const abs = Math.abs(v), sign = v < 0 ? "-" : "";
  if (abs >= 1e9) return sign + "$" + (abs / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return sign + "$" + (abs / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return sign + "$" + (abs / 1e3).toFixed(1) + "K";
  return sign + "$" + abs.toLocaleString();
 }
 async function loadAgencyRisk(ticker) {
  const el = document.getElementById("agency-risk-" + ticker);
  if (!el) return;
  const a = await fetchAgencyRisk(ticker);
  if (a.error) {
   el.innerHTML = '<div class="card"><p style="color:#8b949e;">' + esc(a.error) + '</p></div>';
   return;
  }
  const s = a.scores;
  const regimeColor = a.regimeColor === "rose" ? "#f85149" : a.regimeColor === "emerald" ? "#3fb950" : "#d29922";
  let h = '<div class="card" style="border-left:4px solid ' + regimeColor + ';">';
  h += '<div style="display:flex;flex-wrap:wrap;gap:24px;align-items:baseline;margin-bottom:12px;">';
  h += '<div><div style="font-size:11px;color:#8b949e;letter-spacing:0.5px;">ALIGNMENT SCORE</div>';
  h += '<div style="font-size:36px;font-weight:700;color:' + regimeColor + ';font-family:monospace;">' + a.alignmentScore + '<span style="font-size:18px;color:#8b949e;">/100</span></div></div>';
  h += '<div><div style="font-size:11px;color:#8b949e;letter-spacing:0.5px;">REGIME</div>';
  h += '<div style="font-size:16px;font-weight:700;color:' + regimeColor + ';">' + esc(a.regime) + '</div></div>';
  h += '<div><div style="font-size:11px;color:#8b949e;letter-spacing:0.5px;">INSIDER OWNERSHIP</div>';
  h += '<div style="font-size:20px;font-weight:700;color:#fff;font-family:monospace;">' + s.skinInTheGame.insiderPercent + '%</div></div>';
  h += '<div><div style="font-size:11px;color:#8b949e;letter-spacing:0.5px;">6M NET FLOW</div>';
  const flowCls = s.convictionFlow.netFlowDollars > 0 ? "#3fb950" : s.convictionFlow.netFlowDollars < 0 ? "#f85149" : "#8b949e";
  h += '<div style="font-size:20px;font-weight:700;color:' + flowCls + ';font-family:monospace;">' + fmtMoney(s.convictionFlow.netFlowDollars) + '</div></div>';
  h += '</div>';

  // Three pillars
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:12px;">';
  h += '<div style="background:#161b26;border:1px solid #2a3448;border-radius:8px;padding:12px;">';
  h += '<div style="font-size:11px;color:#c9a961;font-weight:700;">SKIN IN THE GAME ' + s.skinInTheGame.score + '/' + s.skinInTheGame.max + '</div>';
  h += '<div style="font-size:13px;color:#e8ecf1;margin-top:4px;">' + s.skinInTheGame.insiderPercent + '% insider ownership</div></div>';
  h += '<div style="background:#161b26;border:1px solid #2a3448;border-radius:8px;padding:12px;">';
  h += '<div style="font-size:11px;color:#58a6ff;font-weight:700;">CONVICTION FLOW ' + s.convictionFlow.score + '/' + s.convictionFlow.max + '</div>';
  h += '<div style="font-size:13px;color:#e8ecf1;margin-top:4px;">Buys ' + fmtMoney(s.convictionFlow.buyDollars) + ' / Sells ' + fmtMoney(s.convictionFlow.sellDollars) + '</div></div>';
  h += '<div style="background:#161b26;border:1px solid #2a3448;border-radius:8px;padding:12px;">';
  h += '<div style="font-size:11px;color:#3fb950;font-weight:700;">PAY-FOR-PERF ' + s.compensation.score + '/' + s.compensation.max + '</div>';
  h += '<div style="font-size:13px;color:#e8ecf1;margin-top:4px;">' + esc(s.compensation.badge) + '</div>';
  h += '<div style="font-size:11px;color:#8b949e;">1Y TSR ' + (s.compensation.tsr1y >= 0 ? '+' : '') + s.compensation.tsr1y + '% · ' + esc(s.compensation.ceoName) + '</div></div>';
  h += '</div>';

  // Flow chart
  if (a.flowHistory && a.flowHistory.length) {
   h += '<div class="zoomable-chart" data-chart="agency-flow-' + ticker + '" style="position:relative;height:220px;margin-bottom:12px;cursor:zoom-in;" title="Click to zoom"><canvas id="agency-flow-' + ticker + '"></canvas>';
   h += '<div style="position:absolute;top:8px;right:10px;font-size:11px;color:#e8ecf1;background:rgba(19,23,34,0.8);padding:2px 8px;border-radius:4px;">⛶ click to zoom</div></div>';
  }

  // Recent filings
  if (a.recentFilings && a.recentFilings.length) {
   h += '<div style="font-size:12px;font-weight:700;color:#fff;margin:12px 0 8px;">Recent Form 4 Filings</div>';
   h += '<div style="overflow-x:auto;"><table style="width:100%;font-size:12px;color:#e8ecf1;">';
   h += '<tr style="color:#8b949e;text-align:left;"><th style="padding:6px;">Date</th><th style="padding:6px;">Filer</th><th style="padding:6px;">Type</th><th style="padding:6px;text-align:right;">Shares</th><th style="padding:6px;text-align:right;">Value</th></tr>';
   a.recentFilings.forEach(function(tx) {
    const tc = tx.type === "BUY" ? "#3fb950" : "#f85149";
    h += '<tr style="border-top:1px solid #2a3448;"><td style="padding:6px;">' + esc(tx.date) + '</td><td style="padding:6px;">' + esc(tx.filer) + '</td><td style="padding:6px;color:' + tc + ';font-weight:700;">' + tx.type + '</td><td style="padding:6px;text-align:right;">' + tx.shares.toLocaleString() + '</td><td style="padding:6px;text-align:right;">' + fmtMoney(tx.value) + '</td></tr>';
   });
   h += '</table></div>';
  }

  // SEC DEF 14A Proxy Audit (from ceo_compensation.json)
  const proxy = (D.ceo_compensation && D.ceo_compensation.records && D.ceo_compensation.records[ticker]) || null;
  if (proxy) {
   const gradeColor = proxy.alignmentGrade === "A" ? "#3fb950" : proxy.alignmentGrade === "B" ? "#58a6ff" : proxy.alignmentGrade === "C" ? "#d29922" : "#f85149";
   const chgCls = proxy.tookPayCut ? "#3fb950" : "#f85149";
   const chgTxt = (proxy.compPercentageChange > 0 ? "+" : "") + proxy.compPercentageChange + "%";
   h += '<div style="background:#161b26;border:1px solid #2a3448;border-radius:8px;padding:16px;margin-top:12px;">';
   h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">';
   h += '<div style="font-size:13px;font-weight:700;color:#fff;">SEC Proxy Audit <span style="font-size:11px;color:#8b949e;font-weight:400;">DEF 14A ' + esc(proxy.filingDate || "") + '</span></div>';
   h += '<div style="font-size:24px;font-weight:700;color:' + gradeColor + ';font-family:monospace;">' + esc(proxy.alignmentGrade || "") + '</div></div>';
   h += '<div style="font-size:14px;font-weight:700;color:' + chgCls + ';margin-bottom:8px;">' + esc(proxy.verdictTitle || "") + '</div>';
   h += '<div style="font-size:12px;color:#8b949e;margin-bottom:8px;">' + esc(proxy.ceoName || "") + ' · FY' + esc(proxy.fiscalYearAnalyzed || "") + ' vs FY' + esc(proxy.priorFiscalYear || "") + ' · YoY ' + chgTxt + '</div>';
   if (proxy.payBreakdown) {
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:8px;">';
    h += '<div><div style="font-size:10px;color:#8b949e;">BASE SALARY</div><div style="font-size:12px;color:#e8ecf1;">' + esc(proxy.payBreakdown.baseSalary || "N/A") + '</div></div>';
    h += '<div><div style="font-size:10px;color:#8b949e;">STOCK AWARDS</div><div style="font-size:12px;color:#e8ecf1;">' + esc(proxy.payBreakdown.stockAwards || "N/A") + '</div></div>';
    h += '<div><div style="font-size:10px;color:#8b949e;">BONUS</div><div style="font-size:12px;color:#e8ecf1;">' + esc(proxy.payBreakdown.nonEquityIncentiveBonus || "N/A") + '</div></div>';
    h += '<div><div style="font-size:10px;color:#8b949e;">OTHER</div><div style="font-size:12px;color:#e8ecf1;">' + esc(proxy.payBreakdown.otherComp || "N/A") + '</div></div>';
    h += '</div>';
   }
   if (proxy.founderModeFlag) {
    h += '<div style="font-size:11px;color:#c9a961;background:rgba(201,169,97,0.1);border:1px solid #c9a961;padding:6px 10px;border-radius:4px;margin-bottom:8px;">FOUNDER MODE: symbolic salary, equity-aligned</div>';
   }
   if (proxy.lootingFlag) {
    h += '<div style="font-size:11px;color:#f85149;background:rgba(248,81,73,0.1);border:1px solid #f85149;padding:6px 10px;border-radius:4px;margin-bottom:8px;">LOOTING FLAG: pay up sharply while shareholders lost money</div>';
   }
   h += '<div style="font-size:13px;color:#e8ecf1;line-height:1.6;margin-bottom:8px;">' + esc(proxy.forensicTakeaway || "") + '</div>';
   h += '<div style="font-size:11px;color:#8b949e;"><a href="' + esc(proxy.proxyUrl || "#") + '" target="_blank" style="color:#58a6ff;">View DEF 14A on SEC EDGAR</a> · Audited ' + esc((proxy.auditedAt || "").slice(0, 10)) + '</div>';
   h += '</div>';
  }

  // Explainer
  h += '<div style="background:#161b26;border:1px solid #2a3448;border-radius:8px;padding:16px;margin-top:12px;">';
  h += '<div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:8px;">What this tells you</div>';
  h += '<div style="font-size:13px;color:#e8ecf1;line-height:1.6;">';
  h += 'The <b>Agency Risk score</b> measures whether management\'s incentives align with shareholders. ';
  h += 'High insider ownership means executives feel the same pain as investors. ';
  h += 'Open-market buying (not option grants) signals genuine conviction. ';
  h += 'When executives draw large pay packages while the stock drops, that is the classic agency problem: management gets paid regardless of performance.</div>';
  h += '<div style="font-size:11px;color:#8b949e;margin-top:8px;">Source: Yahoo Finance (SEC Form 4, insider holdings, executive compensation), updated on demand.</div></div>';
  h += '</div>';

  el.innerHTML = h;

  // Render flow chart
  const cid = "agency-flow-" + ticker;
  const canvas = document.getElementById(cid);
  if (canvas && a.flowHistory && a.flowHistory.length) {
   try {
    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();
    new Chart(canvas, {
     type: "bar",
     data: {
      labels: a.flowHistory.map(function(x) { return x.month; }),
      datasets: [
       { label: "Buys ($)", data: a.flowHistory.map(function(x) { return x.buys; }), backgroundColor: "#3fb950" },
       { label: "Sells ($)", data: a.flowHistory.map(function(x) { return x.sells; }), backgroundColor: "#f85149" }
      ]
     },
     options: {
      animation: false, responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#8b949e", font: { size: 10 } } } },
      scales: {
       x: { ticks: { color: "#6b7280", font: { size: 10 } }, grid: { display: false } },
       y: { ticks: { color: "#6b7280", font: { size: 10 } }, grid: { color: "rgba(42,46,57,0.4)" } }
      }
     }
    });
   } catch (e) { console.error("Agency flow chart error:", e); }
  }
 }
 route("quality", async function (param) {
  await ensureProData();
  if (!isPro()) {
   app.innerHTML = '<div class="crumb">QUALITY SNAPSHOT</div>' +
    '<div class="hero"><div><h1 class="hero-h">Quality Snapshot.</h1>' +
    "<p class='hero-sub'>On-demand ROIC, cash conversion, and Rule of 40 for any ticker.</p></div></div>" +
    '<div class="section"><div class="section-title">Quality Snapshot <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>' +
    proTeaser("Quality Snapshot, Pro", "Type any ticker and get an instant read on capital returns, operating efficiency, and the growth engine. ROIC, CROIC, revenue per employee, operating leverage, and Rule of 40, computed live.") + "</div>";
   return;
  }
  const initial = (param || "").toUpperCase().trim();
  app.innerHTML = '<div class="crumb">QUALITY SNAPSHOT</div>' +
   '<div class="hero"><div><h1 class="hero-h">Quality Snapshot.</h1>' +
   "<p class='hero-sub'>On-demand ROIC, cash conversion, and Rule of 40 for any ticker.</p></div></div>" +
   '<div class="section"><div class="section-title">Ticker Lookup <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span></div>' +
   '<div style="display:flex;gap:8px;margin:12px 0;max-width:420px;">' +
   '<input id="quality-ticker" type="text" placeholder="TICKER (e.g. CRWD)" value="' + esc(initial) + '" ' +
   'style="flex:1;background:#161b26;border:1px solid #2a3448;border-radius:8px;padding:10px 12px;color:#e8ecf1;font-size:14px;text-transform:uppercase;" />' +
   '<button onclick="runQualitySearch()" style="background:#c9a961;color:#0a0f1a;font-weight:700;border:none;border-radius:8px;padding:10px 20px;cursor:pointer;">Analyze</button></div>' +
   '<div id="quality-result"></div></div>';
  const inp = document.getElementById("quality-ticker");
  if (inp) {
   inp.addEventListener("keydown", (e) => { if (e.key === "Enter") runQualitySearch(); });
   if (initial) runQualitySearch();
  }
 });

 route("memos", async function (param) {
  const allMemos = (D.memos && D.memos.memos) || [];
  const memoId = (param || "").trim();
  const memo = allMemos.find((m) => m.id === memoId);

  if (memo) {
   // Single memo view
   let h = '<div class="crumb"><a href="#/memos" style="color:#8b949e;">CASCADIA MEMOS</a></div>';
   h += '<div class="hero"><div><h1 class="hero-h">' + esc(memo.title) + '</h1>';
   h += '<p class="hero-sub">' + esc(memo.date) + '</p></div></div>';
   h += '<div class="section" style="max-width:800px;margin:0 auto;">';
   (memo.sections || []).forEach((s) => {
    h += '<h2 style="font-size:20px;font-weight:700;color:#fff;margin:24px 0 12px;">' + esc(s.heading) + '</h2>';
    h += '<div style="font-size:15px;color:#e8ecf1;line-height:1.8;white-space:pre-line;">' + esc(s.body) + '</div>';
   });
   // Pro CTA
   h += '<div style="background:#161b26;border:1px solid #c9a961;border-radius:12px;padding:24px;margin-top:32px;text-align:center;">';
   h += '<div style="font-size:16px;font-weight:700;color:#c9a961;margin-bottom:8px;">See the models behind this thesis</div>';
   h += '<div style="font-size:14px;color:#e8ecf1;margin-bottom:16px;">Cascadia Pro gives you the DCF models, risk gauges, and positioning data behind every memo.</div>';
   h += '<button class="btn" onclick="openProModal()">See Pro Plans</button></div>';
   h += '<div style="font-size:11px;color:#8b949e;margin-top:16px;text-align:center;">Not investment advice. For informational purposes only.</div>';
   h += '</div>';
   app.innerHTML = h;
   window.scrollTo(0, 0);
   return;
  }

  // Memos index
  let h = '<div class="crumb">CASCADIA MEMOS</div>';
  h += '<div class="hero"><div><h1 class="hero-h">Cascadia Memos.</h1>';
  h += '<p class="hero-sub">Market analysis and investment perspectives from Cascadia Analytics.</p></div></div>';
  h += '<div class="section" style="max-width:800px;margin:0 auto;">';
  if (!allMemos.length) {
   h += '<div class="card"><p style="color:#8b949e;">No memos yet.</p></div>';
  } else {
   allMemos.slice().reverse().forEach((m) => {
    h += '<a href="#/memos/' + esc(m.id) + '" style="text-decoration:none;">';
    h += '<div class="card" style="margin-bottom:16px;cursor:pointer;">';
    h += '<div style="font-size:11px;color:#8b949e;">' + esc(m.date) + '</div>';
    h += '<div style="font-size:20px;font-weight:700;color:#fff;margin:8px 0;">' + esc(m.title) + '</div>';
    h += '<div style="font-size:14px;color:#8b949e;line-height:1.6;">' + esc(m.excerpt) + '</div>';
    h += '<div style="font-size:13px;color:#c9a961;margin-top:8px;">Read memo →</div>';
    h += '</div></a>';
   });
  }
  h += '</div>';
  app.innerHTML = h;
  window.scrollTo(0, 0);
 });

 route("risk", async function () {
  await ensureProData();
  if (!isPro()) {
   // Free users see headline scores as a teaser (score + regime only, no analysis)
   // Data comes from the free risk_headlines bundle, not Pro data
   const rh = D.risk_headlines || {};
   const cr = rh.correction_risk || {};
   const ld = rh.liquidity_drain || {};
   const rv = rh.rv_shock || {};
   const cg = rh.contagion || {};
   const fd = rh.flow_divergence || {};
   const dc = rh.concentration || {};
   const ml = rh.margin_leverage || {};
   const sr = rh.sector_rotation || {};
   const fi = rh.fear_index || {};
   const fiColor = fi.score >= 75 ? "rose" : fi.score >= 55 ? "amber" : fi.score >= 45 ? "slate" : "emerald";
   const colorMap = { emerald: "#3fb950", amber: "#d29922", rose: "#f85149", slate: "#8b949e" };
   const card = (name, score, regime, color) => {
    if (score == null) return "";
    const c = colorMap[color] || "#e8ecf1";
    return '<div style="background:#161b26;border-radius:10px;padding:14px;min-width:160px;flex:1;">' +
     '<div style="font-size:11px;color:#8b949e;letter-spacing:0.5px;">' + esc(name.toUpperCase()) + "</div>" +
     '<div style="font-size:28px;font-weight:800;color:' + c + ';">' + score + '<span style="font-size:14px;color:#8b949e;">/100</span></div>' +
     '<div style="font-size:12px;font-weight:700;color:' + c + ';">' + esc(regime || "") + "</div></div>";
   };
   let freeH = '<div class="crumb">RISK MODELS</div>' +
    '<div class="hero"><div><h1 class="hero-h">Risk Models</h1>' +
    "<p class='hero-sub'>Quantitative gauges of market fear, correction risk, volatility regimes, and credit stress.</p></div></div>" +
    '<div class="section"><div class="section-title">Daily Snapshot <span style="font-size:11px;background:#7d4fc9;color:#fff;padding:2px 8px;border-radius:4px;vertical-align:middle;">PRO</span>' +
    ' <span style="font-size:11px;color:#8b949e;font-weight:400;">as of ' + esc((D.generated_at || "").slice(0, 10)) + '</span></div>' +
    '<div class="section-sub">Current scores, free. The full breakdown, charts, history, and in-depth analysis are Pro.</div>' +
    compositeBanner() +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0;">' +
    card("Correction Risk", cr.score, cr.regime, cr.color) +
    card("Liquidity Drain", ld.score, ld.regime, ld.color) +
    card("RV Shock", rv.score, rv.regime, rv.color) +
    card("Contagion", cg.score, cg.regime, cg.color) +
    card("Flow Divergence", fd.score, fd.regime, fd.color) +
    card("Concentration", dc.score, dc.regime, dc.color) +
    card("Margin Leverage", ml.score, ml.regime, ml.color) +
    card("Sector Rotation", sr.score, sr.regime, sr.color) +
    card("Fear Index", fi.score, fi.regime, fiColor) +
    "</div>" +
    proTeaser("Risk Models, Pro", "Correction Risk Model, Liquidity Drain Model, RV Shock Model, Cross-Asset Contagion Tracker, Institutional Flow Divergence, Dynamic Concentration Risk Gauge, Systemic Leverage Model, Offense vs Defense Rotation, Quantitative Fear Index, Volatility Divergence, and Credit Spreads vs VIX. Know when risk is building before the pullback.") + "</div>";
   app.innerHTML = freeH;
   return;
  }
  let h = '<div class="crumb">RISK MODELS</div>' +
   '<div class="hero"><div><h1 class="hero-h">Risk Models</h1>' +
   "<p class='hero-sub'>Quantitative gauges of market fear, correction risk, volatility regimes, and credit stress.</p></div></div>";
  h += compositeBanner();
  h += correctionRiskHtml();
  h += liquidityDrainHtml();
  h += rvShockHtml();
  h += contagionHtml();
  h += flowDivergenceHtml();
  h += concentrationHtml();
  h += marginLeverageHtml();
  h += sectorRotationHtml();
  h += fearIndexHtml();
  app.innerHTML = h;
  bindZoomHandlers();
  // Draw correction risk chart
  const cr = D.correction_risk || {};
  const hist = cr.history || [];
  const cv = document.getElementById("correction-risk-chart");
  if (cv && hist.length && window.Chart) {
   const old = Chart.getChart(cv);
   if (old) old.destroy();
   new Chart(cv, {
    data: {
     labels: hist.map((r) => r.date),
     datasets: [
      {type: "line", label: "SPY", data: hist.map((r) => r.price), borderColor: "#c99a6b", borderWidth: 2, pointRadius: 0, yAxisID: "yPrice"},
      {type: "bar", label: "Risk Score", data: hist.map((r) => r.score), backgroundColor: hist.map((r) => r.color), yAxisID: "yScore", barPercentage: 1.0, categoryPercentage: 1.0},
     ],
    },
    options: {animation: false, responsive: true, maintainAspectRatio: false,
     interaction: {mode: "index", intersect: false},
     plugins: {legend: {display: false}},
     scales: {
      x: {ticks: {color: "#6b7280", maxTicksLimit: 8}, grid: {display: false}},
      yPrice: {position: "left", ticks: {color: "#c99a6b"}, grid: {color: "rgba(42,46,57,0.4)"}},
      yScore: {position: "right", min: 0, max: 100, ticks: {color: "#8b949e", stepSize: 25}, grid: {display: false}},
     }},
   });
  }
  // Draw liquidity drain chart (net liquidity vs SPY)
  const ld = D.liquidity_drain || {};
  const ldHist = ld.history || [];
  const ldCv = document.getElementById("liquidity-drain-chart");
  if (ldCv && ldHist.length && window.Chart) {
   const oldLd = Chart.getChart(ldCv);
   if (oldLd) oldLd.destroy();
   new Chart(ldCv, {
    data: {
     labels: ldHist.map((r) => r.date),
     datasets: [
      { type: "line", label: "Net Liquidity ($B)", data: ldHist.map((r) => r.netLiquidity),
        borderColor: "#c9a961", borderWidth: 2, pointRadius: 0, tension: 0.2, yAxisID: "yLiq" },
      { type: "line", label: "SPY", data: ldHist.map((r) => r.spy),
        borderColor: "#58a6ff", borderWidth: 2, borderDash: [5, 5], pointRadius: 0, tension: 0.2, yAxisID: "ySpy" },
     ]},
    options: { animation: false, responsive: true, maintainAspectRatio: false,
     interaction: { mode: "index", intersect: false },
     plugins: { legend: { labels: { color: "#8b949e", boxWidth: 12 } } },
     scales: {
      x: {ticks: {color: "#6b7280", maxTicksLimit: 8}, grid: {display: false}},
      yLiq: {position: "left", ticks: {color: "#c9a961"}, grid: {color: "rgba(42,46,57,0.4)"}},
      ySpy: {position: "right", ticks: {color: "#58a6ff"}, grid: {display: false}},
     }},
   });
  }
  // Draw contagion chart inline
  const cg = D.contagion || {};
  const cgHist = cg.history || [];
  const cgCv = document.getElementById("contagion-chart");
  if (cgCv && cgHist.length && window.Chart) {
   const oldCg = Chart.getChart(cgCv);
   if (oldCg) oldCg.destroy();
   new Chart(cgCv, {
    data: {
     labels: cgHist.map((r) => r.date),
     datasets: [
      { type: "line", label: "Contagion Score", data: cgHist.map((r) => r.contagionScore),
        borderColor: "#d29922", backgroundColor: "rgba(210,153,34,0.1)", fill: true,
        borderWidth: 2, pointRadius: 0, tension: 0.2, yAxisID: "yScore" },
      { type: "line", label: "SPY", data: cgHist.map((r) => r.spy),
        borderColor: "#58a6ff", borderWidth: 2, borderDash: [5, 4], pointRadius: 0, tension: 0.2, yAxisID: "ySpy" },
     ]},
    options: { animation: false, responsive: true, maintainAspectRatio: false,
     interaction: { mode: "index", intersect: false },
     plugins: { legend: { labels: { color: "#8b949e", boxWidth: 12 } } },
     scales: {
      x: {ticks: {color: "#6b7280", maxTicksLimit: 8}, grid: {display: false}},
      yScore: {position: "left", min: 0, max: 100, ticks: {color: "#d29922"}, grid: {color: "rgba(42,46,57,0.4)"}},
      ySpy: {position: "right", ticks: {color: "#58a6ff"}, grid: {display: false}},
     }},
   });
  }
  // Draw flow divergence chart inline
  const FD = D.flow_divergence || {};
  const fdHist = FD.history || [];
  const fdCv = document.getElementById("flow-divergence-chart");
  if (fdCv && fdHist.length && window.Chart) {
   const oldFd = Chart.getChart(fdCv);
   if (oldFd) oldFd.destroy();
   new Chart(fdCv, {
    data: {
     labels: fdHist.map((r) => r.date),
     datasets: [
      { type: "line", label: "Divergence Oscillator", data: fdHist.map((r) => r.oscillator),
        borderColor: "#f85149", backgroundColor: "rgba(248,81,73,0.1)", fill: true,
        borderWidth: 2, pointRadius: 0, tension: 0.2, yAxisID: "yOsc" },
      { type: "line", label: "SPY", data: fdHist.map((r) => r.spy),
        borderColor: "#58a6ff", borderWidth: 2, borderDash: [5, 4], pointRadius: 0, tension: 0.2, yAxisID: "ySpy" },
     ]},
    options: { animation: false, responsive: true, maintainAspectRatio: false,
     interaction: { mode: "index", intersect: false },
     plugins: { legend: { labels: { color: "#8b949e", boxWidth: 12 } } },
     scales: {
      x: {ticks: {color: "#6b7280", maxTicksLimit: 8}, grid: {display: false}},
      yOsc: {position: "left", min: -3, max: 3, ticks: {color: "#f85149"}, grid: {color: "rgba(42,46,57,0.4)"}},
      ySpy: {position: "right", ticks: {color: "#58a6ff"}, grid: {display: false}},
     }},
   });
  }
  // Draw concentration chart inline
  const KC = D.dynamic_concentration || {};
  const kcHist = KC.history || [];
  const kcLeader = (KC.leader || {}).ticker || "Leader";
  const kcCv = document.getElementById("concentration-chart");
  if (kcCv && kcHist.length && window.Chart) {
   const oldKc = Chart.getChart(kcCv);
   if (oldKc) oldKc.destroy();
   new Chart(kcCv, {
    data: {
     labels: kcHist.map((r) => r.date),
     datasets: [
      { type: "line", label: "Leader: " + kcLeader, data: kcHist.map((r) => r.leader),
        borderColor: "#3fb950", backgroundColor: "rgba(63,185,80,0.1)", fill: true,
        borderWidth: 2, pointRadius: 0, tension: 0.2 },
      { type: "line", label: "SPY", data: kcHist.map((r) => r.spy),
        borderColor: "#58a6ff", borderWidth: 2, pointRadius: 0, tension: 0.2 },
      { type: "line", label: "RSP", data: kcHist.map((r) => r.rsp),
        borderColor: "#8b949e", borderWidth: 2, borderDash: [4, 4], pointRadius: 0, tension: 0.2 },
     ]},
    options: { animation: false, responsive: true, maintainAspectRatio: false,
     interaction: { mode: "index", intersect: false },
     plugins: { legend: { labels: { color: "#8b949e", boxWidth: 12 } } },
     scales: {
      x: {ticks: {color: "#6b7280", maxTicksLimit: 8}, grid: {display: false}},
      y: {ticks: {color: "#8b949e"}, grid: {color: "rgba(42,46,57,0.4)"}},
     }},
   });
  }
  // Draw margin leverage chart (margin YoY vs SPY YoY)
  const ML = D.margin_leverage || {};
  const mlHist = ML.history || [];
  const mlCv = document.getElementById("margin-leverage-chart");
  if (mlCv && mlHist.length && window.Chart) {
   const oldMl = Chart.getChart(mlCv);
   if (oldMl) oldMl.destroy();
   new Chart(mlCv, {
    data: {
     labels: mlHist.map((r) => r.date),
     datasets: [
      { type: "line", label: "Margin Debt YoY (%)", data: mlHist.map((r) => r.marginYoY),
        borderColor: "#f85149", borderWidth: 2, pointRadius: 0, tension: 0.2 },
      { type: "line", label: "SPY YoY (%)", data: mlHist.map((r) => r.spyYoY),
        borderColor: "#58a6ff", borderWidth: 2, borderDash: [5, 5], pointRadius: 0, tension: 0.2 },
     ]},
    options: { animation: false, responsive: true, maintainAspectRatio: false,
     interaction: { mode: "index", intersect: false },
     plugins: { legend: { labels: { color: "#8b949e", boxWidth: 12 } } },
     scales: {
      x: {ticks: {color: "#6b7280", maxTicksLimit: 8}, grid: {display: false}},
      y: {ticks: {color: "#8b949e", callback: (v) => v + "%"}, grid: {color: "rgba(42,46,57,0.4)"}},
     }},
   });
  }
  // Draw sector rotation chart (RSPD/RSPS vs XLY/XLP)
  const SR = D.sector_rotation || {};
  const srHist = SR.history || [];
  const srCv = document.getElementById("sector-rotation-chart");
  if (srCv && srHist.length && window.Chart) {
   const oldSr = Chart.getChart(srCv);
   if (oldSr) oldSr.destroy();
   new Chart(srCv, {
    data: {
     labels: srHist.map((r) => r.date),
     datasets: [
      { type: "line", label: "RSPD/RSPS (equal-wt)", data: srHist.map((r) => r.rspdRsps),
        borderColor: "#58a6ff", borderWidth: 2, pointRadius: 0, tension: 0.2 },
      { type: "line", label: "XLY/XLP (cap-wt)", data: srHist.map((r) => r.xlyXlp),
        borderColor: "#d29922", borderWidth: 2, pointRadius: 0, tension: 0.2 },
     ]},
    options: { animation: false, responsive: true, maintainAspectRatio: false,
     interaction: { mode: "index", intersect: false },
     plugins: { legend: { labels: { color: "#8b949e", boxWidth: 12 } } },
     scales: {
      x: {ticks: {color: "#6b7280", maxTicksLimit: 8}, grid: {display: false}},
      y: {ticks: {color: "#8b949e"}, grid: {color: "rgba(42,46,57,0.4)"}},
     }},
   });
  }
 });

 /* ================= PRICING ================= */
 function showPricingModal() {
  const proActive = isPro();
  const root = document.getElementById("modal-root");
  let h = '<div class="modal-back" id="pricing-back" style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;padding:4vh 4vw;cursor:pointer;overflow-y:auto;">' +
   '<div id="pricing-modal" style="background:#131722;border-radius:16px;width:100%;max-width:960px;max-height:92vh;overflow-y:auto;padding:32px;cursor:default;position:relative;" onclick="event.stopPropagation()">' +
   '<button id="pricing-x" style="position:absolute;top:16px;right:16px;background:#2a3448;border:0;color:#c8d0dc;font-size:20px;width:40px;height:40px;border-radius:50%;cursor:pointer;line-height:1;">&times;</button>' +
   '<div style="text-align:center;margin-bottom:24px;">' +
   '<div style="font-size:13px;font-weight:700;letter-spacing:3px;color:#e8ecf1;margin-bottom:8px;">MEMBERSHIP</div>' +
   '<h1 style="font-size:32px;font-weight:800;color:#fff;margin:0 0 8px;">Choose your plan.</h1>' +
   "<p style='color:#e8ecf1;opacity:0.7;font-size:15px;margin:0;'>Free forever for the essentials. Pro for the full institutional toolkit.</p></div>";

  h += '<div class="pricing-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:20px;max-width:900px;margin:0 auto 32px;">' +
   '<style>@media (max-width:640px){.pricing-grid{grid-template-columns:1fr !important;}}</style>';

  // FREE column
  h += '<div class="card" style="padding:28px;">' +
   '<div style="font-size:13px;font-weight:700;letter-spacing:2px;color:#e8ecf1;margin-bottom:8px;">FREE</div>' +
   '<div style="font-size:36px;font-weight:800;color:#fff;margin-bottom:4px;">$0</div>' +
   '<div style="font-size:13px;color:#e8ecf1;opacity:0.7;margin-bottom:20px;">forever</div>' +
   '<ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px;font-size:14px;color:#e8ecf1;">' +
   '<li>✓ Full DCF valuation coverage, ' + ORDER.length + ' tickers with Bear/Base/Bull targets</li>' +
   '<li>✓ Reverse DCF, what the market is pricing in at the current quote</li>' +
   '<li>✓ Valuation multiples, market cap, EV, TTM and forward multiples</li>' +
   '<li>✓ Interactive price charts with moving averages (10/20/50/100/200-day)</li>' +
   '<li>✓ 5 years of financial statements, income, balance sheet, cash flow</li>' +
   '<li>✓ Daily Snapshot risk scores, all 7 models, score plus regime</li>' +
   '<li>✓ AAII Investor Sentiment tracker (weekly)</li>' +
   '<li>✓ COT Positioning tracker, commercial, large spec, small spec (weekly)</li>' +
   '<li>✓ Fed funds futures tracker with meeting probabilities</li>' +
   '<li>✓ 10Y breakeven inflation tracker</li>' +
   '<li>✓ Dark pool flow, insider transactions, trading trends with 13F</li>' +
   '<li>✓ Earnings revisions and 4-quarter earnings history</li>' +
   '<li>✓ Coverage premium screener with Cascadia Score and DCF upside</li>' +
   '<li>✓ Company news feed with ticker navigation</li>' +
   '<li>✓ Macro news wire</li>' +
   '<li>✓ Earnings calendar</li>' +
   '<li>✓ Coverage table with ratings and upside</li>' +
   "</ul></div>";

  // PRO column
  h += '<div class="card" style="padding:28px;border:2px solid #d4a017;position:relative;">' +
   '<div style="position:absolute;top:-14px;right:20px;background:#d4a017;color:#0a0f0a;font-size:11px;font-weight:800;padding:4px 12px;border-radius:12px;letter-spacing:1px;">MOST POPULAR</div>' +
   '<div style="font-size:13px;font-weight:700;letter-spacing:2px;color:#d4a017;margin-bottom:8px;">PRO</div>' +
   '<div style="font-size:36px;font-weight:800;color:#fff;margin-bottom:4px;">$19<span style="font-size:16px;font-weight:400;color:#e8ecf1;">/month</span></div>' +
   '<div style="font-size:13px;color:#e8ecf1;opacity:0.7;margin-bottom:20px;">billed monthly · cancel anytime</div>' +
   '<ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px;font-size:14px;color:#e8ecf1;">' +
   '<li>✓ <b>Everything in Free</b>, plus:</li>' +
   '<li>✓ All 9 Risk Models in full: Correction Risk, Liquidity Drain, RV Shock, Cross-Asset Contagion, Institutional Flow Divergence, Concentration Gauge, Systemic Leverage, Offense vs Defense, Fear Index, with charts, history, and plain-English explainers</li>' +
   '<li>✓ Gamma Exposure (GEX), indices + per-ticker dealer positioning with strike-level charts</li>' +
   '<li>✓ Volatility Skew, put/call fear gauge for indices and tickers</li>' +
   '<li>✓ Full market internals suite: Volatility Divergence, Alligator Jaw, Credit Spreads vs VIX, Market Breadth, Theme Rotation, Small/Mid Cap Monitor, RSI Cyclicals vs Defensives, Macroeconomic Analysis</li>' +
   '<li>✓ Quantitative Factor Screener, full S&P 500 on ROIC, PEG, FCF yield, Piotroski, and more, with CSV export</li>' +
   '<li>✓ Technical Factor Screener, Minervini Stage-2 trend template across the S&P 500</li>' +
   '<li>✓ Trend & Reversal Screener, per-ticker trend conviction and exhaustion gauges</li>' +
   '<li>✓ Sector-relative Comps Matrix, OLS valuation vs growth with anomaly detection</li>' +
   '<li>✓ Earnings Dashboard, 8 quarters of surprises and 1-day reactions for every ticker</li>' +
   '<li>✓ Unusual options flow tracker (10 trading days per ticker)</li>' +
   '<li>✓ Interactive FCF simulation sandbox</li>' +
   '<li>✓ Cascadia Score, multi-factor rating (valuation, momentum, earnings, options)</li>' +
   '<li>✓ Earnings call transcript tone analysis, executive confidence scoring via AI</li>' +
   '<li>✓ ' + ORDER.length + ' client research notes (PDF, full institutional format)</li>' +
   '<li>✓ Investment scorecard PDFs, one-glance 0-100 attractiveness rating</li>' +
   '<li>✓ Morning Briefing, institutional-grade daily synthesis of macro, internals, and positioning</li>' +
   '<li>✓ All future DCF models and ticker coverage, the coverage universe is constantly expanding and Pro members get every new name automatically</li>' +
   '<li>✓ Market Leadership tracker, automated S&P 500 leader scoring with rotation signals</li>' +
   '<li>✓ Email alerts, all 13 market monitors</li>' +
   '<li>✓ Moving average cross alerts, stocks and indices</li>' +
   '<li>✓ Custom price alerts, any covered ticker</li>' +
   '<li style="color:#d4a017;">✓ <b>All future features included at no extra cost</b>, our team ships new trackers and tools constantly and Pro members get every one of them automatically</li>' +
   '<li style="color:#d4a017;">✓ <b>Legacy price lock</b>, your $19/mo rate is locked in. If prices increase in the future, you keep paying $19 as long as your subscription stays active.</li>' +
   "</ul>";

  if (proActive) {
   h += '<a href="https://billing.stripe.com/p/login/14AbJ16A77FXa180hGbbG00" target="_blank" rel="noopener" class="btn" style="display:block;text-align:center;width:100%;margin-top:20px;text-decoration:none;">Manage subscription</a>';
  } else if (authUser) {
   h += '<a class="cta-btn" style="display:block;text-align:center;margin-top:20px;" href="' + esc(UPGRADE_URL) + '" target="_blank" rel="noopener">Subscribe, $19/mo</a>';
  } else {
   h += '<button class="btn" id="pricing-login" style="width:100%;margin-top:20px;">Log in / Sign up to subscribe</button>';
  }
  h += "</div></div>";

  // Price lock terms
  h += '<div class="card" style="max-width:900px;margin:0 auto;padding:24px;">' +
   '<div style="font-size:15px;font-weight:700;color:#fff;margin-bottom:12px;">Legacy Price Lock, Terms</div>' +
   '<ul style="font-size:13px;color:#e8ecf1;display:flex;flex-direction:column;gap:8px;padding-left:20px;margin:0;">' +
   "<li>Your subscription rate of <b>$19/month</b> is locked in for as long as your Pro membership remains continuously active.</li>" +
   "<li>If Cascadia Analytics raises prices in the future, <b>you will not pay the higher price</b>, your legacy rate is grandfathered.</li>" +
   "<li>All new Pro features released during your membership are <b>included at no extra cost</b>.</li>" +
   "<li>If you <b>cancel</b> your membership, you forfeit the legacy price lock.</li>" +
   "<li>If you choose to <b>re-subscribe</b> after cancelling, you will pay the then-current price, not your previous legacy rate.</li>" +
   "</ul></div>";

  h += "</div></div>";
  root.innerHTML = h;
  document.body.style.overflow = "hidden";
  const close = () => { root.innerHTML = ""; document.body.style.overflow = ""; };
  document.getElementById("pricing-back").addEventListener("click", close);
  document.getElementById("pricing-x").addEventListener("click", close);

  const loginBtn = document.getElementById("pricing-login");
  if (loginBtn) loginBtn.addEventListener("click", () => { close(); showProModal(); });
 }

 window.CA = { nav, isPro, cascadiaScore };

 // Initial load: render immediately from cache, then verify auth against Supabase.
 // If returning from Stripe checkout, force a fresh Pro status check.
 initAuthListener();
 (function init() {
  setSnapshot();
  populateCoverage();
  const params = new URLSearchParams(location.search);
  if (params.get("checkout") === "success") {
   // Returning from Stripe, clear the param and verify subscription status
   history.replaceState(null, "", location.pathname + location.hash);
   // Ask new Pro users if they want the morning briefing newsletter
   setTimeout(() => maybeShowNewsletterPrompt(), 2500);
  }
  // Don't render until auth resolves - prevents logged-out flicker for Pro users
  // refreshAuth() renders when complete
  refreshAuth();
  // Debug mode: add ?debug=1 to URL to see auth status (for iOS troubleshooting)
  if (location.search.includes("debug=1") || location.hash.includes("debug=1")) {
   const showDebug = () => {
    const info = [
     "isPro(): " + isPro(),
     "proVerified: " + proVerified,
     "isAdmin: " + isAdmin,
     "authUser: " + (authUser ? authUser.email : "null"),
     "PRO_DATA: " + (PRO_DATA ? "loaded" : "null"),
     "ProDataError: " + (window._proDataError || "none"),
     "Route: " + (location.hash || "#/")
    ].join("\n");
    // Show as a fixed banner instead of alert (more reliable on iOS)
    let banner = document.getElementById("debug-banner");
    if (!banner) {
     banner = document.createElement("div");
     banner.id = "debug-banner";
     banner.style.cssText = "position:fixed;top:0;left:0;right:0;background:#000;color:#0f0;padding:10px;font-family:monospace;font-size:12px;z-index:99999;white-space:pre-wrap;max-height:50vh;overflow:auto;";
     document.body.appendChild(banner);
    }
    banner.innerHTML = "DEBUG (tap to dismiss):\n" + info.replace(/\n/g, "<br>") +
     '<br><br><button id="debug-retry" style="background:#0f0;color:#000;padding:8px 16px;border:none;border-radius:4px;font-weight:bold;">Retry Pro Data</button>';
    banner.onclick = (e) => {
     if (e.target.id === "debug-retry") {
      e.stopPropagation();
      ensureProData().then(() => {
       setTimeout(() => { render(); embedAnalysisVisuals(); }, 500);
      });
     } else {
      banner.remove();
     }
    };
   };
   // Try multiple times to catch auth completion
   setTimeout(showDebug, 2000);
   setTimeout(showDebug, 5000);
   setTimeout(showDebug, 8000);
  }
 })();
})();


/* === TRADINGVIEW BACKUP (maHtml TradingView version, 2026-10-14) ===
//  function maHtml(tk) {
//   const m = (D.ticker_ma || {})[tk];
//   if (!m) return '<div class="card"><p style="color:var(--muted)">No moving-average data for this ticker.</p></div>';
//   let h = "";
//   // TradingView widgets via JS API (supports pre-loaded MA studies)
//   const tvSym = tk === "RNMBY" ? "OTC:RNMBY" : "NASDAQ:" + tk;
//   const intervals = { daily: "D", weekly: "W", monthly: "M" };
//   const tvCharts = [];
//   ["daily", "weekly", "monthly"].forEach((tf) => {
//    const d = m[tf];
//    if (!d) return;
//    const cid = "tv-" + tk + "-" + tf;
//    tvCharts.push({ cid, tf });
//    h += '<div class="card"><h3 style="text-transform:capitalize">' + tf + ' <span class="verdict ' +
//     (String(d.signal || "").toLowerCase().includes("buy") ? "bullish" : String(d.signal || "").toLowerCase().includes("sell") ? "bearish" : "neutral") +
//     '">' + esc(d.signal || "") + "</span></h3>" +
//     '<div id="' + cid + '" style="height:420px;width:100%;margin-bottom:12px;"></div>' +
//     '<div style="font-size:12px;color:#a8b0bc;margin-bottom:10px;">Overlays: <b style="color:#c8d0dc;">SMA 10</b> · <b style="color:#c8d0dc;">SMA 20</b> · <b style="color:#c8d0dc;">SMA 50</b> · <b style="color:#c8d0dc;">SMA 200</b> (simple moving averages)</div>' +
//     '<div class="table-wrap"><table class="coverage ma-table"><thead><tr><th>Period</th><th>SMA</th><th>EMA</th></tr></thead><tbody>' +
//     ["10", "20", "30", "50", "100", "200"].map((p) =>
//      "<tr><td>" + p + "</td><td>" + fmt$((d.sma || {})[p]) + "</td><td>" + fmt$((d.ema || {})[p]) + "</td></tr>"
//     ).join("") + "</tbody></table></div>" +
//     '<div class="panel-asof">Price ' + fmt$(d.price) + " · as of " + esc(d.as_of || "") + " · Chart by TradingView</div></div>";
//   });
//   // init TradingView widgets after DOM insert
//   setTimeout(() => {
//    if (typeof TradingView === "undefined") {
//     const s = document.createElement("script");
//     s.src = "https://s3.tradingview.com/tv.js";
//     s.onload = initTV;
//     document.head.appendChild(s);
//    } else { initTV(); }
//    function initTV() {
//     tvCharts.forEach(({ cid, tf }) => {
//      const el = document.getElementById(cid);
//      if (!el || el.dataset.tvInit) return;
//      el.dataset.tvInit = "1";
//      try {
//       const widget = new TradingView.widget({
//        container_id: cid, symbol: tvSym, interval: intervals[tf],
//        theme: "dark", style: "1", locale: "en", toolbar_bg: "#1a2332",
//        hide_side_toolbar: false, allow_symbol_change: false,
//        autosize: true,
//        // add MA studies once chart is ready
//        onChartReady: function() {
//         try {
//          const chart = widget.chart();
//          [10, 20, 50, 200].forEach((len) => {
//           chart.createStudy("Moving Average Simple", false, false, { length: len });
//          });
//         } catch (e) { console.error("TV study error", e); }
//        }
//       });
//      } catch (e) { console.error("TV widget error", e); }
//     });
//    }
//   }, 200);
//   return h || '<div class="card"><p style="color:var(--muted)">No data.</p></div>';
//  }
// 
=== END TRADINGVIEW BACKUP === */
