// Campaign sending worker.
//  - Admins call it with { campaign_id } to start or continue sending a campaign.
//  - pg_cron calls it every minute with the x-cron-secret header to start due
//    scheduled campaigns and continue any campaign still in "sending".
// Each invocation works for a bounded time and reports what remains, so large
// audiences are sent across several invocations without hitting runtime limits.
import { corsHeaders, getSettings, handleError, HttpError, isCronRequest, json, requireAdmin, serviceClient, sleep } from '../_shared/utils.ts'
import { buildTemplatePayload, graphErrorText, RETRYABLE_CODES, sendMessage } from '../_shared/whatsapp.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

const WORK_WINDOW_MS = 50_000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  try {
    const db = serviceClient()
    const cron = isCronRequest(req)
    if (!cron) await requireAdmin(req, db)

    const body = await req.json().catch(() => ({}))
    const deadline = Date.now() + WORK_WINDOW_MS
    const settings = await getSettings(db)

    let campaigns: Record<string, unknown>[] = []
    if (body.campaign_id) {
      const { data, error } = await db.from('campaigns').select('*').eq('id', body.campaign_id).maybeSingle()
      if (error) throw error
      if (!data) throw new HttpError(404, 'Campaign not found')
      campaigns = [data]
    } else if (cron) {
      const { data, error } = await db
        .from('campaigns')
        .select('*')
        .or(`status.eq.sending,and(status.eq.scheduled,scheduled_at.lte.${new Date().toISOString()})`)
        .order('scheduled_at', { ascending: true })
      if (error) throw error
      campaigns = data ?? []
    } else {
      throw new HttpError(400, 'campaign_id is required')
    }

    const results = []
    for (const campaign of campaigns) {
      if (Date.now() > deadline) break
      results.push(await processCampaign(db, campaign, settings, deadline))
    }
    return json(req, { results })
  } catch (err) {
    return handleError(req, err)
  }
})

async function processCampaign(
  db: SupabaseClient,
  campaign: Record<string, any>,
  settings: Awaited<ReturnType<typeof getSettings>>,
  deadline: number,
) {
  const id = campaign.id as string
  if (!['draft', 'scheduled', 'sending'].includes(campaign.status)) {
    return { campaign_id: id, status: campaign.status, processed: 0, remaining: 0 }
  }

  const { data: template } = await db.from('templates').select('*').eq('id', campaign.template_id).maybeSingle()
  if (!template || template.status !== 'APPROVED') {
    const reason = !template ? 'Template no longer exists' : `Template "${template.name}" is ${template.status}, not APPROVED`
    await db.from('campaigns').update({ status: 'failed', last_error: reason }).eq('id', id)
    return { campaign_id: id, status: 'failed', error: reason, processed: 0, remaining: 0 }
  }

  if (campaign.status !== 'sending') {
    await db.rpc('queue_campaign', { p_campaign: id })
    await db
      .from('campaigns')
      .update({ status: 'sending', started_at: campaign.started_at ?? new Date().toISOString(), last_error: null })
      .eq('id', id)
  }

  // Recover messages claimed by a worker that crashed mid-batch.
  await db
    .from('messages')
    .update({ status: 'queued' })
    .eq('campaign_id', id)
    .eq('status', 'sending')
    .lt('updated_at', new Date(Date.now() - 5 * 60_000).toISOString())

  const gap = 1000 / settings.messages_per_second
  let processed = 0
  let throttled = false

  while (Date.now() < deadline && !throttled) {
    // Respect pause / cancel requested from the dashboard between batches.
    const { data: current } = await db.from('campaigns').select('status').eq('id', id).single()
    if (current?.status !== 'sending') break

    const { data: batch, error } = await db.rpc('claim_messages', { p_campaign: id, p_limit: settings.batch_size })
    if (error) throw error
    if (!batch?.length) break

    const contactIds = batch.map((m: any) => m.contact_id).filter(Boolean)
    const { data: contacts } = await db.from('contacts').select('*').in('id', contactIds)
    const byId = new Map((contacts ?? []).map((c: any) => [c.id, c]))

    for (let i = 0; i < batch.length; i++) {
      const msg = batch[i]
      if (throttled || Date.now() > deadline) {
        await db.from('messages').update({ status: 'queued' }).eq('id', msg.id)
        continue
      }
      const contact = byId.get(msg.contact_id) ?? { phone: msg.phone }
      if (contact.opted_in === false) {
        await db.from('messages').update({
          status: 'failed', failed_at: new Date().toISOString(), error_code: 'OPTED_OUT', error_message: 'Contact opted out before sending',
        }).eq('id', msg.id)
        continue
      }

      const started = Date.now()
      let result
      try {
        result = await sendMessage(buildTemplatePayload(template, campaign.variable_mapping ?? {}, contact, campaign.header_media_url))
      } catch (e) {
        result = { ok: false as const, status: 0, error: { message: e instanceof Error ? e.message : String(e) } }
      }

      if (result.ok) {
        await db.from('messages').update({
          status: 'sent', wa_message_id: result.body.messages?.[0]?.id ?? null, sent_at: new Date().toISOString(),
        }).eq('id', msg.id)
      } else if (result.error.code && RETRYABLE_CODES.has(result.error.code)) {
        throttled = true
        await db.from('messages').update({ status: 'queued' }).eq('id', msg.id)
      } else {
        await db.from('messages').update({
          status: 'failed',
          failed_at: new Date().toISOString(),
          error_code: result.error.code ? String(result.error.code) : 'ERROR',
          error_message: graphErrorText(result.error),
        }).eq('id', msg.id)
      }
      processed++
      const wait = gap - (Date.now() - started)
      if (wait > 0) await sleep(wait)
    }
  }

  const { count: remaining } = await db
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', id)
    .in('status', ['queued', 'sending'])

  let status = 'sending'
  if (!remaining) {
    const { data: done } = await db
      .from('campaigns')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'sending')
      .select('status')
      .maybeSingle()
    status = done?.status ?? status
  }
  return { campaign_id: id, status, processed, remaining: remaining ?? 0, throttled }
}
