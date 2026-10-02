'use strict';

const { parseXbrl, detectResultFamily, compareFacts } = require('../parse');
const { createIssueLog } = require('../issues');

const XML = `<xbrli:xbrl xmlns:xbrli="x">
<xbrli:context id="OneD"><xbrli:entity/><xbrli:period><xbrli:startDate>2026-04-01</xbrli:startDate><xbrli:endDate>2026-06-30</xbrli:endDate></xbrli:period></xbrli:context>
<xbrli:context id="Seg1"><xbrli:entity><xbrli:segment><xbrldi:explicitMember>a</xbrldi:explicitMember></xbrli:segment></xbrli:entity><xbrli:period><xbrli:instant>2026-06-30</xbrli:instant></xbrli:period></xbrli:context>
<in-capmkt:RevenueFromOperations contextRef="OneD" unitRef="INR" decimals="-5">9345700000</in-capmkt:RevenueFromOperations>
<in-capmkt:ChangesInInventories contextRef="OneD" unitRef="INR" decimals="-5">-142400000</in-capmkt:ChangesInInventories>
<in-capmkt:NameOfCompany contextRef="OneD">Acme Ltd</in-capmkt:NameOfCompany>
</xbrli:xbrl>`;

const IX = `<html><ix:nonFraction name='in-capmkt:RevenueFromOperations' ctx='OneD' contextRef='OneD' unitRef='INR' scale='6' decimals='-4' format='x'>2,537.91</ix:nonFraction>
<ix:nonFraction name='in-capmkt:ChangesInInventories' contextRef='OneD' unitRef='INR' scale='6' decimals='-4' sign='-'>3.21</ix:nonFraction>
<ix:nonFraction name="in-capmkt:CostOfMaterialsConsumed" contextRef="OneD" unitRef="INR" scale="6">-</ix:nonFraction>
<ix:nonNumeric name='in-capmkt:NameOfCompany' contextRef='OneD'>Acme  Ltd</ix:nonNumeric></html>`;

describe('parseXbrl', () => {
  it('parses plain XML facts, text facts and contexts', () => {
    const r = parseXbrl(XML);
    expect(r.format).toBe('xml');
    expect(r.facts).toHaveLength(2);
    expect(r.facts[1].value).toBe(-142400000);
    expect(r.text['in-capmkt:NameOfCompany']).toBe('Acme Ltd');
    expect(r.contexts.OneD.start).toBe('2026-04-01');
    expect(r.contexts.Seg1.hasDimensions).toBe(true);
  });

  it('applies scale and sign in iXBRL with mixed quote styles', () => {
    const r = parseXbrl(IX);
    expect(r.format).toBe('ixbrl');
    const by = Object.fromEntries(r.facts.map((f) => [f.local, f.value]));
    expect(by.RevenueFromOperations).toBe(2537910000);
    expect(by.ChangesInInventories).toBe(-3210000);
    expect(by.CostOfMaterialsConsumed).toBe(0);
    expect(r.text['in-capmkt:NameOfCompany']).toBe('Acme Ltd');
  });

  it('reports empty and fact-less documents instead of throwing', () => {
    expect(parseXbrl('').issues).toContain('empty document');
    expect(parseXbrl('<html>error</html>').issues).toContain('no numeric facts found');
    expect(parseXbrl(undefined).facts).toEqual([]);
  });
});

describe('compareFacts', () => {
  it('matches XML and iXBRL renderings of the same values', () => {
    const a = parseXbrl(XML).facts.filter((f) => f.local === 'RevenueFromOperations');
    const b = parseXbrl(IX).facts.filter((f) => f.local === 'RevenueFromOperations');
    const c = compareFacts(a, b, { absTol: 1e8 });
    expect(c.matched).toBe(0);
    expect(c.differing).toHaveLength(1);
    const same = compareFacts(a, a);
    expect(same.matched).toBe(1);
    expect(same.onlyA).toEqual([]);
  });

  it('lists facts present on only one side', () => {
    const a = parseXbrl(XML).facts;
    const b = a.slice(0, 1);
    expect(compareFacts(a, b).onlyA).toEqual(['ChangesInInventories|OneD']);
  });
});

describe('detectResultFamily', () => {
  it.each([
    ['https://x/INTEGRATED_FILING_BANKING_1.xml', 'banking'],
    ['https://x/INTEGRATED_FILING_LI_1.xml', 'life-insurance'],
    ['https://x/INTEGRATED_FILING_NBFC_INDAS_1.xml', 'nbfc'],
    ['https://x/INTEGRATED_FILING_INDAS_1.xml', 'indas'],
    ['IFIndasDuplicateUploadDocument/Integrated_Finance_Ind_As_1.html', 'indas'],
    ['IFNBFCDuplicateUploadDocument/Integrated_Finance_NBFC_1.xml', 'nbfc'],
    ['something.xml', 'unknown'],
  ])('%s -> %s', (u, f) => expect(detectResultFamily(u)).toBe(f));
});

describe('createIssueLog', () => {
  it('requires a runId and validates category and severity', () => {
    expect(() => createIssueLog()).toThrow();
    const log = createIssueLog('job-a');
    expect(() => log.add({ category: 'NOPE', severity: 'major', message: 'x' })).toThrow();
    expect(() => log.add({ category: 'SIGN', severity: 'huge', message: 'x' })).toThrow();
    log.add({ category: 'MISSING_FIELD', severity: 'major', message: 'm' });
    log.add({ category: 'MISSING_FIELD', severity: 'minor', message: 'n' });
    expect(log.summary().MISSING_FIELD).toEqual({ major: 1, minor: 1, info: 0 });
  });

  it('keeps separate logs isolated', () => {
    const a = createIssueLog('a');
    const b = createIssueLog('b');
    a.add({ category: 'SIGN', severity: 'info', message: 'x' });
    expect(b.all()).toHaveLength(0);
  });
});

describe('detectResultFamily (BSE names)', () => {
  it('classifies BSE banking, GI, NBFC and legacy uploads', () => {
    expect(
      detectResultFamily('IFBankingDuplicateUploadDocument/IFBanking_1_2_IFBanking.html')
    ).toBe('banking');
    expect(detectResultFamily('IFGIDuplicateUploadDocument/IFGI_1_2_IFGI.xml')).toBe(
      'general-insurance'
    );
    expect(detectResultFamily('NBFCUploadDocument/NBFC_1_2.xml')).toBe('indas');
    expect(detectResultFamily('FourOneUploadDocument/NonBanking_1_2.xml')).toBe('indas');
    expect(detectResultFamily('FourOneUploadDocument/Banking_1_2.xml')).toBe('banking');
    expect(detectResultFamily('INTEGRATED_FILING_NONINDAS_1672669_25052026075625_WEB.xml')).toBe(
      'sme'
    );
    expect(detectResultFamily('Integrated_Finance_NBFC_1_2.html')).toBe('nbfc');
    expect(detectResultFamily('INTEGRATED_FILING_INDAS_1_2_WEB.xml')).toBe('indas');
  });
});
