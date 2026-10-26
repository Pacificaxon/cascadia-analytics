#!/usr/bin/env python3
"""Build script for the Cascadia Analytics static site.

Reads all JSON data sources, merges ticker data, copies chart images,
and generates data.js (embedded site data).

Usage: python3 build.py
Output: data.js, charts/*.png in this directory.
"""
import json
import os
import shutil
import html

HERE = os.path.dirname(os.path.abspath(__file__))
WS = os.path.expanduser("~/workspace")
MR = os.path.join(WS, "macro-relevance")
FG = os.path.join(WS, "fungraph-data")
YF = os.path.join(WS, "your_files")


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def esc(s):
    return html.escape("" if s is None else str(s), quote=True)


def scorecard_score(tk):
    """Composite 0-100 score from the investment scorecard data JSON, or None.
    Reads the stored composite_score written by generate_scorecard.py so the
    site matches the PDF exactly."""
    p = os.path.join(WS, "scorecard", f"scorecard_data_{tk}.json")
    if not os.path.exists(p):
        return None
    try:
        d = json.load(open(p))
        s = d.get("composite_score")
        if s is not None:
            return int(s)
        # Fallback: compute from pillars (older JSONs without stored score)
        pillars = d.get("pillars", [])
        weights = [0.20, 0.20, 0.20, 0.25, 0.15]
        active = [(pl, w) for pl, w in zip(pillars, weights) if pl.get("score") is not None]
        if not active:
            return None
        total_w = sum(w for _, w in active)
        return round(sum(pl["score"] * w for pl, w in active) / total_w)
    except Exception:
        return None


# AXON sum-of-the-parts: five-segment bottom-up build (2036E).
# Source: AXON client note "Full sum of the parts" (30 Sep 2026).
AXON_SOTP = {
    "as_of": "2036E",
    "segments": [
        {"name": "Dedrone (counter-drone)", "revenue_b": "3.4–3.8", "ebitda_b": "1.02–1.33",
         "margin": "30–35%",
         "note": "Counter-UAS via the DedroneTracker AI platform; exiting 2026 at ~$450M run-rate."},
        {"name": "Mass surveillance (RTCC + ALPR)", "revenue_b": "~1.28", "ebitda_b": "0.45–0.49",
         "margin": "35–38%",
         "note": "Fusus RTCC + Fleet 3 ALPR + Axon Outposts; Flock-backlash haircut priced in."},
        {"name": "Evidence.com & Cloud SaaS", "revenue_b": "18.5", "ebitda_b": "7.40–8.30",
         "margin": "40–45%",
         "note": "The profit engine: Evidence.com, Draft One, AI Era Plan."},
        {"name": "TASER (Weapons & Cartridges)", "revenue_b": "4.0", "ebitda_b": "1.20–1.40",
         "margin": "30–35%",
         "note": "Legacy monopoly; razor-and-blades cartridge model."},
        {"name": "Body Cameras & Sensors", "revenue_b": "2.3", "ebitda_b": "0.35–0.46",
         "margin": "15–20%",
         "note": "Loss-leader hardware funneling footage into Evidence.com."},
    ],
    "total_revenue_b": "29.5–29.9",
    "total_ebitda_b": "10.4–12.0",
}


def _cascadia_score(tk, upside_base, ticker_ma, earnings_history, ticker_options):
    """Cascadia Score, computed at build time (replication-risk remediation
    2026-10-23, finding C1). This is an exact replica of the client-side
    computation it replaces, so the published score for every ticker is
    unchanged; the shipped bundle now carries only the resulting score.
    JS Math.round rounds halves toward +infinity, hence floor(x + 0.5)."""
    import math as _math
    total = 0.0
    weight = 0.0
    if upside_base is not None:
        v = max(0.0, min(100.0, 50.0 + float(upside_base) * 0.8))
        total += v * 0.40
        weight += 0.40
    ma = (ticker_ma or {}).get(tk) or {}
    sig = ((ma.get("daily") or {}).get("signal") or "")
    if sig:
        s = str(sig).lower()
        if "strong buy" in s:
            m = 90
        elif "strong sell" in s:
            m = 10
        elif "buy" in s:
            m = 70
        elif "sell" in s:
            m = 30
        else:
            m = 50
        total += m * 0.30
        weight += 0.30
    eh = (earnings_history or {}).get(tk) or []
    if eh and isinstance(eh[0], dict) and eh[0].get("verdict"):
        lab = str((eh[0].get("verdict") or {}).get("label") or "").lower()
        e = 80 if "bullish" in lab else 20 if "bearish" in lab else 50
        total += e * 0.20
        weight += 0.20
    opt = (ticker_options or {}).get(tk) or []
    if isinstance(opt, list) and opt:
        bull = bear = 0
        for o in opt:
            if not isinstance(o, dict):
                continue
            d = str(o.get("sentiment") or o.get("direction") or "").lower()
            if "bull" in d:
                bull += 1
            elif "bear" in d:
                bear += 1
        if bull + bear > 0:
            total += (50.0 + (bull - bear) / (bull + bear) * 50.0) * 0.10
            weight += 0.10
    if not weight:
        return None
    return max(1, min(100, int(_math.floor(total / weight + 0.5))))


