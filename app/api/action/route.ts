import { z } from 'zod';
import { authorized } from '../../../lib/auth';
import type { Package } from '../../../lib/types';
import { db, log, parseJson } from '../../../lib/db';
import { discover, scrape, addManualProvider, withLock } from '../../../lib/actions';

export const maxDuration = 120;

const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('discover'), city: z.string().trim().min(2).max(80) }),
  z.object({ action: z.literal('add_provider'), name: z.string().trim().min(2).max(100), url: z.string().url().max(200), city: z.string().trim().min(2).max(80) }),
  z.object({ action: z.literal('provider'), id: z.string().uuid(), status: z.enum(['approved', 'rejected']) }),
  z.object({ action: z.literal('scrape'), id: z.string().uuid() }),
  z.object({ action: z.literal('verify'), id: z.string().uuid() }),
  z.object({ action: z.literal('discard'), id: z.string().uuid() }),
  z.object({ action: z.literal('delete_packages'), ids: z.array(z.string().uuid()).min(1).max(1000) }),
  z.object({ action: z.literal('delete_provider'), id: z.string().uuid() }),
  z.object({
    action: z.literal('update_package'),
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    speed: z.number().int().min(1).max(10000),
    price: z.number().int().min(1000).max(100000000),
    tax: z.string().trim().max(100).optional(),
    status: z.enum(['review', 'verified']).optional()
  })
]);

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: 'Kunci admin tidak valid atau belum diatur (minimal 24 karakter).' }, { status: 401 });
  try {
    const raw = await request.text();
    if (raw.length > 65536) return Response.json({ error: 'Permintaan terlalu besar.' }, { status: 413 });
    const parsed = input.safeParse(JSON.parse(raw));
    if (!parsed.success) return Response.json({ error: 'Isian tidak valid.' }, { status: 400 });
    const body = parsed.data;
    const message = await withLock('mutation', async () => {
      if (body.action === 'discover') return discover(body.city);
      if (body.action === 'add_provider') return addManualProvider(body.name, body.url, body.city);
      if (body.action === 'scrape') return scrape(body.id);
      if (body.action === 'provider') {
        const rows = await db()`UPDATE providers SET data=jsonb_set(data,'{status}',to_jsonb(${body.status}::text)) WHERE id=${body.id} RETURNING id`;
        if (!rows.length) throw new Error('Provider tidak ditemukan.');
        return 'Status website diperbarui.';
      }
      if (body.action === 'discard') {
        await db()`DELETE FROM packages WHERE id=${body.id} AND data->>'status'='review'`;
        return 'Kandidat paket dihapus.';
      }
      if (body.action === 'delete_packages') {
        const sql = db();
        const deleted = await sql`DELETE FROM packages WHERE id IN ${sql(body.ids)} RETURNING id`;
        await log('Hapus Paket', `${deleted.length} paket berhasil dihapus.`);
        return `${deleted.length} paket berhasil dihapus.`;
      }
      if (body.action === 'delete_provider') {
        const sql = db();
        await sql`DELETE FROM packages WHERE provider_id=${body.id}`;
        await sql`DELETE FROM providers WHERE id=${body.id}`;
        await log('Hapus Provider', 'Provider dan paket terkait berhasil dihapus.');
        return 'Provider dan semua paketnya berhasil dihapus.';
      }
      if (body.action === 'update_package') {
        const sql = db();
        const rows = await sql`SELECT data FROM packages WHERE id=${body.id}`;
        if (!rows.length) throw new Error('Paket tidak ditemukan.');
        const prev = parseJson<Package>(rows[0].data);
        const updated: Package = {
          ...prev,
          name: body.name,
          speed: body.speed,
          price: body.price,
          tax: body.tax ?? prev.tax,
          status: body.status ?? prev.status
        };
        await sql`UPDATE packages SET data=${sql.json(updated)} WHERE id=${body.id}`;
        await log('Edit Paket', `Paket "${updated.name}" (${updated.provider}) diperbarui. Harga: Rp ${updated.price.toLocaleString('id-ID')}, Kecepatan: ${updated.speed} Mbps.`);
        return `Paket "${updated.name}" berhasil diperbarui.`;
      }
      const rows = await db()`UPDATE packages SET data=jsonb_set(data,'{status}','"verified"'::jsonb) WHERE id=${body.id} RETURNING id`;
      if (!rows.length) throw new Error('Paket tidak ditemukan.');
      return 'Paket ditandai sudah diperiksa. Harga lama tetap tersimpan untuk riwayat.';
    });
    return Response.json({ message });
  } catch (error) {
    console.error(error);
    return Response.json({
      error: error instanceof Error && !/postgres|password|connection|sql|fetch failed/i.test(error.message)
        ? error.message
        : 'Proses gagal. Periksa konfigurasi database atau URL website.'
    }, { status: 400 });
  }
}
