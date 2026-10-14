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


def main():
    # --- Load sources ---
    data_json = load(os.path.join(FG, "data.json"))
    manifest = load(os.path.join(YF, "client-notes-manifest.json"))
    macro_feed = load(os.path.join(MR, "macro_feed.json"))
    company_news = load(os.path.join(MR, "company_news.json"))
    ticker_macro = load(os.path.join(MR, "ticker_macro.json"))
    internals = load(os.path.join(MR, "market_internals.json"))
    ticker_ma = load(os.path.join(MR, "ticker_ma.json"))
    ticker_options = load(os.path.join(MR, "ticker_options.json"))
    bellwethers = load(os.path.join(MR, "bellwether_earnings.json"))
    try:
        earnings_history = load(os.path.join(MR, "earnings_history.json"))
    except FileNotFoundError:
        earnings_history = {}
    try:
        fcf_backfill = load(os.path.join(HERE, "fcf_backfill.json"))
    except FileNotFoundError:
        fcf_backfill = {}

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
        "ticker_macro": {k: v[:8] for k, v in ticker_macro.items()},
        "panels": panels,
        "ticker_ma": ticker_ma,
        "ticker_options": {k: v[:10] for k, v in ticker_options.items()},
        "readthroughs": readthroughs,
        "earnings_history": earnings_history,
        "stripe_payment_link": "https://buy.stripe.com/test_dRm7sKfO4cSU5hY9WheZ200",
    }

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
