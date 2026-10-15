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

type AuthorizedView = { seedVersion: number; authorizationVersion?: number; content?: string; gate?: string };
it('rejects later-started old authorization payloads after observing a revoked gate',async()=>{
 let view:AuthorizedView={seedVersion:1,authorizationVersion:3,content:'delivered'};
 vi.stubGlobal('fetch',()=>Promise.resolve(json(view)));
 const {result}=renderHook(()=>usePspState<AuthorizedView>('A'));await waitFor(()=>expect(result.current.data?.content).toBe('delivered'));
 view={seedVersion:1,authorizationVersion:4,gate:'revoked'};await act(async()=>{await result.current.refresh();});
 view={seedVersion:1,authorizationVersion:3,content:'stale'};await act(async()=>{await result.current.refresh();});
 expect(result.current.data).toEqual({seedVersion:1,authorizationVersion:4,gate:'revoked'});
 view={seedVersion:1,content:'missing authorization'};await act(async()=>{await result.current.refresh();});
 expect(result.current.data?.gate).toBe('revoked');
});
it('allows a higher seed to reset authorization lower and permanently rejects the retired seed',async()=>{
 let view:AuthorizedView={seedVersion:1,authorizationVersion:9,content:'old seed'};
 vi.stubGlobal('fetch',()=>Promise.resolve(json(view)));
 const {result}=renderHook(()=>usePspState<AuthorizedView>('A'));await waitFor(()=>expect(result.current.data).not.toBeNull());
 view={seedVersion:2,authorizationVersion:1,content:'new seed'};await act(async()=>{await result.current.refresh();});expect(result.current.data?.content).toBe('new seed');
 view={seedVersion:1,authorizationVersion:99,content:'retired'};await act(async()=>{await result.current.refresh();});expect(result.current.data?.content).toBe('new seed');
});
it('a versioned GET error raises the floor even after clearing the snapshot',async()=>{
 let response=json({seedVersion:1,authorizationVersion:2,content:'delivered'});const late=defer();let reads=0;
 vi.stubGlobal('fetch',()=>++reads===3?late.promise:Promise.resolve(response));
 const {result}=renderHook(()=>usePspState<AuthorizedView>('A'));await waitFor(()=>expect(result.current.data).not.toBeNull());
 response=json({seedVersion:1,authorizationVersion:3,error:'revoked'},409);await act(async()=>{await result.current.refresh();});
 expect(result.current.data).toBeNull();expect(result.current.invalidation).toEqual({seedVersion:1,authorizationVersion:3});
 act(()=>{void result.current.refresh();});await act(async()=>late.resolve(json({seedVersion:1,authorizationVersion:2,content:'stale'})));
 expect(result.current.data).toBeNull();expect(result.current.invalidation?.authorizationVersion).toBe(3);
 response=json({seedVersion:1,authorizationVersion:3,gate:'revoked'});await act(async()=>{await result.current.refresh();});
 expect(result.current.data?.gate).toBe('revoked');expect(result.current.invalidation).toBeNull();
});
it('ignores invalid or lower error metadata and retains the authorization floor',async()=>{
 let response=json({seedVersion:2,authorizationVersion:4,content:'current'});
 vi.stubGlobal('fetch',()=>Promise.resolve(response));const {result}=renderHook(()=>usePspState<AuthorizedView>('A',10000,true));await waitFor(()=>expect(result.current.data).not.toBeNull());
 for(const metadata of [{seedVersion:1,authorizationVersion:99},{seedVersion:2,authorizationVersion:-1},{seedVersion:'3',authorizationVersion:99},{seedVersion:2,authorizationVersion:3}]){
  response=json(metadata,503);await act(async()=>{await result.current.refresh();});expect(result.current.data).toBeNull();
 }
 response=json({seedVersion:2,authorizationVersion:3,content:'stale'});await act(async()=>{await result.current.refresh();});expect(result.current.data).toBeNull();
 response=json({seedVersion:2,authorizationVersion:4,content:'current'});await act(async()=>{await result.current.refresh();});expect(result.current.data?.content).toBe('current');
});
it('clears public payload and retry on an unversioned read error while internal reads retain their payload',async()=>{
 let fail=false;
 vi.stubGlobal('fetch',(_url:string,options?:RequestInit)=>Promise.resolve(options?.method==='POST'?json({},503):fail?json({},503):json({seedVersion:1,authorizationVersion:1,content:'delivered'})));
 const external=renderHook(()=>usePspState<AuthorizedView>('public',10000,true)),internal=renderHook(()=>usePspState<AuthorizedView>('internal'));
 await waitFor(()=>expect(external.result.current.data).not.toBeNull());await waitFor(()=>expect(internal.result.current.data).not.toBeNull());
 act(()=>external.result.current.command('/actions',{},identity,1));await waitFor(()=>expect(external.result.current.canRetry).toBe(true));
 fail=true;await act(async()=>{await Promise.all([external.result.current.refresh(),internal.result.current.refresh()]);});
 expect(external.result.current.data).toBeNull();expect(external.result.current.canRetry).toBe(false);expect(external.result.current.busy).toBe(false);
 expect(internal.result.current.data?.content).toBe('delivered');
});
it('invalidates pending writes and retained command callbacks when authorization changes',async()=>{
 let authorizationVersion=1;const post=defer();let posts=0;
 vi.stubGlobal('fetch',(_url:string,options?:RequestInit)=>options?.method==='POST'?(++posts,post.promise):Promise.resolve(json({seedVersion:1,authorizationVersion})));
 const {result}=renderHook(()=>usePspState<AuthorizedView>('A'));await waitFor(()=>expect(result.current.data).not.toBeNull());const oldCommand=result.current.command;
 act(()=>oldCommand('/actions',{},identity,1));expect(result.current.busy).toBe(true);
 authorizationVersion=2;await act(async()=>{await result.current.refresh();});expect(result.current.busy).toBe(false);expect(result.current.canRetry).toBe(false);
 const notice=result.current.notice;await act(async()=>post.resolve(json({},503)));expect(result.current.notice).toBe(notice);expect(result.current.canRetry).toBe(false);
 act(()=>oldCommand('/actions',{},identity,1));expect(posts).toBe(1);
});
it('retires an existing 503 retry on authorization change without adding authorization to strict command metadata',async()=>{
 let authorizationVersion=1;const bodies:Record<string,unknown>[]=[];
 const fetcher=vi.fn((_url:string,options?:RequestInit)=>{if(options?.method==='POST'){bodies.push(JSON.parse(options.body as string));return Promise.resolve(json({},503));}return Promise.resolve(json({seedVersion:1,authorizationVersion}));});vi.stubGlobal('fetch',fetcher);
 const {result}=renderHook(()=>usePspState<AuthorizedView>('A'));await waitFor(()=>expect(result.current.data).not.toBeNull());
 act(()=>result.current.command('/actions',{},identity,1));await waitFor(()=>expect(result.current.canRetry).toBe(true));const oldRetry=result.current.retry;
 expect(bodies[0].meta).not.toHaveProperty('authorizationVersion');authorizationVersion=2;await act(async()=>{await result.current.refresh();});
 expect(result.current.canRetry).toBe(false);const count=fetcher.mock.calls.length;act(()=>oldRetry());expect(fetcher.mock.calls.length).toBe(count);
});
it('does not observe error metadata from a superseded request or a retired URL token',async()=>{
 const superseded=defer(),retired=defer();let reads=0;
 vi.stubGlobal('fetch',(url:string)=>url==='B'?Promise.resolve(json({seedVersion:1,authorizationVersion:1})):++reads===2?superseded.promise:reads===4?retired.promise:Promise.resolve(json({seedVersion:1,authorizationVersion:2,content:'current'})));
 const {result,rerender}=renderHook(({url})=>usePspState<AuthorizedView>(url,10000,true),{initialProps:{url:'A'}});await waitFor(()=>expect(result.current.data).not.toBeNull());
 act(()=>{void result.current.refresh();});await act(async()=>{await result.current.refresh();});await act(async()=>superseded.resolve(json({seedVersion:99,authorizationVersion:99},409)));
 expect(result.current.data?.content).toBe('current');expect(result.current.invalidation).toBeNull();
 act(()=>{void result.current.refresh();});rerender({url:'B'});await waitFor(()=>expect(result.current.data).not.toBeNull());rerender({url:'A'});await waitFor(()=>expect(result.current.data?.content).toBe('current'));
 await act(async()=>retired.resolve(json({seedVersion:99,authorizationVersion:99},409)));expect(result.current.data?.content).toBe('current');expect(result.current.invalidation).toBeNull();
});
it('rejects malformed success versions without losing the observed floor',async()=>{
 let response=json({seedVersion:2,authorizationVersion:4,content:'current'});
 vi.stubGlobal('fetch',()=>Promise.resolve(response));const {result}=renderHook(()=>usePspState<AuthorizedView>('A'));await waitFor(()=>expect(result.current.data?.content).toBe('current'));
 for(const view of [{content:'missing seed'},{seedVersion:0,authorizationVersion:99,content:'invalid seed'},{seedVersion:2,authorizationVersion:'99',content:'invalid authorization'}]){
  response=json(view);await act(async()=>{await result.current.refresh();});expect(result.current.data?.content).toBe('current');
 }
 response=json({seedVersion:2,authorizationVersion:3,content:'stale'});await act(async()=>{await result.current.refresh();});expect(result.current.data?.content).toBe('current');
});
it('a new-seed GET error invalidates pending writes and keeps its barrier scoped to the current visit',async()=>{
 let response=json({seedVersion:1,authorizationVersion:9,content:'old seed'});const post=defer();
 vi.stubGlobal('fetch',(url:string,options?:RequestInit)=>options?.method==='POST'?post.promise:url==='B'?Promise.resolve(json({seedVersion:1,authorizationVersion:1})):Promise.resolve(response));
 const {result,rerender}=renderHook(({url})=>usePspState<AuthorizedView>(url),{initialProps:{url:'A'}});await waitFor(()=>expect(result.current.data).not.toBeNull());
 act(()=>result.current.command('/actions',{},identity,1));response=json({seedVersion:2,authorizationVersion:1},409);await act(async()=>{await result.current.refresh();});
 expect(result.current.data).toBeNull();expect(result.current.busy).toBe(false);expect(result.current.invalidation).toEqual({seedVersion:2,authorizationVersion:1});
 const notice=result.current.notice;await act(async()=>post.resolve(json({})));expect(result.current.notice).toBe(notice);expect(result.current.data).toBeNull();
 response=json({seedVersion:1,authorizationVersion:99,content:'retired seed'});await act(async()=>{await result.current.refresh();});expect(result.current.data).toBeNull();
 rerender({url:'B'});expect(result.current.invalidation).toBeNull();await waitFor(()=>expect(result.current.data).not.toBeNull());
 response=json({seedVersion:1,authorizationVersion:1,content:'new visit'});rerender({url:'A'});await waitFor(()=>expect(result.current.data?.content).toBe('new visit'));expect(result.current.invalidation).toBeNull();
});
it('a current failed feedback POST immediately clears delivered content and raises its authorization barrier',async()=>{
 let view:AuthorizedView={seedVersion:1,authorizationVersion:2,content:'previously delivered body'};
 vi.stubGlobal('fetch',(_url:string,options?:RequestInit)=>Promise.resolve(options?.method==='POST'?json({code:'source_unusable',seedVersion:1,authorizationVersion:3},403):json(view)));
 const {result}=renderHook(()=>usePspState<AuthorizedView>('/report',10000,true));await waitFor(()=>expect(result.current.data?.content).toBe('previously delivered body'));
 act(()=>result.current.command('/actions',{action:'accept'},{role:'pharma_owner',actorId:'pharma-owner-a'},5));
 await waitFor(()=>expect(result.current.busy).toBe(false));
 expect(result.current.data).toBeNull();expect(result.current.invalidation).toEqual({seedVersion:1,authorizationVersion:3});expect(result.current.canRetry).toBe(false);
 await act(async()=>{await result.current.refresh();});expect(result.current.data).toBeNull();
 view={seedVersion:1,authorizationVersion:3,gate:'revoked'};await act(async()=>{await result.current.refresh();});
 expect(result.current.data?.gate).toBe('revoked');expect(result.current.invalidation).toBeNull();
});
it('a stale-seed POST 409 clears the old body before its mandatory GET resolves',async()=>{
 const current=defer();let gets=0;
 vi.stubGlobal('fetch',(_url:string,options?:RequestInit)=>options?.method==='POST'?Promise.resolve(json({code:'stale_seed',currentSeedVersion:2,currentAuthorizationVersion:1},409)):++gets===1?Promise.resolve(json({seedVersion:1,authorizationVersion:9,content:'retired body'})):current.promise);
 const {result}=renderHook(()=>usePspState<AuthorizedView>('/report',10000,true));await waitFor(()=>expect(result.current.data).not.toBeNull());
 act(()=>result.current.command('/actions',{action:'accept'},identity,5));await waitFor(()=>expect(gets).toBe(2));
 expect(result.current.data).toBeNull();expect(result.current.invalidation).toEqual({seedVersion:2,authorizationVersion:1});expect(result.current.busy).toBe(false);expect(result.current.canRetry).toBe(false);expect(result.current.conflict).toBeNull();
 await act(async()=>current.resolve(json({seedVersion:1,authorizationVersion:99,content:'retired body'})));
 expect(result.current.data).toBeNull();expect(result.current.invalidation?.seedVersion).toBe(2);
});
it('a same-version POST 409 still waits for a fresh GET before acknowledging its conflict',async()=>{
 const current=defer();let gets=0;
 vi.stubGlobal('fetch',(_url:string,options?:RequestInit)=>options?.method==='POST'?Promise.resolve(json({seedVersion:1,authorizationVersion:2,code:'version_conflict'},409)):++gets===1?Promise.resolve(json({seedVersion:1,authorizationVersion:2,content:'current body'})):current.promise);
 const {result}=renderHook(()=>usePspState<AuthorizedView>('/report'));await waitFor(()=>expect(result.current.data).not.toBeNull());
 act(()=>result.current.command('/actions',{},identity,5));await waitFor(()=>expect(gets).toBe(2));
 expect(result.current.data?.content).toBe('current body');expect(result.current.invalidation).toBeNull();expect(result.current.conflict).toEqual({id:expect.any(Number),refreshed:false});
 const id=result.current.conflict!.id;await act(async()=>current.resolve(json({seedVersion:1,authorizationVersion:2,content:'fresh body'})));
 expect(result.current.conflict).toEqual({id,refreshed:true});expect(result.current.data?.content).toBe('fresh body');
});
it.each([{}, {seedVersion:1,authorizationVersion:2}])('a transient POST 503 with %j retains the exact retry body and metadata',async metadata=>{
 const requests:string[]=[];
 vi.stubGlobal('fetch',(_url:string,options?:RequestInit)=>{if(options?.method==='POST'){requests.push(options.body as string);return Promise.resolve(json(metadata,503));}return Promise.resolve(json({seedVersion:1,authorizationVersion:2,content:'current body'}));});
 const {result}=renderHook(()=>usePspState<AuthorizedView>('/report',10000,true));await waitFor(()=>expect(result.current.data).not.toBeNull());
 act(()=>result.current.command('/actions',{action:'request_changes',reason:'clarify period'},identity,5));await waitFor(()=>expect(result.current.canRetry).toBe(true));
 expect(result.current.data?.content).toBe('current body');expect(result.current.invalidation).toBeNull();
 act(()=>result.current.retry());await waitFor(()=>expect(requests).toHaveLength(2));await waitFor(()=>expect(result.current.busy).toBe(false));
 expect(requests[1]).toBe(requests[0]);expect(JSON.parse(requests[0]).meta).not.toHaveProperty('authorizationVersion');
});
it('ignores newer metadata from a POST superseded by an authorization refresh',async()=>{
 const post=defer();let authorizationVersion=2;
 vi.stubGlobal('fetch',(_url:string,options?:RequestInit)=>options?.method==='POST'?post.promise:Promise.resolve(json({seedVersion:1,authorizationVersion,content:'current body'})));
 const {result}=renderHook(()=>usePspState<AuthorizedView>('/report',10000,true));await waitFor(()=>expect(result.current.data).not.toBeNull());
 act(()=>result.current.command('/actions',{},identity,5));authorizationVersion=3;await act(async()=>{await result.current.refresh();});
 const notice=result.current.notice;await act(async()=>post.resolve(json({seedVersion:99,authorizationVersion:99},403)));
 expect(result.current.data?.authorizationVersion).toBe(3);expect(result.current.invalidation).toBeNull();expect(result.current.notice).toBe(notice);
});
it.each(['URL retirement','authorization refresh'])('rechecks POST currency after asynchronous error JSON parsing during %s',async mode=>{
 const parsing=defer();let parsed=false;
 let authorizationVersion=2;const failed=new Response(null,{status:403});vi.spyOn(failed,'json').mockImplementation(async()=>{parsed=true;return (await parsing.promise).json();});
 vi.stubGlobal('fetch',(_url:string,options?:RequestInit)=>Promise.resolve(options?.method==='POST'?failed:json({seedVersion:1,authorizationVersion,content:'current body'})));
 const {result,rerender}=renderHook(({url})=>usePspState<AuthorizedView>(url,10000,true),{initialProps:{url:'A'}});await waitFor(()=>expect(result.current.data).not.toBeNull());
 act(()=>result.current.command('/actions',{},identity,5));await waitFor(()=>expect(parsed).toBe(true));
 if(mode==='URL retirement'){rerender({url:'B'});await waitFor(()=>expect(result.current.data).not.toBeNull());rerender({url:'A'});await waitFor(()=>expect(result.current.data).not.toBeNull());}
 else {authorizationVersion=3;await act(async()=>{await result.current.refresh();});}
 const notice=result.current.notice;await act(async()=>parsing.resolve(json({seedVersion:99,authorizationVersion:99})));
 expect(result.current.data?.content).toBe('current body');expect(result.current.data?.authorizationVersion).toBe(authorizationVersion);expect(result.current.invalidation).toBeNull();expect(result.current.notice).toBe(notice);
});

