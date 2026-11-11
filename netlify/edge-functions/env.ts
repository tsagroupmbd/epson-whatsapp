import type { Config } from '@netlify/edge-functions'

// Serves the public Supabase connection details to the browser from Netlify
// environment variables, so they aren't hardcoded in the repo. Only the project
// URL and the anon/publishable key are exposed — both are designed to be public
// and protected by row level security. Never add service-role or WhatsApp keys here.
export default async () => {
  const env = {
    SUPABASE_URL: Netlify.env.get('SUPABASE_URL') ?? '',
    SUPABASE_ANON_KEY: Netlify.env.get('SUPABASE_ANON_KEY') ?? Netlify.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '',
  }
  return new Response(`window.__ENV = ${JSON.stringify(env)};`, {
    headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export const config: Config = { path: '/env.js' }
