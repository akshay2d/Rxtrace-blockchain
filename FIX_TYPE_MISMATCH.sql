-- Quick fix: Ensure companies.user_id is TEXT type
-- Run this FIRST before the main migration

-- Check and convert user_id to TEXT if it's UUID
DO $$
BEGIN
  -- Check if user_id column exists and is UUID type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'companies' 
    AND column_name = 'user_id'
    AND data_type = 'uuid'
  ) THEN
    -- Convert UUID to TEXT
    ALTER TABLE companies ALTER COLUMN user_id TYPE TEXT USING user_id::text;
  END IF;
END $$;

-- Check and convert seats.user_id to TEXT if it's UUID
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'seats' 
    AND column_name = 'user_id'
    AND data_type = 'uuid'
  ) THEN
    ALTER TABLE seats ALTER COLUMN user_id TYPE TEXT USING user_id::text;
  END IF;
END $$;
