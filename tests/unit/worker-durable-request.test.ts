import { expect, test } from 'vitest';
import { createDurableRequest } from '@/lib/state/durableRequest';
function expectUnavailable(response:Response){expect(response.status).toBe(503);expect(response.headers.get('Cache-Control')).toBe('no-store');}
function fixture(){
 let memory:{n:number}|undefined={n:99}, durable:Uint8Array|undefined=new Uint8Array([1]), reads=0, calls=0;
 let readFails=false,putMode:'ok'|'before'|'after'='ok',handlerMode:'ok'|'throw'|'500'='ok',encodingFails=false;
 const run=createDurableRequest({read:async()=>{reads++;if(readFails)throw Error('read');return durable;},write:async(value)=>{if(putMode==='before')throw Error('put');durable=value;if(putMode==='after')throw Error('unknown');},getState:()=>memory,setState:value=>{memory=value;},encode:async value=>{if(encodingFails)throw Error('encode');return new Uint8Array([value.n]);},decode:async value=>({n:value[0]}),handle:async()=>{calls++;memory!.n++;if(handlerMode==='throw')throw Error('handler');return new Response('ok',{status:handlerMode==='500'?500:200});}});
 return {run,memory:()=>memory,durable:()=>durable,calls:()=>calls,reads:()=>reads,set:(options:{readFails?:boolean;putMode?:typeof putMode;handlerMode?:typeof handlerMode;encodingFails?:boolean})=>{if(options.readFails!==undefined)readFails=options.readFails;if(options.putMode)putMode=options.putMode;if(options.handlerMode)handlerMode=options.handlerMode;if(options.encodingFails!==undefined)encodingFails=options.encodingFails;}};
}
test('restores durable before handling and persists before successful response',async()=>{const f=fixture();expect((await f.run()).status).toBe(200);expect(f.memory()?.n).toBe(2);expect(f.durable()?.[0]).toBe(2);expect((await f.run()).status).toBe(200);expect(f.memory()?.n).toBe(3);});
test.each(['throw','500'] as const)('rolls back handler %s',async handlerMode=>{const f=fixture();f.set({handlerMode});const response=await f.run();if(handlerMode==='500')expect(response.status).toBe(500);else expectUnavailable(response);expect(f.memory()?.n).toBe(1);expect(f.durable()?.[0]).toBe(1);});
test('rolls back encoding failure',async()=>{const f=fixture();f.set({encodingFails:true});expectUnavailable(await f.run());expect(f.memory()?.n).toBe(1);});
test.each(['before','after'] as const)('reads actual durable state following ambiguous put %s failure',async putMode=>{const f=fixture();f.set({putMode});expectUnavailable(await f.run());expect(f.memory()?.n).toBe(putMode==='after'?2:1);f.set({putMode:'ok'});expect((await f.run()).status).toBe(200);expect(f.memory()?.n).toBe(putMode==='after'?3:2);});
test('blocks handler when durable recovery fails and resumes only after recovery',async()=>{const f=fixture();f.set({readFails:true});expectUnavailable(await f.run());expect(f.calls()).toBe(0);expect(f.memory()).toBeUndefined();expectUnavailable(await f.run());expect(f.calls()).toBe(0);f.set({readFails:false});expect((await f.run()).status).toBe(200);expect(f.calls()).toBe(1);});

test('unknown put outcome plus failed recovery prevents later handlers until reread succeeds',async()=>{
 let state:{n:number}|undefined={n:0};let durable:Uint8Array=new Uint8Array([1]);let readsFail=false,calls=0,failPut=true;
 const run=createDurableRequest({read:async()=>{if(readsFail)throw Error('offline');return durable;},write:async value=>{durable=value;if(failPut){readsFail=true;throw Error('ambiguous');}},getState:()=>state,setState:value=>{state=value;},encode:async value=>new Uint8Array([value.n]),decode:async value=>({n:value[0]}),handle:async()=>{calls++;state!.n++;return new Response('ok');}});
 expectUnavailable(await run());expect(state).toBeUndefined();expect(calls).toBe(1);expectUnavailable(await run());expect(calls).toBe(1);
 readsFail=false;failPut=false;expect((await run()).status).toBe(200);expect(state?.n).toBe(3);expect(calls).toBe(2);
});
