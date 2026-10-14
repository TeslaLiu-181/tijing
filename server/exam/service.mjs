import {readFile, writeFile, mkdir, copyFile, rm, readdir} from 'node:fs/promises';
import {join, resolve, relative, basename, extname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Resources} from './resources.mjs';
import {PaperStore} from '../../desktop/exam/store.mjs';
import {importSource} from '../../src/exam/documents.mjs';
import {validatePaper, clone, uid, now} from '../../src/exam/model.mjs';
import {htmlPaper, readJSONResource, importResource, exportResource} from '../../src/exam/resources.mjs';
import {offlineHTML} from '../../desktop/exam/backend.mjs';
import {HTTPError, requireCondition} from './errors.mjs';

const MB = 1024 * 1024;

export class ExamService {
  constructor(db, {dataDir, resourceDir, quotaBytes, maxResources, documentBytes = 50 * MB, resourceBytes = 100 * MB}) {
    this.db = db;
    this.root = resolve(dataDir);
    this.resourceDir = resolve(resourceDir);
    this.resources = new Resources(db, dataDir, {quotaBytes, maxResources});
    this.documentBytes = documentBytes;
    this.resourceBytes = resourceBytes;
    this.stages = new Map();
    this.queues = new Map();
    this.stageRoot = join(this.root, 'staging');
  }

  async init() {
    await mkdir(this.stageRoot, {recursive: true});
    // Candidates only live for this process; no committed papers are in this
    // staging directory. Clear abandoned imports after a restart.
    for (const item of await readdir(this.stageRoot, {withFileTypes: true})) if (item.isDirectory() && /^[a-f0-9-]{36}$/i.test(item.name)) await this.removeStage(item.name);
    this.sweep = setInterval(() => {
      for (const [id, stage] of this.stages) if (stage.expires < Date.now()) this.discard(stage.userId, id).catch(() => {});
    }, 60000);
    this.sweep.unref();
    return this;
  }

  mutate(user, operation) {
    const previous = this.queues.get(user.id) || Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    this.queues.set(user.id, next);
    next.finally(() => { if (this.queues.get(user.id) === next) this.queues.delete(user.id); }).catch(() => {});
    return next;
  }

  stage(id, userId) {
    const stage = this.stages.get(id);
    requireCondition(stage && stage.userId === userId && stage.expires > Date.now(), 404, '导入候选不存在或已过期，请重新读取文件');
    return stage;
  }

