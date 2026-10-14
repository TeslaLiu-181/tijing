import {readFile, writeFile, mkdir, copyFile, rm} from 'node:fs/promises';
import {join, resolve, relative} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {PaperStore} from '../../desktop/exam/store.mjs';
import {newPaper, validatePaper, clone, collectAssets, imageMime, uid, now} from '../../src/exam/model.mjs';
import {HTTPError, requireCondition} from './errors.mjs';
import {transaction} from './database.mjs';
import {Groups} from './groups.mjs';
import {managesStudentAccount} from './account-permissions.mjs';

const extensions = {'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx'};
const withoutDisplay = paper => {
  const result = clone(paper);
  for (const asset of Object.values(result.assets)) { delete asset.url; delete asset.displayURL; }
  return result;
};

export class Resources {
  constructor(db, root, {quotaBytes = 500 * 1024 * 1024, maxResources = 200} = {}) {
    this.db = db;
    this.groups = new Groups(db);
    this.files = new PaperStore(join(resolve(root), 'papers'));
    this.quotaBytes = quotaBytes;
    this.maxResources = maxResources;
  }

  row(id) { return this.db.prepare(`SELECT r.*, u.display_name AS author, u.role AS author_role, w.id AS workshop_id, w.snapshot_json AS workshop_json,
    w.visible AS workshop_visible, w.updated_at AS workshop_stamp, w.version AS workshop_version
    FROM resources r JOIN users u ON u.id = r.owner_id LEFT JOIN workshop_posts w ON w.resource_id = r.id WHERE r.id = ?`).get(id); }

  readable(user, id, {view} = {}) {
    const row = this.row(id);
    requireCondition(row, 404, '资源不存在或无权访问');
    requireCondition(!view || ['private','shared','workshop'].includes(view), 400, '资源查看方式不正确');
    const owner = row.owner_id === user.id, shared = !!row.published_json && (owner || this.groups.canReadShared(user, id));
    const publicWork = !!row.workshop_json && (row.workshop_visible || owner || (user.role === 'teacher' && managesStudentAccount(this.db,user,row.owner_id)));
    const selected = view || (owner ? 'private' : shared ? 'shared' : row.workshop_visible ? 'workshop' : null);
    requireCondition(selected === 'private' ? owner : selected === 'shared' ? shared : selected === 'workshop' && publicWork, 404, '资源不存在或无权访问');
    return {...row, _view: selected};
  }

  writable(user, id, version) {
    const row = this.readable(user, id);
    requireCondition(row.owner_id === user.id, 403, '共享原题不能覆盖，请保存为个人副本');
    requireCondition(Number.isSafeInteger(version) && version === row.version, 409, '此资源已在其他页面更新。请另存当前副本，或重新打开最新版。', 'version_conflict');
    return row;
  }

  paperFor(user, row) { const view = row._view || (row.owner_id === user.id ? 'private' : 'shared'); return JSON.parse(view === 'private' ? row.paper_json : view === 'workshop' ? row.workshop_json : row.published_json); }
  asset(id, assetId) { const row = this.db.prepare('SELECT metadata_json FROM assets WHERE resource_id = ? AND id = ?').get(id, assetId); return row ? JSON.parse(row.metadata_json) : null; }

  assetFor(user, id, assetId, options = {}) {
    const row = this.readable(user, id, options), metadata = this.asset(id, assetId);
    requireCondition(metadata && (row._view === 'private' || this.paperFor(user, row).assets[assetId]), 404, '资料不存在或无权访问');
    return {path: this.files.assetPath(id, metadata.path), metadata};
  }

  usedBytes(userId) {
    const assets=this.db.prepare('SELECT coalesce(sum(a.bytes), 0) AS bytes FROM assets a JOIN resources r ON r.id = a.resource_id WHERE r.owner_id = ?').get(userId).bytes;
    // Explicitly submitted task snapshots remain available after a private
    // original is deleted, and consume the same account storage allowance.
    const snapshots=this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='assignment_snapshots'").get()
      ? this.db.prepare('SELECT coalesce(sum(bytes),0) AS bytes FROM assignment_snapshots WHERE author_id=?').get(userId).bytes : 0;
    const aiSources=this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ai_sources'").get()
      ?this.db.prepare('SELECT coalesce(sum(bytes),0) AS bytes FROM ai_sources WHERE user_id=?').get(userId).bytes:0;
    return assets+snapshots+aiSources;
  }

  checkQuota(user, additional = 0) {
    const count = this.db.prepare('SELECT count(*) AS n FROM resources WHERE owner_id = ?').get(user.id).n;
    requireCondition(count < this.maxResources, 413, `个人空间最多保存${this.maxResources}份资源`);
    requireCondition(this.usedBytes(user.id) + additional <= this.quotaBytes, 413, '个人空间容量不足，请先删除不需要的资源');
  }

