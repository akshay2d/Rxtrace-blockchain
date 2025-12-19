-- Add company_id column to packing_rules table
ALTER TABLE packing_rules 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Make sku_id nullable (rules are templates, not SKU-specific)
ALTER TABLE packing_rules 
ALTER COLUMN sku_id DROP NOT NULL;

-- Update unique constraint to include company_id instead of just sku_id
ALTER TABLE packing_rules 
DROP CONSTRAINT IF EXISTS packing_rules_sku_id_version_key;

-- Add new unique constraint: one rule name per company per version
ALTER TABLE packing_rules 
ADD CONSTRAINT packing_rules_company_sku_version_key 
UNIQUE (company_id, sku_id, version);

-- Add index for company_id lookups
CREATE INDEX IF NOT EXISTS idx_packing_rules_company_id 
ON packing_rules(company_id);

-- Backfill company_id for existing rules (optional - assigns to first company)
-- UPDATE packing_rules 
-- SET company_id = (SELECT id FROM companies LIMIT 1) 
-- WHERE company_id IS NULL;