  async preview(user, id, input, version) {
    const row = this.resources.writable(user, id, version), current = this.resources.canonical(user, row, input.paper);
    const filename = basename(String(input.filename || '').replaceAll('\\', '/')).replace(/[\x00-\x1f<>:"|?*]/g, '_').slice(-180);
    requireCondition(filename && ['.pdf', '.docx', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.tif', '.tiff'].includes(extname(filename).toLowerCase()), 400, '请选择 PDF、DOCX 或图片');
    requireCondition(typeof input.data === 'string' && /^[a-zA-Z0-9+/=\r\n]+$/.test(input.data), 400, '文件数据不正确');
    const bytes = Buffer.from(input.data, 'base64');
    requireCondition(bytes.length <= this.documentBytes, 413, '单个文档超过50 MB，请拆分后导入');
    requireCondition(this.resources.usedBytes(user.id) + bytes.length <= this.resources.quotaBytes, 413, '个人空间容量不足');
    requireCondition([...this.stages.values()].filter(s => s.userId === user.id).length < 3, 409, '请先完成或取消已有的文档导入');
    const stageId = randomUUID(), root = join(this.stageRoot, stageId), files = await new PaperStore(root).init();
    const staged = {...clone(current), assets: {}, questions: [], sources: []};
    await writeFile(join(root, filename), bytes);
    try {
      const pages = input.pages;
      if (extname(filename).toLowerCase() === '.pdf') {
        requireCondition(bytes.subarray(0, 5).toString() === '%PDF-', 400, 'PDF 文件头不正确');
        requireCondition(Array.isArray(pages) && pages.length > 0 && pages.length <= 80, 400, '请先在浏览器读取 PDF 原页');
        let total = 0;
        for (let index = 0; index < pages.length; index++) {
          const page = pages[index];
          requireCondition(page.number === index + 1 && Array.isArray(page.lines) && page.lines.length <= 10000 && page.lines.every(line => typeof line === 'string' && line.length <= 100000), 400, 'PDF 文字层数据不正确');
          const png = Buffer.from(String(page.pngBase64 || ''), 'base64'); total += png.length;
          requireCondition(png.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && png.length >= 24 && png.readUInt32BE(16) * png.readUInt32BE(20) <= 10_000_000 && total <= 120 * MB, 413, 'PDF 原页数据过大或格式不正确，请分批导入');
        }
      }
      const adapter = {newQuestion: (...args) => files.newQuestion(...args), addAsset: (...args) => files.addAsset(...args), writeAsset: (...args) => files.writeAsset(...args), save: async () => {}};
      await importSource(adapter, staged, join(root, filename), {renderPdf: async () => pages, docxMaxBytes: 64 * MB});
      const size = Object.values(staged.assets).reduce((n, asset) => n + asset.bytes, 0);
      requireCondition(size + this.resources.usedBytes(user.id) <= this.resources.quotaBytes, 413, '文档和原页超过个人空间剩余容量');
      this.stages.set(stageId, {userId: user.id, paperId: id, version, paper: staged, files, expires: Date.now() + 30 * 60000});
      const ui = await files.forUI(staged);
      return {id: stageId, candidates: ui.questions, sources: ui.sources, assets: ui.assets, errors: []};
    } catch (error) { await this.removeStage(stageId); throw error; }
  }

  async commit(user, id, input, version) {
    const pending = this.stage(input.id, user.id), row = this.resources.writable(user, id, version);
    requireCondition(pending.paperId === id, 400, '导入候选属于另一份资源');
    const paper = this.resources.canonical(user, row, input.paper);
    requireCondition(Array.isArray(input.questions) && input.questions.length > 0, 400, '至少选择一道题或一份原页');
    const assets = Object.values(pending.paper.assets);
    Object.assign(paper.assets, pending.paper.assets);
    paper.sources.push(...pending.paper.sources); paper.questions.push(...clone(input.questions));
    paper.activeQuestionId = input.questions[0].id; paper.revision++; validatePaper(paper);
    await mkdir(join(this.resources.files.folder(id), 'assets'), {recursive: true});
    const copied = [];
    try {
      for (const asset of assets) {
        await copyFile(pending.files.assetPath(id, asset.path), this.resources.files.assetPath(id, asset.path)); copied.push(asset.path);
      }
      this.resources.update(user, paper, version, assets);
    } catch (error) {
      for (const path of copied) await rm(this.resources.files.assetPath(id, path), {force: true});
      throw error;
    }
    await this.discard(user.id, input.id);
    return this.resources.state(user, id);
  }

  async removeStage(id) {
    const target = resolve(this.stageRoot, id), rel = relative(this.stageRoot, target);
    requireCondition(/^[a-f0-9-]{36}$/i.test(rel), 400, '暂存目录不正确');
    await rm(target, {recursive: true, force: true});
  }

  async discard(userId, id) { const stage = this.stages.get(id); requireCondition(stage && stage.userId === userId, 404, '导入候选不存在或无权访问'); this.stages.delete(id); await this.removeStage(id); return true; }

  async importFile(user, input) {
    const bytes = Buffer.from(String(input.data || ''), 'base64');
    requireCondition(bytes.length > 0 && bytes.length <= this.resourceBytes, 413, '资源文件为空或超过100 MB');
    const extension = extname(String(input.filename || '')).toLowerCase();
    let paper;
    if (extension === '.html') paper = htmlPaper(bytes.toString('utf8'));
    else if (extension === '.json') {
      const data = readJSONResource(bytes.toString('utf8'));
      if (data.type === 'scene') return data;
      paper = data.paper;
    } else if (['.zip', '.tijingexam'].includes(extension)) paper = importResource(new Uint8Array(bytes));
    else throw new HTTPError(400, '请选择试卷资源包、HTML 或场景 JSON');
    return {type: 'paper', ...await this.resources.importPortable(user, paper)};
  }

  async image(user, id, input, version) {
    const row = this.resources.writable(user, id, version), paper = this.resources.canonical(user, row, input.paper);
    requireCondition(typeof input.url === 'string' && /^data:image\/png;base64,[a-zA-Z0-9+/=\r\n]+$/.test(input.url), 400, '裁切题图须为 PNG');
    const bytes = Buffer.from(input.url.split(',')[1], 'base64');
    requireCondition(bytes.length <= 10 * MB && bytes.length >= 24 && bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && bytes.readUInt32BE(16) * bytes.readUInt32BE(20) <= 10_000_000, 413, '裁切题图过大或格式不正确');
    requireCondition(this.resources.usedBytes(user.id) + bytes.length <= this.resources.quotaBytes, 413, '个人空间容量不足');
    const asset = await this.resources.writeAsset(id, bytes, {name: input.name || '裁切题图', kind: 'crop'});
    try { const saved = this.resources.update(user, paper, version, [asset]); return {...asset, version: saved.version, displayURL: `/api/resources/${id}/assets/${asset.id}`}; }
    catch (error) { await rm(this.resources.files.assetPath(id, asset.path), {force: true}); throw error; }
  }

  async export(user, id, input) {
    const paper = await this.resources.portable(user, id, input.paper, {includeOriginals: input.includeOriginals !== false && input.kind !== 'html', view: input.view});
    if (input.includeReference === false) for (const question of paper.questions) question.referenceText = '';
    const suffix = input.kind === 'html' ? 'html' : input.kind === 'json' ? 'json' : 'tijingexam';
    const content = input.kind === 'html' ? await offlineHTML(paper, this.resourceDir) : input.kind === 'json' ? JSON.stringify(paper, null, 2) : exportResource(paper, {includeOriginals: input.includeOriginals !== false});
    return {content, filename: paper.title + '.' + suffix, mime: input.kind === 'html' ? 'text/html;charset=utf-8' : input.kind === 'json' ? 'application/json;charset=utf-8' : 'application/zip'};
  }

  async sample(user) { return this.importFile(user, {filename: 'sample.tijingexam', data: (await readFile(join(this.resourceDir, 'sample.tijingexam'))).toString('base64')}); }

  async close() { clearInterval(this.sweep); await Promise.allSettled(this.queues.values()); }
}
