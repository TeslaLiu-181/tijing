import test from 'node:test';import assert from 'node:assert/strict';import {buildSceneQuestion} from '../src/exam/scene-question.mjs';
const fixture=()=>({scene:{duration:1,objects:[{id:'o1',kind:'circle',label:'c_A',enabled:true},{id:'o2',kind:'particle',label:'P',enabled:true},{id:'o3',kind:'source',label:'S',enabled:true,count:3,interval:.4}]},context:{timeUs:.2,readingSide:'after'}});
test('object question uses actual stable label and scope without invented numeric readings',()=>{
 const snapshot=fixture(),before=structuredClone(snapshot),value=buildSceneQuestion(snapshot,{kind:'object',objectId:'o1'});assert(value.contextLabel.includes('c_A [o1]'));assert(value.contextLabel.includes('0.2 μs'));assert(value.prompt.includes('构造输入'));assert(!/力[：:]|坐标[：:]/.test(value.prompt));assert.deepEqual(snapshot,before);
});
test('particle/source instance trace ownership and count bounds remain exact',()=>{
 assert.equal(buildSceneQuestion(fixture(),{kind:'trajectory',traceId:'o3:2',timeUs:.1,side:'before'}).selection.objectId,'o3');
 for(const selection of [{kind:'trajectory',objectId:'o2',traceId:'o3:1'},{kind:'trajectory',traceId:'o2:0'},{kind:'trajectory',traceId:'o3'},{kind:'trajectory',traceId:'o3:3'},{kind:'trajectory',traceId:'o3:01'},{kind:'trajectory',traceId:'o1'}])assert.throws(()=>buildSceneQuestion(fixture(),selection));
 const snapshot=fixture();snapshot.scene.objects[2].count=2.5;assert.throws(()=>buildSceneQuestion(snapshot,{kind:'trajectory',traceId:'o3:1'}));
});
test('event asks native before/after verification and rejects unsupported kind/time/side',()=>{
 const value=buildSceneQuestion(fixture(),{kind:'event',traceId:'o2',timeUs:.5,side:'before',eventKind:'enter'});assert(value.prompt.includes('先核查原生事件记录'));assert(value.contextLabel.includes('前侧'));assert.equal(value.selection.eventKind,'enter');
 for(const extra of [{eventKind:'collision'},{timeUs:1.1},{timeUs:-.1},{side:'left'},{timeUs:'0.5'}])assert.throws(()=>buildSceneQuestion(fixture(),{kind:'event',traceId:'o2',timeUs:.5,side:'after',eventKind:'switch',...extra}));
});

test('field event questions keep the actual field identity when several fields meet at one node',()=>{
 const snapshot=fixture();snapshot.scene.objects.push({id:'o4',kind:'electric',label:'E_2',enabled:true});
 const value=buildSceneQuestion(snapshot,{kind:'event',traceId:'o2',timeUs:.5,side:'after',eventKind:'enter',fieldId:'o4'});assert(value.contextLabel.includes('电场 E_2 [o4]'));assert.equal(value.selection.fieldId,'o4');assert.throws(()=>buildSceneQuestion(snapshot,{...value.selection,fieldId:'o1'}));
});
