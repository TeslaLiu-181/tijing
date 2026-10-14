import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../server/exam/database.mjs';
import {AISettings} from '../server/exam/ai-settings.mjs';
import {HTTPError} from '../server/exam/errors.mjs';
import {Accounts} from '../server/exam/auth.mjs';

test('API configuration secrets, ownership and provider switching',async t=>{
 const data=await mkdtemp(join(tmpdir(),'tijing-api-settings-')),db=await openDatabase(data);
 db.exec("CREATE TABLE ai_jobs(id TEXT,user_id TEXT,status TEXT,api_source TEXT,api_owner_id TEXT NOT NULL DEFAULT '')");
 const accounts=new Accounts(db);await accounts.initialize({adminUsername:'settings-teacher',adminPassword:'Synthetic-teacher-2026',inviteCode:'settings-synthetic'});
 const teacher=(await accounts.login({username:'settings-teacher',password:'Synthetic-teacher-2026'},'fixture')).user;
 const student=async name=>(await accounts.register({username:name,displayName:name,password:'Synthetic-student-2026',inviteCode:'settings-synthetic'},'fixture')).user;
 const alice=await student('settings-alice'),bob=await student('settings-bob');
 const sharedKey='synthetic-shared-'+randomUUID(),personalKey='synthetic-personal-'+randomUUID();
 const validated=[],calls=[];
 const settings=await new AISettings(db,{dataDir:data,env:{EXAM_AI_API_KEY:sharedKey},
  validateEndpoint:async url=>{validated.push(url);if(url.includes('127.0.0.1'))throw new HTTPError(400,'private endpoint');},
  providerFactory:config=>({probe:async options=>{calls.push({config,options});return {ok:true,model:options.vision?(config.visionModel||config.model):config.model,usage:{totalTokens:5}};}})
 }).init();
 try{
  await t.test('student reads only masked shared state and cannot change shared key',async()=>{
   const view=await settings.get(alice);assert(view.shared.configured);assert.equal(view.personal.configured,false);assert.equal(view.canManageShared,false);
   assert(!JSON.stringify(view).includes(sharedKey));assert(!Object.hasOwn(view.shared,'apiKey'));
   await assert.rejects(settings.save(alice,{scope:'shared',apiKey:personalKey}),e=>e.status===403);
  });
  await t.test('personal key is private to actor and is stored with private filesystem modes',async()=>{
   await settings.save(alice,{scope:'personal',apiKey:personalKey,usePersonal:true,model:'text-demo',visionModel:'',jsonMode:false});
   const a=await settings.configurationFor(alice),b=await settings.configurationFor(bob);
   assert.equal(a.apiKey,personalKey);assert.equal(a.apiSource,'personal');assert.equal(a.jsonFormat,false);
   assert.equal(b.apiKey,sharedKey);assert.equal(b.apiSource,'shared');
   for(const user of [alice,bob,teacher]){const view=JSON.stringify(await settings.get(user));assert(!view.includes(personalKey));assert(!view.includes(sharedKey));}
   if(process.platform!=='win32'){assert.equal((await stat(settings.filename(alice,'personal'))).mode&0o777,0o600);assert.equal((await stat(settings.root)).mode&0o777,0o700);}
  });
  await t.test('blank keeps own key; cross-provider change cannot forward an existing key',async()=>{
   await settings.save(alice,{scope:'personal',model:'new-model',apiKey:''});assert.equal((await settings.configurationFor(alice)).apiKey,personalKey);
   await assert.rejects(settings.save(alice,{scope:'personal',baseURL:'https://other.example/v1'}),e=>e.status===400&&e.code==='ai_endpoint_key_change');
   await assert.rejects(settings.save(alice,{scope:'personal',baseURL:'not a URL'}),e=>e.status===400);
   await assert.rejects(settings.save(alice,{scope:'personal',baseURL:'https://127.0.0.1/v1',apiKey:'synthetic-other-key'}),e=>e.status===400);
  });
  await t.test('settings cannot race relevant active jobs',async()=>{
   db.prepare('INSERT INTO ai_jobs(id,user_id,status,api_source) VALUES(?,?,?,?)').run('active-a',alice.id,'running','personal');
   await assert.rejects(settings.save(alice,{scope:'personal',model:'busy'}),e=>e.status===409);
   await settings.save(teacher,{scope:'shared',model:'shared-new'});
   db.prepare('INSERT INTO ai_jobs(id,user_id,status,api_source) VALUES(?,?,?,?)').run('active-b',bob.id,'queued','shared');
   await assert.rejects(settings.save(teacher,{scope:'shared',model:'busy'}),e=>e.status===409);
   db.exec('DELETE FROM ai_jobs');
  });
  await t.test('clearing personal key disables personal source without revealing the shared key',async()=>{
   await settings.save(alice,{scope:'personal',clearKey:true});const view=await settings.get(alice);
   assert.equal(view.personal.configured,false);assert.equal(view.personal.usePersonal,false);assert.equal(view.activeSource,'shared');
   const persisted=JSON.parse(await readFile(settings.filename(alice,'personal'),'utf8'));assert.equal(persisted.apiKey,'');
   assert.equal((await settings.configurationFor(alice)).apiKey,sharedKey);
  });
  await t.test('text/vision connection probes return UI contract and enforce per-user throttling',async()=>{
   const a=await settings.probe(teacher,{scope:'shared',vision:true});assert.equal(a.connected,true);assert.equal(calls.at(-1).options.vision,true);
   await settings.probe(teacher,{scope:'shared'});await settings.probe(teacher,{scope:'shared'});
   await assert.rejects(settings.probe(teacher,{scope:'shared'}),e=>e.status===429);
   assert(validated.length>0);
  });
  await t.test('broken endpoint can be disabled or cleared without DNS; malformed probe is a client error',async()=>{
   await settings.save(alice,{scope:'personal',apiKey:personalKey,usePersonal:true});
   const validate=settings.validateEndpoint;settings.validateEndpoint=async()=>{throw new HTTPError(400,'synthetic endpoint is unavailable');};
   await settings.save(alice,{scope:'personal',usePersonal:false});assert.equal((await settings.get(alice)).activeSource,'shared');
   await settings.save(alice,{scope:'personal',clearKey:true});assert.equal((await settings.get(alice)).personal.configured,false);
   settings.validateEndpoint=validate;await assert.rejects(settings.probe(alice,null),e=>e.status===400);
  });
  await t.test('partial writes serialize and daily probe limits survive a fresh settings instance',async()=>{
   await Promise.all([settings.save(bob,{scope:'personal',model:'concurrent-model'}),settings.save(bob,{scope:'personal',visionModel:'concurrent-vision'})]);
   const saved=(await settings.get(bob)).personal;assert.equal(saved.model,'concurrent-model');assert.equal(saved.visionModel,'concurrent-vision');
   await settings.probe(bob,{scope:'personal',apiKey:personalKey});
   db.prepare('UPDATE ai_config_probe_usage SET calls=20 WHERE user_id=?').run(bob.id);
   const reloaded=await new AISettings(db,{dataDir:data,env:{EXAM_AI_API_KEY:sharedKey},validateEndpoint:async()=>{},providerFactory:()=>({probe:async()=>{throw Error('Limit should prevent provider calls');}})}).init();
   await assert.rejects(reloaded.probe(bob,{scope:'personal',apiKey:personalKey}),e=>e.status===429);
  });
  await t.test('saved config survives a fresh settings instance; explicit shared clear overrides environment',async()=>{
   await settings.save(teacher,{scope:'shared',clearKey:true});const reloaded=await new AISettings(db,{dataDir:data,env:{EXAM_AI_API_KEY:sharedKey},validateEndpoint:async()=>{}}).init();
   assert.equal((await reloaded.get(bob)).shared.configured,false);assert.equal((await reloaded.configurationFor(bob)).apiKey,'');
  });
 }finally{db.close();await rm(data,{recursive:true,force:true});}
});
