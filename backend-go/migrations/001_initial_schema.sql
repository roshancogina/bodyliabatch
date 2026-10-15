-- Migration: 001 — Initial schema for batch.bodylia.in
-- Canonical batch nomenclature: BDL-<PRODUCT>-<YYMM>-<NNNN>
-- Vendor aliases live in batch_aliases (globally unique, compact-insensitive).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Products (two-letter code embedded in every batch number)
CREATE TABLE IF NOT EXISTS products (
    code CHAR(2) PRIMARY KEY CHECK (code ~ '^[A-Z]{2}$'),
    name VARCHAR(40) NOT NULL,
    claim VARCHAR(120) NOT NULL,
    format VARCHAR(120) NOT NULL,
    image_url TEXT NOT NULL,
    shelf_life_months INTEGER NOT NULL CHECK (shelf_life_months BETWEEN 6 AND 60),
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sites: facilities (GMP) and labs (NABL) share one table with a kind flag
CREATE TABLE IF NOT EXISTS sites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('facility', 'lab')),
    name TEXT NOT NULL UNIQUE,
    accreditation VARCHAR(100) NOT NULL,
    accreditation_expires DATE NOT NULL,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Canonical batches: batch number is ALWAYS BDL-<CODE>-YYMM-NNNN
CREATE TABLE IF NOT EXISTS batches (
    batch TEXT PRIMARY KEY CHECK (batch ~ '^BDL-[A-Z]{2}-[0-9]{2}(0[1-9]|1[0-2])-[0-9]{4}$'),
    product_code CHAR(2) NOT NULL REFERENCES products(code),
    manufactured DATE NOT NULL,
    expires DATE NOT NULL,
    facility TEXT NOT NULL,
    lab TEXT NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'released' CHECK (status IN ('released', 'recalled')),
    recall_reason TEXT,
    first_checked_at TIMESTAMPTZ,
    coa_file_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (expires > manufactured),
    CHECK (SUBSTRING(batch FROM 5 FOR 2) = product_code)
);

-- Vendor aliases: other lot codes printed by vendors for the same canonical batch.
CREATE TABLE IF NOT EXISTS batch_aliases (
    alias TEXT PRIMARY KEY,
    compact_key TEXT NOT NULL,
    batch TEXT NOT NULL REFERENCES batches(batch) ON DELETE CASCADE,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (char_length(alias) BETWEEN 3 AND 40),
    CHECK (alias ~ '^[A-Z0-9][A-Z0-9\-#]*[A-Z0-9]$'),
    UNIQUE (compact_key)
);
CREATE INDEX IF NOT EXISTS idx_batch_aliases_batch ON batch_aliases(batch);

-- COA rows (lab results per batch)
CREATE TABLE IF NOT EXISTS coa_rows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch TEXT NOT NULL REFERENCES batches(batch) ON DELETE CASCADE,
    test TEXT NOT NULL,
    specification TEXT NOT NULL,
    result TEXT NOT NULL,
    pass BOOLEAN NOT NULL DEFAULT TRUE,
    position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_coa_rows_batch ON coa_rows(batch);

-- Suspicious-pack reports from customers
CREATE TABLE IF NOT EXISTS reports (
    reference TEXT PRIMARY KEY CHECK (reference ~ '^SR-[0-9]{4}-[0-9]{5}$'),
    full_name VARCHAR(80) NOT NULL,
    email TEXT NOT NULL,
    phone VARCHAR(20),
    batch_input TEXT NOT NULL,
    batch_canonical TEXT REFERENCES batches(batch) ON DELETE SET NULL,
    channel TEXT NOT NULL,
    message TEXT NOT NULL CHECK (char_length(message) BETWEEN 20 AND 1000),
    photo_name TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'investigating', 'resolved_genuine', 'resolved_counterfeit')),
    assignee TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

-- Report timeline events
CREATE TABLE IF NOT EXISTS report_timeline (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference TEXT NOT NULL REFERENCES reports(reference) ON DELETE CASCADE,
    at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    by TEXT NOT NULL,
    kind VARCHAR(20) NOT NULL
        CHECK (kind IN ('received', 'note', 'status', 'reply', 'escalation', 'assign')),
    text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_report_timeline_ref ON report_timeline(reference);

-- Report escalations (at most one open per report)
CREATE TABLE IF NOT EXISTS escalations (
    reference TEXT PRIMARY KEY REFERENCES reports(reference) ON DELETE CASCADE,
    by TEXT NOT NULL,
    at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason TEXT NOT NULL,
    urgency VARCHAR(10) NOT NULL CHECK (urgency IN ('standard', 'urgent')),
    state VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'accepted', 'returned')),
    handled_by TEXT
);

-- Staff users (console access: admin / quality / support)
CREATE TABLE IF NOT EXISTS staff_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(80) NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(10) NOT NULL CHECK (role IN ('admin', 'quality', 'support')),
    status VARCHAR(15) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'deactivated')),
    mfa BOOLEAN NOT NULL DEFAULT FALSE,
    invited_by TEXT,
    last_active TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit log (every batch/report/catalogue mutation)
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log(target);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at DESC);

-- Public lookup log (rate limiting + intelligence)
CREATE TABLE IF NOT EXISTS lookups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    input TEXT NOT NULL,
    batch_canonical TEXT REFERENCES batches(batch) ON DELETE SET NULL,
    matched_alias TEXT,
    verdict VARCHAR(10) NOT NULL CHECK (verdict IN ('genuine', 'expired', 'recalled', 'not_found')),
    ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_lookups_at ON lookups(at DESC);

-- Singleton settings row
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    rate_limit_per_minute INTEGER NOT NULL DEFAULT 10,
    reply_target_hours INTEGER NOT NULL DEFAULT 48,
    support_email TEXT NOT NULL DEFAULT 'care@bodylia.in',
    retention_months INTEGER NOT NULL DEFAULT 12,
    session_minutes INTEGER NOT NULL DEFAULT 15,
    maintenance BOOLEAN NOT NULL DEFAULT FALSE,
    maintenance_message TEXT NOT NULL DEFAULT '',
    maintenance_until TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Schema migrations ledger
CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
