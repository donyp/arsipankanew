-- ============================================================
-- Migration: Add media_categories table
-- ============================================================

CREATE TABLE IF NOT EXISTS media_categories (
    id SERIAL PRIMARY KEY,
    nama TEXT NOT NULL UNIQUE,
    emoji TEXT DEFAULT '📁',
    deskripsi TEXT DEFAULT '',
    warna TEXT DEFAULT 'gray',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default categories
INSERT INTO media_categories (nama, emoji, deskripsi, warna) VALUES
('footage', '🎬', 'Video mentah, clip, B-roll', 'rose'),
('mentahan', '🎨', 'PSD, AI, file desain raw', 'amber'),
('poster', '🖼️', 'Hasil jadi poster, banner, flyer', 'emerald'),
('lainnya', '📁', 'Font, template, aset lainnya', 'gray')
ON CONFLICT (nama) DO NOTHING;

ALTER TABLE media_categories DISABLE ROW LEVEL SECURITY;
