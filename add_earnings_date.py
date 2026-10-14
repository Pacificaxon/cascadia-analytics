#!/usr/bin/env python3
"""Fetch the next earnings date for a ticker and add it to earnings_calendar.json.

Usage: python3 add_earnings_date.py TICKER [TICKER ...]
Looks up dates via the Nasdaq earnings calendar API (falls back to manual entry).

When adding a new ticker to site coverage, run this so the homepage
earnings calendar picks it up on the next build.
"""
import json
import os
import sys
import urllib.request
import datetime
import time

HERE = os.path.dirname(os.path.abspath(__file__))
CAL_PATH = os.path.join(HERE, "earnings_calendar.json")
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"}


def nasdaq_lookup(ticker, days_ahead=120):
    """Scan the Nasdaq earnings calendar for the ticker's next date."""
    today = datetime.date.today()
    for offset in range(days_ahead):
        d = today + datetime.timedelta(days=offset)
        ds = d.isoformat()
        url = f"https://api.nasdaq.com/api/calendar/earnings?date={ds}"
        try:
            req = urllib.request.Request(url, headers={**UA, "Accept": "application/json"})
            resp = urllib.request.urlopen(req, timeout=15)
            data = json.loads(resp.read().decode())
            rows = (data.get("data") or {}).get("rows") or []
            for r in rows:
                if (r.get("symbol") or "").upper().strip() == ticker.upper():
                    return ds
        except Exception:
            pass
        time.sleep(0.15)
    return None


def main():
    tickers = [t.upper() for t in sys.argv[1:]]
    if not tickers:
        print("Usage: python3 add_earnings_date.py TICKER [TICKER ...]")
        sys.exit(1)
    try:
        with open(CAL_PATH, encoding="utf-8") as f:
            cal = json.load(f)
    except FileNotFoundError:
        cal = {}
    for tk in tickers:
        if tk in cal and not tk.startswith("_"):
            print(f"{tk}: already in calendar ({cal[tk]}) — skipping")
            continue
        print(f"{tk}: looking up...", flush=True)
        date = nasdaq_lookup(tk)
        if date:
            cal[tk] = date
            print(f"{tk}: {date}")
        else:
            print(f"{tk}: not found on Nasdaq calendar — add manually to {CAL_PATH}")
    # keep metadata keys at the end
    meta = {k: cal.pop(k) for k in list(cal) if k.startswith("_")}
    cal = dict(sorted(cal.items()))
    cal.update(meta)
    with open(CAL_PATH, "w", encoding="utf-8") as f:
        json.dump(cal, f, indent=2)
    print(f"Saved {CAL_PATH}")


if __name__ == "__main__":
    main()
