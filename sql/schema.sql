-- ============================================================
-- Sistem Pusat Arsip Anka Multi-Zona — New Schema (Terabox + JWT)
-- ============================================================

-- Hapus tabel lama untuk clean slate
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS files CASCADE;
DROP TABLE IF EXISTS archives CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS toko CASCADE;
DROP TABLE IF EXISTS zonas CASCADE;

-- ============================================================
-- 1. ZONAS (17 zona)
-- ============================================================
CREATE TABLE zonas (
    id SERIAL PRIMARY KEY,
    nama TEXT NOT NULL,
    kode TEXT UNIQUE NOT NULL,
    deskripsi TEXT
);

INSERT INTO zonas (kode, nama) VALUES
('zona-01', 'Zona 1'), ('zona-02', 'Zona 2'), ('zona-03a', 'Zona 3A'),
('zona-03b', 'Zona 3B'), ('zona-04', 'Zona 4'), ('zona-05', 'Zona 5'),
('zona-06a', 'Zona 6A'), ('zona-06b', 'Zona 6B'), ('zona-07', 'Zona 7'),
('zona-08', 'Zona 8'), ('zona-09', 'Zona 9'), ('zona-10', 'Zona 10'),
('zona-11', 'Zona 11'), ('zona-12', 'Zona 12'), ('zona-13', 'Zona 13'),
('zona-14', 'Zona 14'), ('zona-15', 'Zona 15'), ('zona-16', 'Zona 16'),
('zona-17', 'Zona 17');

-- ============================================================
-- 2. TOKO (sub-kategori per zona)
-- ============================================================
CREATE TABLE toko (
    id SERIAL PRIMARY KEY,
    nama TEXT NOT NULL,
    zona_id INT NOT NULL REFERENCES zonas(id) ON DELETE CASCADE,
    kode TEXT UNIQUE NOT NULL
);

-- ZONA 1
INSERT INTO toko (nama, zona_id, kode) VALUES
('Balaraja', (SELECT id FROM zonas WHERE kode='zona-01'), 'toko-balaraja'),
('Bitung', (SELECT id FROM zonas WHERE kode='zona-01'), 'toko-bitung'),
('Cilegon', (SELECT id FROM zonas WHERE kode='zona-01'), 'toko-cilegon'),
('Cipondoh', (SELECT id FROM zonas WHERE kode='zona-01'), 'toko-cipondoh'),
('Ciruas', (SELECT id FROM zonas WHERE kode='zona-01'), 'toko-ciruas'),
('Kutabumi', (SELECT id FROM zonas WHERE kode='zona-01'), 'toko-kutabumi'),
('Serang Timur', (SELECT id FROM zonas WHERE kode='zona-01'), 'toko-serang-timur'),
('Pasar Kemis', (SELECT id FROM zonas WHERE kode='zona-01'), 'toko-pasar-kemis');

-- ZONA 2
INSERT INTO toko (nama, zona_id, kode) VALUES
('Bintaro', (SELECT id FROM zonas WHERE kode='zona-02'), 'toko-bintaro'),
('Cengkareng', (SELECT id FROM zonas WHERE kode='zona-02'), 'toko-cengkareng'),
('Ciledug', (SELECT id FROM zonas WHERE kode='zona-02'), 'toko-ciledug'),
('Gading Serpong', (SELECT id FROM zonas WHERE kode='zona-02'), 'toko-gading-serpong'),
('Joglo', (SELECT id FROM zonas WHERE kode='zona-02'), 'toko-joglo'),
('Karang Tengah', (SELECT id FROM zonas WHERE kode='zona-02'), 'toko-karang-tengah'),
('Pinang', (SELECT id FROM zonas WHERE kode='zona-02'), 'toko-pinang'),
('Sawangan', (SELECT id FROM zonas WHERE kode='zona-02'), 'toko-sawangan'),
('Sawangan 2', (SELECT id FROM zonas WHERE kode='zona-02'), 'toko-sawangan-2');

