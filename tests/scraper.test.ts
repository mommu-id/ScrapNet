import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPackages, safeUrl, publicAddress, packageLinks } from '../lib/scraper';
import { authorized } from '../lib/auth';
test('extracts only locally associated monthly prices and speeds',()=>{
 const html='<section><div><h3>Family</h3><p>100 Mbps</p><p>Rp 329.000 / bulan</p></div><div><h3>Pro</h3><p>1 Gbps</p><p>Rp 999 rb / bulan</p></div></section>';
 assert.deepEqual(extractPackages(html).map(p=>[p.name,p.speed,p.price]),[['Family',100,329000],['Pro',1000,999000]]);
});
test('rejects ambiguous blocks, one-time fees and script content',()=>{
 assert.equal(extractPackages('<div>100 Mbps Rp 300.000 Rp 200.000 / bulan</div>').length,0);
 assert.equal(extractPackages('<div>100 Mbps instalasi Rp 200.000</div>').length,0);
 assert.equal(extractPackages('<script>100 Mbps Rp 200.000 / bulan</script>').length,0);
});
test('rejects private, mapped, link-local and reserved IPs',()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','::1','::ffff:127.0.0.1','100.64.0.1','224.0.0.1'])assert.equal(publicAddress(ip),false,ip);
 assert.equal(publicAddress('8.8.8.8'),true);
});
test('validates protocols, credentials, literal IPs and ports',()=>{
 for(const url of ['http://example.com','https://user:pass@example.com','https://127.0.0.1','https://[::1]','https://example.com:8080','file:///etc/passwd'])assert.throws(()=>safeUrl(url));
 assert.equal(safeUrl('https://provider.co.id/paket').hostname,'provider.co.id');
});
test('follows only same-origin package links, capped at two',()=>{
 assert.deepEqual(packageLinks('<a href="/paket">A</a><a href="https://other.test/paket">B</a><a href="/product">C</a><a href="/pricing">D</a>','https://provider.test'),['https://provider.test/paket','https://provider.test/product']);
});
test('admin and cron authentication fails closed',()=>{
 const secret='a-long-test-secret-at-least-24-characters';
 assert.equal(authorized(new Request('https://example.test'),secret),false);
 assert.equal(authorized(new Request('https://example.test',{headers:{authorization:`Bearer ${secret}`}}),secret),true);
 assert.equal(authorized(new Request('https://example.test',{headers:{authorization:'Bearer short'}}),'short'),false);
});
