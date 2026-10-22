'use strict';

/**
 * runtime.js — the small I/O glue the quarterly-result-extractor history-pack CLIs share:
 * a job-attributed Stockscans client, the company's document list + resolved target quarter,
 * and cached transcript text. Every function takes its dependencies explicitly
 * (jobName, client), so two concurrent runs never share an "active" job (conventions §23).
 */

const { stockscans } = require('@stock/api');
const { sanitizeCompanyId } = require('@stock/api/utils/companyId');
const pdfText = require('../announcementPdfText');
const { resolveResultMode } = require('./period');

/**
 * The shared Stockscans client, attributed to `jobName` for API-usage accounting.
 * @param {string} jobName
 * @returns {Object}
 */
function stockscansFor(jobName) {
  stockscans.setJobName(jobName);
  return stockscans;
}

/**
 * Document list + target quarter/mode for one company (one documents() call).
 * @param {Object} client StockscansClient
 * @param {string} rawCompanyId
 * @param {{targetQuarter?: string, date?: string, now?: Date}} [opts]
 * @returns {Promise<{companyId: string, docList: Array<Object>, mode: string, targetQuarter: string, latestFiledQuarter: string|null}>}
 */
async function resolveCompany(client, rawCompanyId, opts = {}) {
  const companyId = sanitizeCompanyId(rawCompanyId);
  const { documents } = await client.documents(companyId);
  const docList = documents || [];
  return { companyId, docList, ...resolveResultMode(docList, opts) };
}

/**
 * Full transcript text (cached in announcement-pdf-text; fetched once per document).
 * @param {Object} client
 * @param {string} companyId
 * @param {{ssUrl: string, date: string}} doc
 * @returns {Promise<{text: string, chars: number, scanned: boolean, error?: string}>}
 */
function transcriptText(client, companyId, doc) {
  return pdfText.fetchText(companyId, doc.ssUrl, String(doc.date), { client });
}

module.exports = { stockscansFor, resolveCompany, transcriptText };