def main():
    # --- Load sources ---
    data_json = load(os.path.join(FG, "data.json"))
    manifest = load(os.path.join(YF, "client-notes-manifest.json"))
    macro_feed = load(os.path.join(MR, "macro_feed.json"))
    company_news = load(os.path.join(MR, "company_news.json"))
    sa_news = load(os.path.join(MR, "sa_news.json"))
    ticker_macro = load(os.path.join(MR, "ticker_macro.json"))
    ticker_indicator_takes = load(os.path.join(MR, "ticker_indicator_takes.json"))
    internals = load(os.path.join(MR, "market_internals.json"))
    ticker_ma = load(os.path.join(MR, "ticker_ma.json"))
    try:
        ticker_ohlcv = load(os.path.join(MR, "ticker_ohlcv.json"))
    except FileNotFoundError:
        ticker_ohlcv = {}
    try:
        vol_div_history = load(os.path.join(MR, "vol_divergence_history.json"))
    except FileNotFoundError:
        vol_div_history = {}
    try:
        jaw_history = load(os.path.join(MR, "alligator_jaw_history.json"))
    except FileNotFoundError:
        jaw_history = {}
    try:
        theme_rot_history = load(os.path.join(MR, "theme_rotation_history.json"))
    except FileNotFoundError:
        theme_rot_history = {}
    try:
        smcap_history = load(os.path.join(MR, "small_midcap_history.json"))
    except FileNotFoundError:
        smcap_history = {}
    try:
        credit_vol_history = load(os.path.join(MR, "credit_vol_history.json"))
    except FileNotFoundError:
        credit_vol_history = {}
    try:
        breadth_history = load(os.path.join(MR, "breadth_history.json"))
    except FileNotFoundError:
        breadth_history = {}
    try:
        rsi_cd_history = load(os.path.join(MR, "rsi_cyclical_defensive_history.json"))
    except FileNotFoundError:
        rsi_cd_history = {}
    try:
        gex_data = load(os.path.join(MR, "gex_history.json"))
    except FileNotFoundError:
        gex_data = {}
    try:
        fed_funds = load(os.path.join(MR, "fed_funds.json"))
    except FileNotFoundError:
        fed_funds = {}
    try:
        breakeven_inflation = load(os.path.join(MR, "breakeven_inflation.json"))
    except FileNotFoundError:
        breakeven_inflation = {}
    try:
        implied_erp = load(os.path.join(MR, "implied_erp.json"))
    except FileNotFoundError:
        implied_erp = {}
    # Replication-risk remediation (2026-10-23, finding H3): the ERP value is
    # a published output; how it is produced is not. Ship an outputs-level
    # source label only.
    if isinstance(implied_erp, dict) and implied_erp:
        implied_erp["source"] = "Cascadia Analytics market-implied estimate, updated daily"
    try:
        ceo_compensation = load(os.path.join(MR, "ceo_compensation.json"))
    except FileNotFoundError:
        ceo_compensation = {}
    try:
        memos = load(os.path.join(HERE, "memos.json"))
    except FileNotFoundError:
        memos = {"memos": []}
    try:
        geopolitics_watchlist = load(os.path.join(MR, "geopolitics_watchlist.json"))
    except FileNotFoundError:
        geopolitics_watchlist = {"updated": "", "areas": []}
    try:
        market_analysis_report = load(os.path.join(MR, "market_analysis_report.json"))
    except FileNotFoundError:
        market_analysis_report = {}
    try:
        leadership = load(os.path.join(MR, "leadership.json"))
    except FileNotFoundError:
        leadership = {}
    try:
        ticker_gex = load(os.path.join(MR, "ticker_gex.json"))
    except FileNotFoundError:
        ticker_gex = {}
    try:
        opex_data = load(os.path.join(MR, "opex.json"))
    except FileNotFoundError:
        opex_data = {}
    try:
        skew_data = load(os.path.join(MR, "skew_history.json"))
    except FileNotFoundError:
        skew_data = {}
    try:
        ticker_skew = load(os.path.join(MR, "ticker_skew.json"))
    except FileNotFoundError:
        ticker_skew = {}
    try:
        ticker_insider = load(os.path.join(MR, "ticker_insider.json"))
    except FileNotFoundError:
        ticker_insider = {}
    try:
        ticker_short_interest = load(os.path.join(MR, "ticker_short_interest.json"))
    except FileNotFoundError:
        ticker_short_interest = {}
    # Keep the site-root copy in sync with the collector output. The ticker
    # page no longer fetches it (it reads the bundle), but the demo page and
    # any static fallback still do, and the copy previously went stale and
    # hid newer coverage names (LITE, SE) from the short interest panel.
    if ticker_short_interest:
        with open(os.path.join(HERE, "ticker_short_interest.json"), "w") as _sif:
            json.dump(ticker_short_interest, _sif, indent=1)
    try:
        dark_pool = load(os.path.join(MR, "dark_pool.json"))
    except FileNotFoundError:
        dark_pool = {}
    try:
        liquidity = load(os.path.join(MR, "liquidity.json"))
    except FileNotFoundError:
        liquidity = {}
    try:
        ticker_13f = load(os.path.join(MR, "ticker_13f.json"))
    except FileNotFoundError:
        ticker_13f = {}
    try:
        ticker_trends = load(os.path.join(MR, "ticker_trends.json"))
    except FileNotFoundError:
        ticker_trends = {}
    try:
        aaii_sentiment = load(os.path.join(MR, "aaii_sentiment.json"))
    except FileNotFoundError:
        aaii_sentiment = {}
    try:
        cot_data = load(os.path.join(MR, "cot_history.json"))
    except FileNotFoundError:
        cot_data = {}
    try:
        macro_indicators = load(os.path.join(MR, "macro_indicators.json"))
    except FileNotFoundError:
        macro_indicators = {}
    try:
        technical_analysis = load(os.path.join(MR, "technical_analysis.json"))
    except FileNotFoundError:
        technical_analysis = {}
    try:
        premarket_report = load(os.path.join(MR, "premarket_report.json"))
    except FileNotFoundError:
        premarket_report = {}
    try:
        fear_index = load(os.path.join(MR, "fear_index.json"))
        # Sanitize: component weights stay private, strip from client payload
        _inds = fear_index.get("indicators")
        if isinstance(_inds, dict):
            for _k, _v in _inds.items():
                if isinstance(_v, dict):
                    _v.pop("weight", None)
    except FileNotFoundError:
        fear_index = {}
    try:
        rotation_analysis = load(os.path.join(MR, "rotation_analysis.json"))
    except FileNotFoundError:
        rotation_analysis = {}
    try:
        screener_data = load(os.path.join(MR, "screener_data.json"))
    except FileNotFoundError:
        screener_data = {}
    try:
        minervini_data = load(os.path.join(MR, "minervini_data.json"))
    except FileNotFoundError:
        minervini_data = {}
    ticker_options = load(os.path.join(MR, "ticker_options.json"))
    try:
        flow_scoreboard = load(os.path.join(MR, "flow_scoreboard.json"))
    except FileNotFoundError:
        flow_scoreboard = {}
    try:
        axon_digest_flow = load(os.path.join(MR, "axon_digest_flow.json"))
    except FileNotFoundError:
        axon_digest_flow = {}
    bellwethers = load(os.path.join(MR, "bellwether_earnings.json"))
    try:
        earnings_history = load(os.path.join(MR, "earnings_history.json"))
    except FileNotFoundError:
        earnings_history = {}
    try:
        earnings_revisions = load(os.path.join(MR, "earnings_revisions.json"))
    except FileNotFoundError:
        earnings_revisions = {}
    try:
        earnings_estimates = load(os.path.join(MR, "earnings_estimates.json"))
    except FileNotFoundError:
        earnings_estimates = {}
    try:
        fcf_backfill = load(os.path.join(HERE, "fcf_backfill.json"))
    except FileNotFoundError:
        fcf_backfill = {}
    try:
        financials = load(os.path.join(HERE, "financials.json"))
    except FileNotFoundError:
        financials = {}
    # --- Income charts: 5 annual + 5 quarterly revenue/net income/margin per ticker ---
    try:
        income_charts = load(os.path.join(MR, "income_charts.json"))
    except FileNotFoundError:
        income_charts = {}
    # --- Valuation multiples: market cap, EV, TTM + forward multiples per ticker (free) ---
    try:
        val_multiples = load(os.path.join(MR, "valuation_multiples.json"))
    except FileNotFoundError:
        val_multiples = {}
    # --- Earnings calendar: next earnings date per ticker (YYYY-MM-DD).
    # NOTE: when a new ticker is added to coverage, add its next earnings date here.
    # Dates verified 2026-10-14 via Nasdaq calendar API + Zacks/MarketBeat/Finviz/company IR.
    try:
        earnings_cal_raw = load(os.path.join(HERE, "earnings_calendar.json"))
    except FileNotFoundError:
        earnings_cal_raw = {}
    earnings_calendar = {k: v for k, v in earnings_cal_raw.items() if not k.startswith("_")}

    # --- Merge tickers: manifest is authoritative for targets (31), data.json for detail (11) ---
    tickers = {}
    sotp_map = {}
    # The score's flow factor reads the same options list the client used:
    # the bundle's per-ticker list, truncated to the latest 10 prints.
    _score_options = {k: (v[:10] if isinstance(v, list) else v)
                      for k, v in (ticker_options or {}).items()}
    detail = data_json.get("tickers", {})
    for tk in sorted(manifest.keys()):
        m = manifest[tk]
        d = detail.get(tk, {})
        scenarios = d.get("scenarios", {})
        t = {
            "ticker": tk,
            "name": d.get("name", tk),
            "price": d.get("price", m.get("spot_price")),
            "price_date": d.get("price_date", m.get("price_date")),
            "currency": d.get("currency", "USD"),
            "bear": m.get("bear"),
            "base": m.get("base"),
            "bull": m.get("bull"),
            "blended": m.get("blended"),
            "rating": m.get("rating"),
            "wacc": m.get("wacc"),
            "upside_base": round((m["base"] / m["spot_price"] - 1) * 100, 1) if m.get("base") and m.get("spot_price") else None,
            "history": d.get("history", []),
            "fcf": {},
            "shares_m": None,
            "note": {
                "published_date": m.get("published_date"),
                # The manifest flag alone misses reports whose PDF is on disk
                # but whose manifest entry never got pdf_exists set; check the
                # repo like the scorecard block below does.
                "pdf": ("notes/" + tk + ".pdf") if (m.get("pdf_exists") or os.path.exists(os.path.join(HERE, "notes", tk + ".pdf"))) else None,
                "pdf_exists": bool(m.get("pdf_exists")) or os.path.exists(os.path.join(HERE, "notes", tk + ".pdf")),
            },
            "scorecard": {
                "pdf": ("scorecards/" + tk + ".pdf") if os.path.exists(os.path.join(HERE, "scorecards", tk + ".pdf")) else None,
                "pdf_exists": os.path.exists(os.path.join(HERE, "scorecards", tk + ".pdf")),
                "score": scorecard_score(tk),
            },
        }
        for sc in ("bear", "base", "bull"):
            if sc in scenarios:
                s = scenarios[sc]
                t["fcf"][sc] = {"years": s.get("years", []), "fcf_m": s.get("fcf_m", [])}
                if t["shares_m"] is None and s.get("shares_m"):
                    t["shares_m"] = s["shares_m"]
                t["wacc"] = t["wacc"] or s.get("wacc")
        # Fair value paths (free): the extractor's per-scenario [year, value]
        # series for the DCF valuation path chart. Each path is anchored at
        # the scenario target on the model date and rolls forward to the
        # horizon-year fair value, so the series visualizes the same free
        # targets the hero cards show. The raw model inputs the paths derive
        # from (fcf_m, wacc, shares_m) stay Pro-only; only the derived series
        # ships free. Rebuilt from data.json on every build, so a workbook
        # target change flows into the chart on the next daily refresh.
        fv_paths = {}
        for sc in ("bear", "base", "bull"):
            p = scenarios.get(sc, {}).get("path")
            if p and len(p) >= 2:
                # Re-anchor (2026-10-23, C2 remainder, Justin-approved):
                # the series opens with the model-date point at the
                # scenario target, per the documented intent of this chart
                # and of the note generator's fair-value table. The
                # extractor's opening point drifts ~0.8% from the published
                # manifest vintage as live workbook inputs move, which both
                # misstated the chart against the page's own printed targets
                # and failed the note generator's fair-value-path gate. The
                # published manifest target is authoritative; only the
                # opening anchor moves to it, the rest of the path (and every
                # published target and rating) is untouched.
                anchor = m.get(sc)
                if isinstance(anchor, (int, float)):
                    p = [[p[0][0], anchor]] + [list(pt) for pt in p[1:]]
                fv_paths[sc] = p
        if fv_paths:
            t["fv_paths"] = fv_paths
        # Backfill FCF for tickers missing it from data.json scenarios
        if tk in fcf_backfill and not t["fcf"].get("base", {}).get("fcf_m"):
            for sc in ("bear", "base", "bull"):
                if sc in fcf_backfill[tk]:
                    t["fcf"][sc] = {
                        "years": fcf_backfill[tk][sc]["years"],
                        "fcf_m": fcf_backfill[tk][sc]["fcf_m"],
                    }
        # Backfill shares outstanding (millions) from market data — never hardcode
        try:
            shares_backfill = load(os.path.join(HERE, "shares_backfill.json"))
        except FileNotFoundError:
            shares_backfill = {}
        if t["shares_m"] is None and tk in shares_backfill:
            t["shares_m"] = shares_backfill[tk]
        # Reverse DCF from the DCF sheet (free) — the sheet is the source of truth
        # for market-implied CAGR, not the JS recomputation
        if d.get("reverse_dcf"):
            # Replication-risk remediation (2026-10-23, finding H2): ship the
            # implied CAGR and the verdict only. The margin input, the market
            # EV input, and the CAGR-to-price table stay in the source model.
            _rd = d["reverse_dcf"] or {}
            t["reverse_dcf"] = {k: _rd[k] for k in ("implied_cagr", "verdict") if k in _rd}
        # Scenario sum-of-the-parts (SE, MELI) — extracted from each workbook's
        # SOTP tab by refresh_data.py into data.json (last-good values kept on
        # a failed read). Replication-risk remediation (2026-10-23, finding
        # C3): the segment builds ship ONLY in the Pro payload; the free
        # bundle carries none of it.
        if d.get("sotp"):
            sotp_map[tk] = d["sotp"]
        # AXON sum-of-the-parts — full detailed model, Pro payload only.
        if tk == "AXON":
            try:
                sotp_map[tk] = load(os.path.join(HERE, "axon_sotp_detail.json"))
            except FileNotFoundError:
                sotp_map[tk] = AXON_SOTP
        # Free-bundle presence flag (SOTP teaser fix, 2026-10-24): the
        # ticker route renders the SOTP shell from this flag so free users
        # see the standard Pro teaser; the segment builds themselves stay
        # Pro-only in sotp_map above. A boolean leaks no SOTP values, and
        # future SOTP tickers pick the flag up automatically.
        if tk in sotp_map:
            t["has_sotp"] = True
        # Cascadia Score (finding C1): computed here from the full factor
        # set; the bundle ships the score, never the computation.
        t["cascadia_score"] = _cascadia_score(
            tk, t.get("upside_base"), ticker_ma, earnings_history, _score_options)
        # Rails three-way comparison (free on UNP/CSX/NSC pages)
        if tk in ("UNP", "CSX", "NSC"):
            try:
                t["rails_comp"] = load(os.path.join(HERE, "rails_comparison.json"))
            except FileNotFoundError:
                pass
        # Financial statements (free for all users)
        if tk in financials:
            t["financials"] = financials[tk]
        # Income chart data: annual + quarterly revenue/net income/margin (free)
        if tk in income_charts:
            t["income_chart"] = income_charts[tk]
        # Valuation multiples: market cap, EV, TTM + forward multiples (free)
        if tk in val_multiples:
            t["valuation"] = val_multiples[tk]
        tickers[tk] = t

    # --- Copy chart images ---
    charts_dir = os.path.join(HERE, "charts")
    os.makedirs(charts_dir, exist_ok=True)
    panels = []
    for p in internals.get("panels", []):
        chart_src = p.get("chart", "")
        chart_file = None
        if chart_src and os.path.isfile(chart_src):
            chart_file = "charts/" + os.path.basename(chart_src)
            shutil.copy2(chart_src, os.path.join(HERE, chart_file))
        # Weekly/monthly series carry a frequency label so users know the cadence;
        # they are never marked stale for being on their normal schedule.
        _freq_map = {
            "Liquidity Drain": "weekly", "Treasury": "weekly", "SLR": "weekly",
            "COT": "weekly", "Commitments": "weekly", "AAII": "weekly",
            "Margin": "monthly", "Leverage": "monthly",
        }
        _pname = p.get("name", "")
        _freq = next((v for k, v in _freq_map.items() if k.lower() in _pname.lower()), None)
        panels.append({
            "name": p.get("name"),
            "summary": p.get("summary"),
            "full_text": p.get("full_text", ""),
            "about": p.get("about", ""),
            "chart": chart_file,
            "as_of": p.get("tracker_as_of"),
            "stale": p.get("stale", False) and not _freq,
            "frequency": _freq,
            "sectors": p.get("sectors", []),
            "med_dist": p.get("med_dist"),
            "spx_dist": p.get("spx_dist"),
            "pct_above_50d": p.get("pct_above_50d"),
            "pct_above_200d": p.get("pct_above_200d"),
            "advancers": p.get("advancers"),
            "decliners": p.get("decliners"),
            "ad_ratio": p.get("ad_ratio"),
            "spread": p.get("spread"),
        })

    # --- Trim feeds to reasonable sizes ---
    macro_items = sorted(macro_feed, key=lambda x: x.get("timestamp", ""), reverse=True)[:60]
    news_items = sorted(company_news, key=lambda x: x.get("timestamp", ""), reverse=True)[:40]

    # --- Seeking Alpha news (categorized) ---
    sa_items = (sa_news.get("items", []) if isinstance(sa_news, dict) else [])
    def sa_row(it):
        return {
            "headline": it.get("title", ""),
            "url": it.get("link", ""),
            "timestamp": it.get("pubDate", ""),
            "source": "Seeking Alpha",
            "ticker": (it.get("tickers") or [""])[0],
            "summary": "",
        }
    sa_company = [sa_row(i) for i in sa_items if i.get("category") == "company"]
    sa_macro = [sa_row(i) for i in sa_items if i.get("category") == "macro"]
    sa_perf = [sa_row(i) for i in sa_items if i.get("category") == "performance"]
    # Merge SA items into existing feeds (SA first = freshest)
    # Keep 2 weeks of history; UI scrolls
    news_items = (sa_company + news_items)[:100]
    macro_items = (sa_macro + macro_items)[:100]

    # --- Bellwether readthroughs keyed by ticker ---
    readthroughs = {}
    for b in bellwethers:
        rt = b.get("readthrough", {})
        for tk, text in rt.items():
            readthroughs.setdefault(tk, []).append({
                "bellwether": b.get("bellwether"),
                "quarter": b.get("quarter"),
                "date": b.get("date"),
                "text": text,
            })

    # --- Assemble site data ---
    site = {
        "generated_at": internals.get("as_of"),
        "models_as_of": data_json.get("as_of"),
        "tickers": tickers,
        "ticker_order": sorted(tickers.keys()),
        "macro_feed": macro_items,
        "company_news": news_items,
        "market_performance": sa_perf[:30],
        "ticker_macro": {k: [{kk: vv for kk, vv in item.items() if kk != "take"} for item in v[:8]] for k, v in ticker_macro.items()},
        "ticker_indicator_takes": ticker_indicator_takes,
        "panels": panels,
        "ticker_ma": ticker_ma,
        "ticker_ohlcv": ticker_ohlcv,
        "vol_div_history": vol_div_history,
        "jaw_history": jaw_history,
        "theme_rot_history": theme_rot_history,
        "smcap_history": smcap_history,
        "credit_vol_history": credit_vol_history,
        "breadth_history": breadth_history,
        "rsi_cd_history": rsi_cd_history,
        "gex_data": gex_data,
        "fed_funds": fed_funds,
        "breakeven_inflation": breakeven_inflation,
        "implied_erp": implied_erp,
        "ceo_compensation": ceo_compensation,
        "memos": memos,
        "geopolitics_watchlist": geopolitics_watchlist,
        "market_analysis_report": market_analysis_report,
        "leadership": leadership,
        "ticker_gex": ticker_gex,
        "opex": opex_data,
        "skew_data": skew_data,
        "ticker_skew": ticker_skew,
        "ticker_insider": ticker_insider,
        "ticker_short_interest": ticker_short_interest,
        "dark_pool": dark_pool,
        "liquidity": liquidity,
        "ticker_13f": ticker_13f,
        "ticker_trends": ticker_trends,
        "aaii_sentiment": aaii_sentiment,
        "cot_data": cot_data,
        "ticker_options": {k: v[:10] for k, v in ticker_options.items()},
        "flow_scoreboard": flow_scoreboard,
        "axon_digest_flow": axon_digest_flow,
        "readthroughs": readthroughs,
        "earnings_history": earnings_history,
        "earnings_revisions": earnings_revisions,
        "earnings_estimates": earnings_estimates,
        "earnings_calendar": earnings_calendar,
        "stripe_payment_link": "https://buy.stripe.com/28E00j5w3e4lb5c2pObbG01",
        "stripe_payment_link_annual": "https://buy.stripe.com/5kQcN54rZ0dveho9SgbbG02",
    }

    # --- Split Pro data to functions/pro-data.json (server-gated) ---
    # These sections are only served via /api/pro-data to verified Pro users
    pro_sections = {
        "gex": {"gex_data": site.pop("gex_data", {}), "ticker_gex": site.pop("ticker_gex", {})},
        "volatility_skew": {"skew_data": site.pop("skew_data", {}), "ticker_skew": site.pop("ticker_skew", {})},
        "unusual_options_flow": site.pop("ticker_options", {}),
        "flow_scoreboard": site.pop("flow_scoreboard", {}),
        "axon_digest_flow": site.pop("axon_digest_flow", {}),
        "market_leadership": site.pop("leadership", {}),
        "macro_analysis": site.pop("market_analysis_report", {}),
        "rsi_cyclical_defensive": site.pop("rsi_cd_history", {}),
        "ticker_ma": site.pop("ticker_ma", {}),
        "ticker_ohlcv": site.pop("ticker_ohlcv", {}),
        "macro_indicators": macro_indicators,
        "mcclellan": load(os.path.join(MR, "mcclellan_summation.json")) if os.path.exists(os.path.join(MR, "mcclellan_summation.json")) else {},
        "technical_analysis": technical_analysis,
        "ticker_macro_takes": {k: v[:8] for k, v in ticker_macro.items()},
        "premarket_report": premarket_report,
        "fear_index": fear_index,
        "rotation_analysis": rotation_analysis,
        "screener_data": screener_data,
        "minervini_data": minervini_data,
        "earnings_dashboard": load(os.path.join(MR, "earnings_dashboard.json")) if os.path.exists(os.path.join(MR, "earnings_dashboard.json")) else {},
        "liquidity": site.pop("liquidity", {}),
        "comps_matrix": load(os.path.join(MR, "comps_matrix.json")) if os.path.exists(os.path.join(MR, "comps_matrix.json")) else {},
        "correction_risk": load(os.path.join(MR, "correction_risk.json")) if os.path.exists(os.path.join(MR, "correction_risk.json")) else {},
        "liquidity_drain": load(os.path.join(MR, "liquidity_drain.json")) if os.path.exists(os.path.join(MR, "liquidity_drain.json")) else {},
        "rv_shock": load(os.path.join(MR, "rv_shock.json")) if os.path.exists(os.path.join(MR, "rv_shock.json")) else {},
        "contagion": load(os.path.join(MR, "contagion.json")) if os.path.exists(os.path.join(MR, "contagion.json")) else {},
        "flow_divergence": load(os.path.join(MR, "flow_divergence.json")) if os.path.exists(os.path.join(MR, "flow_divergence.json")) else {},
        "dynamic_concentration": load(os.path.join(MR, "dynamic_concentration.json")) if os.path.exists(os.path.join(MR, "dynamic_concentration.json")) else {},
        "margin_leverage": load(os.path.join(MR, "margin_leverage.json")) if os.path.exists(os.path.join(MR, "margin_leverage.json")) else {},
        "sector_rotation": load(os.path.join(MR, "sector_rotation.json")) if os.path.exists(os.path.join(MR, "sector_rotation.json")) else {},
        "trend_signals": load(os.path.join(MR, "trend_signals.json")) if os.path.exists(os.path.join(MR, "trend_signals.json")) else {},
        "transcript_tone": load(os.path.join(MR, "transcript_tone.json")) if os.path.exists(os.path.join(MR, "transcript_tone.json")) else {},
        "oas_distress": load(os.path.join(MR, "oas_distress.json")) if os.path.exists(os.path.join(MR, "oas_distress.json")) else {},
        "liquidity_stress": load(os.path.join(MR, "liquidity_stress.json")) if os.path.exists(os.path.join(MR, "liquidity_stress.json")) else {},
        "pead_screener": load(os.path.join(MR, "pead_screener.json")) if os.path.exists(os.path.join(MR, "pead_screener.json")) else {},
        "rs_screener": load(os.path.join(MR, "rs_screener.json")) if os.path.exists(os.path.join(MR, "rs_screener.json")) else {},
        "inflection_screener": load(os.path.join(MR, "inflection_screener.json")) if os.path.exists(os.path.join(MR, "inflection_screener.json")) else {},
        "treasury_slr": load(os.path.join(MR, "treasury_slr.json")) if os.path.exists(os.path.join(MR, "treasury_slr.json")) else {},
        "squeeze_radar": load(os.path.join(MR, "squeeze_radar.json")) if os.path.exists(os.path.join(MR, "squeeze_radar.json")) else {},
        "gamma_flip": load(os.path.join(MR, "gamma_flip.json")) if os.path.exists(os.path.join(MR, "gamma_flip.json")) else {},
        "vol_surface": load(os.path.join(MR, "vol_surface.json")) if os.path.exists(os.path.join(MR, "vol_surface.json")) else {},
        "real_yield_shock": load(os.path.join(MR, "real_yield_shock.json")) if os.path.exists(os.path.join(MR, "real_yield_shock.json")) else {},
        "macro_regime": load(os.path.join(MR, "macro_regime.json")) if os.path.exists(os.path.join(MR, "macro_regime.json")) else {},
        "advanced_macro": load(os.path.join(MR, "advanced_macro.json")) if os.path.exists(os.path.join(MR, "advanced_macro.json")) else {},
        "leadership_canary": load(os.path.join(MR, "leadership_canary.json")) if os.path.exists(os.path.join(MR, "leadership_canary.json")) else {},
        "axon_altdata": load(os.path.join(MR, "axon_altdata.json")) if os.path.exists(os.path.join(MR, "axon_altdata.json")) else {},
        "seasonality": load(os.path.join(MR, "seasonality.json")) if os.path.exists(os.path.join(MR, "seasonality.json")) else {},
        "seasonality_screener": load(os.path.join(MR, "seasonality_screener.json")) if os.path.exists(os.path.join(MR, "seasonality_screener.json")) else {},
    }
    # Per-ticker transcript tone detail files
    import glob
    transcript_detail = {}
    for f in glob.glob(os.path.join(MR, "transcript_tone_*.json")):
        tk = os.path.basename(f).replace("transcript_tone_", "").replace(".json", "")
        try:
            transcript_detail[tk] = load(f)
        except Exception:
            pass
    pro_sections["transcript_tone_detail"] = transcript_detail
    # Per-ticker Detailed Breakdown files (earnings call Key Read-Throughs,
    # append-only store written by generate_earnings_breakdown.py)
    breakdown_detail = {}
    for f in glob.glob(os.path.join(MR, "detailed_breakdown_*.json")):
        tk = os.path.basename(f).replace("detailed_breakdown_", "").replace(".json", "")
        if tk in ("ledger", "runs"):
            continue
        try:
            breakdown_detail[tk] = load(f)
        except Exception:
            pass
    pro_sections["detailed_breakdowns"] = breakdown_detail
    # DCF targets per ticker (bear/base/bull/blended)
    dcf_targets = {}
    fcf_projections = {}
    for tk, t in site.get("tickers", {}).items():
        # DCF targets: bear/base/bull/upside stay in FREE data.js for the free
        # Reverse DCF section; full detail also goes to Pro for gated features.
        # Use copy (not pop) for the free-visible fields.
        dcf_targets[tk] = {}
        # Replication-risk remediation (2026-10-23, finding C8): targets and
        # ratings ship; the model WACC and share count do not ship alongside
        # the FCF paths, so the payload no longer carries a rebuild kit.
        for k in ["bear", "base", "bull", "blended", "rating", "upside_base"]:
            dcf_targets[tk][k] = t.get(k)
        # Ratings and blended targets are FREE (user decision 2026-10-18).
        # Only pop the Pro-only fields from free data.
        for k in ["wacc", "shares_m"]:
            t.pop(k, None)
        if "fcf" in t:
            fcf_projections[tk] = t.pop("fcf")
    pro_sections["dcf_targets"] = dcf_targets
    pro_sections["fcf_projections"] = fcf_projections
    # Sum-of-the-parts segment builds (finding C3): Pro payload only.
    pro_sections["sotp"] = sotp_map
    # Discount Rate Sensitivity grids (Pro only): build-time grids of
    # model outputs (targets + terminal spreads per ERP / 10-year delta).
    # No model internals ship; grids validate against published targets
    # at build time (see gex-tracker/build_sensitivity_grids.py).
    _sens = load(os.path.join(MR, "sensitivity_grids.json"))
    pro_sections["sensitivity"] = _sens if isinstance(_sens, dict) else {}

    # Real yield shock 0-100 risk score from 10Y TIPS (higher = more duration risk).
    # Continuous linear rescale; hard floor 1 (no 0 or negative scores).
    _ry_tips = pro_sections.get("real_yield_shock", {}).get("tips_10y")
    try:
        _ry_score = round(max(1.0, min(100.0, (float(_ry_tips) - 1.0) * 40.0)), 1) if _ry_tips is not None else None
    except (TypeError, ValueError):
        _ry_score = None

    # PEAD market-wide risk: % of the collector's own FADED candidates among
    # those whose drift window has actually run (same-week reporters sit at a
    # drift of 0.0 by construction and are excluded from the denominator).
    _pead_cands = pro_sections.get("pead_screener", {}).get("candidates", []) or []
    try:
        from datetime import date as _pdate
        _pead_ref_s = (pro_sections.get("pead_screener", {}) or {}).get("as_of")
        _pead_ref = _pdate.fromisoformat(_pead_ref_s) if _pead_ref_s else _pdate.today()

        def _pead_eligible(c):
            if not isinstance(c, dict) or c.get("drift_pct") is None:
                return False
            try:
                _rd = c.get("report_date")
                _days = (_pead_ref - _pdate.fromisoformat(_rd)).days if _rd else 999
            except Exception:
                _days = 999
            if c.get("drift_pct") == 0.0 and _days < 7:
                return False
            return True

        _pead_elig = [c for c in _pead_cands if _pead_eligible(c)]
        _pead_faded = [c for c in _pead_elig if c.get("status") == "FADED SURPRISE"]
        _pead_n, _pead_f = len(_pead_elig), len(_pead_faded)
        _pead_score = round(100.0 * _pead_f / _pead_n, 1) if _pead_n else None
        _pead_regime = f"{_pead_f}/{_pead_n} faded" if _pead_score is not None else None
    except (TypeError, ValueError):
        _pead_score, _pead_regime = None, None

    # Squeeze radar market-wide risk: % of valid records in a non-orderly
    # state per the collector's own taxonomy, excluding all-zero placeholder
    # records from the denominator.
    _sq_recs = pro_sections.get("squeeze_radar", {}).get("records", []) or []
    try:
        _sq_valid = [r for r in _sq_recs if isinstance(r, dict)
                     and not (r.get("si_pct") == 0 and r.get("dtc") == 0
                              and (r.get("squeeze_score") or 0) == 0)]
        _sq_non = [r for r in _sq_valid if r.get("classification") != "ORDERLY REBALANCING"]
        _sq_n, _sq_a = len(_sq_valid), len(_sq_non)
        _sq_score = round(100.0 * _sq_a / _sq_n, 1) if _sq_n else None
        _sq_regime = f"{_sq_a}/{_sq_n} elevated or alert" if _sq_score is not None else None
    except (TypeError, ValueError):
        _sq_score, _sq_regime = None, None

    # Gamma flip market-wide risk: continuous per-underlying dealer regime
    # score. Long gamma ramps down with flip distance (40 -> 15), short gamma
    # ramps up (60 -> 90); a null flip (strike out of range) means spot sits
    # deep in the regime, scored near the extreme and flagged.
    def _gamma_risk(g):
        if not isinstance(g, dict):
            return None, False
        regime = (g.get("regime") or "").upper()
        try:
            _dist = g.get("distance_pct")
            dist = abs(float(_dist)) if _dist is not None else None
        except (TypeError, ValueError):
            dist = None
        if g.get("flip_strike") is None or dist is None:
            return (85.0 if "SHORT" in regime else 15.0), True
        if "SHORT" in regime:
            return max(1.0, min(100.0, 60.0 + 30.0 * min(dist / 3.0, 1.0))), False
        return max(1.0, min(100.0, 40.0 - 25.0 * min(dist / 3.0, 1.0))), False
    _gf = pro_sections.get("gamma_flip", {}) or {}
    _gf_parts = [_gamma_risk(_gf.get("spy")), _gamma_risk(_gf.get("qqq"))]
    _gf_risks = [r for r, _ in _gf_parts if r is not None]
    _gf_flip_null = any(f for _, f in _gf_parts if f) if _gf_risks else False
    _gf_score = round(sum(_gf_risks) / len(_gf_risks), 1) if _gf_risks else None
    _gf_regimes = [((_gf.get("spy") or {}).get("regime") or "").upper(),
                   ((_gf.get("qqq") or {}).get("regime") or "").upper()]
    if _gf_score is not None:
        if all("SHORT" in r for r in _gf_regimes):
            _gf_regime = "Short gamma across SPY and QQQ"
        elif all("LONG" in r for r in _gf_regimes):
            _gf_regime = "Long gamma across SPY and QQQ"
        else:
            _gf_regime = "Split dealer regime (SPY/QQQ)"
    else:
        _gf_regime = None

    # Global Macro group: five structural models inside advanced_macro.json.
    # Display conventions (2026-10-22 redesign): every snapshot card shows a
    # risk-oriented level score on 1-100 (higher = more risk; never 0 or
    # negative). Inverted-polarity models (liquidity_drain, sector_rotation,
    # treasury_slr, economic_nowcast) are displayed as 100 minus their native
    # score; the native scales stay in the Pro detail. flow_divergence shows
    # a bounded level score (|oscillator| * 12, 1-100); taylor_gap shows a
    # level score (50 + gap_bps / 4, 1-100) while the raw signed gap in basis
    # points stays in the Pro detail. The composite consumes the native
    # orientations through the direction registry, as before.
    _am_models = (pro_sections.get("advanced_macro", {}) or {}).get("models", {}) or {}
    _am_fd = _am_models.get("fiscal_dominance", {}) or {}
    _am_eu = _am_models.get("eurodollar_stress", {}) or {}
    _am_nc = _am_models.get("economic_nowcast", {}) or {}
    _am_tg = _am_models.get("taylor_gap", {}) or {}
    _am_sf = _am_models.get("sovereign_fragmentation", {}) or {}

    # CCRI model registry. Order defines the free snapshot card order; adding
    # a future model here automatically gives it a snapshot card (standing rule).
    _pillar_targets = {
        "Macro & Liquidity": 0.35,
        "Systematic & Volatility": 0.25,
        "Structural & Breadth": 0.20,
        "Flow & Leverage": 0.20,
    }
    _tier_w = {1: 3.0, 2: 2.0, 3: 1.0}
    _composite_cfg = {
        # key: (direction, pillar, display name, tier)
        "correction_risk": (+1, "Structural & Breadth", "Correction Risk", 1),
        "liquidity_drain": (-1, "Macro & Liquidity", "Liquidity Drain", 1),
        "rv_shock": (+1, "Systematic & Volatility", "Realized Vol Shock", 1),
        "contagion": (+1, "Macro & Liquidity", "Cross-Asset Contagion Risk", 2),
        "concentration": (+1, "Structural & Breadth", "Leadership Concentration", 2),
        "margin_leverage": (+1, "Flow & Leverage", "Margin Leverage", 2),
        "sector_rotation": (-1, "Structural & Breadth", "Sector Rotation", 2),
        "fear_index": (+1, "Systematic & Volatility", "Fear Index", 1),
        "oas_distress": (+1, "Macro & Liquidity", "Credit Stress", 1),
        "treasury_slr": (-1, "Macro & Liquidity", "Treasury Capacity", 2),
        "liquidity_stress": (+1, "Macro & Liquidity", "Liquidity Stress", 2),
        "real_yield_shock": (+1, "Macro & Liquidity", "Real Yield Shock", 3),
        "gamma_flip": (+1, "Systematic & Volatility", "Gamma Regime", 2),
        "macro_regime": (+1, "Macro & Liquidity", "Macro Regime", 2),
        # Global Macro group (advanced_macro.json). The nowcast headline is a
        # momentum score where higher means a stronger economy, so direction
        # -1 inverts it into a risk contribution. The Taylor headline is the
        # raw policy gap in bps; its risk mapping lives in the raw loop.
        "fiscal_dominance": (+1, "Macro & Liquidity", "Fiscal Dominance", 2),
        "eurodollar_stress": (+1, "Macro & Liquidity", "Eurodollar Stress", 2),
        "sovereign_fragmentation": (+1, "Macro & Liquidity", "Sovereign Fragmentation", 2),
        "economic_nowcast": (-1, "Macro & Liquidity", "Nowcast Momentum", 2),
        "taylor_gap": (+1, "Macro & Liquidity", "Taylor Gap", 2),
        "pead_screener": (+1, "Structural & Breadth", "Earnings Drift", 3),
        "squeeze_radar": (+1, "Flow & Leverage", "Squeeze Fragility", 3),
        "flow_divergence": (+1, "Flow & Leverage", "Flow Divergence", 2),
        # McClellan Breadth (2026-10-26 fold-in): the S&P 500-constituent
        # breadth proxy's risk contribution, tier 2. Tier 2, not tier 1,
        # because the proxy history is short (about a year) and breadth
        # is already partly carried by Correction Risk's breadth leg;
        # tier 2 gives the input real weight without letting one proxy
        # dominate the pillar. Missing input is skipped like any other
        # model (the _raw loop skips None); never a fabricated default.
        "mcclellan_breadth": (+1, "Structural & Breadth", "McClellan Breadth", 2),
    }
    # --- Risk headline data contract (2026-10-22 redesign) ---
    # _native: registry inputs in each model's native orientation (drives CCRI).
    # _hl: display values for the snapshot cards, always risk-oriented 1-100.
    # Free bundle (site["risk_headlines"]): metadata ONLY (name, slug, as_of).
    # Pro bundle (pro_sections["risk_headlines"]): {"values": _hl,
    # "composite": {...full attribution...}}. Scores, regime labels and band
    # colors never enter the free bundle.
    def _clamp1(v):
        try:
            return round(max(1.0, min(100.0, float(v))), 1)
        except (TypeError, ValueError):
            return None

    def _inv(v):
        # Inverted-polarity models: the native scale runs the other way, so
        # the card shows the risk-direction value (native stays in Pro detail).
        return _clamp1(100.0 - v) if v is not None else None

    _cr = pro_sections.get("correction_risk", {}) or {}
    _ld = pro_sections.get("liquidity_drain", {}) or {}
    _rvc = (pro_sections.get("rv_shock", {}) or {}).get("rvCurrent") or {}
    _rvcd = (pro_sections.get("rv_shock", {}) or {}).get("countdown") or {}
    _cg = (pro_sections.get("contagion", {}) or {}).get("composite") or {}
    _fd = (pro_sections.get("flow_divergence", {}) or {}).get("current") or {}
    _dc = pro_sections.get("dynamic_concentration", {}) or {}
    _ml = pro_sections.get("margin_leverage", {}) or {}
    _sr = pro_sections.get("sector_rotation", {}) or {}
    _fi = pro_sections.get("fear_index", {}) or {}
    _oas = pro_sections.get("oas_distress", {}) or {}
    _lss = pro_sections.get("liquidity_stress", {}) or {}
    _ts = pro_sections.get("treasury_slr", {}) or {}
    _rys = pro_sections.get("real_yield_shock", {}) or {}
    _mr = pro_sections.get("macro_regime", {}) or {}
    _mc = pro_sections.get("mcclellan", {}) or {}
    _mc_cur = _mc.get("current", {}) or {}
    _tg_gap = _am_tg.get("gap_bps")
    _fd_osc = _fd.get("oscillator")

    _fi_score = _fi.get("fear_index")
    _fi_color = ("rose" if (_fi_score or 0) >= 75 else "amber" if (_fi_score or 0) >= 55
                 else "slate" if (_fi_score or 0) >= 45 else "emerald")

    _ls_active = _lss.get("components_active") or []
    _ls_note = ("Partial components: %d of 4 active" % len(_ls_active)
                if 0 < len(_ls_active) < 4 else None)

    _gf_color = ("rose" if (_gf_score or 0) >= 60 else "amber" if (_gf_score or 0) >= 45 else "emerald")
    _pead_color = ("rose" if (_pead_score or 0) >= 50 else "amber" if (_pead_score or 0) >= 25 else "emerald")
    _sq_color = ("rose" if (_sq_score or 0) >= 20 else "amber" if (_sq_score or 0) >= 10 else "emerald")

    _native = {
        "correction_risk": _cr.get("totalRiskScore"),
        "liquidity_drain": _ld.get("totalScore"),
        "rv_shock": _rvc.get("vcfExposurePercentile"),
        "contagion": _cg.get("score"),
        "flow_divergence": _fd_osc,
        "concentration": _dc.get("score"),
        "margin_leverage": _ml.get("score"),
        "sector_rotation": _sr.get("score"),
        "fear_index": _fi_score,
        "oas_distress": _oas.get("score"),
        "liquidity_stress": _lss.get("score"),
        "treasury_slr": _ts.get("score"),
        "real_yield_shock": _ry_score,
        "pead_screener": _pead_score,
        "squeeze_radar": _sq_score,
        "gamma_flip": _gf_score,
        "macro_regime": _mr.get("score"),
        "fiscal_dominance": _am_fd.get("score"),
        "eurodollar_stress": _am_eu.get("score"),
        "economic_nowcast": _am_nc.get("score"),
        "taylor_gap": _tg_gap,
        "sovereign_fragmentation": _am_sf.get("score"),
        "mcclellan_breadth": _mc_cur.get("risk_score"),
    }

    _hl = {}

    def _put(key, score, regime, color, **extra):
        _hl[key] = {"score": _clamp1(score), "regime": regime, "color": color}
        if extra:
            _hl[key].update(extra)

    _put("correction_risk", _native["correction_risk"], _cr.get("regime"), _cr.get("color"))
    _put("liquidity_drain", _inv(_native["liquidity_drain"]), _ld.get("regime"), _ld.get("color"))
    _put("rv_shock", _native["rv_shock"], _rvcd.get("statusLabel"), _rvcd.get("statusColor"))
    _put("contagion", _native["contagion"], _cg.get("threatLevel"), _cg.get("threatColor"))
    _put("flow_divergence", _clamp1(abs(_fd_osc) * 12.0) if _fd_osc is not None else None,
         _fd.get("status"), _fd.get("color"))
    _put("concentration", _native["concentration"], _dc.get("regime"), _dc.get("color"))
    _put("margin_leverage", _native["margin_leverage"], _ml.get("regime"), _ml.get("color"))
    _put("sector_rotation", _inv(_native["sector_rotation"]), _sr.get("regime"), _sr.get("color"))
    _put("fear_index", _fi_score, _fi.get("sentiment"), _fi_color)
    _put("oas_distress", _native["oas_distress"], _oas.get("regime"), _oas.get("color"))
    _put("liquidity_stress", _native["liquidity_stress"], _lss.get("regime"), _lss.get("color"),
         **({"note": _ls_note} if _ls_note else {}))
    _put("treasury_slr", _inv(_native["treasury_slr"]), _ts.get("status"), _ts.get("color"))
    _put("real_yield_shock", _native["real_yield_shock"], _rys.get("regime"), _rys.get("color"),
         tips_10y=_rys.get("tips_10y"), as_of=_rys.get("as_of"))
    _put("pead_screener", _native["pead_screener"], _pead_regime, _pead_color)
    _put("squeeze_radar", _native["squeeze_radar"], _sq_regime, _sq_color)
    _put("gamma_flip", _native["gamma_flip"], _gf_regime, _gf_color,
         **({"flip_out_of_range": True} if _gf_flip_null else {}))
    _put("macro_regime", _native["macro_regime"], _mr.get("regime"), _mr.get("color"))
    _put("fiscal_dominance", _native["fiscal_dominance"], _am_fd.get("regime"), _am_fd.get("color"))
    _put("eurodollar_stress", _native["eurodollar_stress"], _am_eu.get("regime"), _am_eu.get("color"))
    _put("economic_nowcast", _inv(_native["economic_nowcast"]), _am_nc.get("regime"), _am_nc.get("color"))
    _put("taylor_gap", _clamp1(50.0 + _tg_gap / 4.0) if _tg_gap is not None else None,
         _am_tg.get("regime"), _am_tg.get("color"))
    _put("sovereign_fragmentation", _native["sovereign_fragmentation"],
         _am_sf.get("regime"), _am_sf.get("color"))
    _mc_risk = _mc_cur.get("risk_score")
    _mc_color = ("rose" if (_mc_risk or 0) >= 70 else "amber" if (_mc_risk or 0) >= 50
                 else "slate" if (_mc_risk or 0) >= 30 else "emerald")
    _put("mcclellan_breadth", _mc_risk, _mc_cur.get("regime"), _mc_color)

    _NAMES = {
        "correction_risk": "Correction Risk", "liquidity_drain": "Liquidity Drain",
        "rv_shock": "Realized Vol Shock", "contagion": "Cross-Asset Contagion Risk",
        "flow_divergence": "Flow Divergence", "concentration": "Leadership Concentration",
        "margin_leverage": "Margin Leverage", "sector_rotation": "Sector Rotation",
        "fear_index": "Fear Index", "oas_distress": "Credit Stress",
        "liquidity_stress": "Liquidity Stress", "treasury_slr": "Treasury Capacity",
        "real_yield_shock": "Real Yield Shock", "pead_screener": "Earnings Drift",
        "squeeze_radar": "Squeeze Fragility", "gamma_flip": "Gamma Regime",
        "macro_regime": "Macro Regime", "fiscal_dominance": "Fiscal Dominance",
        "eurodollar_stress": "Eurodollar Stress", "economic_nowcast": "Nowcast Momentum",
        "taylor_gap": "Taylor Gap", "sovereign_fragmentation": "Sovereign Fragmentation",
        "mcclellan_breadth": "McClellan Breadth",
    }
    _SLUGS = {
        "correction_risk": "risk-correction-risk", "liquidity_drain": "risk-liquidity-drain",
        "rv_shock": "risk-realized-vol-shock", "contagion": "risk-contagion",
        "flow_divergence": "risk-flow-divergence", "concentration": "risk-concentration",
        "margin_leverage": "risk-systemic-leverage", "sector_rotation": "risk-offense-defense",
        "fear_index": "risk-fear-index", "oas_distress": "risk-credit-stress",
        "liquidity_stress": "risk-liquidity-stress", "treasury_slr": "risk-treasury-capacity",
        "real_yield_shock": "risk-real-yield-shock", "pead_screener": "risk-earnings-drift",
        "squeeze_radar": "risk-squeeze-fragility", "gamma_flip": "risk-gamma-regime",
        "macro_regime": "risk-macro-regime", "fiscal_dominance": "risk-fiscal-dominance",
        "eurodollar_stress": "risk-eurodollar-stress", "economic_nowcast": "risk-economic-nowcast",
        "taylor_gap": "risk-taylor-gap",
        "sovereign_fragmentation": "risk-sovereign-fragmentation",
        "mcclellan_breadth": "risk-mcclellan-breadth",
    }
    # Free bundle: snapshot metadata only. No scores, regime labels or colors.
    site["risk_headlines"] = {
        "as_of": (site.get("generated_at") or "")[:10],
        "models": [{"key": k, "name": _NAMES[k], "slug": _SLUGS[k]} for k in _composite_cfg],
    }

    # Cascadia Composite Risk Index (CCRI): overall assessment across all risk models.
    # Consumes _native (registry inputs in each model's native orientation;
    # flow_divergence is the raw oscillator, taylor_gap the raw gap in bps).
    # Direction-normalizes to 0-100 where HIGHER = MORE RISK, then averages
    # with the pillar/tier hierarchy. Registry lives above the headline block.
    # Raw risk values first (direction-normalized to 0-100, higher = more risk)
    _raw = {}  # key -> (risk, pillar, display name, tier)
    for _key, (_direction, _pillar, _dname, _tier) in _composite_cfg.items():
        _s = _native.get(_key)
        if _s is None:
            continue
        try:
            # Flow divergence is an oscillator; extreme either way = risk
            if _key == "flow_divergence":
                _risk = abs(float(_s)) * 12.0
            elif _key == "taylor_gap":
                # Headline value is the raw policy gap in bps, centered so
                # a neutral gap maps to 50 and +/-200 bps spans the range
                _risk = 50.0 + float(_s) / 4.0
            else:
                _risk = float(_s) if _direction > 0 else 100.0 - float(_s)
            _raw[_key] = (max(0.0, min(100.0, _risk)), _pillar, _dname, _tier)
        except (TypeError, ValueError):
            continue
    # Hierarchical weights: pillar target x (tier_w / pillar tier sum)
    _pillar_tier_sums = {}
    for _key, (_risk, _pillar, _dname, _tier) in _raw.items():
        _pillar_tier_sums[_pillar] = _pillar_tier_sums.get(_pillar, 0.0) + _tier_w[_tier]
    _components = []  # (key, risk, pillar, display name, weight)
    for _key, (_risk, _pillar, _dname, _tier) in _raw.items():
        _w = _pillar_targets.get(_pillar, 0) * (_tier_w[_tier] / _pillar_tier_sums[_pillar])
        _components.append((_key, _risk, _pillar, _dname, _w))
    if _components:
        _wsum = sum(_w for _, _, _, _, _w in _components)
        _avg = sum(_v * _w for _, _v, _, _, _w in _components) / _wsum if _wsum else 0
        if _avg >= 70:
            _regime, _color = "HIGH RISK", "rose"
        elif _avg >= 50:
            _regime, _color = "ELEVATED RISK", "amber"
        elif _avg >= 30:
            _regime, _color = "MODERATE RISK", "slate"
        else:
            _regime, _color = "LOW RISK", "emerald"
        # Pillar aggregation: weighted average risk within each pillar
        _pillars = {}
        for _, _v, _p, _n, _w in _components:
            _pillars.setdefault(_p, []).append((_n, _v, _w))
        _pillar_list = []
        for _p, _items in _pillars.items():
            _pw = sum(_w for _, _, _w in _items)
            _pscore = sum(_v * _w for _, _v, _w in _items) / _pw if _pw else 0
            _pillar_list.append({
                "pillar": _p,
                "score": round(_pscore, 1),
                "weight": round(_pillar_targets.get(_p, 0) * 100, 1),
                "models": [{"name": _n, "risk": round(_v, 1),
                            "weight": round(_w * 100, 2)} for _n, _v, _w in
                           sorted(_items, key=lambda x: x[1], reverse=True)],
            })
        _pillar_list.sort(key=lambda x: x["score"], reverse=True)
        # Free bundle: NO composite values (Justin decision 2026-10-22,
        # superseding 2026-10-19): the snapshot is blurred in full for
        # free users, so the composite score, regime and color ship only
        # in the Pro bundle below. The free bundle carries names, slugs
        # and the as-of date, nothing else.
        pro_sections["risk_headlines"] = {
            "values": _hl,
            "composite": {
                "score": round(_avg, 1),
                "regime": _regime,
                "color": _color,
                "components": [{"model": _k, "risk": round(_v, 1),
                                "weight": round(_w * 100, 2)} for _k, _v, _, _, _w in _components],
                "model_count": len(_components),
                "pillars": _pillar_list,
                "primary_driver": _pillar_list[0]["pillar"] if _pillar_list else None,
                "weighted": True,
            }
        }

    # === Replication-risk remediation (2026-10-23): publication boundary ===
    # Collectors keep full construction detail in their source JSONs; this
    # block is where construction stops and outputs continue. Formulas,
    # weights, point allocations, solver parameters, threshold strings, and
    # input arrays are stripped or replaced here, so every daily rebuild
    # ships the remediated payloads. Scores, readings, targets,
    # probabilities, and histories pass through unchanged.
    def _tone(points, kind):
        try:
            p = float(points)
        except (TypeError, ValueError):
            return "good"
        if kind == "risk_high_bad":
            return "bad" if p > 0 else "good"
        if kind == "drain":
            return "good" if p >= 30 else "warn" if p > 0 else "bad"
        if kind == "conc":
            return "bad" if p >= 30 else "warn" if p >= 15 else "good"
        if kind == "lev":
            return "bad" if p >= 30 else "warn" if p > 0 else "good"
        return "good" if p > 0 else "bad"

    def _strip_points(section, key, kind):
        sec = pro_sections.get(section)
        if not isinstance(sec, dict):
            return
        rows = sec.get(key)
        if isinstance(rows, list):
            for r in rows:
                if isinstance(r, dict) and "points" in r:
                    r["tone"] = _tone(r.pop("points"), kind)

    # H9: point allocations become a qualitative tone per breakdown entry.
    _strip_points("liquidity", "score_breakdown", "liq")
    _strip_points("liquidity_drain", "scoreBreakdown", "drain")
    _strip_points("dynamic_concentration", "scoreBreakdown", "conc")
    _strip_points("margin_leverage", "scoreBreakdown", "lev")
    _strip_points("sector_rotation", "scoreBreakdown", "drain")
    _strip_points("correction_risk", "scoreBreakdown", "risk_high_bad")

    # C4: Correction Risk formula note and the unclamped raw score.
    _cr = pro_sections.get("correction_risk")
    if isinstance(_cr, dict):
        _cr.pop("rawScore", None)
        if _cr.get("methodology_note"):
            _cr["methodology_note"] = (
                "Four gauges are tracked: price extension versus trend, the "
                "volatility trend, credit stress, and market breadth. The "
                "score runs from 1 to 100; higher means more correction risk.")

    # C5: Credit Stress weights, component sub-scores, percentile detail,
    # the observation window, and the backfill distribution block.
    _oas = pro_sections.get("oas_distress")
    if isinstance(_oas, dict):
        for _k in ("weights", "backfill", "model_version"):
            _oas.pop(_k, None)
        _comps = _oas.get("components")
        if isinstance(_comps, dict):
            for _cp in _comps.values():
                if isinstance(_cp, dict):
                    for _k in ("weight", "score", "percentile_3y"):
                        _cp.pop(_k, None)
        _inp = _oas.get("inputs")
        if isinstance(_inp, dict):
            _inp.pop("window_obs", None)

    # C7: CCRI per-model and pillar weights.
    _comp = (pro_sections.get("risk_headlines") or {}).get("composite") or {}
    for _c in _comp.get("components") or []:
        if isinstance(_c, dict):
            _c.pop("weight", None)
    for _p in _comp.get("pillars") or []:
        if isinstance(_p, dict):
            _p.pop("weight", None)
            for _m in _p.get("models") or []:
                if isinstance(_m, dict):
                    _m.pop("weight", None)
    _comp.pop("weighted", None)

    # H7: Contagion pillar weights.
    _cg2 = pro_sections.get("contagion")
    if isinstance(_cg2, dict):
        for _p in (_cg2.get("pillars") or {}).values():
            if isinstance(_p, dict):
                _p.pop("weight", None)

    # H5: Macro Regime priors, scenario means, threshold-bearing signal
    # strings, quadrant axis weights, and the neutral-rate band.
    def _mr_signal_label(s):
        t = str(s)
        low = t.lower()
        if "term premium" in low and "above" in low:
            return "Term premium elevated, duration compensation rebuilding"
        if "positive term premium" in low:
            return "Positive term premium supports the plateau case"
        if "threshold" in low and "10y" in low:
            return "10Y yield at an elevated level"
        if "overlaps the plateau top" in low:
            return "10Y yield still overlaps the plateau range"
        if "real yield" in low and "gravity" in low:
            return "Real yields exerting severe duration gravity"
        if "real yields above" in low:
            return "Real yields anchoring the plateau case"
        if any(ch.isdigit() for ch in t):
            return None
        return t

    _mr = pro_sections.get("macro_regime")
    if isinstance(_mr, dict):
        _mr.pop("priors", None)
        for _sc in _mr.get("scenarios") or []:
            if isinstance(_sc, dict):
                for _k in ("us10y_mean", "bund_mean", "gilt_mean", "jgb_mean"):
                    _sc.pop(_k, None)
        _labels = []
        for _s in _mr.get("signals") or []:
            _lab = _mr_signal_label(_s)
            if _lab and _lab not in _labels:
                _labels.append(_lab)
        _mr["signals"] = _labels
        _q = _mr.get("quadrant")
        if isinstance(_q, dict):
            _q.pop("growth_weights_used", None)
            _q.pop("inflation_weights_used", None)
            _rp = ((_q.get("plumbing") or {}).get("real_policy") or {})
            if isinstance(_rp, dict):
                _rp.pop("r_star_low", None)
                _rp.pop("r_star_high", None)

    # H10: Taylor Rule assumed parameters and Fiscal Dominance band anchors.
    _am = pro_sections.get("advanced_macro")
    if isinstance(_am, dict):
        _models = _am.get("models") or {}
        _tg = _models.get("taylor_gap")
        if isinstance(_tg, dict):
            _tg.pop("r_star", None)
            _tg.pop("nairu", None)
        _fd = _models.get("fiscal_dominance")
        if isinstance(_fd, dict):
            _fd.pop("burden_anchor_lo", None)
            _fd.pop("burden_anchor_hi", None)

    # H6: Liquidity Stress proxy-construction notes become generic labels.
    _ls = pro_sections.get("liquidity_stress")
    if isinstance(_ls, dict):
        _lead = _ls.get("leading") or {}
        _iv = _lead.get("implied_vol")
        if isinstance(_iv, dict):
            _iv["note"] = "Listed-options implied volatility proxy"
            _iv.pop("percentile", None)
        _rr = _lead.get("risk_reversal")
        if isinstance(_rr, dict):
            _rr["note"] = "Listed-options skew proxy"

    # H4: Comps regression coefficients; the method label drops to
    # outputs level.
    _cm = pro_sections.get("comps_matrix")
    if isinstance(_cm, dict):
        _md = _cm.get("metadata")
        if isinstance(_md, dict):
            _md.pop("regressions", None)
            _md.pop("sectorRegressions", None)
            if _md.get("method"):
                _md["method"] = "sector-relative regression"

    # C6: AXON alt-data bridge formula, input array, and range bases.
    _aa = pro_sections.get("axon_altdata")
    if isinstance(_aa, dict):
        _br = _aa.get("bridge")
        if isinstance(_br, dict):
            _br.pop("formula", None)
            _br.pop("inputs", None)
            _rng = _br.get("range")
            if isinstance(_rng, dict):
                _rng.pop("low_basis", None)
                _rng.pop("high_basis", None)
        _md2 = _aa.get("metadata")
        if isinstance(_md2, dict) and _md2.get("method_note"):
            _md2["method_note"] = (
                "Observed figures come from Axon earnings releases and cited "
                "public records. Modeled figures are Cascadia estimates "
                "computed from those observations. Anything this stack cannot "
                "source is marked unavailable with the reason")

    pro_out = {"generated_at": site.get("generated_at"), "sections": pro_sections}
    # McClellan carries no free headline (2026-10-26): every McClellan
    # measurement is Pro, so the free bundle must not ship the reading.
    # The Pro payload keeps the full section in pro_sections above.
    with open(os.path.join(HERE, "functions", "pro-data.json"), "w") as pf:
        json.dump(pro_out, pf)
    print(f"Wrote functions/pro-data.json ({len(json.dumps(pro_out))//1024} KB)", flush=True)

    # --- Write data.js ---
    out_path = os.path.join(HERE, "data.js")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("/* Generated by build.py — do not edit by hand. */\n")
        f.write("window.SITE_DATA = ")
        json.dump(site, f, separators=(",", ":"))
        f.write(";\n")

    size_kb = os.path.getsize(out_path) / 1024
    print(f"Wrote data.js ({size_kb:.0f} KB), {len(tickers)} tickers, "
          f"{len(macro_items)} macro items, {len(news_items)} news items, "
          f"{len(panels)} panels, charts copied: {len([p for p in panels if p['chart']])}")


if __name__ == "__main__":
    main()
