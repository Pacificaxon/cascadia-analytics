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


def main():
    # --- Load sources ---
    data_json = load(os.path.join(FG, "data.json"))
    manifest = load(os.path.join(YF, "client-notes-manifest.json"))
    macro_feed = load(os.path.join(MR, "macro_feed.json"))
    company_news = load(os.path.join(MR, "company_news.json"))
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
    ticker_options = load(os.path.join(MR, "ticker_options.json"))
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
        fcf_backfill = load(os.path.join(HERE, "fcf_backfill.json"))
    except FileNotFoundError:
        fcf_backfill = {}
    try:
        financials = load(os.path.join(HERE, "financials.json"))
    except FileNotFoundError:
        financials = {}
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
    detail = data_json.get("tickers", {})
    for tk in sorted(manifest.keys()):
        m = manifest[tk]
        d = detail.get(tk, {})
        scenarios = d.get("scenarios", {})
        t = {
            "ticker": tk,
            "name": d.get("name", tk),
            "price": m.get("spot_price", d.get("price")),
            "price_date": m.get("price_date", d.get("price_date")),
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
                "pdf": ("notes/" + tk + ".pdf") if m.get("pdf_exists") else None,
                "pdf_exists": m.get("pdf_exists", False),
            },
        }
        for sc in ("bear", "base", "bull"):
            if sc in scenarios:
                s = scenarios[sc]
                t["fcf"][sc] = {"years": s.get("years", []), "fcf_m": s.get("fcf_m", [])}
                if t["shares_m"] is None and s.get("shares_m"):
                    t["shares_m"] = s["shares_m"]
                t["wacc"] = t["wacc"] or s.get("wacc")
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
        # AXON sum-of-the-parts (Pro-gated on the ticker page) — full detailed model
        if tk == "AXON":
            try:
                t["sotp"] = load(os.path.join(HERE, "axon_sotp_detail.json"))
            except FileNotFoundError:
                t["sotp"] = AXON_SOTP
        # Rails three-way comparison (free on UNP/CSX/NSC pages)
        if tk in ("UNP", "CSX", "NSC"):
            try:
                t["rails_comp"] = load(os.path.join(HERE, "rails_comparison.json"))
            except FileNotFoundError:
                pass
        # Financial statements (free for all users)
        if tk in financials:
            t["financials"] = financials[tk]
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
        panels.append({
            "name": p.get("name"),
            "summary": p.get("summary"),
            "chart": chart_file,
            "as_of": p.get("tracker_as_of"),
            "stale": p.get("stale", False),
        })

    # --- Trim feeds to reasonable sizes ---
    macro_items = sorted(macro_feed, key=lambda x: x.get("timestamp", ""), reverse=True)[:60]
    news_items = sorted(company_news, key=lambda x: x.get("timestamp", ""), reverse=True)[:40]

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
        "tickers": tickers,
        "ticker_order": sorted(tickers.keys()),
        "macro_feed": macro_items,
        "company_news": news_items,
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
        "market_analysis_report": market_analysis_report,
        "leadership": leadership,
        "ticker_gex": ticker_gex,
        "skew_data": skew_data,
        "ticker_skew": ticker_skew,
        "ticker_insider": ticker_insider,
        "aaii_sentiment": aaii_sentiment,
        "cot_data": cot_data,
        "ticker_options": {k: v[:10] for k, v in ticker_options.items()},
        "readthroughs": readthroughs,
        "earnings_history": earnings_history,
        "earnings_revisions": earnings_revisions,
        "earnings_calendar": earnings_calendar,
        "stripe_payment_link": "https://buy.stripe.com/28E00j5w3e4lb5c2pObbG01",
    }

    # --- Split Pro data to functions/pro-data.json (server-gated) ---
    # These sections are only served via /api/pro-data to verified Pro users
    pro_sections = {
        "gex": {"gex_data": site.pop("gex_data", {}), "ticker_gex": site.pop("ticker_gex", {})},
        "volatility_skew": {"skew_data": site.pop("skew_data", {}), "ticker_skew": site.pop("ticker_skew", {})},
        "unusual_options_flow": site.pop("ticker_options", {}),
        "market_leadership": site.pop("leadership", {}),
        "macro_analysis": site.pop("market_analysis_report", {}),
        "rsi_cyclical_defensive": site.pop("rsi_cd_history", {}),
        "ticker_ma": site.pop("ticker_ma", {}),
        "ticker_ohlcv": site.pop("ticker_ohlcv", {}),
        "macro_indicators": macro_indicators,
        "technical_analysis": technical_analysis,
        "ticker_macro_takes": {k: v[:8] for k, v in ticker_macro.items()},
    }
    # DCF targets per ticker (bear/base/bull/blended)
    dcf_targets = {}
    fcf_projections = {}
    for tk, t in site.get("tickers", {}).items():
        dcf_targets[tk] = {k: t.pop(k, None) for k in ["bear", "base", "bull", "blended", "rating", "wacc", "upside_base", "shares_m"]}
        if "fcf" in t:
            fcf_projections[tk] = t.pop("fcf")
    pro_sections["dcf_targets"] = dcf_targets
    pro_sections["fcf_projections"] = fcf_projections

    pro_out = {"generated_at": site.get("generated_at"), "sections": pro_sections}
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
