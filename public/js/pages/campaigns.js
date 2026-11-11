import { campaigns as api } from '../api.js';
import { runCampaign, isRunning } from '../runner.js';
import { confirmDialog, emptyState, esc, fmtDate, icon, num, pct, statusBadge, toast, toastError, timeAgo } from '../ui.js';

const FILTERS = [['', 'All'], ['draft', 'Drafts'], ['scheduled', 'Scheduled'], ['sending', 'Sending'], ['completed', 'Completed']];

export default async function render(root, { navigate, isCurrent }) {
  const state = { filter: '', list: [] };
  let timer = null;

  root.innerHTML = `
    <div class="row">
      <div class="tabs" id="tabs">${FILTERS.map(([v, l]) => `<button type="button" data-f="${v}" class="${v === '' ? 'active' : ''}">${l}</button>`).join('')}</div>
      <span style="flex:1"></span>
      <a class="btn btn-primary" href="#/campaigns/new">${icon('plus')} New campaign</a>
    </div>
    <div class="card" id="list"></div>`;
  const listEl = root.querySelector('#list');

  async function load() {
    try {
      state.list = await api.list({ status: state.filter });
    } catch (err) {
      listEl.innerHTML = emptyState('alert', 'Could not load campaigns', esc(err.message));
      return;
    }
    if (!isCurrent()) return;
    draw();
    clearTimeout(timer);
    if (state.list.some((c) => c.status === 'sending' || c.status === 'scheduled')) timer = setTimeout(load, 8000);
  }

  function draw() {
    if (!state.list.length) {
      listEl.innerHTML = emptyState('send', state.filter ? 'No campaigns here' : 'No campaigns yet',
        'Pick an approved template and one or more groups to start a bulk send.',
        '<a class="btn btn-primary" href="#/campaigns/new">Create campaign</a>');
      return;
    }
    listEl.innerHTML = `<div class="table-wrap"><table class="table">
      <thead><tr><th>Campaign</th><th>Status</th><th>Progress</th><th class="hide-sm">Delivered</th><th class="hide-sm">Read</th><th class="hide-sm">Failed</th><th></th></tr></thead>
      <tbody>${state.list.map(row).join('')}</tbody></table></div>`;
  }

  function row(c) {
    const done = c.total - c.pending;
    const when = c.status === 'scheduled' ? `<span title="${fmtDate(c.scheduled_at)}">Sends ${timeAgo(c.scheduled_at)}</span>`
      : c.completed_at ? `Finished ${timeAgo(c.completed_at)}` : c.started_at ? `Started ${timeAgo(c.started_at)}` : `Created ${timeAgo(c.created_at)}`;
    const actions = [];
    if (['draft', 'scheduled'].includes(c.status)) {
      actions.push(`<button class="btn btn-sm btn-primary" data-act="send">${icon('send')} Send now</button>`);
      actions.push(`<a class="btn btn-sm btn-icon" href="#/campaigns/${c.id}/edit" title="Edit">${icon('edit')}</a>`);
    }
    if (c.status === 'sending') actions.push(`<button class="btn btn-sm" data-act="pause">${icon('pause')} Pause</button>`);
    if (c.status === 'paused') actions.push(`<button class="btn btn-sm btn-primary" data-act="resume">${icon('play')} Resume</button>`);
    if (['scheduled', 'sending', 'paused'].includes(c.status)) actions.push(`<button class="btn btn-sm btn-danger" data-act="cancel">Cancel</button>`);
    if (c.total) actions.push(`<a class="btn btn-sm" href="#/reports?campaign=${c.id}">${icon('reports')} Report</a>`);
    if (['draft', 'completed', 'cancelled', 'failed'].includes(c.status)) actions.push(`<button class="btn btn-sm btn-icon btn-ghost" data-act="delete" title="Delete">${icon('trash')}</button>`);
    return `<tr data-id="${c.id}">
      <td><div class="cell-main">${esc(c.name)}</div><div class="cell-sub">${esc(c.template_name || 'No template')} · ${when}</div>
        ${c.status === 'failed' && c.last_error ? `<div class="cell-sub" style="color:var(--red)">${esc(c.last_error)}</div>` : ''}</td>
      <td>${statusBadge(c.status)}${isRunning(c.id) ? ' <span class="spinner sm"></span>' : ''}</td>
      <td style="min-width:140px">${c.total ? `<div class="progress thin" title="${num(done)} of ${num(c.total)} processed">
          <span style="width:${(c.read / c.total) * 100}%;background:#075e54"></span>
          <span style="width:${((c.delivered - c.read) / c.total) * 100}%;background:#25d366"></span>
          <span style="width:${((c.sent - c.delivered) / c.total) * 100}%;background:#a6e8bf"></span>
          <span style="width:${(c.failed / c.total) * 100}%;background:#e06363"></span></div>
        <div class="cell-sub">${num(done)} / ${num(c.total)} processed</div>` : '<span class="muted small">Not started</span>'}</td>
      <td class="hide-sm">${num(c.delivered)} <span class="muted small">${pct(c.delivered, c.total)}</span></td>
      <td class="hide-sm">${num(c.read)} <span class="muted small">${pct(c.read, c.delivered)}</span></td>
      <td class="hide-sm">${c.failed ? `<span style="color:var(--red)">${num(c.failed)}</span>` : '0'}</td>
      <td class="actions"><div class="row end" style="gap:6px;flex-wrap:nowrap">${actions.join('')}</div></td>
    </tr>`;
  }

  root.querySelector('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    state.filter = b.dataset.f;
    root.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('active', x === b));
    load();
  });

  listEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.closest('tr').dataset.id;
    const c = state.list.find((x) => x.id === id);
    try {
      switch (btn.dataset.act) {
        case 'send': {
          if (!(await confirmDialog({ title: 'Send campaign now', message: `Start sending <b>${esc(c.name)}</b> to its audience now?`, confirmLabel: 'Send now', danger: false }))) return;
          const p = runCampaign(id, { onProgress: () => isCurrent() && load() });
          load();
          await p;
          break;
        }
        case 'pause':
          await api.setStatus(id, 'paused');
          toast('Pausing after the current batch', 'info');
          break;
        case 'resume': {
          await api.setStatus(id, 'sending');
          const p = runCampaign(id, { onProgress: () => isCurrent() && load() });
          load();
          await p;
          break;
        }
        case 'cancel':
          if (!(await confirmDialog({ title: 'Cancel campaign', message: 'Messages not yet sent will not be sent. This cannot be undone.', confirmLabel: 'Cancel campaign' }))) return;
          await api.cancel(id);
          toast('Campaign cancelled');
          break;
        case 'delete':
          if (!(await confirmDialog({ title: 'Delete campaign', message: `Delete <b>${esc(c.name)}</b> and its delivery report?`, confirmLabel: 'Delete' }))) return;
          await api.remove(id);
          toast('Campaign deleted');
          break;
      }
    } catch (err) { toastError(err); }
    if (isCurrent()) load();
  });

  await load();
  return () => clearTimeout(timer);
}
