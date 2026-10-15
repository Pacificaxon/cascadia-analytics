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

import { verifyPro, jsonResponse, handleOptions } from "./_auth.js";
import proData from "../pro-data.json";

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

  const sections = proData.sections || {};
  const url = new URL(request.url);
  const only = url.searchParams.get("section");

  if (only) {
    if (!Object.prototype.hasOwnProperty.call(sections, only)) {
      return jsonResponse({ error: "unknown_section" }, 404, request);
    }
    return jsonResponse(
      { generated_at: proData.generated_at || null, section: only, data: sections[only] },
      200,
      request
    );
  }

  return jsonResponse(
    { generated_at: proData.generated_at || null, sections },
    200,
    request
  );
}