  describe(user, row, publicView = false) {
    const selected = publicView ? {...row, _view: 'shared'} : row;
    const paper = this.paperFor(user, selected), view = selected._view || (row.owner_id === user.id ? 'private' : 'shared');
    const origin = this.db.prepare(`SELECT o.*, w.visible FROM resource_origins o LEFT JOIN workshop_posts w ON w.id = o.post_id WHERE o.resource_id = ?`).get(row.id);
    const result = {id: row.id, title: paper.title, author: row.author, authorRole: row.author_role, questionCount: paper.questions.length,
      sceneCount: paper.questions.reduce((n, q) => n + q.scenes.length, 0),
      pendingCount: paper.questions.filter(q => q.review !== 'confirmed').length,
      version: view === 'shared' ? row.published_version || row.version : view === 'workshop' ? row.workshop_version : row.version,
      writable: view === 'private' && row.owner_id === user.id, owned: row.owner_id === user.id,
      published: !!row.published_json, communityPublished: !!row.workshop_visible, workshopId: row.workshop_id || null,
      view, groups: view === 'workshop' ? [] : this.groups.targets(user, row.id),
      updatedAt: view === 'shared' ? row.published_at : view === 'workshop' ? row.workshop_stamp : row.updated_at};
    if (view==='private'&&row.owner_id===user.id)Object.assign(result,this.assignmentContext?.(user,row.id)||{});
    if (origin) result.origin = {id: origin.post_id, title: origin.original_title, author: origin.original_author, available: !!origin.visible};
    if (view === 'workshop') result.originalFiles = Object.values(paper.assets).filter(asset => asset.kind === 'original' && !imageMime.test(asset.mime))
      .map(asset => ({id: asset.id, name: asset.name, bytes: asset.bytes, url: this.assetURL(row.id, asset.id, view)}));
    return result;
  }

  assetURL(id, assetId, view) { return '/api/resources/' + id + '/assets/' + assetId + (view && view !== 'private' ? '?view=' + view : ''); }

  library(user) {
    const mine = this.db.prepare('SELECT id FROM resources WHERE owner_id = ? ORDER BY updated_at DESC').all(user.id).map(({id}) => this.row(id));
    const shared = this.db.prepare('SELECT id FROM resources WHERE published_json IS NOT NULL ORDER BY published_at DESC').all()
      .map(({id}) => this.row(id)).filter(row => row.owner_id === user.id || this.groups.canReadShared(user, row.id));
    return {mine: mine.map(row => this.describe(user, {...row, _view: 'private'})), shared: shared.map(row => this.describe(user, row, true)),
      ...this.groups.list(user), usage: {bytes: this.usedBytes(user.id), limit: this.quotaBytes, count: mine.length, maxResources: this.maxResources}};
  }

  state(user, id, options = {}) {
    const row = this.readable(user, id, options), paper = this.paperFor(user, row);
    for (const asset of Object.values(paper.assets)) if (imageMime.test(asset.mime)) asset.displayURL = this.assetURL(id, asset.id, row._view);
    return {paper: validatePaper(paper), resource: this.describe(user, row), papers: this.library(user).mine};
  }

  canonical(user, row, input, extraAssets = []) {
    const paper = validatePaper(withoutDisplay(input));
    requireCondition(paper.id === row.id, 400, '资源编号不一致');
    const allowed = this.paperFor(user, row).assets;
    for (const id of Object.keys(paper.assets)) {
      const registered = this.asset(row.id, id) || extraAssets.find(asset => asset.id === id);
      requireCondition(registered && ((row._view || 'private') === 'private' || allowed[id]), 400, '资源引用了未登记或无权访问的资料');
      paper.assets[id] = registered;
    }
    requireCondition(JSON.stringify(paper).length <= 10 * 1024 * 1024, 413, '资源文字和场景数据过大，请分成多份试卷');
    return paper;
  }

  sourceCredit(user,jobId){
    if(!jobId)return 0;
    requireCondition(this.db.prepare('SELECT 1 FROM ai_jobs WHERE id=? AND user_id=?').get(jobId,user.id),404,'AI来源不存在或无权访问');
    return this.db.prepare('SELECT coalesce(sum(bytes),0) AS bytes FROM ai_sources WHERE job_id=? AND user_id=?').get(jobId,user.id).bytes;
  }

  consumeAISources(user,jobId,paper){
    if(!jobId)return;
    this.afterAIApply?.(user,jobId,paper.id);
    this.db.prepare('DELETE FROM ai_sources WHERE job_id=? AND user_id=?').run(jobId,user.id);
    const sceneId=paper.questions.find(q=>q.id===paper.activeQuestionId)?.activeSceneId||null;
    this.db.prepare("UPDATE ai_jobs SET status='applied',phase=CASE WHEN mode='extract' THEN '已创建题目草稿' ELSE '已创建独立场景' END,applied_resource_id=?,applied_scene_id=?,updated_at=? WHERE id=? AND user_id=?").run(paper.id,sceneId,now(),jobId,user.id);
  }

