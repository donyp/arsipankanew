const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function diag() {
    console.log("--- ZONAS ---");
    const { data: zonas, error: zErr } = await supabase.from('zonas').select('*').order('kode');
    if (zErr) console.error(zErr);
    else console.table(zonas);

    console.log("\n--- RECENT INVOICES (Last 20) ---");
    const { data: files, error: fErr } = await supabase
        .from('files')
        .select('id, nama_file, zona_id, total_jual, zonas(nama)')
        .eq('category', 'INVOICE')
        .order('created_at', { ascending: false })
        .limit(20);
    if (fErr) console.error(fErr);
    else console.table(files.map(f => ({
        id: f.id,
        file: f.nama_file,
        zId: f.zona_id,
        zName: f.zonas?.nama,
        nominal: f.total_jual
    })));
}

diag();
