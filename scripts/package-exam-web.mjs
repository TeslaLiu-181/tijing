import {build} from 'esbuild';
import {readFile, writeFile, cp, copyFile, mkdir, access, readdir, chmod} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {releaseNotes, validateReleaseNotes} from './check-release-notes.mjs';
import {sourceMetadata} from './release-metadata.mjs';

validateReleaseNotes(releaseNotes);
const version = releaseNotes[0].version;

const arg = process.argv.find(value => value.startsWith('--out=')), out = resolve(arg ? arg.slice(6) : 'dist/student-web-package');
let exists = false; try { await access(out); exists = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (exists) throw Error('输出目录已存在，请选择新的路径以保留已有版本：' + out);
await access('dist/exam/web.html'); await access('dist/exam/sample.tijingexam');
await mkdir(join(out, 'server/exam'), {recursive: true});
// Workers resolve relative to the bundled entry point and must ship beside it.
for (const name of ['main', 'setup', 'ai-harness-worker', 'ai-agent-worker', 'ai-docx-worker', 'check-runtime']) await build({entryPoints: ['server/exam/' + name + '.mjs'], outfile: join(out, 'server/exam/' + name + '.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node24', legalComments: 'inline', external: ['fflate', 'sharp', '@xmldom/xmldom']});
await cp('dist/exam', join(out, 'dist/exam'), {recursive: true, preserveTimestamps: true, filter: path => !path.endsWith('sample-report.json') && !path.endsWith('专题强化6整卷可视化.html')});
for (const [source, target] of [['server/exam/.env.example', '.env.example'], ['server/exam/start.cmd', '启动学习空间.cmd'], ['server/exam/start.sh', 'start.sh'], ['server/exam/tijing.service', 'tijing.service'],
  ['docs/DEPLOYMENT.md','DEPLOYMENT.md'],['docs/USER_GUIDE.md','USER_GUIDE.md'],
  ['LICENSE','LICENSE'],['ASSET_LICENSES.md','ASSET_LICENSES.md'],['THIRD_PARTY_NOTICES.md','THIRD_PARTY_NOTICES.md'],['PROVENANCE.json','PROVENANCE.json']]) {
  // Windows checkouts may use CRLF; Linux entry points need LF line endings.
  if (target === 'start.sh' || target === 'tijing.service') await writeFile(join(out, target), (await readFile(source, 'utf8')).replace(/\r\n/g, '\n'));
  else await copyFile(source, join(out, target));
}
await copyFile('src/exam/release-notes.json', join(out, 'release-notes.json'));
await writeFile(join(out, 'package.json'), JSON.stringify({name: 'tijing-student-workspace', version, private: true, type: 'module', license:'MIT', engines: {node: '>=24.14 <25'},
  scripts: {start: 'node --env-file-if-exists=.env server/exam/main.mjs', setup: 'node --env-file-if-exists=.env server/exam/setup.mjs', 'check:runtime': 'node server/exam/check-runtime.mjs'}, dependencies: {'@xmldom/xmldom': '0.9.12', fflate: '0.8.3', sharp: '0.35.4'}}, null, 2));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
if (process.platform === 'win32') execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm install --package-lock-only --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org'], {cwd: out, stdio: 'inherit'});
else execFileSync(npm, ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org'], {cwd: out, stdio: 'inherit'});
// The archive contains public code/assets only. Give a separate service user
// read/traverse access even when a source checkout was built with umask 077.
// Runtime .env and user data are deliberately outside this packaging step.
async function normalizePublicModes(directory){
  await chmod(directory,0o755);
  for(const item of await readdir(directory,{withFileTypes:true})){
    const path=join(directory,item.name);
    if(item.isDirectory())await normalizePublicModes(path);
    else await chmod(path,item.name==='start.sh'?0o755:0o644);
  }
}
await cp('docs/licenses',join(out,'licenses'),{recursive:true});
await normalizePublicModes(out);
async function inventory(directory, prefix = '') {
  const files = [];
  for (const item of await readdir(directory, {withFileTypes: true})) {
    const name = prefix + item.name, path = join(directory, item.name);
    if (item.isDirectory()) files.push(...await inventory(path, name + '/'));
    else { const bytes = await readFile(path); files.push({path: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')}); }
  }
  return files;
}
const files = await inventory(out), source = sourceMetadata();
await writeFile(join(out, 'build-manifest.json'), JSON.stringify({product: '题景学生网页学习空间', version, builtAt: new Date().toISOString(), nodeTested: process.versions.node,
  ...source, runtimeDependencies: ['@xmldom/xmldom', 'fflate', 'sharp'], systemDependencies: {pdf: ['pdfinfo','pdftotext','pdftoppm'], legacyDoc: ['antiword']}, totalBytes: files.reduce((n, file) => n + file.bytes, 0), files}, null, 2));
await chmod(join(out,'build-manifest.json'),0o644);
console.log(JSON.stringify({output: out, megabytes: Math.round(files.reduce((n, file) => n + file.bytes, 0) / 1024 / 1024 * 10) / 10, files: files.length}));