it('installs a stable monotonic barrier that clears pending retries and rejects callbacks from retired visits',async()=>{
 let view:AuthorizedView={seedVersion:1,authorizationVersion:2,content:'current body'};
 vi.stubGlobal('fetch',(_url:string,options?:RequestInit)=>Promise.resolve(options?.method==='POST'?json({},503):json(view)));
 const {result,rerender,unmount}=renderHook(({url})=>usePspState<AuthorizedView>(url,10000,true),{initialProps:{url:'A'}});await waitFor(()=>expect(result.current.data).not.toBeNull());
 const retired=result.current.installVersionBarrier;
 act(()=>result.current.command('/actions',{},identity,5));await waitFor(()=>expect(result.current.canRetry).toBe(true));
 expect(result.current.installVersionBarrier).toBe(retired);
 act(()=>{result.current.installVersionBarrier({seedVersion:1,authorizationVersion:3});});
 expect(result.current.data).toBeNull();expect(result.current.canRetry).toBe(false);expect(result.current.invalidation).toEqual({seedVersion:1,authorizationVersion:3});
 act(()=>{result.current.installVersionBarrier({seedVersion:1,authorizationVersion:2});});await act(async()=>{await result.current.refresh();});expect(result.current.data).toBeNull();
 view={seedVersion:2,authorizationVersion:1,content:'new seed'};await act(async()=>{await result.current.refresh();});expect(result.current.data?.content).toBe('new seed');
 rerender({url:'B'});await waitFor(()=>expect(result.current.data).not.toBeNull());act(()=>{retired({seedVersion:99,authorizationVersion:99});});expect(result.current.data?.content).toBe('new seed');expect(result.current.invalidation).toBeNull();
 rerender({url:'A'});await waitFor(()=>expect(result.current.data).not.toBeNull());act(()=>{retired({seedVersion:99,authorizationVersion:99});});expect(result.current.data?.content).toBe('new seed');expect(result.current.invalidation).toBeNull();
 const unmounted=result.current.installVersionBarrier;unmount();expect(unmounted({seedVersion:100,authorizationVersion:100})).toBeNull();
});

