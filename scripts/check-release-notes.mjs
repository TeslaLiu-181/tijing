import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import releaseNotes from '../src/exam/release-notes.json' with {type: 'json'};

export {releaseNotes};

// Fail the build before malformed public copy or a stale version can ship.
export function validateReleaseNotes(notes) {
  const require = (condition, message) => { if (!condition) throw Error('更新记录：' + message); };
  const text = (value, maximum) => typeof value === 'string' && value.trim().length > 0 && value.length <= maximum && !/[<>\uFFFD]|\?\?/.test(value);
  require(Array.isArray(notes) && notes.length > 0, '至少需要一条已发布记录');
  let previous;
  for (const note of notes) {
    require(note && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(note.version), '版本号须为数字 x.y.z');
    require(typeof note.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(note.date), '日期须为 YYYY-MM-DD');
    const date = new Date(note.date + 'T00:00:00Z');
    require(Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === note.date, '日期不存在');
    if (previous) {
      const currentParts = note.version.split('.').map(Number), previousParts = previous.version.split('.').map(Number);
      const difference = previousParts.map((part, index) => part - currentParts[index]).find(value => value !== 0);
      require(difference > 0 && previous.date >= note.date, '版本和日期须从新到旧排列，版本不可重复');
    }
    require(text(note.title, 80), '标题须为 1–80 字纯文本');
    require(Array.isArray(note.changes) && note.changes.length > 0 && note.changes.length <= 12, '每版须有 1–12 项更新');
    for (const change of note.changes) {
      require(change && ['新增', '优化', '修复'].includes(change.type), '类型仅支持新增、优化、修复');
      require(text(change.text, 300), '更新正文须为 1–300 字纯文本，不得含 HTML 或乱码');
    }
    previous = note;
  }
  return notes;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  validateReleaseNotes(releaseNotes);
  console.log(`更新记录检查通过：${releaseNotes.length} 个版本，当前 v${releaseNotes[0].version}`);
}
