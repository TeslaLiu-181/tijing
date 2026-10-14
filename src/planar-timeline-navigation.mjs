import {extractTimelineEvents} from './planar-timeline-events.mjs';
const roundtripULP=(a,b)=>8*Number.EPSILON*Math.max(Math.abs(a),Math.abs(b),Number.MIN_VALUE);
function sameNumericalRoot(event,cursor){
 if(event.method!=='native-numerical'||cursor.method!=='native-numerical'||event.traceId!==cursor.traceId||event.kind!==cursor.kind||event.component!==cursor.component||event.segmentIndex!==cursor.segmentIndex)return false;
 const a=event.toleranceUs,b=cursor.toleranceUs;
 return Number.isFinite(a)&&a>=0&&Number.isFinite(b)&&b>=0&&Math.abs(event.timeUs-cursor.timeUs)<=a+b+roundtripULP(event.timeUs,cursor.timeUs);
}

/** Navigate native events without advancing the physical query time by epsilon.
 * The host clears afterEvent whenever scene/traces change; a seek away
 * from the selected timestamp makes the cursor inapplicable.
 * Numerical deduplication is only for the selected root's original component
 * and segment, using its two reported precision bounds, never other events.
 */
export function findNextTimelineEvent({scene,traces,durationUs=scene?.duration||0,timeUs=0,traceId=null,velocityComponents=['x','y'],afterEvent=null,accept=()=>true,maxVelocityRoots=80}={}){
 const cursor=afterEvent&&Number.isFinite(afterEvent.timeUs)&&Math.abs(afterEvent.timeUs-timeUs)<=roundtripULP(afterEvent.timeUs,timeUs)?afterEvent:null;
 // A selected native timestamp is canonical. This only removes the few ULPs
 // of a microsecond/second round-trip; no time interval is skipped.
 const current=cursor?cursor.timeUs:timeUs;
 const found=extractTimelineEvents({scene,traces,durationUs,rangeUs:{start:current,end:durationUs},velocityTraceIds:traceId?[traceId]:null,velocityComponents,maxVelocityRoots});
 return found.events.find(event=>event.timeUs>current&&(!traceId||event.traceId===traceId)&&accept(event)&&(!cursor||!sameNumericalRoot(event,cursor)))||null;
}
