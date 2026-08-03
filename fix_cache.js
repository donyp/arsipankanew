const fs = require('fs');
const path = require('path');

const directory = 'd:/.gemini/antigravity/scratch/arsip anka';
const targetString = 'FORCE_REFRESH_9999';
const replacementString = 'ULTRACLEAN_2026';

function processDirectory(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            // skip node_modules
            if (file !== 'node_modules' && file !== '.git') {
                processDirectory(fullPath);
            }
        } else if (file.endsWith('.html')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes(targetString)) {
                console.log(`Updating ${fullPath}...`);
                content = content.split(targetString).join(replacementString);
                fs.writeFileSync(fullPath, content, 'utf8');
            }
        }
    });
}

processDirectory(directory);
console.log("Done.");
