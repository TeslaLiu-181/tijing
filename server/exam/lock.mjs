import {mkdir, open, readFile, rm} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {randomUUID} from 'node:crypto';

export async function lockDirectory(directory) {
  const root = resolve(directory), path = join(root, 'server.lock');
  await mkdir(root, {recursive: true});
  const record = {pid: process.pid, nonce: randomUUID()};
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const file = await open(path, 'wx');
      await file.writeFile(JSON.stringify(record)); await file.close();
      return async () => {
        const current = JSON.parse(await readFile(path, 'utf8').catch(() => '{}'));
        if (current.nonce === record.nonce) await rm(path, {force: true});
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let old;
      try { old = JSON.parse(await readFile(path, 'utf8')); } catch { throw Error('资料目录的锁文件不完整，请确认服务已停止后移除 server.lock'); }
      if (!Number.isInteger(old.pid) || old.pid <= 0) throw Error('资料目录锁文件不正确');
      try { process.kill(old.pid, 0); throw Error('这个资料目录已由另一服务使用，请先停止原服务'); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
      await rm(path, {force: true});
    }
  }
  throw Error('未能锁定资料目录，请稍后重试');
}
