import {pharmaResponse,gatedPharmaRead,type PharmaReportParams} from '@/lib/psp/pharmaHttp';
import {NextResponse} from 'next/server';
export const dynamic='force-dynamic';
const escape=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
export async function GET(request:Request,context:PharmaReportParams){return pharmaResponse(async()=>{
 const {view,format}=await gatedPharmaRead(request,context,true);
 if(view.gate.status!=='available')return NextResponse.json(view,{status:403,headers:{'Cache-Control':'no-store'}});
 if(!('artifact' in view))throw new Error('Invalid available report');
 const html=format==='html',body=html?`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>项目服务报告</title><body><pre>${escape(view.artifact.text)}</pre></body></html>`:view.artifact.text;
 return new Response(body,{headers:{'Cache-Control':'no-store','Content-Type':html?'text/html; charset=utf-8':'text/plain; charset=utf-8','Content-Disposition':`attachment; filename="psp-report-r${view.revision}.${html?'html':'txt'}"`,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'"}});
 });}
