/**
 * GS1 Roundtrip Validation Tests
 * 
 * Tests the complete GS1 flow:
 * 1. Generate → Parse (roundtrip validation)
 * 2. Generate → Normalize → Compare
 * 3. Edge cases and error handling
 * 
 * Run with: npx tsx scripts/test-gs1-roundtrip.ts
 * Or compile and run: tsc scripts/test-gs1-roundtrip.ts && node scripts/test-gs1-roundtrip.js
 */

import { generateCanonicalGS1, normalizeGS1Payload, compareGS1Payloads } from '../lib/gs1Canonical';
import { parseGS1 } from '../lib/parseGS1';

// Test results tracking
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

function test(name: string, fn: () => void | Promise<void>) {
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
  } catch (err: any) {
    results.push({ name, passed: false, error: err.message });
    console.error(`❌ ${name}: ${err.message}`);
  }
}

async function runTests() {
  console.log('\n🧪 GS1 Roundtrip Validation Tests\n');
  console.log('=' .repeat(60));

  // Test 1: Basic roundtrip - Generate → Parse
  test('Basic Roundtrip: Generate → Parse', () => {
    const params = {
      gtin: '12345678901234',
      expiry: new Date('2026-01-01'),
      mfgDate: new Date('2025-01-01'),
      batch: 'BATCH123',
      serial: 'SERIAL123',
      mrp: 30.50,
      sku: 'SKU123'
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

  // Test 2: Roundtrip with all optional fields
  test('Roundtrip with All Optional Fields', () => {
    const params = {
      gtin: '98765432109876',
      expiry: '2027-12-31',
      mfgDate: '2026-01-15',
      batch: 'BATCH456',
      serial: 'SERIAL456',
      mrp: 99.99,
      sku: 'PRODUCT-XYZ'
    };

    const generated = generateCanonicalGS1(params);
    const parsed = parseGS1(generated);

    if (!parsed.parsed) {
      throw new Error('Failed to parse generated GS1');
    }

    // Verify all fields
    if (parsed.gtin !== params.gtin) throw new Error('GTIN mismatch');
    if (parsed.batchNo !== params.batch) throw new Error('Batch mismatch');
    if (parsed.serialNo !== params.serial) throw new Error('Serial mismatch');
    if (parsed.skuName !== params.sku) throw new Error('SKU mismatch');
  });

  // Test 3: Payload normalization and comparison
  test('Payload Normalization and Comparison', () => {
    const params = {
      gtin: '11111111111111',
      expiry: new Date('2025-06-30'),
      mfgDate: new Date('2024-01-01'),
      batch: 'BATCH789',
      serial: 'SERIAL789'
    };

    const generated1 = generateCanonicalGS1(params);
    const generated2 = generateCanonicalGS1(params);

    // Should be identical
    if (generated1 !== generated2) {
      throw new Error('Same parameters produced different payloads');
    }

    // Normalize and compare
    const normalized1 = normalizeGS1Payload(generated1);
    const normalized2 = normalizeGS1Payload(generated2);

    if (normalized1 !== normalized2) {
      throw new Error('Normalized payloads should be identical');
    }

    // Compare using compare function
    if (!compareGS1Payloads(generated1, generated2)) {
      throw new Error('Payloads should compare as equal');
    }
  });

  // Test 4: Handle different date formats
  test('Handle Different Date Formats', () => {
    const params1 = {
      gtin: '22222222222222',
      expiry: new Date('2025-12-31'),
      mfgDate: new Date('2024-01-01'),
      batch: 'BATCH001',
      serial: 'SERIAL001'
    };

    const params2 = {
      gtin: '22222222222222',
      expiry: '2025-12-31',
      mfgDate: '2024-01-01',
      batch: 'BATCH001',
      serial: 'SERIAL001'
    };

    const generated1 = generateCanonicalGS1(params1);
    const generated2 = generateCanonicalGS1(params2);

    // Should produce same payload
    if (generated1 !== generated2) {
      throw new Error('Date format should not affect payload');
    }
  });

  // Test 5: Variable-length AI max length validation
  test('Variable-Length AI Max Length Validation', () => {
    const longBatch = 'A'.repeat(21); // Exceeds 20 char limit

    try {
      generateCanonicalGS1({
        gtin: '33333333333333',
        expiry: new Date('2025-01-01'),
        mfgDate: new Date('2024-01-01'),
        batch: longBatch,
        serial: 'SERIAL002'
      });
      throw new Error('Should have thrown error for batch exceeding max length');
    } catch (err: any) {
      if (!err.message.includes('exceeds maximum length')) {
        throw new Error(`Wrong error: ${err.message}`);
      }
      // Expected error
    }
  });

  // Test 6: Mandatory field validation
  test('Mandatory Field Validation', () => {
    const testCases = [
      { field: 'gtin', params: { expiry: new Date(), mfgDate: new Date(), batch: 'B', serial: 'S' } },
      { field: 'expiry', params: { gtin: '12345678901234', mfgDate: new Date(), batch: 'B', serial: 'S' } },
      { field: 'mfgDate', params: { gtin: '12345678901234', expiry: new Date(), batch: 'B', serial: 'S' } },
      { field: 'batch', params: { gtin: '12345678901234', expiry: new Date(), mfgDate: new Date(), serial: 'S' } },
      { field: 'serial', params: { gtin: '12345678901234', expiry: new Date(), mfgDate: new Date(), batch: 'B' } },
    ];

    for (const testCase of testCases) {
      try {
        generateCanonicalGS1(testCase.params as any);
        throw new Error(`Should have thrown error for missing ${testCase.field}`);
      } catch (err: any) {
        if (!err.message.includes('required')) {
          throw new Error(`Wrong error for ${testCase.field}: ${err.message}`);
        }
      }
    }
  });

  // Test 7: GTIN check digit validation
  test('GTIN Check Digit Validation', () => {
    // Invalid GTIN (wrong check digit)
    const invalidGTIN = '12345678901230'; // Last digit should be different

    try {
      generateCanonicalGS1({
        gtin: invalidGTIN,
        expiry: new Date('2025-01-01'),
        mfgDate: new Date('2024-01-01'),
        batch: 'BATCH',
        serial: 'SERIAL'
      });
      throw new Error('Should have thrown error for invalid GTIN check digit');
    } catch (err: any) {
      if (!err.message.includes('check digit')) {
        throw new Error(`Wrong error: ${err.message}`);
      }
    }
  });

  // Test 8: FNC1 handling in payload
  test('FNC1 Handling in Payload', () => {
    const params = {
      gtin: '44444444444444',
      expiry: new Date('2025-01-01'),
      mfgDate: new Date('2024-01-01'),
      batch: 'BATCH',
      serial: 'SERIAL',
      mrp: 50.00,
      sku: 'SKU'
    };

    const generated = generateCanonicalGS1(params);
    const FNC1 = String.fromCharCode(29);

    // Should contain FNC1 after variable-length AIs
    if (!generated.includes(FNC1)) {
      throw new Error('Payload should contain FNC1 separators');
    }

    // Should not end with FNC1
    if (generated.endsWith(FNC1)) {
      throw new Error('Payload should not end with FNC1');
    }

    // Parse should handle FNC1 correctly
    const parsed = parseGS1(generated);
    if (!parsed.parsed) {
      throw new Error('Failed to parse payload with FNC1');
    }
  });

  // Test 9: MRP normalization
  test('MRP Normalization', () => {
    const testCases = [
      { input: 30.5, expected: '30.50' },
      { input: '30.5', expected: '30.50' },
      { input: '30,50', expected: '30.50' },
      { input: '30', expected: '30.00' },
    ];

    for (const testCase of testCases) {
      const params = {
        gtin: '55555555555555',
        expiry: new Date('2025-01-01'),
        mfgDate: new Date('2024-01-01'),
        batch: 'BATCH',
        serial: 'SERIAL',
        mrp: testCase.input
      };

      const generated = generateCanonicalGS1(params);
      const parsed = parseGS1(generated);

      // MRP should be normalized in payload
      if (parsed.mrp !== testCase.expected) {
        throw new Error(`MRP normalization failed: expected ${testCase.expected}, got ${parsed.mrp}`);
      }
    }
  });

  // Test 10: Payload comparison with different formats
  test('Payload Comparison with Different Formats', () => {
    const params = {
      gtin: '66666666666666',
      expiry: new Date('2025-01-01'),
      mfgDate: new Date('2024-01-01'),
      batch: 'BATCH',
      serial: 'SERIAL'
    };

    const machineFormat = generateCanonicalGS1(params);
    
    // Simulate human-readable format (with parentheses)
    const humanReadable = machineFormat
      .replace(/01(\d{14})/g, '(01)$1')
      .replace(/17(\d{6})/g, '(17)$1')
      .replace(/11(\d{6})/g, '(11)$1')
      .replace(/10([^0-9]+)/g, '(10)$1')
      .replace(/21([^0-9]+)/g, '(21)$1');

    // Should compare as equal after normalization
    if (!compareGS1Payloads(machineFormat, humanReadable)) {
      throw new Error('Machine and human-readable formats should compare as equal');
    }
  });

  // Test 11: Edge case - Minimum length values
  test('Edge Case: Minimum Length Values', () => {
    const params = {
      gtin: '77777777777777',
      expiry: new Date('2025-01-01'),
      mfgDate: new Date('2024-01-01'),
      batch: 'A', // Single character
      serial: 'B' // Single character
    };

    const generated = generateCanonicalGS1(params);
    const parsed = parseGS1(generated);

    if (parsed.batchNo !== 'A' || parsed.serialNo !== 'B') {
      throw new Error('Minimum length values not handled correctly');
    }
  });

  // Test 12: Edge case - Maximum length values
  test('Edge Case: Maximum Length Values', () => {
    const params = {
      gtin: '88888888888888',
      expiry: new Date('2025-01-01'),
      mfgDate: new Date('2024-01-01'),
      batch: 'A'.repeat(20), // Exactly 20 chars
      serial: 'B'.repeat(20) // Exactly 20 chars
    };

    const generated = generateCanonicalGS1(params);
    const parsed = parseGS1(generated);

    if (parsed.batchNo?.length !== 20 || parsed.serialNo?.length !== 20) {
      throw new Error('Maximum length values not handled correctly');
    }
  });

  // Wait for all async tests
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
