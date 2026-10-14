import {parseExpression,isConstant} from './planar-expressions.mjs';
function references(ast,values){if(ast.type==='ref'){if(!isConstant(ast.name)||ast.key)values.add(ast.name);}else if(ast.type==='call')ast.args.forEach(a=>references(a,values));else if(ast.type==='binary'){references(ast.a,values);references(ast.b,values);}else if(ast.type==='unary')references(ast.arg,values);}
export function geometryDependencies(scene){
 const objects=new Map(scene.objects.map(o=>[o.id,o])),parents=new Map(),children=new Map(scene.objects.map(o=>[o.id,new Set()]));
 for(const o of scene.objects){
  const inputs=new Set(o.construction?.inputs||[]);if(o.regionSource)inputs.add(o.regionSource);
  for(const expression of Object.values(o.defs||{})){try{const names=new Set();references(parseExpression(expression),names);for(const name of names){const aliases=scene.objects.filter(x=>x.label===name);inputs.add(objects.has(name)?name:aliases.length===1?aliases[0].id:name);}}catch{}}
  inputs.delete(o.id);parents.set(o.id,inputs);for(const id of inputs)children.get(id)?.add(o.id);
 }
 const pending=new Map([...parents].map(([id,inputs])=>[id,new Set([...inputs].filter(x=>objects.has(x)))])),order=[],queue=scene.objects.filter(o=>!pending.get(o.id).size).map(o=>o.id);
 while(queue.length){const id=queue.shift();if(order.includes(id))continue;order.push(id);for(const child of children.get(id)){pending.get(child).delete(id);if(!pending.get(child).size)queue.push(child);}}
 // Property-level lazy evaluation detects real cycles. Reciprocal references
 // between independent free coordinates need not form a construction cycle.
 for(const o of scene.objects)if(!order.includes(o.id))order.push(o.id);
 const structure=JSON.stringify(scene.objects.map(o=>[o.id,o.kind,o.label,o.unit,o.shape,o.lineType,o.points?.length,o.defs,o.regionSource,
  o.construction&&[o.construction.type,o.construction.inputs,o.construction.group,o.construction.branch,o.construction.pathUnit]]));
 return {parents,children,order,structure,edges:[...parents].flatMap(([to,ids])=>[...ids].map(from=>({from,to})))};
}
export function dependencySnapshot(scene,graph=geometryDependencies(scene)){
 return {level:'objects',nodes:scene.objects.map(o=>({id:o.id,label:o.label,kind:o.kind,defined:o._defined!==false&&!o._error,algorithm:o.construction?.type||(o.regionSource?'region-source':Object.keys(o.defs||{}).length?'definitions':'free'),inputs:[...graph.parents.get(o.id)],message:o._error||''})),edges:graph.edges.map(edge=>{const target=scene.objects.find(o=>o.id===edge.to);return {...edge,type:target?.regionSource===edge.from?'region':target?.construction?.inputs.includes(edge.from)?'construction':'definition'};}),order:graph.order};
}
export function downstreamObjects(scene,graph,changedIds){
 const affected=new Set(changedIds),queue=[...affected];
 while(queue.length){const id=queue.shift();for(const child of graph.children.get(id)||[])if(!affected.has(child)){affected.add(child);queue.push(child);}
  const object=scene.objects.find(o=>o.id===id),c=object?.construction;if(['intersection','tangent'].includes(c?.type))for(const sibling of scene.objects){const s=sibling.construction;if(s?.type===c.type&&s.group===c.group&&s.inputs.join('|')===c.inputs.join('|')&&!affected.has(sibling.id)){affected.add(sibling.id);queue.push(sibling.id);}}
 }
 return affected;
}

// Every typed construction consumes its geometric inputs. Check these edges
// even when an undefined input would stop numerical evaluation before a cycle.
// Property definitions stay in the native lazy evaluator: object-level numeric
// back-edges can refer to independent coordinates and are not necessarily cycles.
export function constructionCycle(scene){
 const objects=new Map(scene.objects.map(o=>[o.id,o])),done=new Set(),path=[];
 function visit(id){
  const at=path.indexOf(id);if(at>=0)return [...path.slice(at),id];if(done.has(id)||!objects.has(id))return null;
  path.push(id);const o=objects.get(id);for(const parent of [...(o.construction?.inputs||[]),...(o.regionSource?[o.regionSource]:[])]){const cycle=visit(parent);if(cycle)return cycle;}
  path.pop();done.add(id);return null;
 }
 for(const o of scene.objects){const cycle=visit(o.id);if(cycle)return cycle;}return null;
}
