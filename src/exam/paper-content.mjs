import {assertData} from './model.mjs';

const assetView=asset=>{if(!asset||typeof asset!=='object')return;delete asset.url;delete asset.displayURL;};
function stable(value){
 if(Array.isArray(value))return value.map(stable);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,stable(value[key])]));
 return value;
}
export function paperContentKey(paper){
 assertData(paper);const content=structuredClone(paper);
 // These are saved observations/navigation, not teaching or physical content.
 delete content.activeQuestionId;delete content.revision;delete content.updatedAt;
 for(const question of content.questions||[]){
  delete question.activeSceneId;delete question.updatedAt;
  for(const scene of question.scenes||[]){
   delete scene.updatedAt;
   for(const snapshot of [scene.snapshot,scene.baseline])if(snapshot){
    delete snapshot.context;
    // Label offsets and free-parameter slider settings are control preferences.
    // Geometry coordinates, label text and
    // every physical/dependency field remain part of the content identity.
    if(scene.kind==='planar')for(const object of snapshot.scene?.objects||[]){delete object.labelOffset;if(object.kind==='parameter')delete object.slider;}
   }
  }
  for(const asset of question.attachments||[])assetView(asset);
 }
 for(const asset of Object.values(content.assets||{}))assetView(asset);
 for(const source of content.sources||[])assetView(source.asset);
 // Keep array order, source text, notes/review/status, baselines and asset identity.
 return JSON.stringify(stable(content));
}
