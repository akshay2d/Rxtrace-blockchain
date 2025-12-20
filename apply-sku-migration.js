// Apply SKU table migration using Prisma raw SQL
require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function applyMigration() {
  try {
    console.log('📦 Applying SKU table migration...\n');

    // Create SKUs table if it doesn't exist
    console.log('1. Creating skus table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS public.skus (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
        sku_code text NOT NULL,
        sku_name text NOT NULL,
        created_at timestamptz DEFAULT now() NOT NULL,
        updated_at timestamptz DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT skus_company_id_sku_code_key UNIQUE (company_id, sku_code)
      )
    `;
    console.log('✓ Done\n');

    // Drop category column if exists
    console.log('2. Removing category column...');
    await prisma.$executeRawUnsafe('ALTER TABLE public.skus DROP COLUMN IF EXISTS category');
    console.log('✓ Done\n');

    // Drop description column if exists
    console.log('3. Removing description column...');
    await prisma.$executeRawUnsafe('ALTER TABLE public.skus DROP COLUMN IF EXISTS description');
    console.log('✓ Done\n');

    // Create indexes
    console.log('4. Creating indexes...');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS skus_company_id_idx ON public.skus(company_id)');
    try {
      await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS skus_company_active_idx ON public.skus(company_id) WHERE deleted_at IS NULL');
    } catch (e) {
      console.log('  ⚠ Skipping conditional index (deleted_at column may not exist yet)');
    }
    console.log('✓ Done\n');

    console.log('✅ Migration applied successfully!');
    console.log('\nThe skus table now has the correct structure:');
    console.log('  - id (uuid)');
    console.log('  - company_id (uuid)');
    console.log('  - sku_code (text)');
    console.log('  - sku_name (text)');
    console.log('  - created_at (timestamptz)');
    console.log('  - updated_at (timestamptz)');
    console.log('  - deleted_at (timestamptz)');
    console.log('\n✓ Removed: category and description columns');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

applyMigration();

