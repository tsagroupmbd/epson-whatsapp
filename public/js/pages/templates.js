import { templates as api, cachedSettings } from '../api.js';
import {
  confirmDialog, countVariables, emptyState, esc, fmtDate, icon, openModal, phonePreview,
  statusBadge, templateBubble, toast, toastError, withBusy,
} from '../ui.js';

const LANGUAGES = [
  ['en_US', 'English (US)'], ['en_GB', 'English (UK)'], ['en', 'English'], ['hi', 'Hindi'], ['mr', 'Marathi'], ['gu', 'Gujarati'],
  ['ta', 'Tamil'], ['te', 'Telugu'], ['kn', 'Kannada'], ['bn', 'Bengali'], ['ml', 'Malayalam'], ['pa', 'Punjabi'], ['ur', 'Urdu'],
  ['ar', 'Arabic'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['pt_BR', 'Portuguese (BR)'], ['id', 'Indonesian'], ['ja', 'Japanese'],
];
const FILTERS = [['', 'All'], ['APPROVED', 'Approved'], ['PENDING', 'In review'], ['REJECTED', 'Rejected'], ['DRAFT', 'Drafts']];

export default async function render(root) {
  const settings = await cachedSettings();
  const state = { filter: '', list: [], selectedId: null };

  root.innerHTML = `
    <div class="row">
      <div class="tabs" id="tabs">${FILTERS.map(([v, l]) => `<button type="button" data-f="${v}" class="${v === '' ? 'active' : ''}">${l}</button>`).join('')}</div>
      <span style="flex:1"></span>
      <button class="btn" id="sync">${icon('refresh')} Sync from Meta</button>
      <button class="btn btn-primary" id="add">${icon('plus')} New template</button>
    </div>
    <div class="split">
      <div class="card" id="list"></div>
      <div class="card" id="detail" style="position:sticky;top:84px"></div>
    </div>`;

  const listEl = root.querySelector('#list');
  const detailEl = root.querySelector('#detail');

  async function load() {
    state.list = await api.list();
    if (!state.list.find((t) => t.id === state.selectedId)) state.selectedId = state.list[0]?.id ?? null;
    draw();
  }

  function draw() {
    const rows = state.list.filter((t) => !state.filter || t.status === state.filter);
    listEl.innerHTML = rows.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Template</th><th>Category</th><th>Status</th><th class="hide-sm">Updated</th></tr></thead>
      <tbody>${rows.map((t) => `
        <tr data-id="${t.id}" style="cursor:pointer;${t.id === state.selectedId ? 'background:var(--green-50)' : ''}">
          <td><div class="cell-main mono">${esc(t.name)}</div><div class="cell-sub">${esc(t.language)} · ${esc((t.body || '').slice(0, 60))}${(t.body || '').length > 60 ? '…' : ''}</div></td>
          <td><span class="badge plain gray">${esc(t.category.toLowerCase())}</span></td>
          <td>${statusBadge(t.status)}</td>
          <td class="hide-sm muted small nowrap">${fmtDate(t.updated_at, false)}</td>
        </tr>`).join('')}</tbody></table></div>`
      : emptyState('template', state.list.length ? 'Nothing in this view' : 'No templates yet',
        state.list.length ? 'Try another filter.' : 'Sync templates already approved in WhatsApp Manager, or create a new one and submit it for review.',
        state.list.length ? '' : '<div class="row"><button class="btn" data-sync>Sync from Meta</button><button class="btn btn-primary" data-new>New template</button></div>');
    drawDetail();
  }

  function drawDetail() {
    const t = state.list.find((x) => x.id === state.selectedId);
    if (!t) {
      detailEl.innerHTML = `<div class="card-pad">${phonePreview(templateBubble({ body: 'Select a template to preview it here.' }), settings.business_name)}</div>`;
      return;
    }
    const editable = ['DRAFT', 'REJECTED'].includes(t.status);
    const submittable = editable && !['IMAGE', 'VIDEO', 'DOCUMENT'].includes(t.header_type);
    detailEl.innerHTML = `
      <div class="card-head"><div><h3 class="mono">${esc(t.name)}</h3><div class="sub">${esc(t.language)} · ${esc(t.category)}</div></div><div class="spacer"></div>${statusBadge(t.status)}</div>
      <div class="card-pad stack">
        ${phonePreview(templateBubble(t, { headerValues: t.examples?.header, bodyValues: t.examples?.body }), settings.business_name)}
        ${t.status === 'REJECTED' && t.rejected_reason ? `<div class="callout danger">${icon('alert')}<div><b>Rejected:</b> ${esc(t.rejected_reason)}. Edit and resubmit.</div></div>` : ''}
        ${t.status === 'PENDING' ? `<div class="callout warn">${icon('clock')}<div>Meta is reviewing this template. Use <b>Sync from Meta</b> to refresh its status.</div></div>` : ''}
        ${t.status === 'DRAFT' ? `<div class="callout">${icon('info')}<div>Drafts are saved locally. Submit to Meta for approval before using it in a campaign.</div></div>` : ''}
        <dl class="kv">
          <dt>Variables</dt><dd>${countVariables(t.header_text) + countVariables(t.body) || 'None'}</dd>
          <dt>Header</dt><dd>${esc(t.header_type.toLowerCase())}</dd>
          <dt>Last synced</dt><dd>${t.last_synced_at ? fmtDate(t.last_synced_at) : 'Never'}</dd>
        </dl>
        <div class="row">
          ${editable ? `<button class="btn btn-sm" data-act="edit">${icon('edit')} Edit</button>` : `<button class="btn btn-sm" data-act="duplicate">${icon('copy')} Duplicate</button>`}
          ${submittable ? `<button class="btn btn-sm btn-primary" data-act="submit">${icon('send')} Submit for review</button>` : ''}
          ${t.status === 'APPROVED' ? `<button class="btn btn-sm btn-primary" data-act="test">${icon('chat')} Send test</button>` : ''}
          <span style="flex:1"></span>
          <button class="btn btn-sm btn-danger" data-act="delete">${icon('trash')}</button>
        </div>
      </div>`;
  }

  // ---------- events ----------
  root.querySelector('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    state.filter = b.dataset.f;
    root.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('active', x === b));
    draw();
  });
  const sync = async (btn) => withBusy(btn, async () => {
    try {
      const { synced } = await api.sync();
      toast(`Synced ${synced} template${synced === 1 ? '' : 's'} from Meta`);
      await load();
    } catch (err) { toastError(err); }
  });
  root.querySelector('#sync').addEventListener('click', (e) => sync(e.currentTarget));
  root.querySelector('#add').addEventListener('click', () => editor());
  listEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-new]')) return editor();
    if (e.target.closest('[data-sync]')) return sync(root.querySelector('#sync'));
    const tr = e.target.closest('tr[data-id]');
    if (tr) { state.selectedId = tr.dataset.id; draw(); }
  });
  detailEl.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const t = state.list.find((x) => x.id === state.selectedId);
    if (!act || !t) return;
    if (act === 'edit') editor(t);
    if (act === 'duplicate') editor({ ...t, id: null, name: `${t.name}_copy`, status: 'DRAFT', meta_template_id: null });
    if (act === 'test') sendTest(t);
    if (act === 'submit') {
      await withBusy(e.target.closest('button'), async () => {
        try { await api.submit(t.id); toast('Submitted to Meta for review'); await load(); } catch (err) { toastError(err); }
      });
    }
    if (act === 'delete') {
      const remote = !!t.meta_template_id;
      if (!(await confirmDialog({
        title: 'Delete template',
        message: remote
          ? `Delete <b>${esc(t.name)}</b> from your WhatsApp Business Account <i>and</i> this dashboard? Meta won't let you reuse this name for 30 days.`
          : `Delete the draft <b>${esc(t.name)}</b>?`,
        confirmLabel: 'Delete',
      }))) return;
      try {
        remote ? await api.remove(t.id) : await api.removeLocal(t.id);
        toast('Template deleted');
        await load();
      } catch (err) { toastError(err); }
    }
  });

  // ---------- editor ----------
  function editor(t = null) {
    const d = t || { name: '', language: settings.default_language || 'en_US', category: 'MARKETING', header_type: 'NONE', header_text: '', body: '', footer: '', buttons: [], examples: {} };
    const buttons = [...(d.buttons || [])];
    openModal({
      title: t?.id ? `Edit ${t.name}` : 'New template',
      size: 'lg',
      submitLabel: 'Save draft',
      body: `
        <div class="split" style="grid-template-columns:minmax(0,1.3fr) minmax(260px,1fr)">
          <div class="stack">
            <div class="form-grid">
              <div class="field full"><label>Template name *</label><input class="input mono" name="name" value="${esc(d.name)}" ${t?.meta_template_id ? 'readonly' : ''} placeholder="service_reminder" required />
                <span class="hint">Lowercase letters, numbers and underscores.</span></div>
              <div class="field"><label>Language</label><select class="select" name="language" ${t?.meta_template_id ? 'disabled' : ''}>
                ${LANGUAGES.map(([v, l]) => `<option value="${v}" ${v === d.language ? 'selected' : ''}>${l}</option>`).join('')}
                ${LANGUAGES.some(([v]) => v === d.language) ? '' : `<option selected>${esc(d.language)}</option>`}</select></div>
              <div class="field"><label>Category</label><select class="select" name="category">
                ${['MARKETING', 'UTILITY', 'AUTHENTICATION'].map((c) => `<option ${c === d.category ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
              <div class="field"><label>Header</label><select class="select" name="header_type">
                ${['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'].map((h) => `<option value="${h}" ${h === d.header_type ? 'selected' : ''}>${h === 'NONE' ? 'No header' : h.charAt(0) + h.slice(1).toLowerCase()}</option>`).join('')}</select></div>
              <div class="field" data-show="TEXT"><label>Header text</label><input class="input" name="header_text" maxlength="60" value="${esc(d.header_text)}" placeholder="Service reminder" /></div>
              <div class="field full" data-show="MEDIA"><div class="callout warn">${icon('info')}<div>Media-header templates need a sample file, so create them in WhatsApp Manager and use <b>Sync from Meta</b>. You can still save a local draft.</div></div></div>
              <div class="field full"><div class="row" style="justify-content:space-between"><label>Body *</label><button type="button" class="btn btn-ghost btn-sm" id="addvar">${icon('plus')} Add variable</button></div>
                <textarea class="textarea" name="body" maxlength="1024" required placeholder="Hi {{1}}, your Epson printer service is due on {{2}}.">${esc(d.body)}</textarea>
                <span class="hint">Use {{1}}, {{2}}… for personalised values. Formatting: *bold*, _italic_, ~strike~.</span></div>
              <div class="field full"><label>Footer</label><input class="input" name="footer" maxlength="60" value="${esc(d.footer)}" placeholder="Reply STOP to opt out" /></div>
            </div>
            <div class="field"><label>Sample values for review</label><div id="examples" class="stack" style="gap:8px"></div></div>
            <div class="field"><div class="row" style="justify-content:space-between"><label>Buttons</label><button type="button" class="btn btn-ghost btn-sm" id="addbtn">${icon('plus')} Add button</button></div><div id="buttons" class="stack" style="gap:8px"></div></div>
          </div>
          <div class="stack" style="position:sticky;top:0"><span class="label">Preview</span><div id="preview"></div></div>
        </div>`,
      onOpen: (form) => {
        const ex = { header: [...(d.examples?.header || [])], body: [...(d.examples?.body || [])] };
        const preview = form.querySelector('#preview');

        const current = () => ({
          header_type: form.header_type.value,
          header_text: form.header_text.value,
          body: form.body.value,
          footer: form.footer.value,
          buttons,
        });
        const drawExamples = () => {
          const h = form.header_type.value === 'TEXT' ? countVariables(form.header_text.value) : 0;
          const b = countVariables(form.body.value);
          const inputs = [
            ...Array.from({ length: h }, (_, i) => ['header', i, `Header {{${i + 1}}}`]),
            ...Array.from({ length: b }, (_, i) => ['body', i, `{{${i + 1}}}`]),
          ];
          form.querySelector('#examples').innerHTML = inputs.length
            ? inputs.map(([k, i, label]) => `<div class="var-row" style="grid-template-columns:90px 1fr"><span class="tag">${label}</span><input class="input" data-ex="${k}" data-i="${i}" value="${esc(ex[k][i] || '')}" placeholder="Sample value"/></div>`).join('')
            : '<span class="muted small">No variables in this template.</span>';
        };
        const drawButtons = () => {
          form.querySelector('#buttons').innerHTML = buttons.length ? buttons.map((b, i) => `
            <div class="row" style="flex-wrap:nowrap" data-b="${i}">
              <select class="select" data-k="type" style="width:150px">
                <option value="QUICK_REPLY" ${b.type === 'QUICK_REPLY' ? 'selected' : ''}>Quick reply</option>
                <option value="URL" ${b.type === 'URL' ? 'selected' : ''}>Visit website</option>
                <option value="PHONE_NUMBER" ${b.type === 'PHONE_NUMBER' ? 'selected' : ''}>Call number</option>
              </select>
              <input class="input" data-k="text" maxlength="25" value="${esc(b.text)}" placeholder="Button text" />
              ${b.type === 'URL' ? `<input class="input" data-k="url" value="${esc(b.url)}" placeholder="https://epson.example/service" />` : ''}
              ${b.type === 'PHONE_NUMBER' ? `<input class="input" data-k="phone_number" value="${esc(b.phone_number)}" placeholder="+911800..." />` : ''}
              <button type="button" class="btn btn-ghost btn-icon btn-sm" data-rm="${i}">${icon('x')}</button>
            </div>`).join('') : '<span class="muted small">No buttons.</span>';
          form.querySelector('#addbtn').disabled = buttons.length >= 3;
        };
        const refresh = () => {
          const ht = form.header_type.value;
          form.querySelector('[data-show=TEXT]').hidden = ht !== 'TEXT';
          form.querySelector('[data-show=MEDIA]').hidden = !['IMAGE', 'VIDEO', 'DOCUMENT'].includes(ht);
          preview.innerHTML = phonePreview(templateBubble(current(), { headerValues: ex.header, bodyValues: ex.body }), settings.business_name);
        };

        form.addEventListener('input', (e) => {
          if (e.target.dataset.ex) ex[e.target.dataset.ex][Number(e.target.dataset.i)] = e.target.value;
          const row = e.target.closest('[data-b]');
          if (row && e.target.dataset.k && e.target.dataset.k !== 'type') buttons[Number(row.dataset.b)][e.target.dataset.k] = e.target.value;
          if (e.target.name === 'name') e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
          if (['body', 'header_text'].includes(e.target.name)) drawExamples();
          refresh();
        });
        form.addEventListener('change', (e) => {
          const row = e.target.closest('[data-b]');
          if (row && e.target.dataset.k === 'type') { buttons[Number(row.dataset.b)].type = e.target.value; drawButtons(); }
          if (e.target.name === 'header_type') drawExamples();
          refresh();
        });
        form.addEventListener('click', (e) => {
          const rm = e.target.closest('[data-rm]');
          if (rm) { buttons.splice(Number(rm.dataset.rm), 1); drawButtons(); refresh(); }
        });
        form.querySelector('#addbtn').addEventListener('click', () => { buttons.push({ type: 'QUICK_REPLY', text: '' }); drawButtons(); refresh(); });
        form.querySelector('#addvar').addEventListener('click', () => {
          const ta = form.body;
          const tag = `{{${countVariables(ta.value) + 1}}}`;
          const pos = ta.selectionStart ?? ta.value.length;
          ta.value = ta.value.slice(0, pos) + tag + ta.value.slice(ta.selectionEnd ?? pos);
          ta.focus();
          ta.selectionStart = ta.selectionEnd = pos + tag.length;
          drawExamples();
          refresh();
        });
        form._examples = ex;
        drawExamples();
        drawButtons();
        refresh();
      },
      onSubmit: async (form) => {
        const name = form.name.value.trim();
        if (!/^[a-z0-9_]+$/.test(name)) throw new Error('Template name may only contain lowercase letters, numbers and underscores');
        if (!form.body.value.trim()) throw new Error('Body text is required');
        const headerType = form.header_type.value;
        const ex = form._examples;
        const h = headerType === 'TEXT' ? countVariables(form.header_text.value) : 0;
        const b = countVariables(form.body.value);
        const saved = await api.save({
          id: t?.id || undefined,
          name,
          language: form.language.value,
          category: form.category.value,
          header_type: headerType,
          header_text: headerType === 'TEXT' ? form.header_text.value.trim() || null : null,
          body: form.body.value.trim(),
          footer: form.footer.value.trim() || null,
          buttons: buttons.filter((x) => x.text?.trim()),
          examples: { header: ex.header.slice(0, h), body: ex.body.slice(0, b) },
          status: t?.status === 'REJECTED' ? 'REJECTED' : 'DRAFT',
        });
        state.selectedId = saved.id;
        toast('Template saved');
        await load();
      },
    });
  }

  function sendTest(t) {
    const h = t.header_type === 'TEXT' ? countVariables(t.header_text) : 0;
    const b = countVariables(t.body);
    const media = ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(t.header_type);
    openModal({
      title: `Send test: ${t.name}`,
      submitLabel: 'Send test message',
      body: `
        <div class="field"><label>WhatsApp number</label><input class="input mono" name="phone" placeholder="+919876543210" required />
          <span class="hint">With country code. The recipient must be able to receive messages from your business number.</span></div>
        ${media ? `<div class="field"><label>Header ${t.header_type.toLowerCase()} URL</label><input class="input" name="media" placeholder="https://…" required /></div>` : ''}
        ${Array.from({ length: h }, (_, i) => `<div class="field"><label>Header {{${i + 1}}}</label><input class="input" data-h="${i}" value="${esc(t.examples?.header?.[i] || '')}"/></div>`).join('')}
        ${Array.from({ length: b }, (_, i) => `<div class="field"><label>Body {{${i + 1}}}</label><input class="input" data-v="${i}" value="${esc(t.examples?.body?.[i] || '')}"/></div>`).join('')}`,
      onSubmit: async (form) => {
        await api.sendTest({
          template_id: t.id,
          phone: form.phone.value,
          header_media_url: form.media?.value || null,
          header_values: [...form.querySelectorAll('[data-h]')].map((x) => x.value),
          body_values: [...form.querySelectorAll('[data-v]')].map((x) => x.value),
        });
        toast('Test message sent');
      },
    });
  }

  await load();
}
