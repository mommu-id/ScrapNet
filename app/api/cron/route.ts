import { authorized } from '../../../lib/auth';
import { db } from '../../../lib/db';
import { scrape, withLock } from '../../../lib/actions';
export const maxDuration=120;
export async function GET(request:Request){
 if(!authorized(request,process.env.CRON_SECRET))return Response.json({error:'Unauthorized'},{status:401});
 try{const results=await withLock('mutation',async()=>{
  const rows=await db()`SELECT id FROM providers WHERE data->>'status'='approved' ORDER BY COALESCE(data->>'checkedAt','') ASC LIMIT 1`;
  const results=[];for(const row of rows){try{results.push(await scrape(row.id));}catch{results.push('Scraping gagal; lihat aktivitas.');await db()`UPDATE providers SET data=jsonb_set(data,'{checkedAt}',to_jsonb(${new Date().toISOString()}::text)) WHERE id=${row.id}`;}}return results;
 });return Response.json({results});}catch{return Response.json({error:'Cron gagal atau proses lain masih berjalan.'},{status:503});}
}
