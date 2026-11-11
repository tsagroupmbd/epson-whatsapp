# EPSON WHATSAPP SENDER

Admin dashboard for sending WhatsApp bulk campaigns on the **official Meta WhatsApp Cloud API**. You manage contacts, groups, Excel/CSV imports, templates, campaigns, schedules and delivery reports.

## Tech
- Frontend: plain HTML, CSS and ES-module JavaScript in `public/`, using supabase-js from a CDN and SheetJS for Excel files. Hosted on Netlify.
- Backend: Supabase PostgreSQL with row-level security (`supabase/migrations`) and Supabase Edge Functions on Deno (`supabase/functions`).
- A Netlify edge function (`netlify/edge-functions/env.ts`) serves the public Supabase URL and anon key at `/env.js`.

## Setup
1. `supabase link --project-ref <ref>` then `supabase db push` to apply the migration. You can also paste the migration into the SQL editor.
2. Create an Auth user, then run `supabase/sql/bootstrap_admin.sql` with that user's email.
3. Copy `supabase/functions/.env.example` to `.env`, fill in the values, then run `supabase secrets set --env-file supabase/functions/.env`.
4. `supabase functions deploy send-campaign whatsapp-webhook whatsapp-admin`
5. In Netlify, set the environment variables `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
6. In Meta's WhatsApp configuration, set the webhook URL to `https://<ref>.supabase.co/functions/v1/whatsapp-webhook`, use your verify token, and subscribe to `messages`.
7. Enable `pg_cron` and `pg_net`, store the Vault secrets, and run `supabase/sql/schedule_cron.sql` so scheduled campaigns go out.

## Run locally
`netlify dev --port 8889`. If the Supabase environment variables aren't set, the app shows a setup screen where you can enter the URL and anon key. They are saved in that browser only.

## Roadmap
- Two-way reply inbox
- Media uploads for template headers
- Multiple admin roles
- Per-contact message history
