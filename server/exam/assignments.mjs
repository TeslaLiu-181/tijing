import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,copyFile,mkdir,rm,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {clone,collectAssets,imageMime,now,validatePaper} from '../../src/exam/model.mjs';
import {exportResource} from '../../src/exam/resources.mjs';
import {offlineHTML} from '../../desktop/exam/backend.mjs';
import {transaction} from './database.mjs';
import {requireCondition} from './errors.mjs';

const id=prefix=>prefix+'-'+randomUUID();
const text=(value,max,label,minimum=0)=>{requireCondition(typeof value==='string'&&value.trim().length>=minimum&&value.trim().length<=max,400,label+'长度不正确');return value.trim();};
const teacher=user=>requireCondition(user?.role==='teacher',403,'此操作仅供教师使用');
const checkVersion=(actual,version,label='作业')=>requireCondition(Number.isSafeInteger(version)&&actual===version,409,label+'已在其他页面更新，请刷新后再试','assignment_version_conflict');
const statuses=['draft','published','archived'];
const kinds=['scene','exercise','document','exploration'];
const requirementSnapshot=row=>({title:row.title,instructions:row.instructions,kind:row.kind,materialId:row.material_id,dueAt:row.due_at,allowLate:!!row.allow_late,aiPolicy:row.ai_policy});
const deadline=value=>{if(value===null||value==='')return null;requireCondition(typeof value==='string'&&/^\d{4}-\d\d-\d\dT/.test(value)&&Number.isFinite(Date.parse(value)),400,'截止时间不正确');return new Date(value).toISOString();};
function rubric(value){
  requireCondition(Array.isArray(value)&&value.length<=12,400,'评价要点最多12项');
  requireCondition(value.every(item=>item&&typeof item==='object'&&!Array.isArray(item)),400,'评价要点格式不正确');
  const result=value.map(item=>({id:item.id||id('criterion'),label:text(item.label,80,'评价要点',1),description:text(item.description||'',500,'评价说明')}));
  requireCondition(result.every(item=>/^criterion-[a-f0-9-]{36}$/.test(item.id))&&new Set(result.map(item=>item.id)).size===result.length,400,'评价要点编号不正确');return result;
}
// These checks only prove that submitted data can be opened. They deliberately
// do not assign marks or claim that a student's physics reasoning is correct.
export function assignmentChecks(paper){
  validatePaper(paper);const scenes=paper.questions.flatMap(q=>q.scenes.map(s=>({questionTitle:q.title,title:s.title,kind:s.kind,ready:s.status==='ready',
    ...(s.kind==='planar'?{objectCount:s.snapshot.scene.objects.length,particleCount:s.snapshot.scene.objects.filter(o=>o.kind==='particle'||o.kind==='source').length}:{})})));
  const warnings=[];if(paper.questions.some(q=>q.review!=='confirmed'))warnings.push('部分题目来源尚待人工核对，不能据此判断题意完整或答案正确。');
  if(scenes.some(s=>!s.ready))warnings.push('部分场景仍标记为草稿，请说明哪些内容需要教师检查。');
  if(scenes.some(s=>s.kind==='planar'&&s.particleCount===0))warnings.push('部分平面场景没有粒子或粒子源；若用于轨迹探究，请检查是否符合任务要求。');
  return {stage:'structure',valid:true,requiresTeacherReview:true,questionCount:paper.questions.length,sceneCount:scenes.length,scenes,warnings,
    limitation:'只检查资源结构、场景参数与关系表达式可解析，不代替物理推理、题意一致性或教师评阅。'};
}

