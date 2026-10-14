let opening;const knownAssets=new Set();
function database(){if(!opening)opening=new Promise((resolve,reject)=>{const request=indexedDB.open('particle-exam-workbench',2);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('drafts'))request.result.createObjectStore('drafts',{keyPath:'id'});if(!request.result.objectStoreNames.contains('assets'))request.result.createObjectStore('assets',{keyPath:'key'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});return opening;}
function read(db,store,key){return new Promise((resolve,reject)=>{const request=db.transaction(store).objectStore(store).get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
export async function readDraft(id){
 const db=await database(),paper=await read(db,'drafts',id);if(!paper)return paper;
 for(const asset of Object.values(paper.assets)){const key=id+':'+asset.id;if(!asset.url){const stored=await read(db,'assets',key);if(stored)asset.url=stored.url;}if(asset.url)knownAssets.add(key);}
 return paper;
}
export async function saveDraft(paper){
 const db=await database(),copy=structuredClone(paper),writes=[];
 for(const asset of Object.values(copy.assets)){if(!asset.url)continue;const key=paper.id+':'+asset.id;if(!knownAssets.has(key))writes.push({key,url:asset.url});delete asset.url;}
 // Images are immutable resources. Write them once; normal playback only
 // updates the much smaller question/scene metadata.
 return new Promise((resolve,reject)=>{const tx=db.transaction(['drafts','assets'],'readwrite');for(const asset of writes)tx.objectStore('assets').put(asset);tx.objectStore('drafts').put(copy);tx.oncomplete=()=>{for(const asset of writes)knownAssets.add(asset.key);resolve();};tx.onerror=()=>reject(tx.error);});
}
