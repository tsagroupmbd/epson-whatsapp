import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { getConfig } from './config.js';

const cfg = getConfig();

export const config = cfg;
export const sb = cfg
  ? createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

export function functionsUrl(name) {
  return `${cfg.url}/functions/v1/${name}`;
}

/** Invoke an Edge Function and surface its JSON error message on failure. */
export async function invoke(name, body) {
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    let message = error.message;
    try {
      const payload = await error.context?.json();
      if (payload?.error) message = payload.error;
    } catch { /* not JSON */ }
    throw new Error(message);
  }
  return data;
}
