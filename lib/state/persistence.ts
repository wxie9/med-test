import {validatePspEvidenceLinks} from '@/lib/psp/evidenceValidation';
import {validatePspMetricEvidenceLinks} from '@/lib/psp/metricEvidenceValidation';
import {validatePspServiceLinks} from '@/lib/psp/serviceValidation';
import { z } from 'zod';
import type { DemoStore } from './store';
import { Patient, Alert, FollowUpTask, Cohort, ResearchSnapshot, CandidateRequest, DataGapTask, PatientMessage } from '@/lib/domain/types';
import { PspState, validatePspState, validatePspClinicalLinks } from '@/lib/psp/types';
import {validatePspSnapshots} from '@/lib/psp/snapshotValidation';
import {validatePspReports} from '@/lib/psp/reportValidation';
/** Reject unknown fields throughout persisted clinical objects rather than silently dropping them. */
function strict(schema:z.ZodTypeAny):z.ZodTypeAny {
 if(schema instanceof z.ZodObject)return z.object(Object.fromEntries(Object.entries(schema.shape).map(([k,v])=>[k,strict(v as z.ZodTypeAny)]))).strict();
 if(schema instanceof z.ZodArray)return z.array(strict(schema.element));
 if(schema instanceof z.ZodOptional)return strict(schema.unwrap()).optional();
 if(schema instanceof z.ZodNullable)return strict(schema.unwrap()).nullable();
 return schema;
}
const payload=z.object({version:z.literal(2),store:z.object({
 patients:z.array(strict(Patient)),alerts:z.array(strict(Alert)),tasks:z.array(strict(FollowUpTask)),cohorts:z.array(strict(Cohort)),snapshots:z.array(strict(ResearchSnapshot)),candidateRequests:z.array(strict(CandidateRequest)),gapTasks:z.array(strict(DataGapTask)),messages:z.array(strict(PatientMessage)),
 manifest:z.object({seed:z.number(),version:z.string(),cutoff:z.string(),checksum:z.string(),counts:z.record(z.number()),violations:z.number().int().nonnegative()}).strict(),agentMode:z.enum(['deterministic','claude','openai']),seedVersion:z.number().int().positive(),psp:PspState,
}).strict()}).strict();
function freezeDeep(value:unknown):void { if(value && typeof value==='object'){for(const v of Object.values(value))freezeDeep(v);Object.freeze(value);} }
export function hydrateImmutableState(store:DemoStore):DemoStore { for(const snapshot of store.snapshots)freezeDeep(snapshot);for(const snapshot of store.psp.snapshots??[])freezeDeep(snapshot);for(const report of store.psp.reportVersions??[])freezeDeep(report);for(const content of store.psp.educationContents)freezeDeep(content);for(const source of store.psp.selfReportRevisions??[])freezeDeep(source);for(const correction of store.psp.corrections??[])freezeDeep(correction);for(const evidence of store.psp.questionnaireEvidence??[])freezeDeep(evidence);for(const cancellation of store.psp.assignmentCancellations??[])freezeDeep(cancellation);return store; }
export async function encodeDemoStore(store:DemoStore):Promise<Uint8Array> {
 const value=payload.parse({version:2,store:{...store,patients:[...store.patients.values()]}});
 validatePspState(value.store.psp);
 validatePspSnapshots(value.store.psp,value.store.seedVersion);
 validatePspReports(value.store.psp,value.store.seedVersion);
 validatePspClinicalLinks(value.store.psp,value.store.patients as import('@/lib/domain/types').Patient[]);
 validatePspServiceLinks({...value.store,patients:new Map((value.store.patients as import('@/lib/domain/types').Patient[]).map(p=>[p.id,p]))} as DemoStore);
 validatePspEvidenceLinks({...value.store,patients:new Map((value.store.patients as import('@/lib/domain/types').Patient[]).map(p=>[p.id,p]))} as DemoStore);
 validatePspMetricEvidenceLinks({...value.store,patients:new Map((value.store.patients as import('@/lib/domain/types').Patient[]).map(p=>[p.id,p]))} as DemoStore);
 const stream=new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('gzip'));
 return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function decodeDemoStore(encoded:Uint8Array):Promise<DemoStore> {
 const stream=new Blob([Uint8Array.from(encoded).buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
 const saved=payload.parse(JSON.parse(await new Response(stream).text()));
 const store={...saved.store,patients:new Map(saved.store.patients.map(p=>[p.id,p]))} as DemoStore;
 validatePspState(store.psp);
 validatePspSnapshots(store.psp,store.seedVersion);
 validatePspReports(store.psp,store.seedVersion);
 validatePspClinicalLinks(store.psp,store.patients.values());
 validatePspServiceLinks(store);validatePspEvidenceLinks(store);validatePspMetricEvidenceLinks(store);
 if(store.patients.size!==saved.store.patients.length)throw new Error('Duplicate persisted patient');
 for(const e of store.psp.enrollments)if(!store.patients.has(e.patientId))throw new Error('Unknown persisted PSP patient');
 return hydrateImmutableState(store);
}
