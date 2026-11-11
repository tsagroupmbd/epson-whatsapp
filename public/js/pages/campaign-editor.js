import { campaigns as api, contacts, groups as groupsApi, templates as templatesApi, cachedSettings } from '../api.js';
import { runCampaign } from '../runner.js';
import {
  countVariables, emptyState, esc, icon, num, phonePreview, templateBubble, toast, toastError,
} from '../ui.js';

const FIELD_LABELS = { name: 'Contact name', phone: 'Phone number', email: 'Email' };

function toLocalInput(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default async function render(root, { params, query, navigate }) {
  const editingId = params[0] || null;
  const [settings, groupList, approved, attrKeys, existing] = await Promise.all([
    cachedSettings(),
    groupsApi.list(),
    templatesApi.list('APPROVED'),
    contacts.attributeKeys().catch(() => []),
    editingId ? api.getRaw(editingId) : null,
  ]);

  if (existing && !['draft', 'scheduled'].includes(existing.status)) {
    root.innerHTML = `<div class="card">${emptyState('info', 'This campaign can no longer be edited', `It is ${esc(existing.status)}. Open its delivery report instead.`,
      `<a class="btn btn-primary" href="#/reports?campaign=${existing.id}">View report</a>`)}</div>`;
    return;
  }

  const state = {
    name: existing?.name || '',
    description: existing?.description || '',
    templateId: existing?.template_id || approved[0]?.id || null,
    groupIds: new Set(existing?.group_ids || (query.group ? [query.group] : [])),
    mapping: existing?.variable_mapping || { header: [], body: [] },
    mediaUrl: existing?.header_media_url || '',
    when: existing?.status === 'scheduled' ? 'later' : 'now',
    scheduledAt: existing?.scheduled_at ? toLocalInput(existing.scheduled_at) : toLocalInput(Date.now() + 3600_000),
    audience: 0,
  };
  const template = () => approved.find((t) => t.id === state.templateId);

  if (!approved.length) {
    root.innerHTML = `<div class="card">${emptyState('template', 'You need an approved template first',
      'WhatsApp only allows business-initiated bulk messages using templates approved by Meta.',
      '<a class="btn btn-primary" href="#/templates">Go to templates</a>')}</div>`;
    return;
  }

  root.innerHTML = `
    <div class="split">
      <div class="stack">
        <section class="card">
          <div class="card-head"><h3>1. Campaign details</h3></div>
          <div class="card-pad form-grid">
            <div class="field"><label>Campaign name *</label><input class="input" id="name" value="${esc(state.name)}" placeholder="November service reminder" /></div>
            <div class="field"><label>Internal note</label><input class="input" id="description" value="${esc(state.description)}" placeholder="Optional" /></div>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h3>2. Message template</h3><div class="spacer"></div><a class="small" href="#/templates">Manage templates</a></div>
          <div class="card-pad"><div class="choice-grid" id="templates">
            ${approved.map((t) => `<label class="choice ${t.id === state.templateId ? 'selected' : ''}">
              <input type="radio" name="template" value="${t.id}" ${t.id === state.templateId ? 'checked' : ''}/>
              <b class="mono">${esc(t.name)}</b><small>${esc(t.language)} · ${esc(t.category.toLowerCase())}</small>
              <small>${esc(t.body.slice(0, 70))}${t.body.length > 70 ? '…' : ''}</small></label>`).join('')}
          </div></div>
        </section>

        <section class="card">
          <div class="card-head"><h3>3. Audience</h3><div class="spacer"></div><span class="badge green" id="aud"></span></div>
          <div class="card-pad stack">
            ${groupList.length ? `<div class="choice-grid" id="groups">${groupList.map((g) => `
              <label class="choice ${state.groupIds.has(g.id) ? 'selected' : ''}">
                <input type="checkbox" value="${g.id}" ${state.groupIds.has(g.id) ? 'checked' : ''}/>
                <b><span class="chip" style="padding:0;background:none"><i style="background:${esc(g.color)}"></i></span> ${esc(g.name)}</b>
                <small>${num(g.opted_in_count)} opted in of ${num(g.member_count)}</small></label>`).join('')}</div>`
              : `<div class="callout warn">${icon('alert')}<div>No groups yet. <a href="#/groups">Create a group</a> or <a href="#/import">import contacts</a> into one.</div></div>`}
            <p class="small muted">Contacts in several selected groups receive the message once. Opted-out contacts are always excluded.</p>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h3>4. Personalisation</h3></div>
          <div class="card-pad stack" id="vars"></div>
        </section>

        <section class="card">
          <div class="card-head"><h3>5. Schedule</h3></div>
          <div class="card-pad stack">
            <div class="choice-grid" id="when">
              <label class="choice ${state.when === 'now' ? 'selected' : ''}"><input type="radio" name="when" value="now" ${state.when === 'now' ? 'checked' : ''}/><b>${icon('send', 'ico-inline')} Send immediately</b><small>Starts as soon as you confirm.</small></label>
              <label class="choice ${state.when === 'later' ? 'selected' : ''}"><input type="radio" name="when" value="later" ${state.when === 'later' ? 'checked' : ''}/><b>${icon('clock', 'ico-inline')} Schedule for later</b><small>Sent automatically at the chosen time.</small></label>
            </div>
            <div class="field" id="sched" ${state.when === 'later' ? '' : 'hidden'}><label>Send at (your local time)</label>
              <input class="input" type="datetime-local" id="scheduledAt" value="${state.scheduledAt}" style="max-width:280px"/></div>
          </div>
        </section>
      </div>

      <aside class="stack" style="position:sticky;top:84px">
        <div class="card"><div class="card-head"><h3>Preview</h3></div><div class="card-pad" id="preview"></div></div>
        <div class="card card-pad stack">
          <dl class="summary-list" id="summary"></dl>
          <div class="row end">
            <button class="btn" id="draft">Save draft</button>
            <button class="btn btn-primary" id="go"></button>
          </div>
        </div>
      </aside>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const ensureMapping = () => {
    const t = template();
    const h = t?.header_type === 'TEXT' ? countVariables(t.header_text) : 0;
    const b = countVariables(t?.body);
    const fill = (arr, n, defaults) => Array.from({ length: n }, (_, i) => arr?.[i] || defaults(i));
    state.mapping = {
      header: fill(state.mapping.header, h, () => ({ source: 'static', value: t?.examples?.header?.[0] || '', fallback: '' })),
      body: fill(state.mapping.body, b, (i) => (i === 0 ? { source: 'field', value: 'name', fallback: 'Customer' } : { source: 'static', value: t?.examples?.body?.[i] || '', fallback: '' })),
    };
  };

  function sourceOptions(m) {
    const cur = m.source === 'static' ? 'static' : `${m.source}:${m.value}`;
    const opts = [
      ...Object.entries(FIELD_LABELS).map(([k, l]) => [`field:${k}`, l]),
      ...attrKeys.map((k) => [`attribute:${k}`, `Custom: ${k}`]),
      ['static', 'Same text for everyone'],
    ];
    if (m.source === 'attribute' && !attrKeys.includes(m.value)) opts.splice(-1, 0, [cur, `Custom: ${m.value}`]);
    return opts.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('');
  }

  function drawVars() {
    ensureMapping();
    const t = template();
    const media = ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(t?.header_type);
    const rows = [
      ...state.mapping.header.map((m, i) => ['header', i, m, `H{{${i + 1}}}`]),
      ...state.mapping.body.map((m, i) => ['body', i, m, `{{${i + 1}}}`]),
    ];
    $('#vars').innerHTML = `
      ${media ? `<div class="field"><label>Header ${t.header_type.toLowerCase()} URL *</label><input class="input" id="media" value="${esc(state.mediaUrl)}" placeholder="https://cdn.example.com/offer.jpg"/>
        <span class="hint">A public HTTPS link Meta can download.</span></div>` : ''}
      ${rows.length ? rows.map(([part, i, m, tag]) => `
        <div class="var-row" data-part="${part}" data-i="${i}">
          <span class="tag">${tag}</span>
          <select class="select" data-k="source">${sourceOptions(m)}</select>
          <input class="input" data-k="value" value="${m.source === 'static' ? esc(m.value) : ''}" placeholder="Text for everyone" ${m.source === 'static' ? '' : 'hidden'}/>
          <input class="input" data-k="fallback" value="${esc(m.fallback || '')}" placeholder="Fallback if empty" ${m.source === 'static' ? 'hidden' : ''}/>
        </div>`).join('') : (!media ? '<p class="muted">This template has no variables — everyone receives the same message.</p>' : '')}`;
  }

  const sampleValue = (m) => {
    if (m.source === 'static') return m.value;
    if (m.source === 'field') return `[${FIELD_LABELS[m.value] || m.value}]`;
    return `[${m.value}]`;
  };

  function drawPreview() {
    $('#preview').innerHTML = phonePreview(templateBubble(template(), {
      headerValues: state.mapping.header.map(sampleValue),
      bodyValues: state.mapping.body.map(sampleValue),
    }), settings.business_name);
  }

  function drawSummary() {
    const t = template();
    $('#aud').textContent = `${num(state.audience)} recipients`;
    $('#summary').innerHTML = `
      <div><dt>Template</dt><dd class="mono">${esc(t?.name || '—')}</dd></div>
      <div><dt>Groups</dt><dd>${state.groupIds.size}</dd></div>
      <div><dt>Recipients</dt><dd>${num(state.audience)}</dd></div>
      <div><dt>Delivery</dt><dd>${state.when === 'now' ? 'Immediately' : new Date(state.scheduledAt).toLocaleString()}</dd></div>`;
    $('#go').innerHTML = state.when === 'now' ? `${icon('send')} Send now` : `${icon('clock')} Schedule`;
  }

  let audienceSeq = 0;
  async function refreshAudience() {
    const seq = ++audienceSeq;
    const n = await api.audienceCount([...state.groupIds]).catch(() => 0);
    if (seq === audienceSeq) { state.audience = n; drawSummary(); }
  }

  // ---------- events ----------
  $('#name').addEventListener('input', (e) => { state.name = e.target.value; });
  $('#description').addEventListener('input', (e) => { state.description = e.target.value; });
  $('#templates').addEventListener('change', (e) => {
    state.templateId = e.target.value;
    state.mapping = { header: [], body: [] };
    root.querySelectorAll('#templates .choice').forEach((c) => c.classList.toggle('selected', c.querySelector('input').checked));
    drawVars(); drawPreview(); drawSummary();
  });
  $('#groups')?.addEventListener('change', (e) => {
    e.target.checked ? state.groupIds.add(e.target.value) : state.groupIds.delete(e.target.value);
    e.target.closest('.choice').classList.toggle('selected', e.target.checked);
    refreshAudience();
  });
  $('#when').addEventListener('change', (e) => {
    state.when = e.target.value;
    root.querySelectorAll('#when .choice').forEach((c) => c.classList.toggle('selected', c.querySelector('input').checked));
    $('#sched').hidden = state.when !== 'later';
    drawSummary();
  });
  $('#scheduledAt').addEventListener('input', (e) => { state.scheduledAt = e.target.value; drawSummary(); });
  $('#vars').addEventListener('input', (e) => {
    if (e.target.id === 'media') { state.mediaUrl = e.target.value; return; }
    const row = e.target.closest('[data-part]');
    if (!row) return;
    const m = state.mapping[row.dataset.part][Number(row.dataset.i)];
    if (e.target.dataset.k === 'source') {
      const v = e.target.value;
      if (v === 'static') Object.assign(m, { source: 'static', value: '' });
      else { const [source, ...rest] = v.split(':'); Object.assign(m, { source, value: rest.join(':') }); }
      drawVars();
    } else {
      m[e.target.dataset.k] = e.target.value;
    }
    drawPreview();
  });

  // mode: "draft" (save only), "now" (save then start sending), "scheduled"
  function payload(mode) {
    const t = template();
    if (!state.name.trim()) throw new Error('Give the campaign a name');
    if (!t) throw new Error('Choose a template');
    if (mode !== 'draft') {
      if (!state.groupIds.size) throw new Error('Choose at least one group');
      if (!state.audience) throw new Error('The selected groups have no opted-in contacts');
      if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(t.header_type) && !/^https:\/\//.test(state.mediaUrl)) throw new Error('Add an HTTPS header media URL');
      const missing = [...state.mapping.header, ...state.mapping.body].some((m) => m.source === 'static' && !m.value.trim());
      if (missing) throw new Error('Fill in every personalisation value');
    }
    let scheduled_at = null;
    if (mode === 'scheduled') {
      const when = new Date(state.scheduledAt);
      if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() + 60_000) throw new Error('Pick a time at least one minute from now');
      scheduled_at = when.toISOString();
    }
    return {
      id: editingId || undefined,
      name: state.name.trim(),
      description: state.description.trim() || null,
      template_id: t.id,
      group_ids: [...state.groupIds],
      variable_mapping: state.mapping,
      header_media_url: state.mediaUrl.trim() || null,
      status: mode === 'scheduled' ? 'scheduled' : 'draft',
      scheduled_at,
    };
  }

  async function save(btn, mode) {
    let data;
    try { data = payload(mode); } catch (err) { return toast(err.message, 'error'); }
    btn.disabled = true;
    try {
      const saved = await api.save(data);
      if (mode === 'draft') toast('Draft saved');
      if (mode === 'scheduled') toast(`Scheduled for ${new Date(saved.scheduled_at).toLocaleString()}`);
      navigate('campaigns');
      // The worker moves the campaign from draft to "sending" and delivers it.
      if (mode === 'now') runCampaign(saved.id);
    } catch (err) {
      toastError(err);
      btn.disabled = false;
    }
  }

  $('#draft').addEventListener('click', (e) => save(e.currentTarget, 'draft'));
  $('#go').addEventListener('click', (e) => save(e.currentTarget, state.when === 'now' ? 'now' : 'scheduled'));

  drawVars();
  drawPreview();
  drawSummary();
  refreshAudience();
}
