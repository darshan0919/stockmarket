const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

async function extractTextFromPdfs() {
  const pptsDir = path.join(__dirname, '../downloads/stockscans-ppts');
  if (!fs.existsSync(pptsDir)) {
    console.error(`Directory not found: ${pptsDir}`);
    return;
  }

  const files = fs.readdirSync(pptsDir).filter(f => f.endsWith('.pdf'));
  console.log(`Found ${files.length} PDFs to process.`);

  let allInsights = '';

  for (const file of files) {
    const filePath = path.join(pptsDir, file);
    const dataBuffer = fs.readFileSync(filePath);
    
    try {
      const data = await pdf(dataBuffer);
      allInsights += `\n\n=== TEXT FROM ${file} ===\n\n`;
      allInsights += data.text;
    } catch (e) {
      console.error(`Error processing ${file}:`, e.message);
    }
  }

  const outPath = path.join(__dirname, '../downloads/stockscans-ppts-text.txt');
  fs.writeFileSync(outPath, allInsights);
  console.log(`Extracted text written to ${outPath}`);
}

extractTextFromPdfs();
