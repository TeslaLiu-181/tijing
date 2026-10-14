import {createInterface, emitKeypressEvents} from 'node:readline';
import {randomBytes} from 'node:crypto';
import {openDatabase, getSetting, setSetting, transaction} from './database.mjs';
import {Accounts, hashPassword} from './auth.mjs';
import {configuration} from './config.mjs';

async function answer(prompt, fallback = '') {
  const input = createInterface({input: process.stdin, output: process.stdout});
  return new Promise(resolve => input.question(prompt + (fallback ? ` [${fallback}]` : '') + '：', value => { input.close(); resolve(value.trim() || fallback); }));
}

async function password(prompt) {
  if (!process.stdin.isTTY) throw Error('请在交互终端运行初始化；自动部署可首次使用 EXAM_ADMIN_PASSWORD 环境变量');
  emitKeypressEvents(process.stdin); process.stdin.setRawMode(true); process.stdin.resume();
  process.stdout.write(prompt + '：');
  return new Promise((resolve, reject) => {
    let value = '';
    const done = () => { process.stdin.off('keypress', keypress); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); };
    const keypress = (text, key) => {
      if (key?.ctrl && key.name === 'c') { done(); reject(Error('已取消初始化')); }
      else if (key?.name === 'return' || key?.name === 'enter') { done(); resolve(value); }
      else if (key?.name === 'backspace') { if (value) { value = value.slice(0, -1); process.stdout.write('\b \b'); } }
      else if (text && !key?.ctrl && !key?.meta) { value += text; process.stdout.write('•'.repeat([...text].length)); }
    };
    process.stdin.on('keypress', keypress);
  });
}

async function setup() {
  process.umask(0o077);
  const options = configuration(), db = await openDatabase(options.dataDir), accounts = new Accounts(db);
  try {
    const reset = process.argv.includes('--reset-admin');
    if (accounts.hasTeacher() && !reset) { console.log('教师账号已设置。恢复教师密码时使用 --reset-admin。'); return; }
    const name = reset ? db.prepare("SELECT username FROM users WHERE role = 'teacher'").get().username : await answer('教师登录账号', 'teacher');
    const displayName = reset ? '教师' : await answer('教师显示名称', '教师');
    const first = await password(reset ? '新的教师密码' : '教师密码（至少8个字符）'), second = await password('再次输入密码');
    if (first !== second) throw Error('两次密码不一致');
    if (reset) {
      const encoded = await hashPassword(first);
      transaction(db, () => {
        const teacher = db.prepare("SELECT id FROM users WHERE role = 'teacher'").get();
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(encoded, teacher.id);
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(teacher.id);
      });
    } else {
      await accounts.createTeacher(name, first, displayName);
      setSetting(db, 'class_name', await answer('学习空间名称', '物理学习空间'));
      setSetting(db, 'invite_code', randomBytes(9).toString('base64url'));
    }
    console.log('设置完成。教师账号：' + name);
    console.log('班级邀请码：' + getSetting(db, 'invite_code'));
    console.log('启动服务后，也可在教师页面管理邀请码和学生账号。');
  } finally { db.close(); }
}

setup().catch(error => { console.error(error.message); process.exitCode = 1; });
