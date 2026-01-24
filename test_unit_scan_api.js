/**
 * Quick Test Script for Unit Label Scanning API
 * Run with: node test_unit_scan_api.js
 * 
 * This script tests the /api/scan endpoint to verify it works correctly
 * for unit label scanning without authentication.
 */

const API_BASE_URL = 'https://rxtrace.in';
const SCAN_ENDPOINT = `${API_BASE_URL}/api/scan`;

// Test cases
const testCases = [
  {
    name: 'Test 1: Missing raw parameter',
    body: {},
    expectedStatus: 400,
    expectedError: 'Missing raw GS1 payload'
  },
  {
    name: 'Test 2: Invalid GS1 code (no serial/SSCC)',
    body: { raw: 'invalid_code_12345' },
    expectedStatus: 400,
    expectedError: 'Invalid GS1 payload'
  },
  {
    name: 'Test 3: Valid GS1 format but code not in database',
    body: { raw: '010123456789012321ABC123' }, // Example GS1 format
    expectedStatus: 404,
    expectedError: 'Code not found'
  }
];

async function testEndpoint() {
  console.log('🧪 Testing /api/scan Endpoint\n');
  console.log('='.repeat(60));
  
  for (const testCase of testCases) {
    console.log(`\n${testCase.name}`);
    console.log('-'.repeat(60));
    
    try {
      const response = await fetch(SCAN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testCase.body)
      });
      
      const data = await response.json();
      
      console.log(`Status Code: ${response.status}`);
      console.log(`Response:`, JSON.stringify(data, null, 2));
      
      // Verify expected status
      if (response.status === testCase.expectedStatus) {
        console.log('✅ Status code matches expected');
      } else {
        console.log(`❌ Expected status ${testCase.expectedStatus}, got ${response.status}`);
      }
      
      // Verify expected error message
      if (testCase.expectedError && data.error) {
        if (data.error.includes(testCase.expectedError) || 
            data.error === testCase.expectedError) {
          console.log('✅ Error message matches expected');
        } else {
          console.log(`⚠️  Error message differs: "${data.error}"`);
        }
      }
      
      // Check if no auth is required (should work without Authorization header)
      if (response.status !== 401 && response.status !== 403) {
        console.log('✅ No authentication required (as expected)');
      } else {
        console.log('❌ Authentication required (unexpected for unit scans)');
      }
      
    } catch (error) {
      console.log(`❌ Request failed: ${error.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n📝 Notes:');
  console.log('- To test with a real unit label, replace testCase.body.raw with actual GS1 code');
  console.log('- Valid unit labels should return: { success: true, level: "unit", data: {...} }');
  console.log('- All unit scans should work without Authorization header');
}

// Run tests
testEndpoint().catch(console.error);
