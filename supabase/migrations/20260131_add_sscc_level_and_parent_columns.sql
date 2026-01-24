-- =====================================================
-- ADD SSCC_LEVEL AND PARENT_SSCC COLUMNS TO BOXES, CARTONS, PALLETS
-- Required for SSCC hierarchy tracking
-- =====================================================

-- Add sscc_level and parent_sscc to boxes table
ALTER TABLE boxes
  ADD COLUMN IF NOT EXISTS sscc_level TEXT CHECK (sscc_level IN ('box', 'carton', 'pallet')),
  ADD COLUMN IF NOT EXISTS parent_sscc TEXT;

-- Add sscc_level and parent_sscc to cartons table
ALTER TABLE cartons
  ADD COLUMN IF NOT EXISTS sscc_level TEXT CHECK (sscc_level IN ('box', 'carton', 'pallet')),
  ADD COLUMN IF NOT EXISTS parent_sscc TEXT;

-- Add sscc_level and parent_sscc to pallets table
ALTER TABLE pallets
  ADD COLUMN IF NOT EXISTS sscc_level TEXT CHECK (sscc_level IN ('box', 'carton', 'pallet')),
  ADD COLUMN IF NOT EXISTS parent_sscc TEXT;

-- Add comments for documentation
COMMENT ON COLUMN boxes.sscc_level IS 'SSCC hierarchy level: box, carton, or pallet';
COMMENT ON COLUMN boxes.parent_sscc IS 'Parent SSCC code (for hierarchy: box -> carton -> pallet)';
COMMENT ON COLUMN cartons.sscc_level IS 'SSCC hierarchy level: box, carton, or pallet';
COMMENT ON COLUMN cartons.parent_sscc IS 'Parent SSCC code (for hierarchy: box -> carton -> pallet)';
COMMENT ON COLUMN pallets.sscc_level IS 'SSCC hierarchy level: box, carton, or pallet';
COMMENT ON COLUMN pallets.parent_sscc IS 'Parent SSCC code (for hierarchy: box -> carton -> pallet)';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_boxes_sscc_level ON boxes(sscc_level) WHERE sscc_level IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_boxes_parent_sscc ON boxes(parent_sscc) WHERE parent_sscc IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cartons_sscc_level ON cartons(sscc_level) WHERE sscc_level IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cartons_parent_sscc ON cartons(parent_sscc) WHERE parent_sscc IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pallets_sscc_level ON pallets(sscc_level) WHERE sscc_level IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pallets_parent_sscc ON pallets(parent_sscc) WHERE parent_sscc IS NOT NULL;
