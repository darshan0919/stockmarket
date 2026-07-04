const fs = require('fs');
const path = require('path');

const REGISTRY_PATH = path.join(__dirname, '../skills/registry.json');
const MANIFEST_PATH = path.join(__dirname, '../skills/registry.manifest.json');

const pyToJsMap = {
  'stock-api/python/fetchers/fetch_documents.py': 'stock-api/src/fetchers/documentsFetcher.js',
  'stock-api/python/fetchers/fetch_announcements.py': 'stock-api/src/fetchers/announcementsFetcher.js',
  'stock-api/python/fetchers/fetch_and_extract.py': 'stock-api/src/fetchers/announcementScanner.js',
  'stock-api/python/generators/generate_concall_pdf.py': 'stock-api/src/generators/generateConcallPdf.js',
  'stock-api/python/generators/generate_forensic_pdf.py': 'stock-api/src/generators/generateForensicPdf.js',
  'stock-api/python/generators/generate_report.py': 'stock-api/src/generators/generateReport.js',
  'stock-api/python/generators/generate_pdf.py': 'stock-api/src/generators/generateGrowthTriggersPdf.js',
  'stock-api/python/generators/generate_credibility_widget.py': 'stock-api/src/generators/generateCredibilityWidget.js',
  'stock-api/python/generators/generate_peer_pdf.py': 'stock-api/src/generators/generatePeerPdf.js',
  'stock-api/python/generators/generate_market_share_html.py': 'stock-api/src/generators/generateMarketShareHtml.js',
  'stock-api/python/generators/generate_sector_report.py': 'stock-api/src/generators/generateSectorReport.js',
  'stock-api/python/generators/generate_drhp_pdf.py': 'stock-api/src/generators/generateDrhpPdf.js',
  'stock-api/python/analyzers/compute_concentration.py': 'stock-api/src/analyzers/computeConcentration.js',
  'stock-api/python/analyzers/run_scan.py': 'stock-api/src/analyzers/runScan.js',
  'stock-api/python/analyzers/scan_catalysts.py': 'stock-api/src/analyzers/scanCatalysts.js',
  'stock-api/python/analyzers/catalyst_rules.py': 'stock-api/src/analyzers/catalystRules.js',
  'stock-api/python/analyzers/parse_tweet_dump.py': 'stock-api/src/analyzers/parseTweetDump.js',
  'stock-api/python/utils/pdf_utils.py': 'stock-api/src/utils/pdfUtils.js',
  'stock-api/python/utils/doc_generator.py': 'stock-api/src/utils/docGenerator.js',
  'stock-api/python/stockscans_client.py': 'stock-api/src/clients/StockscansClient.js',
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
      entry = `stock-api/bin/${skillName}.js`;
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
