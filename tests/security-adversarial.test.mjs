import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHmac } from 'node:crypto';
import { build } from 'esbuild';
import { PGlite } from '@electric-sql/pglite';

// Real security functions and PostgreSQL rate-limit queries. Only framework
// headers, runtime configuration and database transport are injected.
let qa, pg, directory;
const secret = 'isolated-test-secret-never-use-in-production-0123456789';
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dali-security-'));
  const outfile = join(directory, 'qa.mjs');
  await build({ stdin: { contents: `export * as security from './lib/security.ts'; export * as auth from './lib/credential-auth.ts'; export * as permissions from './lib/portal-permissions.ts'; export * from 'qa-state';`, resolveDir: process.cwd() }, outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', plugins: [{ name: 'isolated-security', setup(b) {
    b.onResolve({ filter: /^(qa-state|next\/headers|@\/db|@\/lib\/runtime-env|@\/lib\/portal-auth-config)$/ }, () => ({ path: 'state', namespace: 'qa' }));
    b.onLoad({ filter: /.*/, namespace: 'qa' }, () => ({ contents: `let requestHeaders=new Headers(), sql; export function setHeaders(v){requestHeaders=v} export async function headers(){return requestHeaders} export function setSql(v){sql=v} export function getSqlClient(){return sql} export function getRuntimeEnv(){return {}} export function getConfiguredAuthSecret(){return ${JSON.stringify(secret)}} export function getPortalAdminConfig(){return {passwordHash:''}}` }));
  } }] });
  qa = await import(pathToFileURL(outfile));
  pg = new PGlite();
  await pg.exec('CREATE TABLE public_rate_limits (key text primary key, window_started_at text not null, request_count integer not null, blocked_until text, updated_at text not null)');
  qa.setSql({ unsafe: async (query, args) => (await pg.query(query, args)).rows });
});
after(async () => { await pg?.close(); if (directory) await rm(directory, { recursive: true, force: true }); });
function request(headers = {}, body = '{}') { return new Request('https://qa.dali.invalid/api/test', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body }); }
async function identity(token) { qa.setHeaders(new Headers({ cookie: `__Host-dali_identity=${encodeURIComponent(token)}` })); return qa.auth.readCredentialIdentity(); }
function signed(payload) { const data = Buffer.from(JSON.stringify(payload)).toString('base64url'); return `${data}.${createHmac('sha256', secret).update(data).digest('base64url')}`; }

