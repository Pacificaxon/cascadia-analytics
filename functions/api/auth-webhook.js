// Supabase Auth webhook receiver for new user signups.
// Configure in Supabase Dashboard: Authentication > Webhooks > Add webhook
//   Event: user.created, URL: https://cascadia-analytics.pages.dev/api/auth-webhook
// Stores the signup event; a cron picks it up and notifies Justin in chat.

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const record = body.record || {};
    const email = record.email;
    if (!email) {
      return new Response(JSON.stringify({ ok: false, error: "no email" }), { status: 400 });
    }

    // Store in Supabase via service key so the notifier cron can pick it up.
    // Uses a lightweight key-value approach in the existing pro-data KV-like table if present,
    // otherwise falls back to logging (cron also polls auth.users directly as backup).
    const base = (env.SUPABASE_URL || "").replace(/\/+$/, "");
    if (base && env.SUPABASE_SERVICE_KEY) {
      try {
        await fetch(base + "/rest/v1/signup_events", {
          method: "POST",
          headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: "Bearer " + env.SUPABASE_SERVICE_KEY,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ email, notified: false }),
        });
      } catch (e) {
        // Table may not exist yet; the polling cron covers this case.
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false }), { status: 500 });
  }
}
