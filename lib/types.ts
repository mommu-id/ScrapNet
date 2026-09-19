export type Provider = { id:string; name:string; url:string; domain:string; city:string; status:'candidate'|'approved'|'rejected'; checkedAt:string|null; insecureCert?:boolean };
export type Package = { id:string; providerId:string; provider:string; name:string; speed:number; price:number; city:string; url:string; evidence:string; status:'review'|'verified'; capturedAt:string; tax:string; insecureCert?:boolean };
export type Run = { id:string; kind:string; message:string; status:'success'|'error'; createdAt:string };
export type Snapshot = { demo:boolean; providers:Provider[]; packages:Package[]; runs:Run[]; config:{database:boolean; search:boolean; admin:boolean; cron:boolean} };