-- ZONA 3A
INSERT INTO toko (nama, zona_id, kode) VALUES
('Fitrah Jaya', (SELECT id FROM zonas WHERE kode='zona-03a'), 'toko-fitrah-jaya'),
('Condet', (SELECT id FROM zonas WHERE kode='zona-03a'), 'toko-condet'),
('Duren Sawit', (SELECT id FROM zonas WHERE kode='zona-03a'), 'toko-duren-sawit'),
('Harapan Indah', (SELECT id FROM zonas WHERE kode='zona-03a'), 'toko-harapan-indah'),
('Jatiwaringin', (SELECT id FROM zonas WHERE kode='zona-03a'), 'toko-jatiwaringin'),
('Rorotan', (SELECT id FROM zonas WHERE kode='zona-03a'), 'toko-rorotan'),
('Alumunium', (SELECT id FROM zonas WHERE kode='zona-03a'), 'toko-alumunium'),
('Alumunium Karawang', (SELECT id FROM zonas WHERE kode='zona-03a'), 'toko-alumunium-karawang'),
('Alumunium Leuwiliang', (SELECT id FROM zonas WHERE kode='zona-03a'), 'toko-alumunium-leuwiliang');

-- ZONA 3B
INSERT INTO toko (nama, zona_id, kode) VALUES
('Mega Granit', (SELECT id FROM zonas WHERE kode='zona-03b'), 'toko-mega-granit'),
('Mega Warna', (SELECT id FROM zonas WHERE kode='zona-03b'), 'toko-mega-warna');

-- ZONA 4
INSERT INTO toko (nama, zona_id, kode) VALUES
('Komsen', (SELECT id FROM zonas WHERE kode='zona-04'), 'toko-komsen'),
('Bantargebang', (SELECT id FROM zonas WHERE kode='zona-04'), 'toko-bantargebang'),
('Cibubur', (SELECT id FROM zonas WHERE kode='zona-04'), 'toko-cibubur'),
('Cikeas', (SELECT id FROM zonas WHERE kode='zona-04'), 'toko-cikeas'),
('Cimanggis', (SELECT id FROM zonas WHERE kode='zona-04'), 'toko-cimanggis'),
('Pedurenan', (SELECT id FROM zonas WHERE kode='zona-04'), 'toko-pedurenan'),
('Cibubur Raya', (SELECT id FROM zonas WHERE kode='zona-04'), 'toko-cibubur-raya'),
('Setu', (SELECT id FROM zonas WHERE kode='zona-04'), 'toko-setu');

-- ZONA 5
INSERT INTO toko (nama, zona_id, kode) VALUES
('Dramaga', (SELECT id FROM zonas WHERE kode='zona-05'), 'toko-dramaga'),
('Jasinga', (SELECT id FROM zonas WHERE kode='zona-05'), 'toko-jasinga'),
('Karadenan', (SELECT id FROM zonas WHERE kode='zona-05'), 'toko-karadenan'),
('Leuwiliang', (SELECT id FROM zonas WHERE kode='zona-05'), 'toko-leuwiliang'),
('Rangkasbitung', (SELECT id FROM zonas WHERE kode='zona-05'), 'toko-rangkasbitung'),
('Sentul', (SELECT id FROM zonas WHERE kode='zona-05'), 'toko-sentul');

-- ZONA 6A
INSERT INTO toko (nama, zona_id, kode) VALUES
('Cianjur', (SELECT id FROM zonas WHERE kode='zona-06a'), 'toko-cianjur'),
('Ciawi', (SELECT id FROM zonas WHERE kode='zona-06a'), 'toko-ciawi'),
('Cigombong', (SELECT id FROM zonas WHERE kode='zona-06a'), 'toko-cigombong'),
('Ciluer', (SELECT id FROM zonas WHERE kode='zona-06a'), 'toko-ciluer'),
('Cipeuyeum', (SELECT id FROM zonas WHERE kode='zona-06a'), 'toko-cipeuyeum'),
('Sukabumi', (SELECT id FROM zonas WHERE kode='zona-06a'), 'toko-sukabumi'),
('Sukaraja', (SELECT id FROM zonas WHERE kode='zona-06a'), 'toko-sukaraja');

-- ZONA 6B
INSERT INTO toko (nama, zona_id, kode) VALUES
('Cikalong', (SELECT id FROM zonas WHERE kode='zona-06b'), 'toko-cikalong'),
('Cimahi', (SELECT id FROM zonas WHERE kode='zona-06b'), 'toko-cimahi'),
('Garut', (SELECT id FROM zonas WHERE kode='zona-06b'), 'toko-garut'),
('Majalaya', (SELECT id FROM zonas WHERE kode='zona-06b'), 'toko-majalaya'),
('Soreang', (SELECT id FROM zonas WHERE kode='zona-06b'), 'toko-soreang'),
('Sumedang', (SELECT id FROM zonas WHERE kode='zona-06b'), 'toko-sumedang'),
('Rancaekek', (SELECT id FROM zonas WHERE kode='zona-06b'), 'toko-rancaekek');

