import { groups as groupsApi } from '../api.js';
import { confirmDialog, emptyState, esc, fmtDate, icon, num, openModal, pct, toast, toastError } from '../ui.js';

const COLORS = ['#25D366', '#128C7E', '#075E54', '#2F7DE1', '#7B5BD6', '#E0739B', '#E0A21B', '#E06363', '#5E7380'];

export default async function render(root, { navigate }) {
  let list = [];

  root.innerHTML = `
    <div class="row">
      <p class="muted" style="flex:1">Groups are the audiences you send campaigns to. A contact can belong to several groups.</p>
      <button class="btn btn-primary" id="add">${icon('plus')} New group</button>
    </div>
    <div id="grid"></div>`;
  const grid = root.querySelector('#grid');

  async function load() {
    list = await groupsApi.list();
    if (!list.length) {
      grid.innerHTML = `<div class="card">${emptyState('folder', 'No groups yet', 'Create groups such as “Dealers”, “Service customers” or “Mumbai” to target campaigns.',
        '<button class="btn btn-primary" data-new>Create first group</button>')}</div>`;
      return;
    }
    grid.innerHTML = `<div class="group-grid">${list.map((g) => `
      <div class="card group-card" style="--gc:${esc(g.color)}">
        <div class="row" style="justify-content:space-between;align-items:flex-start">
          <div><h3>${esc(g.name)}</h3><p class="muted small">${esc(g.description || 'No description')}</p></div>
          <div class="row" style="gap:2px;flex-wrap:nowrap">
            <button class="btn btn-ghost btn-icon btn-sm" data-edit="${g.id}" title="Edit">${icon('edit')}</button>
            <button class="btn btn-ghost btn-icon btn-sm" data-del="${g.id}" title="Delete">${icon('trash')}</button>
          </div>
        </div>
        <div class="row" style="justify-content:space-between;align-items:flex-end">
          <div><div class="count">${num(g.member_count)}</div><div class="muted small">contacts · ${pct(g.opted_in_count, g.member_count)} opted in</div></div>
          <span class="muted small">Created ${fmtDate(g.created_at, false)}</span>
        </div>
        <div class="progress thin"><span style="width:${g.member_count ? (g.opted_in_count / g.member_count) * 100 : 0}%;background:${esc(g.color)}"></span></div>
        <div class="row">
          <button class="btn btn-sm" data-view="${g.id}">${icon('contacts')} View contacts</button>
          <a class="btn btn-sm" href="#/campaigns/new?group=${g.id}">${icon('send')} Message group</a>
        </div>
      </div>`).join('')}</div>`;
  }

  function edit(g = null) {
    const color = g?.color || COLORS[list.length % COLORS.length];
    openModal({
      title: g ? 'Edit group' : 'New group',
      submitLabel: g ? 'Save changes' : 'Create group',
      body: `
        <div class="field"><label>Name *</label><input class="input" name="name" value="${esc(g?.name)}" required /></div>
        <div class="field"><label>Description</label><input class="input" name="description" value="${esc(g?.description)}" placeholder="Who is in this group?" /></div>
        <div class="field"><label>Colour</label><div class="swatches">${COLORS.map((c) => `
          <label><input type="radio" name="color" value="${c}" ${c.toLowerCase() === color.toLowerCase() ? 'checked' : ''}/><span style="background:${c}"></span></label>`).join('')}</div></div>`,
      onSubmit: async (form) => {
        const name = form.name.value.trim();
        if (!name) throw new Error('Group name is required');
        await groupsApi.save({ id: g?.id, name, description: form.description.value.trim() || null, color: form.color.value });
        toast(g ? 'Group updated' : 'Group created');
        load();
      },
    });
  }

  root.querySelector('#add').addEventListener('click', () => edit());
  grid.addEventListener('click', async (e) => {
    if (e.target.closest('[data-new]')) return edit();
    const id = e.target.closest('[data-edit],[data-del],[data-view]');
    if (!id) return;
    const g = list.find((x) => x.id === (id.dataset.edit || id.dataset.del || id.dataset.view));
    if (id.dataset.edit) edit(g);
    if (id.dataset.view) navigate(`contacts?group=${g.id}`);
    if (id.dataset.del && await confirmDialog({
      title: 'Delete group',
      message: `Delete “${esc(g.name)}”? The ${num(g.member_count)} contacts in it are kept.`,
      confirmLabel: 'Delete group',
    })) {
      try { await groupsApi.remove(g.id); toast('Group deleted'); load(); } catch (err) { toastError(err); }
    }
  });

  await load();
}
