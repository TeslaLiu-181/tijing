import {mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {transaction} from './database.mjs';
import {requireCondition, HTTPError} from './errors.mjs';

const colors = ['teal','blue','amber','violet','rose'];
const imageURL = id => id ? '/api/profile/images/' + id : null;
export function profileAppearance(db, userId) {
  const row = db.prepare('SELECT * FROM community_profiles WHERE user_id=?').get(userId) || {};
  return {bio:row.bio||'', color:row.color||'teal', headline:row.headline||'', subject:row.subject||'', grade:row.grade||'',
    interests:JSON.parse(row.interests_json||'[]'), avatarId:row.avatar_id||null, coverId:row.cover_id||null,
    avatarURL:imageURL(row.avatar_id), coverURL:imageURL(row.cover_id), coverPosition:row.cover_position??50, version:row.version||1};
}

export function updateProfile(db, user, input, version) {
  requireCondition(input && typeof input==='object' && !Array.isArray(input),400,'个人资料格式不正确');
  const old = profileAppearance(db,user.id), next = {...old};
  const fields = {bio:300,headline:60,subject:30,grade:30};
  for (const [key,limit] of Object.entries(fields)) if(input[key]!==undefined) {
    requireCondition(typeof input[key]==='string' && input[key].trim().length<=limit,400,`资料中的${key}最多${limit}字`);
    next[key]=input[key].trim();
  }
  const account=db.prepare('SELECT display_name FROM users WHERE id=? AND disabled=0').get(user.id);
  requireCondition(account,401,'账号已失效');
  const name=input.displayName===undefined?account.display_name:input.displayName;
  requireCondition(typeof name==='string' && name.trim().length>=1 && name.trim().length<=30,400,'昵称须为1–30个字符');
  if(input.color!==undefined){requireCondition(colors.includes(input.color),400,'请选择支持的主题色');next.color=input.color;}
  if(input.interests!==undefined){
    requireCondition(Array.isArray(input.interests)&&input.interests.length<=8&&input.interests.every(tag=>typeof tag==='string'&&tag.trim().length>0&&tag.trim().length<=20),400,'最多8个兴趣课题，每个1–20字');
    next.interests=[...new Set(input.interests.map(tag=>tag.trim()))];
  }
  if(input.coverPosition!==undefined){requireCondition(Number.isInteger(input.coverPosition)&&input.coverPosition>=0&&input.coverPosition<=100,400,'背景位置须在0–100之间');next.coverPosition=input.coverPosition;}
  for(const [key,kind] of [['avatarId','avatar'],['coverId','cover']]) if(input[key]!==undefined){
    requireCondition(input[key]===null||typeof input[key]==='string',400,'图片编号不正确');
    if(input[key]!==null)requireCondition(db.prepare('SELECT 1 FROM profile_images WHERE id=? AND user_id=? AND kind=?').get(input[key],user.id,kind),404,'图片不存在或不属于你');
    next[key]=input[key];
  }
  transaction(db,()=>{
    const current=profileAppearance(db,user.id);
    if(version!==undefined)requireCondition(Number.isSafeInteger(version)&&version===current.version,409,'资料已在其他页面更新，请刷新后再保存','profile_version_conflict');
    db.prepare(`INSERT INTO community_profiles(user_id,bio,color,headline,subject,grade,interests_json,avatar_id,cover_id,cover_position,version,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET bio=excluded.bio,color=excluded.color,headline=excluded.headline,
      subject=excluded.subject,grade=excluded.grade,interests_json=excluded.interests_json,avatar_id=excluded.avatar_id,cover_id=excluded.cover_id,
      cover_position=excluded.cover_position,version=excluded.version,updated_at=excluded.updated_at`)
      .run(user.id,next.bio,next.color,next.headline,next.subject,next.grade,JSON.stringify(next.interests),next.avatarId,next.coverId,next.coverPosition,current.version+1,new Date().toISOString());
    db.prepare('UPDATE users SET display_name=? WHERE id=?').run(name.trim(),user.id);
  });
  return profileAppearance(db,user.id);
}

export class AccountProfiles {
  constructor(db,{dataDir}){this.db=db;this.root=join(dataDir,'profile-images');this.uploads=new Map();}
  async init(){await mkdir(this.root,{recursive:true,mode:0o700});return this;}
  async upload(user,input){
    requireCondition(input&&['avatar','cover'].includes(input.kind),400,'请选择头像或背景图片');
    requireCondition(typeof input.data==='string'&&input.data.length<=Math.ceil(4*1024*1024/3)*4&&/^[A-Za-z0-9+/]*={0,2}$/.test(input.data),413,'请上传4 MB以内的 JPG、PNG 或 WebP 图片');
    requireCondition(!this.uploads.has(user.id),429,'上一张图片仍在处理，请稍候');this.uploads.set(user.id,true);
    try {
      const bytes=Buffer.from(input.data,'base64');requireCondition(bytes.length>0&&bytes.length<=4*1024*1024,413,'图片不能超过4 MB');
      let output;
      try {
        const photo=sharp(bytes,{limitInputPixels:20_000_000,failOn:'error'}),meta=await photo.metadata();
        requireCondition(['jpeg','png','webp'].includes(meta.format)&&(meta.pages||1)===1,400,'只支持静态 JPG、PNG 或 WebP 图片');
        // Decode and re-encode; never serve an uploaded SVG/HTML or retain EXIF.
        output=await photo.rotate().resize(input.kind==='avatar'?{width:512,height:512,fit:'cover'}:{width:1600,height:1200,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();
      } catch(error) {if(error instanceof HTTPError)throw error;throw new HTTPError(400,'无法读取图片，请换一张静态 JPG、PNG 或 WebP 图片');}
      const id='profile-'+randomUUID(),path=join(this.root,id+'.webp');
      await writeFile(path,output,{mode:0o600,flag:'wx'});
      try{this.db.prepare('INSERT INTO profile_images(id,user_id,kind,bytes,created_at) VALUES(?,?,?,?,?)').run(id,user.id,input.kind,output.length,new Date().toISOString());}
      catch(error){await rm(path,{force:true});throw error;}
      // Keep current pictures and four pending previews; cancelled edits cannot
      // accumulate an unbounded second attachment store outside resource quota.
      const pending=this.db.prepare(`SELECT i.id FROM profile_images i LEFT JOIN community_profiles p ON p.user_id=i.user_id
        WHERE i.user_id=? AND i.id IS NOT p.avatar_id AND i.id IS NOT p.cover_id ORDER BY i.created_at DESC,i.id DESC`).all(user.id);
      for(const old of pending.slice(4)){
        const removed=this.db.prepare('DELETE FROM profile_images WHERE id=? AND NOT EXISTS(SELECT 1 FROM community_profiles WHERE avatar_id=? OR cover_id=?)').run(old.id,old.id,old.id).changes;
        if(removed)await rm(join(this.root,old.id+'.webp'),{force:true});
      }
      return {id,url:imageURL(id),kind:input.kind,bytes:output.length};
    } finally {this.uploads.delete(user.id);}
  }
  async image(user,id){
    requireCondition(/^profile-[a-f0-9-]{36}$/.test(id),404,'图片不存在');
    const row=this.db.prepare(`SELECT i.*,p.avatar_id,p.cover_id,u.disabled FROM profile_images i JOIN users u ON u.id=i.user_id
      LEFT JOIN community_profiles p ON p.user_id=i.user_id WHERE i.id=?`).get(id);
    requireCondition(row&&!row.disabled&&(row.user_id===user.id||row.avatar_id===id||row.cover_id===id),404,'图片不存在或不可见');
    try{return await readFile(join(this.root,id+'.webp'));}catch(error){if(error.code==='ENOENT')throw new HTTPError(404,'图片不存在');throw error;}
  }
}
