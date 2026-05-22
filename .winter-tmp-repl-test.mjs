import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['bin/winter.js'], { cwd: process.cwd(), stdio: ['pipe','pipe','pipe'] });
let out=''; let err='';
child.stdout.on('data', d => { out += d.toString(); process.stdout.write('[OUT]'+d.toString()); });
child.stderr.on('data', d => { err += d.toString(); process.stderr.write('[ERR]'+d.toString()); });
setTimeout(()=>{ child.stdin.write('hello\n'); }, 5000);
setTimeout(()=>{ child.stdin.write('/exit\n'); }, 25000);
setTimeout(()=>{ child.kill('SIGTERM'); }, 30000);
child.on('exit', (code, signal)=>{ console.log('\nEXIT', code, signal); });
