import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {zipSync,strToU8} from 'fflate';
import sharp from 'sharp';
import {newPaper,newQuestion,newScene,cloneVariant,validatePaper} from '../src/exam/model.mjs';
import {exportResource,importResource,htmlPaper,readJSONResource,scriptJSON} from '../src/exam/resources.mjs';
import {extractDocx,splitQuestions} from '../src/exam/documents.mjs';
import {PaperStore} from '../desktop/exam/store.mjs';
import {ExamBackend} from '../desktop/exam/backend.mjs';

const fixture=()=>{const p=newPaper('整卷测试'),q=newQuestion('第1题','给定 m、q、L；请保留符号关系。'),a=newScene('原题','lesson:ex2');q.scenes=[a];q.activeSceneId=a.id;p.questions=[q];p.activeQuestionId=q.id;return {p,q,a};};
const png=await sharp({create:{width:10,height:10,channels:3,background:'#ffffff'}}).png().toBuffer();
test('questions and variants independently retain parameters, baselines, view and time',()=>{
 const {p,q,a}=fixture(),variant=cloneVariant(a);
 variant.snapshot.scene.objects.find(o=>o.kind==='parameter').value=3;variant.snapshot.context={timeUs:.31,view:{x:2,y:-1,scale:87},panel:'geometry'};
 q.scenes.push(variant);q.activeSceneId=variant.id;
 const second=newQuestion('第2题','另一题');second.scenes=[newScene('空间','spatial:example4')];second.activeSceneId=second.scenes[0].id;p.questions.push(second);
 const copy=validatePaper(JSON.parse(JSON.stringify(p)));
 assert.equal(copy.questions[0].scenes[0].snapshot.scene.objects[0].value,1.5);
 assert.equal(copy.questions[0].scenes[1].snapshot.scene.objects[0].value,3);
 assert.equal(copy.questions[0].scenes[1].baseline.scene.objects[0].value,1.5);
 assert.equal(copy.questions[0].scenes[1].snapshot.context.timeUs,.31);assert.equal(copy.questions[1].scenes[0].kind,'example4');
});
test('whole-paper resource roundtrip pools shared images and preserves two scenes',()=>{
 const {p,q,a}=fixture(),id=crypto.randomUUID();p.assets[id]={id,name:'原题图',mime:'image/png',url:'data:image/png;base64,'+png.toString('base64')};q.attachments=[{id}];q.scenes.push(cloneVariant(a));
 const second=newQuestion('第二题');second.attachments=[{id}];p.questions.push(second);
 const restored=importResource(exportResource(p));assert.equal(restored.questions.length,2);assert.equal(restored.questions[0].scenes.length,2);assert.equal(Object.keys(restored.assets).length,1);assert.equal(restored.assets[id].url,p.assets[id].url);
});
test('resource import rejects traversal, missing images, duplicate ids and executable object shapes',()=>{
 assert.throws(()=>importResource(zipSync({'../outside.txt':strToU8('x')})),/不安全/);
 const {p,q}=fixture();q.attachments=[{id:'missing'}];assert.throws(()=>validatePaper(p),/缺少/);
 const other=fixture().p;other.questions.push(structuredClone(other.questions[0]));assert.throws(()=>validatePaper(other),/编号重复/);
 assert.throws(()=>validatePaper(JSON.parse('{"format":"particle-exam/1","constructor":{}}')),/不允许/);
});
test('HTML resource data is escaped without changing literal dollar replacements or question text',()=>{
 const {p}=fixture();p.title="literal $& $' $"+String.fromCharCode(96);p.questions[0].sourceText='原文 </script><script>window.fake=true</script> 与 $\\sqrt{3}$';
 const html='<script id="paper-data" type="application/json">'+scriptJSON(p)+'</script>';
 assert.equal((html.match(/<script/g)||[]).length,1);const restored=htmlPaper(html);assert.equal(restored.title,p.title);assert.equal(restored.questions[0].sourceText,p.questions[0].sourceText);
});
test('legacy scene and project resources migrate without CLI sessions',()=>{
 const {a}=fixture(),scene=readJSONResource(JSON.stringify({format:'planar-particle-sandbox/5',scene:{...a.snapshot.scene,version:5},time:.2e-6,view:{x:0,y:0,scale:100}}));assert.equal(scene.type,'scene');assert.ok(Math.abs(scene.snapshot.context.timeUs-.2)<1e-12);
 const project={format:'planar-agent-project/1',title:'旧项目',questions:[{title:'旧题',sourceText:'原文',scene:a.snapshot.scene,context:{timeUs:.1},attachments:[],sessions:{codex:'private-session'}}]};
 const paper=importResource(zipSync({'project.json':strToU8(JSON.stringify(project))}));assert.equal(paper.questions[0].scenes.length,1);assert.equal(paper.questions[0].sessions,undefined);
});
test('DOCX omml fractions, radicals and images are preserved; teacher knowledge summaries are not questions',()=>{
 const xml='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:r><w:t>[学习目标] 学会分析组合场。</w:t></w:r></w:p><w:p><w:r><w:t>1.组合场：知识说明。</w:t></w:r></w:p><w:p><w:r><a:blip r:embed="rId1"/></w:r><w:r><w:t>例1 原题</w:t></w:r><m:oMath><m:f><m:num><m:rad><m:e><m:r><m:t>3</m:t></m:r></m:e></m:rad></m:num><m:den><m:r><m:t>qL</m:t></m:r></m:den></m:f></m:oMath></w:p><w:p><w:r><w:t>答案 应单独保留。</w:t></w:r></w:p><w:p><w:r><w:t>1.划分过程：方法总结。</w:t></w:r></w:p><w:p><w:r><w:t>1.真正的试题，求轨迹。</w:t></w:r></w:p></w:body></w:document>';
 const bytes=zipSync({'word/document.xml':strToU8(xml),'word/_rels/document.xml.rels':strToU8('<Relationships><Relationship Id="rId1" Target="media/image1.png"/></Relationships>'),'word/media/image1.png':png});
 const parsed=extractDocx(bytes),questions=splitQuestions(parsed.paragraphs);assert.equal(questions.length,2);assert.match(questions[0].text,/\\frac\{\\sqrt\{3\}\}\{qL\}/);assert.doesNotMatch(questions[0].text,/答案/);assert.match(questions[0].referenceText,/答案/);assert.deepEqual(questions[0].imageIds,['rId1']);
});
test('disk saves separate immutable images from scene metadata and import into a fresh paper',async()=>{
 const root=await mkdtemp(join(tmpdir(),'exam-store-')),store=await new PaperStore(root).init(),{p,q}=fixture();
 const asset=await store.writeAsset(p,png,{name:'题图'});q.attachments=[asset];await store.save(p);const ui=await store.forUI(p);assert.match(ui.assets[asset.id].url,/^data:image\/png/);
 await store.save(ui);const saved=JSON.parse(await readFile(join(store.folder(p.id),'paper.json'),'utf8'));assert.equal(saved.assets[asset.id].url,undefined);
 const portable=await store.portable(p),imported=await store.importPortable(portable);assert.notEqual(imported.id,p.id);assert.deepEqual(await readFile(store.assetPath(imported.id,imported.assets[asset.id].path)),png);
 assert.throws(()=>store.assetPath(p.id,'../outside'),/超出/);
});
test('document preview does not replace a saved paper until selected candidates are committed',async()=>{
 const root=await mkdtemp(join(tmpdir(),'exam-import-')),backend=new ExamBackend({dataDir:root,resourceDir:'.',renderPDF:async()=>[]}),state=await backend.init(),path=join(root,'page.png');await writeFile(path,png);
 const draft=await backend.previewDocuments(state.paper,[path]);assert.equal(draft.candidates[0].needsOutline,true);assert.equal((await backend.store.open(state.paper.id)).questions.length,0);
 const committed=await backend.commitDocuments(state.paper,{id:draft.id,questions:draft.candidates});assert.equal(committed.paper.questions.length,1);assert.equal(committed.paper.questions[0].review,'pending');
});
