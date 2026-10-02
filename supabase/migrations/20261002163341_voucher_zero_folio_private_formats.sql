-- Private diagnostics; never exposed through table grants or editable user metadata.
create table private.developer_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
insert into private.developer_accounts(user_id)
select id from auth.users where lower(email)='williamfranc25@gmail.com' and email_confirmed_at is not null;

create table private.receipt_formats (
 fingerprint text primary key check(fingerprint ~ '^[a-f0-9]{64}$'),
 profile jsonb not null check(jsonb_typeof(profile)='object' and octet_length(profile::text)<3000),
 first_seen timestamptz not null default now(), last_seen timestamptz not null default now(),
 seen_count bigint not null default 0, issue_count bigint not null default 0,
 status text not null default 'new' check(status in ('new','needs_review','reviewed','ignored')),
 notes text not null default '' check(length(notes)<=2000), reviewed_by uuid references auth.users(id) on delete set null,
 reviewed_at timestamptz
);
create index receipt_formats_inbox_idx on private.receipt_formats(status,last_seen desc,fingerprint);
create table private.receipt_format_observations (
 job_id uuid not null references public.extraction_jobs(id) on delete cascade,
 document_index integer not null check(document_index between -1 and 99),
 fingerprint text not null references private.receipt_formats(fingerprint),
 issues jsonb not null default '[]' check(jsonb_typeof(issues)='array' and octet_length(issues::text)<2000),
 created_at timestamptz not null default now(),
 primary key(job_id,document_index)
);
create index receipt_format_samples_idx on private.receipt_format_observations(fingerprint,created_at desc);
create table private.receipt_format_access (
 id bigint generated always as identity primary key,
 actor_id uuid not null references auth.users(id) on delete cascade,
 job_id uuid references public.extraction_jobs(id) on delete set null,
 action text not null check(action in ('sample','review')),
 created_at timestamptz not null default now()
);
alter table private.developer_accounts enable row level security;
alter table private.receipt_formats enable row level security;
alter table private.receipt_format_observations enable row level security;
alter table private.receipt_format_access enable row level security;
revoke all on private.developer_accounts,private.receipt_formats,private.receipt_format_observations,private.receipt_format_access from public,anon,authenticated;
grant select on private.developer_accounts to service_role;
grant select,insert,update,delete on private.receipt_formats,private.receipt_format_observations to service_role;
grant select,insert on private.receipt_format_access to service_role;
grant usage on sequence private.receipt_format_access_id_seq to service_role;

create function public.developer_format_access(p_user uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from private.developer_accounts where user_id=p_user)
$$;

