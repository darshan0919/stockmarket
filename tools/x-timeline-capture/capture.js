/**
 * x-timeline-capture — paste into Claude in Chrome's javascript_tool (or the DevTools
 * console) on any logged-in https://x.com/<handle>/with_replies tab.
 *
 * What it does: replays X's own web-client request (UserRepliesTimeline = posts +
 * replies + quote tweets + long-form notes/articles) from YOUR signed-in browser
 * session. No cookies/tokens are read out, stored, or sent anywhere except back to
 * x.com — the page's own same-origin fetch carries them. Nothing goes in .env.
 *
 *   1. Query ids + feature flags are scraped live from X's main.js bundle (they rotate;
 *      this is why the old hard-coded TWITTER_*_QUERY_ID env vars go stale).
 *   2. Pages the timeline newest → oldest until `since`, saving every tweet by id.
 *   3. X rate-limits (HTTP 429) after ~25-30 pages per ~15 min; the runner sleeps
 *      13 min and resumes from the saved cursor, so a long backfill just needs the tab open.
 *   4. When a handle finishes it downloads x-capture-<handle>-<date>.json to ~/Downloads.
 *      Import with:  node packages/jobs-runtime/scripts/importXPosts.js --dir ~/Downloads
 *
 * Tweak: HANDLES and SINCE below. For a daily top-up set SINCE to ~3 days ago (1-2 pages
 * per account; re-import is idempotent).
 *
 * Caveats: X's ToS forbid automated scraping outside its paid API — personal use only,
 * keep the pacing. Images (e.g. chart screenshots) are captured as URLs, not OCR'd.
 */
