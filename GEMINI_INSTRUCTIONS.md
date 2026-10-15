# Instructions for Gemini: Fix Cascadia Analytics iOS Pro Sync Issues

## Context
You're helping debug a Cloudflare Pages site (https://cascadia-analytics.pages.dev) with iOS-specific Pro authentication issues. The site uses Supabase for auth and has server-gated Pro content.

**Repo:** Pacificaxon/cascadia-analytics (main branch)  
**Local:** ~/workspace/cascadia-site/app.js

## Current State (2026-10-15)
✅ **Working:**
- Ticker pages show Pro data correctly (DCF targets, etc.)
- Public content loads fine when logged out
- Admin badge displays correctly
- All data verified present in data.js and pro-data.json

❌ **Broken (iOS only):**
1. Market Internals page shows Pro locked (teasers) even when user is admin
2. Morning Market Analysis visuals show "Visual unavailable" (gray)
3. Navigating Home → Market Internals → Home → Market Internals fails when logged in

## What to Do

### Step 1: Examine the auth flow
Read `~/workspace/cascadia-site/app.js` lines 40-160:
- `cookieStorage` object (custom Supabase storage for iOS ITP)
- `refreshAuth()` function (lines ~107-155)
- `isPro()` function (line ~33)
- The Proxy `D` object (lines ~80-100) that merges Pro data

**Key question:** Why does `isPro()` return `true` for `updateProBtn()` (shows "Admin") but `false` when the monitor route renders via `gated()`?

### Step 2: Check the Pro data fetch
Read `fetchProData()` (lines ~48-78):
- Fetches from `/api/pro-data` with Bearer token
- Flattens `sections.gex`, `sections.volatility_skew`, etc. into `PRO_DATA`

**Key question:** Is `PRO_DATA` actually being populated on iOS? Add console logging to verify.

### Step 3: Examine the monitor route
Read `route("monitor", ...)` (~line 802):
- 6 tracker panels, each wrapped in `gated()` (line ~948)
- GEX section uses `gated()` (line ~1532)
- Skew section uses `gated()` (line ~1554)
- Macro section uses `gatedSafe()` (already wrapped)

**Key question:** If `isPro()` is true, why do all `gated()` calls return teasers?

### Step 4: Propose a fix
Based on your analysis, provide:
1. The root cause (be specific about which line/function fails)
2. A code fix (show the exact edit)
3. Why your fix works (explain the iOS-specific behavior)

## Technical Details

### Supabase Setup
- URL: https://tlrfqoqefltxodoynqmh.supabase.co
- Auth uses cookie storage (not localStorage) for iOS ITP
- Profiles table: `user_id`, `is_pro`, `is_admin`
- User is admin: `is_pro=true`, `is_admin=true`

### Pro API
- Endpoint: `/api/pro-data` (Cloudflare Pages Function)
- Requires: `Authorization: Bearer <supabase_jwt>`
- Returns: `{ generated_at, sections: { gex, volatility_skew, ... } }`
- Verified working via direct browser test (returns 401 without token, as expected)

### Key Functions
```javascript
// Returns true only if proVerified === true (strict equality)
const isPro = () => proVerified === true;

// Shows teaser if not Pro, else returns HTML
function gated(title, desc, innerHtml) {
  if (!isPro()) return proTeaser(title, desc);
  return innerHtml;
}

// Safe version that catches HTML generation errors
function gatedSafe(title, desc, htmlFn) {
  if (!isPro()) return proTeaser(title, desc);
  try { return htmlFn(); } 
  catch (e) { return errorCard(); }
}
```

## Constraints
- Never use em dashes in code or comments
- Don't break existing functionality for logged-out users
- The fix must work on iOS Safari and Chrome
- Don't suggest localStorage (ITP blocks it)

## Deliverable
Provide a clear explanation of the root cause and the exact code changes needed. Focus on WHY `isPro()` behaves differently between the button update and route rendering on iOS.
