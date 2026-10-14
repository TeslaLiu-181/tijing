import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,utimes,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {request} from 'node:http';
import {gzipSync,brotliCompressSync,gunzipSync,brotliDecompressSync} from 'node:zlib';
import {createExamServer} from '../server/exam/http.mjs';

test('public static compression preserves content, cache variants and HEAD while excluding private API replies',async()=>{
 const root=await mkdtemp(join(tmpdir(),'tijing-static-')),assets=join(root,'assets');await mkdir(assets);
 const source=Buffer.from('<!doctype html><meta charset="utf-8"><h1>合成公开页面</h1>'+('公开脚本与公式。'.repeat(1000))),stamp=Date.now()/1000-10;
 for(const name of ['web.html','app.js']){await writeFile(join(assets,name),source);await writeFile(join(assets,name+'.gz'),gzipSync(source));await writeFile(join(assets,name+'.br'),brotliCompressSync(source));await utimes(join(assets,name),stamp,stamp);}
 const app=await createExamServer({dataDir:join(root,'data'),resourceDir:assets,publicOrigin:'http://127.0.0.1',adminUsername:'qa-static',adminPassword:'Synthetic-static-2026',className:'虚构静态验收',aiEnv:{}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const port=app.server.address().port;
 const get=(path,headers={},method='GET')=>new Promise((resolve,reject)=>{const req=request({hostname:'127.0.0.1',port,path,headers,method},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));res.on('error',reject);});req.on('error',reject);req.end();});
 try{
  const plain=await get('/app.js');assert.equal(plain.status,200);assert(plain.body.equals(source));assert.equal(plain.headers['content-encoding'],undefined);assert.match(plain.headers['cache-control'],/public/);
  const br=await get('/app.js',{'accept-encoding':'gzip, br'});assert.equal(br.headers['content-encoding'],'br');assert(br.body.length<source.length);assert(brotliDecompressSync(br.body).equals(source));assert.equal(br.headers.vary,'Accept-Encoding');assert.notEqual(br.headers.etag,plain.headers.etag);
  const gzip=await get('/app.js',{'accept-encoding':'br ; q=0.2, gzip ; q=1'});assert.equal(gzip.headers['content-encoding'],'gzip');assert(gunzipSync(gzip.body).equals(source));assert.notEqual(gzip.headers.etag,br.headers.etag);
  const refused=await get('/app.js',{'accept-encoding':'gzip;q=0, br;q=0'});assert.equal(refused.headers['content-encoding'],undefined);assert(refused.body.equals(source));
  const cached=await get('/app.js',{'accept-encoding':'br','if-none-match':br.headers.etag});assert.equal(cached.status,304);assert.equal(cached.body.length,0);assert.equal(cached.headers.vary,'Accept-Encoding');
  const crossVariant=await get('/app.js',{'accept-encoding':'gzip','if-none-match':br.headers.etag});assert.equal(crossVariant.status,200);assert.equal(crossVariant.headers['content-encoding'],'gzip');
  const head=await get('/app.js',{'accept-encoding':'br'},'HEAD');assert.equal(head.body.length,0);assert.equal(Number(head.headers['content-length']),br.body.length);
  assert.equal((await get('/',{'accept-encoding':'br'})).headers['cache-control'],'no-store');
  assert.equal((await get('/app.js.br')).status,404);
  const privateReply=await get('/api/ai/settings',{'accept-encoding':'br,gzip'});assert.equal(privateReply.status,401);assert.equal(privateReply.headers['content-encoding'],undefined);assert.equal(privateReply.headers['cache-control'],'no-store');
  // A raw file edited after its sidecars must never serve an obsolete build.
  const future=Date.now()/1000+10;await utimes(join(assets,'app.js'),future,future);
  const stale=await get('/app.js',{'accept-encoding':'br,gzip'});assert.equal(stale.headers['content-encoding'],undefined);assert(stale.body.equals(source));
 }finally{await app.close();await rm(root,{recursive:true,force:true});}
});
