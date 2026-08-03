#!/usr/bin/env node

/**
 * Pusat Arsip Anka - Health Check Script
 * Verifies deployment readiness and system health
 */

const fs = require('fs');
const path = require('path');

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║        PUSAT ARSIP ANKA - DEPLOYMENT HEALTH CHECK         ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

let issues = [];
let warnings = [];
let success = [];

// Helper functions
function checkFile(filePath, name) {
    const fullPath = path.join(__dirname, filePath);
    if (fs.existsSync(fullPath)) {
        success.push(`✓ ${name} present`);
        return true;
    } else {
        issues.push(`✗ ${name} missing: ${filePath}`);
        return false;
    }
}

function checkFileSize(filePath, maxSizeMB, name) {
    const fullPath = path.join(__dirname, filePath);
    if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        const sizeMB = stats.size / (1024 * 1024);
        if (sizeMB > maxSizeMB) {
            warnings.push(`⚠ ${name} is large: ${sizeMB.toFixed(2)}MB (consider removing)`);
        } else {
            success.push(`✓ ${name} size OK: ${sizeMB.toFixed(2)}MB`);
        }
    }
}

function checkEnvVar(varName) {
    if (process.env[varName]) {
        success.push(`✓ Environment variable ${varName} set`);
        return true;
    } else {
        warnings.push(`⚠ Environment variable ${varName} not set (required in HF)`);
        return false;
    }
}

// ════════════════════════════════════════════════════════════════
// CHECK 1: Core Files
// ════════════════════════════════════════════════════════════════
console.log('📦 Checking Core Files...\n');

checkFile('Dockerfile', 'Dockerfile');
checkFile('start.sh', 'start.sh');
checkFile('.dockerignore', '.dockerignore');
checkFile('backend/package.json', 'backend/package.json');
checkFile('backend/server.js', 'backend/server.js');
checkFile('index.html', 'index.html');
checkFile('css/style.css', 'CSS');
checkFile('js', 'JS folder');

// ════════════════════════════════════════════════════════════════
// CHECK 2: File Sizes (Docker build optimization)
// ════════════════════════════════════════════════════════════════
console.log('\n📊 Checking File Sizes...\n');

checkFileSize('backend/node_modules', 300, 'node_modules');
checkFileSize('node_modules', 200, 'root node_modules');
checkFileSize('alist', 50, 'alist binary');
checkFileSize('rclone_bin', 100, 'rclone');

// ════════════════════════════════════════════════════════════════
// CHECK 3: Documentation
// ════════════════════════════════════════════════════════════════
console.log('\n📚 Checking Documentation...\n');

checkFile('DEPLOY_NOW.md', 'DEPLOY_NOW.md');
checkFile('SETUP_HUGGINGFACE.md', 'SETUP_HUGGINGFACE.md');
checkFile('DEPLOYMENT_CHECKLIST.md', 'DEPLOYMENT_CHECKLIST.md');
checkFile('DEPLOYMENT_SUMMARY.md', 'DEPLOYMENT_SUMMARY.md');
checkFile('.env.example', '.env.example');
checkFile('00_START_HERE.txt', '00_START_HERE.txt');

// ════════════════════════════════════════════════════════════════
// CHECK 4: Deployment Scripts
// ════════════════════════════════════════════════════════════════
console.log('\n🚀 Checking Deployment Scripts...\n');

checkFile('deploy.bat', 'deploy.bat (Windows)');
checkFile('deploy.sh', 'deploy.sh (Linux/Mac)');

// ════════════════════════════════════════════════════════════════
// CHECK 5: Git Configuration
// ════════════════════════════════════════════════════════════════
console.log('\n📦 Checking Git Configuration...\n');

checkFile('.gitignore', '.gitignore');
checkFile('.gitattributes', '.gitattributes');

const gitConfig = require('child_process').execSync('git config user.name 2>nul || echo ""').toString().trim();
if (gitConfig) {
    success.push(`✓ Git user configured: ${gitConfig}`);
} else {
    warnings.push('⚠ Git user not configured (required for deployment)');
}

// ════════════════════════════════════════════════════════════════
// CHECK 6: Environment Variables
// ════════════════════════════════════════════════════════════════
console.log('\n🔒 Checking Environment Variables...\n');

checkEnvVar('SUPABASE_URL');
checkEnvVar('SUPABASE_SERVICE_ROLE_KEY');
checkEnvVar('JWT_SECRET');

if (process.env.NODE_ENV) {
    success.push(`✓ NODE_ENV: ${process.env.NODE_ENV}`);
} else {
    warnings.push('⚠ NODE_ENV not set (will default to development)');
}

// ════════════════════════════════════════════════════════════════
// CHECK 7: Dependencies
// ════════════════════════════════════════════════════════════════
console.log('\n📚 Checking Dependencies...\n');

try {
    const pkgPath = path.join(__dirname, 'backend', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    
    const requiredDeps = [
        'express',
        '@supabase/supabase-js',
        'jsonwebtoken',
        'bcryptjs',
        'cors',
        'multer',
        'archiver'
    ];
    
    for (const dep of requiredDeps) {
        if (pkg.dependencies[dep] || pkg.devDependencies[dep]) {
            success.push(`✓ ${dep} in package.json`);
        } else {
            issues.push(`✗ ${dep} missing from package.json`);
        }
    }
} catch (err) {
    issues.push(`✗ Error reading package.json: ${err.message}`);
}

// ════════════════════════════════════════════════════════════════
// SUMMARY
// ════════════════════════════════════════════════════════════════
console.log('\n');
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║                      SUMMARY REPORT                        ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

if (success.length > 0) {
    console.log(`✅ OK (${success.length}):`);
    success.forEach(s => console.log(`   ${s}`));
    console.log();
}

if (warnings.length > 0) {
    console.log(`⚠️  WARNINGS (${warnings.length}):`);
    warnings.forEach(w => console.log(`   ${w}`));
    console.log();
}

if (issues.length > 0) {
    console.log(`❌ ISSUES (${issues.length}):`);
    issues.forEach(i => console.log(`   ${i}`));
    console.log();
}

// ════════════════════════════════════════════════════════════════
// RECOMMENDATIONS
// ════════════════════════════════════════════════════════════════
console.log('📋 RECOMMENDATIONS:\n');

if (issues.length > 0) {
    console.log('   ❌ Fix issues before deploying');
} else if (warnings.length > 0) {
    console.log('   ⚠️  Deployment ready but address warnings first');
} else {
    console.log('   ✅ System ready for deployment!');
}

console.log('\n🚀 NEXT STEPS:\n');
console.log('   1. Read: 00_START_HERE.txt or DEPLOY_NOW.md');
console.log('   2. Get Supabase credentials: https://supabase.com');
console.log('   3. Create HF Space: https://huggingface.co/spaces/create');
console.log('   4. Deploy: bash deploy.sh (Linux/Mac) or deploy.bat (Windows)');
console.log('   5. Set environment variables in HF Space Settings');
console.log('\n═══════════════════════════════════════════════════════════════\n');

// Exit with appropriate code
process.exit(issues.length > 0 ? 1 : 0);
