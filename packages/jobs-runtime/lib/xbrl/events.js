'use strict';

/**
 * Reg-30 / LODR event XBRL: kind catalogue and a generic parser.
 *
 * Event filings (`in-capmkt` taxonomy, one small file per disclosure) share a header
 * (company, scrip, symbol, ISIN) and then carry event-specific text fields, some of which repeat
 * (one block per director, per ISIN, per order). The parser is generic on purpose: it keeps every
 * field, splits repeated blocks into `records`, and builds a short `summary` from the fields that
 * matter. Numeric facts (order value etc.) land in `numbers`.
 */

/**
 * @typedef {Object} EventKind
 * @property {string} label
 * @property {number[]} flags  BSE `GetCorXbrlDetails_ng/w` category flags.
 * @property {string[]} [nseSubjects] NSE `/XBRL-announcements` subjects (NSE only publishes these three families).
 * @property {RegExp[]} [keys] Extra field patterns for the summary, in priority order.
 */

/** @type {Record<string, EventKind>} */
const EVENT_KINDS = Object.freeze({
  'board-meeting-intimation': {
    label: 'Prior intimation of board meeting',
    flags: [34],
    keys: [/^TypeOfMeeting$/, /^DateOfProposedMeeting$/, /TradingWindow/],
  },
  'board-meeting-outcome': {
    label: 'Outcome of board meeting',
    flags: [35],
    keys: [/EventOfBoardMeeting$/, /Dividend|Bonus|Split|Buyback|Fund|Raising/],
  },
  'analyst-meet': {
    label: 'Analyst/investor meet, earnings-call schedule and recordings',
    flags: [47],
    keys: [/^PurposeOfDisclosure$/, /TypeOfAudio|TypeOfVideo|DateOfCall|DateOfMeet/],
  },
  'orders-awarded': {
    label: 'Order/contract awarded to the entity',
    flags: [45],
    keys: [/^TypeOfEvent$/, /NameOfTheEntity|Counterparty/, /Value|Amount|Consideration|Terms/],
  },
  'reg30-para-b': {
    label: 'Reg 30 Para B events (order bagging, capacity, MoUs, litigation, etc.)',
    flags: [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65],
    keys: [
      /^TypeOfEventAsPerRegulation30|^SubTypeOf/,
      /NameOfThe|Counterparty/,
      /Value|Amount|Terms/,
    ],
  },
  'reg30-update': {
    label: 'Reg 30 restructuring / update announcements',
    flags: [24],
    keys: [/^TypeOfAnnouncement/, /^UpdateForTheEvent$/, /^ReasonForUpdate$/, /Transaction/],
  },
  'capital-alteration': {
    label: 'Alteration of capital',
    flags: [27],
    keys: [/^TypeOfEvent$/, /Alteration|Capital|Shares|Ratio|Price/],
  },
  'credit-rating': {
    label: 'Credit rating action',
    flags: [14],
    keys: [
      /^NameOfCreditRatingAgency$/,
      /^CreditRating$/,
      /^RatingAction$/,
      /^DateOfCreditRating$/,
    ],
  },
  'kmp-resignation': {
    label: 'Resignation of director / KMP / SMP / compliance officer',
    flags: [31],
    nseSubjects: ['Resignation of Director/KMP/SMP', 'Resignation of Independent director'],
    keys: [
      /^NameOf.*(Director|Personnel)/,
      /^DesignationOf/,
      /^EffectiveDateOfResignation$/,
      /Reason/,
    ],
  },
  'auditor-resignation': {
    label: 'Resignation of statutory auditor',
    flags: [32],
    nseSubjects: ['Resignation of Statutory Auditor'],
    keys: [
      /^NameOfTheStatutoryAuditor/,
      /^EffectiveDateOfResignation$/,
      /^DetailedReasonForResignation$/,
    ],
  },
  'management-change': {
    label: 'Change in directors / KMP / auditor / compliance officer / RTA',
    flags: [33],
    nseSubjects: [
      'Change in Directors/KMP/SMP/Auditor/RTA',
      'Change in Directors/ Key Managerial Personnel/ Auditor/ Compliance Officer/ Share Transfer Agent',
    ],
    keys: [
      /^TypeOfChange$/,
      /^CategoryForChange$/,
      /^NameOfDesignatedPerson$/,
      /^DesignationOfDesignatedPerson$/,
    ],
  },
  'shareholder-meeting-notice': {
    label: 'Notice of shareholders meeting / resolutions',
    flags: [28],
    keys: [
      /^EventForNotice/,
      /^DateOfShareholdersMeeting$/,
      /CategoryOfResolution|BriefDetailsOfResolution/,
    ],
  },
  cirp: {
    label: 'Corporate insolvency resolution process',
    flags: [40],
    keys: [/^TypeOfCorporateInsolvency/, /^DetailsOf/],
  },
  'trading-window': {
    label: 'Trading-window closure',
    flags: [41],
    keys: [/^TypeOfEvent/, /^DateOfStart/, /^PurposeOf/, /EndDate/],
  },
  'actions-orders': {
    label: 'Actions taken / orders passed against the entity',
    flags: [46],
    keys: [
      /^TypeOfEvent$/,
      /^TypeOfActionsTaken/,
      /^NameOfAuthority/,
      /^NatureAndDetails/,
      /^PeriodFor/,
    ],
  },
  'share-certificate-loss': {
    label: 'Loss of share certificate / duplicate issue',
    flags: [42],
    keys: [/^TypeOfEvent/, /^NameOfShareholders$/],
  },
  'secretarial-compliance': {
    label: 'Annual secretarial compliance report',
    flags: [2],
    keys: [/^NameOfTheCertifyingFirm$/, /^WhetherAnyObservations/, /^AnyActionStaken/],
  },
  'debt-payment-schedule': {
    label: 'Debt interest / redemption payment schedule',
    flags: [13, 15],
    keys: [/^SecuritiesDescription$/, /^RecordDate/, /^DueDate/, /Redemption/],
  },
  ots: {
    label: 'One-time settlement intimation',
    flags: [26],
    keys: [/Lender|Bank|Amount|Settlement/],
  },
  cdr: {
    label: 'Corporate debt restructuring',
    flags: [29],
    keys: [/Type|Lender|Amount|Restructur/],
  },
});

