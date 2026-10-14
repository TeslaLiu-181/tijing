import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export function configuration(env = process.env) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), port = Number(env.EXAM_PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('EXAM_PORT 须为1–65535');
  const positive = (key, fallback) => { const value = Number(env[key] || fallback); if (!Number.isFinite(value) || value <= 0) throw Error(key + '须为正数'); return value; };
  const publicOrigin = env.EXAM_PUBLIC_URL || `http://127.0.0.1:${port}`, address = new URL(publicOrigin);
  if (!['http:', 'https:'].includes(address.protocol) || address.username || address.password || address.pathname !== '/' || address.search || address.hash) throw Error('EXAM_PUBLIC_URL 须为网站根地址，例如 https://physics.example.com');
  const maxResources = positive('EXAM_MAX_RESOURCES', 200); if (!Number.isInteger(maxResources)) throw Error('EXAM_MAX_RESOURCES 须为正整数');
  return {port, host: env.EXAM_HOST || '127.0.0.1', publicOrigin,
    dataDir: resolve(env.EXAM_DATA_DIR || resolve(root, 'data/exam-web')), resourceDir: resolve(root, 'dist/exam'),
    adminUsername: env.EXAM_ADMIN_USERNAME, adminPassword: env.EXAM_ADMIN_PASSWORD, inviteCode: env.EXAM_INVITE_CODE,
    className: env.EXAM_CLASS_NAME || '物理学习空间', quotaBytes: positive('EXAM_USER_QUOTA_MB', 500) * 1024 * 1024,
    maxResources,wechatEnv:{EXAM_WECHAT_ENABLED:env.EXAM_WECHAT_ENABLED,EXAM_WECHAT_APP_ID:env.EXAM_WECHAT_APP_ID,EXAM_WECHAT_APP_SECRET:env.EXAM_WECHAT_APP_SECRET,EXAM_WECHAT_REDIRECT_URI:env.EXAM_WECHAT_REDIRECT_URI}};
}
