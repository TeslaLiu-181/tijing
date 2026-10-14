import {randomUUID} from 'node:crypto';
import {clone, collectAssets, imageMime, now, validatePaper} from '../../src/exam/model.mjs';
import {transaction} from './database.mjs';
import {requireCondition} from './errors.mjs';
import {isPlatformAdmin, managesStudentAccount} from './account-permissions.mjs';
import {profileAppearance} from './account-profiles.mjs';

export class Workshop {
  constructor(db, resources) { this.db = db; this.resources = resources; }
  moderates(user,row){return user.role==='teacher'&&managesStudentAccount(this.db,user,row.owner_id);}
  row(id) { return this.db.prepare('SELECT w.*, u.display_name AS author, u.role AS author_role FROM workshop_posts w JOIN users u ON u.id = w.owner_id WHERE w.id = ?').get(id); }
  accessible(user, id) {
    const row = this.row(id);
    requireCondition(row && (row.visible || row.owner_id === user.id || this.moderates(user,row)), 404, '作品不存在或已撤下');
    return row;
  }
  describe(user, row) {
    const paper = JSON.parse(row.snapshot_json), image = row.category === 'scene' ? null : paper.questions.flatMap(question => question.attachments).find(ref => { const asset=paper.assets[ref.id]; return imageMime.test(asset?.mime||'') && asset.width>=180 && asset.height>=90; });
    const origin = this.db.prepare('SELECT o.*, w.visible FROM resource_origins o LEFT JOIN workshop_posts w ON w.id = o.post_id WHERE o.resource_id = ?').get(row.resource_id);
    return {id: row.id, resourceId: row.resource_id, title: row.title, description: row.description, category: row.category, selection: row.selection, includeOriginals: !!row.include_originals,
      authorId: row.owner_id, author: row.author, authorRole: row.author_role, authorAvatarURL:profileAppearance(this.db,row.owner_id).avatarURL, mine: row.owner_id === user.id, visible: !!row.visible, moderated: !!row.moderated,
      hiddenReason: row.owner_id === user.id || this.moderates(user,row) ? row.hidden_reason : '', manageable:this.moderates(user,row), version: row.version,
      questionCount: paper.questions.length, sceneCount: paper.questions.reduce((n, question) => n + question.scenes.length, 0),
      pendingCount: paper.questions.filter(question => question.review !== 'confirmed').length,
      likeCount: this.db.prepare('SELECT count(*) AS n FROM workshop_likes WHERE post_id = ?').get(row.id).n,
      liked: !!this.db.prepare('SELECT 1 FROM workshop_likes WHERE post_id = ? AND user_id = ?').get(row.id, user.id),
      remixCount: row.remix_count, createdAt: row.created_at, updatedAt: row.updated_at,
      previewURL: image ? this.resources.assetURL(row.resource_id, image.id, 'workshop') : null,
      origin: origin ? {id: origin.post_id, title: origin.original_title, author: origin.original_author, available: !!origin.visible} : null};
  }
  list(user, input = {}) {
    const where = [], values = [];
    if (input.mine === '1' || input.mine === true) { where.push('w.owner_id = ?'); values.push(user.id); }
    else if (input.hidden === '1') { requireCondition(user.role === 'teacher', 403, '此操作仅供教师使用'); where.push('w.visible = 0'); if(!isPlatformAdmin(this.db,user)){where.push("EXISTS(SELECT 1 FROM users s JOIN learning_groups g ON g.id=s.class_id WHERE s.id=w.owner_id AND g.owner_id=?)");values.push(user.id);} }
    else where.push('w.visible = 1');
    if (input.category && input.category !== 'all') { requireCondition(['scene','exercise','document','paper'].includes(input.category), 400, '作品类型不正确'); where.push('w.category = ?'); values.push(input.category); }
    const search = String(input.search || '').trim().slice(0, 100);
    if (search) { where.push("(instr(lower(w.title || ' ' || w.description || ' ' || u.display_name), lower(?)) > 0)"); values.push(search); }
    if (input.before) {
      const cursor = this.accessible(user, input.before);
      where.push('(w.updated_at < ? OR (w.updated_at = ? AND w.id < ?))'); values.push(cursor.updated_at, cursor.updated_at, cursor.id);
    }
    const rows = this.db.prepare('SELECT w.*, u.display_name AS author, u.role AS author_role FROM workshop_posts w JOIN users u ON u.id = w.owner_id WHERE ' + where.join(' AND ') + ' ORDER BY w.updated_at DESC, w.id DESC LIMIT 41').all(...values);
    return {posts: rows.slice(0,40).map(row => this.describe(user, row)), nextCursor: rows.length > 40 ? rows[39].id : null};
  }
  state(user, id) { const row = this.accessible(user, id); return {...this.resources.state(user, row.resource_id, {view:'workshop'}), post: this.describe(user,row)}; }
  publish(user, input, version) {
    const resource = this.resources.writable(user, input.resourceId, version), paper = clone(JSON.parse(resource.paper_json));
    const existing = this.db.prepare('SELECT * FROM workshop_posts WHERE resource_id = ?').get(resource.id);
    requireCondition(!existing?.moderated || this.moderates(user,existing), 403, '作品已由教师撤下，请联系负责教师或平台管理员处理');
    requireCondition(['scene','exercise','document','paper'].includes(input.category), 400, '请选择作品类型');
    const title = String(input.title || paper.title).trim(), description = String(input.description || '').trim(), selection = input.selection || 'paper';
    requireCondition(title.length >= 1 && title.length <= 140 && description.length <= 1200, 400, '标题最多140个字符，介绍最多1200个字符');
    requireCondition(['paper','question','scene'].includes(selection), 400, '发布范围不正确');
    for (const key of ['includeOriginals','includeReference']) if (input[key] !== undefined) requireCondition(typeof input[key] === 'boolean', 400, '共享选项不正确');
    if (selection !== 'paper') {
      const question = paper.questions.find(question => question.id === input.questionId);
      requireCondition(question, 400, '当前题目不存在，请重新打开资源');
      paper.questions = [question]; paper.activeQuestionId = question.id;
      if (selection === 'scene') {
        const scene = question.scenes.find(scene => scene.id === input.sceneId);
        requireCondition(scene, 400, '当前场景不存在，请重新选择');
        question.scenes = [scene]; question.activeSceneId = scene.id;
      }
    }
    requireCondition(paper.questions.length > 0, 400, '先准备题目或材料再发布');
    if (input.category === 'scene') requireCondition(paper.questions.some(question => question.scenes.length), 400, '场景作品至少包含一个场景');
    if (input.category === 'document') requireCondition(paper.sources.length > 0, 400, '请先导入自己的文档或图片材料');
    paper.title = title;
    const keep = collectAssets(paper, {includeOriginals:input.includeOriginals === true});
    for (const assetId of Object.keys(paper.assets)) if (!keep.has(assetId)) delete paper.assets[assetId];
    paper.sources = paper.sources.map(({paragraphs, asset, ...source}) => ({...source, ...(input.includeOriginals === true && asset ? {asset} : {})}));
    if (input.includeReference === false) for (const question of paper.questions) question.referenceText = '';
    validatePaper(paper);
    const id = existing?.id || 'work-' + randomUUID(), stamp = now();
    // Public work is a separate immutable snapshot; drafting or moving classes
    // cannot silently change its contents or expose additional original files.
    if (existing) this.db.prepare('UPDATE workshop_posts SET title = ?, description = ?, category = ?, snapshot_json = ?, selection = ?, include_originals = ?, visible = 1, moderated = 0, hidden_reason = ?, version = version + 1, updated_at = ? WHERE id = ?')
      .run(title, description, input.category, JSON.stringify(paper), selection, Number(input.includeOriginals === true), '', stamp, id);
    else this.db.prepare('INSERT INTO workshop_posts(id, resource_id, owner_id, title, description, category, snapshot_json, selection, include_originals, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, resource.id, user.id, title, description, input.category, JSON.stringify(paper), selection, Number(input.includeOriginals === true), stamp, stamp);
    return this.describe(user,this.row(id));
  }
  like(user, id, input) {
    const row = this.accessible(user,id);
    requireCondition(row.visible, 404, '作品已撤下');
    requireCondition(row.owner_id !== user.id, 400, '可以为其他用户的作品点赞');
    requireCondition(typeof input.liked === 'boolean', 400, '点赞状态不正确');
    transaction(this.db,()=>{if(input.liked){const added=this.db.prepare('INSERT OR IGNORE INTO workshop_likes(post_id,user_id,created_at) VALUES(?,?,?)').run(id,user.id,now()).changes;
      if(added)this.notifications?.notify(row.owner_id,user.id,'workshop-like','workshop',id,'有人为你的作品点赞');
    }else this.db.prepare('DELETE FROM workshop_likes WHERE post_id = ? AND user_id = ?').run(id,user.id);});
    return this.describe(user,this.row(id));
  }
  async remix(user,id,input = {}) {
    const row=this.accessible(user,id); requireCondition(row.visible,404,'作品已撤下');
    const result=await this.resources.fork(user,row.resource_id,input.paper,{view:'workshop',origin:{id:row.id,title:row.title,author:row.author}});
    this.notifications?.notify(row.owner_id,user.id,'workshop-remix','workshop',id,'有人从你的作品开始了二创');return result;
  }
  visibility(user,id,input,version) {
    const row=this.accessible(user,id);
    requireCondition(row.owner_id === user.id || this.moderates(user,row),403,'只有作者或负责教师可以管理作品');
    requireCondition(Number.isSafeInteger(version) && version === row.version,409,'作品已更新，请刷新后再试','workshop_version_conflict');
    requireCondition(typeof input.visible === 'boolean',400,'作品状态不正确');
    if (input.visible && row.moderated) requireCondition(this.moderates(user,row),403,'作品已由教师撤下，请联系负责教师或平台管理员');
    const reason=String(input.reason||'').trim();requireCondition(reason.length<=300,400,'说明最多300个字符');
    const moderated=!input.visible && this.moderates(user,row) && row.owner_id!==user.id;
    this.db.prepare('UPDATE workshop_posts SET visible = ?, moderated = ?, hidden_reason = ?, version = version + 1, updated_at = ? WHERE id = ?')
      .run(Number(input.visible),Number(moderated),reason,now(),id);
    return this.describe(user,this.row(id));
  }
}
