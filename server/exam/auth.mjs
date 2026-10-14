import {randomBytes, randomUUID, createHash, timingSafeEqual, scrypt} from 'node:crypto';
import {promisify} from 'node:util';
import {getSetting, setSetting, transaction} from './database.mjs';
import {HTTPError, requireCondition} from './errors.mjs';
import {Groups} from './groups.mjs';
import {profileAppearance} from './account-profiles.mjs';
import {isPlatformAdmin, requirePlatformAdmin, managesStudentAccount} from './account-permissions.mjs';

const derive = promisify(scrypt), digest = value => createHash('sha256').update(value).digest('hex');
const work = {N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024};
const publicUser = row => ({id: row.id, username: row.username, displayName: row.display_name, role: row.role, classId: row.class_id || null, isPlatformAdmin:!!row.platform_admin});

export async function hashPassword(password) {
  requireCondition(typeof password === 'string' && password.length >= 8 && password.length <= 128, 400, '密码须为8–128个字符');
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64, work);
  return `scrypt:${salt}:${key.toString('hex')}`;
}

async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [algorithm, salt, value] = encoded.split(':');
  if (algorithm !== 'scrypt') return false;
  const expected = Buffer.from(value, 'hex'), actual = await derive(password, salt, expected.length, work);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function username(value) {
  requireCondition(typeof value === 'string' && /^[a-zA-Z0-9_.-]{3,32}$/.test(value), 400, '账号须为3–32位字母、数字、点、下划线或短横线');
  return value.toLowerCase();
}

export class Accounts {
  constructor(db, {secureCookie = false, sessionDays = 7} = {}) {
    this.db = db;
    this.groups = new Groups(db);
    this.secureCookie = secureCookie;
    this.sessionDays = sessionDays;
    this.failures = new Map();
    this.dummyHash = null;
  }

  hasTeacher() { return !!this.db.prepare("SELECT id FROM users WHERE role = 'teacher'").get(); }

  async initialize({adminUsername, adminPassword, inviteCode, className = '物理学习空间'} = {}) {
    if (inviteCode) requireCondition(inviteCode.length >= 6 && inviteCode.length <= 64 && !/\s/.test(inviteCode), 400, '邀请码须为6–64位，不含空格');
    if (!this.hasTeacher() && adminPassword) await this.createTeacher(adminUsername || 'teacher', adminPassword, '教师');
    if (!getSetting(this.db, 'class_name')) setSetting(this.db, 'class_name', className);
    if (!getSetting(this.db, 'invite_code')) setSetting(this.db, 'invite_code', inviteCode || randomBytes(9).toString('base64url'));
    this.groups.initializeLegacy();
    // One-time upgrade: preserve the administrator behind the legacy class.
    // New self-registered teachers can never become platform administrators.
    if(!getSetting(this.db,'platform_admin_migrated')){
      const owner=this.groups.row(this.groups.legacyId())?.owner_id;
      if(owner)transaction(this.db,()=>{this.db.prepare('UPDATE users SET platform_admin=1 WHERE id=?').run(owner);setSetting(this.db,'platform_admin_migrated','1');});
    }
    this.dummyHash = await hashPassword(randomBytes(24).toString('base64url'));
    this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  }

  async createTeacher(name, password, displayName = '教师') {
    requireCondition(!this.hasTeacher(), 409, '教师账号已存在');
    const id = 'user-' + randomUUID(), encoded = await hashPassword(password);
    this.db.prepare('INSERT INTO users(id, username, display_name, password_hash, role, created_at) VALUES(?, ?, ?, ?, ?, ?)')
      .run(id, username(name), displayName.trim().slice(0, 30) || '教师', encoded, 'teacher', new Date().toISOString());
    return id;
  }

  throttle(key) {
    const record = this.failures.get(key);
    if (record && record.until > Date.now() && record.count >= 12) throw new HTTPError(429, '尝试次数较多，请15分钟后再试');
    if (record?.until <= Date.now()) this.failures.delete(key);
  }

  failed(key) {
    const current = this.failures.get(key) || {count: 0, until: Date.now() + 15 * 60 * 1000};
    current.count++;
    this.failures.set(key, current);
    if (this.failures.size > 5000) for (const [k, v] of this.failures) if (v.until < Date.now()) this.failures.delete(k);
  }