/** BSE flags seen in the XBRL index but not mapped (exchange-internal or unidentified): documented, not fetched. */
const UNMAPPED_BSE_FLAGS = Object.freeze({
  4: 'Reg 60 debt file: path is not under /XBRLFILES/ (404)',
  9: 'DIC debt filing: empty in probes',
  11: 'company master data (Reco_*): exchange-internal',
  16: 'in-principle IPO approvals: new-listing workflow',
  17: 'no file URLs in rows',
  18: 'no file URLs in rows (15,000+ rows/month)',
  19: 'no file URLs in rows',
  20: 'no file URLs in rows',
  21: 'no file URLs in rows',
  37: 'empty in probes',
  38: 'empty in probes',
  39: 'empty in probes',
});

const HEADER_LOCALS = new Set([
  'NameOfTheCompany',
  'ScripCode',
  'NSESymbol',
  'MSEISymbol',
  'ISIN',
  'Symbol',
  'WhetherCompanyIsSME',
]);
/** Fields that add nothing to a summary. */
const NOISE = /^(Whether|Time|Salutation|Nationality|Number)|AckNo|Acknowledgment/;
const GENERIC_KEYS = [
  /^Type(Of)?(Announcement|Event|Change|Meeting|Intimation)/,
  /^DateOfOccurrence|^DateOfReport$/,
  /^(Category|SubType|Sub)/,
  /Reason|Details|Purpose|Nature/,
];

/** DD-MM-YYYY | DD/MM/YYYY | YYYY-MM-DD -> ISO date, else the input. */
function normDate(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}
const isDateField = (local) => /Date/.test(local);
const clip = (s, n = 500) => (String(s).length > n ? `${String(s).slice(0, n)}...` : String(s));
const decode = (s) =>
  String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

/**
 * @param {ReturnType<import('./parse').parseXbrl>} parsed
 * @param {string} kind key of EVENT_KINDS
 * @returns {{ok:boolean, reason?:string, kind:string, company:Object, ref:string|null, eventType:string|null,
 *   summary:Array<{field:string,value:string}>, fields:Record<string,string>, records:Array<Object>,
 *   numbers:Record<string,number>}}
 */