-- ZONA 7
INSERT INTO toko (nama, zona_id, kode) VALUES
('Cikampek', (SELECT id FROM zonas WHERE kode='zona-07'), 'toko-cikampek'),
('Cirebon', (SELECT id FROM zonas WHERE kode='zona-07'), 'toko-cirebon'),
('Karawang Barat', (SELECT id FROM zonas WHERE kode='zona-07'), 'toko-karawang-barat'),
('Karawang Timur', (SELECT id FROM zonas WHERE kode='zona-07'), 'toko-karawang-timur'),
('Kedawung', (SELECT id FROM zonas WHERE kode='zona-07'), 'toko-kedawung'),
('Kuningan', (SELECT id FROM zonas WHERE kode='zona-07'), 'toko-kuningan'),
('Palimanan', (SELECT id FROM zonas WHERE kode='zona-07'), 'toko-palimanan'),
('Purwakarta', (SELECT id FROM zonas WHERE kode='zona-07'), 'toko-purwakarta'),
('Rengasdengklok', (SELECT id FROM zonas WHERE kode='zona-07'), 'toko-rengasdengklok'),
('Subang', (SELECT id FROM zonas WHERE kode='zona-07'), 'toko-subang');

-- ZONA 8
INSERT INTO toko (nama, zona_id, kode) VALUES
('Brebes', (SELECT id FROM zonas WHERE kode='zona-08'), 'toko-brebes'),
('Kendal', (SELECT id FROM zonas WHERE kode='zona-08'), 'toko-kendal'),
('Kudus', (SELECT id FROM zonas WHERE kode='zona-08'), 'toko-kudus'),
('Pemalang', (SELECT id FROM zonas WHERE kode='zona-08'), 'toko-pemalang'),
('Semarang Unggaran', (SELECT id FROM zonas WHERE kode='zona-08'), 'toko-semarang-unggaran'),
('Slawi', (SELECT id FROM zonas WHERE kode='zona-08'), 'toko-slawi'),
('Semarang', (SELECT id FROM zonas WHERE kode='zona-08'), 'toko-semarang');

-- ZONA 9
INSERT INTO toko (nama, zona_id, kode) VALUES
('Magelang', (SELECT id FROM zonas WHERE kode='zona-09'), 'toko-magelang'),
('Solo', (SELECT id FROM zonas WHERE kode='zona-09'), 'toko-solo'),
('Yogyakarta', (SELECT id FROM zonas WHERE kode='zona-09'), 'toko-yogyakarta');

-- ZONA 10
INSERT INTO toko (nama, zona_id, kode) VALUES
('Jember', (SELECT id FROM zonas WHERE kode='zona-10'), 'toko-jember'),
('Madiun', (SELECT id FROM zonas WHERE kode='zona-10'), 'toko-madiun'),
('Malang', (SELECT id FROM zonas WHERE kode='zona-10'), 'toko-malang'),
('Mojokerto', (SELECT id FROM zonas WHERE kode='zona-10'), 'toko-mojokerto'),
('Surabaya', (SELECT id FROM zonas WHERE kode='zona-10'), 'toko-surabaya');

-- ZONA 11
INSERT INTO toko (nama, zona_id, kode) VALUES
('Bandar Jaya', (SELECT id FROM zonas WHERE kode='zona-11'), 'toko-bandar-jaya'),
('Kotabumi', (SELECT id FROM zonas WHERE kode='zona-11'), 'toko-kotabumi'),
('Lampung', (SELECT id FROM zonas WHERE kode='zona-11'), 'toko-lampung'),
('Palembang', (SELECT id FROM zonas WHERE kode='zona-11'), 'toko-palembang');

-- ZONA 12
INSERT INTO toko (nama, zona_id, kode) VALUES
('Banjarnegara', (SELECT id FROM zonas WHERE kode='zona-12'), 'toko-banjarnegara'),
('Purwokerto', (SELECT id FROM zonas WHERE kode='zona-12'), 'toko-purwokerto'),
('Tasikmalaya', (SELECT id FROM zonas WHERE kode='zona-12'), 'toko-tasikmalaya');

-- ZONA 13
INSERT INTO toko (nama, zona_id, kode) VALUES
('Makassar', (SELECT id FROM zonas WHERE kode='zona-13'), 'toko-makassar');

-- ZONA 14
INSERT INTO toko (nama, zona_id, kode) VALUES
('Sepinggan', (SELECT id FROM zonas WHERE kode='zona-14'), 'toko-sepinggan'),
('Kariangau', (SELECT id FROM zonas WHERE kode='zona-14'), 'toko-kariangau'),
('Samarinda', (SELECT id FROM zonas WHERE kode='zona-14'), 'toko-samarinda');

