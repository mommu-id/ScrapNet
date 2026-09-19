import { lookup } from 'node:dns/promises';
import https from 'node:https';
import ipaddr from 'ipaddr.js';
import { load } from 'cheerio';
import robotsParser from 'robots-parser';

export function safeUrl(raw:string){
 const u=new URL(raw);
 if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!u.hostname.includes('.')||ipaddr.isValid(u.hostname.replace(/^\[|\]$/g,'')))throw new Error('URL harus menggunakan HTTPS dan domain publik.');
 return u;
}
export function publicAddress(address:string){try{return ipaddr.process(address).range()==='unicast';}catch{return false;}}
// Resolve once, validate every answer, then pin that address to prevent DNS rebinding.
export async function fetchPage(raw:string,redirects=0):Promise<{html:string;url:string;status:number;insecureCert?:boolean}>{
 const u=safeUrl(raw);const answers=await lookup(u.hostname,{all:true});
 if(!answers.length||answers.some(a=>!publicAddress(a.address)))throw new Error('Alamat jaringan privat tidak diizinkan.');
 if(redirects>5)throw new Error('Terlalu banyak pengalihan.');
 const a=answers[0];

 let insecureCert=false;
 async function doFetch(rejectUnauthorized:boolean){
  return new Promise<{body:string;status:number;location?:string;type:string;certError?:boolean}>((resolve,reject)=>{
   const req=https.get(u,{
    family:a.family,
    rejectUnauthorized,
    lookup:((_host:unknown,options:{all?:boolean},cb:Function)=>options.all?cb(null,[a]):cb(null,a.address,a.family)) as never,
    headers:{'User-Agent':'ScrapNetBot/1.0','Accept':'text/html,text/plain,application/xhtml+xml','Accept-Encoding':'identity'}
   },res=>{
    let size=0;const chunks:Buffer[]=[];
    res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>3_000_000){res.destroy(new Error('Halaman terlalu besar.'));}else chunks.push(chunk);});
    res.on('error',reject);res.on('end',()=>resolve({body:Buffer.concat(chunks).toString('utf8'),status:res.statusCode||500,location:res.headers.location,type:res.headers['content-type']||''}));
   });
   const timer=setTimeout(()=>req.destroy(new Error('Waktu pengambilan halaman habis.')),10000);
   req.on('close',()=>clearTimeout(timer));
   req.on('error',(err)=>{
    if(/expired|certificate|self-signed|unable to verify/i.test(err.message)){
     resolve({body:'',status:0,type:'',certError:true});
    }else{
     reject(err);
    }
   });
  });
 }

 let response=await doFetch(true);
 if(response.certError){
  insecureCert=true;
  response=await doFetch(false);
 }

 if(response.status>=300&&response.status<400&&response.location){
  const next=new URL(response.location,u);
  const safeNext=safeUrl(next.href);
  const nextRes=await fetchPage(safeNext.href,redirects+1);
  return { ...nextRes, insecureCert: insecureCert || nextRes.insecureCert };
 }
 if(response.status!==404&&(response.status<200||response.status>=300))throw new Error(`Website merespons HTTP ${response.status}.`);
 if(response.status!==404&&!/text\/(html|plain)|application\/xhtml/i.test(response.type))throw new Error('Format halaman tidak didukung.');
 return {html:response.body,url:u.href,status:response.status,insecureCert};
}
export async function permittedPage(url:string){
 const u=safeUrl(url);const robotsUrl=new URL('/robots.txt',u).href;
 let insecureCert=false;
 try{
  const robots=await fetchPage(robotsUrl);
  insecureCert=!!robots.insecureCert;
  if(robots.status!==404&&robotsParser(robotsUrl,robots.html).isAllowed(u.href,'ScrapNetBot')===false)throw new Error('Pengambilan dibatasi oleh robots.txt.');
 }catch(e){
  if(e instanceof Error&&e.message.includes('robots.txt'))throw e;
 }
 const page=await fetchPage(u.href);if(page.status===404)throw new Error('Halaman tidak ditemukan.');
 return { ...page, insecureCert: insecureCert || page.insecureCert };
}
export type Extracted={name:string;speed:number;price:number;evidence:string};
export function extractPackages(html:string):Extracted[]{
 const $=load(html);$('script,style,nav,footer,header,noscript').remove();$('del, s, strike, [class*="line-through"]').remove();$('p,span,br,h1,h2,h3,h4,strong').append(' ');const found:Extracted[]=[];const seen=new Set<string>();
 $('article,section,li,div,tr').each((_,el)=>{
  const text=$(el).text().replace(/\s+/g,' ').trim();if(text.length>800||text.length<15)return;
  if(!/bulan|month|\/bln/i.test(text))return;
  if(/mulai dari/i.test(text)&&/hingga\s+\d+\s*(Mbps|Gbps)/i.test(text))return;

  const speedMatches=[...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(Mbps|Gbps)\b/gi)];
  const monthlyPriceMatches=[...text.matchAll(/Rp\.?\s*(\d{1,3}(?:[.,]\d{3})+|\d{5,8}|\d{2,4}\s*(?:ribu|rb))\s*(?:\/|\s+per\s+)(?:bln|bulan|month)\b/gi)];
  const allPriceMatches=[...text.matchAll(/Rp\.?\s*(\d{1,3}(?:[.,]\d{3})+|\d{5,8}|\d{2,4}\s*(?:ribu|rb))/gi)];

  if(speedMatches.length===0)return;
  let targetSpeed:number;let targetPrice:number;let rawAmount:string;

  if(speedMatches.length===1&&allPriceMatches.length===1){
   targetSpeed=Number(speedMatches[0][1].replace(',','.'))*(speedMatches[0][2].toLowerCase()==='gbps'?1000:1);
   rawAmount=allPriceMatches[0][1];
   targetPrice=Number(rawAmount.replace(/\D/g,''))*(/rb|ribu/i.test(rawAmount)?1000:1);
  }else if(monthlyPriceMatches.length===1){
   rawAmount=monthlyPriceMatches[0][1];
   targetPrice=Number(rawAmount.replace(/\D/g,''))*(/rb|ribu/i.test(rawAmount)?1000:1);
   const headlineSpeed=$(el).find('h1,h2,h3,h4,strong').first().text().match(/(\d+(?:[.,]\d+)?)\s*(Mbps|Gbps)\b/i);
   if(headlineSpeed){
    targetSpeed=Number(headlineSpeed[1].replace(',','.'))*(headlineSpeed[2].toLowerCase()==='gbps'?1000:1);
   }else{
    const sorted=speedMatches.map(s=>Number(s[1].replace(',','.'))*(s[2].toLowerCase()==='gbps'?1000:1)).sort((a,b)=>b-a);
    targetSpeed=sorted[0];
   }
  }else{
   return;
  }

  if(targetSpeed<=0||targetSpeed>10000||targetPrice<20000||targetPrice>20000000)return;
  const key=`${targetSpeed}:${targetPrice}`;if(seen.has(key))return;seen.add(key);
  const title=$(el).find('h1,h2,h3,h4,strong').first().text().trim().slice(0,100);
  found.push({name:title||`Internet ${targetSpeed} Mbps`,speed:targetSpeed,price:targetPrice,evidence:text});
 });return found.slice(0,30);
}
export function packageLinks(html:string,url:string){const $=load(html);const origin=new URL(url).origin;const links=new Set<string>();$('a[href]').each((_,el)=>{try{const u=new URL($(el).attr('href')!,url);if(u.origin===origin&&/paket|package|pricing|produk|product|internet-rumah/i.test(u.pathname)){u.hash='';links.add(u.href);}}catch{}});return [...links].slice(0,2);}
