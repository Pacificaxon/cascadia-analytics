// File gating middleware (2026-10-27): pages stay public, files do not.
// - /notes/* and /scorecards/* require Pro (same verifyPro check as /api/pro-data).
// - Top-level data and code files (*.json except manifest.json, *.py) require
//   at least a valid signed-in account (any tier). manifest.json stays public:
//   the service worker precaches it and browsers fetch it anonymously.
// - Everything else (index.html, app.js, data.js, styles, images, memo-images,
//   /api/* which carry their own auth) passes through untouched.
// Requests without a usable token get 401 (missing/invalid) or 403 (not Pro),
// never the file bytes. Gated files are served with no-store so a Pro PDF is
// not left in a shared cache.
import { verifyPro } from "./api/_auth.js";

function denied(status, error) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  const isNotes = path.startsWith("/notes/") || path.startsWith("/scorecards/");
  const isTopDataOrCode =
    /^\/[^\/]+\.(json|py)$/.test(path) && path !== "/manifest.json";

  if (!isNotes && !isTopDataOrCode) return context.next();
  if (request.method !== "GET" && request.method !== "HEAD") {
    return denied(405, "method_not_allowed");
  }

  const v = await verifyPro(request, env);
  if (!v.ok) return denied(v.status || 401, v.error || "missing_token");
  if (isNotes && !v.is_pro) return denied(403, "forbidden");

  const res = await context.next();
  const headers = new Headers(res.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(res.body, { status: res.status, headers });
}
