import {definitionTex,properties,targets,canonicalExpression} from './planar-relations.mjs';
import {kinds} from './planar-model.mjs';
import {parseExpression,printExpression,transformReferences} from './planar-expressions.mjs';

export function parameterExpression(scene,expression){
 const parameters=new Set(scene.objects.filter(object=>object.kind==='parameter').map(object=>object.id));
 // Free-parameter shorthand is a scalar reference. Other whole objects retain
 // their geometry meaning and are never guessed to be a same-named property.
 return printExpression(transformReferences(parseExpression(canonicalExpression(scene,expression)),reference=>!reference.key&&parameters.has(reference.name)?{...reference,key:'value'}:reference));
}

/** Stable scene references for both existing definitions and pending geometry. */
export function sceneFormulaReferences(scene){
 const references=scene.objects.flatMap(object=>[
  // Free parameters expose their scalar value, not an ambiguous whole object.
  ...(object.kind==='parameter'?[]:[{canonical:object.id,latex:definitionTex(scene,object.id),label:object.label+' · '+kinds[object.kind]}]),
  ...Object.entries({...properties(object),...targets(object)})
   .filter(([property])=>object.kind!=='parameter'||property==='value')
   .map(([property,meta])=>({canonical:object.id+'.'+property,latex:definitionTex(scene,object.id+'.'+property),label:object.label+' · '+meta.name,unit:meta.unit}))
 ]);
 const labels=new Map();for(const reference of references)labels.set(reference.latex,(labels.get(reference.latex)||0)+1);
 for(const reference of references)if(labels.get(reference.latex)>1){
  // Keep every same-named object selectable; never choose by its current value.
  const [id,property]=reference.canonical.split('.');
  reference.latex=property?'\\operatorname{ref}\\left('+id+',\\mathrm{'+property+'}\\right)':'\\mathrm{'+id+'}';
  reference.label+=' ('+reference.canonical+')';
 }
 return references;
}
