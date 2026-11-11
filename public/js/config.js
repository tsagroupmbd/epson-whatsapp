// Public Supabase connection details. Production values come from /env.js
// (Netlify env vars SUPABASE_URL + SUPABASE_ANON_KEY). For local use without
// Netlify, the setup screen can store them in this browser's localStorage.
// Only the anon/publishable key belongs here — never a service-role or WhatsApp key.

const STORAGE_KEY = 'epson-sender:supabase';

export function getConfig() {
  const env = window.__ENV || {};
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    return { url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY, source: 'environment' };
  }
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved?.url && saved?.anonKey) return { ...saved, source: 'browser' };
  } catch { /* ignore malformed storage */ }
  return null;
}

export function saveBrowserConfig(url, anonKey) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ url: url.replace(/\/+$/, ''), anonKey }));
}

export function clearBrowserConfig() {
  localStorage.removeItem(STORAGE_KEY);
}
