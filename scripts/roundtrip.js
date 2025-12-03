// scripts/roundtrip.js
// Loads builder from web app and parser from scanner app (explicit absolute paths)

const builder = require('C:/Users/Thinkpad/Rxtrace blockchain/lib/gs1Builder.js');
const parseGs1 = require('C:/Users/Thinkpad/Rxtrace-scanner-android/RxTraceScanner/utils/gs1Parser.js');

const fields = {
  gtin: '1234567890123',
  expiryYYMMDD: '260101',
  mfdYYMMDD: '250101',
  batch: 'BATCH123',
  mrp: '30',
  sku: 'SKU123',
  company: 'MyCo'
};

try {
  const payload = builder.buildGs1ElementString(fields);
  console.log('\n===== GS1 PAYLOAD =====\n');
  console.log(payload);

  const parsed = (typeof parseGs1 === 'function') ? parseGs1(payload) : (parseGs1.default ? parseGs1.default(payload) : null);

  console.log('\n===== PARSED RESULT =====\n');
  console.log(parsed);

} catch (err) {
  console.error('Roundtrip error:', err && (err.stack || err));
  process.exit(1);
}
