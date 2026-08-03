const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
    console.log("Checking for system_config table...");
    const { data, error } = await supabase
        .from('system_config')
        .select('*');

    if (error) {
        console.log("Error or table does not exist:", error.message);
    } else {
        console.log("Table exists! Data:", data);
    }
    process.exit(0);
}

check();
