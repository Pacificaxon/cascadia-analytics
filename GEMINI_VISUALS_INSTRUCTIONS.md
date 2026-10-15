# Instructions for Gemini: Fix Morning Market Analysis Visuals

## Problem
The Morning Market Analysis page (`#/analysis`) shows grey "Visual unavailable" text instead of loading the 4 embedded visuals. This happens even when the user is logged in as Pro with `PRO_DATA` loaded.

## Current State
- Pro auth works: `isPro()=true`, `PRO_DATA` is loaded on monitor page
- `PRO_DATA` was being cleared on navigation; fixed to preserve across navigations (commit 7d2ff46)
- Visuals still show "unavailable" on analysis page
- Debug mode shows reasons in the UI when `?debug=1` is in the hash

## Code Location
File: `~/workspace/cascadia-site/app.js`
Function: `embedAnalysisVisuals()` (around line 670)

## What to Investigate

### 1. Data Availability
The function checks these conditions:
```javascript
if (key === "fed-funds" && D.fed_funds && D.fed_funds.available)
if (key === "macro" && D.macro_indicators)
if (key === "gex" && D.gex_data && D.gex_data.indices)
if (key === "skew" && D.skew_data && D.skew_data.indices)
```

Check:
- Does `PRO_DATA` actually contain `fed_funds`, `gex_data`, `skew_data` after the flattening in `fetchProData()`?
- The flattening code (lines 118-125):
  ```javascript
  if (sections.gex) {
    flat.gex_data = sections.gex.gex_data;
    flat.ticker_gex = sections.gex.ticker_gex;
  }
  ```
- Is the structure `sections.gex.gex_data` correct? Or is it `sections.gex` directly?
- Check `functions/pro-data.json` to see the actual structure

### 2. The D Proxy
The `D` object is a Proxy that merges public `SITE_DATA` with `PRO_DATA`:
```javascript
const D = new Proxy({...}, {
  get(target, prop) {
    if (PRO_DATA && prop in PRO_DATA) return PRO_DATA[prop];
    return target[prop];
  }
});
```

Check:
- Is `PRO_DATA` populated BEFORE `embedAnalysisVisuals()` runs?
- The function runs inside `requestAnimationFrame()` - is this too early?
- Does the Proxy correctly return Pro data for `gex_data`, `skew_data`, etc.?

### 3. Timing Issue
The analysis route renders HTML with placeholders:
```html
<div data-embed-visual="gex"></div>
```

Then `embedAnalysisVisuals()` is called. Check:
- When is `embedAnalysisVisuals()` called relative to `refreshAuth()` completing?
- If `PRO_DATA` is null when the function runs, all visuals fail
- The function is called synchronously after `app.innerHTML = h`, but `PRO_DATA` might not be loaded yet

### 4. Specific Visual Functions
Each visual calls a generator function:
- `fedFundsHtml(D.fed_funds)` - check if this function exists and works
- `macroAnalysisHtml(D.macro_indicators)` - check if this exists
- `gexTrackerHtml(D.gex_data)` - check if this exists
- `skewTrackerHtml(D.skew_data)` - check if this exists

If any of these throw, the catch block shows "Visual unavailable."

## What to Do

1. **Verify data structure**: Check `functions/pro-data.json` to see the exact structure of `sections.gex`, `sections.volatility_skew`, etc. Compare with what `fetchProData()` expects.

2. **Add logging**: The debug mode already shows reasons like `(gex_data.indices=false)`. Have the user visit `#/analysis?debug=1` and report what reasons appear.

3. **Fix the root cause**: Based on your findings:
   - If data structure mismatch: fix the flattening in `fetchProData()`
   - If timing issue: delay `embedAnalysisVisuals()` until `PRO_DATA` is loaded, or re-run it after `refreshAuth()` completes
   - If function missing: implement the missing HTML generator

4. **Test**: The fix should make all 4 visuals (fed-funds, macro, gex, skew) load correctly on the analysis page for Pro users.

## Key Files
- `~/workspace/cascadia-site/app.js` - main application
- `~/workspace/cascadia-site/functions/pro-data.json` - Pro data structure
- `~/workspace/cascadia-site/functions/api/pro-data.js` - API endpoint (if exists)

## Constraints
- Never use em dashes in code or comments
- Don't break the monitor page which is now working
- The fix must work on iOS Safari
- Preserve the existing Pro gating (visuals are Pro-only)
