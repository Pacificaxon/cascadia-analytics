// Shared Supabase JWT verification + Pro entitlement check for Pages Functions.
// Files prefixed with "_" are not routed by Cloudflare Pages; this module is
// imported by the routed function files in this directory.
//
// Expected environment variables (set in Cloudflare dashboard: Pages project
// > Settings > Environment variables):
//   SUPABASE_URL          e.g. https://tlrfqoqefltxodoynqmh.supabase.co
//   SUPABASE_ANON_KEY     Supabase anon/public key (used to validate user JWTs)
//   SUPABASE_SERVICE_KEY  Supabase service_role key (NEVER exposed to the browser)

export async function verifyPro(request, env) {
  const fail = (status, error) => ({
    ok: false,
    status,
    error,
    user_id: null,
    is_pro: false,
    is_admin: false,
  });

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY || !env.SUPABASE_ANON_KEY) {
    return fail(500, "server_misconfigured");
  }

  const auth = request.headers.get("Authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return fail(401, "missing_token");
  const token = m[1].trim();
  if (!token) return fail(401, "missing_token");

  const base = env.SUPABASE_URL.replace(/\/+$/, "");

  // 1. Validate the JWT server-side via Supabase Auth. This rejects expired,
  //    tampered, or revoked tokens without needing a JWT library.
  let user;
  try {
    const r = await fetch(base + "/auth/v1/user", {
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: "Bearer " + token,
      },
    });
    if (!r.ok) return fail(401, "invalid_token");
    user = await r.json();
  } catch (e) {
    return fail(502, "auth_unreachable");
  }
  if (!user || !user.id) return fail(401, "invalid_token");

  // 2. Check Pro entitlement via the service role key (server-side, RLS-proof).
  //    Admins are treated as Pro.
  try {
    const url =
      base +
      "/rest/v1/profiles?user_id=eq." +
      encodeURIComponent(user.id) +
      "&select=is_pro,is_admin";
    const r = await fetch(url, {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: "Bearer " + env.SUPABASE_SERVICE_KEY,
      },
    });
    if (!r.ok) return fail(502, "profile_lookup_failed");
    const rows = await r.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    const is_admin = !!(row && row.is_admin);
    const is_pro = !!(row && (row.is_pro || row.is_admin));
    return { ok: true, status: 200, error: null, user_id: user.id, is_pro, is_admin };
  } catch (e) {
    return fail(502, "profile_lookup_failed");
  }
}

export function jsonResponse(data, status, request) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  const origin = request.headers.get("Origin");
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return new Response(JSON.stringify(data), { status: status || 200, headers });
}

export function handleOptions(request) {
  const origin = request.headers.get("Origin") || "*";
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
