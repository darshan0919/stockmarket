const { loadEnv } = require('./packages/jobs-runtime/lib/env');
loadEnv();
const { stockscans } = require('./stock-api');
const ssUrls = process.argv.slice(2);
ssUrls.forEach((u) => console.log(u, '->', stockscans.s3PdfUrl(u)));
