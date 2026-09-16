'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  walkAllFiles,
  discoverPackageScriptRoots,
  discoverStaticPrefixRoots,
  discoverRunnerInvokedRoots,
  discoverSkillInvokedScriptRoots,
  discoverSkillRegistryRoots,
  discoverUiEntryPoints,
  buildAdjacency,
  multiRootBfs,
  traceApiUsageFromUi,
  analyzeDataDirectory,
  findDataLayerConsumers,
  isNonCodeFileReferenced,
  isBuildOutputPath,
  computeGenericBasenames,
  buildReachabilityReport,
} = require('../reachability-graph');

describe('reachability-graph', () => {
  describe('walkAllFiles', () => {
    // This is the foundational guarantee the whole "did the scanner miss a
    // gitignored scratch directory" class of question depends on: walkAllFiles
    // deliberately walks the real filesystem (fs.readdirSync), NOT `git
    // ls-files`, specifically so gitignored directories (tmp/, recordings/,
    // tmp_capture/, etc.) are still inventoried and can be flagged dead. A
    // regression here (e.g. someone "optimizing" this to skip gitignored
    // paths) would silently blind the entire scanner to exactly the kind of
    // directory this was built to catch — real, once-useful scratch output
    // that outlives the workflow that created it.
    let tmpRoot;

    beforeEach(() => {
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'walkAllFiles-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    test('walks a gitignored top-level directory (not present in git at all) same as a tracked one', () => {
      fs.writeFileSync(path.join(tmpRoot, '.gitignore'), 'scratch_dir/\n');
      fs.mkdirSync(path.join(tmpRoot, 'scratch_dir'));
      fs.writeFileSync(path.join(tmpRoot, 'scratch_dir', 'leftover.json'), '{}');
      fs.mkdirSync(path.join(tmpRoot, 'real_source'));
      fs.writeFileSync(path.join(tmpRoot, 'real_source', 'index.js'), 'module.exports = 1;');

      const files = walkAllFiles(tmpRoot);
      expect(files).toContain('scratch_dir/leftover.json');
      expect(files).toContain('real_source/index.js');
    });

    test('still hard-excludes node_modules/.git/.next/.yarn even though those are also gitignored', () => {
      fs.mkdirSync(path.join(tmpRoot, 'node_modules'));
      fs.writeFileSync(path.join(tmpRoot, 'node_modules', 'pkg.js'), 'x');
      fs.mkdirSync(path.join(tmpRoot, '.next'));
      fs.writeFileSync(path.join(tmpRoot, '.next', 'build.js'), 'x');

      const files = walkAllFiles(tmpRoot);
      expect(files.some((f) => f.startsWith('node_modules/'))).toBe(false);
      expect(files.some((f) => f.startsWith('.next/'))).toBe(false);
    });
  });

  describe('discoverStaticPrefixRoots', () => {
    test('treats every file under skills/**, jobs/Scheduled/**, and jobs/Artifacts/** as a root', () => {
      const allFiles = [
        'skills/development/foo/SKILL.md',
        'skills/development/foo/script.js',
        'jobs/Scheduled/nightly-thing/SKILL.md',
        'jobs/Artifacts/some-dashboard/index.html',
        'jobs/Artifacts/some-dashboard/versions/12345.html',
        'screener-api/src/server.js',
      ];
      const roots = discoverStaticPrefixRoots(allFiles);
      expect(roots.has('skills/development/foo/SKILL.md')).toBe(true);
      expect(roots.has('skills/development/foo/script.js')).toBe(true);
      expect(roots.has('jobs/Scheduled/nightly-thing/SKILL.md')).toBe(true);
      expect(roots.has('jobs/Artifacts/some-dashboard/index.html')).toBe(true);
      expect(roots.has('jobs/Artifacts/some-dashboard/versions/12345.html')).toBe(true);
      expect(roots.has('screener-api/src/server.js')).toBe(false);
    });
  });

  describe('discoverPackageScriptRoots', () => {
    test('resolves package.json script tokens relative to the package dir', () => {
      const allFiles = ['screener-api/package.json', 'screener-api/src/server.js'];
      const fileContentsMap = new Map([
        [
          'screener-api/package.json',
          JSON.stringify({ scripts: { start: 'node src/server.js' } }),
        ],
      ]);
      const roots = discoverPackageScriptRoots(allFiles, fileContentsMap);
      expect(roots.has('screener-api/package.json')).toBe(true);
      expect(roots.has('screener-api/src/server.js')).toBe(true);
    });

    test('resolves root-level script tokens with no package subdir', () => {
      const allFiles = ['package.json', 'scripts/dead-code-scanner.js'];
      const fileContentsMap = new Map([
        [
          'package.json',
          JSON.stringify({ scripts: { 'dead-code:scan': 'node scripts/dead-code-scanner.js' } }),
        ],
      ]);
      const roots = discoverPackageScriptRoots(allFiles, fileContentsMap);
      expect(roots.has('scripts/dead-code-scanner.js')).toBe(true);
    });
  });

  describe('discoverRunnerInvokedRoots', () => {
    test('treats known tool-config basenames as roots regardless of directory depth', () => {
      const allFiles = ['screener-api/jest.config.js', '.eslintrc.js', 'docker-compose.yml'];
      const roots = discoverRunnerInvokedRoots(allFiles);
      expect(roots.has('screener-api/jest.config.js')).toBe(true);
      expect(roots.has('.eslintrc.js')).toBe(true);
      expect(roots.has('docker-compose.yml')).toBe(true);
    });

    test('treats *.test.js and *.spec.js as roots (test-runner discovered)', () => {
      const allFiles = ['cloud-utils/test/emailService.test.js', 'src/foo.spec.js'];
      const roots = discoverRunnerInvokedRoots(allFiles);
      expect(roots.has('cloud-utils/test/emailService.test.js')).toBe(true);
      expect(roots.has('src/foo.spec.js')).toBe(true);
    });

    test('treats .cursor/** as roots (tool-scanned by directory convention)', () => {
      const allFiles = ['.cursor/rules/backend.mdc'];
      const roots = discoverRunnerInvokedRoots(allFiles);
      expect(roots.has('.cursor/rules/backend.mdc')).toBe(true);
    });

    test('does NOT treat a tool-config basename as a root when it sits in a directory that is not repo root or a real workspace', () => {
      // Reproduces a real false-negative: frontend/.env.local and
      // frontend/package-lock.json were being waved through as "tool
      // config" purely by basename match, even though frontend/ has no
      // package.json and is not in WORKSPACE_PACKAGES — it's abandoned
      // node_modules/.next debris, not a real workspace. A basename match
      // must also be scoped to repo root or a real workspace root.
      const allFiles = ['frontend/.env.local', 'frontend/package-lock.json'];
      const roots = discoverRunnerInvokedRoots(allFiles);
      expect(roots.has('frontend/.env.local')).toBe(false);
      expect(roots.has('frontend/package-lock.json')).toBe(false);
    });

    test('still treats a tool-config basename as a root inside a REAL workspace directory (e.g. screener-api/.env)', () => {
      const allFiles = ['screener-api/.env', 'screener-web/package-lock.json'];
      const roots = discoverRunnerInvokedRoots(allFiles);
      expect(roots.has('screener-api/.env')).toBe(true);
      expect(roots.has('screener-web/package-lock.json')).toBe(true);
    });
  });

  describe('discoverSkillInvokedScriptRoots', () => {
    test('treats a `node scripts/x.js` invocation in a SKILL.md as a root for that exact script', () => {
      // Reproduces a real confirmed false positive: scripts/jobs/
      // check_extraction_success.js was flagged dead despite being invoked
      // from 3 active jobs/Scheduled/**/SKILL.md files via exactly this
      // pattern (with shell-substitution flags following the path).
      const allFiles = [
        'jobs/Scheduled/daily-quarterly-result-analysis/SKILL.md',
        'scripts/jobs/check_extraction_success.js',
      ];
      const fileContentsMap = new Map([
        [
          'jobs/Scheduled/daily-quarterly-result-analysis/SKILL.md',
          '1. Execute dependency check: `node scripts/jobs/check_extraction_success.js --collection quarterly-result-documents --date $(date -d yesterday +%Y-%m-%d)`',
        ],
      ]);
      const roots = discoverSkillInvokedScriptRoots(allFiles, fileContentsMap);
      expect(roots.has('scripts/jobs/check_extraction_success.js')).toBe(true);
    });

    test('treats a `python3 scripts/x.py` invocation as a root for that exact script', () => {
      const allFiles = [
        'jobs/Scheduled/daily-guidance-extractor-scan/SKILL.md',
        'scripts/jobs/check_extraction_success.py',
      ];
      const fileContentsMap = new Map([
        [
          'jobs/Scheduled/daily-guidance-extractor-scan/SKILL.md',
          'python3 scripts/jobs/check_extraction_success.py \\\n  --collection guidance-documents',
        ],
      ]);
      const roots = discoverSkillInvokedScriptRoots(allFiles, fileContentsMap);
      expect(roots.has('scripts/jobs/check_extraction_success.py')).toBe(true);
    });

    test('does NOT treat a bare filename mention with no path as a reference (exact path required)', () => {
      // Per the "no loose searching" requirement: a prose sentence that names
      // a script without a resolvable path must not count.
      const allFiles = ['docs/SOMETHING.md', 'scripts/unrelated.js'];
      const fileContentsMap = new Map([
        [
          'docs/SOMETHING.md',
          'See unrelated.js for details on how this works (not a real invocation).',
        ],
      ]);
      const roots = discoverSkillInvokedScriptRoots(allFiles, fileContentsMap);
      expect(roots.has('scripts/unrelated.js')).toBe(false);
    });

    test('does not add a root for a path that does not actually exist in allFiles', () => {
      const allFiles = ['jobs/Scheduled/foo/SKILL.md'];
      const fileContentsMap = new Map([
        ['jobs/Scheduled/foo/SKILL.md', 'Run `node scripts/does-not-exist.js` first.'],
      ]);
      const roots = discoverSkillInvokedScriptRoots(allFiles, fileContentsMap);
      expect(roots.size).toBe(0);
    });

    test('treats `find <dir> -path \'*<path>\'` dynamic-discovery patterns as a reference', () => {
      // Reproduces a real confirmed false positive: volumeRocketingScanner.js
      // is never invoked via a direct `node <path>` call anywhere — it's
      // located dynamically via `find /sessions -path
      // '*packages/jobs-runtime/volumeRocketingScanner.js'` (17 instances of
      // this pattern exist across 12 real SKILL.md files, a real, deliberate
      // convention for locating a script across different sandbox roots).
      const allFiles = [
        'skills/equity-research/volume-rocketing/SKILL.md',
        'packages/jobs-runtime/volumeRocketingScanner.js',
      ];
      const fileContentsMap = new Map([
        [
          'skills/equity-research/volume-rocketing/SKILL.md',
          "SCAN=$(find /sessions -path '*packages/jobs-runtime/volumeRocketingScanner.js' -not -path '*/node_modules/*' 2>/dev/null | head -1)",
        ],
      ]);
      const roots = discoverSkillInvokedScriptRoots(allFiles, fileContentsMap);
      expect(roots.has('packages/jobs-runtime/volumeRocketingScanner.js')).toBe(true);
    });
  });

  describe('discoverSkillRegistryRoots', () => {
    test('extracts exact "entry" and "modules" path fields from skills/registry.json', () => {
      // Reproduces a real confirmed false positive: scripts/metrics/
      // analyze_token_usage.py has no `python3 <path>` invocation anywhere
      // in prose — it's only declared via this registry's structured
      // "entry" field, which is a more exact, more authoritative reference
      // than any regex-on-prose scrape.
      const allFiles = [
        'skills/registry.json',
        'scripts/metrics/analyze_token_usage.py',
        'packages/jobs-runtime/lib/announcementTaxonomy.js',
      ];
      const fileContentsMap = new Map([
        [
          'skills/registry.json',
          JSON.stringify({
            skills: {
              'token-usage-analyzer': {
                entry: 'scripts/metrics/analyze_token_usage.py',
                shared: ['packages/jobs-runtime/lib/announcementTaxonomy.js'],
              },
            },
          }),
        ],
      ]);
      const roots = discoverSkillRegistryRoots(allFiles, fileContentsMap);
      expect(roots.has('scripts/metrics/analyze_token_usage.py')).toBe(true);
      expect(roots.has('packages/jobs-runtime/lib/announcementTaxonomy.js')).toBe(true);
    });

    test('extracts entry/modules from the nested skills[]/classes[]/apis[]/utilities[] shape', () => {
      const allFiles = [
        'skills/registries/workflow-dependencies.json',
        'scripts/metrics/track_invocation.py',
      ];
      const fileContentsMap = new Map([
        [
          'skills/registries/workflow-dependencies.json',
          JSON.stringify({
            skills: [
              {
                name: 'token-usage-analyzer',
                entry: 'scripts/metrics/track_invocation.py',
                modules: ['scripts/metrics/track_invocation.py'],
              },
            ],
          }),
        ],
      ]);
      const roots = discoverSkillRegistryRoots(allFiles, fileContentsMap);
      expect(roots.has('scripts/metrics/track_invocation.py')).toBe(true);
    });

    test('ignores a string that resembles a path but does not resolve to a real file', () => {
      const allFiles = ['skills/registry.json'];
      const fileContentsMap = new Map([
        [
          'skills/registry.json',
          JSON.stringify({ skills: { foo: { entry: 'scripts/does-not-exist.js' } } }),
        ],
      ]);
      const roots = discoverSkillRegistryRoots(allFiles, fileContentsMap);
      expect(roots.size).toBe(0);
    });

    test('does not choke on malformed JSON in a registry file', () => {
      const allFiles = ['skills/registry.json'];
      const fileContentsMap = new Map([['skills/registry.json', '{ not valid json']]);
      expect(() => discoverSkillRegistryRoots(allFiles, fileContentsMap)).not.toThrow();
    });
  });

  describe('discoverUiEntryPoints', () => {
    test('treats screener-web/pages/** as UI roots', () => {
      const allFiles = ['screener-web/pages/watchlist.js', 'screener-web/src/lib/api.js'];
      const { roots } = discoverUiEntryPoints(allFiles);
      expect(roots.has('screener-web/pages/watchlist.js')).toBe(true);
      expect(roots.has('screener-web/src/lib/api.js')).toBe(false);
    });

    test('treats every file under a manifest.json directory as a UI root (browser extension)', () => {
      const allFiles = [
        'extensions/wtt-extension/manifest.json',
        'extensions/wtt-extension/sidepanel.js',
        'extensions/wtt-extension/background.js',
        'stock_documents/manifest.json',
        'stock_documents/NSE_SASKEN_Result.pdf',
      ];
      const { roots, manifestDirs } = discoverUiEntryPoints(allFiles);
      expect(manifestDirs.has('extensions/wtt-extension')).toBe(true);
      expect(roots.has('extensions/wtt-extension/sidepanel.js')).toBe(true);
      expect(roots.has('extensions/wtt-extension/background.js')).toBe(true);
      // stock_documents is NOT under extensions/ or tools/, so its manifest.json
      // does not make it a UI root (it's a data fetch-cache manifest, not an extension).
      expect(manifestDirs.has('stock_documents')).toBe(false);
      expect(roots.has('stock_documents/NSE_SASKEN_Result.pdf')).toBe(false);
    });

    test('treats named standalone dashboards as UI roots', () => {
      const allFiles = ['tools/tasks/index.html'];
      const { roots } = discoverUiEntryPoints(allFiles);
      expect(roots.has('tools/tasks/index.html')).toBe(true);
    });
  });

  describe('multiRootBfs', () => {
    test('reaches transitive dependencies from multiple simultaneous roots', () => {
      const adjacency = new Map([
        ['a.js', new Set(['b.js'])],
        ['b.js', new Set(['c.js'])],
        ['x.js', new Set(['y.js'])],
      ]);
      const reached = multiRootBfs(new Set(['a.js', 'x.js']), adjacency);
      expect(reached.has('a.js')).toBe(true);
      expect(reached.has('b.js')).toBe(true);
      expect(reached.has('c.js')).toBe(true);
      expect(reached.has('x.js')).toBe(true);
      expect(reached.has('y.js')).toBe(true);
      expect(reached.has('z.js')).toBe(false);
    });

    test('records a root-path back to the seeding root for downstream UI-trace checks', () => {
      const adjacency = new Map([['page.js', new Set(['lib.js'])]]);
      const reached = multiRootBfs(new Set(['page.js']), adjacency);
      expect(reached.get('lib.js').rootPath).toEqual(['page.js', 'lib.js']);
    });
  });

  describe('traceApiUsageFromUi', () => {
    test('matches a route via mount-prefix + api-client call, even with zero-static-segment sub-routes', () => {
      // Reproduces the real watchlistRoutes.js case: router.get('/', ...) and
      // router.post('/:symbol', ...) have no static segments of their own to
      // match — the actual signal is the app.use('/api/watchlist', ...) mount
      // prefix matched against a frontend api.get('/watchlist') call.
      const allFiles = [
        'screener-api/src/server.js',
        'screener-api/src/features/watchlist/watchlistRoutes.js',
        'screener-web/src/core/lib/api.js',
      ];
      const fileContentsMap = new Map([
        [
          'screener-api/src/server.js',
          `app.use('/api/watchlist', require('./features/watchlist/watchlistRoutes'));`,
        ],
        [
          'screener-api/src/features/watchlist/watchlistRoutes.js',
          `router.get('/', getWatchlist);\nrouter.post('/:symbol', addToWatchlist);`,
        ],
        [
          'screener-web/src/core/lib/api.js',
          `export const watchlistAPI = { getAll: () => api.get('/watchlist') };`,
        ],
      ]);
      const adjacency = new Map(); // no import edges needed for this check
      const uiRoots = new Set(['screener-web/src/core/lib/api.js']);
      const apiFiles = allFiles.filter((f) => f.startsWith('screener-api/'));

      const verified = traceApiUsageFromUi(apiFiles, uiRoots, fileContentsMap, adjacency, allFiles);
      expect(verified.has('screener-api/src/features/watchlist/watchlistRoutes.js')).toBe(true);
    });

    test('falls back to literal sub-route matching for routes not behind an app.use(require(...)) mount', () => {
      const allFiles = ['screener-api/src/inlineRoutes.js', 'screener-web/pages/health.js'];
      const fileContentsMap = new Map([
        ['screener-api/src/inlineRoutes.js', `router.get('/health-check', handler);`],
        ['screener-web/pages/health.js', `fetch('/api/health-check')`],
      ]);
      const adjacency = new Map();
      const uiRoots = new Set(['screener-web/pages/health.js']);
      const apiFiles = ['screener-api/src/inlineRoutes.js'];

      const verified = traceApiUsageFromUi(apiFiles, uiRoots, fileContentsMap, adjacency, allFiles);
      expect(verified.has('screener-api/src/inlineRoutes.js')).toBe(true);
    });
  });

  describe('findDataLayerConsumers', () => {
    test('identifies a file as a data-layer consumer when it requires db.js directly', () => {
      const allFiles = ['packages/jobs-runtime/lib/db.js', 'packages/jobs-runtime/gainersScanner.js'];
      const fileContentsMap = new Map([
        ['packages/jobs-runtime/lib/db.js', '// the data layer itself'],
        [
          'packages/jobs-runtime/gainersScanner.js',
          `const db = require('./lib/db');`,
        ],
      ]);
      const consumers = findDataLayerConsumers(allFiles, fileContentsMap);
      expect(consumers).toContain('packages/jobs-runtime/gainersScanner.js');
    });

    test('identifies a file as a data-layer consumer via @stock/jobs-runtime workspace import', () => {
      const allFiles = ['packages/jobs-runtime/lib/db.js', 'skills/some-skill/script.js'];
      const fileContentsMap = new Map([
        ['packages/jobs-runtime/lib/db.js', '// the data layer itself'],
        ['skills/some-skill/script.js', `const { saveThesis } = require('@stock/jobs-runtime');`],
      ]);
      const consumers = findDataLayerConsumers(allFiles, fileContentsMap);
      expect(consumers).toContain('skills/some-skill/script.js');
    });
  });

  describe('analyzeDataDirectory', () => {
    test('flags a data/ entry as a hanging node when no data-layer code references its name', () => {
      const allFiles = [
        'data/companies.json',
        'data/tmp_build_gainers_email.js',
        'packages/jobs-runtime/lib/db.js',
      ];
      const fileContentsMap = new Map([
        ['packages/jobs-runtime/lib/db.js', `const SINGLE_FILE_COLLECTIONS = ['companies'];`],
        ['data/companies.json', '{}'],
        ['data/tmp_build_gainers_email.js', '// scratch'],
      ]);
      const { referenced, hangingNodes } = analyzeDataDirectory(allFiles, fileContentsMap, 'data');
      expect(referenced.some((r) => r.entry === 'companies.json')).toBe(true);
      expect(hangingNodes.some((h) => h.entry === 'tmp_build_gainers_email.js')).toBe(true);
    });

    test('treats known db.js infra dirs (.locks, _meta, assets, runs, cache) as always referenced', () => {
      const allFiles = ['data/.locks/foo.lock', 'data/_meta/x.json'];
      const fileContentsMap = new Map();
      const { referenced, hangingNodes } = analyzeDataDirectory(allFiles, fileContentsMap, 'data');
      expect(referenced.some((r) => r.entry === '.locks')).toBe(true);
      expect(referenced.some((r) => r.entry === '_meta')).toBe(true);
      expect(hangingNodes.some((h) => h.entry === '.locks')).toBe(false);
    });

    test('strips corrupt/tmp/local-conflict suffixes before checking the base collection name', () => {
      const allFiles = [
        'data/companies.json.corrupt.1788412184689',
        'packages/jobs-runtime/lib/db.js',
      ];
      const fileContentsMap = new Map([
        ['packages/jobs-runtime/lib/db.js', `const SINGLE_FILE_COLLECTIONS = ['companies'];`],
      ]);
      const { referenced } = analyzeDataDirectory(allFiles, fileContentsMap, 'data');
      expect(referenced.some((r) => r.entry === 'companies.json.corrupt.1788412184689')).toBe(true);
    });

    test('recognizes a full quoted filename-with-extension reference outside db.js-consumer code, via extraReferenceText', () => {
      // Reproduces a real false-positive: data/hft-watchlist.json is written
      // directly by extensions/intraday-deal-filter/popup.js via
      // `chrome.downloads.download({ filename: 'hft-watchlist.json' })` — a
      // Chrome extension, entirely outside the db.js server-side convention.
      // findDataLayerConsumers correctly does not classify popup.js as a
      // data-layer consumer (it isn't one); the fix is searching the broader
      // reachable-code text blob (extraReferenceText) for the literal quoted
      // filename, not loosening db.js-consumer detection itself.
      const allFiles = ['data/hft-watchlist.json', 'packages/jobs-runtime/lib/db.js'];
      const fileContentsMap = new Map([['packages/jobs-runtime/lib/db.js', '// data layer']]);
      const extraReferenceText =
        "chrome.downloads.download({ url, filename: 'hft-watchlist.json', saveAs: false });";
      const { referenced, hangingNodes } = analyzeDataDirectory(
        allFiles,
        fileContentsMap,
        'data',
        extraReferenceText
      );
      expect(referenced.some((r) => r.entry === 'hft-watchlist.json')).toBe(true);
      expect(hangingNodes.some((h) => h.entry === 'hft-watchlist.json')).toBe(false);
    });

    test('recognizes a data/<entry> path segment inside a backtick code span in SKILL.md prose', () => {
      // Reproduces a real false-positive: skills/_shared/conventions.md
      // references `data/agent-outputs/pdfs/<...>.pdf` as a path prefix
      // inside a backtick span, not as a standalone quoted JS string literal.
      const allFiles = ['data/agent-outputs', 'packages/jobs-runtime/lib/db.js'];
      const fileContentsMap = new Map([['packages/jobs-runtime/lib/db.js', '// data layer']]);
      const extraReferenceText =
        'Save the PDF under `data/agent-outputs/pdfs/<CompanyId>_<ReportType>.pdf`.';
      const { referenced, hangingNodes } = analyzeDataDirectory(
        allFiles,
        fileContentsMap,
        'data',
        extraReferenceText
      );
      expect(referenced.some((r) => r.entry === 'agent-outputs')).toBe(true);
      expect(hangingNodes.some((h) => h.entry === 'agent-outputs')).toBe(false);
    });

    test('normalizes markdown-escaped underscores (data/\\_reviews) before matching a data/<entry> path reference', () => {
      // Reproduces a real false-positive: jobs/Scheduled/weekly-insight-review-
      // stockmarket/SKILL.md writes "data/\_reviews/<date>.md" in plain prose
      // (markdown escapes the underscore, no backticks at all).
      const allFiles = ['data/_reviews', 'packages/jobs-runtime/lib/db.js'];
      const fileContentsMap = new Map([['packages/jobs-runtime/lib/db.js', '// data layer']]);
      const extraReferenceText = 'Digest at data/\\_reviews/<YYYY-MM-DD>.md: counts reviewed.';
      const { referenced, hangingNodes } = analyzeDataDirectory(
        allFiles,
        fileContentsMap,
        'data',
        extraReferenceText
      );
      expect(referenced.some((r) => r.entry === '_reviews')).toBe(true);
      expect(hangingNodes.some((h) => h.entry === '_reviews')).toBe(false);
    });

    test('still flags a data/ entry as hanging when its name only appears inside an unrelated word (exact path-segment boundary enforced)', () => {
      // Guards against the path-prefix regex becoming loose: "data/_tmp2" or
      // "metadata/_tmpfoo" must NOT satisfy a reference check for "data/_tmp".
      const allFiles = ['data/_tmp', 'packages/jobs-runtime/lib/db.js'];
      const fileContentsMap = new Map([['packages/jobs-runtime/lib/db.js', '// data layer']]);
      const extraReferenceText = 'see metadata/_tmpfoo/bar and data/_tmp2/baz for unrelated scratch dirs';
      const { hangingNodes } = analyzeDataDirectory(allFiles, fileContentsMap, 'data', extraReferenceText);
      expect(hangingNodes.some((h) => h.entry === '_tmp')).toBe(true);
    });
  });

  describe('isNonCodeFileReferenced', () => {
    test('matches on full relative path or basename', () => {
      const blob = "const p = 'docs/API_REFERENCE.md';";
      expect(isNonCodeFileReferenced('docs/API_REFERENCE.md', blob)).toBe(true);
      expect(isNonCodeFileReferenced('some/other/file.pdf', blob)).toBe(false);
    });

    test('does not treat a generic basename match (manifest.json, SKILL.md, etc.) as a reference', () => {
      // Reproduces a real false-negative: tmp/qra_docs/NSE_AKUMS/manifest.json
      // read as "referenced" purely because some unrelated
      // extensions/foo/manifest.json is mentioned elsewhere in the codebase.
      const genericBasenames = new Set(['manifest.json']);
      const blob = "requires extensions/wtt-extension/manifest.json for the popup";
      expect(isNonCodeFileReferenced('tmp/qra_docs/NSE_AKUMS/manifest.json', blob, genericBasenames)).toBe(
        false
      );
      // A full-path match for a generic basename still counts.
      const blobWithFullPath = "path: 'tmp/qra_docs/NSE_AKUMS/manifest.json'";
      expect(
        isNonCodeFileReferenced(
          'tmp/qra_docs/NSE_AKUMS/manifest.json',
          blobWithFullPath,
          genericBasenames
        )
      ).toBe(true);
    });

    test('trusts a generic-basename file that is the unique file with that basename in its dir, when the dir name and basename both appear verbatim (directory-constant + runtime-joined-filename pattern)', () => {
      // Reproduces a real false-positive: screener-api/prompts/institutional-equity/
      // unified_master.txt is required via
      // `path.join(__dirname, '../prompts/institutional-equity')` (a directory
      // constant) combined with a separate `{ filename: 'unified_master.txt' }`
      // manifest entry — neither the full relative path nor a unique basename
      // ever appears in source, only the directory's own final path segment
      // ("institutional-equity") and the basename, each independently.
      const genericBasenames = new Set(['unified_master.txt']);
      const allFiles = [
        'screener-api/prompts/institutional-equity/unified_master.txt',
        'screener-api/other-prompts/unified_master.txt', // makes the basename generic repo-wide
        'screener-api/src/features/research/researchPipelineController.js',
      ];
      const blob =
        "const PROMPTS_DIR = path.join(__dirname, '../prompts/institutional-equity');\n" +
        "const PROMPTS_MANIFEST = [{ id: 'unified_master', filename: 'unified_master.txt' }];";
      expect(
        isNonCodeFileReferenced(
          'screener-api/prompts/institutional-equity/unified_master.txt',
          blob,
          genericBasenames,
          allFiles
        )
      ).toBe(true);
    });

    test('does NOT trust the directory+basename fallback when the file is not unique in its directory (still exact, not fuzzy)', () => {
      const genericBasenames = new Set(['unified_master.txt']);
      const allFiles = [
        'screener-api/prompts/institutional-equity/unified_master.txt',
        'screener-api/prompts/institutional-equity/unified_master.txt.bak', // different basename, doesn't collide
        'screener-api/other-prompts/unified_master.txt',
      ];
      // Directory name never appears verbatim anywhere — must stay unreferenced.
      const blob = "nothing relevant here";
      expect(
        isNonCodeFileReferenced(
          'screener-api/prompts/institutional-equity/unified_master.txt',
          blob,
          genericBasenames,
          allFiles
        )
      ).toBe(false);
    });

    test('the dir+basename pairing only trusts the CODE subset of reachable text, not prose docs (real false-positive: frontend/.env.local)', () => {
      // Reproduces a real false-positive: a stray, dead frontend/.env.local
      // (frontend/ has no package.json, isn't a yarn workspace, and is pure
      // leftover node_modules/.next debris) read as "referenced" purely
      // because README.md/QUICKSTART.md prose from an old pre-monorepo
      // project layout still says `echo "..." > frontend/.env.local` and the
      // word "frontend" separately appears hundreds of times across
      // unrelated documentation. The dir+basename pairing models a runtime
      // path.join/require() construction, which can only occur in code —
      // so it must ignore prose entirely, even when both tokens are present
      // in the FULL reachable blob.
      const genericBasenames = new Set(['.env.local']);
      const allFiles = [
        'frontend/.env.local',
        'screener-web/.env.local', // makes the basename generic repo-wide
      ];
      // Deliberately does NOT contain the literal full path "frontend/.env.local"
      // (that would short-circuit via the separate, always-trusted exact-path
      // check) — only the two SEPARATE tokens "frontend" and ".env.local",
      // the way real README prose mentions them independently.
      const fullBlob =
        'Some README prose that mentions frontend a lot, and separately says ' +
        'to create a .env.local file as a setup step, but never inside any actual code.';
      const codeBlob = 'const x = 1; // totally unrelated code, nothing path-related here';
      expect(
        isNonCodeFileReferenced('frontend/.env.local', fullBlob, genericBasenames, allFiles, codeBlob)
      ).toBe(false);

      // Sanity check the positive case still works when the pairing DOES
      // appear in real code (e.g. a legitimate path.join(workspaceDir, '.env.local')).
      const codeBlobWithRealUsage =
        "const dir = path.join(__dirname, 'frontend'); fs.readFileSync(path.join(dir, '.env.local'));";
      expect(
        isNonCodeFileReferenced(
          'frontend/.env.local',
          fullBlob,
          genericBasenames,
          allFiles,
          codeBlobWithRealUsage
        )
      ).toBe(true);
    });
  });

  describe('computeGenericBasenames', () => {
    test('flags a basename as generic once it occurs at 2+ distinct paths repo-wide', () => {
      const allFiles = [
        'tmp/qra_docs/NSE_AKUMS/manifest.json',
        'tmp/qra_docs/NSE_GLAND/manifest.json',
        'extensions/wtt-extension/manifest.json',
        'screener-api/src/server.js', // unique basename, not generic
      ];
      const generic = computeGenericBasenames(allFiles);
      expect(generic.has('manifest.json')).toBe(true);
      expect(generic.has('server.js')).toBe(false);
    });
  });

  describe('isBuildOutputPath', () => {
    test('flags coverage output and .next as build artifacts, not source', () => {
      expect(isBuildOutputPath('screener-api/coverage/lcov-report/sorter.js')).toBe(true);
      expect(isBuildOutputPath('screener-web/.next/static/chunk.js')).toBe(true);
      expect(isBuildOutputPath('screener-api/src/server.js')).toBe(false);
      // dist-skills/ (the old bundle-mode skill compile output) was removed
      // 2026-09-16 along with the folder itself and the github-skill-invoker
      // meta-skill that consumed it — no longer a build-output prefix.
      expect(isBuildOutputPath('stock-api/dist-skills/pdf-tools.cjs')).toBe(false);
    });
  });

  describe('buildAdjacency', () => {
    test('builds forward edges only for parseable extensions', () => {
      const allFiles = ['a.js', 'b.js', 'c.pdf'];
      const fileContentsMap = new Map([
        ['a.js', `require('./b.js')`],
        ['b.js', `// no imports`],
        ['c.pdf', `require('./b.js')`], // must be ignored — not a parseable extension
      ]);
      const adjacency = buildAdjacency(allFiles, fileContentsMap);
      expect(adjacency.get('a.js').has('b.js')).toBe(true);
      expect(adjacency.has('c.pdf')).toBe(false);
    });
  });

  describe('buildReachabilityReport — end-to-end gitignored-scratch-directory regression', () => {
    // Full-pipeline reproduction of the exact class of miss this test suite
    // exists to prevent: a completely gitignored, unreferenced top-level
    // scratch directory (the real-world shape of tmp/, recordings/,
    // tmp_capture/ before they were deleted 2026-09-16) must come back as a
    // dead finding from a real run of buildReachabilityReport — not just
    // from the individual unit-tested helper functions in isolation.
    let tmpRoot;

    beforeEach(() => {
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'reachability-e2e-test-'));
      fs.writeFileSync(path.join(tmpRoot, '.gitignore'), 'scratch_output/\n');
      fs.writeFileSync(path.join(tmpRoot, 'package.json'), JSON.stringify({ name: 'fixture', scripts: {} }));

      // A real skill root, so the entry-root machinery has something to work with.
      fs.mkdirSync(path.join(tmpRoot, 'skills', 'demo'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpRoot, 'skills', 'demo', 'SKILL.md'),
        '---\nname: demo\n---\nDoes nothing related to scratch_output.'
      );

      // The gitignored scratch directory — never mentioned anywhere, never
      // imported, never referenced by path or basename in any reachable file.
      fs.mkdirSync(path.join(tmpRoot, 'scratch_output'), { recursive: true });
      fs.writeFileSync(path.join(tmpRoot, 'scratch_output', 'leftover_run_1.json'), '{"data": true}');
      fs.writeFileSync(path.join(tmpRoot, 'scratch_output', 'leftover_run_2.json'), '{"data": true}');
    });

    afterEach(() => {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    test('a gitignored, unreferenced scratch directory is flagged as non-code-dead by a real buildReachabilityReport run', () => {
      const report = buildReachabilityReport(tmpRoot);
      const deadPaths = report.nonCodeDead.map((d) => d.file);
      expect(deadPaths).toContain('scratch_output/leftover_run_1.json');
      expect(deadPaths).toContain('scratch_output/leftover_run_2.json');
    });
  });
});
