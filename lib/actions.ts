import { db, log, parseJson } from './db';
import { safeUrl, permittedPage, extractPackages, packageLinks } from './scraper';
import { INDONESIAN_ISPS, freeWebSearch } from './isp-catalog';
import type { Provider, Package } from './types';

export async function discover(city: string) {
  let count = 0;
  const candidates: { name: string; url: string; domain: string }[] = [];

  // 1. Ambil dari katalog ISP Indonesia yang cocok untuk kota ini
  const cleanCity = city.trim();
  const matchedFromCatalog = INDONESIAN_ISPS.filter(isp =>
    isp.cities.some(c => c.toLowerCase().includes(cleanCity.toLowerCase()) || cleanCity.toLowerCase().includes(c.toLowerCase()))
  );
  // Jika kota spesifik tidak ada di daftar, sertakan semua ISP nasional
  const ispsToUse = matchedFromCatalog.length ? matchedFromCatalog : INDONESIAN_ISPS;
  for (const isp of ispsToUse) {
    try {
      const u = safeUrl(isp.url);
      candidates.push({ name: isp.name, url: u.href, domain: isp.domain });
    } catch {
      // skip invalid
    }
  }

  // 2. Jika ada Serper API Key, gunakan; jika tidak, gunakan DuckDuckGo Search gratis
  if (process.env.SERPER_API_KEY) {
    try {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: `provider internet rumah fiber paket harga ${cleanCity} website resmi`, gl: 'id', hl: 'id', num: 10 }),
        signal: AbortSignal.timeout(15000)
      });
      if (res.ok) {
        const data = await res.json();
        for (const result of (data.organic || []).slice(0, 10)) {
          try {
            const url = safeUrl(result.link);
            const domain = url.hostname.replace(/^www\./, '');
            if (!/(^|\.)(youtube\.com|facebook\.com|instagram\.com|tiktok\.com|tokopedia\.com|shopee\.co\.id|wikipedia\.org)$/.test(domain)) {
              candidates.push({ name: String(result.title || domain).slice(0, 100), domain, url: url.href });
            }
          } catch {
            // skip
          }
        }
      }
    } catch (e) {
      console.warn('Serper search fallback:', e);
    }
  } else {
    // Pencarian web gratis tanpa biaya
    const freeResults = await freeWebSearch(`provider internet fiber paket ${cleanCity}`);
    for (const r of freeResults) {
      try {
        const url = safeUrl(r.link);
        const domain = url.hostname.replace(/^www\./, '');
        if (!/(^|\.)(youtube\.com|facebook\.com|instagram\.com|tiktok\.com|tokopedia\.com|shopee\.co\.id|wikipedia\.org)$/.test(domain)) {
          candidates.push({ name: r.title.slice(0, 100), domain, url: url.href });
        }
      } catch {
        // skip
      }
    }
  }

  // Simpan kandidat ke database
  const seenDomain = new Set<string>();
  for (const c of candidates) {
    if (seenDomain.has(c.domain)) continue;
    seenDomain.add(c.domain);
    const p: Provider = {
      id: crypto.randomUUID(),
      name: c.name,
      domain: c.domain,
      url: c.url,
      city: cleanCity,
      status: 'candidate',
      checkedAt: null
    };
    const sql = db();
    const inserted = await sql`INSERT INTO providers(id,domain,city,data) VALUES(${p.id},${c.domain},${cleanCity},${sql.json(p)}) ON CONFLICT(domain,city) DO NOTHING RETURNING id`;
    count += inserted.length;
  }

  await log('Penemuan', `${count} calon website baru untuk ${cleanCity}.`);
  return `${count} calon website ditemukan untuk ${cleanCity}. Periksa sumber sebelum menyetujui.`;
}