-- ZONA 15
INSERT INTO toko (nama, zona_id, kode) VALUES
('Jonggol', (SELECT id FROM zonas WHERE kode='zona-15'), 'toko-jonggol'),
('Kaliabang', (SELECT id FROM zonas WHERE kode='zona-15'), 'toko-kaliabang'),
('Kayu Putih', (SELECT id FROM zonas WHERE kode='zona-15'), 'toko-kayu-putih'),
('Kalimalang', (SELECT id FROM zonas WHERE kode='zona-15'), 'toko-kalimalang');

-- ZONA 16
INSERT INTO toko (nama, zona_id, kode) VALUES
('Cibitung', (SELECT id FROM zonas WHERE kode='zona-16'), 'toko-cibitung'),
('Deltamas', (SELECT id FROM zonas WHERE kode='zona-16'), 'toko-deltamas'),
('Pulogebang', (SELECT id FROM zonas WHERE kode='zona-16'), 'toko-pulogebang'),
('Sukatani', (SELECT id FROM zonas WHERE kode='zona-16'), 'toko-sukatani');

-- ZONA 17
INSERT INTO toko (nama, zona_id, kode) VALUES
('Cikarang 1', (SELECT id FROM zonas WHERE kode='zona-17'), 'toko-cikarang-1'),
('Sukadami', (SELECT id FROM zonas WHERE kode='zona-17'), 'toko-sukadami'),
('Cibarusah', (SELECT id FROM zonas WHERE kode='zona-17'), 'toko-cibarusah');

-- Record Session Activity
CREATE OR REPLACE FUNCTION update_active_session()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE active_sessions 
  SET last_active = NOW() 
  WHERE session_id = NEW.session_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 📊 INDEXING FOR MASSIVE DATA PERFORMANCE (v2.2)
-- ============================================================

-- Untuk Pagination & Filter Instan di Dasbor
CREATE INDEX IF NOT EXISTS idx_files_zona_id ON public.files(zona_id);
CREATE INDEX IF NOT EXISTS idx_files_category ON public.files(category);
CREATE INDEX IF NOT EXISTS idx_files_toko_id ON public.files(toko_id);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON public.files(created_at DESC);

-- Index Komposit (Filter Kombinasi Serupa dengan di Dasbor)
CREATE INDEX IF NOT EXISTS idx_files_zona_category ON public.files(zona_id, category) WHERE deleted_at IS NULL;

-- ============================================================
-- 3. USERS (JWT-based, no Supabase Auth dependency)
-- ============================================================
CREATE TABLE users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin_zona')),
    zona_id INT REFERENCES zonas(id),
    toko_id INT REFERENCES toko(id),
    name TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. FILES (metadata, storage_path = rclone path)
-- ============================================================
CREATE TABLE files (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nama_file TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    zona_id INT NOT NULL REFERENCES zonas(id),
    toko_id INT REFERENCES toko(id),
    category TEXT CHECK (category IN ('PPN', 'NON_PPN', 'INVOICE', 'PIUTANG')),
    no_invoice TEXT,
    total_jual NUMERIC(15,2),
    ukuran_bytes BIGINT,
    uploaded_by UUID REFERENCES users(id),
    status TEXT DEFAULT 'Unread',
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. AUDIT LOGS
-- ============================================================
CREATE TABLE audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    context TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. UPLOAD REQUESTS TICKET SYSTEM
-- ============================================================
CREATE TABLE upload_requests (
    id SERIAL PRIMARY KEY,
    zona_id INT NOT NULL REFERENCES zonas(id),
    user_id UUID NOT NULL REFERENCES users(id),
    pesan TEXT NOT NULL,
    status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'Selesai', 'Ditolak')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_files_zona ON files(zona_id);
CREATE INDEX idx_files_toko ON files(toko_id);
CREATE INDEX idx_files_category ON files(category);
CREATE INDEX idx_files_deleted ON files(deleted_at);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_toko_zona ON toko(zona_id);
CREATE INDEX idx_requests_zona ON upload_requests(zona_id);
CREATE INDEX idx_requests_status ON upload_requests(status);

-- ============================================================
-- DISABLE RLS (Access control handled by backend JWT middleware)
-- ============================================================
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE files DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE zonas DISABLE ROW LEVEL SECURITY;
ALTER TABLE toko DISABLE ROW LEVEL SECURITY;
ALTER TABLE upload_requests DISABLE ROW LEVEL SECURITY;
