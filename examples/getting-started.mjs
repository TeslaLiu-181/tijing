import {newPaper,newQuestion,newScene,validatePaper} from '../src/exam/model.mjs';

// Original public onboarding tasks. No teacher manuscript, account, attachment,
// answer key or live API configuration is included in this example.
export function createGettingStartedPaper(){
  const paper=newPaper('题景入门 · 从观察到建模');
  const stamp='2026-10-14T00:00:00.000Z';
  paper.id='exam-tijing-getting-started';paper.createdAt=paper.updatedAt=stamp;
  const tasks=[
    ['磁场中的轨迹','使用圆形有界磁场的演示参数。先观察粒子进入、运动和离开磁场的过程；再单独改变磁场强弱，比较轨道弯曲程度。所有数值均为演示设定，请在参数面板中读取。','base:circle'],
    ['电场中的偏转','使用电场加速与偏转模板，比较粒子运动方向和电场方向。一次只改变一个条件，并用自己的语言说明变化。数值用于展示模型关系，不代表一份外部试题的已知条件。','base:electric-deflection'],
    ['选择合适的速度','使用速度选择器模板，观察电场力与磁场力的方向；尝试找到直线通过的条件，再改变初速度比较偏转。先作出预测，再操作演示验证。','base:velocity-selector']
  ];
  paper.questions=tasks.map(([title,text,key],index)=>{
    const question=newQuestion(title,text),scene=newScene('演示场景',key);
    question.id='demo-question-'+(index+1);question.createdAt=stamp;
    scene.id='demo-scene-'+(index+1);scene.createdAt=scene.updatedAt=stamp;
    question.scenes=[scene];question.activeSceneId=scene.id;
    question.notes=[{kind:'demonstration',text:'本任务为开源入门示例；参数与图形来自通用演示模板，没有附带原始教材或学生资料。'}];
    return question;
  });
  paper.activeQuestionId=paper.questions[0].id;
  return validatePaper(paper,{portable:true});
}
