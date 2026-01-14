// Test Razorpay authentication
// Run with: node scripts/test-razorpay.js

require('dotenv').config({ path: '.env.local' });

const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

console.log('=== Razorpay Configuration Check ===\n');
console.log('Key ID:', keyId ? `${keyId.slice(0, 15)}...` : 'NOT SET');
console.log('Key ID Mode:', keyId?.includes('_test_') ? 'TEST' : keyId?.includes('_live_') ? 'LIVE' : 'UNKNOWN');
console.log('Key Secret:', keySecret ? `SET (${keySecret.length} chars)` : 'NOT SET');
console.log('Secret first 4 chars:', keySecret ? keySecret.slice(0, 4) : 'N/A');
console.log('');

if (!keyId || !keySecret) {
  console.error('❌ Missing credentials! Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET');
  process.exit(1);
}

// Check for whitespace issues
if (keyId !== keyId.trim() || keySecret !== keySecret.trim()) {
  console.warn('⚠️  WARNING: Credentials have leading/trailing whitespace!');
}

const Razorpay = require('razorpay');
const rz = new Razorpay({ key_id: keyId, key_secret: keySecret });

console.log('Testing authentication by creating a test order...\n');

rz.orders.create({
  amount: 100, // 1 INR in paise
  currency: 'INR',
  receipt: 'test_' + Date.now()
}).then(order => {
  console.log('✅ SUCCESS! Razorpay authentication working.');
  console.log('Order ID:', order.id);
  console.log('Status:', order.status);
}).catch(err => {
  console.error('❌ FAILED:', err.message || err);
  if (err.statusCode === 401) {
    console.error('\n🔑 401 Authentication Error - Possible causes:');
    console.error('   1. Key ID and Secret are from different Razorpay accounts');
    console.error('   2. Secret was regenerated in dashboard (old secret invalid)');
    console.error('   3. Mode mismatch (Live key with Test secret or vice versa)');
    console.error('   4. Trailing whitespace in credentials');
    console.error('\n   👉 Go to Razorpay Dashboard > Settings > API Keys');
    console.error('   👉 Make sure you copy secret for key:', keyId);
  }
  if (err.error) {
    console.error('Error details:', JSON.stringify(err.error, null, 2));
  }
});
