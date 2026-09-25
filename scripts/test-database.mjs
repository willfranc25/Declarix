import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema storage;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
grant usage on schema public,auth,storage to authenticated,anon,service_role;
grant execute on function auth.uid() to authenticated,anon,service_role;
grant all on all tables in schema storage to authenticated,anon,service_role;
alter default privileges in schema public grant all on tables to authenticated,anon,service_role;
alter default privileges in schema public grant all on sequences to authenticated,anon,service_role;
`);
await db.exec(
  await readFile(new URL("../supabase/bootstrap.sql", import.meta.url), "utf8"),
);
await db.exec(`create policy "Permitir todo en storage" on storage.objects for all using(bucket_id='images');`);
for (const file of (
  await readdir(new URL("../supabase/migrations/", import.meta.url))
).sort()) {
  const sql = (
    await readFile(
      new URL("../supabase/migrations/" + file, import.meta.url),
      "utf8",
    )
  ).replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/i, "");
  try {
    await db.exec(sql);
  } catch (err) {
    console.error("Migration failed:", file, err.message);
    throw err;
  }
}
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
await db.query("insert into auth.users(id,email) values($1,$2),($3,$4)", [
  a,
  "a@example.test",
  b,
  "b@example.test",
]);
assert.equal(
  (await db.query("select count(*)::int n from public.organizations")).rows[0]
    .n,
  0,
  "Signup must not create a company",
);
assert.equal(
  (await db.query("select count(*)::int n from public.accountant_accounts"))
    .rows[0].n,
  2,
);
async function asUser(id) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
async function admin() {
  await db.exec("reset role");
  await db.exec("set role service_role");
}
const fail = async (fn, pattern) => assert.rejects(fn, pattern);
await asUser(a);
const ca = (
  await db.query(
    "insert into public.organizations(name,plan_id,rut) values('Empresa A','free','76123456-0') returning id",
  )
).rows[0].id;
const ca2 = (
  await db.query(
    "insert into public.organizations(name,plan_id,rut) values('Empresa A2','free','76086428-5') returning id",
  )
).rows[0].id;
await asUser(b);
const cb = (
  await db.query(
    "insert into public.organizations(name,plan_id) values('Empresa B','free') returning id",
  )
).rows[0].id;
assert.equal(
  (await db.query("select count(*)::int n from public.organizations")).rows[0]
    .n,
  1,
);
assert.equal((await db.query("select count(*)::int n from pg_proc where proname='topup_credits'")).rows[0].n, 0);
assert.equal((await db.query("select count(*)::int n from pg_policies where schemaname='storage' and tablename='objects' and policyname='Permitir todo en storage'")).rows[0].n, 0, "The legacy public Storage policy must be removed");
await fail(
  () =>
    db.query(
      "insert into public.organizations(name,plan_id,accountant_id) values('X','free',$1)",
      [a],
    ),
  /row-level security/,
);
await asUser(a);
const inv = async (company, folio) =>
  db.query(
    `insert into public.invoices(user_id,organization_id,"providerName","providerRut","documentType","documentNumber",date,"netAmount","ivaAmount","totalAmount","expenseType","taxStatus",deleted)
 values($1,$2,'Proveedor','76123456-0','Factura',$3,'2026-01-01',1000,190,1190,'Insumos','reviewed',false) returning id,"updatedAt"`,
    [a, company, folio],
  );
const row = (await inv(ca, "1")).rows[0],
  iid = row.id;
await admin();
await db.query("insert into storage.objects(bucket_id,name) values('images',$1),('images',$2)", [iid + ".jpeg", "99999999-9999-4999-8999-999999999999.jpeg"]);
await asUser(a);
assert.equal((await db.query("select count(*)::int n from storage.objects where bucket_id='images' and name=$1", [iid + ".jpeg"])).rows[0].n, 1, "Owners can read their legacy root-level invoice image");
await asUser(b);
assert.equal((await db.query("select count(*)::int n from storage.objects where bucket_id='images'")).rows[0].n, 0, "Other users cannot read legacy images");
await db.exec("reset role");
await db.exec("set role anon");
assert.equal((await db.query("select count(*)::int n from storage.objects where bucket_id='images'")).rows[0].n, 0, "Anonymous users cannot read private invoice images");
await asUser(a);
await fail(() => inv(cb, "2"), /row-level security|permission denied/);
await fail(() => inv(ca, "0001"), /Ya existe/);
await inv(ca2, "1"); // Same issuer+folio is allowed in another company.
await db.query(
  "insert into public.period_closures(organization_id,period) values($1,'2026-01')",
  [ca],
);
await fail(
  () =>
    db.query('update public.invoices set "totalAmount"=2 where id=$1', [iid]),
  /período está cerrado/,
);
await db.query("delete from public.period_closures where organization_id=$1", [
  ca,
]);
await fail(
  () =>
    db.query('update public.invoices set "totalAmount"=2 where id=$1', [iid]),
  /montos no cuadran/,
);
await fail(
  () =>
    db.query("update public.invoices set organization_id=$1 where id=$2", [
      ca2,
      iid,
    ]),
  /reasignar/,
);
const exportId = (
  await db.query("select public.record_export($1,$2,$3,$4,$5) id", [
    ca,
    [iid],
    "test.zip",
    "abc",
    { [iid]: row.updatedAt },
  ])
).rows[0].id;
assert.ok(exportId);
assert.equal(
  (
    await db.query('select "taxStatus" s from public.invoices where id=$1', [
      iid,
    ])
  ).rows[0].s,
  "exported",
);
await asUser(b);
assert.equal(
  (await db.query("select count(*)::int n from public.invoices")).rows[0].n,
  0,
);
assert.equal(
  (await db.query("select count(*)::int n from public.invoice_audit")).rows[0]
    .n,
  0,
);
await admin();
const job = "33333333-3333-4333-8333-333333333333";
await db.query("select public.prepare_extraction($1,$2,$3,$4,$5,$6)", [
  a,
  ca,
  job,
  "invoice.png",
  "image/png",
  100,
]);
await db.query("select public.enqueue_extraction($1,$2,$3,$4)", [
  a,
  job,
  "sha256",
  20,
]);
await db.query("select public.enqueue_extraction($1,$2,$3,$4)", [
  a,
  job,
  "sha256",
  20,
]);
assert.equal(
  (
    await db.query(
      "select reserved from public.accountant_accounts where user_id=$1",
      [a],
    )
  ).rows[0].reserved,
  20,
);
const job2 = "44444444-4444-4444-8444-444444444444";
await db.query("select public.prepare_extraction($1,$2,$3,$4,$5,$6)", [
  a,
  ca,
  job2,
  "other.png",
  "image/png",
  100,
]);
await db.query("select public.enqueue_extraction($1,$2,$3,$4)", [a, job2, "hash2", 20]);
let claimed = (await db.query("select * from public.claim_extraction()")).rows;
assert.equal(claimed.length, 1);
assert.equal(
  (await db.query("select * from public.claim_extraction()")).rows.length,
  0,
  "Global pacing must reject another claim",
);
await db.query("select public.finish_extraction($1,$2,$3,$4,$5,$6)", [
  job,
  claimed[0].lease_token,
  { documents: [{ providerName: "P" }] },
  null,
  null,
  { model: "mock", estimatedUsd: 0.01 },
]);
await db.query("select public.finish_extraction($1,$2,$3,$4,$5,$6)", [
  job,
  claimed[0].lease_token,
  { documents: [] },
  null,
  null,
  { model: "mock", estimatedUsd: 0.01 },
]);
const account = (await db.query("select reserved from public.accountant_accounts where user_id=$1", [a])).rows[0];
assert.deepEqual(account, { reserved: 20 }, "Successful extraction releases the reservation without consuming a quota");
await asUser(a);
await fail(
  () =>
    db.query("update public.extraction_jobs set result='{}' where id=$1", [
      job,
    ]),
  /permission denied/,
);
await db.query(
  'select public.patch_job_review($1,0,\'{"notes":"revisado"}\')',
  [job],
);
await asUser(b);
await fail(
  () => db.query("select public.patch_job_review($1,0,'{}')", [job]),
  /not found or forbidden/,
);
await asUser(a);
await fail(
  () =>
    db.query(
      "insert into public.organizations(name,plan_id,rut) values('Invalid','free','ABC76123456-0')",
    ),
  /RUT inválido/,
);
await db.query("select public.patch_job_review($1,0,'{\"_dismissed\":true}')", [
  job,
]);
assert.equal(
  (
    await db.query("select status from public.extraction_jobs where id=$1", [
      job,
    ])
  ).rows[0].status,
  "saved",
  "Dismissed jobs leave the active queue",
);
await db.query("select public.patch_job_review($1,0,'{\"_dismissed\":true}')", [
  job,
]);
await db.query(
  `insert into public.invoices(user_id,organization_id,"providerName","providerRut","documentType","documentNumber",date,"netAmount","ivaAmount","totalAmount","expenseType","taxStatus",source_job_id,source_index)
values($1,$2,'Provider','76123456-0','Factura','123','2026-01-01',1000,190,1190,'Insumos','reviewed',$3,0)`,
  [a, ca, job],
);
await db.query("update public.invoices set notes=$1 where source_job_id=$2", [
  "Corrected after completion",
  job,
]);
await fail(
  () =>
    db.query(
      "update public.invoices set source_job_id=null where source_job_id=$1",
      [job],
    ),
  /cambiar el origen/,
);
await asUser(a);
await db.query("insert into public.organizations(name,plan_id) values('Empresa A3','free')");
console.log(
  "PASS: all migrations, two-account RLS, two-company isolation, closed periods, duplicate guards, export snapshots, extraction queue without billing quotas, provider pacing.",
);
await db.close();
