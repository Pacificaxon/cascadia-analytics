// GET /api/pro-data[?section=<name>]
// Returns Pro-only data sections to authenticated Pro users.
// Requires: Authorization: Bearer <Supabase user JWT>
//   200 -> { "generated_at": ..., "sections": { ... } }   (or one section if ?section= given)
//   401 -> { "error": "missing_token" | "invalid_token" | ... }
//   403 -> { "error": "forbidden" }   (valid user, not Pro)
//   500 -> { "error": "server_misconfigured" }
//
// Data source: ../pro-data.json (bundled at deploy time; never served as a
// static asset because it lives inside functions/).
//
// CPU NOTE: pro-data.json is ~8.8MB. JSON.stringify() of that payload costs
// far more than the free tier's 10ms CPU budget per request, which caused
// "Exceeded CPU Time Limits" errors. The fix: serialize ONCE at module load
// (one isolate startup cost, amortized over all requests on that isolate)
// and serve the cached strings per request. Per-request CPU is now just the
// Supabase auth fetches (I/O, not CPU) plus Response construction.

import { verifyPro, jsonResponse, handleOptions } from "./_auth.js";
import proData from "../pro-data.json";

const GENERATED_AT = proData.generated_at || null;
const SECTIONS = proData.sections || {};

// Pre-serialized response bodies, built once per isolate.
const FULL_BODY = JSON.stringify({ generated_at: GENERATED_AT, sections: SECTIONS });
const SECTION_BODIES = {};
for (const name of Object.keys(SECTIONS)) {
  SECTION_BODIES[name] = JSON.stringify({
    generated_at: GENERATED_AT,
    section: name,
    data: SECTIONS[name],
  });
}

function cachedJsonResponse(body, status, request) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  const origin = request.headers.get("Origin");
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return new Response(body, { status: status || 200, headers });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, 405, request);
  }

  const v = await verifyPro(request, env);
  if (!v.ok) {
    return jsonResponse({ error: v.error }, v.status, request);
  }
  if (!v.is_pro) {
    return jsonResponse({ error: "forbidden" }, 403, request);
  }

  const url = new URL(request.url);
  const only = url.searchParams.get("section");

  if (only) {
    if (!Object.prototype.hasOwnProperty.call(SECTION_BODIES, only)) {
      return jsonResponse({ error: "unknown_section" }, 404, request);
    }
    return cachedJsonResponse(SECTION_BODIES[only], 200, request);
  }

  return cachedJsonResponse(FULL_BODY, 200, request);
}
