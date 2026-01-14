// Test Razorpay authentication with current .env.local credentials
require('dotenv').config({ path: '.env.local' });

const Razorpay = require('razorpay');

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

console.log('=== Razorpay Authentication Test ===\n');
console.log('Key ID:', keyId);
console.log('Key ID length:', keyId?.length);
console.log('Key ID starts with:', keyId?.substring(0, 10) + '...');
console.log('Secret length:', keySecret?.length);
console.log('Secret starts with:', keySecret?.substring(0, 5) + '...');
console.log('');

if (!keyId || !keySecret) {
  console.error('❌ Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET in .env.local');
  process.exit(1);
}

// Check for common issues
if (keyId.includes(' ') || keySecret.includes(' ')) {
  console.warn('⚠️  WARNING: Key or secret contains spaces - this may cause auth failures');
}

if (keyId.startsWith('rzp_test_')) {
  console.log('ℹ️  Using TEST mode keys');
} else if (keyId.startsWith('rzp_live_')) {
  console.log('ℹ️  Using LIVE mode keys');
} else {
  console.warn('⚠️  WARNING: Key ID format looks unusual (should start with rzp_test_ or rzp_live_)');
}

const razorpay = new Razorpay({
  key_id: keyId,
  key_secret: keySecret,
});

console.log('\nTesting API call (creating a test order for ₹1)...\n');

razorpay.orders.create({
  amount: 100, // 100 paise = ₹1
  currency: 'INR',
  receipt: 'test_receipt_' + Date.now(),
})
.then((order) => {
  console.log('✅ SUCCESS! Razorpay authentication working.');
  console.log('Order created:', order.id);
  console.log('Status:', order.status);
})
.catch((err) => {
  console.error('❌ FAILED:', err.message || err);
  
  if (err.statusCode === 401) {
    console.error('\n=== 401 Authentication Failed ===');
    console.error('Possible causes:');
    console.error('1. Key ID and Secret do not match (from different accounts)');
    console.error('2. Secret was regenerated in Razorpay Dashboard');
    console.error('3. Mode mismatch (Live key with Test secret or vice versa)');
    console.error('4. Extra whitespace in key or secret');
    console.error('\nFix: Go to Razorpay Dashboard → Settings → API Keys');
    console.error('Make sure you copy both Key ID and Secret from the SAME row');
  }
  
  if (err.error) {
    console.error('\nRazorpay error details:', JSON.stringify(err.error, null, 2));
  }
});
