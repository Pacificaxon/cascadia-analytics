/* Cascadia Analytics — single-page app */
(function () {
  "use strict";
  const D = window.SITE_DATA || {};
  const TICKERS = D.tickers || {};
  const ORDER = D.ticker_order || Object.keys(TICKERS).sort();
  const app = document.getElementById("app");
  const PRO_KEY = "cascadia_pro";

  /* ---------- helpers ---------- */
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const fmt$ = (n, d) => {
    if (n == null || isNaN(n)) return "—";
    return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: d != null ? d : 2, maximumFractionDigits: d != null ? d : 2 });
  };
  const fmtM = (n) => {
    if (n == null || isNaN(n)) return "—";
    const a = Math.abs(n);
    if (a >= 1000) return "$" + (n / 1000).toFixed(1) + "B";
    return "$" + Math.round(n) + "M";
  };
  const fmtPct = (n, d) => (n == null || isNaN(n)) ? "—" : (n >= 0 ? "+" : "") + Number(n).toFixed(d != null ? d : 1) + "%";
  const cls = (n) => (n == null || isNaN(n)) ? "" : (n >= 0 ? "pos" : "neg");
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
    if (proVerified !== null) return proVerified;
    try { return localStorage.getItem(PRO_KEY) === "1"; } catch (e) { return false; }
  };
  const setPro = (v) => { try { v ? localStorage.setItem(PRO_KEY, "1") : localStorage.removeItem(PRO_KEY); } catch (e) {} };

  /* ---------- Supabase Auth + server-verified Pro ---------- */
  const SUPABASE_URL = "https://tlrfqoqefltxodoynqmh.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRscmZxb3FlZmx0eG9kb3lucW1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5ODc5MjIsImV4cCI6MjEwNzU2MzkyMn0.XB9l2J69wGVxkUF7cGTjCzCb4QBwCdiuoRMycoy4tW8";
  const supa = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
  let authUser = null;
  let proVerified = null; // null = not yet checked this load; true/false after Supabase lookup
  let isAdmin = false;

  async function refreshAuth() {
    if (!supa) { proVerified = false; render(); return; }
    try {
      const { data: { session } } = await supa.auth.getSession();
      authUser = session ? session.user : null;
      if (authUser) {
        const { data, error } = await supa.from("profiles")
          .select("is_pro, is_admin").eq("user_id", authUser.id).single();
        if (!error && data) {
          isAdmin = !!data.is_admin;
          proVerified = !!(data.is_pro || data.is_admin);
        } else {
          // No profile row yet (trigger may lag) — treat as non-Pro, retry next load
          isAdmin = false;
          proVerified = false;
        }
      } else {
        isAdmin = false;
        proVerified = false;
      }
    } catch (e) {
      // Network/Supabase failure — fall back to localStorage cache
      proVerified = null;
    }
    if (proVerified !== null) setPro(proVerified);
    updateAuthBtn();
    render();
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
      b.title = authUser.email + (isAdmin ? " (Admin)" : proVerified ? " (Pro)" : "") + " — click to log out";
      b.onclick = () => { if (confirm("Log out of " + authUser.email + "?")) doLogout(); };
    } else {
      b.textContent = "Log in";
      b.classList.remove("logged-in");
      b.title = "";
      b.onclick = () => showAuthModal("login");
    }
  }

  async function doLogout() {
    try { if (supa) await supa.auth.signOut(); } catch (e) {}
    authUser = null; proVerified = false; isAdmin = false;
    setPro(false);
    document.getElementById("modal-root").innerHTML = "";
    updateAuthBtn();
    render();
  }

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
        if (isLogin) res = await supa.auth.signInWithPassword({ email, password: pass });
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
    if (t.upside_base == null) return null;
    return Math.max(1, Math.min(100, Math.round(50 + t.upside_base)));
  }
  function scoreClass(s) { return s >= 65 ? "score-hi" : s >= 40 ? "score-mid" : "score-lo"; }

  /* ---------- paywall ---------- */
  const UPGRADE_URL = D.stripe_payment_link || "#";
  function proTeaser(title, desc) {
    return '<div class="locked-teaser">' +
      '<div class="lock-icon"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>' +
      "<h3>" + esc(title) + "</h3><p>" + esc(desc) + "</p>" +
      '<a class="cta-btn" href="' + esc(UPGRADE_URL) + '" target="_blank" rel="noopener">Upgrade to Pro</a>' +
      '<div class="pro-price">Cascadia Analytics Pro — $19/month. Cancel anytime.</div></div>';
  }
  function gated(title, desc, innerHtml) {
    return isPro() ? innerHtml : proTeaser(title, desc);
  }

  /* ---------- router ---------- */
  const routes = {};
  function route(path, fn) { routes[path] = fn; }
  function nav(path) { location.hash = "#/" + path; }
  function currentRoute() {
    const h = location.hash.replace(/^#\/?/, "");
    const parts = h.split("/");
    return { name: parts[0] || "home", param: decodeURIComponent(parts[1] || "") };
  }
  function render() {
    const r = currentRoute();
    document.querySelectorAll(".topnav button[data-route]").forEach((b) =>
      b.classList.toggle("active", b.dataset.route === r.name));
    syncCoveragePick(r);
    updateProBtn();
    window.scrollTo(0, 0);
    if (r.name === "ticker" && routes.ticker) routes.ticker(r.param);
    else if (routes[r.name]) routes[r.name]();
    else routes.home();
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
      b.onclick = showProModal;
    }
  }
  function showProModal() {
    const root = document.getElementById("modal-root");
    let statusLine;
    if (isPro()) {
      statusLine = "<p style='color:var(--muted);font-size:14px'>" +
        (authUser ? "Signed in as <b>" + esc(authUser.email) + "</b>. " : "") +
        (isAdmin ? "Admin access is active." : "Your Pro subscription is active.") + "</p>";
    } else if (authUser) {
      statusLine = "<p style='color:var(--muted);font-size:14px'>Signed in as <b>" + esc(authUser.email) + "</b>. Subscribe below — your account upgrades automatically after checkout.</p>";
    } else {
      statusLine = "<p style='color:var(--muted);font-size:14px'>Log in or create an account first, then subscribe — your Pro access is tied to your account email.</p>";
    }
    root.innerHTML =
      '<div class="modal-back" id="mb"><div class="modal">' +
      '<div class="modal-logo"><img src="logo-icon.png" alt="Cascadia Analytics"></div>' +
      "<h3>Cascadia Analytics Pro</h3>" +
      "<p style='color:var(--muted);font-size:14px'>Market Internals, options flow, moving averages, the assumption sandbox, earnings revisions, seasonality, Cascadia Scores, screener, exports, earnings history, and client notes. $19/month.</p>" +
      statusLine +
      (isPro()
        ? '<a href="https://billing.stripe.com/p/login/14AbJ16A77FXa180hGbbG00" target="_blank" rel="noopener" class="btn" style="display:block;text-align:center;width:100%;margin-bottom:8px;text-decoration:none;">Manage subscription</a>' +
          '<button class="btn secondary" id="pro-logout" style="width:100%">Log out</button>'
        : (authUser
          ? '<a class="cta-btn" style="display:block;text-align:center;margin:14px 0;" href="' + esc(UPGRADE_URL) + '" target="_blank" rel="noopener">Subscribe — $19/mo</a>'
          : '<button class="btn" id="pro-login" style="width:100%">Log in / Sign up</button>')) +
      '<button class="btn secondary" id="pro-x" style="width:100%;margin-top:8px;">Close</button>' +
      "</div></div>";
    document.getElementById("mb").onclick = (e) => { if (e.target.id === "mb" || e.target.id === "pro-x") root.innerHTML = ""; };
    const li = document.getElementById("pro-login");
    if (li) li.onclick = () => showAuthModal("login");
    const lo = document.getElementById("pro-logout");
    if (lo) lo.onclick = () => doLogout();
  }

  document.getElementById("brand-home").onclick = () => nav("");
  document.querySelectorAll(".topnav button[data-route]").forEach((b) =>
    b.addEventListener("click", () => nav(b.dataset.route === "home" ? "" : b.dataset.route)));
  window.addEventListener("hashchange", render);

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
      ORDER.map((tk) => '<option value="' + esc(tk) + '">' + esc(tk) + " — " + esc(TICKERS[tk].name) + "</option>").join("");
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
    return '<div class="news-row">' +
      '<div>' + (o.badge ? '<span class="tk-badge">' + esc(o.badge) + "</span>" : "") + "</div>" +
      '<div><div class="news-h">' + esc(o.headline) + "</div>" +
      (o.sub ? '<div class="news-sub">' + esc(o.sub) + "</div>" : "") + "</div>" +
      '<div class="news-ts">' + esc(o.ts) + " ·<br>" + esc(o.source) + "</div></div>";
  }
  function newsSection(id, label, title, tags, rowsHtml) {
    return '<section class="news-sec" id="' + id + '">' +
      '<div class="news-sec-head"><div><div class="mono-label">' + esc(label) + "</div>" +
      '<div class="news-sec-title">' + esc(title) + "</div></div>" +
      (tags ? '<div class="news-sec-tags">' + esc(tags) + "</div>" : "") + "</div>" +
      (rowsHtml || '<div class="news-empty">No recent items.</div>') + "</section>";
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
        "<td>" + esc(t.name || tk) + '</td><td class="earn-tbd">TBD</td><td class="earn-tbd">—</td></tr>';
    });
    return h || '<tr><td colspan="4">No upcoming earnings dates.</td></tr>';
  }
  function ratingCls(r) {
    r = String(r || "").toLowerCase();
    if (r === "buy") return "rating-buy";
    if (r === "sell") return "rating-sell";
    return "rating-hold";
  }

  /* ================= HOME ================= */
  route("home", function () {
    const macro = (D.macro_feed || []).slice(0, 14);
    const news = (D.company_news || []).slice(0, 12);
    const panels = D.panels || [];

    let h = '<div class="crumb">MACRO INTELLIGENCE · DCF COVERAGE · MARKET INTERNALS</div>';
    h += '<div class="hero"><div>' +
      '<h1 class="hero-h">The signals moving markets, in one research view.</h1>' +
      "<p class='hero-sub'>Track major macro releases and central-bank commentary, then move directly into company " +
      "valuation work and the market&rsquo;s internal risk signals.</p></div>" +
      '<div class="hero-right">' +
      '<div class="statbox"><div class="mono-label">Coverage</div><div class="statbox-v">' + ORDER.length + " DCF models</div></div>" +
      '<div class="statbox"><div class="mono-label">Macro wire</div><div class="statbox-v">Newest first</div></div>' +
      "</div></div>";
    h += '<div class="hero-btns">' +
      '<button class="btn-gold" id="btn-browse">Browse ticker coverage ↓</button>' +
      '<button class="btn-dark" id="btn-internals">Open Market Internals ↓</button></div>';

    // company news — artifact layout
    h += newsSection("cn-sec", "SINGLE-COMPANY WIRE", "Company News", "Offerings · Regulation · Contracts",
      news.length ? news.map((m) => newsRow({
        badge: m.ticker, headline: m.headline, sub: m.summary, ts: fmtTs(m.timestamp), source: m.source
      })).join("") : "");

    // macro wire — artifact layout
    h += newsSection("macro-sec", "MACRO WIRE", "Macro Wire", "Rates · Inflation · Geopolitics",
      macro.length ? macro.map((m) => newsRow({
        badge: "", headline: m.headline, sub: m.detail, ts: fmtTs(m.timestamp), source: m.source
      })).join("") : "");

    // market internals (Pro)
    h += '<div class="section" id="internals-sec"><div class="section-title">Market Internals</div>' +
      '<div class="section-sub">Breadth, valuation-vs-earnings, rotation, and credit signals.</div>';
    h += gated("Market Internals — Pro",
      "Breadth monitor, Alligator Jaw, theme rotation, and credit-spread-vs-volatility trackers.",
      '<div class="grid-2">' + panels.map((p) => {
        let title = esc(p.name);
        if (/alligator/i.test(p.name)) {
          const isOpen = /jaw\s*open/i.test(p.summary || "");
          title = (isOpen ? "🔴 " : "🟢 ") + title;
        }
        return '<div class="card"><h3>' + title + "</h3>" +
        (p.chart ? '<img class="panel-chart" src="' + esc(p.chart) + '" alt="' + esc(p.name) + '" loading="lazy">' : "") +
        (p.about ? '<div class="panel-about">' + esc(p.about) + "</div>" : "") +
        '<div class="panel-summary">' + esc(p.summary || "") + "</div>" +
        '<div class="panel-asof">As of ' + esc((p.as_of || "").slice(0, 10)) + (p.stale ? " · stale" : "") + "</div></div>";
      }).join("") + "</div>");
    h += "</div>";

    // upcoming earnings
    h += '<div class="section" id="earnings-cal-sec"><div class="section-title">Upcoming Earnings</div>' +
      '<div class="section-sub">Next reported earnings date per covered name, soonest first.</div>' +
      '<div class="table-wrap"><table class="coverage earn-cal"><thead><tr>' +
      "<th>Ticker</th><th>Company</th><th>Earnings Date</th><th>Countdown</th>" +
      "</tr></thead><tbody>" + earningsCalRows() + "</tbody></table></div></div>";

    // coverage table
    h += '<div class="section" id="coverage-sec"><div class="section-title">Coverage</div>' +
      '<div class="section-sub">' + ORDER.length + " names · click a row for full research</div>" +
      '<div class="table-wrap"><table class="coverage"><thead><tr>' +
      "<th>Ticker</th><th>Price</th><th>Bear</th><th>Base</th><th>Bull</th><th>Blended</th><th>Upside</th><th>Rating</th>" +
      "</tr></thead><tbody>";
    h += ORDER.map((tk) => {
      const t = TICKERS[tk];
      return '<tr data-tk="' + esc(tk) + '"><td><span class="ticker-cell">' + esc(tk) + "</span></td>" +
        "<td>" + fmt$(t.price) + "</td><td>" + fmt$(t.bear, 0) + "</td><td>" + fmt$(t.base, 0) +
        "</td><td>" + fmt$(t.bull, 0) + "</td><td>" + fmt$(t.blended, 0) + "</td>" +
        '<td class="' + cls(t.upside_base) + '">' + fmtPct(t.upside_base) + "</td>" +
        '<td class="' + ratingCls(t.rating) + '">' + esc(t.rating || "—") + "</td></tr>";
    }).join("");
    h += "</tbody></table></div></div>";

    app.innerHTML = h;
    app.querySelectorAll("tr[data-tk]").forEach((tr) =>
      tr.addEventListener("click", () => nav("ticker/" + tr.dataset.tk)));
    const bb = document.getElementById("btn-browse");
    if (bb) bb.addEventListener("click", () => document.getElementById("coverage-sec").scrollIntoView({ behavior: "smooth" }));
    const bi = document.getElementById("btn-internals");
    if (bi) bi.addEventListener("click", () => document.getElementById("internals-sec").scrollIntoView({ behavior: "smooth" }));
  });

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
    let h = '<div class="tk-kicker">DCF COVERAGE · SINGLE-NAME RESEARCH</div>';
    h += '<div class="ticker-head"><h1>' + esc(tk) + '</h1><span class="co-name">' + esc(t.name) + "</span>";
    if (score != null && isPro()) h += ' <span class="score-badge ' + scoreClass(score) + '" title="Cascadia Score">' + score + "</span>";
    h += "</div>";
    h += '<div class="price-line"><span class="price-big">' + fmt$(t.price) + "</span>" +
      '<span class="price-date">AS OF ' + esc(t.price_date || "") + "</span>" +
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

    // Sum of the parts (AXON only, Pro-gated)
    if (t.sotp) {
      h += '<div class="section"><div class="section-title">Sum of the Parts</div>';
      h += gated("Sum of the Parts — Pro",
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
    h += gated("Moving Averages — Pro", "Daily, weekly, and monthly trend signals with 10/20/30/50/100/200-period SMAs and EMAs.", maHtml(tk));
    h += "</div>";

    // Options flow (Pro)
    h += '<div class="section"><div class="section-title">Unusual Options Flow</div>';
    h += gated("Options Flow — Pro", "Large, unusual prints over the last 10 trading days with directional read.", optionsHtml(tk));
    h += "</div>";

    // Macro takes (free)
    const takes = (D.ticker_macro || {})[tk] || [];
    if (takes.length) {
      h += '<div class="section"><div class="section-title">Macro Takes</div><div class="card">';
      h += takes.map((m) => '<div class="news-item"><div class="news-headline">' + esc(m.headline) + "</div>" +
        '<div class="panel-summary">' + esc(m.take || "") + "</div>" +
        '<div class="news-meta"><span>' + timeAgo(m.timestamp) + "</span></div></div>").join("");
      h += "</div></div>";
    }

    // Bellwether readthroughs (free)
    const rts = (D.readthroughs || {})[tk] || [];
    if (rts.length) {
      h += '<div class="section"><div class="section-title">Bellwether Read-Throughs</div><div class="card">';
      h += rts.map((r) => '<div class="news-item"><div class="news-headline">' + esc(r.bellwether) + " — " + esc(r.quarter || "") + "</div>" +
        '<div class="panel-summary">' + esc(r.text) + "</div>" +
        '<div class="news-meta"><span>' + esc(r.date || "") + "</span></div></div>").join("");
      h += "</div></div>";
    }

    // Earnings history (Pro)
    h += '<div class="section"><div class="section-title">Earnings History</div>';
    h += gated("Earnings History — Pro", "Four-quarter rolling earnings reviews: verdict, bull/bear cases, KPIs, guidance.", earningsHtml(tk));
    h += "</div>";

    // Client note (Pro)
    h += '<div class="section"><div class="section-title">Client Note</div>';
    h += gated("Client Note — Pro", "Full research note with model detail.",
      t.note && t.note.pdf_exists
        ? '<div class="card"><h3>' + esc(t.name) + " — Research Note</h3>" +
          '<div class="panel-summary">Published ' + esc(t.note.published_date || "") + "</div>" +
          '<div style="margin-top:12px;"><a class="btn" href="' + esc(t.note.pdf) + '" target="_blank" rel="noopener">Open PDF</a></div></div>'
        : '<div class="card"><p style="color:var(--muted)">No client note published for this ticker yet.</p></div>');
    h += "</div>";

    // Assumption sandbox (Pro)
    h += '<div class="section"><div class="section-title">Assumption Sandbox</div>';
    h += gated("Assumption Sandbox — Pro", "Rebuild the valuation with your own assumptions: drag the sliders and watch the implied price move.",
      '<div class="card" id="sandbox-card"></div>');
    h += "</div>";

    app.innerHTML = h;
    drawPriceChart(t);
    drawFcfChart(t);
    if (isPro()) initSandbox(tk, t);
    wireEarningsTabs(tk);
    wireFinTabs(tk);
  });

  function reverseDcfHtml(t) {
    // Simplified reverse-DCF read: implied upside decomposition
    if (t.upside_base == null) return '<p style="color:var(--muted)">Not available.</p>';
    const u = t.upside_base;
    const verdict = u > 25 ? "The market is pricing in a bear-case outcome; the base case implies significant upside." :
      u > 10 ? "The market is pricing in below-base-case growth; moderate upside to the base target." :
      u > -10 ? "The market is pricing in roughly the base case; the stock screens as fairly valued on our numbers." :
      "The market is pricing in a bull-case outcome; limited upside to our targets at the current quote.";
    return '<div class="panel-summary">Base-case upside of <b class="' + cls(u) + '">' + fmtPct(u) + "</b> at " + fmt$(t.price) +
      ". " + verdict + "</div>";
  }

  function railsCompHtml(t) {
    const rc = t.rails_comp;
    if (!rc) return "";
    const tks = rc.tickers;
    function fmtVal(v, format) {
      if (v == null) return "—";
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
      if (v == null) return "—";
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
      '<div class="fin-panel" id="' + uid + '-income">' + stmtTable(f.income, INC_ROWS) + "</div>" +
      '<div class="fin-panel" id="' + uid + '-balance" style="display:none">' + stmtTable(f.balance, BAL_ROWS) + "</div>" +
      '<div class="fin-panel" id="' + uid + '-cashflow" style="display:none">' + stmtTable(f.cashflow, CF_ROWS) + "</div>" +
      '<div class="panel-asof">Source: company filings via Yahoo Finance</div></div>';
    return h;
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
        '<td class="num">' + esc(sg.margin || "—") + "</td></tr>";
    });
    h += '<tr class="sotp-total"><td><div class="sotp-name">Sum of the parts</div></td>' +
      '<td class="num">$' + esc(s.total_revenue_b) + "B</td>" +
      '<td class="num">$' + esc(s.total_ebitda_b) + "B</td>" +
      '<td class="num">—</td></tr>';
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
    let h = "";
    ["daily", "weekly", "monthly"].forEach((tf) => {
      const d = m[tf];
      if (!d) return;
      h += '<div class="card"><h3 style="text-transform:capitalize">' + tf + ' <span class="verdict ' +
        (String(d.signal || "").toLowerCase().includes("buy") ? "bullish" : String(d.signal || "").toLowerCase().includes("sell") ? "bearish" : "neutral") +
        '">' + esc(d.signal || "") + "</span></h3>" +
        '<div class="table-wrap"><table class="coverage ma-table"><thead><tr><th>Period</th><th>SMA</th><th>EMA</th></tr></thead><tbody>' +
        ["10", "20", "30", "50", "100", "200"].map((p) =>
          "<tr><td>" + p + "</td><td>" + fmt$((d.sma || {})[p]) + "</td><td>" + fmt$((d.ema || {})[p]) + "</td></tr>"
        ).join("") + "</tbody></table></div>" +
        '<div class="panel-asof">Price ' + fmt$(d.price) + " · as of " + esc(d.as_of || "") + "</div></div>";
    });
    return h || '<div class="card"><p style="color:var(--muted)">No data.</p></div>';
  }

  function optionsHtml(tk) {
    const prints = (D.ticker_options || {})[tk] || [];
    if (!prints.length) return '<div class="card"><p style="color:var(--muted)">No unusual prints in the last 10 trading days.</p></div>';
    let h = '<div class="card"><div class="table-wrap"><table class="coverage"><thead><tr>' +
      "<th>Date</th><th>Type</th><th>Strike</th><th>Exp</th><th>Premium</th><th>Direction</th></tr></thead><tbody>";
    h += prints.map((p) => {
      const side = String(p.side || p.direction || "");
      const bull = /call|bought|bull/i.test(side);
      const label = bull ? "Bullish" : "Bearish";
      return "<tr><td>" + esc(p.date || "") + "</td><td>" + esc(p.type || p.kind || "") + "</td><td>" +
        esc(p.strike || "") + "</td><td>" + esc(p.expiry || p.exp || "") + "</td><td>" +
        fmtM(p.premium) + '</td><td class="' + (bull ? "pos" : "neg") + '">' + label + "</td></tr>";
    }).join("");
    return h + "</tbody></table></div></div>";
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
    const caseBlock = (title, items, clsName) => {
      if (!items || !items.length) return "";
      return '<div class="card"><h3>' + title + "</h3>" + items.map((c) =>
        '<div style="margin-bottom:12px;"><b>' + esc(c.title || "") + "</b><ul style='margin:6px 0 6px 18px;color:var(--muted);font-size:13.5px;'>" +
        (c.bullets || []).map((b) => "<li>" + esc(b) + "</li>").join("") + "</ul>" +
        (c.watch ? '<div style="font-size:13px;"><b>What to watch:</b> <span style="color:var(--muted)">' + esc(c.watch) + "</span></div>" : "") +
        "</div>").join("") + "</div>";
    };
    h += caseBlock("Bull Case", q.bull_case) + caseBlock("Bear Case", q.bear_case);
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
      horizon = Math.max(5, Math.min(10, n));
    }
    const wacc = t.wacc || 0.10;
    const shares = t.shares_m || 80;

    card.innerHTML =
      '<h3>Interactive Free Cash Flow Simulation</h3>' +
      '<div class="section-sub">Project ' + esc(t.name) + ' unlevered free cash flow from your own baseline. Drag the sliders.</div>' +
      '<div class="sandbox-stats">' +
      '<div><div class="stat-v" id="sb-start">$' + base0 + '</div><div class="stat-l">Starting Base</div></div>' +
      '<div class="stat-c"><div class="stat-v" id="sb-base-t" style="color:var(--base)">—</div><div class="stat-l" id="sb-base-l">Base terminal UFCF</div></div>' +
      '<div class="stat-c"><div class="stat-v" id="sb-bull-t" style="color:var(--bull)">—</div><div class="stat-l" id="sb-bull-l">Bull terminal UFCF</div></div>' +
      "</div>" +
      '<div class="chart-box tall"><canvas id="sandbox-chart"></canvas></div>' +
      '<div style="display:flex;gap:10px;justify-content:center;margin:6px 0;">' +
      '<span style="font-size:13px;color:var(--muted)"><span style="color:var(--bull)">&#9632;</span> Bull</span>' +
      '<span style="font-size:13px;color:var(--muted)"><span style="color:var(--base)">&#9632;</span> Base</span>' +
      '<span style="font-size:13px;color:var(--muted)"><span style="color:var(--bear)">&#9632;</span> Bear</span></div>' +
      '<h3 style="margin-top:18px;">Adjust DCF Model Growth &amp; Margin Assumptions</h3>' +
      '<div class="collapsible-head" id="sb-coll">Parameters <span>&#9650;</span></div>' +
      '<div class="param-grid" id="sb-params">' +
      sbParam("sb-fcf0", "Base UFCF ($M)", base0, 1, 5000, 1, "$" + base0) +
      sbParam("sb-gbear", "Bear UFCF Growth (%)", gBear, -20, 80, 1, gBear + "%") +
      sbParam("sb-gbase", "Base UFCF Growth (%)", gBase, -20, 80, 1, gBase + "%") +
      sbParam("sb-gbull", "Bull UFCF Growth (%)", gBull, -20, 80, 1, gBull + "%") +
      sbParam("sb-horiz", "DCF Horizon (Years)", horizon, 5, 10, 1, horizon + " years") +
      "</div>" +
      '<div class="sandbox-note">Simplified sensitivity model: constant growth, WACC ' + (wacc * 100).toFixed(1) +
      '%, terminal growth 3%. Illustrative only — not the full DCF.</div>' +
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
              label: (c) => " " + c.dataset.label + ": $" + Math.round(c.parsed.y).toLocaleString() + "M"
            }
          } },
        scales: { x: { title: { display: true, text: "Years", color: "#7a8494" }, ticks: { color: "#7a8494" }, grid: { display: false } },
          y: { title: { display: true, text: "UFCF ($M)", color: "#7a8494" }, ticks: { color: "#7a8494" }, grid: { color: "#333f52" } } } }
    });

    function update() {
      const f0 = +els.fcf0.value, gb = +els.gbear.value / 100, gn = +els.gbase.value / 100,
        gu = +els.gbull.value / 100, hz = +els.horiz.value;
      document.querySelector('#sb-fcf0').closest(".param").querySelector(".pval").textContent = "$" + f0;
      document.querySelector('#sb-gbear').closest(".param").querySelector(".pval").textContent = els.gbear.value + "%";
      document.querySelector('#sb-gbase').closest(".param").querySelector(".pval").textContent = els.gbase.value + "%";
      document.querySelector('#sb-gbull').closest(".param").querySelector(".pval").textContent = els.gbull.value + "%";
      document.querySelector('#sb-horiz').closest(".param").querySelector(".pval").textContent = hz + " years";
      const labels = [], bull = [], base = [], bear = [];
      for (let y = 0; y <= hz; y++) {
        labels.push(y);
        bull.push(f0 * Math.pow(1 + gu, y));
        base.push(f0 * Math.pow(1 + gn, y));
        bear.push(f0 * Math.pow(1 + gb, y));
      }
      sandboxChart.data.labels = labels;
      sandboxChart.data.datasets[0].data = bull;
      sandboxChart.data.datasets[1].data = base;
      sandboxChart.data.datasets[2].data = bear;
      sandboxChart.update();
      $("sb-start").textContent = "$" + f0;
      $("sb-base-t").textContent = "$" + Math.round(base[hz]);
      $("sb-bull-t").textContent = "$" + Math.round(bull[hz]);
      $("sb-base-l").textContent = "Base Yr-" + hz + " UFCF";
      $("sb-bull-l").textContent = "Bull Yr-" + hz + " UFCF";
      // implied value from base case
      let pv = 0;
      for (let y = 1; y <= hz; y++) pv += base[y] / Math.pow(1 + wacc, y);
      const tv = (base[hz] * 1.03) / (wacc - 0.03) / Math.pow(1 + wacc, hz);
      const implied = (pv + tv) / shares;
      let iv = document.getElementById("sb-implied");
      if (!iv) {
        const d = document.createElement("div");
        d.id = "sb-implied";
        d.style.cssText = "margin-top:12px;font-size:14px;color:var(--muted)";
        card.appendChild(d); iv = d;
      }
      iv.innerHTML = "Implied base-case value at these assumptions: <b style='color:var(--text)'>" + fmt$(implied) +
        "</b> <span class='" + cls(t.price ? implied / t.price - 1 : 0) + "'>(" + fmtPct(t.price ? (implied / t.price - 1) * 100 : 0) + " vs " + fmt$(t.price) + ")</span>";
    }
    Object.values(els).forEach((el) => el.addEventListener("input", update));
    $("sb-coll").addEventListener("click", () => {
      const p = $("sb-params"), open = p.style.display !== "none";
      p.style.display = open ? "none" : "";
      $("sb-coll").querySelector("span").innerHTML = open ? "&#9660;" : "&#9650;";
    });
    $("sb-csv").addEventListener("click", () => {
      const f0 = +els.fcf0.value, gb = +els.gbear.value / 100, gn = +els.gbase.value / 100,
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
      '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"></div>';
  }
  function dl(name, content, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ================= SCREENER (Pro) ================= */
  route("screener", function () {
    if (!isPro()) {
      app.innerHTML = '<div class="section"><div class="section-title">Premium Screener</div>' +
        proTeaser("Screener — Pro", "Filter all covered names by Cascadia Score, DCF upside, rating, and price range. Export results to CSV.") + "</div>";
      return;
    }
    let h = '<div class="section"><div class="section-title">Premium Screener</div>' +
      '<div class="section-sub">Filter the coverage universe. Methodology: Cascadia Score v1 = 50 + base-case upside % (clamped 1–100).</div>';
    h += '<div class="card"><div class="filter-bar">' +
      '<select id="f-rating"><option value="">Any rating</option><option>Buy</option><option>Hold</option><option>Sell</option></select>' +
      '<select id="f-score"><option value="">Any score</option><option value="65">Score 65+</option><option value="50">Score 50+</option><option value="40">Score 40+</option></select>' +
      '<select id="f-upside"><option value="">Any upside</option><option value="20">Upside 20%+</option><option value="0">Positive upside</option><option value="-20">Upside &gt; -20%</option></select>' +
      '<button class="btn secondary" id="f-export">Export CSV</button>' +
      "</div>" +
      '<div class="table-wrap"><table class="coverage"><thead><tr>' +
      "<th>Ticker</th><th>Score</th><th>Price</th><th>Base</th><th>Upside</th><th>Rating</th>" +
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
      body.innerHTML = rows().map((r) =>
        '<tr data-tk="' + esc(r.tk) + '"><td><span class="ticker-cell">' + esc(r.tk) + "</span></td>" +
        "<td>" + (r.s != null ? '<span class="score-badge ' + scoreClass(r.s) + '" style="width:36px;height:36px;font-size:13px;">' + r.s + "</span>" : "—") + "</td>" +
        "<td>" + fmt$(r.t.price) + "</td><td>" + fmt$(r.t.base, 0) + "</td>" +
        '<td class="' + cls(r.t.upside_base) + '">' + fmtPct(r.t.upside_base) + "</td>" +
        '<td class="' + ratingCls(r.t.rating) + '">' + esc(r.t.rating || "—") + "</td></tr>").join("") ||
        '<tr><td colspan="6" style="text-align:center;color:var(--muted)">No matches.</td></tr>';
      body.querySelectorAll("tr[data-tk]").forEach((tr) => tr.addEventListener("click", () => nav("ticker/" + tr.dataset.tk)));
    }
    ["f-rating", "f-score", "f-upside"].forEach((id) => document.getElementById(id).addEventListener("change", draw));
    document.getElementById("f-export").addEventListener("click", () => {
      const csv = "ticker,name,score,price,base,upside_pct,rating\n" + rows().map((r) =>
        [r.tk, '"' + (r.t.name || "").replace(/"/g, "") + '"', r.s || "", r.t.price || "", r.t.base || "", r.t.upside_base || "", r.t.rating || ""].join(",")).join("\n");
      dl("cascadia_screener.csv", csv, "text/csv");
    });
    draw();
  });

  window.CA = { nav, isPro, cascadiaScore };

  // Initial load: render immediately from cache, then verify auth against Supabase.
  // If returning from Stripe checkout, force a fresh Pro status check.
  initAuthListener();
  (function init() {
    setSnapshot();
    populateCoverage();
    const params = new URLSearchParams(location.search);
    if (params.get("checkout") === "success") {
      // Returning from Stripe — clear the param and verify subscription status
      history.replaceState(null, "", location.pathname + location.hash);
    }
    render();       // fast first paint from localStorage cache
    refreshAuth();  // server-verified Pro status, re-renders when resolved
  })();
})();
