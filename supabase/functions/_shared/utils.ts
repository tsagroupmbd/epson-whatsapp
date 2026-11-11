import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export function corsHeaders(req: Request): Record<string, string> {
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '*').split(',').map((s) => s.trim())
  const origin = req.headers.get('origin') ?? ''
  const allowOrigin = allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : allowed[0]
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    Vary: 'Origin',
  }
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

export function handleError(req: Request, err: unknown): Response {
  if (err instanceof HttpError) return json(req, { error: err.message }, err.status)
  console.error(err)
  return json(req, { error: err instanceof Error ? err.message : 'Unexpected error' }, 500)
}

export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Verifies the caller's Supabase session and that they are listed in admin_users. */
export async function requireAdmin(req: Request, db: SupabaseClient) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'Missing authorization')
  const { data, error } = await db.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'Invalid or expired session')
  const { data: admin } = await db.from('admin_users').select('user_id').eq('user_id', data.user.id).maybeSingle()
  if (!admin) throw new HttpError(403, 'This account is not an administrator')
  return data.user
}

export function isCronRequest(req: Request): boolean {
  const secret = Deno.env.get('CRON_SECRET')
  return !!secret && req.headers.get('x-cron-secret') === secret
}

export async function getSettings(db: SupabaseClient) {
  const { data } = await db.from('app_settings').select('*').eq('id', 1).maybeSingle()
  return {
    batch_size: data?.batch_size ?? 50,
    messages_per_second: Number(data?.messages_per_second ?? 10),
    honor_stop_keywords: data?.honor_stop_keywords ?? true,
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