create function public.record_receipt_formats(p_job uuid,p_lease uuid,p_entries jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
declare j public.extraction_jobs; e jsonb; inserted integer; idx integer; begin
 select * into j from public.extraction_jobs where id=p_job for update;
 if j.id is null or j.status not in ('ready','saved','failed') or j.lease_token is distinct from p_lease then return false; end if;
 if jsonb_typeof(p_entries)<>'array' or jsonb_array_length(p_entries)>100 then raise exception 'Invalid format entries'; end if;
 for e in select value from jsonb_array_elements(p_entries) order by value->>'fingerprint' loop
  idx=(e->>'index')::integer;
  if (j.status='failed' and idx<>-1) or (j.status<>'failed' and (idx<0 or idx>=jsonb_array_length(j.result->'documents'))) then raise exception 'Invalid format source'; end if;
  -- Lock one format at a time; registration is idempotent per job/document.
  insert into private.receipt_formats(fingerprint,profile) values(e->>'fingerprint',e->'profile') on conflict do nothing;
  insert into private.receipt_format_observations(job_id,document_index,fingerprint,issues)
   values(j.id,idx,e->>'fingerprint',e->'issues') on conflict do nothing;
  get diagnostics inserted=row_count;
  if inserted=1 then
   update private.receipt_formats set last_seen=now(),seen_count=seen_count+1,
    issue_count=issue_count+case when jsonb_array_length(e->'issues')>0 then 1 else 0 end,
    status=case when jsonb_array_length(e->'issues')>0 and status<>'ignored' then 'needs_review' else status end
    where fingerprint=e->>'fingerprint';
  end if;
 end loop;
 return true;
end $$;

create function public.developer_format_inbox(p_user uuid,p_status text default '',p_offset integer default 0) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare rows jsonb; total bigint; begin
 if not public.developer_format_access(p_user) then raise exception 'DEVELOPER_FORBIDDEN'; end if;
 if p_offset<0 or p_status not in ('','new','needs_review','reviewed','ignored') then raise exception 'Invalid inbox filter'; end if;
 select count(*) into total from private.receipt_formats where p_status='' or status=p_status;
 select coalesce(jsonb_agg(to_jsonb(f)),'[]') into rows from (
  select c.*, (select coalesce(jsonb_agg(to_jsonb(s)),'[]') from (
   select o.job_id,o.document_index,o.issues,o.created_at,j.filename,j.mime_type
   from private.receipt_format_observations o join public.extraction_jobs j on j.id=o.job_id
   where o.fingerprint=c.fingerprint order by (jsonb_array_length(o.issues)>0) desc,o.created_at desc limit 3
  ) s) samples from private.receipt_formats c where p_status='' or c.status=p_status
  order by c.last_seen desc,c.fingerprint limit 25 offset p_offset
 ) f;
 return jsonb_build_object('rows',rows,'total',total);
end $$;

create function public.review_receipt_format(p_user uuid,p_fingerprint text,p_status text,p_notes text) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 if not public.developer_format_access(p_user) then raise exception 'DEVELOPER_FORBIDDEN'; end if;
 if p_status not in ('needs_review','reviewed','ignored') then raise exception 'Invalid review status'; end if;
 update private.receipt_formats set status=p_status,notes=p_notes,reviewed_by=p_user,reviewed_at=now() where fingerprint=p_fingerprint;
 if not found then return false; end if;
 insert into private.receipt_format_access(actor_id,action) values(p_user,'review');
 return true;
end $$;

create function public.developer_format_sample(p_user uuid,p_job uuid,p_index integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare sample jsonb; begin
 if not public.developer_format_access(p_user) then raise exception 'DEVELOPER_FORBIDDEN'; end if;
 select jsonb_build_object('path',j.object_path,'mimeType',j.mime_type,'filename',j.filename,
  'document',j.result->'documents'->p_index,'review',j.review->p_index::text,'issues',o.issues)
 into sample from private.receipt_format_observations o join public.extraction_jobs j on j.id=o.job_id
 where o.job_id=p_job and o.document_index=p_index;
 if sample is not null then insert into private.receipt_format_access(actor_id,job_id,action) values(p_user,p_job,'sample'); end if;
 return sample;
end $$;

revoke all on function public.developer_format_access(uuid),public.record_receipt_formats(uuid,uuid,jsonb),public.developer_format_inbox(uuid,text,integer),public.review_receipt_format(uuid,text,text,text),public.developer_format_sample(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.developer_format_access(uuid),public.record_receipt_formats(uuid,uuid,jsonb),public.developer_format_inbox(uuid,text,integer),public.review_receipt_format(uuid,text,text,text),public.developer_format_sample(uuid,uuid,integer) to service_role;

-- Capture manual corrections as field names, not duplicated personal values.
create function private.capture_format_corrections() returns trigger
language plpgsql security definer set search_path='' as $$
declare o private.receipt_format_observations; k text; problems jsonb; changed boolean; begin
 for o in select * from private.receipt_format_observations where job_id=new.id and document_index>=0 loop
  problems=o.issues; changed=false;
  foreach k in array array['providerName','providerRut','documentType','documentNumber','date','netAmount','ivaAmount','totalAmount'] loop
   if new.review->o.document_index::text ? k and
      new.review->o.document_index::text->k is distinct from old.review->o.document_index::text->k and
      new.review->o.document_index::text->k is distinct from new.result->'documents'->o.document_index->k and
      not (k='documentNumber' and new.result->'documents'->o.document_index->>'documentType'='Comprobante de pago electrónico' and new.review->o.document_index::text->>k='0000') then
    if not problems ? ('corrected:'||k) then problems=problems||jsonb_build_array('corrected:'||k); end if;
    changed=true;
   end if;
  end loop;
  if changed then
   update private.receipt_format_observations set issues=problems where job_id=o.job_id and document_index=o.document_index;
   update private.receipt_formats set issue_count=issue_count+case when jsonb_array_length(o.issues)=0 then 1 else 0 end,
    status=case when status='ignored' then status else 'needs_review' end where fingerprint=o.fingerprint;
  end if;
 end loop;
 return new;
end $$;
revoke all on function private.capture_format_corrections() from public,anon,authenticated;
create trigger receipt_format_corrections after update of review on public.extraction_jobs
for each row execute function private.capture_format_corrections();

-- Preserve ownership, provenance and closed-period checks.
create or replace function private.invoice_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare target public.invoices; begin
 if tg_op='DELETE' then target=old; else target=new; end if;
 if tg_op='UPDATE' and old.organization_id is not null and (new.organization_id is distinct from old.organization_id or new.user_id<>old.user_id or new.id<>old.id) then raise exception 'No se puede reasignar el propietario o la empresa de un comprobante'; end if;
 if tg_op='UPDATE' and (new.source_job_id is distinct from old.source_job_id or new.source_index is distinct from old.source_index) then raise exception 'No se puede cambiar el origen'; end if;
 -- Lock company row to serialize closing a period with invoice mutations.
 perform id from public.organizations where id=target.organization_id for update;
 if exists(select 1 from public.period_closures where organization_id=target.organization_id and period=left(target.date,7)) or
   (tg_op='UPDATE' and exists(select 1 from public.period_closures where organization_id=old.organization_id and period=left(old.date,7))) then raise exception 'El período está cerrado. Reábrelo antes de modificar comprobantes'; end if;
 if tg_op<>'DELETE' then
  if new."totalAmount" is null or new."totalAmount"<=0 then raise exception 'El total debe ser positivo'; end if;
  if new.date is null or new.date !~ '^\d{4}-\d{2}-\d{2}$' or to_char(new.date::date,'YYYY-MM-DD')<>new.date then raise exception 'Fecha inválida'; end if;
  if new.date::date > (now() at time zone 'America/Santiago')::date then raise exception 'Fecha futura'; end if;
  if new."documentType"='Comprobante de pago electrónico' then new."documentNumber"='0000'; end if;
  if not private.valid_rut(new."providerRut") or new."documentNumber" is null or btrim(new."documentNumber")='' then raise exception 'RUT y folio son obligatorios'; end if;
  if least(new."netAmount",new."ivaAmount",new."specificTax",new."exemptAmount",new."otherTax",new."withholdingAmount")<0 then raise exception 'Los montos originales no pueden ser negativos'; end if;
  if exists(select 1 from public.invoices i where i.organization_id=new.organization_id and i.id<>new.id and not coalesce(i.deleted,false) and regexp_replace(upper(i."providerRut"),'[^0-9K]','','g')=regexp_replace(upper(new."providerRut"),'[^0-9K]','','g') and replace(i."documentType",' Electrónica','')=replace(new."documentType",' Electrónica','') and ((new."documentType"<>'Comprobante de pago electrónico' and ltrim(i."documentNumber",'0')=ltrim(new."documentNumber",'0')) or
 (new."documentType"='Comprobante de pago electrónico' and nullif(btrim(new."referenceNumber"),'') is not null
 and btrim(i."referenceNumber")=btrim(new."referenceNumber") and i.date=new.date and i."totalAmount"=new."totalAmount"))) then raise exception 'Ya existe ese emisor, tipo y folio en esta empresa'; end if;
  if new.source_job_id is not null then
   if tg_op='UPDATE' and (new.source_job_id is distinct from old.source_job_id or new.source_index is distinct from old.source_index) then raise exception 'No se puede cambiar el origen'; end if;
   select result->'documents'->new.source_index,object_path into new.extracted_original,new."imagePath" from public.extraction_jobs
   where id=new.source_job_id and organization_id=new.organization_id and user_id=new.user_id and status in ('ready','saved') and new.source_index>=0 and new.source_index<jsonb_array_length(result->'documents');
   if not found then raise exception 'Origen inválido'; end if;
  end if;
  if new."documentType" is null or btrim(new."expenseType")='' or new."expenseType" is null or btrim(new."providerName")='' or new."providerName" is null then raise exception 'Completa proveedor, documento y categoría'; end if;
  if new."documentType" ~* 'factura|nota de cr[eé]dito|nota de d[eé]bito' and
    (new."netAmount" is null or new."ivaAmount" is null or abs(coalesce(new."netAmount",0)+coalesce(new."exemptAmount",0)+coalesce(new."ivaAmount",0)+coalesce(new."specificTax",0)+coalesce(new."otherTax",0)-coalesce(new."withholdingAmount",0)-new."totalAmount")>2) then raise exception 'Los montos no cuadran con el total'; end if;
  if new."taxStatus"='declared' then new.declared_at=coalesce(new.declared_at,now()); end if;
  if tg_op='UPDATE' then new."updatedAt"=clock_timestamp(); end if;
  target=new;
 end if;
 return target;
end $$;
