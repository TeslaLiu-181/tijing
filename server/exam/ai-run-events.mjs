const terminal=new Set(['completed','failed','cancelled','interrupted','applied']);

export function phaseActivity(events,{status,phase,stamp=new Date().toISOString()}) {
  const next=structuredClone(events||[]),last=next.findLast(item=>item.type==='phase');
  if(last?.title===phase&&!terminal.has(status))return next;
  if(last&&last.status==='running'){last.status=status==='failed'?'failed':status==='cancelled'||status==='interrupted'?'cancelled':'completed';last.completedAt=stamp;}
  if(!terminal.has(status))next.push({id:'phase-'+next.length,type:'phase',title:phase,status:'running',startedAt:stamp});
  return next;
}

export function toolActivity(events,event) {
  const type=event.type==='model'?'model':'tool',next=structuredClone(events||[]),index=next.findIndex(item=>item.type===type&&item.id===event.id);
  const clean={id:String(event.id),type,name:event.name,title:event.title,status:event.status,startedAt:event.startedAt,
    ...(event.completedAt?{completedAt:event.completedAt}:{}),...(event.input!==undefined?{input:event.input}:{}),...(event.output!==undefined?{output:event.output}:{})};
  if(index<0)next.push(clean);else next[index]=clean;
  return next;
}

// Reopen old jobs with their original evidence; a service interruption must not
// leave a spinner on a tool that can no longer be running.
export function publicActivity(row) {
  const events=JSON.parse(row.events_json||'[]');
  if(terminal.has(row.status))for(const event of events)if(event.status==='running'){
    event.status=['completed','applied'].includes(row.status)?'completed':row.status==='failed'?'failed':'cancelled';
    event.completedAt=row.updated_at;
  }
  return events;
}