it('scopes read failure to the current visit and clears it only on accepted GET, preserving exact retry',async()=>{
 let mode:'ok'|'fail'|'old'|'defer'='ok';const delayed=defer(),retry=defer();const bodies:string[]=[];
 vi.stubGlobal('fetch',(_url:string,options?:RequestInit)=>{
  if(options?.method==='POST'){bodies.push(options.body as string);return bodies.length===1?Promise.resolve(json({},503)):retry.promise;}
  return mode==='defer'?delayed.promise:Promise.resolve(mode==='fail'?json({},500):json({seedVersion:mode==='old'?1:2}));
 });
 const {result,rerender}=renderHook(({url})=>usePspState(url),{initialProps:{url:'A'}});await waitFor(()=>expect(result.current.data?.seedVersion).toBe(2));
 expect(result.current.readError).toBe(false);
 act(()=>result.current.command('/actions',{action:'save'},identity,7));await waitFor(()=>expect(result.current.canRetry).toBe(true));
 mode='fail';await act(async()=>{await result.current.refresh();});expect(result.current.readError).toBe(true);expect(result.current.data?.seedVersion).toBe(2);
 act(()=>result.current.retry());expect(result.current.readError).toBe(true);expect(result.current.notice).toBeNull();expect(bodies[1]).toBe(bodies[0]);
 mode='old';await act(async()=>retry.resolve(json({})));expect(result.current.readError).toBe(true);expect(result.current.data?.seedVersion).toBe(2);
 mode='ok';await act(async()=>{await result.current.refresh();});expect(result.current.readError).toBe(false);
 mode='defer';act(()=>{void result.current.refresh();});mode='ok';rerender({url:'B'});await waitFor(()=>expect(result.current.data?.seedVersion).toBe(2));
 rerender({url:'A'});await waitFor(()=>expect(result.current.data?.seedVersion).toBe(2));await act(async()=>delayed.resolve(json({},403)));expect(result.current.readError).toBe(false);
 // A retired successful response must not clear a current visit's failure.
 const oldSuccess=defer();vi.stubGlobal('fetch',()=>oldSuccess.promise);act(()=>{void result.current.refresh();});
 vi.stubGlobal('fetch',()=>Promise.resolve(json({},404)));rerender({url:'B'});await waitFor(()=>expect(result.current.readError).toBe(true));
 await act(async()=>oldSuccess.resolve(json({seedVersion:99})));expect(result.current.readError).toBe(true);expect(result.current.data).toBeNull();
});
