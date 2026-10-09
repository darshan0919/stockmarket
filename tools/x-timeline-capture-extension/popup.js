const $ = (id) => document.getElementById(id);
const send = (m) => chrome.runtime.sendMessage(m);
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );
const day = (ms) =>
  new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
let experts = [];
let job = null;
let vjob = null;
let toast = null; // transient inline error

function rng(c) {
  if (!c) return 'not captured yet';
  const v = c.verify;
  const mark = !v
    ? ''
    : v.state === 'ok'
      ? ` ✓ verified ${day(v.at)}`
      : v.state === 'partial'
        ? ` ✓ all that X serves (${day(v.at)})`
        : ' ⚠ check';
  const from = !c.exhausted
    ? day(c.fromMs)
    : v && v.state === 'partial'
      ? 'oldest X serves'
      : 'from the beginning';
  return `${from} → ${day(c.toMs)}${mark}`;
}
/** One saved range per capture stream (they are separate timelines on X, so each has its own range). */
function covText(e) {
  const by = e.coverageBy || {};
  return `<span class="rg">Replies timeline: ${rng(e.coverage)}<br>Posts: ${rng(by.originals)}<br>Reposts: ${rng(by.reposts)}<br>Articles: ${rng(by.articles)}</span>`;
}
function statText(e) {
  const l = globalThis.XCap.storedLine(e.stats);
  return l ? `${l.replace('Stored: ', '')}<br>` : '';
}

function renderExperts() {
  $('experts').innerHTML = experts
    .map(
      (
        e
      ) => `<label class="ex"><input type="checkbox" data-h="${esc(e.handle)}" ${e.selected ? 'checked' : ''}>
      <span><span class="n">${esc(e.name)}</span> <span class="us">@${esc(e.handle)}</span><br><span class="c">${statText(e)}${covText(e)}</span></span></label>`
    )
    .join('');
  document.querySelectorAll('#experts input').forEach((cb) => (cb.onchange = persistSelection));
}
const selected = () =>
  [...document.querySelectorAll('#experts input:checked')].map((cb) => cb.dataset.h);
async function persistSelection() {
  const r = await send({ type: 'XCAP_SET_SELECTED', handles: selected() });
  if (r.ok) applyConfig(r, false);
}
function setAll(v) {
  document.querySelectorAll('#experts input').forEach((cb) => (cb.checked = v));
  persistSelection();
}

function applyConfig(r, rerender = true) {
  experts = r.config.experts;
  if (rerender) renderExperts();
  $('auto').checked = !!r.config.settings.autoRefresh;
  const w = $('warn');
  w.style.display = r.hostMissing ? 'block' : 'none';
  if (r.hostMissing)
    w.textContent =
      'KB bridge not installed: captures will download as JSON and nothing is cached. Run native-host/install.js (see README), then reload the extension.';
}

const ICON = {
  done: '✓',
  cached: '✓',
  queued: '○',
  error: '✕',
  'login-required': '!',
  paused: '⏸',
  'rate-limited': '⏱',
};

