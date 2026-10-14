# Cascadia Analytics — Equity Research Website

Static site. No build step required beyond data regeneration.

## Structure
- `index.html` — app shell
- `styles.css` — dark institutional theme (mobile-first)
- `app.js` — SPA: home, ticker pages, screener, paywall, sandbox
- `data.js` — generated site data (do not edit by hand)
- `charts/` — generated chart images
- `notes/` — client note PDFs (25/31 tickers)
- `build.py` — regenerates `data.js` + `charts/` from JSON sources

## Regenerate data
```
python3 build.py
```

Data sources (all local):
- `~/workspace/fungraph-data/data.json` — DCF valuations
- `~/workspace/macro-relevance/*.json` — macro, news, internals, MAs, options, bellwethers, earnings
- `~/workspace/your_files/client-notes-manifest.json` — note mapping

## Deploy
Push to `main` — connect the repo to Netlify, Vercel, or Cloudflare Pages for auto-deploy.
