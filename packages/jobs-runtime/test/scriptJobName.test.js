'use strict';

const { resolveJobName } = require('../lib/scriptJobName');

describe('resolveJobName', () => {
  test('falls back to the provided default when nothing else is set', () => {
    expect(resolveJobName('daily-gainers-signal-stockmarket', [], {})).toBe(
      'daily-gainers-signal-stockmarket'
    );
  });

  test('a --job <name> flag overrides the default', () => {
    expect(resolveJobName('default-job', ['node', 'script.js', '--job', 'my-job'], {})).toBe(
      'my-job'
    );
  });

  test('a --job=<name> flag overrides the default', () => {
    expect(resolveJobName('default-job', ['node', 'script.js', '--job=my-job'], {})).toBe(
      'my-job'
    );
  });

  test('STOCKMARKET_JOB_NAME env var takes precedence over the --job flag', () => {
    const env = { STOCKMARKET_JOB_NAME: 'env-job' };
    expect(
      resolveJobName('default-job', ['node', 'script.js', '--job', 'flag-job'], env)
    ).toBe('env-job');
  });

  test('STOCKMARKET_JOB_NAME env var takes precedence over the default', () => {
    const env = { STOCKMARKET_JOB_NAME: 'env-job' };
    expect(resolveJobName('default-job', [], env)).toBe('env-job');
  });

  test('an empty STOCKMARKET_JOB_NAME does not override the flag/default', () => {
    const env = { STOCKMARKET_JOB_NAME: '' };
    expect(resolveJobName('default-job', [], env)).toBe('default-job');
  });
});
