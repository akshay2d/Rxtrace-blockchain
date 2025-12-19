-- SKU Master constraints + soft delete (production readiness)

-- 1) Add soft delete column
ALTER TABLE IF EXISTS skus
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2) Ensure sku_code and sku_name are not null (if columns exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='skus' AND column_name='sku_code'
  ) THEN
    EXECUTE 'ALTER TABLE skus ALTER COLUMN sku_code SET NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='skus' AND column_name='sku_name'
  ) THEN
    EXECUTE 'ALTER TABLE skus ALTER COLUMN sku_name SET NOT NULL';
  END IF;
END $$;

-- 3) Unique per company
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'skus_company_id_sku_code_key'
  ) THEN
    ALTER TABLE skus
      ADD CONSTRAINT skus_company_id_sku_code_key UNIQUE (company_id, sku_code);
  END IF;
END $$;

-- 4) Helpful indexes
CREATE INDEX IF NOT EXISTS skus_company_id_idx ON skus(company_id);
CREATE INDEX IF NOT EXISTS skus_company_active_idx ON skus(company_id) WHERE deleted_at IS NULL;
