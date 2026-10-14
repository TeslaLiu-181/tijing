import {createHash,randomBytes} from 'node:crypto';
import {transaction} from './database.mjs';
import {HTTPError,requireCondition} from './errors.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const token=()=>randomBytes(32).toString('base64url');
const cookie=(request,name)=>(request.headers.cookie||'').split(';').map(part=>part.trim()).find(part=>part.startsWith(name+'='))?.slice(name.length+1)||'';

// Official website OAuth only. No simulated identity or mock-login route is
// available in production; the provider dependency is injectable in unit tests.
export class WechatAccounts {
 constructor(db,accounts,{publicOrigin,env=process.env,fetcher=fetch}={}){
  this.db=db;this.accounts=accounts;this.fetcher=fetcher;this.origin=publicOrigin;this.secure=publicOrigin.startsWith('https:');
  this.appId=env.EXAM_WECHAT_APP_ID||'';this.secret=env.EXAM_WECHAT_APP_SECRET||'';
  this.redirect=env.EXAM_WECHAT_REDIRECT_URI||new URL('/api/auth/wechat/callback',publicOrigin).href;
  this.enabled=false;this.message='微信登录尚未开通，可先使用账号密码。';
  if(env.EXAM_WECHAT_ENABLED==='1'&&this.appId&&this.secret){
   try{const redirect=new URL(this.redirect);this.enabled=redirect.protocol==='https:'&&redirect.origin===new URL(publicOrigin).origin&&redirect.pathname==='/api/auth/wechat/callback'&&!redirect.search&&!redirect.hash&&!redirect.username&&!redirect.password;
    if(!this.enabled)this.message='微信回调地址尚未正确配置，请联系平台管理员。';
   }catch{this.message='微信回调地址尚未正确配置，请联系平台管理员。';}
  }
  db.exec(`CREATE TABLE IF NOT EXISTS wechat_identities (
   user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,app_id TEXT NOT NULL,open_id TEXT NOT NULL,union_id TEXT,linked_at TEXT NOT NULL,
   UNIQUE(app_id,open_id));
   CREATE UNIQUE INDEX IF NOT EXISTS wechat_union_id ON wechat_identities(union_id) WHERE union_id IS NOT NULL;
   CREATE TABLE IF NOT EXISTS wechat_flows (
   state_hash TEXT PRIMARY KEY,browser_hash TEXT NOT NULL,intent TEXT NOT NULL,user_id TEXT REFERENCES users(id),session_hash TEXT,
   expires_at INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0,pending_hash TEXT UNIQUE,identity_json TEXT);
  `);
  this.starts=new Map();
 }
 cookies(name,value=''){return `${name}=${value}; Path=/api/auth/wechat; HttpOnly; SameSite=Lax; Max-Age=${value?600:0}${this.secure?'; Secure':''}`;}
 status(request){
  const pending=this.pending(request,false);
  return {enabled:this.enabled,message:this.enabled?'通过微信官方页面扫码确认后返回。':this.message,pending:pending?{role:pending.intent==='register-teacher'?'teacher':'student',nickname:JSON.parse(pending.identity_json).nickname||''}:null};
 }
 account(user){const row=this.db.prepare('SELECT linked_at FROM wechat_identities WHERE user_id=?').get(user.id);return {enabled:this.enabled,message:this.enabled?'微信已开通，可绑定后扫码登录。':this.message,bound:!!row,linkedAt:row?.linked_at||null};}
 start(request,input,session,address){
  requireCondition(this.enabled,503,this.message,'wechat_unconfigured');
  const intent=input?.intent||'login';requireCondition(['login','register-teacher','register-student','bind'].includes(intent),400,'微信操作不正确');
  if(intent==='bind'){requireCondition(session,401,'请先登录再绑定微信');requireCondition(request.headers['x-csrf-token']===session.csrf,403,'登录状态已改变，请刷新后重试');}
  else requireCondition(!session,409,'请先退出当前账号，或在账号中心绑定微信');
  const now=Date.now(),recent=(this.starts.get(address)||[]).filter(time=>now-time<60000);requireCondition(recent.length<10,429,'二维码请求过于频繁，请稍后再试');this.starts.set(address,[...recent,now]);
  this.db.prepare('DELETE FROM wechat_flows WHERE expires_at<?').run(now);
  const state=token(),browser=token();
  this.db.prepare('INSERT INTO wechat_flows(state_hash,browser_hash,intent,user_id,session_hash,expires_at) VALUES(?,?,?,?,?,?)').run(hash(state),hash(browser),intent,session?.user.id||null,session?.hash||null,now+600000);
  const url=new URL('https://open.weixin.qq.com/connect/qrconnect');
  url.search=new URLSearchParams({appid:this.appId,redirect_uri:this.redirect,response_type:'code',scope:'snsapi_login',state,lang:'cn'}).toString();url.hash='wechat_redirect';
  return {url:url.href,cookies:[this.cookies('exam_wechat',browser),this.cookies('exam_wechat_pending')]};
 }
 async provider(path,values){
  const url=new URL(path,'https://api.weixin.qq.com');url.search=new URLSearchParams(values).toString();
  try{const response=await this.fetcher(url,{signal:AbortSignal.timeout(10000),redirect:'error'});if(!response.ok)throw Error('provider');const result=await response.json();if(result.errcode)throw Error('provider');return result;}
  catch{throw new HTTPError(502,'微信授权未完成或已过期，请重新扫码','wechat_provider_failed');}
 }
 link(userId,identity){
  const existing=this.db.prepare('SELECT user_id FROM wechat_identities WHERE (app_id=? AND open_id=?) OR (union_id IS NOT NULL AND union_id=?)').get(this.appId,identity.openid,identity.unionid||null);
  requireCondition(!existing||existing.user_id===userId,409,'该微信已绑定其他账号，请先登录原账号处理','wechat_already_bound');
  const mine=this.db.prepare('SELECT open_id,app_id FROM wechat_identities WHERE user_id=?').get(userId);
  requireCondition(!mine||(mine.open_id===identity.openid&&mine.app_id===this.appId),409,'当前账号已绑定另一个微信，请先解除原绑定');
  this.db.prepare('INSERT INTO wechat_identities(user_id,app_id,open_id,union_id,linked_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO NOTHING').run(userId,this.appId,identity.openid,identity.unionid||null,new Date().toISOString());
 }
 async callback(request,params,session){
  requireCondition(this.enabled,503,this.message);
  const state=params.get('state')||'',browser=cookie(request,'exam_wechat'),code=params.get('code')||'';
  requireCondition(/^[\w-]{43}$/.test(state)&&/^[\w-]{43}$/.test(browser)&&code.length>0&&code.length<=512,400,'微信回调不完整，请重新扫码','wechat_invalid_state');
  const row=this.db.prepare('SELECT * FROM wechat_flows WHERE state_hash=? AND browser_hash=? AND used=0 AND expires_at>?').get(hash(state),hash(browser),Date.now());
  requireCondition(row,400,'扫码已过期或不是从当前浏览器发起，请重新扫码','wechat_invalid_state');
  if(row.intent==='bind')requireCondition(session?.user.id===row.user_id&&session?.hash===row.session_hash,403,'绑定期间登录状态已改变，请重新发起绑定');
  requireCondition(this.db.prepare('UPDATE wechat_flows SET used=1 WHERE state_hash=? AND used=0').run(row.state_hash).changes===1,400,'此二维码已使用，请重新扫码');
  const credential=await this.provider('/sns/oauth2/access_token',{appid:this.appId,secret:this.secret,code,grant_type:'authorization_code'});
  requireCondition(typeof credential.openid==='string'&&credential.openid.length>0&&credential.openid.length<=255&&typeof credential.access_token==='string',502,'微信未返回有效身份');
  const identity={openid:credential.openid,unionid:typeof credential.unionid==='string'&&credential.unionid.length<=255?credential.unionid:null};
  const clear=[this.cookies('exam_wechat'),this.cookies('exam_wechat_pending')];
  if(row.intent==='bind'){
   transaction(this.db,()=>{this.link(session.user.id,identity);this.db.prepare('DELETE FROM wechat_flows WHERE state_hash=?').run(row.state_hash);});
   return {redirect:'/?wechat=bound',cookies:clear};
  }
  const linked=this.db.prepare('SELECT u.* FROM wechat_identities w JOIN users u ON u.id=w.user_id WHERE (w.app_id=? AND w.open_id=?) OR (w.union_id IS NOT NULL AND w.union_id=?)').get(this.appId,identity.openid,identity.unionid);
  if(linked){requireCondition(!linked.disabled,403,'此账号已停用，请联系平台管理员');const auth=this.accounts.session(linked);this.db.prepare('DELETE FROM wechat_flows WHERE state_hash=?').run(row.state_hash);return {redirect:'/?wechat=logged-in',cookies:[...clear,auth.cookie]};}
  const info=await this.provider('/sns/userinfo',{access_token:credential.access_token,openid:identity.openid,lang:'zh_CN'});
  requireCondition(info.openid===identity.openid,502,'微信身份校验未通过');identity.nickname=typeof info.nickname==='string'?info.nickname.slice(0,30):'';
  // Never retain OAuth access/refresh tokens. Pending data cannot sign in until
  // local account creation and unique identity binding commit together.
  const ticket=token();this.db.prepare('UPDATE wechat_flows SET pending_hash=?,identity_json=?,expires_at=? WHERE state_hash=?').run(hash(ticket),JSON.stringify(identity),Date.now()+600000,row.state_hash);
  return {redirect:'/?wechat=complete',cookies:[this.cookies('exam_wechat_pending',ticket)]};
 }
 pending(request,required=true){
  const ticket=cookie(request,'exam_wechat_pending'),browser=cookie(request,'exam_wechat');
  const row=ticket&&browser?this.db.prepare('SELECT * FROM wechat_flows WHERE pending_hash=? AND browser_hash=? AND used=1 AND expires_at>?').get(hash(ticket),hash(browser),Date.now()):null;
  if(required)requireCondition(row,400,'微信注册已过期，请重新扫码');return row;
 }
 async complete(request,input,address){
  requireCondition(this.enabled,503,this.message);const pending=this.pending(request),role=pending.intent==='register-teacher'?'teacher':'student';
  const method=role==='teacher'?'registerTeacher':'register';
  const auth=await this.accounts[method](input,address,{onCreate:id=>{
   // Recheck expiry after password hashing; the hook runs in the same SQLite
   // transaction as account creation, so competing completions cannot orphan users.
   const row=this.pending(request);requireCondition(row.state_hash===pending.state_hash,400,'微信注册状态已改变');
   this.link(id,JSON.parse(row.identity_json));this.db.prepare('DELETE FROM wechat_flows WHERE state_hash=?').run(row.state_hash);
  }});
  return {...auth,cookies:[auth.cookie,this.cookies('exam_wechat_pending'),this.cookies('exam_wechat')]};
 }
 async unbind(user,password){await this.accounts.verifyCurrentPassword(user,password);this.db.prepare('DELETE FROM wechat_identities WHERE user_id=?').run(user.id);return this.account(user);}
}
