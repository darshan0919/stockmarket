'use strict';

const { buildJobReport, markdownToHtml } = require('../lib/jobReportEmail');
const { argValues } = require('../jobReportEmail');

describe('markdownToHtml', () => {
  test('escapes html and renders bullets, headings, tables, bold', () => {
    const h = markdownToHtml('## T <x>\n- **a** & b\n\n| k | v |\n|---|---|\n| 1 | 2 |');
    expect(h).toContain('T &lt;x&gt;');
    expect(h).toContain('<li><b>a</b> &amp; b</li>');
    expect(h).toContain('<th');
    expect(h).toContain('<td');
    expect(h).not.toContain('<x>');
  });
  test('code fences are escaped verbatim; empty input is empty', () => {
    expect(markdownToHtml('```\n<b>\n```')).toContain('&lt;b&gt;');
    expect(markdownToHtml('')).toBe('');
  });
});

describe('buildJobReport', () => {
  test('subject carries status icon, job, title and date', () => {
    const r = buildJobReport({
      job: 'j',
      status: 'failed',
      title: 'boom',
      body: 'x',
      date: '2026-10-14',
    });
    expect(r.subject).toBe('❌ j — boom (2026-10-14)');
    expect(r.html).toContain('FAILED');
  });
  test('empty body still produces a deliverable email; attachments are listed', () => {
    const r = buildJobReport({ job: 'j', date: 'd', attachmentNames: ['a.pdf'] });
    expect(r.html).toContain('no report text');
    expect(r.html).toContain('a.pdf');
  });
  test('rejects missing job / bad status', () => {
    expect(() => buildJobReport({})).toThrow(/job is required/);
    expect(() => buildJobReport({ job: 'j', status: 'meh' })).toThrow(/invalid status/);
  });
});

describe('argValues', () => {
  test('collects repeated flags in both syntaxes', () => {
    expect(argValues('--attach', ['--attach', 'a', '--attach=b', '--x', 'c'])).toEqual(['a', 'b']);
  });
});
