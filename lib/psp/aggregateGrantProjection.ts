import type {PspState} from './types';

export type AggregateGrantProjectionBoundary={asOf:string;maxSequence:number};
/** Pure calculation view: terminated aggregate grants cannot authorize a new freeze.
 * Original events (including withdrawals and service history) remain in the ledger.
 * The freeze boundary, rather than metric cutoff or current time, fixes selection.
 */
export function resolveAggregateGrantProjection(state:PspState,{asOf,maxSequence}:AggregateGrantProjectionBoundary):PspState {
 const at=Date.parse(asOf);
 if(!Number.isFinite(at)||!Number.isInteger(maxSequence)||maxSequence<0||maxSequence>state.ledgerRevision)throw new Error('Invalid aggregate grant projection boundary');
 const visible=state.permissionEvents.filter(e=>e.scope==='aggregate'&&e.sequence<=maxSequence&&Date.parse(e.occurredAt)<=at&&Date.parse(e.recordedAt)<=at);
 const terminated=new Set(visible.filter(e=>e.action==='grant'&&visible.some(w=>w.enrollmentId===e.enrollmentId&&w.action==='withdraw'&&(Date.parse(w.occurredAt)>Date.parse(e.occurredAt)||Date.parse(w.occurredAt)===Date.parse(e.occurredAt)&&w.sequence>e.sequence))).map(e=>e.id));
 return {...state,permissionEvents:state.permissionEvents.filter(e=>!terminated.has(e.id))};
}