export async function addManualProvider(name: string, rawUrl: string, city: string) {
  const url = safeUrl(rawUrl);
  const domain = url.hostname.replace(/^www\./, '');
  const cleanCity = city.trim() || 'Nasional';
  const cleanName = name.trim() || domain;

  const p: Provider = {
    id: crypto.randomUUID(),
    name: cleanName,
    domain,
    url: url.href,
    city: cleanCity,
    status: 'approved',
    checkedAt: null
  };

  const sql = db();
  const inserted = await sql`INSERT INTO providers(id,domain,city,data) VALUES(${p.id},${domain},${cleanCity},${sql.json(p)}) ON CONFLICT(domain,city) DO UPDATE SET data=jsonb_set(providers.data,'{status}','"approved"'::jsonb) RETURNING id`;
  await log('Tambah Provider', `Provider ${cleanName} (${domain}) berhasil ditambahkan.`);
  return `Provider ${cleanName} berhasil ditambahkan dan disetujui. Silakan klik "Ambil paket".`;
}

export async function scrape(id: string) {
  const rows = await db()`SELECT data FROM providers WHERE id=${id}`;
  const p = rows[0] ? parseJson<Provider>(rows[0].data) : undefined;
  if (!p || p.status !== 'approved') throw new Error('Provider harus disetujui terlebih dahulu.');

  try {
    const main = await permittedPage(p.url);
    const pages = [main];
    let isInsecure = !!main.insecureCert;
    let items = extractPackages(main.html).map(x => ({ ...x, url: main.url }));
    if (!items.length) {
      for (const link of packageLinks(main.html, p.url)) {
        try {
          const page = await permittedPage(link);
          pages.push(page);
          if (page.insecureCert) isInsecure = true;
          items.push(...extractPackages(page.html).map(x => ({ ...x, url: page.url })));
        } catch {
          // Lewati link jika gagal
        }
      }
    }

    const now = new Date().toISOString();
    const sql = db();

    // Atomic snapshot replacement
    if (items.length) {
      const unique = [...new Map(items.map(x => [`${x.url}|${x.speed}|${x.price}`, x])).values()];
      await sql.begin(async (tx) => {
        await tx`DELETE FROM packages WHERE provider_id=${id} AND data->>'status'='review'`;
        for (const item of unique) {
          const pkg: Package = {
            ...item,
            id: crypto.randomUUID(),
            providerId: id,
            provider: p.name,
            city: p.city,
            status: 'review',
            capturedAt: now,
            tax: 'Belum diketahui',
            insecureCert: isInsecure
          };
          await tx`INSERT INTO packages(id,provider_id,data) SELECT ${pkg.id},${id},${tx.json(pkg)} WHERE NOT EXISTS (SELECT 1 FROM packages WHERE provider_id=${id} AND data->>'status'='verified' AND data->>'url'=${item.url} AND (data->>'speed')::numeric=${item.speed} AND (data->>'price')::numeric=${item.price})`;
        }
      });
    }

    await sql`UPDATE providers SET data=jsonb_set(data,'{checkedAt}',to_jsonb(${now}::text)) WHERE id=${id}`;
    if (isInsecure) {
      await sql`UPDATE providers SET data=jsonb_set(data,'{insecureCert}',to_jsonb(true)) WHERE id=${id}`;
    }
    const message = items.length
      ? `${p.name}: ${items.length} kandidat paket dari ${pages.length} halaman.${isInsecure ? ' (Catatan: SSL sumber tidak secure/expired)' : ''}`
      : `${p.name}: tidak ada pasangan harga bulanan dan kecepatan yang jelas di HTML statis. Halaman mungkin dinamis (JavaScript) atau perlu adapter khusus.`;
    await log('Scraping', message);
    return message;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scraping gagal';
    await log('Scraping', `${p.name}: ${message}`, 'error');
    throw error;
  }
}

export async function withLock<T>(name: string, fn: () => Promise<T>) {
  const sql = db();
  const lock = await sql`INSERT INTO operation_locks(name,expires_at) VALUES(${name},now()+interval '5 minutes') ON CONFLICT(name) DO UPDATE SET expires_at=excluded.expires_at WHERE operation_locks.expires_at<now() RETURNING name`;
  if (!lock.length) throw new Error('Proses lain masih berjalan. Coba lagi setelah selesai.');
  try {
    return await fn();
  } finally {
    await sql`DELETE FROM operation_locks WHERE name=${name}`;
  }
}
