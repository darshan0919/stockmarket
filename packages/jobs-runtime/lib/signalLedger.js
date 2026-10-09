'use strict';

/**
 * signalLedger — keyed, concurrency-safe state machine for SOIC signals.
 *
 * Model: one record per (scope, entityType, entityId, signalId) in the `signal-ledger`
 * collection. A detector reports an OBSERVATION per entity each run; this module turns
 * observations into state records + append-only `signal_transition` events.
 *
 * Design rules (multi-job / multi-user safe by construction):
 *  - No module-level mutable state; everything is passed as explicit arguments
 *    (detector, date, scope, store).
 *  - Each signalId is owned by one detector (record.creator). Writing a key owned by a
 *    different detector throws instead of silently overwriting.
 *  - Idempotent: re-running the same detector/date yields no change (miss counters and
 *    lastChecked guard against double counting); stale (older-date) observations are ignored.
 *  - `scope` is 'global' for market-derived signals; per-user overlays use `user:<id>`.
 *
 * Lifecycle states: detected -> confirmed -> entry-ready (active) ; invalidated | spent (terminal).
 * An observation is { signalId, entityType: 'market'|'sector'|'company', entityId,
 *   state: <STATE>|null, evidence?, levels?, minMisses? }. state=null means "not observed
 *   today"; the signal is invalidated after `minMisses` (default 1) consecutive misses.
 */

const COLLECTION = 'signal-ledger';
const STATES = Object.freeze(['detected', 'confirmed', 'entry-ready', 'invalidated', 'spent']);
const ACTIVE = new Set(['detected', 'confirmed', 'entry-ready']);
const ENTITY_TYPES = Object.freeze(['market', 'sector', 'company']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const part = (s) => String(s).replace(/[^A-Za-z0-9:._-]/g, '_');

function ledgerKey({ signalId, entityType, entityId, scope = 'global' }) {
  if (!signalId) throw new Error('signalId is required');
  if (!ENTITY_TYPES.includes(entityType)) throw new Error(`invalid entityType: ${entityType}`);
  if (!entityId) throw new Error('entityId is required');
  return `sig_${part(scope)}_${entityType}_${part(entityId)}_${part(signalId)}`;
}

/**
 * Pure transition function. Returns { record, transition } or null when nothing changes.
 * `prev` is the stored record (or undefined).
 */
function nextState(prev, obs, { detector, date, scope = 'global' }) {
  if (obs.state != null && !STATES.includes(obs.state)) {
    throw new Error(`invalid state: ${obs.state}`);
  }
  const id = ledgerKey({ ...obs, scope });
  const observed = obs.state != null;

  if (prev && prev.lastChecked && date < prev.lastChecked) return null; // stale observation

  const base = {
    id,
    type: 'signal-state',
    creator: detector,
    scope,
    signalId: obs.signalId,
    entityType: obs.entityType,
    entityId: obs.entityId,
    date,
  };
  if (obs.entityType === 'company') base.companyId = obs.entityId;

  const terminalObs = observed && !ACTIVE.has(obs.state);
  const prevActive = prev && ACTIVE.has(prev.state);

  if (!prev) {
    if (!observed || terminalObs) return null; // nothing to record yet
    return {
      record: {
        ...base,
        state: obs.state,
        since: date,
        firstSeen: date,
        lastSeen: date,
        lastChecked: date,
        misses: 0,
        reopenCount: 0,
        evidence: obs.evidence ?? null,
        levels: obs.levels ?? null,
      },
      transition: { from: null, to: obs.state },
    };
  }

  const keep = { ...prev, ...base, lastChecked: date };

  if (observed) {
    const to = obs.state;
    const changed = to !== prev.state;
    const reopened = changed && !prevActive && ACTIVE.has(to);
    const rec = {
      ...keep,
      state: to,
      since: changed ? date : prev.since,
      lastSeen: ACTIVE.has(to) ? date : prev.lastSeen,
      misses: 0,
      reopenCount: (prev.reopenCount || 0) + (reopened ? 1 : 0),
      evidence: obs.evidence ?? prev.evidence ?? null,
      levels: obs.levels ?? prev.levels ?? null,
    };
    return { record: rec, transition: changed ? { from: prev.state, to } : null };
  }

  // not observed today
  if (!prevActive) return null; // already terminal
  if (prev.lastChecked === date) return null; // idempotent re-run: do not double count a miss
  const misses = (prev.misses || 0) + 1;
  const limit = obs.minMisses ?? 1;
  if (misses >= limit) {
    return {
      record: { ...keep, state: 'invalidated', since: date, misses },
      transition: { from: prev.state, to: 'invalidated' },
    };
  }
  return { record: { ...keep, misses }, transition: null };
}

/**
 * Apply a batch of observations from ONE detector run.
 * @param {Array} observations
 * @param {{detector:string, date:string, scope?:string, store?:object}} ctx
 */
function applyObservations(observations, { detector, date, scope = 'global', store } = {}) {
  if (!detector) throw new Error('detector (creator) is required');
  if (!DATE_RE.test(date || '')) throw new Error('date must be YYYY-MM-DD');
  const db = store || require('./db');

  const existing = new Map(
    db
      .find(COLLECTION, { sort: 'id' })
      .filter((r) => r.scope === scope)
      .map((r) => [r.id, r])
  );

  const records = [];
  const events = [];
  for (const obs of observations) {
    const key = ledgerKey({ ...obs, scope });
    const prev = existing.get(key);
    if (prev && prev.creator !== detector) {
      throw new Error(`signal ${obs.signalId} is owned by ${prev.creator}, not ${detector}`);
    }
    const out = nextState(prev, obs, { detector, date, scope });
    if (!out) continue;
    records.push(out.record);
    if (out.transition) {
      events.push({
        type: 'signal_transition',
        creator: detector,
        date,
        ...(out.record.companyId ? { companyId: out.record.companyId } : {}),
        scope,
        ledgerId: key,
        signalId: obs.signalId,
        entityType: obs.entityType,
        entityId: obs.entityId,
        from: out.transition.from,
        to: out.transition.to,
        summary: `${obs.signalId} ${obs.entityType}:${obs.entityId} ${out.transition.from || 'none'} -> ${out.transition.to}`,
        evidence: obs.evidence ?? null,
      });
    }
  }

  const states = records.length
    ? db.upsertMany(COLLECTION, records)
    : { inserted: 0, updated: 0, unchanged: 0 };
  const eventStats = events.length
    ? db.appendEvents(events)
    : { inserted: 0, updated: 0, unchanged: 0 };
  return { states, events: eventStats, transitions: events.map((e) => e.summary) };
}

/** Read current states (explicit filters; no ambient context). */
function getStates({ signalIds, entityType, scope = 'global', activeOnly = false, store } = {}) {
  const db = store || require('./db');
  return db
    .find(COLLECTION, { sort: 'id' })
    .filter(
      (r) =>
        r.scope === scope &&
        (!signalIds || signalIds.includes(r.signalId)) &&
        (!entityType || r.entityType === entityType) &&
        (!activeOnly || ACTIVE.has(r.state))
    );
}

module.exports = {
  COLLECTION,
  STATES,
  ACTIVE,
  ledgerKey,
  nextState,
  applyObservations,
  getStates,
};
