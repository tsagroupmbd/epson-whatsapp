import { campaigns as campaignsApi, messages as api } from '../api.js';
import { debounce, downloadCSV, emptyState, esc, fmtDate, fmtPhone, icon, loadingBlock, num, pct, statusBadge, toastError } from '../ui.js';

const PAGE_SIZE = 50;
const STATUS_FILTERS = [['', 'All'], ['pending', 'Queued'], ['sent', 'Sent'], ['delivered', 'Delivered'], ['read', 'Read'], ['failed', 'Failed']];

export default async function render(root, { query, navigate, isCurrent }) {
  const all = await campaignsApi.list();
  const state = { campaignId: query.campaign || '', status: query.status || '', search: '', page: 1 };
  let timer = null;

  root.innerHTML = `
    <div class="row">
      <select class="select" id="campaign" style="max-width:360px">
        <option value="">All campaigns</option>
        ${all.map((c) => `<option value="${c.id}" ${c.id === state.campaignId ? 'selected' : ''}>${esc(c.name)} — ${esc(c.status)}</option>`).join('')}
      </select>
      <span style="flex:1"></span>
      <button class="btn" id="refresh">${icon('refresh')} Refresh</button>
      <button class="btn" id="export">${icon('download')} Export CSV</button>
    </div>
    <div id="overview"></div>
    <div class="card">
      <div class="toolbar">
        <div class="tabs" id="tabs">${STATUS_FILTERS.map(([v, l]) => `<button type="button" data-f="${v}" class="${v === state.status ? 'active' : ''}">${l}</button>`).join('')}</div>
        <div class="input-icon grow">${icon('search')}<input class="input" id="search" placeholder="Search phone number" inputmode="tel"/></div>
      </div>
      <div id="rows">${loadingBlock()}</div>
      <div class="pager" id="pager"></div>
    </div>`;

  const $ = (s) => root.querySelector(s);

  async function loadOverview() {
    let c;
    if (state.campaignId) {
      c = await campaignsApi.get(state.campaignId);
    } else {
      const latest = await campaignsApi.list();
      c = latest.reduce((acc, x) => {
        ['total', 'pending', 'sent', 'delivered', 'read', 'failed'].forEach((k) => (acc[k] += Number(x[k] || 0)));
        return acc;
      }, { total: 0, pending: 0, sent: 0, delivered: 0, read: 0, failed: 0 });
    }
    const errors = await api.errorSummary(state.campaignId).catch(() => []);
    if (!isCurrent()) return c;
    const attempted = c.sent + c.failed;
    $('#overview').innerHTML = `
      ${state.campaignId ? `<div class="card card-pad row" style="justify-content:space-between">
        <div><h3>${esc(c.name)}</h3><p class="muted small">Template <span class="mono">${esc(c.template_name || '—')}</span> · Started ${fmtDate(c.started_at)}${c.completed_at ? ` · Completed ${fmtDate(c.completed_at)}` : ''}</p></div>
        ${statusBadge(c.status)}</div>` : ''}
      <section class="stats" style="margin-top:${state.campaignId ? '18px' : '0'}">
        ${tile('Recipients', num(c.total), `${num(c.pending)} still queued`)}
        ${tile('Delivered', num(c.delivered), `<b>${pct(c.delivered, attempted)}</b> of attempted`)}
        ${tile('Read', num(c.read), `<b>${pct(c.read, c.delivered)}</b> of delivered`)}
        ${tile('Failed', `<span style="color:${c.failed ? 'var(--red)' : 'inherit'}">${num(c.failed)}</span>`, `${pct(c.failed, attempted)} of attempted`)}
      </section>
      ${errors.length ? `<div class="card" style="margin-top:18px"><div class="card-head"><h3>Failure reasons</h3><div class="sub">Grouped by WhatsApp error</div></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>Code</th><th>Reason</th><th class="right">Messages</th></tr></thead>
        <tbody>${errors.slice(0, 6).map((e) => `<tr><td class="mono">${esc(e.code)}</td><td>${esc(e.message)}</td><td class="right"><b>${num(e.count)}</b></td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
    return c;
  }

  async function loadRows() {
    $('#rows').innerHTML = loadingBlock();
    try {
      const { data, count } = await api.list({ ...state, pageSize: PAGE_SIZE });
      if (!isCurrent()) return;
      $('#rows').innerHTML = data.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Recipient</th>${state.campaignId ? '' : '<th class="hide-sm">Campaign</th>'}<th>Status</th><th class="hide-sm">Sent</th><th class="hide-sm">Delivered</th><th class="hide-sm">Read</th><th>Details</th></tr></thead>
        <tbody>${data.map((m) => `<tr>
          <td><div class="cell-main">${esc(m.contact?.name || 'Unknown')}</div><div class="cell-sub mono">${fmtPhone(m.phone)}</div></td>
          ${state.campaignId ? '' : `<td class="hide-sm small">${esc(m.campaign?.name || '—')}</td>`}
          <td>${statusBadge(m.status === 'sending' ? 'queued' : m.status)}</td>
          <td class="hide-sm small muted nowrap">${fmtDate(m.sent_at)}</td>
          <td class="hide-sm small muted nowrap">${fmtDate(m.delivered_at)}</td>
          <td class="hide-sm small muted nowrap">${fmtDate(m.read_at)}</td>
          <td class="small">${m.status === 'failed' ? `<span style="color:var(--red)">${esc(m.error_message || 'Failed')}</span> <span class="muted mono">${esc(m.error_code || '')}</span>` : '<span class="muted">—</span>'}</td>
        </tr>`).join('')}</tbody></table></div>`
        : emptyState('reports', 'No messages', state.status || state.search ? 'Nothing matches this filter.' : 'Messages appear here once a campaign starts sending.');
      const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
      $('#pager').innerHTML = `<span>${num(count)} messages</span>
        <div class="row"><button class="btn btn-sm" id="prev" ${state.page <= 1 ? 'disabled' : ''}>Previous</button>
        <span>Page ${state.page} / ${pages}</span><button class="btn btn-sm" id="next" ${state.page >= pages ? 'disabled' : ''}>Next</button></div>`;
      $('#prev').onclick = () => { state.page--; loadRows(); };
      $('#next').onclick = () => { state.page++; loadRows(); };
    } catch (err) {
      $('#rows').innerHTML = emptyState('alert', 'Could not load messages', esc(err.message));
    }
  }

  async function loadAll() {
    clearTimeout(timer);
    const [c] = await Promise.all([loadOverview(), loadRows()]);
    if (isCurrent() && (c?.status === 'sending' || (!state.campaignId && c?.pending))) timer = setTimeout(loadAll, 10000);
  }

  $('#campaign').addEventListener('change', (e) => navigate(e.target.value ? `reports?campaign=${e.target.value}` : 'reports'));
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    state.status = b.dataset.f;
    state.page = 1;
    root.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('active', x === b));
    loadRows();
  });
  $('#search').addEventListener('input', debounce((e) => { state.search = e.target.value; state.page = 1; loadRows(); }, 300));
  $('#refresh').addEventListener('click', loadAll);
  $('#export').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const rows = [];
      for (let page = 1; ; page++) {
        const { data } = await api.list({ ...state, page, pageSize: 1000 });
        rows.push(...data);
        if (data.length < 1000) break;
      }
      downloadCSV(`delivery-report-${new Date().toISOString().slice(0, 10)}.csv`, [
        ['campaign', 'name', 'phone', 'status', 'wa_message_id', 'sent_at', 'delivered_at', 'read_at', 'failed_at', 'error_code', 'error_message'],
        ...rows.map((m) => [m.campaign?.name, m.contact?.name, `+${m.phone}`, m.status, m.wa_message_id, m.sent_at, m.delivered_at, m.read_at, m.failed_at, m.error_code, m.error_message]),
      ]);
    } catch (err) { toastError(err); } finally { btn.disabled = false; }
  });

  await loadAll();
  return () => clearTimeout(timer);
}

function tile(label, value, foot) {
  return `<div class="card stat"><div class="label">${label}</div><div class="value">${value}</div><div class="foot">${foot}</div></div>`;
}
