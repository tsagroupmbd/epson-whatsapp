import { config, sb } from './supabase.js';
import { saveBrowserConfig } from './config.js';
import { auth } from './api.js';
import { brand, esc, icon, toast, toastError } from './ui.js';

const app = document.getElementById('app');

const NAV = [
  { section: 'Overview' },
  { path: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { section: 'Audience' },
  { path: 'contacts', label: 'Contacts', icon: 'contacts' },
  { path: 'import', label: 'Import contacts', icon: 'upload' },
  { path: 'groups', label: 'Groups', icon: 'folder' },
  { section: 'Messaging' },
  { path: 'templates', label: 'Templates', icon: 'template' },
  { path: 'campaigns', label: 'Campaigns', icon: 'send' },
  { path: 'reports', label: 'Delivery reports', icon: 'reports' },
  { section: 'Account' },
  { path: 'settings', label: 'Settings', icon: 'settings' },
];

const ROUTES = [
  { pattern: /^dashboard$/, title: 'Dashboard', crumb: 'Campaign performance at a glance', load: () => import('./pages/dashboard.js') },
  { pattern: /^contacts$/, title: 'Contacts', crumb: 'Everyone you can message', load: () => import('./pages/contacts.js') },
  { pattern: /^import$/, title: 'Import contacts', crumb: 'Excel or CSV upload', load: () => import('./pages/import.js') },
  { pattern: /^groups$/, title: 'Groups', crumb: 'Audience segments for campaigns', load: () => import('./pages/groups.js') },
  { pattern: /^templates$/, title: 'Templates', crumb: 'Meta-approved message templates', load: () => import('./pages/templates.js') },
  { pattern: /^campaigns$/, title: 'Campaigns', crumb: 'Bulk sends and schedules', load: () => import('./pages/campaigns.js') },
  { pattern: /^campaigns\/new$/, title: 'New campaign', crumb: 'Campaigns', nav: 'campaigns', load: () => import('./pages/campaign-editor.js') },
  { pattern: /^campaigns\/([\w-]+)\/edit$/, title: 'Edit campaign', crumb: 'Campaigns', nav: 'campaigns', load: () => import('./pages/campaign-editor.js') },
  { pattern: /^reports$/, title: 'Delivery reports', crumb: 'Message-level delivery status', load: () => import('./pages/reports.js') },
  { pattern: /^settings$/, title: 'Settings', crumb: 'Business, sending and WhatsApp connection', load: () => import('./pages/settings.js') },
];

let user = null;
let cleanup = null;
let renderToken = 0;

export function navigate(path) {
  location.hash = `#/${path.replace(/^#?\/?/, '')}`;
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '') || 'dashboard';
  const [path, qs = ''] = raw.split('?');
  return { path: path.replace(/\/$/, ''), query: Object.fromEntries(new URLSearchParams(qs)) };
}

// ---------------------------------------------------------------------------
// Setup (no Supabase config yet)
// ---------------------------------------------------------------------------
function renderSetup() {
  app.innerHTML = `
    <div class="auth">
      ${authArt()}
      <div class="auth-form-wrap">
        <form class="auth-form" id="setup">
          <div><h2>Connect Supabase</h2><p class="sub">This dashboard isn't connected to a Supabase project yet.</p></div>
          <div class="callout">${icon('info')}<div>For production, set <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> as Netlify environment variables. Anything you enter here is saved only in this browser.</div></div>
          <div class="field"><label for="url">Project URL</label><input class="input" id="url" placeholder="https://xxxx.supabase.co" required /></div>
          <div class="field"><label for="key">Anon / publishable key</label><input class="input" id="key" placeholder="eyJhbGciOi… or sb_publishable_…" required />
            <span class="hint">Never paste the service-role key here.</span></div>
          <button class="btn btn-primary btn-block" type="submit">Save and continue</button>
        </form>
      </div>
    </div>`;
  app.querySelector('#setup').addEventListener('submit', (e) => {
    e.preventDefault();
    const url = e.target.url.value.trim();
    const key = e.target.key.value.trim();
    if (!/^https:\/\/.+/.test(url) || !key) return toast('Enter a valid project URL and key', 'error');
    saveBrowserConfig(url, key);
    location.reload();
  });
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
function authArt() {
  return `
    <div class="auth-art">
      ${brand()}
      <div>
        <h1>Reach every customer on WhatsApp.</h1>
        <p class="lead">Import contacts, send Meta-approved templates to whole groups, and track every message from sent to read — on the official WhatsApp Cloud API.</p>
        <div class="chat-demo">
          <div class="bubble"><b>EPSON Service</b>\nHi Priya, your printer service is booked for <b>Tuesday, 10:00</b>. Reply STOP to opt out.<span class="meta">09:41</span></div>
          <div class="bubble out">Thank you! See you then 👍<span class="meta">09:42 <span class="ticks">✓✓</span></span></div>
          <div class="bubble">12,480 delivered · 9,312 read<span class="meta">Campaign report</span></div>
        </div>
      </div>
      <div class="foot">Official Meta WhatsApp Cloud API · Secured by Supabase</div>
    </div>`;
}

function renderLogin(message = '') {
  app.innerHTML = `
    <div class="auth">
      ${authArt()}
      <div class="auth-form-wrap">
        <form class="auth-form" id="login" novalidate>
          <div class="auth-mobile-brand">${brand()}</div>
          <div><h2>Admin sign in</h2><p class="sub">Use your administrator account to continue.</p></div>
          ${message ? `<div class="callout danger">${icon('alert')}<div>${esc(message)}</div></div>` : ''}
          <div class="field"><label for="email">Email</label><input class="input" id="email" type="email" autocomplete="username" required /></div>
          <div class="field"><label for="password">Password</label><input class="input" id="password" type="password" autocomplete="current-password" required /></div>
          <button class="btn btn-primary btn-block" type="submit">Sign in</button>
          <p class="small muted">Admin accounts are created in Supabase Authentication and granted access in the <code>admin_users</code> table.</p>
        </form>
      </div>
    </div>`;
  const form = app.querySelector('#login');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner sm"></span> Signing in';
    const { error } = await auth.signIn(form.email.value.trim(), form.password.value);
    if (error) {
      btn.disabled = false;
      btn.textContent = 'Sign in';
      return renderLogin(error.message);
    }
    await boot();
  });
}

