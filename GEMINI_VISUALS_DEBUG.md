# Instructions for Gemini: Debug Morning Briefing Visuals

## Problem
The Morning Briefing page (`#/analysis`) shows "Visual unavailable" grey text instead of the 4 embedded visuals (macro, fed-funds, gex, skew). PRO_DATA is confirmed loaded, placeholders exist in the HTML, but visuals still fail.

## What We Know
- `PRO_DATA: loaded` (confirmed via debug panel)
- `ProDataError: none` (API fetch succeeded)
- Placeholders exist in report HTML: `['macro', 'fed-funds', 'gex', 'skew']`
- Data structure verified correct: `sections.gex.gex_data.indices` exists with QQQ/SPY/SPX
- `embedAnalysisVisuals()` is called but visuals still show "unavailable"

## Code to Examine

### 1. The embed function
Location: `~/workspace/cascadia-site/app.js`, function `embedAnalysisVisuals()` (around line 681)

Current implementation:
```javascript
function embedAnalysisVisuals() {
  requestAnimationFrame(async () => {
   await ensureProData();
   let placeholders;
   try {
    const container = document.getElementById("app") || document;
    placeholders = container.querySelectorAll("[data-embed-visual]");
   } catch (e) {
    console.error("Visual placeholder query failed:", e);
    return;
   }
   if (!placeholders.length) return;
   placeholders.forEach((el) => {
    // ... tries each visual type
   });
  });
}
```

### 2. The data checks
For each placeholder, it checks:
```javascript
if (key === "fed-funds" && D.fed_funds && D.fed_funds.available)
if (key === "macro" && D.macro_indicators)
if (key === "gex" && D.gex_data && D.gex_data.indices)
if (key === "skew" && D.skew_data && D.skew_data.indices)
```

### 3. The D Proxy
```javascript
const D = new Proxy({...}, {
  get(target, prop) {
   if (PRO_DATA && prop in PRO_DATA) return PRO_DATA[prop];
   return target[prop];
  }
});
```

## What to Check

### A. Is the Proxy working?
Add temporary logging in `embedAnalysisVisuals()`:
```javascript
console.log("D.gex_data:", !!D.gex_data);
console.log("D.gex_data.indices:", !!(D.gex_data && D.gex_data.indices));
console.log("PRO_DATA keys:", PRO_DATA ? Object.keys(PRO_DATA) : "null");
```

The user can't see console on iOS, so instead modify the "Visual unavailable" message to include the check results (we already have debug mode that shows reasons).

### B. Are the HTML generator functions working?
Each visual calls a generator:
- `fedFundsHtml(D.fed_funds)`
- `macroAnalysisHtml(D.macro_indicators)` 
- `gexTrackerHtml(D.gex_data)`
- `skewTrackerHtml(D.skew_data)`

Check if these functions exist and don't throw. If any throws, the catch block shows "Visual unavailable."

Test by calling each directly in the console (or adding try-catch with specific error messages).

### C. Is there a timing issue with the Proxy?
The `D` Proxy checks `PRO_DATA` at access time. If `embedAnalysisVisuals()` runs before `PRO_DATA` is assigned (even though `ensureProData()` was awaited), there could be a race.

Check: does `ensureProData()` actually assign to the global `PRO_DATA` variable, or does it assign to a local copy?

### D. Are the placeholders being found?
The function queries `container.querySelectorAll("[data-embed-visual]")`. 

Check:
- Is `document.getElementById("app")` returning the correct container?
- Are the placeholders inside `#app` or outside it?
- Does the query return 4 elements or 0?

Add logging: `console.log("Found placeholders:", placeholders.length)`

## Specific Questions to Answer

1. When `embedAnalysisVisuals()` runs, what is the value of `D.gex_data`? Is it undefined, null, or the actual data?
2. Do the generator functions (`gexTrackerHtml`, etc.) exist and work when called manually?
3. Are there any JavaScript errors in the console when the page loads? (The user can't check, so add error display to the UI)
4. Is the `requestAnimationFrame` callback actually executing, or is it being cancelled?

## Files Needed
- `~/workspace/cascadia-site/app.js` (full file, ~4200 lines)
- `~/workspace/cascadia-site/functions/pro-data.json` (to verify data structure)

## Constraints
- Never use em dashes
- Don't break the working monitor page
- Must work on iOS Safari
- The fix should not require the user to manually retry
