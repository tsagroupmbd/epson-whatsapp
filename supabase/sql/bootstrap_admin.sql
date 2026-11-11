-- Grant dashboard access to an existing Supabase Auth user.
-- 1. Create the user in Supabase Dashboard → Authentication → Users (email + password).
-- 2. Replace the email below and run this in the SQL editor.

insert into public.admin_users (user_id)
select id from auth.users where email = 'admin@example.com'
on conflict do nothing;
