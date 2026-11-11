// Admin-only WhatsApp actions invoked from the dashboard:
//   status           — which secrets are configured (names only, never values)
//   test_connection  — fetch the business phone number profile from Meta
//   sync_templates   — import all templates and their review status from the WABA
//   submit_template  — submit a local template to Meta for review
//   delete_template  — delete a template from Meta and locally
//   send_test        — send one template message to a phone number
import { corsHeaders, handleError, HttpError, json, requireAdmin, serviceClient } from '../_shared/utils.ts'
import { buildTemplatePayload, countVariables, graph, graphErrorText, requireWaConfig, sendMessage, waConfig } from '../_shared/whatsapp.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  try {
    const db = serviceClient()
    await requireAdmin(req, db)
    const { action, ...input } = await req.json().catch(() => ({}))

    switch (action) {
      case 'status': {
        const cfg = waConfig()
        return json(req, {
          secrets: {
            WHATSAPP_ACCESS_TOKEN: !!cfg.token,
            WHATSAPP_PHONE_NUMBER_ID: !!cfg.phoneNumberId,
            WHATSAPP_BUSINESS_ACCOUNT_ID: !!cfg.wabaId,
            WHATSAPP_APP_SECRET: !!Deno.env.get('WHATSAPP_APP_SECRET'),
            WHATSAPP_VERIFY_TOKEN: !!Deno.env.get('WHATSAPP_VERIFY_TOKEN'),
            CRON_SECRET: !!Deno.env.get('CRON_SECRET'),
          },
          api_version: cfg.version,
        })
      }

      case 'test_connection': {
        const cfg = requireWaConfig()
        const r = await graph(`/${cfg.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,messaging_limit_tier`)
        if (!r.ok) throw new HttpError(502, graphErrorText(r.error))
        return json(req, { ok: true, phone: r.body })
      }

      case 'sync_templates': {
        const cfg = requireWaConfig()
        let next: string | null = `/${cfg.wabaId}/message_templates?limit=100&fields=id,name,language,status,category,components,rejected_reason`
        let synced = 0
        while (next) {
          const r = await graph(next)
          if (!r.ok) throw new HttpError(502, graphErrorText(r.error))
          const rows = (r.body.data ?? []).map(fromMeta)
          if (rows.length) {
            const { error } = await db.from('templates').upsert(rows, { onConflict: 'name,language' })
            if (error) throw error
          }
          synced += rows.length
          const after = r.body.paging?.cursors?.after
          next = r.body.paging?.next && after
            ? `/${cfg.wabaId}/message_templates?limit=100&after=${after}&fields=id,name,language,status,category,components,rejected_reason`
            : null
        }
        return json(req, { synced })
      }

      case 'submit_template': {
        const cfg = requireWaConfig()
        const t = await loadTemplate(db, input.template_id)
        if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(t.header_type)) {
          throw new HttpError(400, 'Media-header templates must be created in WhatsApp Manager, then synced here.')
        }
        // Templates already known to Meta (e.g. rejected ones) are edited in place; new ones are created.
        const r = t.meta_template_id
          ? await graph(`/${t.meta_template_id}`, {
            method: 'POST',
            body: JSON.stringify({ category: t.category, components: toMetaComponents(t) }),
          })
          : await graph(`/${cfg.wabaId}/message_templates`, {
            method: 'POST',
            body: JSON.stringify({ name: t.name, language: t.language, category: t.category, components: toMetaComponents(t) }),
          })
        if (!r.ok) throw new HttpError(502, graphErrorText(r.error))
        if (t.meta_template_id) r.body = { id: t.meta_template_id, status: 'PENDING', category: t.category }
        const { data, error } = await db
          .from('templates')
          .update({ meta_template_id: r.body.id, status: r.body.status ?? 'PENDING', category: r.body.category ?? t.category, rejected_reason: null, last_synced_at: new Date().toISOString() })
          .eq('id', t.id)
          .select()
          .single()
        if (error) throw error
        return json(req, { template: data })
      }

      case 'delete_template': {
        const t = await loadTemplate(db, input.template_id)
        if (t.meta_template_id) {
          const cfg = requireWaConfig()
          const r = await graph(`/${cfg.wabaId}/message_templates?name=${encodeURIComponent(t.name)}&hsm_id=${t.meta_template_id}`, { method: 'DELETE' })
          if (!r.ok) throw new HttpError(502, graphErrorText(r.error))
        }
        const { error } = await db.from('templates').delete().eq('id', t.id)
        if (error) throw error
        return json(req, { deleted: true })
      }

      case 'send_test': {
        const t = await loadTemplate(db, input.template_id)
        const phone = String(input.phone ?? '').replace(/\D/g, '')
        if (!/^[1-9]\d{6,14}$/.test(phone)) throw new HttpError(400, 'Enter the phone number with country code')
        const values: string[] = input.body_values ?? []
        const mapping = {
          header: (input.header_values ?? []).map((v: string) => ({ source: 'static', value: v })),
          body: values.map((v) => ({ source: 'static', value: v })),
        }
        const r = await sendMessage(buildTemplatePayload(t, mapping, { phone }, input.header_media_url))
        if (!r.ok) throw new HttpError(502, graphErrorText(r.error))
        return json(req, { ok: true, wa_message_id: r.body.messages?.[0]?.id })
      }

      default:
        throw new HttpError(400, `Unknown action: ${action}`)
    }
  } catch (err) {
    return handleError(req, err)
  }
})

