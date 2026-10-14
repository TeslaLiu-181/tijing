import {build} from 'esbuild';
import {readFile,writeFile,mkdir,cp,rename,access} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {createRequire} from 'node:module';
import {releaseNotes,validateReleaseNotes} from './check-release-notes.mjs';
import {sourceMetadata} from './release-metadata.mjs';
validateReleaseNotes(releaseNotes);
const version=releaseNotes[0].version;

const root=resolve('.'),arg=process.argv.find(a=>a.startsWith('--out=')),out=resolve(arg?arg.slice(6):'dist/exam-portable'),require=createRequire(import.meta.url);
if(process.platform!=='win32'||process.arch!=='x64')throw Error('此打包脚本用于 Windows x64');
let exists=false;try{await access(out);exists=true;}catch(error){if(error.code!=='ENOENT')throw error;}
if(exists)throw Error('输出目录已存在，请使用新的 --out 路径，保留已有版本：'+out);
await access(join(root,'dist/exam/app.js'));await access(join(root,'dist/exam/sample.tijingexam'));
const executable=require('electron'),runtime=dirname(executable);
await cp(runtime,out,{recursive:true});await rename(join(out,'electron.exe'),join(out,'试卷工作台.exe'));
const application=join(out,'resources/app');await mkdir(join(application,'desktop/exam'),{recursive:true});
await build({entryPoints:['desktop/exam/main.mjs'],outfile:join(application,'desktop/exam/main.mjs'),bundle:true,platform:'node',format:'esm',target:'node24',external:['electron','sharp','fflate','@xmldom/xmldom']});
await cp('desktop/exam/preload.cjs',join(application,'desktop/exam/preload.cjs'));
await cp('dist/exam',join(application,'dist/exam'),{recursive:true,filter:path=>!path.endsWith('sample-report.json')&&!path.endsWith('专题强化6整卷可视化.html')});
await writeFile(join(application,'package.json'),JSON.stringify({name:'tijing-desktop',productName:'题景试卷工作台',version,private:true,type:'module',main:'desktop/exam/main.mjs',license:'MIT'},null,2));
const packages=new Map();
async function copyPackage(name){
 if(packages.has(name))return;const source=join(root,'node_modules',name),metadata=JSON.parse(await readFile(join(source,'package.json'),'utf8'));
 packages.set(name,metadata.version);await cp(source,join(application,'node_modules',name),{recursive:true});
 for(const dependency of Object.keys(metadata.dependencies||{}))await copyPackage(dependency);
 // Only the native addon for this package's target platform is required.
 if(name==='sharp')await copyPackage('@img/sharp-win32-x64');
}
for(const name of ['sharp','fflate','@xmldom/xmldom'])await copyPackage(name);
await cp('docs/USER_GUIDE.md',join(out,'使用说明.md'));
await cp('LICENSE',join(out,'LICENSE'));
await cp('ASSET_LICENSES.md',join(out,'ASSET_LICENSES.md'));
await cp('THIRD_PARTY_NOTICES.md',join(out,'THIRD_PARTY_NOTICES.md'));
await cp('docs/licenses',join(out,'licenses'),{recursive:true});
await writeFile(join(out,'build-manifest.json'),JSON.stringify({product:'题景试卷工作台',version,...sourceMetadata(),platform:'win32-x64',electron:JSON.parse(await readFile('node_modules/electron/package.json','utf8')).version,packages:Object.fromEntries(packages)},null,2));
console.log(JSON.stringify({output:out,executable:join(out,'试卷工作台.exe'),packages:Object.fromEntries(packages)}));
