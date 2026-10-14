import {compileField,fieldsAt,circleCircle,circleLine,add,sub,mul,dot,norm,direction} from './planar-physics.mjs';
import {readWaveFactor} from './planar-motion-readings.mjs';

const isField=o=>o.kind==='field'||o.kind==='electric';
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fixed=value=>Number(value.toFixed(3));
const mod=(n,d)=>(n%d+d)%d;
function orderedMatrix(n){if(n===1)return [[0]];const small=orderedMatrix(n/2),offset=[[0,2],[3,1]];return Array.from({length:n},(_,y)=>Array.from({length:n},(_,x)=>4*small[y%(n/2)][x%(n/2)]+offset[Math.floor(y/(n/2))][Math.floor(x/(n/2))]));}
const ORDER=orderedMatrix(8),DC={waveform:'dc'};

// The reference is fixed while editing or playing a scene. Re-normalizing on
// every frame would make an increasing or oscillating field look constant.
export function fieldMarkDensity(magnitude,reference){
 if(magnitude===0)return {fraction:0,limited:false};
 const raw=Math.abs(magnitude)/reference/4;
 return {fraction:Math.max(1/64,Math.min(1,raw)),limited:raw<1/64||raw>1};
}

function intersections(a,b){
 if(a.kind==='circle'&&b.kind==='circle')return circleCircle(a.center,a.r,b.center,b.r);
 if(a.kind==='circle')return circleLine(a.center,a.r,b);
 if(b.kind==='circle')return circleLine(b.center,b.r,a);
 const det=a.n[0]*b.n[1]-a.n[1]*b.n[0];
 return Math.abs(det)<1e-12?[]:[[(a.d*b.n[1]-a.n[1]*b.d)/det,(a.n[0]*b.d-a.d*b.n[0])/det]];
}
function seeds(field,pixelInMetres){
 const {object:o,center,vertices,edges}=field,points=[center];
 if(vertices.length){const c=mul(vertices.reduce((sum,p)=>add(sum,p),[0,0]),1/vertices.length);points.push(c);for(const p of vertices)points.push(add(mul(p,.98),mul(c,.02)));}
 if(['circle','annulus','semicircle','sector'].includes(o.shape)){
  const r=(o.shape==='annulus'?(o.radius+o.innerRadius)/2:o.radius*.6)*.01;
  for(let i=0;i<16;i++)points.push(add(center,mul(direction(i*22.5),r)));
 }
 for(const edge of edges)if(edge.kind==='line'){
  const foot=sub(center,mul(edge.n,dot(edge.n,center)-edge.d));points.push(sub(foot,mul(edge.n,pixelInMetres)));
 }
 return points;
}