async function loadTemplate(db: ReturnType<typeof serviceClient>, id: string) {
  const { data, error } = await db.from('templates').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) throw new HttpError(404, 'Template not found')
  return data
}

function fromMeta(m: any) {
  const comps: any[] = m.components ?? []
  const header = comps.find((c) => c.type === 'HEADER')
  const body = comps.find((c) => c.type === 'BODY')
  const footer = comps.find((c) => c.type === 'FOOTER')
  const buttons = comps.find((c) => c.type === 'BUTTONS')
  return {
    name: m.name,
    language: m.language,
    category: m.category,
    status: m.status,
    header_type: header?.format ?? 'NONE',
    header_text: header?.format === 'TEXT' ? header.text : null,
    body: body?.text ?? '',
    footer: footer?.text ?? null,
    buttons: (buttons?.buttons ?? []).map((b: any) => ({ type: b.type, text: b.text, url: b.url, phone_number: b.phone_number })),
    examples: {
      header: header?.example?.header_text ?? [],
      body: body?.example?.body_text?.[0] ?? [],
    },
    components: comps,
    meta_template_id: m.id,
    rejected_reason: m.rejected_reason && m.rejected_reason !== 'NONE' ? m.rejected_reason : null,
    last_synced_at: new Date().toISOString(),
  }
}

function toMetaComponents(t: any) {
  const components: any[] = []
  const ex = t.examples ?? {}
  if (t.header_type === 'TEXT' && t.header_text) {
    const h: any = { type: 'HEADER', format: 'TEXT', text: t.header_text }
    if (countVariables(t.header_text)) h.example = { header_text: [ex.header?.[0] ?? 'Sample'] }
    components.push(h)
  }
  const n = countVariables(t.body)
  const b: any = { type: 'BODY', text: t.body }
  if (n) b.example = { body_text: [Array.from({ length: n }, (_, i) => ex.body?.[i] || `Sample ${i + 1}`)] }
  components.push(b)
  if (t.footer) components.push({ type: 'FOOTER', text: t.footer })
  const buttons = (t.buttons ?? []).filter((x: any) => x.text)
  if (buttons.length) {
    components.push({
      type: 'BUTTONS',
      buttons: buttons.map((x: any) =>
        x.type === 'URL' ? { type: 'URL', text: x.text, url: x.url }
        : x.type === 'PHONE_NUMBER' ? { type: 'PHONE_NUMBER', text: x.text, phone_number: x.phone_number }
        : { type: 'QUICK_REPLY', text: x.text }),
    })
  }
  return components
}
