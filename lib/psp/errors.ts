export class PspError extends Error {
  constructor(public readonly status:number, public readonly code:string, message:string) { super(message); }
}
