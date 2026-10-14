import test from 'node:test';import assert from 'node:assert/strict';import {objectStyleKeys,objectStyleOverrides,validateObjectStyle} from '../src/planar-object-style.mjs';
test('partial style preserves defaults/solid/zero opacity and ink never changes stored color',()=>{
 const object={kind:'circle',style:{color:'#F08030',dash:'solid',opacity:0}},before=structuredClone(object);assert.deepEqual(objectStyleOverrides({kind:'circle'}),{});assert.equal(objectStyleOverrides(object).dashArray,'');assert.equal(objectStyleOverrides(object).opacity,0);assert.equal(objectStyleOverrides(object,{ink:true}).color,'#171717');assert.deepEqual(object,before);
});
test('style properties remain kind-specific and cannot inject SVG/CSS strings',()=>{
 assert.deepEqual(objectStyleKeys({kind:'label'}),['color','opacity']);assert.deepEqual(objectStyleKeys({kind:'parameter'}),[]);assert.throws(()=>validateObjectStyle({kind:'point'},{dash:'solid'}));assert.throws(()=>validateObjectStyle({kind:'parameter'},{color:'#000000'}));assert.throws(()=>validateObjectStyle({kind:'label'},{strokeWidth:2}));
 for(const style of [{color:'url(https://example.invalid)'},{color:'#fff'},{strokeWidth:Infinity},{strokeWidth:.1},{opacity:1.1},{dash:'7 4'},{pointSize:30}])assert.throws(()=>validateObjectStyle({kind:'particle'},style));validateObjectStyle({kind:'particle'},{color:'#ff0033',strokeWidth:2,dash:'dotted',opacity:.5,pointSize:7});
});