  async register(input, address, {onCreate} = {}) {
    const name = username(input.username), key = `register:${address}:${name}`;
    this.throttle(key);
    let group;
    try { group = this.groups.registrationGroup(input.inviteCode); } catch (error) { this.failed(key); throw error; }
    requireCondition(typeof input.displayName === 'string' && input.displayName.trim().length >= 1 && input.displayName.trim().length <= 30, 400, '请填写1–30个字符的昵称');
    requireCondition(!this.db.prepare('SELECT id FROM users WHERE username = ?').get(name), 409, '这个账号已被使用');
    const encoded = await hashPassword(input.password), id = 'user-' + randomUUID();
    try {
      // Registration always grants the student role; client-supplied roles and
      // owners are never authority for server permissions.
      transaction(this.db, () => {
        this.db.prepare('INSERT INTO users(id, username, display_name, password_hash, role, created_at) VALUES(?, ?, ?, ?, ?, ?)')
          .run(id, name, input.displayName.trim(), encoded, 'student', new Date().toISOString());
        this.groups.registerMember(id, group.id);
        onCreate?.(id);
      });
    } catch (error) {
      if (this.db.prepare('SELECT id FROM users WHERE username = ?').get(name)) throw new HTTPError(409, '这个账号已被使用');
      throw error;
    }
    this.failures.delete(key);
    return this.session(this.db.prepare('SELECT * FROM users WHERE id = ?').get(id));
  }

  async registerTeacher(input, address, {onCreate} = {}) {
    const key='teacher-register:'+address;this.throttle(key);this.failed(key);
    const name=username(input.username);
    requireCondition(typeof input.displayName==='string'&&input.displayName.trim().length>=1&&input.displayName.trim().length<=30,400,'请填写1–30个字符的昵称');
    requireCondition(!this.db.prepare('SELECT id FROM users WHERE username=?').get(name),409,'这个账号已被使用');
    const encoded=await hashPassword(input.password),id='user-'+randomUUID();
    try{transaction(this.db,()=>{
      this.db.prepare("INSERT INTO users(id,username,display_name,password_hash,role,platform_admin,created_at) VALUES(?,?,?,?,'teacher',0,?)").run(id,name,input.displayName.trim(),encoded,new Date().toISOString());
      onCreate?.(id);
    });}catch(error){if(this.db.prepare('SELECT id FROM users WHERE username=?').get(name))throw new HTTPError(409,'这个账号已被使用');throw error;}
    return this.session(this.db.prepare('SELECT * FROM users WHERE id=?').get(id));
  }

  public(user){const row=this.db.prepare('SELECT * FROM users WHERE id=?').get(user.id);const appearance=profileAppearance(this.db,user.id);return {...publicUser(row),avatarURL:appearance.avatarURL,color:appearance.color};}

  async verifyCurrentPassword(user,password){const row=this.db.prepare('SELECT password_hash FROM users WHERE id=? AND disabled=0').get(user.id);requireCondition(row&&await verifyPassword(password,row.password_hash),400,'当前密码不正确');}

  listTeachers(user){requirePlatformAdmin(this.db,user);return this.db.prepare(`SELECT u.id,u.username,u.display_name AS displayName,u.disabled,u.platform_admin AS isPlatformAdmin,u.created_at AS createdAt,
    (SELECT count(*) FROM learning_groups g WHERE g.owner_id=u.id AND g.archived=0) AS groupCount
    FROM users u WHERE u.role='teacher' ORDER BY u.platform_admin DESC,u.created_at DESC`).all().map(row=>({...row,disabled:!!row.disabled,isPlatformAdmin:!!row.isPlatformAdmin}));}

  async manageTeacher(user,id,input){
    requirePlatformAdmin(this.db,user);const row=this.db.prepare("SELECT * FROM users WHERE id=? AND role='teacher'").get(id);requireCondition(row,404,'教师账号不存在');
    requireCondition(!row.platform_admin&&row.id!==user.id,400,'不能在此停用或重置平台管理员账号');
    requireCondition(input&&Object.keys(input).length>0&&Object.keys(input).every(key=>['disabled','password'].includes(key)),400,'账号管理选项不正确');
    if(input.disabled!==undefined)requireCondition(typeof input.disabled==='boolean',400,'停用状态不正确');
    const encoded=input.password===undefined?null:await hashPassword(input.password);
    transaction(this.db,()=>{
      if(encoded)this.db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(encoded,id);
      if(input.disabled!==undefined)this.db.prepare('UPDATE users SET disabled=? WHERE id=?').run(Number(input.disabled),id);
      this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
      this.db.prepare('INSERT INTO account_audit(id,actor_id,target_id,action,created_at) VALUES(?,?,?,?,?)').run('audit-'+randomUUID(),user.id,id,encoded?'reset-password':input.disabled?'disable-teacher':'enable-teacher',new Date().toISOString());
    });return {ok:true};
  }

