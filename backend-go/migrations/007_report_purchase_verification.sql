-- Migration: 007 — Report purchase verification (order number, purchase date, batch verified flag)
ALTER TABLE reports ADD COLUMN IF NOT EXISTS order_number TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS purchase_date TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS batch_verified BOOLEAN DEFAULT FALSE;
