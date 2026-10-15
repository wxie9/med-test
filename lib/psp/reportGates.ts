import type {PspState} from './types';
import type {PspReportVersion} from './reportTypes';
import {snapshotAggregateUsability} from './snapshotAuthorization';
export type ReportAuthorizationGate={status:'eligible'|'blocked'|'revoked';reason:string|null};
export function reportAuthorizationGate(report:PspReportVersion,state:PspState,at:string):ReportAuthorizationGate{
 const snapshot=state.snapshots?.find(s=>s.id===report.snapshotId),delivered=(state.reportActions??[]).some(e=>e.reportVersionId===report.id&&e.action==='deliver');
 const source=snapshot?snapshotAggregateUsability(snapshot,state,at):{usable:false,reason:'快照来源不可用'};
 return source.usable?{status:'eligible',reason:null}:{status:delivered?'revoked':'blocked',reason:source.reason};
}
