import {supplementalLessons,supplementSnapshot} from '../../src/supplement/catalog.mjs';
export function supplementScenes(){const builtAt=new Date().toISOString();return supplementalLessons.map(lesson=>{
 const [,paper,question]=lesson.id.match(/^h(\d+)-(\d+)$/),snapshot=supplementSnapshot(lesson.id);
 return {paper:Number(paper),question:Number(question),assumptions:[lesson.notice],guidance:lesson.guide,record:{id:'holiday-'+paper+'-'+question+'-supplement',title:lesson.title+' · 补充',kind:'supplement',snapshot,baseline:structuredClone(snapshot),status:'ready',part:'',createdAt:builtAt,updatedAt:builtAt}};
});}
