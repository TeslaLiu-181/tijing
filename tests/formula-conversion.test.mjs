import test from 'node:test';import assert from 'node:assert/strict';
import {expressionToFormula,formulaToExpression,validateFormulaLatex} from '../src/formula-conversion.mjs';
import {example,createObject,emptyScene} from '../src/planar-model.mjs';
import {setDefinition,createResolver,definitionTex} from '../src/planar-relations.mjs';
import {sceneFormulaReferences} from '../src/planar-formula-references.mjs';import {toNative} from '../src/planar-expressions.mjs';

test('graphical dependency round-trip keeps real object/property IDs and continuous units',()=>{
 const scene=example('circle'),p=createObject('parameter','o3');p.label='L';p.value=8;p.unit='cm';scene.objects.push(p);
 const refs=scene.objects.flatMap(o=>Object.keys(o).filter(key=>typeof o[key]==='number').map(key=>({canonical:o.id+'.'+key,latex:definitionTex(scene,o.id+'.'+key)})));
 const source='sqrt(2) * o3.value / 2',formula=expressionToFormula(source,{references:refs}),back=formulaToExpression(formula.latex,{references:formula.references});
 assert(back.expression.includes('o3.value'));setDefinition(scene,'o1','radius',back.expression,true);
 const first=createResolver(scene).get('o1','radius').n;p.value=12;const second=createResolver(scene).get('o1','radius').n;
 assert(Math.abs(second/first-1.5)<1e-12);assert.equal(scene.objects[0].defs.radius,back.expression);
});
test('geometry and physics functions keep canonical references rather than current values',()=>{
 for(const source of ['orbitSpeed(o2.mass,o2.charge,o1.B,o1.radius)','intersect(circle(pos(o4),o3.value),axisX,1)','-o1.B','sin(o2.heading)']){
  const formula=expressionToFormula(source),back=formulaToExpression(formula.latex,{references:formula.references});
  assert(back.expression.includes('o'));assert(!/ref\(/.test(back.expression));
 }
});
test('explicit displayed unit survives, handwriting m remains unresolved until user chooses',()=>{
 const formula=expressionToFormula('2 cm'),back=formulaToExpression(formula.latex);assert.equal(back.expression,'(2 * cm)');
 assert.throws(()=>formulaToExpression('m v'),e=>e.symbols.includes('m')&&e.symbols.includes('v'));
 const bound=formulaToExpression('m v',{bindings:{m:'o2.mass',v:'o2.speed'}});assert.equal(bound.expression,'(o2.mass * o2.speed)');
});
test('equation applies right side only after left target and all variable mappings are explicit',()=>{
 const latex='r=\\frac{m v}{|q|B}';
 assert.throws(()=>formulaToExpression(latex),/确认等号左侧/);
 const options={target:'o1.radius',acceptEquation:true,bindings:{r:'o1.radius',m:'o2.mass',v:'o2.speed',q:'o2.charge',B:'o1.B'}};
 assert.equal(formulaToExpression(latex,options).expression,'((o2.mass * o2.speed) / (abs(o2.charge) * o1.B))');
 assert.throws(()=>formulaToExpression(latex,{...options,target:'o1.height'}),/左侧尚未映射/);
});
test('root degree is symbolic and matrix is display-only without explicit supported conversion',()=>{
 assert.equal(formulaToExpression('\\sqrt[3]{x}',{bindings:{x:'o1.radius'}}).expression,'pow(o1.radius, (1 / 3))');
 const matrix='\\begin{bmatrix}x\\\\y\\end{bmatrix}';assert.throws(()=>formulaToExpression(matrix),/矩阵/);
 assert.equal(formulaToExpression(matrix,{matrixAsPoint:true,bindings:{x:'o3.value',y:'o4.value'}}).expression,'point(o3.value, o4.value)');
 assert.throws(()=>formulaToExpression('\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}',{matrixAsPoint:true}),/2行1列/);
});
test('unsafe/control code and unsupported comparisons/ambiguous operators never become dependencies',()=>{
 for(const value of ['\\href{javascript:alert(1)}{x}','\\class{evil}{x}','\\input{secret}','x\u000c y'])assert.throws(()=>validateFormulaLatex(value));
 for(const value of ['x\\pm y','\\int x\\,dx','x<y'])assert.throws(()=>formulaToExpression(value));
});

test('only symbols actually used raise ambiguity, and chosen mapping resolves duplicate labels',()=>{
 const references=[{canonical:'o1',latex:'L'},{canonical:'o1.value',latex:'L'},{canonical:'o2.B',latex:'B'}];
 assert.equal(formulaToExpression('2B',{references}).expression,'(2 * o2.B)');
 assert.throws(()=>formulaToExpression('2L',{references}),e=>e.ambiguous&&e.symbols[0]==='L');
 assert.equal(formulaToExpression('2L',{references,bindings:{L:'o1.value'}}).expression,'(2 * o1.value)');
});

test('internal reference markers cannot swallow a user variable with the same spelling',()=>{
 assert.throws(()=>formulaToExpression('Q_{5000}+\\mathrm{cm}'),e=>e.symbols?.includes('Q_5000'));
});

test('read-only circle/polygon geometry measurements round-trip without evaluating values',()=>{
 for(const expression of ['area(o1)','perimeter(o4)','area(o4) / o3.value']){
  const value=expressionToFormula(expression),back=formulaToExpression(value.latex,{references:value.references});
  assert(back.expression.includes(expression.startsWith('area')?'area':'perimeter'));
  assert(back.expression.includes(expression.includes('o4')?'o4':'o1'));
 }
});

test('confirmed handwritten radius equation preserves SI conversions and signed charge/field magnitudes',()=>{
 const scene=example('circle'),field=scene.objects.find(o=>o.kind==='field'),particle=scene.objects.find(o=>o.kind==='particle');
 Object.assign(field,{B:-2});Object.assign(particle,{mass:1.0072764666,charge:-1,speed:3});
 const formula=formulaToExpression('r=\\frac{m v}{|q| |B|}',{target:field.id+'.radius',acceptEquation:true,bindings:{r:field.id+'.radius',m:particle.id+'.mass',v:particle.id+'.speed',q:particle.id+'.charge',B:field.id+'.B'}});
 setDefinition(scene,field.id,'radius',formula.expression,true);
 // Independent SI arithmetic: editing units are u, 10^5 m/s, e, and mT.
 const expectedMetres=particle.mass*1.6605390666e-27*particle.speed*1e5/(Math.abs(particle.charge)*1.602176634e-19*Math.abs(field.B)*1e-3);
 assert(Math.abs(createResolver(scene).get(field.id,'radius').n/expectedMetres-1)<1e-12);
 field.B=-4;assert(Math.abs(createResolver(scene).get(field.id,'radius').n/expectedMetres-.5)<1e-12);assert.equal(field.defs.radius,formula.expression);
 const area=formulaToExpression(expressionToFormula('4 cm2').latex);assert(Math.abs(createResolver(scene).evaluate(area.expression).n-.0004)<1e-15);
});

test('empty GUI bindings cannot turn an explicit unit into an unbound letter',()=>{
 const options={target:'o1.radius',acceptEquation:true,bindings:{r:'o1.radius',cm:''}};
 assert.equal(formulaToExpression('r=2\\mathrm{cm}',options).expression,'(2 * cm)');
 assert.equal(formulaToExpression('2\\mathrm{cm}',{bindings:{cm:'o3.value'}}).expression,'(2 * o3.value)');
});

test('handwritten B cannot silently use a same-named whole field in scalar arithmetic',()=>{
 const references=[{canonical:'o5',latex:'B',label:'磁场B'},{canonical:'o5.B',latex:'B_z',label:'磁感应强度',unit:'mT'}],bindings={m:'o3.mass',v:'o3.speed',q:'o3.charge'};
 assert.throws(()=>formulaToExpression('m v/(q B)',{references,bindings}),e=>e.symbols?.includes('B')&&/整个几何对象/.test(e.message));
 assert.equal(formulaToExpression('m v/(q B)',{references,bindings:{...bindings,B:'o5.B'}}).expression,'((o3.mass * o3.speed) / (o3.charge * o5.B))');
 assert.equal(formulaToExpression('\\operatorname{area}(B)',{references}).expression,'area(o5)');
 assert.throws(()=>formulaToExpression('\\sin(B)',{references}),e=>e.symbols?.includes('B'));
});

test('native angle/length/three-point geometry functions round-trip with count variables and preserve typed arguments',()=>{
 const scene=emptyScene(),A=createObject('point','o1',[1,0]),O=createObject('point','o2',[0,0]),B=createObject('point','o3',[0,1]),n=createObject('parameter','o4'),namedMin=createObject('parameter','o5'),angle=createObject('parameter','o6');A.label='A';O.label='O';B.label='B';n.label='n';namedMin.label='min';Object.assign(angle,{label:'alpha',unit:'deg'});scene.objects=[A,O,B,n,namedMin,angle];const refs=sceneFormulaReferences(scene);
 const source='acos(max(-1,min(1,dot(unit(vector(o2,o1)),unit(vector(o2,o3))))))',formula=expressionToFormula(source,{references:refs}),back=formulaToExpression(formula.latex,{references:refs});setDefinition(scene,'o6','value',back.expression);assert(Math.abs(toNative(createResolver(scene).get('o6','value'),'deg')-90)<1e-10);
 for(const [source,unit,expected] of [['length(segment(o1,o3))','cm',Math.sqrt(2)],['length(ray(o2,o1))','cm',1],['length(unit(vector(o1,o3)))','',1],['distance(circumcenter(o1,o2,o3),o2)','cm',Math.SQRT1_2],['area(circleThrough(o1,o2,o3))','cm2',Math.PI/2]]){const f=expressionToFormula(source,{references:refs}),b=formulaToExpression(f.latex,{references:refs}),quantity=createResolver(scene).evaluate(b.expression);assert(Math.abs(toNative(quantity,unit)-expected)<1e-10);if(unit==='')assert.equal(quantity.scale,1);}
 assert.throws(()=>formulaToExpression('\\operatorname{dot}(A,B)',{references:refs}),e=>e.symbols?.includes('A'));assert.throws(()=>formulaToExpression('A+1',{references:refs}),/整个几何对象/);
});
