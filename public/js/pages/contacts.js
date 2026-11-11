import { contacts, groups as groupsApi, cachedSettings } from '../api.js';
import {
  confirmDialog, debounce, downloadCSV, emptyState, esc, fmtDate, fmtPhone, icon, loadingBlock,
  normalizePhone, num, openModal, toast, toastError,
} from '../ui.js';

const PAGE_SIZE = 25;

export default async function render(root, { query, navigate }) {
  const state = { search: query.q || '', groupId: query.group || '', optIn: '', page: 1, selected: new Set(), rows: [], count: 0 };
  let groupList = await groupsApi.list();
  const groupById = () => new Map(groupList.map((g) => [g.id, g]));

  root.innerHTML = `
    <div class="row">
      <p class="muted" style="flex:1">Contacts must have opted in to receive WhatsApp messages from your business.</p>
      <button class="btn" id="export">${icon('download')} Export CSV</button>
      <a class="btn" href="#/import">${icon('upload')} Import</a>
      <button class="btn btn-primary" id="add">${icon('plus')} Add contact</button>
    </div>
    <div class="card">
      <div class="toolbar">
        <div class="input-icon grow">${icon('search')}<input class="input" id="search" placeholder="Search name, phone or email" value="${esc(state.search)}" /></div>
        <select class="select" id="group" style="width:auto;min-width:170px">
          <option value="">All groups</option>
          ${groupList.map((g) => `<option value="${g.id}" ${g.id === state.groupId ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}
        </select>
        <select class="select" id="optin" style="width:auto">
          <option value="">Any consent</option><option value="in">Opted in</option><option value="out">Opted out</option>
        </select>
      </div>
      <div class="bulkbar" id="bulk" hidden>
        <span id="bulk-count"></span><span style="flex:1"></span>
        <button class="btn btn-sm" data-bulk="group">${icon('folder')} Add to group</button>
        ${state.groupId ? `<button class="btn btn-sm" data-bulk="ungroup">Remove from group</button>` : ''}
        <button class="btn btn-sm" data-bulk="optin">Mark opted in</button>
        <button class="btn btn-sm" data-bulk="optout">Mark opted out</button>
        <button class="btn btn-sm btn-danger" data-bulk="delete">${icon('trash')} Delete</button>
      </div>
      <div id="list">${loadingBlock()}</div>
      <div class="pager" id="pager"></div>
    </div>`;

  const list = root.querySelector('#list');

  async function load() {
    list.innerHTML = loadingBlock();
    try {
      const { data, count } = await contacts.list({ ...state, pageSize: PAGE_SIZE });
      state.rows = data;
      state.count = count;
      draw();
    } catch (err) {
      list.innerHTML = emptyState('alert', 'Could not load contacts', esc(err.message));
    }
  }

  function draw() {
    const gmap = groupById();
    if (!state.rows.length) {
      const filtered = state.search || state.groupId || state.optIn;
      list.innerHTML = filtered
        ? emptyState('search', 'No matching contacts', 'Try a different search or filter.')
        : emptyState('contacts', 'No contacts yet', 'Add contacts one by one or import an Excel/CSV file.',
          '<div class="row"><a class="btn btn-primary" href="#/import">Import contacts</a></div>');
    } else {
      const allChecked = state.rows.every((r) => state.selected.has(r.id));
      list.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr>
          <th style="width:40px"><input type="checkbox" id="all" ${allChecked ? 'checked' : ''} aria-label="Select all"/></th>
          <th>Name</th><th>Phone</th><th class="hide-sm">Groups</th><th>Consent</th><th class="hide-sm">Added</th><th></th>
        </tr></thead>
        <tbody>${state.rows.map((c) => `<tr>
          <td><input type="checkbox" data-sel="${c.id}" ${state.selected.has(c.id) ? 'checked' : ''} aria-label="Select"/></td>
          <td><div class="cell-main">${esc(c.name || 'Unnamed')}</div><div class="cell-sub">${esc(c.email || '')}</div></td>
          <td class="mono nowrap">${fmtPhone(c.phone)}</td>
          <td class="hide-sm"><div class="row" style="gap:6px">${(c.memberships || []).map((m) => gmap.get(m.group_id)).filter(Boolean)
            .map((g) => `<span class="chip"><i style="background:${esc(g.color)}"></i>${esc(g.name)}</span>`).join('') || '<span class="muted">—</span>'}</div></td>
          <td>${c.opted_in ? '<span class="badge green">Opted in</span>' : '<span class="badge red">Opted out</span>'}</td>
          <td class="hide-sm muted small nowrap">${fmtDate(c.created_at, false)}</td>
          <td class="actions">
            <button class="btn btn-ghost btn-icon btn-sm" data-edit="${c.id}" title="Edit">${icon('edit')}</button>
            <button class="btn btn-ghost btn-icon btn-sm" data-del="${c.id}" title="Delete">${icon('trash')}</button>
          </td></tr>`).join('')}
        </tbody></table></div>`;
    }
    const pages = Math.max(1, Math.ceil(state.count / PAGE_SIZE));
    const from = state.count ? (state.page - 1) * PAGE_SIZE + 1 : 0;
    root.querySelector('#pager').innerHTML = `
      <span>${num(from)}–${num(Math.min(state.page * PAGE_SIZE, state.count))} of ${num(state.count)} contacts</span>
      <div class="row">
        <button class="btn btn-sm" id="prev" ${state.page <= 1 ? 'disabled' : ''}>Previous</button>
        <span>Page ${state.page} / ${pages}</span>
        <button class="btn btn-sm" id="next" ${state.page >= pages ? 'disabled' : ''}>Next</button>
      </div>`;
    root.querySelector('#prev').onclick = () => { state.page--; load(); };
    root.querySelector('#next').onclick = () => { state.page++; load(); };
    drawBulk();
  }

  function drawBulk() {
    const bulk = root.querySelector('#bulk');
    bulk.hidden = state.selected.size === 0;
    root.querySelector('#bulk-count').textContent = `${num(state.selected.size)} selected`;
  }

  // ----- events -----
  root.querySelector('#search').addEventListener('input', debounce((e) => { state.search = e.target.value; state.page = 1; load(); }, 300));
  root.querySelector('#group').addEventListener('change', (e) => {
    navigate(e.target.value ? `contacts?group=${e.target.value}` : 'contacts');
  });
  root.querySelector('#optin').addEventListener('change', (e) => { state.optIn = e.target.value; state.page = 1; load(); });
  root.querySelector('#add').addEventListener('click', () => editContact());

  list.addEventListener('change', (e) => {
    if (e.target.id === 'all') {
      state.rows.forEach((r) => (e.target.checked ? state.selected.add(r.id) : state.selected.delete(r.id)));
      list.querySelectorAll('[data-sel]').forEach((c) => (c.checked = e.target.checked));
    } else if (e.target.dataset.sel) {
      e.target.checked ? state.selected.add(e.target.dataset.sel) : state.selected.delete(e.target.dataset.sel);
    }
    drawBulk();
  });

  list.addEventListener('click', async (e) => {
    const edit = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-del]');
    if (edit) editContact(state.rows.find((r) => r.id === edit.dataset.edit));
    if (del) {
      const c = state.rows.find((r) => r.id === del.dataset.del);
      if (await confirmDialog({ title: 'Delete contact', message: `Delete ${esc(c.name || fmtPhone(c.phone))}? Their message history stays in reports.`, confirmLabel: 'Delete' })) {
        try { await contacts.remove([c.id]); state.selected.delete(c.id); toast('Contact deleted'); load(); } catch (err) { toastError(err); }
      }
    }
  });

  root.querySelector('#bulk').addEventListener('click', async (e) => {
    const action = e.target.closest('[data-bulk]')?.dataset.bulk;
    if (!action) return;
    const ids = [...state.selected];
    try {
      if (action === 'group') return pickGroup(ids);
      if (action === 'ungroup') { await contacts.removeFromGroup(ids, state.groupId); toast(`Removed ${num(ids.length)} from group`); }
      if (action === 'optin') { await contacts.setOptIn(ids, true); toast(`${num(ids.length)} marked opted in`); }
      if (action === 'optout') { await contacts.setOptIn(ids, false); toast(`${num(ids.length)} marked opted out`); }
      if (action === 'delete') {
        if (!(await confirmDialog({ title: 'Delete contacts', message: `Permanently delete ${num(ids.length)} contacts?`, confirmLabel: 'Delete' }))) return;
        await contacts.remove(ids);
        toast(`Deleted ${num(ids.length)} contacts`);
      }
      state.selected.clear();
      load();
    } catch (err) { toastError(err); }
  });

  root.querySelector('#export').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const rows = await contacts.exportAll(state);
      const gmap = groupById();
      const attrKeys = [...new Set(rows.flatMap((r) => Object.keys(r.attributes || {})))];
      downloadCSV(`contacts-${new Date().toISOString().slice(0, 10)}.csv`, [
        ['name', 'phone', 'email', 'opted_in', 'groups', ...attrKeys, 'created_at'],
        ...rows.map((r) => [r.name, `+${r.phone}`, r.email, r.opted_in, (r.memberships || []).map((m) => gmap.get(m.group_id)?.name).filter(Boolean).join('; '),
          ...attrKeys.map((k) => r.attributes?.[k] ?? ''), r.created_at]),
      ]);
    } catch (err) { toastError(err); } finally { btn.disabled = false; }
  });

  function pickGroup(ids) {
    if (!groupList.length) return toast('Create a group first on the Groups page', 'info');
    openModal({
      title: `Add ${num(ids.length)} contacts to a group`,
      body: `<div class="field"><label>Group</label><select class="select" name="group">${groupList.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select></div>`,
      submitLabel: 'Add to group',
      onSubmit: async (form) => {
        await contacts.addToGroup(ids, form.group.value);
        toast('Added to group');
        state.selected.clear();
        load();
      },
    });
  }

  async function editContact(c = null) {
    const settings = await cachedSettings();
    const memberIds = new Set((c?.memberships || []).map((m) => m.group_id));
    const attrs = Object.entries(c?.attributes || {}).map(([k, v]) => `${k}: ${v}`).join('\n');
    openModal({
      title: c ? 'Edit contact' : 'Add contact',
      submitLabel: c ? 'Save changes' : 'Add contact',
      body: `
        <div class="form-grid">
          <div class="field"><label>Name</label><input class="input" name="name" value="${esc(c?.name)}" /></div>
          <div class="field"><label>WhatsApp number *</label><input class="input mono" name="phone" value="${c ? '+' + esc(c.phone) : ''}" placeholder="+91 98765 43210" required />
            <span class="hint">Include the country code${settings.default_country_code ? ` (defaults to +${esc(settings.default_country_code)})` : ''}.</span></div>
          <div class="field full"><label>Email</label><input class="input" type="email" name="email" value="${esc(c?.email)}" /></div>
          <div class="field full"><label>Custom fields</label><textarea class="textarea" name="attributes" style="min-height:80px" placeholder="city: Mumbai\ncustomer_id: 10442">${esc(attrs)}</textarea>
            <span class="hint">One <code>key: value</code> per line. Usable as template variables.</span></div>
          <div class="field full"><label>Groups</label>
            <div class="row">${groupList.length ? groupList.map((g) => `<label class="check"><input type="checkbox" name="groups" value="${g.id}" ${memberIds.has(g.id) ? 'checked' : ''}/>${esc(g.name)}</label>`).join('') : '<span class="muted small">No groups yet.</span>'}</div></div>
          <div class="field full"><label class="switch"><input type="checkbox" name="opted_in" ${!c || c.opted_in ? 'checked' : ''}/> Opted in to WhatsApp messages</label></div>
        </div>`,
      onSubmit: async (form) => {
        const phone = normalizePhone(form.phone.value, settings.default_country_code);
        if (!phone) throw new Error('Enter a valid WhatsApp number with country code');
        const attributes = {};
        form.attributes.value.split('\n').forEach((line) => {
          const i = line.indexOf(':');
          if (i > 0) attributes[line.slice(0, i).trim()] = line.slice(i + 1).trim();
        });
        const optedIn = form.opted_in.checked;
        await contacts.save({
          id: c?.id,
          name: form.name.value.trim() || null,
          phone,
          email: form.email.value.trim() || null,
          attributes,
          opted_in: optedIn,
          opted_out_at: optedIn ? null : (c?.opted_out_at || new Date().toISOString()),
        }, [...form.querySelectorAll('[name=groups]:checked')].map((x) => x.value));
        toast(c ? 'Contact updated' : 'Contact added');
        groupList = await groupsApi.list();
        load();
      },
    });
  }

  load();
}
