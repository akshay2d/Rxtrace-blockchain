/**
 * GS1 Roundtrip Validation Tests (JavaScript version)
 * 
 * This is a simplified JavaScript version that can run without TypeScript compilation.
 * For full tests, use the TypeScript version: scripts/test-gs1-roundtrip.ts
 * 
 * Run with: node scripts/test-gs1-roundtrip.js
 */

// Note: This test requires TypeScript compilation or tsx to run
// For now, use the TypeScript version: scripts/test-gs1-roundtrip.ts
// Or compile first: tsc scripts/test-gs1-roundtrip.ts

console.log('⚠️  This test requires TypeScript. Please use:');
console.log('   npm run test:gs1:ts');
console.log('   Or: npx tsx scripts/test-gs1-roundtrip.ts\n');
process.exit(1);

// The following would work if TypeScript is compiled:
// const { generateCanonicalGS1, normalizeGS1Payload, compareGS1Payloads } = require('../lib/gs1Canonical');
// const { parseGS1 } = require('../lib/parseGS1');

const results = [];

function test(name, fn) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result
        .then(() => {
          results.push({ name, passed: true });
          console.log(`✅ ${name}`);
        })
        .catch((err) => {
          results.push({ name, passed: false, error: err.message });
          console.error(`❌ ${name}: ${err.message}`);
        });
    } else {
      results.push({ name, passed: true });
      console.log(`✅ ${name}`);
    }
  } catch (err) {
    results.push({ name, passed: false, error: err.message });
    console.error(`❌ ${name}: ${err.message}`);
  }
}

async function runTests() {
  console.log('\n🧪 GS1 Roundtrip Validation Tests (JavaScript)\n');
  console.log('='.repeat(60));

  // Test 1: Basic roundtrip
  test('Basic Roundtrip: Generate → Parse', () => {
    const params = {
      gtin: '12345678901234',
      expiry: new Date('2026-01-01'),
      mfgDate: new Date('2025-01-01'),
      batch: 'BATCH123',
      serial: 'SERIAL123',
      mrp: 30.50,
      sku: 'SKU123',
      company: 'TestCo'
    };

    const generated = generateCanonicalGS1(params);
    const parsed = parseGS1(generated);

    if (!parsed.parsed) {
      throw new Error('Failed to parse generated GS1');
    }

    if (parsed.gtin !== params.gtin) {
      throw new Error(`GTIN mismatch: expected ${params.gtin}, got ${parsed.gtin}`);
    }

    if (parsed.batchNo !== params.batch) {
      throw new Error(`Batch mismatch: expected ${params.batch}, got ${parsed.batchNo}`);
    }

    if (parsed.serialNo !== params.serial) {
      throw new Error(`Serial mismatch: expected ${params.serial}, got ${parsed.serialNo}`);
    }
  });

  // Test 2: Mandatory field validation
  test('Mandatory Field Validation', () => {
    try {
      generateCanonicalGS1({
        gtin: '',
        expiry: new Date(),
        mfgDate: new Date(),
        batch: 'B',
        serial: 'S'
      });
      throw new Error('Should have thrown error for empty GTIN');
    } catch (err) {
      if (!err.message.includes('required')) {
        throw new Error(`Wrong error: ${err.message}`);
      }
    }
  });

  // Test 3: Payload normalization
  test('Payload Normalization', () => {
    const params = {
      gtin: '11111111111111',
      expiry: new Date('2025-06-30'),
      mfgDate: new Date('2024-01-01'),
      batch: 'BATCH789',
      serial: 'SERIAL789'
    };

    const generated1 = generateCanonicalGS1(params);
    const generated2 = generateCanonicalGS1(params);

    if (generated1 !== generated2) {
      throw new Error('Same parameters produced different payloads');
    }

    if (!compareGS1Payloads(generated1, generated2)) {
      throw new Error('Payloads should compare as equal');
    }
  });

  // Wait for async tests
  await Promise.all([]);

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test Summary\n');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Total:  ${results.length}\n`);

  if (failed > 0) {
    console.log('Failed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  ❌ ${r.name}: ${r.error}`);
    });
    process.exit(1);
  } else {
    console.log('🎉 All tests passed!\n');
    process.exit(0);
  }
}

// Run tests
runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
