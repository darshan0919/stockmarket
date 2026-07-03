const fs = require('fs');
const files = [
  'packages/stock-api/src/generators/generateSectorReport.js',
  'packages/stock-api/src/generators/generatePeerPdf.js',
  'packages/stock-api/src/generators/generateConcallPdf.js',
  'packages/stock-api/src/generators/generateGrowthTriggersPdf.js',
  'packages/stock-api/src/generators/generateForensicPdf.js',
  'packages/stock-api/src/generators/generateReport.js',
  'packages/stock-api/src/generators/generateDrhpPdf.js'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  // Remove renderPdf from imports
  content = content.replace(/, renderPdf/, '');
  content = content.replace(/renderPdf, /, '');
  
  // Replace await renderPdf(htmlContent, outputPath, ...) with require('fs').writeFileSync(outputPath, htmlContent, 'utf8');
  content = content.replace(/await renderPdf\(htmlContent,\s*outputPath[^)]*\);/, 
    "require('fs').writeFileSync(outputPath, htmlContent, 'utf8');");
    
  fs.writeFileSync(file, content, 'utf8');
  console.log(`Updated ${file}`);
}
