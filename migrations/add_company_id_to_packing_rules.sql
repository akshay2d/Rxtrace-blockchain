-- Add company_id column to packing_rules table
ALTER TABLE packing_rules 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_packing_rules_company_id 
ON packing_rules(company_id);

-- Optionally set a default company for existing rows (use first company)
UPDATE packing_rules 
SET company_id = (SELECT id FROM companies LIMIT 1)
WHERE company_id IS NULL;
