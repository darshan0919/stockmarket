/**
 * popup.js — Renders the known-HFT watchlist and lets the user export it,
 * or sync it directly into the stockmarket project's data/ folder via the
 * File System Access API (directory handle is remembered across sessions).
 * @file extensions/intraday-deal-filter/popup.js
 */

const listEl = document.getElementById('list');
const statusEl = document.getElementById('status');
const toggleEl = document.getElementById('enabledToggle');
const toggleLabelEl = document.getElementById('toggleLabel');
const removeAllToggleEl = document.getElementById('removeAllToggle');
const thresholdRowEl = document.getElementById('thresholdRow');
const thresholdInputEl = document.getElementById('thresholdInput');

function setStatus(msg, isError) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? '#dc2626' : '#059669';
}

// --- On/off toggle: content scripts on every open stockscans tab listen for
// this key via chrome.storage.onChanged and hide/show rows accordingly. ---
function renderToggle(enabled) {
  toggleEl.checked = enabled;
  toggleLabelEl.textContent = enabled
    ? 'Filtering intraday deals'
    : 'Filtering off — showing all deals';
}

chrome.storage.local.get('idf_enabled', (res) => {
  renderToggle(res.idf_enabled !== false); // default on
});

toggleEl.addEventListener('change', () => {
  const enabled = toggleEl.checked;
  chrome.storage.local.set({ idf_enabled: enabled });
  renderToggle(enabled);
});

// --- "Remove all same-day Buy+Sell traders" toggle (default on) + the
// retained-shares % threshold it overrides. When the toggle is on, ANY
// shareholder with both a Buy and a Sell on the same day is treated as
// intraday regardless of quantity, and the threshold input is disabled
// (greyed out) since it has no effect. ---
function renderThresholdRow(removeAll) {
  thresholdRowEl.classList.toggle('disabled', removeAll);
  thresholdInputEl.disabled = removeAll;
}

chrome.storage.local.get(['idf_remove_all_samedays', 'idf_threshold_pct'], (res) => {
  const removeAll = res.idf_remove_all_samedays !== false; // default on
  removeAllToggleEl.checked = removeAll;
  renderThresholdRow(removeAll);
  thresholdInputEl.value = res.idf_threshold_pct !== undefined ? res.idf_threshold_pct : 2;
});

removeAllToggleEl.addEventListener('change', () => {
  const removeAll = removeAllToggleEl.checked;
  chrome.storage.local.set({ idf_remove_all_samedays: removeAll });
  renderThresholdRow(removeAll);
});

thresholdInputEl.addEventListener('change', () => {
  let value = parseFloat(thresholdInputEl.value);
  if (!Number.isFinite(value) || value < 0) value = 2;
  if (value > 100) value = 100;
  thresholdInputEl.value = value;
  chrome.storage.local.set({ idf_threshold_pct: value });
});

function toExportShape(watchlist) {
  const entries = Object.values(watchlist).sort((a, b) => b.occurrences - a.occurrences);
  return {
    schema: 'stockmarket.hft-watchlist.v1',
    description:
      'Shareholders repeatedly observed placing same-day, matched-quantity Buy+Sell bulk/block deals ' +
      '(intraday square-offs) on stockscans.in — detected by the intraday-deal-filter Chrome extension.',
    generatedAt: new Date().toISOString(),
    source: 'extensions/intraday-deal-filter',
    entries,
  };
}

function render(watchlist) {
  const entries = Object.values(watchlist).sort((a, b) => b.occurrences - a.occurrences);
  if (!entries.length) {
    listEl.innerHTML =
      '<div class="empty">No intraday traders detected yet.<br/>Browse a company\'s Shareholdings tab.</div>';
    return;
  }
  const rows = entries
    .map(
      (e) =>
        `<tr><td>${e.shareholder}</td><td>${e.occurrences}</td><td>${Object.keys(e.companies).join(', ')}</td></tr>`
    )
    .join('');
  listEl.innerHTML = `<table><thead><tr><th>Shareholder</th><th>#</th><th>Companies</th></tr></thead><tbody>${rows}</tbody></table>`;
}

async function getWatchlist() {
  const res = await chrome.runtime.sendMessage({ type: 'IDF_GET_WATCHLIST' });
  return res?.watchlist || {};
}

async function refresh() {
  const watchlist = await getWatchlist();
  render(watchlist);
  return watchlist;
}

document.getElementById('exportBtn').addEventListener('click', async () => {
  const watchlist = await getWatchlist();
  const data = toExportShape(watchlist);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename: 'hft-watchlist.json', saveAs: false }, () =>
    setStatus('Downloaded hft-watchlist.json')
  );
});

// --- Directory handle persistence (IndexedDB) so we don't re-prompt every time ---
function idbGet(key) {
  return new Promise((resolve) => {
    const req = indexedDB.open('idf-fs', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handles');
    req.onsuccess = () => {
      const tx = req.result.transaction('handles', 'readonly');
      const getReq = tx.objectStore('handles').get(key);
      getReq.onsuccess = () => resolve(getReq.result || null);
      getReq.onerror = () => resolve(null);
    };
    req.onerror = () => resolve(null);
  });
}
function idbSet(key, value) {
  return new Promise((resolve) => {
    const req = indexedDB.open('idf-fs', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handles');
    req.onsuccess = () => {
      const tx = req.result.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(value, key);
      tx.oncomplete = () => resolve();
    };
    req.onerror = () => resolve();
  });
}

document.getElementById('syncBtn').addEventListener('click', async () => {
  if (!window.showDirectoryPicker) {
    setStatus('File System Access API unavailable — use Download JSON instead.', true);
    return;
  }
  try {
    let dirHandle = await idbGet('dataDir');
    if (dirHandle) {
      const perm = await dirHandle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        const req = await dirHandle.requestPermission({ mode: 'readwrite' });
        if (req !== 'granted') dirHandle = null;
      }
    }
    if (!dirHandle) {
      setStatus('Pick your stockmarket/data folder...');
      dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await idbSet('dataDir', dirHandle);
    }

    const watchlist = await getWatchlist();
    const data = toExportShape(watchlist);
    const fileHandle = await dirHandle.getFileHandle('hft-watchlist.json', { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
    setStatus(`Saved hft-watchlist.json (${data.entries.length} HFTs) to selected folder.`);
  } catch (err) {
    setStatus(`Sync failed: ${err.message}`, true);
  }
});

document.getElementById('clearBtn').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'IDF_CLEAR_WATCHLIST' });
  await refresh();
  setStatus('Watchlist cleared.');
});

refresh();
