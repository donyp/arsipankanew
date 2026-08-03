-- ============================================================
-- Migration: Add ads_media table
-- ============================================================

CREATE TABLE IF NOT EXISTS ads_media (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nama_file TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    category TEXT DEFAULT 'lainnya',
    deskripsi TEXT,
    ukuran_bytes BIGINT DEFAULT 0,
    uploaded_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ads_media_category ON ads_media(category);
CREATE INDEX IF NOT EXISTS idx_ads_media_deleted ON ads_media(deleted_at);

ALTER TABLE ads_media DISABLE ROW LEVEL SECURITY;
