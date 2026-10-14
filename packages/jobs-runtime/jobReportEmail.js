#!/usr/bin/env node
'use strict';

/**
 * jobReportEmail — generic "email this job's output" step for scheduled jobs that have no
 * purpose-built digest. Zero LLM: the agent (or a script) writes the report text, this just
 * renders + sends it to the owner's Gmail with the job's API-usage footer.
 *
 *   yarn job-report-email --job <job-dir-name> [--status ok|partial|failed] [--title "..."]
 *       [--body-file path | --body "text" | (stdin)] [--attach path]... [--to addr] [--env-file path]
 *
 * Exits non-zero when the email was not actually sent (skipped/error) so the job surfaces it.
 */

const fs = require('fs');
const path = require('path');
const { sendHtmlEmail } = require('@stock/cloud-utils');
const { loadEnv, argValue } = require('./lib/env');
const { resolveJobName } = require('./lib/scriptJobName');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { buildJobReport } = require('./lib/jobReportEmail');

/** All values of a repeatable flag (`--attach a --attach b`). */
function argValues(flag, argv = process.argv) {
  const out = [];
  argv.forEach((a, i) => {
    if (a === flag && argv[i + 1]) out.push(argv[i + 1]);
    else if (a.startsWith(`${flag}=`)) out.push(a.slice(flag.length + 1));
  });
  return out;
}

async function main(argv = process.argv) {
  loadEnv(argValue('--env-file', argv));
  const job = resolveJobName('', argv);
  if (!job) throw new Error('--job <name> (or STOCKMARKET_JOB_NAME) is required');

  const bodyFile = argValue('--body-file', argv);
  let body = argValue('--body', argv);
  if (bodyFile) body = fs.readFileSync(bodyFile, 'utf8');
  else if (body == null && !process.stdin.isTTY) body = fs.readFileSync(0, 'utf8');

  const attachments = argValues('--attach', argv).map((p) => {
    if (!fs.existsSync(p)) throw new Error(`attachment not found: ${p}`);
    return { filename: path.basename(p), content: fs.readFileSync(p) };
  });

  const { subject, html } = buildJobReport({
    job,
    status: argValue('--status', argv) || 'ok',
    title: argValue('--title', argv) || undefined,
    body,
    attachmentNames: attachments.map((a) => a.filename),
  });

  const email = await sendHtmlEmail({
    subject,
    htmlBody: html,
    to: argValue('--to', argv) || process.env.DEALS_DIGEST_TO || undefined,
    attachments,
    jobName: job,
  });
  console.log(JSON.stringify({ job, subject, attachments: attachments.length, email }, null, 2));
  if (email.status !== 'sent') process.exitCode = 2;
  return { job, email };
}

if (require.main === module) {
  const jobName = resolveJobName('job-report-email');
  main()
    .catch((e) => {
      console.error('jobReportEmail failed:', e.message);
      process.exitCode = 1;
    })
    .finally(() => apiUsageTracker.flush(jobName));
}

module.exports = { main, argValues };
