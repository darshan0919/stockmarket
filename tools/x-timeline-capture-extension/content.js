/**
 * content.js — runs on x.com pages (isolated world). Same-origin fetch to X's GraphQL API carries
 * the page's own session cookies; nothing is read out or stored. background.js drives it page by page.
 */
(function () {
  if (globalThis.__xcapContent) return;
  globalThis.__xcapContent = true;
  const C = globalThis.XCap;
  let meta = null; // { [op]: {q, fs, ft} }, scraped lazily from X's bundle (ids rotate)

  async function loadMeta() {
    if (meta) return meta;
    const main = [...document.querySelectorAll('script[src]')]
      .map((s) => s.src)
      .find((s) => /client-web\/main\./.test(s));
    if (!main) throw new Error('x.com main bundle not found on this page');
    const js = await (await fetch(main)).text();
    const m = { UserByScreenName: C.parseOperationMeta(js, 'UserByScreenName') };
    for (const op of Object.values(C.OPS)) m[op] = C.parseOperationMeta(js, op);
    if (!m[C.OP] || !m.UserByScreenName)
      throw new Error('could not read GraphQL ids from X bundle (X changed its bundle?)');
    meta = m;
    return meta;
  }

  const ct0 = () => (document.cookie.match(/ct0=([^;]+)/) || [])[1];

  async function gql(op, vars) {
    const m = await loadMeta();
    if (!m[op]) throw new Error(`X no longer exposes ${op} (bundle changed?)`);
    const r = await fetch(C.buildUrl(op, m[op], m[op], vars), {
      credentials: 'include',
      headers: {
        authorization: 'Bearer ' + C.BEARER,
        'x-csrf-token': ct0(),
        'x-twitter-active-user': 'yes',
        'x-twitter-auth-type': 'OAuth2Session',
      },
    });
    const text = await r.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (_) {}
    return {
      status: r.status,
      json,
      snippet: text.slice(0, 120),
      resetAt: Number(r.headers.get('x-rate-limit-reset')) || null,
    };
  }

  async function fetchPage({ handle, userId, cursor, stream }) {
    if (!ct0()) return { error: 'login-required' };
    let statusesCount = null;
    if (!userId) {
      const u = await gql('UserByScreenName', {
        screen_name: handle,
        withSafetyModeUserFields: true,
      });
      if (u.status === 429) return { status: 429, resetAt: u.resetAt };
      userId = u.json?.data?.user?.result?.rest_id;
      statusesCount = u.json?.data?.user?.result?.legacy?.statuses_count ?? null;
      if (!userId) return { error: `unresolved handle @${handle} (HTTP ${u.status})` };
    }
    const vars = {
      userId,
      count: 100,
      includePromotedContent: false,
      withCommunity: true,
      withVoice: true,
    };
    if (cursor) vars.cursor = cursor;
    const r = await gql(C.OPS[stream || 'main'], vars);
    if (r.status === 429) return { status: 429, resetAt: r.resetAt, userId };
    if (r.status !== 200 || !r.json) return { error: `HTTP ${r.status} ${r.snippet}`, userId };
    const { rows, next } = C.parseTimeline(r.json);
    return { status: 200, userId, rows, next, statusesCount };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, send) => {
    if (msg?.type === 'XCAP_PING') {
      send({ ok: true, loggedIn: !!ct0() });
      return false;
    }
    if (msg?.type === 'XCAP_FETCH_PAGE') {
      fetchPage(msg)
        .then(send)
        .catch((e) => send({ error: String(e?.message || e) }));
      return true; // async response
    }
    return false;
  });
})();
