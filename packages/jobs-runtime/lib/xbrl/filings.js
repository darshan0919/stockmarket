'use strict';

/**
 * Domain parsers for non-results NSE/BSE XBRL filings: shareholding pattern,
 * voting results, insider trading (PIT) and integrated governance reports.
 * Each takes the output of parse.js#parseXbrl and returns a compact DTO. Pure
 * functions; every parser returns `{ok:false, reason}` instead of throwing.
 */

const norm = (ctx) => String(ctx || '').replace(/^D_/, '');
const text = (parsed, local) => parsed.textList?.find((t) => t.local === local)?.value ?? null;
const num = (parsed, local, ctx) =>
  parsed.facts.find((f) => f.local === local && f.ctx === ctx)?.value ?? null;
const bool = (v) => (v == null ? null : /^(true|yes)$/i.test(String(v)));
/** Accept ISO or DD-MM-YYYY (BSE renders dates this way) and return ISO. */
const isoDate = (v) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(v || ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : v || null;
};
const pct = (v) => (v == null ? null : Math.round(v * 10000) / 100);

/** Group facts (numeric and text) by normalized context id. */
function groupByCtx(parsed, pattern) {
  const groups = new Map();
  const touch = (ctx) => {
    const k = norm(ctx);
    if (!pattern.test(k)) return null;
    if (!groups.has(k)) groups.set(k, { ctx: k, n: {}, t: {} });
    return groups.get(k);
  };
  for (const f of parsed.facts) {
    const g = touch(f.ctx);
    if (g && !(f.local in g.n)) g.n[f.local] = f.value;
  }
  for (const t of parsed.textList || []) {
    const g = touch(t.ctx);
    if (g && !(t.local in g.t)) g.t[t.local] = t.value;
  }
  return [...groups.values()];
}

// ── Shareholding pattern ────────────────────────────────────────────────

const SHP_CATS = Object.freeze({
  promoterGroup: 'ShareholdingOfPromoterAndPromoterGroup_ContextI',
  promoterIndian: 'Indian_ContextI',
  promoterForeign: 'Foreign_ContextI',
  public: 'PublicShareholding_ContextI',
  institutionsDomestic: 'InstitutionsDomestic_ContextI',
  institutionsForeign: 'InstitutionsForeign_ContextI',
  fpiCat1: 'InstitutionsForeignPortfolioInvestorCategoryOne_ContextI',
  fpiCat2: 'InstitutionsForeignPortfolioInvestorCategoryTwo_ContextI',
  mutualFunds: 'MutualFundsOrUTI_ContextI',
  insurance: 'InsuranceCompanies_ContextI',
  aif: 'AlternativeInvestmentFunds_ContextI',
  banks: 'Banks_ContextI',
  nbfc: 'NBFCsRegisteredWithRBI_ContextI',
  retailUpTo2L: 'ResidentIndividualShareholdersHoldingNominalShareCapitalUpToRsTwoLakh_ContextI',
  hniAbove2L:
    'ResidentIndividualShareholdersHoldingNominalShareCapitalInExcessOfRsTwoLakh_ContextI',
  nri: 'NonResidentIndians_ContextI',
  bodiesCorporate: 'BodiesCorporate_ContextI',
  nonInstitutions: 'NonInstitutions_ContextI',
  total: 'ShareholdingPattern_ContextI',
});

/**
 * Shareholding pattern DTO. Percentages are in percent (61.85), holders are counts.
 * @param {import('./parse').XbrlParseResult} parsed
 * @returns {Object}
 */