export class Assignments {
  constructor(db,resources){
    this.db=db;this.resources=resources;this.groups=resources.groups;
    db.exec(`
      CREATE TABLE IF NOT EXISTS teaching_assignments (
        id TEXT PRIMARY KEY,teacher_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,instructions TEXT NOT NULL,
        kind TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',due_at TEXT,allow_late INTEGER NOT NULL DEFAULT 1,ai_policy TEXT NOT NULL DEFAULT 'allowed',
        rubric_json TEXT NOT NULL DEFAULT '[]',material_id TEXT,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,published_at TEXT
      );
      CREATE INDEX IF NOT EXISTS assignments_teacher ON teaching_assignments(teacher_id,status,updated_at);
      CREATE TABLE IF NOT EXISTS assignment_resource_links (
        resource_id TEXT PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
        assignment_id TEXT NOT NULL REFERENCES teaching_assignments(id),created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS assignment_link_task ON assignment_resource_links(assignment_id,resource_id);
      CREATE TABLE IF NOT EXISTS assignment_targets (
        assignment_id TEXT NOT NULL REFERENCES teaching_assignments(id),group_id TEXT NOT NULL REFERENCES learning_groups(id),
        PRIMARY KEY(assignment_id,group_id)
      );
      CREATE TABLE IF NOT EXISTS assignment_recipients (
        assignment_id TEXT NOT NULL REFERENCES teaching_assignments(id),user_id TEXT NOT NULL REFERENCES users(id),
        group_ids_json TEXT NOT NULL,class_id TEXT,class_name TEXT NOT NULL DEFAULT '',assigned_at TEXT NOT NULL,
        PRIMARY KEY(assignment_id,user_id)
      );
      CREATE INDEX IF NOT EXISTS assignment_recipient_user ON assignment_recipients(user_id,assignment_id);
      CREATE TABLE IF NOT EXISTS assignment_snapshots (
        id TEXT PRIMARY KEY,assignment_id TEXT NOT NULL REFERENCES teaching_assignments(id),author_id TEXT NOT NULL REFERENCES users(id),
        paper_json TEXT NOT NULL,bytes INTEGER NOT NULL,created_at TEXT NOT NULL,origin_json TEXT
      );
      CREATE TABLE IF NOT EXISTS assignment_submissions (
        id TEXT PRIMARY KEY,assignment_id TEXT NOT NULL REFERENCES teaching_assignments(id),student_id TEXT NOT NULL REFERENCES users(id),
        revision INTEGER NOT NULL,version INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'submitted',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
        UNIQUE(assignment_id,student_id)
      );
      CREATE INDEX IF NOT EXISTS submissions_assignment ON assignment_submissions(assignment_id,status,updated_at);
      CREATE TABLE IF NOT EXISTS assignment_submission_revisions (
        submission_id TEXT NOT NULL REFERENCES assignment_submissions(id),revision INTEGER NOT NULL,snapshot_id TEXT NOT NULL UNIQUE REFERENCES assignment_snapshots(id),
        note TEXT NOT NULL,late INTEGER NOT NULL,checks_json TEXT NOT NULL,assignment_version INTEGER NOT NULL,rubric_json TEXT NOT NULL,created_at TEXT NOT NULL,
        review_status TEXT NOT NULL DEFAULT 'submitted',feedback TEXT NOT NULL DEFAULT '',rubric_feedback_json TEXT NOT NULL DEFAULT '[]',reviewed_at TEXT,request_id TEXT,request_hash TEXT,requirements_json TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY(submission_id,revision)
      );
    `);
    if(!db.prepare('PRAGMA table_info(assignment_snapshots)').all().some(column=>column.name==='origin_json'))db.exec('ALTER TABLE assignment_snapshots ADD COLUMN origin_json TEXT');
    if(!db.prepare('PRAGMA table_info(teaching_assignments)').all().some(column=>column.name==='ai_policy'))db.exec("ALTER TABLE teaching_assignments ADD COLUMN ai_policy TEXT NOT NULL DEFAULT 'allowed'");
    if(!db.prepare('PRAGMA table_info(assignment_submission_revisions)').all().some(column=>column.name==='requirements_json'))db.exec("ALTER TABLE assignment_submission_revisions ADD COLUMN requirements_json TEXT NOT NULL DEFAULT '{}'");
    for(const field of ['request_id','request_hash'])if(!db.prepare('PRAGMA table_info(assignment_submission_revisions)').all().some(column=>column.name===field))db.exec('ALTER TABLE assignment_submission_revisions ADD COLUMN '+field+' TEXT');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS submission_request ON assignment_submission_revisions(submission_id,request_id) WHERE request_id IS NOT NULL');
  }
  async cleanupPending(){
    await this.resources.files.init();let cleaned=0;
    for(const folder of await readdir(this.resources.files.root,{withFileTypes:true})){
      if(!folder.isDirectory()||!/^exam-[a-f0-9-]{36}$/.test(folder.name))continue;
      const marker=join(this.resources.files.folder(folder.name),'.assignment-pending');
      try{await stat(marker);}catch{continue;}
      // The process owns the data directory lock. Only our explicit marker can
      // identify interrupted snapshot copies; ordinary resources are untouched.
      if(this.hasSnapshot(folder.name)){await rm(marker,{force:true});continue;}
      if(this.resources.row(folder.name))continue;
      await this.resources.removeFolder(folder.name);cleaned++;
    }
    for(const orphan of this.db.prepare('SELECT s.id FROM assignment_snapshots s WHERE NOT EXISTS(SELECT 1 FROM teaching_assignments a WHERE a.material_id=s.id) AND NOT EXISTS(SELECT 1 FROM assignment_submission_revisions r WHERE r.snapshot_id=s.id OR json_extract(r.requirements_json,\'$.materialId\')=s.id)').all()){
      await this.retireSnapshot(orphan.id);cleaned++;
    }
    return {cleaned};
  }
  async retireSnapshot(snapshotId){
    // Preserve an explicit cleanup marker before removing the registry entry:
    // if deletion is interrupted, startup can remove the leftover directory.
    const marker=join(this.resources.files.folder(snapshotId),'.assignment-pending');
    await mkdir(this.resources.files.folder(snapshotId),{recursive:true});await writeFile(marker,'retired assignment snapshot');
    this.db.prepare('DELETE FROM assignment_snapshots WHERE id=?').run(snapshotId);
    await this.resources.removeFolder(snapshotId);
  }
  row(assignmentId){return this.db.prepare('SELECT a.*,u.display_name AS teacher FROM teaching_assignments a JOIN users u ON u.id=a.teacher_id WHERE a.id=?').get(assignmentId);}
  readable(user,assignmentId){
    const row=this.row(assignmentId);
    requireCondition(row&&(row.teacher_id===user.id||(row.status!=='draft'&&!!this.db.prepare('SELECT 1 FROM assignment_recipients WHERE assignment_id=? AND user_id=?').get(assignmentId,user.id))),404,'作业不存在或不在你的任务范围内');
    return row;
  }
  owned(user,assignmentId){teacher(user);const row=this.readable(user,assignmentId);requireCondition(row.teacher_id===user.id,404,'作业不属于你');return row;}
  targets(row){return this.db.prepare('SELECT g.* FROM assignment_targets t JOIN learning_groups g ON g.id=t.group_id WHERE t.assignment_id=? ORDER BY g.kind,g.created_at').all(row.id);}
  currentSubmission(assignmentId,userId){return this.db.prepare('SELECT * FROM assignment_submissions WHERE assignment_id=? AND student_id=?').get(assignmentId,userId);}
  summary(row){
    const counts={total:0,notSubmitted:0,submitted:0,returned:0,completed:0,late:0};
    counts.total=this.db.prepare('SELECT count(*) AS n FROM assignment_recipients WHERE assignment_id=?').get(row.id).n;
    for(const part of this.db.prepare('SELECT status,count(*) AS n FROM assignment_submissions WHERE assignment_id=? GROUP BY status').all(row.id))counts[part.status]=part.n;
    counts.notSubmitted=counts.total-counts.submitted-counts.returned-counts.completed;
    counts.late=this.db.prepare('SELECT count(*) AS n FROM assignment_submissions s JOIN assignment_submission_revisions r ON r.submission_id=s.id AND r.revision=s.revision WHERE s.assignment_id=? AND r.late=1').get(row.id).n;
    return counts;
  }
  describe(user,row){
    const mine=row.teacher_id===user.id,submission=mine?null:this.currentSubmission(row.id,user.id);
    const groups=this.targets(row).filter(group=>mine||JSON.parse(this.db.prepare('SELECT group_ids_json FROM assignment_recipients WHERE assignment_id=? AND user_id=?').get(row.id,user.id)?.group_ids_json||'[]').includes(group.id));
    return {id:row.id,title:row.title,instructions:row.instructions,kind:row.kind,status:row.status,teacherId:row.teacher_id,teacher:row.teacher,mine,
      dueAt:row.due_at,allowLate:!!row.allow_late,aiPolicy:row.ai_policy,overdue:!!row.due_at&&Date.now()>Date.parse(row.due_at),version:row.version,rubric:JSON.parse(row.rubric_json),
      groups:groups.map(group=>({id:group.id,name:group.name,kind:group.kind})),materialId:row.material_id,createdAt:row.created_at,updatedAt:row.updated_at,publishedAt:row.published_at,
      ...(mine?{progress:this.summary(row)}:{submission:submission?this.describeSubmission(user,submission):null})};
  }
  list(user,input={}){
    const search=String(input.search||'').trim().slice(0,100),status=input.status||'all';
    requireCondition(status==='all'||statuses.includes(status),400,'作业状态不正确');
    const rows=this.db.prepare(`SELECT a.*,u.display_name AS teacher FROM teaching_assignments a JOIN users u ON u.id=a.teacher_id
      WHERE (a.teacher_id=? OR (a.status!='draft' AND EXISTS(SELECT 1 FROM assignment_recipients r WHERE r.assignment_id=a.id AND r.user_id=?)))
      ORDER BY a.updated_at DESC,a.id DESC`).all(user.id,user.id).filter(row=>(status==='all'||row.status===status)&&(!search||(row.title+' '+row.instructions).toLocaleLowerCase().includes(search.toLocaleLowerCase())));
    const page=Math.max(1,Number(input.page)||1),size=24;requireCondition(Number.isSafeInteger(page)&&page<=100000,400,'页码不正确');
    return {assignments:rows.slice((page-1)*size,page*size).map(row=>this.describe(user,row)),total:rows.length,page,pages:Math.max(1,Math.ceil(rows.length/size))};
  }
  input(user,input,old=null){
    const title=text(input.title??old?.title??'',140,'作业标题',1),instructions=text(input.instructions??old?.instructions??'',20000,'任务要求',1),kind=input.kind??old?.kind??'scene';
    requireCondition(kinds.includes(kind),400,'作业类型不正确');
    const dueAt=input.dueAt===undefined?old?.due_at??null:deadline(input.dueAt);
    if(input.allowLate!==undefined)requireCondition(typeof input.allowLate==='boolean',400,'截止处理方式不正确');
    const allowLate=input.allowLate===undefined?old?.allow_late??1:Number(input.allowLate);
    const aiPolicy=input.aiPolicy??old?.ai_policy??'allowed';requireCondition(['allowed','hints','disabled'].includes(aiPolicy),400,'AI帮助策略不正确');
    const criteria=input.rubric===undefined?JSON.parse(old?.rubric_json||'[]'):rubric(input.rubric);
    let targets=input.groupIds===undefined?(old?this.targets(old).map(group=>group.id):[]):null;
    if(targets===null){
      if(old&&old.status!=='draft'){requireCondition(Array.isArray(input.groupIds)&&input.groupIds.length>0&&input.groupIds.length<=200&&input.groupIds.every(value=>typeof value==='string'),400,'投送对象不正确');targets=[...new Set(input.groupIds)];for(const groupId of targets)this.groups.owned(user,groupId);}
      else targets=this.groups.validateTargets(user,input.groupIds);
    }
    if(old?.status!=='draft'&&old&&input.groupIds!==undefined)requireCondition(JSON.stringify([...targets].sort())===JSON.stringify(this.targets(old).map(group=>group.id).sort()),400,'发布后不能更换投送对象；请创建新任务，或补入当前班级/小组的新成员');
    return {title,instructions,kind,dueAt,allowLate,aiPolicy,criteria,targets};
  }
  addRecipients(row){
    let added=0;const targets=this.targets(row),students=new Map();
    for(const group of targets)for(const student of this.groups.students({id:row.teacher_id,role:'teacher'},group.id)){
      if(student.disabled)continue;
      if(!students.has(student.id))students.set(student.id,{student,ids:[]});
      students.get(student.id).ids.push(group.id);
    }
    for(const {student,ids} of students.values())added+=this.db.prepare('INSERT OR IGNORE INTO assignment_recipients(assignment_id,user_id,group_ids_json,class_id,class_name,assigned_at) VALUES(?,?,?,?,?,?)')
      .run(row.id,student.id,JSON.stringify(ids),student.classId,student.className||'行政班待确认',now()).changes;
    return added;
  }
  notifyRecipients(row,kind,message){
    if(!this.notifications)return;
    for(const recipient of this.db.prepare('SELECT user_id FROM assignment_recipients WHERE assignment_id=?').all(row.id))this.notifications.notify(recipient.user_id,row.teacher_id,kind,'assignment',row.id,message);
  }
  async create(user,input){
    teacher(user);requireCondition(this.db.prepare('SELECT count(*) AS n FROM teaching_assignments WHERE teacher_id=?').get(user.id).n<2000,413,'作业任务已达2000份，请联系管理员归档维护');const value=this.input(user,input),assignmentId=id('assignment'),stamp=now();
    this.db.prepare('INSERT INTO teaching_assignments(id,teacher_id,title,instructions,kind,due_at,allow_late,ai_policy,rubric_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(assignmentId,user.id,value.title,value.instructions,value.kind,value.dueAt,value.allowLate,value.aiPolicy,JSON.stringify(value.criteria),stamp,stamp);
    try{
      for(const groupId of value.targets)this.db.prepare('INSERT INTO assignment_targets VALUES(?,?)').run(assignmentId,groupId);
      if(input.material){const frozen=await this.freeze(user,assignmentId,input.material);this.db.prepare('UPDATE teaching_assignments SET material_id=? WHERE id=?').run(frozen.id,assignmentId);}
      if(input.status==='published')return await this.update(user,assignmentId,{status:'published'},1);
      requireCondition(!input.status||input.status==='draft',400,'新任务先保存草稿或发布');return this.describe(user,this.row(assignmentId));
    }catch(error){const snaps=this.db.prepare('SELECT id FROM assignment_snapshots WHERE assignment_id=?').all(assignmentId);for(const snap of snaps)await this.retireSnapshot(snap.id);this.db.prepare('DELETE FROM assignment_targets WHERE assignment_id=?').run(assignmentId);this.db.prepare('DELETE FROM teaching_assignments WHERE id=?').run(assignmentId);throw error;}
  }
  async update(user,assignmentId,input,version){
    const row=this.owned(user,assignmentId);checkVersion(row.version,version);
    const value=this.input(user,input,row),status=input.status??row.status;
    requireCondition(statuses.includes(status),400,'作业状态不正确');
    requireCondition(!(row.status!=='draft'&&status==='draft'),400,'已发布任务保留历史记录，不能改回草稿');
    if(input.refreshRecipients!==undefined)requireCondition(typeof input.refreshRecipients==='boolean',400,'补入成员选项不正确');
    let frozen=null;
    if(input.material!==undefined)frozen=input.material?await this.freeze(user,assignmentId,input.material):null;
    try{
      transaction(this.db,()=>{
        checkVersion(this.row(assignmentId).version,version);
        this.db.prepare('UPDATE teaching_assignments SET title=?,instructions=?,kind=?,due_at=?,allow_late=?,ai_policy=?,rubric_json=?,status=?,material_id=?,version=version+1,updated_at=?,published_at=? WHERE id=?')
          .run(value.title,value.instructions,value.kind,value.dueAt,value.allowLate,value.aiPolicy,JSON.stringify(value.criteria),status,input.material===undefined?row.material_id:frozen?.id??null,now(),row.published_at||(status==='published'?now():null),assignmentId);
        if(row.status==='draft'&&input.groupIds!==undefined){this.db.prepare('DELETE FROM assignment_targets WHERE assignment_id=?').run(assignmentId);for(const groupId of value.targets)this.db.prepare('INSERT INTO assignment_targets VALUES(?,?)').run(assignmentId,groupId);}
        if(status==='published'&&(row.status==='draft'||input.refreshRecipients===true)){
          this.groups.validateTargets(user,value.targets);this.addRecipients(this.row(assignmentId));
        }
        if(row.status==='draft'&&status==='published')this.notifyRecipients(this.row(assignmentId),'assignment-published','老师发布了新的学习任务：'+value.title);
        else if(row.status==='published'&&(input.material!==undefined||value.instructions!==row.instructions||value.title!==row.title||value.aiPolicy!==row.ai_policy||value.dueAt!==row.due_at))this.notifyRecipients(this.row(assignmentId),'assignment-updated','老师更新了任务要求或材料，请重新查看：'+value.title);
      });
    }catch(error){if(frozen)await this.retireSnapshot(frozen.id);throw error;}
    if(input.material!==undefined&&row.material_id&&row.material_id!==frozen?.id&&!this.db.prepare("SELECT 1 FROM assignment_submission_revisions WHERE json_extract(requirements_json,'$.materialId')=?").get(row.material_id))await this.retireSnapshot(row.material_id);
    return this.describe(user,this.row(assignmentId));
  }
  linkResource(user,assignmentId,resourceId){
    const task=this.readable(user,assignmentId),resource=this.resources.readable(user,resourceId,{view:'private'});
    requireCondition(resource.owner_id===user.id,404,'只能关联自己的私人原稿');
    const current=this.db.prepare('SELECT assignment_id FROM assignment_resource_links WHERE resource_id=?').get(resourceId);
    requireCondition(!current||current.assignment_id===assignmentId,409,'此原稿已关联另一项任务；请另建资源，不要覆盖已有任务关系');
    this.db.prepare('INSERT OR IGNORE INTO assignment_resource_links(resource_id,assignment_id,created_at) VALUES(?,?,?)').run(resourceId,assignmentId,now());
    return this.resourceContext(user,resourceId);
  }
  resourceContext(user,resourceId){
    const resource=this.resources.row(resourceId);if(!resource||resource.owner_id!==user.id)return null;
    const link=this.db.prepare('SELECT assignment_id FROM assignment_resource_links WHERE resource_id=?').get(resourceId);if(!link)return null;
    let task;try{task=this.readable(user,link.assignment_id);}catch{return null;}
    return {assignmentId:task.id,assignmentTitle:task.title,aiPolicy:task.teacher_id===user.id?'allowed':task.ai_policy,studentAiPolicy:task.ai_policy,contextType:'assignment-draft'};
  }
  inheritResourceContext(user,sourceId,resourceId){
    const context=this.resourceContext(user,sourceId);
    if(context){
      this.linkResource(user,context.assignmentId,resourceId);
      const credit=this.db.prepare('SELECT * FROM resource_origins WHERE resource_id=?').get(sourceId);
      if(credit&&!this.db.prepare('SELECT 1 FROM resource_origins WHERE resource_id=?').get(resourceId))this.db.prepare('INSERT INTO resource_origins(resource_id,post_id,original_title,original_author,created_at) VALUES(?,?,?,?,?)').run(resourceId,credit.post_id,credit.original_title,credit.original_author,now());
    }
    return this.resources.state(user,resourceId);
  }
  taskPolicy(user,assignmentId){const row=this.readable(user,assignmentId);return {id:row.id,aiPolicy:row.ai_policy,status:row.status,teacherId:row.teacher_id,kind:row.kind,title:row.title,instructions:row.instructions,rubric:JSON.parse(row.rubric_json)};}
  get(user,assignmentId){
    const row=this.readable(user,assignmentId),assignment=this.describe(user,row);
    if(row.teacher_id!==user.id)return {assignment};
    const recipients=this.db.prepare(`SELECT r.*,u.display_name AS student,u.disabled,s.id AS submission_id FROM assignment_recipients r JOIN users u ON u.id=r.user_id
      LEFT JOIN assignment_submissions s ON s.assignment_id=r.assignment_id AND s.student_id=r.user_id WHERE r.assignment_id=? ORDER BY u.display_name,u.id`).all(assignmentId);
    return {assignment,students:recipients.map(student=>({id:student.user_id,name:student.student,className:student.class_name,disabled:!!student.disabled,assignedAt:student.assigned_at,
      groupIds:JSON.parse(student.group_ids_json),submission:student.submission_id?this.describeSubmission(user,this.db.prepare('SELECT * FROM assignment_submissions WHERE id=?').get(student.submission_id)):null}))};
  }
  describeSubmission(user,row){
    const revision=this.db.prepare('SELECT * FROM assignment_submission_revisions WHERE submission_id=? AND revision=?').get(row.id,row.revision);
    const author=this.db.prepare('SELECT display_name FROM users WHERE id=?').get(row.student_id);
    return {id:row.id,assignmentId:row.assignment_id,studentId:row.student_id,student:author.display_name,mine:user.id===row.student_id,status:row.status,revision:row.revision,version:row.version,
      note:revision.note,requirements:JSON.parse(revision.requirements_json),late:!!revision.late,checks:JSON.parse(revision.checks_json),snapshotId:revision.snapshot_id,assignmentVersion:revision.assignment_version,rubric:JSON.parse(revision.rubric_json),
      feedback:revision.feedback,rubricFeedback:JSON.parse(revision.rubric_feedback_json),createdAt:row.created_at,submittedAt:revision.created_at,updatedAt:row.updated_at,reviewedAt:revision.reviewed_at};
  }
  submission(user,assignmentId,submissionId){
    const task=this.readable(user,assignmentId),row=this.db.prepare('SELECT * FROM assignment_submissions WHERE id=? AND assignment_id=?').get(submissionId,assignmentId);
    requireCondition(row&&(task.teacher_id===user.id||row.student_id===user.id),404,'提交记录不存在或无权访问');return row;
  }
  detailSubmission(user,assignmentId,submissionId){
    const row=this.submission(user,assignmentId,submissionId);
    return {submission:this.describeSubmission(user,row),revisions:this.db.prepare('SELECT * FROM assignment_submission_revisions WHERE submission_id=? ORDER BY revision DESC').all(row.id).map(rev=>({
      revision:rev.revision,snapshotId:rev.snapshot_id,note:rev.note,requirements:JSON.parse(rev.requirements_json),late:!!rev.late,status:rev.review_status,feedback:rev.feedback,rubric:JSON.parse(rev.rubric_json),rubricFeedback:JSON.parse(rev.rubric_feedback_json),checks:JSON.parse(rev.checks_json),submittedAt:rev.created_at,reviewedAt:rev.reviewed_at
    }))};
  }
  async copyAsset(sourceId,snapshotId,asset){
    // Registered assets are immutable and already validated on import. Copy
    // files without buffering whole documents into the Node process for every
    // student submitting at once; stat verifies actual stored byte counts.
    const from=this.resources.files.assetPath(sourceId,asset.path),to=this.resources.files.assetPath(snapshotId,asset.path),source=await stat(from);
    requireCondition(source.isFile()&&source.size===asset.bytes,409,'原稿附件已改变，请重新导入或保存后再提交');
    await copyFile(from,to);const copied=await stat(to);requireCondition(copied.size===source.size,409,'附件复制未完成，请重试');return {...asset,bytes:copied.size};
  }
  async freeze(user,assignmentId,input){
    requireCondition(input&&typeof input==='object'&&!Array.isArray(input),400,'资源选择不正确');
    const source=this.resources.writable(user,input.resourceId,input.resourceVersion),paper=clone(JSON.parse(source.paper_json)),selection=input.selection||'paper';
    requireCondition(['paper','question','scene'].includes(selection),400,'资源提交范围不正确');
    if(input.includeOriginals!==undefined)requireCondition(typeof input.includeOriginals==='boolean',400,'原文件共享选项不正确');
    if(input.includeSolutions!==undefined)requireCondition(typeof input.includeSolutions==='boolean',400,'参考解析共享选项不正确');
    if(selection!=='paper'){
      const q=paper.questions.find(q=>q.id===input.questionId);requireCondition(q,400,'当前题目不存在，请重新选择');paper.questions=[q];paper.activeQuestionId=q.id;
      if(selection==='scene'){const s=q.scenes.find(s=>s.id===input.sceneId);requireCondition(s,400,'当前场景不存在，请重新选择');q.scenes=[s];q.activeSceneId=s.id;}
    }
    requireCondition(paper.questions.length>0,400,'资源至少需要一份题目、材料或场景');
    requireCondition(paper.sources.every(source=>source&&typeof source==='object'&&!Array.isArray(source)&&typeof source.id==='string'),400,'资源来源记录不正确，请重新导入或整理');
    if(selection!=='paper'){
      // A selected scene must not reveal filenames or pages belonging to other
      // private questions. Original documents are only considered for sources
      // actually referenced by the selected question.
      const sourceIds=new Set(paper.questions.flatMap(question=>[question.sourceId,...(Array.isArray(question.sourceAnchors)?question.sourceAnchors.map(anchor=>anchor?.sourceId):[])].filter(value=>typeof value==='string')));
      paper.sources=paper.sources.filter(source=>sourceIds.has(source.id));
    }
    if(user.role==='teacher'&&input.includeSolutions!==true)for(const question of paper.questions){
      question.referenceText='';
      // Parts are question stems and scene notes may explain the experiment.
      // Only notes explicitly tagged as answers are excluded with references.
      question.notes=question.notes.filter(note=>!['answer','solution'].includes(note?.kind));
    }
    const keep=collectAssets(paper,{includeOriginals:input.includeOriginals===true});
    for(const assetId of Object.keys(paper.assets))if(!keep.has(assetId))delete paper.assets[assetId];
    paper.sources=paper.sources.map(({asset,paragraphs,...source})=>({...source,...(input.includeOriginals===true?{...(asset?{asset}:{}),...(paragraphs?{paragraphs}:{})}:{})}));
    const assetBytes=Object.values(paper.assets).reduce((n,a)=>n+a.bytes,0),bytes=assetBytes+Buffer.byteLength(JSON.stringify(paper),'utf8'),snapshotCount=this.db.prepare('SELECT count(*) AS n FROM assignment_snapshots WHERE author_id=?').get(user.id).n;
    requireCondition(snapshotCount<1000&&bytes<=100*1024*1024&&this.resources.usedBytes(user.id)+bytes<=this.resources.quotaBytes,413,'作业快照与个人资料共用空间上限，请精简提交材料');
    const snapshotId=id('exam');paper.id=snapshotId;paper.createdAt=paper.updatedAt=now();
    const marker=join(this.resources.files.folder(snapshotId),'.assignment-pending');
    try{
      await mkdir(join(this.resources.files.folder(snapshotId),'assets'),{recursive:true});await writeFile(marker,assignmentId,{flag:'wx'});
      for(const [assetId,asset] of Object.entries(paper.assets)){
        const registered=this.resources.asset(source.id,assetId);requireCondition(registered,400,'资源资料不存在，请重新导入');
        paper.assets[assetId]=await this.copyAsset(source.id,snapshotId,registered);
      }
      for(const source of paper.sources)if(source.asset)source.asset=paper.assets[source.asset.id];
      validatePaper(paper);const checks=assignmentChecks(paper),content=JSON.stringify(paper),sourceOrigin=this.db.prepare('SELECT post_id,original_title,original_author FROM resource_origins WHERE resource_id=?').get(source.id);
      const originContent=sourceOrigin?JSON.stringify({id:sourceOrigin.post_id,title:sourceOrigin.original_title,author:sourceOrigin.original_author,available:false}):null,task=this.row(assignmentId);
      const submissionMetadata=user.role==='student'?Buffer.byteLength(JSON.stringify(checks),'utf8')+Buffer.byteLength(task.rubric_json,'utf8')+Buffer.byteLength(JSON.stringify(requirementSnapshot(task)),'utf8')+Buffer.byteLength(input.note||'','utf8'):0;
      const storageBytes=Object.values(paper.assets).reduce((n,a)=>n+a.bytes,0)+Buffer.byteLength(content,'utf8')+Buffer.byteLength(originContent||'','utf8')+submissionMetadata;
      requireCondition(Buffer.byteLength(content,'utf8')<=10*1024*1024&&storageBytes<=100*1024*1024,413,'快照内容过大，请拆分任务材料');
      // Copying awaits filesystem operations: another request may have consumed
      // the remaining space meanwhile. Recheck directly before the DB insert.
      requireCondition(this.resources.usedBytes(user.id)+storageBytes<=this.resources.quotaBytes,413,'个人资料与作业快照空间不足');
      checkVersion(this.resources.row(source.id)?.version,input.resourceVersion,'个人原稿');
      this.db.prepare('INSERT INTO assignment_snapshots(id,assignment_id,author_id,paper_json,bytes,created_at,origin_json) VALUES(?,?,?,?,?,?,?)').run(snapshotId,assignmentId,user.id,content,storageBytes,now(),originContent);
      await rm(marker,{force:true}).catch(()=>{});
      return {id:snapshotId,paper,checks};
    }catch(error){await this.resources.removeFolder(snapshotId);throw error;}
  }
  async submit(user,assignmentId,input,version){
    requireCondition(user.role==='student',403,'学生才能提交作业');const task=this.readable(user,assignmentId);
    requireCondition(task.status==='published',409,'此任务尚未发布或已归档，不能继续提交');
    const late=!!task.due_at&&Date.now()>Date.parse(task.due_at);requireCondition(!late||task.allow_late,409,'已超过截止时间；老师设置了截止后停止提交');
    const previous=this.currentSubmission(assignmentId,user.id);
    const requestId=input.requestId||null;requireCondition(!requestId||/^[a-f0-9-]{36}$/i.test(requestId),400,'提交请求编号不正确');
    const requestHash=createHash('sha256').update(JSON.stringify({resourceId:input.resourceId,resourceVersion:input.resourceVersion,selection:input.selection||'paper',questionId:input.questionId||null,sceneId:input.sceneId||null,note:input.note||'',includeOriginals:input.includeOriginals===true})).digest('hex');
    if(previous&&requestId){const duplicate=this.db.prepare('SELECT request_hash FROM assignment_submission_revisions WHERE submission_id=? AND request_id=?').get(previous.id,requestId);if(duplicate){requireCondition(duplicate.request_hash===requestHash,409,'同一次提交请求不能替换内容');return this.detailSubmission(user,assignmentId,previous.id);}}
    checkVersion(previous?.version||0,version,'提交记录');
    requireCondition((previous?.revision||0)<20,413,'每个任务最多提交20个修订版本，请联系教师处理');
    requireCondition(previous?.status!=='completed',409,'这份作业已完成评阅；如需重交，请先请老师退回修改');
    const note=text(input.note||'',4000,'提交说明'),frozen=await this.freeze(user,assignmentId,{...input,note});
    try{
      if(task.kind==='scene')requireCondition(frozen.checks.sceneCount>0,400,'场景搭建任务至少需要提交一个场景');
      if(task.kind==='document')requireCondition(input.includeOriginals===true&&frozen.paper.sources.some(source=>source.asset),400,'文档任务需勾选共享原文件，并导入你的材料');
      const submissionId=previous?.id||id('submission'),revision=(previous?.revision||0)+1;
      transaction(this.db,()=>{
        const currentTask=this.readable(user,assignmentId);requireCondition(currentTask.status==='published',409,'任务状态已改变，请刷新');checkVersion(currentTask.version,task.version,'任务要求');checkVersion(this.currentSubmission(assignmentId,user.id)?.version||0,version,'提交记录');
        const deadlinePassed=!!currentTask.due_at&&Date.now()>Date.parse(currentTask.due_at);requireCondition(!deadlinePassed||currentTask.allow_late,409,'已超过截止时间');
        if(previous)this.db.prepare("UPDATE assignment_submissions SET revision=?,version=version+1,status='submitted',updated_at=? WHERE id=?").run(revision,now(),submissionId);
        else this.db.prepare('INSERT INTO assignment_submissions(id,assignment_id,student_id,revision,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(submissionId,assignmentId,user.id,revision,now(),now());
        this.db.prepare('INSERT INTO assignment_submission_revisions(submission_id,revision,snapshot_id,note,late,checks_json,assignment_version,rubric_json,created_at,request_id,request_hash,requirements_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(submissionId,revision,frozen.id,note,Number(deadlinePassed),JSON.stringify(frozen.checks),currentTask.version,currentTask.rubric_json,now(),requestId,requestId?requestHash:null,JSON.stringify(requirementSnapshot(currentTask)));
        this.notifications?.notify(task.teacher_id,user.id,'assignment-submitted','assignment',assignmentId,'学生提交了学习任务：'+task.title);
      });
      return this.detailSubmission(user,assignmentId,submissionId);
    }catch(error){await this.retireSnapshot(frozen.id);throw error;}
  }
  review(user,assignmentId,submissionId,input,version){
    const task=this.owned(user,assignmentId),row=this.submission(user,assignmentId,submissionId);checkVersion(row.version,version,'提交记录');
    requireCondition(['returned','completed'].includes(input.status),400,'请选择退回修改或完成评阅');const feedback=text(input.feedback||'',6000,'评阅意见',1);
    const revision=this.db.prepare('SELECT * FROM assignment_submission_revisions WHERE submission_id=? AND revision=?').get(row.id,row.revision),criteria=JSON.parse(revision.rubric_json),values=input.rubricFeedback||[];
    requireCondition(Array.isArray(values)&&values.length<=criteria.length&&values.every(value=>value&&typeof value==='object'&&!Array.isArray(value))&&new Set(values.map(v=>v.id)).size===values.length,400,'分项反馈不正确');
    const evaluated=values.map(v=>{requireCondition(criteria.some(c=>c.id===v.id),400,'反馈引用了不存在的评价要点');return {id:v.id,feedback:text(v.feedback||'',1000,'分项反馈')};});
    transaction(this.db,()=>{
      checkVersion(this.db.prepare('SELECT version FROM assignment_submissions WHERE id=?').get(row.id).version,version,'提交记录');
      this.db.prepare('UPDATE assignment_submission_revisions SET review_status=?,feedback=?,rubric_feedback_json=?,reviewed_at=? WHERE submission_id=? AND revision=?')
        .run(input.status,feedback,JSON.stringify(evaluated),now(),row.id,row.revision);
      this.db.prepare('UPDATE assignment_submissions SET status=?,version=version+1,updated_at=? WHERE id=?').run(input.status,now(),row.id);
      this.notifications?.notify(row.student_id,user.id,'assignment-reviewed','assignment',assignmentId,input.status==='returned'?'老师退回了任务，请对照建议修改：'+task.title:'老师已完成任务评阅：'+task.title);
    });
    return this.detailSubmission(user,assignmentId,submissionId);
  }
  hasSnapshot(snapshotId){return !!this.db.prepare('SELECT 1 FROM assignment_snapshots WHERE id=?').get(snapshotId);}
  snapshot(user,snapshotId){
    const row=this.db.prepare('SELECT s.*,u.display_name AS author,u.role AS author_role FROM assignment_snapshots s JOIN users u ON u.id=s.author_id WHERE s.id=?').get(snapshotId);
    requireCondition(row,404,'作业快照不存在');const task=this.readable(user,row.assignment_id);
    const submission=this.db.prepare('SELECT s.* FROM assignment_submission_revisions r JOIN assignment_submissions s ON s.id=r.submission_id WHERE r.snapshot_id=?').get(snapshotId);
    const historicalMaterial=!!this.db.prepare("SELECT 1 FROM assignment_submission_revisions r JOIN assignment_submissions s ON s.id=r.submission_id WHERE s.student_id=? AND s.assignment_id=? AND json_extract(r.requirements_json,'$.materialId')=?").get(user.id,task.id,snapshotId);
    requireCondition(task.material_id===snapshotId||historicalMaterial||task.teacher_id===user.id||(submission&&submission.student_id===user.id),404,'不能查看其他学生的提交');
    return {...row,submissionId:submission?.id||null,task};
  }
  snapshotState(user,snapshotId){
    const row=this.snapshot(user,snapshotId),paper=JSON.parse(row.paper_json);
    for(const asset of Object.values(paper.assets))if(imageMime.test(asset.mime))asset.displayURL=this.resources.assetURL(snapshotId,asset.id);
    return {paper:validatePaper(paper),resource:{id:snapshotId,title:paper.title,author:row.author,authorRole:row.author_role,questionCount:paper.questions.length,
      sceneCount:paper.questions.reduce((n,q)=>n+q.scenes.length,0),pendingCount:paper.questions.filter(q=>q.review!=='confirmed').length,version:1,writable:false,owned:false,published:false,
      communityPublished:false,view:'private',groups:[],updatedAt:row.created_at,...(row.origin_json?{origin:JSON.parse(row.origin_json)}:{}),contextType:'assignment',assignmentSnapshot:true,assignmentId:row.assignment_id,submissionId:row.submissionId,
      originalFiles:Object.values(paper.assets).filter(asset=>asset.kind==='original'&&!imageMime.test(asset.mime)).map(asset=>({id:asset.id,name:asset.name,bytes:asset.bytes,url:this.resources.assetURL(snapshotId,asset.id)}))},
      papers:this.resources.library(user).mine};
  }
  material(user,assignmentId){const task=this.readable(user,assignmentId);requireCondition(task.material_id,404,'此任务没有附加材料');return this.snapshotState(user,task.material_id);}
  snapshotAsset(user,snapshotId,assetId){
    const row=this.snapshot(user,snapshotId),asset=JSON.parse(row.paper_json).assets[assetId];requireCondition(asset,404,'提交快照中没有这份资料');
    return {path:this.resources.files.assetPath(snapshotId,asset.path),metadata:asset};
  }
  canonicalSnapshot(user,snapshotId,input){
    const row=this.snapshot(user,snapshotId),source=JSON.parse(row.paper_json),paper=validatePaper(clone(input||source));
    requireCondition(paper.id===snapshotId,400,'快照编号不正确');
    for(const [assetId,asset] of Object.entries(paper.assets)){
      requireCondition(source.assets[assetId],400,'快照引用了未共享的资料');paper.assets[assetId]=source.assets[assetId];
    }
    requireCondition(Buffer.byteLength(JSON.stringify(paper),'utf8')<=10*1024*1024,413,'快照文字和场景数据过大');
    for(const material of paper.sources)if(material.asset){requireCondition(source.assets[material.asset.id]&&paper.assets[material.asset.id],400,'快照原文件引用不正确');material.asset=paper.assets[material.asset.id];}
    return paper;
  }
  async portable(user,snapshotId,input,{includeOriginals=true}={}){
    const paper=this.canonicalSnapshot(user,snapshotId,input),keep=collectAssets(paper,{includeOriginals});
    for(const [assetId,asset] of Object.entries(paper.assets)){
      if(!keep.has(assetId)){delete paper.assets[assetId];continue;}
      const bytes=await readFile(this.resources.files.assetPath(snapshotId,asset.path));asset.url='data:'+asset.mime+';base64,'+bytes.toString('base64');delete asset.path;delete asset.displayURL;
    }
    if(!includeOriginals)paper.sources=paper.sources.map(({asset,...source})=>source);
    return validatePaper(paper,{portable:true});
  }
  async fork(user,snapshotId,input){
    const source=this.snapshot(user,snapshotId),origin={id:null,title:JSON.parse(source.paper_json).title,author:source.author};
    const paper=this.canonicalSnapshot(user,snapshotId,input),newId=id('exam');this.resources.checkQuota(user,Object.values(paper.assets).reduce((n,a)=>n+a.bytes,0));
    paper.id=newId;paper.title=paper.title.slice(0,126)+' · 我的副本';paper.createdAt=paper.updatedAt=now();
    try{await mkdir(join(this.resources.files.folder(newId),'assets'),{recursive:true});
      for(const asset of Object.values(paper.assets))await copyFile(this.resources.files.assetPath(snapshotId,asset.path),this.resources.files.assetPath(newId,asset.path));
      return this.resources.insert(user,paper,Object.values(paper.assets),{origin,afterInsert:()=>this.linkResource(user,source.assignment_id,newId)});
    }catch(error){await this.resources.removeFolder(newId);throw error;}
  }
  async export(user,snapshotId,input,resourceDir){
    requireCondition(['html','json','zip','bundle','tijingexam'].includes(input.kind),400,'导出类型不正确');
    const paper=await this.portable(user,snapshotId,input.paper,{includeOriginals:input.includeOriginals!==false&&input.kind!=='html'});
    if(input.includeReference===false)for(const q of paper.questions)q.referenceText='';
    const suffix=input.kind==='html'?'html':input.kind==='json'?'json':'tijingexam';
    const content=input.kind==='html'?await offlineHTML(paper,resourceDir):input.kind==='json'?JSON.stringify(paper,null,2):exportResource(paper,{includeOriginals:input.includeOriginals!==false});
    return {content,filename:paper.title+'.'+suffix,mime:input.kind==='html'?'text/html;charset=utf-8':input.kind==='json'?'application/json;charset=utf-8':'application/zip'};
  }
}
