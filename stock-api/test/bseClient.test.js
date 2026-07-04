'use strict';

jest.mock('../src/http/bseHttp');
const bseHttp = require('../src/http/bseHttp');
const { BseClient, parseBseSmartSearchHtml } = require('../src/clients/BseClient');

describe('parseBseSmartSearchHtml', () => {
  test('extracts symbol + scrip code from BSE search HTML', () => {
    const html =
      "<li onclick=\"liclick('500325','RELIANCE')\">" +
      '<span>RELIANCE Reliance Industries Ltd</span></li>' +
      "<li onclick=\"liclick('532540','TCS')\">" +
      '<span>TCS Tata Consultancy Services Ltd</span></li>';
    const out = parseBseSmartSearchHtml(html);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ symbol: 'RELIANCE', bse_scrip_code: '500325' });
    expect(out[1]).toMatchObject({ symbol: 'TCS', bse_scrip_code: '532540' });
  });

  test('returns [] for empty/garbage input', () => {
    expect(parseBseSmartSearchHtml('')).toEqual([]);
    expect(parseBseSmartSearchHtml('<div>nothing</div>')).toEqual([]);
  });
});

describe('BseClient.getScripCode', () => {
  const bse = new BseClient();
  beforeEach(() => jest.resetAllMocks());

  test('extracts scrip code from a smart-search response', async () => {
    bseHttp.bseGetText.mockResolvedValue({
      data:
        "<li ng-click=\"liclick('500325','RELIANCE INDUSTRIES LTD')\"><span>" +
        '<strong>RELIANCE</strong>&nbsp;&nbsp;&nbsp;INE002A01018&nbsp;&nbsp;&nbsp;500325</span></li>',
    });
    expect(await bse.getScripCode('RELIANCE')).toBe('500325');
    expect(bseHttp.bseGetText).toHaveBeenCalledWith(
      'PeerSmartSearch/w',
      expect.objectContaining({ params: { Type: 'SS', text: 'RELIANCE' } })
    );
  });

  test('matches when input symbol is lowercase, and trims', async () => {
    bseHttp.bseGetText.mockResolvedValue({
      data:
        "<li ng-click=\"liclick('534618','WAAREE RENEWABLE TECH LTD')\"><span>" +
        '<strong>WAAREERTL</strong>&nbsp;INE299N01021&nbsp;534618</span></li>',
    });
    expect(await bse.getScripCode('  waareertl  ')).toBe('534618');
    expect(bseHttp.bseGetText).toHaveBeenCalledWith(
      'PeerSmartSearch/w',
      expect.objectContaining({ params: { Type: 'SS', text: 'WAAREERTL' } })
    );
  });

  test('returns null when not found', async () => {
    bseHttp.bseGetText.mockResolvedValue({ data: 'No results found' });
    expect(await bse.getScripCode('NONEXISTENT')).toBeNull();
  });

  test('returns null on transport error (does not throw)', async () => {
    bseHttp.bseGetText.mockRejectedValue(new Error('Network error'));
    expect(await bse.getScripCode('RELIANCE')).toBeNull();
  });
});

describe('BseClient.getSecurityPosition', () => {
  const bse = new BseClient();
  beforeEach(() => jest.resetAllMocks());

  test('normalizes qty/deliverable/delivery%', async () => {
    bseHttp.bseGetJson.mockResolvedValue({
      TradeDate: '27 Jun 2026',
      QtyTraded: '1,23,456',
      DeliverableQty: '50,000',
      PcDQ_TQ: '40.5',
    });
    const pos = await bse.getSecurityPosition('500325');
    expect(pos).toEqual({
      tradeDate: '27 Jun 2026',
      qtyTraded: 123456,
      deliverableQty: 50000,
      deliveryPct: 40.5,
    });
  });
});