// ---------------------------------------------------------------------------
// Authenticated shell
// ---------------------------------------------------------------------------
function renderShell() {
  const email = user?.email || '';
  app.innerHTML = `
    <div class="shell" id="shell">
      <aside class="sidebar">
        ${brand()}
        <nav class="nav" id="nav">
          ${NAV.map((n) => n.section
            ? `<div class="nav-label">${n.section}</div>`
            : `<a href="#/${n.path}" data-nav="${n.path}">${icon(n.icon)}<span>${n.label}</span></a>`).join('')}
        </nav>
        <div class="sidebar-foot">
          <div class="avatar">${esc(email.slice(0, 1).toUpperCase())}</div>
          <div class="who"><b title="${esc(email)}">${esc(email)}</b><span>Administrator</span></div>
          <button class="btn btn-ghost btn-icon btn-sm" id="logout" title="Sign out" aria-label="Sign out">${icon('logout')}</button>
        </div>
      </aside>
      <div class="scrim" id="scrim"></div>
      <div class="main">
        <header class="topbar">
          <button class="btn btn-ghost btn-icon menu-btn" id="menu" aria-label="Open menu">${icon('menu')}</button>
          <div><h1 id="page-title"></h1><div class="crumb" id="page-crumb"></div></div>
          <div class="spacer"></div>
          <a class="btn btn-primary" href="#/campaigns/new">${icon('plus')}<span class="hide-sm">New campaign</span></a>
        </header>
        <main class="content" id="view"></main>
      </div>
    </div>`;
  const shell = app.querySelector('#shell');
  app.querySelector('#menu').addEventListener('click', () => shell.classList.add('nav-open'));
  app.querySelector('#scrim').addEventListener('click', () => shell.classList.remove('nav-open'));
  app.querySelector('#nav').addEventListener('click', () => shell.classList.remove('nav-open'));
  app.querySelector('#logout').addEventListener('click', async () => {
    await auth.signOut();
    user = null;
    renderLogin();
  });
}

async function route() {
  if (!user) return;
  const { path, query } = parseHash();
  const match = ROUTES.map((r) => ({ r, m: path.match(r.pattern) })).find((x) => x.m);
  if (!match) return navigate('dashboard');
  const { r, m } = match;
  const token = ++renderToken;

  if (typeof cleanup === 'function') cleanup();
  cleanup = null;

  document.title = `${r.title} · EPSON WHATSAPP SENDER`;
  app.querySelector('#page-title').textContent = r.title;
  app.querySelector('#page-crumb').textContent = r.crumb;
  const navKey = r.nav || path;
  app.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === navKey));

  const view = app.querySelector('#view');
  view.innerHTML = '<div class="empty"><span class="spinner"></span></div>';
  try {
    const mod = await r.load();
    if (token !== renderToken) return;
    view.innerHTML = '';
    cleanup = await mod.default(view, { params: m.slice(1), query, navigate, user, isCurrent: () => token === renderToken });
  } catch (err) {
    console.error(err);
    if (token !== renderToken) return;
    view.innerHTML = `<div class="card"><div class="empty"><div class="icon">${icon('alert')}</div><h4>Something went wrong</h4><p>${esc(err.message)}</p></div></div>`;
  }
}

async function boot() {
  if (!config) return renderSetup();
  const session = await auth.session();
  if (!session) return renderLogin();
  let admin = false;
  try {
    admin = await auth.isAdmin();
  } catch (err) {
    await auth.signOut();
    return renderLogin(`Could not verify access: ${err.message}. Has the database migration been applied?`);
  }
  if (!admin) {
    await auth.signOut();
    return renderLogin('This account is not an administrator for EPSON WHATSAPP SENDER.');
  }
  user = session.user;
  renderShell();
  route();
}

window.addEventListener('hashchange', route);
window.addEventListener('unhandledrejection', (e) => toastError(e.reason));

if (sb) {
  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT' && user) {
      user = null;
      renderLogin('Your session has ended. Please sign in again.');
    }
  });
}

boot();
