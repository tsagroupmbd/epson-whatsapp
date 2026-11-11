import { dashboardStats, campaigns } from '../api.js';
import { esc, fmtDate, icon, num, pct, statusBadge, emptyState } from '../ui.js';

const SERIES = [
  { key: 'read', label: 'Read', color: '#075e54' },
  { key: 'delivered', label: 'Delivered', color: '#25d366' },
  { key: 'sent', label: 'Sent (awaiting delivery)', color: '#a6e8bf' },
  { key: 'failed', label: 'Failed', color: '#e06363' },
];

export default async function render(root) {
  const [stats, recent] = await Promise.all([dashboardStats(14), campaigns.list()]);
  const m = stats.messages;

  root.innerHTML = `
    <section class="stats">
      ${tile('contacts', 'Contacts', num(stats.contacts), `<b>${num(stats.opted_in)}</b> opted in · ${num(stats.groups)} groups`)}
      ${tile('send', 'Campaigns', num(stats.campaigns), `<b>${num(stats.campaigns_active)}</b> sending or scheduled`)}
      ${tile('checks', 'Delivery rate', pct(m.delivered, m.sent + m.failed), `${num(m.delivered)} of ${num(m.sent + m.failed)} attempted`)}
      ${tile('eye', 'Read rate', pct(m.read, m.delivered), `${num(m.read)} read · <span style="color:var(--red)">${num(m.failed)} failed</span>`)}
    </section>

    <section class="split">
      <div class="card">
        <div class="card-head">
          <div><h3>Messages, last 14 days</h3><div class="sub">Grouped by each message's current status</div></div>
          <div class="spacer"></div>
        </div>
        <div class="card-pad stack">
          <div class="legend">${SERIES.map((s) => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join('')}</div>
          <div class="chart" id="chart"></div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Delivery funnel</h3><div class="spacer"></div><span class="muted small">All time</span></div>
        <div class="card-pad funnel">
          ${funnelRow('Queued', m.pending, m.total, '#c9d4d9')}
          ${funnelRow('Sent', m.sent, m.total, '#a6e8bf')}
          ${funnelRow('Delivered', m.delivered, m.total, '#25d366')}
          ${funnelRow('Read', m.read, m.total, '#075e54')}
          ${funnelRow('Failed', m.failed, m.total, '#e06363')}
          <div class="callout" style="margin-top:6px">${icon('template')}<div><b>${num(stats.templates_approved)}</b> approved template${stats.templates_approved === 1 ? '' : 's'} ready to send. <a href="#/templates">Manage templates</a></div></div>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h3>Recent campaigns</h3><div class="spacer"></div><a class="btn btn-sm" href="#/campaigns">View all</a></div>
      ${recent.length ? `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Campaign</th><th>Status</th><th class="hide-sm">Audience</th><th>Delivered</th><th class="hide-sm">Read</th><th class="hide-sm">When</th></tr></thead>
        <tbody>${recent.slice(0, 6).map(rowHtml).join('')}</tbody>
      </table></div>` : emptyState('send', 'No campaigns yet', 'Create your first campaign to message a contact group.', '<a class="btn btn-primary" href="#/campaigns/new">New campaign</a>')}
    </section>`;

  drawChart(root.querySelector('#chart'), stats.daily);
}

function tile(ico, label, value, foot) {
  return `<div class="card stat"><div class="label"><span class="ico">${icon(ico)}</span>${label}</div><div class="value">${value}</div><div class="foot">${foot}</div></div>`;
}

function funnelRow(label, value, total, color) {
  const w = total ? Math.max((value / total) * 100, value ? 2 : 0) : 0;
  return `<div class="funnel-row"><span class="muted">${label}</span><div class="bar"><span style="width:${w}%;background:${color}"></span></div><b>${num(value)}</b></div>`;
}

function rowHtml(c) {
  const when = c.status === 'scheduled' ? `Scheduled ${fmtDate(c.scheduled_at)}` : fmtDate(c.started_at || c.created_at);
  return `<tr>
    <td><div class="cell-main"><a href="#/reports?campaign=${c.id}">${esc(c.name)}</a></div><div class="cell-sub">${esc(c.template_name || 'No template')}</div></td>
    <td>${statusBadge(c.status)}</td>
    <td class="hide-sm">${num(c.total)}</td>
    <td>${num(c.delivered)} <span class="muted small">${pct(c.delivered, c.total)}</span></td>
    <td class="hide-sm">${num(c.read)} <span class="muted small">${pct(c.read, c.delivered)}</span></td>
    <td class="hide-sm muted small">${when}</td>
  </tr>`;
}

function drawChart(el, daily) {
  const W = 720, H = 240, pad = { t: 10, r: 8, b: 26, l: 36 };
  const totals = daily.map((d) => SERIES.reduce((s, x) => s + Number(d[x.key] || 0), 0));
  const max = Math.max(4, ...totals);
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const bw = iw / daily.length;
  const y = (v) => pad.t + ih - (v / top) * ih;

  let grid = '';
  for (let v = 0; v <= top; v += step) {
    grid += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="${v ? '#eef2f1' : '#d9e1de'}"/>
      <text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="10.5" fill="#8696a0">${num(v)}</text>`;
  }

  const bars = daily.map((d, i) => {
    let acc = 0;
    const x = pad.l + i * bw + bw * 0.2;
    const w = bw * 0.6;
    const segs = SERIES.map((s) => {
      const v = Number(d[s.key] || 0);
      if (!v) return '';
      const y1 = y(acc + v), y0 = y(acc);
      acc += v;
      return `<rect x="${x}" y="${y1}" width="${w}" height="${Math.max(y0 - y1 - 1, 1)}" fill="${s.color}" rx="2"/>`;
    }).join('');
    const label = new Date(d.day + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    const showLabel = daily.length <= 14 ? i % 2 === 0 || i === daily.length - 1 : i % 4 === 0;
    return `<g data-i="${i}">
      <rect x="${pad.l + i * bw}" y="${pad.t}" width="${bw}" height="${ih}" fill="transparent" class="hit"/>
      ${segs}
      ${showLabel ? `<text x="${x + w / 2}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="#8696a0">${label}</text>` : ''}
    </g>`;
  }).join('');

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Messages per day for the last 14 days">${grid}${bars}</svg><div class="tip" hidden></div>`;

  const tip = el.querySelector('.tip');
  el.querySelectorAll('g[data-i]').forEach((g) => {
    g.addEventListener('mouseenter', () => {
      const d = daily[Number(g.dataset.i)];
      const r = g.querySelector('.hit').getBoundingClientRect();
      const box = el.getBoundingClientRect();
      tip.innerHTML = `<b>${new Date(d.day + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</b>
        ${SERIES.map((s) => `${s.label.split(' ')[0]}: ${num(d[s.key])}`).join('<br>')}`;
      tip.style.left = `${r.left - box.left + r.width / 2}px`;
      tip.style.top = `${Math.max(r.top - box.top + 40, 40)}px`;
      tip.hidden = false;
      g.querySelectorAll('rect:not(.hit)').forEach((x) => x.setAttribute('opacity', '0.8'));
    });
    g.addEventListener('mouseleave', () => {
      tip.hidden = true;
      g.querySelectorAll('rect:not(.hit)').forEach((x) => x.removeAttribute('opacity'));
    });
  });
}

function niceStep(max) {
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}