(async () => {
  const HANDLES = ['SureshKBN', 'Shashank1171', 'thechartist26', 'ishmohit1'];
  const SINCE = new Date('2025-01-01T00:00:00Z');
  const OP = 'UserRepliesTimeline';
  const BEARER =
    'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'; // public web-client bearer
  const FALSE_FLAGS = new Set([
    'rweb_video_screen_enabled',
    'responsive_web_profile_redirect_enabled',
    'rweb_tipjar_consumption_enabled',
    'premium_content_api_read_enabled',
    'responsive_web_grok_analyze_button_fetch_trends_enabled',
    'longform_notetweets_inline_media_enabled',
    'responsive_web_enhance_cards_enabled',
    'responsive_web_graphql_skip_user_profile_image_extensions_enabled',
  ]);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ct0 = () => (document.cookie.match(/ct0=([^;]+)/) || [])[1];

  // 1. live query ids + feature switches from the main bundle
  const main = [...document.querySelectorAll('script[src]')]
    .map((s) => s.src)
    .find((s) => /client-web\/main\./.test(s));
  const js = await (await fetch(main)).text();
  const meta = (op) => {
    const i = js.indexOf(`operationName:"${op}"`);
    const seg = js.slice(i - 60, i + 4000);
    const list = (re) =>
      ((seg.match(re) || [])[1] || '').replace(/"/g, '').split(',').filter(Boolean);
    return {
      q: (js.slice(i - 60, i).match(/queryId:"([\w-]+)"/) || [])[1],
      fs: list(/featureSwitches:\[([^\]]*)\]/),
      ft: list(/fieldToggles:\[([^\]]*)\]/),
    };
  };
  const M = { [OP]: meta(OP), UserByScreenName: meta('UserByScreenName') };
  const flags = (m) => Object.fromEntries(m.fs.map((k) => [k, !FALSE_FLAGS.has(k)]));
  const toggles = (m) =>
    Object.fromEntries(
      m.ft.map((k) => [k, k === 'withArticlePlainText' || k === 'withArticleRichContentState'])
    );

  const gql = async (op, vars) => {
    const m = M[op];
    const url = `https://x.com/i/api/graphql/${m.q}/${op}?variables=${encodeURIComponent(JSON.stringify(vars))}&features=${encodeURIComponent(JSON.stringify(flags(M[OP])))}&fieldToggles=${encodeURIComponent(JSON.stringify(toggles(M[OP])))}`;
    const r = await fetch(url, {
      credentials: 'include',
      headers: {
        authorization: 'Bearer ' + BEARER,
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
    return { status: r.status, json, text: text.slice(0, 150) };
  };

  const find = (o, k, d = 0) => {
    if (!o || typeof o !== 'object' || d > 14) return;
    if (k in o) return o[k];
    for (const x of Object.keys(o)) {
      const r = find(o[x], k, d + 1);
      if (r !== undefined) return r;
    }
  };
  const row = (t) => {
    if (!t) return null;
    if (t.tweet) t = t.tweet;
    const l = t.legacy;
    if (!l) return null;
    const u = t.core?.user_results?.result;
    const art = t.article?.article_results?.result;
    const rt = l.retweeted_status_result?.result;
    const qt = t.quoted_status_result?.result;
    const note = t.note_tweet?.note_tweet_results?.result?.text;
    return {
      id: t.rest_id || l.id_str,
      at: l.created_at,
      by: u?.core?.screen_name || u?.legacy?.screen_name,
      text: note || l.full_text,
      long: !!note,
      reply_to: l.in_reply_to_status_id_str || null,
      reply_to_user: l.in_reply_to_screen_name || null,
      conv: l.conversation_id_str,
      rt: rt ? row(rt) : null,
      quoted: qt ? row(qt) : null,
      urls: (l.entities?.urls || []).map((x) => x.expanded_url),
      media: (l.extended_entities?.media || l.entities?.media || []).map((m) => ({
        type: m.type,
        url: m.media_url_https,
      })),
      m: {
        rt: l.retweet_count,
        rp: l.reply_count,
        lk: l.favorite_count,
        qt: l.quote_count,
        vw: t.views?.count,
      },
      article: art
        ? {
            title: art.title,
            preview: art.preview_text,
            id: art.rest_id,
            text: art.content_state?.blocks?.map((b) => b.text).join('\n'),
          }
        : null,
    };
  };

  const download = (handle, rows) => {
    const blob = new Blob(
      [
        JSON.stringify({
          handle,
          capturedAt: new Date().toISOString(),
          since: SINCE.toISOString(),
          rows,
        }),
      ],
      { type: 'application/json' }
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `x-capture-${handle}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  window.__xcap = { state: {}, rows: {} };
  for (const handle of HANDLES) {
    const st = (window.__xcap.state[handle] = { status: 'resolving' });
    const store = (window.__xcap.rows[handle] = {});
    const u = await gql('UserByScreenName', {
      screen_name: handle,
      withSafetyModeUserFields: true,
    });
    const uid = u.json?.data?.user?.result?.rest_id;
    if (!uid) {
      st.status = 'unresolved';
      continue;
    }
    let cursor = null,
      oldest = Infinity,
      empty = 0;
    st.status = 'crawling';
    for (;;) {
      const vars = {
        userId: uid,
        count: 100,
        includePromotedContent: false,
        withCommunity: true,
        withVoice: true,
      };
      if (cursor) vars.cursor = cursor;
      const r = await gql(OP, vars);
      if (r.status === 429) {
        st.status = 'cooldown (13m)';
        await sleep(780000);
        st.status = 'crawling';
        continue;
      }
      if (r.status !== 200 || !r.json) {
        st.status = `error ${r.status} ${r.text}`;
        break;
      }
      let added = 0,
        next = null;
      for (const ins of find(r.json, 'instructions') || []) {
        for (const e of ins.entries || (ins.entry ? [ins.entry] : [])) {
          const c = e.content;
          if (c?.cursorType === 'Bottom') next = c.value;
          const list = [];
          if (c?.itemContent?.tweet_results?.result) list.push(c.itemContent.tweet_results.result);
          (c?.items || []).forEach((it) => {
            const x = it?.item?.itemContent?.tweet_results?.result;
            if (x) list.push(x);
          });
          for (const x of list) {
            const o = row(x);
            if (!o?.id || store[o.id]) continue;
            store[o.id] = o;
            added++;
            if ((o.by || '').toLowerCase() === handle.toLowerCase()) {
              const d = new Date(o.at);
              if (!isNaN(d)) oldest = Math.min(oldest, d);
            }
          }
        }
      }
      st.own = Object.values(store).filter(
        (x) => (x.by || '').toLowerCase() === handle.toLowerCase()
      ).length;
      st.oldest = isFinite(oldest) ? new Date(oldest).toISOString() : null;
      empty = added ? 0 : empty + 1;
      if (!next || empty >= 2 || oldest < SINCE) break;
      cursor = next;
      await sleep(1200);
    }
    if (st.status === 'crawling') {
      st.status = 'complete';
      download(handle, Object.values(store));
    }
  }
  return 'all handles processed';
})();