  insert(user, input, assets = Object.values(input.assets), {origin,sourceJobId,afterInsert} = {}) {
    const paper = validatePaper(withoutDisplay(input));
    requireCondition(JSON.stringify(paper).length <= 10 * 1024 * 1024, 413, '资源文字和场景数据过大，请分成多份试卷');
    const sourceCredit=this.sourceCredit(user,sourceJobId);
    this.checkQuota(user, assets.reduce((n, a) => n + a.bytes, 0)-sourceCredit);
    const timestamp = now();
    transaction(this.db, () => {
      this.db.prepare(`INSERT INTO resources(id, owner_id, title, question_count, scene_count, version, paper_json, created_at, updated_at)
        VALUES(?, ?, ?, ?, ?, 1, ?, ?, ?)`).run(paper.id, user.id, paper.title, paper.questions.length,
          paper.questions.reduce((n, q) => n + q.scenes.length, 0), JSON.stringify(paper), timestamp, timestamp);
      const add = this.db.prepare('INSERT INTO assets(resource_id, id, metadata_json, bytes) VALUES(?, ?, ?, ?)');
      for (const asset of assets) add.run(paper.id, asset.id, JSON.stringify(asset), asset.bytes);
      this.consumeAISources(user,sourceJobId,paper);
      if (origin) {
        this.db.prepare('INSERT INTO resource_origins(resource_id, post_id, original_title, original_author, created_at) VALUES(?, ?, ?, ?, ?)')
          .run(paper.id, origin.id, origin.title, origin.author, timestamp);
        this.db.prepare('UPDATE workshop_posts SET remix_count = remix_count + 1 WHERE id = ?').run(origin.id);
      }
      // Internal synchronous hooks commit ownership metadata with the resource.
      if(afterInsert)afterInsert();
    });
    return this.state(user, paper.id);
  }

  create(user, title) { return this.insert(user, newPaper(title)); }

  update(user, input, version, extraAssets = [], {sourceJobId} = {}) {
    const row = this.writable(user, input.id, version), paper = this.canonical(user, row, input, extraAssets);
    const sourceCredit=this.sourceCredit(user,sourceJobId);
    requireCondition(this.usedBytes(user.id) + extraAssets.reduce((n, a) => n + a.bytes, 0)-sourceCredit <= this.quotaBytes, 413, '个人空间容量不足');
    for (const asset of extraAssets) paper.assets[asset.id] = asset;
    paper.updatedAt = now();
    validatePaper(paper);
    transaction(this.db, () => {
      const changed = this.db.prepare(`UPDATE resources SET title = ?, question_count = ?, scene_count = ?, version = version + 1,
        paper_json = ?, updated_at = ? WHERE id = ? AND version = ?`).run(paper.title, paper.questions.length,
          paper.questions.reduce((n, q) => n + q.scenes.length, 0), JSON.stringify(paper), paper.updatedAt, paper.id, version);
      if (!changed.changes) throw new HTTPError(409, '此资源已在其他页面更新', 'version_conflict');
      for (const asset of extraAssets) this.db.prepare('INSERT INTO assets(resource_id, id, metadata_json, bytes) VALUES(?, ?, ?, ?)')
        .run(paper.id, asset.id, JSON.stringify(asset), asset.bytes);
      this.consumeAISources(user,sourceJobId,paper);
    });
    return {version: version + 1, savedAt: paper.updatedAt};
  }

