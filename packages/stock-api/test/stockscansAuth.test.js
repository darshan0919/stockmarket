'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { StockscansAuth } = require('../src/auth/stockscansAuth');

describe('StockscansAuth', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.STOCKSCANS_AUTH_TOKEN;
    delete process.env.STOCKSCANS_AUTHTOKEN;
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('explicit token wins over everything', () => {
    process.env.STOCKSCANS_AUTH_TOKEN = 'env-token';
    expect(new StockscansAuth({ token: 'explicit' }).getToken()).toBe('explicit');
  });

  test('canonical env var is used', () => {
    process.env.STOCKSCANS_AUTH_TOKEN = 'canonical';
    expect(new StockscansAuth().getToken()).toBe('canonical');
  });

  test('legacy env var is honored with a warning', () => {
    process.env.STOCKSCANS_AUTHTOKEN = 'legacy';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(new StockscansAuth().getToken()).toBe('legacy');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test('falls back to a .env file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssauth-'));
    const envPath = path.join(dir, '.env');
    fs.writeFileSync(envPath, '# comment\nSTOCKSCANS_AUTH_TOKEN=from-file\n');
    expect(new StockscansAuth({ envPath }).getToken()).toBe('from-file');
  });

  test('throws a helpful error when no token anywhere', () => {
    expect(() => new StockscansAuth().getToken()).toThrow(/STOCKSCANS_AUTH_TOKEN/);
  });

  test('headers carry the authtoken cookie + referer', () => {
    process.env.STOCKSCANS_AUTH_TOKEN = 'tok';
    const h = new StockscansAuth().headers({ referer: 'https://x/y' });
    expect(h.cookie).toBe('authtoken=tok');
    expect(h.referer).toBe('https://x/y');
  });

  test('optional headers omit the cookie (and do not throw) when no token', () => {
    const h = new StockscansAuth().headers({ optional: true });
    expect(h.cookie).toBeUndefined();
    expect(h.origin).toBe('https://www.stockscans.in');
  });

  test('non-optional headers still throw when no token', () => {
    expect(() => new StockscansAuth().headers()).toThrow(/STOCKSCANS_AUTH_TOKEN/);
  });
});
