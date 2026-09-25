-- Accountant owns a portfolio. Existing organizations remain intact as companies.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create table public.accountant_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 status text not null default 'active' check(status in ('active','suspended')),
 reserved integer not null default 0 check(reserved >= 0),
 storage_bytes bigint not null default 0 check(storage_bytes >= 0),
 storage_limit_bytes bigint not null default 524288000,
 created_at timestamptz not null default now()
);
insert into public.accountant_accounts(user_id) select id from auth.users on conflict do nothing;
alter table public.accountant_accounts enable row level security;
create policy account_read on public.accountant_accounts for select to authenticated using(user_id=(select auth.uid()));
grant select on public.accountant_accounts to authenticated;
revoke insert, update, delete on public.accountant_accounts from anon, authenticated;
grant all on public.accountant_accounts to service_role;

alter table public.organizations add column accountant_id uuid references auth.users(id);
alter table public.organizations add column rut text;
alter table public.organizations add column archived boolean not null default false;
alter table public.organizations add column categories jsonb not null default '[]';
alter table public.organizations add column provider_rules jsonb not null default '{}';
alter table public.organizations add column cost_centers jsonb not null default '[]';
update public.organizations set accountant_id=created_by;
-- Refuse ambiguous ownership rather than assign somebody else's records.
do $$ begin
 if exists(select 1 from public.organizations where accountant_id is null) then raise exception 'Resolve companies without a creator before migration'; end if;
end $$;
alter table public.organizations alter column accountant_id set not null;
alter table public.organizations alter column accountant_id set default auth.uid();
alter table public.organizations alter column created_by set default auth.uid();
create index companies_accountant_idx on public.organizations(accountant_id, archived);
create unique index companies_accountant_rut_key on public.organizations(accountant_id, rut) where rut is not null;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.accountant_accounts(user_id) values(new.id); return new; end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create function private.owns_company(company uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.organizations where id=company and accountant_id=auth.uid());
$$;
create function private.can_edit_company(company uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.organizations where id=company and accountant_id=auth.uid() and not archived);
$$;
revoke all on function private.owns_company(uuid), private.can_edit_company(uuid) from public, anon;
grant execute on function private.owns_company(uuid), private.can_edit_company(uuid) to authenticated, service_role;

-- Remove legacy OR-owner policies: revoked memberships must never grant access.
do $$ declare p record; begin
 for p in select schemaname,tablename,policyname from pg_policies where schemaname='public' and tablename in ('organizations','organization_members','invoices','mappings','templates','usage_events') loop
  execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);
 end loop;
end $$;
create policy company_read on public.organizations for select to authenticated using(accountant_id=(select auth.uid()));
create policy company_create on public.organizations for insert to authenticated with check(accountant_id=(select auth.uid()) and created_by=(select auth.uid()) and plan_id='free');
create policy company_update on public.organizations for update to authenticated using(accountant_id=(select auth.uid())) with check(accountant_id=(select auth.uid()));
grant select, insert on public.organizations to authenticated;
revoke update, delete on public.organizations from authenticated;
grant update(name,rut,archived,categories,provider_rules,cost_centers) on public.organizations to authenticated;
create policy membership_history_read on public.organization_members for select to authenticated using(private.owns_company(organization_id));
revoke insert,update,delete on public.organization_members from authenticated;

-- Keep legacy rows visible only to their owner until explicitly assigned.
create policy invoice_read on public.invoices for select to authenticated using(private.owns_company(organization_id) or (organization_id is null and user_id=(select auth.uid())));
create policy invoice_insert on public.invoices for insert to authenticated with check(user_id=(select auth.uid()) and private.can_edit_company(organization_id));
create policy invoice_update on public.invoices for update to authenticated using(private.can_edit_company(organization_id)) with check(user_id=(select auth.uid()) and private.can_edit_company(organization_id));
create policy invoice_delete on public.invoices for delete to authenticated using(private.can_edit_company(organization_id));
create policy mapping_access on public.mappings for all to authenticated using(private.owns_company(organization_id)) with check(user_id=(select auth.uid()) and private.can_edit_company(organization_id));
create policy template_access on public.templates for all to authenticated using(private.owns_company(organization_id)) with check(user_id=(select auth.uid()) and private.can_edit_company(organization_id));
create policy usage_read on public.usage_events for select to authenticated using(user_id=(select auth.uid()));
grant select,insert,update,delete on public.invoices,public.mappings,public.templates to authenticated;

