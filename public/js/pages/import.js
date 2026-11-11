import { contacts, groups as groupsApi, cachedSettings } from '../api.js';
import { esc, icon, normalizePhone, num, toast, toastError, downloadCSV } from '../ui.js';

const XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';

const GUESS = [
  ['phone', /^(phone|mobile|whatsapp|wa|number|cell|contact|msisdn|tel)/i],
  ['name', /^(name|full ?name|customer|contact ?name|first ?name)/i],
  ['email', /^e-?mail/i],
];

const slug = (s) => String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'field';

export default async function render(root) {
  const settings = await cachedSettings();
  let groupList = await groupsApi.list();
  const state = { step: 1, file: null, sheets: [], sheet: '', headers: [], raw: [], text: [], mapping: {} };

  root.innerHTML = `
    <div class="steps" id="steps"></div>
    <div id="stage"></div>`;
  const stage = root.querySelector('#stage');

  function drawSteps() {
    const labels = ['Upload file', 'Map columns', 'Review & import'];
    root.querySelector('#steps').innerHTML = labels.map((l, i) =>
      `<span class="step ${state.step === i + 1 ? 'active' : state.step > i + 1 ? 'done' : ''}"><i>${state.step > i + 1 ? '✓' : i + 1}</i>${l}</span>`).join('');
  }

  // ---------- Step 1 ----------
  function stepUpload() {
    state.step = 1;
    drawSteps();
    stage.innerHTML = `
      <div class="split">
        <div class="card card-pad stack">
          <label class="dropzone" id="drop">
            <div class="icon">${icon('upload')}</div>
            <h3>Drop an Excel or CSV file here</h3>
            <p class="muted">or click to browse · .xlsx, .xls, .csv up to 50,000 rows</p>
            <input type="file" id="file" accept=".xlsx,.xls,.csv,text/csv" hidden />
          </label>
        </div>
        <div class="card card-pad stack">
          <h3>File format</h3>
          <p class="muted">The first row should contain column headers. Only a phone column is required — any extra columns can be saved as custom fields for template personalisation.</p>
          <div class="table-wrap" style="border:1px solid var(--line);border-radius:10px"><table class="table">
            <thead><tr><th>name</th><th>phone</th><th>email</th><th>city</th></tr></thead>
            <tbody><tr><td>Priya Sharma</td><td class="mono">+919876543210</td><td>priya@example.com</td><td>Pune</td></tr>
            <tr><td>Arjun Mehta</td><td class="mono">09812345678</td><td></td><td>Delhi</td></tr></tbody>
          </table></div>
          <button class="btn" id="sample">${icon('download')} Download sample CSV</button>
          <div class="callout warn">${icon('shield')}<div>Only import people who have agreed to receive WhatsApp messages from your business. Meta can restrict accounts that message without consent.</div></div>
        </div>
      </div>`;
    const drop = stage.querySelector('#drop');
    const input = stage.querySelector('#file');
    input.addEventListener('change', () => input.files[0] && readFile(input.files[0]));
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('drag'); }));
    drop.addEventListener('drop', (e) => e.dataTransfer.files[0] && readFile(e.dataTransfer.files[0]));
    stage.querySelector('#sample').addEventListener('click', () => downloadCSV('epson-contacts-sample.csv', [
      ['name', 'phone', 'email', 'city'], ['Priya Sharma', '+919876543210', 'priya@example.com', 'Pune'], ['Arjun Mehta', '09812345678', '', 'Delhi'],
    ]));
  }

  async function readFile(file) {
    stage.querySelector('#drop').innerHTML = `<span class="spinner"></span><p class="muted">Reading ${esc(file.name)}…</p>`;
    try {
      const XLSX = await import(XLSX_URL);
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      state.XLSX = XLSX;
      state.wb = wb;
      state.file = file;
      state.sheets = wb.SheetNames;
      loadSheet(wb.SheetNames[0]);
      stepMap();
    } catch (err) {
      toastError(new Error(`Could not read file: ${err.message}`));
      stepUpload();
    }
  }

  function loadSheet(name) {
    const ws = state.wb.Sheets[name];
    const opts = { header: 1, defval: '', blankrows: false };
    const raw = state.XLSX.utils.sheet_to_json(ws, { ...opts, raw: true });
    const text = state.XLSX.utils.sheet_to_json(ws, { ...opts, raw: false });
    state.sheet = name;
    state.headers = (text[0] || []).map((h, i) => String(h || `Column ${i + 1}`).trim());
    state.raw = raw.slice(1);
    state.text = text.slice(1);
    state.mapping = {};
    const taken = new Set();
    state.headers.forEach((h, i) => {
      const hit = GUESS.find(([field, re]) => !taken.has(field) && re.test(h));
      if (hit) { state.mapping[i] = hit[0]; taken.add(hit[0]); } else state.mapping[i] = 'attr';
    });
  }

  // ---------- Step 2 ----------
  function stepMap() {
    state.step = 2;
    drawSteps();
    const sample = (i) => state.text.slice(0, 3).map((r) => r[i]).filter((v) => v !== '').join(' · ') || '—';
    stage.innerHTML = `
      <div class="card">
        <div class="card-head">
          <div><h3>${esc(state.file.name)}</h3><div class="sub">${num(state.raw.length)} rows · ${state.headers.length} columns</div></div>
          <div class="spacer"></div>
          ${state.sheets.length > 1 ? `<select class="select" id="sheet" style="width:auto">${state.sheets.map((s) => `<option ${s === state.sheet ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>` : ''}
        </div>
        <div class="card-pad stack">
          <p class="muted">Tell us what each column contains. Unmapped columns can be kept as custom fields.</p>
          <div class="mapping">
            ${state.headers.map((h, i) => `
              <div class="map-col">
                <div class="src" title="${esc(h)}">${esc(h)}</div>
                <div class="ex" title="${esc(sample(i))}">${esc(sample(i))}</div>
                <select class="select" data-col="${i}">
                  <option value="phone" ${state.mapping[i] === 'phone' ? 'selected' : ''}>WhatsApp number</option>
                  <option value="name" ${state.mapping[i] === 'name' ? 'selected' : ''}>Name</option>
                  <option value="email" ${state.mapping[i] === 'email' ? 'selected' : ''}>Email</option>
                  <option value="attr" ${state.mapping[i] === 'attr' ? 'selected' : ''}>Custom field: ${esc(slug(h))}</option>
                  <option value="skip" ${state.mapping[i] === 'skip' ? 'selected' : ''}>Don't import</option>
                </select>
              </div>`).join('')}
          </div>
          <div class="row end">
            <button class="btn" id="back">Choose another file</button>
            <button class="btn btn-primary" id="next">Continue</button>
          </div>
        </div>
      </div>`;
    stage.querySelector('#sheet')?.addEventListener('change', (e) => { loadSheet(e.target.value); stepMap(); });
    stage.querySelectorAll('[data-col]').forEach((sel) => sel.addEventListener('change', () => {
      const v = sel.value;
      if (['phone', 'name', 'email'].includes(v)) {
        Object.keys(state.mapping).forEach((k) => { if (state.mapping[k] === v && k !== sel.dataset.col) state.mapping[k] = 'attr'; });
      }
      state.mapping[sel.dataset.col] = v;
      stepMap();
    }));
    stage.querySelector('#back').addEventListener('click', stepUpload);
    stage.querySelector('#next').addEventListener('click', () => {
      if (!Object.values(state.mapping).includes('phone')) return toast('Map one column to WhatsApp number', 'error');
      stepReview();
    });
  }

  // ---------- Step 3 ----------
  function parseRows(cc) {
    const cols = Object.entries(state.mapping);
    const byPhone = new Map();
    const invalid = [];
    let duplicates = 0;
    state.raw.forEach((rawRow, idx) => {
      const textRow = state.text[idx] || [];
      const row = { name: null, phone: null, email: null, attributes: {}, source: 'import' };
      let rawPhone = '';
      for (const [i, field] of cols) {
        const v = String(textRow[i] ?? '').trim();
        if (field === 'phone') {
          const r = rawRow[i];
          rawPhone = typeof r === 'number' ? String(Math.round(r)) : String(r ?? '').trim();
          row.phone = normalizePhone(rawPhone, cc);
        } else if (field === 'name') row.name = v || null;
        else if (field === 'email') row.email = v || null;
        else if (field === 'attr' && v) row.attributes[slug(state.headers[i])] = v;
      }
      if (!row.phone) { if (rawPhone || row.name) invalid.push({ line: idx + 2, value: rawPhone, name: row.name }); return; }
      if (byPhone.has(row.phone)) duplicates++;
      byPhone.set(row.phone, row);
    });
    return { rows: [...byPhone.values()], invalid, duplicates };
  }

  function stepReview() {
    state.step = 3;
    drawSteps();
    stage.innerHTML = `
      <div class="split">
        <div class="card">
          <div class="card-head"><h3>Import options</h3></div>
          <form class="card-pad stack" id="opts">
            <div class="form-grid">
              <div class="field"><label>Default country code</label>
                <div class="input-icon"><span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--muted);font-weight:700">+</span>
                <input class="input mono" name="cc" value="${esc(settings.default_country_code || '')}" placeholder="91" inputmode="numeric" style="padding-left:24px"/></div>
                <span class="hint">Applied to numbers written without a +country code.</span></div>
              <div class="field"><label>Add to group</label>
                <select class="select" name="group">
                  <option value="">Don't add to a group</option>
                  <option value="__new">+ Create a new group…</option>
                  ${groupList.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}
                </select></div>
              <div class="field full" id="newgroup" hidden><label>New group name</label><input class="input" name="newgroup" placeholder="e.g. Service customers — Pune" /></div>
            </div>
            <label class="switch"><input type="checkbox" name="update" checked /> Update name, email and custom fields of existing contacts</label>
            <label class="check"><input type="checkbox" name="consent" /> I confirm these contacts opted in to receive WhatsApp messages from us.</label>
            <p class="small muted">Contacts who previously opted out stay opted out.</p>
            <div class="row end">
              <button type="button" class="btn" id="back">Back</button>
              <button type="submit" class="btn btn-primary" id="go">${icon('upload')} Import contacts</button>
            </div>
          </form>
        </div>
        <div class="card" id="summary"></div>
      </div>`;
    const form = stage.querySelector('#opts');
    const summary = stage.querySelector('#summary');

    const refresh = () => {
      const { rows, invalid, duplicates } = parseRows(form.cc.value);
      summary.innerHTML = `
        <div class="card-head"><h3>Validation</h3></div>
        <div class="card-pad stack">
          <dl class="summary-list">
            <div><dt>Rows in file</dt><dd>${num(state.raw.length)}</dd></div>
            <div><dt>Valid contacts</dt><dd style="color:var(--green-700)">${num(rows.length)}</dd></div>
            <div><dt>Duplicates merged</dt><dd>${num(duplicates)}</dd></div>
            <div><dt>Invalid numbers</dt><dd style="color:${invalid.length ? 'var(--red)' : 'inherit'}">${num(invalid.length)}</dd></div>
          </dl>
          ${invalid.length ? `<div class="small"><b>First invalid rows</b><div class="table-wrap"><table class="table"><tbody>
            ${invalid.slice(0, 8).map((r) => `<tr><td class="muted">Row ${r.line}</td><td>${esc(r.name || '')}</td><td class="mono">${esc(r.value || '(empty)')}</td></tr>`).join('')}
          </tbody></table></div></div>` : ''}
          ${rows.length ? `<div class="small"><b>Preview</b><div class="table-wrap"><table class="table"><tbody>
            ${rows.slice(0, 5).map((r) => `<tr><td>${esc(r.name || '—')}</td><td class="mono">+${esc(r.phone)}</td></tr>`).join('')}
          </tbody></table></div></div>` : ''}
        </div>`;
      return rows;
    };
    refresh();
    form.cc.addEventListener('input', refresh);
    form.group.addEventListener('change', () => { stage.querySelector('#newgroup').hidden = form.group.value !== '__new'; });
    stage.querySelector('#back').addEventListener('click', stepMap);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.consent.checked) return toast('Please confirm these contacts have opted in', 'error');
      const rows = refresh();
      if (!rows.length) return toast('There are no valid contacts to import', 'error');
      const go = stage.querySelector('#go');
      go.disabled = true;
      try {
        let groupId = form.group.value;
        let groupName = '';
        if (groupId === '__new') {
          const name = form.newgroup.value.trim();
          if (!name) throw new Error('Enter a name for the new group');
          const g = await groupsApi.save({ name });
          groupId = g.id;
          groupName = g.name;
        } else if (groupId) {
          groupName = groupList.find((g) => g.id === groupId)?.name;
        }
        await contacts.bulkUpsert(rows, {
          updateExisting: form.update.checked,
          onProgress: (done, total) => { go.innerHTML = `<span class="spinner sm"></span> Importing ${num(done)} / ${num(total)}`; },
        });
        if (groupId) {
          go.innerHTML = '<span class="spinner sm"></span> Adding to group…';
          const ids = await contacts.idsByPhones(rows.map((r) => r.phone));
          await contacts.addManyToGroup(ids, groupId);
        }
        groupList = await groupsApi.list();
        done(rows.length, groupId, groupName);
      } catch (err) {
        toastError(err);
        go.disabled = false;
        go.innerHTML = `${icon('upload')} Import contacts`;
      }
    });
  }

  function done(count, groupId, groupName) {
    state.step = 4;
    drawSteps();
    stage.innerHTML = `
      <div class="card"><div class="empty">
        <div class="icon">${icon('check')}</div>
        <h4>${num(count)} contacts imported</h4>
        <p>${groupName ? `Added to <b>${esc(groupName)}</b>. ` : ''}They're ready to receive campaigns.</p>
        <div class="row">
          <button class="btn" id="again">Import another file</button>
          <a class="btn" href="#/contacts${groupId ? `?group=${groupId}` : ''}">View contacts</a>
          <a class="btn btn-primary" href="#/campaigns/new">Create campaign</a>
        </div>
      </div></div>`;
    stage.querySelector('#again').addEventListener('click', stepUpload);
    toast('Import complete');
  }

  stepUpload();
}
