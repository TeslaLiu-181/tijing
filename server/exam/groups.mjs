import {randomBytes, randomUUID} from 'node:crypto';
import {getSetting, setSetting, transaction} from './database.mjs';
import {requireCondition} from './errors.mjs';

const timestamp = () => new Date().toISOString();
const teacher = user => requireCondition(user?.role === 'teacher', 403, '此操作仅供教师使用');
const text = (value, maximum, label) => {
  requireCondition(typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= maximum, 400, label + '须为1–' + maximum + '个字符');
  return value.trim();
};
const ids = values => {
  requireCondition(Array.isArray(values) && values.length > 0 && values.length <= 1000 && values.every(id => /^user-[a-f0-9-]{36}$/.test(id)), 400, '请选择需要调整的学生');
  return [...new Set(values)];
};

export class Groups {
  constructor(db) { this.db = db; }
  legacyId() { return getSetting(this.db, 'legacy_group_id'); }
  initializeLegacy() {
    if (getSetting(this.db, 'learning_groups_migrated') === '1') return;
    const owner = this.db.prepare("SELECT id FROM users WHERE role = 'teacher' ORDER BY created_at LIMIT 1").get();
    if (!owner) return;
    transaction(this.db, () => {
      const id = 'group-' + randomUUID(), now = timestamp();
      this.db.prepare('INSERT INTO learning_groups(id, owner_id, kind, name, description, invite_code, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, owner.id, 'learning', getSetting(this.db, 'class_name', '原学习空间'), '保留原学习空间的成员和共享资源。行政班归属由教师另行确认。', getSetting(this.db, 'invite_code'), now, now);
      // The old invitation establishes learning-space membership, not a verified
      // administrative class. Never guess the class of existing students.
      this.db.prepare('INSERT INTO group_members(group_id, user_id, joined_at) SELECT ?, id, ? FROM users').run(id, now);
      this.db.prepare('INSERT INTO resource_targets(resource_id, group_id) SELECT id, ? FROM resources WHERE published_json IS NOT NULL').run(id);
      setSetting(this.db, 'legacy_group_id', id);
      setSetting(this.db, 'learning_groups_migrated', '1');
    });
  }
  row(id) { return this.db.prepare('SELECT * FROM learning_groups WHERE id = ?').get(id); }
  owned(user, id) {
    teacher(user);
    const row = this.row(id);
    requireCondition(row && row.owner_id === user.id, 404, '班级或小组不存在，或不属于你');
    return row;
  }
  contains(userId, row) {
    return row.kind === 'class'
      ? !!this.db.prepare("SELECT id FROM users WHERE id = ? AND class_id = ? AND role = 'student'").get(userId, row.id)
      : !!this.db.prepare('SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?').get(row.id, userId);
  }
  describe(user, row) {
    const count = row.kind === 'class'
      ? this.db.prepare("SELECT count(*) AS n FROM users WHERE class_id = ? AND role = 'student'").get(row.id).n
      : this.db.prepare("SELECT count(*) AS n FROM group_members m JOIN users u ON u.id = m.user_id WHERE m.group_id = ? AND u.role = 'student'").get(row.id).n;
    const writable = user.role === 'teacher' && row.owner_id === user.id;
    return {id: row.id, kind: row.kind, name: row.name, description: row.description, archived: !!row.archived, version: row.version, memberCount: count,
      writable, legacy: row.id === this.legacyId(), ...(writable && row.invite_code ? {inviteCode: row.invite_code} : {})};
  }
  list(user) {
    const rows = this.db.prepare(`SELECT g.* FROM learning_groups g WHERE g.owner_id = ?
      OR (g.kind = 'class' AND g.id = (SELECT class_id FROM users WHERE id = ?))
      OR EXISTS(SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.user_id = ?)
      ORDER BY g.archived, g.kind, g.created_at`).all(user.id, user.id, user.id);
    const groups = rows.map(row => this.describe(user, row));
    const current = this.db.prepare('SELECT class_id FROM users WHERE id = ?').get(user.id)?.class_id;
    const classRow = current ? this.row(current) : null;
    const students = user.role === 'teacher' ? this.students(user) : [];
    return {groups, administrativeClass: classRow ? this.describe(user, classRow) : null,
      pendingClassCount: students.filter(student => !student.classId).length, studentCount: students.length};
  }
  create(user, input) {
    teacher(user);
    requireCondition(['class', 'learning'].includes(input.kind), 400, '请选择行政班或学习小组');
    const name = text(input.name, 50, '名称'), description = String(input.description || '').trim();
    requireCondition(description.length <= 300, 400, '说明最多300个字符');
    const id = 'group-' + randomUUID(), now = timestamp(), code = input.kind === 'class' ? this.invitation(input.inviteCode || randomBytes(9).toString('base64url')) : null;
    this.db.prepare('INSERT INTO learning_groups(id, owner_id, kind, name, description, invite_code, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, user.id, input.kind, name, description, code, now, now);
    return this.describe(user, this.row(id));
  }
  invitation(value, except = '') {
    requireCondition(typeof value === 'string' && value.length >= 6 && value.length <= 64 && !/\s/.test(value), 400, '邀请码须为6–64位，不含空格');
    requireCondition(!this.db.prepare('SELECT id FROM learning_groups WHERE invite_code = ? AND id != ?').get(value, except), 409, '这个邀请码已被使用');
    return value;
  }
  update(user, id, input, version) {
    const row = this.owned(user, id);
    requireCondition(Number.isSafeInteger(version) && row.version === version, 409, '班级或小组已在其他页面更新，请刷新后再试', 'group_version_conflict');
    const name = input.name === undefined ? row.name : text(input.name, 50, '名称');
    const description = input.description === undefined ? row.description : String(input.description).trim();
    requireCondition(description.length <= 300, 400, '说明最多300个字符');
    if (input.archived !== undefined) requireCondition(typeof input.archived === 'boolean', 400, '归档状态不正确');
    let code = row.invite_code;
    if (input.inviteCode !== undefined) {
      requireCondition(row.kind === 'class' || row.id === this.legacyId(), 400, '学习小组成员由教师管理');
      code = this.invitation(input.inviteCode, id);
    }
    transaction(this.db, () => {
      this.db.prepare('UPDATE learning_groups SET name = ?, description = ?, invite_code = ?, archived = ?, version = version + 1, updated_at = ? WHERE id = ?')
        .run(name, description, code, input.archived === undefined ? row.archived : Number(input.archived), timestamp(), id);
      if (id === this.legacyId()) { setSetting(this.db, 'class_name', name); setSetting(this.db, 'invite_code', code); }
    });
    return this.describe(user, this.row(id));
  }
  registrationGroup(code) {
    const row = this.db.prepare('SELECT g.* FROM learning_groups g JOIN users u ON u.id=g.owner_id WHERE g.invite_code = ? AND g.archived = 0 AND u.disabled=0').get(String(code || ''));
    requireCondition(row && (row.kind === 'class' || row.id === this.legacyId()), 400, '班级邀请码不正确或已停止使用');
    return row;
  }
  registerMember(userId, groupId) {
    const row = this.row(groupId);
    requireCondition(row && !row.archived, 400, '班级邀请码已停止使用');
    if (row.kind === 'class') this.db.prepare('UPDATE users SET class_id = ? WHERE id = ?').run(groupId, userId);
    else this.db.prepare('INSERT INTO group_members(group_id, user_id, joined_at) VALUES(?, ?, ?)').run(groupId, userId, timestamp());
  }
  managedStudent(user, id) {
    teacher(user);
    const row = this.db.prepare(`SELECT u.* FROM users u WHERE u.id = ? AND u.role = 'student'
      AND (EXISTS(SELECT 1 FROM learning_groups g WHERE g.id = u.class_id AND g.owner_id = ?)
      OR EXISTS(SELECT 1 FROM group_members m JOIN learning_groups g ON g.id = m.group_id WHERE m.user_id = u.id AND g.owner_id = ?))`).get(id, user.id, user.id);
    requireCondition(row, 404, '学生不在你管理的班级或小组中');
    return row;
  }
  students(user, groupId = null) {
    teacher(user);
    if (groupId) this.owned(user, groupId);
    const result = this.db.prepare(`SELECT u.id, u.username, u.display_name AS displayName, u.disabled, u.created_at AS createdAt, u.class_id AS classId,
      c.name AS className, (SELECT count(*) FROM resources r WHERE r.owner_id = u.id) AS resourceCount,
      (SELECT coalesce(sum(a.bytes), 0) FROM assets a JOIN resources r ON r.id = a.resource_id WHERE r.owner_id = u.id) AS bytes
      FROM users u LEFT JOIN learning_groups c ON c.id = u.class_id WHERE u.role = 'student'
      AND (EXISTS(SELECT 1 FROM learning_groups g WHERE g.id = u.class_id AND g.owner_id = ?)
      OR EXISTS(SELECT 1 FROM group_members m JOIN learning_groups g ON g.id = m.group_id WHERE m.user_id = u.id AND g.owner_id = ?))
      ORDER BY u.created_at DESC`).all(user.id, user.id);
    for (const student of result) {
      student.groupIds = this.db.prepare('SELECT m.group_id AS id FROM group_members m JOIN learning_groups g ON g.id = m.group_id WHERE m.user_id = ? AND g.owner_id = ?').all(student.id, user.id).map(row => row.id);
    }
    return groupId ? result.filter(student => student.classId === groupId || student.groupIds.includes(groupId)) : result;
  }
  assign(user, id, input) {
    const group = this.owned(user, id);
    requireCondition(!group.archived, 400, '请先恢复这个班级或小组');
    const selected = ids(input.userIds);
    for (const userId of selected) this.managedStudent(user, userId);
    transaction(this.db, () => {
      for (const userId of selected) {
        if (group.kind === 'class') this.db.prepare('UPDATE users SET class_id = ? WHERE id = ?').run(id, userId);
        else this.db.prepare('INSERT OR IGNORE INTO group_members(group_id, user_id, joined_at) VALUES(?, ?, ?)').run(id, userId, timestamp());
      }
    });
    return {group: this.describe(user, this.row(id)), students: this.students(user, id)};
  }
  removeMember(user, id, userId) {
    const group = this.owned(user, id);
    requireCondition(group.kind === 'learning', 400, '行政班归属请通过“调整行政班”修改');
    this.db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(id, userId);
    return true;
  }
  validateTargets(user, values) {
    teacher(user);
    requireCondition(Array.isArray(values) && values.length > 0 && values.length <= 200 && values.every(id => typeof id === 'string'), 400, '请选择至少一个投送对象');
    const targetIds = [...new Set(values)];
    for (const id of targetIds) { const row = this.owned(user, id); requireCondition(!row.archived, 400, '投送对象已归档，请选择可用的班级或小组'); }
    return targetIds;
  }
  setTargets(resourceId, targetIds) {
    this.db.prepare('DELETE FROM resource_targets WHERE resource_id = ?').run(resourceId);
    const add = this.db.prepare('INSERT INTO resource_targets(resource_id, group_id) VALUES(?, ?)');
    for (const id of targetIds) add.run(resourceId, id);
  }
  canReadShared(user, resourceId) {
    return !!this.db.prepare(`SELECT 1 FROM resource_targets t JOIN learning_groups g ON g.id = t.group_id WHERE t.resource_id = ?
      AND (g.owner_id = ? OR (g.kind = 'class' AND g.id = (SELECT class_id FROM users WHERE id = ?))
      OR EXISTS(SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.user_id = ?)) LIMIT 1`).get(resourceId, user.id, user.id, user.id);
  }
  targets(user, resourceId) {
    return this.db.prepare('SELECT g.* FROM resource_targets t JOIN learning_groups g ON g.id = t.group_id WHERE t.resource_id = ? ORDER BY g.kind, g.created_at')
      .all(resourceId).filter(row => row.owner_id === user.id || this.contains(user.id, row)).map(row => this.describe(user, row));
  }
  feedbackMemberships(userId, teacherId) {
    return this.db.prepare(`SELECT g.id FROM learning_groups g WHERE g.owner_id = ? AND
      ((g.kind = 'class' AND g.id = (SELECT class_id FROM users WHERE id = ?)) OR EXISTS(SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.user_id = ?))`)
      .all(teacherId, userId, userId).map(row => row.id);
  }
}
