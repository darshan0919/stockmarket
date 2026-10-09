'use strict';

/**
 * Message handlers for the native-messaging host (Chrome extension <-> repo KB).
 * Pure request -> response; no stdio here so it is unit-testable.
 */
const lib = '../../../packages/jobs-runtime/lib';
const experts = require(`${lib}/xExperts`);
const { commitRows, computeStats, loadRaw } = require(`${lib}/xCapture`);

/** One-time backfill: experts captured before stats existed get them computed from the raw cache. */
function config() {
  for (const e of Object.values(experts.load().experts)) {
    if ((e.coverage || e.coverageBy) && (!e.stats || e.stats.v !== 3))
      experts.setStats(e.handle, computeStats(e.handle));
  }
  return experts.publicConfig();
}

function handle(msg) {
  switch (msg && msg.type) {
    case 'ping':
      return { ok: true, host: 'stockmarket-x-kb', version: 1 };
    case 'getConfig':
      return { ok: true, config: config() };
    case 'setSelected':
      experts.setSelected(msg.handles);
      return { ok: true, config: config() };
    case 'addExpert':
      experts.addExpert(msg.handle, msg.name);
      return { ok: true, config: config() };
    case 'setSettings':
      experts.setSettings(msg.settings || {});
      return { ok: true, config: config() };
    case 'checkIds': {
      // Which of these tweet ids are NOT in the KB's raw cache yet (used by Verify).
      if (!msg.handle || !Array.isArray(msg.ids))
        throw new Error('checkIds needs { handle, ids[] }');
      const raw = loadRaw(msg.handle);
      return { ok: true, missing: msg.ids.filter((id) => !raw.has(id)) };
    }
    case 'setCoverage': {
      if (!msg.handle || !msg.stream)
        throw new Error('setCoverage needs { handle, stream, coverage }');
      experts.replaceCoverage(msg.handle, msg.stream, msg.coverage || null);
      return { ok: true, config: config() };
    }
    case 'commit': {
      if (!msg.handle || !Array.isArray(msg.rows))
        throw new Error('commit needs { handle, rows[] }');
      const r = commitRows(msg.handle, msg.rows, {
        coverage: msg.coverage || undefined,
        stream: msg.stream || 'main',
      });
      return { ok: true, ...r, config: config() };
    }
    default:
      throw new Error(`unknown message type: ${msg && msg.type}`);
  }
}

function safeHandle(msg) {
  try {
    return handle(msg);
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

module.exports = { handle, safeHandle };
