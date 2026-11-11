import { auth, cachedSettings, settings as api } from '../api.js';
import { config, functionsUrl } from '../supabase.js';
import { clearBrowserConfig } from '../config.js';
import { esc, icon, toast, toastError, withBusy } from '../ui.js';

const TIMEZONES = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC', 'Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'America/New_York'];

export default async function render(root, { user }) {
  const s = await api.get();
  const webhookUrl = functionsUrl('whatsapp-webhook');

  root.innerHTML = `
    <div class="grid grid-2" style="align-items:start">
      <div class="stack">
        <form class="card" id="business">
          <div class="card-head"><h3>Business profile</h3></div>
          <div class="card-pad form-grid">
            <div class="field full"><label>Business name</label><input class="input" name="business_name" value="${esc(s.business_name)}" />
              <span class="hint">Shown in message previews across the dashboard.</span></div>
            <div class="field"><label>Default country code</label><input class="input mono" name="default_country_code" value="${esc(s.default_country_code || '')}" placeholder="91" inputmode="numeric" />
              <span class="hint">Used for numbers without a + prefix.</span></div>
            <div class="field"><label>Default template language</label><input class="input mono" name="default_language" value="${esc(s.default_language)}" placeholder="en_US" /></div>
            <div class="field full"><label>Timezone</label><select class="select" name="timezone">
              ${TIMEZONES.map((tz) => `<option ${tz === s.timezone ? 'selected' : ''}>${esc(tz)}</option>`).join('')}
              ${TIMEZONES.includes(s.timezone) ? '' : `<option selected>${esc(s.timezone)}</option>`}</select></div>
          </div>
          <div class="modal-foot" style="border-top:1px solid var(--line)"><button class="btn btn-primary" type="submit">Save profile</button></div>
        </form>

        <form class="card" id="sending">
          <div class="card-head"><h3>Sending</h3></div>
          <div class="card-pad form-grid">
            <div class="field"><label>Messages per second</label><input class="input" type="number" min="1" max="80" step="1" name="messages_per_second" value="${esc(s.messages_per_second)}" />
              <span class="hint">Cloud API allows up to 80/s per number. Lower is gentler on quality rating.</span></div>
            <div class="field"><label>Batch size</label><input class="input" type="number" min="1" max="500" name="batch_size" value="${esc(s.batch_size)}" />
              <span class="hint">Messages claimed per worker cycle.</span></div>
            <div class="field full"><label class="switch"><input type="checkbox" name="honor_stop_keywords" ${s.honor_stop_keywords ? 'checked' : ''}/> Opt contacts out automatically when they reply STOP</label></div>
          </div>
          <div class="modal-foot" style="border-top:1px solid var(--line)"><button class="btn btn-primary" type="submit">Save sending settings</button></div>
        </form>

        <form class="card" id="password">
          <div class="card-head"><h3>Admin account</h3><div class="spacer"></div><span class="muted small">${esc(user.email)}</span></div>
          <div class="card-pad form-grid">
            <div class="field"><label>New password</label><input class="input" type="password" name="pw" minlength="8" autocomplete="new-password" /></div>
            <div class="field"><label>Confirm password</label><input class="input" type="password" name="pw2" minlength="8" autocomplete="new-password" /></div>
          </div>
          <div class="modal-foot" style="border-top:1px solid var(--line)"><button class="btn" type="submit">Change password</button></div>
        </form>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-head"><h3>WhatsApp Cloud API</h3><div class="spacer"></div><button class="btn btn-sm" id="test">${icon('link')} Test connection</button></div>
          <div class="card-pad stack">
            <div id="conn" class="callout">${icon('info')}<div>Click <b>Test connection</b> to verify your Meta credentials.</div></div>
            <div>
              <div class="label" style="margin-bottom:8px">Edge Function secrets</div>
              <div class="secret-list" id="secrets"><div><span class="muted small">Checking…</span><span class="spinner sm"></span></div></div>
              <p class="small muted" style="margin-top:8px">Secrets are stored only in Supabase and never sent to the browser. Set them with <code>supabase secrets set</code>.</p>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>Webhook</h3></div>
          <div class="card-pad stack">
            <p class="muted small">In Meta for Developers → WhatsApp → Configuration, set this callback URL, use your <code>WHATSAPP_VERIFY_TOKEN</code> as the verify token, and subscribe to the <b>messages</b> field.</p>
            <div class="copy-field"><input class="input" readonly value="${esc(webhookUrl)}" id="hook"/><button class="btn btn-icon" id="copy" title="Copy">${icon('copy')}</button></div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>Supabase</h3></div>
          <div class="card-pad stack">
            <dl class="kv">
              <dt>Project URL</dt><dd class="mono">${esc(config.url)}</dd>
              <dt>Configured from</dt><dd>${config.source === 'environment' ? 'Netlify environment variables' : 'This browser only'}</dd>
            </dl>
            ${config.source === 'browser' ? `<button class="btn btn-sm btn-danger" id="disconnect" style="justify-self:start">Forget connection in this browser</button>` : ''}
          </div>
        </div>
      </div>
    </div>`;

  const $ = (q) => root.querySelector(q);

  const saveForm = (id, pick) => $(id).addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    await withBusy(btn, async () => {
      try {
        await api.save(pick(e.target));
        await cachedSettings(true);
        toast('Settings saved');
      } catch (err) { toastError(err); }
    });
  });

  saveForm('#business', (f) => ({
    business_name: f.business_name.value.trim() || 'EPSON',
    default_country_code: f.default_country_code.value.replace(/\D/g, '') || null,
    default_language: f.default_language.value.trim() || 'en_US',
    timezone: f.timezone.value,
  }));
  saveForm('#sending', (f) => ({
    messages_per_second: Math.min(80, Math.max(1, Number(f.messages_per_second.value) || 10)),
    batch_size: Math.min(500, Math.max(1, Math.round(Number(f.batch_size.value) || 50))),
    honor_stop_keywords: f.honor_stop_keywords.checked,
  }));

  $('#password').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.pw.value.length < 8) return toast('Use at least 8 characters', 'error');
    if (f.pw.value !== f.pw2.value) return toast('Passwords do not match', 'error');
    await withBusy(f.querySelector('button'), async () => {
      try { await auth.updatePassword(f.pw.value); f.reset(); toast('Password updated'); } catch (err) { toastError(err); }
    });
  });

  $('#copy').addEventListener('click', async () => {
    await navigator.clipboard.writeText(webhookUrl).catch(() => $('#hook').select());
    toast('Webhook URL copied');
  });
  $('#disconnect')?.addEventListener('click', () => { clearBrowserConfig(); location.reload(); });

  $('#test').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
    const conn = $('#conn');
    try {
      const { phone } = await api.testConnection();
      conn.className = 'callout';
      conn.innerHTML = `${icon('check')}<div><b>Connected</b> — ${esc(phone.verified_name || '')} ${esc(phone.display_phone_number || '')}<br>
        <span class="small">Quality: ${esc(phone.quality_rating || 'unknown')}${phone.messaging_limit_tier ? ` · Limit tier: ${esc(phone.messaging_limit_tier)}` : ''}</span></div>`;
    } catch (err) {
      conn.className = 'callout danger';
      conn.innerHTML = `${icon('alert')}<div><b>Connection failed</b><br><span class="small">${esc(err.message)}</span></div>`;
    }
  }));

  try {
    const { secrets, api_version } = await api.whatsappStatus();
    $('#secrets').innerHTML = Object.entries(secrets).map(([k, ok]) =>
      `<div><code>${k}</code>${ok ? '<span class="badge green">Set</span>' : '<span class="badge red">Missing</span>'}</div>`).join('')
      + `<div><code>Graph API version</code><span class="badge plain gray">${esc(api_version)}</span></div>`;
  } catch (err) {
    $('#secrets').innerHTML = `<div class="callout danger" style="border:0">${icon('alert')}<div>Could not reach the <code>whatsapp-admin</code> Edge Function: ${esc(err.message)}. Deploy it with <code>supabase functions deploy</code>.</div></div>`;
  }
}