function parseShareholding(parsed) {
  const has = (ctx) => parsed.facts.some((f) => f.ctx === ctx);
  if (!has(SHP_CATS.total) && !has(SHP_CATS.promoterGroup))
    return { ok: false, reason: 'no-shareholding-contexts' };
  const cat = {};
  for (const [key, ctx] of Object.entries(SHP_CATS)) {
    const p = num(parsed, 'ShareholdingAsAPercentageOfTotalNumberOfShares', ctx);
    if (p == null) continue;
    cat[key] = {
      pct: pct(p),
      holders: num(parsed, 'NumberOfShareholders', ctx),
      shares: num(parsed, 'NumberOfShares', ctx),
    };
  }
  const flag = (n) => bool(text(parsed, n));
  return {
    ok: true,
    symbol: text(parsed, 'Symbol'),
    isin: text(parsed, 'ISIN'),
    name: text(parsed, 'NameOfTheCompany'),
    asOf: text(parsed, 'DateOfReport'),
    categories: cat,
    promoterPct: cat.promoterGroup?.pct ?? null,
    publicPct: cat.public?.pct ?? null,
    fpiPct: cat.institutionsForeign?.pct ?? null,
    diiPct: cat.institutionsDomestic?.pct ?? null,
    retailPct: cat.retailUpTo2L?.pct ?? null,
    totalHolders: cat.total?.holders ?? null,
    flags: {
      promoterPledged: flag('WhetherAnySharesHeldByPromotersAreEncumberedUnderPledged'),
      promoterEncumberedOther: flag(
        'WhetherAnySharesHeldByPromotersAreEncumberedOtherThanByWayOfPledgeOrNDU'
      ),
      nonDisposalUndertaking: flag(
        'WhetherAnySharesHeldByPromotersAreEncumberedUnderNonDisposalUndertaking'
      ),
      partlyPaidShares: flag('WhetherTheListedEntityHasIssuedAnyPartlyPaidUpShares'),
      convertibles: flag('WhetherTheListedEntityHasIssuedAnyConvertibleSecurities'),
      warrants: flag('WhetherTheListedEntityHasIssuedAnyWarrants'),
      esopOutstanding: flag('WhetherTheListedEntityHasGrantedAnyESOPWhichAreOutstanding'),
      lockedIn: flag('WhetherTheListedEntityHasAnySharesInLockedIn'),
      depositoryReceipts: flag(
        'WhetherTheListedEntityHasAnySharesAgainstWhichDepositoryReceiptsAreIssued'
      ),
    },
  };
}

/**
 * Quarter-on-quarter change between two shareholding DTOs (percentage points).
 * @param {Object} cur
 * @param {Object} prev
 * @returns {{asOf: string, prevAsOf: string, deltas: Record<string, number>, holdersDelta: number|null, notable: string[]}|null}
 */
function diffShareholding(cur, prev) {
  if (!cur?.ok || !prev?.ok) return null;
  const deltas = {};
  for (const [k, v] of Object.entries(cur.categories)) {
    const p = prev.categories[k];
    if (p && v.pct != null && p.pct != null) deltas[k] = Math.round((v.pct - p.pct) * 100) / 100;
  }
  const notable = [];
  const big = {
    promoterGroup: 0.5,
    institutionsForeign: 1,
    institutionsDomestic: 1,
    mutualFunds: 0.5,
    retailUpTo2L: 1,
  };
  for (const [k, thr] of Object.entries(big)) {
    if (deltas[k] != null && Math.abs(deltas[k]) >= thr)
      notable.push(`${k} ${deltas[k] > 0 ? '+' : ''}${deltas[k]}pp`);
  }
  if (cur.flags.promoterPledged && !prev.flags.promoterPledged)
    notable.push('promoter pledge newly disclosed');
  const holdersDelta =
    cur.totalHolders != null && prev.totalHolders != null
      ? cur.totalHolders - prev.totalHolders
      : null;
  return { asOf: cur.asOf, prevAsOf: prev.asOf, deltas, holdersDelta, notable };
}

// ── Voting results ──────────────────────────────────────────────────────

/**
 * Voting-results DTO: meeting metadata and one entry per resolution, with the
 * vote split by shareholder category (PPG promoter group, PI public
 * institutions, PNI public non-institutions) and overall.
 * @param {import('./parse').XbrlParseResult} parsed
 * @returns {Object}
 */
