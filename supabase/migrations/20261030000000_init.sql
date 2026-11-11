-- EPSON WHATSAPP SENDER — initial schema
-- Apply with `supabase db push` or paste into the Supabase SQL editor.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Admin access
-- ---------------------------------------------------------------------------
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Contacts & groups
-- ---------------------------------------------------------------------------
create table if not exists public.contacts (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  phone       text not null unique check (phone ~ '^[1-9][0-9]{6,14}$'),  -- E.164 digits, no "+"
  email       text,
  attributes  jsonb not null default '{}'::jsonb,
  opted_in    boolean not null default true,
  opted_out_at timestamptz,
  source      text not null default 'manual',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists contacts_name_idx on public.contacts (lower(name));
create index if not exists contacts_created_idx on public.contacts (created_at desc);
create trigger contacts_touch before update on public.contacts
  for each row execute function public.touch_updated_at();

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  color       text not null default '#25D366',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger groups_touch before update on public.groups
  for each row execute function public.touch_updated_at();

create table if not exists public.contact_groups (
  contact_id uuid not null references public.contacts (id) on delete cascade,
  group_id   uuid not null references public.groups (id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (contact_id, group_id)
);
create index if not exists contact_groups_group_idx on public.contact_groups (group_id);

-- ---------------------------------------------------------------------------
-- WhatsApp message templates (mirrors Meta's template model)
-- ---------------------------------------------------------------------------
create table if not exists public.templates (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (name ~ '^[a-z0-9_]{1,512}$'),
  language         text not null default 'en_US',
  category         text not null default 'MARKETING'
                     check (category in ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  status           text not null default 'DRAFT'
                     check (status in ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED', 'IN_APPEAL')),
  header_type      text not null default 'NONE'
                     check (header_type in ('NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT')),
  header_text      text,
  body             text not null,
  footer           text,
  buttons          jsonb not null default '[]'::jsonb,
  examples         jsonb not null default '{}'::jsonb,   -- { header: [..], body: [..] } sample values for Meta review
  components       jsonb,                                -- raw components as returned by Meta
  meta_template_id text,
  rejected_reason  text,
  last_synced_at   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (name, language)
);
create trigger templates_touch before update on public.templates
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Campaigns & messages
-- ---------------------------------------------------------------------------
create table if not exists public.campaigns (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  description      text,
  template_id      uuid references public.templates (id) on delete set null,
  group_ids        uuid[] not null default '{}',
  variable_mapping jsonb not null default '{"header": [], "body": []}'::jsonb,
  header_media_url text,
  status           text not null default 'draft'
                     check (status in ('draft', 'scheduled', 'sending', 'paused', 'completed', 'cancelled', 'failed')),
  scheduled_at     timestamptz,
  started_at       timestamptz,
  completed_at     timestamptz,
  last_error       text,
  created_by       uuid references auth.users (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists campaigns_status_idx on public.campaigns (status, scheduled_at);
create trigger campaigns_touch before update on public.campaigns
  for each row execute function public.touch_updated_at();

create table if not exists public.messages (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references public.campaigns (id) on delete cascade,
  contact_id    uuid references public.contacts (id) on delete set null,
  phone         text not null,
  status        text not null default 'queued'
                  check (status in ('queued', 'sending', 'sent', 'delivered', 'read', 'failed')),
  wa_message_id text unique,
  error_code    text,
  error_message text,
  sent_at       timestamptz,
  delivered_at  timestamptz,
  read_at       timestamptz,
  failed_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (campaign_id, contact_id)
);
create index if not exists messages_campaign_status_idx on public.messages (campaign_id, status);
create index if not exists messages_created_idx on public.messages (created_at);
create trigger messages_touch before update on public.messages
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Settings (singleton row). API secrets are NOT stored here — they live in
-- Supabase Edge Function secrets.
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  id                   int primary key default 1 check (id = 1),
  business_name        text not null default 'EPSON',
  default_country_code text,
  default_language     text not null default 'en_US',
  timezone             text not null default 'UTC',
  batch_size           int  not null default 50 check (batch_size between 1 and 500),
  messages_per_second  numeric not null default 10 check (messages_per_second > 0 and messages_per_second <= 80),
  honor_stop_keywords  boolean not null default true,
  updated_at           timestamptz not null default now()
);
insert into public.app_settings (id) values (1) on conflict do nothing;
create trigger app_settings_touch before update on public.app_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security: only admins can read or write anything.
-- Edge Functions use the service role and bypass RLS.
-- ---------------------------------------------------------------------------
alter table public.admin_users    enable row level security;
alter table public.contacts       enable row level security;
alter table public.groups         enable row level security;
alter table public.contact_groups enable row level security;
alter table public.templates      enable row level security;
alter table public.campaigns      enable row level security;
alter table public.messages       enable row level security;
alter table public.app_settings   enable row level security;

create policy "admins read own admin row" on public.admin_users
  for select to authenticated using (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['contacts', 'groups', 'contact_groups', 'templates', 'campaigns', 'messages', 'app_settings'] loop
    execute format(
      'create policy "admins full access" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Reporting views (security_invoker so RLS still applies)
-- ---------------------------------------------------------------------------
create or replace view public.group_stats with (security_invoker = true) as
select g.*,
       count(cg.contact_id)                          as member_count,
       count(cg.contact_id) filter (where c.opted_in) as opted_in_count
from public.groups g
left join public.contact_groups cg on cg.group_id = g.id
left join public.contacts c on c.id = cg.contact_id
group by g.id;

create or replace view public.campaign_reports with (security_invoker = true) as
select c.*,
       t.name     as template_name,
       t.language as template_language,
       count(m.id)                                                         as total,
       count(m.id) filter (where m.status in ('queued', 'sending'))        as pending,
       count(m.id) filter (where m.status in ('sent', 'delivered', 'read')) as sent,
       count(m.id) filter (where m.status in ('delivered', 'read'))        as delivered,
       count(m.id) filter (where m.status = 'read')                        as read,
       count(m.id) filter (where m.status = 'failed')                      as failed
from public.campaigns c
left join public.templates t on t.id = c.template_id
left join public.messages m on m.campaign_id = c.id
group by c.id, t.name, t.language;

create or replace function public.dashboard_stats(p_days int default 14)
returns json
language sql stable security invoker
set search_path = public
as $$
  select json_build_object(
    'contacts',            (select count(*) from contacts),
    'opted_in',            (select count(*) from contacts where opted_in),
    'groups',              (select count(*) from groups),
    'templates_approved',  (select count(*) from templates where status = 'APPROVED'),
    'campaigns',           (select count(*) from campaigns),
    'campaigns_active',    (select count(*) from campaigns where status in ('sending', 'scheduled')),
    'messages', (
      select json_build_object(
        'total',     count(*),
        'pending',   count(*) filter (where status in ('queued', 'sending')),
        'sent',      count(*) filter (where status in ('sent', 'delivered', 'read')),
        'delivered', count(*) filter (where status in ('delivered', 'read')),
        'read',      count(*) filter (where status = 'read'),
        'failed',    count(*) filter (where status = 'failed'))
      from messages),
    'daily', (
      select coalesce(json_agg(d order by d.day), '[]'::json)
      from (
        select g.day::date as day,
               count(m.id) filter (where m.status = 'sent')      as sent,
               count(m.id) filter (where m.status = 'delivered') as delivered,
               count(m.id) filter (where m.status = 'read')      as read,
               count(m.id) filter (where m.status = 'failed')    as failed
        from generate_series(current_date - (p_days - 1), current_date, interval '1 day') as g(day)
        left join messages m on m.created_at::date = g.day::date
        group by g.day
      ) d)
  );
$$;

create or replace function public.campaign_audience_count(p_group_ids uuid[])
returns int
language sql stable security invoker
set search_path = public
as $$
  select count(distinct c.id)::int
  from contacts c
  join contact_groups cg on cg.contact_id = c.id
  where cg.group_id = any (p_group_ids) and c.opted_in;
$$;

-- ---------------------------------------------------------------------------
-- Sending pipeline helpers (called only by Edge Functions with the service role)
-- ---------------------------------------------------------------------------
create or replace function public.queue_campaign(p_campaign uuid)
returns int
language plpgsql security definer
set search_path = public
as $$
declare n int;
begin
  insert into messages (campaign_id, contact_id, phone)
  select distinct on (c.id) p_campaign, c.id, c.phone
  from campaigns k
  join contact_groups cg on cg.group_id = any (k.group_ids)
  join contacts c on c.id = cg.contact_id
  where k.id = p_campaign and c.opted_in
  on conflict (campaign_id, contact_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Atomically claim a batch of queued messages so parallel workers never double-send.
create or replace function public.claim_messages(p_campaign uuid, p_limit int)
returns setof public.messages
language sql security definer
set search_path = public
as $$
  update messages set status = 'sending'
  where id in (
    select id from messages
    where campaign_id = p_campaign and status = 'queued'
    order by created_at
    limit p_limit
    for update skip locked)
  returning *;
$$;

-- Apply a webhook status update; statuses only move forward (sent → delivered → read).
create or replace function public.apply_message_status(
  p_wa_id text, p_status text, p_ts timestamptz,
  p_error_code text default null, p_error_message text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  new_rank int := case p_status when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else 0 end;
begin
  if p_status = 'failed' then
    update messages
       set status = 'failed', failed_at = p_ts, error_code = p_error_code, error_message = p_error_message
     where wa_message_id = p_wa_id;
    return;
  end if;

  update messages m
     set status = case
                    when m.status <> 'failed'
                     and new_rank > (case m.status when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else 0 end)
                    then p_status else m.status end,
         sent_at      = coalesce(m.sent_at, p_ts),
         delivered_at = case when new_rank >= 2 then coalesce(m.delivered_at, p_ts) else m.delivered_at end,
         read_at      = case when new_rank = 3 then coalesce(m.read_at, p_ts) else m.read_at end
   where m.wa_message_id = p_wa_id;
end $$;

revoke execute on function public.queue_campaign(uuid) from public, anon, authenticated;
revoke execute on function public.claim_messages(uuid, int) from public, anon, authenticated;
revoke execute on function public.apply_message_status(text, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.queue_campaign(uuid) to service_role;
grant execute on function public.claim_messages(uuid, int) to service_role;
grant execute on function public.apply_message_status(text, text, timestamptz, text, text) to service_role;