alter table public.invoices add column if not exists "exemptAmount" numeric;
alter table public.invoices add column if not exists "otherTax" numeric;
alter table public.invoices add column if not exists "withholdingAmount" numeric;
alter table public.invoices add column if not exists "recipientRut" text;
alter table public.invoices add column if not exists "documentCode" integer;
alter table public.invoices add column if not exists "referenceNumber" text;
alter table public.invoices add column if not exists "costCenter" text;
alter table public.invoices add column if not exists extracted_original jsonb;
alter table public.invoices add column if not exists source_job_id uuid;
alter table public.invoices add column if not exists source_index integer;
alter table public.invoices add column if not exists reviewed_at timestamptz;
alter table public.invoices add column if not exists exported_at timestamptz;
alter table public.invoices add column if not exists declared_at timestamptz;
alter table public.invoices drop constraint if exists "invoices_taxStatus_check";
alter table public.invoices add constraint "invoices_taxStatus_check" check("taxStatus" in ('pending','reviewed','exported','declared'));
create unique index invoice_source_once on public.invoices(source_job_id,source_index) where source_job_id is not null;
create index invoice_company_date_idx on public.invoices(organization_id,date,id);

create table public.period_closures (
 organization_id uuid references public.organizations(id), period text check(period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 closed_at timestamptz not null default now(), user_id uuid not null default auth.uid() references auth.users(id),
 primary key(organization_id,period)
);
create table public.invoice_audit (
 id bigint generated always as identity primary key, organization_id uuid not null, invoice_id uuid not null,
 actor_id uuid, operation text not null, before_data jsonb, after_data jsonb, created_at timestamptz not null default now()
);
create table public.document_comments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 invoice_id uuid not null references public.invoices(id) on delete cascade, user_id uuid not null default auth.uid(),
 body text not null check(length(body) between 1 and 2000), created_at timestamptz not null default now()
);
create table public.company_settings (
 organization_id uuid references public.organizations(id), key text, value jsonb,
 primary key(organization_id,key)
);
create table public.export_batches (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), user_id uuid not null default auth.uid(),
 filename text not null, snapshot jsonb not null, template_hash text, totals jsonb not null, created_at timestamptz not null default now()
);
do $$ declare tbl text; begin
 foreach tbl in array array['period_closures','document_comments','company_settings','export_batches'] loop
  execute format('alter table public.%I enable row level security',tbl);
  execute format('create policy company_read on public.%I for select to authenticated using(private.owns_company(organization_id))',tbl);
  execute format('create policy company_insert on public.%I for insert to authenticated with check(private.can_edit_company(organization_id))',tbl);
  execute format('grant select,insert on public.%I to authenticated',tbl);
  execute format('grant all on public.%I to service_role',tbl);
 end loop;
end $$;
create policy company_setting_update on public.company_settings for update to authenticated using(private.can_edit_company(organization_id)) with check(private.can_edit_company(organization_id));
grant update on public.company_settings to authenticated;
create policy reopen_period on public.period_closures for delete to authenticated using(private.can_edit_company(organization_id));
grant delete on public.period_closures to authenticated;
alter table public.invoice_audit enable row level security;
create policy audit_read on public.invoice_audit for select to authenticated using(private.owns_company(organization_id));
grant select on public.invoice_audit to authenticated;
grant all on public.invoice_audit to service_role;
create index audit_invoice_idx on public.invoice_audit(invoice_id,created_at desc);


create function private.valid_rut(value text) returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare v text; body text; digit text; sum integer=0; factor integer=2; i integer; expected text; begin
 v=regexp_replace(upper(coalesce(value,'')),'[.\s-]','','g');
 if v !~ '^[0-9]{7,8}[0-9K]$' then return false; end if;
 body=left(v,length(v)-1); digit=right(v,1);
 if body::bigint=0 then return false; end if;
 for i in reverse length(body)..1 loop sum=sum+substring(body,i,1)::integer*factor; factor=case when factor=7 then 2 else factor+1 end; end loop;
 expected=case 11-(sum%11) when 11 then '0' when 10 then 'K' else (11-(sum%11))::text end;
 return digit=expected;
