const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const msg = `feat: hosts toggle scripts for proxy activation

- scripts/hosts-toggle.bat: CMD script to add/remove hosts redirect
- scripts/hosts-toggle.ps1: PowerShell equivalent with colored output
- Auto-detects state and toggles (add/remove)
- Flushes DNS cache, requires Administrator`;

const msgFile = path.join(__dirname, '_commit_msg.txt');
fs.writeFileSync(msgFile, msg);

try {
    execSync('git add -A', { stdio: 'inherit', cwd: __dirname });
    execSync(`git commit -F "${msgFile}"`, { stdio: 'inherit', cwd: __dirname });
} finally {
    try { fs.unlinkSync(msgFile); } catch(e) {}
    try { fs.unlinkSync(__filename); } catch(e) {}
}
