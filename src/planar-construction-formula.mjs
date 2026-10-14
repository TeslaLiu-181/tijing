import {createFormulaEditor} from './formula-editor.mjs';
import {sceneFormulaReferences,parameterExpression} from './planar-formula-references.mjs';
import {addConstruction,geometryToolSchema} from './planar-constructions.mjs';
import {createResolver} from './planar-relations.mjs';
import {toNative} from './planar-expressions.mjs';
function checkParameter(value,parameter){
 if(!Number.isFinite(value))throw Error(parameter.label+'需要有限数值。');
 if(parameter.integer&&!Number.isInteger(value))throw Error(parameter.label+'需要整数。');
 if(parameter.min!==undefined&&(parameter.exclusiveMin?value<=parameter.min:value<parameter.min))throw Error(parameter.label+'须'+(parameter.exclusiveMin?'大于':'不小于')+parameter.min+'。');
 if(parameter.max!==undefined&&value>parameter.max)throw Error(parameter.label+'须不大于'+parameter.max+'。');
}

/** Edits a pending construction parameter without creating anything in the scene. */
export function createConstructionFormulaEditor({scene,onRecognize}){
 let active=null,epoch=0;
 const editor=createFormulaEditor({fontsDirectory:null,onRecognize,validateDependency(value){
  const operation=active;if(!operation||scene()!==operation.sourceScene)throw Error('场景已切换，请重新打开构造公式。');
  const source=parameterExpression(operation.sourceScene,value.expression),candidate=structuredClone(operation.sourceScene);
  const inputs=operation.materializeInputs?operation.materializeInputs(candidate):operation.base.inputs;
  const created=addConstruction(candidate,{...operation.base,inputs,[operation.parameter.expressionKey]:source});
  if(created.primaryId!==operation.pendingId)throw Error('构造输入已更新，请重新打开公式编辑器。');
  const object=candidate.objects.find(object=>object.id===created.primaryId),resolver=createResolver(candidate),nativeValue=toNative(resolver.get(object.id,operation.parameter.key),operation.parameter.unit||'');
  checkParameter(nativeValue,operation.parameter);
  // addConstruction already resolves and validates the candidate. A valid
  // scalar may make geometry temporarily degenerate (factor0, missing index);
  // keep that recoverable object while still rejecting bad scalar parameters.
  operation.validated={expression:source,nativeValue,unit:operation.parameter.unit||'',...(object._defined===false?{defined:false,warning:object._error||'构造暂时未定义；调整输入后可恢复。'}:{})};
 }});
 const reset=()=>{epoch++;active=null;editor.reset();};
 return {
  async open({tool,inputs=[],position=[0,0],parameter,values={},expression,materializeInputs}={}){
   reset();const token=epoch,sourceScene=scene(),schema=geometryToolSchema().find(schema=>schema.id===tool),key=typeof parameter==='string'?parameter:parameter?.key,meta=schema?.parameters?.find(parameter=>parameter.key===key);
   if(!meta?.expressionKey)throw Error('请选择构造工具可编辑的公式参数。');
   const supplied=structuredClone(values),base={...Object.fromEntries(schema.parameters.map(parameter=>[parameter.key,parameter.default])),...supplied,tool,inputs:[...inputs],position:[...position]};
   // An invalid draft must still be editable. Reserve the real pending ID with
   // a valid default, then validate the user's expression on a fresh clone.
   base[meta.key]=meta.default;delete base[meta.expressionKey];
   const preview=structuredClone(sourceScene),previewInputs=materializeInputs?materializeInputs(preview):base.inputs,created=addConstruction(preview,{...base,inputs:previewInputs}),initial=String(expression??supplied[meta.expressionKey]??supplied[meta.key]??meta.default),operation={sourceScene,base,materializeInputs,parameter:meta,pendingId:created.primaryId,validated:null};active=operation;
   const value=await editor.open({mode:'dependency',expression:parameterExpression(sourceScene,initial),references:sceneFormulaReferences(sourceScene),target:{canonical:created.primaryId+'.'+meta.key,name:schema.label+' · '+meta.label,unit:meta.unit||''},continuous:true});
   if(token!==epoch||active!==operation)return null;if(!value){active=null;return null;}
   if(scene()!==sourceScene)throw Error('场景已切换，构造公式未应用。');
   if(!operation.validated)throw Error('构造公式尚未通过原生检查。');
   const result={...operation.validated,continuous:!!value.continuous};active=null;return result;
  },reset,destroy(){reset();editor.destroy();}
 };
}
