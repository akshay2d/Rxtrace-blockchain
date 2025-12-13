-- Change sku_id from uuid to text in packing_rules table
ALTER TABLE public.packing_rules 
ALTER COLUMN sku_id TYPE TEXT;

-- Recreate the unique constraint with text type
ALTER TABLE public.packing_rules 
DROP CONSTRAINT IF EXISTS packing_rules_sku_id_version_key;

ALTER TABLE public.packing_rules 
ADD CONSTRAINT packing_rules_sku_id_version_key UNIQUE (sku_id, version);
