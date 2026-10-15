# Technical Brief: Cascadia Analytics iOS Issues
**Date:** 2026-10-15  
**Site:** https://cascadia-analytics.pages.dev  
**Repo:** Pacificaxon/cascadia-analytics  
**User:** Justin (admin, is_pro=true, is_admin=true in Supabase)

## Architecture
- **Frontend:** Cloudflare Pages (static site, `app.js` ~240KB, `data.js` ~7MB)
- **Pro API:** Cloudflare Pages Functions at `/api/pro-data` (requires Supabase JWT Bearer token)
- **Auth:** Supabase (`tlrfqoqefltxodoynqmh.supabase.co`), profiles table with `is_pro`, `is_admin`
- **Data flow:** Public data in `data.js` (loaded via `<script>`). Pro data fetched via `/api/pro-data` after auth, merged via Proxy.

## Issues Reported (iOS Safari/Chrome)

### 1. Market Internals navigation fails when logged in as Pro
**Symptom:** When logged out, Market Internals link works (shows free content + Pro teasers). When logged in as admin, clicking the link does nothing / page won't load. Works in new tab initially, but fails after navigating to Home and back.

**What I've tried:**
- Converted nav to direct anchor links (`<a href="#/monitor">`)
- Added `gatedSafe()` wrapper to prevent Pro section crashes from breaking the route
- Reverted Chart.js cleanup that was destroying charts on every render (broke navigation)
- Made `refreshAuth()` preserve Pro status on transient errors (was failing closed)

**Current hypothesis:** Pro status flickers due to Supabase auth state changes on iOS (ITP/background tab). The `onAuthStateChange` listener triggers `refreshAuth()` which may reset `proVerified` on transient failures.

### 2. Pro content shows locked despite Admin badge
**Symptom:** Top-right shows "Admin" badge (meaning `isPro()` returned true for the button), but Pro sections show "SEE PRO PLANS" lock screens (meaning `isPro()` returned false when route rendered).

**Root cause hypothesis:** Timing issue. `updateProBtn()` sees updated `proVerified=true`, but route HTML was built earlier with `proVerified=false`. The `render()` at end of `refreshAuth()` should fix this, but may not be working reliably on iOS.

### 3. Morning Market Analysis visuals fail
**Symptom:** Report shows red "Failed to load visual" (now gray "Visual unavailable") where charts should be. Affects macro, fed-funds, GEX, skew visuals.

**What I've verified:**
- `macroAnalysisHtml()` works with real data (tested in Node.js)
- `fedFundsHtml()` works with real data (tested in Node.js)
- Pro API returns well-formed GEX data with QQQ/SPY indices
- `embedAnalysisVisuals()` uses `getAttribute("data-embed-visual")` and has try-catch per visual

**Current state:** Changed red errors to gray "unavailable". Visuals still don't load on user's iOS device.

### 4. Price targets missing from screener
**Symptom:** Pro screener doesn't show Price, Base, Upside, Rating columns.

**Root cause:** `const TICKERS = D.tickers` evaluated once at startup, before Pro data loads. The Proxy merges `_dcf_targets` into `D.tickers`, but the static `TICKERS` const never updates.

**Fix applied:** Changed to `let TICKERS` with `refreshTickers()` called after Pro data loads in `refreshAuth()`. Pushed, awaiting user verification.

### 5. Macro wire article links not clickable
**Symptom:** Homepage article links work, but macro wire headlines aren't clickable.

**Root cause:** Macro wire called `newsRow()` without passing `url` parameter.

**Fix applied:** Added `url: m.url` to the macro wire `newsRow()` call. Pushed.

## Recent Changes (2026-10-15)
1. `ac12344` - Market analysis Pro gating with badge
2. `32dec29` - `gatedSafe()` wrapper for Pro macro section
3. `14405f0` - Defensive visual embedding (getAttribute, isolated draw errors)
4. `70bbae7` - Chart.js cleanup on route change (REVERTED - broke navigation)
5. `618c26d` - Visual failures show gray instead of red
6. `9319e88` - Deferred visual embedding via setTimeout (REVERTED)
7. `cb735de` - Reverted #4 and #6
8. `8879811` - TICKERS refresh after Pro load; macro wire URL fix
9. `8b32500` - Preserve Pro status on transient auth errors
10. `f3631a7` - Individual Pro gates for each Market Internals tracker

## Deleted Duplicate Deployment
User deleted the `cascadia-analytics` Cloudflare Worker (`cascadia-analytics.axoninvestmentresearch.workers.dev`) which was serving stale (Jan 2026) data with no Pro API (404). Only the Pages deployment remains.

## Key Code Locations
- Auth: `refreshAuth()` ~line 107, `isPro()` ~line 33, Proxy ~line 80
- Market Internals route: `route("monitor", ...)` ~line 802
- Visual embedding: `embedAnalysisVisuals()` ~line 554
- Pro API: `functions/api/pro-data.js`, data in `functions/pro-data.json`
- TICKERS: line 100 (now `let` with `refreshTickers()`)

## Questions for Gemini
1. Why would `isPro()` return different values for `updateProBtn()` vs route rendering in the same `render()` cycle on iOS?
2. What iOS-specific issues could prevent `document.querySelectorAll("[data-embed-visual]")` from finding placeholders, or cause `el.innerHTML = ...` to fail silently?
3. Is there a better pattern for Supabase auth on iOS that avoids ITP issues with localStorage sessions?
4. Why would Chart.js work on first page load but fail on subsequent navigations to the same route?
