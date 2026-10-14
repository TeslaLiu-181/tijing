// A repair may add checks, but cannot erase or weaken the original contract.
export function preserveValidationChecks(original=[],repaired=[]) {
 const key=c=>JSON.stringify([c.traceId,c.timeUs,c.metric,c.side??'after']);
 if(!Array.isArray(original)||!Array.isArray(repaired))return {effective:[],changes:{removed:[],changed:[],added:[],invalidOriginal:true},scopeChanged:true};
 const changes={removed:[],changed:[],added:[]},effective=structuredClone(original);
 for(const before of original) {
  const after=repaired.find(c=>key(c)===key(before));
  if(!after){changes.removed.push(before);continue;}
  if(after.expected!==before.expected||(after.relativeTolerance??.001)>(before.relativeTolerance??.001))changes.changed.push({before,after});
  else if((after.relativeTolerance??.001)<(before.relativeTolerance??.001))effective.find(c=>key(c)===key(before)).relativeTolerance=after.relativeTolerance;
 }
 for(const after of repaired)if(!original.some(c=>key(c)===key(after))){changes.added.push(after);effective.push(after);}
 return {effective,changes,scopeChanged:changes.removed.length>0||changes.changed.length>0};
}
export function sceneValidationMessage(result) {
 if(result.status==='needs_confirmation'||result.missing?.length)return '当前条件尚未确认。请对照原稿补充下面列出的信息，确认后再生成场景。';
 const harness=result.candidate?.harness;
 if(!harness)return '尚未获得可应用的场景提案，请补充条件或调整建模要求。';
 if(harness.validationScope?.scopeChanged)return '修正提案改变了原始数值检查范围，已保留原检查并阻止自动应用。请明确核对指标后重新生成，不能以删除检查代替修复。';
 return harness.passed?'场景提案已通过程序的结构、关系解析与数值检查。请对照原图核查实际参数、题设和演示假设，确认后创建独立草稿；程序检查不证明全部原题语义。':
 '场景提案尚未通过程序检查，不能自动应用。请查看检查表中的指标、实际读数和问题，再修正或补充条件。';
}
