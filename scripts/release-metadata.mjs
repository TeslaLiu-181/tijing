import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';

// Source ZIPs intentionally omit .git. Never accidentally report the Git
// revision of a containing, unrelated checkout when building such a ZIP.
export function sourceMetadata(){
  const provenance=JSON.parse(readFileSync('PROVENANCE.json','utf8'));
  const result={upstreamCommit:provenance.upstream.commit,distributionRevision:provenance.distributionRevision,sourceBranch:null,sourceCommit:null,sourceState:'source-export'};
  if(!existsSync(resolve('.git')))return result;
  const git=args=>execFileSync('git',args,{encoding:'utf8'}).trim();
  const dirty=git(['status','--porcelain']);
  return {...result,sourceBranch:git(['branch','--show-current']),sourceCommit:dirty?null:git(['rev-parse','HEAD']),sourceState:dirty?'working-copy':'committed'};
}
