-- Migration 006: Dedicated storage for uploaded COA files (PDFs up to 10 MB).
-- Batches can have an attached signed lab certificate uploaded by admin.
-- Downloadable publicly by anyone for any and every batch.

CREATE TABLE IF NOT EXISTS batch_coa_files (
    batch VARCHAR(40) PRIMARY KEY REFERENCES batches(batch) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'application/pdf',
    file_data BYTEA NOT NULL,
    file_size INT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_batch_coa_files_batch ON batch_coa_files(batch);
