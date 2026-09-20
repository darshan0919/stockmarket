/**
 * @file extensions/intraday-deal-filter/tests/content.test.js
 * Unit tests for content.js functions in the Intraday Deal Filter extension.
 */

/* eslint-env jest */

const {
  clickLoadAllControls,
  findDealsTables,
  isLoadAllControl,
  AUTOCLICK_ATTR,
} = require('../content');

describe('Intraday Deal Filter — content script tests', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('isLoadAllControl', () => {
    it('returns true for exact "Load All" or "Show All" text', () => {
      const el1 = document.createElement('div');
      el1.textContent = 'Load All';
      expect(isLoadAllControl(el1)).toBe(true);

      const el2 = document.createElement('div');
      el2.textContent = 'Show All';
      expect(isLoadAllControl(el2)).toBe(true);

      const el3 = document.createElement('span');
      el3.textContent = '  load all  ';
      expect(isLoadAllControl(el3)).toBe(true);
    });

    it('rejects "Download all" and download-related controls', () => {
      const downloadSpan = document.createElement('span');
      downloadSpan.className = 'downloadAllText';
      downloadSpan.textContent = 'Download all';
      expect(isLoadAllControl(downloadSpan)).toBe(false);

      const downloadPdf = document.createElement('span');
      downloadPdf.textContent = 'Download all as PDF';
      expect(isLoadAllControl(downloadPdf)).toBe(false);

      const downloadSingle = document.createElement('button');
      downloadSingle.textContent = 'Download';
      expect(isLoadAllControl(downloadSingle)).toBe(false);
    });

    it('rejects non-leaf elements or unrelated buttons', () => {
      const parent = document.createElement('div');
      const child = document.createElement('span');
      child.textContent = 'Load All';
      parent.appendChild(child);
      expect(isLoadAllControl(parent)).toBe(false);

      const reportBtn = document.createElement('div');
      reportBtn.textContent = 'StockScans Reports';
      expect(isLoadAllControl(reportBtn)).toBe(false);
    });
  });

  describe('clickLoadAllControls', () => {
    it('does nothing when no tables are provided', () => {
      document.body.innerHTML = `
        <div class="reportsModal">
          <button type="button" class="downloadAll">
            <span class="downloadAllText">Download all</span>
          </button>
        </div>
      `;
      const btn = document.querySelector('.downloadAll');
      const clickSpy = jest.spyOn(btn, 'click');

      clickLoadAllControls([]);
      clickLoadAllControls(null);

      expect(clickSpy).not.toHaveBeenCalled();
    });

    it('clicks "Load All" inside deals table container and guards against duplicate clicks', () => {
      document.body.innerHTML = `
        <div class="wrapper">
          <div class="tableWrapper">
            <table>
              <thead>
                <tr>
                  <th>Shareholder</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Value</th>
                  <th>Avg Price</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>TRADER A</td><td>BUY</td><td>18 Sep 2026</td><td>₹10 Cr</td><td>100</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="loadMore" role="button">Load All</div>
        </div>
      `;

      const table = document.querySelector('table');
      const loadMore = document.querySelector('.loadMore');
      const clickSpy = jest.spyOn(loadMore, 'click');

      clickLoadAllControls([table]);

      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(loadMore.getAttribute(AUTOCLICK_ATTR)).toBe('1');

      // Second call should not trigger click again
      clickLoadAllControls([table]);
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    it('never triggers "Download all" in StockScans Report modal even if deals tables exist', () => {
      document.body.innerHTML = `
        <div class="wrapper">
          <div class="tableWrapper">
            <table>
              <thead>
                <tr>
                  <th>Shareholder</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Value</th>
                  <th>Avg Price</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>TRADER A</td><td>BUY</td><td>18 Sep 2026</td><td>₹10 Cr</td><td>100</td></tr>
              </tbody>
            </table>
          </div>
          <div class="loadMore" role="button">Load All</div>
        </div>

        <!-- StockScans Report Modal (SOIC x StockScans Reports) -->
        <div class="overlay" role="dialog">
          <div class="sheet">
            <div class="headerActions">
              <button type="button" class="downloadAll" data-tip="Every report below, merged into one PDF" aria-label="Download all as PDF">
                <span class="downloadAllText">Download all</span>
              </button>
            </div>
          </div>
        </div>
      `;

      const table = document.querySelector('table');
      const downloadBtn = document.querySelector('.downloadAll');
      const loadMore = document.querySelector('.loadMore');

      const downloadClickSpy = jest.spyOn(downloadBtn, 'click');
      const loadMoreClickSpy = jest.spyOn(loadMore, 'click');

      clickLoadAllControls([table]);

      expect(loadMoreClickSpy).toHaveBeenCalledTimes(1);
      expect(downloadClickSpy).not.toHaveBeenCalled();
      expect(downloadBtn.hasAttribute(AUTOCLICK_ATTR)).toBe(false);
    });
  });

  describe('findDealsTables', () => {
    it('identifies Bulk/Block Deals tables and ignores other tables', () => {
      document.body.innerHTML = `
        <table id="deals">
          <thead>
            <tr>
              <th>Shareholder</th>
              <th>Type</th>
              <th>Date</th>
              <th>Value</th>
              <th>Avg Price</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
        <table id="financials">
          <thead>
            <tr>
              <th>Period</th>
              <th>Sales</th>
              <th>Expenses</th>
              <th>Net Profit</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      `;

      const found = findDealsTables();
      expect(found).toHaveLength(1);
      expect(found[0].id).toBe('deals');
    });
  });
});
