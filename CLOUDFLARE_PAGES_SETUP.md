# Cloudflare Pages setup for cascadia-analytics

The site is a pure static site (no build step needed server-side: `build.py`
runs locally and commits `data.js`). Cloudflare Pages can serve it two ways;
**Option A** is recommended for the automated flows.

## Option A — Direct upload (recommended)

No GitHub connection needed. Deploys are triggered by the crons via
`deploy-cloudflare.sh`, which rebuilds `data.js` and uploads the directory.

1. Create a Cloudflare account at https://dash.cloudflare.com/sign-up (if none).
2. **Workers & Pages** → **Create** → **Pages** → **Upload assets**.
   Name the project `cascadia-analytics`. Upload any placeholder to finish
   creation (the real deploy comes from the script).
3. **My Profile** (top-right) → **API Tokens** → **Create Token** →
   use the **Edit Cloudflare Workers** template (includes Pages:Edit),
   or a custom token with `Account / Cloudflare Pages / Edit` on the account.
   Copy the token → `CLOUDFLARE_API_TOKEN`.
4. **Workers & Pages** → overview → copy the **Account ID** (right sidebar)
   → `CLOUDFLARE_ACCOUNT_ID`.
5. On this machine:
   ```bash
   export CLOUDFLARE_API_TOKEN="<token>"
   export CLOUDFLARE_ACCOUNT_ID="<account id>"
   cd ~/workspace/cascadia-site && ./deploy-cloudflare.sh
   ```
   Note the `https://cascadia-analytics.<subdomain>.pages.dev` URL it prints.

## Option B — GitHub-connected (auto-deploy on push)

1. **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
   Authorize the `Pacificaxon/cascadia-analytics` repo.
2. Build settings:
   - **Build command:** (leave empty — `data.js` is committed)
   - **Build output directory:** `/` (repo root)
3. Every `git push` to `main` auto-deploys. Note: the daily/hourly crons
   already push to GitHub, so this keeps the current flow unchanged.

## After either option

- **Custom domain (optional):** Pages project → **Custom domains** → add
  your domain. Then repoint the short link
  `https://cascadiaanalytics.s.gy/equity-research` at the new Pages URL.
- **Legal pages:** `privacy.html` and `terms.html` hardcode
  `https://cascadia-analytics.netlify.app`. Update both to the new URL
  (or the canonical short link) once it is known.
- **Netlify:** leave the Netlify site in place until the Pages URL is
  verified, then the Netlify project can be deleted to avoid confusion.
- **Cron updates:** point the deploy steps at `./deploy-cloudflare.sh`
  (hourly intraday-macro-watch, daily 6:09 AM refresh, small-midcap close
  deploy). Keep `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` in the
  cron environment, never in chat logs.

## Migration audit (2026-10-14)

- `netlify.toml`: only set `publish` dir. **No redirects, headers, functions,
  or edge config to translate.**
- No Netlify Forms / Identity / serverless functions in use.
- `index.html`, `app.js`: no absolute `*.netlify.app` references.
- Assets: 31 tickers in `data.js`, 28 note PDFs in `notes/`, 5 market
  internals charts in `charts/`, favicons, logos, `privacy.html`, `terms.html`,
  `earnings_calendar.json`, `financials.json`.
- Stripe: only a Payment Link URL in `data.js` (`buy.stripe.com/...`) —
  unaffected by the host change.
