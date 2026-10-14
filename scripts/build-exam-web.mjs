import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {gzipSync,brotliCompressSync,constants as zlibConstants} from 'node:zlib';
import {readFile, writeFile, copyFile, readdir, appendFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve, join} from 'node:path';
import {inlineMathlivePlugin} from './mathlive-assets.mjs';
import {releaseNotes, validateReleaseNotes} from './check-release-notes.mjs';

validateReleaseNotes(releaseNotes);
execFileSync(process.execPath, ['scripts/build-exam.mjs'], {stdio: 'inherit'});
const out = resolve('dist/exam');
await build({entryPoints: ['src/exam/web-host.mjs'], outfile: join(out, 'web-host.js'), bundle: true, format: 'iife', target: 'chrome120', minify: true,plugins:[inlineMathlivePlugin()]});
await build({entryPoints: ['src/exam/pdf-browser.mjs'], outfile: join(out, 'pdf-browser.js'), bundle: true, format: 'iife', target: 'chrome136', minify: true});
await writeFile(join(out,'web.css'), (await readFile('src/exam/web.css','utf8')) + '\n' + (await readFile('src/exam/web-domains.css','utf8'))+'\n'+(await readFile('src/exam/web-community.css','utf8'))+'\n'+(await readFile('src/exam/web-assignments.css','utf8'))+'\n'+(await readFile('src/exam/web-design.css','utf8'))+'\n'+(await readFile('src/exam/math-composer.css','utf8'))+'\n'+(await readFile('src/exam/web-ai.css','utf8'))+'\n'+(await readFile('src/exam/web-ai-settings.css','utf8'))+'\n'+(await readFile('src/exam/web-ai-dock.css','utf8'))+'\n'+(await readFile('src/exam/web-ai-agent.css','utf8'))+'\n'+(await readFile('src/exam/web-button-icons.css','utf8'))+'\n'+(await readFile('src/exam/workspace-chrome.css','utf8')));
await appendFile(join(out,'web.css'), '\n' + await readFile('src/exam/web-updates.css','utf8'));
await appendFile(join(out,'web.css'), '\n' + await readFile('src/exam/web-account-center.css','utf8'));
const template = await readFile('src/exam/index.html', 'utf8');
const favicon = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#237773"/><path d="M10 8h12v16H10zm3 5h6m-6 4h6" fill="none" stroke="white" stroke-width="1.5"/></svg>');
let html = template.replace('</head>', '<link rel="stylesheet" href="web.css"><link rel="icon" href="' + favicon + '"></head>')
  .replace('<script src="app.js"></script>', '<script src="web-host.js"></script><script src="app.js"></script>')
  .replace('<script src="pdf-host.js"></script>', '');
// Content revisions keep an updated page from mixing a new API with cached web assets.
for (const name of ['app.js', 'web-host.js', 'web.css', 'style.css', 'math.css']) {
  const revision = createHash('sha256').update(await readFile(join(out, name))).digest('hex').slice(0, 12);
  html = html.replaceAll('="' + name + '"', '="' + name + '?v=' + revision + '"');
}
await writeFile(join(out, 'web.html'), html);
// Public static files are immutable within each deployed build. Precompress
// once here, rather than spending CPU compressing them on every phone visit.
let originalBytes=0,compressedBytes=0;
for(const entry of await readdir(out,{withFileTypes:true})){
  if(!entry.isFile()||!/\.(?:html|js|mjs|css)$/.test(entry.name))continue;
  const path=join(out,entry.name),bytes=await readFile(path);if(bytes.length<1024)continue;
  const gzip=gzipSync(bytes,{level:9}),br=brotliCompressSync(bytes,{params:{[zlibConstants.BROTLI_PARAM_QUALITY]:6}});
  await writeFile(path+'.gz',gzip);await writeFile(path+'.br',br);originalBytes+=bytes.length;compressedBytes+=br.length;
}
console.log('Built student web workspace; public text assets '+originalBytes+' bytes, Brotli '+compressedBytes+' bytes');
