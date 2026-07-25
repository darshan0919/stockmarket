const fs = require('fs');
const { renderPdf } = require('./stock-api/src/utils/pdfRenderer');
(async () => {
  try {
    const html = fs.readFileSync('/tmp/E2E_concall_report.html', 'utf8');
    await renderPdf(
      html,
      'data/concall-analysis/E2E_Networks_Concall_Q1FY27_Deep.pdf',
      'E2E Networks - Concall Deep Dive',
      'E2E Networks Limited | Q1 FY27'
    );
    console.log('OK');
  } catch (e) {
    console.error('ERR', e);
    process.exit(1);
  }
})();