end $$;
revoke all on function private.valid_rut(text) from public,anon;
grant execute on function private.valid_rut(text) to authenticated,service_role;

-- Deterministically attach orphaned legacy invoices when a single owned company exists.
update public.invoices i set organization_id=(select min(o.id::text)::uuid from public.organizations o where o.accountant_id=i.user_id)
where i.organization_id is null and (select count(*) from public.organizations o where o.accountant_id=i.user_id)=1;

create function private.invoice_guard() returns trigger language plpgsql security invoker set search_path='' as $$
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
  if not private.valid_rut(new."providerRut") or new."documentNumber" is null or btrim(new."documentNumber")='' then raise exception 'RUT y folio son obligatorios'; end if;
  if least(new."netAmount",new."ivaAmount",new."specificTax",new."exemptAmount",new."otherTax",new."withholdingAmount")<0 then raise exception 'Los montos originales no pueden ser negativos'; end if;
  if exists(select 1 from public.invoices i where i.organization_id=new.organization_id and i.id<>new.id and not coalesce(i.deleted,false) and regexp_replace(upper(i."providerRut"),'[^0-9K]','','g')=regexp_replace(upper(new."providerRut"),'[^0-9K]','','g') and replace(i."documentType",' Electrónica','')=replace(new."documentType",' Electrónica','') and ltrim(i."documentNumber",'0')=ltrim(new."documentNumber",'0')) then raise exception 'Ya existe ese emisor, tipo y folio en esta empresa'; end if;
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
create trigger accountant_invoice_guard before insert or update or delete on public.invoices for each row execute function private.invoice_guard();

create function private.audit_invoice() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if coalesce(new.organization_id,old.organization_id) is null then return coalesce(new,old); end if;
 insert into public.invoice_audit(organization_id,invoice_id,actor_id,operation,before_data,after_data)
 values(coalesce(new.organization_id,old.organization_id),coalesce(new.id,old.id),auth.uid(),tg_op,case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);
 return coalesce(new,old);
end $$;
revoke all on function private.audit_invoice() from public,anon,authenticated;
create trigger accountant_invoice_audit after insert or update or delete on public.invoices for each row execute function private.audit_invoice();

create function private.close_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.user_id<>auth.uid() then raise exception 'Usuario inválido'; end if;
 perform id from public.organizations where id=new.organization_id for update;
 if exists(select 1 from public.invoices where organization_id=new.organization_id and left(date,7)=new.period and "taxStatus"='pending' and not coalesce(deleted,false)) then raise exception 'Revisa los comprobantes pendientes antes de cerrar'; end if;
 return new;
end $$;
create trigger closing_guard before insert on public.period_closures for each row execute function private.close_guard();

