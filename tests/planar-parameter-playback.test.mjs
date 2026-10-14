import test from 'node:test';import assert from 'node:assert/strict';
import {parameterPlaybackTarget,nextParameterPlaybackTick} from '../src/planar-parameter-playback.mjs';

test('scan eligibility uses existing free parameter ticks without changing data',()=>{
 const object={id:'o1',kind:'parameter',label:'n',value:6,unit:'',defs:{},slider:{min:3,max:12,step:1}},scene={objects:[object]},before=structuredClone(scene);
 const target=parameterPlaybackTarget(scene,'o1');assert.deepEqual([target.index,target.count,target.value],[3,9,6]);assert.deepEqual(scene,before);
 for(const patch of [{value:6.5},{value:20},{defs:{value:'o2.value'}},{slider:undefined},{kind:'point'},{construction:{type:'anything'}}])assert.throws(()=>parameterPlaybackTarget({objects:[{...object,...patch}]},'o1'));
 assert.throws(()=>parameterPlaybackTarget(scene,'other'));
 const partial=parameterPlaybackTarget({objects:[{...object,value:.3,slider:{min:0,max:1,step:.3}}]},'o1');assert.equal(partial.count,3);assert(Math.abs(partial.lastTick-.9)<1e-12);
});
test('pingpong and loop visit endpoints once and start at the current tick',()=>{
 const walk=mode=>{let state={index:2,count:3,direction:1,mode};const values=[];for(let i=0;i<8;i++){state={...state,...nextParameterPlaybackTick(state)};values.push(state.index);}return values;};
 assert.deepEqual(walk('pingpong'),[3,2,1,0,1,2,3,2]);assert.deepEqual(walk('loop'),[3,0,1,2,3,0,1,2]);
 assert.deepEqual(nextParameterPlaybackTick({index:0,count:1,direction:-1,mode:'pingpong'}),{index:1,direction:1});assert.throws(()=>nextParameterPlaybackTick({index:4,count:3,mode:'loop'}));
});
