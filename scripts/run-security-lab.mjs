import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// This lab imports real handlers against ephemeral PGlite. It does not start
// an HTTP scanner, connect to the deployment database, or send customer messages.
const files = [
  'security-adversarial', 'worker-attendance-access-postgres',
  'commercial-workflow-postgres', 'representative-worker-workflow-postgres',
  'legal-lifecycle-postgres', 'contract-field-parity-postgres',
  'canonical-rbac', 'portal-permission-profile', 'storage-and-contract-authority',
  'auth-db-safety', 'enterprise-critical-controls',
].map(name => `tests/${name}.test.mjs`);
const env = { ...process.env };
// Child processes cannot inherit a real application database or auth settings.
for (const key of Object.keys(env)) {
  if (/^(DATABASE|DB_|PG|AUTH_|PORTAL_ADMIN|RESEND|EMAIL_|INTEGRATION_|APP_URL|PUBLIC_APP_URL|RENDER_|UPLOADS_|STORAGE_)/.test(key)) delete env[key];
}
env.APP_URL = 'https://qa.dali.invalid';
const args = ['--test', '--test-concurrency=1', '--test-reporter=tap', ...files];
const startedAt = new Date().toISOString();
let output = '';
const child = spawn(process.execPath, args, { cwd: process.cwd(), env, stdio: ['ignore','pipe','pipe'] });
for (const stream of [child.stdout,child.stderr]) stream.on('data', data => { output += data; process.stdout.write(data); });
const timer = setTimeout(() => child.kill('SIGTERM'), 300_000);
child.on('error', error => { output += String(error); });
child.on('close', async (code,signal) => {
  clearTimeout(timer);
  const directory=resolve('artifacts/security-lab');
  await mkdir(directory,{recursive:true});
  await writeFile(resolve(directory,'results.tap'),output);
  await writeFile(resolve(directory,'summary.json'),JSON.stringify({startedAt,finishedAt:new Date().toISOString(),exitCode:code,signal,files,isolated:true,scope:'in-process handlers and ephemeral PostgreSQL; not a deployed-site scan'},null,2)+'\n');
  process.exitCode=code===0?0:1;
});
