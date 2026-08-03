const http = require('http');
const fs = require('fs');
const path = require('path');

const port = 3000;

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm'
};

const server = http.createServer((req, res) => {
    let url = req.url.split('?')[0]; // Remove query string
    let filePath = path.join(__dirname, url);

    // 1. If it's a directory, look for index.html
    if (url.endsWith('/') || !path.extname(url)) {
        // Try original path (if it's a directory)
        if (fs.existsSync(filePath) && fs.lstatSync(filePath).isDirectory()) {
            filePath = path.join(filePath, 'index.html');
        } else {
            // 2. Clean URL support: Try adding .html
            const htmlPath = filePath + '.html';
            if (fs.existsSync(htmlPath)) {
                filePath = htmlPath;
            } else if (url === '/') {
                filePath = path.join(__dirname, 'index.html');
            }
        }
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code == 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1><p>File tidak ditemukan.</p>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end('Server Error: ' + error.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(port, () => {
    console.log(`Frontend restored with Clean URLs at http://localhost:${port}`);
});
