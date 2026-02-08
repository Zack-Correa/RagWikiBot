const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Check what's in scripts/
const scripts = path.join(__dirname, 'scripts');
console.log('Scripts dir contents:', fs.readdirSync(scripts));

const msg = 'fix: add hosts toggle scripts, remove temp files';
const mf = path.join(__dirname, '_msg.txt');
fs.writeFileSync(mf, msg);

try {
    execSync('git add -A', { stdio: 'inherit', cwd: __dirname });
    execSync('git status', { stdio: 'inherit', cwd: __dirname });
    execSync(`git commit -F "${mf}"`, { stdio: 'inherit', cwd: __dirname });
} finally {
    try { fs.unlinkSync(mf); } catch(e) {}
    try { fs.unlinkSync(__filename); } catch(e) {}
}
