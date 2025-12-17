function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function toErrorString(e) {
  if (!e) return 'Unknown error';
  if (typeof e === 'string') return e;
  if (e.message) return e.message;
  try { return JSON.stringify(e); } catch (_) { return String(e); }
}

function parseUid(scanText) {
  const raw = String(scanText || '').trim();
  if (!raw) return '';

  // If user pasted the QR payload JSON, extract uid
  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj.uid === 'string') return obj.uid;
    } catch (_) {
      // fall through
    }
  }
  return raw;
}

let toastTimer = null;
function showToast({ title, message, ok }) {
  const overlay = document.getElementById('overlayToast');
  const card = document.getElementById('overlayCard');
  const nameEl = document.getElementById('overlayName');
  const msgEl = document.getElementById('overlayMessage');
  if (!overlay || !card || !nameEl || !msgEl) return;

  // Stop scanner briefly to avoid duplicate rapid scans
  try { stopScannerIfRunning(); } catch (_) {}

  nameEl.textContent = title || '';
  msgEl.textContent = message || '';
  card.classList.remove('ok', 'bad');
  card.classList.add(ok ? 'ok' : 'bad');
  overlay.hidden = false;

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(async () => {
    overlay.hidden = true;
    // resume scanner
    try { await loadCameras(); await ensureScannerStarted(); } catch (_) {}
  }, 3000);
}

async function postJson(url, body) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const text = await resp.text();
  const data = text ? JSON.parse(text) : null;
  return { ok: resp.ok, status: resp.status, data };
}

let DEFAULT_EVENT = '';
let DEFAULT_VENUE = '';
let qrScanner = null;
let cameras = [];
let scannerRunning = false;
let lastUid = '';
let lastScanAt = 0;
const SCAN_COOLDOWN_MS = 2500;

async function loadConfig() {
  try {
    const resp = await fetch('/api/config');
    const cfg = await resp.json();
    DEFAULT_EVENT = String(cfg.defaultEvent || '');
    DEFAULT_VENUE = String(cfg.defaultVenue || '');
  } catch (_) {
    DEFAULT_EVENT = 'Annual Fest';
    DEFAULT_VENUE = 'Main Gate';
  }

  setText('eventDisplay', DEFAULT_EVENT || '');
  setText('venueDisplay', DEFAULT_VENUE || '');
}

async function loadCameras() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setText('scannerHint', 'Camera API not available here. Open the site in a real browser (Chrome/Safari), not an in-editor preview.');
    return;
  }

  // getUserMedia requires a secure context (HTTPS) except for localhost in most browsers
  if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    setText('scannerHint', 'Camera requires HTTPS. Use https:// or run on localhost.');
  } else {
    setText('scannerHint', '');
  }

  if (!window.Html5Qrcode) {
    setText('scannerHint', 'Scanner library did not load (network blocked?). Refresh and try again.');
    return;
  }

  try {
    cameras = await Html5Qrcode.getCameras();
  } catch (e) {
    setText('scannerHint', `Cannot list cameras: ${toErrorString(e)}. Check browser camera permissions.`);
    cameras = [];
  }

  if (!cameras.length) {
    return;
  }
}

function pickBestCameraId() {
  if (!cameras || cameras.length === 0) return null;
  const back = cameras.find(c => /back|rear|environment/i.test(c.label || ''));
  return (back || cameras[0]).id;
}

async function ensureScannerStarted() {
  if (scannerRunning) return;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setText('camResult', 'Camera not available in this browser/context.');
    return;
  }
  if (!window.Html5Qrcode) {
    setText('camResult', 'Camera scanner library not loaded.');
    return;
  }

  if (!qrScanner) qrScanner = new Html5Qrcode('qrReader');

  const cameraId = pickBestCameraId();
  if (!cameraId) {
    setText('camResult', 'No camera found. Allow permissions and refresh.');
    return;
  }

  try {
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    await qrScanner.start(
      cameraId,
      config,
      async (decodedText) => {
        const uid = parseUid(decodedText);
        if (!uid) return;

        const now = Date.now();
        if (uid === lastUid && (now - lastScanAt) < SCAN_COOLDOWN_MS) return;
        lastUid = uid;
        lastScanAt = now;

        document.getElementById('scanText').value = decodedText;
        setText('camResult', 'Scanning…');
        const result = await validateEntry(uid, DEFAULT_VENUE);
        setText('scanResult', result.message);
        showToast({
          title: result.attendeeName ? result.attendeeName : (result.ok ? 'Entry' : 'Rejected'),
          message: result.message,
          ok: result.ok
        });
        setText('camResult', 'Camera running.');
      },
      () => {}
    );

    scannerRunning = true;
    setText('camResult', 'Camera running.');
  } catch (e) {
    const msg = toErrorString(e);
    if (/NotAllowedError|Permission|denied/i.test(msg)) {
      setText('camResult', `Camera permission denied. Allow camera access. (${msg})`);
    } else if (/NotFoundError|no camera/i.test(msg)) {
      setText('camResult', `No camera found. (${msg})`);
    } else {
      setText('camResult', `Camera error: ${msg}`);
    }
    scannerRunning = false;
  }
}

async function stopScannerIfRunning() {
  if (!qrScanner || !scannerRunning) return;
  try {
    await qrScanner.stop();
    await qrScanner.clear();
  } catch (_) {
    // ignore
  } finally {
    scannerRunning = false;
  }
}