function parseVotingResults(parsed) {
  const metas = groupByCtx(parsed, /^Resolution\d+D?$/);
  if (!metas.length) return { ok: false, reason: 'no-resolution-contexts' };
  const resolutions = metas.map((m) => {
    const n = /(\d+)/.exec(m.ctx)[1];
    const byCat = {};
    let forSum = 0;
    let againstSum = 0;
    for (const cat of ['PPG', 'PI', 'PNI']) {
      const ctx = `Resolution${cat}Total${n}`;
      const votesFor = num(parsed, 'NumberOfVotesInFavour', ctx);
      const votesAgainst = num(parsed, 'NumberOfVotesAgainst', ctx);
      if (votesFor == null && votesAgainst == null) continue;
      forSum += votesFor || 0;
      againstSum += votesAgainst || 0;
      byCat[cat] = {
        votesFor,
        votesAgainst,
        forPct: num(parsed, 'PercentageOfVotesInFavourOnVotesPolled', ctx),
        againstPct: num(parsed, 'PercentageOfVotesAgainstOnVotesPolled', ctx),
      };
    }
    const polled = forSum + againstSum;
    return {
      id: `Resolution${n}`,
      description: m.t.DescriptionOfResolutionConsidered || null,
      type: m.t.TypeOfResolution || null,
      promoterInterested: bool(
        m.t.WhetherPromoterOrPromoterGroupAreInterestedInTheAgendaOrResolution
      ),
      passed: bool(m.t.WhetherResolutionIsPassed),
      votesFor: forSum,
      votesAgainst: againstSum,
      forPct: polled ? Math.round((forSum / polled) * 10000) / 100 : null,
      againstPct: polled ? Math.round((againstSum / polled) * 10000) / 100 : null,
      byCategory: byCat,
    };
  });
  return {
    ok: true,
    symbol: text(parsed, 'Symbol'),
    meetingType: text(parsed, 'TypeOfMeeting'),
    meetingDate: text(parsed, 'DateOfMeeting'),
    scrutinizer: text(parsed, 'NameOfScrutinizerFirm'),
    resolutions,
    failed: resolutions.filter((r) => r.passed === false).map((r) => r.description),
    dissent: resolutions
      .filter(
        (r) =>
          (r.againstPct != null && r.againstPct >= 20) ||
          (r.byCategory.PI?.againstPct != null && r.byCategory.PI.againstPct >= 20)
      )
      .map((r) => ({
        description: r.description,
        againstPct: r.againstPct,
        institutionsAgainstPct: r.byCategory.PI?.againstPct ?? null,
      })),
  };
}

// ── Insider trading (PIT) ───────────────────────────────────────────────

/**
 * Insider-trading disclosure DTO: one entry per disclosed person/trade.
 * @param {import('./parse').XbrlParseResult} parsed
 * @returns {Object}
 */
function parsePit(parsed) {
  const groups = groupByCtx(parsed, /^Disclosure\d+/);
  if (!groups.length) return { ok: false, reason: 'no-disclosure-contexts' };
  const trades = groups.map((g) => ({
    person: g.t.NameOfThePerson || null,
    category: g.t.CategoryOfPerson || null,
    instrument: g.t.TypeOfInstrument || null,
    transaction: g.t.SecuritiesAcquiredOrDisposedTransactionType || null,
    mode: g.t.ModeOfAcquisitionOrDisposal || null,
    from: g.t.DateOfAllotmentAdviceOrAcquisitionOfSharesOrSaleOfSharesSpecifyFromDate || null,
    to: g.t.DateOfAllotmentAdviceOrAcquisitionOfSharesOrSaleOfSharesSpecifyToDate || null,
    exchange: g.t.ExchangeOnWhichTheTradeWasExecuted || null,
    quantity: g.n.SecuritiesAcquiredOrDisposedNumberOfSecurity ?? null,
    valueInr: g.n.SecuritiesAcquiredOrDisposedValueOfSecurity ?? null,
    heldBefore: g.n.SecuritiesHeldPriorToAcquisitionOrDisposalNumberOfSecurity ?? null,
    heldBeforePct: pct(g.n.SecuritiesHeldPriorToAcquisitionOrDisposalPercentageOfShareholding),
    heldAfter: g.n.SecuritiesHeldPostAcquistionOrDisposalNumberOfSecurity ?? null,
    heldAfterPct: pct(g.n.SecuritiesHeldPostAcquistionOrDisposalPercentageOfShareholding),
  }));
  return {
    ok: true,
    symbol: text(parsed, 'Symbol'),
    company: text(parsed, 'NameOfTheCompany'),
    regulation: text(parsed, 'DisclosureUnderRegulation'),
    filedOn: text(parsed, 'DateOfFiling'),
    revised: bool(text(parsed, 'RevisedFilling')),
    trades,
  };
}

// ── Integrated governance report ────────────────────────────────────────

const COMPLIANCE_FLAG =
  /^(TheComposition|TheCommitteeMembers|TheMeetings|ThisReport|WhetherRequirementOfQuorum|WhetherThe\w+HasARegularChairperson|WhetherTheListedEntityHasARegularChairperson)/;

/**
 * Governance DTO: directors, committees, compliance flags that are NOT satisfied.
 * @param {import('./parse').XbrlParseResult} parsed
 * @returns {Object}
 */
