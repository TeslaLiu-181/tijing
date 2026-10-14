import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

// The standalone scene and exported workbooks use the same embedded fonts.
// MathLive receives fontsDirectory:null, so no CDN or network font is needed.
export function mathliveFontCSS(){
  const base=resolve('node_modules/mathlive');
  return readFileSync(resolve(base,'mathlive-fonts.css'),'utf8').replace(/url\(([^)]+\.woff2)\)/g,(_all,file)=>'url(data:font/woff2;base64,'+readFileSync(resolve(base,file)).toString('base64')+')');
}

export function inlineMathlivePlugin(){
  const sourcePath=resolve('node_modules/mathlive/mathlive.mjs');
  return {name:'mathlive-inline-source',setup(build){
    build.onResolve({filter:/^mathlive$/},()=>({path:sourcePath}));
    build.onLoad({filter:/[\\/]mathlive[\\/]mathlive\.mjs$/},()=>{
      const source=readFileSync(sourcePath,'utf8');
      // MathLive 0.111 infers an external script URL from Error.stack during
      // module evaluation. Inline and srcdoc builds have no such script file.
      // All fonts are embedded and sound loading is disabled in our editor.
      const pattern=/var gScriptUrl = [^\n]*\|\| getFileUrl\(\);/;
      if(!pattern.test(source))throw Error('MathLive内嵌资源定位规则需要随版本更新。');
      return {contents:source.replace(pattern,'var gScriptUrl = globalThis.document?.currentScript?.src || globalThis.location?.href || "about:blank";'),loader:'js'};
    });
  }};
}