function renderVerify(vv) {
  $('headline').className =
    `head ${vv.status === 'error' ? 'bad' : vv.status === 'done' && vv.headline.includes('passed') ? 'ok' : vv.status === 'done' ? 'warn' : ''}`;
  $('headline').textContent = toast || vv.headline;
  $('detail').className = 'sub';
  $('detail').textContent = toast ? '' : vv.detail;
  $('overall').style.display = 'none';
  $('users').innerHTML = vv.users
    .map(
      (
        u
      ) => `<li class="u"><span class="ic ${u.state === 'active' ? 'spin' : u.state}" aria-hidden="true">${u.state === 'active' ? '' : u.state === 'ok' ? '✓' : u.state === 'queued' ? '○' : '!'}</span>
    <div><div class="uh">@${esc(u.handle)} <span class="us">${u.label ? '· ' + esc(u.label) : ''}</span></div>
    ${u.streams
      .filter((x) => x.state !== 'skipped')
      .map(
        (x) =>
          `<div class="vs ${x.state}">${esc(x.name)}: ${esc(x.label)}</div>${x.notes.length ? `<ul class="vn">${x.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}`
      )
      .join('')}
    ${
      u.streams.some((x) => x.state === 'skipped')
        ? `<div class="us">Not captured yet: ${esc(
            u.streams
              .filter((x) => x.state === 'skipped')
              .map((x) => x.name)
              .join(', ')
          )}</div>`
        : ''
    }</div></li>`
    )
    .join('');
  $('main').textContent = 'Start capture';
  $('main').dataset.action = 'start';
  $('main').className = 'primary';
  $('main').disabled = vv.busy;
  $('verify').disabled = vv.busy;
  $('cancel').hidden = true;
  $('setup').disabled = vv.busy;
}

function render() {
  const vv = !job && vjob ? globalThis.XCap.describeVerify(vjob) : null;
  if (vv) return renderVerify(vv);
  $('main').disabled = false;
  const v = globalThis.XCap.describeJob(job, Date.now(), experts);
  const tone =
    v.state === 'error' || v.state === 'login-required'
      ? 'bad'
      : v.state === 'done'
        ? 'ok'
        : v.state === 'rate-limited' || v.state === 'paused'
          ? 'warn'
          : '';
  $('headline').className = `head ${tone}`;
  $('headline').textContent = toast || v.headline;
  $('detail').className = `sub ${tone === 'bad' ? 'bad' : ''}`;
  $('detail').textContent = toast ? '' : v.detail;
  const bar = $('overall');
  bar.firstElementChild.style.width = `${v.overallPct}%`;
  bar.setAttribute('aria-valuenow', String(v.overallPct));
  bar.style.display = v.users.length ? '' : 'none';
  $('users').innerHTML = v.users
    .map(
      (
        u
      ) => `<li class="u"><span class="ic ${u.state} ${u.state === 'active' ? 'spin' : ''}" aria-hidden="true">${u.state === 'active' ? '' : ICON[u.state] || ''}</span>
      <div><div class="uh">@${esc(u.handle)} <span class="us">· ${esc(u.label)}</span></div>${u.detail ? `<div class="us dl">${esc(u.detail)}</div>` : ''}${u.state === 'active' ? `<div class="bar sm"><i style="width:${u.pct}%"></i></div>` : ''}</div></li>`
    )
    .join('');
  const main = $('main');
  main.textContent = v.primary.label;
  main.dataset.action = v.primary.action;
  main.className = `primary ${v.primary.action === 'pause' ? 'pause' : ''}`;
  $('cancel').hidden = !v.canCancel;
  $('verify').disabled = v.locked;
  $('setup').disabled = v.locked;
  $('auto').disabled = false;
}

function flash(msg) {
  toast = msg;
  render();
  setTimeout(() => {
    toast = null;
    render();
  }, 4000);
}

$('add').onclick = async () => {
  const h = globalThis.XCap.parseHandles($('newHandle').value)[0];
  if (!h) return flash('Enter a valid @username.');
  const r = await send({ type: 'XCAP_ADD_EXPERT', handle: h });
  if (r.ok) {
    $('newHandle').value = '';
    applyConfig(r);
  } else flash(r.error);
};
$('newHandle').onkeydown = (e) => {
  if (e.key === 'Enter') $('add').click();
};
$('all').onclick = () => setAll(true);
$('none').onclick = () => setAll(false);
$('main').onclick = async () => {
  const action = $('main').dataset.action;
  if (action === 'pause') return send({ type: 'XCAP_STOP' });
  if (action === 'resume') return send({ type: 'XCAP_RESUME' });
  const handles = selected();
  if (!handles.length) return flash('Select at least one user.');
  await chrome.storage.local.set({ interval: $('interval').value });
  const r = await send({ type: 'XCAP_START', handles, intervalDays: Number($('interval').value) });
  if (!r.ok) flash(r.error);
};
$('cancel').onclick = async () => {
  const r = await send({ type: 'XCAP_CANCEL' });
  if (r && r.ok === false) flash(r.error);
};
$('verify').onclick = async () => {
  const handles = selected();
  if (!handles.length) return flash('Select at least one user.');
  const r = await send({ type: 'XCAP_VERIFY', handles });
  if (!r.ok) flash(r.error);
};
$('auto').onchange = async () => {
  const r = await send({ type: 'XCAP_SET_SETTINGS', settings: { autoRefresh: $('auto').checked } });
  if (!r.ok) {
    $('auto').checked = false;
    flash(r.error);
  }
};

chrome.storage.onChanged.addListener((ch) => {
  if (ch.vjob) {
    vjob = ch.vjob.newValue || null;
    render();
    if (!vjob || vjob.status !== 'running')
      send({ type: 'XCAP_CONFIG' }).then((r) => r.ok && applyConfig(r));
  }
  if (!ch.job) return;
  const prevN = job ? (job.summary || []).length : 0;
  job = ch.job.newValue || null;
  render();
  if (!job || job.status === 'done' || (job.summary || []).length !== prevN)
    send({ type: 'XCAP_CONFIG' }).then((r) => r.ok && applyConfig(r));
});

(async () => {
  $('interval').innerHTML = globalThis.XCap.INTERVALS.map(
    (i) => `<option value="${i.days}">${i.label}</option>`
  ).join('');
  const st = await chrome.storage.local.get(['interval', 'job', 'vjob']);
  vjob = st.vjob || null;
  $('interval').value = st.interval || '365';
  job = st.job || null;
  const r = await send({ type: 'XCAP_CONFIG' });
  if (r.ok) applyConfig(r);
  render();
  setInterval(render, 1000); // live countdowns / stall warning, no storage reads
})();
