import { safeUrl } from './scraper';

export type ISPEntry = {
  name: string;
  domain: string;
  url: string;
  cities: string[];
};

export const INDONESIAN_ISPS: ISPEntry[] = [
  {
    name: 'Biznet Home',
    domain: 'biznethome.net',
    url: 'https://biznethome.net',
    cities: ['Jakarta', 'Surabaya', 'Bandung', 'Semarang', 'Yogyakarta', 'Medan', 'Denpasar', 'Malang', 'Tangerang', 'Bekasi', 'Depok', 'Bogor']
  },
  {
    name: 'IndiHome Telkomsel',
    domain: 'indihome.co.id',
    url: 'https://indihome.co.id',
    cities: ['Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Semarang', 'Makassar', 'Palembang', 'Yogyakarta', 'Denpasar', 'Balikpapan', 'Malang', 'Tangerang', 'Bekasi']
  },
  {
    name: 'MyRepublic Indonesia',
    domain: 'myrepublic.co.id',
    url: 'https://myrepublic.co.id',
    cities: ['Jakarta', 'Surabaya', 'Bandung', 'Semarang', 'Medan', 'Malang', 'Denpasar', 'Tangerang', 'Bekasi', 'Depok', 'Bogor', 'Palembang', 'Pekanbaru']
  },
  {
    name: 'First Media',
    domain: 'firstmedia.com',
    url: 'https://www.firstmedia.com',
    cities: ['Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Semarang', 'Surakarta', 'Malang', 'Tangerang', 'Bekasi', 'Depok', 'Bogor', 'Cilegon']
  },
  {
    name: 'XL SATU Fiber',
    domain: 'satu.xl.co.id',
    url: 'https://satu.xl.co.id',
    cities: ['Jakarta', 'Surabaya', 'Bandung', 'Yogyakarta', 'Medan', 'Denpasar', 'Tangerang', 'Bekasi', 'Depok', 'Bogor', 'Semarang']
  },
  {
    name: 'Iconnet (PLN Icon Plus)',
    domain: 'iconnet.id',
    url: 'https://iconnet.id',
    cities: ['Jakarta', 'Surabaya', 'Bandung', 'Semarang', 'Medan', 'Makassar', 'Denpasar', 'Padang', 'Palembang', 'Yogyakarta', 'Malang']
  },
  {
    name: 'Oxygen.id',
    domain: 'oxygen.id',
    url: 'https://home.oxygen.id',
    cities: ['Jakarta', 'Bogor', 'Depok', 'Tangerang', 'Bekasi', 'Denpasar', 'Surabaya', 'Medan', 'Pangkal Pinang']
  },
  {
    name: 'CBN Fiber',
    domain: 'cbn.id',
    url: 'https://cbn.id',
    cities: ['Jakarta', 'Bogor', 'Depok', 'Tangerang', 'Bekasi', 'Bandung', 'Surabaya', 'Denpasar', 'Palembang', 'Medan']
  },
  {
    name: 'Megavision',
    domain: 'megavision.net.id',
    url: 'https://megavision.net.id',
    cities: ['Bandung', 'Bogor', 'Depok', 'Cimahi']
  }
];

export async function freeWebSearch(query: string): Promise<{ title: string; link: string }[]> {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return [];
    const html = await res.text();
    const results: { title: string; link: string }[] = [];
    const linkRegex = /<a class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null && results.length < 8) {
      let rawHref = match[1];
      if (rawHref.includes('uddg=')) {
        const u = new URL(rawHref, 'https://html.duckduckgo.com');
        rawHref = decodeURIComponent(u.searchParams.get('uddg') || rawHref);
      }
      try {
        const safe = safeUrl(rawHref);
        results.push({
          title: match[2].replace(/<[^>]+>/g, '').trim() || safe.hostname,
          link: safe.href
        });
      } catch {
        // Skip invalid/unsafe urls
      }
    }
    return results;
  } catch {
    return [];
  }
}
