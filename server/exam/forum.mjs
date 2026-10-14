import {randomUUID} from 'node:crypto';
import {transaction} from './database.mjs';
import {requireCondition} from './errors.mjs';
import {profileAppearance, updateProfile} from './account-profiles.mjs';
import {isPlatformAdmin} from './account-permissions.mjs';
const stamp=()=>new Date().toISOString(), id=prefix=>prefix+'-'+randomUUID();
const text=(value,min,max,label)=>{requireCondition(typeof value==='string'&&value.trim().length>=min&&value.trim().length<=max,400,label);return value.trim();};
const pageNumber=value=>{const n=Number(value||1);requireCondition(Number.isSafeInteger(n)&&n>=1&&n<=10000,400,'页码不正确');return n;};
const teacher=user=>requireCondition(user.role==='teacher',403,'此操作仅供教师使用');
const version=(row,n)=>requireCondition(Number.isSafeInteger(n)&&row.version===n,409,'内容已在其他页面更新，请刷新后重试','community_version_conflict');
const bool=value=>{requireCondition(typeof value==='boolean',400,'选项不正确');return Number(value);};

export class Forum {
  constructor(db,groups,resources,workshop) {
    this.db=db;this.groups=groups;this.resources=resources;this.workshop=workshop;
    db.exec("\n    CREATE TABLE IF NOT EXISTS forum_boards (\n      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT 'feedback',\n      group_id TEXT REFERENCES learning_groups(id), owner_id TEXT REFERENCES users(id), teacher_only INTEGER NOT NULL DEFAULT 0,\n      archived INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL\n    );\n    CREATE TABLE IF NOT EXISTS forum_topics (\n      id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES forum_boards(id), author_id TEXT NOT NULL REFERENCES users(id),\n      title TEXT NOT NULL, body TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'discussion', tags_json TEXT NOT NULL DEFAULT '[]',\n      resource_id TEXT REFERENCES resources(id) ON DELETE SET NULL, resource_view TEXT, workshop_id TEXT REFERENCES workshop_posts(id) ON DELETE SET NULL,\n      pinned INTEGER NOT NULL DEFAULT 0, locked INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0,\n      deleted INTEGER NOT NULL DEFAULT 0, accepted_comment_id TEXT, version INTEGER NOT NULL DEFAULT 1,\n      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, activity_at TEXT NOT NULL\n    );\n    CREATE INDEX IF NOT EXISTS forum_topics_board ON forum_topics(board_id,hidden,deleted,activity_at);\n    CREATE TABLE IF NOT EXISTS forum_comments (\n      id TEXT PRIMARY KEY, topic_id TEXT NOT NULL REFERENCES forum_topics(id) ON DELETE CASCADE, author_id TEXT NOT NULL REFERENCES users(id),\n      parent_id TEXT REFERENCES forum_comments(id), body TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,\n      hidden INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL\n    );\n    CREATE INDEX IF NOT EXISTS forum_comments_topic ON forum_comments(topic_id,created_at);\n    CREATE TABLE IF NOT EXISTS forum_reactions (\n      target_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL,\n      PRIMARY KEY(target_id,user_id)\n    );\n    CREATE TABLE IF NOT EXISTS forum_bookmarks (\n      topic_id TEXT NOT NULL REFERENCES forum_topics(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n      created_at TEXT NOT NULL, PRIMARY KEY(topic_id,user_id)\n    );\n    CREATE TABLE IF NOT EXISTS community_profiles (\n      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, bio TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT 'teal', updated_at TEXT NOT NULL\n    );\n    CREATE TABLE IF NOT EXISTS community_notifications (\n      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, actor_id TEXT REFERENCES users(id),\n      kind TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL, message TEXT NOT NULL,\n      read_at TEXT, created_at TEXT NOT NULL\n    );\n    CREATE INDEX IF NOT EXISTS notifications_user ON community_notifications(user_id,created_at);\n    CREATE TABLE IF NOT EXISTS community_reports (\n      id TEXT PRIMARY KEY, reporter_id TEXT NOT NULL REFERENCES users(id), target_type TEXT NOT NULL, target_id TEXT NOT NULL,\n      reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', resolution TEXT NOT NULL DEFAULT '',\n      moderator_id TEXT REFERENCES users(id), created_at TEXT NOT NULL, handled_at TEXT, version INTEGER NOT NULL DEFAULT 1\n    );\n    CREATE INDEX IF NOT EXISTS reports_status ON community_reports(status,created_at);\n    CREATE TABLE IF NOT EXISTS community_audit (\n      id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL,\n      target_type TEXT NOT NULL, target_id TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL\n    );\n");
    for(const [key,name,description,icon,teachers] of [
      ['questions','问题讨论','说出你的疑问，一起把推理补完整。','feedback',0],
      ['exploration','探究交流','分享观察、实验想法与建模方法。','scene',0],
      ['announcements','教师公告','课堂安排、资源更新与学习提醒。','book',1]
    ]) db.prepare('INSERT OR IGNORE INTO forum_boards(id,name,description,icon,teacher_only,created_at) VALUES(?,?,?,?,?,?)').run('board-'+key,name,description,icon,teachers,stamp());
  }
  board(user,boardId,{write=false}={}) {
    const row=this.db.prepare('SELECT * FROM forum_boards WHERE id=?').get(boardId);
    const group=row?.group_id?this.groups.row(row.group_id):null;
    requireCondition(row&&(!row.group_id||group&&(group.owner_id===user.id||this.groups.contains(user.id,group))),404,'版块不存在或无权访问');
    if(write){requireCondition(!row.archived&&!group?.archived,400,'版块已归档');requireCondition(!row.teacher_only||user.role==='teacher',403,'这个版块仅供教师发布主题');}
    return {...row,archived:Number(!!row.archived||!!group?.archived)};
  }
  moderate(user,board){return isPlatformAdmin(this.db,user)||(user.role==='teacher'&&board.owner_id===user.id);}
  boards(user) {
    return this.db.prepare('SELECT * FROM forum_boards ORDER BY group_id IS NOT NULL,created_at').all().flatMap(row=>{
      try {this.board(user,row.id);} catch{return [];}
      return [{id:row.id,name:row.name,description:row.description,icon:row.icon,groupId:row.group_id,teacherOnly:!!row.teacher_only,
        archived:!!row.archived,version:row.version,writable:!row.archived&&(!row.teacher_only||user.role==='teacher'),manageable:this.moderate(user,row),
        topicCount:this.db.prepare('SELECT count(*) AS n FROM forum_topics WHERE board_id=? AND hidden=0 AND deleted=0').get(row.id).n}];
    });
  }
  createBoard(user,input){
    teacher(user);const group=input.groupId?this.groups.owned(user,input.groupId):null;
    if(group)requireCondition(!group.archived,400,'请先恢复班级或小组');
    const boardId=id('board');
    this.db.prepare('INSERT INTO forum_boards(id,name,description,icon,group_id,owner_id,teacher_only,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(boardId,text(input.name,1,40,'版块名称最多40个字符'),text(input.description||'',0,300,'介绍最多300个字符'),'group',group?.id||null,user.id,bool(input.teacherOnly??false),stamp());
    return this.boards(user).find(row=>row.id===boardId);
  }
  updateBoard(user,boardId,input,n){
    const row=this.board(user,boardId);requireCondition(this.moderate(user,row),403,'无权管理这个版块');version(row,n);
    this.db.prepare('UPDATE forum_boards SET name=?,description=?,teacher_only=?,archived=?,version=version+1 WHERE id=?').run(
      text(input.name??row.name,1,40,'版块名称最多40个字符'),text(input.description??row.description,0,300,'介绍最多300个字符'),
      input.teacherOnly===undefined?row.teacher_only:bool(input.teacherOnly),input.archived===undefined?row.archived:bool(input.archived),boardId);
    return this.boards(user).find(row=>row.id===boardId);
  }
  row(topicId){return this.db.prepare('SELECT t.*,u.display_name AS author,u.role AS author_role FROM forum_topics t JOIN users u ON u.id=t.author_id WHERE t.id=?').get(topicId);}
  topic(user,topicId,{includeHidden=false}={}){
    const row=this.row(topicId);requireCondition(row,404,'主题不存在');const board=this.board(user,row.board_id);
    requireCondition(!row.hidden||includeHidden&&(row.author_id===user.id||this.moderate(user,board)),404,'主题已撤下');
    requireCondition(!row.deleted||includeHidden&&(row.author_id===user.id||this.moderate(user,board)),404,'主题已删除');
    return row;
  }
  reactions(user,targetId){return {likeCount:this.db.prepare('SELECT count(*) AS n FROM forum_reactions WHERE target_id=?').get(targetId).n,liked:!!this.db.prepare('SELECT 1 FROM forum_reactions WHERE target_id=? AND user_id=?').get(targetId,user.id)};}
  reference(user,row){
    if(row.workshop_id){try{const work=this.workshop.accessible(user,row.workshop_id);if(!work.visible)return null;return {type:'workshop',id:work.id,resourceId:work.resource_id,title:work.title,view:'workshop'};}catch{return null;}}
    if(row.resource_id){try{const resource=this.resources.readable(user,row.resource_id,{view:'shared'});return {type:'resource',id:resource.id,title:JSON.parse(resource.published_json).title,view:'shared'};}catch{return null;}}
    return null;
  }
  describe(user,row,full=false){
    const board=this.board(user,row.board_id),profile=profileAppearance(this.db,row.author_id);
    return {id:row.id,boardId:row.board_id,boardName:board.name,title:row.title,body:full?row.body:undefined,excerpt:row.body.slice(0,180),
      kind:row.kind,tags:JSON.parse(row.tags_json),author:{id:row.author_id,name:row.author,role:row.author_role,color:profile.color,avatarURL:profile.avatarURL},
      mine:row.author_id===user.id,manageable:this.moderate(user,board),pinned:!!row.pinned,locked:!!row.locked,hidden:!!row.hidden,deleted:!!row.deleted,
      solved:!!row.accepted_comment_id,acceptedCommentId:row.accepted_comment_id,version:row.version,
      createdAt:row.created_at,updatedAt:row.updated_at,activityAt:row.activity_at,...this.reactions(user,row.id),
      commentCount:this.db.prepare('SELECT count(*) AS n FROM forum_comments WHERE topic_id=? AND deleted=0 AND hidden=0').get(row.id).n,
      bookmarked:!!this.db.prepare('SELECT 1 FROM forum_bookmarks WHERE topic_id=? AND user_id=?').get(row.id,user.id),
      reference:this.reference(user,row)};
  }
  list(user,input={}){
    const boards=this.boards(user),accessible=boards.map(row=>row.id);if(!accessible.length)return {topics:[],boards,total:0,page:1,pages:1};
    const where=['t.board_id IN ('+accessible.map(()=>'?').join(',')+')','t.deleted=0'],values=[...accessible];
    if(input.hidden==='1'){teacher(user);where.push('t.hidden=1');const moderated=boards.filter(board=>board.manageable).map(board=>board.id);where.push('t.board_id IN ('+(moderated.length?moderated.map(()=>'?').join(','):'NULL')+')');values.push(...moderated);}else where.push('t.hidden=0');
    if(input.boardId){this.board(user,input.boardId);where.push('t.board_id=?');values.push(input.boardId);}
    if(input.kind){requireCondition(['discussion','question','showcase'].includes(input.kind),400,'主题类型不正确');where.push('t.kind=?');values.push(input.kind);}
    if(input.mine==='1'){where.push('t.author_id=?');values.push(user.id);}
    if(input.bookmarked==='1'){where.push('EXISTS(SELECT 1 FROM forum_bookmarks b WHERE b.topic_id=t.id AND b.user_id=?)');values.push(user.id);}
    if(input.unsolved==='1'){where.push("t.kind='question' AND t.accepted_comment_id IS NULL");}
    const search=String(input.search||'').trim().slice(0,100);if(search){where.push("instr(lower(t.title||' '||t.body||' '||t.tags_json||' '||u.display_name),lower(?))>0");values.push(search);}
    const sort=input.sort||'active';requireCondition(['active','newest','popular'].includes(sort),400,'排序方式不正确');
    const order=sort==='newest'?'t.created_at DESC':sort==='popular'?'(SELECT count(*) FROM forum_reactions r WHERE r.target_id=t.id) DESC,t.activity_at DESC':'t.activity_at DESC';
    const total=this.db.prepare('SELECT count(*) AS n FROM forum_topics t JOIN users u ON u.id=t.author_id WHERE '+where.join(' AND ')).get(...values).n;
    const page=pageNumber(input.page),rows=this.db.prepare('SELECT t.*,u.display_name AS author,u.role AS author_role FROM forum_topics t JOIN users u ON u.id=t.author_id WHERE '+where.join(' AND ')+' ORDER BY t.pinned DESC,'+order+',t.id DESC LIMIT 20 OFFSET ?').all(...values,(page-1)*20);
    return {topics:rows.map(row=>this.describe(user,row)),boards,total,page,pages:Math.max(1,Math.ceil(total/20))};
  }
  flood(user,table,maximum){
    const n=this.db.prepare('SELECT count(*) AS n FROM '+table+' WHERE author_id=? AND created_at>?').get(user.id,new Date(Date.now()-60000).toISOString()).n;
    requireCondition(n<maximum,429,'发布得有些快，请稍后继续');
  }
  validateContent(input){
    const title=text(input.title,2,140,'标题需为2至140个字符'),body=text(input.body,2,20000,'正文需为2至20000个字符'),kind=input.kind||'discussion';
    requireCondition(['discussion','question','showcase'].includes(kind),400,'主题类型不正确');
    const tags=input.tags||[];requireCondition(Array.isArray(tags)&&tags.length<=5&&tags.every(tag=>typeof tag==='string'&&tag.trim().length>0&&tag.length<=20),400,'最多添加5个标签，每个20字以内');
    return {title,body,kind,tags:JSON.stringify([...new Set(tags.map(tag=>tag.trim()))])};
  }
  attach(user,board,input){
    if(!input.reference)return {resource:null,workshop:null,view:null};
    const ref=input.reference;
    if(ref.type==='workshop'){const row=this.workshop.accessible(user,ref.id);requireCondition(row.visible,400,'作品已撤下');return {resource:row.resource_id,workshop:row.id,view:'workshop'};}
    requireCondition(ref.type==='resource'&&board.group_id,400,'公共讨论请关联已公开的工坊作品；教师投送资源只能在对应群组版块讨论');
    const row=this.resources.readable(user,ref.id,{view:'shared'});
    // The whole board must have access, not only the user writing this topic.
    requireCondition(this.db.prepare('SELECT 1 FROM resource_targets WHERE resource_id=? AND group_id=?').get(row.id,board.group_id),403,'资源未投送给这个版块对应的班级或小组');
    return {resource:row.id,workshop:null,view:'shared'};
  }
  create(user,input){
    const board=this.board(user,input.boardId,{write:true}),content=this.validateContent(input),ref=this.attach(user,board,input);this.flood(user,'forum_topics',8);
    const topicId=id('topic'),time=stamp();
    this.db.prepare('INSERT INTO forum_topics(id,board_id,author_id,title,body,kind,tags_json,resource_id,resource_view,workshop_id,created_at,updated_at,activity_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(topicId,board.id,user.id,content.title,content.body,content.kind,content.tags,ref.resource,ref.view,ref.workshop,time,time,time);
    return this.describe(user,this.row(topicId),true);
  }
  update(user,topicId,input,n){
    const row=this.topic(user,topicId,{includeHidden:true}),board=this.board(user,row.board_id),canModerate=this.moderate(user,board);version(row,n);
    requireCondition(!row.deleted,400,'主题已删除');
    requireCondition(row.author_id===user.id||canModerate,403,'只能修改自己的主题');
    if(input.title!==undefined||input.body!==undefined||input.tags!==undefined||input.kind!==undefined){
      requireCondition(!row.locked&&!row.hidden&&!board.archived||canModerate,403,'主题已锁定、撤下或归档');
      const c=this.validateContent({title:input.title??row.title,body:input.body??row.body,kind:input.kind??row.kind,tags:input.tags??JSON.parse(row.tags_json)});
      this.db.prepare('UPDATE forum_topics SET title=?,body=?,kind=?,tags_json=?,updated_at=?,version=version+1 WHERE id=?').run(c.title,c.body,c.kind,c.tags,stamp(),topicId);
    }else{
      requireCondition(canModerate,403,'只有版块教师可以置顶或锁定主题');
      requireCondition(['pinned','locked','hidden'].some(key=>input[key]!==undefined),400,'请选择管理操作');
      const reason=text(input.reason||'',0,1000,'管理说明最多1000字');
      transaction(this.db,()=>{
        this.db.prepare('UPDATE forum_topics SET pinned=?,locked=?,hidden=?,version=version+1 WHERE id=?').run(
          input.pinned===undefined?row.pinned:bool(input.pinned),input.locked===undefined?row.locked:bool(input.locked),input.hidden===undefined?row.hidden:bool(input.hidden),topicId);
        this.audit(user,'update-topic','topic',topicId,reason);
      });
    }
    return this.describe(user,this.row(topicId),true);
  }
  remove(user,topicId,n){
    const row=this.topic(user,topicId,{includeHidden:true}),board=this.board(user,row.board_id);version(row,n);
    requireCondition(row.author_id===user.id||this.moderate(user,board),403,'无权删除这个主题');
    transaction(this.db,()=>{this.db.prepare('UPDATE forum_topics SET deleted=1,body=?,version=version+1 WHERE id=?').run('',topicId);this.audit(user,'delete-topic','topic',topicId);});
    return {ok:true};
  }
  commentRow(commentId){return this.db.prepare('SELECT c.*,u.display_name AS author,u.role AS author_role,p.author_id AS parent_author_id,pu.display_name AS parent_author FROM forum_comments c JOIN users u ON u.id=c.author_id LEFT JOIN forum_comments p ON p.id=c.parent_id LEFT JOIN users pu ON pu.id=p.author_id WHERE c.id=?').get(commentId);}
  commentDescribe(user,row,topic){
    const unavailable=row.deleted||row.hidden,canModerate=this.moderate(user,this.board(user,topic.board_id));
    return {id:row.id,topicId:row.topic_id,parentId:row.parent_id,parentAuthor:row.parent_author,body:unavailable?'':row.body,deleted:!!row.deleted,hidden:!!row.hidden,
      author:{id:row.author_id,name:row.author,role:row.author_role,avatarURL:profileAppearance(this.db,row.author_id).avatarURL},mine:row.author_id===user.id,manageable:canModerate,version:row.version,
      createdAt:row.created_at,updatedAt:row.updated_at,accepted:topic.accepted_comment_id===row.id,...this.reactions(user,row.id)};
  }
  detail(user,topicId,input={}){
    const topic=this.topic(user,topicId,{includeHidden:true}),page=pageNumber(input.page),total=this.db.prepare('SELECT count(*) AS n FROM forum_comments WHERE topic_id=?').get(topicId).n;
    const rows=this.db.prepare('SELECT id FROM forum_comments WHERE topic_id=? ORDER BY created_at,id LIMIT 30 OFFSET ?').all(topicId,(page-1)*30);
    return {topic:this.describe(user,topic,true),comments:rows.map(row=>this.commentDescribe(user,this.commentRow(row.id),topic)),total,page,pages:Math.max(1,Math.ceil(total/30))};
  }
  comment(user,topicId,input){
    const topic=this.topic(user,topicId),board=this.board(user,topic.board_id);
    requireCondition(!topic.locked&&!board.archived,403,'主题已锁定或版块已归档');this.flood(user,'forum_comments',20);
    const parent=input.parentId?this.commentRow(input.parentId):null;requireCondition(!input.parentId||parent&&parent.topic_id===topicId&&!parent.deleted&&!parent.hidden,400,'回复对象不可用');
    const body=text(input.body,1,10000,'回复需为1至10000个字符'),commentId=id('comment'),time=stamp();
    transaction(this.db,()=>{
      this.db.prepare('INSERT INTO forum_comments(id,topic_id,author_id,parent_id,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(commentId,topicId,user.id,parent?.id||null,body,time,time);
      this.db.prepare('UPDATE forum_topics SET activity_at=? WHERE id=?').run(time,topicId);
      for(const recipient of new Set([topic.author_id,parent?.author_id].filter(Boolean)))this.notify(recipient,user.id,'reply','topic',topicId,'有人回复了你的讨论');
    });
    return this.commentDescribe(user,this.commentRow(commentId),topic);
  }
  updateComment(user,commentId,input,n){
    const row=this.commentRow(commentId);requireCondition(row,404,'回复不存在');const topic=this.topic(user,row.topic_id),board=this.board(user,topic.board_id);
    version(row,n);const moderate=this.moderate(user,board);
    requireCondition(row.author_id===user.id||moderate,403,'只能修改自己的回复');
    requireCondition(!row.deleted,400,'回复已删除');
    if(input.hidden!==undefined){requireCondition(moderate,403,'只有版块教师可以撤下回复');transaction(this.db,()=>{
      this.db.prepare('UPDATE forum_comments SET hidden=?,version=version+1 WHERE id=?').run(bool(input.hidden),commentId);
      if(input.hidden)this.db.prepare('UPDATE forum_topics SET accepted_comment_id=NULL,version=version+1 WHERE accepted_comment_id=?').run(commentId);
      this.audit(user,'moderate-comment','comment',commentId,text(input.reason||'',0,1000,'说明最多1000字'));
    });}else{
      requireCondition(!row.hidden&&(!topic.locked||moderate)&&(!board.archived||moderate),403,'回复无法编辑');
      this.db.prepare('UPDATE forum_comments SET body=?,updated_at=?,version=version+1 WHERE id=?').run(text(input.body,1,10000,'回复需为1至10000个字符'),stamp(),commentId);
    }
    return this.commentDescribe(user,this.commentRow(commentId),this.row(topic.id));
  }
  removeComment(user,commentId,n){
    const row=this.commentRow(commentId);requireCondition(row,404,'回复不存在');const topic=this.topic(user,row.topic_id),board=this.board(user,topic.board_id);version(row,n);
    requireCondition(row.author_id===user.id||this.moderate(user,board),403,'无权删除这个回复');
    transaction(this.db,()=>{this.db.prepare('UPDATE forum_comments SET deleted=1,body=?,version=version+1 WHERE id=?').run('',commentId);
      this.db.prepare('UPDATE forum_topics SET accepted_comment_id=NULL,version=version+1 WHERE accepted_comment_id=?').run(commentId);this.audit(user,'delete-comment','comment',commentId);});
    return {ok:true};
  }
  accept(user,topicId,input,n){
    const topic=this.topic(user,topicId),board=this.board(user,topic.board_id);version(topic,n);
    requireCondition(topic.kind==='question',400,'仅问题主题可以采纳回复');requireCondition(topic.author_id===user.id||this.moderate(user,board),403,'仅提问者或版块教师可以采纳');
    const comment=input.commentId?this.commentRow(input.commentId):null;requireCondition(!input.commentId||comment&&comment.topic_id===topicId&&!comment.hidden&&!comment.deleted,400,'采纳对象不可用');
    transaction(this.db,()=>{this.db.prepare('UPDATE forum_topics SET accepted_comment_id=?,version=version+1 WHERE id=?').run(comment?.id||null,topicId);
      if(comment)this.notify(comment.author_id,user.id,'accepted','topic',topicId,'你的回复被采纳了');});
    return this.describe(user,this.row(topicId),true);
  }
  reaction(user,targetId,input){
    let target=targetId.startsWith('topic-')?this.topic(user,targetId):this.commentRow(targetId);requireCondition(target,404,'内容不存在');
    if(target.topic_id){this.topic(user,target.topic_id);requireCondition(!target.deleted&&!target.hidden,404,'回复已移除');}
    requireCondition(target.author_id!==user.id,400,'不能给自己的内容点赞');bool(input.liked);
    transaction(this.db,()=>{if(input.liked){const changed=this.db.prepare('INSERT OR IGNORE INTO forum_reactions(target_id,user_id,created_at) VALUES(?,?,?)').run(targetId,user.id,stamp()).changes;
        if(changed)this.notify(target.author_id,user.id,'like','topic',target.topic_id||target.id,'有人赞同了你的内容');}
      else this.db.prepare('DELETE FROM forum_reactions WHERE target_id=? AND user_id=?').run(targetId,user.id);});
    return this.reactions(user,targetId);
  }
  bookmark(user,topicId,input){this.topic(user,topicId);bool(input.bookmarked);if(input.bookmarked)this.db.prepare('INSERT OR IGNORE INTO forum_bookmarks(topic_id,user_id,created_at) VALUES(?,?,?)').run(topicId,user.id,stamp());
    else this.db.prepare('DELETE FROM forum_bookmarks WHERE topic_id=? AND user_id=?').run(topicId,user.id);return {bookmarked:input.bookmarked};}
  profile(user,userId){
    const author=this.db.prepare('SELECT id,display_name,role,created_at FROM users WHERE id=? AND disabled=0').get(userId);requireCondition(author,404,'用户不存在');
    const p=profileAppearance(this.db,userId);
    // Counts must respect the viewer's board membership and never reveal private activity.
    const boardIds=this.boards(user).map(board=>board.id),count=boardIds.length?this.db.prepare('SELECT count(*) AS n FROM forum_topics WHERE author_id=? AND hidden=0 AND deleted=0 AND board_id IN ('+boardIds.map(()=>'?').join(',')+')').get(userId,...boardIds).n:0;
    const works=this.db.prepare('SELECT * FROM workshop_posts WHERE owner_id=? AND visible=1 ORDER BY updated_at DESC LIMIT 12').all(userId).map(row=>this.workshop.describe(user,{...row,author:author.display_name,author_role:author.role}));
    return {id:author.id,name:author.display_name,role:author.role,...p,joinedAt:author.created_at,mine:user.id===userId,topicCount:count,works};
  }
  updateProfile(user,input){
    updateProfile(this.db,user,{bio:input.bio||'',color:input.color||'teal'});
    return this.profile(user,user.id);
  }
  notify(userId,actorId,kind,type,targetId,message){
    if(!userId||userId===actorId)return;
    if(['like','workshop-like','accepted'].includes(kind)&&this.db.prepare('SELECT 1 FROM community_notifications WHERE user_id=? AND actor_id=? AND kind=? AND target_id=? AND created_at>?').get(userId,actorId,kind,targetId,new Date(Date.now()-3600000).toISOString()))return;
    this.db.prepare('INSERT INTO community_notifications(id,user_id,actor_id,kind,target_type,target_id,message,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id('notice'),userId,actorId,kind,type,targetId,message,stamp());
  }
  notificationVisible(user,row){
    try{if(row.target_type==='assignment'){this.assignments?.readable(user,row.target_id);return !!this.assignments;}
      if(row.target_type==='topic'){this.topic(user,row.target_id);return true;}
      if(row.target_type==='workshop'){return !!this.workshop.accessible(user,row.target_id).visible;}
      if(row.target_type==='feedback')return !!this.db.prepare('SELECT 1 FROM teaching_feedback WHERE id=? AND (author_id=? OR teacher_id=?)').get(row.target_id,user.id,user.id);
    }catch{} return false;
  }
  notifications(user){
    const rows=this.db.prepare('SELECT n.*,u.display_name AS actor FROM community_notifications n LEFT JOIN users u ON u.id=n.actor_id WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 200').all(user.id).filter(row=>this.notificationVisible(user,row));
    return {notifications:rows.slice(0,80).map(row=>({id:row.id,kind:row.kind,type:row.target_type,targetId:row.target_id,message:row.message,actor:row.actor||'用户',read:!!row.read_at,createdAt:row.created_at})),unread:rows.filter(row=>!row.read_at).length};
  }
  readNotifications(user,input){requireCondition(input.all===true||typeof input.id==='string',400,'请选择消息');if(input.all)this.db.prepare('UPDATE community_notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').run(stamp(),user.id);else this.db.prepare('UPDATE community_notifications SET read_at=? WHERE id=? AND user_id=?').run(stamp(),input.id,user.id);return this.notifications(user);}
  target(user,type,targetId){
    if(type==='topic'){const topic=this.topic(user,targetId,{includeHidden:user.role==='teacher'});return {title:topic.title,board:this.board(user,topic.board_id),row:topic};}
    if(type==='comment'){const row=this.commentRow(targetId);requireCondition(row&&(!row.deleted||user.role==='teacher'),404,'回复不存在');const topic=this.topic(user,row.topic_id,{includeHidden:user.role==='teacher'});return {title:topic.title,board:this.board(user,topic.board_id),row};}
    requireCondition(type==='workshop',400,'举报对象不正确');const row=this.workshop.accessible(user,targetId);return {title:row.title,row};
  }
  report(user,input){
    const target=this.target(user,input.type,input.targetId),reason=text(input.reason,2,1000,'请填写2至1000字的举报说明');
    const previous=this.db.prepare("SELECT id FROM community_reports WHERE reporter_id=? AND target_type=? AND target_id=? AND status='open'").get(user.id,input.type,input.targetId);if(previous)return {id:previous.id,ok:true};
    const reportId=id('report');this.db.prepare('INSERT INTO community_reports(id,reporter_id,target_type,target_id,reason,created_at) VALUES(?,?,?,?,?,?)').run(reportId,user.id,input.type,input.targetId,reason,stamp());return {id:reportId,ok:true};
  }
  reports(user,input={}){
    teacher(user);const status=input.status||'open';requireCondition(['open','resolved','dismissed'].includes(status),400,'状态不正确');
    const rows=this.db.prepare('SELECT r.*,u.display_name AS reporter FROM community_reports r JOIN users u ON u.id=r.reporter_id WHERE status=? ORDER BY created_at DESC LIMIT 100').all(status).flatMap(row=>{
      try{const target=this.target(user,row.target_type,row.target_id);if(target.board?!this.moderate(user,target.board):!this.workshop.moderates(user,target.row))return [];
        return [{id:row.id,type:row.target_type,targetId:row.target_id,title:target.title,topicId:row.target_type==='comment'?target.row.topic_id:row.target_type==='topic'?row.target_id:null,reason:row.reason,reporter:row.reporter,status:row.status,resolution:row.resolution,version:row.version,createdAt:row.created_at}];}catch{return [];}
    });return {reports:rows};
  }
  resolveReport(user,reportId,input,n){
    teacher(user);const row=this.db.prepare('SELECT * FROM community_reports WHERE id=?').get(reportId);requireCondition(row,404,'举报不存在');version(row,n);
    const target=this.target(user,row.target_type,row.target_id);requireCondition(target.board?this.moderate(user,target.board):this.workshop.moderates(user,target.row),403,'无权处理这个范围的举报');
    requireCondition(['resolved','dismissed'].includes(input.status),400,'处理状态不正确');const resolution=text(input.resolution,1,1000,'请填写处理说明');
    transaction(this.db,()=>{
      if(input.hide===true){if(row.target_type==='topic')this.db.prepare('UPDATE forum_topics SET hidden=1,version=version+1 WHERE id=?').run(row.target_id);
        if(row.target_type==='comment'){this.db.prepare('UPDATE forum_comments SET hidden=1,version=version+1 WHERE id=?').run(row.target_id);this.db.prepare('UPDATE forum_topics SET accepted_comment_id=NULL,version=version+1 WHERE accepted_comment_id=?').run(row.target_id);}
        if(row.target_type==='workshop')this.db.prepare('UPDATE workshop_posts SET visible=0,moderated=1,hidden_reason=?,version=version+1 WHERE id=?').run(resolution,row.target_id);}
      this.db.prepare('UPDATE community_reports SET status=?,resolution=?,moderator_id=?,handled_at=?,version=version+1 WHERE id=?').run(input.status,resolution,user.id,stamp(),reportId);
      this.audit(user,'resolve-report',row.target_type,row.target_id,resolution);
    });return {ok:true};
  }
  audit(user,action,type,targetId,reason=''){this.db.prepare('INSERT INTO community_audit(id,actor_id,action,target_type,target_id,reason,created_at) VALUES(?,?,?,?,?,?,?)').run(id('audit'),user.id,action,type,targetId,reason,stamp());}
}
