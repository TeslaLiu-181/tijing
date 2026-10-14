import {requireCondition} from './errors.mjs';

// Teacher registration grants ownership of one's teaching space, never the
// previous single teacher's platform-wide moderation or account authority.
export const isPlatformAdmin = (db, user) => !!user?.id && !!db.prepare('SELECT 1 FROM users WHERE id=? AND platform_admin=1 AND disabled=0').get(user.id);
export function requirePlatformAdmin(db, user) { requireCondition(isPlatformAdmin(db, user), 403, '此操作仅供平台管理员使用'); }
export const managesStudentAccount = (db, user, studentId) => isPlatformAdmin(db, user) || !!db.prepare(`SELECT 1 FROM users s JOIN learning_groups g ON g.id=s.class_id
  WHERE s.id=? AND s.role='student' AND g.owner_id=?`).get(studentId, user.id);
