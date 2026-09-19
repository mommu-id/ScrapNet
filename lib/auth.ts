import { timingSafeEqual } from 'node:crypto';
export function authorized(request:Request,secret=process.env.ADMIN_SECRET){
 if(!secret||secret.length<24)return false;
 const value=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
 const a=Buffer.from(value),b=Buffer.from(secret);return a.length===b.length&&timingSafeEqual(a,b);
}
