// GET /api/pro-check
// Lightweight Pro entitlement check for UI gating.
// Requires: Authorization: Bearer <Supabase user JWT>
// Returns:  { "is_pro": true|false }   (plus "error" on failure)

import { verifyPro, jsonResponse, handleOptions } from "./_auth.js";

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "GET") {
    return jsonResponse({ is_pro: false, error: "method_not_allowed" }, 405, request);
  }

  const v = await verifyPro(request, env);
  if (!v.ok) {
    return jsonResponse({ is_pro: false, error: v.error }, v.status, request);
  }
  return jsonResponse({ is_pro: v.is_pro }, 200, request);
}
