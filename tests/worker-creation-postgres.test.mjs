import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';

test('worker creation accepts both sponsorship types under the production database constraint', async () => {
 const directory = await mkdtemp(resolve('node_modules/.worker-creation-'));
 const pg = new PGlite();
 try {
  const outfile = resolve(directory, 'qa.mjs');
  await build({stdin:{contents:`export * as schema from './db/schema.ts'; export { POST } from './app/api/portal/workers/route.ts'; export { workforceNationalities, workforceProfessions } from './lib/workforce-requirements.ts'; export { saudiBanks } from './lib/saudi-banks.ts'; export {setDb, events} from 'qa-state';`,resolveDir:process.cwd()},outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'isolate',setup(b){
   b.onResolve({filter:/^(qa-state|@\/db|@\/lib\/(portal-access|runtime-env|portal-notifications))$/},()=>({path:'state',namespace:'qa'}));
   b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:`let db; export function getSqlClient(){throw new Error('Unexpected SQL call')} export const events=[]; export const setDb=v=>db=v; export const getDb=()=>db; export async function requirePortalApiRole(){return {role:'admin',user:{email:'qa@test.local'}}} export const canAccessPortalDepartment=()=>true; export const getRuntimeEnv=()=>({BUCKET:{async put(){},async delete(){}}}); export async function emitPortalNotification(event){events.push(event)}`}));
  }}]});
  const qa=await import(pathToFileURL(outfile).href);
  const statements=await generateMigration(generateDrizzleJson({}),generateDrizzleJson(qa.schema));
  for(const statement of statements) await pg.exec(statement);
  const migration=await readFile('drizzle-pg/0032_sponsorship_and_ajir_consistency.sql','utf8');
  await pg.exec(migration);
  qa.setDb(drizzle(pg,{schema:qa.schema}));
  for(const [i,sponsorship] of ['dali','other'].entries()) {
   const form=new FormData();
   for(const [key,value] of Object.entries({workerNumber:`QA-${i}`,iqamaNumber:`200000000${i}`,fullName:'عامل اختبار',nationality:qa.workforceNationalities[0],profession:qa.workforceProfessions[0].label,mobile:'0501234567',iban:'SA0380000000608010167519',bankName:qa.saudiBanks[0],monthlySalary:'2500',sponsorshipType:sponsorship,sponsorName:sponsorship==='other'?'جهة اختبار':'',iqamaExpiry:'2027-01-01',medicalInsuranceExpiry:'2027-01-01'})) form.set(key,value);
   for(const name of ['photo','iqamaDocument','ibanCertificate']) form.set(name,new File([new Uint8Array([137,80,78,71,13,10,26,10,0])],'test.png',{type:'image/png'}));
   const response=await qa.POST(new Request('https://www.dally.info/api/portal/workers',{method:'POST',body:form}));
   const result=await response.json();
   assert.equal(response.status,201,JSON.stringify(result));
   assert.equal(result.attachments.length,3);
   assert.equal(result.worker.sponsorshipType,sponsorship);
  }
  assert.equal((await pg.query('select * from workers')).rows.length,2);
  assert.equal((await pg.query('select * from portal_activity')).rows.length,2);
  assert.equal(qa.events.length,2);
 } finally {await pg.close();await rm(directory,{recursive:true,force:true});}
});