test('identity: valid token, payload tampering and forged signatures', async () => {
  const token = await qa.auth.createIdentityToken('staff@qa.invalid', 'QA');
  assert.equal((await identity(token)).email, 'staff@qa.invalid');
  const [payload, signature] = token.split('.');
  const altered = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), email: 'owner@qa.invalid', authStrength: 'mfa' })).toString('base64url');
  for (const attack of [`${altered}.${signature}`, `${payload}.AAAA`, 'none', '%', '']) assert.equal(await identity(attack), null);
});
test('identity: reject ambiguous token framing', async () => {
  const token = await qa.auth.createIdentityToken('staff@qa.invalid', 'QA');
  assert.equal(await identity(`${token}.extra`), null);
});
test('identity: reject expired or malformed signed claims', async () => {
  for (const exp of [0, 1, null, 'tomorrow', undefined]) assert.equal(await identity(signed({ email: 'staff@qa.invalid', displayName: 'QA', exp })), null);
  assert.equal(await identity(signed({ email: { role: 'admin' }, exp: Math.floor(Date.now()/1000)+100 })), null);
});
test('password: incorrect password and weak hashes fail closed', async () => {
  const encoded = await qa.auth.hashPassword('QA-only-password!123');
  assert.equal(await qa.auth.verifyPasswordHash('QA-only-password!123', encoded), true);
  assert.equal(await qa.auth.verifyPasswordHash('wrong', encoded), false);
  for (const hash of ['', 'plain$1$a$b', 'pbkdf2$100$a$b']) assert.equal(await qa.auth.verifyPasswordHash('anything', hash), false);
});
test('CSRF: foreign, malformed, suffix-confusion and cross-site origins rejected', () => {
  for (const origin of ['https://evil.invalid', 'https://qa.dali.invalid.evil.invalid', 'null', '://']) assert.equal(qa.security.rejectCrossSiteRequest(request({ origin })), true);
  assert.equal(qa.security.rejectCrossSiteRequest(request({ origin: 'https://qa.dali.invalid' })), false);
  assert.equal(qa.security.rejectCrossSiteRequest(request({ origin: 'https://qa.dali.invalid', 'sec-fetch-site': 'cross-site' })), true);
});
test('JSON: oversized actual body bypassing declared length, invalid UTF-8 and invalid syntax', async () => {
  for (const [headers, body, status] of [[{'content-length':'1'}, JSON.stringify('x'.repeat(500)),413], [{}, '{',400], [{'content-type':'text/plain'},'{}',415]]) {
    const result = await qa.security.readLimitedJson(request(headers,body),64); assert.equal(result.ok,false); assert.equal(result.response.status,status);
  }
  const result = await qa.security.readLimitedJson(request({},new Uint8Array([0xff,0xfe])),64);
  assert.equal(result.response.status,400);
});
test('uploads: MIME spoofing, empty and oversized files rejected', async () => {
  const rule = {contentTypes:new Set(['application/pdf']),maxBytes:32};
  for (const file of [new File(['<script>alert(1)</script>'],'fake.pdf',{type:'application/pdf'}),new File([],'empty.pdf',{type:'application/pdf'}),new File(['%PDF-'+ 'x'.repeat(50)],'large.pdf',{type:'application/pdf'}),new File(['%PDF-'],'fake.html',{type:'text/html'})]) assert.equal((await qa.security.validateUploadedFile(file,rule)).valid,false);
});
test('rate-limit: concurrent requests cannot exceed quota through query races', async () => {
  const options={scope:'qa-concurrent',limit:5,windowSeconds:60};
  const responses=await Promise.all(Array.from({length:20},()=>qa.security.enforcePublicRateLimit(request({'user-agent':'qa','x-forwarded-for':'192.0.2.1'}),options)));
  assert.equal(responses.filter(x=>x.allowed).length,5);
  assert.ok(responses.filter(x=>!x.allowed).every(x=>x.retryAfterSeconds>0));
});
test('permission profiles: cannot grant permissions absent from the supplied role', () => {
  for (const profile of ['read_only','operator','role_default']) {
    const rules=qa.permissions.permissionsForProfile(['finance.read'],profile);
    assert.deepEqual(rules.filter(x=>x.allowed).map(x=>`${x.resource}.${x.action}`),['finance.read']);
  }
});
test('rate-limit: rotating User-Agent on one IP cannot reset the quota', async () => {
  const options={scope:'qa-agent-rotation',limit:5,windowSeconds:60};
  const responses=[];
  for(let i=0;i<20;i++) responses.push(await qa.security.enforcePublicRateLimit(request({'user-agent':`qa-${i}`,'x-forwarded-for':'192.0.2.2'}),options));
  assert.equal(responses.filter(x=>x.allowed).length,5);
});
test('secure identity cookie: browser protections remain enforced', async () => {
  const cookie=qa.auth.identityCookie(request(),'qa');
  for (const flag of ['__Host-dali_identity=', '; HttpOnly', '; SameSite=Strict', '; Secure', '; Path=/']) assert.ok(cookie.includes(flag));
  assert.ok(!cookie.includes('Domain='));
});
test('rate-limit: forged proxy prefixes and Cloudflare headers cannot rotate a trusted peer quota', async () => {
  const options={scope:'qa-forwarded-spoof',limit:5,windowSeconds:60};
  const responses=[];
  for(let i=0;i<20;i++) responses.push(await qa.security.enforcePublicRateLimit(request({
    'x-forwarded-for':`198.51.100.${i+1}, 192.0.2.3`,
    'cf-connecting-ip':`203.0.113.${i+1}`,
  }),options));
  assert.equal(responses.filter(x=>x.allowed).length,5);
  const other=await qa.security.enforcePublicRateLimit(request({'x-forwarded-for':'192.0.2.4'}),options);
  assert.equal(other.allowed,true);
});
