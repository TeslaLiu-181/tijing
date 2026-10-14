const drawing=['color','strokeWidth','dash','opacity'],marker=['color','strokeWidth','opacity','pointSize'];
export const objectStyleDashArrays={solid:'',dashed:'7 5',dotted:'2 4'};
const properties={point:marker,line:drawing,circle:drawing,polygon:drawing,ruler:drawing,angle:drawing,field:drawing,electric:drawing,particle:[...drawing,'pointSize'],source:[...drawing,'pointSize'],label:['color','opacity']};
const defaults={point:{color:'#577d91',strokeWidth:1.7,pointSize:5},line:{color:'#81929c',strokeWidth:1.3,dash:'dashed'},circle:{color:'#7c8b94',strokeWidth:1.2,dash:'dashed'},polygon:{color:'#799a8a',strokeWidth:1.3},ruler:{color:'#161616',strokeWidth:1.5,dash:'dashed'},angle:{color:'#555555',strokeWidth:1.3,dash:'dashed'},field:{color:'#171717',strokeWidth:1.6},electric:{color:'#b3833d',strokeWidth:1.6,dash:'dashed'},particle:{color:'#356979',strokeWidth:1.6,pointSize:3.5},source:{color:'#171717',strokeWidth:1.6,pointSize:3.5},label:{color:'#171717'}};
export function objectStyleKeys(object){return [...(properties[typeof object==='string'?object:object?.kind]||[])];}
/** Representative defaults for the settings preview, not forced renderer state. */
export function objectStyleDefaults(object){const base=defaults[typeof object==='string'?object:object?.kind];return base?{dash:'solid',opacity:1,...base}:{};}
export function validateObjectStyle(object,style){
 if(style===undefined)return;
 const allowed=objectStyleKeys(object);if(!allowed.length)throw Error('这个对象不支持独立样式。');
 if(!style||typeof style!=='object'||Array.isArray(style)||Object.keys(style).some(key=>!allowed.includes(key)))throw Error('对象样式含有不适用的属性。');
 if(style.color!==undefined&&(typeof style.color!=='string'||!/^#[0-9a-fA-F]{6}$/.test(style.color)))throw Error('颜色须为6位十六进制色值。');
 for(const [key,min,max] of [['strokeWidth',.5,8],['opacity',0,1],['pointSize',1,18]])if(style[key]!==undefined&&(!Number.isFinite(style[key])||style[key]<min||style[key]>max))throw Error(({strokeWidth:'线宽',opacity:'透明度',pointSize:'点半径'})[key]+'超出允许范围。');
 if(style.dash!==undefined&&!Object.hasOwn(objectStyleDashArrays,style.dash))throw Error('线型须为实线、虚线或点线。');
}
/** Partial overrides preserve selected/disabled defaults and existing opacity factors. */
export function objectStyleOverrides(object,{ink=false}={}){
 validateObjectStyle(object,object.style);const style={...object.style};if(style.color)style.color=ink?'#171717':style.color.toLowerCase();if(style.dash!==undefined)style.dashArray=objectStyleDashArrays[style.dash];return style;
}