function parseGovernance(parsed) {
  const dirs = groupByCtx(parsed, /^CompBOD\d+$/).map((g) => ({
    name: g.t.NameOftheDirector || null,
    din: g.t.DirectorIdentificationNumberOfDirector || null,
    position:
      [
        g.t.PositionOfDirectorInBoardOne,
        g.t.PositionOfDirectorInBoardTwo,
        g.t.PositionOfDirectorInBoardThree,
      ]
        .filter((x) => x && !/^not applicable$/i.test(x))
        .join(' / ') || null,
    status: g.t.CurrentStatusDirector || null,
    disqualified: bool(g.t.WhetherTheDirectorIsDisqualified),
    appointed: g.t.DateOfAppointmentOfDirector || null,
    reappointed: g.t.DateOfReappointmentOfDirector || null,
  }));
  if (!dirs.length && !(parsed.textList || []).some((t) => /Composition/.test(t.local))) {
    return { ok: false, reason: 'no-governance-content' };
  }
  const committees = groupByCtx(parsed, /^CompComit\d+$/).map((g) => ({
    name: g.t.NameOfCommittee || g.t.NameOfOtherCommittee || null,
    member: g.t.NameOfCommitteeMembers || null,
    role: g.t.PositionOfDirectorInCommitteeTwo || g.t.PositionOfDirectorInCommitteeOne || null,
  }));
  const nonCompliant = [];
  for (const t of parsed.textList || []) {
    if (norm(t.ctx) !== 'MainD') continue;
    if (COMPLIANCE_FLAG.test(t.local) && /^(false|no)$/i.test(t.value)) nonCompliant.push(t.local);
  }
  const cyber = text(
    parsed,
    'WhetherAsPerSubRegulation2baOfRegulation27OfSEBILODRThereHasBeenCyberSecurityIncidentOrBreach'
  );
  const cyberKey = (parsed.textList || []).find((t) => /CyberSecurityInc/.test(t.local));
  return {
    ok: true,
    symbol: text(parsed, 'Symbol'),
    quarterEnd: text(parsed, 'DateOfEndOfReportingPeriod'),
    directors: dirs,
    committees,
    boardSize: dirs.length,
    independentCount: dirs.filter((d) => /independent/i.test(d.position || '')).length,
    nonCompliantFlags: nonCompliant.filter((n) => !/CyberSecurity/.test(n)),
    cyberIncident: cyberKey ? bool(cyberKey.value) : bool(cyber),
    signatory: text(parsed, 'NameOfSignatory'),
  };
}

// ── BRSR (Business Responsibility and Sustainability Report) ────────────

/** Numeric BRSR elements (context `DCYMain` = reported year, `DPYMain` = previous year), grouped for the DTO. */
const BRSR_METRICS = Object.freeze({
  profile: {
    turnoverInr: 'Turnover',
    netWorthInr: 'NetWorth',
    exportsPct: 'PercentageOfContributionOfExportsInTheTotalTurnoverOfTheEntity',
    statesServed: 'NumberOfStatesWhereMarketServedByTheEntity',
    countriesServed: 'NumberOfCountriesWhereMarketServedByTheEntity',
  },
  governance: {
    boardSize: 'TotalNumberOfBoardOfDirectors',
    femaleDirectors: 'NumberOfFemaleBoardOfDirectors',
    femaleDirectorsPct: 'PercentageOfFemaleBoardOfDirectors',
    disciplinaryDirectors: 'NumberOfDirectorsAgainstWhomDisciplinaryActionWasTaken',
    disciplinaryKmp: 'NumberOfKMPsAgainstWhomDisciplinaryActionWasTaken',
    conflictComplaintsDirectors:
      'NumberOfComplaintsReceivedInRelationToIssuesOfConflictOfInterestOfTheDirectors',
    relatedPartyPurchasesPct:
      'PercentageOfPurchasesFromRelatedPartiesInTotalPurchasesForShareOfRelatedPartyTransactions',
    relatedPartySalesPct:
      'PercentageOfSalesToRelatedPartiesInTotalSalesForShareOfRelatedPartyTransactions',
  },
  social: {
    poshComplaints: 'TotalComplaintsReportedUnderSexualHarassmentOfWomenAtWorkplace',
    femaleWagesPct: 'PercentageOfGrossWagesPaidToFemaleToTotalWagesPaid',
    wellbeingSpendPct:
      'PercentageOfCostIncurredOnWellBeingMeasuresWithRespectToTotalRevenueOfTheCompany',
    affectedEmployees: 'TotalNumberOfAffectedEmployees',
    affectedWorkers: 'TotalNumberOfAffectedWorkers',
  },
  energy: {
    renewable: 'TotalEnergyConsumedFromRenewableSources',
    nonRenewable: 'TotalEnergyConsumedFromNonRenewableSources',
    total: 'TotalEnergyConsumedFromRenewableAndNonRenewableSources',
    intensityPerRupee: 'EnergyIntensityPerRupeeOfTurnover',
  },
  water: {
    withdrawal: 'TotalVolumeOfWaterWithdrawal',
    consumption: 'TotalVolumeOfWaterConsumption',
    discharge: 'TotalWaterDischargedInKilolitres',
    intensityPerRupee: 'WaterIntensityPerRupeeOfTurnover',
  },
  emissions: {
    scope1: 'TotalScope1Emissions',
    scope2: 'TotalScope2Emissions',
    nox: 'NOx',
    sox: 'SOx',
    particulateMatter: 'ParticulateMatter',
  },
  waste: {
    generated: 'TotalWasteGenerated',
    recovered: 'TotalWasteRecovered',
    hazardous: 'OtherHazardousWaste',
    plastic: 'PlasticWaste',
  },
});

