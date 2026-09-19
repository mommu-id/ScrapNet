import { snapshot } from '../../../lib/db';
export const dynamic='force-dynamic';
export async function GET(){try{return Response.json(await snapshot(),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Database belum siap. Jalankan migrasi dan periksa koneksi database.'},{status:503});}}
