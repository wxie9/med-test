// Test-only process owner. Never runs a build, loads dotenv, or adopts an existing server.
import {spawn} from 'node:child_process';
import {cpSync,lstatSync,mkdirSync,mkdtempSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {createServer as httpServer} from 'node:http';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {basename,dirname,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';

const backend=process.argv[2];
if(!['next','worker'].includes(backend))throw new Error('Expected next or worker');
const root=process.cwd(),port=backend==='next'?3112:8787;
const workspace=mkdtempSync(join(tmpdir(),`med-e2e-${backend}-`));
const descriptor=join(root,'test-results/runtime-worker/runtime.json');
const persist=backend==='worker'?(mkdirSync(join(root,'test-results'),{recursive:true}),mkdtempSync(join(root,'test-results/worker-persist-'))):undefined;
const environment={NODE_ENV:'development',CI:'1',NEXT_TELEMETRY_DISABLED:'1',WRANGLER_SEND_METRICS:'false',DEMO_FIXED_NOW:'2026-10-13T02:00:00.000Z',HOME:join(workspace,'home')};
for(const name of ['PATH','SystemRoot','ComSpec','PATHEXT','TMPDIR','TMP','TEMP','LANG','LC_ALL'])if(process.env[name])environment[name]=process.env[name];
mkdirSync(environment.HOME);
const exclude=new Set(['node_modules','.git','.next','.wrangler']);
function copy(name){
 const source=join(root,name),target=join(workspace,name);
 mkdirSync(dirname(target),{recursive:true});
 cpSync(source,target,{recursive:true,filter(path){
  const entry=basename(path);
  if(entry.startsWith('.env')||entry.startsWith('.dev.vars')||(name!=='.open-next'&&exclude.has(entry))||entry.endsWith('.tsbuildinfo'))return false;
  if(lstatSync(path).isSymbolicLink())throw new Error('E2E runtime refuses source symlinks');
  return true;
 }});
}
async function vacant(number){
 const server=createServer();
 await new Promise((resolve,reject)=>{server.once('error',()=>reject(new Error(`E2E refuses occupied port ${number}`)));server.listen(number,'127.0.0.1',resolve);});
 await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
}
let child,controller,stopping=false;
async function stop(){
 if(!child)return;
 const owned=child;child=undefined;
 if(owned.exitCode!==null||owned.signalCode!==null)return;
 const exited=once(owned,'exit');
 // A new process group belongs exclusively to this launcher.
 process.kill(-owned.pid,'SIGTERM');
 const timeout=setTimeout(()=>{try{process.kill(-owned.pid,'SIGKILL');}catch{}},10000);
 try{await exited;}finally{clearTimeout(timeout);}
}
async function start(){
 await vacant(port);if(backend==='worker')await vacant(9240);
 const executable=backend==='next'?'next/dist/bin/next':'wrangler/bin/wrangler.js';
 const args=backend==='next'?['dev','--hostname','127.0.0.1','--port',String(port)]:['dev','--local','--ip','127.0.0.1','--port',String(port),'--inspector-port','9240','--persist-to',persist,'--config',join(workspace,'wrangler.jsonc')];
 child=spawn(process.execPath,[join(root,'node_modules',executable),...args],{cwd:workspace,env:environment,stdio:'inherit',detached:true});
 child.once('exit',()=>{if(child&&!stopping){console.error('Owned E2E runtime exited unexpectedly');process.exitCode=1;void shutdown();}});
}
async function healthy(){
 const deadline=Date.now()+120000;
 while(Date.now()<deadline){
  try{const response=await fetch(`http://127.0.0.1:${port}/api/state`,{signal:AbortSignal.timeout(2000)});if(response.ok){const state=await response.json();if(state.serverNow!=='2026-10-13T02:00:00.000Z')throw new Error('Unexpected runtime clock');return;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 throw new Error('Owned runtime did not become healthy');
}
async function shutdown(){
 if(stopping)return;stopping=true;
 if(controller)controller.close();
 await stop();
 if(backend==='worker'){mkdirSync(dirname(descriptor),{recursive:true});writeFileSync(descriptor,JSON.stringify({persist,stopped:true}));}
 rmSync(workspace,{recursive:true,force:true});
}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void shutdown().then(()=>process.exit());});
try{
 await vacant(port);if(backend==='worker')await vacant(9240);
 for(const name of backend==='next'?['app','components','lib','data','public','docs/demo-script.md','package.json','next.config.ts','tsconfig.json','postcss.config.mjs']:['.open-next','lib','cloudflare/worker.mjs','cloudflare/files.generated.mjs','tsconfig.json','wrangler.jsonc','package.json'])copy(name);
 symlinkSync(join(root,'node_modules'),join(workspace,'node_modules'),'dir');
 await start();
 if(backend==='worker'){
  const token=randomUUID();let restarting=false,generation=1;
  controller=httpServer(async(request,response)=>{
   if(request.method!=='POST'||request.url!=='/restart'||request.headers.authorization!==`Bearer ${token}`){response.writeHead(403).end();return;}
   if(restarting){response.writeHead(409).end();return;}restarting=true;
   const previousPid=child?.pid;
   try{await stop();await start();await healthy();response.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({previousPid,pid:child.pid,generation:++generation,persist:persist}));}
   catch{response.writeHead(500).end('Owned runtime restart failed');}finally{restarting=false;}
  });
  controller.listen(0,'127.0.0.1');await once(controller,'listening');
  mkdirSync(dirname(descriptor),{recursive:true});
  writeFileSync(descriptor,JSON.stringify({url:`http://127.0.0.1:${controller.address().port}/restart`,token,pid:child.pid,persist:persist}),{mode:0o600});
 }
}catch(error){console.error(error.message);process.exitCode=1;await shutdown();}
