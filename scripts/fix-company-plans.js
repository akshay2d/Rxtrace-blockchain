// Script to fix NULL plan assignments in companies table
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qogfckcwlnrppbvwjsvg.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function fixCompanyPlans() {
  console.log('🔍 Checking companies with NULL or missing subscription_plan...\n');

  // Get all companies
  const { data: companies, error } = await supabase
    .from('companies')
    .select('id, company_name, subscription_plan');

  if (error) {
    console.error('❌ Error fetching companies:', error);
    return;
  }

  console.log(`📊 Total companies: ${companies.length}\n`);

  let fixed = 0;
  for (const company of companies) {
    const currentPlan = company.subscription_plan;
    
    if (!currentPlan || currentPlan === 'null' || currentPlan.trim() === '') {
      console.log(`🔧 Fixing company: ${company.company_name || company.id}`);
      console.log(`   - Setting default plan: starter`);
      
      const { error: updateErr } = await supabase
        .from('companies')
        .update({ subscription_plan: 'starter' })
        .eq('id', company.id);

      if (updateErr) {
        console.error(`   ❌ Failed:`, updateErr.message);
      } else {
        console.log(`   ✅ Fixed\n`);
        fixed++;
      }
    }
  }

  console.log(`\n✅ Complete! Fixed ${fixed} companies.`);
}

fixCompanyPlans().catch(console.error);
