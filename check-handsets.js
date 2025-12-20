// Debug script to check handsets in database
require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkHandsets() {
  try {
    console.log('🔍 Checking handsets in database...\n');

    // Get all handsets
    const allHandsets = await prisma.handsets.findMany({
      select: {
        id: true,
        company_id: true,
        device_fingerprint: true,
        status: true,
        high_scan_enabled: true,
        activated_at: true
      }
    });

    console.log(`Total handsets in database: ${allHandsets.length}\n`);
    
    if (allHandsets.length > 0) {
      console.log('Handsets found:');
      allHandsets.forEach((h, i) => {
        console.log(`\n[${i + 1}] Handset:`);
        console.log(`  ID: ${h.id}`);
        console.log(`  Company ID: ${h.company_id}`);
        console.log(`  Device: ${h.device_fingerprint.substring(0, 20)}...`);
        console.log(`  Status: ${h.status}`);
        console.log(`  High Scan: ${h.high_scan_enabled}`);
        console.log(`  Activated: ${h.activated_at}`);
      });
    } else {
      console.log('❌ No handsets found in database!');
      console.log('\nPossible reasons:');
      console.log('  1. Token activation failed silently');
      console.log('  2. Handset was created in different database');
      console.log('  3. Check browser console for activation errors');
    }

    // Check tokens
    console.log('\n\n🎫 Checking tokens...\n');
    const tokens = await prisma.handset_tokens.findMany({
      orderBy: { created_at: 'desc' },
      take: 5
    });
    
    console.log(`Recent tokens (last 5):`);
    tokens.forEach((t, i) => {
      console.log(`\n[${i + 1}] ${t.token}`);
      console.log(`  Company: ${t.company_id}`);
      console.log(`  Used: ${t.used ? '✓ YES' : '✗ NO'}`);
      console.log(`  High Scan: ${t.high_scan}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkHandsets();
