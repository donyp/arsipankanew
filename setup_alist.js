async function setup() {
    const adminPassword = process.env.ALIST_ADMIN_PASSWORD || 'AdminArsip2026!';
    const alistDomain = 'http://127.0.0.1:5244';

    console.log('Booting... Waiting 10s for Alist to initialize...');
    await new Promise(r => setTimeout(r, 10000));

    console.log('Checking if Alist is ready...');
    let ready = false;
    for (let i = 0; i < 30; i++) {
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 10000);
            const res = await fetch(`${alistDomain}/api/public/settings`, { signal: ctrl.signal });
            clearTimeout(t);
            if (res.status === 200) {
                ready = true;
                break;
            }
        } catch (e) { }
        await new Promise(r => setTimeout(r, 2000));
    }

    if (!ready) {
        console.error('Alist failed to start in time.');
        process.exit(1);
    }

    console.log('Logging in to Alist...');
    const loginCtrl = new AbortController();
    const loginT = setTimeout(() => loginCtrl.abort(), 30000);
    const loginRes = await fetch(`${alistDomain}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: adminPassword }),
        signal: loginCtrl.signal
    });
    clearTimeout(loginT);
    const loginData = await loginRes.json();
    const token = loginData.data?.token;

    if (!token) {
        console.error('Login failed:', loginData.message);
        process.exit(1);
    }

    console.log('Checking existing storages...');
    const listCtrl = new AbortController();
    const listT = setTimeout(() => listCtrl.abort(), 30000);
    const listRes = await fetch(`${alistDomain}/api/admin/storage/list`, {
        headers: { 'Authorization': token },
        signal: listCtrl.signal
    });
    clearTimeout(listT);
    const listData = await listRes.json();
    const storages = listData.data?.content || [];

    const hasTerabox = storages.some(s => s.mount_path === '/terabox');

    if (hasTerabox) {
        console.log('Terabox storage already exists.');
    } else {
        console.log('Creating Terabox storage...');
        const createCtrl = new AbortController();
        const createT = setTimeout(() => createCtrl.abort(), 60000); // 60s for storage creation
        const createRes = await fetch(`${alistDomain}/api/admin/storage/create`, {
            method: 'POST',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                mount_path: "/terabox",
                order: 0,
                driver: "Terabox",
                cache_expiration: 30,
                status: "work",
                addition: JSON.stringify({
                    root_folder_path: "/",
                    cookie: "ndus=Y4piXBPpeHuigyUmpSoRf1ZUwOP1po25lMqXjF4d",
                    download_api: "crack",
                    order_by: "name",
                    order_direction: "asc"
                }),
                remark: "",
                disabled: false,
                enable_sign: false,
                web_proxy: true,
                webdav_policy: "native_proxy",
                down_proxy_sign: true
            }),
            signal: createCtrl.signal
        });
        clearTimeout(createT);
        const createData = await createRes.json();
        if (createData.code === 200) {
            console.log('Terabox storage created successfully!');
        } else {
            console.error('Failed to create storage:', createData.message);
        }
    }
}

setup().catch(console.error);
