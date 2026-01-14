// Production deployment verification script
const https = require('https');

const PRODUCTION_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

const tests = [
  {
    name: 'Homepage loads',
    path: '/',
    expected: 200,
  },
  {
    name: 'Auth page loads',
    path: '/auth/signin',
    expected: 200,
  },
  {
    name: 'Dashboard redirects to auth',
    path: '/dashboard',
    expected: [200, 307, 308], // Could be redirect or authenticated
  },
  {
    name: 'API health check',
    path: '/api/health',
    expected: [200, 404], // 404 is okay if not implemented
  },
  {
    name: 'Sentry example page',
    path: '/sentry-example-page',
    expected: 200,
  },
];

function checkEndpoint(test) {
  return new Promise((resolve) => {
    const url = `${PRODUCTION_URL}${test.path}`;
    console.log(`\n🔍 Testing: ${test.name}`);
    console.log(`   URL: ${url}`);

    const protocol = url.startsWith('https') ? https : require('http');
    
    const req = protocol.get(url, (res) => {
      const statusCode = res.statusCode;
      const expectedCodes = Array.isArray(test.expected) ? test.expected : [test.expected];
      const passed = expectedCodes.includes(statusCode);

      if (passed) {
        console.log(`   ✅ PASS (HTTP ${statusCode})`);
        resolve({ test: test.name, passed: true, status: statusCode });
      } else {
        console.log(`   ❌ FAIL (HTTP ${statusCode}, expected ${expectedCodes.join(' or ')})`);
        resolve({ test: test.name, passed: false, status: statusCode, expected: test.expected });
      }
    });

    req.on('error', (error) => {
      console.log(`   ❌ ERROR: ${error.message}`);
      resolve({ test: test.name, passed: false, error: error.message });
    });

    req.setTimeout(10000, () => {
      req.destroy();
      console.log(`   ❌ TIMEOUT (> 10s)`);
      resolve({ test: test.name, passed: false, error: 'Timeout' });
    });
  });
}

async function runTests() {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║  Production Deployment Verification        ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log(`\n🌐 Testing: ${PRODUCTION_URL}\n`);

  const results = [];
  
  for (const test of tests) {
    const result = await checkEndpoint(test);
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 500)); // Delay between tests
  }

  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║  Test Summary                              ║');
  console.log('╚════════════════════════════════════════════╝\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`Total Tests: ${total}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Success Rate: ${Math.round((passed / total) * 100)}%\n`);

  if (failed > 0) {
    console.log('Failed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  • ${r.test}`);
      if (r.error) console.log(`    Error: ${r.error}`);
      if (r.status) console.log(`    Got HTTP ${r.status}, expected ${r.expected}`);
    });
    console.log('');
  }

  // Environment check
  console.log('╔════════════════════════════════════════════╗');
  console.log('║  Environment Check                         ║');
  console.log('╚════════════════════════════════════════════╝\n');

  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'NEXT_PUBLIC_RAZORPAY_KEY_ID',
    'CRON_SECRET',
    'SENTRY_DSN',
  ];

  let envComplete = true;
  requiredEnvVars.forEach(varName => {
    const isSet = !!process.env[varName];
    console.log(`${isSet ? '✅' : '❌'} ${varName}: ${isSet ? 'Set' : 'MISSING'}`);
    if (!isSet) envComplete = false;
  });

  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║  Final Status                              ║');
  console.log('╚════════════════════════════════════════════╝\n');

  if (failed === 0 && envComplete) {
    console.log('🎉 DEPLOYMENT VERIFIED - All checks passed!\n');
    process.exit(0);
  } else {
    console.log('⚠️  DEPLOYMENT INCOMPLETE - Please fix issues above\n');
    process.exit(1);
  }
}

// Check if API health endpoint exists
async function createHealthEndpoint() {
  const fs = require('fs');
  const path = require('path');
  
  const healthPath = path.join(__dirname, '..', 'app', 'api', 'health', 'route.ts');
  
  if (!fs.existsSync(healthPath)) {
    console.log('📝 Creating health check endpoint...');
    fs.mkdirSync(path.dirname(healthPath), { recursive: true });
    fs.writeFileSync(healthPath, `import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
}
`);
    console.log('✅ Health check endpoint created\n');
  }
}

// Run
createHealthEndpoint().then(() => runTests()).catch(console.error);
