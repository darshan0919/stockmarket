'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

describe('grill-skill CLI and inspection tooling', () => {
  const REPO_ROOT = path.resolve(__dirname, '../..');

  it('runs static inspection on quarterly-result-analysis successfully', () => {
    const inspectScript = path.join(REPO_ROOT, 'scripts/inspect-skill.js');
    const res = spawnSync('node', [inspectScript, 'quarterly-result-analysis', '--json'], {
      encoding: 'utf8',
      cwd: REPO_ROOT,
    });

    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.skillName).toBe('quarterly-result-analysis');
    expect(parsed.progressiveDisclosure.lineCount).toBeGreaterThan(100);
    expect(parsed.reasoningTasksDiscovered).toBeDefined();
    expect(Array.isArray(parsed.reasoningTasksDiscovered)).toBe(true);
  });

  it('runs stock-api/bin/grill-skill.js CLI entry point successfully', () => {
    const binScript = path.join(REPO_ROOT, 'stock-api/bin/grill-skill.js');
    const res = spawnSync('node', [binScript, 'quarterly-result-analysis', '--json', '--no-kb'], {
      encoding: 'utf8',
      cwd: REPO_ROOT,
    });

    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.targetSkill).toBe('quarterly-result-analysis');
    expect(parsed.inspection).toBeDefined();
  });
});
