const { createConcallPdf } = require('./src/generators/generateConcallPdf.js');
const data = require('/tmp/e2e_concall_data.json');
data.output_path = '/tmp/E2E_concall_report.html';
createConcallPdf(data)
  .then((p) => console.log('DONE', p))
  .catch((e) => {
    console.error('ERR', e);
    process.exit(1);
  });
