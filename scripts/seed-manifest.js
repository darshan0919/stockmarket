const fs = require('fs');
const path = require('path');

const REGISTRY_PATH = path.join(__dirname, '../skills/registry.json');
const MANIFEST_PATH = path.join(__dirname, '../skills/registry.manifest.json');

const pyToJsMap = {
  'packages/stock-api/python/fetchers/fetch_documents.py': 'packages/stock-api/src/fetchers/documentsFetcher.js',
  'packages/stock-api/python/fetchers/fetch_announcements.py': 'packages/stock-api/src/fetchers/announcementsFetcher.js',
  'packages/stock-api/python/fetchers/fetch_and_extract.py': 'packages/stock-api/src/fetchers/announcementScanner.js',
  'packages/stock-api/python/generators/generate_concall_pdf.py': 'packages/stock-api/src/generators/generateConcallPdf.js',
  'packages/stock-api/python/generators/generate_forensic_pdf.py': 'packages/stock-api/src/generators/generateForensicPdf.js',
  'packages/stock-api/python/generators/generate_report.py': 'packages/stock-api/src/generators/generateReport.js',
  'packages/stock-api/python/generators/generate_pdf.py': 'packages/stock-api/src/generators/generateGrowthTriggersPdf.js',
  'packages/stock-api/python/generators/generate_credibility_widget.py': 'packages/stock-api/src/generators/generateCredibilityWidget.js',
  'packages/stock-api/python/generators/generate_peer_pdf.py': 'packages/stock-api/src/generators/generatePeerPdf.js',
  'packages/stock-api/python/generators/generate_market_share_html.py': 'packages/stock-api/src/generators/generateMarketShareHtml.js',
  'packages/stock-api/python/generators/generate_sector_report.py': 'packages/stock-api/src/generators/generateSectorReport.js',
  'packages/stock-api/python/generators/generate_drhp_pdf.py': 'packages/stock-api/src/generators/generateDrhpPdf.js',
  'packages/stock-api/python/analyzers/compute_concentration.py': 'packages/stock-api/src/analyzers/computeConcentration.js',
  'packages/stock-api/python/analyzers/run_scan.py': 'packages/stock-api/src/analyzers/runScan.js',
  'packages/stock-api/python/analyzers/scan_catalysts.py': 'packages/stock-api/src/analyzers/scanCatalysts.js',
  'packages/stock-api/python/analyzers/catalyst_rules.py': 'packages/stock-api/src/analyzers/catalystRules.js',
  'packages/stock-api/python/analyzers/parse_tweet_dump.py': 'packages/stock-api/src/analyzers/parseTweetDump.js',
  'packages/stock-api/python/utils/pdf_utils.py': 'packages/stock-api/src/utils/pdfUtils.js',
  'packages/stock-api/python/utils/doc_generator.py': 'packages/stock-api/src/utils/docGenerator.js',
  'packages/stock-api/python/stockscans_client.py': 'packages/stock-api/src/clients/StockscansClient.js',
};

const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));

const manifest = {
  version: registry.version,
  description: registry.description,
  base_url: registry.base_url,
  _note: "Source of truth for generating registry.json and invoker tables.",
  shared: registry.shared.map(p => pyToJsMap[p] || p),
  skills: {}
};

for (const [skillName, skillData] of Object.entries(registry.skills)) {
  const isPythonRemaining = skillName === 'skill-manager' || skillName === 'equity-research-master';
  
  let entry = null;
  let mode = 'bundle';
  let modules = [];
  
  if (skillData.scripts && skillData.scripts.length > 0) {
    if (isPythonRemaining) {
      // Keep as scripts but map them
      skillData.scripts = skillData.scripts.map(p => pyToJsMap[p] || p);
      modules = skillData.scripts;
    } else {
      entry = `packages/stock-api/bin/${skillName}.js`;
      modules = skillData.scripts.map(p => pyToJsMap[p] || p);
      
      // If it uses a PDF generator, mode = clone
      if (modules.some(m => m.includes('Pdf') || m.includes('Report') || m.includes('generate_'))) {
        mode = 'clone';
      } else {
        mode = 'bundle';
      }
    }
  }

  manifest.skills[skillName] = {
    skill_md: skillData.skill_md,
    entry,
    mode: entry ? mode : undefined,
    modules: modules.length > 0 ? modules : undefined,
    scripts: isPythonRemaining ? skillData.scripts : undefined, // Keep for legacy
    references: skillData.references,
    assets: skillData.assets,
    prompts: skillData.prompts,
    templates: skillData.templates,
    shared: skillData.shared ? skillData.shared.map(p => pyToJsMap[p] || p) : undefined,
    aliases: skillData.aliases
  };
}

fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');
console.log("Seeded registry.manifest.json");
