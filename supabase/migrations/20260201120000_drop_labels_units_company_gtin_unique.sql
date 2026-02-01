-- R5: Drop idx_labels_units_company_gtin_unique to align schema with Rule A
-- Rule A: UNIQUE(company_id, gtin, batch, serial) - allows multiple units per product
-- Rule B (being removed): UNIQUE(company_id, gtin) - incorrectly allowed only 1 unit per product
-- Code generation and ERP ingestion both expect multiple units per GTIN (different serials).
-- Keep only labels_units_unique_company_gtin_batch_serial.

DROP INDEX IF EXISTS idx_labels_units_company_gtin_unique;