create table public.extraction_jobs (
 id uuid primary key, user_id uuid not null references auth.users(id), organization_id uuid not null references public.organizations(id),
 object_path text not null unique, filename text not null, mime_type text not null, file_bytes bigint not null check(file_bytes between 1 and 20971520),
 content_hash text, status text not null default 'uploading' check(status in ('uploading','queued','processing','ready','failed','cancelled','saved')),
 pages integer not null default 1, pages_reserved integer not null default 0, attempts integer not null default 0,
 result jsonb, review jsonb not null default '{}', error_code text, error_message text,
 available_at timestamptz not null default now(), lease_until timestamptz, lease_token uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index extraction_hash_key on public.extraction_jobs(organization_id,content_hash) where content_hash is not null and status not in ('cancelled','failed');
create index extraction_work_idx on public.extraction_jobs(available_at,created_at) where status in ('queued','processing');
create index extraction_company_idx on public.extraction_jobs(organization_id,created_at desc);
alter table public.extraction_jobs enable row level security;
create policy job_read on public.extraction_jobs for select to authenticated using(user_id=(select auth.uid()) and private.owns_company(organization_id));
create policy job_review on public.extraction_jobs for update to authenticated using(user_id=(select auth.uid()) and private.can_edit_company(organization_id) and status='ready') with check(user_id=(select auth.uid()) and private.can_edit_company(organization_id) and status='ready');
grant select on public.extraction_jobs to authenticated;
revoke insert,update,delete on public.extraction_jobs from authenticated,anon;
grant update(review) on public.extraction_jobs to authenticated;
grant all on public.extraction_jobs to service_role;
alter table public.invoices add constraint invoice_source_job_fk foreign key(source_job_id) references public.extraction_jobs(id);

create table public.extraction_attempts (
 id uuid primary key default gen_random_uuid(), job_id uuid not null references public.extraction_jobs(id), user_id uuid not null,
 organization_id uuid not null, model text not null, prompt_tokens integer not null default 0, output_tokens integer not null default 0,
 thinking_tokens integer not null default 0, estimated_usd numeric(14,8) not null default 0,
 duration_ms integer, outcome text not null, created_at timestamptz not null default now()
);
alter table public.extraction_attempts enable row level security;
create policy attempts_read on public.extraction_attempts for select to authenticated using(user_id=(select auth.uid()));
grant select on public.extraction_attempts to authenticated;
grant all on public.extraction_attempts to service_role;
-- Global pacing and conservative estimated budget reservation, controlled only by service_role.
create table private.ai_control(id boolean primary key default true check(id), paused boolean not null default false,
 next_start timestamptz not null default now(), max_concurrent integer not null default 2, min_interval_seconds integer not null default 7,
 daily_budget_usd numeric not null default 5, attempt_reservation_usd numeric not null default 0.50,
 spent_today numeric not null default 0, reserved_usd numeric not null default 0, budget_day date not null default current_date);
insert into private.ai_control(id) values(true);
create table private.account_dispatch(user_id uuid primary key references auth.users(id) on delete cascade,last_started timestamptz not null);
grant all on private.account_dispatch to service_role;

create function public.prepare_extraction(p_user uuid,p_company uuid,p_id uuid,p_name text,p_mime text,p_bytes bigint) returns public.extraction_jobs language plpgsql security invoker set search_path='' as $$
declare a public.accountant_accounts; j public.extraction_jobs; begin
 select * into a from public.accountant_accounts where user_id=p_user for update;
 if a.user_id is null or a.status='suspended' then raise exception 'ACCOUNT_DISABLED'; end if;
 if not exists(select 1 from public.organizations where id=p_company and accountant_id=p_user and not archived) then raise exception 'COMPANY_FORBIDDEN'; end if;
 if p_bytes<1 or p_bytes>20971520 or a.storage_bytes+p_bytes>a.storage_limit_bytes then raise exception 'STORAGE_LIMIT'; end if;
 if (select count(*) from public.extraction_jobs where user_id=p_user and status in ('uploading','cancelled') and cleaned_at is null)>=20 then raise exception 'UPLOAD_LIMIT'; end if;
 insert into public.extraction_jobs(id,user_id,organization_id,object_path,filename,mime_type,file_bytes)
 values(p_id,p_user,p_company,p_user::text||'/'||p_company::text||'/'||p_id::text,p_name,p_mime,p_bytes) returning * into j;
 update public.accountant_accounts set storage_bytes=storage_bytes+p_bytes where user_id=p_user;
 return j;
end $$;
create function public.enqueue_extraction(p_user uuid,p_job uuid,p_hash text,p_pages integer) returns public.extraction_jobs language plpgsql security invoker set search_path='' as $$
declare a public.accountant_accounts; j public.extraction_jobs; begin
 select * into a from public.accountant_accounts where user_id=p_user for update;
 select * into j from public.extraction_jobs where id=p_job and user_id=p_user for update;
 if j.id is null then raise exception 'JOB_NOT_FOUND'; end if;
 if j.status<>'uploading' then return j; end if;
 if a.status='suspended' then raise exception 'ACCOUNT_DISABLED'; end if;
 if p_pages not between 1 and 100 then raise exception 'INVALID_PAGE_COUNT'; end if;
 update public.accountant_accounts set reserved=reserved+p_pages where user_id=p_user;
 update public.extraction_jobs set status='queued',content_hash=p_hash,pages=p_pages,pages_reserved=p_pages,updated_at=now() where id=j.id returning * into j;
 return j;
end $$;
create function public.claim_extraction() returns setof public.extraction_jobs language plpgsql security invoker set search_path='' as $$
declare c private.ai_control; j public.extraction_jobs; begin
 select * into c from private.ai_control where id for update;
 if c.budget_day<>current_date then update private.ai_control set budget_day=current_date,spent_today=0 where id; c.spent_today=0; end if;
 if c.paused or c.next_start>now() or c.spent_today+c.reserved_usd+c.attempt_reservation_usd>c.daily_budget_usd then return; end if;
 if (select count(*) from public.extraction_jobs where status='processing' and lease_until>now())>=c.max_concurrent then return; end if;
 select * into j from public.extraction_jobs q where status='queued' and available_at<=now() and exists(select 1 from public.accountant_accounts a where a.user_id=q.user_id and a.status<>'suspended') and exists(select 1 from public.organizations o where o.id=q.organization_id and not o.archived)
 order by coalesce((select d.last_started from private.account_dispatch d where d.user_id=q.user_id),'-infinity'::timestamptz),available_at,created_at for update skip locked limit 1;
 if j.id is null then return; end if;
 insert into private.account_dispatch(user_id,last_started) values(j.user_id,now()) on conflict(user_id) do update set last_started=excluded.last_started;
 update private.ai_control set next_start=now()+make_interval(secs=>c.min_interval_seconds),reserved_usd=reserved_usd+c.attempt_reservation_usd where id;
 return query update public.extraction_jobs set status='processing',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes',updated_at=now() where id=j.id returning *;
end $$;
create function public.claim_extraction(p_user uuid) returns setof public.extraction_jobs language plpgsql security invoker set search_path='' as $$
declare c private.ai_control; j public.extraction_jobs; begin
 select * into c from private.ai_control where id for update;
 if c.budget_day<>current_date then update private.ai_control set budget_day=current_date,spent_today=0 where id; c.spent_today=0; end if;
 if c.paused or c.next_start>now() or c.spent_today+c.reserved_usd+c.attempt_reservation_usd>c.daily_budget_usd then return; end if;
 if (select count(*) from public.extraction_jobs where status='processing' and lease_until>now())>=c.max_concurrent then return; end if;
 select * into j from public.extraction_jobs q where q.user_id=p_user and q.status='queued' and q.available_at<=now() and exists(select 1 from public.accountant_accounts a where a.user_id=q.user_id and a.status<>'suspended') and exists(select 1 from public.organizations o where o.id=q.organization_id and not o.archived)
 order by coalesce((select d.last_started from private.account_dispatch d where d.user_id=q.user_id),'-infinity'::timestamptz),q.available_at,q.created_at for update skip locked limit 1;
 if j.id is null then return; end if;
 insert into private.account_dispatch(user_id,last_started) values(j.user_id,now()) on conflict(user_id) do update set last_started=excluded.last_started;
 update private.ai_control set next_start=now()+make_interval(secs=>c.min_interval_seconds),reserved_usd=reserved_usd+c.attempt_reservation_usd where id;
 return query update public.extraction_jobs set status='processing',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes',updated_at=now() where id=j.id returning *;
end $$;
create function public.finish_extraction(p_job uuid,p_lease uuid,p_result jsonb,p_error text,p_retry_seconds integer,p_metrics jsonb) returns boolean language plpgsql security invoker set search_path='' as $$
declare j public.extraction_jobs; c private.ai_control; begin
 select * into c from private.ai_control where id for update;
 select * into j from public.extraction_jobs where id=p_job;
 if j.id is null then return false; end if;
 perform user_id from public.accountant_accounts where user_id=j.user_id for update;
 select * into j from public.extraction_jobs where id=p_job for update;
 if j.status<>'processing' or j.lease_token is distinct from p_lease then return false; end if;
 insert into public.extraction_attempts(job_id,user_id,organization_id,model,prompt_tokens,output_tokens,thinking_tokens,estimated_usd,duration_ms,outcome)
 values(j.id,j.user_id,j.organization_id,coalesce(p_metrics->>'model','unknown'),coalesce((p_metrics->>'promptTokens')::int,0),coalesce((p_metrics->>'outputTokens')::int,0),coalesce((p_metrics->>'thinkingTokens')::int,0),coalesce((p_metrics->>'estimatedUsd')::numeric,0),coalesce((p_metrics->>'durationMs')::int,0),case when p_result is not null then 'success' else coalesce(p_error,'unknown') end);
 update private.ai_control set reserved_usd=greatest(0,reserved_usd-c.attempt_reservation_usd),spent_today=spent_today+coalesce((p_metrics->>'estimatedUsd')::numeric,c.attempt_reservation_usd) where id;
 if p_result is not null then
  update public.accountant_accounts set reserved=reserved-j.pages_reserved where user_id=j.user_id;
  update public.extraction_jobs set status='ready',result=p_result,pages_reserved=0,lease_until=null,error_code=null,error_message=null,updated_at=now() where id=j.id;
 elsif p_retry_seconds is not null and j.attempts<4 then
  update public.extraction_jobs set status='queued',available_at=now()+make_interval(secs=>greatest(1,p_retry_seconds)),lease_until=null,error_code=p_error,updated_at=now() where id=j.id;
 else
  update public.accountant_accounts set reserved=reserved-j.pages_reserved where user_id=j.user_id;
  update public.extraction_jobs set status='failed',pages_reserved=0,lease_until=null,error_code=p_error,error_message='No se pudo procesar. Puedes reintentar o cargar un archivo más legible.',updated_at=now() where id=j.id;
 end if;
 return true;
end $$;
create function public.recover_extractions() returns integer language plpgsql security invoker set search_path='' as $$
declare j public.extraction_jobs; n int=0; begin
 for j in select * from public.extraction_jobs where status='processing' and lease_until<now() loop
  perform public.finish_extraction(j.id,j.lease_token,null,'WORKER_TIMEOUT',60,'{}'); n=n+1;
 end loop; return n;
end $$;
create function public.cancel_extraction(p_user uuid,p_job uuid) returns text language plpgsql security invoker set search_path='' as $$
declare j public.extraction_jobs; begin
 perform user_id from public.accountant_accounts where user_id=p_user for update;
 select * into j from public.extraction_jobs where id=p_job and user_id=p_user for update;
 if j.id is null then raise exception 'JOB_NOT_FOUND'; end if;
 if j.status='processing' then raise exception 'JOB_PROCESSING'; end if;
 if j.status in ('cancelled','saved','ready') then raise exception 'JOB_NOT_CANCELLABLE'; end if;
 update public.accountant_accounts set reserved=reserved-j.pages_reserved where user_id=p_user;
 update public.extraction_jobs set status='cancelled',pages_reserved=0,updated_at=now() where id=j.id;
 return j.object_path;
end $$;
-- All queue mutations are called only by a backend that has verified the user.
revoke all on function public.prepare_extraction(uuid,uuid,uuid,text,text,bigint),public.enqueue_extraction(uuid,uuid,text,integer),public.claim_extraction(),public.claim_extraction(uuid),public.finish_extraction(uuid,uuid,jsonb,text,integer,jsonb),public.recover_extractions(),public.cancel_extraction(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_extraction(uuid,uuid,uuid,text,text,bigint),public.enqueue_extraction(uuid,uuid,text,integer),public.claim_extraction(),public.claim_extraction(uuid),public.finish_extraction(uuid,uuid,jsonb,text,integer,jsonb),public.recover_extractions(),public.cancel_extraction(uuid,uuid) to service_role;
grant all on private.ai_control to service_role;

insert into storage.buckets(id,name,public,file_size_limit) values('documents','documents',false,20971520) on conflict(id) do update set public=false,file_size_limit=20971520;
create policy document_read on storage.objects for select to authenticated using(bucket_id='documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- Remove the legacy public-wide policy on the old images bucket. Keep private
-- owner-folder access and allow each owner to read legacy root-level images
-- whose filename is the ID of one of their invoices.
drop policy if exists "Permitir todo en storage" on storage.objects;
create policy legacy_root_image_read on storage.objects for select to authenticated
using(bucket_id='images' and position('/' in name)=0 and exists(
 select 1 from public.invoices i
 where split_part(name,'.',1)=i.id::text and i.user_id=(select auth.uid())
 and private.owns_company(i.organization_id)
));
-- Uploads use signed URLs minted for a reserved object only. No browser write policy.

create function public.portfolio_summary(p_period text)
returns table(company_id uuid,total bigint,pending bigint,closed boolean)
language sql stable security invoker set search_path='' as $$
 select o.id,count(i.id),count(i.id) filter(where i."taxStatus"='pending'),
 exists(select 1 from public.period_closures c where c.organization_id=o.id and c.period=p_period)
 from public.organizations o left join public.invoices i on i.organization_id=o.id and left(i.date,7)=p_period and not coalesce(i.deleted,false)
 where o.accountant_id=auth.uid() group by o.id;
$$;
revoke all on function public.portfolio_summary(text) from public,anon;
grant execute on function public.portfolio_summary(text) to authenticated;

create function public.patch_job_review(p_job uuid,p_index integer,p_patch jsonb) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if jsonb_typeof(p_patch)<>'object' or octet_length(p_patch::text)>20000 or p_index<0 then raise exception 'Invalid review'; end if;
 if exists(select 1 from public.extraction_jobs where id=p_job and user_id=auth.uid() and status='saved' and private.can_edit_company(organization_id)) then return; end if;
 update public.extraction_jobs set review=jsonb_set(review,array[p_index::text],coalesce(review->p_index::text,'{}')||p_patch)
 where id=p_job and user_id=auth.uid() and status='ready' and p_index<jsonb_array_length(result->'documents');
 if not found then raise exception 'Review not found or forbidden'; end if;
end $$;
revoke all on function public.patch_job_review(uuid,integer,jsonb) from public,anon;
grant execute on function public.patch_job_review(uuid,integer,jsonb) to authenticated;

create function public.retry_extraction(p_user uuid,p_job uuid) returns void language plpgsql security invoker set search_path='' as $$
declare j public.extraction_jobs; a public.accountant_accounts; begin
 select * into a from public.accountant_accounts where user_id=p_user for update;
 select * into j from public.extraction_jobs where id=p_job and user_id=p_user for update;
 if j.id is null or j.status<>'failed' or j.attempts>=8 then raise exception 'JOB_NOT_FOUND'; end if;
 if not exists(select 1 from public.organizations where id=j.organization_id and accountant_id=p_user and not archived) then raise exception 'COMPANY_FORBIDDEN'; end if;
 if a.status='suspended' then raise exception 'ACCOUNT_DISABLED'; end if;
 update public.accountant_accounts set reserved=reserved+j.pages where user_id=p_user;
 update public.extraction_jobs set status='queued',pages_reserved=pages,available_at=now(),error_code=null,error_message=null,updated_at=now() where id=j.id;
end $$;
revoke all on function public.retry_extraction(uuid,uuid) from public,anon,authenticated;
grant execute on function public.retry_extraction(uuid,uuid) to service_role;

alter table public.extraction_jobs add column cleaned_at timestamptz;
create function public.finish_cleanup(p_job uuid) returns void language plpgsql security invoker set search_path='' as $$
declare j public.extraction_jobs; begin
 select * into j from public.extraction_jobs where id=p_job;
 perform user_id from public.accountant_accounts where user_id=j.user_id for update;
 select * into j from public.extraction_jobs where id=p_job for update;
 if j.status<>'cancelled' or j.cleaned_at is not null then return; end if;
 if j.updated_at>now()-interval '3 hours' then raise exception 'Upload token may still be valid'; end if;
 update public.accountant_accounts set storage_bytes=greatest(0,storage_bytes-j.file_bytes) where user_id=j.user_id;
 update public.extraction_jobs set cleaned_at=now() where id=j.id;
end $$;
revoke all on function public.finish_cleanup(uuid) from public,anon,authenticated;
grant execute on function public.finish_cleanup(uuid) to service_role;

-- Snapshot and state changes happen in one transaction, never on export selection alone.
create function public.record_export(p_company uuid,p_ids uuid[],p_filename text,p_template_hash text,p_versions jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare eid uuid; snap jsonb; n integer; begin
 if not private.can_edit_company(p_company) or cardinality(p_ids)<1 or cardinality(p_ids)>10000 then raise exception 'Invalid export'; end if;
 perform id from public.organizations where id=p_company for update;
 select count(*),jsonb_agg(to_jsonb(i) order by i.date,i.id) into n,snap from public.invoices i
 where i.organization_id=p_company and i.id=any(p_ids) and not coalesce(i.deleted,false);
 if n<>cardinality(p_ids) then raise exception 'Export selection changed'; end if;
 if exists(select 1 from public.invoices i where i.id=any(p_ids) and
   (i."taxStatus"='pending' or (i."updatedAt" is distinct from (p_versions->>i.id::text)::timestamptz))) then raise exception 'Revisa o actualiza los comprobantes antes de exportar'; end if;
 insert into public.export_batches(organization_id,user_id,filename,snapshot,template_hash,totals)
 values(p_company,auth.uid(),p_filename,snap,p_template_hash,jsonb_build_object('count',n)) returning id into eid;
 update public.invoices set "taxStatus"='exported',exported_at=now()
 where id=any(p_ids) and "taxStatus" in ('reviewed','exported') and not exists(select 1 from public.period_closures c where c.organization_id=p_company and c.period=left(date,7));
 return eid;
end $$;
revoke all on function public.record_export(uuid,uuid[],text,text,jsonb) from public,anon;
grant execute on function public.record_export(uuid,uuid[],text,text,jsonb) to authenticated;
-- Export and comments cannot forge an actor or point at another company's invoice.
drop policy company_insert on public.export_batches;
create policy export_insert on public.export_batches for insert to authenticated with check(private.can_edit_company(organization_id) and user_id=auth.uid());
drop policy company_insert on public.document_comments;
create policy comment_insert on public.document_comments for insert to authenticated with check(private.can_edit_company(organization_id) and user_id=auth.uid() and exists(select 1 from public.invoices i where i.id=invoice_id and i.organization_id=document_comments.organization_id));

create function private.validate_company() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if length(btrim(new.name))<1 or length(new.name)>160 then raise exception 'Razón social inválida'; end if;
 if new.rut is not null then new.rut=regexp_replace(upper(new.rut),'[.\s-]','','g'); end if;
 if new.rut is not null and not private.valid_rut(new.rut) then raise exception 'RUT inválido'; end if;
 if jsonb_typeof(new.categories)<>'array' or jsonb_typeof(new.cost_centers)<>'array' or jsonb_typeof(new.provider_rules)<>'object' or octet_length(new.provider_rules::text)>100000 then raise exception 'Configuración inválida'; end if;
 return new;
end $$;
create trigger company_validation before insert or update on public.organizations for each row execute function private.validate_company();

-- Retire fully reviewed jobs so polling never reloads the entire document history.
-- Both triggers serialize on the job row; soft-deleted invoices still count as saved.
create function private.retire_reviewed_job() returns trigger language plpgsql security definer set search_path='' as $$
declare job_id uuid; j public.extraction_jobs; begin
 if tg_table_name='invoices' then job_id=new.source_job_id; else job_id=new.id; end if;
 if job_id is null then return new; end if;
 select * into j from public.extraction_jobs where id=job_id for update;
 if j.status<>'ready' then return new; end if;
 if not exists(select 1 from jsonb_array_elements(j.result->'documents') with ordinality d(value,ordinal)
   where coalesce(j.review->((d.ordinal-1)::text)->>'_dismissed','false')<>'true'
   and not exists(select 1 from public.invoices i where i.source_job_id=j.id and i.source_index=d.ordinal-1)) then
   update public.extraction_jobs set status='saved',updated_at=now() where id=j.id;
 end if;
 return new;
end $$;
revoke all on function private.retire_reviewed_job() from public,anon,authenticated;
create trigger retire_saved_job after insert on public.invoices for each row execute function private.retire_reviewed_job();
create trigger retire_dismissed_job after update of review on public.extraction_jobs for each row execute function private.retire_reviewed_job();

commit;

