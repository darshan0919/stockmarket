'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { pruneCheckpoints } = require('../scripts/pruneCheckpoints');

describe('pruneCheckpoints', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch (_) {
      // ignore cleanup errors
    }
  });

  it('handles non-existent checkpoints directory gracefully', () => {
    const res = pruneCheckpoints({ root: tmpRoot, dryRun: false });
    expect(res).toEqual({ deletedFiles: 0, bytesFreed: 0 });
  });

  it('keeps the latest N snapshots per collection and prunes older ones', () => {
    const cpDir = path.join(tmpRoot, '_meta', 'checkpoints');
    fs.mkdirSync(cpDir, { recursive: true });

    // Create 4 snapshots for notes
    fs.writeFileSync(path.join(cpDir, 'notes.100.json'), 'note-100');
    fs.writeFileSync(path.join(cpDir, 'notes.200.json'), 'note-200');
    fs.writeFileSync(path.join(cpDir, 'notes.300.json'), 'note-300');
    fs.writeFileSync(path.join(cpDir, 'notes.400.json'), 'note-400');

    // Create 2 snapshots for companies
    fs.writeFileSync(path.join(cpDir, 'companies.150.json'), 'comp-150');
    fs.writeFileSync(path.join(cpDir, 'companies.250.json'), 'comp-250');

    // Create 1 snapshot for reports
    fs.writeFileSync(path.join(cpDir, 'reports.50.json'), 'rep-50');

    // Prune keeping 2 snapshots
    const res = pruneCheckpoints({ root: tmpRoot, keep: 2, dryRun: false });

    expect(res.deletedFiles).toBe(2); // 2 notes files pruned
    expect(fs.existsSync(path.join(cpDir, 'notes.100.json'))).toBe(false);
    expect(fs.existsSync(path.join(cpDir, 'notes.200.json'))).toBe(false);
    expect(fs.existsSync(path.join(cpDir, 'notes.300.json'))).toBe(true);
    expect(fs.existsSync(path.join(cpDir, 'notes.400.json'))).toBe(true);

    // companies had 2, keep=2 -> both kept
    expect(fs.existsSync(path.join(cpDir, 'companies.150.json'))).toBe(true);
    expect(fs.existsSync(path.join(cpDir, 'companies.250.json'))).toBe(true);

    // reports had 1, keep=2 -> kept
    expect(fs.existsSync(path.join(cpDir, 'reports.50.json'))).toBe(true);
  });

  it('defaults to keeping 1 snapshot', () => {
    const cpDir = path.join(tmpRoot, '_meta', 'checkpoints');
    fs.mkdirSync(cpDir, { recursive: true });

    fs.writeFileSync(path.join(cpDir, 'companies.100.json'), 'comp-1');
    fs.writeFileSync(path.join(cpDir, 'companies.200.json'), 'comp-2');
    fs.writeFileSync(path.join(cpDir, 'companies.300.json'), 'comp-3');

    const res = pruneCheckpoints({ root: tmpRoot, dryRun: false });

    expect(res.deletedFiles).toBe(2);
    expect(fs.existsSync(path.join(cpDir, 'companies.100.json'))).toBe(false);
    expect(fs.existsSync(path.join(cpDir, 'companies.200.json'))).toBe(false);
    expect(fs.existsSync(path.join(cpDir, 'companies.300.json'))).toBe(true);
  });

  it('respects dry-run flag without deleting files', () => {
    const cpDir = path.join(tmpRoot, '_meta', 'checkpoints');
    fs.mkdirSync(cpDir, { recursive: true });

    fs.writeFileSync(path.join(cpDir, 'notes.100.json'), 'note-1');
    fs.writeFileSync(path.join(cpDir, 'notes.200.json'), 'note-2');

    const res = pruneCheckpoints({ root: tmpRoot, keep: 1, dryRun: true });

    expect(res.deletedFiles).toBe(1);
    expect(fs.existsSync(path.join(cpDir, 'notes.100.json'))).toBe(true);
    expect(fs.existsSync(path.join(cpDir, 'notes.200.json'))).toBe(true);
  });

  it('sweeps stray .corrupt. and .tmp. files from data root', () => {
    fs.writeFileSync(path.join(tmpRoot, 'notes.json'), '{"valid": true}');
    fs.writeFileSync(path.join(tmpRoot, 'notes.json.corrupt.12345'), 'corrupt-content');
    fs.writeFileSync(path.join(tmpRoot, 'companies.json.tmp.67890'), 'tmp-content');

    const res = pruneCheckpoints({ root: tmpRoot, dryRun: false });

    expect(res.deletedFiles).toBe(2);
    expect(fs.existsSync(path.join(tmpRoot, 'notes.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, 'notes.json.corrupt.12345'))).toBe(false);
    expect(fs.existsSync(path.join(tmpRoot, 'companies.json.tmp.67890'))).toBe(false);
  });
});