const ratio = (a, b) =>
  a == null || b == null || b === 0 ? null : Math.round((a / b) * 10000) / 10000;
const delta = (c, p) =>
  c == null || p == null || p === 0 ? null : Math.round(((c - p) / Math.abs(p)) * 10000) / 100;

/**
 * BRSR DTO: essential-indicator metrics for the reported and previous year plus derived
 * ratios (renewable share, Scope 1+2 total) and year-on-year changes in percent.
 * Values are AS FILED: companies mix units (e.g. waste in kg vs tonnes), so cross-company
 * comparison needs the PDF's stated unit; `unitWarnings` flags internal inconsistencies.
 * @param {import('./parse').XbrlParseResult} parsed
 * @returns {Object}
 */
function parseBrsr(parsed) {
  const has = parsed.facts.some((f) => f.ctx === 'DCYMain');
  if (!has) return { ok: false, reason: 'no-brsr-contexts' };
  const pick = (ctx) => {
    const out = {};
    for (const [grp, m] of Object.entries(BRSR_METRICS)) {
      out[grp] = {};
      for (const [k, el] of Object.entries(m)) out[grp][k] = num(parsed, el, ctx);
    }
    return out;
  };
  const cur = pick('DCYMain');
  const prev = pick('DPYMain');
  const derive = (d) => ({
    renewableEnergyShare: ratio(d.energy.renewable, d.energy.total),
    scope1And2:
      d.emissions.scope1 == null && d.emissions.scope2 == null
        ? null
        : (d.emissions.scope1 || 0) + (d.emissions.scope2 || 0),
    wasteRecoveryRate: ratio(d.waste.recovered, d.waste.generated),
  });
  const dc = derive(cur);
  const dp = derive(prev);
  const yoy = {};
  for (const [grp, m] of Object.entries(BRSR_METRICS))
    for (const k of Object.keys(m)) {
      const v = delta(cur[grp][k], prev[grp][k]);
      if (v != null) yoy[`${grp}.${k}`] = v;
    }
  yoy['emissions.scope1And2'] = delta(dc.scope1And2, dp.scope1And2);
  const unitWarnings = [];
  if (
    cur.waste.recovered != null &&
    cur.waste.generated != null &&
    cur.waste.recovered > cur.waste.generated
  )
    unitWarnings.push('waste recovered exceeds waste generated (mixed units or filing error)');
  if (
    cur.energy.renewable != null &&
    cur.energy.nonRenewable != null &&
    cur.energy.total != null &&
    Math.abs(cur.energy.renewable + cur.energy.nonRenewable - cur.energy.total) >
      0.01 * cur.energy.total
  )
    unitWarnings.push('energy renewable + non-renewable != total');
  if (
    cur.waste.generated != null &&
    cur.waste.generated > 0 &&
    cur.waste.recovered != null &&
    cur.waste.generated / Math.max(cur.waste.recovered, 1) > 1e4
  )
    unitWarnings.push('waste generated is > 10,000x waste recovered (likely mixed kg/tonne units)');
  return {
    ok: true,
    symbol: text(parsed, 'NSESymbol'),
    isin: text(parsed, 'ISIN'),
    name: text(parsed, 'NameOfTheCompany'),
    fyStart: isoDate(text(parsed, 'DateOfStartOfFinancialYear')),
    fyEnd: isoDate(text(parsed, 'DateOfEndOfFinancialYear')),
    boundary: text(parsed, 'ReportingBoundary'),
    assured: /^(true|yes)/i.test(
      String(text(parsed, 'WhetherTheCompanyHasUndertakenAssessmentOrAssuranceOfTheBRSRCore') || '')
    ),
    current: { ...cur, derived: dc },
    previous: { ...prev, derived: dp },
    yoyPct: yoy,
    unitWarnings,
  };
}

module.exports = {
  parseBrsr,
  BRSR_METRICS,
  parseShareholding,
  diffShareholding,
  parseVotingResults,
  parsePit,
  parseGovernance,
  SHP_CATS,
};
