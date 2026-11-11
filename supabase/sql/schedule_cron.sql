-- Runs the sending worker every minute so scheduled campaigns start on time and
-- in-progress campaigns keep sending even when no admin has the dashboard open.
--
-- Prerequisites (Supabase Dashboard → Database → Extensions): enable pg_cron and pg_net.
-- Store the project URL and the CRON_SECRET (the same value you set as an Edge Function
-- secret) in Vault so they never appear in plain SQL:
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<your-cron-secret>', 'cron_secret');

select cron.schedule(
  'epson-whatsapp-sender-worker',
  '* * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-campaign',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
  $$
);

-- To remove: select cron.unschedule('epson-whatsapp-sender-worker');
