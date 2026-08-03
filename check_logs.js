
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkLogs() {
    const { data: logs, error } = await supabase.from('audit_logs').select('*, users(name, role)').limit(5);
    if (error) {
        console.error('Error fetching logs:', error);
    } else {
        console.log('Recent Logs:', JSON.stringify(logs, null, 2));
    }
}

checkLogs();
