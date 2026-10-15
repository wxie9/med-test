import {createHash} from 'node:crypto';
import type {PspState} from './types';
import {PspReportVersionSchema,type PspReportVersion} from './reportTypes';
import {renderReportContent,normalizeReportActions} from './reportTemplate';
export const reportCanonical=(value:unknown):string=>{if(Array.isArray(value))return `[${value.map(reportCanonical).join(',')}]`;if(value!==null&&typeof value==='object')return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${reportCanonical(v)}`).join(',')}}`;return JSON.stringify(value);};
export const reportDigest=(value:unknown)=>createHash('sha256').update(reportCanonical(value)).digest('hex');
export const reportBatchId=(projectId:string,window:{periodStart:string;periodEnd:string})=>`psp-report-batch:${reportDigest({projectId,periodStart:new Date(window.periodStart).toISOString(),periodEnd:new Date(window.periodEnd).toISOString()})}`;
/** Explicit digest domain: mutable workflow, version, actor, creation and receipts excluded. */
export function reportContentDigest(report:Pick<PspReportVersion,'projectId'|'seedVersion'|'snapshotId'|'snapshotDigest'|'window'|'templateVersion'|'algorithmVersion'|'protectionVersion'|'content'|'factIds'|'nextActions'>):string {
 const {projectId,seedVersion,snapshotId,snapshotDigest,window,templateVersion,algorithmVersion,protectionVersion,content,factIds,nextActions}=report;
 return reportDigest({projectId,seedVersion,snapshotId,snapshotDigest,window,templateVersion,algorithmVersion,protectionVersion,content,factIds,nextActions});
}
const same=(a:unknown,b:unknown)=>reportCanonical(a)===reportCanonical(b);
/** Historical consistency only: never consult current authorization or recompute live metrics. */
export function validatePspReports(state:PspState,seedVersion?:number):void {
 const reports=state.reportVersions??[],byId=new Map(reports.map(r=>[r.id,r]));
 if(byId.size!==reports.length)throw new Error('Duplicate PSP report id');
 if(new Set(reports.map(r=>r.creationLedgerRevision)).size!==reports.length)throw new Error('Duplicate PSP report creation revision');
 const batches=new Map<string,PspReportVersion[]>();
 for(const raw of reports){
  const r=PspReportVersionSchema.parse(raw),snapshot=state.snapshots?.find(s=>s.id===r.snapshotId);
  if(!snapshot||r.projectId!==state.project.id||r.projectId!==snapshot.projectId||r.seedVersion!==snapshot.seedVersion||seedVersion!==undefined&&r.seedVersion!==seedVersion||r.snapshotDigest!==snapshot.contentDigest||!same(r.window,snapshot.window)||r.algorithmVersion!==snapshot.algorithmVersion||r.protectionVersion!==snapshot.protectionVersion||r.createdBy!=='project-manager-psp'||r.creationLedgerRevision<=snapshot.sourceLedgerRevision+1||r.creationLedgerRevision>state.ledgerRevision||Date.parse(r.createdAt)<Date.parse(snapshot.createdAt))throw new Error('Invalid PSP report binding');
  const content=renderReportContent(snapshot,r.nextActions);
  if(!same(r.nextActions,normalizeReportActions(snapshot,r.nextActions))||!same(r.content,content)||!same(r.factIds,content.chapters.flatMap(c=>c.facts.map(f=>f.id)))||reportContentDigest(r)!==r.contentDigest)throw new Error('Invalid PSP report deterministic content');
  if(r.batchId!==reportBatchId(r.projectId,r.window))throw new Error('Invalid PSP report batch');
  const list=batches.get(r.batchId)??[];list.push(r);batches.set(r.batchId,list);
 }
 for(const list of batches.values()){
  list.sort((a,b)=>a.revision-b.revision);
  for(let index=0;index<list.length;index++){
   const r=list[index],parent=index?list[index-1]:undefined;
   if(r.revision!==index+1||r.parentVersionId!==parent?.id||parent&&(parent.seedVersion!==r.seedVersion||parent.creationLedgerRevision>=r.creationLedgerRevision||Date.parse(parent.createdAt)>Date.parse(r.createdAt)))throw new Error('Invalid PSP report revision chain');
  }
 }
 const receiptsByReport=new Map<string,number>();
 for(const receipt of state.commandReceipts){
  let scope:unknown;try{scope=JSON.parse(receipt.scopeKey);}catch{continue;}
  if(!Array.isArray(scope)||scope[2]!=='create_report')continue;
  const result=receipt.result as {data?:PspReportVersion;seedVersion?:number;objectVersion?:number;ledgerRevision?:number}|null;
  const report=result?.data?.id?byId.get(result.data.id):undefined;
  if(!report||!same(result,{data:report,seedVersion:report.seedVersion,objectVersion:report.creationLedgerRevision,ledgerRevision:report.creationLedgerRevision})||scope.length!==5||scope[0]!==report.seedVersion||scope[1]!==report.projectId||scope[3]!==report.createdBy||typeof scope[4]!=='string'||!scope[4]||receipt.id!==`receipt:${receipt.scopeKey}`||receipt.ledgerRevision!==report.creationLedgerRevision||receipt.objectVersion!==report.creationLedgerRevision||receipt.bodyDigest!==reportDigest({snapshotId:report.snapshotId,parentVersionId:report.parentVersionId,nextActions:report.nextActions}))throw new Error('Invalid PSP report receipt');
  receiptsByReport.set(report.id,(receiptsByReport.get(report.id)??0)+1);
 }
 for(const report of reports)if(receiptsByReport.get(report.id)!==1||state.commandReceipts.filter(r=>r.ledgerRevision===report.creationLedgerRevision).length!==1)throw new Error('PSP report creation receipt missing or duplicated');
}