function parseNamesCommaSeparated(text) {
  return String(text || '')
    .split(/[,\n\r]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

async function validateEntry(uid, venue) {
  const { ok, status, data } = await postJson('/api/qr/scan', { uid, venue });
  if (ok) {
    return {
      ok: true,
      message: data.message,
      attendeeName: data.attendeeName || ''
    };
  }
  return {
    ok: false,
    message: data?.message || `Error (${status})`,
    attendeeName: data?.attendeeName || ''
  };
}

const addBtnEl = document.getElementById('addBtn');
if (addBtnEl) addBtnEl.addEventListener('click', async () => {
  setText('addResult', '');
  const event = DEFAULT_EVENT;
  const namesRaw = document.getElementById('names').value;
  const names = parseNamesCommaSeparated(namesRaw);

  const btn = document.getElementById('addBtn');
  btn.disabled = true;
  try {
    const { ok, status, data } = await postJson('/api/attendees/add', { names, event });
    if (!ok) {
      setText('addResult', `Error (${status}): ${data?.error || 'Request failed'}`);
      return;
    }
    setText('addResult', `Inserted: ${data.insertedCount}, Skipped: ${data.skippedCount}`);
  } catch (e) {
    setText('addResult', `Error: ${e.message}`);
  } finally {
    btn.disabled = false;
  }
});

const genBtnEl = document.getElementById('genBtn');
if (genBtnEl) genBtnEl.addEventListener('click', async () => {
  setText('genResult', '');
  const btn = genBtnEl;
  btn.disabled = true;
  try {
    const resp = await fetch('/api/qr/generate');
    if (resp.status === 204) {
      setText('genResult', 'No new QR to generate.');
      return;
    }
    if (!resp.ok) {
      const t = await resp.text();
      setText('genResult', `Error (${resp.status}): ${t}`);
      return;
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qrcodes.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setText('genResult', 'Downloaded PDF.');
  } catch (e) {
    setText('genResult', `Error: ${e.message}`);
  } finally {
    btn.disabled = false;
  }
});

const scanBtnEl = document.getElementById('scanBtn');
if (scanBtnEl) scanBtnEl.addEventListener('click', async () => {
  setText('scanResult', '');
  const scanText = document.getElementById('scanText').value;
  const venue = DEFAULT_VENUE;
  const uid = parseUid(scanText);

  const btn = document.getElementById('scanBtn');
  btn.disabled = true;
  try {
    const result = await validateEntry(uid, venue);
    setText('scanResult', result.message);
    showToast({
      title: result.attendeeName ? result.attendeeName : (result.ok ? 'Entry' : 'Rejected'),
      message: result.message,
      ok: result.ok
    });
  } catch (e) {
    setText('scanResult', `Error: ${e.message}`);
  } finally {
    btn.disabled = false;
  }
});

// Auto-start scanner once config + cameras are ready
(async () => {
  await loadConfig();
  // start scanner only if scanner element exists on the page
  if (document.getElementById('qrReader')) {
    await loadCameras();
    await ensureScannerStarted();
  }

  // initialize attendees panel only if present
  if (document.getElementById('attendeesList') || document.getElementById('addBtn')) {
    const allBtn = document.querySelector('.filterBtn[data-filter="ALL"]');
    if (allBtn) allBtn.classList.add('active');
    try { await refreshAttendees(); } catch (_) {}
  }
})();

// Resume camera when tab becomes active again
document.addEventListener('visibilitychange', async () => {
  if (!document.getElementById('qrReader')) return; // only relevant on scanner page
  if (document.visibilityState === 'visible') {
    await loadCameras();
    await ensureScannerStarted();
  } else {
    await stopScannerIfRunning();
  }
});

// Attendees panel logic
const attendeesListEl = document.getElementById('attendeesList');
const attendeesCountEl = document.getElementById('attendeesCount');
const filterButtons = Array.from(document.querySelectorAll('.filterBtn'));
let currentFilter = 'ALL';

async function fetchAttendees(filter = 'ALL') {
  const params = new URLSearchParams();
  if (filter === 'ENTERED' || filter === 'NOT_ENTERED') params.set('status', filter);
  // default event filter to current DEFAULT_EVENT
  if (DEFAULT_EVENT) params.set('event', DEFAULT_EVENT);
  params.set('limit', '1000');
  const resp = await fetch(`/api/attendees?${params.toString()}`);
  if (!resp.ok) throw new Error('Failed to load attendees');
  return resp.json();
}

function renderAttendees(data) {
  attendeesListEl.innerHTML = '';
  attendeesCountEl.textContent = `Count: ${data.count}`;
  if (!data.attendees || data.attendees.length === 0) return;

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>Name</th><th>UID</th><th>Status</th><th>Venue</th><th>EnteredAt</th></tr>';
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const a of data.attendees) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(a.name)}</td><td>${escapeHtml(a.uid)}</td><td>${escapeHtml(a.status)}</td><td>${escapeHtml(a.venue||'')}</td><td>${a.enteredAt? new Date(a.enteredAt).toLocaleString():''}</td>`;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  attendeesListEl.appendChild(table);
}

function escapeHtml(s){ return String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }

async function refreshAttendees() {
  try {
    const data = await fetchAttendees(currentFilter);
    renderAttendees(data);
  } catch (e) {
    attendeesListEl.textContent = 'Error loading attendees';
  }
}

filterButtons.forEach(btn => btn.addEventListener('click', (e)=>{
  filterButtons.forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  currentFilter = btn.getAttribute('data-filter') || 'ALL';
  refreshAttendees();
}));

document.getElementById('refreshAttendees').addEventListener('click', refreshAttendees);

// initialize attendees panel after config loads
(async function initAttendees(){
  // default select All
  const allBtn = document.querySelector('.filterBtn[data-filter="ALL"]');
  if (allBtn) allBtn.classList.add('active');
  try { await loadConfig(); await loadCameras(); } catch(_){}
  refreshAttendees();
})();
