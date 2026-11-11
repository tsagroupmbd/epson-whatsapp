// Thin client for the official Meta WhatsApp Cloud API (Graph API).
// All credentials come from Edge Function secrets and never reach the browser.
import { HttpError } from './utils.ts'

export function waConfig() {
  const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN')
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')
  const wabaId = Deno.env.get('WHATSAPP_BUSINESS_ACCOUNT_ID')
  const version = Deno.env.get('WHATSAPP_API_VERSION') ?? 'v23.0'
  return { token, phoneNumberId, wabaId, version, base: `https://graph.facebook.com/${version}` }
}

export function requireWaConfig() {
  const cfg = waConfig()
  const missing = [
    !cfg.token && 'WHATSAPP_ACCESS_TOKEN',
    !cfg.phoneNumberId && 'WHATSAPP_PHONE_NUMBER_ID',
    !cfg.wabaId && 'WHATSAPP_BUSINESS_ACCOUNT_ID',
  ].filter(Boolean)
  if (missing.length) throw new HttpError(500, `Missing Edge Function secrets: ${missing.join(', ')}`)
  return cfg as Required<ReturnType<typeof waConfig>>
}

export interface GraphError {
  code?: number
  message?: string
  error_user_msg?: string
  error_data?: { details?: string }
}

export async function graph(path: string, init: RequestInit = {}) {
  const cfg = requireWaConfig()
  const res = await fetch(`${cfg.base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.error) {
    const e: GraphError = body.error ?? {}
    return { ok: false as const, status: res.status, error: e, body }
  }
  return { ok: true as const, status: res.status, body }
}

export function graphErrorText(e: GraphError) {
  return e.error_data?.details || e.error_user_msg || e.message || 'WhatsApp API error'
}

// ---------------------------------------------------------------------------
// Template message construction
// ---------------------------------------------------------------------------
export interface VariableMapping {
  source: 'field' | 'attribute' | 'static'
  value: string
  fallback?: string
}

interface Contact {
  name?: string | null
  phone: string
  email?: string | null
  attributes?: Record<string, unknown> | null
}

export function countVariables(text?: string | null) {
  const nums = [...(text ?? '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]))
  return nums.length ? Math.max(...nums) : 0
}

export function resolveVariable(map: VariableMapping | undefined, contact: Contact) {
  if (!map) return ''
  let v = ''
  if (map.source === 'static') v = map.value
  else if (map.source === 'field') v = String((contact as Record<string, unknown>)[map.value] ?? '')
  else if (map.source === 'attribute') v = String(contact.attributes?.[map.value] ?? '')
  v = v.trim() || (map.fallback ?? '').trim()
  return v || '-'
}

export function buildTemplatePayload(
  template: { name: string; language: string; header_type: string; header_text?: string | null; body: string },
  mapping: { header?: VariableMapping[]; body?: VariableMapping[] },
  contact: Contact,
  headerMediaUrl?: string | null,
) {
  const components: unknown[] = []
  if (template.header_type === 'TEXT' && countVariables(template.header_text)) {
    components.push({
      type: 'header',
      parameters: [{ type: 'text', text: resolveVariable(mapping.header?.[0], contact) }],
    })
  } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(template.header_type)) {
    if (!headerMediaUrl) throw new Error('This template needs a header media URL')
    const kind = template.header_type.toLowerCase()
    components.push({ type: 'header', parameters: [{ type: kind, [kind]: { link: headerMediaUrl } }] })
  }
  const bodyVars = countVariables(template.body)
  if (bodyVars) {
    components.push({
      type: 'body',
      parameters: Array.from({ length: bodyVars }, (_, i) => ({
        type: 'text',
        text: resolveVariable(mapping.body?.[i], contact),
      })),
    })
  }
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: contact.phone,
    type: 'template',
    template: { name: template.name, language: { code: template.language }, components },
  }
}

export async function sendMessage(payload: unknown) {
  const cfg = requireWaConfig()
  return graph(`/${cfg.phoneNumberId}/messages`, { method: 'POST', body: JSON.stringify(payload) })
}

// Graph API error codes that mean "slow down and retry later" rather than a permanent failure.
export const RETRYABLE_CODES = new Set([4, 80007, 130429, 131048, 131056])
