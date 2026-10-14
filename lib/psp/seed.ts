import { createHash } from 'node:crypto';
import { readDemoFile } from '@/lib/runtime/files';
import type { Patient } from '@/lib/domain/types';
import { validatePspState, type PspState } from './types';
export { validatePspState } from './types';
export function canonicalJson(value:unknown):string { if(Array.isArray(value))return `[${value.map(canonicalJson).join(',')}]`; if(value!==null && typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonicalJson((value as Record<string,unknown>)[k])}`).join(',')}}`; return JSON.stringify(value); }
export function loadPspSeed(patients:Map<string,Patient>):PspState {
 const state=validatePspState(JSON.parse(readDemoFile('data/seed/psp.json')));
 const manifest=JSON.parse(readDemoFile('data/seed/psp-manifest.json')) as {version:string;checksum:string};
 const {checksum,...body}=state;
 if(createHash('sha256').update(canonicalJson(body)).digest('hex')!==checksum || manifest.checksum!==checksum || manifest.version!==state.fixtureVersion)throw new Error('PSP seed checksum mismatch');
 for(const e of state.enrollments)if(!patients.has(e.patientId))throw new Error(`Unknown PSP patient ${e.patientId}`);
 return state;
}