function parseEvent(parsed, kind) {
  const def = EVENT_KINDS[kind];
  const entries = (parsed.textList || []).map((t) => ({ local: t.local, value: decode(t.value) }));
  if (!entries.length && !(parsed.facts || []).length)
    return { ok: false, reason: 'no-facts', kind };

  const first = (local) => (entries.find((e) => e.local === local) || {}).value || null;
  const company = {
    name: first('NameOfTheCompany'),
    scrip: first('ScripCode'),
    symbol:
      [first('NSESymbol'), first('Symbol')].find((s) => s && !/^(NA|NOTLISTED)$/i.test(s)) || null,
    isin: first('ISIN'),
  };

  const body = entries.filter((e) => !HEADER_LOCALS.has(e.local));
  const counts = {};
  for (const e of body) counts[e.local] = (counts[e.local] || 0) + 1;

  const fields = {};
  const records = [];
  let cur = null;
  for (const e of body) {
    const value = isDateField(e.local) ? normDate(e.value) : e.value;
    if (counts[e.local] > 1) {
      if (!cur || e.local in cur) {
        cur = {};
        records.push(cur);
      }
      cur[e.local] = value;
    } else fields[e.local] = value;
  }

  const numbers = {};
  for (const f of parsed.facts || []) {
    if (!HEADER_LOCALS.has(f.local) && !(f.local in numbers)) numbers[f.local] = f.value;
  }

  const patterns = [...GENERIC_KEYS.slice(0, 1), ...(def?.keys || []), ...GENERIC_KEYS.slice(1)];
  const pool = [...Object.entries(fields), ...(records[0] ? Object.entries(records[0]) : [])];
  const seen = new Set();
  const summary = [];
  for (const re of patterns) {
    for (const [field, value] of pool) {
      if (seen.has(field) || NOISE.test(field) || !re.test(field)) continue;
      seen.add(field);
      summary.push({ field, value: clip(value) });
      if (summary.length >= 12) break;
    }
    if (summary.length >= 12) break;
  }
  for (const [k, v] of Object.entries(numbers).slice(0, 4))
    summary.push({ field: k, value: String(v) });

  /** Monetary facts are INR; expose Rs Cr for amount-like names (count-like facts stay as they are). */
  const numbersCr = {};
  for (const [k, v] of Object.entries(numbers))
    if (
      /Amount|Value|Consideration|Penalty|Fine|Size/.test(k) &&
      !/^NumberOf/.test(k) &&
      Math.abs(v) >= 1e5
    )
      numbersCr[k] = Math.round((v / 1e7) * 100) / 100;

  /** One compact line per repeated block (directors, ISINs, ...), top fields only. */
  const recordSummary = records.slice(0, 10).map((r) => {
    const out = {};
    for (const re of patterns)
      for (const [f, v] of Object.entries(r))
        if (!(f in out) && !NOISE.test(f) && re.test(f) && Object.keys(out).length < 5)
          out[f] = clip(v, 200);
    return out;
  });

  const eventType =
    fields.TypeOfEvent ||
    fields.TypeOfChange ||
    fields.TypeOfEventAsPerRegulation30ParaBOfPartAOfScheduleIII ||
    fields.EventForNoticeOfShareholdersMeeting ||
    fields.FirstEventOfBoardMeeting ||
    fields.PurposeOfDisclosure ||
    fields.UpdateForTheEvent ||
    null;
  const ref = fields.DateOfReport || fields.DateOfOccurrenceOfEventOrInformation || null;
  return {
    ok: true,
    kind,
    company,
    ref: ref && /^\d{4}-\d{2}-\d{2}$/.test(ref) ? ref : null,
    eventType,
    summary,
    fields,
    records,
    recordSummary,
    numbers,
    numbersCr,
  };
}

/** flag -> kind key. */
const FLAG_TO_KIND = Object.freeze(
  Object.entries(EVENT_KINDS).reduce((m, [k, d]) => {
    for (const f of d.flags) m[f] = k;
    return m;
  }, {})
);

/** NSE subject -> kind key. */
const NSE_SUBJECT_TO_KIND = Object.freeze(
  Object.entries(EVENT_KINDS).reduce((m, [k, d]) => {
    for (const s of d.nseSubjects || []) m[s] = k;
    return m;
  }, {})
);

module.exports = {
  EVENT_KINDS,
  FLAG_TO_KIND,
  NSE_SUBJECT_TO_KIND,
  UNMAPPED_BSE_FLAGS,
  parseEvent,
  normDate,
};
