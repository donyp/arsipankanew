-- migration: add_invoice_columns.sql
-- Digunakan untuk menyimpan metadata terstruktur hasil parsing Excel POS.

ALTER TABLE files 
ADD COLUMN no_invoice TEXT,
ADD COLUMN total_jual NUMERIC(15,2);

-- Tambahkan index untuk pencarian no invoice agar lebih cepat
CREATE INDEX idx_files_no_invoice ON files(no_invoice);

COMMENT ON COLUMN files.no_invoice IS 'Nomor Faktur/Invoice dari sistem POS';
COMMENT ON COLUMN files.total_jual IS 'Jumlah Jual/Total nominal dari sistem POS';
