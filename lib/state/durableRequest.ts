export type DurableRequestDependencies<State,Args extends unknown[]> = {
 read:()=>Promise<Uint8Array|undefined>;
 write:(value:Uint8Array)=>Promise<void>;
 getState:()=>State|undefined;
 setState:(value:State|undefined)=>void;
 encode:(state:State)=>Promise<Uint8Array>;
 decode:(saved:Uint8Array)=>Promise<State>;
 handle:(...args:Args)=>Promise<Response>;
 maxBytes?:number;
};
/** Call inside the coordinator's sequential lock. The durable value is authoritative. */
export function createDurableRequest<State,Args extends unknown[]>(deps:DurableRequestDependencies<State,Args>):(...args:Args)=>Promise<Response>{
 let recoveryPending=false;
 const unavailable=()=>Response.json({error:recoveryPending?'Durable state recovery pending':'Demo persistence unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
 const install=async(saved:Uint8Array|undefined)=>deps.setState(saved===undefined?undefined:await deps.decode(saved));
 const recover=async()=>{
  try {await install(await deps.read());recoveryPending=false;return true;}
  catch {recoveryPending=true;deps.setState(undefined);return false;}
 };
 return async(...args:Args)=>{
  let prior:Uint8Array|undefined;
  // Reload even on GET: state reads can escalate clinical alerts, and another coordinator
  // instance may have replaced the shared global container between requests.
  try {prior=await deps.read();await install(prior);recoveryPending=false;}
  catch {recoveryPending=true;deps.setState(undefined);return unavailable();}
  const rollback=async()=>{try{await install(prior);}catch{recoveryPending=true;deps.setState(undefined);}};
  let response:Response;
  try {response=await deps.handle(...args);}catch{await rollback();return unavailable();}
  if(response.status>=500){await rollback();return recoveryPending?unavailable():response;}
  const current=deps.getState();
  if(current===undefined)return response;
  let encoded:Uint8Array;
  try {encoded=await deps.encode(current);if(encoded.byteLength>(deps.maxBytes??2*1024*1024-1024))throw new Error('Demo state too large');}
  catch {await rollback();return unavailable();}
  try {await deps.write(encoded);}catch{await recover();return unavailable();}
  return response;
 };
}
