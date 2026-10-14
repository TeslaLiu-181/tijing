import {readFile} from 'node:fs/promises';
import {requireCondition} from './errors.mjs';
import {newQuestion} from '../../src/exam/model.mjs';

// Resolve task materials through the same snapshot permission checks used by
// the viewer. The model never chooses filesystem paths or widens recipients.
export function createAIContext(assignments,resources) {
  const validateContextPolicy=(user,assignment,{mode,action})=>{
    const current=assignments.taskPolicy(user,assignment.id),row=assignments.row(assignment.id);
    requireCondition(assignment.version===undefined||assignment.version===row.version,409,'任务要求已更新，请重新打开任务再使用AI','ai_assignment_changed');
    if(user.id===current.teacherId)return;
    requireCondition(current.aiPolicy!=='disabled',403,'教师已禁用本任务的AI辅助','ai_assignment_policy');
    requireCondition(current.aiPolicy!=='hints'||(['tutor','review'].includes(mode)&&action!=='apply'),403,'本任务仅允许分步提示与思路核查','ai_assignment_policy');
  };
  const resolveContext=async(user,input)=>{
    const policy=assignments.taskPolicy(user,input.assignmentId),task=assignments.row(input.assignmentId);
    let state=null,resource=null,snapshotId=null;
    if(input.resourceId) {
      if(assignments.hasSnapshot(input.resourceId)) {
        state=assignments.snapshotState(user,input.resourceId);
        requireCondition(state.resource.assignmentId===task.id,404,'资料不属于当前任务');
        snapshotId=input.resourceId;
      } else {
        resource=resources.readable(user,input.resourceId,{view:input.view||'private'});
        const linked=assignments.resourceContext(user,input.resourceId);
        requireCondition(!linked||linked.assignmentId===task.id,409,'此原稿属于另一项任务，请使用本任务的个人原稿');
        state={paper:resources.paperFor(user,resource),resource:resources.describe(user,resource)};
      }
    } else if(task.material_id){state=assignments.material(user,task.id);snapshotId=state.resource.id;}
    const paper=state?.paper||null,question=input.questionId?paper?.questions.find(q=>q.id===input.questionId):paper?.questions.find(q=>q.id===paper.activeQuestionId)||paper?.questions[0]||(!paper?newQuestion(task.title,task.instructions):null);
    requireCondition(!input.questionId||question,404,'任务资料中没有此题目');
    const record=input.sceneId?question?.scenes.find(s=>s.id===input.sceneId):null;
    requireCondition(!input.sceneId||record,404,'任务资料中没有此场景');
    return {paper,question,record,resource,version:state?.resource.version??task.version,
      assignment:{...policy,version:task.version,snapshotId,aiPolicy:user.id===task.teacher_id?'allowed':policy.aiPolicy,studentAiPolicy:policy.aiPolicy}};
  };
  const readContextAttachment=async(user,assignment,assetId)=>{
    requireCondition(assignment.snapshotId,404,'此任务上下文没有可读的快照图片');
    const row=assignments.snapshot(user,assignment.snapshotId);
    requireCondition(row.assignment_id===assignment.id,404,'图片不属于当前任务');
    const asset=assignments.snapshotAsset(user,assignment.snapshotId,assetId);return readFile(asset.path);
  };
  return {resolveContext,validateContextPolicy,readContextAttachment};
}
