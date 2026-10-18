import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

// Offline data-restore rehearsal for a trusted pg_dump. Never connects to prod.
// Hosted Auth, RLS, extensions and object bytes need a separate Supabase drill.
const path = process.argv[2];
if (!path) throw new Error('Usage: node scripts/verify-backup.mjs backup.sql[.gz]');
const bytes = await readFile(path);
const dump = (path.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8');
const tables = [
  'public.invoices', 'public.extraction_jobs', 'public.invoice_audit',
  'public.accountant_accounts', 'storage.objects',
];
const db = new PGlite();
const restored = {};
try {
  await db.exec('create schema storage');
  for (const table of tables) {
    const escaped = table.replaceAll('.', '\\.');
    const ddl = dump.match(new RegExp(`CREATE TABLE ${escaped} \\([\\s\\S]+?\\n\\);`));
    const copy = dump.match(new RegExp(`^COPY ${escaped} \\([^\\n]+\\) FROM stdin;\\n([\\s\\S]*?)^\\\\\\.$`, 'm'));
    assert.ok(ddl && copy, `Missing schema or COPY section: ${table}`);
    await db.exec(ddl[0]);
    const command = copy[0].slice(0, copy[0].indexOf('\n'))
      .replace('FROM stdin', "FROM '/dev/blob'");
    await db.exec(command, { blob: new Blob([copy[1]]) });
    const expected = copy[1] ? copy[1].split('\n').length - 1 : 0;
    const [{ rows }] = await db.exec(`select count(*)::int as count from ${table}`);
    assert.equal(rows[0].count, expected, `Incomplete data restoration: ${table}`);
    const { rows: digestRows } = await db.query(`
      select md5(coalesce(string_agg(row_to_json(t)::text, E'\n' order by row_to_json(t)::text),'')) as digest
      from ${table} t`);
    restored[table] = { rows: expected, digest: digestRows[0].digest };
  }
  const { rows } = await db.query(`
    select
      (select count(*) from public.extraction_jobs j
       where j.cleaned_at is null and j.status not in ('cancelled','uploading')
       and not exists(select 1 from storage.objects o
         where o.bucket_id='documents' and o.name=j.object_path))::int as missing_original_metadata,
      (select count(*) from public.invoices i where i.source_job_id is not null
       and not exists(select 1 from public.extraction_jobs j where j.id=i.source_job_id))::int as orphan_sources,
      (select count(*) from public.accountant_accounts a where a.reserved <>
        (select coalesce(sum(j.pages_reserved),0) from public.extraction_jobs j where j.user_id=a.user_id))::int as reservation_mismatches`);
  for (const [key, value] of Object.entries(rows[0])) assert.equal(value, 0, key);
  const { rows: financial } = await db.query(`
    select md5(string_agg(concat_ws('|',id::text,"providerRut","documentNumber",
      coalesce("totalAmount"::text,''),coalesce("netAmount"::text,''),coalesce("ivaAmount"::text,''),
      coalesce("taxStatus",''),coalesce(deleted,false)::text),E'\n' order by id)) as financial_state_digest
    from public.invoices`);
  console.log(JSON.stringify({
    scope: 'Offline table data and storage metadata; not object bytes or hosted services',
    dumpSha256: createHash('sha256').update(dump).digest('hex'),
    restored, integrity: rows[0], financialStateDigest: financial[0].financial_state_digest,
  }, null, 2));
} finally {
  await db.close();
}
