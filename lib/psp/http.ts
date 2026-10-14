import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PspError } from './errors';
export async function pspResponse(run:()=>unknown|Promise<unknown>) {
  try {return NextResponse.json(await run(),{headers:{'Cache-Control':'no-store'}});}
  catch(error) {
    if(error instanceof PspError) return NextResponse.json({error:error.message,code:error.code},{status:error.status});
    if(error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({error:'请求格式无效',code:'invalid_input'},{status:400});
    console.error('PSP request failed',error);
    return NextResponse.json({error:'操作失败，请刷新后重试',code:'internal_error'},{status:500});
  }
}
export function identity(request:Request) {const query=new URL(request.url).searchParams;return {role:query.get('role'),actorId:query.get('actorId')};}
export function rejectPharmaFilters(request:Request):void {
  if(new URL(request.url).search) throw new PspError(400,'unsupported_filter','本阶段仅支持固定项目范围');
}
