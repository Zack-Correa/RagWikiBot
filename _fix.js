const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const msg = 'feat: hosts toggle scripts for proxy activation\n\n- scripts/hosts-toggle.bat: CMD toggle (add/remove hosts entry)\n- scripts/hosts-toggle.ps1: PowerShell toggle with colored output\n- Auto-detects state, flushes DNS, requires Admin\n- Remove /scripts from .gitignore';
const mf = path.join(__dirname, '_msg.txt');
fs.writeFileSync(mf, msg);

try {
    execSync('git add -A', { stdio: 'inherit', cwd: __dirname });
    execSync(`git commit -F "${mf}"`, { stdio: 'inherit', cwd: __dirname });
} finally {
    try { fs.unlinkSync(mf); } catch(e) {}
    try { fs.unlinkSync(__filename); } catch(e) {}
}
