// Data access layer. Every read/write goes to Supabase PostgreSQL through
// supabase-js (protected by RLS), or to Edge Functions for WhatsApp calls.
import { sb, invoke } from './supabase.js';

const unwrap = ({ data, error, count }) => {
  if (error) throw new Error(error.message);
  return count !== undefined && count !== null ? { data, count } : data;
};

// ---------- Auth ----------
export const auth = {
  session: async () => (await sb.auth.getSession()).data.session,
  signIn: (email, password) => sb.auth.signInWithPassword({ email, password }),
  signOut: () => sb.auth.signOut(),
  isAdmin: async () => unwrap(await sb.rpc('is_admin')),
  updatePassword: async (password) => {
    const { error } = await sb.auth.updateUser({ password });
    if (error) throw new Error(error.message);
  },
  onChange: (cb) => sb.auth.onAuthStateChange(cb),
};

// ---------- Dashboard ----------
export const dashboardStats = async (days = 14) => unwrap(await sb.rpc('dashboard_stats', { p_days: days }));

// ---------- Contacts ----------
export const contacts = {
  async list({ search = '', groupId = '', optIn = '', page = 1, pageSize = 25 } = {}) {
    const select = groupId
      ? '*, memberships:contact_groups(group_id), filter:contact_groups!inner(group_id)'
      : '*, memberships:contact_groups(group_id)';
    let q = sb.from('contacts').select(select, { count: 'exact' }).order('created_at', { ascending: false });
    if (groupId) q = q.eq('filter.group_id', groupId);
    if (optIn === 'in') q = q.eq('opted_in', true);
    if (optIn === 'out') q = q.eq('opted_in', false);
    if (search) {
      const s = search.replace(/[,()%"\\]/g, ' ').trim();
      const digits = s.replace(/\D/g, '');
      const ors = [`name.ilike."%${s}%"`, `email.ilike."%${s}%"`];
      if (digits) ors.push(`phone.like.%${digits}%`);
      q = q.or(ors.join(','));
    }
    const from = (page - 1) * pageSize;
    return unwrap(await q.range(from, from + pageSize - 1));
  },
  async save(contact, groupIds) {
    const { id, ...fields } = contact;
    const row = unwrap(id
      ? await sb.from('contacts').update(fields).eq('id', id).select().single()
      : await sb.from('contacts').insert(fields).select().single());
    if (groupIds) {
      unwrap(await sb.from('contact_groups').delete().eq('contact_id', row.id));
      if (groupIds.length) {
        unwrap(await sb.from('contact_groups').insert(groupIds.map((g) => ({ contact_id: row.id, group_id: g }))));
      }
    }
    return row;
  },
  remove: async (ids) => unwrap(await sb.from('contacts').delete().in('id', ids)),
  setOptIn: async (ids, optedIn) =>
    unwrap(await sb.from('contacts').update({ opted_in: optedIn, opted_out_at: optedIn ? null : new Date().toISOString() }).in('id', ids)),
  addToGroup: async (ids, groupId) =>
    unwrap(await sb.from('contact_groups').upsert(ids.map((id) => ({ contact_id: id, group_id: groupId })), { onConflict: 'contact_id,group_id', ignoreDuplicates: true })),
  removeFromGroup: async (ids, groupId) =>
    unwrap(await sb.from('contact_groups').delete().eq('group_id', groupId).in('contact_id', ids)),
  /** Upserts rows by phone in chunks; returns the saved ids. */
  async bulkUpsert(rows, { onProgress, updateExisting = true } = {}) {
    const ids = [];
    const size = 500;
    for (let i = 0; i < rows.length; i += size) {
      const chunk = rows.slice(i, i + size);
      const data = unwrap(await sb.from('contacts')
        .upsert(chunk, { onConflict: 'phone', ignoreDuplicates: !updateExisting })
        .select('id, phone'));
      ids.push(...data.map((d) => d.id));
      onProgress?.(Math.min(i + size, rows.length), rows.length);
    }
    return ids;
  },
  async idsByPhones(phones) {
    const out = [];
    for (let i = 0; i < phones.length; i += 300) {
      const data = unwrap(await sb.from('contacts').select('id').in('phone', phones.slice(i, i + 300)));
      out.push(...data.map((d) => d.id));
    }
    return out;
  },
  async addManyToGroup(ids, groupId) {
    for (let i = 0; i < ids.length; i += 1000) await contacts.addToGroup(ids.slice(i, i + 1000), groupId);
  },
  async attributeKeys() {
    const rows = unwrap(await sb.from('contacts').select('attributes').neq('attributes', '{}').limit(500));
    return [...new Set(rows.flatMap((r) => Object.keys(r.attributes || {})))].sort();
  },
  async exportAll(filters) {
    const all = [];
    for (let page = 1; ; page++) {
      const { data } = await contacts.list({ ...filters, page, pageSize: 1000 });
      all.push(...data);
      if (data.length < 1000) break;
    }
    return all;
  },
};

// ---------- Groups ----------
export const groups = {
  list: async () => unwrap(await sb.from('group_stats').select('*').order('name')),
  save: async ({ id, ...fields }) =>
    unwrap(id
      ? await sb.from('groups').update(fields).eq('id', id).select().single()
      : await sb.from('groups').insert(fields).select().single()),
  remove: async (id) => unwrap(await sb.from('groups').delete().eq('id', id)),
};

// ---------- Templates ----------
export const templates = {
  list: async (status) => {
    let q = sb.from('templates').select('*').order('updated_at', { ascending: false });
    if (status) q = q.eq('status', status);
    return unwrap(await q);
  },
  get: async (id) => unwrap(await sb.from('templates').select('*').eq('id', id).single()),
  save: async ({ id, ...fields }) =>
    unwrap(id
      ? await sb.from('templates').update(fields).eq('id', id).select().single()
      : await sb.from('templates').insert(fields).select().single()),
  removeLocal: async (id) => unwrap(await sb.from('templates').delete().eq('id', id)),
  sync: () => invoke('whatsapp-admin', { action: 'sync_templates' }),
  submit: (id) => invoke('whatsapp-admin', { action: 'submit_template', template_id: id }),
  remove: (id) => invoke('whatsapp-admin', { action: 'delete_template', template_id: id }),
  sendTest: (payload) => invoke('whatsapp-admin', { action: 'send_test', ...payload }),
};

// ---------- Campaigns ----------
export const campaigns = {
  list: async ({ status = '' } = {}) => {
    let q = sb.from('campaign_reports').select('*').order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    return unwrap(await q);
  },
  get: async (id) => unwrap(await sb.from('campaign_reports').select('*').eq('id', id).single()),
  getRaw: async (id) => unwrap(await sb.from('campaigns').select('*').eq('id', id).single()),
  save: async ({ id, ...fields }) =>
    unwrap(id
      ? await sb.from('campaigns').update(fields).eq('id', id).select().single()
      : await sb.from('campaigns').insert(fields).select().single()),
  setStatus: async (id, status) => unwrap(await sb.from('campaigns').update({ status }).eq('id', id).select().single()),
  async cancel(id) {
    await campaigns.setStatus(id, 'cancelled');
    unwrap(await sb.from('messages')
      .update({ status: 'failed', error_code: 'CANCELLED', error_message: 'Campaign cancelled before sending', failed_at: new Date().toISOString() })
      .eq('campaign_id', id).eq('status', 'queued'));
  },
  remove: async (id) => unwrap(await sb.from('campaigns').delete().eq('id', id)),
  audienceCount: async (groupIds) => (groupIds.length ? unwrap(await sb.rpc('campaign_audience_count', { p_group_ids: groupIds })) : 0),
  /** Runs one worker pass for the campaign on the Edge Function. */
  run: async (id) => (await invoke('send-campaign', { campaign_id: id })).results?.[0],
};

// ---------- Messages / reports ----------
export const messages = {
  async list({ campaignId = '', status = '', search = '', page = 1, pageSize = 50 } = {}) {
    let q = sb.from('messages')
      .select('*, contact:contacts(name), campaign:campaigns(name)', { count: 'exact' })
      .order('created_at', { ascending: false });
    if (campaignId) q = q.eq('campaign_id', campaignId);
    if (status === 'sent') q = q.in('status', ['sent', 'delivered', 'read']);
    else if (status === 'delivered') q = q.in('status', ['delivered', 'read']);
    else if (status === 'pending') q = q.in('status', ['queued', 'sending']);
    else if (status) q = q.eq('status', status);
    const digits = search.replace(/\D/g, '');
    if (digits) q = q.like('phone', `%${digits}%`);
    const from = (page - 1) * pageSize;
    return unwrap(await q.range(from, from + pageSize - 1));
  },
  async errorSummary(campaignId) {
    let q = sb.from('messages').select('error_code, error_message').eq('status', 'failed').limit(5000);
    if (campaignId) q = q.eq('campaign_id', campaignId);
    const rows = unwrap(await q);
    const map = new Map();
    for (const r of rows) {
      const key = `${r.error_code || 'ERROR'}|${r.error_message || 'Unknown error'}`;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()]
      .map(([k, count]) => { const [code, message] = k.split('|'); return { code, message, count }; })
      .sort((a, b) => b.count - a.count);
  },
};

// ---------- Settings ----------
export const settings = {
  get: async () => unwrap(await sb.from('app_settings').select('*').eq('id', 1).single()),
  save: async (fields) => unwrap(await sb.from('app_settings').update(fields).eq('id', 1).select().single()),
  whatsappStatus: () => invoke('whatsapp-admin', { action: 'status' }),
  testConnection: () => invoke('whatsapp-admin', { action: 'test_connection' }),
};

let settingsCache = null;
export async function cachedSettings(refresh = false) {
  if (!settingsCache || refresh) settingsCache = await settings.get().catch(() => ({}));
  return settingsCache;
}
