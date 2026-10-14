import {validatePspServiceLinks} from '@/lib/psp/serviceValidation';
import { z } from 'zod';
import type { DemoStore } from './store';
import { Patient, Alert, FollowUpTask, Cohort, ResearchSnapshot, CandidateRequest, DataGapTask, PatientMessage } from '@/lib/domain/types';
import { PspState, validatePspState, validatePspClinicalLinks } from '@/lib/psp/types';
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
export function hydrateImmutableState(store:DemoStore):DemoStore { for(const snapshot of store.snapshots)freezeDeep(snapshot);for(const content of store.psp.educationContents)freezeDeep(content);return store; }
export async function encodeDemoStore(store:DemoStore):Promise<Uint8Array> {
 const value=payload.parse({version:2,store:{...store,patients:[...store.patients.values()]}});
 validatePspState(value.store.psp);
 validatePspClinicalLinks(value.store.psp,value.store.patients as import('@/lib/domain/types').Patient[]);
 validatePspServiceLinks({...value.store,patients:new Map((value.store.patients as import('@/lib/domain/types').Patient[]).map(p=>[p.id,p]))} as DemoStore);
 const stream=new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('gzip'));
 return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function decodeDemoStore(encoded:Uint8Array):Promise<DemoStore> {
 const stream=new Blob([Uint8Array.from(encoded).buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
 const saved=payload.parse(JSON.parse(await new Response(stream).text()));
 const store={...saved.store,patients:new Map(saved.store.patients.map(p=>[p.id,p]))} as DemoStore;
 validatePspState(store.psp);
 validatePspClinicalLinks(store.psp,store.patients.values());
 validatePspServiceLinks(store);
 if(store.patients.size!==saved.store.patients.length)throw new Error('Duplicate persisted patient');
 for(const e of store.psp.enrollments)if(!store.patients.has(e.patientId))throw new Error('Unknown persisted PSP patient');
 return hydrateImmutableState(store);
}
