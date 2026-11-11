# AGENTS.md

## Architecture
- `public/` is a static single-page app with hash routing.
  - `js/main.js` handles boot, auth gate, the app shell and routes.
  - `js/api.js` is the only data layer: Supabase queries plus Edge Function calls.
  - `js/ui.js` holds helpers for escaping, icons, modals, toasts, formatting and the WhatsApp preview.
  - `js/runner.js` keeps calling `send-campaign` from the browser while a campaign is sending.
  - `js/pages/*.js` export `default render(root, ctx)` and may return a cleanup function.
- `supabase/migrations` holds the schema, RLS policies (`is_admin()`), the reporting views `group_stats` and `campaign_reports`, and RPCs. The RPCs `queue_campaign`, `claim_messages` and `apply_message_status` are service-role only.
- `supabase/functions`:
  - `send-campaign` is the time-boxed (~50s) worker. It is called by an admin or by pg_cron with `x-cron-secret`.
  - `whatsapp-webhook` takes Meta status updates and STOP opt-outs, verified with HMAC.
  - `whatsapp-admin` handles template sync, submit and delete, test sends and connection checks.
  - `_shared` holds code used by all three.
- `netlify/edge-functions/env.ts` exposes only the public Supabase URL and anon key.

## Conventions and decisions
- Never put service-role or WhatsApp secrets in frontend code, and never add them to `/env.js`.
- Escape every value interpolated into HTML with `esc()`.
- Phones are stored as E.164 digits without `+`.
- Message status only moves forward (sent → delivered → read). Failed is terminal.
- `verify_jwt = false` because each function does its own authentication.
- No build step and no framework. Keep it vanilla.
