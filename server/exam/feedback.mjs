import {randomUUID} from 'node:crypto';
import {now} from '../../src/exam/model.mjs';
import {transaction} from './database.mjs';
import {requireCondition} from './errors.mjs';

export const feedbackCategories = {help:'看不懂', wording:'疑似表述有误', solution:'解析不全', suggestion:'其他建议'};
export class Feedback {
  constructor(db,resources,groups,notifications) { this.db=db;this.resources=resources;this.groups=groups;this.notifications=notifications; }
  row(id) { return this.db.prepare(`SELECT f.*,u.display_name AS author,u.username,c.name AS class_name,t.display_name AS teacher_name,
    r.id IS NOT NULL AS source_available FROM teaching_feedback f JOIN users u ON u.id=f.author_id JOIN users t ON t.id=f.teacher_id
    LEFT JOIN learning_groups c ON c.id=f.class_id LEFT JOIN resources r ON r.id=f.resource_id WHERE f.id=?`).get(id); }
  describe(user,row) {
    requireCondition(row && (row.author_id===user.id || row.teacher_id===user.id),404,'反馈不存在或无权访问');
    return {id:row.id,resourceId:row.resource_id,resourceTitle:row.resource_title,questionId:row.question_id,questionTitle:row.question_title,
      sceneId:row.scene_id,sceneTitle:row.scene_title,view:row.view,publicationStamp:row.publication_stamp,author:row.author,
      ...(row.teacher_id===user.id ? {username:row.username,classId:row.class_id,className:row.class_name||'行政班待确认'} : {}),
      teacher:row.teacher_name,category:row.category,categoryLabel:feedbackCategories[row.category],message:row.message,status:row.status,
      reply:row.reply,version:row.version,createdAt:row.created_at,repliedAt:row.replied_at,sourceAvailable:!!row.source_available};
  }
  submit(user,input) {
    requireCondition(user.role==='student',403,'教学反馈供学生提交');
    requireCondition(Object.hasOwn(feedbackCategories,input.category),400,'请选择反馈类型');
    requireCondition(typeof input.message==='string' && input.message.trim().length<=2000,400,'反馈说明最多2000个字符');
    const view=input.view==='workshop'?'workshop':'shared',row=this.resources.readable(user,input.resourceId,{view});
    requireCondition(row.author_role==='teacher',400,'此处用于反馈教师发布的资源');
    const paper=this.resources.paperFor(user,row),question=input.questionId ? paper.questions.find(question=>question.id===input.questionId):null;
    requireCondition(!input.questionId || question,409,'题目已更新，请重新打开后反馈');
    const scene=input.sceneId&&question ? question.scenes.find(scene=>scene.id===input.sceneId):null;
    requireCondition(!input.sceneId || scene,409,'场景已更新，请重新打开后反馈');
    const memberships=this.groups.feedbackMemberships(user.id,row.owner_id),classId=this.db.prepare('SELECT class_id FROM users WHERE id=?').get(user.id)?.class_id;
    const ownClass=classId&&memberships.includes(classId)?classId:null,id='feedback-'+randomUUID(),stamp=now();
    const publicationStamp=view==='workshop'?row.workshop_stamp:row.published_at;
    transaction(this.db,()=>{
      this.db.prepare('INSERT INTO teaching_feedback(id,resource_id,author_id,teacher_id,class_id,resource_title,question_id,question_title,scene_id,scene_title,publication_stamp,category,message,created_at,view) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(id,row.id,user.id,row.owner_id,ownClass,paper.title,question?.id||null,question?.title||'',scene?.id||null,scene?.title||'',publicationStamp,input.category,input.message.trim(),stamp,view);
      const add=this.db.prepare('INSERT INTO feedback_groups(feedback_id,group_id) VALUES(?,?)');
      for(const groupId of memberships)add.run(id,groupId);
      this.notifications?.notify(row.owner_id,user.id,'feedback','feedback',id,'收到一条新的教学反馈');
    });
    return this.describe(user,this.row(id));
  }
  list(user,input={}) {
    const column=user.role==='teacher'?'teacher_id':'author_id',where=['f.'+column+'=?'],values=[user.id];
    if(input.status&&input.status!=='all'){requireCondition(['open','answered','resolved'].includes(input.status),400,'处理状态不正确');where.push('f.status=?');values.push(input.status);}
    if(input.groupId){requireCondition(user.role==='teacher',403,'仅教师可以按班级或小组筛选');this.groups.owned(user,input.groupId);where.push('EXISTS(SELECT 1 FROM feedback_groups g WHERE g.feedback_id=f.id AND g.group_id=?)');values.push(input.groupId);}
    if(input.resourceId){where.push('f.resource_id=?');values.push(input.resourceId);}
    if(input.before){const cursor=this.row(input.before);this.describe(user,cursor);where.push('(f.created_at<? OR (f.created_at=? AND f.id<?))');values.push(cursor.created_at,cursor.created_at,cursor.id);}
    const rows=this.db.prepare('SELECT f.id FROM teaching_feedback f WHERE '+where.join(' AND ')+' ORDER BY f.created_at DESC,f.id DESC LIMIT 51').all(...values);
    const counts=this.db.prepare('SELECT status,count(*) AS n FROM teaching_feedback WHERE '+column+'=? GROUP BY status').all(user.id);
    return {feedback:rows.slice(0,50).map(row=>this.describe(user,this.row(row.id))),nextCursor:rows.length>50?rows[49].id:null,
      counts:Object.fromEntries(['open','answered','resolved'].map(status=>[status,counts.find(row=>row.status===status)?.n||0]))};
  }
  reply(user,id,input,version) {
    requireCondition(user.role==='teacher',403,'只有教师可以处理教学反馈');
    const row=this.row(id);requireCondition(row&&row.teacher_id===user.id,404,'反馈不存在或不属于你');
    requireCondition(Number.isSafeInteger(version) && version===row.version,409,'反馈已在其他页面更新，请刷新后再回复','feedback_version_conflict');
    requireCondition(typeof input.reply==='string'&&input.reply.trim().length<=3000,400,'回复最多3000个字符');
    requireCondition(['open','answered','resolved'].includes(input.status),400,'处理状态不正确');
    requireCondition(input.status==='open'||input.reply.trim().length>0,400,'请填写给学生的回复');
    transaction(this.db,()=>{
      this.db.prepare('UPDATE teaching_feedback SET reply=?,status=?,replied_at=?,version=version+1 WHERE id=?').run(input.reply.trim(),input.status,now(),id);
      this.notifications?.notify(row.author_id,user.id,'feedback-reply','feedback',id,'教师回复了你的教学反馈');
    });
    return this.describe(user,this.row(id));
  }
}