/** One source of instantaneous field values for both the picture and probe. */
export class FieldDisplay{
 constructor(){this.references={};this.fields=[];this.invalid=[];this.mapCache=null;this.instantCache=null;}
 resetReferences(input={}){this.references={};if(!input||typeof input!=='object'||Array.isArray(input))return;for(const kind of ['magnetic','electric'])if(Number.isFinite(input[kind])&&input[kind]>0)this.references[kind]=input[kind];}
 snapshotReferences(){return {...this.references};}
 setScene(scene){
  this.scene=scene;this.fields=[];this.invalid=[];this.mapCache=null;this.instantCache=null;
  for(const object of scene.objects.filter(o=>isField(o)&&o.enabled)){
   if(object._error){this.invalid.push(object);continue;}
   const field=compileField(object);
   if(!Number.isFinite(field.B)||field.electric.some(v=>!Number.isFinite(v))){this.invalid.push(object);continue;}
   field.kind=object.kind==='field'?'magnetic':'electric';field.drawVisible=object.visible!==false&&(object.style?.opacity??1)>0;this.fields.push(field);
  }
  this.fields.sort((a,b)=>a.id.localeCompare(b.id));this.fields.forEach((f,i)=>f.index=i);
  for(const kind of ['magnetic','electric'])if(!this.references[kind]){
   const values=this.fields.filter(f=>f.kind===kind).map(f=>kind==='magnetic'?Math.abs(f.B):norm(f.electric)).filter(v=>v>0).sort((a,b)=>a-b);
   if(values.length)this.references[kind]=values[Math.floor(values.length/2)];
  }
 }
 instantaneous(time=0,side='after'){
  if(this.instantCache?.time===time&&this.instantCache.side===side)return this.instantCache.fields;
  // Read the same clock side as the timeline. fieldsAt then performs the native
  // stable sum once; the frozen DC wrapper prevents applying the waveform twice.
  const fields=this.fields.map(f=>{const factor=readWaveFactor(f.object,time,{side});return {...f,source:f.object,object:DC,B:f.B*factor,electric:mul(f.electric,factor)};});
  this.instantCache={time,side,fields};return fields;
 }
 sample(pointCm,time=0,side='after'){
  const point=mul(pointCm,.01),fields=this.instantaneous(time,side),net=fieldsAt(fields,point),active=fields.filter(f=>net.ids.includes(f.id));
  const contributions=active.map(f=>({id:f.id,label:f.source.label,kind:f.kind,visible:f.drawVisible,B:f.B,electric:[...f.electric],waveform:f.source.waveform||'dc'}));
  const onBoundary=active.some(f=>f.edges.some(e=>{const distance=e.kind==='circle'?norm(sub(point,e.center))-e.r:dot(e.n,point)-e.d;return Math.abs(distance)<=64*Number.EPSILON*Math.max(1,norm(point),e.r||Math.abs(e.d));}));
  return {pointCm:[...pointCm],timeUs:time*1e6,side,B:net.B,electric:net.electric,contributions,onBoundary,unavailable:this.invalid.map(o=>({id:o.id,label:o.label})),references:this.snapshotReferences()};
 }
 buildMap(view){
  const key=[view.width,view.height,view.view.x,view.view.y,view.view.scale].join(',');
  if(this.mapCache?.key===key)return this.mapCache.groups;
  const groups=new Map(),origin=view.screen([0,0]),inFrame=p=>p[0]>=0&&p[0]<=view.width&&p[1]>=0&&p[1]<=view.height;
  const addPoint=(point,kind,threshold,seed=false)=>{
   const members=this.fields.filter(f=>f.kind===kind&&f.contains(point));if(!members.some(f=>f.drawVisible))return;
   const pixel=view.screen(mul(point,100));if(!inFrame(pixel))return;
   const key=kind+':'+members.map(f=>f.index).join(',');let group=groups.get(key);
   if(!group){group={kind,key,members:members.map(f=>f.index),point,samples:[],seed:null};groups.set(key,group);}
   if(seed){group.seed??={pixel,pointCm:mul(point,100)};return;}
   group.samples.push({pixel,pointCm:mul(point,100),threshold});
  };
  // Ordered sampling produces regular sparse grids at common strengths and
  // progressively fills their gaps. One shared lattice makes equal fields look
  // equal and keeps panning stable; density is independent of source count.
  const displayScale=Math.max(1,Math.sqrt(view.width*view.height/(1600*1000)));
  for(const kind of ['magnetic','electric']){
   if(!this.fields.some(f=>f.kind===kind&&f.drawVisible))continue;
   const pitch=(kind==='magnetic'?22:32)*displayScale;
   const startX=Math.ceil(-origin[0]/pitch-.5),endX=Math.floor((view.width-origin[0])/pitch-.5),startY=Math.ceil(-origin[1]/pitch-.5),endY=Math.floor((view.height-origin[1])/pitch-.5);
   for(let j=startY;j<=endY;j++)for(let i=startX;i<=endX;i++){
    const pixel=[origin[0]+(i+.5)*pitch,origin[1]+(j+.5)*pitch];addPoint(mul(view.world(pixel),.01),kind,(ORDER[mod(j,8)][mod(i,8)]+.5)/64);
   }
  }
  // Small circles, narrow strips and tiny overlap lenses may contain no lattice
  // node. Geometry seeds ensure a readable marker when there is room for one.
  // They do not define the field: exact SVG region clipping below still applies.
  const epsilon=.08/(view.view.scale*100);
  for(const f of this.fields.filter(f=>f.drawVisible))for(const p of seeds(f,epsilon))addPoint(p,f.kind,0,true);
  let pairs=0;
  intersectionSeeds:for(let i=0;i<this.fields.length;i++)for(let j=i+1;j<this.fields.length;j++){
   const a=this.fields[i],b=this.fields[j];if(a.kind!==b.kind||!a.drawVisible&&!b.drawVisible)continue;
   for(const e of a.edges)for(const f of b.edges){if(++pairs>4096)break intersectionSeeds;for(const p of intersections(e,f))for(const d of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]])addPoint(add(p,mul(d,epsilon)),a.kind,0,true);}
  }
  this.mapCache={key,groups:[...groups.values()]};return this.mapCache.groups;
 }
 glyphPlan(view){
  const instant=this.instantaneous(view.time||0,view.ui?.readingSide||'after'),plans=[];
  for(const group of this.buildMap(view)){
   const members=group.members.map(i=>instant[i]),net=fieldsAt(members,group.point),magnitude=group.kind==='magnetic'?Math.abs(net.B):norm(net.electric);
   if(!magnitude)continue;
   const density=fieldMarkDensity(magnitude,this.references[group.kind]||magnitude),samples=group.samples.filter(p=>p.threshold<density.fraction);
   if(!samples.length&&group.seed)samples.push(group.seed);
   else if(!samples.length&&group.samples.length)samples.push(group.samples[0]);
   if(samples.length)plans.push({...group,...net,magnitude,density,samples});
  }
  return plans;
 }
 render(view){
  if(!view.model.display.marks||!this.fields.length)return '';
  const plans=this.glyphPlan(view);if(!plans.length)return '';
  const regionId=index=>view.paintId('net-field-region-'+index),defs=this.fields.map(f=>`<clipPath id="${regionId(f.index)}">${view.fieldRegion(f.object,'fill="white" stroke="none"')}</clipPath>`);
  const instant=this.instantaneous(view.time||0,view.ui?.readingSide||'after');let out='';
  for(let i=0;i<plans.length;i++){
   const plan=plans[i],electric=plan.kind==='electric',nonzero=plan.members.map(index=>instant[index]).filter(f=>electric?norm(f.electric)>0:f.B!==0),styles=nonzero.map(f=>view.styleFor(f.source)),same=styles.every(s=>s.color===styles[0]?.color&&s.opacity===styles[0]?.opacity),style=same?styles[0]||{}:{};
   const color=style.color??(electric?(view.model.display.ink?'#646464':'#b3833d'):'#333'),opacity=style.opacity??1;
   let content=plan.samples.map(sample=>{
    const [x,y]=sample.pixel,at=`data-net-marker="${plan.kind}" data-field-point="${sample.pointCm.map(fixed).join(',')}"`;
    if(!electric)return plan.B>0?`<circle cx="${fixed(x)}" cy="${fixed(y)}" r="2.3" fill="${color}" ${at}/>`:`<path d="M${fixed(x-5)},${fixed(y-5)}l10,10m-10,0l10,-10" fill="none" stroke="${color}" stroke-width="1.35" ${at}/>`;
    const direction=mul(plan.electric,1/plan.magnitude),u=[direction[0],-direction[1]],a=sub(sample.pixel,mul(u,12)),b=add(sample.pixel,mul(u,12)),back=sub(b,mul(u,6)),n=[-u[1]*3.5,u[0]*3.5];
    return `<path d="M${a.map(fixed)}L${b.map(fixed)}M${add(back,n).map(fixed)}L${b.map(fixed)}L${sub(back,n).map(fixed)}" fill="none" stroke="${color}" stroke-width="1.2" ${at}/>`;
   }).join('');
   const excluded=this.fields.filter(f=>f.kind===plan.kind&&!plan.members.includes(f.index));
   if(excluded.length){const id=view.paintId('net-field-exclude-'+i);defs.push(`<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${view.width}" height="${view.height}" style="mask-type:luminance"><rect width="${view.width}" height="${view.height}" fill="white"/>${excluded.map(f=>view.fieldRegion(f.object,'fill="black" stroke="none"')).join('')}</mask>`);content=`<g mask="url(#${id})">${content}</g>`;}
   for(const index of plan.members)content=`<g clip-path="url(#${regionId(index)})">${content}</g>`;
   out+=`<g data-net-field="${plan.kind}" data-field-members="${esc(plan.ids.join(' '))}" data-net-b-mt="${plan.B*1000}" data-net-ex="${plan.electric[0]}" data-net-ey="${plan.electric[1]}" data-density="${plan.density.fraction}" opacity="${opacity}">${content}</g>`;
  }
  return `<defs>${defs.join('')}</defs><g class="net-field-layer" pointer-events="none">${out}</g>`;
 }
}
