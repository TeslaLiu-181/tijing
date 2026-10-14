const keys=['min','max','step'];

/** Control preferences only; never validate or change the parameter's value. */
export function validateParameterSlider(config){
 if(config===undefined)return;
 if(!config||typeof config!=='object'||Array.isArray(config)||Object.keys(config).length!==3||Object.keys(config).some(key=>!keys.includes(key))||keys.some(key=>!Number.isFinite(config[key])))throw Error('滑杆配置只接受有限数值 min、max、step。');
 const span=config.max-config.min;
 if(!Number.isFinite(span)||span<=0)throw Error('滑杆最大值须大于最小值。');
 if(config.step<=0||config.step>span||!Number.isFinite(span/config.step)||config.min+config.step===config.min||config.max-config.step===config.max)throw Error('滑杆步长须为可表示的正数，且不大于范围。');
}

/** Fixed bounds never expand or clip data; an unmatched value needs an explicit action. */
export function resolveParameterSlider(parameter){
 const value=parameter.value;
 if(parameter.slider===undefined){
  const span=Math.max(5,Math.abs(value)*3),finite=Number.isFinite(span),min=finite?Math.min(-span,value):Math.min(0,value),max=finite?Math.max(span,value):Math.max(0,value);
  return {min,max,step:'any',configured:false,representable:true,reason:'',nearest:value,lastTick:max};
 }
 validateParameterSlider(parameter.slider);
 const {min,max,step}=parameter.slider,scale=Math.max(Math.abs(min),Math.abs(max),Math.abs(step),Math.abs(value),Number.MIN_VALUE),tolerance=16*Number.EPSILON*scale;
 const count=Math.floor((max-min+tolerance)/step),lastTick=Math.min(max,min+count*step),index=Math.max(0,Math.min(count,Math.round((value-min)/step))),nearest=Math.min(max,Math.max(min,min+index*step));
 const inside=value>=min-tolerance&&value<=max+tolerance,integerGrid=Number.isInteger(min)&&Number.isInteger(step),onStep=(!integerGrid||Number.isInteger(value))&&Math.abs(value-nearest)<=tolerance,representable=inside&&onStep;
 const reason=representable?'':!inside?'当前值 '+value+' 超出滑杆范围 '+min+'–'+max+'；精确输入仍保留。':'当前值 '+value+' 不在步长 '+step+' 的刻度上；精确输入仍保留。';
 return {min,max,step,configured:true,representable,reason,nearest,lastTick};
}