  async login(input, address) {
    const name = String(input.username || '').toLowerCase().slice(0, 64), key = `login:${address}:${name}`;
    this.throttle(key);
    const user = this.db.prepare('SELECT * FROM users WHERE username = ?').get(name);
    const valid = await verifyPassword(input.password, user?.password_hash || this.dummyHash);
    if (!valid || !user || user.disabled) { this.failed(key); throw new HTTPError(401, '账号或密码不正确，或账号已停用'); }
    this.failures.delete(key);
    return this.session(user);
  }

  session(user) {
    const token = randomBytes(32).toString('base64url'), csrf = randomBytes(24).toString('base64url');
    this.db.prepare('INSERT INTO sessions(hash, user_id, csrf, expires_at) VALUES(?, ?, ?, ?)')
      .run(digest(token), user.id, csrf, Date.now() + this.sessionDays * 86400000);
    return {user: this.public(user), csrf, cookie: this.cookie(token)};
  }

  cookie(token = '') {
    return `exam_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? this.sessionDays * 86400 : 0}${this.secureCookie ? '; Secure' : ''}`;
  }

  authenticate(request) {
    const token = (request.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('exam_session='))?.slice(13);
    if (!token || !/^[a-zA-Z0-9_-]{43}$/.test(token)) return null;
    const session = this.db.prepare('SELECT s.*, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.hash = ? AND s.expires_at > ? AND u.disabled = 0').get(digest(token), Date.now());
    return session ? {user: this.public(session), csrf: session.csrf, hash: session.hash} : null;
  }

  logout(session) { if (session) this.db.prepare('DELETE FROM sessions WHERE hash = ?').run(session.hash); return this.cookie(); }

  async changePassword(session, input) {
    const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(session.user.id);
    requireCondition(await verifyPassword(input.currentPassword, user.password_hash), 400, '当前密码不正确');
    const encoded = await hashPassword(input.password);
    transaction(this.db, () => {
      this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(encoded, user.id);
      this.db.prepare('DELETE FROM sessions WHERE user_id = ? AND hash != ?').run(user.id, session.hash);
    });
    return true;
  }

  teacher(user) { requireCondition(user?.role === 'teacher', 403, '此操作仅供教师使用'); }
  classroom(user) { this.teacher(user); const row = this.groups.owned(user, this.groups.legacyId()); return {name: row.name, inviteCode: row.invite_code}; }

  updateClassroom(user, input) {
    this.teacher(user);
    requireCondition(typeof input.inviteCode === 'string' && input.inviteCode.length >= 6 && input.inviteCode.length <= 64 && !/\s/.test(input.inviteCode), 400, '邀请码须为6–64位，不含空格');
    const name = String(input.name || '').trim();
    requireCondition(name.length >= 1 && name.length <= 50, 400, '班级名称须为1–50个字符');
    const legacy = this.groups.owned(user, this.groups.legacyId());
    this.groups.update(user, legacy.id, {name, inviteCode: input.inviteCode}, legacy.version);
    return this.classroom(user);
  }

  students(user, groupId = null) { return this.groups.students(user, groupId); }

  async manageStudent(user, id, input) {
    this.teacher(user);
    this.groups.managedStudent(user, id);
    if(input.password!==undefined||input.disabled!==undefined)requireCondition(managesStudentAccount(this.db,user,id),403,'仅行政班负责教师或平台管理员可以管理学生登录权限');
    if(input.disabled!==undefined)requireCondition(typeof input.disabled==='boolean',400,'停用状态不正确');
    if (input.classId !== undefined) {
      requireCondition(this.groups.owned(user, input.classId).kind === 'class', 400, '请选择行政班');
      this.groups.assign(user, input.classId, {userIds: [id]});
    }
    if (input.password !== undefined) this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(input.password), id);
    if (input.disabled !== undefined) this.db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(input.disabled ? 1 : 0, id);
    if (input.password !== undefined || input.disabled !== undefined) this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    return true;
  }
}
