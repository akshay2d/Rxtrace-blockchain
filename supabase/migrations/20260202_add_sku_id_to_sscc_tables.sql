-- =====================================================
-- ADD MISSING COLUMNS TO BOXES, CARTONS, PALLETS TABLES
-- Ensures all required columns exist for SSCC generation
-- =====================================================

-- Add all required columns to boxes table
DO $$
BEGIN
  -- Add sku_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'boxes' AND column_name = 'sku_id'
  ) THEN
    ALTER TABLE boxes ADD COLUMN sku_id UUID REFERENCES skus(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_boxes_sku_id ON boxes(sku_id) WHERE sku_id IS NOT NULL;
    RAISE NOTICE 'Added sku_id column to boxes table';
  END IF;
  
  -- Add sscc if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'boxes' AND column_name = 'sscc'
  ) THEN
    ALTER TABLE boxes ADD COLUMN sscc VARCHAR(18);
    CREATE INDEX IF NOT EXISTS idx_boxes_sscc ON boxes(sscc) WHERE sscc IS NOT NULL;
    RAISE NOTICE 'Added sscc column to boxes table';
  END IF;
  
  -- Add sscc_with_ai if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'boxes' AND column_name = 'sscc_with_ai'
  ) THEN
    ALTER TABLE boxes ADD COLUMN sscc_with_ai TEXT;
    RAISE NOTICE 'Added sscc_with_ai column to boxes table';
  END IF;
  
  -- Add sscc_level if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'boxes' AND column_name = 'sscc_level'
  ) THEN
    ALTER TABLE boxes ADD COLUMN sscc_level TEXT CHECK (sscc_level IN ('box', 'carton', 'pallet'));
    RAISE NOTICE 'Added sscc_level column to boxes table';
  END IF;
  
  -- Add parent_sscc if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'boxes' AND column_name = 'parent_sscc'
  ) THEN
    ALTER TABLE boxes ADD COLUMN parent_sscc TEXT;
    RAISE NOTICE 'Added parent_sscc column to boxes table';
  END IF;
END $$;

-- Add all required columns to cartons table
DO $$
BEGIN
  -- Add sku_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'cartons' AND column_name = 'sku_id'
  ) THEN
    ALTER TABLE cartons ADD COLUMN sku_id UUID REFERENCES skus(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_cartons_sku_id ON cartons(sku_id) WHERE sku_id IS NOT NULL;
    RAISE NOTICE 'Added sku_id column to cartons table';
  END IF;
  
  -- Add sscc if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'cartons' AND column_name = 'sscc'
  ) THEN
    ALTER TABLE cartons ADD COLUMN sscc VARCHAR(18);
    CREATE INDEX IF NOT EXISTS idx_cartons_sscc ON cartons(sscc) WHERE sscc IS NOT NULL;
    RAISE NOTICE 'Added sscc column to cartons table';
  END IF;
  
  -- Add sscc_with_ai if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'cartons' AND column_name = 'sscc_with_ai'
  ) THEN
    ALTER TABLE cartons ADD COLUMN sscc_with_ai TEXT;
    RAISE NOTICE 'Added sscc_with_ai column to cartons table';
  END IF;
  
  -- Add sscc_level if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'cartons' AND column_name = 'sscc_level'
  ) THEN
    ALTER TABLE cartons ADD COLUMN sscc_level TEXT CHECK (sscc_level IN ('box', 'carton', 'pallet'));
    RAISE NOTICE 'Added sscc_level column to cartons table';
  END IF;
  
  -- Add parent_sscc if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'cartons' AND column_name = 'parent_sscc'
  ) THEN
    ALTER TABLE cartons ADD COLUMN parent_sscc TEXT;
    RAISE NOTICE 'Added parent_sscc column to cartons table';
  END IF;
END $$;

-- Add all required columns to pallets table
DO $$
BEGIN
  -- Add sku_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'pallets' AND column_name = 'sku_id'
  ) THEN
    ALTER TABLE pallets ADD COLUMN sku_id UUID REFERENCES skus(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_pallets_sku_id ON pallets(sku_id) WHERE sku_id IS NOT NULL;
    RAISE NOTICE 'Added sku_id column to pallets table';
  END IF;
  
  -- Add sscc if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'pallets' AND column_name = 'sscc'
  ) THEN
    ALTER TABLE pallets ADD COLUMN sscc VARCHAR(18);
    CREATE INDEX IF NOT EXISTS idx_pallets_sscc ON pallets(sscc) WHERE sscc IS NOT NULL;
    RAISE NOTICE 'Added sscc column to pallets table';
  END IF;
  
  -- Add sscc_with_ai if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'pallets' AND column_name = 'sscc_with_ai'
  ) THEN
    ALTER TABLE pallets ADD COLUMN sscc_with_ai TEXT;
    RAISE NOTICE 'Added sscc_with_ai column to pallets table';
  END IF;
  
  -- Add sscc_level if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'pallets' AND column_name = 'sscc_level'
  ) THEN
    ALTER TABLE pallets ADD COLUMN sscc_level TEXT CHECK (sscc_level IN ('box', 'carton', 'pallet'));
    RAISE NOTICE 'Added sscc_level column to pallets table';
  END IF;
  
  -- Add parent_sscc if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'pallets' AND column_name = 'parent_sscc'
  ) THEN
    ALTER TABLE pallets ADD COLUMN parent_sscc TEXT;
    RAISE NOTICE 'Added parent_sscc column to pallets table';
  END IF;
END $$;

-- Verify all required columns exist
SELECT 
  'boxes' as table_name,
  'sku_id' as column_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'boxes' AND column_name = 'sku_id'
  ) THEN '✅ exists' ELSE '❌ missing' END as status
UNION ALL
SELECT 'boxes', 'sscc',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'boxes' AND column_name = 'sscc'
  ) THEN '✅ exists' ELSE '❌ missing' END
UNION ALL
SELECT 'boxes', 'sscc_with_ai',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'boxes' AND column_name = 'sscc_with_ai'
  ) THEN '✅ exists' ELSE '❌ missing' END
UNION ALL
SELECT 'boxes', 'sscc_level',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'boxes' AND column_name = 'sscc_level'
  ) THEN '✅ exists' ELSE '❌ missing' END
UNION ALL
SELECT 'boxes', 'parent_sscc',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'boxes' AND column_name = 'parent_sscc'
  ) THEN '✅ exists' ELSE '❌ missing' END
UNION ALL
SELECT 'cartons', 'sku_id',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'cartons' AND column_name = 'sku_id'
  ) THEN '✅ exists' ELSE '❌ missing' END
UNION ALL
SELECT 'cartons', 'sscc',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'cartons' AND column_name = 'sscc'
  ) THEN '✅ exists' ELSE '❌ missing' END
UNION ALL
SELECT 'cartons', 'sscc_with_ai',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'cartons' AND column_name = 'sscc_with_ai'
  ) THEN '✅ exists' ELSE '❌ missing' END
UNION ALL
SELECT 'pallets', 'sku_id',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'pallets' AND column_name = 'sku_id'
  ) THEN '✅ exists' ELSE '❌ missing' END
UNION ALL
SELECT 'pallets', 'sscc',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'pallets' AND column_name = 'sscc'
  ) THEN '✅ exists' ELSE '❌ missing' END
UNION ALL
SELECT 'pallets', 'sscc_with_ai',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'pallets' AND column_name = 'sscc_with_ai'
  ) THEN '✅ exists' ELSE '❌ missing' END;
