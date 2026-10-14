import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../server/exam/database.mjs';
import {Accounts} from '../server/exam/auth.mjs';
import {WechatAccounts} from '../server/exam/wechat-accounts.mjs';

test('official OAuth state, browser binding, one-use completion, unique links and password-protected unlink',async()=>{
 const root=await mkdtemp(join(tmpdir(),'tijing-wechat-')),db=await openDatabase(root),accounts=new Accounts(db,{secureCookie:true});
 await accounts.initialize({adminUsername:'wechat-admin',adminPassword:'Admin-synthetic-2026',inviteCode:'wechat-synthetic'});
 const calls=[],env={EXAM_WECHAT_ENABLED:'1',EXAM_WECHAT_APP_ID:'wxSyntheticAppId',EXAM_WECHAT_APP_SECRET:'synthetic-never-public-secret'};
 const wechat=new WechatAccounts(db,accounts,{publicOrigin:'https://class.example',env,fetcher:async url=>{
  calls.push(new URL(url));return {ok:true,json:async()=>url.pathname.includes('access_token')?{openid:'synthetic-openid',unionid:'synthetic-unionid',access_token:'synthetic-access-token'}:{openid:'synthetic-openid',nickname:'合成微信用户'}};
 }});
 const begin=intent=>{const result=wechat.start({headers:{}},{intent},null,'synthetic-ip');return {state:new URL(result.url).searchParams.get('state'),request:{headers:{cookie:result.cookies[0].split(';')[0]}},result};};
 const params=flow=>new URLSearchParams({state:flow.state,code:'synthetic-code'});
 try{
  const flow=begin('register-teacher');assert.match(flow.result.url,/^https:\/\/open.weixin.qq.com\/connect\/qrconnect\?/);assert(!flow.result.url.includes(env.EXAM_WECHAT_APP_SECRET));
  await assert.rejects(wechat.callback({headers:{}},params(flow),null),e=>e.status===400);assert.equal(calls.length,0);
  const callback=await wechat.callback(flow.request,params(flow),null);assert.equal(callback.redirect,'/?wechat=complete');assert.equal(calls.length,2);
  await assert.rejects(wechat.callback(flow.request,params(flow),null),e=>e.status===400);assert.equal(calls.length,2);
  const request={headers:{cookie:flow.request.headers.cookie+'; '+callback.cookies[0].split(';')[0]}};
  const pending=wechat.status(request);assert.equal(pending.pending.role,'teacher');assert(!JSON.stringify(pending).includes('openid'));assert(!JSON.stringify(pending).includes('secret'));
  const auth=await wechat.complete(request,{username:'wx-new-teacher',displayName:'合成教师',password:'Teacher-synthetic-2026',role:'admin',isPlatformAdmin:true},'synthetic-ip');
  assert.equal(auth.user.role,'teacher');assert.equal(auth.user.isPlatformAdmin,false);assert.equal(wechat.account(auth.user).bound,true);
  await assert.rejects(wechat.complete(request,{username:'duplicate-teacher',displayName:'重复',password:'Teacher-synthetic-2026'},'synthetic-ip'),e=>e.status===400);
  assert.equal(db.prepare("SELECT count(*) n FROM users WHERE username='duplicate-teacher'").get().n,0);
  const login=begin('login'),signedIn=await wechat.callback(login.request,params(login),null);assert.equal(signedIn.redirect,'/?wechat=logged-in');
  const sessionCookie=signedIn.cookies.find(value=>value.startsWith('exam_session='));assert.equal(accounts.authenticate({headers:{cookie:sessionCookie.split(';')[0]}}).user.id,auth.user.id);
  const admin=await accounts.login({username:'wechat-admin',password:'Admin-synthetic-2026'},'fixture');
  const session=accounts.authenticate({headers:{cookie:admin.cookie.split(';')[0]}}),bindRequest={headers:{cookie:admin.cookie.split(';')[0],'x-csrf-token':session.csrf}};
  const bind=wechat.start(bindRequest,{intent:'bind'},session,'synthetic-ip');bindRequest.headers.cookie+='; '+bind.cookies[0].split(';')[0];
  await assert.rejects(wechat.callback(bindRequest,new URLSearchParams({state:new URL(bind.url).searchParams.get('state'),code:'synthetic-code'}),session),e=>e.status===409);
  assert.equal(wechat.account(admin.user).bound,false);
  const expired=begin('login');db.prepare('UPDATE wechat_flows SET expires_at=0 WHERE used=0').run();await assert.rejects(wechat.callback(expired.request,params(expired),null),e=>e.status===400);
  await assert.rejects(wechat.unbind(auth.user,'Wrong-password-2026'),e=>e.status===400);
  assert.equal((await wechat.unbind(auth.user,'Teacher-synthetic-2026')).bound,false);
  assert(calls.every(url=>url.origin==='https://api.weixin.qq.com'));
  const disabled=new WechatAccounts(db,accounts,{publicOrigin:'https://class.example',env:{}});assert.equal(disabled.status({headers:{}}).enabled,false);assert.throws(()=>disabled.start({headers:{}},{intent:'login'},null,'fixture'),e=>e.status===503);
 }finally{db.close();await rm(root,{recursive:true,force:true});}
});