  async writeAsset(paperId, bytes, {id = uid(), name = '题图', mime = 'image/png', kind = 'image'} = {}) {
    requireCondition(/^[a-zA-Z0-9_-]{1,100}$/.test(id), 400, '资料编号不正确');
    const data = Buffer.from(bytes), path = 'assets/' + id + (extensions[mime] || '.bin');
    const asset = {id, path, name: String(name).slice(0, 250), mime, kind, bytes: data.length,
      sha256: createHash('sha256').update(data).digest('hex')};
    if (imageMime.test(mime)) {
      let info; try { info = await sharp(data, {limitInputPixels: 20_000_000}).metadata(); } catch { throw new HTTPError(400, '题图格式不正确或尺寸过大：' + asset.name); }
      requireCondition(({png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif'})[info.format] === mime, 400, '题图内容与声明类型不一致：' + asset.name);
      asset.width = info.width; asset.height = info.height;
    }
    if (mime === 'image/png' && data.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && data.length >= 24) {
      asset.width = data.readUInt32BE(16); asset.height = data.readUInt32BE(20);
    }
    await mkdir(join(this.files.folder(paperId), 'assets'), {recursive: true});
    await writeFile(this.files.assetPath(paperId, path), data, {flag: 'wx'});
    return asset;
  }

  async portable(user, id, input, {includeOriginals = true, view} = {}) {
    const row = this.readable(user, id, {view}), paper = this.canonical(user, row, input || this.paperFor(user, row));
    const keep = collectAssets(paper, {includeOriginals});
    for (const [assetId, asset] of Object.entries(paper.assets)) {
      if (!keep.has(assetId)) { delete paper.assets[assetId]; continue; }
      const bytes = await readFile(this.files.assetPath(id, asset.path));
      asset.url = 'data:' + asset.mime + ';base64,' + bytes.toString('base64'); delete asset.path; delete asset.displayURL;
    }
    if (!includeOriginals) paper.sources = paper.sources.map(({asset, ...source}) => source);
    return validatePaper(paper, {portable: true});
  }

  async importPortable(user, input) {
    const paper = validatePaper(input, {portable: true}), originalAssets = Object.values(paper.assets), id = 'exam-' + uid();
    this.checkQuota(user, originalAssets.reduce((n, a) => n + Math.ceil((a.url?.length || 0) * .75), 0));
    paper.id = id; paper.importedAt = now(); paper.assets = {};
    try {
      for (const asset of originalAssets) {
        if (!asset.url) continue;
        const bytes = Buffer.from(asset.url.split(',')[1], 'base64');
        requireCondition(!asset.sha256 || createHash('sha256').update(bytes).digest('hex') === asset.sha256, 400, '资料校验不一致：' + asset.name);
        paper.assets[asset.id] = await this.writeAsset(id, bytes, asset);
      }
      return this.insert(user, paper);
    } catch (error) { await this.removeFolder(id); throw error; }
  }

  async fork(user, id, input, {view, origin} = {}) {
    const row = this.readable(user, id, {view}), paper = this.canonical(user, row, input || this.paperFor(user, row)), newId = 'exam-' + uid();
    this.checkQuota(user, Object.values(paper.assets).reduce((n, a) => n + a.bytes, 0));
    paper.id = newId; paper.title = paper.title.slice(0, 126) + ' · 我的副本'; paper.createdAt = paper.updatedAt = now();
    try {
      await mkdir(join(this.files.folder(newId), 'assets'), {recursive: true});
      for (const asset of Object.values(paper.assets)) await copyFile(this.files.assetPath(id, asset.path), this.files.assetPath(newId, asset.path));
      return this.insert(user,paper,Object.values(paper.assets),{origin,afterInsert:()=>this.afterFork?.(user,id,newId)});
    } catch (error) { await this.removeFolder(newId); throw error; }
  }

  publish(user, id, version, includeReference = true, groupIds = [this.groups.legacyId()]) {
    requireCondition(user.role === 'teacher', 403, '共享资源由教师发布');
    const row = this.writable(user, id, version), paper = JSON.parse(row.paper_json);
    const targetIds = this.groups.validateTargets(user, groupIds);
    requireCondition(paper.questions.length > 0, 400, '先添加题目再发布');
    const keep = collectAssets(paper, {includeOriginals: false});
    for (const assetId of Object.keys(paper.assets)) if (!keep.has(assetId)) delete paper.assets[assetId];
    // A publication is an explicit snapshot. Editing the teacher's private
    // draft never changes what students are currently reading.
    paper.sources = paper.sources.map(({asset, paragraphs, ...source}) => source);
    if (!includeReference) for (const question of paper.questions) question.referenceText = '';
    transaction(this.db, () => {
      this.db.prepare('UPDATE resources SET published_json = ?, published_at = ?, published_version = version + 1, version = version + 1 WHERE id = ?').run(JSON.stringify(paper), now(), id);
      this.groups.setTargets(id, targetIds);
    });
    return this.describe(user, this.row(id));
  }

  unpublish(user, id, version) {
    requireCondition(user.role === 'teacher', 403, '共享资源由教师管理');
    this.writable(user, id, version);
    transaction(this.db, () => {
      this.db.prepare('UPDATE resources SET published_json = NULL, published_at = NULL, published_version = NULL, version = version + 1 WHERE id = ?').run(id);
      this.groups.setTargets(id, []);
    });
    return true;
  }

  async removeFolder(id) {
    const target = resolve(this.files.folder(id)), base = resolve(this.files.root), rel = relative(base, target);
    requireCondition(/^exam-[a-f0-9-]{36}$/i.test(rel) && target !== base, 400, '资料目录不正确');
    await rm(target, {recursive: true, force: true});
  }

  async delete(user, id, version) {
    this.writable(user, id, version);
    await this.removeFolder(id);
    this.db.prepare('DELETE FROM resources WHERE id = ? AND owner_id = ? AND version = ?').run(id, user.id, version);
    return true;
  }
}
