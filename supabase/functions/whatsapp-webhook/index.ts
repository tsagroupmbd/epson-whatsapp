// Meta WhatsApp Cloud API webhook.
//  GET  — subscription verification (hub.challenge)
//  POST — delivery status updates and inbound messages (STOP keyword opt-outs)
// Every POST is authenticated with the X-Hub-Signature-256 HMAC using the app secret.
import { getSettings, serviceClient } from '../_shared/utils.ts'

const STOP_WORDS = new Set(['STOP', 'UNSUBSCRIBE', 'STOP ALL', 'OPT OUT', 'OPTOUT', 'CANCEL'])

Deno.serve(async (req) => {
  const url = new URL(req.url)

  if (req.method === 'GET') {
    const verifyToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN')
    if (
      verifyToken &&
      url.searchParams.get('hub.mode') === 'subscribe' &&
      url.searchParams.get('hub.verify_token') === verifyToken
    ) {
      return new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const raw = await req.text()
  if (!(await validSignature(raw, req.headers.get('x-hub-signature-256')))) {
    return new Response('Invalid signature', { status: 401 })
  }

  let payload: any
  try {
    payload = JSON.parse(raw)
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  const db = serviceClient()
  const settings = await getSettings(db)

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {}

      for (const s of value.statuses ?? []) {
        const err = s.errors?.[0]
        const { error } = await db.rpc('apply_message_status', {
          p_wa_id: s.id,
          p_status: s.status,
          p_ts: new Date(Number(s.timestamp) * 1000).toISOString(),
          p_error_code: err?.code ? String(err.code) : null,
          p_error_message: err ? err.error_data?.details || err.message || err.title : null,
        })
        if (error) console.error('status update failed', error)
      }

      if (settings.honor_stop_keywords) {
        for (const m of value.messages ?? []) {
          const text = String(m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? '').trim().toUpperCase()
          if (STOP_WORDS.has(text)) {
            await db.from('contacts').update({ opted_in: false, opted_out_at: new Date().toISOString() }).eq('phone', m.from)
          }
        }
      }
    }
  }

  // Meta retries on non-2xx, so always acknowledge once the signature is valid.
  return new Response('EVENT_RECEIVED', { status: 200 })
})

async function validSignature(raw: string, header: string | null) {
  const secret = Deno.env.get('WHATSAPP_APP_SECRET')
  if (!secret || !header?.startsWith('sha256=')) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)))
  const expected = Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('')
  const given = header.slice(7)
  if (given.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i)
  return diff === 0
}
