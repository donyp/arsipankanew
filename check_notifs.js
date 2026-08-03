
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkTables() {
    const { data, error } = await supabase.from('system_notifications').select('*').limit(1);
    if (error) {
        if (error.code === 'PGRST116' || error.code === '42P01') {
            console.log('Table system_notifications does NOT exist.');
        } else {
            console.error('Error checking table:', error);
        }
    } else {
        console.log('Table system_notifications EXISTS.');
    }
}

checkTables();
