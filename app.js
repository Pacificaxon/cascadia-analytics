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
  const isPro = () => { try { return localStorage.getItem(PRO_KEY) === "1"; } catch (e) { return false; } };
  const setPro = (v) => { try { v ? localStorage.setItem(PRO_KEY, "1") : localStorage.removeItem(PRO_KEY); } catch (e) {} };

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
      '<div class="lock-icon">&#128274;</div>' +
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
    document.querySelectorAll("#main-nav button[data-route]").forEach((b) =>
      b.classList.toggle("active", b.dataset.route === r.name));
    updateProBtn();
    window.scrollTo(0, 0);
    if (r.name === "ticker" && routes.ticker) routes.ticker(r.param);
    else if (routes[r.name]) routes[r.name]();
    else routes.home();
  }
  function updateProBtn() {
    const b = document.getElementById("pro-btn");
    if (isPro()) { b.textContent = "Pro Active"; b.classList.add("unlocked"); b.onclick = () => { if (confirm("Sign out of Pro on this device?")) { setPro(false); render(); } }; }
    else { b.textContent = "Go Pro"; b.classList.remove("unlocked"); b.onclick = showProModal; }
  }
  function showProModal() {
    const root = document.getElementById("modal-root");
    root.innerHTML =
      '<div class="modal-back" id="mb"><div class="modal">' +
      "<h3>Cascadia Analytics Pro</h3>" +
      "<p style='color:var(--muted);font-size:14px'>Market Internals, options flow, moving averages, the assumption sandbox, earnings revisions, seasonality, Cascadia Scores, screener, exports, earnings history, and client notes. $19/month.</p>" +
      '<a class="cta-btn" style="display:block;text-align:center;margin:14px 0;" href="' + esc(UPGRADE_URL) + '" target="_blank" rel="noopener">Subscribe — $19/mo</a>' +
      '<div style="font-size:13px;color:var(--muted);margin-bottom:6px;">Already subscribed? Enter your access code:</div>' +
      '<input id="pro-code" placeholder="Access code" autocomplete="off">' +
      '<div class="err" id="pro-err"></div>' +
      '<button class="btn" id="pro-go" style="width:100%">Unlock</button>' +
      '<button class="btn secondary" id="pro-x" style="width:100%;margin-top:8px;">Close</button>' +
      "</div></div>";
    document.getElementById("mb").onclick = (e) => { if (e.target.id === "mb" || e.target.id === "pro-x") root.innerHTML = ""; };
    document.getElementById("pro-go").onclick = () => {
      const v = document.getElementById("pro-code").value.trim();
      if (v.length >= 4) { setPro(true); root.innerHTML = ""; render(); }
      else document.getElementById("pro-err").textContent = "Enter the code from your subscription email.";
    };
  }

  document.getElementById("brand-home").onclick = () => nav("");
  document.querySelectorAll("#main-nav button[data-route]").forEach((b) =>
    b.addEventListener("click", () => nav(b.dataset.route === "home" ? "" : b.dataset.route)));
  window.addEventListener("hashchange", render);

  /* ---------- shared bits ---------- */
  function tickerLink(tk) { return '<a href="#/ticker/' + esc(tk) + '">' + esc(tk) + "</a>"; }
  function ratingCls(r) {
    r = String(r || "").toLowerCase();
    if (r === "buy") return "rating-buy";
    if (r === "sell") return "rating-sell";
    return "rating-hold";
  }

  /* ================= HOME ================= */
  route("home", function () {
    const macro = (D.macro_feed || []).slice(0, 12);
    const news = (D.company_news || []).slice(0, 10);
    const panels = D.panels || [];

    let h = '<div class="home-hero"><h1>Equity Research</h1>' +
      "<p>Institutional-grade DCF valuations, market internals, and proprietary signals across " +
      ORDER.length + " covered names.</p></div>";
    h += '<div class="asof">Data as of ' + esc(D.generated_at ? D.generated_at.slice(0, 10) : "") + "</div>";

    // ticker quick select
    h += '<div class="card"><h3>Research by Ticker</h3>' +
      '<select class="ticker-select" id="ticker-pick" onchange="if(this.value)location.hash=\'#/ticker/\'+this.value">' +
      '<option value="">Select a ticker…</option>' +
      ORDER.map((tk) => '<option value="' + esc(tk) + '">' + esc(tk) + " — " + esc(TICKERS[tk].name) + "</option>").join("") +
      "</select></div>";

    // macro news
    h += '<div class="section"><div class="section-title">Macro Wire</div>' +
      '<div class="section-sub">Rates, inflation, growth, and geopolitics driving the tape.</div><div class="card">';
    h += macro.map((m) =>
      '<div class="news-item"><div class="news-headline">' + esc(m.headline) + "</div>" +
      '<div class="news-meta"><span>' + esc(m.source || "") + "</span><span>" + timeAgo(m.timestamp) + "</span></div></div>"
    ).join("") + "</div></div>";

    // company news
    h += '<div class="section"><div class="section-title">Company News</div>' +
      '<div class="section-sub">Material developments at widely-followed companies.</div><div class="card">';
    h += news.length ? news.map((m) =>
      '<div class="news-item"><div><span class="news-tag">' + esc(m.ticker || "") + "</span>" +
      '<span class="news-headline">' + esc(m.headline) + "</span></div>" +
      '<div class="news-meta"><span>' + esc(m.source || "") + "</span><span>" + timeAgo(m.timestamp) + "</span></div></div>"
    ).join("") : '<p style="color:var(--muted)">No recent items.</p>';
    h += "</div></div>";

    // market internals (Pro)
    h += '<div class="section"><div class="section-title">Market Internals</div>' +
      '<div class="section-sub">Breadth, valuation-vs-earnings, rotation, and credit signals.</div>';
    h += gated("Market Internals — Pro",
      "Breadth monitor, Alligator Jaw, theme rotation, and credit-spread-vs-volatility trackers.",
      '<div class="grid-2">' + panels.map((p) =>
        '<div class="card"><h3>' + esc(p.name) + "</h3>" +
        (p.chart ? '<img class="panel-chart" src="' + esc(p.chart) + '" alt="' + esc(p.name) + '" loading="lazy">' : "") +
        '<div class="panel-summary">' + esc(p.summary || "") + "</div>" +
        '<div class="panel-asof">As of ' + esc((p.as_of || "").slice(0, 10)) + (p.stale ? " · stale" : "") + "</div></div>"
      ).join("") + "</div>");
    h += "</div>";

    // coverage table
    h += '<div class="section"><div class="section-title">Coverage</div>' +
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
    let h = '<div class="ticker-head"><h1>' + esc(tk) + '</h1><span class="co-name">' + esc(t.name) + "</span>";
    if (score != null && isPro()) h += ' <span class="score-badge ' + scoreClass(score) + '" title="Cascadia Score">' + score + "</span>";
    h += "</div>";
    h += '<div class="price-line"><span class="price-big">' + fmt$(t.price) + "</span>" +
      '<span style="color:var(--muted);font-size:13px;">as of ' + esc(t.price_date || "") + "</span>" +
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
    if (t.wacc) h += '<div style="color:var(--muted);font-size:13px;margin-bottom:14px;">WACC ' + (t.wacc * 100).toFixed(2) + "%" +
      (t.shares_m ? " · " + t.shares_m.toFixed(1) + "M diluted shares" : "") + "</div>";

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
        '<div class="table-wrap"><table class="coverage"><thead><tr><th>Period</th><th>SMA</th><th>EMA</th></tr></thead><tbody>' +
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
      "<th>Date</th><th>Type</th><th>Strike</th><th>Exp</th><th>Premium</th><th>Side</th></tr></thead><tbody>";
    h += prints.map((p) => {
      const side = String(p.side || p.direction || "");
      const bull = /call|bought|bull/i.test(side);
      return "<tr><td>" + esc(p.date || "") + "</td><td>" + esc(p.type || p.kind || "") + "</td><td>" +
        esc(p.strike || "") + "</td><td>" + esc(p.expiry || p.exp || "") + "</td><td>" +
        fmtM(p.premium) + '</td><td class="' + (bull ? "pos" : "neg") + '">' + esc(side || "—") + "</td></tr>";
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

  /* ---------- charts ---------- */
  function drawPriceChart(t) {
    const el = document.getElementById("price-chart");
    if (!el || !t.history || !t.history.length) return;
    const pts = t.history.filter((_, i) => i % 4 === 0);
    priceChart = new Chart(el, {
      type: "line",
      data: { labels: pts.map((p) => new Date(p[0]).getFullYear() + "-" + (new Date(p[0]).getMonth() + 1)),
        datasets: [{ data: pts.map((p) => p[1]), borderColor: "#4a9eff", borderWidth: 2, pointRadius: 0, fill: true,
          backgroundColor: "rgba(74,158,255,0.08)", tension: 0.2 }] },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmt$(c.parsed.y) } } },
        scales: { x: { ticks: { color: "#5c6a82", maxTicksLimit: 8 }, grid: { display: false } },
          y: { ticks: { color: "#5c6a82", callback: (v) => "$" + v }, grid: { color: "#162033" } } } }
    });
  }
  function drawFcfChart(t) {
    const el = document.getElementById("fcf-chart");
    const fcf = t.fcf || {};
    if (!el || !fcf.base) return;
    const years = fcf.base.years || [];
    const ds = [];
    const cfg = [["bear", "#facc15", "Bear"], ["base", "#4ade80", "Base"], ["bull", "#7fb3ff", "Bull"]];
    cfg.forEach(([k, color, lbl]) => {
      if (fcf[k] && fcf[k].fcf_m) ds.push({ label: lbl, data: fcf[k].fcf_m, backgroundColor: color, borderRadius: 3 });
    });
    fcfChart = new Chart(el, {
      type: "bar",
      data: { labels: years, datasets: ds },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: "#8b98ad" } },
          tooltip: { callbacks: { label: (c) => " " + c.dataset.label + ": " + fmtM(c.parsed.y) } } },
        scales: { x: { ticks: { color: "#5c6a82" }, grid: { display: false } },
          y: { ticks: { color: "#5c6a82", callback: (v) => "$" + v + "M" }, grid: { color: "#162033" } } } }
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
        { label: "Bull", borderColor: "#7fb3ff", backgroundColor: "rgba(127,179,255,0.12)", fill: true, tension: 0.3, pointRadius: 0, data: [] },
        { label: "Base", borderColor: "#4ade80", backgroundColor: "rgba(74,222,128,0.12)", fill: true, tension: 0.3, pointRadius: 0, data: [] },
        { label: "Bear", borderColor: "#facc15", backgroundColor: "rgba(250,204,21,0.10)", fill: true, tension: 0.3, pointRadius: 0, data: [] }
      ]},
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => " " + c.dataset.label + ": $" + Math.round(c.parsed.y) + "M" } } },
        scales: { x: { title: { display: true, text: "Years", color: "#5c6a82" }, ticks: { color: "#5c6a82" }, grid: { display: false } },
          y: { title: { display: true, text: "UFCF ($M)", color: "#5c6a82" }, ticks: { color: "#5c6a82" }, grid: { color: "#162033" } } } }
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
        .filter((r) => (!fr || r.t.rating === fr) && (r.s == null || r.s >= fs) && ((r.t.upside_base || -999) >= fu))
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
  render();
})();
