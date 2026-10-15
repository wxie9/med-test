// @vitest-environment jsdom
import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {usePspState} from '@/lib/client/usePspState';
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status});
const defer=()=>{let resolve!:(value:Response)=>void;const promise=new Promise<Response>(r=>{resolve=r;});return {promise,resolve};};
const identity={role:'project_manager' as const,actorId:'project-manager-psp'};
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('keeps a unique conflict epoch across failed GET and marks it ready only after manual recovery',async()=>{
 let posted=false,recover=false;
 vi.stubGlobal('fetch',(_url:string,options?:RequestInit)=>{if(options?.method==='POST'){posted=true;return Promise.resolve(json({},409));}return Promise.resolve(json({seedVersion:1},posted&&!recover?503:200));});
 const {result}=renderHook(()=>usePspState('A'));await waitFor(()=>expect(result.current.data).not.toBeNull());
 act(()=>result.current.command('/actions',{},identity,1));await waitFor(()=>expect(result.current.busy).toBe(false));
 expect(result.current.conflict).toEqual({id:expect.any(Number),refreshed:false});const id=result.current.conflict!.id;
 recover=true;await act(async()=>{await result.current.refresh();});expect(result.current.conflict).toEqual({id,refreshed:true});
 act(()=>result.current.command('/actions',{},identity,2));expect(result.current.conflict).toBeNull();await waitFor(()=>expect(result.current.busy).toBe(false));
 expect(result.current.conflict?.id).not.toBe(id);expect(result.current.conflict?.refreshed).toBe(true);
});
it('clears conflict metadata when a successful same-URL GET observes a new seed',async()=>{
 let seedVersion=1;
 vi.stubGlobal('fetch',(_url:string,options?:RequestInit)=>Promise.resolve(options?.method==='POST'?json({},409):json({seedVersion})));
 const {result}=renderHook(()=>usePspState('A'));await waitFor(()=>expect(result.current.data).not.toBeNull());
 act(()=>result.current.command('/actions',{},identity,1));await waitFor(()=>expect(result.current.conflict?.refreshed).toBe(true));
 seedVersion=2;await act(async()=>{await result.current.refresh();});expect(result.current.data?.seedVersion).toBe(2);expect(result.current.conflict).toBeNull();
});
it('a GET started before the conflict cannot make the conflict ready or replace current data',async()=>{
 const old=defer(),mandatory=defer();let gets=0;
 vi.stubGlobal('fetch',(_url:string,options?:RequestInit)=>options?.method==='POST'?Promise.resolve(json({},409)):++gets===1?Promise.resolve(json({seedVersion:1,version:1})):gets===2?old.promise:mandatory.promise);
 const {result}=renderHook(()=>usePspState<{seedVersion:number;version:number}>('A'));await waitFor(()=>expect(result.current.data).not.toBeNull());
 act(()=>{void result.current.refresh();});act(()=>result.current.command('/actions',{},identity,1));await waitFor(()=>expect(gets).toBe(3));
 await act(async()=>old.resolve(json({seedVersion:1,version:99})));
 expect(result.current.conflict?.refreshed).toBe(false);expect(result.current.data?.version).toBe(1);
 await act(async()=>mandatory.resolve(json({},503)));expect(result.current.conflict?.refreshed).toBe(false);expect(result.current.busy).toBe(false);
});
it('a superseded post-conflict GET cannot mark ready while the latest GET is pending',async()=>{
 const mandatory=defer(),latest=defer();let gets=0;
 vi.stubGlobal('fetch',(_url:string,options?:RequestInit)=>options?.method==='POST'?Promise.resolve(json({},409)):++gets===1?Promise.resolve(json({seedVersion:1})):gets===2?mandatory.promise:latest.promise);
 const {result}=renderHook(()=>usePspState('A'));await waitFor(()=>expect(result.current.data).not.toBeNull());
 act(()=>result.current.command('/actions',{},identity,1));await waitFor(()=>expect(gets).toBe(2));act(()=>{void result.current.refresh();});
 await act(async()=>mandatory.resolve(json({seedVersion:1})));expect(result.current.conflict?.refreshed).toBe(false);
 await act(async()=>latest.resolve(json({seedVersion:1})));expect(result.current.conflict?.refreshed).toBe(true);
});
it('leaving and revisiting a URL clears its epoch and rejects the old token GET',async()=>{
 const mandatory=defer();let posted=false;
 vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>{if(options?.method==='POST'){posted=true;return Promise.resolve(json({},409));}return posted&&url==='A'?mandatory.promise:Promise.resolve(json({seedVersion:1}));});
 const {result,rerender}=renderHook(({url})=>usePspState(url),{initialProps:{url:'A'}});await waitFor(()=>expect(result.current.data).not.toBeNull());
 act(()=>result.current.command('/actions',{},identity,1));await waitFor(()=>expect(result.current.conflict).toBeTruthy());
 rerender({url:'B'});await waitFor(()=>expect(result.current.data).not.toBeNull());expect(result.current.conflict).toBeNull();
 posted=false;rerender({url:'A'});await waitFor(()=>expect(result.current.data).not.toBeNull());
 await act(async()=>mandatory.resolve(json({seedVersion:99})));expect(result.current.conflict).toBeNull();expect(result.current.data?.seedVersion).toBe(1);
});
