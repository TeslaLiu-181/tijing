import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createExamServer} from './http.mjs';
import {configuration} from './config.mjs';
export {configuration} from './config.mjs';

export async function start(env = process.env) {
  process.umask(0o077);
  const options = configuration(env), application = await createExamServer(options);
  try { await new Promise((resolve, reject) => { application.server.once('error', reject); application.server.listen(options.port, options.host, resolve); }); }
  catch (error) { await application.close(); throw error; }
  console.log('题景学习空间已启动：' + options.publicOrigin);
  let shuttingDown = false;
  const stop = async () => { if (shuttingDown) return; shuttingDown = true; await application.close(); };
  process.once('SIGINT', () => stop().then(() => process.exit(0)));
  process.once('SIGTERM', () => stop().then(() => process.exit(0)));
  return application;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) start().catch(error => { console.error(error.message); process.exitCode = 1; });
