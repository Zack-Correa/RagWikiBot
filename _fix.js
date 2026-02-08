const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const msg = 'chore: remove temp commit helper files';
const mf = path.join(__dirname, '_msg.txt');
fs.writeFileSync(mf, msg);

execSync('git add -A', { stdio: 'inherit', cwd: __dirname });
execSync(`git commit -F "${mf}"`, { stdio: 'inherit', cwd: __dirname });

// Self-cleanup + commit
try { fs.unlinkSync(mf); } catch(e) {}
try { fs.unlinkSync(__filename); } catch(e) {}
execSync('git add -A', { stdio: 'inherit', cwd: __dirname });
execSync('git commit -m "chore: cleanup temp files"', { stdio: 'inherit', cwd: __dirname });
