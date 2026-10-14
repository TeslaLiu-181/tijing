import {DatabaseSync} from 'node:sqlite';
import {mkdir} from 'node:fs/promises';
import {join, resolve} from 'node:path';

export async function openDatabase(directory) {
  const root = resolve(directory);
  await mkdir(root, {recursive: true});
  const db = new DatabaseSync(join(root, 'workspace.sqlite'), {timeout: 5000});
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('teacher', 'student')),
      disabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      question_count INTEGER NOT NULL,
      scene_count INTEGER NOT NULL,
      version INTEGER NOT NULL,
      paper_json TEXT NOT NULL,
      published_json TEXT,
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS resources_owner ON resources(owner_id, updated_at);
    CREATE TABLE IF NOT EXISTS assets (
      resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      PRIMARY KEY(resource_id, id)
    );
  `);
  db.exec("\n    CREATE TABLE IF NOT EXISTS learning_groups (\n      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL CHECK(kind IN ('class','learning')),\n      name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', invite_code TEXT UNIQUE, archived INTEGER NOT NULL DEFAULT 0,\n      version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL\n    );\n    CREATE INDEX IF NOT EXISTS learning_groups_owner ON learning_groups(owner_id, archived);\n    CREATE TABLE IF NOT EXISTS group_members (\n      group_id TEXT NOT NULL REFERENCES learning_groups(id) ON DELETE CASCADE,\n      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, joined_at TEXT NOT NULL, PRIMARY KEY(group_id,user_id)\n    );\n    CREATE INDEX IF NOT EXISTS group_members_user ON group_members(user_id,group_id);\n    CREATE TABLE IF NOT EXISTS resource_targets (\n      resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,\n      group_id TEXT NOT NULL REFERENCES learning_groups(id) ON DELETE CASCADE, PRIMARY KEY(resource_id,group_id)\n    );\n    CREATE TABLE IF NOT EXISTS workshop_posts (\n      id TEXT PRIMARY KEY, resource_id TEXT NOT NULL UNIQUE REFERENCES resources(id) ON DELETE CASCADE,\n      owner_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, description TEXT NOT NULL,\n      category TEXT NOT NULL CHECK(category IN ('scene','exercise','document','paper')), snapshot_json TEXT NOT NULL,\n      selection TEXT NOT NULL, include_originals INTEGER NOT NULL DEFAULT 0,\n      visible INTEGER NOT NULL DEFAULT 1, moderated INTEGER NOT NULL DEFAULT 0, hidden_reason TEXT NOT NULL DEFAULT '',\n      version INTEGER NOT NULL DEFAULT 1, remix_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL\n    );\n    CREATE INDEX IF NOT EXISTS workshop_visible ON workshop_posts(visible,updated_at);\n    CREATE TABLE IF NOT EXISTS workshop_likes (\n      post_id TEXT NOT NULL REFERENCES workshop_posts(id) ON DELETE CASCADE,\n      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL, PRIMARY KEY(post_id,user_id)\n    );\n    CREATE TABLE IF NOT EXISTS resource_origins (\n      resource_id TEXT PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,\n      post_id TEXT REFERENCES workshop_posts(id) ON DELETE SET NULL, original_title TEXT NOT NULL, original_author TEXT NOT NULL, created_at TEXT NOT NULL\n    );\n    CREATE TABLE IF NOT EXISTS teaching_feedback (\n      id TEXT PRIMARY KEY, resource_id TEXT REFERENCES resources(id) ON DELETE SET NULL, author_id TEXT NOT NULL REFERENCES users(id),\n      teacher_id TEXT NOT NULL REFERENCES users(id), class_id TEXT REFERENCES learning_groups(id), resource_title TEXT NOT NULL,\n      question_id TEXT, question_title TEXT NOT NULL DEFAULT '', scene_id TEXT, scene_title TEXT NOT NULL DEFAULT '',\n      publication_stamp TEXT NOT NULL, category TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',\n      reply TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, replied_at TEXT\n    );\n    CREATE INDEX IF NOT EXISTS feedback_teacher ON teaching_feedback(teacher_id,status,created_at);\n    CREATE INDEX IF NOT EXISTS feedback_author ON teaching_feedback(author_id,created_at);\n    CREATE TABLE IF NOT EXISTS feedback_groups (\n      feedback_id TEXT NOT NULL REFERENCES teaching_feedback(id) ON DELETE CASCADE,\n      group_id TEXT NOT NULL REFERENCES learning_groups(id), PRIMARY KEY(feedback_id,group_id)\n    );\n");
  if (!db.prepare('PRAGMA table_info(users)').all().some(column => column.name === 'class_id')) {
    db.exec('ALTER TABLE users ADD COLUMN class_id TEXT REFERENCES learning_groups(id)');
  }
  if (!db.prepare('PRAGMA table_info(resources)').all().some(column => column.name === 'published_version')) {
    db.exec('ALTER TABLE resources ADD COLUMN published_version INTEGER');
    db.exec('UPDATE resources SET published_version = version WHERE published_json IS NOT NULL');
  }
  if (!db.prepare('PRAGMA table_info(teaching_feedback)').all().some(column => column.name === 'version')) db.exec('ALTER TABLE teaching_feedback ADD COLUMN version INTEGER NOT NULL DEFAULT 1');
  if (!db.prepare('PRAGMA table_info(teaching_feedback)').all().some(column => column.name === 'view')) db.exec("ALTER TABLE teaching_feedback ADD COLUMN view TEXT NOT NULL DEFAULT 'shared'");
  if (!db.prepare('PRAGMA table_info(users)').all().some(column => column.name === 'platform_admin')) db.exec('ALTER TABLE users ADD COLUMN platform_admin INTEGER NOT NULL DEFAULT 0');
  db.exec(`CREATE TABLE IF NOT EXISTS community_profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    bio TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT 'teal', updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS profile_images (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('avatar','cover')), bytes INTEGER NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS account_audit (
    id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES users(id), target_id TEXT NOT NULL REFERENCES users(id),
    action TEXT NOT NULL, created_at TEXT NOT NULL
  );`);
  const profileColumns = new Set(db.prepare('PRAGMA table_info(community_profiles)').all().map(column => column.name));
  for (const [name, definition] of Object.entries({headline:"TEXT NOT NULL DEFAULT ''", subject:"TEXT NOT NULL DEFAULT ''", grade:"TEXT NOT NULL DEFAULT ''", interests_json:"TEXT NOT NULL DEFAULT '[]'", avatar_id:'TEXT', cover_id:'TEXT', cover_position:'INTEGER NOT NULL DEFAULT 50', version:'INTEGER NOT NULL DEFAULT 1'})) {
    if (!profileColumns.has(name)) db.exec('ALTER TABLE community_profiles ADD COLUMN ' + name + ' ' + definition);
  }
  return db;
}

export function getSetting(db, key, fallback = '') {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? fallback;
}

export function setSetting(db, key, value) {
  db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
}

export function transaction(db, operation) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
