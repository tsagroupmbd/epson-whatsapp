// Drives the send-campaign Edge Function from the browser for immediate sends.
// Each call sends for up to ~50s; we keep calling while work remains. If the tab
// closes, the pg_cron worker picks up any campaign still in "sending".
import { campaigns } from './api.js';
import { toast, toastError, num } from './ui.js';

const running = new Set();

export const isRunning = (id) => running.has(id);

export async function runCampaign(id, { onProgress } = {}) {
  if (running.has(id)) return;
  running.add(id);
  const note = toast('Sending campaign…', 'info', 600000);
  try {
    for (;;) {
      const r = await campaigns.run(id);
      if (!r) break;
      onProgress?.(r);
      if (r.error) throw new Error(r.error);
      note.textContent = r.remaining ? `Sending… ${num(r.remaining)} messages left` : 'Finishing up…';
      if (r.status !== 'sending' || !r.remaining) break;
      if (r.throttled) await new Promise((res) => setTimeout(res, 5000));
    }
    const final = await campaigns.get(id);
    if (final.status === 'completed') toast(`Campaign sent to ${num(final.sent)} contacts`);
    else if (final.status === 'paused') toast('Campaign paused', 'info');
    return final;
  } catch (err) {
    toastError(err);
  } finally {
    note.remove();
    running.delete(id);
  }
}
